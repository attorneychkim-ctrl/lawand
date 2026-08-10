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
  inArray,
  isNull,
  isNotNull,
  lt,
  or,
} from "drizzle-orm";

import {
  staffCentrexLineUpdateSchema,
  staffInvitationAcceptanceSchema,
  staffInvitationCreationSchema,
  staffExternalAccountUpdateSchema,
  staffLoginSchema,
  staffPasswordChangeSchema,
  staffProfileUpdateSchema,
  staffSessionTokenSchema,
  type StaffCentrexLineUpdate,
  type StaffInvitationAcceptance,
  type StaffInvitationCreation,
  type StaffExternalAccountUpdate,
  type StaffLogin,
  type StaffPasswordChange,
  type StaffProfileUpdate,
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
  staffTelephonyBindings,
  staffTelephonyBridgeAssignments,
  staffUsers,
  telephonyCalls,
  telephonyEndpointCredentials,
  telephonyEndpoints,
  telephonyInboundCalls,
  telephonyInboundCommands,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import { CentrexDeliveryError, type CentrexClient } from "./centrex.js";
import {
  createCentrexCredentialVault,
  encryptCentrexCredential,
} from "./centrex-credential-vault.js";
import type { DataProtection } from "./crypto.js";
import {
  CentrexBridgeProvisioningError,
  type CentrexBridgeAssignmentReservation,
  type CentrexBridgeProvisioningService,
} from "./centrex-bridge-provisioning.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

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
  centrexLineNumber: string | null;
  centrexExtension: string | null;
  legalFriendsId: string | null;
  legalFriendsMemberIdx: number | null;
  expiresAt: string;
};

export type StaffCentrexConnectionStatus =
  | "unconfigured"
  | "incomplete"
  | "pending_endpoint"
  | "pending_assignment"
  | "credential_pending"
  | "bridge_pending"
  | "bridge_provisioning"
  | "bridge_failed"
  | "bridge_offline"
  | "connected"
  | "mismatch";

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
  centrexLineNumber: string | null;
  centrexExtension: string | null;
  centrexConnection: {
    status: StaffCentrexConnectionStatus;
    assignedEndpoint: {
      id: string;
      label: string;
      lineNumber: string;
      extension: string;
      credentialConfigured: boolean;
      bridgeConfigured: boolean;
      bridgeOnline: boolean;
      bridgeState: string | null;
      bridgeLastSeenAt: string | null;
      lastAuthSucceededAt: string | null;
    } | null;
  };
  legalFriendsId: string | null;
  legalFriendsMemberIdx: number | null;
};

export function resolveStaffCentrexConnectionStatus(input: {
  centrexLineNumber: string | null;
  centrexExtension: string | null;
  requestedEndpointExists: boolean;
  assignedEndpointExists: boolean;
  assignedEndpointMatches: boolean;
  credentialConfigured: boolean;
  bridgeExists: boolean;
  bridgeMatches: boolean;
  bridgeOnline: boolean;
  bridgeState: string | null;
  legacyBridgeConfigured: boolean;
}): StaffCentrexConnectionStatus {
  if (!input.centrexLineNumber && !input.centrexExtension) {
    return input.assignedEndpointExists ? "mismatch" : "unconfigured";
  }
  if (!input.centrexLineNumber || !input.centrexExtension) {
    return "incomplete";
  }
  if (!input.requestedEndpointExists) {
    return input.assignedEndpointExists ? "mismatch" : "pending_endpoint";
  }
  if (!input.assignedEndpointExists) return "pending_assignment";
  if (!input.assignedEndpointMatches) return "mismatch";
  if (!input.credentialConfigured) return "credential_pending";
  if (!input.bridgeExists) {
    return input.legacyBridgeConfigured ? "connected" : "bridge_pending";
  }
  if (!input.bridgeOnline) return "bridge_offline";
  if (input.bridgeState === "provisioning") return "bridge_provisioning";
  if (input.bridgeState === "failed") return "bridge_failed";
  if (input.bridgeMatches && input.bridgeState === "connected") {
    return "connected";
  }
  return "bridge_pending";
}

export class StaffAuthError extends Error {
  constructor(
    readonly code:
      | "invalid_credentials"
      | "invalid_current_password"
      | "account_locked"
      | "invalid_session"
      | "invalid_invitation"
      | "email_already_registered"
      | "legalfriends_id_already_registered"
      | "staff_not_found"
      | "forbidden"
      | "bootstrap_already_completed"
      | "centrex_verification_failed"
      | "centrex_line_mismatch"
      | "centrex_provisioning_unavailable"
      | "centrex_endpoint_conflict"
      | "centrex_bridge_unassigned"
      | "centrex_bridge_busy"
      | "centrex_bridge_active_call"
      | "centrex_bridge_failed",
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

export function canManageStaff(
  actor: StaffPrincipal,
  staffUserId: string,
): boolean {
  return actor.id === staffUserId || hasRole(actor, ["admin"]);
}

export function createStaffAuthService(options: {
  db: Database;
  protection?: DataProtection;
  centrexClient?: CentrexClient;
  centrexFallbackCredentials?: Readonly<Record<string, string>>;
  centrexBridgeEndpointIds?: ReadonlySet<string>;
  centrexBridgeProvisioning?: CentrexBridgeProvisioningService;
}) {
  const { db } = options;
  const credentialVault = options.protection
    ? createCentrexCredentialVault({
        db,
        protection: options.protection,
        ...(options.centrexFallbackCredentials
          ? { fallbackCredentials: options.centrexFallbackCredentials }
          : {}),
      })
    : null;
  const centrexBridgeEndpointIds =
    options.centrexBridgeEndpointIds ?? new Set<string>();

  async function reconcileStaffCentrexBinding(
    tx: DatabaseTransaction,
    input: {
      staffUserId: string;
      actorUserId: string | null;
      lineNumber: string | null;
      extension: string | null;
      now: Date;
    },
  ): Promise<{
    changed: boolean;
    endpointId: string | null;
    status: "unconfigured" | "pending_endpoint" | "assigned";
  }> {
    const currentBindings = await tx
      .select({
        id: staffTelephonyBindings.id,
        endpointId: staffTelephonyBindings.endpointId,
        isPrimary: staffTelephonyBindings.isPrimary,
      })
      .from(staffTelephonyBindings)
      .where(
        and(
          eq(staffTelephonyBindings.staffUserId, input.staffUserId),
          eq(staffTelephonyBindings.isActive, true),
        ),
      )
      .for("update");

    const [endpoint] =
      input.lineNumber && input.extension
        ? await tx
            .select({ id: telephonyEndpoints.id })
            .from(telephonyEndpoints)
            .where(
              and(
                eq(telephonyEndpoints.provider, "centrex"),
                eq(telephonyEndpoints.lineNumber, input.lineNumber),
                eq(telephonyEndpoints.extension, input.extension),
                eq(telephonyEndpoints.isActive, true),
                isNotNull(telephonyEndpoints.lastAuthSucceededAt),
              ),
            )
            .limit(1)
            .for("update")
        : [];

    const alreadyAssigned = Boolean(
      endpoint &&
        currentBindings.length === 1 &&
        currentBindings[0]?.endpointId === endpoint.id &&
        currentBindings[0]?.isPrimary,
    );
    if (alreadyAssigned) {
      return { changed: false, endpointId: endpoint!.id, status: "assigned" };
    }

    if (currentBindings.length > 0) {
      await tx
        .update(staffTelephonyBindings)
        .set({ isActive: false, isPrimary: false, updatedAt: input.now })
        .where(
          and(
            eq(staffTelephonyBindings.staffUserId, input.staffUserId),
            eq(staffTelephonyBindings.isActive, true),
          ),
        );
    }

    if (!endpoint) {
      return {
        changed: currentBindings.length > 0,
        endpointId: null,
        status:
          input.lineNumber && input.extension
            ? "pending_endpoint"
            : "unconfigured",
      };
    }

    const [existingBinding] = await tx
      .select({ id: staffTelephonyBindings.id })
      .from(staffTelephonyBindings)
      .where(
        and(
          eq(staffTelephonyBindings.staffUserId, input.staffUserId),
          eq(staffTelephonyBindings.endpointId, endpoint.id),
        ),
      )
      .limit(1)
      .for("update");
    if (existingBinding) {
      await tx
        .update(staffTelephonyBindings)
        .set({
          isActive: true,
          isPrimary: true,
          assignedAt: input.now,
          assignedByUserId: input.actorUserId,
          updatedAt: input.now,
        })
        .where(eq(staffTelephonyBindings.id, existingBinding.id));
    } else {
      await tx.insert(staffTelephonyBindings).values({
        id: randomUUID(),
        staffUserId: input.staffUserId,
        endpointId: endpoint.id,
        isActive: true,
        isPrimary: true,
        assignedAt: input.now,
        assignedByUserId: input.actorUserId,
        createdAt: input.now,
        updatedAt: input.now,
      });
    }
    await tx.insert(staffAuditLogs).values({
      id: randomUUID(),
      actorUserId: input.actorUserId,
      action: "telephony.centrex_endpoint.assignment_reconciled",
      targetType: "staff_user",
      targetId: input.staffUserId,
      metadata: {
        endpointId: endpoint.id,
        lineLast4: input.lineNumber?.slice(-4) ?? null,
        extension: input.extension,
        source: "verified_staff_centrex_profile",
      },
      occurredAt: input.now,
      createdAt: input.now,
    });
    return { changed: true, endpointId: endpoint.id, status: "assigned" };
  }

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
        centrexLineNumber: staffInvitations.centrexLineNumber,
        centrexExtension: staffInvitations.centrexExtension,
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
      centrexLineNumber: invitation.centrexLineNumber,
      centrexExtension: invitation.centrexExtension,
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
            centrexLineNumber: staffInvitations.centrexLineNumber,
            centrexExtension: staffInvitations.centrexExtension,
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
          centrexLineNumber: invitation.centrexLineNumber,
          centrexExtension: invitation.centrexExtension,
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
        const centrexAssignment = await reconcileStaffCentrexBinding(tx, {
          staffUserId: userId,
          actorUserId: invitation.invitedByUserId,
          lineNumber: invitation.centrexLineNumber,
          extension: invitation.centrexExtension,
          now,
        });
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
            centrexLineConfigured: Boolean(invitation.centrexLineNumber),
            centrexExtensionConfigured: Boolean(
              invitation.centrexExtension,
            ),
            centrexAssignmentStatus: centrexAssignment.status,
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
      centrexLineNumber: input.centrexLineNumber ?? null,
      centrexExtension: input.centrexExtension ?? null,
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
          centrexLineConfigured: Boolean(input.centrexLineNumber),
          centrexExtensionConfigured: Boolean(input.centrexExtension),
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
      centrexLineNumber: input.centrexLineNumber ?? null,
      centrexExtension: input.centrexExtension ?? null,
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

  async function staffDirectory(): Promise<{
    items: StaffDirectoryItem[];
  }> {
    const [
      rows,
      verifiedEndpoints,
      activePrimaryBindings,
      storedCredentialRows,
      activeBridgeAssignments,
    ] = await Promise.all([
      db.select({
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
        centrexLineNumber: staffProfiles.centrexLineNumber,
        centrexExtension: staffProfiles.centrexExtension,
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
      .orderBy(asc(staffProfiles.displayName), asc(staffUsers.email)),
      db
        .select({
          id: telephonyEndpoints.id,
          label: telephonyEndpoints.label,
          lineNumber: telephonyEndpoints.lineNumber,
          extension: telephonyEndpoints.extension,
          credentialKey: telephonyEndpoints.credentialKey,
          lastAuthSucceededAt: telephonyEndpoints.lastAuthSucceededAt,
        })
        .from(telephonyEndpoints)
        .where(
          and(
            eq(telephonyEndpoints.provider, "centrex"),
            eq(telephonyEndpoints.isActive, true),
            isNotNull(telephonyEndpoints.lastAuthSucceededAt),
          ),
        ),
      db
        .select({
          staffUserId: staffTelephonyBindings.staffUserId,
          endpointId: telephonyEndpoints.id,
          label: telephonyEndpoints.label,
          lineNumber: telephonyEndpoints.lineNumber,
          extension: telephonyEndpoints.extension,
          credentialKey: telephonyEndpoints.credentialKey,
          lastAuthSucceededAt: telephonyEndpoints.lastAuthSucceededAt,
        })
        .from(staffTelephonyBindings)
        .innerJoin(
          telephonyEndpoints,
          eq(telephonyEndpoints.id, staffTelephonyBindings.endpointId),
        )
        .where(
          and(
            eq(staffTelephonyBindings.isActive, true),
            eq(staffTelephonyBindings.isPrimary, true),
            eq(telephonyEndpoints.isActive, true),
          ),
        ),
      db
        .select({ endpointId: telephonyEndpointCredentials.endpointId })
        .from(telephonyEndpointCredentials),
      db
        .select({
          staffUserId: staffTelephonyBridgeAssignments.staffUserId,
          currentEndpointId:
            staffTelephonyBridgeAssignments.currentEndpointId,
          pendingEndpointId:
            staffTelephonyBridgeAssignments.pendingEndpointId,
          state: staffTelephonyBridgeAssignments.state,
          lastSeenAt: staffTelephonyBridgeAssignments.lastSeenAt,
          lastLoginSucceededAt:
            staffTelephonyBridgeAssignments.lastLoginSucceededAt,
          lastResultCode: staffTelephonyBridgeAssignments.lastResultCode,
        })
        .from(staffTelephonyBridgeAssignments)
        .where(eq(staffTelephonyBridgeAssignments.isActive, true)),
    ]);
    const storedCredentialEndpointIds = new Set(
      storedCredentialRows.map(({ endpointId }) => endpointId),
    );
    const credentialConfigured = (endpoint: {
      endpointId?: string;
      id?: string;
      credentialKey: string;
    }) =>
      storedCredentialEndpointIds.has(
        endpoint.endpointId ?? endpoint.id ?? "",
      ) ||
      credentialVault?.hasFallback(endpoint.credentialKey) === true;
    const endpointByLineAndExtension = new Map(
      verifiedEndpoints.map((endpoint) => [
        `${endpoint.lineNumber}:${endpoint.extension}`,
        endpoint,
      ]),
    );
    const bindingByStaff = new Map(
      activePrimaryBindings.map((binding) => [binding.staffUserId, binding]),
    );
    const bridgeByStaff = new Map(
      activeBridgeAssignments.map((bridge) => [bridge.staffUserId, bridge]),
    );
    const bridgeOnlineAfter = Date.now() - 45_000;
    return {
      items: rows.map((row) => {
        const assigned = bindingByStaff.get(row.id) ?? null;
        const requested =
          row.centrexLineNumber && row.centrexExtension
            ? endpointByLineAndExtension.get(
                `${row.centrexLineNumber}:${row.centrexExtension}`,
              ) ?? null
            : null;
        const bridge = bridgeByStaff.get(row.id) ?? null;
        const bridgeMatches = Boolean(
          assigned && bridge?.currentEndpointId === assigned.endpointId,
        );
        const bridgeOnline = Boolean(
          bridge?.lastSeenAt &&
            bridge.lastSeenAt.getTime() >= bridgeOnlineAfter,
        );
        const connectionStatus = resolveStaffCentrexConnectionStatus({
          centrexLineNumber: row.centrexLineNumber,
          centrexExtension: row.centrexExtension,
          requestedEndpointExists: Boolean(requested),
          assignedEndpointExists: Boolean(assigned),
          assignedEndpointMatches: Boolean(
            assigned && requested && assigned.endpointId === requested.id,
          ),
          credentialConfigured: Boolean(
            assigned && credentialConfigured(assigned),
          ),
          bridgeExists: Boolean(bridge),
          bridgeMatches,
          bridgeOnline,
          bridgeState: bridge?.state ?? null,
          legacyBridgeConfigured: Boolean(
            assigned && centrexBridgeEndpointIds.has(assigned.endpointId),
          ),
        });
        return {
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
          centrexLineNumber: row.centrexLineNumber,
          centrexExtension: row.centrexExtension,
          centrexConnection: {
            status: connectionStatus,
            assignedEndpoint: assigned
              ? {
                  id: assigned.endpointId,
                  label: assigned.label,
                  lineNumber: assigned.lineNumber,
                  extension: assigned.extension,
                  credentialConfigured: credentialConfigured(assigned),
                  bridgeConfigured:
                    bridgeMatches ||
                    centrexBridgeEndpointIds.has(assigned.endpointId),
                  bridgeOnline,
                  bridgeState: bridge?.state ?? null,
                  bridgeLastSeenAt:
                    bridge?.lastSeenAt?.toISOString() ?? null,
                  lastAuthSucceededAt:
                    assigned.lastAuthSucceededAt?.toISOString() ?? null,
                }
              : null,
          },
          legalFriendsId: row.legalFriendsId,
          legalFriendsMemberIdx: row.legalFriendsMemberIdx,
        } satisfies StaffDirectoryItem;
      }),
    };
  }

  async function listStaff(
    actor: StaffPrincipal,
  ): Promise<{ items: StaffDirectoryItem[] }> {
    if (!hasRole(actor, ["admin"])) {
      throw new StaffAuthError("forbidden", "직원 조회 권한이 없습니다.");
    }
    return staffDirectory();
  }

  async function getStaffProfile(
    actor: StaffPrincipal,
    staffUserId = actor.id,
  ): Promise<StaffDirectoryItem> {
    if (!canManageStaff(actor, staffUserId)) {
      throw new StaffAuthError(
        "forbidden",
        "다른 직원의 프로필을 조회할 권한이 없습니다.",
      );
    }
    const { items } = await staffDirectory();
    const profile = items.find((item) => item.id === staffUserId);
    if (!profile) {
      throw new StaffAuthError(
        "staff_not_found",
        "직원 계정을 찾을 수 없습니다.",
      );
    }
    return profile;
  }

  async function updateStaffProfile(
    actor: StaffPrincipal,
    staffUserId: string,
    rawInput: StaffProfileUpdate,
  ): Promise<StaffDirectoryItem> {
    if (!canManageStaff(actor, staffUserId)) {
      throw new StaffAuthError(
        "forbidden",
        "다른 직원의 프로필을 변경할 권한이 없습니다.",
      );
    }
    const input = staffProfileUpdateSchema.parse(rawInput);
    const actorIsAdmin = hasRole(actor, ["admin"]);
    if (input.role !== undefined && !actorIsAdmin) {
      throw new StaffAuthError(
        "forbidden",
        "역할과 권한은 관리자만 변경할 수 있습니다.",
      );
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      const [membership] = await tx
        .select({
          id: staffMemberships.id,
          organizationKey: staffMemberships.organizationKey,
          regionKey: staffMemberships.regionKey,
          department: staffMemberships.department,
          jobTitle: staffMemberships.jobTitle,
          role: staffMemberships.role,
        })
        .from(staffMemberships)
        .where(
          and(
            eq(staffMemberships.userId, staffUserId),
            eq(staffMemberships.isPrimary, true),
            eq(staffMemberships.isActive, true),
          ),
        )
        .limit(1)
        .for("update");
      if (!membership) {
        throw new StaffAuthError(
          "staff_not_found",
          "직원 계정을 찾을 수 없습니다.",
        );
      }

      const nextRole = input.role ?? membership.role;
      const changed =
        membership.organizationKey !== input.organization ||
        membership.regionKey !== input.region ||
        membership.department !== input.department ||
        membership.jobTitle !== input.jobTitle ||
        membership.role !== nextRole;
      if (!changed) return;

      await tx
        .update(staffMemberships)
        .set({
          organizationKey: input.organization,
          regionKey: input.region,
          department: input.department,
          jobTitle: input.jobTitle,
          role: nextRole,
        })
        .where(eq(staffMemberships.id, membership.id));
      await tx.insert(staffAuditLogs).values({
        id: randomUUID(),
        actorUserId: actor.id,
        action: "staff.profile.updated",
        targetType: "staff_user",
        targetId: staffUserId,
        metadata: {
          changedBySelf: actor.id === staffUserId,
          previousOrganization: membership.organizationKey,
          newOrganization: input.organization,
          previousRegion: membership.regionKey,
          newRegion: input.region,
          departmentChanged: membership.department !== input.department,
          jobTitleChanged: membership.jobTitle !== input.jobTitle,
          previousRole: membership.role,
          newRole: nextRole,
        },
        occurredAt: now,
      });
    });
    return getStaffProfile(actor, staffUserId);
  }

  async function changePassword(
    actor: StaffPrincipal,
    rawInput: StaffPasswordChange,
  ): Promise<void> {
    const input = staffPasswordChangeSchema.parse(rawInput);
    const [user] = await db
      .select({ passwordHash: staffUsers.passwordHash })
      .from(staffUsers)
      .where(eq(staffUsers.id, actor.id))
      .limit(1);
    if (
      !user ||
      !(await verifyStaffPassword(input.currentPassword, user.passwordHash))
    ) {
      await addAudit({
        actorUserId: actor.id,
        action: "staff.password.change_failed",
        targetType: "staff_user",
        targetId: actor.id,
        metadata: { reason: "current_password_mismatch" },
      });
      throw new StaffAuthError(
        "invalid_current_password",
        "현재 비밀번호가 일치하지 않습니다.",
      );
    }

    const now = new Date();
    const nextPasswordHash = await hashStaffPassword(input.newPassword);
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(staffUsers)
        .set({
          passwordHash: nextPasswordHash,
          passwordChangedAt: now,
          failedLoginCount: 0,
          lockedUntil: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(staffUsers.id, actor.id),
            eq(staffUsers.passwordHash, user.passwordHash),
          ),
        )
        .returning({ id: staffUsers.id });
      if (!updated) {
        throw new StaffAuthError(
          "invalid_current_password",
          "비밀번호가 이미 변경되었습니다. 다시 로그인해 주세요.",
        );
      }
      await tx
        .update(staffSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(staffSessions.userId, actor.id),
            isNull(staffSessions.revokedAt),
          ),
        );
      await tx.insert(staffAuditLogs).values({
        id: randomUUID(),
        actorUserId: actor.id,
        action: "staff.password.changed",
        targetType: "staff_user",
        targetId: actor.id,
        metadata: { allSessionsRevoked: true },
        occurredAt: now,
      });
    });
  }

  async function updateLegalFriendsAccount(
    actor: StaffPrincipal,
    staffUserId: string,
    rawInput: StaffExternalAccountUpdate,
  ): Promise<{
    legalFriendsId: string | null;
    legalFriendsMemberIdx: number | null;
  }> {
    if (!canManageStaff(actor, staffUserId)) {
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

  async function updateCentrexLineNumber(
    actor: StaffPrincipal,
    staffUserId: string,
    rawInput: StaffCentrexLineUpdate,
  ): Promise<{
    centrexLineNumber: string | null;
    centrexExtension: string | null;
    assignmentStatus: "unconfigured" | "pending_endpoint" | "assigned";
    credentialUpdated: boolean;
    bridgeConnected: boolean;
  }> {
    if (!canManageStaff(actor, staffUserId)) {
      throw new StaffAuthError(
        "forbidden",
        "센트릭스 회선번호 변경 권한이 없습니다.",
      );
    }
    const input = staffCentrexLineUpdateSchema.parse(rawInput);
    const now = new Date();
    let provisioned:
      | {
          endpointId: string;
          credentialKey: string;
          label: string;
          encrypted: ReturnType<typeof encryptCentrexCredential>;
        }
      | undefined;
    let bridgeReservation: CentrexBridgeAssignmentReservation | undefined;

    if (
      input.centrexLineNumber &&
      input.centrexExtension &&
      input.centrexPassword
    ) {
      if (!options.centrexClient || !options.protection) {
        throw new StaffAuthError(
          "centrex_provisioning_unavailable",
          "센트릭스 회선 검증 기능이 준비되지 않았습니다.",
        );
      }
      if (!options.centrexBridgeProvisioning) {
        throw new StaffAuthError(
          "centrex_provisioning_unavailable",
          "Windows bridge 통합 연결 기능이 준비되지 않았습니다.",
        );
      }
      const [staff] = await db
        .select({
          id: staffProfiles.userId,
          displayName: staffProfiles.displayName,
        })
        .from(staffProfiles)
        .where(eq(staffProfiles.userId, staffUserId))
        .limit(1);
      if (!staff) {
        throw new StaffAuthError(
          "staff_not_found",
          "직원 계정을 찾을 수 없습니다.",
        );
      }
      const passwordSha512 = createHash("sha512")
        .update(input.centrexPassword, "utf8")
        .digest("hex");
      let verified: Awaited<ReturnType<CentrexClient["getUserInfo"]>>;
      try {
        verified = await options.centrexClient.getUserInfo({
          apiLoginId: input.centrexLineNumber,
          passwordSha512,
        });
      } catch (error) {
        throw new StaffAuthError(
          "centrex_verification_failed",
          error instanceof CentrexDeliveryError
            ? error.message
            : "센트릭스 회선 정보를 확인하지 못했습니다.",
        );
      }
      if (
        verified.lineNumber !== input.centrexLineNumber ||
        verified.extension !== input.centrexExtension
      ) {
        throw new StaffAuthError(
          "centrex_line_mismatch",
          `센트릭스 확인 결과가 입력값과 다릅니다. 확인된 회선은 ${verified.lineNumber}, 내선은 ${verified.extension}입니다.`,
        );
      }
      const existingEndpoints = await db
        .select({
          id: telephonyEndpoints.id,
          credentialKey: telephonyEndpoints.credentialKey,
        })
        .from(telephonyEndpoints)
        .where(
          and(
            eq(telephonyEndpoints.provider, "centrex"),
            or(
              eq(
                telephonyEndpoints.lineNumber,
                input.centrexLineNumber,
              ),
              eq(telephonyEndpoints.apiLoginId, input.centrexLineNumber),
            ),
          ),
        );
      if (existingEndpoints.length > 1) {
        throw new StaffAuthError(
          "centrex_endpoint_conflict",
          "회선번호와 로그인 ID가 서로 다른 기존 endpoint에 연결되어 있습니다.",
        );
      }
      const endpointId = existingEndpoints[0]?.id ?? randomUUID();
      const credentialKey =
        existingEndpoints[0]?.credentialKey ?? `endpoint-${endpointId}`;
      provisioned = {
        endpointId,
        credentialKey,
        label: `${staff.displayName} 내선 ${input.centrexExtension}`,
        encrypted: encryptCentrexCredential(
          options.protection,
          endpointId,
          passwordSha512,
        ),
      };
      try {
        bridgeReservation =
          await options.centrexBridgeProvisioning.ensureAssignmentForStaff(
            staffUserId,
            actor.id,
          );
      } catch (error) {
        if (error instanceof CentrexBridgeProvisioningError) {
          throw new StaffAuthError(
            error.code === "bridge_busy"
              ? "centrex_bridge_busy"
              : error.code === "bridge_unassigned" ||
                  error.code === "bridge_unavailable"
                ? "centrex_bridge_unassigned"
                : "centrex_bridge_failed",
            error.message,
          );
        }
        throw new StaffAuthError(
          "centrex_bridge_failed",
          "Windows bridge 자동 배정을 완료하지 못했습니다.",
        );
      }
    }

    const updateResult = await (async () => {
      try {
        return await db.transaction(async (tx) => {
      const [profile] = await tx
        .select({
          userId: staffProfiles.userId,
          centrexLineNumber: staffProfiles.centrexLineNumber,
          centrexExtension: staffProfiles.centrexExtension,
        })
        .from(staffProfiles)
        .where(eq(staffProfiles.userId, staffUserId))
        .limit(1)
        .for("update");
      if (!profile) {
        throw new StaffAuthError(
          "staff_not_found",
          "직원 계정을 찾을 수 없습니다.",
        );
      }
      if (provisioned && input.centrexLineNumber && input.centrexExtension) {
        const matchingEndpoints = await tx
          .select({ id: telephonyEndpoints.id })
          .from(telephonyEndpoints)
          .where(
            and(
              eq(telephonyEndpoints.provider, "centrex"),
              or(
                eq(
                  telephonyEndpoints.lineNumber,
                  input.centrexLineNumber,
                ),
                eq(telephonyEndpoints.apiLoginId, input.centrexLineNumber),
              ),
            ),
          )
          .for("update");
        if (
          matchingEndpoints.length > 1 ||
          (matchingEndpoints[0] &&
            matchingEndpoints[0].id !== provisioned.endpointId)
        ) {
          throw new StaffAuthError(
            "centrex_endpoint_conflict",
            "회선 검증 중 기존 endpoint가 변경되었습니다. 다시 시도해 주세요.",
          );
        }
        if (matchingEndpoints[0]) {
          await tx
            .update(telephonyEndpoints)
            .set({
              label: provisioned.label,
              lineNumber: input.centrexLineNumber,
              extension: input.centrexExtension,
              apiLoginId: input.centrexLineNumber,
              credentialKey: provisioned.credentialKey,
              isActive: true,
              lastAuthSucceededAt: now,
              lastAuthFailedAt: null,
              updatedAt: now,
            })
            .where(eq(telephonyEndpoints.id, provisioned.endpointId));
        } else {
          await tx.insert(telephonyEndpoints).values({
            id: provisioned.endpointId,
            provider: "centrex",
            endpointType: "personal",
            label: provisioned.label,
            lineNumber: input.centrexLineNumber,
            extension: input.centrexExtension,
            apiLoginId: input.centrexLineNumber,
            credentialKey: provisioned.credentialKey,
            isActive: true,
            lastAuthSucceededAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
        await tx
          .insert(telephonyEndpointCredentials)
          .values({
            endpointId: provisioned.endpointId,
            passwordSha512Ciphertext: provisioned.encrypted.ciphertext,
            passwordSha512Nonce: provisioned.encrypted.nonce,
            passwordSha512KeyVersion: provisioned.encrypted.keyVersion,
            verifiedAt: now,
            verifiedByUserId: actor.id,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: telephonyEndpointCredentials.endpointId,
            set: {
              passwordSha512Ciphertext: provisioned.encrypted.ciphertext,
              passwordSha512Nonce: provisioned.encrypted.nonce,
              passwordSha512KeyVersion: provisioned.encrypted.keyVersion,
              verifiedAt: now,
              verifiedByUserId: actor.id,
              updatedAt: now,
            },
          });
      }
      const profileChanged =
        profile.centrexLineNumber !== input.centrexLineNumber ||
        profile.centrexExtension !== input.centrexExtension;
      if (profileChanged) {
        await tx
          .update(staffProfiles)
          .set({
            centrexLineNumber: input.centrexLineNumber,
            centrexExtension: input.centrexExtension,
            updatedAt: now,
          })
          .where(eq(staffProfiles.userId, staffUserId));
      }
      const assignment = await reconcileStaffCentrexBinding(tx, {
        staffUserId,
        actorUserId: actor.id,
        lineNumber: input.centrexLineNumber,
        extension: input.centrexExtension,
        now,
      });
      if (profileChanged || assignment.changed || provisioned) {
        await tx.insert(staffAuditLogs).values({
          id: randomUUID(),
          actorUserId: actor.id,
          action: "staff.centrex_line.updated",
          targetType: "staff_user",
          targetId: staffUserId,
          metadata: {
            previousConfigured: Boolean(profile.centrexLineNumber),
            previousLineLast4:
              profile.centrexLineNumber?.slice(-4) ?? null,
            previousExtension: profile.centrexExtension,
            newConfigured: Boolean(input.centrexLineNumber),
            newLineLast4: input.centrexLineNumber?.slice(-4) ?? null,
            newExtension: input.centrexExtension,
            assignmentStatus: assignment.status,
            assignedEndpointId: assignment.endpointId,
            credentialVerified: Boolean(provisioned),
          },
          occurredAt: now,
        });
      }
          return {
            assignment,
            previousLineNumber: profile.centrexLineNumber,
            previousExtension: profile.centrexExtension,
          };
        });
      } catch (error) {
        if (bridgeReservation?.newlyAssigned) {
          try {
            await options.centrexBridgeProvisioning?.releaseNewAssignment({
              staffUserId,
              bridgeId: bridgeReservation.assignment.bridgeId,
            });
          } catch {
            throw new StaffAuthError(
              "centrex_bridge_failed",
              "회선 저장 실패 후 Windows bridge 슬롯을 복구하지 못했습니다.",
            );
          }
        }
        throw error;
      }
    })();

    let bridgeConnected = false;
    if (
      provisioned &&
      input.centrexLineNumber &&
      input.centrexExtension &&
      input.centrexPassword &&
      options.centrexBridgeProvisioning
    ) {
      try {
        const bridgeResult = await options.centrexBridgeProvisioning.provision({
          staffUserId,
          endpointId: provisioned.endpointId,
          loginId: input.centrexLineNumber,
          password: input.centrexPassword,
          expectedExtension: input.centrexExtension,
          expectedLineLast4: input.centrexLineNumber.slice(-4),
        });
        bridgeConnected = true;
        await addAudit({
          actorUserId: actor.id,
          action: "telephony.centrex_bridge.provisioned",
          targetType: "staff_user",
          targetId: staffUserId,
          metadata: {
            endpointId: provisioned.endpointId,
            lineLast4: input.centrexLineNumber.slice(-4),
            extension: input.centrexExtension,
            resultCode: bridgeResult.resultCode,
          },
        });
      } catch (error) {
        await db.transaction(async (tx) => {
          await tx
            .update(staffProfiles)
            .set({
              centrexLineNumber: updateResult.previousLineNumber,
              centrexExtension: updateResult.previousExtension,
              updatedAt: new Date(),
            })
            .where(eq(staffProfiles.userId, staffUserId));
          await reconcileStaffCentrexBinding(tx, {
            staffUserId,
            actorUserId: actor.id,
            lineNumber: updateResult.previousLineNumber,
            extension: updateResult.previousExtension,
            now: new Date(),
          });
          await tx.insert(staffAuditLogs).values({
            id: randomUUID(),
            actorUserId: actor.id,
            action: "telephony.centrex_bridge.provisioning_failed",
            targetType: "staff_user",
            targetId: staffUserId,
            metadata: {
              attemptedEndpointId: provisioned.endpointId,
              attemptedLineLast4: input.centrexLineNumber!.slice(-4),
              attemptedExtension: input.centrexExtension,
              restoredPreviousAssignment: true,
              reason:
                error instanceof CentrexBridgeProvisioningError
                  ? error.code
                  : "unexpected_bridge_error",
            },
            occurredAt: new Date(),
          });
        });
        if (bridgeReservation?.newlyAssigned) {
          try {
            await options.centrexBridgeProvisioning.releaseNewAssignment({
              staffUserId,
              bridgeId: bridgeReservation.assignment.bridgeId,
            });
          } catch {
            throw new StaffAuthError(
              "centrex_bridge_failed",
              "회선 연결 실패 후 Windows bridge 슬롯을 복구하지 못했습니다.",
            );
          }
        }
        if (error instanceof CentrexBridgeProvisioningError) {
          const code =
            error.code === "bridge_unassigned"
              ? "centrex_bridge_unassigned"
              : error.code === "bridge_busy"
                ? "centrex_bridge_busy"
                : "centrex_bridge_failed";
          throw new StaffAuthError(code, error.message);
        }
        throw new StaffAuthError(
          "centrex_bridge_failed",
          "Windows bridge 회선 연결을 완료하지 못했습니다.",
        );
      }
    }
    return {
      centrexLineNumber: input.centrexLineNumber,
      centrexExtension: input.centrexExtension,
      assignmentStatus: updateResult.assignment.status,
      credentialUpdated: Boolean(provisioned),
      bridgeConnected,
    };
  }

  async function reassignCentrexBridge(
    actor: StaffPrincipal,
    staffUserId: string,
  ) {
    if (!canManageStaff(actor, staffUserId)) {
      throw new StaffAuthError(
        "forbidden",
        "센트릭스 bridge 재배정 권한이 없습니다.",
      );
    }
    const provisioning = options.centrexBridgeProvisioning;
    if (!provisioning) {
      throw new StaffAuthError(
        "centrex_provisioning_unavailable",
        "Windows bridge 재배정 기능이 준비되지 않았습니다.",
      );
    }
    const assignment = provisioning.assignmentForStaff(staffUserId);
    if (!assignment) {
      throw new StaffAuthError(
        "centrex_bridge_unassigned",
        "이 직원에게 재배정할 Windows bridge가 없습니다.",
      );
    }
    if (assignment.currentEndpointId) {
      const [activeInbound, activeAnswer, activeOutbound] = await Promise.all([
        db
          .select({ id: telephonyInboundCalls.id })
          .from(telephonyInboundCalls)
          .where(
            and(
              eq(
                telephonyInboundCalls.endpointId,
                assignment.currentEndpointId,
              ),
              inArray(telephonyInboundCalls.state, ["ringing", "connected"]),
            ),
          )
          .limit(1),
        db
          .select({ id: telephonyInboundCommands.id })
          .from(telephonyInboundCommands)
          .where(
            and(
              eq(
                telephonyInboundCommands.endpointId,
                assignment.currentEndpointId,
              ),
              inArray(telephonyInboundCommands.status, [
                "queued",
                "dispatching",
              ]),
            ),
          )
          .limit(1),
        db
          .select({ id: telephonyCalls.id })
          .from(telephonyCalls)
          .where(
            and(
              eq(telephonyCalls.endpointId, assignment.currentEndpointId),
              inArray(telephonyCalls.commandStatus, [
                "queued",
                "dispatching",
              ]),
            ),
          )
          .limit(1),
      ]);
      if (activeInbound[0] || activeAnswer[0] || activeOutbound[0]) {
        throw new StaffAuthError(
          "centrex_bridge_active_call",
          "진행 중인 통화 또는 전화 명령이 있어 bridge를 재배정할 수 없습니다.",
        );
      }
    }

    try {
      const result = await provisioning.prepareReassignmentForStaff(
        staffUserId,
        actor.id,
      );
      await addAudit({
        actorUserId: actor.id,
        action: "telephony.centrex_bridge.reassigned",
        targetType: "staff_user",
        targetId: staffUserId,
        metadata: {
          previousBridgeId: result.previousBridgeId,
          replacementBridgeId: result.replacementBridgeId,
          previousQuarantined: result.previousQuarantined,
        },
      });
      return result;
    } catch (error) {
      if (error instanceof CentrexBridgeProvisioningError) {
        throw new StaffAuthError(
          error.code === "bridge_busy"
            ? "centrex_bridge_busy"
            : error.code === "bridge_unassigned" ||
                error.code === "bridge_unavailable"
              ? "centrex_bridge_unassigned"
              : "centrex_bridge_failed",
          error.message,
        );
      }
      throw error;
    }
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
    changePassword,
    createBootstrapInvitation,
    createInvitation,
    deleteExpiredSessions,
    getStaffProfile,
    inspectInvitation,
    listStaff,
    login,
    logout,
    recordConsultationAccess,
    reassignCentrexBridge,
    updateCentrexLineNumber,
    updateLegalFriendsAccount,
    updateStaffProfile,
  };
}

export type StaffAuthService = ReturnType<typeof createStaffAuthService>;
