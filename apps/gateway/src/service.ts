import { randomBytes } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
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
  CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL,
  safeConsultationCustomerDisplayName,
  safeConsultationCustomerName,
  usableConsultationCustomerName,
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
  type ConsultationAssigneeTransferInput,
  type KakaoConsultationReceipt,
  type LegalFriendsConsultationHandling,
  type PlatformEvent,
  type ConsultationSubmission,
  type ConsultationSubmissionResponse,
  type DedupeOutcome,
  type ExistingConsultationCandidate,
  type ResidenceRegion,
  type SelfDiagnosisCaseProfile,
  type SelfDiagnosisSubmission,
  type SelfDiagnosisSubmissionResponse,
} from "@lawand/core";
import {
  alimtalkDeliveries,
  consultationAssignmentTransfers,
  consultationAssignments,
  consultationAttributions,
  consultationDirectorySources,
  consultationGroupEvents,
  consultationGroupMembers,
  consultationGroups,
  consultationLegalFriendsHandlings,
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
  staffExternalAccounts,
  staffMemberships,
  staffOrganizations,
  staffProfiles,
  staffRegions,
  staffUsers,
  telephonyCallAftercare,
  telephonyCalls,
  telephonyEndpoints,
  telephonyFollowUpTasks,
  telephonyMessages,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";
import type { StaffPrincipal } from "./auth.js";
import { consultationScheduleFollowUp } from "./consultation-follow-up.js";
import {
  excludeOwnLegalFriendsCase,
  existingConsultationPhoneDirectoryCustomersQuery,
  linkedLegalFriendsCaseNamesQuery,
  linkedLegalFriendsDisplayName,
  summarizeExistingConsultationPhoneDirectoryCustomers,
  summarizeLinkedLegalFriendsCaseNames,
  type ConsultationPhoneDirectoryCandidate,
  type ExistingConsultationPhoneDirectoryCustomerRow,
  type LinkedLegalFriendsCaseNameRow,
} from "./phone-directory.js";
import { legalFriendsResidenceRegion } from "./telephony-service.js";
import {
  CURRENT_NAVER_BOOKING_BASIS_VERSION,
  type NaverBookingEmail,
} from "./naver-booking.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

type ConsultationDirectorySnapshot = {
  clientName: string | null;
  phone: string | null;
  residenceRegion: ResidenceRegion | null;
  caseType: number;
  caseState: number;
  isClosed: boolean;
  isRepealed: boolean;
  courtName: string | null;
  caseNumber: string | null;
  caseName: string | null;
  staffNames: string[];
  caseCreatedOn: string;
  caseUpdatedOn: string;
};

type LegalFriendsPhoneMatchRow = {
  client_idx: number;
  client_name: string | null;
  case_idx: number;
  case_number: string | null;
  case_name: string | null;
  case_type: number;
  case_state: number;
  is_closed: number | null;
  is_repealed: number | null;
  primary_staff_name: string | null;
  secondary_staff_name: string | null;
  tertiary_staff_name: string | null;
  court_name: string | null;
  case_created_on: string;
  case_updated_on: string;
};

type LegalFriendsDirectorySourceRow = {
  client_name: string;
  phone: string | null;
  living_place: string | null;
  case_type: number;
  case_state: number;
  is_closed: number | null;
  is_repealed: number | null;
  court_name: string | null;
  case_number: string | null;
  case_name: string | null;
  primary_staff_name: string | null;
  secondary_staff_name: string | null;
  tertiary_staff_name: string | null;
  case_created_on: string;
  case_updated_on: string;
};

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
      | "consultation_not_assignable"
      | "consultation_group_noncanonical"
      | "legalfriends_review_required"
      | "legalfriends_handling_invalid",
    message: string,
  ) {
    super(message);
  }
}

export class ConsultationSoftDeleteError extends Error {
  constructor(
    readonly code:
      | "consultation_not_found"
      | "consultation_not_staff_created"
      | "consultation_grouped"
      | "assignment_transfer_pending",
    message: string,
  ) {
    super(message);
  }
}

export class ConsultationGroupError extends Error {
  constructor(
    readonly code:
      | "consultation_not_found"
      | "target_not_found"
      | "same_consultation"
      | "already_grouped"
      | "group_not_found"
      | "last_group_member"
      | "consultation_not_groupable"
      | "phone_mismatch"
      | "assignment_conflict"
      | "legalfriends_case_conflict",
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
      | "invalidation_forbidden"
      | "assignment_transfer_pending",
    message: string,
  ) {
    super(message);
  }
}

export class ConsultationAssigneeTransferError extends Error {
  constructor(
    readonly code:
      | "consultation_not_found"
      | "assignment_not_found"
      | "consultation_not_transferable"
      | "target_assignee_invalid"
      | "same_assignee"
      | "case_not_registered"
      | "case_invalidated"
      | "invalidation_pending"
      | "transfer_already_pending",
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

function dedupeOutcomeForDecision(
  decision: ReturnType<typeof classifyConsultationSubmission>,
): DedupeOutcome {
  switch (decision.action) {
    case "attach_exact_duplicate":
      return "exact_duplicate";
    case "attach_identity_enrichment":
      return "identity_enrichment";
    case "attach_repeat_request":
      return decision.stage === "before_assignment"
        ? "repeat_unassigned"
        : "repeat_assigned";
    case "create_suspected_duplicate":
      return "suspected_duplicate";
    default:
      return "new";
  }
}

function normalizeConsultationName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("ko-KR");
}

function requiresLegalFriendsHandling(source: string | null | undefined) {
  return (
    source === "homepage" ||
    source === "homepage_kakao" ||
    source === "erp_staff"
  );
}

function directorySnapshot(
  source: LegalFriendsDirectorySourceRow,
): ConsultationDirectorySnapshot {
  return {
    clientName: source.client_name
      ? safeConsultationCustomerDisplayName(source.client_name)
      : null,
    phone: source.phone,
    residenceRegion: legalFriendsResidenceRegion(source.living_place),
    caseType: source.case_type,
    caseState: source.case_state,
    isClosed: source.is_closed === 1,
    isRepealed: source.is_repealed === 1,
    courtName: source.court_name,
    caseNumber: source.case_number,
    caseName: source.case_name,
    staffNames: [
      source.primary_staff_name,
      source.secondary_staff_name,
      source.tertiary_staff_name,
    ].filter((name): name is string => Boolean(name)),
    caseCreatedOn: source.case_created_on,
    caseUpdatedOn: source.case_updated_on,
  };
}

function encryptedOrNull(
  protection: DataProtection,
  value: string | undefined,
  context: string,
) {
  return value ? protection.encrypt(value, context) : null;
}

function kakaoDisplayName(displayName: string, publicReceiptCode: string) {
  if (displayName === CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL) {
    return displayName;
  }
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

  type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

  async function activeGroup(
    tx: Transaction,
    consultationId: string,
  ) {
    const [row] = await tx
      .select({
        groupId: consultationGroups.id,
        canonicalConsultationId: consultationGroups.canonicalConsultationId,
        phoneFingerprint: consultationGroups.phoneFingerprint,
        firstRequestedAt: consultationGroups.firstRequestedAt,
        lastRequestedAt: consultationGroups.lastRequestedAt,
      })
      .from(consultationGroupMembers)
      .innerJoin(
        consultationGroups,
        eq(consultationGroups.id, consultationGroupMembers.groupId),
      )
      .where(
        and(
          eq(consultationGroupMembers.consultationId, consultationId),
          eq(consultationGroups.status, "active"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function groupMemberIds(
    tx: Transaction,
    consultationId: string,
  ) {
    const group = await activeGroup(tx, consultationId);
    if (!group) {
      return {
        group: null,
        canonicalConsultationId: consultationId,
        memberIds: [consultationId],
      };
    }
    const rows = await tx
      .select({ consultationId: consultationGroupMembers.consultationId })
      .from(consultationGroupMembers)
      .where(eq(consultationGroupMembers.groupId, group.groupId));
    return {
      group,
      canonicalConsultationId: group.canonicalConsultationId,
      memberIds: rows.map((row) => row.consultationId),
    };
  }

  async function automaticallyGroupByPhone(
    tx: Transaction,
    input: {
      consultationId: string;
      phoneFingerprint: Buffer | null;
      requestedAt: Date;
    },
  ) {
    if (!input.phoneFingerprint) return null;
    const [candidate] = await tx
      .select({
        id: consultations.id,
        state: consultations.state,
        firstRequestedAt: consultations.firstRequestedAt,
        lastRequestedAt: consultations.lastRequestedAt,
      })
      .from(consultations)
      .where(
        and(
          ne(consultations.id, input.consultationId),
          eq(consultations.phoneFingerprint, input.phoneFingerprint),
          isNull(consultations.softDeletedAt),
          ne(consultations.state, "closed"),
          gte(
            consultations.lastRequestedAt,
            new Date(
              input.requestedAt.getTime() -
                DEDUPE_WINDOWS.suspectedDuplicateMs,
            ),
          ),
          lt(
            consultations.lastRequestedAt,
            new Date(input.requestedAt.getTime() + 1),
          ),
          sql<boolean>`not exists (
            select 1
            from ${kakaoHomepageEntries}
            where ${kakaoHomepageEntries.consultationId} = ${consultations.id}
              and ${kakaoHomepageEntries.status} = 'invalid'
          )`,
          sql<boolean>`not exists (
            select 1
            from ${consultationGroupMembers} candidate_member
            inner join ${consultationGroups} candidate_group
              on candidate_group.id = candidate_member.group_id
             and candidate_group.status = 'active'
            inner join ${consultationGroupMembers} grouped_member
              on grouped_member.group_id = candidate_member.group_id
            inner join ${kakaoHomepageEntries} grouped_kakao
              on grouped_kakao.consultation_id = grouped_member.consultation_id
             and grouped_kakao.status = 'invalid'
            where candidate_member.consultation_id = ${consultations.id}
          )`,
        ),
      )
      .orderBy(desc(consultations.lastRequestedAt))
      .limit(1)
      .for("update");
    if (!candidate) return null;

    const candidateGroup = await activeGroup(tx, candidate.id);
    const groupId = candidateGroup?.groupId ?? createEventId();
    const canonicalConsultationId =
      candidateGroup?.canonicalConsultationId ?? candidate.id;
    if (!candidateGroup) {
      await tx.insert(consultationGroups).values({
        id: groupId,
        canonicalConsultationId,
        phoneFingerprint: input.phoneFingerprint,
        status: "active",
        createdReason: "automatic_phone_7d",
        createdByUserId: null,
        firstRequestedAt: candidate.firstRequestedAt,
        lastRequestedAt: input.requestedAt,
        createdAt: input.requestedAt,
        updatedAt: input.requestedAt,
      });
      await tx.insert(consultationGroupMembers).values({
        consultationId: candidate.id,
        groupId,
        linkMethod: "automatic_phone_7d",
        linkedByUserId: null,
        linkedAt: input.requestedAt,
        createdAt: input.requestedAt,
      });
      await tx.insert(consultationGroupEvents).values({
        id: createEventId(),
        groupId,
        consultationId: candidate.id,
        eventType: "created",
        actorUserId: null,
        metadata: { reason: "same_phone_within_7_days" },
        occurredAt: input.requestedAt,
        createdAt: input.requestedAt,
      });
    }
    await tx.insert(consultationGroupMembers).values({
      consultationId: input.consultationId,
      groupId,
      linkMethod: "automatic_phone_7d",
      linkedByUserId: null,
      linkedAt: input.requestedAt,
      createdAt: input.requestedAt,
    });
    await tx.insert(consultationGroupEvents).values({
      id: createEventId(),
      groupId,
      consultationId: input.consultationId,
      eventType: "linked",
      actorUserId: null,
      metadata: {
        reason: "same_phone_within_7_days",
        canonicalConsultationId,
      },
      occurredAt: input.requestedAt,
      createdAt: input.requestedAt,
    });
    await tx
      .update(consultationGroups)
      .set({
        lastRequestedAt: input.requestedAt,
        updatedAt: input.requestedAt,
      })
      .where(eq(consultationGroups.id, groupId));
    await tx
      .update(consultations)
      .set({
        lastRequestedAt: input.requestedAt,
        updatedAt: input.requestedAt,
      })
      .where(eq(consultations.id, canonicalConsultationId));
    const [canonical] = await tx
      .select({ state: consultations.state })
      .from(consultations)
      .where(eq(consultations.id, canonicalConsultationId))
      .limit(1);
    return {
      groupId,
      canonicalConsultationId,
      canonicalState: canonical?.state ?? candidate.state,
    };
  }

  async function existingLegalFriendsCustomersByConsultation(
    candidates: readonly ConsultationPhoneDirectoryCandidate[],
  ) {
    const normalizedCandidates = candidates
      .map((candidate) => ({
        ...candidate,
        phone: candidate.phone.replace(/[^0-9]/g, ""),
        ownCaseIdx: candidate.ownCaseIdx?.trim() || null,
      }))
      .filter(
        (candidate) =>
          candidate.phone.length >= 9 && candidate.phone.length <= 15,
      );
    if (normalizedCandidates.length === 0) {
      return new Map<string, string[]>();
    }

    try {
      const result = await db.execute(
        existingConsultationPhoneDirectoryCustomersQuery(
          normalizedCandidates,
        ),
      );
      return summarizeExistingConsultationPhoneDirectoryCustomers(
        result.rows as ExistingConsultationPhoneDirectoryCustomerRow[],
      );
    } catch {
      console.error(
        JSON.stringify({
          event: "consultation_existing_customer_lookup_failed",
          consultationCount: normalizedCandidates.length,
          occurredAt: new Date().toISOString(),
        }),
      );
      return new Map<string, string[]>();
    }
  }

  async function linkedLegalFriendsCaseNames(caseIdxs: readonly string[]) {
    const normalizedCaseIdxs = [
      ...new Set(caseIdxs.map((caseIdx) => caseIdx.trim()).filter(Boolean)),
    ];
    if (normalizedCaseIdxs.length === 0) return new Map<string, string>();

    try {
      const result = await db.execute(
        linkedLegalFriendsCaseNamesQuery(normalizedCaseIdxs),
      );
      return summarizeLinkedLegalFriendsCaseNames(
        result.rows as LinkedLegalFriendsCaseNameRow[],
      );
    } catch {
      console.error(
        JSON.stringify({
          event: "linked_legalfriends_case_name_lookup_failed",
          caseCount: normalizedCaseIdxs.length,
          occurredAt: new Date().toISOString(),
        }),
      );
      return new Map<string, string>();
    }
  }

  async function legalFriendsCustomerMatches(phone: string) {
    const normalizedPhone = phone.replace(/[^0-9]/g, "");
    if (normalizedPhone.length < 9 || normalizedPhone.length > 15) return [];
    const result = await db.execute(
      sql<LegalFriendsPhoneMatchRow>`SELECT * FROM public.resolve_inbound_phone_directory(${normalizedPhone})`,
    );
    return (result.rows as LegalFriendsPhoneMatchRow[]).map((row) => ({
      clientIdx: row.client_idx,
      clientName: safeConsultationCustomerDisplayName(
        row.client_name,
        "이름 미확인",
      ),
      caseIdx: row.case_idx,
      caseNumber: row.case_number,
      caseName: row.case_name,
      caseType: row.case_type,
      caseState: row.case_state,
      isClosed: row.is_closed === 1,
      isRepealed: row.is_repealed === 1,
      courtName: row.court_name,
      staffNames: [
        row.primary_staff_name,
        row.secondary_staff_name,
        row.tertiary_staff_name,
      ].filter((name): name is string => Boolean(name)),
      caseCreatedOn: row.case_created_on,
      caseUpdatedOn: row.case_updated_on,
    }));
  }

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
    const usableSubmissionName = usableConsultationCustomerName(
      submission.name,
    );
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
    const nameFingerprint = usableSubmissionName
      ? protection.fingerprint({
          kind: "consultation_name",
          value: normalizeConsultationName(usableSubmissionName),
        })
      : null;

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
          preferredNameCiphertext: consultations.preferredNameCiphertext,
          preferredNameNonce: consultations.preferredNameNonce,
          preferredNameKeyVersion: consultations.preferredNameKeyVersion,
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

      const candidateGroupRows = candidateRows.length > 0
        ? await tx
            .select({
              consultationId: consultationGroupMembers.consultationId,
              canonicalConsultationId:
                consultationGroups.canonicalConsultationId,
            })
            .from(consultationGroupMembers)
            .innerJoin(
              consultationGroups,
              eq(consultationGroups.id, consultationGroupMembers.groupId),
            )
            .where(
              and(
                inArray(
                  consultationGroupMembers.consultationId,
                  candidateRows.map((row) => row.consultationId),
                ),
                eq(consultationGroups.status, "active"),
              ),
            )
        : [];
      const canonicalByCandidate = new Map(
        candidateGroupRows.map((row) => [
          row.consultationId,
          row.canonicalConsultationId,
        ]),
      );
      const groupedCanonicalIds = [
        ...new Set(
          candidateGroupRows.map((row) => row.canonicalConsultationId),
        ),
      ];
      const groupedCanonicalRows = groupedCanonicalIds.length > 0
        ? await tx
            .select({
              consultationId: consultations.id,
              state: consultations.state,
              preferredNameCiphertext:
                consultations.preferredNameCiphertext,
              preferredNameNonce: consultations.preferredNameNonce,
              preferredNameKeyVersion:
                consultations.preferredNameKeyVersion,
            })
            .from(consultations)
            .where(inArray(consultations.id, groupedCanonicalIds))
        : [];
      const groupedCanonicalById = new Map(
        groupedCanonicalRows.map((row) => [row.consultationId, row]),
      );

      const seenConsultations = new Set<string>();
      const candidates: ExistingConsultationCandidate[] = [];
      for (const row of candidateRows) {
        const canonicalConsultationId =
          canonicalByCandidate.get(row.consultationId) ?? row.consultationId;
        if (seenConsultations.has(canonicalConsultationId)) continue;
        seenConsultations.add(canonicalConsultationId);
        const canonical = groupedCanonicalById.get(canonicalConsultationId);
        const identityRow = canonical ?? row;
        const nameCiphertext = identityRow.preferredNameCiphertext;
        const nameNonce = identityRow.preferredNameNonce;
        const nameKeyVersion = identityRow.preferredNameKeyVersion;
        const candidateName =
          nameCiphertext &&
          nameNonce &&
          nameKeyVersion
            ? protection.decrypt(
                {
                  ciphertext: nameCiphertext,
                  nonce: nameNonce,
                  keyVersion: nameKeyVersion,
                },
                `consultations.preferred_name:${canonicalConsultationId}`,
              )
            : null;
        const usableCandidateName = usableConsultationCustomerName(
          candidateName,
        );
        candidates.push({
          consultationId: canonicalConsultationId,
          latestRequestId: row.requestId,
          state: canonical?.state ?? row.state,
          phoneFingerprint: phoneFingerprint.toString("hex"),
          latestPayloadFingerprint: row.payloadFingerprint.toString("hex"),
          latestJourneySessionId: row.journeySessionId,
          hasProvidedName: Boolean(usableCandidateName),
          nameFingerprint: usableCandidateName
            ? protection
                .fingerprint({
                  kind: "consultation_name",
                  value: normalizeConsultationName(usableCandidateName),
                })
                .toString("hex")
            : null,
          latestRequestAt: row.submittedAt,
        });
      }

      const decision = classifyConsultationSubmission(
        {
          phoneFingerprint: phoneFingerprint.toString("hex"),
          payloadFingerprint: payloadFingerprint.toString("hex"),
          journeySessionId: submission.attribution?.journeySessionId ?? null,
          hasProvidedName: Boolean(usableSubmissionName),
          nameFingerprint: nameFingerprint?.toString("hex") ?? null,
          submittedAt,
        },
        candidates,
      );

      if (decision.action === "idempotent_replay") {
        throw new Error("트랜잭션 내 멱등성 판정 경로가 올바르지 않습니다.");
      }

      const incomingNormalizedName = usableSubmissionName
        ? normalizeConsultationName(usableSubmissionName)
        : null;
      const repeatGroupHasSameName =
        decision.action === "attach_repeat_request" &&
        candidateRows.some((row) => {
          if (
            (canonicalByCandidate.get(row.consultationId) ??
              row.consultationId) !== decision.consultationId
          ) {
            return false;
          }
          const candidateName =
            row.preferredNameCiphertext &&
            row.preferredNameNonce &&
            row.preferredNameKeyVersion
              ? protection.decrypt(
                  {
                    ciphertext: row.preferredNameCiphertext,
                    nonce: row.preferredNameNonce,
                    keyVersion: row.preferredNameKeyVersion,
                  },
                  `consultations.preferred_name:${row.consultationId}`,
                )
              : null;
          const usableCandidateName = usableConsultationCustomerName(
            candidateName,
          );
          return (
            (usableCandidateName
              ? normalizeConsultationName(usableCandidateName)
              : null) === incomingNormalizedName
          );
        });
      const createGroupedMember =
        decision.action === "attach_repeat_request" &&
        !repeatGroupHasSameName;
      const createConsultation =
        decision.createConsultation || createGroupedMember;
      const consultationId = createConsultation
        ? createConsultationId()
        : decision.consultationId;
      const requestId = createConsultationRequestId();
      const dedupeOutcome = dedupeOutcomeForDecision(decision);
      let publicReceiptCode: string;

      const preferredName = encryptedOrNull(
        protection,
        submission.name,
        `consultations.preferred_name:${consultationId}`,
      );

      if (createConsultation) {
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
        const requestGroup = await activeGroup(tx, consultationId);
        if (requestGroup) {
          await tx
            .update(consultationGroups)
            .set({
              lastRequestedAt: submittedAt,
              updatedAt: submittedAt,
            })
            .where(eq(consultationGroups.id, requestGroup.groupId));
        }
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
        hasProvidedName: Boolean(usableSubmissionName),
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

      if (createConsultation) {
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

      const groupedRepeat = createGroupedMember
        ? await automaticallyGroupByPhone(tx, {
            consultationId,
            phoneFingerprint,
            requestedAt: submittedAt,
          })
        : null;
      if (createGroupedMember && !groupedRepeat) {
        throw new Error("반복 상담을 기존 상담 묶음에 연결하지 못했습니다.");
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
      if (decision.action === "attach_repeat_request") {
        const eventConsultationId =
          groupedRepeat?.canonicalConsultationId ?? consultationId;
        const event: PlatformEvent = {
          eventId: createEventId(),
          eventType: "consultation.request.updated",
          eventVersion: 1,
          occurredAt,
          producer: "lawand.gateway",
          correlationId: eventConsultationId,
          data: {
            consultationId: eventConsultationId,
            requestId,
            intakeRef: `consultation_requests/${requestId}`,
            ...(attributionId
              ? {
                  attributionRef: `consultation_attributions/${attributionId}`,
                }
              : {}),
            updateReason: "repeat_request",
            repeatStage: decision.stage,
            dedupeOutcome:
              decision.stage === "before_assignment"
                ? "repeat_unassigned"
                : "repeat_assigned",
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
        const existingScope = await groupMemberIds(
          tx,
          existing.consultationId,
        );
        if (existingScope.group) {
          await tx
            .update(consultationGroups)
            .set({
              lastRequestedAt: receivedAt,
              updatedAt: receivedAt,
            })
            .where(eq(consultationGroups.id, existingScope.group.groupId));
          await tx
            .update(consultations)
            .set({ lastRequestedAt: receivedAt, updatedAt: receivedAt })
            .where(
              eq(
                consultations.id,
                existingScope.canonicalConsultationId,
              ),
            );
        }
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
    const entryPhoneFingerprint = input.phone
      ? protection.fingerprint(input.phone)
      : null;

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(idempotencyFingerprint)} as bigint))`,
      );
      if (entryPhoneFingerprint) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(entryPhoneFingerprint)} as bigint))`,
        );
      }

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
        const existingScope = await groupMemberIds(
          tx,
          existing.consultationId,
        );
        if (existingScope.group) {
          await tx
            .update(consultationGroups)
            .set({
              lastRequestedAt: receivedAt,
              updatedAt: receivedAt,
            })
            .where(eq(consultationGroups.id, existingScope.group.groupId));
          await tx
            .update(consultations)
            .set({ lastRequestedAt: receivedAt, updatedAt: receivedAt })
            .where(
              eq(
                consultations.id,
                existingScope.canonicalConsultationId,
              ),
            );
        }
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
      const submittedDisplayName = normalizeKakaoDisplayName(input.displayName);
      const usableSubmittedDisplayName = usableConsultationCustomerName(
        submittedDisplayName,
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
      const phoneFingerprint = entryPhoneFingerprint;
      const requestPhoneEncrypted = input.phone
        ? protection.encrypt(
            input.phone,
            `consultation_requests.phone:${requestId}`,
          )
        : null;
      const intakeEncrypted = protection.encrypt(
        JSON.stringify({
          residenceRegion: input.residenceRegion,
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
        residenceRegion: input.residenceRegion,
        phone: input.phone,
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
        phoneFingerprint,
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
        phoneFingerprint,
        phoneCiphertext: requestPhoneEncrypted?.ciphertext ?? null,
        phoneNonce: requestPhoneEncrypted?.nonce ?? null,
        phoneKeyVersion: requestPhoneEncrypted?.keyVersion ?? null,
        hasProvidedName: Boolean(usableSubmittedDisplayName),
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

      const grouped = await automaticallyGroupByPhone(tx, {
        consultationId,
        phoneFingerprint,
        requestedAt: receivedAt,
      });
      const event: PlatformEvent = grouped
        ? {
            eventId: createEventId(),
            eventType: "consultation.request.updated",
            eventVersion: 1,
            occurredAt: receivedAt.toISOString(),
            producer: "lawand.gateway",
            correlationId: grouped.canonicalConsultationId,
            data: {
              consultationId: grouped.canonicalConsultationId,
              requestId,
              intakeRef: `consultation_requests/${requestId}`,
              ...(attributionId
                ? {
                    attributionRef:
                      `consultation_attributions/${attributionId}`,
                  }
                : {}),
              updateReason: "repeat_request",
              repeatStage:
                grouped.canonicalState === "requested"
                  ? "before_assignment"
                  : "after_assignment",
              dedupeOutcome:
                grouped.canonicalState === "requested"
                  ? "repeat_unassigned"
                  : "repeat_assigned",
            },
          }
        : {
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
      if (grouped) {
        await tx
          .update(consultationRequests)
          .set({
            dedupeOutcome:
              grouped.canonicalState === "requested"
                ? "repeat_unassigned"
                : "repeat_assigned",
          })
          .where(eq(consultationRequests.id, requestId));
      }
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(eventRow(event));

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
      const groupScope = await groupMemberIds(tx, consultationId);
      if (groupScope.group && groupScope.memberIds.length > 1) {
        throw new KakaoHomepageEntryError(
          "consultation_not_actionable",
          "묶음에 포함된 접수는 먼저 별도 상담으로 분리한 뒤 미진입·무효 처리해 주세요.",
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

      const invalidatedEvent: PlatformEvent = {
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
      const registrationEvent: PlatformEvent = {
        eventId: createEventId(),
        eventType: "legalfriends.consultation.registration.requested",
        eventVersion: 1,
        occurredAt: now.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        causationId: invalidatedEvent.eventId,
        data: {
          consultationId,
          requestId: entry.firstRequestId,
          intakeRef: `consultation_requests/${entry.firstRequestId}`,
          registrationTarget: "invalid_manager",
          requestedByUserId: actor.id,
          targetManagerExternalAccountId:
            LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
          targetManagerMemberIdx:
            LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
        },
      };
      assertPlatformEvent(invalidatedEvent);
      assertPlatformEvent(registrationEvent);
      await tx
        .insert(outboxEvents)
        .values([eventRow(invalidatedEvent), eventRow(registrationEvent)]);

      return {
        consultationId,
        entryId: entry.id,
        status: "invalid" as const,
        invalidatedAt: now.toISOString(),
        registrationEventId: registrationEvent.eventId,
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
      const internalName = `${
        safeConsultationCustomerName(input.maskedName) ?? "예약자"
      }_네이버예약`;
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
    requestedHandling?: LegalFriendsConsultationHandling,
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
      const assignmentScope = await groupMemberIds(tx, consultationId);
      if (assignmentScope.canonicalConsultationId !== consultationId) {
        throw new ConsultationAssignmentError(
          "consultation_group_noncanonical",
          "묶음의 대표 상담에서 담당자를 지정해 주세요.",
        );
      }
      if (assignmentScope.group) {
        const groupLock = protection.fingerprint({
          kind: "consultation_group_assignment",
          groupId: assignmentScope.group.groupId,
        });
        await tx.execute(
          sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(groupLock)} as bigint))`,
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
          inArray(
            consultationAssignments.consultationId,
            assignmentScope.memberIds,
          ),
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

      const homepageKakaoEntries = await tx
        .select({
          id: kakaoHomepageEntries.id,
          consultationId: kakaoHomepageEntries.consultationId,
          firstRequestId: kakaoHomepageEntries.firstRequestId,
          nameProvided: consultationRequests.hasProvidedName,
          status: kakaoHomepageEntries.status,
        })
        .from(kakaoHomepageEntries)
        .innerJoin(
          consultationRequests,
          eq(kakaoHomepageEntries.firstRequestId, consultationRequests.id),
        )
        .where(
          inArray(
            kakaoHomepageEntries.consultationId,
            assignmentScope.memberIds,
          ),
        )
        .orderBy(desc(kakaoHomepageEntries.lastClickedAt));

      const [latestRequest] = await tx
        .select({
          id: consultationRequests.id,
          source: consultationRequests.source,
          contactChannel: consultationRequests.contactChannel,
          phoneCiphertext: consultationRequests.phoneCiphertext,
          phoneNonce: consultationRequests.phoneNonce,
          phoneKeyVersion: consultationRequests.phoneKeyVersion,
        })
        .from(consultationRequests)
        .where(
          inArray(
            consultationRequests.consultationId,
            assignmentScope.memberIds,
          ),
        )
        .orderBy(
          sql`${consultationRequests.phoneCiphertext} IS NOT NULL DESC`,
          desc(consultationRequests.submittedAt),
        )
        .limit(1);
      if (!latestRequest) {
        throw new ConsultationAssignmentError(
          "consultation_not_assignable",
          "상담 요청 원장을 찾을 수 없어 담당자를 지정하지 못했습니다.",
        );
      }
      const [latestVisibleRequest] = await tx
        .select({
          id: consultationRequests.id,
          source: consultationRequests.source,
          contactChannel: consultationRequests.contactChannel,
          contactPreference: consultationRequests.contactPreference,
          contactWindowStart: consultationRequests.contactWindowStart,
          contactWindowEnd: consultationRequests.contactWindowEnd,
        })
        .from(consultationRequests)
        .where(
          inArray(
            consultationRequests.consultationId,
            assignmentScope.memberIds,
          ),
        )
        .orderBy(desc(consultationRequests.submittedAt))
        .limit(1);

      const [directorySource] = await tx
        .select({ consultationId: consultationDirectorySources.consultationId })
        .from(consultationDirectorySources)
        .where(eq(consultationDirectorySources.consultationId, consultationId))
        .limit(1);
      const [storedHandling] = await tx
        .select({ mode: consultationLegalFriendsHandlings.mode })
        .from(consultationLegalFriendsHandlings)
        .where(
          eq(consultationLegalFriendsHandlings.consultationId, consultationId),
        )
        .limit(1);
      let legalFriendsHandlingMode = storedHandling?.mode ?? null;
      const reviewablePhone =
        requiresLegalFriendsHandling(latestRequest.source) &&
        latestRequest.phoneCiphertext &&
        latestRequest.phoneNonce &&
        latestRequest.phoneKeyVersion
          ? protection.decrypt(
              {
                ciphertext: latestRequest.phoneCiphertext,
                nonce: latestRequest.phoneNonce,
                keyVersion: latestRequest.phoneKeyVersion,
              },
              `consultation_requests.phone:${latestRequest.id}`,
            )
          : null;
      if (!directorySource && reviewablePhone) {
        const matchResult = await tx.execute(
          sql<LegalFriendsPhoneMatchRow>`SELECT * FROM public.resolve_inbound_phone_directory(${reviewablePhone})`,
        );
        const matches = matchResult.rows as LegalFriendsPhoneMatchRow[];
        if (matches.length > 0 && !legalFriendsHandlingMode) {
          if (!requestedHandling) {
            throw new ConsultationAssignmentError(
              "legalfriends_review_required",
              "리걸프렌즈 기존 고객입니다. 기존 사건 문의인지 새 사건 상담인지 먼저 선택해 주세요.",
            );
          }
          let selectedSource: LegalFriendsDirectorySourceRow | null = null;
          if (requestedHandling.mode === "existing_case") {
            const selectedMatch = matches.find(
              (match) =>
                match.client_idx === requestedHandling.clientIdx &&
                match.case_idx === requestedHandling.caseIdx,
            );
            if (!selectedMatch) {
              throw new ConsultationAssignmentError(
                "legalfriends_handling_invalid",
                "현재 연락처와 일치하는 리걸프렌즈 사건을 다시 선택해 주세요.",
              );
            }
            const sourceResult = await tx.execute(
              sql<LegalFriendsDirectorySourceRow>`SELECT * FROM public.resolve_legalfriends_directory_consultation_source(${requestedHandling.clientIdx}, ${requestedHandling.caseIdx})`,
            );
            selectedSource =
              (sourceResult.rows as LegalFriendsDirectorySourceRow[])[0] ??
              null;
            if (!selectedSource) {
              throw new ConsultationAssignmentError(
                "legalfriends_handling_invalid",
                "삭제되었거나 현재 조회할 수 없는 리걸프렌즈 사건입니다.",
              );
            }
          }

          await tx.insert(consultationLegalFriendsHandlings).values({
            consultationId,
            mode: requestedHandling.mode,
            directoryClientIdx:
              requestedHandling.mode === "existing_case"
                ? requestedHandling.clientIdx
                : null,
            directoryCaseIdx:
              requestedHandling.mode === "existing_case"
                ? requestedHandling.caseIdx
                : null,
            decidedByUserId: actor.id,
            decidedAt: now,
            createdAt: now,
          });
          legalFriendsHandlingMode = requestedHandling.mode;

          if (
            requestedHandling.mode === "existing_case" &&
            selectedSource
          ) {
            const encryptedSnapshot = protection.encrypt(
              JSON.stringify(directorySnapshot(selectedSource)),
              `consultation_directory_sources/${consultationId}/snapshot`,
            );
            await tx.insert(consultationDirectorySources).values({
              consultationId,
              consultationRequestId: latestRequest.id,
              directoryClientIdx: requestedHandling.clientIdx,
              directoryCaseIdx: requestedHandling.caseIdx,
              relationship: "customer",
              snapshotCiphertext: encryptedSnapshot.ciphertext,
              snapshotNonce: encryptedSnapshot.nonce,
              snapshotKeyVersion: encryptedSnapshot.keyVersion,
              createdByUserId: actor.id,
              createdAt: now,
            });
          }
          await tx.insert(staffAuditLogs).values({
            id: createEventId(),
            actorUserId: actor.id,
            action: "consultation.legalfriends_handling_decided",
            targetType: "consultation",
            targetId: consultationId,
            metadata: {
              mode: requestedHandling.mode,
              ...(requestedHandling.mode === "existing_case"
                ? {
                    directoryClientIdx: requestedHandling.clientIdx,
                    directoryCaseIdx: requestedHandling.caseIdx,
                  }
                : {}),
            },
            occurredAt: now,
            createdAt: now,
          });
        } else if (matches.length === 0 && requestedHandling) {
          throw new ConsultationAssignmentError(
            "legalfriends_handling_invalid",
            "현재 연락처와 일치하는 리걸프렌즈 고객이 없어 처리 구분을 적용할 수 없습니다.",
          );
        }
      }
      const kakaoAssignmentPolicies = homepageKakaoEntries.map((entry) => ({
        entry,
        policy: kakaoHomepageEntryAssignmentPolicy(entry),
      }));
      if (
        kakaoAssignmentPolicies.some(({ policy }) => policy === "blocked")
      ) {
        throw new ConsultationAssignmentError(
          "consultation_not_assignable",
          "카카오 채팅방의 고객명을 확인한 뒤 담당자를 지정해 주세요.",
        );
      }

      const kakaoEntriesToConfirm = kakaoAssignmentPolicies
        .filter(({ policy }) => policy === "confirm_and_assign")
        .map(({ entry }) => entry);
      if (kakaoEntriesToConfirm.length > 0) {
        await tx
          .update(kakaoHomepageEntries)
          .set({
            status: "confirmed",
            confirmedAt: now,
            confirmedByUserId: actor.id,
            updatedAt: now,
          })
          .where(
            inArray(
              kakaoHomepageEntries.id,
              kakaoEntriesToConfirm.map((entry) => entry.id),
            ),
          );
        await tx.insert(staffAuditLogs).values(
          kakaoEntriesToConfirm.map((entry) => ({
            id: createEventId(),
            actorUserId: actor.id,
            action: "consultation.kakao_chat_confirmed_from_assignment",
            targetType: "consultation",
            targetId: consultationId,
            metadata: {
              entryId: entry.id,
              requestId: entry.firstRequestId,
              entryConsultationId: entry.consultationId,
            },
            occurredAt: now,
            createdAt: now,
          })),
        );
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

      const scheduledFollowUp = consultationScheduleFollowUp(
        latestVisibleRequest,
      );
      if (scheduledFollowUp) {
        const followUpTaskId = createEventId();
        await tx.insert(telephonyFollowUpTasks).values({
          id: followUpTaskId,
          aftercareId: null,
          consultationRequestId: scheduledFollowUp.consultationRequestId,
          assigneeUserId: actor.id,
          state: "open",
          dueAt: scheduledFollowUp.dueAt,
          createdByUserId: actor.id,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(staffAuditLogs).values({
          id: createEventId(),
          actorUserId: actor.id,
          action: "telephony.follow_up.created_from_consultation_schedule",
          targetType: "telephony_follow_up_task",
          targetId: followUpTaskId,
          metadata: {
            consultationId,
            consultationRequestId: scheduledFollowUp.consultationRequestId,
            dueAt: scheduledFollowUp.dueAt.toISOString(),
            windowEndAt: scheduledFollowUp.windowEndAt.toISOString(),
          },
          occurredAt: now,
          createdAt: now,
        });
      }

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
      for (const kakaoEntryToConfirm of kakaoEntriesToConfirm) {
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
      if (
        legalFriendsHandlingMode !== "existing_case" &&
        (latestRequest.contactChannel === "phone" ||
          latestRequest.contactChannel === "kakao_channel")
      ) {
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
      }
      if (latestRequest.contactChannel === "phone") {
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
        .select({
          id: consultations.id,
          contactChannel: consultations.contactChannel,
        })
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
          id: consultationAssignments.id,
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

      const [pendingTransfer] = await tx
        .select({ id: consultationAssignmentTransfers.id })
        .from(consultationAssignmentTransfers)
        .where(
          and(
            eq(
              consultationAssignmentTransfers.consultationId,
              consultationId,
            ),
            eq(consultationAssignmentTransfers.status, "pending"),
          ),
        )
        .limit(1);
      if (pendingTransfer) {
        throw new LegalFriendsInvalidationError(
          "assignment_transfer_pending",
          "담당자 변경이 끝난 뒤 무효 처리할 수 있습니다.",
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
      if (
        caseLink?.managerExternalAccountId ===
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

      let registrationEventId = caseLink?.registrationEventId ?? null;
      const registrationNeedsCompletion = !caseLink;
      if (!registrationEventId) {
        if (consultation.contactChannel !== "kakao_channel") {
          throw new LegalFriendsInvalidationError(
            "case_not_registered",
            "리걸프렌즈 사건 등록이 완료된 뒤 무효 처리할 수 있습니다.",
          );
        }

        const [existingRegistration] = await tx
          .select({
            id: outboxEvents.id,
            status: outboxEvents.status,
          })
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.aggregateId, consultationId),
              eq(
                outboxEvents.eventType,
                "legalfriends.consultation.registration.requested",
              ),
            ),
          )
          .orderBy(desc(outboxEvents.occurredAt))
          .limit(1);
        if (existingRegistration?.status === "dead") {
          throw new LegalFriendsInvalidationError(
            "case_not_registered",
            "리걸프렌즈 신건 등록 실패를 먼저 확인해 주세요.",
          );
        }
        registrationEventId = existingRegistration?.id ?? null;

        if (!registrationEventId) {
          const [latestRequest] = await tx
            .select({ id: consultationRequests.id })
            .from(consultationRequests)
            .where(eq(consultationRequests.consultationId, consultationId))
            .orderBy(desc(consultationRequests.submittedAt))
            .limit(1);
          if (!latestRequest) {
            throw new LegalFriendsInvalidationError(
              "case_not_registered",
              "리걸프렌즈 신건 등록에 필요한 상담 요청을 찾을 수 없습니다.",
            );
          }
          const registrationEvent: PlatformEvent = {
            eventId: createEventId(),
            eventType: "legalfriends.consultation.registration.requested",
            eventVersion: 1,
            occurredAt: now.toISOString(),
            producer: "lawand.gateway",
            correlationId: consultationId,
            data: {
              consultationId,
              requestId: latestRequest.id,
              assignmentId: assignment.id,
              assignmentRef:
                `consultation_assignments/${assignment.id}`,
              intakeRef:
                `consultation_requests/${latestRequest.id}`,
            },
          };
          assertPlatformEvent(registrationEvent);
          await tx
            .insert(outboxEvents)
            .values(eventRow(registrationEvent));
          registrationEventId = registrationEvent.eventId;
        }
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
        causationId: registrationEventId,
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
      await tx.insert(outboxEvents).values({
        ...eventRow(event),
        ...(registrationNeedsCompletion
          ? { availableAt: new Date(now.getTime() + 5_000) }
          : {}),
      });
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

  async function requestAssigneeTransfer(
    consultationId: string,
    input: ConsultationAssigneeTransferInput,
    actor: StaffPrincipal,
  ) {
    const now = new Date();
    return db.transaction(async (tx) => {
      const [consultation] = await tx
        .select({ id: consultations.id, state: consultations.state })
        .from(consultations)
        .where(eq(consultations.id, consultationId))
        .limit(1)
        .for("update");
      if (!consultation) {
        throw new ConsultationAssigneeTransferError(
          "consultation_not_found",
          "상담을 찾을 수 없습니다.",
        );
      }
      if (
        consultation.state === "requested" ||
        consultation.state === "closed"
      ) {
        throw new ConsultationAssigneeTransferError(
          "consultation_not_transferable",
          "진행 중인 배정 상담만 담당자를 변경할 수 있습니다.",
        );
      }

      const [assignment] = await tx
        .select({
          id: consultationAssignments.id,
          assigneeUserId: consultationAssignments.assigneeUserId,
          assigneeMembershipId:
            consultationAssignments.assigneeMembershipId,
        })
        .from(consultationAssignments)
        .where(eq(consultationAssignments.consultationId, consultationId))
        .limit(1)
        .for("update");
      if (!assignment) {
        throw new ConsultationAssigneeTransferError(
          "assignment_not_found",
          "담당자가 배정된 상담만 변경할 수 있습니다.",
        );
      }
      if (assignment.assigneeUserId === input.targetStaffUserId) {
        throw new ConsultationAssigneeTransferError(
          "same_assignee",
          "현재 담당자와 다른 직원을 선택해 주세요.",
        );
      }

      const [caseLink] = await tx
        .select({
          outboxEventId: legalFriendsCaseLinks.outboxEventId,
          managerExternalAccountId:
            legalFriendsCaseLinks.managerExternalAccountId,
        })
        .from(legalFriendsCaseLinks)
        .where(eq(legalFriendsCaseLinks.consultationId, consultationId))
        .limit(1)
        .for("update");
      if (!caseLink) {
        throw new ConsultationAssigneeTransferError(
          "case_not_registered",
          "리걸프렌즈 사건 등록이 완료된 상담만 담당자를 변경할 수 있습니다.",
        );
      }
      if (
        caseLink.managerExternalAccountId ===
        LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID
      ) {
        throw new ConsultationAssigneeTransferError(
          "case_invalidated",
          "무효 처리된 사건은 되돌리기 버튼으로 복원해 주세요.",
        );
      }

      const [pendingInvalidation] = await tx
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
        .limit(1);
      if (pendingInvalidation) {
        throw new ConsultationAssigneeTransferError(
          "invalidation_pending",
          "무효 처리가 끝난 뒤 담당자를 변경할 수 있습니다.",
        );
      }

      const [pendingTransfer] = await tx
        .select({
          id: consultationAssignmentTransfers.id,
          outboxEventId: consultationAssignmentTransfers.outboxEventId,
          targetAssigneeUserId:
            consultationAssignmentTransfers.targetAssigneeUserId,
        })
        .from(consultationAssignmentTransfers)
        .where(
          and(
            eq(
              consultationAssignmentTransfers.consultationId,
              consultationId,
            ),
            eq(consultationAssignmentTransfers.status, "pending"),
          ),
        )
        .limit(1)
        .for("update");
      if (pendingTransfer) {
        if (
          pendingTransfer.targetAssigneeUserId === input.targetStaffUserId
        ) {
          return {
            consultationId,
            transferId: pendingTransfer.id,
            eventId: pendingTransfer.outboxEventId,
            state: "queued" as const,
            replayed: true,
          };
        }
        throw new ConsultationAssigneeTransferError(
          "transfer_already_pending",
          "다른 담당자 변경 요청이 처리 중입니다.",
        );
      }

      const [target] = await tx
        .select({
          userId: staffUsers.id,
          displayName: staffProfiles.displayName,
          membershipId: staffMemberships.id,
          externalAccountId: staffExternalAccounts.externalAccountId,
          externalMemberIdx: staffExternalAccounts.externalMemberIdx,
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
          staffExternalAccounts,
          and(
            eq(staffExternalAccounts.staffUserId, staffUsers.id),
            eq(staffExternalAccounts.provider, "legalfriends"),
            eq(staffExternalAccounts.isActive, true),
            isNotNull(staffExternalAccounts.externalMemberIdx),
          ),
        )
        .where(
          and(
            eq(staffUsers.id, input.targetStaffUserId),
            eq(staffUsers.status, "active"),
          ),
        )
        .limit(1);
      if (
        !target?.externalMemberIdx ||
        target.externalAccountId ===
          LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID
      ) {
        throw new ConsultationAssigneeTransferError(
          "target_assignee_invalid",
          "활성 리걸프렌즈 계정이 연결된 직원을 선택해 주세요.",
        );
      }

      const transferId = createEventId();
      const eventId = createEventId();
      const occurredAt = now.toISOString();
      const event: PlatformEvent = {
        eventId,
        eventType:
          "legalfriends.consultation.manager_change.requested",
        eventVersion: 1,
        occurredAt,
        producer: "lawand.gateway",
        correlationId: consultationId,
        causationId: caseLink.outboxEventId,
        data: {
          consultationId,
          transferId,
          transferRef:
            `consultation_assignment_transfers/${transferId}`,
          assignmentId: assignment.id,
          assignmentRef: `consultation_assignments/${assignment.id}`,
          caseLinkRef: `legalfriends_case_links/${consultationId}`,
          previousAssigneeUserId: assignment.assigneeUserId,
          targetAssigneeUserId: target.userId,
          targetAssigneeMembershipId: target.membershipId,
          requestedByUserId: actor.id,
          reason: input.reason,
          targetManagerExternalAccountId: target.externalAccountId,
          targetManagerMemberIdx: target.externalMemberIdx,
        },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(eventRow(event));
      await tx.insert(consultationAssignmentTransfers).values({
        id: transferId,
        consultationId,
        assignmentId: assignment.id,
        previousAssigneeUserId: assignment.assigneeUserId,
        previousAssigneeMembershipId: assignment.assigneeMembershipId,
        targetAssigneeUserId: target.userId,
        targetAssigneeMembershipId: target.membershipId,
        requestedByUserId: actor.id,
        reason: input.reason,
        targetManagerExternalAccountId: target.externalAccountId,
        targetManagerMemberIdx: target.externalMemberIdx,
        outboxEventId: eventId,
        status: "pending",
        requestedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "consultation.assignment_transfer_requested",
        targetType: "consultation",
        targetId: consultationId,
        metadata: {
          transferId,
          eventId,
          assignmentId: assignment.id,
          previousAssigneeUserId: assignment.assigneeUserId,
          targetAssigneeUserId: target.userId,
          reason: input.reason,
        },
        occurredAt: now,
        createdAt: now,
      });

      return {
        consultationId,
        transferId,
        eventId,
        state: "queued" as const,
        targetAssignee: {
          userId: target.userId,
          displayName: target.displayName,
        },
        replayed: false,
      };
    });
  }

  async function restoreInvalidatedLegalFriendsCase(
    consultationId: string,
    actor: StaffPrincipal,
  ) {
    const now = new Date();
    return db.transaction(async (tx) => {
      const [consultation] = await tx
        .select({ id: consultations.id, softDeletedAt: consultations.softDeletedAt })
        .from(consultations)
        .where(eq(consultations.id, consultationId))
        .limit(1)
        .for("update");
      if (!consultation) {
        throw new ConsultationAssigneeTransferError(
          "consultation_not_found",
          "상담을 찾을 수 없습니다.",
        );
      }
      if (consultation.softDeletedAt) {
        throw new ConsultationAssigneeTransferError(
          "consultation_not_transferable",
          "삭제된 상담은 되돌릴 수 없습니다.",
        );
      }

      const [caseLink] = await tx
        .select({
          outboxEventId: legalFriendsCaseLinks.outboxEventId,
          managerExternalAccountId:
            legalFriendsCaseLinks.managerExternalAccountId,
        })
        .from(legalFriendsCaseLinks)
        .where(eq(legalFriendsCaseLinks.consultationId, consultationId))
        .limit(1)
        .for("update");
      if (!caseLink) {
        throw new ConsultationAssigneeTransferError(
          "case_not_registered",
          "리걸프렌즈 사건을 찾을 수 없습니다.",
        );
      }
      if (
        caseLink.managerExternalAccountId !==
        LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID
      ) {
        throw new ConsultationAssigneeTransferError(
          "case_invalidated",
          "현재 리걸프렌즈 담당자가 무효인 사건만 되돌릴 수 있습니다.",
        );
      }

      const [pendingConflict] = await tx
        .select({ id: outboxEvents.id, eventType: outboxEvents.eventType })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.aggregateId, consultationId),
            inArray(outboxEvents.eventType, [
              "legalfriends.consultation.invalidation.requested",
              "legalfriends.consultation.manager_change.requested",
              "legalfriends.consultation.restoration.requested",
            ]),
            eq(outboxEvents.status, "pending"),
          ),
        )
        .orderBy(desc(outboxEvents.occurredAt))
        .limit(1);
      if (pendingConflict) {
        if (
          pendingConflict.eventType ===
          "legalfriends.consultation.restoration.requested"
        ) {
          return {
            consultationId,
            eventId: pendingConflict.id,
            state: "queued" as const,
            replayed: true,
          };
        }
        throw new ConsultationAssigneeTransferError(
          "transfer_already_pending",
          "무효 처리 또는 담당자 변경이 끝난 뒤 되돌릴 수 있습니다.",
        );
      }

      const [pendingTransfer] = await tx
        .select({ id: consultationAssignmentTransfers.id })
        .from(consultationAssignmentTransfers)
        .where(
          and(
            eq(consultationAssignmentTransfers.consultationId, consultationId),
            eq(consultationAssignmentTransfers.status, "pending"),
          ),
        )
        .limit(1);
      if (pendingTransfer) {
        throw new ConsultationAssigneeTransferError(
          "transfer_already_pending",
          "담당자 변경이 끝난 뒤 되돌릴 수 있습니다.",
        );
      }

      const [target] = await tx
        .select({
          userId: staffUsers.id,
          membershipId: staffMemberships.id,
          externalAccountId: staffExternalAccounts.externalAccountId,
          externalMemberIdx: staffExternalAccounts.externalMemberIdx,
        })
        .from(staffUsers)
        .innerJoin(
          staffMemberships,
          and(
            eq(staffMemberships.userId, staffUsers.id),
            eq(staffMemberships.isPrimary, true),
            eq(staffMemberships.isActive, true),
          ),
        )
        .innerJoin(
          staffExternalAccounts,
          and(
            eq(staffExternalAccounts.staffUserId, staffUsers.id),
            eq(staffExternalAccounts.provider, "legalfriends"),
            eq(staffExternalAccounts.isActive, true),
            isNotNull(staffExternalAccounts.externalMemberIdx),
          ),
        )
        .where(
          and(eq(staffUsers.id, actor.id), eq(staffUsers.status, "active")),
        )
        .limit(1);
      if (
        !target?.externalMemberIdx ||
        target.externalAccountId ===
          LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID
      ) {
        throw new ConsultationAssigneeTransferError(
          "target_assignee_invalid",
          "활성 리걸프렌즈 계정과 주 멤버십이 연결된 직원만 되돌릴 수 있습니다.",
        );
      }

      const [assignment] = await tx
        .select({
          id: consultationAssignments.id,
          assigneeUserId: consultationAssignments.assigneeUserId,
          assigneeMembershipId:
            consultationAssignments.assigneeMembershipId,
        })
        .from(consultationAssignments)
        .where(eq(consultationAssignments.consultationId, consultationId))
        .limit(1)
        .for("update");
      const eventId = createEventId();
      const targetAssignmentId = assignment?.id ?? createEventId();
      const event: PlatformEvent = {
        eventId,
        eventType: "legalfriends.consultation.restoration.requested",
        eventVersion: 1,
        occurredAt: now.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        causationId: caseLink.outboxEventId,
        data: {
          consultationId,
          caseLinkRef: `legalfriends_case_links/${consultationId}`,
          requestedByUserId: actor.id,
          targetAssigneeUserId: target.userId,
          targetAssigneeMembershipId: target.membershipId,
          targetAssignmentId,
          previousAssignmentId: assignment?.id ?? null,
          previousAssigneeUserId: assignment?.assigneeUserId ?? null,
          previousAssigneeMembershipId:
            assignment?.assigneeMembershipId ?? null,
          targetManagerExternalAccountId: target.externalAccountId,
          targetManagerMemberIdx: target.externalMemberIdx,
        },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(eventRow(event));
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "legalfriends.case.restoration_requested",
        targetType: "consultation",
        targetId: consultationId,
        metadata: {
          eventId,
          previousAssignmentId: assignment?.id ?? null,
          targetAssignmentId,
          targetAssigneeUserId: target.userId,
        },
        occurredAt: now,
        createdAt: now,
      });
      return {
        consultationId,
        eventId,
        state: "queued" as const,
        replayed: false,
      };
    });
  }

  async function linkConsultationGroup(
    consultationId: string,
    targetReceiptCode: string,
    actor: StaffPrincipal,
  ) {
    const now = new Date();
    return db.transaction(async (tx) => {
      let [current, target] = await Promise.all([
        tx
          .select()
          .from(consultations)
          .where(eq(consultations.id, consultationId))
          .limit(1),
        tx
          .select()
          .from(consultations)
          .where(eq(consultations.publicReceiptCode, targetReceiptCode))
          .limit(1),
      ]).then(([currentRows, targetRows]) => [
        currentRows[0],
        targetRows[0],
      ]);
      if (!current) {
        throw new ConsultationGroupError(
          "consultation_not_found",
          "상담을 찾을 수 없습니다.",
        );
      }
      if (!target) {
        throw new ConsultationGroupError(
          "target_not_found",
          "연결할 접수번호의 상담을 찾을 수 없습니다.",
        );
      }
      if (current.id === target.id) {
        throw new ConsultationGroupError(
          "same_consultation",
          "같은 상담끼리는 연결할 수 없습니다.",
        );
      }
      const lockIds = [current.id, target.id].sort();
      for (const lockId of lockIds) {
        const lockFingerprint = protection.fingerprint({
          kind: "consultation_group_manual_link",
          consultationId: lockId,
        });
        await tx.execute(
          sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(lockFingerprint)} as bigint))`,
        );
      }
      const lockedConsultations = await tx
        .select()
        .from(consultations)
        .where(inArray(consultations.id, lockIds))
        .orderBy(asc(consultations.id))
        .for("update");
      current = lockedConsultations.find((row) => row.id === current?.id);
      target = lockedConsultations.find((row) => row.id === target?.id);
      if (!current || !target) {
        throw new ConsultationGroupError(
          "consultation_not_found",
          "상담을 다시 확인해 주세요.",
        );
      }

      const groupableIds = [current.id, target.id];
      const invalidEntries = await tx
        .select({ consultationId: kakaoHomepageEntries.consultationId })
        .from(kakaoHomepageEntries)
        .where(
          and(
            inArray(kakaoHomepageEntries.consultationId, groupableIds),
            eq(kakaoHomepageEntries.status, "invalid"),
          ),
        );
      if (
        current.softDeletedAt ||
        target.softDeletedAt ||
        invalidEntries.length > 0
      ) {
        throw new ConsultationGroupError(
          "consultation_not_groupable",
          "소프트삭제 또는 미진입·무효 상담은 묶을 수 없습니다.",
        );
      }
      if (
        current.phoneFingerprint &&
        target.phoneFingerprint &&
        !current.phoneFingerprint.equals(target.phoneFingerprint)
      ) {
        throw new ConsultationGroupError(
          "phone_mismatch",
          "서로 다른 전화번호의 상담은 자동으로 연결할 수 없습니다.",
        );
      }

      const [currentScope, targetScope] = await Promise.all([
        groupMemberIds(tx, current.id),
        groupMemberIds(tx, target.id),
      ]);
      if (
        currentScope.group &&
        targetScope.group &&
        currentScope.group.groupId === targetScope.group.groupId
      ) {
        return {
          groupId: currentScope.group.groupId,
          canonicalConsultationId:
            currentScope.group.canonicalConsultationId,
          memberCount: currentScope.memberIds.length,
          replayed: true,
        };
      }
      const memberIds = [
        ...new Set([...currentScope.memberIds, ...targetScope.memberIds]),
      ];
      const [blockedMembers, invalidMemberEntries] = await Promise.all([
        tx
          .select({ id: consultations.id })
          .from(consultations)
          .where(
            and(
              inArray(consultations.id, memberIds),
              isNotNull(consultations.softDeletedAt),
            ),
          ),
        tx
          .select({ consultationId: kakaoHomepageEntries.consultationId })
          .from(kakaoHomepageEntries)
          .where(
            and(
              inArray(kakaoHomepageEntries.consultationId, memberIds),
              eq(kakaoHomepageEntries.status, "invalid"),
            ),
          ),
      ]);
      if (blockedMembers.length > 0 || invalidMemberEntries.length > 0) {
        throw new ConsultationGroupError(
          "consultation_not_groupable",
          "묶음 안에 소프트삭제 또는 미진입·무효 상담이 있어 연결할 수 없습니다.",
        );
      }
      const assignments = await tx
        .select({
          consultationId: consultationAssignments.consultationId,
          assigneeUserId: consultationAssignments.assigneeUserId,
        })
        .from(consultationAssignments)
        .where(inArray(consultationAssignments.consultationId, memberIds));
      if (assignments.length > 1) {
        throw new ConsultationGroupError(
          "assignment_conflict",
          "이미 각각 담당자가 지정된 상담끼리는 묶을 수 없습니다.",
        );
      }
      const caseLinks = await tx
        .select({
          consultationId: legalFriendsCaseLinks.consultationId,
          caseIdx: legalFriendsCaseLinks.caseIdx,
        })
        .from(legalFriendsCaseLinks)
        .where(inArray(legalFriendsCaseLinks.consultationId, memberIds));
      if (caseLinks.length > 1) {
        throw new ConsultationGroupError(
          "legalfriends_case_conflict",
          "이미 각각 리걸프렌즈 사건이 등록된 상담끼리는 묶을 수 없습니다.",
        );
      }

      const assignmentOwner = assignments[0]?.consultationId ?? null;
      const caseOwner = caseLinks[0]?.consultationId ?? null;
      const preferredCanonicalId = caseOwner ?? assignmentOwner ?? target.id;
      const destinationScope = currentScope.memberIds.includes(
        preferredCanonicalId,
      )
        ? currentScope
        : targetScope;
      const sourceScope = destinationScope === currentScope
        ? targetScope
        : currentScope;
      const canonicalConsultationId = destinationScope.group
        ? destinationScope.group.canonicalConsultationId
        : preferredCanonicalId;
      const groupId = destinationScope.group?.groupId ?? createEventId();
      const memberRows = await tx
        .select({
          id: consultations.id,
          firstRequestedAt: consultations.firstRequestedAt,
          lastRequestedAt: consultations.lastRequestedAt,
          phoneFingerprint: consultations.phoneFingerprint,
        })
        .from(consultations)
        .where(inArray(consultations.id, memberIds));
      if (
        new Set(
          memberRows
            .map((row) => row.phoneFingerprint?.toString("hex") ?? null)
            .filter((value): value is string => Boolean(value)),
        ).size > 1
      ) {
        throw new ConsultationGroupError(
          "phone_mismatch",
          "묶음 안에 서로 다른 전화번호가 있어 연결할 수 없습니다.",
        );
      }
      const firstRequestedAt = new Date(
        Math.min(...memberRows.map((row) => row.firstRequestedAt.getTime())),
      );
      const lastRequestedAt = new Date(
        Math.max(...memberRows.map((row) => row.lastRequestedAt.getTime())),
      );
      const phoneFingerprint =
        memberRows.find((row) => row.phoneFingerprint)?.phoneFingerprint ??
        null;

      if (!destinationScope.group) {
        await tx.insert(consultationGroups).values({
          id: groupId,
          canonicalConsultationId,
          phoneFingerprint,
          status: "active",
          createdReason: "manual_link",
          createdByUserId: actor.id,
          firstRequestedAt,
          lastRequestedAt,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(consultationGroupEvents).values({
          id: createEventId(),
          groupId,
          consultationId: canonicalConsultationId,
          eventType: "created",
          actorUserId: actor.id,
          metadata: { reason: "manual_link" },
          occurredAt: now,
          createdAt: now,
        });
      }
      for (const memberId of destinationScope.memberIds) {
        if (destinationScope.group) continue;
        await tx.insert(consultationGroupMembers).values({
          consultationId: memberId,
          groupId,
          linkMethod: "manual_link",
          linkedByUserId: actor.id,
          linkedAt: now,
          createdAt: now,
        });
      }
      if (sourceScope.group) {
        await tx
          .update(consultationGroupMembers)
          .set({
            groupId,
            linkMethod: "manual_link",
            linkedByUserId: actor.id,
            linkedAt: now,
          })
          .where(eq(consultationGroupMembers.groupId, sourceScope.group.groupId));
        await tx
          .update(consultationGroups)
          .set({
            status: "merged",
            mergedIntoGroupId: groupId,
            updatedAt: now,
          })
          .where(eq(consultationGroups.id, sourceScope.group.groupId));
        await tx.insert(consultationGroupEvents).values({
          id: createEventId(),
          groupId: sourceScope.group.groupId,
          consultationId: sourceScope.group.canonicalConsultationId,
          eventType: "merged",
          actorUserId: actor.id,
          metadata: { mergedIntoGroupId: groupId },
          occurredAt: now,
          createdAt: now,
        });
      } else {
        for (const memberId of sourceScope.memberIds) {
          await tx.insert(consultationGroupMembers).values({
            consultationId: memberId,
            groupId,
            linkMethod: "manual_link",
            linkedByUserId: actor.id,
            linkedAt: now,
            createdAt: now,
          });
        }
      }
      await tx
        .update(consultationGroups)
        .set({
          canonicalConsultationId,
          phoneFingerprint,
          firstRequestedAt,
          lastRequestedAt,
          updatedAt: now,
        })
        .where(eq(consultationGroups.id, groupId));
      await tx
        .update(consultations)
        .set({ lastRequestedAt, updatedAt: now })
        .where(eq(consultations.id, canonicalConsultationId));
      await tx.insert(consultationGroupEvents).values(
        sourceScope.memberIds.map((memberId) => ({
          id: createEventId(),
          groupId,
          consultationId: memberId,
          eventType: "linked" as const,
          actorUserId: actor.id,
          metadata: {
            targetReceiptCode,
            canonicalConsultationId,
          },
          occurredAt: now,
          createdAt: now,
        })),
      );
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "consultation.group_linked",
        targetType: "consultation_group",
        targetId: groupId,
        metadata: {
          canonicalConsultationId,
          memberConsultationIds: memberIds,
        },
        occurredAt: now,
        createdAt: now,
      });
      const groupedEvent: PlatformEvent = {
        eventId: createEventId(),
        eventType: "consultation.group.updated",
        eventVersion: 1,
        occurredAt: now.toISOString(),
        producer: "lawand.gateway",
        correlationId: canonicalConsultationId,
        data: {
          consultationId: canonicalConsultationId,
          groupId,
          action: "linked",
          actorUserId: actor.id,
        },
      };
      assertPlatformEvent(groupedEvent);
      await tx.insert(outboxEvents).values(eventRow(groupedEvent));
      return {
        groupId,
        canonicalConsultationId,
        memberCount: memberIds.length,
        replayed: false,
      };
    });
  }

  async function splitConsultationGroup(
    consultationId: string,
    actor: StaffPrincipal,
  ) {
    const now = new Date();
    return db.transaction(async (tx) => {
      const scope = await groupMemberIds(tx, consultationId);
      if (!scope.group) {
        throw new ConsultationGroupError(
          "group_not_found",
          "묶음에 속한 상담이 아닙니다.",
        );
      }
      if (scope.memberIds.length < 2) {
        throw new ConsultationGroupError(
          "last_group_member",
          "이미 별도 상담으로 분리되어 있습니다.",
        );
      }
      const groupLock = protection.fingerprint({
        kind: "consultation_group_split",
        groupId: scope.group.groupId,
      });
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(groupLock)} as bigint))`,
      );
      const remainingIds = scope.memberIds.filter(
        (memberId) => memberId !== consultationId,
      );
      const [assignmentRows, caseRows, consultationRows, requestRows] =
        await Promise.all([
          tx
            .select({ consultationId: consultationAssignments.consultationId })
            .from(consultationAssignments)
            .where(inArray(consultationAssignments.consultationId, remainingIds)),
          tx
            .select({ consultationId: legalFriendsCaseLinks.consultationId })
            .from(legalFriendsCaseLinks)
            .where(inArray(legalFriendsCaseLinks.consultationId, remainingIds)),
          tx
            .select({
              id: consultations.id,
              firstRequestedAt: consultations.firstRequestedAt,
            })
            .from(consultations)
            .where(inArray(consultations.id, remainingIds))
            .orderBy(asc(consultations.firstRequestedAt)),
          tx
            .select({
              consultationId: consultationRequests.consultationId,
              submittedAt: consultationRequests.submittedAt,
            })
            .from(consultationRequests)
            .where(inArray(consultationRequests.consultationId, scope.memberIds))
            .orderBy(asc(consultationRequests.submittedAt)),
        ]);
      const newCanonicalConsultationId =
        caseRows[0]?.consultationId ??
        assignmentRows[0]?.consultationId ??
        consultationRows[0]!.id;
      const remainingRequests = requestRows.filter((request) =>
        remainingIds.includes(request.consultationId),
      );
      const splitRequests = requestRows.filter(
        (request) => request.consultationId === consultationId,
      );
      const remainingFirst = remainingRequests[0]!.submittedAt;
      const remainingLast = remainingRequests.at(-1)!.submittedAt;
      const splitFirst = splitRequests[0]!.submittedAt;
      const splitLast = splitRequests.at(-1)!.submittedAt;
      const [splitConsultation] = await tx
        .select({ phoneFingerprint: consultations.phoneFingerprint })
        .from(consultations)
        .where(eq(consultations.id, consultationId))
        .limit(1);
      const newGroupId = createEventId();
      await tx
        .update(consultationGroups)
        .set({
          canonicalConsultationId: newCanonicalConsultationId,
          firstRequestedAt: remainingFirst,
          lastRequestedAt: remainingLast,
          updatedAt: now,
        })
        .where(eq(consultationGroups.id, scope.group.groupId));
      await tx.insert(consultationGroups).values({
        id: newGroupId,
        canonicalConsultationId: consultationId,
        phoneFingerprint: splitConsultation?.phoneFingerprint ?? null,
        status: "active",
        createdReason: "manual_split",
        createdByUserId: actor.id,
        firstRequestedAt: splitFirst,
        lastRequestedAt: splitLast,
        createdAt: now,
        updatedAt: now,
      });
      await tx
        .update(consultationGroupMembers)
        .set({
          groupId: newGroupId,
          linkMethod: "manual_split",
          linkedByUserId: actor.id,
          linkedAt: now,
        })
        .where(eq(consultationGroupMembers.consultationId, consultationId));
      await tx
        .update(consultations)
        .set({ lastRequestedAt: remainingLast, updatedAt: now })
        .where(eq(consultations.id, newCanonicalConsultationId));
      await tx
        .update(consultations)
        .set({ lastRequestedAt: splitLast, updatedAt: now })
        .where(eq(consultations.id, consultationId));
      const groupEvents: (typeof consultationGroupEvents.$inferInsert)[] = [
        {
          id: createEventId(),
          groupId: scope.group.groupId,
          consultationId,
          eventType: "unlinked" as const,
          actorUserId: actor.id,
          metadata: { newGroupId },
          occurredAt: now,
          createdAt: now,
        },
        {
          id: createEventId(),
          groupId: newGroupId,
          consultationId,
          eventType: "created" as const,
          actorUserId: actor.id,
          metadata: { splitFromGroupId: scope.group.groupId },
          occurredAt: now,
          createdAt: now,
        },
      ];
      if (
        newCanonicalConsultationId !==
        scope.group.canonicalConsultationId
      ) {
        groupEvents.push({
          id: createEventId(),
          groupId: scope.group.groupId,
          consultationId: newCanonicalConsultationId,
          eventType: "canonical_changed",
          actorUserId: actor.id,
          metadata: {
            previousCanonicalConsultationId:
              scope.group.canonicalConsultationId,
          },
          occurredAt: now,
          createdAt: now,
        });
      }
      await tx.insert(consultationGroupEvents).values(groupEvents);
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "consultation.group_split",
        targetType: "consultation_group",
        targetId: scope.group.groupId,
        metadata: {
          consultationId,
          newGroupId,
          newCanonicalConsultationId,
        },
        occurredAt: now,
        createdAt: now,
      });
      const splitEvent: PlatformEvent = {
        eventId: createEventId(),
        eventType: "consultation.group.updated",
        eventVersion: 1,
        occurredAt: now.toISOString(),
        producer: "lawand.gateway",
        correlationId: newCanonicalConsultationId,
        data: {
          consultationId: newCanonicalConsultationId,
          groupId: scope.group.groupId,
          action: "split",
          actorUserId: actor.id,
        },
      };
      assertPlatformEvent(splitEvent);
      await tx.insert(outboxEvents).values(eventRow(splitEvent));
      return {
        previousGroupId: scope.group.groupId,
        newGroupId,
        consultationId,
        previousGroupCanonicalConsultationId: newCanonicalConsultationId,
      };
    });
  }


  async function softDeleteStaffConsultation(
    consultationId: string,
    actor: StaffPrincipal,
  ) {
    const deletedAt = new Date();
    return db.transaction(async (tx) => {
      const [consultation] = await tx
        .select({
          id: consultations.id,
          state: consultations.state,
          closedAt: consultations.closedAt,
          softDeletedAt: consultations.softDeletedAt,
          softDeletedByUserId: consultations.softDeletedByUserId,
        })
        .from(consultations)
        .where(eq(consultations.id, consultationId))
        .limit(1)
        .for("update");
      if (!consultation) {
        throw new ConsultationSoftDeleteError(
          "consultation_not_found",
          "상담을 찾을 수 없습니다.",
        );
      }
      const groupScope = await groupMemberIds(tx, consultationId);
      if (groupScope.group && groupScope.memberIds.length > 1) {
        throw new ConsultationSoftDeleteError(
          "consultation_grouped",
          "묶음에 포함된 상담은 먼저 별도 상담으로 분리한 뒤 삭제해 주세요.",
        );
      }

      const [firstRequest] = await tx
        .select({ source: consultationRequests.source })
        .from(consultationRequests)
        .where(eq(consultationRequests.consultationId, consultationId))
        .orderBy(asc(consultationRequests.submittedAt))
        .limit(1);
      if (
        !firstRequest ||
        !["erp_staff", "erp_client_directory"].includes(firstRequest.source)
      ) {
        throw new ConsultationSoftDeleteError(
          "consultation_not_staff_created",
          "신규등록으로 만든 상담만 삭제할 수 있습니다.",
        );
      }

      if (consultation.softDeletedAt) {
        return {
          consultationId,
          state: "closed" as const,
          softDeletedAt: consultation.softDeletedAt.toISOString(),
          softDeletedByUserId: consultation.softDeletedByUserId!,
          replayed: true,
        };
      }

      const [pendingTransfer] = await tx
        .select({ id: consultationAssignmentTransfers.id })
        .from(consultationAssignmentTransfers)
        .where(
          and(
            eq(
              consultationAssignmentTransfers.consultationId,
              consultationId,
            ),
            eq(consultationAssignmentTransfers.status, "pending"),
          ),
        )
        .limit(1);
      if (pendingTransfer) {
        throw new ConsultationSoftDeleteError(
          "assignment_transfer_pending",
          "담당자 변경이 끝난 뒤 삭제할 수 있습니다.",
        );
      }

      await tx
        .update(consultations)
        .set({
          state: "closed",
          closedAt: consultation.closedAt ?? deletedAt,
          softDeletedAt: deletedAt,
          softDeletedByUserId: actor.id,
          updatedAt: deletedAt,
        })
        .where(eq(consultations.id, consultationId));

      if (consultation.state !== "closed") {
        await tx.insert(consultationStatusHistory).values({
          id: createEventId(),
          consultationId,
          fromState: consultation.state,
          toState: "closed",
          reason: "staff_manual_soft_delete",
          actorType: "staff",
          actorId: actor.id,
          changedAt: deletedAt,
          createdAt: deletedAt,
        });
      }

      const event: PlatformEvent = {
        eventId: createEventId(),
        eventType: "consultation.soft_deleted",
        eventVersion: 1,
        occurredAt: deletedAt.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        data: {
          consultationId,
          deletedByUserId: actor.id,
          deletionKind: "staff_manual_soft_delete",
        },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(eventRow(event));
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "consultation.soft_deleted",
        targetType: "consultation",
        targetId: consultationId,
        metadata: {
          firstRequestSource: firstRequest.source,
          previousState: consultation.state,
        },
        occurredAt: deletedAt,
        createdAt: deletedAt,
      });

      return {
        consultationId,
        state: "closed" as const,
        softDeletedAt: deletedAt.toISOString(),
        softDeletedByUserId: actor.id,
        replayed: false,
      };
    });
  }

  async function list(query: ConsultationListQuery) {
    const visibleCondition = sql<boolean>`not exists (
      select 1
      from ${consultationGroupMembers} visible_member
      inner join ${consultationGroups} visible_group
        on visible_group.id = visible_member.group_id
      where visible_member.consultation_id = ${consultations.id}
        and visible_group.status = 'active'
        and visible_group.canonical_consultation_id <> ${consultations.id}
    )`;
    const dateCondition = and(
      visibleCondition,
      query.from
        ? gte(consultations.lastRequestedAt, query.from)
        : undefined,
      query.to ? lt(consultations.lastRequestedAt, query.to) : undefined,
    );
    const waitingCondition = and(
      isNull(consultations.softDeletedAt),
      eq(consultations.state, "requested"),
      sql<boolean>`not exists (
        select 1
        from ${kakaoHomepageEntries}
        where ${kakaoHomepageEntries.consultationId} = ${consultations.id}
          and ${kakaoHomepageEntries.status} = 'invalid'
      )`,
    );
    const mineCondition = and(
      isNull(consultations.softDeletedAt),
      sql<boolean>`exists (
        select 1
        from ${consultationAssignments}
        where ${consultationAssignments.consultationId} = ${consultations.id}
          and ${consultationAssignments.assigneeUserId} = ${query.staffUserId}
      )`,
    );
    const attentionCondition = and(
      isNull(consultations.softDeletedAt),
      sql<boolean>`(
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
        from ${consultationGroupMembers} attention_member
        inner join ${consultationGroups} attention_group
          on attention_group.id = attention_member.group_id
        inner join ${kakaoHomepageEntries} grouped_kakao
          on grouped_kakao.consultation_id = attention_member.consultation_id
        where attention_group.status = 'active'
          and attention_group.canonical_consultation_id = ${consultations.id}
          and grouped_kakao.status = 'pending'
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
      )`,
    );
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

    const canonicalIds = consultationRows.map((row) => row.id);
    const groupedMemberRows = await db
      .select({
        canonicalConsultationId: consultationGroups.canonicalConsultationId,
        consultationId: consultationGroupMembers.consultationId,
      })
      .from(consultationGroups)
      .innerJoin(
        consultationGroupMembers,
        eq(consultationGroupMembers.groupId, consultationGroups.id),
      )
      .where(
        and(
          eq(consultationGroups.status, "active"),
          inArray(consultationGroups.canonicalConsultationId, canonicalIds),
        ),
      );
    const canonicalByMember = new Map<string, string>();
    const groupMemberCounts = new Map<string, number>();
    for (const row of groupedMemberRows) {
      canonicalByMember.set(row.consultationId, row.canonicalConsultationId);
      groupMemberCounts.set(
        row.canonicalConsultationId,
        (groupMemberCounts.get(row.canonicalConsultationId) ?? 0) + 1,
      );
    }
    for (const canonicalId of canonicalIds) {
      canonicalByMember.set(canonicalId, canonicalId);
      if (!groupMemberCounts.has(canonicalId)) {
        groupMemberCounts.set(canonicalId, 1);
      }
    }
    const ids = [...new Set([...canonicalIds, ...canonicalByMember.keys()])];
    const requestRows = await db
      .select()
      .from(consultationRequests)
      .where(inArray(consultationRequests.consultationId, ids))
      .orderBy(desc(consultationRequests.submittedAt));
    const latestByConsultation = new Map<string, (typeof requestRows)[number]>();
    const firstByConsultation = new Map<string, (typeof requestRows)[number]>();
    const requestCounts = new Map<string, number>();
    for (const request of requestRows) {
      const canonicalId =
        canonicalByMember.get(request.consultationId) ?? request.consultationId;
      firstByConsultation.set(canonicalId, request);
      requestCounts.set(
        canonicalId,
        (requestCounts.get(canonicalId) ?? 0) + 1,
      );
      if (!latestByConsultation.has(canonicalId)) {
        latestByConsultation.set(canonicalId, request);
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
    const assigneeByConsultation = new Map<string, (typeof assignmentRows)[number]>();
    for (const row of assignmentRows) {
      assigneeByConsultation.set(
        canonicalByMember.get(row.consultationId) ?? row.consultationId,
        row,
      );
    }
    const directorySourceRows = await db
      .select({
        consultationId: consultationDirectorySources.consultationId,
        relationship: consultationDirectorySources.relationship,
        snapshotCiphertext: consultationDirectorySources.snapshotCiphertext,
        snapshotNonce: consultationDirectorySources.snapshotNonce,
        snapshotKeyVersion: consultationDirectorySources.snapshotKeyVersion,
      })
      .from(consultationDirectorySources)
      .where(inArray(consultationDirectorySources.consultationId, ids))
      .orderBy(desc(consultationDirectorySources.createdAt));
    const directorySourceIds = new Set(
      directorySourceRows.map(
        (row) =>
          canonicalByMember.get(row.consultationId) ?? row.consultationId,
      ),
    );
    const referrerStaffNamesByConsultation = new Map<string, string[]>();
    for (const row of directorySourceRows) {
      if (row.relationship !== "referrer") continue;
      const canonicalId =
        canonicalByMember.get(row.consultationId) ?? row.consultationId;
      if (referrerStaffNamesByConsultation.has(canonicalId)) continue;
      const snapshot = JSON.parse(
        protection.decrypt(
          {
            ciphertext: row.snapshotCiphertext,
            nonce: row.snapshotNonce,
            keyVersion: row.snapshotKeyVersion,
          },
          `consultation_directory_sources/${row.consultationId}/snapshot`,
        ),
      ) as ConsultationDirectorySnapshot;
      referrerStaffNamesByConsultation.set(canonicalId, snapshot.staffNames);
    }
    const handlingRows = await db
      .select({ consultationId: consultationLegalFriendsHandlings.consultationId })
      .from(consultationLegalFriendsHandlings)
      .where(inArray(consultationLegalFriendsHandlings.consultationId, ids));
    const handlingIds = new Set(
      handlingRows.map(
        (row) =>
          canonicalByMember.get(row.consultationId) ?? row.consultationId,
      ),
    );
    const legalFriendsCaseRows = await db
      .select({
        consultationId: legalFriendsCaseLinks.consultationId,
        caseIdx: legalFriendsCaseLinks.caseIdx,
      })
      .from(legalFriendsCaseLinks)
      .where(inArray(legalFriendsCaseLinks.consultationId, ids));
    const legalFriendsCaseByConsultation = new Map(
      legalFriendsCaseRows.map((row) => [
        canonicalByMember.get(row.consultationId) ?? row.consultationId,
        row,
      ]),
    );
    const linkedCaseNames = await linkedLegalFriendsCaseNames(
      legalFriendsCaseRows.map((row) => row.caseIdx),
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
      .where(inArray(kakaoHomepageEntries.consultationId, ids))
      .orderBy(desc(kakaoHomepageEntries.lastClickedAt));
    const homepageEntryByConsultation = new Map<
      string,
      (typeof homepageEntryRows)[number]
    >();
    for (const row of homepageEntryRows) {
      const canonicalId =
        canonicalByMember.get(row.consultationId) ?? row.consultationId;
      if (!homepageEntryByConsultation.has(canonicalId)) {
        homepageEntryByConsultation.set(canonicalId, row);
      }
    }
    const naverBookingRows = await db
      .select({
        consultationId: naverBookingEntries.consultationId,
        bookingNumber: naverBookingEntries.bookingNumber,
        status: naverBookingEntries.status,
        scheduledAt: naverBookingEntries.scheduledAt,
      })
      .from(naverBookingEntries)
      .where(inArray(naverBookingEntries.consultationId, ids));
    const naverBookingByConsultation = new Map<
      string,
      (typeof naverBookingRows)[number]
    >();
    for (const row of naverBookingRows) {
      const canonicalId =
        canonicalByMember.get(row.consultationId) ?? row.consultationId;
      if (!naverBookingByConsultation.has(canonicalId)) {
        naverBookingByConsultation.set(canonicalId, row);
      }
    }
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
      const canonicalId =
        canonicalByMember.get(call.consultationId) ?? call.consultationId;
      if (!latestTelephonyByConsultation.has(canonicalId)) {
        latestTelephonyByConsultation.set(canonicalId, {
          disposition: call.disposition,
          aftercareResult: null,
          occurredAt: call.requestedAt,
        });
      }
    }
    for (const aftercare of aftercareRows) {
      if (!aftercare.consultationId) continue;
      const canonicalId =
        canonicalByMember.get(aftercare.consultationId) ??
        aftercare.consultationId;
      const existing = latestTelephonyByConsultation.get(canonicalId);
      if (!existing || aftercare.confirmedAt > existing.occurredAt) {
        latestTelephonyByConsultation.set(canonicalId, {
          disposition: null,
          aftercareResult: aftercare.result,
          occurredAt: aftercare.confirmedAt,
        });
      }
    }

    const items = consultationRows.map((consultation) => {
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
        const groupedRequests = requestRows.filter(
          (candidate) =>
            (canonicalByMember.get(candidate.consultationId) ??
              candidate.consultationId) === consultation.id,
        );
        const providedNames = groupedRequests
          .map((candidate) =>
            candidate.nameCiphertext &&
            candidate.nameNonce &&
            candidate.nameKeyVersion
              ? protection.decrypt(
                  {
                    ciphertext: candidate.nameCiphertext,
                    nonce: candidate.nameNonce,
                    keyVersion: candidate.nameKeyVersion,
                  },
                  `consultation_requests.name:${candidate.id}`,
                )
              : null,
          )
          .filter((name): name is string => Boolean(name))
          .map(normalizeConsultationName);
        const channelCounts = groupedRequests.reduce(
          (counts, candidate) => {
            counts[candidate.contactChannel] += 1;
            return counts;
          },
          { phone: 0, kakao_channel: 0, naver_booking: 0 },
        );
        const storedDisplayName = preferredName ?? consultation.anonymousLabel;
        return {
          id: consultation.id,
          publicReceiptCode: consultation.publicReceiptCode,
          state: consultation.state,
          displayName: linkedLegalFriendsDisplayName(
            storedDisplayName,
            legalFriendsCaseByConsultation.get(consultation.id)?.caseIdx ?? null,
            linkedCaseNames,
          ),
          contactChannel: consultation.contactChannel,
          phone,
          softDeletedAt: consultation.softDeletedAt?.toISOString() ?? null,
          softDeletedByUserId: consultation.softDeletedByUserId,
          staffCreated: ["erp_staff", "erp_client_directory"].includes(
            firstByConsultation.get(consultation.id)?.source ?? "",
          ),
          latestSource: request?.source ?? "homepage",
          contactPreference:
            request?.contactPreference ?? "as_soon_as_possible",
          contactWindowStart:
            request?.contactWindowStart?.toISOString() ?? null,
          contactWindowEnd:
            request?.contactWindowEnd?.toISOString() ?? null,
          residenceRegion: residenceRegion.success
            ? residenceRegion.data
            : null,
          mode: request?.mode ?? "quick",
          dedupeOutcome: request?.dedupeOutcome ?? "new",
          requestCount: requestCounts.get(consultation.id) ?? 0,
          groupMemberCount: groupMemberCounts.get(consultation.id) ?? 1,
          channelCounts,
          nameMismatch: new Set(providedNames).size > 1,
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
      });
    const existingCustomersByConsultation =
      await existingLegalFriendsCustomersByConsultation(
        items.flatMap((item) =>
          item.phone
            ? [
                {
                  consultationId: item.id,
                  phone: item.phone,
                  ownCaseIdx:
                    legalFriendsCaseByConsultation.get(item.id)?.caseIdx ??
                    null,
                },
              ]
            : [],
        ),
      );

    return {
      items: items.map((item) => {
        const { latestSource, ...publicItem } = item;
        const legalFriendsRegistered = legalFriendsCaseByConsultation.has(
          item.id,
        );
        const existingCustomer =
          item.phone !== null &&
          existingCustomersByConsultation.has(item.id);
        return {
          ...publicItem,
          existingCustomer,
          existingCustomerStaffNames:
            existingCustomersByConsultation.get(item.id) ?? [],
          referrerStaffNames:
            referrerStaffNamesByConsultation.get(item.id) ?? null,
          legalFriendsRegistered,
          requiresLegalFriendsReview:
            existingCustomer &&
            item.softDeletedAt === null &&
            item.state === "requested" &&
            requiresLegalFriendsHandling(latestSource) &&
            !directorySourceIds.has(item.id) &&
            !handlingIds.has(item.id),
        };
      }),
      total,
      page,
      pageSize: query.pageSize,
      pageCount,
      summary,
    };
  }

  async function detail(requestedConsultationId: string) {
    const [groupRow] = await db
      .select({
        id: consultationGroups.id,
        canonicalConsultationId: consultationGroups.canonicalConsultationId,
        createdReason: consultationGroups.createdReason,
        firstRequestedAt: consultationGroups.firstRequestedAt,
        lastRequestedAt: consultationGroups.lastRequestedAt,
        createdAt: consultationGroups.createdAt,
      })
      .from(consultationGroupMembers)
      .innerJoin(
        consultationGroups,
        eq(consultationGroups.id, consultationGroupMembers.groupId),
      )
      .where(
        and(
          eq(
            consultationGroupMembers.consultationId,
            requestedConsultationId,
          ),
          eq(consultationGroups.status, "active"),
        ),
      )
      .limit(1);
    const consultationId =
      groupRow?.canonicalConsultationId ?? requestedConsultationId;
    const memberRows = groupRow
      ? await db
          .select({
            id: consultations.id,
            publicReceiptCode: consultations.publicReceiptCode,
            state: consultations.state,
            contactChannel: consultations.contactChannel,
            preferredNameCiphertext: consultations.preferredNameCiphertext,
            preferredNameNonce: consultations.preferredNameNonce,
            preferredNameKeyVersion: consultations.preferredNameKeyVersion,
            anonymousLabel: consultations.anonymousLabel,
            firstRequestedAt: consultations.firstRequestedAt,
            lastRequestedAt: consultations.lastRequestedAt,
            softDeletedAt: consultations.softDeletedAt,
          })
          .from(consultationGroupMembers)
          .innerJoin(
            consultations,
            eq(consultations.id, consultationGroupMembers.consultationId),
          )
          .where(eq(consultationGroupMembers.groupId, groupRow.id))
          .orderBy(asc(consultations.firstRequestedAt))
      : [];
    const memberIds = groupRow
      ? memberRows.map((row) => row.id)
      : [consultationId];
    const [consultation] = await db
      .select()
      .from(consultations)
      .where(eq(consultations.id, consultationId))
      .limit(1);
    if (!consultation) return null;

    const kakaoEntries = await db
      .select({
        id: kakaoHomepageEntries.id,
        consultationId: kakaoHomepageEntries.consultationId,
        firstRequestId: kakaoHomepageEntries.firstRequestId,
        status: kakaoHomepageEntries.status,
        clickCount: kakaoHomepageEntries.clickCount,
        firstClickedAt: kakaoHomepageEntries.firstClickedAt,
        lastClickedAt: kakaoHomepageEntries.lastClickedAt,
        confirmedAt: kakaoHomepageEntries.confirmedAt,
        invalidatedAt: kakaoHomepageEntries.invalidatedAt,
      })
      .from(kakaoHomepageEntries)
      .where(inArray(kakaoHomepageEntries.consultationId, memberIds))
      .orderBy(desc(kakaoHomepageEntries.lastClickedAt));
    const kakaoEntry = kakaoEntries[0];
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
      .where(inArray(naverBookingEntries.consultationId, memberIds))
      .orderBy(desc(naverBookingEntries.sourceReceivedAt))
      .limit(1);
    const [directorySourceRow] = await db
      .select({
        clientIdx: consultationDirectorySources.directoryClientIdx,
        caseIdx: consultationDirectorySources.directoryCaseIdx,
        relationship: consultationDirectorySources.relationship,
        snapshotCiphertext: consultationDirectorySources.snapshotCiphertext,
        snapshotNonce: consultationDirectorySources.snapshotNonce,
        snapshotKeyVersion: consultationDirectorySources.snapshotKeyVersion,
      })
      .from(consultationDirectorySources)
      .where(eq(consultationDirectorySources.consultationId, consultationId))
      .limit(1);
    const [legalFriendsHandling] = await db
      .select({
        mode: consultationLegalFriendsHandlings.mode,
        directoryClientIdx:
          consultationLegalFriendsHandlings.directoryClientIdx,
        directoryCaseIdx: consultationLegalFriendsHandlings.directoryCaseIdx,
        decidedByUserId:
          consultationLegalFriendsHandlings.decidedByUserId,
        decidedAt: consultationLegalFriendsHandlings.decidedAt,
      })
      .from(consultationLegalFriendsHandlings)
      .where(
        eq(consultationLegalFriendsHandlings.consultationId, consultationId),
      )
      .limit(1);
    const directorySnapshot = directorySourceRow
      ? (JSON.parse(
          protection.decrypt(
            {
              ciphertext: directorySourceRow.snapshotCiphertext,
              nonce: directorySourceRow.snapshotNonce,
              keyVersion: directorySourceRow.snapshotKeyVersion,
            },
            `consultation_directory_sources/${consultationId}/snapshot`,
          ),
        ) as ConsultationDirectorySnapshot)
      : null;

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
    const assignmentOptionRows = assignment
      ? await db
          .select({
            userId: staffUsers.id,
            displayName: staffProfiles.displayName,
            membershipId: staffMemberships.id,
            organizationName: staffOrganizations.name,
            department: staffMemberships.department,
            jobTitle: staffMemberships.jobTitle,
            externalAccountId: staffExternalAccounts.externalAccountId,
            externalMemberIdx: staffExternalAccounts.externalMemberIdx,
          })
          .from(staffUsers)
          .innerJoin(
            staffProfiles,
            eq(staffProfiles.userId, staffUsers.id),
          )
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
            staffExternalAccounts,
            and(
              eq(staffExternalAccounts.staffUserId, staffUsers.id),
              eq(staffExternalAccounts.provider, "legalfriends"),
              eq(staffExternalAccounts.isActive, true),
              isNotNull(staffExternalAccounts.externalMemberIdx),
            ),
          )
          .where(eq(staffUsers.status, "active"))
          .orderBy(asc(staffProfiles.displayName))
      : [];
    const assignmentTransferRows = assignment
      ? await db
          .select({
            id: consultationAssignmentTransfers.id,
            previousAssigneeUserId:
              consultationAssignmentTransfers.previousAssigneeUserId,
            targetAssigneeUserId:
              consultationAssignmentTransfers.targetAssigneeUserId,
            requestedByUserId:
              consultationAssignmentTransfers.requestedByUserId,
            reason: consultationAssignmentTransfers.reason,
            status: consultationAssignmentTransfers.status,
            requestedAt: consultationAssignmentTransfers.requestedAt,
            finishedAt: consultationAssignmentTransfers.finishedAt,
            eventStatus: outboxEvents.status,
            lastError: outboxEvents.lastError,
          })
          .from(consultationAssignmentTransfers)
          .innerJoin(
            outboxEvents,
            eq(
              outboxEvents.id,
              consultationAssignmentTransfers.outboxEventId,
            ),
          )
          .where(
            eq(
              consultationAssignmentTransfers.consultationId,
              consultationId,
            ),
          )
          .orderBy(desc(consultationAssignmentTransfers.requestedAt))
          .limit(10)
      : [];
    const assignmentTransferUserIds = [
      ...new Set(
        assignmentTransferRows.flatMap((row) => [
          row.previousAssigneeUserId,
          row.targetAssigneeUserId,
          row.requestedByUserId,
        ]),
      ),
    ];
    const assignmentTransferProfileRows =
      assignmentTransferUserIds.length > 0
        ? await db
            .select({
              userId: staffProfiles.userId,
              displayName: staffProfiles.displayName,
            })
            .from(staffProfiles)
            .where(
              inArray(staffProfiles.userId, assignmentTransferUserIds),
            )
        : [];
    const assignmentTransferDisplayNames = new Map(
      assignmentTransferProfileRows.map((row) => [
        row.userId,
        row.displayName,
      ]),
    );
    const integrationEventTypes = [
      "alimtalk.consultation.request_notification.requested",
      "legalfriends.consultation.registration.requested",
      "legalfriends.consultation.invalidation.requested",
      "legalfriends.consultation.manager_change.requested",
      "legalfriends.consultation.restoration.requested",
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
    const [legalFriendsCase] = await db
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
          .limit(1);
    const linkedCaseNames = await linkedLegalFriendsCaseNames(
      legalFriendsCase ? [legalFriendsCase.caseIdx] : [],
    );
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
      .select({
        request: consultationRequests,
        createdByDisplayName: staffProfiles.displayName,
      })
      .from(consultationRequests)
      .leftJoin(
        staffProfiles,
        eq(staffProfiles.userId, consultationRequests.createdByUserId),
      )
      .where(inArray(consultationRequests.consultationId, memberIds))
      .orderBy(desc(consultationRequests.submittedAt));
    const requests = requestRows.map(({ request, createdByDisplayName }) => ({
      ...request,
      createdByDisplayName,
    }));
    const attributionRows = await db
      .select()
      .from(consultationAttributions)
      .where(inArray(consultationAttributions.consultationId, memberIds));
    const attributionByRequest = new Map(
      attributionRows.map((row) => [row.requestId, row]),
    );
    const candidateIds = requests
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
    const phoneByRequest = new Map(
      requests.map((request) => [
        request.id,
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
      ]),
    );
    const latestPhone =
      requests
        .map((request) => phoneByRequest.get(request.id) ?? null)
        .find((phone): phone is string => Boolean(phone)) ?? null;
    const unfilteredLegalFriendsMatches = latestPhone
      ? await legalFriendsCustomerMatches(latestPhone)
      : [];
    const legalFriendsMatches = excludeOwnLegalFriendsCase(
      unfilteredLegalFriendsMatches,
      legalFriendsCase?.caseIdx ?? null,
    );
    const latestRequestSource = requests[0]?.source ?? null;
    const firstRequestSource = requests.at(-1)?.source ?? null;
    const latestRequestByMember = new Map<
      string,
      (typeof requests)[number]
    >();
    const requestCountByMember = new Map<string, number>();
    for (const request of requests) {
      requestCountByMember.set(
        request.consultationId,
        (requestCountByMember.get(request.consultationId) ?? 0) + 1,
      );
      if (!latestRequestByMember.has(request.consultationId)) {
        latestRequestByMember.set(request.consultationId, request);
      }
    }
    const groupedNames = requests
      .map((request) =>
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
      )
      .filter((name): name is string => Boolean(name))
      .map(normalizeConsultationName);
    const groupEventRows = groupRow
      ? await db
          .select({
            id: consultationGroupEvents.id,
            consultationId: consultationGroupEvents.consultationId,
            eventType: consultationGroupEvents.eventType,
            actorUserId: consultationGroupEvents.actorUserId,
            actorDisplayName: staffProfiles.displayName,
            metadata: consultationGroupEvents.metadata,
            occurredAt: consultationGroupEvents.occurredAt,
          })
          .from(consultationGroupEvents)
          .leftJoin(
            staffProfiles,
            eq(staffProfiles.userId, consultationGroupEvents.actorUserId),
          )
          .where(eq(consultationGroupEvents.groupId, groupRow.id))
          .orderBy(desc(consultationGroupEvents.occurredAt))
      : [];
    const kakaoEntryByConsultation = new Map(
      kakaoEntries.map((entry) => [entry.consultationId, entry]),
    );

    const storedDisplayName = preferredName ?? consultation.anonymousLabel;
    return {
      id: consultation.id,
      publicReceiptCode: consultation.publicReceiptCode,
      state: consultation.state,
      displayName: linkedLegalFriendsDisplayName(
        storedDisplayName,
        legalFriendsCase?.caseIdx ?? null,
        linkedCaseNames,
      ),
      contactChannel: consultation.contactChannel,
      phone: latestPhone,
      softDeletedAt: consultation.softDeletedAt?.toISOString() ?? null,
      softDeletedByUserId: consultation.softDeletedByUserId,
      staffCreated: ["erp_staff", "erp_client_directory"].includes(
        firstRequestSource ?? "",
      ),
      existingCustomer: legalFriendsMatches.length > 0,
      legalFriendsRegistered: Boolean(legalFriendsCase),
      nameMismatch: new Set(groupedNames).size > 1,
      requiresLegalFriendsReview:
        legalFriendsMatches.length > 0 &&
        consultation.softDeletedAt === null &&
        consultation.state === "requested" &&
        requiresLegalFriendsHandling(latestRequestSource) &&
        !directorySourceRow &&
        !legalFriendsHandling,
      legalFriendsMatches,
      legalFriendsHandling: legalFriendsHandling
        ? {
            mode:
              legalFriendsHandling.mode === "existing_case"
                ? ("existing_case" as const)
                : legalFriendsHandling.mode === "shared_contact"
                  ? ("shared_contact" as const)
                  : ("new_matter" as const),
            directoryClientIdx: legalFriendsHandling.directoryClientIdx,
            directoryCaseIdx: legalFriendsHandling.directoryCaseIdx,
            decidedByUserId: legalFriendsHandling.decidedByUserId,
            decidedAt: legalFriendsHandling.decidedAt.toISOString(),
          }
        : null,
      group: groupRow
        ? {
            id: groupRow.id,
            canonicalConsultationId: groupRow.canonicalConsultationId,
            createdReason: groupRow.createdReason,
            createdAt: groupRow.createdAt.toISOString(),
            memberCount: memberRows.length,
            nameMismatch: new Set(groupedNames).size > 1,
            members: memberRows.map((member) => {
              const request = latestRequestByMember.get(member.id);
              const memberName =
                member.preferredNameCiphertext &&
                member.preferredNameNonce &&
                member.preferredNameKeyVersion
                  ? protection.decrypt(
                      {
                        ciphertext: member.preferredNameCiphertext,
                        nonce: member.preferredNameNonce,
                        keyVersion: member.preferredNameKeyVersion,
                      },
                      `consultations.preferred_name:${member.id}`,
                    )
                  : member.anonymousLabel;
              return {
                id: member.id,
                publicReceiptCode: member.publicReceiptCode,
                canonical:
                  member.id === groupRow.canonicalConsultationId,
                state: member.state,
                displayName: safeConsultationCustomerDisplayName(memberName),
                contactChannel: member.contactChannel,
                phone: request
                  ? phoneByRequest.get(request.id) ?? null
                  : null,
                requestCount: requestCountByMember.get(member.id) ?? 0,
                firstRequestedAt: member.firstRequestedAt.toISOString(),
                lastRequestedAt: member.lastRequestedAt.toISOString(),
                kakaoStatus:
                  kakaoEntryByConsultation.get(member.id)?.status ?? null,
              };
            }),
            events: groupEventRows.map((event) => ({
              id: event.id,
              consultationId: event.consultationId,
              eventType: event.eventType,
              actorUserId: event.actorUserId,
              actorDisplayName: event.actorDisplayName,
              metadata: event.metadata,
              occurredAt: event.occurredAt.toISOString(),
            })),
          }
        : null,
      kakaoEntry: kakaoEntry
        ? {
            id: kakaoEntry.id,
            consultationId: kakaoEntry.consultationId,
            status: kakaoEntry.status,
            nameProvided: Boolean(
              requests.find(
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
      directorySource:
        directorySourceRow && directorySnapshot
          ? {
              clientIdx: directorySourceRow.clientIdx,
              caseIdx: directorySourceRow.caseIdx,
              relationship:
                directorySourceRow.relationship === "referrer"
                  ? ("referrer" as const)
                  : ("customer" as const),
              ...directorySnapshot,
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
      assignmentOptions: assignmentOptionRows
        .filter(
          (option) =>
            option.externalMemberIdx &&
            option.externalAccountId !==
              LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
        )
        .map((option) => ({
          userId: option.userId,
          displayName: option.displayName,
          membershipId: option.membershipId,
          organizationName: option.organizationName,
          department: option.department,
          jobTitle: option.jobTitle,
        })),
      assignmentTransfers: assignmentTransferRows.map((transfer) => ({
        id: transfer.id,
        previousAssigneeUserId: transfer.previousAssigneeUserId,
        previousAssigneeDisplayName:
          assignmentTransferDisplayNames.get(
            transfer.previousAssigneeUserId,
          ) ?? "이전 담당자",
        targetAssigneeUserId: transfer.targetAssigneeUserId,
        targetAssigneeDisplayName:
          assignmentTransferDisplayNames.get(
            transfer.targetAssigneeUserId,
          ) ?? "변경 담당자",
        requestedByUserId: transfer.requestedByUserId,
        requestedByDisplayName:
          assignmentTransferDisplayNames.get(transfer.requestedByUserId) ??
          "요청 직원",
        reason: transfer.reason,
        status: transfer.status,
        eventStatus: transfer.eventStatus,
        requestedAt: transfer.requestedAt.toISOString(),
        finishedAt: transfer.finishedAt?.toISOString() ?? null,
        lastError: transfer.lastError,
      })),
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
      firstRequestedAt: (
        groupRow?.firstRequestedAt ?? consultation.firstRequestedAt
      ).toISOString(),
      lastRequestedAt: (
        groupRow?.lastRequestedAt ?? consultation.lastRequestedAt
      ).toISOString(),
      requests: requests.map((request) => {
        const attribution = attributionByRequest.get(request.id);
        return {
          id: request.id,
          consultationId: request.consultationId,
          consultationReceiptCode:
            memberRows.find((member) => member.id === request.consultationId)
              ?.publicReceiptCode ?? consultation.publicReceiptCode,
          mode: request.mode,
          source: request.source,
          createdByUserId: request.createdByUserId,
          createdByDisplayName: request.createdByDisplayName,
          contactChannel: request.contactChannel,
          phone: phoneByRequest.get(request.id) ?? null,
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
    linkConsultationGroup,
    requestAssigneeTransfer,
    restoreInvalidatedLegalFriendsCase,
    confirmKakaoHomepageEntry,
    detail,
    ingestNaverBooking,
    invalidateLegalFriendsCase,
    invalidateKakaoHomepageEntry,
    list,
    splitConsultationGroup,
    softDeleteStaffConsultation,
    submit,
    submitSelfDiagnosis,
    submitKakao,
    submitKakaoHomepageEntry,
  };
}

export type ConsultationService = ReturnType<
  typeof createConsultationService
>;
