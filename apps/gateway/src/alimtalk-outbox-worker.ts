import { hostname } from "node:os";

import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
} from "drizzle-orm";

import {
  alimtalkAssignmentNotificationRequestedEventSchema,
  alimtalkRequestNotificationRequestedEventSchema,
  createEventId,
} from "@lawand/core";
import {
  alimtalkDeliveries,
  consultationAssignments,
  consultationRequests,
  consultations,
  outboxDeliveryAttempts,
  outboxEvents,
  staffProfiles,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";
import {
  createSolapiAlimtalkMessage,
  formatAlimtalkContactSchedule,
  formatAlimtalkTimestamp,
  type AlimtalkTemplatePurpose,
  type SolapiAlimtalkDelivery,
  type SolapiAlimtalkMessage,
  type SolapiClient,
  SolapiDeliveryError,
} from "./solapi.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const EVENT_TYPES = [
  "alimtalk.consultation.request_notification.requested",
  "alimtalk.consultation.assignment_notification.requested",
] as const;
const MAX_ATTEMPTS = 5;
const LEASE_TIMEOUT_MS = 2 * 60 * 1_000;
const RETRY_DELAYS_SECONDS = [30, 120, 600, 1_800, 3_600] as const;

type ClaimedEvent = {
  id: string;
  aggregateId: string;
  payload: unknown;
  attemptId: string;
  attemptNumber: number;
};

type DeliveryFailure = {
  code: string;
  message: string;
  retryable: boolean;
  httpStatus?: number;
  retryAfterSeconds?: number;
};

type PreparedDelivery = {
  consultationId: string;
  requestId: string;
  templatePurpose: AlimtalkTemplatePurpose;
  message: SolapiAlimtalkMessage;
};

function deliveryFailure(error: unknown): DeliveryFailure {
  if (error instanceof SolapiDeliveryError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.options.retryable,
      ...(error.options.httpStatus === undefined
        ? {}
        : { httpStatus: error.options.httpStatus }),
      ...(error.options.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.options.retryAfterSeconds }),
    };
  }
  return {
    code: "invalid_stored_data",
    message: "저장된 상담정보를 알림톡 형식으로 변환하지 못했습니다.",
    retryable: false,
  };
}

function nextAvailableAt(
  now: Date,
  attemptNumber: number,
  requestedDelaySeconds?: number,
): Date {
  const backoff =
    RETRY_DELAYS_SECONDS[
      Math.min(attemptNumber - 1, RETRY_DELAYS_SECONDS.length - 1)
    ] ?? RETRY_DELAYS_SECONDS[RETRY_DELAYS_SECONDS.length - 1]!;
  const delaySeconds = Math.min(
    Math.max(backoff, requestedDelaySeconds ?? 0),
    24 * 60 * 60,
  );
  return new Date(now.getTime() + delaySeconds * 1_000);
}

export function createAlimtalkOutboxWorker(options: {
  db: Database;
  protection: DataProtection;
  solapiClient: Pick<SolapiClient, "sendAlimtalk">;
  pfId: string;
  requestTemplateId: string;
  assignmentTemplateId: string;
  workerId?: string;
  pollIntervalMs?: number;
  now?: () => Date;
  targetEventIds?: readonly string[];
}) {
  const {
    db,
    protection,
    solapiClient,
    pfId,
    requestTemplateId,
    assignmentTemplateId,
    workerId = `${hostname()}:${process.pid}:alimtalk`,
    pollIntervalMs = 2_000,
    now = () => new Date(),
    targetEventIds,
  } = options;
  let stopped = true;
  let timer: NodeJS.Timeout | undefined;
  let currentRun: Promise<void> | undefined;

  function targetCondition() {
    return targetEventIds && targetEventIds.length > 0
      ? inArray(outboxEvents.id, [...targetEventIds])
      : undefined;
  }

  async function recoverExpiredLeases(currentTime: Date): Promise<number> {
    return db.transaction(async (tx) => {
      const expired = await tx
        .select({
          id: outboxEvents.id,
          attemptNumber: outboxEvents.attempts,
        })
        .from(outboxEvents)
        .where(
          and(
            inArray(outboxEvents.eventType, [...EVENT_TYPES]),
            eq(outboxEvents.status, "pending"),
            lt(
              outboxEvents.lockedAt,
              new Date(currentTime.getTime() - LEASE_TIMEOUT_MS),
            ),
            targetCondition(),
          ),
        )
        .for("update", { skipLocked: true });

      if (expired.length === 0) return 0;
      const ids = expired.map((event) => event.id);
      const message =
        "이전 알림톡 작업이 응답 기록 전에 중단됐습니다. 중복 발송 방지를 위해 솔라피 발송 내역을 확인해 주세요.";
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
            inArray(outboxEvents.eventType, [...EVENT_TYPES]),
            eq(outboxEvents.status, "pending"),
            isNull(outboxEvents.lockedAt),
            lte(outboxEvents.availableAt, currentTime),
            targetCondition(),
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
        aggregateId: event.aggregateId,
        payload: event.payload,
        attemptId,
        attemptNumber,
      };
    });
  }

  async function prepareDelivery(
    event: ClaimedEvent,
  ): Promise<PreparedDelivery> {
    const requestNotification =
      alimtalkRequestNotificationRequestedEventSchema.safeParse(
        event.payload,
      );
    const envelope = requestNotification.success
      ? requestNotification.data
      : alimtalkAssignmentNotificationRequestedEventSchema.parse(
          event.payload,
        );
    const [request] = await db
      .select({
        id: consultationRequests.id,
        phoneCiphertext: consultationRequests.phoneCiphertext,
        phoneNonce: consultationRequests.phoneNonce,
        phoneKeyVersion: consultationRequests.phoneKeyVersion,
        contactPreference: consultationRequests.contactPreference,
        contactWindowStart: consultationRequests.contactWindowStart,
        contactWindowEnd: consultationRequests.contactWindowEnd,
        submittedAt: consultationRequests.submittedAt,
        publicReceiptCode: consultations.publicReceiptCode,
      })
      .from(consultationRequests)
      .innerJoin(
        consultations,
        eq(consultations.id, consultationRequests.consultationId),
      )
      .where(
        and(
          eq(consultationRequests.id, envelope.data.requestId),
          eq(consultationRequests.consultationId, event.aggregateId),
        ),
      )
      .limit(1);
    if (!request) {
      throw new SolapiDeliveryError("consultation_request_not_found", {
        retryable: false,
      });
    }
    if (
      !request.phoneCiphertext ||
      !request.phoneNonce ||
      !request.phoneKeyVersion
    ) {
      throw new SolapiDeliveryError("consultation_phone_not_collected", {
        retryable: false,
      });
    }

    const phone = protection.decrypt(
      {
        ciphertext: request.phoneCiphertext,
        nonce: request.phoneNonce,
        keyVersion: request.phoneKeyVersion,
      },
      `consultation_requests.phone:${request.id}`,
    );
    const contactSchedule = formatAlimtalkContactSchedule({
      preference: request.contactPreference,
      windowStart: request.contactWindowStart,
      windowEnd: request.contactWindowEnd,
    });

    if (envelope.eventType === EVENT_TYPES[0]) {
      return {
        consultationId: event.aggregateId,
        requestId: request.id,
        templatePurpose: "consultation_requested",
        message: createSolapiAlimtalkMessage({
          to: phone,
          pfId,
          templateId: requestTemplateId,
          eventId: event.id,
          variables: {
            "#{접수번호}": request.publicReceiptCode,
            "#{접수시각}": formatAlimtalkTimestamp(request.submittedAt),
            "#{연락예정}": contactSchedule,
          },
        }),
      };
    }

    const [assignment] = await db
      .select({
        displayName: staffProfiles.displayName,
      })
      .from(consultationAssignments)
      .innerJoin(
        staffProfiles,
        eq(staffProfiles.userId, consultationAssignments.assigneeUserId),
      )
      .where(
        and(
          eq(consultationAssignments.id, envelope.data.assignmentId),
          eq(
            consultationAssignments.consultationId,
            event.aggregateId,
          ),
        ),
      )
      .limit(1);
    if (!assignment) {
      throw new SolapiDeliveryError("consultation_assignment_not_found", {
        retryable: false,
      });
    }

    return {
      consultationId: event.aggregateId,
      requestId: request.id,
      templatePurpose: "consultation_assigned",
      message: createSolapiAlimtalkMessage({
        to: phone,
        pfId,
        templateId: assignmentTemplateId,
        eventId: event.id,
        variables: {
          "#{접수번호}": request.publicReceiptCode,
          "#{담당자명}": assignment.displayName,
          "#{연락예정}": contactSchedule,
        },
      }),
    };
  }

  async function markSucceeded(
    event: ClaimedEvent,
    prepared: PreparedDelivery,
    delivery: SolapiAlimtalkDelivery,
    currentTime: Date,
  ) {
    await db.transaction(async (tx) => {
      const updated = await tx
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
        )
        .returning({ id: outboxEvents.id });
      if (updated.length !== 1) throw new Error("outbox_lease_lost");

      await tx.insert(alimtalkDeliveries).values({
        id: createEventId(),
        consultationId: prepared.consultationId,
        requestId: prepared.requestId,
        outboxEventId: event.id,
        templatePurpose: prepared.templatePurpose,
        providerGroupId: delivery.groupId,
        providerMessageId: delivery.messageId,
        providerStatusCode: delivery.statusCode,
        acceptedAt: currentTime,
        createdAt: currentTime,
        updatedAt: currentTime,
      });
      await tx
        .update(outboxDeliveryAttempts)
        .set({
          status: "succeeded",
          httpStatus: delivery.httpStatus,
          finishedAt: currentTime,
        })
        .where(
          and(
            eq(outboxDeliveryAttempts.id, event.attemptId),
            eq(outboxDeliveryAttempts.status, "started"),
          ),
        );
    });
  }

  async function markFailed(
    event: ClaimedEvent,
    currentTime: Date,
    failure: DeliveryFailure,
  ) {
    const shouldRetry =
      failure.retryable && event.attemptNumber < MAX_ATTEMPTS;
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(outboxEvents)
        .set({
          status: shouldRetry ? "pending" : "dead",
          availableAt: shouldRetry
            ? nextAvailableAt(
                currentTime,
                event.attemptNumber,
                failure.retryAfterSeconds,
              )
            : currentTime,
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
        )
        .returning({ id: outboxEvents.id });
      if (updated.length !== 1) throw new Error("outbox_lease_lost");

      await tx
        .update(outboxDeliveryAttempts)
        .set({
          status: shouldRetry ? "retry_scheduled" : "dead",
          httpStatus: failure.httpStatus ?? null,
          errorCode: failure.code,
          errorMessage: failure.message,
          finishedAt: currentTime,
        })
        .where(
          and(
            eq(outboxDeliveryAttempts.id, event.attemptId),
            eq(outboxDeliveryAttempts.status, "started"),
          ),
        );
    });
  }

  async function runOnce(): Promise<boolean> {
    const currentTime = now();
    await recoverExpiredLeases(currentTime);
    const event = await claimNext(currentTime);
    if (!event) return false;

    try {
      const prepared = await prepareDelivery(event);
      const delivery = await solapiClient.sendAlimtalk(prepared.message);
      await markSucceeded(event, prepared, delivery, now());
      console.log(
        JSON.stringify({
          event: "outbox_delivery_succeeded",
          eventId: event.id,
          eventType:
            (event.payload as { eventType?: unknown }).eventType ??
            "alimtalk.unknown",
          attempt: event.attemptNumber,
          occurredAt: now().toISOString(),
        }),
      );
    } catch (error) {
      const failure = deliveryFailure(error);
      await markFailed(event, now(), failure);
      console.warn(
        JSON.stringify({
          event: "outbox_delivery_failed",
          eventId: event.id,
          eventType:
            (event.payload as { eventType?: unknown }).eventType ??
            "alimtalk.unknown",
          attempt: event.attemptNumber,
          errorCode: failure.code,
          retryable:
            failure.retryable && event.attemptNumber < MAX_ATTEMPTS,
          occurredAt: now().toISOString(),
        }),
      );
    }
    return true;
  }

  async function runBatch() {
    for (let count = 0; count < 10 && !stopped; count += 1) {
      if (!(await runOnce())) break;
    }
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      currentRun = runBatch()
        .catch((error) => {
          console.error("alimtalk outbox worker loop failed", error);
        })
        .finally(() => {
          currentRun = undefined;
          schedule();
        });
    }, pollIntervalMs);
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    currentRun = runBatch()
      .catch((error) => {
        console.error("alimtalk outbox worker initial run failed", error);
      })
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

  return { runOnce, start, stop };
}

export type AlimtalkOutboxWorker = ReturnType<
  typeof createAlimtalkOutboxWorker
>;
