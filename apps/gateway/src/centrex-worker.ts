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

import {
  createEventId,
  telephonyCallRequestedEventSchema,
  telephonyMessageRequestedEventSchema,
} from "@lawand/core";
import {
  consultationRequests,
  outboxDeliveryAttempts,
  outboxEvents,
  telephonyCallDirectoryTargets,
  telephonyCalls,
  telephonyEndpoints,
  telephonyMessageDirectoryTargets,
  telephonyMessageManualContacts,
  telephonyMessages,
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
import {
  createSolapiMmsMessage,
  SolapiDeliveryError,
  type SolapiClient,
} from "./solapi.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const EVENT_TYPE = "telephony.call.requested" as const;
const MESSAGE_EVENT_TYPE = "telephony.message.requested" as const;
const LEASE_TIMEOUT_MS = 2 * 60 * 1_000;

type ClaimedEvent = {
  id: string;
  callId: string;
  payload: unknown;
  attemptId: string;
  attemptNumber: number;
};

type ClaimedMessageEvent = ClaimedEvent & {
  messageId: string;
};

type DeliveryFailure = {
  code: string;
  message: string;
  commandStatus: "failed" | "unknown";
  httpStatus?: number;
};

class CentrexWorkerConfigurationError extends Error {
  constructor(
    readonly code: "credential_not_configured" | "mms_not_configured",
    message: string,
  ) {
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
  if (error instanceof SolapiDeliveryError) {
    return {
      code: error.code,
      message: error.message,
      commandStatus: error.code === "ambiguous_delivery" ? "unknown" : "failed",
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
  solapiClient?: SolapiClient | null;
  solapiMmsSender?: string | null;
  workerId?: string;
  minimumCommandGapMs?: number;
  now?: () => Date;
}) {
  const {
    db,
    protection,
    centrexClient,
    credentialVault,
    solapiClient = null,
    solapiMmsSender = null,
    workerId = `${hostname()}:${process.pid}:centrex`,
    minimumCommandGapMs = 3_000,
    now = () => new Date(),
  } = options;
  let stopped = true;
  let timer: NodeJS.Timeout | undefined;
  let currentRun: Promise<void> | undefined;
  let preferMessages = false;

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

  async function recoverExpiredMessageLeases(
    currentTime: Date,
  ): Promise<number> {
    return db.transaction(async (tx) => {
      const expired = await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.eventType, MESSAGE_EVENT_TYPE),
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
        "이전 문자 작업이 응답 기록 전에 중단됐습니다. 제공자 발송 내역을 확인해 주세요.";
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
        .update(telephonyMessages)
        .set({
          commandStatus: "unknown",
          lastErrorCode: "ambiguous_previous_attempt",
          lastErrorMessage: message,
          updatedAt: currentTime,
        })
        .where(inArray(telephonyMessages.outboxEventId, ids));
      return expired.length;
    });
  }

  async function claimNextMessage(
    currentTime: Date,
  ): Promise<ClaimedMessageEvent | null> {
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
            eq(outboxEvents.eventType, MESSAGE_EVENT_TYPE),
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
        .update(telephonyMessages)
        .set({
          commandStatus: "dispatching",
          dispatchedAt: currentTime,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: currentTime,
        })
        .where(eq(telephonyMessages.id, event.aggregateId));
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
        messageId: event.aggregateId,
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
        targetSource: telephonyCalls.targetSource,
        requestId: telephonyCalls.consultationRequestId,
        endpointId: telephonyCalls.endpointId,
        apiLoginId: telephonyEndpoints.apiLoginId,
        credentialKey: telephonyEndpoints.credentialKey,
        consultationPhoneCiphertext: consultationRequests.phoneCiphertext,
        consultationPhoneNonce: consultationRequests.phoneNonce,
        consultationPhoneKeyVersion: consultationRequests.phoneKeyVersion,
        directoryClientIdx: telephonyCallDirectoryTargets.clientIdx,
        directoryCaseIdx: telephonyCallDirectoryTargets.caseIdx,
        directoryPhoneCiphertext: telephonyCallDirectoryTargets.phoneCiphertext,
        directoryPhoneNonce: telephonyCallDirectoryTargets.phoneNonce,
        directoryPhoneKeyVersion: telephonyCallDirectoryTargets.phoneKeyVersion,
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
      .leftJoin(
        consultationRequests,
        eq(consultationRequests.id, telephonyCalls.consultationRequestId),
      )
      .leftJoin(
        telephonyCallDirectoryTargets,
        eq(telephonyCallDirectoryTargets.telephonyCallId, telephonyCalls.id),
      )
      .where(eq(telephonyCalls.id, event.callId))
      .limit(1);
    if (!row || row.endpointId !== envelope.data.endpointId) {
      throw new Error("telephony_call_reference_not_found");
    }
    let directoryEvent = false;
    let referenceMatches = false;
    let phoneCiphertext: Buffer | null = null;
    let phoneNonce: Buffer | null = null;
    let phoneKeyVersion: string | null = null;
    if (
      "targetSource" in envelope.data &&
      envelope.data.targetSource === "legal_friends_directory"
    ) {
      directoryEvent = true;
      referenceMatches =
        row.targetSource === "legal_friends_directory" &&
        row.directoryClientIdx === envelope.data.directoryClientIdx &&
        row.directoryCaseIdx === envelope.data.directoryCaseIdx;
      phoneCiphertext = row.directoryPhoneCiphertext;
      phoneNonce = row.directoryPhoneNonce;
      phoneKeyVersion = row.directoryPhoneKeyVersion;
    } else {
      referenceMatches =
        row.targetSource === "consultation" &&
        row.requestId === envelope.data.requestId;
      phoneCiphertext = row.consultationPhoneCiphertext;
      phoneNonce = row.consultationPhoneNonce;
      phoneKeyVersion = row.consultationPhoneKeyVersion;
    }
    if (!referenceMatches || !phoneCiphertext || !phoneNonce || !phoneKeyVersion) {
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
        ciphertext: phoneCiphertext,
        nonce: phoneNonce,
        keyVersion: phoneKeyVersion,
      },
      directoryEvent
        ? `telephony_call_directory_targets/${row.callId}/phone`
        : `consultation_requests.phone:${row.requestId}`,
    );
    return {
      endpointId: row.endpointId,
      apiLoginId: row.apiLoginId,
      passwordSha512,
      destination,
    };
  }

  async function prepareMessageCommand(event: ClaimedMessageEvent) {
    const envelope = telephonyMessageRequestedEventSchema.parse(event.payload);
    if (envelope.data.messageId !== event.messageId) {
      throw new Error("telephony_message_event_mismatch");
    }
    const [row] = await db
      .select({
        messageId: telephonyMessages.id,
        provider: telephonyMessages.provider,
        targetSource: telephonyMessages.targetSource,
        requestId: telephonyMessages.consultationRequestId,
        endpointId: telephonyMessages.endpointId,
        bodyCiphertext: telephonyMessages.bodyCiphertext,
        bodyNonce: telephonyMessages.bodyNonce,
        bodyKeyVersion: telephonyMessages.bodyKeyVersion,
        imageFileId: telephonyMessages.imageFileIdSnapshot,
        remotePhoneFingerprint: telephonyMessages.remotePhoneFingerprint,
        apiLoginId: telephonyEndpoints.apiLoginId,
        credentialKey: telephonyEndpoints.credentialKey,
        phoneCiphertext: consultationRequests.phoneCiphertext,
        phoneNonce: consultationRequests.phoneNonce,
        phoneKeyVersion: consultationRequests.phoneKeyVersion,
        requestPhoneFingerprint: consultationRequests.phoneFingerprint,
        directoryClientIdx: telephonyMessageDirectoryTargets.clientIdx,
        directoryCaseIdx: telephonyMessageDirectoryTargets.caseIdx,
        directoryPhoneCiphertext:
          telephonyMessageDirectoryTargets.phoneCiphertext,
        directoryPhoneNonce: telephonyMessageDirectoryTargets.phoneNonce,
        directoryPhoneKeyVersion:
          telephonyMessageDirectoryTargets.phoneKeyVersion,
        manualContactId: telephonyMessages.manualContactId,
        manualPhoneCiphertext:
          telephonyMessageManualContacts.phoneCiphertext,
        manualPhoneNonce: telephonyMessageManualContacts.phoneNonce,
        manualPhoneKeyVersion: telephonyMessageManualContacts.phoneKeyVersion,
      })
      .from(telephonyMessages)
      .innerJoin(
        telephonyEndpoints,
        and(
          eq(telephonyEndpoints.id, telephonyMessages.endpointId),
          eq(telephonyEndpoints.isActive, true),
          eq(telephonyEndpoints.provider, "centrex"),
        ),
      )
      .leftJoin(
        consultationRequests,
        eq(
          consultationRequests.id,
          telephonyMessages.consultationRequestId,
        ),
      )
      .leftJoin(
        telephonyMessageDirectoryTargets,
        eq(
          telephonyMessageDirectoryTargets.telephonyMessageId,
          telephonyMessages.id,
        ),
      )
      .leftJoin(
        telephonyMessageManualContacts,
        eq(
          telephonyMessageManualContacts.id,
          telephonyMessages.manualContactId,
        ),
      )
      .where(eq(telephonyMessages.id, event.messageId))
      .limit(1);
    if (!row || row.endpointId !== envelope.data.endpointId) {
      throw new Error("telephony_message_reference_not_found");
    }
    if (row.provider !== envelope.data.provider) {
      throw new Error("telephony_message_provider_mismatch");
    }
    let directoryEvent = false;
    let referenceMatches = false;
    let phoneCiphertext: Buffer | null = null;
    let phoneNonce: Buffer | null = null;
    let phoneKeyVersion: string | null = null;
    let phoneContext = "";
    if (
      "targetSource" in envelope.data &&
      envelope.data.targetSource === "legal_friends_directory"
    ) {
      directoryEvent = true;
      referenceMatches =
        row.targetSource === "legal_friends_directory" &&
        row.directoryClientIdx === envelope.data.directoryClientIdx &&
        row.directoryCaseIdx === envelope.data.directoryCaseIdx;
      phoneCiphertext = row.directoryPhoneCiphertext;
      phoneNonce = row.directoryPhoneNonce;
      phoneKeyVersion = row.directoryPhoneKeyVersion;
      phoneContext = `telephony_message_directory_targets/${row.messageId}/phone`;
    } else if (
      "targetSource" in envelope.data &&
      envelope.data.targetSource === "manual"
    ) {
      referenceMatches =
        row.targetSource === "manual" &&
        row.manualContactId === envelope.data.manualContactId;
      phoneCiphertext = row.manualPhoneCiphertext;
      phoneNonce = row.manualPhoneNonce;
      phoneKeyVersion = row.manualPhoneKeyVersion;
      phoneContext = `telephony_message_manual_contacts/${envelope.data.manualContactId}/phone`;
    } else {
      const requestPhoneFingerprint = row.requestPhoneFingerprint;
      referenceMatches =
        row.targetSource === "consultation" &&
        row.requestId === envelope.data.requestId &&
        requestPhoneFingerprint !== null &&
        row.remotePhoneFingerprint.equals(requestPhoneFingerprint);
      phoneCiphertext = row.phoneCiphertext;
      phoneNonce = row.phoneNonce;
      phoneKeyVersion = row.phoneKeyVersion;
      phoneContext = `consultation_requests.phone:${row.requestId}`;
    }
    if (!referenceMatches || !phoneCiphertext || !phoneNonce || !phoneKeyVersion) {
      throw new Error("telephony_message_reference_not_found");
    }
    const destination = protection.decrypt(
      {
        ciphertext: phoneCiphertext,
        nonce: phoneNonce,
        keyVersion: phoneKeyVersion,
      },
      phoneContext,
    );
    if (
      (directoryEvent || row.targetSource === "manual") &&
      !row.remotePhoneFingerprint.equals(protection.fingerprint(destination))
    ) {
      throw new Error("telephony_message_reference_not_found");
    }
    const common = {
      endpointId: row.endpointId,
      destination,
      message: protection.decrypt(
        {
          ciphertext: row.bodyCiphertext,
          nonce: row.bodyNonce,
          keyVersion: row.bodyKeyVersion,
        },
        `telephony_messages/${row.messageId}/body`,
      ),
    };
    if (row.provider === "solapi") {
      if (!row.imageFileId) {
        throw new Error("telephony_message_image_not_found");
      }
      return {
        ...common,
        provider: "solapi" as const,
        imageFileId: row.imageFileId,
      };
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
    return {
      ...common,
      provider: "centrex" as const,
      apiLoginId: row.apiLoginId,
      passwordSha512,
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

  async function markMessageSucceeded(
    event: ClaimedMessageEvent,
    currentTime: Date,
    result: {
      httpStatus: number;
      providerCode: string;
      remainingCount: number | null;
    },
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
        .set({
          status: "succeeded",
          httpStatus: result.httpStatus,
          finishedAt: currentTime,
        })
        .where(eq(outboxDeliveryAttempts.id, event.attemptId));
      await tx
        .update(telephonyMessages)
        .set({
          commandStatus: "succeeded",
          providerRespondedAt: currentTime,
          providerCode: result.providerCode,
          providerRemainingCount: result.remainingCount,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: currentTime,
        })
        .where(eq(telephonyMessages.id, event.messageId));
    });
  }

  async function markMessageFailed(
    event: ClaimedMessageEvent,
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
        .update(telephonyMessages)
        .set({
          commandStatus: failure.commandStatus,
          providerRespondedAt: failure.httpStatus ? currentTime : null,
          lastErrorCode: failure.code,
          lastErrorMessage: failure.message,
          updatedAt: currentTime,
        })
        .where(eq(telephonyMessages.id, event.messageId));
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

  async function runMessageOnce(): Promise<boolean> {
    const currentTime = now();
    await recoverExpiredMessageLeases(currentTime);
    const event = await claimNextMessage(currentTime);
    if (!event) return false;
    let endpointId: string | undefined;
    let commandProvider: "centrex" | "solapi" | undefined;
    try {
      const command = await prepareMessageCommand(event);
      endpointId = command.endpointId;
      commandProvider = command.provider;
      if (command.provider === "centrex") {
        const result = await centrexClient.sendMessage(command);
        const respondedAt = now();
        await markMessageSucceeded(event, respondedAt, result);
        await db
          .update(telephonyEndpoints)
          .set({ lastAuthSucceededAt: respondedAt, updatedAt: respondedAt })
          .where(eq(telephonyEndpoints.id, command.endpointId));
        console.log(
          JSON.stringify({
            event: "telephony_message_succeeded",
            provider: command.provider,
            messageId: event.messageId,
            attempt: event.attemptNumber,
            remainingCount: result.remainingCount,
            occurredAt: respondedAt.toISOString(),
          }),
        );
        return true;
      }
      if (!solapiClient || !solapiMmsSender) {
        throw new CentrexWorkerConfigurationError(
          "mms_not_configured",
          "솔라피 MMS 발신 설정이 없습니다.",
        );
      }
      const result = await solapiClient.sendMms(
        createSolapiMmsMessage({
          to: command.destination,
          from: solapiMmsSender,
          text: command.message,
          imageId: command.imageFileId,
          messageId: event.messageId,
        }),
      );
      const respondedAt = now();
      await markMessageSucceeded(event, respondedAt, {
        httpStatus: result.httpStatus,
        providerCode: result.statusCode,
        remainingCount: null,
      });
      console.log(
        JSON.stringify({
          event: "telephony_message_succeeded",
          provider: command.provider,
          messageId: event.messageId,
          attempt: event.attemptNumber,
          remainingCount: null,
          occurredAt: respondedAt.toISOString(),
        }),
      );
    } catch (error) {
      const failure = deliveryFailure(error);
      const finishedAt = now();
      await markMessageFailed(event, finishedAt, failure);
      if (
        endpointId &&
        commandProvider === "centrex" &&
        failure.code === "authentication_failed"
      ) {
        await db
          .update(telephonyEndpoints)
          .set({ lastAuthFailedAt: finishedAt, updatedAt: finishedAt })
          .where(eq(telephonyEndpoints.id, endpointId));
      }
      console.warn(
        JSON.stringify({
          event: "telephony_message_failed",
          messageId: event.messageId,
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
        targetSource: telephonyCalls.targetSource,
        endpointId: telephonyCalls.endpointId,
        requestId: telephonyCalls.consultationRequestId,
        requestedAt: telephonyCalls.requestedAt,
        apiLoginId: telephonyEndpoints.apiLoginId,
        credentialKey: telephonyEndpoints.credentialKey,
        consultationPhoneCiphertext: consultationRequests.phoneCiphertext,
        consultationPhoneNonce: consultationRequests.phoneNonce,
        consultationPhoneKeyVersion: consultationRequests.phoneKeyVersion,
        directoryPhoneCiphertext: telephonyCallDirectoryTargets.phoneCiphertext,
        directoryPhoneNonce: telephonyCallDirectoryTargets.phoneNonce,
        directoryPhoneKeyVersion: telephonyCallDirectoryTargets.phoneKeyVersion,
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
      .leftJoin(
        consultationRequests,
        eq(consultationRequests.id, telephonyCalls.consultationRequestId),
      )
      .leftJoin(
        telephonyCallDirectoryTargets,
        eq(telephonyCallDirectoryTargets.telephonyCallId, telephonyCalls.id),
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
    const phoneCiphertext = call.targetSource === "legal_friends_directory"
      ? call.directoryPhoneCiphertext
      : call.consultationPhoneCiphertext;
    const phoneNonce = call.targetSource === "legal_friends_directory"
      ? call.directoryPhoneNonce
      : call.consultationPhoneNonce;
    const phoneKeyVersion = call.targetSource === "legal_friends_directory"
      ? call.directoryPhoneKeyVersion
      : call.consultationPhoneKeyVersion;
    if (!phoneCiphertext || !phoneNonce || !phoneKeyVersion) {
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
        ciphertext: phoneCiphertext,
        nonce: phoneNonce,
        keyVersion: phoneKeyVersion,
      },
      call.targetSource === "legal_friends_directory"
        ? `telephony_call_directory_targets/${call.id}/phone`
        : `consultation_requests.phone:${call.requestId}`,
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
    let processed: boolean;
    if (preferMessages) {
      processed = await runMessageOnce();
      if (!processed) processed = await runOnce();
    } else {
      processed = await runOnce();
      if (!processed) processed = await runMessageOnce();
    }
    if (processed) preferMessages = !preferMessages;
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

  return { reconcileOnce, runMessageOnce, runOnce, start, stop };
}

export type CentrexWorker = ReturnType<typeof createCentrexWorker>;
