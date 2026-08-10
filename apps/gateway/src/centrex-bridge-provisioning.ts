import {
  createCipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";

import type {
  CentrexBridgeCommandResult,
  CentrexBridgeProvisionCommand,
  CentrexBridgeResetCommand,
} from "@lawand/core";
import {
  staffTelephonyBridgeAssignments,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { CentrexBridgeKeyMap } from "./centrex-bridge-auth.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

type BridgeAuthentication = {
  bridgeId: string;
  endpointId: string;
  authenticationNonceHash: Buffer;
};

type BridgeAssignment = {
  id: string;
  staffUserId: string | null;
  bridgeId: string;
  currentEndpointId: string | null;
  pendingEndpointId: string | null;
  state: string;
  provisioningCommandId: string | null;
  provisioningExpiresAt: Date | null;
  lastSeenAt: Date | null;
};

export type CentrexBridgeAssignmentReservation = {
  assignment: BridgeAssignment & { staffUserId: string };
  newlyAssigned: boolean;
};

type PendingProvisioning = {
  command: CentrexBridgeProvisionCommand;
  bridgeId: string;
  assignmentId: string;
  staffUserId: string;
  endpointId: string;
  resolve: (result: CentrexBridgeProvisioningResult) => void;
  reject: (error: CentrexBridgeProvisioningError) => void;
  timeout: NodeJS.Timeout;
};

export type CentrexBridgeProvisioningResult = {
  bridgeId: string;
  endpointId: string;
  resultCode: string;
};

export class CentrexBridgeProvisioningError extends Error {
  constructor(
    readonly code:
      | "bridge_unassigned"
      | "bridge_unavailable"
      | "bridge_busy"
      | "bridge_endpoint_mismatch"
      | "bridge_provisioning_failed"
      | "bridge_provisioning_timeout",
    message: string,
  ) {
    super(message);
  }
}

function deriveKey(secret: Buffer, label: string): Buffer {
  return createHmac("sha256", secret).update(label, "utf8").digest();
}

export function encryptCentrexBridgeCredentialEnvelope(input: {
  commandId: string;
  loginId: string;
  password: string;
  secret: Buffer;
  iv?: Buffer;
}) {
  const encryptionKey = deriveKey(
    input.secret,
    "lawand-centrex-provisioning-encryption-v1",
  );
  const macKey = deriveKey(
    input.secret,
    "lawand-centrex-provisioning-mac-v1",
  );
  const iv = input.iv ? Buffer.from(input.iv) : randomBytes(16);
  if (iv.length !== 16) {
    throw new Error("센트릭스 bridge 자격 증명 IV는 16바이트여야 합니다.");
  }
  const plaintext = Buffer.from(
    JSON.stringify({ loginId: input.loginId, password: input.password }),
    "utf8",
  );
  let ciphertext: Buffer;
  try {
    const cipher = createCipheriv("aes-256-cbc", encryptionKey, iv);
    ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  } finally {
    plaintext.fill(0);
    encryptionKey.fill(0);
  }
  const macInput = Buffer.concat([
    Buffer.from(`v1\n${input.commandId}\n`, "utf8"),
    iv,
    ciphertext,
  ]);
  const mac = createHmac("sha256", macKey).update(macInput).digest();
  macKey.fill(0);
  macInput.fill(0);
  return {
    algorithm: "A256CBC-HS256" as const,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    mac: mac.toString("base64url"),
  };
}

export function createCentrexBridgeProvisioningService(options: {
  db: Database;
  keys: CentrexBridgeKeyMap;
  now?: () => Date;
  commandLifetimeMs?: number;
  onlineSlotWindowMs?: number;
}) {
  const {
    db,
    keys,
    now = () => new Date(),
    commandLifetimeMs = 40_000,
    onlineSlotWindowMs = 45_000,
  } = options;
  const assignmentsByBridge = new Map<string, BridgeAssignment>();
  const assignmentsByStaff = new Map<string, BridgeAssignment>();
  const pendingByBridge = new Map<string, PendingProvisioning>();
  const completedCommands = new Map<
    string,
    {
      bridgeId: string;
      expiresAt: number;
      status: "succeeded" | "failed";
      resultCode: string;
    }
  >();
  const lastSeenWrites = new Map<string, number>();

  function cacheAssignment(assignment: BridgeAssignment) {
    assignmentsByBridge.set(assignment.bridgeId, assignment);
    if (assignment.staffUserId) {
      assignmentsByStaff.set(assignment.staffUserId, assignment);
    }
  }

  async function reloadAssignments() {
    assignmentsByBridge.clear();
    assignmentsByStaff.clear();
    const rows = await db
      .select({
        id: staffTelephonyBridgeAssignments.id,
        staffUserId: staffTelephonyBridgeAssignments.staffUserId,
        bridgeId: staffTelephonyBridgeAssignments.bridgeId,
        currentEndpointId:
          staffTelephonyBridgeAssignments.currentEndpointId,
        pendingEndpointId:
          staffTelephonyBridgeAssignments.pendingEndpointId,
        state: staffTelephonyBridgeAssignments.state,
        provisioningCommandId:
          staffTelephonyBridgeAssignments.provisioningCommandId,
        provisioningExpiresAt:
          staffTelephonyBridgeAssignments.provisioningExpiresAt,
        lastSeenAt: staffTelephonyBridgeAssignments.lastSeenAt,
      })
      .from(staffTelephonyBridgeAssignments)
      .where(eq(staffTelephonyBridgeAssignments.isActive, true));
    for (const row of rows) cacheAssignment(row);
  }

  async function start() {
    const startedAt = now();
    await db
      .update(staffTelephonyBridgeAssignments)
      .set({
        state: "failed",
        pendingEndpointId: null,
        provisioningCommandId: null,
        provisioningExpiresAt: null,
        lastLoginFailedAt: startedAt,
        lastResultCode: "gateway_restarted",
        updatedAt: startedAt,
      })
      .where(
        and(
          eq(staffTelephonyBridgeAssignments.isActive, true),
          eq(staffTelephonyBridgeAssignments.state, "provisioning"),
        ),
      );

    for (const [bridgeId, key] of Object.entries(keys)) {
      const existing = await db
        .select({
          id: staffTelephonyBridgeAssignments.id,
          staffUserId: staffTelephonyBridgeAssignments.staffUserId,
          bridgeId: staffTelephonyBridgeAssignments.bridgeId,
        })
        .from(staffTelephonyBridgeAssignments)
        .where(
          and(
            eq(staffTelephonyBridgeAssignments.isActive, true),
            eq(staffTelephonyBridgeAssignments.bridgeId, bridgeId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        if (
          key.staffUserId &&
          existing[0].staffUserId !== key.staffUserId
        ) {
          if (!existing[0].staffUserId) {
            const conflictingStaff = await db
              .select({ bridgeId: staffTelephonyBridgeAssignments.bridgeId })
              .from(staffTelephonyBridgeAssignments)
              .where(
                and(
                  eq(staffTelephonyBridgeAssignments.isActive, true),
                  eq(
                    staffTelephonyBridgeAssignments.staffUserId,
                    key.staffUserId,
                  ),
                ),
              )
              .limit(1);
            if (conflictingStaff[0]) {
              throw new Error(
                "직원 한 명에게 둘 이상의 센트릭스 bridge를 배정할 수 없습니다.",
              );
            }
            await db
              .update(staffTelephonyBridgeAssignments)
              .set({
                staffUserId: key.staffUserId,
                currentEndpointId: key.endpointId,
                state: "assigned",
                assignedAt: startedAt,
                updatedAt: startedAt,
              })
              .where(eq(staffTelephonyBridgeAssignments.id, existing[0].id));
            continue;
          }
          throw new Error(
            `센트릭스 ${bridgeId} bridge의 직원 배정이 설정과 다릅니다.`,
          );
        }
        continue;
      }
      if (key.staffUserId) {
        const conflictingStaff = await db
          .select({ bridgeId: staffTelephonyBridgeAssignments.bridgeId })
          .from(staffTelephonyBridgeAssignments)
          .where(
            and(
              eq(staffTelephonyBridgeAssignments.isActive, true),
              eq(
                staffTelephonyBridgeAssignments.staffUserId,
                key.staffUserId,
              ),
            ),
          )
          .limit(1);
        if (conflictingStaff[0]) {
          throw new Error(
            "직원 한 명에게 둘 이상의 센트릭스 bridge를 배정할 수 없습니다.",
          );
        }
      }
      await db.insert(staffTelephonyBridgeAssignments).values({
        id: randomUUID(),
        staffUserId: key.staffUserId ?? null,
        bridgeId,
        currentEndpointId: key.staffUserId ? key.endpointId : null,
        state: key.staffUserId ? "assigned" : "idle",
        isActive: true,
        assignedAt: startedAt,
        createdAt: startedAt,
        updatedAt: startedAt,
      });
    }
    await reloadAssignments();
  }

  async function markSeen(bridgeId: string) {
    const current = now().getTime();
    if (current - (lastSeenWrites.get(bridgeId) ?? 0) < 15_000) return;
    lastSeenWrites.set(bridgeId, current);
    await db
      .update(staffTelephonyBridgeAssignments)
      .set({ lastSeenAt: new Date(current), updatedAt: new Date(current) })
      .where(
        and(
          eq(staffTelephonyBridgeAssignments.bridgeId, bridgeId),
          eq(staffTelephonyBridgeAssignments.isActive, true),
        ),
      );
  }

  async function resolveAuthentication(
    authentication: BridgeAuthentication,
    requestedEndpointId?: string,
  ): Promise<BridgeAuthentication> {
    const assignment = assignmentsByBridge.get(authentication.bridgeId);
    if (!assignment) {
      throw new CentrexBridgeProvisioningError(
        "bridge_unassigned",
        "직원에게 배정되지 않은 Windows bridge입니다.",
      );
    }
    await markSeen(authentication.bridgeId);
    if (assignment.state === "idle" || assignment.state === "quarantined") {
      throw new CentrexBridgeProvisioningError(
        "bridge_endpoint_mismatch",
        "유휴 또는 격리된 Windows bridge는 전화 이벤트를 보낼 수 없습니다.",
      );
    }
    if (requestedEndpointId) {
      if (
        requestedEndpointId !== assignment.currentEndpointId &&
        requestedEndpointId !== assignment.pendingEndpointId
      ) {
        throw new CentrexBridgeProvisioningError(
          "bridge_endpoint_mismatch",
          "Windows bridge에 허용되지 않은 회선입니다.",
        );
      }
      return { ...authentication, endpointId: requestedEndpointId };
    }
    if (!assignment.currentEndpointId) {
      throw new CentrexBridgeProvisioningError(
        "bridge_endpoint_mismatch",
        "Windows bridge의 현재 회선이 설정되지 않았습니다.",
      );
    }
    return { ...authentication, endpointId: assignment.currentEndpointId };
  }

  function assignmentForStaff(staffUserId: string) {
    return assignmentsByStaff.get(staffUserId) ?? null;
  }

  function isReadyForTelephony(bridgeId: string) {
    const assignment = assignmentsByBridge.get(bridgeId);
    return Boolean(
      assignment?.staffUserId &&
        assignment.currentEndpointId &&
        assignment.state !== "idle",
    );
  }

  async function ensureAssignmentForStaff(
    staffUserId: string,
    assignedByUserId: string,
  ): Promise<CentrexBridgeAssignmentReservation> {
    const reservedAt = now();
    const onlineAfter = new Date(reservedAt.getTime() - onlineSlotWindowMs);
    const keyIds = Object.keys(keys);
    const reservation = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(528117403912413689::bigint)`,
      );
      const [existing] = await tx
        .select({
          id: staffTelephonyBridgeAssignments.id,
          staffUserId: staffTelephonyBridgeAssignments.staffUserId,
          bridgeId: staffTelephonyBridgeAssignments.bridgeId,
          currentEndpointId:
            staffTelephonyBridgeAssignments.currentEndpointId,
          pendingEndpointId:
            staffTelephonyBridgeAssignments.pendingEndpointId,
          state: staffTelephonyBridgeAssignments.state,
          provisioningCommandId:
            staffTelephonyBridgeAssignments.provisioningCommandId,
          provisioningExpiresAt:
            staffTelephonyBridgeAssignments.provisioningExpiresAt,
          lastSeenAt: staffTelephonyBridgeAssignments.lastSeenAt,
        })
        .from(staffTelephonyBridgeAssignments)
        .where(
          and(
            eq(staffTelephonyBridgeAssignments.isActive, true),
            eq(staffTelephonyBridgeAssignments.staffUserId, staffUserId),
          ),
        )
        .limit(1)
        .for("update");
      if (existing) {
        return {
          assignment: existing as BridgeAssignment & { staffUserId: string },
          newlyAssigned: false,
        };
      }

      const [available] = await tx
        .select({
          id: staffTelephonyBridgeAssignments.id,
          bridgeId: staffTelephonyBridgeAssignments.bridgeId,
        })
        .from(staffTelephonyBridgeAssignments)
        .where(
          and(
            eq(staffTelephonyBridgeAssignments.isActive, true),
            eq(staffTelephonyBridgeAssignments.state, "idle"),
            isNull(staffTelephonyBridgeAssignments.staffUserId),
            isNull(staffTelephonyBridgeAssignments.currentEndpointId),
            gte(staffTelephonyBridgeAssignments.lastSeenAt, onlineAfter),
            inArray(staffTelephonyBridgeAssignments.bridgeId, keyIds),
          ),
        )
        .orderBy(
          desc(staffTelephonyBridgeAssignments.lastSeenAt),
          asc(staffTelephonyBridgeAssignments.bridgeId),
        )
        .limit(1)
        .for("update");
      if (!available) return null;

      const [claimed] = await tx
        .update(staffTelephonyBridgeAssignments)
        .set({
          staffUserId,
          state: "assigned",
          assignedAt: reservedAt,
          assignedByUserId,
          lastLoginSucceededAt: null,
          lastLoginFailedAt: null,
          lastResultCode: "slot_reserved",
          updatedAt: reservedAt,
        })
        .where(eq(staffTelephonyBridgeAssignments.id, available.id))
        .returning({
          id: staffTelephonyBridgeAssignments.id,
          staffUserId: staffTelephonyBridgeAssignments.staffUserId,
          bridgeId: staffTelephonyBridgeAssignments.bridgeId,
          currentEndpointId:
            staffTelephonyBridgeAssignments.currentEndpointId,
          pendingEndpointId:
            staffTelephonyBridgeAssignments.pendingEndpointId,
          state: staffTelephonyBridgeAssignments.state,
          provisioningCommandId:
            staffTelephonyBridgeAssignments.provisioningCommandId,
          provisioningExpiresAt:
            staffTelephonyBridgeAssignments.provisioningExpiresAt,
          lastSeenAt: staffTelephonyBridgeAssignments.lastSeenAt,
        });
      if (!claimed?.staffUserId) return null;
      return {
        assignment: claimed as BridgeAssignment & { staffUserId: string },
        newlyAssigned: true,
      };
    });
    if (!reservation) {
      throw new CentrexBridgeProvisioningError(
        "bridge_unavailable",
        "현재 온라인 상태인 빈 Windows bridge 슬롯이 없습니다. 브리지 풀 상태를 확인해 주세요.",
      );
    }
    await reloadAssignments();
    return reservation;
  }

  async function prepareReassignmentForStaff(
    staffUserId: string,
    assignedByUserId: string,
  ) {
    const reassignedAt = now();
    const onlineAfter = new Date(
      reassignedAt.getTime() - onlineSlotWindowMs,
    );
    const keyIds = Object.keys(keys);
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(528117403912413689::bigint)`,
      );
      const [current] = await tx
        .select({
          id: staffTelephonyBridgeAssignments.id,
          bridgeId: staffTelephonyBridgeAssignments.bridgeId,
          currentEndpointId:
            staffTelephonyBridgeAssignments.currentEndpointId,
          state: staffTelephonyBridgeAssignments.state,
        })
        .from(staffTelephonyBridgeAssignments)
        .where(
          and(
            eq(staffTelephonyBridgeAssignments.isActive, true),
            eq(staffTelephonyBridgeAssignments.staffUserId, staffUserId),
          ),
        )
        .limit(1)
        .for("update");
      if (!current) {
        throw new CentrexBridgeProvisioningError(
          "bridge_unassigned",
          "이 직원에게 재배정할 Windows bridge가 없습니다.",
        );
      }
      if (
        current.state === "provisioning" ||
        pendingByBridge.has(current.bridgeId)
      ) {
        throw new CentrexBridgeProvisioningError(
          "bridge_busy",
          "Windows bridge가 회선 변경을 처리 중입니다.",
        );
      }

      const [available] = await tx
        .select({
          id: staffTelephonyBridgeAssignments.id,
          bridgeId: staffTelephonyBridgeAssignments.bridgeId,
        })
        .from(staffTelephonyBridgeAssignments)
        .where(
          and(
            eq(staffTelephonyBridgeAssignments.isActive, true),
            eq(staffTelephonyBridgeAssignments.state, "idle"),
            isNull(staffTelephonyBridgeAssignments.staffUserId),
            isNull(staffTelephonyBridgeAssignments.currentEndpointId),
            gte(staffTelephonyBridgeAssignments.lastSeenAt, onlineAfter),
            inArray(staffTelephonyBridgeAssignments.bridgeId, keyIds),
          ),
        )
        .orderBy(
          desc(staffTelephonyBridgeAssignments.lastSeenAt),
          asc(staffTelephonyBridgeAssignments.bridgeId),
        )
        .limit(1)
        .for("update");
      if (!available) {
        throw new CentrexBridgeProvisioningError(
          "bridge_unavailable",
          "재배정할 온라인 유휴 Windows bridge 슬롯이 없습니다.",
        );
      }

      await tx
        .update(staffTelephonyBridgeAssignments)
        .set({
          staffUserId: null,
          state: current.currentEndpointId ? "quarantined" : "idle",
          assignedByUserId: null,
          pendingEndpointId: null,
          provisioningCommandId: null,
          provisioningExpiresAt: null,
          lastLoginFailedAt: null,
          lastResultCode: current.currentEndpointId
            ? "admin_reassignment_quarantined"
            : "admin_reassignment_released",
          updatedAt: reassignedAt,
        })
        .where(eq(staffTelephonyBridgeAssignments.id, current.id));

      const [replacement] = await tx
        .update(staffTelephonyBridgeAssignments)
        .set({
          staffUserId,
          state: "assigned",
          assignedAt: reassignedAt,
          assignedByUserId,
          lastLoginSucceededAt: null,
          lastLoginFailedAt: null,
          lastResultCode: "admin_reassignment_reserved",
          updatedAt: reassignedAt,
        })
        .where(eq(staffTelephonyBridgeAssignments.id, available.id))
        .returning({
          id: staffTelephonyBridgeAssignments.id,
          bridgeId: staffTelephonyBridgeAssignments.bridgeId,
        });
      if (!replacement) {
        throw new CentrexBridgeProvisioningError(
          "bridge_unavailable",
          "유휴 Windows bridge 슬롯 재배정을 완료하지 못했습니다.",
        );
      }
      return {
        previousBridgeId: current.bridgeId,
        replacementBridgeId: replacement.bridgeId,
        previousQuarantined: Boolean(current.currentEndpointId),
      };
    });
    await reloadAssignments();
    return result;
  }

  async function releaseNewAssignment(input: {
    staffUserId: string;
    bridgeId: string;
  }) {
    const releasedAt = now();
    const released = await db
      .update(staffTelephonyBridgeAssignments)
      .set({
        staffUserId: null,
        state: "idle",
        assignedByUserId: null,
        lastLoginSucceededAt: null,
        lastLoginFailedAt: null,
        lastResultCode: "slot_reservation_released",
        updatedAt: releasedAt,
      })
      .where(
        and(
          eq(staffTelephonyBridgeAssignments.isActive, true),
          eq(staffTelephonyBridgeAssignments.staffUserId, input.staffUserId),
          eq(staffTelephonyBridgeAssignments.bridgeId, input.bridgeId),
          inArray(staffTelephonyBridgeAssignments.state, [
            "assigned",
            "failed",
          ]),
          isNull(staffTelephonyBridgeAssignments.currentEndpointId),
          isNull(staffTelephonyBridgeAssignments.pendingEndpointId),
        ),
      )
      .returning({ id: staffTelephonyBridgeAssignments.id });
    if (released.length > 0) await reloadAssignments();
    return released.length > 0;
  }

  async function finishFailure(
    pending: PendingProvisioning,
    code: string,
    errorCode:
      | "bridge_provisioning_failed"
      | "bridge_provisioning_timeout",
  ) {
    clearTimeout(pending.timeout);
    pendingByBridge.delete(pending.bridgeId);
    const failedAt = now();
    await db
      .update(staffTelephonyBridgeAssignments)
      .set({
        state: "failed",
        pendingEndpointId: null,
        provisioningCommandId: null,
        provisioningExpiresAt: null,
        lastLoginFailedAt: failedAt,
        lastResultCode: code,
        updatedAt: failedAt,
      })
      .where(eq(staffTelephonyBridgeAssignments.id, pending.assignmentId));
    await reloadAssignments();
    completedCommands.set(pending.command.commandId, {
      bridgeId: pending.bridgeId,
      expiresAt: failedAt.getTime() + 5 * 60_000,
      status: "failed",
      resultCode: code,
    });
    pending.reject(
      new CentrexBridgeProvisioningError(
        errorCode,
        errorCode === "bridge_provisioning_timeout"
          ? "Windows bridge가 제한 시간 안에 새 회선 로그인을 확인하지 못했습니다."
          : `Windows bridge 회선 연결에 실패했습니다 (${code}).`,
      ),
    );
  }

  async function provision(input: {
    staffUserId: string;
    endpointId: string;
    loginId: string;
    password: string;
    expectedExtension: string;
    expectedLineLast4: string;
  }): Promise<CentrexBridgeProvisioningResult> {
    const assignment = assignmentForStaff(input.staffUserId);
    if (!assignment) {
      throw new CentrexBridgeProvisioningError(
        "bridge_unassigned",
        "이 직원에게 배정된 Windows bridge가 없습니다.",
      );
    }
    const key = keys[assignment.bridgeId];
    if (!key) {
      throw new CentrexBridgeProvisioningError(
        "bridge_unavailable",
        "배정된 Windows bridge 인증 설정이 없습니다.",
      );
    }
    if (pendingByBridge.has(assignment.bridgeId)) {
      throw new CentrexBridgeProvisioningError(
        "bridge_busy",
        "Windows bridge가 다른 회선 변경을 처리 중입니다.",
      );
    }
    const commandId = randomUUID();
    const expiresAt = new Date(now().getTime() + commandLifetimeMs);
    const command: CentrexBridgeProvisionCommand = {
      schemaVersion: 1,
      commandId,
      commandType: "provision",
      endpointId: input.endpointId,
      expectedExtension: input.expectedExtension,
      expectedLineLast4: input.expectedLineLast4,
      credentialEnvelope: encryptCentrexBridgeCredentialEnvelope({
        commandId,
        loginId: input.loginId,
        password: input.password,
        secret: key.secret,
      }),
      expiresAt: expiresAt.toISOString(),
    };
    const stagedAt = now();
    await db
      .update(staffTelephonyBridgeAssignments)
      .set({
        state: "provisioning",
        pendingEndpointId: input.endpointId,
        provisioningCommandId: commandId,
        provisioningExpiresAt: expiresAt,
        lastResultCode: null,
        updatedAt: stagedAt,
      })
      .where(eq(staffTelephonyBridgeAssignments.id, assignment.id));
    await reloadAssignments();

    return new Promise<CentrexBridgeProvisioningResult>((resolve, reject) => {
      const pending = {} as PendingProvisioning;
      const timeout = setTimeout(() => {
        void finishFailure(
          pending,
          "provision_timeout",
          "bridge_provisioning_timeout",
        );
      }, commandLifetimeMs + 2_000);
      timeout.unref();
      Object.assign(pending, {
        command,
        bridgeId: assignment.bridgeId,
        assignmentId: assignment.id,
        staffUserId: input.staffUserId,
        endpointId: input.endpointId,
        resolve,
        reject,
        timeout,
      });
      pendingByBridge.set(assignment.bridgeId, pending);
    });
  }

  async function poll(authentication: BridgeAuthentication) {
    await markSeen(authentication.bridgeId);
    const assignment = assignmentsByBridge.get(authentication.bridgeId);
    if (assignment?.state === "quarantined") {
      const key = keys[authentication.bridgeId];
      if (!key) return null;
      return {
        schemaVersion: 1,
        commandId: assignment.id,
        commandType: "reset",
        endpointId: key.endpointId,
        expectedExtension: "0000",
        expectedLineLast4: "0000",
        expiresAt: new Date(now().getTime() + 5 * 60_000).toISOString(),
      } satisfies CentrexBridgeResetCommand;
    }
    const pending = pendingByBridge.get(authentication.bridgeId);
    if (!pending) return null;
    if (new Date(pending.command.expiresAt).getTime() <= now().getTime()) {
      await finishFailure(
        pending,
        "provision_timeout",
        "bridge_provisioning_timeout",
      );
      return null;
    }
    return pending.command;
  }

  async function complete(
    commandId: string,
    result: CentrexBridgeCommandResult,
    authentication: BridgeAuthentication,
  ) {
    const replay = completedCommands.get(commandId);
    if (replay?.bridgeId === authentication.bridgeId) {
      return { ...replay, replayed: true };
    }
    const maintenance = assignmentsByBridge.get(authentication.bridgeId);
    if (
      maintenance?.state === "quarantined" &&
      maintenance.id === commandId
    ) {
      const completedAt = now();
      if (result.status === "failed") {
        await db
          .update(staffTelephonyBridgeAssignments)
          .set({
            lastLoginFailedAt: completedAt,
            lastResultCode: result.resultCode,
            updatedAt: completedAt,
          })
          .where(eq(staffTelephonyBridgeAssignments.id, maintenance.id));
      } else {
        await db
          .update(staffTelephonyBridgeAssignments)
          .set({
            currentEndpointId: null,
            state: "idle",
            lastLoginSucceededAt: null,
            lastLoginFailedAt: null,
            lastResultCode: result.resultCode,
            updatedAt: completedAt,
          })
          .where(eq(staffTelephonyBridgeAssignments.id, maintenance.id));
      }
      await reloadAssignments();
      completedCommands.set(commandId, {
        bridgeId: authentication.bridgeId,
        expiresAt: completedAt.getTime() + 5 * 60_000,
        status: result.status,
        resultCode: result.resultCode,
      });
      return {
        status: result.status,
        resultCode: result.resultCode,
        replayed: false,
      };
    }
    const pending = pendingByBridge.get(authentication.bridgeId);
    if (!pending || pending.command.commandId !== commandId) {
      throw new CentrexBridgeProvisioningError(
        "bridge_provisioning_failed",
        "처리 중인 Windows bridge 회선 변경 명령이 아닙니다.",
      );
    }
    if (result.status === "failed") {
      await finishFailure(
        pending,
        result.resultCode,
        "bridge_provisioning_failed",
      );
      return {
        status: "failed" as const,
        resultCode: result.resultCode,
        replayed: false,
      };
    }

    clearTimeout(pending.timeout);
    pendingByBridge.delete(authentication.bridgeId);
    const succeededAt = now();
    await db
      .update(staffTelephonyBridgeAssignments)
      .set({
        currentEndpointId: pending.endpointId,
        pendingEndpointId: null,
        state: "connected",
        provisioningCommandId: null,
        provisioningExpiresAt: null,
        lastLoginSucceededAt: succeededAt,
        lastLoginFailedAt: null,
        lastResultCode: result.resultCode,
        updatedAt: succeededAt,
      })
      .where(eq(staffTelephonyBridgeAssignments.id, pending.assignmentId));
    await reloadAssignments();
    const completed = {
      bridgeId: authentication.bridgeId,
      endpointId: pending.endpointId,
      resultCode: result.resultCode,
    };
    completedCommands.set(commandId, {
      bridgeId: authentication.bridgeId,
      expiresAt: succeededAt.getTime() + 5 * 60_000,
      status: "succeeded",
      resultCode: result.resultCode,
    });
    pending.resolve(completed);
    return {
      status: "succeeded" as const,
      resultCode: result.resultCode,
      replayed: false,
    };
  }

  function stop() {
    for (const pending of pendingByBridge.values()) {
      clearTimeout(pending.timeout);
      pending.reject(
        new CentrexBridgeProvisioningError(
          "bridge_unavailable",
          "gateway가 종료되어 Windows bridge 연결을 완료하지 못했습니다.",
        ),
      );
    }
    pendingByBridge.clear();
  }

  function handlesCommand(commandId: string, bridgeId: string) {
    const maintenance = assignmentsByBridge.get(bridgeId);
    if (
      maintenance?.state === "quarantined" &&
      maintenance.id === commandId
    ) {
      return true;
    }
    const pending = pendingByBridge.get(bridgeId);
    if (pending?.command.commandId === commandId) return true;
    const completed = completedCommands.get(commandId);
    return completed?.bridgeId === bridgeId;
  }

  return {
    start,
    stop,
    assignmentForStaff,
    ensureAssignmentForStaff,
    prepareReassignmentForStaff,
    releaseNewAssignment,
    isReadyForTelephony,
    resolveAuthentication,
    provision,
    poll,
    complete,
    handlesCommand,
  };
}

export type CentrexBridgeProvisioningService = ReturnType<
  typeof createCentrexBridgeProvisioningService
>;
