import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

import {
  and,
  asc,
  count,
  eq,
  gt,
  isNull,
  lt,
  or,
} from "drizzle-orm";

import {
  staffInvitationAcceptanceSchema,
  staffInvitationCreationSchema,
  staffExternalAccountUpdateSchema,
  staffLoginSchema,
  staffSessionTokenSchema,
  type StaffInvitationAcceptance,
  type StaffInvitationCreation,
  type StaffExternalAccountUpdate,
  type StaffLogin,
  type StaffRole,
} from "@lawand/core";
import {
  staffAuditLogs,
  staffExternalAccounts,
  staffInvitations,
  staffMemberships,
  staffOrganizations,
  staffProfiles,
  staffRegions,
  staffSessions,
  staffUsers,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const PASSWORD_KEY_LENGTH = 64;
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const SESSION_DURATION_MS = 12 * 60 * 60 * 1_000;
const INVITATION_DURATION_MS = 72 * 60 * 60 * 1_000;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1_000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1_000;

export type StaffPrincipal = {
  id: string;
  email: string;
  displayName: string;
  primaryMembership: StaffMembership;
  memberships: StaffMembership[];
  roles: StaffRole[];
};

export type StaffMembership = {
  id: string;
  organization: {
    key: string;
    name: string;
  };
  region: {
    key: string;
    name: string;
  };
  department: string;
  jobTitle: string;
  role: StaffRole;
  isPrimary: boolean;
};

export type StaffSession = {
  staff: StaffPrincipal;
  sessionToken: string;
  expiresAt: string;
};

export type StaffInvitationInfo = {
  email: string;
  displayName: string;
  organization: {
    key: string;
    name: string;
  };
  region: {
    key: string;
    name: string;
  };
  department: string;
  jobTitle: string;
  role: StaffRole;
  legalFriendsId: string | null;
  legalFriendsMemberIdx: number | null;
  expiresAt: string;
};

export type StaffDirectoryItem = {
  id: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
  organization: { key: string; name: string };
  region: { key: string; name: string };
  department: string;
  jobTitle: string;
  role: StaffRole;
  legalFriendsId: string | null;
  legalFriendsMemberIdx: number | null;
};

export class StaffAuthError extends Error {
  constructor(
    readonly code:
      | "invalid_credentials"
      | "account_locked"
      | "invalid_session"
      | "invalid_invitation"
      | "email_already_registered"
      | "legalfriends_id_already_registered"
      | "staff_not_found"
      | "forbidden"
      | "bootstrap_already_completed",
    message: string,
  ) {
    super(message);
  }
}

function derivePasswordKey(
  password: string,
  salt: Buffer,
  options: {
    cost: number;
    blockSize: number;
    parallelization: number;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
      {
        N: options.cost,
        r: options.blockSize,
        p: options.parallelization,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashStaffPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await derivePasswordKey(password, salt, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  });
  return [
    "scrypt",
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyStaffPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, salt, expected] =
    encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !cost ||
    !blockSize ||
    !parallelization ||
    !salt ||
    !expected
  ) {
    return false;
  }

  const expectedKey = Buffer.from(expected, "base64url");
  if (expectedKey.length !== PASSWORD_KEY_LENGTH) return false;

  try {
    const actualKey = await derivePasswordKey(
      password,
      Buffer.from(salt, "base64url"),
      {
        cost: Number(cost),
        blockSize: Number(blockSize),
        parallelization: Number(parallelization),
      },
    );
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function hasRole(principal: StaffPrincipal, roles: StaffRole[]): boolean {
  return principal.roles.some((role) => roles.includes(role));
}

export function createStaffAuthService(options: { db: Database }) {
  const { db } = options;

  async function membershipsForUser(
    userId: string,
  ): Promise<StaffMembership[]> {
    const rows = await db
      .select({
        id: staffMemberships.id,
        organizationKey: staffMemberships.organizationKey,
        organizationName: staffOrganizations.name,
        regionKey: staffMemberships.regionKey,
        regionName: staffRegions.name,
        department: staffMemberships.department,
        jobTitle: staffMemberships.jobTitle,
        role: staffMemberships.role,
        isPrimary: staffMemberships.isPrimary,
      })
      .from(staffMemberships)
      .innerJoin(
        staffOrganizations,
        eq(staffOrganizations.key, staffMemberships.organizationKey),
      )
      .innerJoin(
        staffRegions,
        eq(staffRegions.key, staffMemberships.regionKey),
      )
      .where(
        and(
          eq(staffMemberships.userId, userId),
          eq(staffMemberships.isActive, true),
          eq(staffOrganizations.isActive, true),
          eq(staffRegions.isActive, true),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      organization: {
        key: row.organizationKey,
        name: row.organizationName,
      },
      region: {
        key: row.regionKey,
        name: row.regionName,
      },
      department: row.department,
      jobTitle: row.jobTitle,
      role: row.role,
      isPrimary: row.isPrimary,
    }));
  }

  async function principalForUser(
    userId: string,
  ): Promise<StaffPrincipal | null> {
    const [row] = await db
      .select({
        id: staffUsers.id,
        email: staffUsers.email,
        displayName: staffProfiles.displayName,
      })
      .from(staffUsers)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, staffUsers.id))
      .where(
        and(eq(staffUsers.id, userId), eq(staffUsers.status, "active")),
      )
      .limit(1);
    if (!row) return null;
    const memberships = await membershipsForUser(row.id);
    const primaryMembership =
      memberships.find((membership) => membership.isPrimary) ??
      memberships[0];
    if (!primaryMembership) return null;
    return {
      ...row,
      memberships,
      primaryMembership,
      roles: [...new Set(memberships.map((membership) => membership.role))],
    };
  }

  async function addAudit(input: {
    actorUserId: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  }) {
    await db.insert(staffAuditLogs).values({
      id: randomUUID(),
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
      occurredAt: input.occurredAt ?? new Date(),
    });
  }

  async function issueSession(
    userId: string,
    now = new Date(),
  ): Promise<StaffSession> {
    const principal = await principalForUser(userId);
    if (!principal) {
      throw new StaffAuthError(
        "invalid_session",
        "활성 직원 계정을 찾을 수 없습니다.",
      );
    }
    const sessionToken = newToken();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
    await db.insert(staffSessions).values({
      id: randomUUID(),
      userId,
      tokenHash: tokenHash(sessionToken),
      expiresAt,
      lastSeenAt: now,
      createdAt: now,
    });
    return {
      staff: principal,
      sessionToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async function login(rawInput: StaffLogin): Promise<StaffSession> {
    const input = staffLoginSchema.parse(rawInput);
    const now = new Date();
    const [user] = await db
      .select({
        id: staffUsers.id,
        passwordHash: staffUsers.passwordHash,
        status: staffUsers.status,
        failedLoginCount: staffUsers.failedLoginCount,
        lockedUntil: staffUsers.lockedUntil,
      })
      .from(staffUsers)
      .where(eq(staffUsers.email, input.email))
      .limit(1);

    if (!user) {
      await hashStaffPassword(input.password);
      throw new StaffAuthError(
        "invalid_credentials",
        "이메일 또는 비밀번호를 확인해 주세요.",
      );
    }
    if (user.status !== "active") {
      await hashStaffPassword(input.password);
      throw new StaffAuthError(
        "invalid_credentials",
        "이메일 또는 비밀번호를 확인해 주세요.",
      );
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new StaffAuthError(
        "account_locked",
        "로그인 시도가 반복되어 잠시 잠겼습니다. 15분 뒤 다시 시도해 주세요.",
      );
    }

    const validPassword = await verifyStaffPassword(
      input.password,
      user.passwordHash,
    );
    if (!validPassword) {
      const previousFailures =
        user.lockedUntil && user.lockedUntil <= now
          ? 0
          : user.failedLoginCount;
      const failedLoginCount = previousFailures + 1;
      await db
        .update(staffUsers)
        .set({
          failedLoginCount,
          lockedUntil:
            failedLoginCount >= LOGIN_FAILURE_LIMIT
              ? new Date(now.getTime() + LOGIN_LOCK_MS)
              : null,
          updatedAt: now,
        })
        .where(eq(staffUsers.id, user.id));
      throw new StaffAuthError(
        failedLoginCount >= LOGIN_FAILURE_LIMIT
          ? "account_locked"
          : "invalid_credentials",
        failedLoginCount >= LOGIN_FAILURE_LIMIT
          ? "로그인 시도가 반복되어 잠시 잠겼습니다. 15분 뒤 다시 시도해 주세요."
          : "이메일 또는 비밀번호를 확인해 주세요.",
      );
    }

    await db
      .update(staffUsers)
      .set({
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(staffUsers.id, user.id));
    const session = await issueSession(user.id, now);
    await addAudit({
      actorUserId: user.id,
      action: "staff.login.succeeded",
      targetType: "staff_user",
      targetId: user.id,
      occurredAt: now,
    });
    return session;
  }

  async function authenticateSession(
    rawToken: string,
  ): Promise<StaffPrincipal> {
    const parsedToken = staffSessionTokenSchema.safeParse(rawToken);
    if (!parsedToken.success) {
      throw new StaffAuthError(
        "invalid_session",
        "로그인이 만료되었습니다.",
      );
    }
    const sessionToken = parsedToken.data;
    const now = new Date();
    const [session] = await db
      .select({
        id: staffSessions.id,
        userId: staffSessions.userId,
        lastSeenAt: staffSessions.lastSeenAt,
      })
      .from(staffSessions)
      .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.userId))
      .where(
        and(
          eq(staffSessions.tokenHash, tokenHash(sessionToken)),
          isNull(staffSessions.revokedAt),
          gt(staffSessions.expiresAt, now),
          eq(staffUsers.status, "active"),
        ),
      )
      .limit(1);
    if (!session) {
      throw new StaffAuthError(
        "invalid_session",
        "로그인이 만료되었습니다.",
      );
    }

    if (
      session.lastSeenAt.getTime() <
      now.getTime() - SESSION_TOUCH_INTERVAL_MS
    ) {
      await db
        .update(staffSessions)
        .set({ lastSeenAt: now })
        .where(eq(staffSessions.id, session.id));
    }

    const principal = await principalForUser(session.userId);
    if (!principal) {
      throw new StaffAuthError(
        "invalid_session",
        "로그인이 만료되었습니다.",
      );
    }
    return principal;
  }

  async function logout(rawToken: string): Promise<void> {
    const principal = await authenticateSession(rawToken);
    const now = new Date();
    await db
      .update(staffSessions)
      .set({ revokedAt: now })
      .where(eq(staffSessions.tokenHash, tokenHash(rawToken)));
    await addAudit({
      actorUserId: principal.id,
      action: "staff.logout",
      targetType: "staff_user",
      targetId: principal.id,
      occurredAt: now,
    });
  }

  async function inspectInvitation(
    rawToken: string,
  ): Promise<StaffInvitationInfo> {
    const invitationToken = staffSessionTokenSchema.parse(rawToken);
    const [invitation] = await db
      .select({
        email: staffInvitations.email,
        role: staffInvitations.role,
        displayName: staffInvitations.displayName,
        organizationKey: staffInvitations.organizationKey,
        organizationName: staffOrganizations.name,
        regionKey: staffInvitations.regionKey,
        regionName: staffRegions.name,
        department: staffInvitations.department,
        jobTitle: staffInvitations.jobTitle,
        legalFriendsId: staffInvitations.legalFriendsAccountId,
        legalFriendsMemberIdx: staffInvitations.legalFriendsMemberIdx,
        expiresAt: staffInvitations.expiresAt,
      })
      .from(staffInvitations)
      .innerJoin(
        staffOrganizations,
        eq(staffOrganizations.key, staffInvitations.organizationKey),
      )
      .innerJoin(
        staffRegions,
        eq(staffRegions.key, staffInvitations.regionKey),
      )
      .where(
        and(
          eq(staffInvitations.tokenHash, tokenHash(invitationToken)),
          isNull(staffInvitations.acceptedAt),
          isNull(staffInvitations.revokedAt),
          gt(staffInvitations.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!invitation) {
      throw new StaffAuthError(
        "invalid_invitation",
        "초대 링크가 만료되었거나 이미 사용되었습니다.",
      );
    }
    return {
      email: invitation.email,
      displayName: invitation.displayName,
      organization: {
        key: invitation.organizationKey,
        name: invitation.organizationName,
      },
      region: {
        key: invitation.regionKey,
        name: invitation.regionName,
      },
      department: invitation.department,
      jobTitle: invitation.jobTitle,
      role: invitation.role,
      legalFriendsId: invitation.legalFriendsId,
      legalFriendsMemberIdx: invitation.legalFriendsMemberIdx,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async function acceptInvitation(
    rawInput: StaffInvitationAcceptance,
  ): Promise<StaffSession> {
    const input = staffInvitationAcceptanceSchema.parse(rawInput);
    const now = new Date();
    const passwordHash = await hashStaffPassword(input.password);
    const invitationHash = tokenHash(input.token);
    const userId = randomUUID();

    try {
      await db.transaction(async (tx) => {
        const [invitation] = await tx
          .update(staffInvitations)
          .set({ acceptedAt: now })
          .where(
            and(
              eq(staffInvitations.tokenHash, invitationHash),
              isNull(staffInvitations.acceptedAt),
              isNull(staffInvitations.revokedAt),
              gt(staffInvitations.expiresAt, now),
            ),
          )
          .returning({
            id: staffInvitations.id,
            email: staffInvitations.email,
            role: staffInvitations.role,
            displayName: staffInvitations.displayName,
            organizationKey: staffInvitations.organizationKey,
            regionKey: staffInvitations.regionKey,
            department: staffInvitations.department,
            jobTitle: staffInvitations.jobTitle,
            legalFriendsId: staffInvitations.legalFriendsAccountId,
            legalFriendsMemberIdx:
              staffInvitations.legalFriendsMemberIdx,
            invitedByUserId: staffInvitations.invitedByUserId,
          });
        if (!invitation) {
          throw new StaffAuthError(
            "invalid_invitation",
            "초대 링크가 만료되었거나 이미 사용되었습니다.",
          );
        }

        const [existingUser] = await tx
          .select({ id: staffUsers.id })
          .from(staffUsers)
          .where(eq(staffUsers.email, invitation.email))
          .limit(1);
        if (existingUser) {
          throw new StaffAuthError(
            "email_already_registered",
            "이미 등록된 직원 이메일입니다.",
          );
        }

        await tx.insert(staffUsers).values({
          id: userId,
          email: invitation.email,
          passwordHash,
          passwordChangedAt: now,
        });
        await tx.insert(staffProfiles).values({
          userId,
          displayName: invitation.displayName,
        });
        await tx.insert(staffMemberships).values({
          id: randomUUID(),
          userId,
          organizationKey: invitation.organizationKey,
          regionKey: invitation.regionKey,
          department: invitation.department,
          jobTitle: invitation.jobTitle,
          role: invitation.role,
          isPrimary: true,
          isActive: true,
          assignedByUserId: invitation.invitedByUserId,
          assignedAt: now,
        });
        if (invitation.legalFriendsId) {
          const [existingMapping] = await tx
            .select({ id: staffExternalAccounts.id })
            .from(staffExternalAccounts)
            .where(
              and(
                eq(staffExternalAccounts.provider, "legalfriends"),
                or(
                  eq(
                    staffExternalAccounts.externalAccountId,
                    invitation.legalFriendsId,
                  ),
                  eq(
                    staffExternalAccounts.externalMemberIdx,
                    invitation.legalFriendsMemberIdx!,
                  ),
                ),
                eq(staffExternalAccounts.isActive, true),
              ),
            )
            .limit(1);
          if (existingMapping) {
            throw new StaffAuthError(
              "legalfriends_id_already_registered",
              "이미 다른 직원에게 연결된 리걸프렌즈 아이디입니다.",
            );
          }
          await tx.insert(staffExternalAccounts).values({
            id: randomUUID(),
            provider: "legalfriends",
            staffUserId: userId,
            externalAccountId: invitation.legalFriendsId,
            externalMemberIdx: invitation.legalFriendsMemberIdx,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });
        }
        await tx.insert(staffAuditLogs).values({
          id: randomUUID(),
          actorUserId: userId,
          action: "staff.invitation.accepted",
          targetType: "staff_user",
          targetId: userId,
          metadata: {
            invitationId: invitation.id,
            role: invitation.role,
            organization: invitation.organizationKey,
            region: invitation.regionKey,
            legalFriendsConnected: Boolean(invitation.legalFriendsId),
            legalFriendsMemberIdx: invitation.legalFriendsMemberIdx,
          },
          occurredAt: now,
        });
      });
    } catch (error) {
      if (error instanceof StaffAuthError) throw error;
      throw new StaffAuthError(
        "email_already_registered",
        "이미 등록된 직원 이메일이거나 초대를 처리할 수 없습니다.",
      );
    }

    return issueSession(userId, now);
  }

  async function createInvitation(
    actor: StaffPrincipal,
    rawInput: StaffInvitationCreation,
  ): Promise<StaffInvitationInfo & { token: string }> {
    if (!hasRole(actor, ["admin"])) {
      throw new StaffAuthError(
        "forbidden",
        "직원 초대 권한이 없습니다.",
      );
    }
    return createInvitationRecord(rawInput, actor.id);
  }

  async function createInvitationRecord(
    rawInput: StaffInvitationCreation,
    invitedByUserId: string | null,
  ): Promise<StaffInvitationInfo & { token: string }> {
    const input = staffInvitationCreationSchema.parse(rawInput);
    const now = new Date();
    const [existingUser] = await db
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(eq(staffUsers.email, input.email))
      .limit(1);
    if (existingUser) {
      throw new StaffAuthError(
        "email_already_registered",
        "이미 등록된 직원 이메일입니다.",
      );
    }
    if (input.legalFriendsId) {
      const [existingMapping] = await db
        .select({ id: staffExternalAccounts.id })
        .from(staffExternalAccounts)
        .where(
          and(
            eq(staffExternalAccounts.provider, "legalfriends"),
            or(
              eq(
                staffExternalAccounts.externalAccountId,
                input.legalFriendsId,
              ),
              eq(
                staffExternalAccounts.externalMemberIdx,
                input.legalFriendsMemberIdx!,
              ),
            ),
            eq(staffExternalAccounts.isActive, true),
          ),
        )
        .limit(1);
      const [pendingInvitation] = await db
        .select({
          id: staffInvitations.id,
          email: staffInvitations.email,
        })
        .from(staffInvitations)
        .where(
          and(
            or(
              eq(
                staffInvitations.legalFriendsAccountId,
                input.legalFriendsId,
              ),
              eq(
                staffInvitations.legalFriendsMemberIdx,
                input.legalFriendsMemberIdx!,
              ),
            ),
            isNull(staffInvitations.acceptedAt),
            isNull(staffInvitations.revokedAt),
            gt(staffInvitations.expiresAt, now),
          ),
        )
        .limit(1);
      if (
        existingMapping ||
        (pendingInvitation && pendingInvitation.email !== input.email)
      ) {
        throw new StaffAuthError(
          "legalfriends_id_already_registered",
          "이미 다른 직원 또는 초대에 연결된 리걸프렌즈 아이디입니다.",
        );
      }
    }

    const token = newToken();
    const invitation = {
      id: randomUUID(),
      email: input.email,
      displayName: input.name,
      organizationKey: input.organization,
      regionKey: input.region,
      department: input.department,
      jobTitle: input.jobTitle,
      role: input.role,
      legalFriendsAccountId: input.legalFriendsId ?? null,
      legalFriendsMemberIdx: input.legalFriendsMemberIdx ?? null,
      tokenHash: tokenHash(token),
      invitedByUserId,
      expiresAt: new Date(now.getTime() + INVITATION_DURATION_MS),
      createdAt: now,
    };
    await db.transaction(async (tx) => {
      await tx
        .update(staffInvitations)
        .set({ revokedAt: now })
        .where(
          and(
            eq(staffInvitations.email, input.email),
            isNull(staffInvitations.acceptedAt),
            isNull(staffInvitations.revokedAt),
          ),
        );
      if (input.legalFriendsId) {
        await tx
          .update(staffInvitations)
          .set({ revokedAt: now })
          .where(
            and(
              or(
                eq(
                  staffInvitations.legalFriendsAccountId,
                  input.legalFriendsId,
                ),
                eq(
                  staffInvitations.legalFriendsMemberIdx,
                  input.legalFriendsMemberIdx!,
                ),
              ),
              isNull(staffInvitations.acceptedAt),
              isNull(staffInvitations.revokedAt),
              lt(staffInvitations.expiresAt, now),
            ),
          );
      }
      await tx.insert(staffInvitations).values(invitation);
      await tx.insert(staffAuditLogs).values({
        id: randomUUID(),
        actorUserId: invitedByUserId,
        action: "staff.invitation.created",
        targetType: "staff_invitation",
        targetId: invitation.id,
        metadata: {
          role: input.role,
          organization: input.organization,
          region: input.region,
          legalFriendsConnected: Boolean(input.legalFriendsId),
          legalFriendsMemberIdx: input.legalFriendsMemberIdx ?? null,
        },
        occurredAt: now,
      });
    });
    return {
      email: input.email,
      displayName: input.name,
      organization: {
        key: input.organization,
        name:
          input.organization === "lawand"
            ? "법무법인 로앤"
            : "리걸플로",
      },
      region: {
        key: input.region,
        name:
          input.region === "seoul"
            ? "서울"
            : input.region === "daejeon"
              ? "대전"
              : "부산",
      },
      department: input.department,
      jobTitle: input.jobTitle,
      role: input.role,
      legalFriendsId: input.legalFriendsId ?? null,
      legalFriendsMemberIdx: input.legalFriendsMemberIdx ?? null,
      token,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async function createBootstrapInvitation(
    rawInput: StaffInvitationCreation,
  ): Promise<StaffInvitationInfo & { token: string }> {
    const [countRow] = await db
      .select({ value: count() })
      .from(staffUsers);
    const userCount = countRow?.value ?? 0;
    if (userCount !== 0) {
      throw new StaffAuthError(
        "bootstrap_already_completed",
        "최초 관리자 계정이 이미 생성되어 bootstrap 초대를 만들 수 없습니다.",
      );
    }
    const input = staffInvitationCreationSchema.parse({
      ...rawInput,
      role: "admin",
    });
    return createInvitationRecord(input, null);
  }

  async function listStaff(
    actor: StaffPrincipal,
  ): Promise<{ items: StaffDirectoryItem[] }> {
    if (!hasRole(actor, ["admin"])) {
      throw new StaffAuthError("forbidden", "직원 조회 권한이 없습니다.");
    }
    const rows = await db
      .select({
        id: staffUsers.id,
        email: staffUsers.email,
        displayName: staffProfiles.displayName,
        status: staffUsers.status,
        organizationKey: staffOrganizations.key,
        organizationName: staffOrganizations.name,
        regionKey: staffRegions.key,
        regionName: staffRegions.name,
        department: staffMemberships.department,
        jobTitle: staffMemberships.jobTitle,
        role: staffMemberships.role,
        legalFriendsId: staffExternalAccounts.externalAccountId,
        legalFriendsMemberIdx: staffExternalAccounts.externalMemberIdx,
      })
      .from(staffUsers)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, staffUsers.id))
      .innerJoin(
        staffMemberships,
        and(
          eq(staffMemberships.userId, staffUsers.id),
          eq(staffMemberships.isPrimary, true),
          eq(staffMemberships.isActive, true),
        ),
      )
      .innerJoin(
        staffOrganizations,
        eq(staffOrganizations.key, staffMemberships.organizationKey),
      )
      .innerJoin(
        staffRegions,
        eq(staffRegions.key, staffMemberships.regionKey),
      )
      .leftJoin(
        staffExternalAccounts,
        and(
          eq(staffExternalAccounts.staffUserId, staffUsers.id),
          eq(staffExternalAccounts.provider, "legalfriends"),
          eq(staffExternalAccounts.isActive, true),
        ),
      )
      .orderBy(asc(staffProfiles.displayName), asc(staffUsers.email));
    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        status: row.status,
        organization: {
          key: row.organizationKey,
          name: row.organizationName,
        },
        region: { key: row.regionKey, name: row.regionName },
        department: row.department,
        jobTitle: row.jobTitle,
        role: row.role,
        legalFriendsId: row.legalFriendsId,
        legalFriendsMemberIdx: row.legalFriendsMemberIdx,
      })),
    };
  }

  async function updateLegalFriendsAccount(
    actor: StaffPrincipal,
    staffUserId: string,
    rawInput: StaffExternalAccountUpdate,
  ): Promise<{
    legalFriendsId: string | null;
    legalFriendsMemberIdx: number | null;
  }> {
    if (!hasRole(actor, ["admin"])) {
      throw new StaffAuthError(
        "forbidden",
        "리걸프렌즈 계정 연결 권한이 없습니다.",
      );
    }
    const input = staffExternalAccountUpdateSchema.parse(rawInput);
    const now = new Date();
    await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: staffUsers.id })
        .from(staffUsers)
        .where(eq(staffUsers.id, staffUserId))
        .limit(1);
      if (!user) {
        throw new StaffAuthError(
          "staff_not_found",
          "직원 계정을 찾을 수 없습니다.",
        );
      }

      const [current] = await tx
        .select({
          id: staffExternalAccounts.id,
          externalAccountId: staffExternalAccounts.externalAccountId,
          externalMemberIdx: staffExternalAccounts.externalMemberIdx,
        })
        .from(staffExternalAccounts)
        .where(
          and(
            eq(staffExternalAccounts.staffUserId, staffUserId),
            eq(staffExternalAccounts.provider, "legalfriends"),
            eq(staffExternalAccounts.isActive, true),
          ),
        )
        .limit(1)
        .for("update");
      if (
        current?.externalAccountId === input.legalFriendsId &&
        current?.externalMemberIdx === input.legalFriendsMemberIdx
      ) {
        return;
      }

      if (input.legalFriendsId) {
        const [duplicate] = await tx
          .select({ staffUserId: staffExternalAccounts.staffUserId })
          .from(staffExternalAccounts)
          .where(
            and(
              eq(staffExternalAccounts.provider, "legalfriends"),
              or(
                eq(
                  staffExternalAccounts.externalAccountId,
                  input.legalFriendsId,
                ),
                eq(
                  staffExternalAccounts.externalMemberIdx,
                  input.legalFriendsMemberIdx!,
                ),
              ),
              eq(staffExternalAccounts.isActive, true),
            ),
          )
          .limit(1);
        if (duplicate && duplicate.staffUserId !== staffUserId) {
          throw new StaffAuthError(
            "legalfriends_id_already_registered",
            "이미 다른 직원에게 연결된 리걸프렌즈 아이디입니다.",
          );
        }
        const [pendingInvitation] = await tx
          .select({ id: staffInvitations.id })
          .from(staffInvitations)
          .where(
            and(
              or(
                eq(
                  staffInvitations.legalFriendsAccountId,
                  input.legalFriendsId,
                ),
                eq(
                  staffInvitations.legalFriendsMemberIdx,
                  input.legalFriendsMemberIdx!,
                ),
              ),
              isNull(staffInvitations.acceptedAt),
              isNull(staffInvitations.revokedAt),
              gt(staffInvitations.expiresAt, now),
            ),
          )
          .limit(1);
        if (pendingInvitation) {
          throw new StaffAuthError(
            "legalfriends_id_already_registered",
            "아직 유효한 직원 초대에 연결된 리걸프렌즈 아이디입니다.",
          );
        }
      }

      if (current) {
        await tx
          .update(staffExternalAccounts)
          .set({ isActive: false, updatedAt: now })
          .where(eq(staffExternalAccounts.id, current.id));
      }
      if (input.legalFriendsId) {
        await tx.insert(staffExternalAccounts).values({
          id: randomUUID(),
          provider: "legalfriends",
          staffUserId,
          externalAccountId: input.legalFriendsId,
          externalMemberIdx: input.legalFriendsMemberIdx,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
      await tx.insert(staffAuditLogs).values({
        id: randomUUID(),
        actorUserId: actor.id,
        action: "staff.external_account.updated",
        targetType: "staff_user",
        targetId: staffUserId,
        metadata: {
          provider: "legalfriends",
          previousAccountId: current?.externalAccountId ?? null,
          previousMemberIdx: current?.externalMemberIdx ?? null,
          newAccountId: input.legalFriendsId,
          newMemberIdx: input.legalFriendsMemberIdx,
        },
        occurredAt: now,
      });
    });
    return {
      legalFriendsId: input.legalFriendsId,
      legalFriendsMemberIdx: input.legalFriendsMemberIdx,
    };
  }

  async function authorize(
    rawToken: string,
    roles: StaffRole[],
  ): Promise<StaffPrincipal> {
    const principal = await authenticateSession(rawToken);
    if (!hasRole(principal, roles)) {
      throw new StaffAuthError("forbidden", "접근 권한이 없습니다.");
    }
    return principal;
  }

  async function recordConsultationAccess(
    actor: StaffPrincipal,
    input: { consultationId?: string; kind: "list" | "detail" },
  ) {
    await addAudit({
      actorUserId: actor.id,
      action:
        input.kind === "detail"
          ? "consultation.pii.viewed"
          : "consultation.list.viewed",
      targetType:
        input.kind === "detail" ? "consultation" : "consultation_list",
      ...(input.consultationId ? { targetId: input.consultationId } : {}),
      metadata: {},
    });
  }

  async function deleteExpiredSessions(now = new Date()) {
    await db
      .delete(staffSessions)
      .where(
        and(
          lt(staffSessions.expiresAt, now),
          isNull(staffSessions.revokedAt),
        ),
      );
  }

  return {
    acceptInvitation,
    authenticateSession,
    authorize,
    createBootstrapInvitation,
    createInvitation,
    deleteExpiredSessions,
    inspectInvitation,
    listStaff,
    login,
    logout,
    recordConsultationAccess,
    updateLegalFriendsAccount,
  };
}

export type StaffAuthService = ReturnType<typeof createStaffAuthService>;
