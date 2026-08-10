import { hostname } from "node:os";

import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
} from "drizzle-orm";

import { createEventId, telephonyCallRequestedEventSchema } from "@lawand/core";
import {
  consultationRequests,
  outboxDeliveryAttempts,
  outboxEvents,
  telephonyCalls,
  telephonyEndpoints,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { CentrexClient } from "./centrex.js";
import { CentrexDeliveryError } from "./centrex.js";
import type { CentrexCredentialVault } from "./centrex-credential-vault.js";
import {
  matchCentrexCallHistory,
  type CentrexReconciliationMatch,
} from "./centrex-reconciliation.js";
import type { DataProtection } from "./crypto.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const EVENT_TYPE = "telephony.call.requested" as const;
const LEASE_TIMEOUT_MS = 2 * 60 * 1_000;

type ClaimedEvent = {
  id: string;
  callId: string;
  payload: unknown;
  attemptId: string;
  attemptNumber: number;
};

type DeliveryFailure = {
  code: string;
  message: string;
  commandStatus: "failed" | "unknown";
  httpStatus?: number;
};

class CentrexWorkerConfigurationError extends Error {
  constructor(readonly code: "credential_not_configured", message: string) {
    super(message);
  }
}

function deliveryFailure(error: unknown): DeliveryFailure {
  if (error instanceof CentrexDeliveryError) {
    return {
      code: error.code,
      message: error.message,
      commandStatus: error.options.commandStatus,
      ...(error.options.httpStatus
        ? { httpStatus: error.options.httpStatus }
        : {}),
    };
  }
  if (error instanceof CentrexWorkerConfigurationError) {
    return {
      code: error.code,
      message: error.message,
      commandStatus: "failed",
    };
  }
  return {
    code: "invalid_stored_data",
    message: "저장된 센트릭스 발신 정보를 확인하지 못했습니다.",
    commandStatus: "failed",
  };
}

export function createCentrexWorker(options: {
  db: Database;
  protection: DataProtection;
  centrexClient: CentrexClient;
  credentialVault: CentrexCredentialVault;
  workerId?: string;
  minimumCommandGapMs?: number;
  now?: () => Date;
}) {
  const {
    db,
    protection,
    centrexClient,
    credentialVault,
    workerId = `${hostname()}:${process.pid}:centrex`,
    minimumCommandGapMs = 3_000,
    now = () => new Date(),
  } = options;
  let stopped = true;
  let timer: NodeJS.Timeout | undefined;
  let currentRun: Promise<void> | undefined;

  async function recoverExpiredLeases(currentTime: Date): Promise<number> {
    return db.transaction(async (tx) => {
      const expired = await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.eventType, EVENT_TYPE),
            eq(outboxEvents.status, "pending"),
            lt(
              outboxEvents.lockedAt,
              new Date(currentTime.getTime() - LEASE_TIMEOUT_MS),
            ),
          ),
        )
        .for("update", { skipLocked: true });
      if (expired.length === 0) return 0;
      const ids = expired.map((event) => event.id);
      const message =
        "이전 클릭투콜 작업이 응답 기록 전에 중단됐습니다. 전화기 상태를 확인해 주세요.";
      await tx
        .update(outboxEvents)
        .set({
          status: "dead",
          lockedAt: null,
          lockedBy: null,
          lastError: message,
        })
        .where(inArray(outboxEvents.id, ids));
      await tx
        .update(outboxDeliveryAttempts)
        .set({
          status: "dead",
          errorCode: "ambiguous_previous_attempt",
          errorMessage: message,
          finishedAt: currentTime,
        })
        .where(
          and(
            inArray(outboxDeliveryAttempts.outboxEventId, ids),
            eq(outboxDeliveryAttempts.status, "started"),
          ),
        );
      await tx
        .update(telephonyCalls)
        .set({
          commandStatus: "unknown",
          lastErrorCode: "ambiguous_previous_attempt",
          lastErrorMessage: message,
          updatedAt: currentTime,
        })
        .where(inArray(telephonyCalls.outboxEventId, ids));
      return expired.length;
    });
  }

  async function claimNext(currentTime: Date): Promise<ClaimedEvent | null> {
    return db.transaction(async (tx) => {
      const [event] = await tx
        .select({
          id: outboxEvents.id,
          aggregateId: outboxEvents.aggregateId,
          payload: outboxEvents.payload,
          attempts: outboxEvents.attempts,
        })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.eventType, EVENT_TYPE),
            eq(outboxEvents.status, "pending"),
            isNull(outboxEvents.lockedAt),
            lte(outboxEvents.availableAt, currentTime),
          ),
        )
        .orderBy(asc(outboxEvents.availableAt), asc(outboxEvents.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!event) return null;
      const attemptNumber = event.attempts + 1;
      const attemptId = createEventId();
      await tx
        .update(outboxEvents)
        .set({
          attempts: attemptNumber,
          lockedAt: currentTime,
          lockedBy: workerId,
          lastError: null,
        })
        .where(eq(outboxEvents.id, event.id));
      await tx
        .update(telephonyCalls)
        .set({
          commandStatus: "dispatching",
          dispatchedAt: currentTime,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: currentTime,
        })
        .where(eq(telephonyCalls.id, event.aggregateId));
      await tx.insert(outboxDeliveryAttempts).values({
        id: attemptId,
        outboxEventId: event.id,
        attemptNumber,
        workerId,
        status: "started",
        startedAt: currentTime,
        createdAt: currentTime,
      });
      return {
        id: event.id,
        callId: event.aggregateId,
        payload: event.payload,
        attemptId,
        attemptNumber,
      };
    });
  }

  async function prepareCommand(event: ClaimedEvent) {
    const envelope = telephonyCallRequestedEventSchema.parse(event.payload);
    if (envelope.data.callId !== event.callId) {
      throw new Error("telephony_call_event_mismatch");
    }
    const [row] = await db
      .select({
        callId: telephonyCalls.id,
        requestId: telephonyCalls.consultationRequestId,
        endpointId: telephonyCalls.endpointId,
        apiLoginId: telephonyEndpoints.apiLoginId,
        credentialKey: telephonyEndpoints.credentialKey,
        phoneCiphertext: consultationRequests.phoneCiphertext,
        phoneNonce: consultationRequests.phoneNonce,
        phoneKeyVersion: consultationRequests.phoneKeyVersion,
      })
      .from(telephonyCalls)
      .innerJoin(
        telephonyEndpoints,
        and(
          eq(telephonyEndpoints.id, telephonyCalls.endpointId),
          eq(telephonyEndpoints.isActive, true),
          eq(telephonyEndpoints.provider, "centrex"),
        ),
      )
      .innerJoin(
        consultationRequests,
        eq(consultationRequests.id, telephonyCalls.consultationRequestId),
      )
      .where(eq(telephonyCalls.id, event.callId))
      .limit(1);
    if (
      !row ||
      row.requestId !== envelope.data.requestId ||
      row.endpointId !== envelope.data.endpointId ||
      !row.phoneCiphertext ||
      !row.phoneNonce ||
      !row.phoneKeyVersion
    ) {
      throw new Error("telephony_call_reference_not_found");
    }
    const passwordSha512 = await credentialVault.get({
      endpointId: row.endpointId,
      credentialKey: row.credentialKey,
    });
    if (!passwordSha512) {
      throw new CentrexWorkerConfigurationError(
        "credential_not_configured",
        "센트릭스 회선 자격증명이 운영 비밀 설정에 없습니다.",
      );
    }
    const destination = protection.decrypt(
      {
        ciphertext: row.phoneCiphertext,
        nonce: row.phoneNonce,
        keyVersion: row.phoneKeyVersion,
      },
      `consultation_requests.phone:${row.requestId}`,
    );
    return {
      endpointId: row.endpointId,
      apiLoginId: row.apiLoginId,
      passwordSha512,
      destination,
    };
  }

  async function markSucceeded(
    event: ClaimedEvent,
    currentTime: Date,
    httpStatus: number,
  ) {
    await db.transaction(async (tx) => {
      await tx
        .update(outboxEvents)
        .set({
          status: "published",
          lockedAt: null,
          lockedBy: null,
          publishedAt: currentTime,
          lastError: null,
        })
        .where(
          and(
            eq(outboxEvents.id, event.id),
            eq(outboxEvents.status, "pending"),
            eq(outboxEvents.lockedBy, workerId),
          ),
        );
      await tx
        .update(outboxDeliveryAttempts)
        .set({ status: "succeeded", httpStatus, finishedAt: currentTime })
        .where(eq(outboxDeliveryAttempts.id, event.attemptId));
      await tx
        .update(telephonyCalls)
        .set({
          commandStatus: "succeeded",
          providerRespondedAt: currentTime,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: currentTime,
        })
        .where(eq(telephonyCalls.id, event.callId));
    });
  }

  async function markFailed(
    event: ClaimedEvent,
    currentTime: Date,
    failure: DeliveryFailure,
  ) {
    await db.transaction(async (tx) => {
      await tx
        .update(outboxEvents)
        .set({
          status: "dead",
          availableAt: currentTime,
          lockedAt: null,
          lockedBy: null,
          lastError: failure.message,
        })
        .where(
          and(
            eq(outboxEvents.id, event.id),
            eq(outboxEvents.status, "pending"),
            eq(outboxEvents.lockedBy, workerId),
          ),
        );
      await tx
        .update(outboxDeliveryAttempts)
        .set({
          status: "dead",
          httpStatus: failure.httpStatus ?? null,
          errorCode: failure.code,
          errorMessage: failure.message,
          finishedAt: currentTime,
        })
        .where(eq(outboxDeliveryAttempts.id, event.attemptId));
      await tx
        .update(telephonyCalls)
        .set({
          commandStatus: failure.commandStatus,
          providerRespondedAt: failure.httpStatus ? currentTime : null,
          lastErrorCode: failure.code,
          lastErrorMessage: failure.message,
          updatedAt: currentTime,
        })
        .where(eq(telephonyCalls.id, event.callId));
    });
  }

  async function runOnce(): Promise<boolean> {
    const currentTime = now();
    await recoverExpiredLeases(currentTime);
    const event = await claimNext(currentTime);
    if (!event) return false;
    let endpointId: string | undefined;
    try {
      const command = await prepareCommand(event);
      endpointId = command.endpointId;
      const result = await centrexClient.clickDial(command);
      const finishedAt = now();
      await markSucceeded(event, finishedAt, result.httpStatus);
      await db
        .update(telephonyEndpoints)
        .set({ lastAuthSucceededAt: finishedAt, updatedAt: finishedAt })
        .where(eq(telephonyEndpoints.id, command.endpointId));
      console.log(
        JSON.stringify({
          event: "centrex_clickdial_succeeded",
          callId: event.callId,
          attempt: event.attemptNumber,
          occurredAt: finishedAt.toISOString(),
        }),
      );
    } catch (error) {
      const failure = deliveryFailure(error);
      const finishedAt = now();
      await markFailed(event, finishedAt, failure);
      if (endpointId && failure.code === "authentication_failed") {
        await db
          .update(telephonyEndpoints)
          .set({ lastAuthFailedAt: finishedAt, updatedAt: finishedAt })
          .where(eq(telephonyEndpoints.id, endpointId));
      }
      console.warn(
        JSON.stringify({
          event: "centrex_clickdial_failed",
          callId: event.callId,
          attempt: event.attemptNumber,
          errorCode: failure.code,
          occurredAt: finishedAt.toISOString(),
        }),
      );
    }
    return true;
  }

  async function reconcileOnce(): Promise<boolean> {
    const currentTime = now();
    const [call] = await db
      .select({
        id: telephonyCalls.id,
        endpointId: telephonyCalls.endpointId,
        requestId: telephonyCalls.consultationRequestId,
        requestedAt: telephonyCalls.requestedAt,
        apiLoginId: telephonyEndpoints.apiLoginId,
        credentialKey: telephonyEndpoints.credentialKey,
        phoneCiphertext: consultationRequests.phoneCiphertext,
        phoneNonce: consultationRequests.phoneNonce,
        phoneKeyVersion: consultationRequests.phoneKeyVersion,
      })
      .from(telephonyCalls)
      .innerJoin(
        telephonyEndpoints,
        and(
          eq(telephonyEndpoints.id, telephonyCalls.endpointId),
          eq(telephonyEndpoints.isActive, true),
          eq(telephonyEndpoints.provider, "centrex"),
        ),
      )
      .innerJoin(
        consultationRequests,
        eq(consultationRequests.id, telephonyCalls.consultationRequestId),
      )
      .where(
        and(
          eq(telephonyCalls.commandStatus, "succeeded"),
          isNull(telephonyCalls.reconciledAt),
          isNotNull(telephonyCalls.providerRespondedAt),
        ),
      )
      .orderBy(asc(telephonyCalls.requestedAt))
      .limit(1);
    if (!call) return false;
    if (
      !call.phoneCiphertext ||
      !call.phoneNonce ||
      !call.phoneKeyVersion
    ) {
      console.warn(
        JSON.stringify({
          event: "centrex_call_history_reconciliation_failed",
          callId: call.id,
          errorCode: "telephony_phone_reference_not_found",
          occurredAt: currentTime.toISOString(),
        }),
      );
      return true;
    }
    const passwordSha512 = await credentialVault.get({
      endpointId: call.endpointId,
      credentialKey: call.credentialKey,
    });
    if (!passwordSha512) {
      console.warn(
        JSON.stringify({
          event: "centrex_call_history_reconciliation_failed",
          callId: call.id,
          errorCode: "credential_not_configured",
          occurredAt: currentTime.toISOString(),
        }),
      );
      return true;
    }
    const destination = protection.decrypt(
      {
        ciphertext: call.phoneCiphertext,
        nonce: call.phoneNonce,
        keyVersion: call.phoneKeyVersion,
      },
      `consultation_requests.phone:${call.requestId}`,
    );
    const usedRows = await db
      .select({ providerStartedAt: telephonyCalls.providerStartedAt })
      .from(telephonyCalls)
      .where(
        and(
          eq(telephonyCalls.endpointId, call.endpointId),
          isNotNull(telephonyCalls.providerStartedAt),
        ),
      );
    const usedStartedAt = new Set(
      usedRows.flatMap((row) =>
        row.providerStartedAt ? [row.providerStartedAt.toISOString()] : [],
      ),
    );
    let match: CentrexReconciliationMatch | null = null;
    try {
      for (let page = 1; page <= 3 && !match; page += 1) {
        const history = await centrexClient.getCallHistory({
          apiLoginId: call.apiLoginId,
          passwordSha512,
          page,
        });
        match = matchCentrexCallHistory({
          records: history.records,
          destination,
          requestedAt: call.requestedAt,
          currentTime,
          usedStartedAt,
        });
        if (history.records.length < 10) break;
      }
    } catch (error) {
      const failure = deliveryFailure(error);
      console.warn(
        JSON.stringify({
          event: "centrex_call_history_reconciliation_failed",
          callId: call.id,
          errorCode: failure.code,
          occurredAt: currentTime.toISOString(),
        }),
      );
      return true;
    }
    if (!match) return true;
    const [reconciled] = await db
      .update(telephonyCalls)
      .set({
        outcome: match.outcome,
        providerStatus: match.record.status,
        providerStartedAt: match.startedAt,
        providerEndedAt: match.endedAt,
        providerDurationSeconds: match.record.durationSeconds,
        providerBillableSeconds: match.record.billableSeconds,
        reconciledAt: currentTime,
        updatedAt: currentTime,
      })
      .where(
        and(
          eq(telephonyCalls.id, call.id),
          isNull(telephonyCalls.reconciledAt),
        ),
      )
      .returning({ id: telephonyCalls.id });
    if (reconciled) {
      console.log(
        JSON.stringify({
          event: "centrex_call_history_reconciled",
          callId: call.id,
          outcome: match.outcome,
          providerStatus: match.record.status,
          occurredAt: currentTime.toISOString(),
        }),
      );
    }
    return true;
  }

  async function runCycle(): Promise<void> {
    await runOnce();
    await reconcileOnce();
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      currentRun = runCycle()
        .catch((error) => console.error("centrex worker loop failed", error))
        .finally(() => {
          currentRun = undefined;
          schedule();
        });
    }, minimumCommandGapMs);
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    currentRun = runCycle()
      .catch((error) => console.error("centrex worker initial run failed", error))
      .finally(() => {
        currentRun = undefined;
        schedule();
      });
  }

  async function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    await currentRun;
  }

  return { reconcileOnce, runOnce, start, stop };
}

export type CentrexWorker = ReturnType<typeof createCentrexWorker>;
