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
  consultationIntakeAnswersSchema,
  createEventId,
  legalfriendsRegistrationRequestedEventSchema,
} from "@lawand/core";
import {
  consultationAssignments,
  consultationRequests,
  consultations,
  legalFriendsCaseLinks,
  outboxDeliveryAttempts,
  outboxEvents,
  staffExternalAccounts,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";
import {
  createLegalFriendsCasePayload,
  LegalFriendsDeliveryError,
  type LegalFriendsClient,
  LegalFriendsPayloadError,
} from "./legalfriends.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const EVENT_TYPE =
  "legalfriends.consultation.registration.requested" as const;
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

type LegalFriendsAssignee = {
  externalAccountId: string;
  memberIdx: number;
};

function deliveryFailure(error: unknown): DeliveryFailure {
  if (error instanceof LegalFriendsDeliveryError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.options.retryable,
      ...(error.options.httpStatus
        ? { httpStatus: error.options.httpStatus }
        : {}),
      ...(error.options.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: error.options.retryAfterSeconds }
        : {}),
    };
  }
  if (error instanceof LegalFriendsPayloadError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
    };
  }
  return {
    code: "invalid_stored_data",
    message: "저장된 상담정보를 외부 전송 형식으로 변환하지 못했습니다.",
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

export function createOutboxWorker(options: {
  db: Database;
  protection: DataProtection;
  legalFriendsClient: LegalFriendsClient;
  workerId?: string;
  pollIntervalMs?: number;
  now?: () => Date;
  resolveLegalFriendsAssignee?: (
    assignmentId: string,
    consultationId: string,
  ) => Promise<LegalFriendsAssignee | null>;
}) {
  const {
    db,
    protection,
    legalFriendsClient,
    workerId = `${hostname()}:${process.pid}`,
    pollIntervalMs = 2_000,
    now = () => new Date(),
  } = options;
  let stopped = true;
  let timer: NodeJS.Timeout | undefined;
  let currentRun: Promise<void> | undefined;

  const resolveLegalFriendsAssignee =
    options.resolveLegalFriendsAssignee ??
    (async (assignmentId: string, consultationId: string) => {
      const [mapping] = await db
        .select({
          externalAccountId: staffExternalAccounts.externalAccountId,
          memberIdx: staffExternalAccounts.externalMemberIdx,
        })
        .from(consultationAssignments)
        .innerJoin(
          staffExternalAccounts,
          and(
            eq(
              staffExternalAccounts.staffUserId,
              consultationAssignments.assigneeUserId,
            ),
            eq(staffExternalAccounts.provider, "legalfriends"),
            eq(staffExternalAccounts.isActive, true),
          ),
        )
        .where(
          and(
            eq(consultationAssignments.id, assignmentId),
            eq(
              consultationAssignments.consultationId,
              consultationId,
            ),
          ),
        )
        .limit(1);
      return mapping?.externalAccountId && mapping.memberIdx
        ? {
            externalAccountId: mapping.externalAccountId,
            memberIdx: mapping.memberIdx,
          }
        : null;
    });

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
        "이전 전송 작업이 응답 기록 전에 중단됐습니다. 리걸프렌즈 중복 등록 여부를 확인해 주세요.";
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

  async function preparePayload(event: ClaimedEvent) {
    const envelope = legalfriendsRegistrationRequestedEventSchema.parse(
      event.payload,
    );
    const [request] = await db
      .select({
        id: consultationRequests.id,
        mode: consultationRequests.mode,
        phoneCiphertext: consultationRequests.phoneCiphertext,
        phoneNonce: consultationRequests.phoneNonce,
        phoneKeyVersion: consultationRequests.phoneKeyVersion,
        intakeCiphertext: consultationRequests.intakeCiphertext,
        intakeNonce: consultationRequests.intakeNonce,
        intakeKeyVersion: consultationRequests.intakeKeyVersion,
        anonymousLabel: consultations.anonymousLabel,
        preferredNameCiphertext: consultations.preferredNameCiphertext,
        preferredNameNonce: consultations.preferredNameNonce,
        preferredNameKeyVersion: consultations.preferredNameKeyVersion,
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
    if (!request) throw new Error("consultation_request_not_found");
    if (
      !request.phoneCiphertext ||
      !request.phoneNonce ||
      !request.phoneKeyVersion
    ) {
      throw new LegalFriendsPayloadError("consultation_phone_not_collected");
    }

    const phone = protection.decrypt(
      {
        ciphertext: request.phoneCiphertext,
        nonce: request.phoneNonce,
        keyVersion: request.phoneKeyVersion,
      },
      `consultation_requests.phone:${request.id}`,
    );
    const intake = consultationIntakeAnswersSchema.parse(
      JSON.parse(
        protection.decrypt(
          {
            ciphertext: request.intakeCiphertext,
            nonce: request.intakeNonce,
            keyVersion: request.intakeKeyVersion,
          },
          `consultation_requests.intake:${request.id}`,
        ),
      ),
    );
    const name =
      request.preferredNameCiphertext &&
      request.preferredNameNonce &&
      request.preferredNameKeyVersion
        ? protection.decrypt(
            {
              ciphertext: request.preferredNameCiphertext,
              nonce: request.preferredNameNonce,
              keyVersion: request.preferredNameKeyVersion,
            },
            `consultations.preferred_name:${event.aggregateId}`,
          )
        : request.anonymousLabel;

    const assignee = await resolveLegalFriendsAssignee(
      envelope.data.assignmentId,
      event.aggregateId,
    );
    if (!assignee) {
      throw new LegalFriendsPayloadError("assignee_mapping_missing");
    }

    return {
      casePayload: createLegalFriendsCasePayload({
        mode: request.mode,
        memberIdx: assignee.memberIdx,
        name,
        phone,
        intake,
      }),
      assigneeExternalId: assignee.externalAccountId,
    };
  }

  async function markSucceeded(
    event: ClaimedEvent,
    currentTime: Date,
    httpStatus: number,
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

      await tx
        .update(outboxDeliveryAttempts)
        .set({
          status: "succeeded",
          httpStatus,
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
      const delivery = await preparePayload(event);
      let [link] = await db
        .select()
        .from(legalFriendsCaseLinks)
        .where(
          eq(legalFriendsCaseLinks.consultationId, event.aggregateId),
        )
        .limit(1);
      let httpStatus = 200;
      if (!link) {
        const created = await legalFriendsClient.createCase(
          delivery.casePayload,
          {
            eventId: event.id,
            consultationId: event.aggregateId,
          },
        );
        httpStatus = created.httpStatus;
        const createdAt = now();
        [link] = await db
          .insert(legalFriendsCaseLinks)
          .values({
            consultationId: event.aggregateId,
            outboxEventId: event.id,
            caseIdx: created.caseIdx,
            managerExternalAccountId: delivery.assigneeExternalId,
            caseCreatedAt: createdAt,
            managerAssignedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
          })
          .returning();
      }
      if (!link) throw new Error("legalfriends_case_link_not_created");

      if (
        !link.managerAssignedAt ||
        link.managerExternalAccountId !== delivery.assigneeExternalId
      ) {
        const changed = await legalFriendsClient.changeManager(
          link.caseIdx,
          delivery.assigneeExternalId,
          {
            eventId: event.id,
            consultationId: event.aggregateId,
          },
        );
        httpStatus = changed.httpStatus;
        await db
          .update(legalFriendsCaseLinks)
          .set({
            managerExternalAccountId: delivery.assigneeExternalId,
            managerAssignedAt: now(),
            updatedAt: now(),
          })
          .where(
            eq(
              legalFriendsCaseLinks.consultationId,
              event.aggregateId,
            ),
          );
      }
      await markSucceeded(event, now(), httpStatus);
      console.log(
        JSON.stringify({
          event: "outbox_delivery_succeeded",
          eventId: event.id,
          eventType: EVENT_TYPE,
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
          eventType: EVENT_TYPE,
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
          console.error("outbox worker loop failed", error);
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
        console.error("outbox worker initial run failed", error);
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

export type OutboxWorker = ReturnType<typeof createOutboxWorker>;
