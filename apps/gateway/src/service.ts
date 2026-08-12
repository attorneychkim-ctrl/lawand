import { randomBytes } from "node:crypto";

import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  sql,
} from "drizzle-orm";

import {
  assertPlatformEvent,
  kakaoHomepageEntryAssignmentPolicy,
  classifyConsultationSubmission,
  consultationSubmissionSchema,
  createConsultationId,
  createConsultationRequestId,
  createEventId,
  createPublicReceiptCode,
  CURRENT_KAKAO_HOMEPAGE_ENTRY_NOTICE_VERSION,
  CURRENT_KAKAO_CONSULTATION_NOTICE_VERSION,
  DEDUPE_WINDOWS,
  LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
  LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
  residenceRegionSchema,
  assessSelfDiagnosis,
  SELF_DIAGNOSIS_INCOME_TYPES,
  SELF_DIAGNOSIS_MODEL_VERSION,
  selfDiagnosisSubmissionSchema,
  type KakaoHomepageEntryConfirmation,
  type KakaoHomepageEntryReceipt,
  type KakaoHomepageEntrySubmission,
  type KakaoConsultationReceipt,
  type PlatformEvent,
  type ConsultationSubmission,
  type ConsultationSubmissionResponse,
  type DedupeOutcome,
  type ExistingConsultationCandidate,
  type SelfDiagnosisCaseProfile,
  type SelfDiagnosisSubmission,
  type SelfDiagnosisSubmissionResponse,
} from "@lawand/core";
import {
  alimtalkDeliveries,
  consultationAssignments,
  consultationAttributions,
  consultationRequests,
  consultationStatusHistory,
  consultations,
  journeyEvents,
  journeySessions,
  kakaoConsultationContacts,
  kakaoHomepageEntries,
  legalFriendsCaseLinks,
  marketingLandingPages,
  naverBookingEntries,
  outboxDeliveryAttempts,
  outboxEvents,
  selfDiagnosisCaseProfiles,
  staffAuditLogs,
  staffMemberships,
  staffOrganizations,
  staffProfiles,
  staffRegions,
  telephonyCallAftercare,
  telephonyCalls,
  telephonyEndpoints,
  telephonyMessages,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";
import type { StaffPrincipal } from "./auth.js";
import {
  CURRENT_NAVER_BOOKING_BASIS_VERSION,
  type NaverBookingEmail,
} from "./naver-booking.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

export type ConsultationListQuery = {
  page: number;
  pageSize: 20 | 50 | 100;
  filter?: ConsultationListFilter;
  staffUserId: string;
  from?: Date;
  to?: Date;
};

export type ConsultationListFilter =
  | "all"
  | "waiting"
  | "mine"
  | "attention"
  | "today";

export class ConsultationValidationError extends Error {}

export class SelfDiagnosisUnavailableError extends Error {}

export class ConsultationAssignmentError extends Error {
  constructor(
    readonly code:
      | "consultation_not_found"
      | "consultation_already_assigned"
      | "consultation_not_assignable",
    message: string,
  ) {
    super(message);
  }
}

export class LegalFriendsInvalidationError extends Error {
  constructor(
    readonly code:
      | "consultation_not_found"
      | "case_not_registered"
      | "invalidation_forbidden",
    message: string,
  ) {
    super(message);
  }
}

export class KakaoHomepageEntryError extends Error {
  constructor(
    readonly code:
      | "consultation_not_found"
      | "entry_not_found"
      | "entry_already_invalid"
      | "entry_not_pending"
      | "consultation_not_actionable",
    message: string,
  ) {
    super(message);
  }
}

function createAnonymousLabel(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
  const suffix = randomBytes(3).toString("base64url").slice(0, 4).toUpperCase();
  return `익명-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}-${suffix}`;
}

function dedupeOutcomeForAction(action: string): DedupeOutcome {
  switch (action) {
    case "attach_exact_duplicate":
      return "exact_duplicate";
    case "attach_identity_enrichment":
      return "identity_enrichment";
    case "create_suspected_duplicate":
      return "suspected_duplicate";
    default:
      return "new";
  }
}

function encryptedOrNull(
  protection: DataProtection,
  value: string | undefined,
  context: string,
) {
  return value ? protection.encrypt(value, context) : null;
}

function kakaoDisplayName(displayName: string, publicReceiptCode: string) {
  const suffix = publicReceiptCode.split("-").at(-1);
  if (!suffix) {
    throw new Error("카카오 상담 접수번호 형식이 올바르지 않습니다.");
  }
  return `${normalizeKakaoDisplayName(displayName)}_${suffix}_플친`;
}

function normalizeKakaoDisplayName(displayName: string) {
  return displayName.trim().replace(/\s+/gu, " ");
}

function eventRow(event: PlatformEvent) {
  return {
    id: event.eventId,
    aggregateType: "consultation",
    aggregateId: event.correlationId,
    eventType: event.eventType,
    eventVersion: event.eventVersion,
    correlationId: event.correlationId,
    causationId: event.causationId ?? null,
    payload: event,
    occurredAt: new Date(event.occurredAt),
  };
}

export function createConsultationService(options: {
  db: Database;
  protection: DataProtection;
}) {
  const { db, protection } = options;

  async function submitSelfDiagnosis(
    rawSubmission: SelfDiagnosisSubmission,
  ): Promise<SelfDiagnosisSubmissionResponse> {
    const diagnosis = selfDiagnosisSubmissionSchema.parse(rawSubmission);
    const profileRows = await db
      .select()
      .from(selfDiagnosisCaseProfiles)
      .where(
        eq(
          selfDiagnosisCaseProfiles.modelVersion,
          SELF_DIAGNOSIS_MODEL_VERSION,
        ),
      );
    const profiles: SelfDiagnosisCaseProfile[] = profileRows.map((profile) => ({
      id: profile.id,
      caseType: profile.caseType === 2 ? 2 : 1,
      courtIdx: profile.courtIdx,
      courtName: profile.courtName,
      monthlyIncome: profile.monthlyIncome,
      incomeType: profile.incomeType,
      residenceType: profile.residenceType,
      marriageState: profile.marriageState,
      minorChildCount: profile.minorChildCount,
      dependentCount: profile.dependentCount,
      totalDebt: profile.totalDebt,
      liquidationValue: profile.liquidationValue,
      priorityDebt: profile.priorityDebt,
      monthlyPayment: profile.monthlyPayment,
      paymentCount: profile.paymentCount,
      estimatedSpend: profile.estimatedSpend,
      livingCostType: profile.livingCostType,
      livingCostCost: profile.livingCostCost,
      totalPayment: profile.totalPayment,
      repaymentRate: profile.repaymentRate,
      filingDate: profile.filingDate,
      prohibitionDate: profile.prohibitionDate,
      commencementDate: profile.commencementDate,
      approvalDate: profile.approvalDate,
      bankruptcyDate: profile.bankruptcyDate,
      dischargeDate: profile.dischargeDate,
    }));
    const assessment = assessSelfDiagnosis(diagnosis.answers, profiles);
    if (assessment.matches.length !== 5) {
      throw new SelfDiagnosisUnavailableError(
        "비교 가능한 로앤 사건 다섯 건을 구성하지 못했습니다.",
      );
    }

    const totalDebt =
      diagnosis.answers.unsecuredDebt + diagnosis.answers.securedDebt;
    const roundMoney = (value: number) => Math.round(value / 10_000) * 10_000;
    // 고객 결과 화면과 ERP가 서로 다른 사건·금액을 보지 않도록
    // 응답 직전에 정규화하는 동일한 카드 스냅샷을 암호화 intake에도 보관한다.
    const matchedCases = assessment.matches.map((match) => ({
      ...match,
      monthlyIncome: roundMoney(match.monthlyIncome),
      totalDebt: roundMoney(match.totalDebt),
      liquidationValue: roundMoney(match.liquidationValue),
      monthlyPayment: roundMoney(match.monthlyPayment),
      totalPayment: roundMoney(match.totalPayment),
      repaymentRate: Math.round(match.repaymentRate * 10) / 10,
    }));
    const record = {
      ...diagnosis.answers,
      modelVersion: assessment.modelVersion,
      recommendation: assessment.recommendation,
      recommendationReason: assessment.recommendationReason,
      adjustedDependentCount: assessment.adjustedDependentCount,
      referenceLivingCost: assessment.referenceLivingCost,
      availableMonthlyIncome: assessment.availableMonthlyIncome,
      minimumRequiredTotalPayment: assessment.minimumRequiredTotalPayment,
      matchedCaseCount: assessment.matches.length,
      matchedCases,
    } as const;
    const receipt = await submit({
      source: diagnosis.source,
      idempotencyKey: diagnosis.idempotencyKey,
      mode: "self_diagnosis",
      phone: diagnosis.phone,
      name: diagnosis.name,
      contact: { preference: "as_soon_as_possible" },
      privacyNoticeVersion: diagnosis.privacyNoticeVersion,
      consentAgreedAt: diagnosis.consentAgreedAt,
      attribution: diagnosis.attribution,
      intake: {
        residenceRegion: diagnosis.answers.residenceRegion,
        topic:
          assessment.recommendation === "personal_rehabilitation"
            ? "개인회생"
            : "개인파산·면책",
        urgencies: ["자가진단 완료"],
        incomes: [
          SELF_DIAGNOSIS_INCOME_TYPES.find(
            (item) => item.value === diagnosis.answers.incomeType,
          )?.label ?? "기타",
        ],
        unsecuredDebt: `${diagnosis.answers.unsecuredDebt}원`,
        securedDebt: `${diagnosis.answers.securedDebt}원`,
        assets: `청산가치 ${diagnosis.answers.liquidationValue}원`,
        concern: `로앤 유사사건 ${assessment.matches.length}건 비교 · 총채무 ${totalDebt}원`,
        selfDiagnosis: record,
      },
    });

    return {
      ...receipt,
      assessment: {
        ...assessment,
        matches: matchedCases,
      },
    };
  }

  async function submit(
    rawSubmission: ConsultationSubmission,
  ): Promise<ConsultationSubmissionResponse> {
    const submission = consultationSubmissionSchema.parse(rawSubmission);
    const submittedAt = new Date();
    const consentAgreedAt = new Date(submission.consentAgreedAt);
    if (
      consentAgreedAt.getTime() < submittedAt.getTime() - 24 * 60 * 60 * 1_000 ||
      consentAgreedAt.getTime() > submittedAt.getTime() + 5 * 60 * 1_000
    ) {
      throw new ConsultationValidationError(
        "개인정보 동의 시각이 유효하지 않습니다. 화면을 새로고침해 주세요.",
      );
    }
    if (submission.contact.preference === "scheduled_window") {
      const contactStart = new Date(submission.contact.windowStart);
      if (
        contactStart.getTime() < submittedAt.getTime() + 20 * 60 * 1_000 ||
        contactStart.getTime() >
          submittedAt.getTime() + 60 * 24 * 60 * 60 * 1_000
      ) {
        throw new ConsultationValidationError(
          "연락 희망 시간은 지금부터 30분 이후의 운영시간으로 다시 선택해 주세요.",
        );
      }
    }
    const phoneFingerprint = protection.fingerprint(submission.phone);
    const payloadFingerprint = protection.fingerprint({
      mode: submission.mode,
      name: submission.name,
      contact: submission.contact,
      intake: submission.intake,
    });

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(phoneFingerprint)} as bigint))`,
      );

      const [idempotentRequest] = await tx
        .select({
          consultationId: consultationRequests.consultationId,
          publicReceiptCode: consultations.publicReceiptCode,
          submittedAt: consultationRequests.submittedAt,
          dedupeOutcome: consultationRequests.dedupeOutcome,
        })
        .from(consultationRequests)
        .innerJoin(
          consultations,
          eq(consultationRequests.consultationId, consultations.id),
        )
        .where(
          and(
            eq(consultationRequests.source, submission.source),
            eq(consultationRequests.idempotencyKey, submission.idempotencyKey),
          ),
        )
        .limit(1);

      if (idempotentRequest) {
        return {
          publicReceiptCode: idempotentRequest.publicReceiptCode,
          acceptedAt: idempotentRequest.submittedAt.toISOString(),
          dedupeOutcome: idempotentRequest.dedupeOutcome,
          replayed: true,
        };
      }

      const candidateRows = await tx
        .select({
          consultationId: consultations.id,
          state: consultations.state,
          requestId: consultationRequests.id,
          payloadFingerprint: consultationRequests.payloadFingerprint,
          journeySessionId: consultationRequests.journeySessionId,
          hasProvidedName: consultationRequests.hasProvidedName,
          submittedAt: consultationRequests.submittedAt,
        })
        .from(consultationRequests)
        .innerJoin(
          consultations,
          eq(consultationRequests.consultationId, consultations.id),
        )
        .where(
          and(
            eq(consultationRequests.phoneFingerprint, phoneFingerprint),
            gte(
              consultationRequests.submittedAt,
              new Date(
                submittedAt.getTime() - DEDUPE_WINDOWS.suspectedDuplicateMs,
              ),
            ),
          ),
        )
        .orderBy(desc(consultationRequests.submittedAt));

      const seenConsultations = new Set<string>();
      const candidates: ExistingConsultationCandidate[] = [];
      for (const row of candidateRows) {
        if (seenConsultations.has(row.consultationId)) continue;
        seenConsultations.add(row.consultationId);
        candidates.push({
          consultationId: row.consultationId,
          latestRequestId: row.requestId,
          state: row.state,
          phoneFingerprint: phoneFingerprint.toString("hex"),
          latestPayloadFingerprint: row.payloadFingerprint.toString("hex"),
          latestJourneySessionId: row.journeySessionId,
          hasProvidedName: row.hasProvidedName,
          latestRequestAt: row.submittedAt,
        });
      }

      const decision = classifyConsultationSubmission(
        {
          phoneFingerprint: phoneFingerprint.toString("hex"),
          payloadFingerprint: payloadFingerprint.toString("hex"),
          journeySessionId: submission.attribution?.journeySessionId ?? null,
          hasProvidedName: Boolean(submission.name),
          submittedAt,
        },
        candidates,
      );

      if (decision.action === "idempotent_replay") {
        throw new Error("트랜잭션 내 멱등성 판정 경로가 올바르지 않습니다.");
      }

      const consultationId = decision.createConsultation
        ? createConsultationId()
        : decision.consultationId;
      const requestId = createConsultationRequestId();
      const dedupeOutcome = dedupeOutcomeForAction(decision.action);
      let publicReceiptCode: string;

      const preferredName = encryptedOrNull(
        protection,
        submission.name,
        `consultations.preferred_name:${consultationId}`,
      );

      if (decision.createConsultation) {
        publicReceiptCode = createPublicReceiptCode(submittedAt);
        await tx.insert(consultations).values({
          id: consultationId,
          publicReceiptCode,
          contactChannel: "phone",
          phoneFingerprint,
          anonymousLabel: createAnonymousLabel(submittedAt),
          preferredNameCiphertext: preferredName?.ciphertext ?? null,
          preferredNameNonce: preferredName?.nonce ?? null,
          preferredNameKeyVersion: preferredName?.keyVersion ?? null,
          firstRequestedAt: submittedAt,
          lastRequestedAt: submittedAt,
          createdAt: submittedAt,
          updatedAt: submittedAt,
        });
      } else {
        const [existingConsultation] = await tx
          .select({ publicReceiptCode: consultations.publicReceiptCode })
          .from(consultations)
          .where(eq(consultations.id, consultationId))
          .limit(1);
        if (!existingConsultation) {
          throw new Error("기존 상담을 찾을 수 없습니다.");
        }
        publicReceiptCode = existingConsultation.publicReceiptCode;
        await tx
          .update(consultations)
          .set({
            lastRequestedAt: submittedAt,
            updatedAt: submittedAt,
            ...(decision.action === "attach_identity_enrichment" && preferredName
              ? {
                  preferredNameCiphertext: preferredName.ciphertext,
                  preferredNameNonce: preferredName.nonce,
                  preferredNameKeyVersion: preferredName.keyVersion,
                }
              : {}),
          })
          .where(eq(consultations.id, consultationId));
      }

      let journeySessionId: string | null = null;
      let attributionId: string | null = null;
      let pendingAttribution:
        | typeof consultationAttributions.$inferInsert
        | null = null;

      if (submission.attribution) {
        const attribution = submission.attribution;
        const currentJourneySessionId = attribution.journeySessionId;
        journeySessionId = currentJourneySessionId;
        const [landingPage] = await tx
          .select({
            id: marketingLandingPages.id,
            pageKey: marketingLandingPages.pageKey,
            version: marketingLandingPages.version,
          })
          .from(marketingLandingPages)
          .where(
            and(
              eq(marketingLandingPages.routePath, attribution.firstLandingPath),
              eq(marketingLandingPages.status, "active"),
            ),
          )
          .limit(1);

        await tx
          .insert(journeySessions)
          .values({
            id: currentJourneySessionId,
            firstLandingPageId: landingPage?.id ?? null,
            firstLandingPath: attribution.firstLandingPath,
            referrerHost: attribution.referrerHost ?? null,
            ...attribution.source,
            startedAt: new Date(attribution.startedAt),
            lastSeenAt: submittedAt,
            createdAt: submittedAt,
            updatedAt: submittedAt,
          })
          .onConflictDoUpdate({
            target: journeySessions.id,
            set: {
              lastSeenAt: submittedAt,
              updatedAt: submittedAt,
            },
          });

        const uniquePaths = [
          ...new Set(attribution.journey.map((entry) => entry.path)),
        ];
        const pageRows =
          uniquePaths.length > 0
            ? await tx
                .select({
                  id: marketingLandingPages.id,
                  routePath: marketingLandingPages.routePath,
                })
                .from(marketingLandingPages)
                .where(
                  and(
                    inArray(marketingLandingPages.routePath, uniquePaths),
                    eq(marketingLandingPages.status, "active"),
                  ),
                )
            : [];
        const pageIds = new Map(
          pageRows.map((page) => [page.routePath, page.id]),
        );

        const journeyRows: (typeof journeyEvents.$inferInsert)[] =
          attribution.journey.map((entry, index) => ({
          id: createEventId(),
          journeySessionId: currentJourneySessionId,
          sequence: index + 1,
          eventType: "page_view" as const,
          path: entry.path,
          landingPageId: pageIds.get(entry.path) ?? null,
          ctaPlacement: null,
          occurredAt: new Date(entry.visitedAt),
        }));
        if (attribution.consultationCta) {
          journeyRows.push({
            id: createEventId(),
            journeySessionId: currentJourneySessionId,
            sequence: journeyRows.length + 1,
            eventType: "consultation_cta_clicked",
            path: attribution.consultationCta.path,
            landingPageId:
              pageIds.get(attribution.consultationCta.path) ?? null,
            ctaPlacement: attribution.consultationCta.placement,
            occurredAt: new Date(attribution.consultationCta.clickedAt),
          });
        }
        if (journeyRows.length > 0) {
          await tx.insert(journeyEvents).values(journeyRows).onConflictDoNothing();
        }

        attributionId = createEventId();
        pendingAttribution = {
          id: attributionId,
          consultationId,
          requestId,
          journeySessionId: currentJourneySessionId,
          landingPageId: landingPage?.id ?? null,
          landingPageKeySnapshot: landingPage?.pageKey ?? null,
          landingPageVersionSnapshot: landingPage
            ? String(landingPage.version)
            : null,
          submittedFromPath: attribution.submittedFromPath,
          ctaPath: attribution.consultationCta?.path ?? null,
          ctaPlacement: attribution.consultationCta?.placement ?? null,
          ctaClickedAt: attribution.consultationCta
            ? new Date(attribution.consultationCta.clickedAt)
            : null,
          sourceSnapshot: attribution.source,
          attributedAt: submittedAt,
        };
      }

      const phoneEncrypted = protection.encrypt(
        submission.phone,
        `consultation_requests.phone:${requestId}`,
      );
      const nameEncrypted = encryptedOrNull(
        protection,
        submission.name,
        `consultation_requests.name:${requestId}`,
      );
      const intakeEncrypted = protection.encrypt(
        JSON.stringify(submission.intake),
        `consultation_requests.intake:${requestId}`,
      );

      await tx.insert(consultationRequests).values({
        id: requestId,
        consultationId,
        source: submission.source,
        idempotencyKey: submission.idempotencyKey,
        mode: submission.mode,
        contactChannel: "phone",
        phoneFingerprint,
        phoneCiphertext: phoneEncrypted.ciphertext,
        phoneNonce: phoneEncrypted.nonce,
        phoneKeyVersion: phoneEncrypted.keyVersion,
        hasProvidedName: Boolean(submission.name),
        nameCiphertext: nameEncrypted?.ciphertext ?? null,
        nameNonce: nameEncrypted?.nonce ?? null,
        nameKeyVersion: nameEncrypted?.keyVersion ?? null,
        intakeCiphertext: intakeEncrypted.ciphertext,
        intakeNonce: intakeEncrypted.nonce,
        intakeKeyVersion: intakeEncrypted.keyVersion,
        payloadFingerprint,
        contactPreference: submission.contact.preference,
        contactWindowStart:
          submission.contact.preference === "scheduled_window"
            ? new Date(submission.contact.windowStart)
            : null,
        contactWindowEnd:
          submission.contact.preference === "scheduled_window"
            ? new Date(submission.contact.windowEnd)
            : null,
        privacyNoticeVersion: submission.privacyNoticeVersion,
        privacyBasis: "explicit_consent",
        consentAgreedAt: new Date(submission.consentAgreedAt),
        journeySessionId,
        dedupeOutcome,
        candidateConsultationId:
          decision.action === "create_suspected_duplicate"
            ? decision.candidateConsultationId
            : null,
        submittedAt,
      });
      if (pendingAttribution) {
        await tx.insert(consultationAttributions).values(pendingAttribution);
      }

      if (decision.createConsultation) {
        await tx.insert(consultationStatusHistory).values({
          id: createEventId(),
          consultationId,
          fromState: null,
          toState: "requested",
          reason: "homepage_submission",
          actorType: "system",
          actorId: "lawand.gateway",
          changedAt: submittedAt,
        });
      }

      const occurredAt = submittedAt.toISOString();
      const events: PlatformEvent[] = [];
      if (decision.createConsultation) {
        const requestedEvent: PlatformEvent = {
          eventId: createEventId(),
          eventType: "consultation.requested",
          eventVersion: 1,
          occurredAt,
          producer: "lawand.gateway",
          correlationId: consultationId,
          data: {
            consultationId,
            requestId,
            intakeRef: `consultation_requests/${requestId}`,
            ...(attributionId
              ? {
                  attributionRef: `consultation_attributions/${attributionId}`,
                }
              : {}),
            mode: submission.mode,
            privacyNoticeVersion: submission.privacyNoticeVersion,
            privacyBasis: "explicit_consent",
            consentAgreedAt: consentAgreedAt.toISOString(),
            dedupeOutcome:
              decision.action === "create_suspected_duplicate"
                ? "suspected_duplicate"
                : "new",
          },
        };
        const requestNotificationEvent: PlatformEvent = {
          eventId: createEventId(),
          eventType:
            "alimtalk.consultation.request_notification.requested",
          eventVersion: 1,
          occurredAt,
          producer: "lawand.gateway",
          correlationId: consultationId,
          causationId: requestedEvent.eventId,
          data: {
            consultationId,
            requestId,
            intakeRef: `consultation_requests/${requestId}`,
            templatePurpose: "consultation_requested",
          },
        };
        assertPlatformEvent(requestedEvent);
        assertPlatformEvent(requestNotificationEvent);
        events.push(requestedEvent, requestNotificationEvent);
      }
      if (decision.action === "attach_identity_enrichment") {
        const event: PlatformEvent = {
          eventId: createEventId(),
          eventType: "consultation.request.updated",
          eventVersion: 1,
          occurredAt,
          producer: "lawand.gateway",
          correlationId: consultationId,
          data: {
            consultationId,
            requestId,
            intakeRef: `consultation_requests/${requestId}`,
            ...(attributionId
              ? {
                  attributionRef: `consultation_attributions/${attributionId}`,
                }
              : {}),
            updateReason: "identity_enriched",
            dedupeOutcome: "identity_enrichment",
          },
        };
        assertPlatformEvent(event);
        events.push(event);
      }
      if (decision.action === "create_suspected_duplicate") {
        const event: PlatformEvent = {
          eventId: createEventId(),
          eventType: "consultation.duplicate_suspected",
          eventVersion: 1,
          occurredAt,
          producer: "lawand.gateway",
          correlationId: consultationId,
          data: {
            consultationId,
            requestId,
            candidateConsultationId: decision.candidateConsultationId,
            reason: "same_phone_within_7_days",
            dedupeOutcome: "suspected_duplicate",
          },
        };
        assertPlatformEvent(event);
        events.push(event);
      }
      if (events.length > 0) {
        await tx.insert(outboxEvents).values(events.map(eventRow));
      }

      return {
        publicReceiptCode,
        acceptedAt: occurredAt,
        dedupeOutcome,
        replayed: false,
      };
    });
  }

  async function submitKakao(input: {
    botId: string;
    userKey: string;
  }): Promise<KakaoConsultationReceipt> {
    const receivedAt = new Date();
    const userFingerprint = protection.fingerprint({
      provider: "kakao_chatbot",
      botId: input.botId,
      userKey: input.userKey,
    });

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(userFingerprint)} as bigint))`,
      );

      const [existing] = await tx
        .select({
          consultationId: consultations.id,
          publicReceiptCode: consultations.publicReceiptCode,
          acceptedAt: consultations.firstRequestedAt,
        })
        .from(kakaoConsultationContacts)
        .innerJoin(
          consultations,
          eq(kakaoConsultationContacts.consultationId, consultations.id),
        )
        .where(
          and(
            eq(kakaoConsultationContacts.botId, input.botId),
            eq(kakaoConsultationContacts.userFingerprint, userFingerprint),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(kakaoConsultationContacts)
          .set({
            lastSeenAt: receivedAt,
            updatedAt: receivedAt,
          })
          .where(
            and(
              eq(kakaoConsultationContacts.botId, input.botId),
              eq(kakaoConsultationContacts.userFingerprint, userFingerprint),
            ),
          );
        await tx
          .update(consultations)
          .set({
            lastRequestedAt: receivedAt,
            updatedAt: receivedAt,
          })
          .where(eq(consultations.id, existing.consultationId));
        return {
          publicReceiptCode: existing.publicReceiptCode,
          acceptedAt: existing.acceptedAt.toISOString(),
          replayed: true,
        };
      }

      const consultationId = createConsultationId();
      const requestId = createConsultationRequestId();
      const publicReceiptCode = createPublicReceiptCode(receivedAt);
      const receiptSuffix = publicReceiptCode.split("-").at(-1);
      if (!receiptSuffix) {
        throw new Error("카카오 상담 접수 별칭을 만들지 못했습니다.");
      }
      const internalAlias = `카카오_${receiptSuffix}_플친`;
      const intakeEncrypted = protection.encrypt(
        JSON.stringify({
          channel: "kakao_channel",
          messageStorage: "not_stored",
          note: "상담 내용은 카카오 채팅방에서 확인",
        }),
        `consultation_requests.intake:${requestId}`,
      );
      const payloadFingerprint = protection.fingerprint({
        source: "kakao_channel",
        botId: input.botId,
        userFingerprint: userFingerprint.toString("hex"),
      });

      await tx.insert(consultations).values({
        id: consultationId,
        publicReceiptCode,
        contactChannel: "kakao_channel",
        phoneFingerprint: null,
        anonymousLabel: internalAlias,
        firstRequestedAt: receivedAt,
        lastRequestedAt: receivedAt,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      });
      await tx.insert(consultationRequests).values({
        id: requestId,
        consultationId,
        source: "kakao_channel",
        idempotencyKey: createEventId(),
        mode: "quick",
        contactChannel: "kakao_channel",
        phoneFingerprint: null,
        phoneCiphertext: null,
        phoneNonce: null,
        phoneKeyVersion: null,
        hasProvidedName: false,
        nameCiphertext: null,
        nameNonce: null,
        nameKeyVersion: null,
        intakeCiphertext: intakeEncrypted.ciphertext,
        intakeNonce: intakeEncrypted.nonce,
        intakeKeyVersion: intakeEncrypted.keyVersion,
        payloadFingerprint,
        contactPreference: "as_soon_as_possible",
        contactWindowStart: null,
        contactWindowEnd: null,
        privacyNoticeVersion: CURRENT_KAKAO_CONSULTATION_NOTICE_VERSION,
        privacyBasis: "customer_initiated_channel_message",
        consentAgreedAt: null,
        journeySessionId: null,
        dedupeOutcome: "new",
        candidateConsultationId: null,
        submittedAt: receivedAt,
        createdAt: receivedAt,
      });
      await tx.insert(kakaoConsultationContacts).values({
        id: createEventId(),
        consultationId,
        firstRequestId: requestId,
        botId: input.botId,
        userFingerprint,
        firstSeenAt: receivedAt,
        lastSeenAt: receivedAt,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      });
      await tx.insert(consultationStatusHistory).values({
        id: createEventId(),
        consultationId,
        fromState: null,
        toState: "requested",
        reason: "kakao_first_contact",
        actorType: "system",
        actorId: "lawand.gateway",
        changedAt: receivedAt,
        createdAt: receivedAt,
      });

      const requestedEvent: PlatformEvent = {
        eventId: createEventId(),
        eventType: "consultation.requested",
        eventVersion: 1,
        occurredAt: receivedAt.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        data: {
          consultationId,
          requestId,
          intakeRef: `consultation_requests/${requestId}`,
          mode: "quick",
          privacyNoticeVersion: CURRENT_KAKAO_CONSULTATION_NOTICE_VERSION,
          privacyBasis: "customer_initiated_channel_message",
          dedupeOutcome: "new",
        },
      };
      assertPlatformEvent(requestedEvent);
      await tx.insert(outboxEvents).values(eventRow(requestedEvent));

      return {
        publicReceiptCode,
        acceptedAt: receivedAt.toISOString(),
        replayed: false,
      };
    });
  }

  async function submitKakaoHomepageEntry(
    input: KakaoHomepageEntrySubmission,
  ): Promise<KakaoHomepageEntryReceipt> {
    const receivedAt = new Date();
    const idempotencyFingerprint = protection.fingerprint({
      provider: "homepage_kakao_entry",
      idempotencyKey: input.idempotencyKey,
    });

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(idempotencyFingerprint)} as bigint))`,
      );

      const [existing] = await tx
        .select({
          consultationId: consultations.id,
          publicReceiptCode: consultations.publicReceiptCode,
          acceptedAt: consultations.firstRequestedAt,
          entryId: kakaoHomepageEntries.id,
          entryStatus: kakaoHomepageEntries.status,
        })
        .from(consultationRequests)
        .innerJoin(
          consultations,
          eq(consultationRequests.consultationId, consultations.id),
        )
        .innerJoin(
          kakaoHomepageEntries,
          eq(kakaoHomepageEntries.firstRequestId, consultationRequests.id),
        )
        .where(
          and(
            eq(consultationRequests.source, input.source),
            eq(consultationRequests.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(kakaoHomepageEntries)
          .set({
            clickCount: sql`${kakaoHomepageEntries.clickCount} + 1`,
            lastClickedAt: receivedAt,
            updatedAt: receivedAt,
          })
          .where(eq(kakaoHomepageEntries.id, existing.entryId));
        await tx
          .update(consultations)
          .set({
            lastRequestedAt: receivedAt,
            updatedAt: receivedAt,
          })
          .where(eq(consultations.id, existing.consultationId));
        return {
          publicReceiptCode: existing.publicReceiptCode,
          acceptedAt: existing.acceptedAt.toISOString(),
          status: existing.entryStatus,
          replayed: true,
        };
      }

      const consultationId = createConsultationId();
      const requestId = createConsultationRequestId();
      const entryId = createEventId();
      const publicReceiptCode = createPublicReceiptCode(receivedAt);
      const receiptSuffix = publicReceiptCode.split("-").at(-1);
      if (!receiptSuffix) {
        throw new Error("카카오 홈페이지 진입 별칭을 만들지 못했습니다.");
      }
      const internalAlias = `카카오_${receiptSuffix}_플친`;
      const submittedDisplayName = normalizeKakaoDisplayName(
        input.displayName,
      );
      const preferredDisplayName = kakaoDisplayName(
        submittedDisplayName,
        publicReceiptCode,
      );
      const preferredNameEncrypted = protection.encrypt(
        preferredDisplayName,
        `consultations.preferred_name:${consultationId}`,
      );
      const requestNameEncrypted = protection.encrypt(
        submittedDisplayName,
        `consultation_requests.name:${requestId}`,
      );
      const intakeEncrypted = protection.encrypt(
        JSON.stringify({
          channel: "kakao_channel",
          entrySource: "homepage_button",
          messageStorage: "not_stored",
          note: "고객 입력 이름으로 카카오 채팅 메시지 확인 대기",
        }),
        `consultation_requests.intake:${requestId}`,
      );
      const payloadFingerprint = protection.fingerprint({
        source: input.source,
        idempotencyKey: input.idempotencyKey,
        displayName: submittedDisplayName,
      });

      let journeySessionId: string | null = null;
      let attributionId: string | null = null;
      let pendingAttribution:
        | typeof consultationAttributions.$inferInsert
        | null = null;

      if (input.attribution) {
        const attribution = input.attribution;
        journeySessionId = attribution.journeySessionId;
        const [landingPage] = await tx
          .select({
            id: marketingLandingPages.id,
            pageKey: marketingLandingPages.pageKey,
            version: marketingLandingPages.version,
          })
          .from(marketingLandingPages)
          .where(
            and(
              eq(marketingLandingPages.routePath, attribution.firstLandingPath),
              eq(marketingLandingPages.status, "active"),
            ),
          )
          .limit(1);

        await tx
          .insert(journeySessions)
          .values({
            id: attribution.journeySessionId,
            firstLandingPageId: landingPage?.id ?? null,
            firstLandingPath: attribution.firstLandingPath,
            referrerHost: attribution.referrerHost ?? null,
            ...attribution.source,
            startedAt: new Date(attribution.startedAt),
            lastSeenAt: receivedAt,
            createdAt: receivedAt,
            updatedAt: receivedAt,
          })
          .onConflictDoUpdate({
            target: journeySessions.id,
            set: {
              lastSeenAt: receivedAt,
              updatedAt: receivedAt,
            },
          });

        const uniquePaths = [
          ...new Set(attribution.journey.map((entry) => entry.path)),
        ];
        const pageRows =
          uniquePaths.length > 0
            ? await tx
                .select({
                  id: marketingLandingPages.id,
                  routePath: marketingLandingPages.routePath,
                })
                .from(marketingLandingPages)
                .where(
                  and(
                    inArray(marketingLandingPages.routePath, uniquePaths),
                    eq(marketingLandingPages.status, "active"),
                  ),
                )
            : [];
        const pageIds = new Map(
          pageRows.map((page) => [page.routePath, page.id]),
        );
        const journeyRows: (typeof journeyEvents.$inferInsert)[] =
          attribution.journey.map((entry, index) => ({
            id: createEventId(),
            journeySessionId: attribution.journeySessionId,
            sequence: index + 1,
            eventType: "page_view" as const,
            path: entry.path,
            landingPageId: pageIds.get(entry.path) ?? null,
            ctaPlacement: null,
            occurredAt: new Date(entry.visitedAt),
          }));
        if (attribution.consultationCta) {
          journeyRows.push({
            id: createEventId(),
            journeySessionId: attribution.journeySessionId,
            sequence: journeyRows.length + 1,
            eventType: "consultation_cta_clicked",
            path: attribution.consultationCta.path,
            landingPageId:
              pageIds.get(attribution.consultationCta.path) ?? null,
            ctaPlacement: attribution.consultationCta.placement,
            occurredAt: new Date(attribution.consultationCta.clickedAt),
          });
        }
        if (journeyRows.length > 0) {
          await tx
            .insert(journeyEvents)
            .values(journeyRows)
            .onConflictDoNothing();
        }

        attributionId = createEventId();
        pendingAttribution = {
          id: attributionId,
          consultationId,
          requestId,
          journeySessionId: attribution.journeySessionId,
          landingPageId: landingPage?.id ?? null,
          landingPageKeySnapshot: landingPage?.pageKey ?? null,
          landingPageVersionSnapshot: landingPage
            ? String(landingPage.version)
            : null,
          submittedFromPath: attribution.submittedFromPath,
          ctaPath: attribution.consultationCta?.path ?? null,
          ctaPlacement: attribution.consultationCta?.placement ?? null,
          ctaClickedAt: attribution.consultationCta
            ? new Date(attribution.consultationCta.clickedAt)
            : null,
          sourceSnapshot: attribution.source,
          attributedAt: receivedAt,
        };
      }

      await tx.insert(consultations).values({
        id: consultationId,
        publicReceiptCode,
        contactChannel: "kakao_channel",
        phoneFingerprint: null,
        anonymousLabel: internalAlias,
        preferredNameCiphertext: preferredNameEncrypted.ciphertext,
        preferredNameNonce: preferredNameEncrypted.nonce,
        preferredNameKeyVersion: preferredNameEncrypted.keyVersion,
        firstRequestedAt: receivedAt,
        lastRequestedAt: receivedAt,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      });
      await tx.insert(consultationRequests).values({
        id: requestId,
        consultationId,
        source: input.source,
        idempotencyKey: input.idempotencyKey,
        mode: "quick",
        contactChannel: "kakao_channel",
        phoneFingerprint: null,
        phoneCiphertext: null,
        phoneNonce: null,
        phoneKeyVersion: null,
        hasProvidedName: true,
        nameCiphertext: requestNameEncrypted.ciphertext,
        nameNonce: requestNameEncrypted.nonce,
        nameKeyVersion: requestNameEncrypted.keyVersion,
        intakeCiphertext: intakeEncrypted.ciphertext,
        intakeNonce: intakeEncrypted.nonce,
        intakeKeyVersion: intakeEncrypted.keyVersion,
        payloadFingerprint,
        contactPreference: "as_soon_as_possible",
        contactWindowStart: null,
        contactWindowEnd: null,
        privacyNoticeVersion:
          CURRENT_KAKAO_HOMEPAGE_ENTRY_NOTICE_VERSION,
        privacyBasis: "customer_initiated_channel_entry",
        consentAgreedAt: null,
        journeySessionId,
        dedupeOutcome: "new",
        candidateConsultationId: null,
        submittedAt: receivedAt,
        createdAt: receivedAt,
      });
      if (pendingAttribution) {
        await tx.insert(consultationAttributions).values(pendingAttribution);
      }
      await tx.insert(kakaoHomepageEntries).values({
        id: entryId,
        consultationId,
        firstRequestId: requestId,
        status: "pending",
        clickCount: 1,
        firstClickedAt: receivedAt,
        lastClickedAt: receivedAt,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      });
      await tx.insert(consultationStatusHistory).values({
        id: createEventId(),
        consultationId,
        fromState: null,
        toState: "requested",
        reason: "homepage_kakao_entry_clicked",
        actorType: "system",
        actorId: "lawand.gateway",
        changedAt: receivedAt,
        createdAt: receivedAt,
      });

      const requestedEvent: PlatformEvent = {
        eventId: createEventId(),
        eventType: "consultation.requested",
        eventVersion: 1,
        occurredAt: receivedAt.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        data: {
          consultationId,
          requestId,
          intakeRef: `consultation_requests/${requestId}`,
          ...(attributionId
            ? {
                attributionRef:
                  `consultation_attributions/${attributionId}`,
              }
            : {}),
          mode: "quick",
          privacyNoticeVersion:
            CURRENT_KAKAO_HOMEPAGE_ENTRY_NOTICE_VERSION,
          privacyBasis: "customer_initiated_channel_entry",
          dedupeOutcome: "new",
        },
      };
      assertPlatformEvent(requestedEvent);
      await tx.insert(outboxEvents).values(eventRow(requestedEvent));

      return {
        publicReceiptCode,
        acceptedAt: receivedAt.toISOString(),
        status: "pending",
        replayed: false,
      };
    });
  }

  async function confirmKakaoHomepageEntry(
    consultationId: string,
    input: KakaoHomepageEntryConfirmation,
    actor: StaffPrincipal,
  ) {
    const now = new Date();
    return db.transaction(async (tx) => {
      const [consultation] = await tx
        .select({
          id: consultations.id,
          publicReceiptCode: consultations.publicReceiptCode,
          state: consultations.state,
          preferredNameCiphertext: consultations.preferredNameCiphertext,
          preferredNameNonce: consultations.preferredNameNonce,
          preferredNameKeyVersion: consultations.preferredNameKeyVersion,
        })
        .from(consultations)
        .where(eq(consultations.id, consultationId))
        .limit(1)
        .for("update");
      if (!consultation) {
        throw new KakaoHomepageEntryError(
          "consultation_not_found",
          "상담을 찾을 수 없습니다.",
        );
      }

      const [entry] = await tx
        .select()
        .from(kakaoHomepageEntries)
        .where(eq(kakaoHomepageEntries.consultationId, consultationId))
        .limit(1)
        .for("update");
      if (!entry) {
        throw new KakaoHomepageEntryError(
          "entry_not_found",
          "홈페이지에서 시작된 카카오 상담이 아닙니다.",
        );
      }
      if (entry.status === "invalid") {
        throw new KakaoHomepageEntryError(
          "entry_already_invalid",
          "이미 미진입·무효 처리된 상담입니다.",
        );
      }
      if (consultation.state === "closed") {
        throw new KakaoHomepageEntryError(
          "consultation_not_actionable",
          "종결된 상담의 카카오 고객명을 확정할 수 없습니다.",
        );
      }

      const displayName = kakaoDisplayName(
        input.displayName,
        consultation.publicReceiptCode,
      );
      const currentDisplayName =
        consultation.preferredNameCiphertext &&
        consultation.preferredNameNonce &&
        consultation.preferredNameKeyVersion
          ? protection.decrypt(
              {
                ciphertext: consultation.preferredNameCiphertext,
                nonce: consultation.preferredNameNonce,
                keyVersion: consultation.preferredNameKeyVersion,
              },
              `consultations.preferred_name:${consultationId}`,
            )
          : null;
      if (entry.status === "confirmed" && currentDisplayName === displayName) {
        return {
          consultationId,
          entryId: entry.id,
          status: "confirmed" as const,
          displayName,
          confirmedAt: entry.confirmedAt!.toISOString(),
          replayed: true,
        };
      }

      const encryptedName = protection.encrypt(
        displayName,
        `consultations.preferred_name:${consultationId}`,
      );
      await tx
        .update(consultations)
        .set({
          preferredNameCiphertext: encryptedName.ciphertext,
          preferredNameNonce: encryptedName.nonce,
          preferredNameKeyVersion: encryptedName.keyVersion,
          updatedAt: now,
        })
        .where(eq(consultations.id, consultationId));
      await tx
        .update(kakaoHomepageEntries)
        .set({
          status: "confirmed",
          confirmedAt: now,
          confirmedByUserId: actor.id,
          updatedAt: now,
        })
        .where(eq(kakaoHomepageEntries.id, entry.id));
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action:
          entry.status === "confirmed"
            ? "consultation.kakao_display_name_updated"
            : "consultation.kakao_chat_confirmed",
        targetType: "consultation",
        targetId: consultationId,
        metadata: {
          entryId: entry.id,
          requestId: entry.firstRequestId,
        },
        occurredAt: now,
        createdAt: now,
      });

      const event: PlatformEvent = {
        eventId: createEventId(),
        eventType: "consultation.kakao_chat.confirmed",
        eventVersion: 1,
        occurredAt: now.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        data: {
          consultationId,
          requestId: entry.firstRequestId,
          intakeRef: `consultation_requests/${entry.firstRequestId}`,
          entryId: entry.id,
          actorUserId: actor.id,
        },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(eventRow(event));

      return {
        consultationId,
        entryId: entry.id,
        status: "confirmed" as const,
        displayName,
        confirmedAt: now.toISOString(),
        replayed: false,
      };
    });
  }

  async function invalidateKakaoHomepageEntry(
    consultationId: string,
    actor: StaffPrincipal,
  ) {
    const now = new Date();
    return db.transaction(async (tx) => {
      const [consultation] = await tx
        .select({
          id: consultations.id,
          state: consultations.state,
        })
        .from(consultations)
        .where(eq(consultations.id, consultationId))
        .limit(1)
        .for("update");
      if (!consultation) {
        throw new KakaoHomepageEntryError(
          "consultation_not_found",
          "상담을 찾을 수 없습니다.",
        );
      }

      const [entry] = await tx
        .select()
        .from(kakaoHomepageEntries)
        .where(eq(kakaoHomepageEntries.consultationId, consultationId))
        .limit(1)
        .for("update");
      if (!entry) {
        throw new KakaoHomepageEntryError(
          "entry_not_found",
          "홈페이지에서 시작된 카카오 상담이 아닙니다.",
        );
      }
      if (entry.status === "invalid") {
        return {
          consultationId,
          entryId: entry.id,
          status: "invalid" as const,
          invalidatedAt: entry.invalidatedAt!.toISOString(),
          replayed: true,
        };
      }
      if (entry.status !== "pending") {
        throw new KakaoHomepageEntryError(
          "entry_not_pending",
          "채팅이 확인된 상담은 미진입·무효 처리할 수 없습니다.",
        );
      }
      if (consultation.state !== "requested") {
        throw new KakaoHomepageEntryError(
          "consultation_not_actionable",
          "신규 접수 상태의 카카오 진입만 무효 처리할 수 있습니다.",
        );
      }

      await tx
        .update(kakaoHomepageEntries)
        .set({
          status: "invalid",
          invalidatedAt: now,
          invalidatedByUserId: actor.id,
          updatedAt: now,
        })
        .where(eq(kakaoHomepageEntries.id, entry.id));
      await tx
        .update(consultations)
        .set({
          state: "closed",
          closedAt: now,
          updatedAt: now,
        })
        .where(eq(consultations.id, consultationId));
      await tx.insert(consultationStatusHistory).values({
        id: createEventId(),
        consultationId,
        fromState: "requested",
        toState: "closed",
        reason: "kakao_entry_no_message",
        actorType: "staff",
        actorId: actor.id,
        changedAt: now,
        createdAt: now,
      });
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "consultation.kakao_entry_invalidated",
        targetType: "consultation",
        targetId: consultationId,
        metadata: {
          entryId: entry.id,
          requestId: entry.firstRequestId,
          reason: "no_kakao_message",
        },
        occurredAt: now,
        createdAt: now,
      });

      const event: PlatformEvent = {
        eventId: createEventId(),
        eventType: "consultation.kakao_entry.invalidated",
        eventVersion: 1,
        occurredAt: now.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        data: {
          consultationId,
          requestId: entry.firstRequestId,
          intakeRef: `consultation_requests/${entry.firstRequestId}`,
          entryId: entry.id,
          actorUserId: actor.id,
        },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(eventRow(event));

      return {
        consultationId,
        entryId: entry.id,
        status: "invalid" as const,
        invalidatedAt: now.toISOString(),
        replayed: false,
      };
    });
  }

  async function ingestNaverBooking(input: NaverBookingEmail) {
    const sourceReceivedAt = new Date(input.messageReceivedAt);
    const scheduledAt = new Date(input.scheduledAt);
    const requestedAt = input.requestedAt
      ? new Date(input.requestedAt)
      : sourceReceivedAt;
    if (
      [sourceReceivedAt, scheduledAt, requestedAt].some((value) =>
        Number.isNaN(value.getTime()),
      )
    ) {
      throw new Error("naver_booking_invalid_timestamp");
    }
    const bookingFingerprint = protection.fingerprint({
      provider: "naver_booking",
      businessId: input.businessId,
      bookingNumber: input.bookingNumber,
    });

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(bookingFingerprint)} as bigint))`,
      );
      const [existing] = await tx
        .select({
          consultationId: consultations.id,
          publicReceiptCode: consultations.publicReceiptCode,
          acceptedAt: consultations.firstRequestedAt,
        })
        .from(naverBookingEntries)
        .innerJoin(
          consultations,
          eq(naverBookingEntries.consultationId, consultations.id),
        )
        .where(
          and(
            eq(naverBookingEntries.businessId, input.businessId),
            eq(naverBookingEntries.bookingNumber, input.bookingNumber),
          ),
        )
        .limit(1);
      if (existing) {
        return {
          consultationId: existing.consultationId,
          publicReceiptCode: existing.publicReceiptCode,
          acceptedAt: existing.acceptedAt.toISOString(),
          replayed: true,
        };
      }

      const consultationId = createConsultationId();
      const requestId = createConsultationRequestId();
      const entryId = createEventId();
      const publicReceiptCode = createPublicReceiptCode(requestedAt);
      const internalName =
        `${input.maskedName.trim().replace(/\s+/gu, " ")}_네이버예약`;
      const encryptedName = protection.encrypt(
        internalName,
        `consultations.preferred_name:${consultationId}`,
      );
      const requestName = protection.encrypt(
        internalName,
        `consultation_requests.name:${requestId}`,
      );
      const intake = {
        channel: "naver_booking",
        bookingNumber: input.bookingNumber,
        productName: input.productName,
        scheduledAt: input.scheduledAt,
        attendeeCount: input.attendeeCount,
        option: input.option,
        customerRequest: input.customerRequest,
        detailStatus: "details_pending",
        note: "네이버 예약 상세 페이지에서 전체 연락처 확인 필요",
      };
      const encryptedIntake = protection.encrypt(
        JSON.stringify(intake),
        `consultation_requests.intake:${requestId}`,
      );
      const payloadFingerprint = protection.fingerprint({
        businessId: input.businessId,
        bookingNumber: input.bookingNumber,
        scheduledAt: input.scheduledAt,
        productName: input.productName,
      });

      await tx.insert(consultations).values({
        id: consultationId,
        publicReceiptCode,
        contactChannel: "naver_booking",
        phoneFingerprint: null,
        anonymousLabel: `네이버예약-${input.bookingNumber.slice(-6)}`,
        preferredNameCiphertext: encryptedName.ciphertext,
        preferredNameNonce: encryptedName.nonce,
        preferredNameKeyVersion: encryptedName.keyVersion,
        firstRequestedAt: requestedAt,
        lastRequestedAt: requestedAt,
        createdAt: sourceReceivedAt,
        updatedAt: sourceReceivedAt,
      });
      await tx.insert(consultationRequests).values({
        id: requestId,
        consultationId,
        source: "naver_booking_email",
        idempotencyKey: createEventId(),
        mode: "quick",
        contactChannel: "naver_booking",
        phoneFingerprint: null,
        phoneCiphertext: null,
        phoneNonce: null,
        phoneKeyVersion: null,
        hasProvidedName: true,
        nameCiphertext: requestName.ciphertext,
        nameNonce: requestName.nonce,
        nameKeyVersion: requestName.keyVersion,
        intakeCiphertext: encryptedIntake.ciphertext,
        intakeNonce: encryptedIntake.nonce,
        intakeKeyVersion: encryptedIntake.keyVersion,
        payloadFingerprint,
        contactPreference: "scheduled_window",
        contactWindowStart: scheduledAt,
        contactWindowEnd: new Date(scheduledAt.getTime() + 30 * 60 * 1_000),
        privacyNoticeVersion: CURRENT_NAVER_BOOKING_BASIS_VERSION,
        privacyBasis: "customer_initiated_booking",
        consentAgreedAt: null,
        journeySessionId: null,
        dedupeOutcome: "new",
        candidateConsultationId: null,
        submittedAt: requestedAt,
        createdAt: sourceReceivedAt,
      });
      await tx.insert(naverBookingEntries).values({
        id: entryId,
        consultationId,
        firstRequestId: requestId,
        businessId: input.businessId,
        bookingNumber: input.bookingNumber,
        detailsUrl: input.detailsUrl,
        status: "details_pending",
        scheduledAt,
        sourceMessageUid: input.sourceMessageUid,
        sourceReceivedAt,
        createdAt: sourceReceivedAt,
        updatedAt: sourceReceivedAt,
      });
      await tx.insert(consultationStatusHistory).values({
        id: createEventId(),
        consultationId,
        fromState: null,
        toState: "requested",
        reason: "naver_booking_confirmed_email",
        actorType: "system",
        actorId: "lawand.gateway",
        changedAt: sourceReceivedAt,
        createdAt: sourceReceivedAt,
      });

      const event: PlatformEvent = {
        eventId: createEventId(),
        eventType: "consultation.requested",
        eventVersion: 1,
        occurredAt: sourceReceivedAt.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        data: {
          consultationId,
          requestId,
          intakeRef: `consultation_requests/${requestId}`,
          mode: "quick",
          privacyNoticeVersion: CURRENT_NAVER_BOOKING_BASIS_VERSION,
          privacyBasis: "customer_initiated_booking",
          dedupeOutcome: "new",
        },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(eventRow(event));

      return {
        consultationId,
        publicReceiptCode,
        acceptedAt: requestedAt.toISOString(),
        replayed: false,
      };
    });
  }

  async function assignToSelf(
    consultationId: string,
    actor: StaffPrincipal,
  ) {
    const now = new Date();
    return db.transaction(async (tx) => {
      const [consultation] = await tx
        .select({
          id: consultations.id,
          state: consultations.state,
          publicReceiptCode: consultations.publicReceiptCode,
        })
        .from(consultations)
        .where(eq(consultations.id, consultationId))
        .limit(1)
        .for("update");
      if (!consultation) {
        throw new ConsultationAssignmentError(
          "consultation_not_found",
          "상담을 찾을 수 없습니다.",
        );
      }

      const [existingAssignment] = await tx
        .select({
          id: consultationAssignments.id,
          assigneeUserId: consultationAssignments.assigneeUserId,
          assignedAt: consultationAssignments.assignedAt,
          displayName: staffProfiles.displayName,
        })
        .from(consultationAssignments)
        .innerJoin(
          staffProfiles,
          eq(staffProfiles.userId, consultationAssignments.assigneeUserId),
        )
        .where(
          eq(consultationAssignments.consultationId, consultationId),
        )
        .limit(1);

      if (existingAssignment) {
        if (existingAssignment.assigneeUserId === actor.id) {
          return {
            assignmentId: existingAssignment.id,
            consultationId,
            publicReceiptCode: consultation.publicReceiptCode,
            state: "assigned" as const,
            assignee: {
              userId: actor.id,
              displayName: existingAssignment.displayName,
              organization: actor.primaryMembership.organization,
              region: actor.primaryMembership.region,
              department: actor.primaryMembership.department,
              jobTitle: actor.primaryMembership.jobTitle,
            },
            assignedAt: existingAssignment.assignedAt.toISOString(),
            replayed: true,
            queuedEventTypes: [] as string[],
          };
        }
        throw new ConsultationAssignmentError(
          "consultation_already_assigned",
          `이미 ${existingAssignment.displayName} 담당자로 배정된 상담입니다.`,
        );
      }

      if (consultation.state !== "requested") {
        throw new ConsultationAssignmentError(
          "consultation_not_assignable",
          "신규 접수 상태의 상담만 가져올 수 있습니다.",
        );
      }

      const [homepageKakaoEntry] = await tx
        .select({
          id: kakaoHomepageEntries.id,
          firstRequestId: kakaoHomepageEntries.firstRequestId,
          nameProvided: consultationRequests.hasProvidedName,
          status: kakaoHomepageEntries.status,
        })
        .from(kakaoHomepageEntries)
        .innerJoin(
          consultationRequests,
          eq(kakaoHomepageEntries.firstRequestId, consultationRequests.id),
        )
        .where(eq(kakaoHomepageEntries.consultationId, consultationId))
        .limit(1);

      const [latestRequest] = await tx
        .select({
          id: consultationRequests.id,
          contactChannel: consultationRequests.contactChannel,
        })
        .from(consultationRequests)
        .where(eq(consultationRequests.consultationId, consultationId))
        .orderBy(desc(consultationRequests.submittedAt))
        .limit(1);
      if (!latestRequest) {
        throw new ConsultationAssignmentError(
          "consultation_not_assignable",
          "상담 요청 원장을 찾을 수 없어 담당자를 지정하지 못했습니다.",
        );
      }
      const kakaoAssignmentPolicy = homepageKakaoEntry
        ? kakaoHomepageEntryAssignmentPolicy(homepageKakaoEntry)
        : "assign";
      if (kakaoAssignmentPolicy === "blocked") {
        throw new ConsultationAssignmentError(
          "consultation_not_assignable",
          "카카오 채팅방의 고객명을 확인한 뒤 담당자를 지정해 주세요.",
        );
      }

      const kakaoEntryToConfirm =
        kakaoAssignmentPolicy === "confirm_and_assign" && homepageKakaoEntry
          ? homepageKakaoEntry
          : null;
      if (kakaoEntryToConfirm) {
        await tx
          .update(kakaoHomepageEntries)
          .set({
            status: "confirmed",
            confirmedAt: now,
            confirmedByUserId: actor.id,
            updatedAt: now,
          })
          .where(eq(kakaoHomepageEntries.id, kakaoEntryToConfirm.id));
        await tx.insert(staffAuditLogs).values({
          id: createEventId(),
          actorUserId: actor.id,
          action: "consultation.kakao_chat_confirmed_from_assignment",
          targetType: "consultation",
          targetId: consultationId,
          metadata: {
            entryId: kakaoEntryToConfirm.id,
            requestId: kakaoEntryToConfirm.firstRequestId,
          },
          occurredAt: now,
          createdAt: now,
        });
      }

      const assignmentId = createEventId();
      await tx.insert(consultationAssignments).values({
        id: assignmentId,
        consultationId,
        assigneeUserId: actor.id,
        assigneeMembershipId: actor.primaryMembership.id,
        assignedByUserId: actor.id,
        assignmentMethod: "self_claim",
        assignedAt: now,
        createdAt: now,
      });
      await tx
        .update(consultations)
        .set({ state: "assigned", updatedAt: now })
        .where(eq(consultations.id, consultationId));
      await tx.insert(consultationStatusHistory).values({
        id: createEventId(),
        consultationId,
        fromState: "requested",
        toState: "assigned",
        reason: "staff_self_claimed",
        actorType: "staff",
        actorId: actor.id,
        changedAt: now,
        createdAt: now,
      });
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "consultation.assigned",
        targetType: "consultation",
        targetId: consultationId,
        metadata: {
          assignmentId,
          membershipId: actor.primaryMembership.id,
          method: "self_claim",
        },
        occurredAt: now,
        createdAt: now,
      });

      const assignedEventId = createEventId();
      const referenceData = {
        consultationId,
        requestId: latestRequest.id,
        assignmentId,
        assignmentRef: `consultation_assignments/${assignmentId}` as const,
        intakeRef: `consultation_requests/${latestRequest.id}` as const,
      };
      const occurredAt = now.toISOString();
      const events: PlatformEvent[] = [];
      if (kakaoEntryToConfirm) {
        events.push({
          eventId: createEventId(),
          eventType: "consultation.kakao_chat.confirmed",
          eventVersion: 1,
          occurredAt,
          producer: "lawand.gateway",
          correlationId: consultationId,
          data: {
            consultationId,
            requestId: kakaoEntryToConfirm.firstRequestId,
            intakeRef:
              `consultation_requests/${kakaoEntryToConfirm.firstRequestId}`,
            entryId: kakaoEntryToConfirm.id,
            actorUserId: actor.id,
          },
        });
      }
      events.push({
        eventId: assignedEventId,
        eventType: "consultation.assigned",
        eventVersion: 1,
        occurredAt,
        producer: "lawand.gateway",
        correlationId: consultationId,
        data: {
          ...referenceData,
          assigneeUserId: actor.id,
          assigneeMembershipId: actor.primaryMembership.id,
          assignmentMethod: "self_claim",
        },
      });
      if (latestRequest.contactChannel === "phone") {
        events.push({
          eventId: createEventId(),
          eventType: "legalfriends.consultation.registration.requested",
          eventVersion: 1,
          occurredAt,
          producer: "lawand.gateway",
          correlationId: consultationId,
          causationId: assignedEventId,
          data: referenceData,
        });
        events.push({
          eventId: createEventId(),
          eventType:
            "alimtalk.consultation.assignment_notification.requested",
          eventVersion: 1,
          occurredAt,
          producer: "lawand.gateway",
          correlationId: consultationId,
          causationId: assignedEventId,
          data: {
            ...referenceData,
            templatePurpose: "consultation_assigned",
          },
        });
      }
      events.forEach(assertPlatformEvent);
      await tx.insert(outboxEvents).values(events.map(eventRow));

      return {
        assignmentId,
        consultationId,
        publicReceiptCode: consultation.publicReceiptCode,
        state: "assigned" as const,
        assignee: {
          userId: actor.id,
          displayName: actor.displayName,
          organization: actor.primaryMembership.organization,
          region: actor.primaryMembership.region,
          department: actor.primaryMembership.department,
          jobTitle: actor.primaryMembership.jobTitle,
        },
        assignedAt: occurredAt,
        replayed: false,
        queuedEventTypes: events.map((event) => event.eventType),
      };
    });
  }

  async function invalidateLegalFriendsCase(
    consultationId: string,
    actor: StaffPrincipal,
  ) {
    const now = new Date();
    return db.transaction(async (tx) => {
      const [consultation] = await tx
        .select({ id: consultations.id })
        .from(consultations)
        .where(eq(consultations.id, consultationId))
        .limit(1)
        .for("update");
      if (!consultation) {
        throw new LegalFriendsInvalidationError(
          "consultation_not_found",
          "상담을 찾을 수 없습니다.",
        );
      }

      const [assignment] = await tx
        .select({
          assigneeUserId: consultationAssignments.assigneeUserId,
        })
        .from(consultationAssignments)
        .where(
          eq(consultationAssignments.consultationId, consultationId),
        )
        .limit(1);
      if (
        !assignment ||
        (assignment.assigneeUserId !== actor.id &&
          !actor.roles.includes("admin"))
      ) {
        throw new LegalFriendsInvalidationError(
          "invalidation_forbidden",
          "현재 상담 담당자 또는 관리자만 무효 처리할 수 있습니다.",
        );
      }

      const [caseLink] = await tx
        .select({
          managerExternalAccountId:
            legalFriendsCaseLinks.managerExternalAccountId,
          registrationEventId: legalFriendsCaseLinks.outboxEventId,
        })
        .from(legalFriendsCaseLinks)
        .where(
          eq(legalFriendsCaseLinks.consultationId, consultationId),
        )
        .limit(1)
        .for("update");
      if (!caseLink) {
        throw new LegalFriendsInvalidationError(
          "case_not_registered",
          "리걸프렌즈 사건 등록이 완료된 뒤 무효 처리할 수 있습니다.",
        );
      }

      if (
        caseLink.managerExternalAccountId ===
        LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID
      ) {
        return {
          consultationId,
          eventId: null,
          state: "invalidated" as const,
          targetManagerExternalAccountId:
            LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
          targetManagerMemberIdx:
            LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
          replayed: true,
        };
      }

      const [pendingEvent] = await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.aggregateId, consultationId),
            eq(
              outboxEvents.eventType,
              "legalfriends.consultation.invalidation.requested",
            ),
            eq(outboxEvents.status, "pending"),
          ),
        )
        .orderBy(desc(outboxEvents.occurredAt))
        .limit(1);
      if (pendingEvent) {
        return {
          consultationId,
          eventId: pendingEvent.id,
          state: "queued" as const,
          targetManagerExternalAccountId:
            LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
          targetManagerMemberIdx:
            LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
          replayed: true,
        };
      }

      const eventId = createEventId();
      const event = {
        eventId,
        eventType:
          "legalfriends.consultation.invalidation.requested" as const,
        eventVersion: 1 as const,
        occurredAt: now.toISOString(),
        producer: "lawand.gateway" as const,
        correlationId: consultationId,
        causationId: caseLink.registrationEventId,
        data: {
          consultationId,
          caseLinkRef: `legalfriends_case_links/${consultationId}` as const,
          requestedByUserId: actor.id,
          targetManagerExternalAccountId:
            LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
          targetManagerMemberIdx:
            LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
        },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(eventRow(event));
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "legalfriends.case.invalidation_requested",
        targetType: "consultation",
        targetId: consultationId,
        metadata: {
          eventId,
          caseLinkRef: event.data.caseLinkRef,
          targetManagerExternalAccountId:
            LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
          targetManagerMemberIdx:
            LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
        },
        occurredAt: now,
        createdAt: now,
      });

      return {
        consultationId,
        eventId,
        state: "queued" as const,
        targetManagerExternalAccountId:
          LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
        targetManagerMemberIdx:
          LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
        replayed: false,
      };
    });
  }

  async function list(query: ConsultationListQuery) {
    const dateCondition = and(
      query.from
        ? gte(consultations.lastRequestedAt, query.from)
        : undefined,
      query.to ? lt(consultations.lastRequestedAt, query.to) : undefined,
    );
    const waitingCondition = and(
      eq(consultations.state, "requested"),
      sql<boolean>`not exists (
        select 1
        from ${kakaoHomepageEntries}
        where ${kakaoHomepageEntries.consultationId} = ${consultations.id}
          and ${kakaoHomepageEntries.status} = 'invalid'
      )`,
    );
    const mineCondition = sql<boolean>`exists (
      select 1
      from ${consultationAssignments}
      where ${consultationAssignments.consultationId} = ${consultations.id}
        and ${consultationAssignments.assigneeUserId} = ${query.staffUserId}
    )`;
    const attentionCondition = sql<boolean>`(
      exists (
        select 1
        from ${consultationRequests}
        where ${consultationRequests.consultationId} = ${consultations.id}
          and ${consultationRequests.id} = (
            select latest_request.id
            from ${consultationRequests} latest_request
            where latest_request.consultation_id = ${consultations.id}
            order by latest_request.submitted_at desc
            limit 1
          )
          and ${consultationRequests.dedupeOutcome} = 'suspected_duplicate'
      )
      or exists (
        select 1
        from ${kakaoHomepageEntries}
        where ${kakaoHomepageEntries.consultationId} = ${consultations.id}
          and ${kakaoHomepageEntries.status} = 'pending'
      )
      or exists (
        select 1
        from ${naverBookingEntries}
        where ${naverBookingEntries.consultationId} = ${consultations.id}
          and ${naverBookingEntries.status} = 'details_pending'
      )
      or exists (
        select 1
        from (
          select *
          from (
            select ${telephonyCalls.disposition}::text as disposition,
              null::text as aftercare_result,
              ${telephonyCalls.requestedAt} as occurred_at
            from ${telephonyCalls}
            where ${telephonyCalls.consultationId} = ${consultations.id}
              and ${telephonyCalls.disposition} is not null
            union all
            select null::text,
              ${telephonyCallAftercare.result}::text,
              ${telephonyCallAftercare.confirmedAt}
            from ${telephonyCallAftercare}
            where ${telephonyCallAftercare.consultationId} = ${consultations.id}
          ) all_telephony
          order by all_telephony.occurred_at desc
          limit 1
        ) latest_telephony
        where latest_telephony.disposition in ('no_answer', 'callback_required')
          or latest_telephony.aftercare_result in (
            'reconsultation_required',
            'no_answer',
            'busy',
            'manager_callback_requested',
            'rejected'
          )
      )
    )`;
    const todayCondition = sql<boolean>`(
      ${consultations.lastRequestedAt} >= (
        date_trunc('day', now() at time zone 'Asia/Seoul')
        at time zone 'Asia/Seoul'
      )
      and ${consultations.lastRequestedAt} < (
        (date_trunc('day', now() at time zone 'Asia/Seoul') + interval '1 day')
        at time zone 'Asia/Seoul'
      )
    )`;
    const [summaryRow] = await db
      .select({
        all: count(),
        waiting: sql<number>`count(*) filter (where ${waitingCondition})::int`,
        mine: sql<number>`count(*) filter (where ${mineCondition})::int`,
        attention: sql<number>`count(*) filter (where ${attentionCondition})::int`,
        today: sql<number>`count(*) filter (where ${todayCondition})::int`,
      })
      .from(consultations)
      .where(dateCondition);
    const summary = {
      all: Number(summaryRow?.all ?? 0),
      waiting: Number(summaryRow?.waiting ?? 0),
      mine: Number(summaryRow?.mine ?? 0),
      attention: Number(summaryRow?.attention ?? 0),
      today: Number(summaryRow?.today ?? 0),
    };
    const selectedFilter = query.filter ?? "all";
    const selectedCondition = selectedFilter === "waiting"
      ? waitingCondition
      : selectedFilter === "mine"
        ? mineCondition
        : selectedFilter === "attention"
          ? attentionCondition
          : selectedFilter === "today"
            ? todayCondition
            : undefined;
    const total = summary[selectedFilter];
    const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, pageCount);
    const consultationRows = await db
      .select()
      .from(consultations)
      .where(and(dateCondition, selectedCondition))
      .orderBy(desc(consultations.lastRequestedAt))
      .limit(query.pageSize)
      .offset((page - 1) * query.pageSize);
    if (consultationRows.length === 0) {
      return {
        items: [],
        total,
        page,
        pageSize: query.pageSize,
        pageCount,
        summary,
      };
    }

    const ids = consultationRows.map((row) => row.id);
    const requestRows = await db
      .select()
      .from(consultationRequests)
      .where(inArray(consultationRequests.consultationId, ids))
      .orderBy(desc(consultationRequests.submittedAt));
    const latestByConsultation = new Map<string, (typeof requestRows)[number]>();
    const requestCounts = new Map<string, number>();
    for (const request of requestRows) {
      requestCounts.set(
        request.consultationId,
        (requestCounts.get(request.consultationId) ?? 0) + 1,
      );
      if (!latestByConsultation.has(request.consultationId)) {
        latestByConsultation.set(request.consultationId, request);
      }
    }

    const assignmentRows = await db
      .select({
        consultationId: consultationAssignments.consultationId,
        assigneeUserId: consultationAssignments.assigneeUserId,
        displayName: staffProfiles.displayName,
      })
      .from(consultationAssignments)
      .innerJoin(
        staffProfiles,
        eq(staffProfiles.userId, consultationAssignments.assigneeUserId),
      )
      .where(inArray(consultationAssignments.consultationId, ids));
    const assigneeByConsultation = new Map(
      assignmentRows.map((row) => [row.consultationId, row]),
    );
    const homepageEntryRows = await db
      .select({
        consultationId: kakaoHomepageEntries.consultationId,
        status: kakaoHomepageEntries.status,
        nameProvided: consultationRequests.hasProvidedName,
        clickCount: kakaoHomepageEntries.clickCount,
        lastClickedAt: kakaoHomepageEntries.lastClickedAt,
      })
      .from(kakaoHomepageEntries)
      .innerJoin(
        consultationRequests,
        eq(kakaoHomepageEntries.firstRequestId, consultationRequests.id),
      )
      .where(inArray(kakaoHomepageEntries.consultationId, ids));
    const homepageEntryByConsultation = new Map(
      homepageEntryRows.map((row) => [row.consultationId, row]),
    );
    const naverBookingRows = await db
      .select({
        consultationId: naverBookingEntries.consultationId,
        bookingNumber: naverBookingEntries.bookingNumber,
        status: naverBookingEntries.status,
        scheduledAt: naverBookingEntries.scheduledAt,
      })
      .from(naverBookingEntries)
      .where(inArray(naverBookingEntries.consultationId, ids));
    const naverBookingByConsultation = new Map(
      naverBookingRows.map((row) => [row.consultationId, row]),
    );
    const telephonyRows = await db
      .select({
        consultationId: telephonyCalls.consultationId,
        disposition: telephonyCalls.disposition,
        requestedAt: telephonyCalls.requestedAt,
      })
      .from(telephonyCalls)
      .where(
        and(
          inArray(telephonyCalls.consultationId, ids),
          isNotNull(telephonyCalls.disposition),
        ),
      )
      .orderBy(desc(telephonyCalls.requestedAt));
    const aftercareRows = await db
      .select({
        consultationId: telephonyCallAftercare.consultationId,
        result: telephonyCallAftercare.result,
        confirmedAt: telephonyCallAftercare.confirmedAt,
      })
      .from(telephonyCallAftercare)
      .where(
        and(
          inArray(telephonyCallAftercare.consultationId, ids),
          isNotNull(telephonyCallAftercare.consultationId),
        ),
      )
      .orderBy(desc(telephonyCallAftercare.confirmedAt));
    const latestTelephonyByConsultation = new Map<
      string,
      {
        disposition: (typeof telephonyRows)[number]["disposition"];
        aftercareResult: (typeof aftercareRows)[number]["result"] | null;
        occurredAt: Date;
      }
    >();
    for (const call of telephonyRows) {
      if (!call.consultationId) continue;
      if (!latestTelephonyByConsultation.has(call.consultationId)) {
        latestTelephonyByConsultation.set(call.consultationId, {
          disposition: call.disposition,
          aftercareResult: null,
          occurredAt: call.requestedAt,
        });
      }
    }
    for (const aftercare of aftercareRows) {
      if (!aftercare.consultationId) continue;
      const existing = latestTelephonyByConsultation.get(
        aftercare.consultationId,
      );
      if (!existing || aftercare.confirmedAt > existing.occurredAt) {
        latestTelephonyByConsultation.set(aftercare.consultationId, {
          disposition: null,
          aftercareResult: aftercare.result,
          occurredAt: aftercare.confirmedAt,
        });
      }
    }

    return {
      items: consultationRows.map((consultation) => {
        const request = latestByConsultation.get(consultation.id);
        const preferredName =
          consultation.preferredNameCiphertext &&
          consultation.preferredNameNonce &&
          consultation.preferredNameKeyVersion
            ? protection.decrypt(
                {
                  ciphertext: consultation.preferredNameCiphertext,
                  nonce: consultation.preferredNameNonce,
                  keyVersion: consultation.preferredNameKeyVersion,
                },
                `consultations.preferred_name:${consultation.id}`,
              )
            : null;
        const phone =
          request?.phoneCiphertext &&
          request.phoneNonce &&
          request.phoneKeyVersion
          ? protection.decrypt(
              {
                ciphertext: request.phoneCiphertext,
                nonce: request.phoneNonce,
                keyVersion: request.phoneKeyVersion,
              },
              `consultation_requests.phone:${request.id}`,
            )
          : null;
        const intake = request
          ? (JSON.parse(
              protection.decrypt(
                {
                  ciphertext: request.intakeCiphertext,
                  nonce: request.intakeNonce,
                  keyVersion: request.intakeKeyVersion,
                },
                `consultation_requests.intake:${request.id}`,
              ),
            ) as Record<string, unknown>)
          : null;
        const residenceRegion = residenceRegionSchema.safeParse(
          intake?.residenceRegion,
        );
        const kakaoEntry = homepageEntryByConsultation.get(consultation.id);
        const naverBooking = naverBookingByConsultation.get(consultation.id);
        const latestTelephony = latestTelephonyByConsultation.get(
          consultation.id,
        );
        return {
          id: consultation.id,
          publicReceiptCode: consultation.publicReceiptCode,
          state: consultation.state,
          displayName: preferredName ?? consultation.anonymousLabel,
          contactChannel: consultation.contactChannel,
          phone,
          residenceRegion: residenceRegion.success
            ? residenceRegion.data
            : null,
          mode: request?.mode ?? "quick",
          dedupeOutcome: request?.dedupeOutcome ?? "new",
          requestCount: requestCounts.get(consultation.id) ?? 0,
          assigneeUserId:
            assigneeByConsultation.get(consultation.id)?.assigneeUserId ??
            null,
          assigneeDisplayName:
            assigneeByConsultation.get(consultation.id)?.displayName ?? null,
          kakaoEntry: kakaoEntry
            ? {
                status: kakaoEntry.status,
                nameProvided: kakaoEntry.nameProvided,
                clickCount: kakaoEntry.clickCount,
                lastClickedAt: kakaoEntry.lastClickedAt.toISOString(),
              }
            : null,
          naverBooking: naverBooking
            ? {
                bookingNumber: naverBooking.bookingNumber,
                status: naverBooking.status,
                scheduledAt: naverBooking.scheduledAt.toISOString(),
              }
            : null,
          latestTelephony: latestTelephony
            ? {
                disposition: latestTelephony.disposition,
                aftercareResult: latestTelephony.aftercareResult,
                requestedAt: latestTelephony.occurredAt.toISOString(),
              }
            : null,
          firstRequestedAt: consultation.firstRequestedAt.toISOString(),
          lastRequestedAt: consultation.lastRequestedAt.toISOString(),
        };
      }),
      total,
      page,
      pageSize: query.pageSize,
      pageCount,
      summary,
    };
  }

  async function detail(consultationId: string) {
    const [consultation] = await db
      .select()
      .from(consultations)
      .where(eq(consultations.id, consultationId))
      .limit(1);
    if (!consultation) return null;

    const [kakaoEntry] = await db
      .select({
        id: kakaoHomepageEntries.id,
        firstRequestId: kakaoHomepageEntries.firstRequestId,
        status: kakaoHomepageEntries.status,
        clickCount: kakaoHomepageEntries.clickCount,
        firstClickedAt: kakaoHomepageEntries.firstClickedAt,
        lastClickedAt: kakaoHomepageEntries.lastClickedAt,
        confirmedAt: kakaoHomepageEntries.confirmedAt,
        invalidatedAt: kakaoHomepageEntries.invalidatedAt,
      })
      .from(kakaoHomepageEntries)
      .where(eq(kakaoHomepageEntries.consultationId, consultationId))
      .limit(1);
    const [naverBooking] = await db
      .select({
        id: naverBookingEntries.id,
        businessId: naverBookingEntries.businessId,
        bookingNumber: naverBookingEntries.bookingNumber,
        detailsUrl: naverBookingEntries.detailsUrl,
        status: naverBookingEntries.status,
        scheduledAt: naverBookingEntries.scheduledAt,
        sourceReceivedAt: naverBookingEntries.sourceReceivedAt,
        detailsCapturedAt: naverBookingEntries.detailsCapturedAt,
        cancelledAt: naverBookingEntries.cancelledAt,
      })
      .from(naverBookingEntries)
      .where(eq(naverBookingEntries.consultationId, consultationId))
      .limit(1);

    const [assignment] = await db
      .select({
        id: consultationAssignments.id,
        assigneeUserId: consultationAssignments.assigneeUserId,
        assignedAt: consultationAssignments.assignedAt,
        assignmentMethod: consultationAssignments.assignmentMethod,
        displayName: staffProfiles.displayName,
        organizationKey: staffOrganizations.key,
        organizationName: staffOrganizations.name,
        regionKey: staffRegions.key,
        regionName: staffRegions.name,
        department: staffMemberships.department,
        jobTitle: staffMemberships.jobTitle,
      })
      .from(consultationAssignments)
      .innerJoin(
        staffProfiles,
        eq(staffProfiles.userId, consultationAssignments.assigneeUserId),
      )
      .innerJoin(
        staffMemberships,
        eq(staffMemberships.id, consultationAssignments.assigneeMembershipId),
      )
      .innerJoin(
        staffOrganizations,
        eq(staffOrganizations.key, staffMemberships.organizationKey),
      )
      .innerJoin(
        staffRegions,
        eq(staffRegions.key, staffMemberships.regionKey),
      )
      .where(eq(consultationAssignments.consultationId, consultationId))
      .limit(1);
    const integrationEventTypes = [
      "alimtalk.consultation.request_notification.requested",
      "legalfriends.consultation.registration.requested",
      "legalfriends.consultation.invalidation.requested",
      "alimtalk.consultation.assignment_notification.requested",
    ];
    const integrationRows = await db
      .select({
        id: outboxEvents.id,
        eventType: outboxEvents.eventType,
        status: outboxEvents.status,
        attempts: outboxEvents.attempts,
        availableAt: outboxEvents.availableAt,
        lockedAt: outboxEvents.lockedAt,
        publishedAt: outboxEvents.publishedAt,
        lastError: outboxEvents.lastError,
      })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.aggregateId, consultationId),
          inArray(outboxEvents.eventType, integrationEventTypes),
        ),
      )
      .orderBy(desc(outboxEvents.occurredAt));
    const deliveryAttemptRows =
      integrationRows.length > 0
        ? await db
            .select({
              outboxEventId: outboxDeliveryAttempts.outboxEventId,
              attemptNumber: outboxDeliveryAttempts.attemptNumber,
              status: outboxDeliveryAttempts.status,
              httpStatus: outboxDeliveryAttempts.httpStatus,
              errorCode: outboxDeliveryAttempts.errorCode,
              errorMessage: outboxDeliveryAttempts.errorMessage,
              startedAt: outboxDeliveryAttempts.startedAt,
              finishedAt: outboxDeliveryAttempts.finishedAt,
            })
            .from(outboxDeliveryAttempts)
            .where(
              inArray(
                outboxDeliveryAttempts.outboxEventId,
                integrationRows.map((row) => row.id),
              ),
            )
            .orderBy(desc(outboxDeliveryAttempts.startedAt))
        : [];
    const alimtalkDeliveryRows =
      integrationRows.length > 0
        ? await db
            .select({
              outboxEventId: alimtalkDeliveries.outboxEventId,
              providerGroupId: alimtalkDeliveries.providerGroupId,
              providerMessageId: alimtalkDeliveries.providerMessageId,
              providerStatusCode: alimtalkDeliveries.providerStatusCode,
              acceptedAt: alimtalkDeliveries.acceptedAt,
            })
            .from(alimtalkDeliveries)
            .where(
              inArray(
                alimtalkDeliveries.outboxEventId,
                integrationRows.map((row) => row.id),
              ),
            )
        : [];
    const alimtalkDeliveryByEvent = new Map(
      alimtalkDeliveryRows.map((delivery) => [
        delivery.outboxEventId,
        delivery,
      ]),
    );
    const [legalFriendsCase] = assignment
      ? await db
          .select({
            caseIdx: legalFriendsCaseLinks.caseIdx,
            managerExternalAccountId:
              legalFriendsCaseLinks.managerExternalAccountId,
            caseCreatedAt: legalFriendsCaseLinks.caseCreatedAt,
            managerAssignedAt: legalFriendsCaseLinks.managerAssignedAt,
          })
          .from(legalFriendsCaseLinks)
          .where(
            eq(legalFriendsCaseLinks.consultationId, consultationId),
          )
          .limit(1)
      : [];
    const telephonyCallRows = await db
      .select({
        id: telephonyCalls.id,
        staffUserId: telephonyCalls.staffUserId,
        staffDisplayName: staffProfiles.displayName,
        endpointId: telephonyCalls.endpointId,
        endpointLabel: telephonyEndpoints.label,
        endpointLineNumber: telephonyEndpoints.lineNumber,
        endpointExtension: telephonyEndpoints.extension,
        commandStatus: telephonyCalls.commandStatus,
        outcome: telephonyCalls.outcome,
        requestedAt: telephonyCalls.requestedAt,
        dispatchedAt: telephonyCalls.dispatchedAt,
        providerRespondedAt: telephonyCalls.providerRespondedAt,
        providerStatus: telephonyCalls.providerStatus,
        providerStartedAt: telephonyCalls.providerStartedAt,
        providerEndedAt: telephonyCalls.providerEndedAt,
        providerDurationSeconds: telephonyCalls.providerDurationSeconds,
        providerBillableSeconds: telephonyCalls.providerBillableSeconds,
        reconciledAt: telephonyCalls.reconciledAt,
        disposition: telephonyCalls.disposition,
        aftercareResult: telephonyCallAftercare.result,
        dispositionConfirmedAt: telephonyCalls.dispositionConfirmedAt,
        lastErrorCode: telephonyCalls.lastErrorCode,
        lastErrorMessage: telephonyCalls.lastErrorMessage,
      })
      .from(telephonyCalls)
      .innerJoin(
        telephonyEndpoints,
        eq(telephonyEndpoints.id, telephonyCalls.endpointId),
      )
      .innerJoin(
        staffProfiles,
        eq(staffProfiles.userId, telephonyCalls.staffUserId),
      )
      .leftJoin(
        telephonyCallAftercare,
        eq(telephonyCallAftercare.telephonyCallId, telephonyCalls.id),
      )
      .where(eq(telephonyCalls.consultationId, consultationId))
      .orderBy(desc(telephonyCalls.requestedAt))
      .limit(10);
    const telephonyMessageRows = await db
      .select({
        id: telephonyMessages.id,
        staffUserId: telephonyMessages.staffUserId,
        staffDisplayName: staffProfiles.displayName,
        endpointId: telephonyMessages.endpointId,
        endpointLabel: telephonyEndpoints.label,
        endpointLineNumber: telephonyEndpoints.lineNumber,
        endpointExtension: telephonyEndpoints.extension,
        templateId: telephonyMessages.templateId,
        templateName: telephonyMessages.templateNameSnapshot,
        provider: telephonyMessages.provider,
        imageFileId: telephonyMessages.imageFileIdSnapshot,
        imageOriginalName: telephonyMessages.imageOriginalNameSnapshot,
        bodyCiphertext: telephonyMessages.bodyCiphertext,
        bodyNonce: telephonyMessages.bodyNonce,
        bodyKeyVersion: telephonyMessages.bodyKeyVersion,
        messageKind: telephonyMessages.messageKind,
        bodyByteLength: telephonyMessages.bodyByteLength,
        commandStatus: telephonyMessages.commandStatus,
        requestedAt: telephonyMessages.requestedAt,
        dispatchedAt: telephonyMessages.dispatchedAt,
        providerRespondedAt: telephonyMessages.providerRespondedAt,
        providerCode: telephonyMessages.providerCode,
        providerRemainingCount: telephonyMessages.providerRemainingCount,
        lastErrorCode: telephonyMessages.lastErrorCode,
        lastErrorMessage: telephonyMessages.lastErrorMessage,
      })
      .from(telephonyMessages)
      .innerJoin(
        telephonyEndpoints,
        eq(telephonyEndpoints.id, telephonyMessages.endpointId),
      )
      .innerJoin(
        staffProfiles,
        eq(staffProfiles.userId, telephonyMessages.staffUserId),
      )
      .where(eq(telephonyMessages.consultationId, consultationId))
      .orderBy(desc(telephonyMessages.requestedAt))
      .limit(20);
    const deliveryAttemptsByEvent = new Map<
      string,
      typeof deliveryAttemptRows
    >();
    for (const attempt of deliveryAttemptRows) {
      const attempts =
        deliveryAttemptsByEvent.get(attempt.outboxEventId) ?? [];
      attempts.push(attempt);
      deliveryAttemptsByEvent.set(attempt.outboxEventId, attempts);
    }

    const requestRows = await db
      .select()
      .from(consultationRequests)
      .where(eq(consultationRequests.consultationId, consultationId))
      .orderBy(desc(consultationRequests.submittedAt));
    const attributionRows = await db
      .select()
      .from(consultationAttributions)
      .where(eq(consultationAttributions.consultationId, consultationId));
    const attributionByRequest = new Map(
      attributionRows.map((row) => [row.requestId, row]),
    );
    const candidateIds = requestRows
      .map((row) => row.candidateConsultationId)
      .filter((id): id is string => Boolean(id));
    const candidates =
      candidateIds.length > 0
        ? await db
            .select({
              id: consultations.id,
              publicReceiptCode: consultations.publicReceiptCode,
            })
            .from(consultations)
            .where(inArray(consultations.id, candidateIds))
        : [];
    const candidateCodes = new Map(
      candidates.map((row) => [row.id, row.publicReceiptCode]),
    );

    const preferredName =
      consultation.preferredNameCiphertext &&
      consultation.preferredNameNonce &&
      consultation.preferredNameKeyVersion
        ? protection.decrypt(
            {
              ciphertext: consultation.preferredNameCiphertext,
              nonce: consultation.preferredNameNonce,
              keyVersion: consultation.preferredNameKeyVersion,
            },
            `consultations.preferred_name:${consultation.id}`,
          )
        : null;

    return {
      id: consultation.id,
      publicReceiptCode: consultation.publicReceiptCode,
      state: consultation.state,
      displayName: preferredName ?? consultation.anonymousLabel,
      contactChannel: consultation.contactChannel,
      kakaoEntry: kakaoEntry
        ? {
            id: kakaoEntry.id,
            status: kakaoEntry.status,
            nameProvided: Boolean(
              requestRows.find(
                (request) => request.id === kakaoEntry.firstRequestId,
              )?.hasProvidedName,
            ),
            clickCount: kakaoEntry.clickCount,
            firstClickedAt: kakaoEntry.firstClickedAt.toISOString(),
            lastClickedAt: kakaoEntry.lastClickedAt.toISOString(),
            confirmedAt: kakaoEntry.confirmedAt?.toISOString() ?? null,
            invalidatedAt:
              kakaoEntry.invalidatedAt?.toISOString() ?? null,
          }
        : null,
      naverBooking: naverBooking
        ? {
            id: naverBooking.id,
            businessId: naverBooking.businessId,
            bookingNumber: naverBooking.bookingNumber,
            detailsUrl: naverBooking.detailsUrl,
            status: naverBooking.status,
            scheduledAt: naverBooking.scheduledAt.toISOString(),
            sourceReceivedAt: naverBooking.sourceReceivedAt.toISOString(),
            detailsCapturedAt:
              naverBooking.detailsCapturedAt?.toISOString() ?? null,
            cancelledAt: naverBooking.cancelledAt?.toISOString() ?? null,
          }
        : null,
      assignment: assignment
        ? {
            id: assignment.id,
            assigneeUserId: assignment.assigneeUserId,
            displayName: assignment.displayName,
            organization: {
              key: assignment.organizationKey,
              name: assignment.organizationName,
            },
            region: {
              key: assignment.regionKey,
              name: assignment.regionName,
            },
            department: assignment.department,
            jobTitle: assignment.jobTitle,
            assignmentMethod: assignment.assignmentMethod,
            assignedAt: assignment.assignedAt.toISOString(),
          }
        : null,
      integrationRequests: integrationRows.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        status: row.status,
        attempts: row.attempts,
        availableAt: row.availableAt.toISOString(),
        lockedAt: row.lockedAt?.toISOString() ?? null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        lastError: row.lastError,
        providerDelivery: alimtalkDeliveryByEvent.has(row.id)
          ? {
              groupId:
                alimtalkDeliveryByEvent.get(row.id)!.providerGroupId,
              messageId:
                alimtalkDeliveryByEvent.get(row.id)!.providerMessageId,
              statusCode:
                alimtalkDeliveryByEvent.get(row.id)!.providerStatusCode,
              acceptedAt:
                alimtalkDeliveryByEvent
                  .get(row.id)!
                  .acceptedAt.toISOString(),
            }
          : null,
        deliveryAttempts: (
          deliveryAttemptsByEvent.get(row.id) ?? []
        ).map((attempt) => ({
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          httpStatus: attempt.httpStatus,
          errorCode: attempt.errorCode,
          errorMessage: attempt.errorMessage,
          startedAt: attempt.startedAt.toISOString(),
          finishedAt: attempt.finishedAt?.toISOString() ?? null,
        })),
      })),
      legalFriendsCase: legalFriendsCase
        ? {
            caseIdx: legalFriendsCase.caseIdx,
            managerExternalAccountId:
              legalFriendsCase.managerExternalAccountId,
            caseCreatedAt: legalFriendsCase.caseCreatedAt.toISOString(),
            managerAssignedAt:
              legalFriendsCase.managerAssignedAt?.toISOString() ?? null,
          }
        : null,
      telephonyMessages: telephonyMessageRows.map((message) => ({
        id: message.id,
        staffUserId: message.staffUserId,
        staffDisplayName: message.staffDisplayName,
        endpoint: {
          id: message.endpointId,
          label: message.endpointLabel,
          lineNumber: message.endpointLineNumber,
          extension: message.endpointExtension,
        },
        templateId: message.templateId,
        templateName: message.templateName,
        provider: message.provider,
        imageAttached: Boolean(message.imageFileId),
        imageName: message.imageOriginalName,
        body: protection.decrypt(
          {
            ciphertext: message.bodyCiphertext,
            nonce: message.bodyNonce,
            keyVersion: message.bodyKeyVersion,
          },
          `telephony_messages/${message.id}/body`,
        ),
        messageKind: message.messageKind,
        bodyByteLength: message.bodyByteLength,
        commandStatus: message.commandStatus,
        requestedAt: message.requestedAt.toISOString(),
        dispatchedAt: message.dispatchedAt?.toISOString() ?? null,
        providerRespondedAt:
          message.providerRespondedAt?.toISOString() ?? null,
        providerCode: message.providerCode,
        providerRemainingCount: message.providerRemainingCount,
        lastErrorCode: message.lastErrorCode,
        lastErrorMessage: message.lastErrorMessage,
      })),
      telephonyCalls: telephonyCallRows.map((call) => ({
        id: call.id,
        staffUserId: call.staffUserId,
        staffDisplayName: call.staffDisplayName,
        endpoint: {
          id: call.endpointId,
          label: call.endpointLabel,
          lineNumber: call.endpointLineNumber,
          extension: call.endpointExtension,
        },
        commandStatus: call.commandStatus,
        outcome: call.outcome,
        requestedAt: call.requestedAt.toISOString(),
        dispatchedAt: call.dispatchedAt?.toISOString() ?? null,
        providerRespondedAt:
          call.providerRespondedAt?.toISOString() ?? null,
        providerStatus: call.providerStatus,
        providerStartedAt:
          call.providerStartedAt?.toISOString() ?? null,
        providerEndedAt: call.providerEndedAt?.toISOString() ?? null,
        providerDurationSeconds: call.providerDurationSeconds,
        providerBillableSeconds: call.providerBillableSeconds,
        providerRingSeconds:
          call.providerDurationSeconds === null ||
          call.providerBillableSeconds === null
            ? null
            : Math.max(
                0,
                call.providerDurationSeconds -
                  call.providerBillableSeconds,
              ),
        reconciledAt: call.reconciledAt?.toISOString() ?? null,
        disposition: call.disposition,
        aftercareResult: call.aftercareResult,
        dispositionConfirmedAt:
          call.dispositionConfirmedAt?.toISOString() ?? null,
        lastErrorCode: call.lastErrorCode,
        lastErrorMessage: call.lastErrorMessage,
      })),
      firstRequestedAt: consultation.firstRequestedAt.toISOString(),
      lastRequestedAt: consultation.lastRequestedAt.toISOString(),
      requests: requestRows.map((request) => {
        const attribution = attributionByRequest.get(request.id);
        return {
          id: request.id,
          mode: request.mode,
          source: request.source,
          contactChannel: request.contactChannel,
          phone:
            request.phoneCiphertext &&
            request.phoneNonce &&
            request.phoneKeyVersion
              ? protection.decrypt(
                  {
                    ciphertext: request.phoneCiphertext,
                    nonce: request.phoneNonce,
                    keyVersion: request.phoneKeyVersion,
                  },
                  `consultation_requests.phone:${request.id}`,
                )
              : null,
          name:
            request.nameCiphertext &&
            request.nameNonce &&
            request.nameKeyVersion
              ? protection.decrypt(
                  {
                    ciphertext: request.nameCiphertext,
                    nonce: request.nameNonce,
                    keyVersion: request.nameKeyVersion,
                  },
                  `consultation_requests.name:${request.id}`,
                )
              : null,
          intake: JSON.parse(
            protection.decrypt(
              {
                ciphertext: request.intakeCiphertext,
                nonce: request.intakeNonce,
                keyVersion: request.intakeKeyVersion,
              },
              `consultation_requests.intake:${request.id}`,
            ),
          ) as unknown,
          contactPreference: request.contactPreference,
          contactWindowStart: request.contactWindowStart?.toISOString() ?? null,
          contactWindowEnd: request.contactWindowEnd?.toISOString() ?? null,
          privacyNoticeVersion: request.privacyNoticeVersion,
          privacyBasis: request.privacyBasis,
          consentAgreedAt: request.consentAgreedAt?.toISOString() ?? null,
          dedupeOutcome: request.dedupeOutcome,
          candidateReceiptCode: request.candidateConsultationId
            ? candidateCodes.get(request.candidateConsultationId) ?? null
            : null,
          submittedAt: request.submittedAt.toISOString(),
          attribution: attribution
            ? {
                firstLandingPageKey: attribution.landingPageKeySnapshot,
                firstLandingPageVersion:
                  attribution.landingPageVersionSnapshot,
                submittedFromPath: attribution.submittedFromPath,
                ctaPath: attribution.ctaPath,
                ctaPlacement: attribution.ctaPlacement,
                source: attribution.sourceSnapshot,
              }
            : null,
        };
      }),
    };
  }

  return {
    assignToSelf,
    confirmKakaoHomepageEntry,
    detail,
    ingestNaverBooking,
    invalidateLegalFriendsCase,
    invalidateKakaoHomepageEntry,
    list,
    submit,
    submitSelfDiagnosis,
    submitKakao,
    submitKakaoHomepageEntry,
  };
}

export type ConsultationService = ReturnType<
  typeof createConsultationService
>;
