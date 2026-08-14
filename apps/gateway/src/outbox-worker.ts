import { hostname } from "node:os";

import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import {
  assertPlatformEvent,
  consultationIntakeAnswersSchema,
  createEventId,
  LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
  legalfriendsInvalidationRequestedEventSchema,
  legalfriendsManagerChangeRequestedEventSchema,
  legalfriendsRegistrationRequestedEventSchema,
  type PlatformEvent,
  residenceRegionSchema,
} from "@lawand/core";
import {
  consultationAssignmentTransfers,
  consultationAssignments,
  consultationGroupMembers,
  consultationGroups,
  consultationRequests,
  consultations,
  legalFriendsCaseLinks,
  outboxDeliveryAttempts,
  outboxEvents,
  staffAuditLogs,
  staffExternalAccounts,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";
import {
  createLegalFriendsCasePayload,
  KAKAO_LEGALFRIENDS_PLACEHOLDER_LIVING_PLACE,
  KAKAO_LEGALFRIENDS_PLACEHOLDER_PHONE,
  LegalFriendsDeliveryError,
  type LegalFriendsClient,
  LegalFriendsPayloadError,
} from "./legalfriends.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const REGISTRATION_EVENT_TYPE =
  "legalfriends.consultation.registration.requested" as const;
const INVALIDATION_EVENT_TYPE =
  "legalfriends.consultation.invalidation.requested" as const;
const MANAGER_CHANGE_EVENT_TYPE =
  "legalfriends.consultation.manager_change.requested" as const;
const EVENT_TYPES = [
  REGISTRATION_EVENT_TYPE,
  INVALIDATION_EVENT_TYPE,
  MANAGER_CHANGE_EVENT_TYPE,
] as const;
const MAX_ATTEMPTS = 5;
const LEASE_TIMEOUT_MS = 2 * 60 * 1_000;
const RETRY_DELAYS_SECONDS = [30, 120, 600, 1_800, 3_600] as const;

type ClaimedEvent = {
  id: string;
  aggregateId: string;
  eventType: string;
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

type StoredRegistrationName = {
  consultationId: string;
  anonymousLabel: string;
  preferredNameCiphertext: Buffer | null;
  preferredNameNonce: Buffer | null;
  preferredNameKeyVersion: string | null;
};

class LegalFriendsDependencyPendingError extends Error {}

export function resolveStoredRegistrationName(
  protection: Pick<DataProtection, "decrypt">,
  request: StoredRegistrationName,
): string {
  return request.preferredNameCiphertext &&
    request.preferredNameNonce &&
    request.preferredNameKeyVersion
    ? protection.decrypt(
        {
          ciphertext: request.preferredNameCiphertext,
          nonce: request.preferredNameNonce,
          keyVersion: request.preferredNameKeyVersion,
        },
        `consultations.preferred_name:${request.consultationId}`,
      )
    : request.anonymousLabel;
}

function deliveryFailure(error: unknown): DeliveryFailure {
  if (error instanceof LegalFriendsDependencyPendingError) {
    return {
      code: "case_registration_pending",
      message: error.message,
      retryable: true,
    };
  }
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
          eventType: outboxEvents.eventType,
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
          ),
        )
        .for("update", { skipLocked: true });

      if (expired.length === 0) return 0;
      const managerEventIds = expired
        .filter((event) => event.eventType === MANAGER_CHANGE_EVENT_TYPE)
        .map((event) => event.id);
      const completedManagerEventIds = new Set(
        managerEventIds.length > 0
          ? (
              await tx
                .select({
                  outboxEventId:
                    consultationAssignmentTransfers.outboxEventId,
                })
                .from(consultationAssignmentTransfers)
                .where(
                  and(
                    inArray(
                      consultationAssignmentTransfers.outboxEventId,
                      managerEventIds,
                    ),
                    eq(
                      consultationAssignmentTransfers.status,
                      "succeeded",
                    ),
                  ),
                )
            ).map((transfer) => transfer.outboxEventId)
          : [],
      );
      const completedIds = [...completedManagerEventIds];
      if (completedIds.length > 0) {
        await tx
          .update(outboxEvents)
          .set({
            status: "published",
            lockedAt: null,
            lockedBy: null,
            publishedAt: currentTime,
            lastError: null,
          })
          .where(inArray(outboxEvents.id, completedIds));
        await tx
          .update(outboxDeliveryAttempts)
          .set({
            status: "succeeded",
            httpStatus: 200,
            finishedAt: currentTime,
          })
          .where(
            and(
              inArray(outboxDeliveryAttempts.outboxEventId, completedIds),
              eq(outboxDeliveryAttempts.status, "started"),
            ),
          );
      }
      const unresolved = expired.filter(
        (event) => !completedManagerEventIds.has(event.id),
      );
      if (unresolved.length === 0) return expired.length;
      const ids = unresolved.map((event) => event.id);
      const message =
        "이전 리걸프렌즈 전송 작업이 응답 기록 전에 중단됐습니다. 리걸프렌즈에서 현재 사건 상태를 확인해 주세요.";
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
      const unresolvedManagerIds = unresolved
        .filter((event) => event.eventType === MANAGER_CHANGE_EVENT_TYPE)
        .map((event) => event.id);
      if (unresolvedManagerIds.length > 0) {
        await tx
          .update(consultationAssignmentTransfers)
          .set({
            status: "needs_confirmation",
            finishedAt: currentTime,
            updatedAt: currentTime,
          })
          .where(
            and(
              inArray(
                consultationAssignmentTransfers.outboxEventId,
                unresolvedManagerIds,
              ),
              eq(consultationAssignmentTransfers.status, "pending"),
            ),
          );
      }
      return expired.length;
    });
  }

  async function claimNext(currentTime: Date): Promise<ClaimedEvent | null> {
    return db.transaction(async (tx) => {
      const [event] = await tx
        .select({
          id: outboxEvents.id,
          aggregateId: outboxEvents.aggregateId,
          eventType: outboxEvents.eventType,
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
        eventType: event.eventType,
        payload: event.payload,
        attemptId,
        attemptNumber,
      };
    });
  }

  async function prepareRegistrationPayload(event: ClaimedEvent) {
    const envelope = legalfriendsRegistrationRequestedEventSchema.parse(
      event.payload,
    );
    const [request] = await db
      .select({
        id: consultationRequests.id,
        consultationId: consultationRequests.consultationId,
        mode: consultationRequests.mode,
        contactChannel: consultationRequests.contactChannel,
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
          or(
            eq(consultationRequests.consultationId, event.aggregateId),
            sql<boolean>`exists (
              select 1
              from ${consultationGroupMembers}
              inner join ${consultationGroups}
                on ${consultationGroups.id} = ${consultationGroupMembers.groupId}
              where ${consultationGroupMembers.consultationId} = ${consultationRequests.consultationId}
                and ${consultationGroups.status} = 'active'
                and ${consultationGroups.canonicalConsultationId} = ${event.aggregateId}
            )`,
          ),
        ),
      )
      .limit(1);
    if (!request) throw new Error("consultation_request_not_found");
    const isKakaoConsultation = request.contactChannel === "kakao_channel";
    if (
      !isKakaoConsultation &&
      (!request.phoneCiphertext ||
        !request.phoneNonce ||
        !request.phoneKeyVersion)
    ) {
      throw new LegalFriendsPayloadError("consultation_phone_not_collected");
    }

    const phone =
      request.phoneCiphertext && request.phoneNonce && request.phoneKeyVersion
        ? protection.decrypt(
            {
              ciphertext: request.phoneCiphertext,
              nonce: request.phoneNonce,
              keyVersion: request.phoneKeyVersion,
            },
            `consultation_requests.phone:${request.id}`,
          )
        : KAKAO_LEGALFRIENDS_PLACEHOLDER_PHONE;
    const storedIntake = JSON.parse(
      protection.decrypt(
        {
          ciphertext: request.intakeCiphertext,
          nonce: request.intakeNonce,
          keyVersion: request.intakeKeyVersion,
        },
        `consultation_requests.intake:${request.id}`,
      ),
    );
    const parsedIntake = consultationIntakeAnswersSchema.safeParse(
      storedIntake,
    );
    const storedResidenceRegion = residenceRegionSchema.safeParse(
      storedIntake && typeof storedIntake === "object"
        ? (storedIntake as Record<string, unknown>).residenceRegion
        : undefined,
    );
    const intake = parsedIntake.success
      ? parsedIntake.data
      : isKakaoConsultation
        ? {
            residenceRegion: storedResidenceRegion.success
              ? storedResidenceRegion.data
              : ("overseas_or_other" as const),
            urgencies: [],
            incomes: [],
            concern: "카카오 채팅방에서 상담 내용을 확인",
          }
        : consultationIntakeAnswersSchema.parse(storedIntake);
    const name = resolveStoredRegistrationName(protection, request);

    const assignee = "registrationTarget" in envelope.data
      ? {
          externalAccountId:
            envelope.data.targetManagerExternalAccountId,
          memberIdx: envelope.data.targetManagerMemberIdx,
        }
      : await resolveLegalFriendsAssignee(
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
        ...(isKakaoConsultation && !storedResidenceRegion.success
          ? {
              livingPlaceOverride:
                KAKAO_LEGALFRIENDS_PLACEHOLDER_LIVING_PLACE,
            }
          : {}),
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
      if (event.eventType === MANAGER_CHANGE_EVENT_TYPE) {
        const [completedTransfer] = await tx
          .select({ id: consultationAssignmentTransfers.id })
          .from(consultationAssignmentTransfers)
          .where(
            and(
              eq(
                consultationAssignmentTransfers.outboxEventId,
                event.id,
              ),
              eq(consultationAssignmentTransfers.status, "succeeded"),
            ),
          )
          .limit(1);
        if (completedTransfer) {
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
              httpStatus: 200,
              finishedAt: currentTime,
            })
            .where(
              and(
                eq(outboxDeliveryAttempts.id, event.attemptId),
                eq(outboxDeliveryAttempts.status, "started"),
              ),
            );
          return;
        }
      }
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
      if (event.eventType === MANAGER_CHANGE_EVENT_TYPE && !shouldRetry) {
        await tx
          .update(consultationAssignmentTransfers)
          .set({
            status:
              failure.code === "ambiguous_delivery"
                ? "needs_confirmation"
                : "failed",
            finishedAt: currentTime,
            updatedAt: currentTime,
          })
          .where(
            and(
              eq(
                consultationAssignmentTransfers.outboxEventId,
                event.id,
              ),
              eq(consultationAssignmentTransfers.status, "pending"),
            ),
          );
      }
    });
  }

  async function deliverRegistration(event: ClaimedEvent) {
    const delivery = await prepareRegistrationPayload(event);
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
    return httpStatus;
  }

  async function deliverInvalidation(event: ClaimedEvent) {
    const envelope = legalfriendsInvalidationRequestedEventSchema.parse(
      event.payload,
    );
    if (
      envelope.correlationId !== event.aggregateId ||
      envelope.data.consultationId !== event.aggregateId ||
      envelope.data.caseLinkRef !==
        `legalfriends_case_links/${event.aggregateId}`
    ) {
      throw new Error("legalfriends_invalidation_event_mismatch");
    }

    const [link] = await db
      .select()
      .from(legalFriendsCaseLinks)
      .where(
        eq(legalFriendsCaseLinks.consultationId, event.aggregateId),
      )
      .limit(1);
    if (!link) {
      throw new LegalFriendsDependencyPendingError(
        "리걸프렌즈 신건 등록 완료를 기다리고 있습니다.",
      );
    }

    if (
      link.managerExternalAccountId ===
      LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID
    ) {
      if (!link.managerAssignedAt) {
        const changedAt = now();
        await db
          .update(legalFriendsCaseLinks)
          .set({ managerAssignedAt: changedAt, updatedAt: changedAt })
          .where(
            eq(
              legalFriendsCaseLinks.consultationId,
              event.aggregateId,
            ),
          );
      }
      return 200;
    }

    const changed = await legalFriendsClient.changeManager(
      link.caseIdx,
      envelope.data.targetManagerExternalAccountId,
      {
        eventId: event.id,
        consultationId: event.aggregateId,
      },
    );
    const changedAt = now();
    await db
      .update(legalFriendsCaseLinks)
      .set({
        managerExternalAccountId:
          envelope.data.targetManagerExternalAccountId,
        managerAssignedAt: changedAt,
        updatedAt: changedAt,
      })
      .where(
        eq(legalFriendsCaseLinks.consultationId, event.aggregateId),
      );
    return changed.httpStatus;
  }

  async function deliverManagerChange(event: ClaimedEvent) {
    const envelope = legalfriendsManagerChangeRequestedEventSchema.parse(
      event.payload,
    );
    if (
      envelope.correlationId !== event.aggregateId ||
      envelope.data.consultationId !== event.aggregateId ||
      envelope.data.transferRef !==
        `consultation_assignment_transfers/${envelope.data.transferId}` ||
      envelope.data.assignmentRef !==
        `consultation_assignments/${envelope.data.assignmentId}` ||
      envelope.data.caseLinkRef !==
        `legalfriends_case_links/${event.aggregateId}`
    ) {
      throw new Error("legalfriends_manager_change_event_mismatch");
    }

    const [transfer] = await db
      .select()
      .from(consultationAssignmentTransfers)
      .where(
        and(
          eq(consultationAssignmentTransfers.id, envelope.data.transferId),
          eq(consultationAssignmentTransfers.outboxEventId, event.id),
          eq(
            consultationAssignmentTransfers.consultationId,
            event.aggregateId,
          ),
        ),
      )
      .limit(1);
    if (!transfer) throw new Error("assignment_transfer_not_found");
    if (transfer.status === "succeeded") return 200;
    if (transfer.status !== "pending") {
      throw new Error("assignment_transfer_not_pending");
    }
    if (
      transfer.assignmentId !== envelope.data.assignmentId ||
      transfer.previousAssigneeUserId !==
        envelope.data.previousAssigneeUserId ||
      transfer.targetAssigneeUserId !==
        envelope.data.targetAssigneeUserId ||
      transfer.targetAssigneeMembershipId !==
        envelope.data.targetAssigneeMembershipId ||
      transfer.requestedByUserId !== envelope.data.requestedByUserId ||
      transfer.reason !== envelope.data.reason ||
      transfer.targetManagerExternalAccountId !==
        envelope.data.targetManagerExternalAccountId ||
      transfer.targetManagerMemberIdx !==
        envelope.data.targetManagerMemberIdx
    ) {
      throw new Error("assignment_transfer_event_mismatch");
    }

    const [assignment] = await db
      .select()
      .from(consultationAssignments)
      .where(
        and(
          eq(consultationAssignments.id, transfer.assignmentId),
          eq(consultationAssignments.consultationId, event.aggregateId),
        ),
      )
      .limit(1);
    const [link] = await db
      .select()
      .from(legalFriendsCaseLinks)
      .where(eq(legalFriendsCaseLinks.consultationId, event.aggregateId))
      .limit(1);
    if (!assignment) throw new Error("consultation_assignment_not_found");
    if (!link) {
      throw new LegalFriendsDependencyPendingError(
        "리걸프렌즈 사건 등록 완료를 기다리고 있습니다.",
      );
    }
    if (
      assignment.assigneeUserId !== transfer.previousAssigneeUserId ||
      assignment.assigneeMembershipId !==
        transfer.previousAssigneeMembershipId
    ) {
      throw new Error("assignment_transfer_source_changed");
    }

    let httpStatus = 200;
    let externalManagerChanged = false;
    if (
      link.managerExternalAccountId !==
      transfer.targetManagerExternalAccountId
    ) {
      const changed = await legalFriendsClient.changeManager(
        link.caseIdx,
        transfer.targetManagerExternalAccountId,
        {
          eventId: event.id,
          consultationId: event.aggregateId,
        },
      );
      httpStatus = changed.httpStatus;
      externalManagerChanged = true;
    }

    const changedAt = now();
    try {
      await db.transaction(async (tx) => {
        const [lockedTransfer] = await tx
          .select({ status: consultationAssignmentTransfers.status })
          .from(consultationAssignmentTransfers)
          .where(eq(consultationAssignmentTransfers.id, transfer.id))
          .limit(1)
          .for("update");
        const [lockedAssignment] = await tx
          .select({
            assigneeUserId: consultationAssignments.assigneeUserId,
            assigneeMembershipId:
              consultationAssignments.assigneeMembershipId,
          })
          .from(consultationAssignments)
          .where(eq(consultationAssignments.id, transfer.assignmentId))
          .limit(1)
          .for("update");
        if (lockedTransfer?.status === "succeeded") return;
        if (
          lockedTransfer?.status !== "pending" ||
          lockedAssignment?.assigneeUserId !==
            transfer.previousAssigneeUserId ||
          lockedAssignment.assigneeMembershipId !==
            transfer.previousAssigneeMembershipId
        ) {
          throw new Error("assignment_transfer_commit_conflict");
        }

        await tx
          .update(legalFriendsCaseLinks)
          .set({
            managerExternalAccountId:
              transfer.targetManagerExternalAccountId,
            managerAssignedAt: changedAt,
            updatedAt: changedAt,
          })
          .where(
            eq(legalFriendsCaseLinks.consultationId, event.aggregateId),
          );
        await tx
          .update(consultationAssignments)
          .set({
            assigneeUserId: transfer.targetAssigneeUserId,
            assigneeMembershipId: transfer.targetAssigneeMembershipId,
            assignedByUserId: transfer.requestedByUserId,
            assignmentMethod: "transfer",
            assignedAt: changedAt,
          })
          .where(eq(consultationAssignments.id, transfer.assignmentId));
        await tx
          .update(consultationAssignmentTransfers)
          .set({
            status: "succeeded",
            finishedAt: changedAt,
            updatedAt: changedAt,
          })
          .where(eq(consultationAssignmentTransfers.id, transfer.id));

        const transferredEvent: PlatformEvent = {
          eventId: createEventId(),
          eventType: "consultation.assignment.transferred",
          eventVersion: 1,
          occurredAt: changedAt.toISOString(),
          producer: "lawand.gateway",
          correlationId: event.aggregateId,
          causationId: event.id,
          data: {
            consultationId: event.aggregateId,
            transferId: transfer.id,
            transferRef: `consultation_assignment_transfers/${transfer.id}`,
            assignmentId: transfer.assignmentId,
            assignmentRef: `consultation_assignments/${transfer.assignmentId}`,
            caseLinkRef: `legalfriends_case_links/${event.aggregateId}`,
            previousAssigneeUserId: transfer.previousAssigneeUserId,
            targetAssigneeUserId: transfer.targetAssigneeUserId,
            targetAssigneeMembershipId:
              transfer.targetAssigneeMembershipId,
            requestedByUserId: transfer.requestedByUserId,
            reason: transfer.reason,
          },
        };
        assertPlatformEvent(transferredEvent);
        await tx.insert(outboxEvents).values({
          id: transferredEvent.eventId,
          aggregateType: "consultation",
          aggregateId: event.aggregateId,
          eventType: transferredEvent.eventType,
          eventVersion: transferredEvent.eventVersion,
          correlationId: transferredEvent.correlationId,
          causationId: transferredEvent.causationId ?? null,
          payload: transferredEvent,
          status: "pending",
          availableAt: changedAt,
          occurredAt: changedAt,
          createdAt: changedAt,
        });
        await tx.insert(staffAuditLogs).values({
          id: createEventId(),
          actorUserId: transfer.requestedByUserId,
          action: "consultation.assignment_transfer_completed",
          targetType: "consultation",
          targetId: event.aggregateId,
          metadata: {
            transferId: transfer.id,
            eventId: event.id,
            assignmentId: transfer.assignmentId,
            previousAssigneeUserId: transfer.previousAssigneeUserId,
            targetAssigneeUserId: transfer.targetAssigneeUserId,
            reason: transfer.reason,
            caseIdx: link.caseIdx,
          },
          occurredAt: changedAt,
          createdAt: changedAt,
        });
      });
    } catch (error) {
      if (externalManagerChanged) {
        throw new LegalFriendsDeliveryError(
          "ambiguous_delivery",
          "리걸프렌즈 담당자는 변경됐지만 ERP 반영을 확정하지 못했습니다. 두 시스템의 현재 담당자를 확인해 주세요.",
          { retryable: false },
        );
      }
      throw error;
    }
    return httpStatus;
  }

  async function runOnce(): Promise<boolean> {
    const currentTime = now();
    await recoverExpiredLeases(currentTime);
    const event = await claimNext(currentTime);
    if (!event) return false;

    try {
      const httpStatus =
        event.eventType === REGISTRATION_EVENT_TYPE
          ? await deliverRegistration(event)
          : event.eventType === INVALIDATION_EVENT_TYPE
            ? await deliverInvalidation(event)
            : event.eventType === MANAGER_CHANGE_EVENT_TYPE
              ? await deliverManagerChange(event)
              : (() => {
                  throw new Error("unsupported_legalfriends_event");
                })();
      await markSucceeded(event, now(), httpStatus);
      console.log(
        JSON.stringify({
          event: "outbox_delivery_succeeded",
          eventId: event.id,
          eventType: event.eventType,
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
          eventType: event.eventType,
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
