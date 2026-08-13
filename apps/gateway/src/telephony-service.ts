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
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  assertPlatformEvent,
  centrexMessageByteLength,
  centrexMessageKind,
  createConsultationId,
  createConsultationRequestId,
  createEventId,
  createPublicReceiptCode,
  createTelephonyCallId,
  createTelephonyMessageId,
  CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
  type LegalFriendsDirectoryConsultationCreate,
  type MessageTemplateCreate,
  type MessageTemplateUpdate,
  type PhoneDeskAftercareSave,
  type PhoneDeskCallResolution,
  type TelephonyMessageSend,
  type TelephonyCallDisposition,
  type CentrexBridgeCommandResult,
  type PlatformEvent,
  type ResidenceRegion,
  type StaffConsultationCreate,
} from "@lawand/core";
import {
  consultationAssignments,
  consultationDirectorySources,
  consultationRequests,
  consultationStatusHistory,
  consultations,
  legalFriendsCaseLinks,
  messageTemplates,
  outboxEvents,
  staffAuditLogs,
  staffExternalAccounts,
  staffMemberships,
  staffProfiles,
  staffUsers,
  staffTelephonyBindings,
  telephonyCallObservationLinks,
  telephonyCallAftercare,
  telephonyCallDirectoryTargets,
  telephonyCallLegs,
  telephonyCalls,
  telephonyCallRelations,
  telephonyCallRoots,
  telephonyEndpointCredentials,
  telephonyEndpoints,
  telephonyInboundCalls,
  telephonyInboundCommands,
  telephonyInboundEvents,
  telephonyInboundMessages,
  telephonyMessageDirectoryTargets,
  telephonyMessageMailboxStates,
  telephonyMessages,
  telephonyFollowUpTasks,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { StaffPrincipal } from "./auth.js";
import type { DataProtection } from "./crypto.js";
import { createInboundCommandPollGate } from "./inbound-command-poll-gate.js";
import { phoneDirectoryCustomersQuery } from "./phone-directory.js";
import {
  inspectMmsJpeg,
  SolapiDeliveryError,
  type SolapiClient,
} from "./solapi.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const DUPLICATE_COMMAND_WINDOW_MS = 30_000;
const INBOUND_RINGING_SNAPSHOT_WINDOW_MS = 3 * 60_000;
const INBOUND_CONNECTED_SNAPSHOT_WINDOW_MS = 12 * 60 * 60_000;
const INBOUND_ENDED_SNAPSHOT_WINDOW_MS = 20_000;
const INBOUND_ANSWER_COMMAND_TTL_MS = 20_000;
const INBOUND_ANSWER_EVENT_MAX_DELIVERY_DELAY_MS = 15_000;
const INBOUND_ANSWER_DISPATCH_TIMEOUT_MS = 3 * 60_000;
const PHONE_DESK_DEFAULT_LIMIT = 20;
const PHONE_DESK_MAX_LIMIT = 100;
const callRootCurrentEndpoint = alias(
  telephonyEndpoints,
  "call_root_current_endpoint",
);
const callLegEndpoint = alias(telephonyEndpoints, "call_leg_endpoint");

export function isCentrexInboundAnswerDeliveryDelayed(input: {
  answerableBridge: boolean;
  occurredAt: Date | null;
  receivedAt: Date | null;
}): boolean {
  if (!input.answerableBridge) return false;
  if (!input.occurredAt || !input.receivedAt) return true;
  return input.receivedAt.getTime() - input.occurredAt.getTime() >
    INBOUND_ANSWER_EVENT_MAX_DELIVERY_DELAY_MS;
}

export type PhoneDeskListFilter =
  | "all"
  | "inbound"
  | "click_to_call"
  | "centrex_direct"
  | "internal"
  | "active";

export type PhoneDeskListQuery = {
  page: number;
  pageSize: 20 | 50 | 100;
  filter?: PhoneDeskListFilter;
  from?: Date;
  to?: Date;
};

export function canonicalizePhoneDeskObservedCalls<
  T extends {
    id: string;
    connectedAt: string | null;
    lastEventAt: string;
    receptionMode: "office_bridge" | "uplus_network" | null;
    correlationStatus: "pending" | "confirmed" | "needs_confirmation" | "rejected";
  },
>(items: T[]): T[] {
  const byCall = new Map<string, T>();
  for (const item of items) {
    const current = byCall.get(item.id);
    if (!current) {
      byCall.set(item.id, item);
      continue;
    }
    const preferred = item.connectedAt && !current.connectedAt
      ? item
      : current.connectedAt && !item.connectedAt
        ? current
        : new Date(item.lastEventAt) > new Date(current.lastEventAt)
          ? item
          : current;
    byCall.set(item.id, {
      ...preferred,
      receptionMode:
        !preferred.connectedAt &&
          (current.receptionMode === "office_bridge" ||
            item.receptionMode === "office_bridge")
          ? "office_bridge"
          : preferred.receptionMode,
      correlationStatus:
        current.correlationStatus === "needs_confirmation" ||
          item.correlationStatus === "needs_confirmation"
          ? "needs_confirmation"
          : preferred.correlationStatus,
    });
  }
  return [...byCall.values()];
}

export function phoneDeskItemMatchesFilter(
  item: {
    source: "inbound" | "click_to_call" | "centrex_direct" | "internal";
    state: "pending" | "ringing" | "connected" | "ended" | "failed" | "unknown";
  },
  filter: PhoneDeskListFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "active") {
    return ["pending", "ringing", "connected"].includes(item.state);
  }
  return item.source === filter;
}

type InboundAnswerCommandStatus =
  | "queued"
  | "dispatching"
  | "succeeded"
  | "failed"
  | "expired";

function inboundAnswerCommandResponse(command: {
  id: string;
  inboundCallId: string;
  status: InboundAnswerCommandStatus;
  requestedAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
  resultCode: string | null;
}) {
  return {
    id: command.id,
    inboundCallId: command.inboundCallId,
    status: command.status,
    requestedAt: command.requestedAt.toISOString(),
    expiresAt: command.expiresAt.toISOString(),
    completedAt: command.completedAt?.toISOString() ?? null,
    resultCode: command.resultCode,
  };
}

export function messagePhoneDisplay(value: string): string {
  if (!/^0[0-9]{8,10}$/.test(value)) {
    return "발신번호 확인 필요";
  }
  return value;
}

export type PhoneCustomerMatch =
  | {
      source: "consultation";
      consultation: {
        id: string;
        publicReceiptCode: string;
        displayName: string;
        state: string;
        firstRequestedAt: string;
        lastRequestedAt: string;
        assigneeUserId: string | null;
        assigneeDisplayName: string | null;
      };
    }
  | {
      source: "legal_friends";
      clientName: string;
      cases: Array<{
        clientIdx: number;
        caseIdx: number;
        caseNumber: string | null;
        caseName: string | null;
        caseType: number;
        caseState: number;
        isClosed: boolean;
        isRepealed: boolean;
        courtName: string | null;
        caseCreatedOn: string;
        caseUpdatedOn: string;
        staffNames: string[];
        staffUserIds: string[];
      }>;
    }
  | null;

type LegalFriendsDirectoryRow = {
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
  primary_member_idx: number | null;
  secondary_member_idx: number | null;
  tertiary_member_idx: number | null;
  court_name: string | null;
  case_created_on: string;
  case_updated_on: string;
};

type LegalFriendsDirectoryBatchRow = LegalFriendsDirectoryRow & {
  candidate_phone: string;
};

type LegalFriendsClientSearchRow = {
  client_idx: number;
  case_idx: number;
  client_name: string | null;
  phone: string | null;
  phone_search: string | null;
  living_place: string | null;
  case_type: number;
  case_category: number;
  case_state: number;
  max_state: number;
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

type LegalFriendsDirectoryCallTargetRow = {
  client_name: string;
  phone: string;
};

type LegalFriendsDirectoryConsultationSourceRow = {
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

export type LegalFriendsClientDirectoryItem = {
  clientIdx: number;
  caseIdx: number;
  clientName: string;
  phone: string | null;
  callable: boolean;
  residenceRegion: ResidenceRegion | null;
  caseType: number;
  caseCategory: number;
  caseState: number;
  maxState: number;
  isClosed: boolean;
  isRepealed: boolean;
  courtName: string | null;
  caseNumber: string | null;
  caseName: string | null;
  staffNames: string[];
  caseCreatedOn: string;
  caseUpdatedOn: string;
};

const legalFriendsResidencePrefixes: Array<
  readonly [readonly string[], ResidenceRegion]
> = [
  [["서울특별시", "서울"], "seoul"],
  [["부산광역시", "부산"], "busan"],
  [["대구광역시", "대구"], "daegu"],
  [["인천광역시", "인천"], "incheon"],
  [["광주광역시", "광주"], "gwangju"],
  [["대전광역시", "대전"], "daejeon"],
  [["울산광역시", "울산"], "ulsan"],
  [["세종특별자치시", "세종"], "sejong"],
  [["경기도", "경기"], "gyeonggi"],
  [["강원특별자치도", "강원도", "강원"], "gangwon"],
  [["충청북도", "충북"], "chungbuk"],
  [["충청남도", "충남"], "chungnam"],
  [["전북특별자치도", "전라북도", "전북"], "jeonbuk"],
  [["전라남도", "전남"], "jeonnam"],
  [["경상북도", "경북"], "gyeongbuk"],
  [["경상남도", "경남"], "gyeongnam"],
  [["제주특별자치도", "제주도", "제주"], "jeju"],
  [["해외", "국외"], "overseas_or_other"],
];

export function legalFriendsResidenceRegion(
  value: string | null,
): ResidenceRegion | null {
  const normalized = value?.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  for (const [prefixes, region] of legalFriendsResidencePrefixes) {
    if (prefixes.some((prefix) => normalized.startsWith(prefix))) {
      return region;
    }
  }
  return null;
}

export class TelephonyCallError extends Error {
  constructor(
    readonly code:
      | "feature_disabled"
      | "consultation_not_found"
      | "consultation_not_assigned"
      | "consultation_assigned_to_other_staff"
      | "consultation_phone_not_collected"
      | "directory_query_invalid"
      | "directory_target_not_found"
      | "directory_phone_not_callable"
      | "directory_consultation_idempotency_conflict"
      | "centrex_endpoint_not_linked"
      | "call_not_found"
      | "call_owned_by_other_staff"
      | "call_not_reconciled"
      | "call_not_ended"
      | "call_resolution_required"
      | "call_resolution_not_required"
      | "call_resolution_leg_invalid"
      | "call_resolution_leg_active"
      | "call_phone_not_available"
      | "internal_aftercare_result_invalid"
      | "internal_consultation_not_allowed"
      | "external_aftercare_result_invalid"
      | "aftercare_not_found"
      | "follow_up_not_found"
      | "follow_up_not_open"
      | "follow_up_due_invalid"
      | "staff_not_assignable"
      | "consultation_phone_mismatch"
      | "consultation_already_exists"
      | "message_not_found"
      | "message_thread_not_found"
      | "message_owned_by_other_staff"
      | "message_template_not_found"
      | "message_template_inactive"
      | "message_template_name_conflict"
      | "message_template_owned_by_other_staff"
      | "message_image_invalid"
      | "message_image_upload_failed"
      | "mms_feature_disabled"
      | "message_idempotency_conflict"
      | "message_body_invalid"
      | "inbound_call_not_found"
      | "inbound_call_not_ringing"
      | "inbound_call_answer_unavailable"
      | "inbound_call_owned_by_other_staff"
      | "inbound_command_not_found"
      | "inbound_command_identity_mismatch"
      | "inbound_command_not_dispatching",
    message: string,
  ) {
    super(message);
  }
}

function eventRow(
  event: PlatformEvent,
  aggregateId: string,
  aggregateType = "telephony_call",
) {
  return {
    id: event.eventId,
    aggregateType,
    aggregateId,
    eventType: event.eventType,
    eventVersion: event.eventVersion,
    correlationId: event.correlationId,
    causationId: event.causationId ?? null,
    payload: event,
    status: "pending" as const,
    attempts: 0,
    availableAt: new Date(event.occurredAt),
    occurredAt: new Date(event.occurredAt),
    createdAt: new Date(event.occurredAt),
  };
}

function callResponse(call: {
  id: string;
  targetSource: "consultation" | "legal_friends_directory";
  consultationId: string | null;
  endpointId: string;
  commandStatus: "queued" | "dispatching" | "succeeded" | "failed" | "unknown";
  outcome: "unknown" | "answered" | "no_answer" | "busy" | "failed" | "cancelled";
  requestedAt: Date;
  dispatchedAt: Date | null;
  providerRespondedAt: Date | null;
  providerStatus: string | null;
  providerStartedAt: Date | null;
  providerEndedAt: Date | null;
  providerDurationSeconds: number | null;
  providerBillableSeconds: number | null;
  reconciledAt: Date | null;
  disposition: TelephonyCallDisposition | null;
  dispositionConfirmedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}) {
  return {
    id: call.id,
    targetSource: call.targetSource,
    consultationId: call.consultationId,
    endpointId: call.endpointId,
    commandStatus: call.commandStatus,
    outcome: call.outcome,
    requestedAt: call.requestedAt.toISOString(),
    dispatchedAt: call.dispatchedAt?.toISOString() ?? null,
    providerRespondedAt: call.providerRespondedAt?.toISOString() ?? null,
    providerStatus: call.providerStatus,
    providerStartedAt: call.providerStartedAt?.toISOString() ?? null,
    providerEndedAt: call.providerEndedAt?.toISOString() ?? null,
    providerDurationSeconds: call.providerDurationSeconds,
    providerBillableSeconds: call.providerBillableSeconds,
    providerRingSeconds:
      call.providerDurationSeconds === null ||
      call.providerBillableSeconds === null
        ? null
        : Math.max(
            0,
            call.providerDurationSeconds - call.providerBillableSeconds,
          ),
    reconciledAt: call.reconciledAt?.toISOString() ?? null,
    disposition: call.disposition,
    dispositionConfirmedAt:
      call.dispositionConfirmedAt?.toISOString() ?? null,
    lastErrorCode: call.lastErrorCode,
    lastErrorMessage: call.lastErrorMessage,
  };
}

function messageResponse(message: {
  id: string;
  targetSource: "consultation" | "legal_friends_directory";
  consultationId: string | null;
  endpointId: string;
  templateId: string | null;
  templateNameSnapshot: string | null;
  provider: "centrex" | "solapi";
  messageKind: "sms" | "lms" | "mms";
  imageFileIdSnapshot: string | null;
  imageOriginalNameSnapshot: string | null;
  bodyByteLength: number;
  commandStatus: "queued" | "dispatching" | "succeeded" | "failed" | "unknown";
  requestedAt: Date;
  dispatchedAt: Date | null;
  providerRespondedAt: Date | null;
  providerCode: string | null;
  providerRemainingCount: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}) {
  return {
    id: message.id,
    targetSource: message.targetSource,
    consultationId: message.consultationId,
    endpointId: message.endpointId,
    templateId: message.templateId,
    templateName: message.templateNameSnapshot,
    provider: message.provider,
    messageKind: message.messageKind,
    imageAttached: Boolean(message.imageFileIdSnapshot),
    imageName: message.imageOriginalNameSnapshot,
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
  };
}

export function createTelephonyService(options: {
  db: Database;
  protection: DataProtection;
  dispatchEnabled: boolean;
  solapiClient?: SolapiClient | null;
  solapiMmsSender?: string | null;
  answerableBridgeIds?: ReadonlySet<string>;
  idleCommandPollIntervalMs?: number;
  now?: () => Date;
}) {
  const {
    db,
    protection,
    dispatchEnabled,
    solapiClient = null,
    solapiMmsSender = null,
    answerableBridgeIds = new Set<string>(),
    idleCommandPollIntervalMs,
    now = () => new Date(),
  } = options;
  const inboundCommandPollGate = createInboundCommandPollGate({
    ...(idleCommandPollIntervalMs === undefined
      ? {}
      : { idlePollIntervalMs: idleCommandPollIntervalMs }),
    now: () => now().getTime(),
  });

  async function resolveLegalFriendsPhones(phones: readonly string[]) {
    const normalizedPhones = [
      ...new Set(
        phones
          .map((phone) => phone.replace(/[^0-9]/g, ""))
          .filter((phone) => phone.length >= 9 && phone.length <= 15),
      ),
    ];
    const matches = new Map<
      string,
      Extract<PhoneCustomerMatch, { source: "legal_friends" }>
    >();
    if (normalizedPhones.length === 0) return matches;

    const result = await db.execute(
      phoneDirectoryCustomersQuery(normalizedPhones),
    );
    const rows = result.rows as LegalFriendsDirectoryBatchRow[];
    const memberIndexes = [
      ...new Set(
        rows
          .flatMap((row) => [
            row.primary_member_idx,
            row.secondary_member_idx,
            row.tertiary_member_idx,
          ])
          .filter(
            (value): value is number =>
              Number.isInteger(value) && (value ?? 0) > 0,
          ),
      ),
    ];
    const linkedStaff = memberIndexes.length
      ? await db
          .select({
            memberIdx: staffExternalAccounts.externalMemberIdx,
            staffUserId: staffExternalAccounts.staffUserId,
          })
          .from(staffExternalAccounts)
          .innerJoin(
            staffUsers,
            and(
              eq(staffUsers.id, staffExternalAccounts.staffUserId),
              eq(staffUsers.status, "active"),
            ),
          )
          .innerJoin(
            staffMemberships,
            and(
              eq(staffMemberships.userId, staffExternalAccounts.staffUserId),
              eq(staffMemberships.isPrimary, true),
              eq(staffMemberships.isActive, true),
            ),
          )
          .where(
            and(
              eq(staffExternalAccounts.provider, "legalfriends"),
              eq(staffExternalAccounts.isActive, true),
              inArray(staffExternalAccounts.externalMemberIdx, memberIndexes),
            ),
          )
      : [];
    const staffByMemberIdx = new Map(
      linkedStaff.flatMap((item) =>
        item.memberIdx === null
          ? []
          : [[item.memberIdx, item.staffUserId] as const],
      ),
    );

    const rowsByPhone = new Map<string, LegalFriendsDirectoryBatchRow[]>();
    for (const row of rows) {
      const current = rowsByPhone.get(row.candidate_phone) ?? [];
      current.push(row);
      rowsByPhone.set(row.candidate_phone, current);
    }
    for (const [phone, phoneRows] of rowsByPhone) {
      const clientName =
        phoneRows.find((row) => row.client_name)?.client_name ??
        "이름 미확인";
      matches.set(phone, {
        source: "legal_friends",
        clientName,
        cases: phoneRows.map((row) => ({
          clientIdx: row.client_idx,
          caseIdx: row.case_idx,
          caseNumber: row.case_number,
          caseName: row.case_name,
          caseType: row.case_type,
          caseState: row.case_state,
          isClosed: row.is_closed === 1,
          isRepealed: row.is_repealed === 1,
          courtName: row.court_name,
          caseCreatedOn: row.case_created_on,
          caseUpdatedOn: row.case_updated_on,
          staffNames: [
            row.primary_staff_name,
            row.secondary_staff_name,
            row.tertiary_staff_name,
          ].filter((name): name is string => Boolean(name)),
          staffUserIds: [
            row.primary_member_idx,
            row.secondary_member_idx,
            row.tertiary_member_idx,
          ].flatMap((memberIdx) => {
            const staffUserId = memberIdx
              ? staffByMemberIdx.get(memberIdx)
              : undefined;
            return staffUserId ? [staffUserId] : [];
          }),
        })),
      });
    }
    return matches;
  }

  async function resolveLegalFriendsPhone(
    phone: string,
  ): Promise<Extract<PhoneCustomerMatch, { source: "legal_friends" }> | null> {
    const normalizedPhone = phone.replace(/[^0-9]/g, "");
    return (await resolveLegalFriendsPhones([phone])).get(normalizedPhone) ?? null;
  }

  async function searchLegalFriendsClients(
    query: string,
    actor: StaffPrincipal,
    limit = 30,
  ) {
    const normalizedQuery = query.trim();
    const isPhoneQuery = /^[0-9() +.-]+$/.test(normalizedQuery);
    const phoneDigits = normalizedQuery.replace(/[^0-9]/g, "");
    const compactName = normalizedQuery.replace(/\s/g, "");
    if (
      (isPhoneQuery && (phoneDigits.length < 4 || phoneDigits.length > 15)) ||
      (!isPhoneQuery && (compactName.length < 2 || compactName.length > 30))
    ) {
      throw new TelephonyCallError(
        "directory_query_invalid",
        isPhoneQuery
          ? "전화번호는 숫자 4자리 이상 입력해 주세요."
          : "고객명은 두 글자 이상 입력해 주세요.",
      );
    }
    const normalizedLimit = Math.min(Math.max(Math.trunc(limit) || 30, 1), 50);
    const result = await db.execute(
      sql<LegalFriendsClientSearchRow>`SELECT * FROM public.search_legalfriends_client_directory(${normalizedQuery}, ${normalizedLimit})`,
    );
    const rows = result.rows as LegalFriendsClientSearchRow[];
    const items: LegalFriendsClientDirectoryItem[] = rows.map((row) => ({
      clientIdx: row.client_idx,
      caseIdx: row.case_idx,
      clientName: row.client_name ?? "이름 미확인",
      phone: row.phone,
      callable: /^[0-9]{9,15}$/.test(row.phone_search ?? ""),
      residenceRegion: legalFriendsResidenceRegion(row.living_place),
      caseType: row.case_type,
      caseCategory: row.case_category,
      caseState: row.case_state,
      maxState: row.max_state,
      isClosed: row.is_closed === 1,
      isRepealed: row.is_repealed === 1,
      courtName: row.court_name,
      caseNumber: row.case_number,
      caseName: row.case_name,
      staffNames: [
        row.primary_staff_name,
        row.secondary_staff_name,
        row.tertiary_staff_name,
      ].filter((name): name is string => Boolean(name)),
      caseCreatedOn: row.case_created_on,
      caseUpdatedOn: row.case_updated_on,
    }));
    const searchedAt = now();
    const auditId = createEventId();
    await db.insert(staffAuditLogs).values({
      id: auditId,
      actorUserId: actor.id,
      action: "legalfriends.client_directory.searched",
      targetType: "legalfriends_client_directory",
      targetId: auditId,
      metadata: {
        searchType: isPhoneQuery ? "phone" : "name",
        queryLength: isPhoneQuery ? phoneDigits.length : compactName.length,
        resultCount: items.length,
      },
      occurredAt: searchedAt,
      createdAt: searchedAt,
    });
    return {
      queryType: isPhoneQuery ? ("phone" as const) : ("name" as const),
      items,
    };
  }

  async function createStaffConsultation(
    input: StaffConsultationCreate,
    actor: StaffPrincipal,
  ) {
    const acceptedAt = now();
    const requestSource = input.directorySource
      ? "erp_client_directory"
      : "erp_staff";
    const payloadFingerprint = protection.fingerprint(
      input.directorySource
        ? {
            source: requestSource,
            clientIdx: input.directorySource.clientIdx,
            caseIdx: input.directorySource.caseIdx,
            customerName: input.customerName,
            phone: input.phone,
            residenceRegion: input.residenceRegion,
            caseType: input.caseType,
            isReferral: input.directorySource.relationship === "referrer",
          }
        : {
            source: requestSource,
            customerName: input.customerName,
            phone: input.phone,
            residenceRegion: input.residenceRegion,
            caseType: input.caseType,
          },
    );
    const idempotencyFingerprint = protection.fingerprint({
      source: requestSource,
      idempotencyKey: input.idempotencyKey,
    });

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(idempotencyFingerprint)} as bigint))`,
      );
      const [existing] = await tx
        .select({
          consultationId: consultationRequests.consultationId,
          publicReceiptCode: consultations.publicReceiptCode,
          acceptedAt: consultationRequests.submittedAt,
          payloadFingerprint: consultationRequests.payloadFingerprint,
        })
        .from(consultationRequests)
        .innerJoin(
          consultations,
          eq(consultations.id, consultationRequests.consultationId),
        )
        .where(
          and(
            eq(consultationRequests.source, requestSource),
            eq(consultationRequests.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        if (!existing.payloadFingerprint.equals(payloadFingerprint)) {
          throw new TelephonyCallError(
            "directory_consultation_idempotency_conflict",
            "같은 등록 요청 식별자로 다른 고객정보를 저장할 수 없습니다. 창을 닫고 다시 시도해 주세요.",
          );
        }
        return {
          consultationId: existing.consultationId,
          publicReceiptCode: existing.publicReceiptCode,
          acceptedAt: existing.acceptedAt.toISOString(),
          replayed: true,
        };
      }

      let source: LegalFriendsDirectoryConsultationSourceRow | undefined;
      if (input.directorySource) {
        const sourceResult = await tx.execute(
          sql<LegalFriendsDirectoryConsultationSourceRow>`SELECT * FROM public.resolve_legalfriends_directory_consultation_source(${input.directorySource.clientIdx}, ${input.directorySource.caseIdx})`,
        );
        [source] =
          sourceResult.rows as LegalFriendsDirectoryConsultationSourceRow[];
        if (!source) {
          throw new TelephonyCallError(
            "directory_target_not_found",
            "삭제되었거나 현재 조회할 수 없는 리걸프렌즈 고객입니다.",
          );
        }
      }

      const consultationId = createConsultationId();
      const requestId = createConsultationRequestId();
      const publicReceiptCode = createPublicReceiptCode(acceptedAt);
      const nameEncrypted = protection.encrypt(
        input.customerName,
        `consultations.preferred_name:${consultationId}`,
      );
      const requestNameEncrypted = protection.encrypt(
        input.customerName,
        `consultation_requests.name:${requestId}`,
      );
      const phoneEncrypted = protection.encrypt(
        input.phone,
        `consultation_requests.phone:${requestId}`,
      );
      const phoneFingerprint = protection.fingerprint(input.phone);
      const intake = {
        residenceRegion: input.residenceRegion,
        topic:
          input.caseType === 2
            ? "개인파산·면책"
            : input.caseType === 3
              ? "기타"
              : "개인회생",
      };
      const intakeEncrypted = protection.encrypt(
        JSON.stringify(intake),
        `consultation_requests.intake:${requestId}`,
      );
      const sourceSnapshotEncrypted = source
        ? protection.encrypt(
            JSON.stringify({
              clientName: source.client_name,
              phone: source.phone,
              residenceRegion: legalFriendsResidenceRegion(
                source.living_place,
              ),
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
            }),
            `consultation_directory_sources/${consultationId}/snapshot`,
          )
        : null;

      await tx.insert(consultations).values({
        id: consultationId,
        publicReceiptCode,
        state: "requested",
        contactChannel: "phone",
        phoneFingerprint,
        anonymousLabel: `${source ? "고객찾기" : "직접등록"}_${publicReceiptCode.slice(-6)}`,
        preferredNameCiphertext: nameEncrypted.ciphertext,
        preferredNameNonce: nameEncrypted.nonce,
        preferredNameKeyVersion: nameEncrypted.keyVersion,
        firstRequestedAt: acceptedAt,
        lastRequestedAt: acceptedAt,
        createdAt: acceptedAt,
        updatedAt: acceptedAt,
      });
      await tx.insert(consultationRequests).values({
        id: requestId,
        consultationId,
        source: requestSource,
        idempotencyKey: input.idempotencyKey,
        mode: "quick",
        contactChannel: "phone",
        phoneFingerprint,
        phoneCiphertext: phoneEncrypted.ciphertext,
        phoneNonce: phoneEncrypted.nonce,
        phoneKeyVersion: phoneEncrypted.keyVersion,
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
        privacyNoticeVersion: CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
        privacyBasis: "staff_recorded_phone_interaction",
        consentAgreedAt: null,
        journeySessionId: null,
        dedupeOutcome: "new",
        candidateConsultationId: null,
        submittedAt: acceptedAt,
        createdAt: acceptedAt,
      });
      if (input.directorySource && sourceSnapshotEncrypted) {
        await tx.insert(consultationDirectorySources).values({
          consultationId,
          consultationRequestId: requestId,
          directoryClientIdx: input.directorySource.clientIdx,
          directoryCaseIdx: input.directorySource.caseIdx,
          relationship: input.directorySource.relationship,
          snapshotCiphertext: sourceSnapshotEncrypted.ciphertext,
          snapshotNonce: sourceSnapshotEncrypted.nonce,
          snapshotKeyVersion: sourceSnapshotEncrypted.keyVersion,
          createdByUserId: actor.id,
          createdAt: acceptedAt,
        });
      }
      await tx.insert(consultationStatusHistory).values({
        id: createEventId(),
        consultationId,
        fromState: null,
        toState: "requested",
        reason:
          input.directorySource?.relationship === "referrer"
            ? "client_directory_referral"
            : input.directorySource?.relationship === "customer"
              ? "client_directory_conversion"
              : "staff_manual_registration",
        actorType: "staff",
        actorId: actor.id,
        changedAt: acceptedAt,
        createdAt: acceptedAt,
      });

      const event: PlatformEvent = {
        eventId: createEventId(),
        eventType: "consultation.requested",
        eventVersion: 1,
        occurredAt: acceptedAt.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        data: {
          consultationId,
          requestId,
          intakeRef: `consultation_requests/${requestId}`,
          mode: "quick",
          privacyNoticeVersion: CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
          privacyBasis: "staff_recorded_phone_interaction",
          dedupeOutcome: "new",
        },
      };
      assertPlatformEvent(event);
      await tx
        .insert(outboxEvents)
        .values(eventRow(event, consultationId, "consultation"));
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: input.directorySource
          ? "legalfriends.client_directory.consultation_created"
          : "consultation.staff_registered",
        targetType: "consultation",
        targetId: consultationId,
        metadata: {
          requestId,
          directoryClientIdx: input.directorySource?.clientIdx ?? null,
          directoryCaseIdx: input.directorySource?.caseIdx ?? null,
          relationship: input.directorySource?.relationship ?? null,
        },
        occurredAt: acceptedAt,
        createdAt: acceptedAt,
      });

      return {
        consultationId,
        publicReceiptCode,
        acceptedAt: acceptedAt.toISOString(),
        replayed: false,
      };
    });
  }

  async function createDirectoryConsultation(
    input: LegalFriendsDirectoryConsultationCreate,
    actor: StaffPrincipal,
  ) {
    return createStaffConsultation(
      {
        idempotencyKey: input.idempotencyKey,
        customerName: input.customerName,
        phone: input.phone,
        residenceRegion: input.residenceRegion,
        caseType: input.caseType,
        directorySource: {
          clientIdx: input.clientIdx,
          caseIdx: input.caseIdx,
          relationship: input.isReferral ? "referrer" : "customer",
        },
      },
      actor,
    );
  }

  async function resolvePhoneCustomers(phones: readonly string[]) {
    const uniquePhones = [...new Set(phones.filter(Boolean))];
    const matches = new Map<string, PhoneCustomerMatch>(
      uniquePhones.map((phone) => [phone, null]),
    );
    if (uniquePhones.length === 0) return matches;

    const fingerprintsByPhone = new Map(
      uniquePhones.map((phone) => [phone, protection.fingerprint(phone)]),
    );
    const phoneByFingerprint = new Map(
      [...fingerprintsByPhone].map(([phone, fingerprint]) => [
        fingerprint.toString("hex"),
        phone,
      ]),
    );
    const consultationRows = await db
      .select({
        phoneFingerprint: consultations.phoneFingerprint,
        id: consultations.id,
        publicReceiptCode: consultations.publicReceiptCode,
        state: consultations.state,
        anonymousLabel: consultations.anonymousLabel,
        preferredNameCiphertext: consultations.preferredNameCiphertext,
        preferredNameNonce: consultations.preferredNameNonce,
        preferredNameKeyVersion: consultations.preferredNameKeyVersion,
        firstRequestedAt: consultations.firstRequestedAt,
        lastRequestedAt: consultations.lastRequestedAt,
        assigneeUserId: consultationAssignments.assigneeUserId,
        assigneeDisplayName: staffProfiles.displayName,
      })
      .from(consultations)
      .leftJoin(
        consultationAssignments,
        eq(consultationAssignments.consultationId, consultations.id),
      )
      .leftJoin(
        staffProfiles,
        eq(staffProfiles.userId, consultationAssignments.assigneeUserId),
      )
      .where(
        and(
          isNotNull(consultations.phoneFingerprint),
          inArray(
            consultations.phoneFingerprint,
            [...fingerprintsByPhone.values()],
          ),
        ),
      )
      .orderBy(desc(consultations.lastRequestedAt));

    const consultationMatchedPhones = new Set<string>();
    for (const consultation of consultationRows) {
      if (!consultation.phoneFingerprint) continue;
      const phone = phoneByFingerprint.get(
        consultation.phoneFingerprint.toString("hex"),
      );
      if (!phone || consultationMatchedPhones.has(phone)) continue;
      consultationMatchedPhones.add(phone);
      const displayName =
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
          : consultation.anonymousLabel;
      matches.set(phone, {
        source: "consultation",
        consultation: {
          id: consultation.id,
          publicReceiptCode: consultation.publicReceiptCode,
          displayName,
          state: consultation.state,
          firstRequestedAt: consultation.firstRequestedAt.toISOString(),
          lastRequestedAt: consultation.lastRequestedAt.toISOString(),
          assigneeUserId: consultation.assigneeUserId,
          assigneeDisplayName: consultation.assigneeDisplayName,
        },
      });
    }

    const unmatchedPhones = uniquePhones.filter(
      (phone) => !consultationMatchedPhones.has(phone),
    );
    const legalFriendsMatches = await resolveLegalFriendsPhones(
      unmatchedPhones,
    );
    for (const phone of unmatchedPhones) {
      matches.set(
        phone,
        legalFriendsMatches.get(phone.replace(/[^0-9]/g, "")) ?? null,
      );
    }
    return matches;
  }

  function createPhoneCustomerLoader() {
    const cache = new Map<string, Promise<PhoneCustomerMatch>>();
    const queued = new Map<
      string,
      {
        resolve: (match: PhoneCustomerMatch) => void;
        reject: (error: unknown) => void;
      }
    >();
    let scheduled = false;

    const flush = async () => {
      scheduled = false;
      const batch = [...queued];
      for (const [phone] of batch) queued.delete(phone);
      try {
        const batchMatches = await resolvePhoneCustomers(
          batch.map(([phone]) => phone),
        );
        for (const [phone, deferred] of batch) {
          deferred.resolve(batchMatches.get(phone) ?? null);
        }
      } catch (error) {
        for (const [, deferred] of batch) deferred.reject(error);
      }
    };

    return (phone: string) => {
      const existing = cache.get(phone);
      if (existing) return existing;
      const pending = new Promise<PhoneCustomerMatch>((resolve, reject) => {
        queued.set(phone, { resolve, reject });
      });
      cache.set(phone, pending);
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(() => void flush());
      }
      return pending;
    };
  }

  async function getCallActivitySnapshot(actor: StaffPrincipal) {
    const snapshotAt = now();
    const rows = await db
      .select({
        id: telephonyCallRoots.id,
        scope: telephonyCallRoots.scope,
        direction: telephonyCallRoots.direction,
        state: telephonyCallRoots.state,
        correlationStatus: telephonyCallRoots.correlationStatus,
        originalEndpointId: telephonyCallRoots.originalEndpointId,
        currentEndpointId: telephonyCallRoots.currentEndpointId,
        finalStaffUserId: telephonyCallRoots.finalStaffUserId,
        remotePhoneCiphertext: telephonyCallRoots.remotePhoneCiphertext,
        remotePhoneNonce: telephonyCallRoots.remotePhoneNonce,
        remotePhoneKeyVersion: telephonyCallRoots.remotePhoneKeyVersion,
        originalLineLast4: telephonyCallRoots.originalLineLast4,
        startedAt: telephonyCallRoots.startedAt,
        connectedAt: telephonyCallRoots.connectedAt,
        endedAt: telephonyCallRoots.endedAt,
        lastEventAt: telephonyCallRoots.lastEventAt,
        endpointLabel: telephonyEndpoints.label,
        endpointLineNumber: telephonyEndpoints.lineNumber,
        endpointExtension: telephonyEndpoints.extension,
        legId: telephonyCallLegs.id,
        legEndpointId: telephonyCallLegs.endpointId,
        legStaffUserId: telephonyCallLegs.staffUserId,
        legKind: telephonyCallLegs.kind,
        legDirection: telephonyCallLegs.direction,
        legState: telephonyCallLegs.state,
        legRemoteExtension: telephonyCallLegs.remoteExtension,
        legStartedAt: telephonyCallLegs.startedAt,
        legDisplayName: staffProfiles.displayName,
      })
      .from(telephonyCallRoots)
      .innerJoin(
        telephonyEndpoints,
        eq(telephonyEndpoints.id, telephonyCallRoots.currentEndpointId),
      )
      .leftJoin(
        telephonyCallLegs,
        eq(telephonyCallLegs.rootId, telephonyCallRoots.id),
      )
      .leftJoin(
        staffProfiles,
        eq(staffProfiles.userId, telephonyCallLegs.staffUserId),
      )
      .where(
        or(
          and(
            ne(telephonyCallRoots.state, "ended"),
            gte(
              telephonyCallRoots.lastEventAt,
              new Date(snapshotAt.getTime() - INBOUND_CONNECTED_SNAPSHOT_WINDOW_MS),
            ),
            or(
              ne(telephonyCallRoots.state, "ringing"),
              gte(
                telephonyCallRoots.lastEventAt,
                new Date(
                  snapshotAt.getTime() - INBOUND_RINGING_SNAPSHOT_WINDOW_MS,
                ),
              ),
            ),
          ),
          and(
            eq(telephonyCallRoots.state, "ended"),
            gte(
              telephonyCallRoots.endedAt,
              new Date(snapshotAt.getTime() - INBOUND_ENDED_SNAPSHOT_WINDOW_MS),
            ),
          ),
        ),
      )
      .orderBy(desc(telephonyCallRoots.lastEventAt));

    const rootIds = [...new Set(rows.map((row) => row.id))];
    if (rootIds.length === 0) {
      return { snapshotAt: snapshotAt.toISOString(), items: [] };
    }
    const [relationRows, observedRows] = await Promise.all([
      db
        .select()
        .from(telephonyCallRelations)
        .where(inArray(telephonyCallRelations.rootId, rootIds))
        .orderBy(desc(telephonyCallRelations.occurredAt)),
      db
        .select({
          rootId: telephonyInboundCalls.callRootId,
          observedCallId: telephonyInboundCalls.id,
        })
        .from(telephonyInboundCalls)
        .where(inArray(telephonyInboundCalls.callRootId, rootIds)),
    ]);
    const observedByRoot = new Map(
      observedRows.flatMap((row) =>
        row.rootId ? [[row.rootId, row.observedCallId] as const] : [],
      ),
    );
    const relationsByRoot = new Map<string, typeof relationRows>();
    for (const relation of relationRows) {
      const current = relationsByRoot.get(relation.rootId) ?? [];
      current.push(relation);
      relationsByRoot.set(relation.rootId, current);
    }

    const grouped = new Map<string, (typeof rows)[number][]>();
    for (const row of rows) {
      const current = grouped.get(row.id) ?? [];
      current.push(row);
      grouped.set(row.id, current);
    }
    const allActiveStaff = await activePhoneDeskStaff();
    const activityEndpointIds = [
      ...new Set(
        rows
          .flatMap((row) => [
            row.originalEndpointId,
            row.currentEndpointId,
            row.legEndpointId,
          ])
          .filter((endpointId): endpointId is string => Boolean(endpointId)),
      ),
    ];
    const activityOwnerRows = await db
      .select({
        endpointId: staffTelephonyBindings.endpointId,
        staffUserId: staffTelephonyBindings.staffUserId,
      })
      .from(staffTelephonyBindings)
      .innerJoin(
        staffUsers,
        and(
          eq(staffUsers.id, staffTelephonyBindings.staffUserId),
          eq(staffUsers.status, "active"),
        ),
      )
      .innerJoin(
        staffMemberships,
        and(
          eq(staffMemberships.userId, staffTelephonyBindings.staffUserId),
          eq(staffMemberships.isPrimary, true),
          eq(staffMemberships.isActive, true),
        ),
      )
      .where(
        and(
          inArray(staffTelephonyBindings.endpointId, activityEndpointIds),
          eq(staffTelephonyBindings.isActive, true),
        ),
      );
    const ownersByActivityEndpoint = new Map<string, string[]>();
    for (const owner of activityOwnerRows) {
      const current = ownersByActivityEndpoint.get(owner.endpointId) ?? [];
      current.push(owner.staffUserId);
      ownersByActivityEndpoint.set(owner.endpointId, current);
    }
    const remotePhonesByRoot = new Map<string, string>();
    for (const rootRows of grouped.values()) {
      const root = rootRows[0];
      if (
        root?.scope === "external" &&
        root.remotePhoneCiphertext &&
        root.remotePhoneNonce &&
        root.remotePhoneKeyVersion
      ) {
        remotePhonesByRoot.set(
          root.id,
          protection.decrypt(
            {
              ciphertext: root.remotePhoneCiphertext,
              nonce: root.remotePhoneNonce,
              keyVersion: root.remotePhoneKeyVersion,
            },
            `telephony_inbound_calls/${root.id}/remote_phone`,
          ),
        );
      }
    }
    const customerMatches = await resolvePhoneCustomers([
      ...remotePhonesByRoot.values(),
    ]);
    const items = [];
    for (const rootRows of grouped.values()) {
      const root = rootRows[0];
      if (!root) continue;
      const participants = rootRows.flatMap((row) =>
        row.legId
          ? [
              {
                legId: row.legId,
                endpointId: row.legEndpointId!,
                staffUserId: row.legStaffUserId,
                displayName: row.legDisplayName,
                kind: row.legKind!,
                direction: row.legDirection!,
                state: row.legState!,
                remoteExtension: row.legRemoteExtension,
                startedAt: row.legStartedAt!.toISOString(),
              },
            ]
          : [],
      );
      if (
        root.scope === "internal" &&
        !participants.some(
          (participant) =>
            participant.staffUserId === actor.id ||
            ownersByActivityEndpoint
              .get(participant.endpointId)
              ?.includes(actor.id),
        )
      ) {
        continue;
      }
      const remotePhone = remotePhonesByRoot.get(root.id) ?? null;
      const customerMatch = remotePhone
        ? customerMatches.get(remotePhone) ?? null
        : null;
      const relations = relationsByRoot.get(root.id) ?? [];
      const latestRelation = relations[0] ?? null;
      const participantByLeg = new Map(
        participants.map((participant) => [participant.legId, participant]),
      );
      let notificationKind:
        | "external_inbound"
        | "internal_inbound"
        | "transferred_customer"
        | "transfer_returned"
        | null = null;
      let notificationTargetUserIds: string[] = [];
      if (
        latestRelation?.relationType === "transfer_completed" ||
        latestRelation?.relationType === "transfer_attempted"
      ) {
        const targetParticipant = latestRelation.toLegId
          ? participantByLeg.get(latestRelation.toLegId)
          : null;
        if (targetParticipant?.direction === "inbound") {
          notificationKind = "transferred_customer";
          notificationTargetUserIds.push(
            ...(ownersByActivityEndpoint.get(targetParticipant.endpointId) ??
              (targetParticipant.staffUserId
                ? [targetParticipant.staffUserId]
                : [])),
          );
        }
      } else if (latestRelation?.relationType === "transfer_returned") {
        notificationKind = "transfer_returned";
        const targetParticipant = latestRelation.fromLegId
          ? participantByLeg.get(latestRelation.fromLegId)
          : null;
        if (targetParticipant) {
          notificationTargetUserIds.push(
            ...(ownersByActivityEndpoint.get(targetParticipant.endpointId) ??
              (targetParticipant.staffUserId
                ? [targetParticipant.staffUserId]
                : [])),
          );
        }
      } else if (root.scope === "internal") {
        notificationKind = "internal_inbound";
        notificationTargetUserIds = participants.flatMap((participant) =>
          participant.direction === "inbound"
            ? ownersByActivityEndpoint.get(participant.endpointId) ??
              (participant.staffUserId ? [participant.staffUserId] : [])
            : [],
        );
      } else if (root.direction === "inbound") {
        notificationKind = "external_inbound";
        notificationTargetUserIds = [
          ...new Set(
            rootRows.flatMap((row) =>
              ownersByActivityEndpoint.get(row.legEndpointId ?? "") ?? [],
            ),
          ),
        ];
        if (customerMatch?.source === "consultation") {
          const assignee = customerMatch.consultation.assigneeUserId;
          if (assignee) notificationTargetUserIds.push(assignee);
        } else if (customerMatch?.source === "legal_friends") {
          notificationTargetUserIds.push(
            ...customerMatch.cases.flatMap((item) => item.staffUserIds),
          );
        }
      }
      notificationTargetUserIds = [...new Set(notificationTargetUserIds)];
      if (notificationKind && notificationTargetUserIds.length === 0) {
        notificationTargetUserIds = allActiveStaff.map(
          (staff) => staff.staffUserId,
        );
      }
      items.push({
        id: root.id,
        observedCallId: observedByRoot.get(root.id) ?? null,
        scope: root.scope,
        direction: root.direction,
        state: root.state,
        correlationStatus: root.correlationStatus,
        remotePhone,
        originalLineLast4: root.originalLineLast4,
        startedAt: root.startedAt.toISOString(),
        connectedAt: root.connectedAt?.toISOString() ?? null,
        endedAt: root.endedAt?.toISOString() ?? null,
        lastEventAt: root.lastEventAt.toISOString(),
        currentEndpoint: {
          id: root.currentEndpointId!,
          label: root.endpointLabel,
          lineNumber: root.endpointLineNumber,
          extension: root.endpointExtension,
        },
        participants,
        transfer: latestRelation
          ? {
              state: latestRelation.relationType,
              correlationStatus: latestRelation.correlationStatus,
            }
          : null,
        customerMatch,
        notificationKind,
        notificationTargetUserIds,
        canOpenAftercare:
          root.state === "ended" &&
          root.correlationStatus === "confirmed" &&
          (root.scope === "internal"
            ? participants.some(
                (participant) => participant.staffUserId === actor.id,
              )
            : root.finalStaffUserId === actor.id),
      });
    }
    return { snapshotAt: snapshotAt.toISOString(), items };
  }

  async function getInboundCallSnapshot() {
    const snapshotAt = now();
    const rows = await db
      .select({
        id: telephonyInboundCalls.id,
        endpointId: telephonyInboundCalls.endpointId,
        bridgeId: telephonyInboundCalls.bridgeId,
        state: telephonyInboundCalls.state,
        remotePhoneCiphertext:
          telephonyInboundCalls.remotePhoneCiphertext,
        remotePhoneNonce: telephonyInboundCalls.remotePhoneNonce,
        remotePhoneKeyVersion:
          telephonyInboundCalls.remotePhoneKeyVersion,
        incomingLineLast4: telephonyInboundCalls.incomingLineLast4,
        ringingAt: telephonyInboundCalls.ringingAt,
        connectedAt: telephonyInboundCalls.connectedAt,
        endedAt: telephonyInboundCalls.endedAt,
        lastEventAt: telephonyInboundCalls.lastEventAt,
        ringingEventOccurredAt: telephonyInboundEvents.occurredAt,
        ringingEventReceivedAt: telephonyInboundEvents.receivedAt,
        extension: telephonyEndpoints.extension,
        ownerUserId: staffTelephonyBindings.staffUserId,
        ownerDisplayName: staffProfiles.displayName,
      })
      .from(telephonyInboundCalls)
      .innerJoin(
        telephonyEndpoints,
        eq(telephonyEndpoints.id, telephonyInboundCalls.endpointId),
      )
      .leftJoin(
        telephonyInboundEvents,
        and(
          eq(
            telephonyInboundEvents.inboundCallId,
            telephonyInboundCalls.id,
          ),
          eq(
            telephonyInboundEvents.providerCallId,
            telephonyInboundCalls.providerCallId,
          ),
          eq(telephonyInboundEvents.eventType, "inbound.ringing"),
        ),
      )
      .leftJoin(
        staffTelephonyBindings,
        and(
          eq(
            staffTelephonyBindings.endpointId,
            telephonyInboundCalls.endpointId,
          ),
          eq(staffTelephonyBindings.isActive, true),
        ),
      )
      .leftJoin(
        staffProfiles,
        eq(staffProfiles.userId, staffTelephonyBindings.staffUserId),
      )
      .where(
        and(
          eq(telephonyInboundCalls.direction, "inbound"),
          or(
            and(
              eq(telephonyInboundCalls.state, "ringing"),
              gte(
                telephonyInboundCalls.ringingAt,
                new Date(
                  snapshotAt.getTime() - INBOUND_RINGING_SNAPSHOT_WINDOW_MS,
                ),
              ),
            ),
            and(
              eq(telephonyInboundCalls.state, "connected"),
              gte(
                telephonyInboundCalls.connectedAt,
                new Date(
                  snapshotAt.getTime() - INBOUND_CONNECTED_SNAPSHOT_WINDOW_MS,
                ),
              ),
            ),
            and(
              eq(telephonyInboundCalls.state, "ended"),
              gte(
                telephonyInboundCalls.updatedAt,
                new Date(
                  snapshotAt.getTime() - INBOUND_ENDED_SNAPSHOT_WINDOW_MS,
                ),
              ),
            ),
          ),
        ),
      )
      .orderBy(desc(telephonyInboundCalls.lastEventAt));

    const remotePhonesByCallId = new Map<string, string>();
    for (const row of rows) {
      if (remotePhonesByCallId.has(row.id)) continue;
      remotePhonesByCallId.set(
        row.id,
        protection.decrypt(
          {
            ciphertext: row.remotePhoneCiphertext,
            nonce: row.remotePhoneNonce,
            keyVersion: row.remotePhoneKeyVersion,
          },
          `telephony_inbound_calls/${row.id}/remote_phone`,
        ),
      );
    }
    const inboundCallIds = [...remotePhonesByCallId.keys()];
    const [customerMatches, answerCommandRows] = await Promise.all([
      resolvePhoneCustomers([...remotePhonesByCallId.values()]),
      inboundCallIds.length
        ? db
            .select({
              id: telephonyInboundCommands.id,
              inboundCallId: telephonyInboundCommands.inboundCallId,
              status: telephonyInboundCommands.status,
              requestedAt: telephonyInboundCommands.requestedAt,
              expiresAt: telephonyInboundCommands.expiresAt,
              completedAt: telephonyInboundCommands.completedAt,
              resultCode: telephonyInboundCommands.resultCode,
            })
            .from(telephonyInboundCommands)
            .where(
              inArray(telephonyInboundCommands.inboundCallId, inboundCallIds),
            )
            .orderBy(desc(telephonyInboundCommands.requestedAt))
        : [],
    ]);
    const answerCommandByCallId = new Map<
      string,
      ReturnType<typeof inboundAnswerCommandResponse>
    >();
    for (const command of answerCommandRows) {
      if (!answerCommandByCallId.has(command.inboundCallId)) {
        answerCommandByCallId.set(
          command.inboundCallId,
          inboundAnswerCommandResponse(command),
        );
      }
    }

    const items = new Map<
      string,
      {
        id: string;
        endpointId: string;
        state: "ringing" | "connected" | "ended";
        remotePhone: string;
        incomingLineLast4: string;
        extension: string;
        ringingAt: string;
        connectedAt: string | null;
        endedAt: string | null;
        lastEventAt: string;
        owners: Array<{ staffUserId: string; displayName: string }>;
        customerMatch: PhoneCustomerMatch;
        answerCommand: ReturnType<typeof inboundAnswerCommandResponse> | null;
        answerAvailable: boolean;
        deliveryDelayed: boolean;
      }
    >();

    for (const row of rows) {
      let item = items.get(row.id);
      if (!item) {
        const answerableBridge = answerableBridgeIds.has(row.bridgeId);
        const deliveryDelayed = isCentrexInboundAnswerDeliveryDelayed({
          answerableBridge,
          occurredAt: row.ringingEventOccurredAt,
          receivedAt: row.ringingEventReceivedAt,
        });
        const remotePhone = remotePhonesByCallId.get(row.id);
        if (!remotePhone) continue;
        item = {
          id: row.id,
          endpointId: row.endpointId,
          state: row.state,
          remotePhone,
          incomingLineLast4: row.incomingLineLast4,
          extension: row.extension,
          ringingAt: row.ringingAt.toISOString(),
          connectedAt: row.connectedAt?.toISOString() ?? null,
          endedAt: row.endedAt?.toISOString() ?? null,
          lastEventAt: row.lastEventAt.toISOString(),
          owners: [],
          customerMatch: customerMatches.get(remotePhone) ?? null,
          answerCommand: answerCommandByCallId.get(row.id) ?? null,
          answerAvailable: answerableBridge && !deliveryDelayed,
          deliveryDelayed,
        };
        items.set(row.id, item);
      }
      if (
        row.ownerUserId &&
        row.ownerDisplayName &&
        !item.owners.some(
          (owner) => owner.staffUserId === row.ownerUserId,
        )
      ) {
        item.owners.push({
          staffUserId: row.ownerUserId,
          displayName: row.ownerDisplayName,
        });
      }
    }

    return {
      snapshotAt: snapshotAt.toISOString(),
      items: [...items.values()],
    };
  }

  async function getPhoneDeskCalls(
    queryOrLimit: PhoneDeskListQuery | number = PHONE_DESK_DEFAULT_LIMIT,
    callId?: string,
  ) {
    const requestedPage = typeof queryOrLimit === "number"
      ? 1
      : queryOrLimit.page;
    const normalizedLimit = Math.min(
      Math.max(
        Math.trunc(
          typeof queryOrLimit === "number"
            ? queryOrLimit
            : queryOrLimit.pageSize,
        ) || PHONE_DESK_DEFAULT_LIMIT,
        1,
      ),
      PHONE_DESK_MAX_LIMIT,
    );
    const selectedFilter = typeof queryOrLimit === "number"
      ? "all"
      : queryOrLimit.filter ?? "all";
    const from = typeof queryOrLimit === "number"
      ? undefined
      : queryOrLimit.from;
    const to = typeof queryOrLimit === "number" ? undefined : queryOrLimit.to;
    const snapshotAt = now();
    const observedDateCondition = and(
      from ? gte(telephonyInboundCalls.ringingAt, from) : undefined,
      to ? lt(telephonyInboundCalls.ringingAt, to) : undefined,
    );
    const standaloneDateCondition = and(
      from ? gte(telephonyCalls.requestedAt, from) : undefined,
      to ? lt(telephonyCalls.requestedAt, to) : undefined,
    );
    const rootDateCondition = and(
      from ? gte(telephonyCallRoots.startedAt, from) : undefined,
      to ? lt(telephonyCallRoots.startedAt, to) : undefined,
    );
    const observedActiveCondition = sql<boolean>`case
      when ${telephonyCallRoots.id} is not null then ${telephonyCallRoots.state} in ('ringing', 'connected', 'transferring')
      else ${telephonyInboundCalls.state} in ('ringing', 'connected')
    end`;
    const emptySummary = {
      all: 0,
      inbound: 0,
      clickToCall: 0,
      centrexDirect: 0,
      internal: 0,
      active: 0,
    };
    let summary = emptySummary;
    if (!callId) {
      const [[observedSummary], [standaloneSummary], [internalSummary]] =
        await Promise.all([
        db
          .select({
            all: sql<number>`count(distinct coalesce(${telephonyInboundCalls.callRootId}, ${telephonyInboundCalls.id}))::int`,
            inbound: sql<number>`count(distinct coalesce(${telephonyInboundCalls.callRootId}, ${telephonyInboundCalls.id})) filter (where ${telephonyInboundCalls.direction} = 'inbound')::int`,
            clickToCall: sql<number>`count(distinct coalesce(${telephonyInboundCalls.callRootId}, ${telephonyInboundCalls.id})) filter (where ${telephonyInboundCalls.direction} = 'outbound' and ${telephonyCallObservationLinks.observedCallId} is not null)::int`,
            centrexDirect: sql<number>`count(distinct coalesce(${telephonyInboundCalls.callRootId}, ${telephonyInboundCalls.id})) filter (where ${telephonyInboundCalls.direction} = 'outbound' and ${telephonyCallObservationLinks.observedCallId} is null)::int`,
            active: sql<number>`count(distinct coalesce(${telephonyInboundCalls.callRootId}, ${telephonyInboundCalls.id})) filter (where ${observedActiveCondition})::int`,
          })
          .from(telephonyInboundCalls)
          .leftJoin(
            telephonyCallRoots,
            eq(telephonyCallRoots.id, telephonyInboundCalls.callRootId),
          )
          .leftJoin(
            telephonyCallObservationLinks,
            eq(
              telephonyCallObservationLinks.observedCallId,
              telephonyInboundCalls.id,
            ),
          )
          .where(observedDateCondition),
        db
          .select({
            all: count(),
            active: sql<number>`count(*) filter (where ${telephonyCalls.commandStatus} in ('queued', 'dispatching', 'succeeded') and ${telephonyCalls.reconciledAt} is null)::int`,
          })
          .from(telephonyCalls)
          .leftJoin(
            telephonyCallObservationLinks,
            eq(
              telephonyCallObservationLinks.telephonyCallId,
              telephonyCalls.id,
            ),
          )
          .where(
            and(
              isNull(telephonyCallObservationLinks.observedCallId),
              standaloneDateCondition,
            ),
          ),
        db
          .select({
            all: count(),
            active: sql<number>`count(*) filter (where ${telephonyCallRoots.state} <> 'ended')::int`,
          })
          .from(telephonyCallRoots)
          .where(
            and(
              eq(telephonyCallRoots.scope, "internal"),
              rootDateCondition,
            ),
          ),
      ]);
      const observedAll = Number(observedSummary?.all ?? 0);
      const standaloneAll = Number(standaloneSummary?.all ?? 0);
      const internalAll = Number(internalSummary?.all ?? 0);
      summary = {
        all: observedAll + standaloneAll + internalAll,
        inbound: Number(observedSummary?.inbound ?? 0),
        clickToCall:
          Number(observedSummary?.clickToCall ?? 0) + standaloneAll,
        centrexDirect: Number(observedSummary?.centrexDirect ?? 0),
        internal: internalAll,
        active:
          Number(observedSummary?.active ?? 0) +
          Number(standaloneSummary?.active ?? 0) +
          Number(internalSummary?.active ?? 0),
      };
    }
    const total = callId
      ? 0
      : selectedFilter === "click_to_call"
        ? summary.clickToCall
        : selectedFilter === "centrex_direct"
          ? summary.centrexDirect
          : selectedFilter === "internal"
            ? summary.internal
          : summary[selectedFilter];
    const pageCount = Math.max(1, Math.ceil(total / normalizedLimit));
    const page = callId ? 1 : Math.min(requestedPage, pageCount);
    const offset = callId ? 0 : (page - 1) * normalizedLimit;
    const observedFilterCondition = selectedFilter === "inbound"
      ? eq(telephonyInboundCalls.direction, "inbound")
      : selectedFilter === "click_to_call"
        ? and(
            eq(telephonyInboundCalls.direction, "outbound"),
            isNotNull(telephonyCallObservationLinks.observedCallId),
          )
        : selectedFilter === "centrex_direct"
          ? and(
              eq(telephonyInboundCalls.direction, "outbound"),
              isNull(telephonyCallObservationLinks.observedCallId),
            )
          : selectedFilter === "internal"
            ? sql<boolean>`false`
          : selectedFilter === "active"
            ? observedActiveCondition
            : undefined;
    const standaloneFilterCondition =
      selectedFilter === "all" || selectedFilter === "click_to_call"
        ? undefined
        : selectedFilter === "active"
          ? sql<boolean>`${telephonyCalls.commandStatus} in ('queued', 'dispatching', 'succeeded') and ${telephonyCalls.reconciledAt} is null`
          : sql<boolean>`false`;
    const observedRows = await db
      .select({
        id: telephonyInboundCalls.id,
        callRootId: telephonyInboundCalls.callRootId,
        rootState: telephonyCallRoots.state,
        rootCorrelationStatus: telephonyCallRoots.correlationStatus,
        rootStartedAt: telephonyCallRoots.startedAt,
        rootConnectedAt: telephonyCallRoots.connectedAt,
        rootEndedAt: telephonyCallRoots.endedAt,
        rootLastEventAt: telephonyCallRoots.lastEventAt,
        rootFinalStaffUserId: telephonyCallRoots.finalStaffUserId,
        direction: telephonyInboundCalls.direction,
        bridgeId: telephonyInboundCalls.bridgeId,
        state: telephonyInboundCalls.state,
        endpointId: telephonyInboundCalls.endpointId,
        remotePhoneCiphertext: telephonyInboundCalls.remotePhoneCiphertext,
        remotePhoneNonce: telephonyInboundCalls.remotePhoneNonce,
        remotePhoneKeyVersion: telephonyInboundCalls.remotePhoneKeyVersion,
        ringingAt: telephonyInboundCalls.ringingAt,
        connectedAt: telephonyInboundCalls.connectedAt,
        endedAt: telephonyInboundCalls.endedAt,
        providerEndCause: telephonyInboundCalls.providerEndCause,
        lastEventAt: telephonyInboundCalls.lastEventAt,
        endpointLabel: telephonyEndpoints.label,
        endpointLineNumber: telephonyEndpoints.lineNumber,
        endpointExtension: telephonyEndpoints.extension,
        rootEndpointId: callRootCurrentEndpoint.id,
        rootEndpointLabel: callRootCurrentEndpoint.label,
        rootEndpointLineNumber: callRootCurrentEndpoint.lineNumber,
        rootEndpointExtension: callRootCurrentEndpoint.extension,
        linkedCallId: telephonyCallObservationLinks.telephonyCallId,
        linkMethod: telephonyCallObservationLinks.matchMethod,
        linkTimeDeltaMs: telephonyCallObservationLinks.timeDeltaMs,
        clickTargetSource: telephonyCalls.targetSource,
        clickCommandStatus: telephonyCalls.commandStatus,
        clickOutcome: telephonyCalls.outcome,
        clickDisposition: telephonyCalls.disposition,
        clickConsultationId: telephonyCalls.consultationId,
        clickRequestedAt: telephonyCalls.requestedAt,
        clickStaffUserId: telephonyCalls.staffUserId,
        clickStaffDisplayName: staffProfiles.displayName,
        consultationReceiptCode: consultations.publicReceiptCode,
        consultationState: consultations.state,
        consultationAnonymousLabel: consultations.anonymousLabel,
        consultationNameCiphertext: consultations.preferredNameCiphertext,
        consultationNameNonce: consultations.preferredNameNonce,
        consultationNameKeyVersion: consultations.preferredNameKeyVersion,
        directoryClientIdx: telephonyCallDirectoryTargets.clientIdx,
        directoryCaseIdx: telephonyCallDirectoryTargets.caseIdx,
        directoryClientNameCiphertext:
          telephonyCallDirectoryTargets.clientNameCiphertext,
        directoryClientNameNonce: telephonyCallDirectoryTargets.clientNameNonce,
        directoryClientNameKeyVersion:
          telephonyCallDirectoryTargets.clientNameKeyVersion,
      })
      .from(telephonyInboundCalls)
      .innerJoin(
        telephonyEndpoints,
        eq(telephonyEndpoints.id, telephonyInboundCalls.endpointId),
      )
      .leftJoin(
        telephonyCallRoots,
        eq(telephonyCallRoots.id, telephonyInboundCalls.callRootId),
      )
      .leftJoin(
        callRootCurrentEndpoint,
        eq(callRootCurrentEndpoint.id, telephonyCallRoots.currentEndpointId),
      )
      .leftJoin(
        telephonyCallObservationLinks,
        eq(
          telephonyCallObservationLinks.observedCallId,
          telephonyInboundCalls.id,
        ),
      )
      .leftJoin(
        telephonyCalls,
        eq(telephonyCalls.id, telephonyCallObservationLinks.telephonyCallId),
      )
      .leftJoin(
        telephonyCallDirectoryTargets,
        eq(
          telephonyCallDirectoryTargets.telephonyCallId,
          telephonyCalls.id,
        ),
      )
      .leftJoin(
        staffProfiles,
        eq(staffProfiles.userId, telephonyCalls.staffUserId),
      )
      .leftJoin(
        consultations,
        eq(consultations.id, telephonyCalls.consultationId),
      )
      .where(
        callId
          ? or(
              eq(telephonyInboundCalls.id, callId),
              eq(telephonyInboundCalls.callRootId, callId),
              eq(telephonyCallObservationLinks.telephonyCallId, callId),
            )
          : and(observedDateCondition, observedFilterCondition),
      )
      .orderBy(desc(telephonyInboundCalls.ringingAt));

    const standaloneClickRows = await db
      .select({
        id: telephonyCalls.id,
        targetSource: telephonyCalls.targetSource,
        consultationRequestId: telephonyCalls.consultationRequestId,
        endpointId: telephonyCalls.endpointId,
        commandStatus: telephonyCalls.commandStatus,
        outcome: telephonyCalls.outcome,
        requestedAt: telephonyCalls.requestedAt,
        providerStartedAt: telephonyCalls.providerStartedAt,
        providerEndedAt: telephonyCalls.providerEndedAt,
        providerDurationSeconds: telephonyCalls.providerDurationSeconds,
        providerBillableSeconds: telephonyCalls.providerBillableSeconds,
        reconciledAt: telephonyCalls.reconciledAt,
        disposition: telephonyCalls.disposition,
        endpointLabel: telephonyEndpoints.label,
        endpointLineNumber: telephonyEndpoints.lineNumber,
        endpointExtension: telephonyEndpoints.extension,
        phoneCiphertext: consultationRequests.phoneCiphertext,
        phoneNonce: consultationRequests.phoneNonce,
        phoneKeyVersion: consultationRequests.phoneKeyVersion,
        directoryPhoneCiphertext: telephonyCallDirectoryTargets.phoneCiphertext,
        directoryPhoneNonce: telephonyCallDirectoryTargets.phoneNonce,
        directoryPhoneKeyVersion: telephonyCallDirectoryTargets.phoneKeyVersion,
        directoryClientIdx: telephonyCallDirectoryTargets.clientIdx,
        directoryCaseIdx: telephonyCallDirectoryTargets.caseIdx,
        directoryClientNameCiphertext:
          telephonyCallDirectoryTargets.clientNameCiphertext,
        directoryClientNameNonce: telephonyCallDirectoryTargets.clientNameNonce,
        directoryClientNameKeyVersion:
          telephonyCallDirectoryTargets.clientNameKeyVersion,
        staffUserId: telephonyCalls.staffUserId,
        staffDisplayName: staffProfiles.displayName,
        consultationId: consultations.id,
        consultationReceiptCode: consultations.publicReceiptCode,
        consultationState: consultations.state,
        consultationAnonymousLabel: consultations.anonymousLabel,
        consultationNameCiphertext: consultations.preferredNameCiphertext,
        consultationNameNonce: consultations.preferredNameNonce,
        consultationNameKeyVersion: consultations.preferredNameKeyVersion,
      })
      .from(telephonyCalls)
      .innerJoin(
        telephonyEndpoints,
        eq(telephonyEndpoints.id, telephonyCalls.endpointId),
      )
      .leftJoin(
        consultationRequests,
        eq(consultationRequests.id, telephonyCalls.consultationRequestId),
      )
      .innerJoin(
        staffProfiles,
        eq(staffProfiles.userId, telephonyCalls.staffUserId),
      )
      .leftJoin(
        consultations,
        eq(consultations.id, telephonyCalls.consultationId),
      )
      .leftJoin(
        telephonyCallDirectoryTargets,
        eq(
          telephonyCallDirectoryTargets.telephonyCallId,
          telephonyCalls.id,
        ),
      )
      .leftJoin(
        telephonyCallObservationLinks,
        eq(
          telephonyCallObservationLinks.telephonyCallId,
          telephonyCalls.id,
        ),
      )
      .where(
        and(
          isNull(telephonyCallObservationLinks.observedCallId),
          callId
            ? eq(telephonyCalls.id, callId)
            : and(standaloneDateCondition, standaloneFilterCondition),
        ),
      )
      .orderBy(desc(telephonyCalls.requestedAt));

    const internalRows = await db
      .select({
        id: telephonyCallRoots.id,
        state: telephonyCallRoots.state,
        correlationStatus: telephonyCallRoots.correlationStatus,
        currentEndpointId: telephonyCallRoots.currentEndpointId,
        startedAt: telephonyCallRoots.startedAt,
        connectedAt: telephonyCallRoots.connectedAt,
        endedAt: telephonyCallRoots.endedAt,
        lastEventAt: telephonyCallRoots.lastEventAt,
        finalStaffUserId: telephonyCallRoots.finalStaffUserId,
        endpointLabel: callRootCurrentEndpoint.label,
        endpointLineNumber: callRootCurrentEndpoint.lineNumber,
        endpointExtension: callRootCurrentEndpoint.extension,
        legId: telephonyCallLegs.id,
        legEndpointId: telephonyCallLegs.endpointId,
        legExtension: callLegEndpoint.extension,
        legStaffUserId: telephonyCallLegs.staffUserId,
        legDisplayName: staffProfiles.displayName,
        legDirection: telephonyCallLegs.direction,
        legState: telephonyCallLegs.state,
      })
      .from(telephonyCallRoots)
      .innerJoin(
        callRootCurrentEndpoint,
        eq(callRootCurrentEndpoint.id, telephonyCallRoots.currentEndpointId),
      )
      .leftJoin(
        telephonyCallLegs,
        eq(telephonyCallLegs.rootId, telephonyCallRoots.id),
      )
      .leftJoin(
        callLegEndpoint,
        eq(callLegEndpoint.id, telephonyCallLegs.endpointId),
      )
      .leftJoin(
        staffProfiles,
        eq(staffProfiles.userId, telephonyCallLegs.staffUserId),
      )
      .where(
        and(
          eq(telephonyCallRoots.scope, "internal"),
          callId ? eq(telephonyCallRoots.id, callId) : rootDateCondition,
          selectedFilter === "all" || selectedFilter === "internal"
            ? undefined
            : selectedFilter === "active"
              ? ne(telephonyCallRoots.state, "ended")
              : sql<boolean>`false`,
        ),
      )
      .orderBy(desc(telephonyCallRoots.startedAt));

    const endpointIds = [
      ...new Set([
        ...observedRows.map((row) => row.endpointId),
        ...observedRows.flatMap((row) =>
          row.rootEndpointId ? [row.rootEndpointId] : [],
        ),
        ...standaloneClickRows.map((row) => row.endpointId),
        ...internalRows.flatMap((row) => [
          row.currentEndpointId!,
          ...(row.legEndpointId ? [row.legEndpointId] : []),
        ]),
      ]),
    ];
    const ownerRows = endpointIds.length
      ? await db
          .select({
            endpointId: staffTelephonyBindings.endpointId,
            staffUserId: staffTelephonyBindings.staffUserId,
            displayName: staffProfiles.displayName,
          })
          .from(staffTelephonyBindings)
          .innerJoin(
            staffProfiles,
            eq(staffProfiles.userId, staffTelephonyBindings.staffUserId),
          )
          .where(
            and(
              inArray(staffTelephonyBindings.endpointId, endpointIds),
              eq(staffTelephonyBindings.isActive, true),
            ),
          )
      : [];
    const ownersByEndpoint = new Map<
      string,
      Array<{ staffUserId: string; displayName: string }>
    >();
    for (const owner of ownerRows) {
      const owners = ownersByEndpoint.get(owner.endpointId) ?? [];
      owners.push({
        staffUserId: owner.staffUserId,
        displayName: owner.displayName,
      });
      ownersByEndpoint.set(owner.endpointId, owners);
    }

    const customerMatch = createPhoneCustomerLoader();
    const consultationDisplayName = (row: {
      consultationId: string;
      consultationAnonymousLabel: string;
      consultationNameCiphertext: Buffer | null;
      consultationNameNonce: Buffer | null;
      consultationNameKeyVersion: string | null;
    }) =>
      row.consultationNameCiphertext &&
      row.consultationNameNonce &&
      row.consultationNameKeyVersion
        ? protection.decrypt(
            {
              ciphertext: row.consultationNameCiphertext,
              nonce: row.consultationNameNonce,
              keyVersion: row.consultationNameKeyVersion,
            },
            `consultations.preferred_name:${row.consultationId}`,
          )
        : row.consultationAnonymousLabel;
    const directoryClientDisplayName = (row: {
      callId: string;
      clientNameCiphertext: Buffer;
      clientNameNonce: Buffer;
      clientNameKeyVersion: string;
    }) =>
      protection.decrypt(
        {
          ciphertext: row.clientNameCiphertext,
          nonce: row.clientNameNonce,
          keyVersion: row.clientNameKeyVersion,
        },
        `telephony_call_directory_targets/${row.callId}/client_name`,
      );

    const observedItems = await Promise.all(
      observedRows.map(async (row) => {
        const remotePhone = protection.decrypt(
          {
            ciphertext: row.remotePhoneCiphertext,
            nonce: row.remotePhoneNonce,
            keyVersion: row.remotePhoneKeyVersion,
          },
          `telephony_inbound_calls/${row.id}/remote_phone`,
        );
        const ringEndAt = row.connectedAt ?? row.endedAt;
        const ringSeconds = ringEndAt
          ? Math.max(
              0,
              Math.round(
                (ringEndAt.getTime() - row.ringingAt.getTime()) / 1_000,
              ),
            )
          : null;
        const effectiveConnectedAt = row.rootConnectedAt ?? row.connectedAt;
        const effectiveEndedAt = row.rootEndedAt ?? row.endedAt;
        const durationSeconds = effectiveConnectedAt && effectiveEndedAt
          ? Math.max(
              0,
              Math.round(
                (effectiveEndedAt.getTime() - effectiveConnectedAt.getTime()) /
                  1_000,
              ),
            )
          : null;
        const hasConsultationTarget = Boolean(
          row.clickTargetSource === "consultation" &&
            row.clickConsultationId &&
            row.consultationReceiptCode &&
            row.consultationState &&
            row.consultationAnonymousLabel,
        );
        const hasDirectoryTarget = Boolean(
          row.clickTargetSource === "legal_friends_directory" &&
            row.directoryClientIdx &&
            row.directoryCaseIdx &&
            row.directoryClientNameCiphertext &&
            row.directoryClientNameNonce &&
            row.directoryClientNameKeyVersion,
        );
        const hasClickToCall = Boolean(
          row.linkedCallId &&
            row.clickRequestedAt &&
            row.clickStaffUserId &&
            row.clickStaffDisplayName &&
            row.clickCommandStatus &&
            row.clickOutcome &&
            row.linkMethod &&
            row.linkTimeDeltaMs !== null &&
            (hasConsultationTarget || hasDirectoryTarget),
        );
        return {
          id: row.callRootId ?? row.id,
          observedCallId: row.id,
          callRootId: row.callRootId,
          scope: "external" as const,
          direction: row.direction,
          receptionMode:
            row.direction === "inbound"
              ? answerableBridgeIds.has(row.bridgeId)
                ? ("office_bridge" as const)
                : ("uplus_network" as const)
              : null,
          source:
            row.direction === "inbound"
              ? ("inbound" as const)
              : hasClickToCall
                ? ("click_to_call" as const)
                : ("centrex_direct" as const),
          state: row.rootState
            ? row.rootState === "ended"
              ? ("ended" as const)
              : row.rootState === "ringing"
                ? ("ringing" as const)
                : row.rootState === "needs_confirmation"
                  ? ("unknown" as const)
                  : ("connected" as const)
            : row.state,
          correlationStatus:
            row.rootCorrelationStatus ?? ("confirmed" as const),
          remotePhone,
          occurredAt: (row.rootStartedAt ?? row.ringingAt).toISOString(),
          ringingAt: (row.rootStartedAt ?? row.ringingAt).toISOString(),
          connectedAt: effectiveConnectedAt?.toISOString() ?? null,
          endedAt: effectiveEndedAt?.toISOString() ?? null,
          lastEventAt: (row.rootLastEventAt ?? row.lastEventAt).toISOString(),
          ringSeconds,
          durationSeconds,
          providerEndCause: row.providerEndCause,
          endpoint: {
            id: row.rootEndpointId ?? row.endpointId,
            label: row.rootEndpointLabel ?? row.endpointLabel,
            lineNumber:
              row.rootEndpointLineNumber ?? row.endpointLineNumber,
            extension: row.rootEndpointExtension ?? row.endpointExtension,
          },
          finalStaffUserId: row.rootFinalStaffUserId,
          endpointOwners:
            ownersByEndpoint.get(row.rootEndpointId ?? row.endpointId) ?? [],
          participants: [],
          relationType: null,
          customerMatch: await customerMatch(remotePhone),
          clickToCall: hasClickToCall
            ? {
                id: row.linkedCallId!,
                commandStatus: row.clickCommandStatus!,
                outcome: row.clickOutcome!,
                disposition: row.clickDisposition,
                requestedAt: row.clickRequestedAt!.toISOString(),
                requestedBy: {
                  staffUserId: row.clickStaffUserId!,
                  displayName: row.clickStaffDisplayName!,
                },
                consultation: hasConsultationTarget
                  ? {
                      id: row.clickConsultationId!,
                      publicReceiptCode: row.consultationReceiptCode!,
                      state: row.consultationState!,
                      displayName: consultationDisplayName({
                        consultationId: row.clickConsultationId!,
                        consultationAnonymousLabel:
                          row.consultationAnonymousLabel!,
                        consultationNameCiphertext:
                          row.consultationNameCiphertext,
                        consultationNameNonce: row.consultationNameNonce,
                        consultationNameKeyVersion:
                          row.consultationNameKeyVersion,
                      }),
                    }
                  : null,
                directoryClient: hasDirectoryTarget
                  ? {
                      clientIdx: row.directoryClientIdx!,
                      caseIdx: row.directoryCaseIdx!,
                      displayName: directoryClientDisplayName({
                        callId: row.linkedCallId!,
                        clientNameCiphertext:
                          row.directoryClientNameCiphertext!,
                        clientNameNonce: row.directoryClientNameNonce!,
                        clientNameKeyVersion:
                          row.directoryClientNameKeyVersion!,
                      }),
                    }
                  : null,
                observationLink: {
                  method: row.linkMethod!,
                  timeDeltaMs: row.linkTimeDeltaMs!,
                },
              }
            : null,
        };
      }),
    );

    const standaloneClickItems = await Promise.all(
      standaloneClickRows.map(async (row) => {
        const directoryTarget = row.targetSource === "legal_friends_directory";
        const phoneCiphertext = directoryTarget
          ? row.directoryPhoneCiphertext
          : row.phoneCiphertext;
        const phoneNonce = directoryTarget
          ? row.directoryPhoneNonce
          : row.phoneNonce;
        const phoneKeyVersion = directoryTarget
          ? row.directoryPhoneKeyVersion
          : row.phoneKeyVersion;
        if (!phoneCiphertext || !phoneNonce || !phoneKeyVersion) {
          throw new Error("phone_desk_click_to_call_phone_not_found");
        }
        const remotePhone = protection.decrypt(
          {
            ciphertext: phoneCiphertext,
            nonce: phoneNonce,
            keyVersion: phoneKeyVersion,
          },
          directoryTarget
            ? `telephony_call_directory_targets/${row.id}/phone`
            : `consultation_requests.phone:${row.consultationRequestId}`,
        );
        const hasConsultationTarget = Boolean(
          !directoryTarget &&
            row.consultationId &&
            row.consultationReceiptCode &&
            row.consultationState &&
            row.consultationAnonymousLabel,
        );
        const hasDirectoryTarget = Boolean(
          directoryTarget &&
            row.directoryClientIdx &&
            row.directoryCaseIdx &&
            row.directoryClientNameCiphertext &&
            row.directoryClientNameNonce &&
            row.directoryClientNameKeyVersion,
        );
        const state = row.commandStatus === "failed"
          ? ("failed" as const)
          : row.commandStatus === "unknown"
            ? ("unknown" as const)
            : row.reconciledAt
              ? ("ended" as const)
              : ("pending" as const);
        const ringSeconds =
          row.providerDurationSeconds === null ||
          row.providerBillableSeconds === null
            ? null
            : Math.max(
                0,
                row.providerDurationSeconds - row.providerBillableSeconds,
              );
        return {
          id: row.id,
          observedCallId: null,
          callRootId: null,
          scope: "external" as const,
          direction: "outbound" as const,
          receptionMode: null,
          source: "click_to_call" as const,
          state,
          correlationStatus: "confirmed" as const,
          remotePhone,
          occurredAt: row.requestedAt.toISOString(),
          ringingAt: row.providerStartedAt?.toISOString() ?? null,
          connectedAt:
            row.providerEndedAt && row.providerBillableSeconds !== null
              ? new Date(
                  row.providerEndedAt.getTime() -
                    row.providerBillableSeconds * 1_000,
                ).toISOString()
              : null,
          endedAt: row.providerEndedAt?.toISOString() ?? null,
          lastEventAt: (row.providerEndedAt ?? row.requestedAt).toISOString(),
          ringSeconds,
          durationSeconds: row.providerBillableSeconds,
          providerEndCause: null,
          endpoint: {
            id: row.endpointId,
            label: row.endpointLabel,
            lineNumber: row.endpointLineNumber,
            extension: row.endpointExtension,
          },
          finalStaffUserId: null,
          endpointOwners: ownersByEndpoint.get(row.endpointId) ?? [],
          participants: [],
          relationType: null,
          customerMatch: await customerMatch(remotePhone),
          clickToCall: {
            id: row.id,
            commandStatus: row.commandStatus,
            outcome: row.outcome,
            disposition: row.disposition,
            requestedAt: row.requestedAt.toISOString(),
            requestedBy: {
              staffUserId: row.staffUserId,
              displayName: row.staffDisplayName,
            },
            consultation: hasConsultationTarget
              ? {
                  id: row.consultationId!,
                  publicReceiptCode: row.consultationReceiptCode!,
                  state: row.consultationState!,
                  displayName: consultationDisplayName({
                    consultationId: row.consultationId!,
                    consultationAnonymousLabel:
                      row.consultationAnonymousLabel!,
                    consultationNameCiphertext:
                      row.consultationNameCiphertext,
                    consultationNameNonce: row.consultationNameNonce,
                    consultationNameKeyVersion:
                      row.consultationNameKeyVersion,
                  }),
                }
              : null,
            directoryClient: hasDirectoryTarget
              ? {
                  clientIdx: row.directoryClientIdx!,
                  caseIdx: row.directoryCaseIdx!,
                  displayName: directoryClientDisplayName({
                    callId: row.id,
                    clientNameCiphertext:
                      row.directoryClientNameCiphertext!,
                    clientNameNonce: row.directoryClientNameNonce!,
                    clientNameKeyVersion:
                      row.directoryClientNameKeyVersion!,
                  }),
                }
              : null,
            observationLink: null,
          },
        };
      }),
    );

    const canonicalObservedItems = canonicalizePhoneDeskObservedCalls(
      observedItems,
    );

    const internalByRoot = new Map<string, (typeof internalRows)[number][]>();
    for (const row of internalRows) {
      const rows = internalByRoot.get(row.id) ?? [];
      rows.push(row);
      internalByRoot.set(row.id, rows);
    }
    const internalItems = [...internalByRoot.values()].flatMap((rows) => {
      const root = rows[0];
      if (!root?.currentEndpointId) return [];
      const participants = rows.flatMap((row) =>
        row.legId && row.legEndpointId && row.legExtension && row.legDirection &&
          row.legState
          ? [{
              legId: row.legId,
              endpointId: row.legEndpointId,
              extension: row.legExtension,
              staffUserId: row.legStaffUserId,
              displayName: row.legDisplayName,
              direction: row.legDirection,
              state: row.legState,
            }]
          : [],
      );
      const ringSeconds = root.connectedAt
        ? Math.max(
            0,
            Math.round(
              (root.connectedAt.getTime() - root.startedAt.getTime()) / 1_000,
            ),
          )
        : root.endedAt
          ? Math.max(
              0,
              Math.round(
                (root.endedAt.getTime() - root.startedAt.getTime()) / 1_000,
              ),
            )
          : null;
      const durationSeconds = root.connectedAt && root.endedAt
        ? Math.max(
            0,
            Math.round(
              (root.endedAt.getTime() - root.connectedAt.getTime()) / 1_000,
            ),
          )
        : null;
      return [{
        id: root.id,
        observedCallId: null,
        callRootId: root.id,
        scope: "internal" as const,
        direction: "internal" as const,
        receptionMode: null,
        source: "internal" as const,
        state: root.state === "ended"
          ? ("ended" as const)
          : root.state === "ringing"
            ? ("ringing" as const)
            : root.state === "needs_confirmation"
              ? ("unknown" as const)
              : ("connected" as const),
        correlationStatus: root.correlationStatus,
        remotePhone: null,
        occurredAt: root.startedAt.toISOString(),
        ringingAt: root.startedAt.toISOString(),
        connectedAt: root.connectedAt?.toISOString() ?? null,
        endedAt: root.endedAt?.toISOString() ?? null,
        lastEventAt: root.lastEventAt.toISOString(),
        ringSeconds,
        durationSeconds,
        providerEndCause: null,
        endpoint: {
          id: root.currentEndpointId,
          label: root.endpointLabel,
          lineNumber: root.endpointLineNumber,
          extension: root.endpointExtension,
        },
        finalStaffUserId: root.finalStaffUserId,
        endpointOwners: ownersByEndpoint.get(root.currentEndpointId) ?? [],
        participants,
        relationType: null,
        customerMatch: null,
        clickToCall: null,
      }];
    });

    const baseItems = [
      ...canonicalObservedItems,
      ...standaloneClickItems,
      ...internalItems,
    ]
      .sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime(),
      )
      .filter((item) => phoneDeskItemMatchesFilter(item, selectedFilter))
      .slice(offset, offset + normalizedLimit);
    const observedIds = baseItems.flatMap((item) =>
      item.observedCallId ? [item.observedCallId] : [],
    );
    const commandIds = baseItems.flatMap((item) =>
      item.clickToCall ? [item.clickToCall.id] : [],
    );
    const callRootIds = baseItems.flatMap((item) =>
      item.callRootId ? [item.callRootId] : [],
    );
    const [rootParticipantRows, rootRelationRows] = callRootIds.length
      ? await Promise.all([
          db
            .select({
              rootId: telephonyCallLegs.rootId,
              legId: telephonyCallLegs.id,
              endpointId: telephonyCallLegs.endpointId,
              extension: callLegEndpoint.extension,
              staffUserId: telephonyCallLegs.staffUserId,
              displayName: staffProfiles.displayName,
              direction: telephonyCallLegs.direction,
              state: telephonyCallLegs.state,
            })
            .from(telephonyCallLegs)
            .innerJoin(
              callLegEndpoint,
              eq(callLegEndpoint.id, telephonyCallLegs.endpointId),
            )
            .leftJoin(
              staffProfiles,
              eq(staffProfiles.userId, telephonyCallLegs.staffUserId),
            )
            .where(inArray(telephonyCallLegs.rootId, callRootIds))
            .orderBy(asc(telephonyCallLegs.startedAt)),
          db
            .select({
              rootId: telephonyCallRelations.rootId,
              relationType: telephonyCallRelations.relationType,
              occurredAt: telephonyCallRelations.occurredAt,
            })
            .from(telephonyCallRelations)
            .where(inArray(telephonyCallRelations.rootId, callRootIds))
            .orderBy(desc(telephonyCallRelations.occurredAt)),
        ])
      : [[], []];
    const participantsByRoot = new Map<
      string,
      Array<{
        legId: string;
        endpointId: string;
        extension: string;
        staffUserId: string | null;
        displayName: string | null;
        direction: "inbound" | "outbound";
        state: "ringing" | "connected" | "ended" | "unknown";
      }>
    >();
    for (const row of rootParticipantRows) {
      const participants = participantsByRoot.get(row.rootId) ?? [];
      participants.push({
        legId: row.legId,
        endpointId: row.endpointId,
        extension: row.extension,
        staffUserId: row.staffUserId,
        displayName: row.displayName,
        direction: row.direction,
        state: row.state,
      });
      participantsByRoot.set(row.rootId, participants);
    }
    const relationByRoot = new Map<
      string,
      (typeof rootRelationRows)[number]["relationType"]
    >();
    for (const relation of rootRelationRows) {
      if (!relationByRoot.has(relation.rootId)) {
        relationByRoot.set(relation.rootId, relation.relationType);
      }
    }
    const aftercareRows =
      observedIds.length || commandIds.length || callRootIds.length
        ? await db
            .select({
              id: telephonyCallAftercare.id,
              observedCallId: telephonyCallAftercare.observedCallId,
              telephonyCallId: telephonyCallAftercare.telephonyCallId,
              callRootId: telephonyCallAftercare.callRootId,
              consultationId: telephonyCallAftercare.consultationId,
              result: telephonyCallAftercare.result,
              otherTextCiphertext:
                telephonyCallAftercare.otherTextCiphertext,
              otherTextNonce: telephonyCallAftercare.otherTextNonce,
              otherTextKeyVersion: telephonyCallAftercare.otherTextKeyVersion,
              memoCiphertext: telephonyCallAftercare.memoCiphertext,
              memoNonce: telephonyCallAftercare.memoNonce,
              memoKeyVersion: telephonyCallAftercare.memoKeyVersion,
              confirmedByUserId: telephonyCallAftercare.confirmedByUserId,
              confirmedByDisplayName: staffProfiles.displayName,
              confirmedAt: telephonyCallAftercare.confirmedAt,
            })
            .from(telephonyCallAftercare)
            .innerJoin(
              staffProfiles,
              eq(
                staffProfiles.userId,
                telephonyCallAftercare.confirmedByUserId,
              ),
            )
            .where(
              or(
                observedIds.length
                  ? inArray(
                      telephonyCallAftercare.observedCallId,
                      observedIds,
                    )
                  : undefined,
                commandIds.length
                  ? inArray(
                      telephonyCallAftercare.telephonyCallId,
                      commandIds,
                    )
                  : undefined,
                callRootIds.length
                  ? inArray(telephonyCallAftercare.callRootId, callRootIds)
                  : undefined,
              ),
            )
        : [];
    const aftercareIds = aftercareRows.map((row) => row.id);
    const followUpRows = aftercareIds.length
      ? await db
          .select({
            id: telephonyFollowUpTasks.id,
            aftercareId: telephonyFollowUpTasks.aftercareId,
            state: telephonyFollowUpTasks.state,
            dueAt: telephonyFollowUpTasks.dueAt,
            assigneeUserId: telephonyFollowUpTasks.assigneeUserId,
            assigneeDisplayName: staffProfiles.displayName,
            completedAt: telephonyFollowUpTasks.completedAt,
          })
          .from(telephonyFollowUpTasks)
          .innerJoin(
            staffProfiles,
            eq(staffProfiles.userId, telephonyFollowUpTasks.assigneeUserId),
          )
          .where(inArray(telephonyFollowUpTasks.aftercareId, aftercareIds))
          .orderBy(desc(telephonyFollowUpTasks.createdAt))
      : [];
    const followUpsByAftercare = new Map<
      string,
      (typeof followUpRows)[number]
    >();
    for (const task of followUpRows) {
      if (!followUpsByAftercare.has(task.aftercareId)) {
        followUpsByAftercare.set(task.aftercareId, task);
      }
    }
    const aftercareByObserved = new Map(
      aftercareRows.flatMap((row) =>
        row.observedCallId ? [[row.observedCallId, row] as const] : [],
      ),
    );
    const aftercareByCommand = new Map(
      aftercareRows.flatMap((row) =>
        row.telephonyCallId ? [[row.telephonyCallId, row] as const] : [],
      ),
    );
    const aftercareByRoot = new Map(
      aftercareRows.flatMap((row) =>
        row.callRootId ? [[row.callRootId, row] as const] : [],
      ),
    );
    const aftercareResponse = (row: (typeof aftercareRows)[number]) => {
      const followUp = followUpsByAftercare.get(row.id);
      const otherText =
        row.otherTextCiphertext &&
        row.otherTextNonce &&
        row.otherTextKeyVersion
          ? protection.decrypt(
              {
                ciphertext: row.otherTextCiphertext,
                nonce: row.otherTextNonce,
                keyVersion: row.otherTextKeyVersion,
              },
              `telephony_call_aftercare/${row.id}/other_text`,
            )
          : null;
      const memo =
        row.memoCiphertext && row.memoNonce && row.memoKeyVersion
          ? protection.decrypt(
              {
                ciphertext: row.memoCiphertext,
                nonce: row.memoNonce,
                keyVersion: row.memoKeyVersion,
              },
              `telephony_call_aftercare/${row.id}/memo`,
            )
          : null;
      return {
        id: row.id,
        result: row.result,
        otherText,
        memo,
        consultationId: row.consultationId,
        confirmedBy: {
          staffUserId: row.confirmedByUserId,
          displayName: row.confirmedByDisplayName,
        },
        confirmedAt: row.confirmedAt.toISOString(),
        followUp: followUp
          ? {
              id: followUp.id,
              state: followUp.state,
              dueAt: followUp.dueAt.toISOString(),
              assignee: {
                staffUserId: followUp.assigneeUserId,
                displayName: followUp.assigneeDisplayName,
              },
              completedAt: followUp.completedAt?.toISOString() ?? null,
            }
          : null,
      };
    };
    const items = baseItems.map((item) => {
      const row =
        (item.callRootId
          ? aftercareByRoot.get(item.callRootId)
          : undefined) ??
        (item.observedCallId
          ? aftercareByObserved.get(item.observedCallId)
          : undefined) ??
        (item.clickToCall
          ? aftercareByCommand.get(item.clickToCall.id)
          : undefined);
      return {
        ...item,
        participants: item.callRootId
          ? participantsByRoot.get(item.callRootId) ?? item.participants
          : item.participants,
        relationType: item.callRootId
          ? relationByRoot.get(item.callRootId) ?? null
          : null,
        aftercare: row ? aftercareResponse(row) : null,
      };
    });
    const openFollowUps = callId
      ? []
      : await db
          .select({
            id: telephonyFollowUpTasks.id,
            aftercareId: telephonyFollowUpTasks.aftercareId,
            dueAt: telephonyFollowUpTasks.dueAt,
            assigneeUserId: telephonyFollowUpTasks.assigneeUserId,
            assigneeDisplayName: staffProfiles.displayName,
            result: telephonyCallAftercare.result,
            observedCallId: telephonyCallAftercare.observedCallId,
            telephonyCallId: telephonyCallAftercare.telephonyCallId,
            callRootId: telephonyCallAftercare.callRootId,
            consultationId: telephonyCallAftercare.consultationId,
          })
          .from(telephonyFollowUpTasks)
          .innerJoin(
            telephonyCallAftercare,
            eq(telephonyCallAftercare.id, telephonyFollowUpTasks.aftercareId),
          )
          .innerJoin(
            staffProfiles,
            eq(staffProfiles.userId, telephonyFollowUpTasks.assigneeUserId),
          )
          .where(eq(telephonyFollowUpTasks.state, "open"))
          .orderBy(asc(telephonyFollowUpTasks.dueAt))
          .limit(PHONE_DESK_MAX_LIMIT);
    const followUpRootIds = openFollowUps.flatMap((task) =>
      task.callRootId ? [task.callRootId] : [],
    );
    const followUpObservedIds = openFollowUps.flatMap((task) =>
      task.observedCallId ? [task.observedCallId] : [],
    );
    const followUpCommandIds = openFollowUps.flatMap((task) =>
      task.telephonyCallId ? [task.telephonyCallId] : [],
    );
    const followUpConsultationIds = [
      ...new Set(
        openFollowUps.flatMap((task) =>
          task.consultationId ? [task.consultationId] : [],
        ),
      ),
    ];
    const [
      followUpRootRows,
      followUpObservedRows,
      followUpCommandRows,
      followUpConsultationRows,
    ] = await Promise.all([
      followUpRootIds.length
        ? db
            .select({
              id: telephonyCallRoots.id,
              remotePhoneCiphertext: telephonyCallRoots.remotePhoneCiphertext,
              remotePhoneNonce: telephonyCallRoots.remotePhoneNonce,
              remotePhoneKeyVersion: telephonyCallRoots.remotePhoneKeyVersion,
            })
            .from(telephonyCallRoots)
            .where(inArray(telephonyCallRoots.id, followUpRootIds))
        : Promise.resolve([]),
      followUpObservedIds.length
        ? db
            .select({
              id: telephonyInboundCalls.id,
              remotePhoneCiphertext:
                telephonyInboundCalls.remotePhoneCiphertext,
              remotePhoneNonce: telephonyInboundCalls.remotePhoneNonce,
              remotePhoneKeyVersion:
                telephonyInboundCalls.remotePhoneKeyVersion,
            })
            .from(telephonyInboundCalls)
            .where(inArray(telephonyInboundCalls.id, followUpObservedIds))
        : Promise.resolve([]),
      followUpCommandIds.length
        ? db
            .select({
              id: telephonyCalls.id,
              targetSource: telephonyCalls.targetSource,
              consultationRequestId: telephonyCalls.consultationRequestId,
              consultationPhoneCiphertext: consultationRequests.phoneCiphertext,
              consultationPhoneNonce: consultationRequests.phoneNonce,
              consultationPhoneKeyVersion: consultationRequests.phoneKeyVersion,
              directoryPhoneCiphertext:
                telephonyCallDirectoryTargets.phoneCiphertext,
              directoryPhoneNonce: telephonyCallDirectoryTargets.phoneNonce,
              directoryPhoneKeyVersion:
                telephonyCallDirectoryTargets.phoneKeyVersion,
            })
            .from(telephonyCalls)
            .leftJoin(
              consultationRequests,
              eq(consultationRequests.id, telephonyCalls.consultationRequestId),
            )
            .leftJoin(
              telephonyCallDirectoryTargets,
              eq(
                telephonyCallDirectoryTargets.telephonyCallId,
                telephonyCalls.id,
              ),
            )
            .where(inArray(telephonyCalls.id, followUpCommandIds))
        : Promise.resolve([]),
      followUpConsultationIds.length
        ? db
            .select({
              consultationId: consultations.id,
              consultationReceiptCode: consultations.publicReceiptCode,
              consultationAnonymousLabel: consultations.anonymousLabel,
              consultationNameCiphertext: consultations.preferredNameCiphertext,
              consultationNameNonce: consultations.preferredNameNonce,
              consultationNameKeyVersion: consultations.preferredNameKeyVersion,
            })
            .from(consultations)
            .where(inArray(consultations.id, followUpConsultationIds))
        : Promise.resolve([]),
    ]);
    const followUpRootPhone = new Map(
      followUpRootRows.flatMap((row) =>
        row.remotePhoneCiphertext &&
        row.remotePhoneNonce &&
        row.remotePhoneKeyVersion
          ? [
              [
                row.id,
                protection.decrypt(
                  {
                    ciphertext: row.remotePhoneCiphertext,
                    nonce: row.remotePhoneNonce,
                    keyVersion: row.remotePhoneKeyVersion,
                  },
                  `telephony_inbound_calls/${row.id}/remote_phone`,
                ),
              ] as const,
            ]
          : [],
      ),
    );
    const followUpObservedPhone = new Map(
      followUpObservedRows.map((row) => [
        row.id,
        protection.decrypt(
          {
            ciphertext: row.remotePhoneCiphertext,
            nonce: row.remotePhoneNonce,
            keyVersion: row.remotePhoneKeyVersion,
          },
          `telephony_inbound_calls/${row.id}/remote_phone`,
        ),
      ] as const),
    );
    const followUpCommandPhone = new Map(
      followUpCommandRows.flatMap((row) => {
        if (
          row.targetSource === "legal_friends_directory" &&
          row.directoryPhoneCiphertext &&
          row.directoryPhoneNonce &&
          row.directoryPhoneKeyVersion
        ) {
          return [[
            row.id,
            protection.decrypt(
              {
                ciphertext: row.directoryPhoneCiphertext,
                nonce: row.directoryPhoneNonce,
                keyVersion: row.directoryPhoneKeyVersion,
              },
              `telephony_call_directory_targets/${row.id}/phone`,
            ),
          ] as const];
        }
        if (
          row.consultationRequestId &&
          row.consultationPhoneCiphertext &&
          row.consultationPhoneNonce &&
          row.consultationPhoneKeyVersion
        ) {
          return [[
            row.id,
            protection.decrypt(
              {
                ciphertext: row.consultationPhoneCiphertext,
                nonce: row.consultationPhoneNonce,
                keyVersion: row.consultationPhoneKeyVersion,
              },
              `consultation_requests.phone:${row.consultationRequestId}`,
            ),
          ] as const];
        }
        return [];
      }),
    );
    const followUpConsultation = new Map(
      followUpConsultationRows.map((row) => [
        row.consultationId,
        {
          displayName: consultationDisplayName(row),
          receiptCode: row.consultationReceiptCode,
        },
      ] as const),
    );
    const followUps = await Promise.all(
      openFollowUps.map(async (task) => {
        const callId =
          task.callRootId ?? task.observedCallId ?? task.telephonyCallId!;
        const remotePhone =
          (task.callRootId
            ? followUpRootPhone.get(task.callRootId)
            : undefined) ??
          (task.observedCallId
            ? followUpObservedPhone.get(task.observedCallId)
            : undefined) ??
          (task.telephonyCallId
            ? followUpCommandPhone.get(task.telephonyCallId)
            : undefined) ??
          "";
        const linkedConsultation = task.consultationId
          ? followUpConsultation.get(task.consultationId)
          : undefined;
        const match = remotePhone ? await customerMatch(remotePhone) : null;
        const matchedConsultation =
          match?.source === "consultation" ? match.consultation : null;
        const matchedDirectoryCase =
          match?.source === "legal_friends" ? match.cases[0] ?? null : null;
        const customerName =
          linkedConsultation?.displayName ??
          matchedConsultation?.displayName ??
          (match?.source === "legal_friends" ? match.clientName : null) ??
          "고객명 미확인";
        const contactTarget = task.consultationId && linkedConsultation
          ? {
              source: "consultation" as const,
              consultationId: task.consultationId,
              receiptCode: linkedConsultation.receiptCode,
            }
          : matchedConsultation
            ? {
                source: "consultation" as const,
                consultationId: matchedConsultation.id,
                receiptCode: matchedConsultation.publicReceiptCode,
              }
            : matchedDirectoryCase
              ? {
                  source: "legal_friends_directory" as const,
                  clientIdx: matchedDirectoryCase.clientIdx,
                  caseIdx: matchedDirectoryCase.caseIdx,
                  receiptCode:
                    matchedDirectoryCase.caseNumber ?? "리걸프렌즈",
                }
              : null;
        return {
          id: task.id,
          aftercareId: task.aftercareId,
          callId,
          result: task.result,
          consultationId: task.consultationId,
          customerName,
          remotePhone,
          contactTarget,
          dueAt: task.dueAt.toISOString(),
          assignee: {
            staffUserId: task.assigneeUserId,
            displayName: task.assigneeDisplayName,
          },
        };
      }),
    );
    return {
      snapshotAt: snapshotAt.toISOString(),
      items,
      total: callId ? items.length : total,
      page,
      pageSize: normalizedLimit,
      pageCount: callId ? 1 : pageCount,
      summary: callId
        ? { ...emptySummary, all: items.length }
        : summary,
      followUps,
    };
  }

  async function activePhoneDeskStaff() {
    return db
      .select({
        staffUserId: staffUsers.id,
        displayName: staffProfiles.displayName,
        membershipId: staffMemberships.id,
        department: staffMemberships.department,
        jobTitle: staffMemberships.jobTitle,
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
      .where(eq(staffUsers.status, "active"))
      .orderBy(asc(staffProfiles.displayName));
  }

  async function getPhoneDeskCall(callId: string) {
    const [snapshot, staffOptions] = await Promise.all([
      getPhoneDeskCalls(1, callId),
      activePhoneDeskStaff(),
    ]);
    const initialCall = snapshot.items[0];
    if (!initialCall) {
      throw new TelephonyCallError(
        "call_not_found",
        "전화 원장을 찾을 수 없습니다.",
      );
    }
    let call = initialCall;
    if (call.callRootId === callId) {
      const [root] = await db
        .select({
          state: telephonyCallRoots.state,
          correlationStatus: telephonyCallRoots.correlationStatus,
          endedAt: telephonyCallRoots.endedAt,
          lastEventAt: telephonyCallRoots.lastEventAt,
          finalStaffUserId: telephonyCallRoots.finalStaffUserId,
        })
        .from(telephonyCallRoots)
        .where(eq(telephonyCallRoots.id, callId))
        .limit(1);
      if (root) {
        call = {
          ...call,
          id: callId,
          state:
            root.state === "ringing"
              ? "ringing"
              : root.state === "ended"
                ? "ended"
                : root.state === "needs_confirmation"
                  ? "unknown"
                  : "connected",
          endedAt: root.endedAt?.toISOString() ?? null,
          lastEventAt: root.lastEventAt.toISOString(),
          finalStaffUserId: root.finalStaffUserId,
          correlationStatus: root.correlationStatus,
        };
      }
    }
    const legalFriendsMatch =
      call.customerMatch?.source === "legal_friends"
        ? call.customerMatch
        : call.remotePhone
          ? await resolveLegalFriendsPhone(call.remotePhone)
          : null;
    const recommended = new Set<string>();
    if (call.customerMatch?.source === "consultation") {
      const assignee = call.customerMatch.consultation.assigneeUserId;
      if (assignee) recommended.add(assignee);
    }
    if (legalFriendsMatch) {
      const staffUserIds = new Set(
        legalFriendsMatch.cases.flatMap((item) => item.staffUserIds),
      );
      for (const staff of staffOptions) {
        if (staffUserIds.has(staff.staffUserId)) {
          recommended.add(staff.staffUserId);
        }
      }
    }
    if (recommended.size === 0 && call.clickToCall) {
      recommended.add(call.clickToCall.requestedBy.staffUserId);
    }
    if (call.scope === "internal") {
      for (const participant of call.participants) {
        if (participant.staffUserId) recommended.add(participant.staffUserId);
      }
    }
    return {
      snapshotAt: snapshot.snapshotAt,
      call,
      staffOptions,
      legalFriendsMatch,
      recommendedAssigneeUserIds: [...recommended].filter((id) =>
        staffOptions.some((staff) => staff.staffUserId === id),
      ),
    };
  }

  function assertValidFollowUpDueAt(value: string, reference: Date) {
    const dueAt = new Date(value);
    if (
      !Number.isFinite(dueAt.getTime()) ||
      dueAt <= reference ||
      dueAt.getUTCMinutes() % 30 !== 0 ||
      dueAt.getUTCSeconds() !== 0 ||
      dueAt.getUTCMilliseconds() !== 0
    ) {
      throw new TelephonyCallError(
        "follow_up_due_invalid",
        "재통화 일시는 현재 이후의 30분 단위로 선택해 주세요.",
      );
    }
    return dueAt;
  }

  async function resolvePhoneDeskCall(
    callId: string,
    input: PhoneDeskCallResolution,
    actor: StaffPrincipal,
  ) {
    const resolvedAt = now();
    await db.transaction(async (tx) => {
      const [root] = await tx
        .select({
          id: telephonyCallRoots.id,
          state: telephonyCallRoots.state,
          correlationStatus: telephonyCallRoots.correlationStatus,
        })
        .from(telephonyCallRoots)
        .where(eq(telephonyCallRoots.id, callId))
        .limit(1)
        .for("update");
      if (!root) {
        throw new TelephonyCallError(
          "call_not_found",
          "전화 원장을 찾을 수 없습니다.",
        );
      }
      if (root.state !== "ended") {
        throw new TelephonyCallError(
          "call_not_ended",
          "통화 종료를 확인한 뒤 최종 통화자를 선택해 주세요.",
        );
      }
      if (root.correlationStatus !== "needs_confirmation") {
        throw new TelephonyCallError(
          "call_resolution_not_required",
          "이미 최종 통화자가 확인된 전화입니다.",
        );
      }
      const [selectedLeg] = await tx
        .select({
          id: telephonyCallLegs.id,
          endpointId: telephonyCallLegs.endpointId,
          staffUserId: telephonyCallLegs.staffUserId,
          state: telephonyCallLegs.state,
        })
        .from(telephonyCallLegs)
        .where(
          and(
            eq(telephonyCallLegs.id, input.finalLegId),
            eq(telephonyCallLegs.rootId, root.id),
          ),
        )
        .limit(1)
        .for("update");
      if (!selectedLeg || !selectedLeg.staffUserId) {
        throw new TelephonyCallError(
          "call_resolution_leg_invalid",
          "선택한 통화자의 직원 연결 정보를 확인할 수 없습니다.",
        );
      }
      if (selectedLeg.state !== "ended") {
        throw new TelephonyCallError(
          "call_resolution_leg_active",
          "선택한 통화자의 종료가 아직 확인되지 않았습니다.",
        );
      }
      await tx
        .update(telephonyCallRoots)
        .set({
          correlationStatus: "confirmed",
          currentEndpointId: selectedLeg.endpointId,
          finalEndpointId: selectedLeg.endpointId,
          finalStaffUserId: selectedLeg.staffUserId,
          updatedAt: resolvedAt,
        })
        .where(eq(telephonyCallRoots.id, root.id));
      await tx
        .insert(telephonyCallRelations)
        .values({
          id: createEventId(),
          rootId: root.id,
          fromLegId: selectedLeg.id,
          toLegId: selectedLeg.id,
          relationType: "staff_resolved",
          correlationStatus: "confirmed",
          correlationKey: `staff-resolved:${root.id}`,
          evidence: {
            method: "phone_desk_final_participant_selection_v1",
            selectedLegId: selectedLeg.id,
            actorUserId: actor.id,
          },
          occurredAt: resolvedAt,
          createdAt: resolvedAt,
          updatedAt: resolvedAt,
        })
        .onConflictDoNothing();
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.call.final_participant_resolved",
        targetType: "telephony_call_root",
        targetId: root.id,
        metadata: {
          finalLegId: selectedLeg.id,
          finalEndpointId: selectedLeg.endpointId,
          finalStaffUserId: selectedLeg.staffUserId,
        },
        occurredAt: resolvedAt,
        createdAt: resolvedAt,
      });
    });
    return getPhoneDeskCall(callId);
  }

  async function savePhoneDeskAftercare(
    callId: string,
    input: PhoneDeskAftercareSave,
    actor: StaffPrincipal,
  ) {
    const detail = await getPhoneDeskCall(callId);
    const call = detail.call;
    if (call.state !== "ended") {
      throw new TelephonyCallError(
        "call_not_ended",
        "통화 종료를 확인한 뒤 후처리를 저장해 주세요.",
      );
    }
    if (call.correlationStatus !== "confirmed") {
      throw new TelephonyCallError(
        "call_resolution_required",
        "최종 통화자를 확인한 뒤 후처리를 저장해 주세요.",
      );
    }
    const internalResults = new Set([
      "internal_completed",
      "internal_follow_up",
      "internal_no_answer",
    ]);
    if (call.scope === "internal") {
      if (!internalResults.has(input.result)) {
        throw new TelephonyCallError(
          "internal_aftercare_result_invalid",
          "내선 통화에 맞는 후처리 결과를 선택해 주세요.",
        );
      }
      if (input.consultation.mode !== "none") {
        throw new TelephonyCallError(
          "internal_consultation_not_allowed",
          "내선 통화는 고객 상담에 연결할 수 없습니다.",
        );
      }
    } else if (internalResults.has(input.result)) {
      throw new TelephonyCallError(
        "external_aftercare_result_invalid",
        "고객 통화에 맞는 후처리 결과를 선택해 주세요.",
      );
    }
    const callRootId = call.callRootId === callId ? callId : null;
    if (
      callRootId &&
      call.scope === "external" &&
      call.finalStaffUserId &&
      call.finalStaffUserId !== actor.id
    ) {
      throw new TelephonyCallError(
        "call_owned_by_other_staff",
        "최종적으로 고객과 통화한 담당자만 후처리를 입력할 수 있습니다.",
      );
    }
    if (
      callRootId &&
      call.scope === "internal" &&
      !call.participants.some((participant) => participant.staffUserId === actor.id)
    ) {
      throw new TelephonyCallError(
        "call_owned_by_other_staff",
        "내선 통화에 참여한 직원만 후처리를 입력할 수 있습니다.",
      );
    }
    const confirmedAt = now();
    const dueAt = input.followUp.enabled
      ? assertValidFollowUpDueAt(input.followUp.dueAt, confirmedAt)
      : null;
    const observedCallId = callRootId ? null : call.observedCallId;
    const telephonyCallId = callRootId ? null : call.clickToCall?.id ?? null;
    const remotePhoneFingerprint = call.remotePhone
      ? protection.fingerprint(call.remotePhone)
      : null;

    await db.transaction(async (tx) => {
      const assigneeIds = new Set<string>();
      if (input.followUp.enabled) {
        assigneeIds.add(input.followUp.assigneeUserId);
      }
      if (
        input.consultation.mode === "create" &&
        input.consultation.assigneeUserId
      ) {
        assigneeIds.add(input.consultation.assigneeUserId);
      }
      const assignableStaff = assigneeIds.size
        ? await tx
            .select({
              staffUserId: staffUsers.id,
              membershipId: staffMemberships.id,
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
            .where(
              and(
                inArray(staffUsers.id, [...assigneeIds]),
                eq(staffUsers.status, "active"),
              ),
            )
        : [];
      if (assignableStaff.length !== assigneeIds.size) {
        throw new TelephonyCallError(
          "staff_not_assignable",
          "선택한 담당자는 현재 업무를 배정할 수 없습니다.",
        );
      }
      const membershipByUser = new Map(
        assignableStaff.map((staff) => [staff.staffUserId, staff.membershipId]),
      );

      let consultationId: string | null = null;
      if (input.consultation.mode === "link") {
        if (!remotePhoneFingerprint) {
          throw new TelephonyCallError(
            "call_phone_not_available",
            "내선 통화는 고객 상담에 연결할 수 없습니다.",
          );
        }
        const [consultation] = await tx
          .select({
            id: consultations.id,
            phoneFingerprint: consultations.phoneFingerprint,
          })
          .from(consultations)
          .where(eq(consultations.id, input.consultation.consultationId))
          .limit(1);
        if (!consultation) {
          throw new TelephonyCallError(
            "consultation_not_found",
            "연결할 상담을 찾을 수 없습니다.",
          );
        }
        if (
          !consultation.phoneFingerprint ||
          !consultation.phoneFingerprint.equals(remotePhoneFingerprint)
        ) {
          throw new TelephonyCallError(
            "consultation_phone_mismatch",
            "통화 번호와 상담 고객의 전화번호가 일치하지 않습니다.",
          );
        }
        consultationId = consultation.id;
      } else if (input.consultation.mode === "create") {
        if (!remotePhoneFingerprint || !call.remotePhone) {
          throw new TelephonyCallError(
            "call_phone_not_available",
            "내선 통화는 고객 상담으로 등록할 수 없습니다.",
          );
        }
        await tx.execute(
          sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(remotePhoneFingerprint)} as bigint))`,
        );
        const [existing] = await tx
          .select({ id: consultations.id })
          .from(consultations)
          .where(eq(consultations.phoneFingerprint, remotePhoneFingerprint))
          .orderBy(desc(consultations.lastRequestedAt))
          .limit(1);
        if (existing) {
          throw new TelephonyCallError(
            "consultation_already_exists",
            "같은 전화번호의 상담이 이미 있습니다. 기존 상담 연결을 선택해 주세요.",
          );
        }
        consultationId = createConsultationId();
        const requestId = createConsultationRequestId();
        const receiptCode = createPublicReceiptCode(confirmedAt);
        const nameEncrypted = protection.encrypt(
          input.consultation.customerName,
          `consultations.preferred_name:${consultationId}`,
        );
        const requestNameEncrypted = protection.encrypt(
          input.consultation.customerName,
          `consultation_requests.name:${requestId}`,
        );
        const phoneEncrypted = protection.encrypt(
          call.remotePhone,
          `consultation_requests.phone:${requestId}`,
        );
        const intake = {
          channel: "phone_desk",
          callId,
          direction: call.direction,
          note: "직원이 통화 후 전화데스크에서 생성한 신건상담",
        };
        const intakeEncrypted = protection.encrypt(
          JSON.stringify(intake),
          `consultation_requests.intake:${requestId}`,
        );
        const payloadFingerprint = protection.fingerprint({
          source: "erp_phone_desk",
          phoneFingerprint: remotePhoneFingerprint.toString("hex"),
          callId,
        });
        const assigneeUserId = input.consultation.assigneeUserId ?? null;
        await tx.insert(consultations).values({
          id: consultationId,
          publicReceiptCode: receiptCode,
          state: assigneeUserId ? "assigned" : "requested",
          contactChannel: "phone",
          phoneFingerprint: remotePhoneFingerprint,
          anonymousLabel: `전화상담_${receiptCode.slice(-6)}`,
          preferredNameCiphertext: nameEncrypted.ciphertext,
          preferredNameNonce: nameEncrypted.nonce,
          preferredNameKeyVersion: nameEncrypted.keyVersion,
          firstRequestedAt: confirmedAt,
          lastRequestedAt: confirmedAt,
          createdAt: confirmedAt,
          updatedAt: confirmedAt,
        });
        await tx.insert(consultationRequests).values({
          id: requestId,
          consultationId,
          source: "erp_phone_desk",
          idempotencyKey: callId,
          mode: "quick",
          contactChannel: "phone",
          phoneFingerprint: remotePhoneFingerprint,
          phoneCiphertext: phoneEncrypted.ciphertext,
          phoneNonce: phoneEncrypted.nonce,
          phoneKeyVersion: phoneEncrypted.keyVersion,
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
          privacyNoticeVersion: CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
          privacyBasis: "staff_recorded_phone_interaction",
          consentAgreedAt: null,
          journeySessionId: null,
          dedupeOutcome: "new",
          candidateConsultationId: null,
          submittedAt: confirmedAt,
          createdAt: confirmedAt,
        });
        await tx.insert(consultationStatusHistory).values({
          id: createEventId(),
          consultationId,
          fromState: null,
          toState: "requested",
          reason: "phone_desk_conversion",
          actorType: "staff",
          actorId: actor.id,
          changedAt: confirmedAt,
          createdAt: confirmedAt,
        });
        if (assigneeUserId) {
          await tx.insert(consultationAssignments).values({
            id: createEventId(),
            consultationId,
            assigneeUserId,
            assigneeMembershipId: membershipByUser.get(assigneeUserId)!,
            assignedByUserId: actor.id,
            assignmentMethod: "phone_desk_conversion",
            assignedAt: confirmedAt,
            createdAt: confirmedAt,
          });
          await tx.insert(consultationStatusHistory).values({
            id: createEventId(),
            consultationId,
            fromState: "requested",
            toState: "assigned",
            reason: "phone_desk_conversion_assignment",
            actorType: "staff",
            actorId: actor.id,
            changedAt: confirmedAt,
            createdAt: confirmedAt,
          });
        }
        const event: PlatformEvent = {
          eventId: createEventId(),
          eventType: "consultation.requested",
          eventVersion: 1,
          occurredAt: confirmedAt.toISOString(),
          producer: "lawand.gateway",
          correlationId: consultationId,
          data: {
            consultationId,
            requestId,
            intakeRef: `consultation_requests/${requestId}`,
            mode: "quick",
            privacyNoticeVersion: CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
            privacyBasis: "staff_recorded_phone_interaction",
            dedupeOutcome: "new",
          },
        };
        assertPlatformEvent(event);
        await tx.insert(outboxEvents).values({
          id: event.eventId,
          aggregateType: "consultation",
          aggregateId: consultationId,
          eventType: event.eventType,
          eventVersion: event.eventVersion,
          correlationId: consultationId,
          causationId: null,
          payload: event,
          status: "pending",
          attempts: 0,
          availableAt: confirmedAt,
          occurredAt: confirmedAt,
          createdAt: confirmedAt,
        });
      }

      const [existingAftercare] = await tx
        .select({ id: telephonyCallAftercare.id })
        .from(telephonyCallAftercare)
        .where(
          or(
            observedCallId
              ? eq(telephonyCallAftercare.observedCallId, observedCallId)
              : undefined,
            telephonyCallId
              ? eq(telephonyCallAftercare.telephonyCallId, telephonyCallId)
              : undefined,
            callRootId
              ? eq(telephonyCallAftercare.callRootId, callRootId)
              : undefined,
          ),
        )
        .limit(1)
        .for("update");
      const aftercareId = existingAftercare?.id ?? createEventId();
      const otherTextEncrypted =
        input.result === "other"
          ? protection.encrypt(
              input.otherText!,
              `telephony_call_aftercare/${aftercareId}/other_text`,
            )
          : null;
      const memoEncrypted = input.memo
        ? protection.encrypt(
            input.memo,
            `telephony_call_aftercare/${aftercareId}/memo`,
          )
        : null;
      const aftercareValues = {
        observedCallId,
        telephonyCallId,
        callRootId,
        consultationId,
        result: input.result,
        otherTextCiphertext: otherTextEncrypted?.ciphertext ?? null,
        otherTextNonce: otherTextEncrypted?.nonce ?? null,
        otherTextKeyVersion: otherTextEncrypted?.keyVersion ?? null,
        memoCiphertext: memoEncrypted?.ciphertext ?? null,
        memoNonce: memoEncrypted?.nonce ?? null,
        memoKeyVersion: memoEncrypted?.keyVersion ?? null,
        confirmedByUserId: actor.id,
        confirmedAt,
        updatedAt: confirmedAt,
      };
      if (existingAftercare) {
        await tx
          .update(telephonyCallAftercare)
          .set(aftercareValues)
          .where(eq(telephonyCallAftercare.id, aftercareId));
      } else {
        await tx.insert(telephonyCallAftercare).values({
          id: aftercareId,
          ...aftercareValues,
          createdAt: confirmedAt,
        });
      }

      const [openTask] = await tx
        .select({ id: telephonyFollowUpTasks.id })
        .from(telephonyFollowUpTasks)
        .where(
          and(
            eq(telephonyFollowUpTasks.aftercareId, aftercareId),
            eq(telephonyFollowUpTasks.state, "open"),
          ),
        )
        .limit(1)
        .for("update");
      if (input.followUp.enabled) {
        const values = {
          assigneeUserId: input.followUp.assigneeUserId,
          dueAt: dueAt!,
          updatedAt: confirmedAt,
        };
        if (openTask) {
          await tx
            .update(telephonyFollowUpTasks)
            .set(values)
            .where(eq(telephonyFollowUpTasks.id, openTask.id));
        } else {
          await tx.insert(telephonyFollowUpTasks).values({
            id: createEventId(),
            aftercareId,
            state: "open",
            ...values,
            createdByUserId: actor.id,
            createdAt: confirmedAt,
          });
        }
      } else if (openTask) {
        await tx
          .update(telephonyFollowUpTasks)
          .set({
            state: "cancelled",
            cancelledAt: confirmedAt,
            updatedAt: confirmedAt,
          })
          .where(eq(telephonyFollowUpTasks.id, openTask.id));
      }
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.call.aftercare_saved",
        targetType: "telephony_call_aftercare",
        targetId: aftercareId,
        metadata: {
          result: input.result,
          consultationMode: input.consultation.mode,
          consultationId,
          followUpEnabled: input.followUp.enabled,
          followUpAssigneeUserId: input.followUp.enabled
            ? input.followUp.assigneeUserId
            : null,
        },
        occurredAt: confirmedAt,
        createdAt: confirmedAt,
      });
    });
    return getPhoneDeskCall(callId);
  }

  async function completePhoneDeskFollowUp(
    taskId: string,
    actor: StaffPrincipal,
  ) {
    const completedAt = now();
    const result = await db.transaction(async (tx) => {
      const [task] = await tx
        .select({
          id: telephonyFollowUpTasks.id,
          state: telephonyFollowUpTasks.state,
          aftercareId: telephonyFollowUpTasks.aftercareId,
        })
        .from(telephonyFollowUpTasks)
        .where(eq(telephonyFollowUpTasks.id, taskId))
        .limit(1)
        .for("update");
      if (!task) {
        throw new TelephonyCallError(
          "follow_up_not_found",
          "재통화 업무를 찾을 수 없습니다.",
        );
      }
      if (task.state !== "open") {
        throw new TelephonyCallError(
          "follow_up_not_open",
          "이미 완료되거나 취소된 재통화 업무입니다.",
        );
      }
      await tx
        .update(telephonyFollowUpTasks)
        .set({
          state: "completed",
          completedByUserId: actor.id,
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(telephonyFollowUpTasks.id, task.id));
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.follow_up.completed",
        targetType: "telephony_follow_up_task",
        targetId: task.id,
        metadata: { aftercareId: task.aftercareId },
        occurredAt: completedAt,
        createdAt: completedAt,
      });
      return { id: task.id, state: "completed" as const };
    });
    return { ...result, completedAt: completedAt.toISOString() };
  }

  async function requestInboundAnswer(
    inboundCallId: string,
    actor: StaffPrincipal,
  ) {
    const requestedAt = now();
    const expiresAt = new Date(
      requestedAt.getTime() + INBOUND_ANSWER_COMMAND_TTL_MS,
    );
    let requestedBridgeId: string | null = null;
    const response = await db.transaction(async (tx) => {
      const [call] = await tx
        .select({
          id: telephonyInboundCalls.id,
          endpointId: telephonyInboundCalls.endpointId,
          bridgeId: telephonyInboundCalls.bridgeId,
          providerCallId: telephonyInboundCalls.providerCallId,
          direction: telephonyInboundCalls.direction,
          state: telephonyInboundCalls.state,
        })
        .from(telephonyInboundCalls)
        .where(eq(telephonyInboundCalls.id, inboundCallId))
        .limit(1)
        .for("update");
      if (!call) {
        throw new TelephonyCallError(
          "inbound_call_not_found",
          "수신전화를 찾을 수 없습니다.",
        );
      }
      if (call.direction !== "inbound") {
        throw new TelephonyCallError(
          "inbound_call_not_found",
          "수신전화를 찾을 수 없습니다.",
        );
      }
      if (call.state !== "ringing") {
        throw new TelephonyCallError(
          "inbound_call_not_ringing",
          call.state === "connected"
            ? "이미 연결된 전화입니다."
            : "이미 종료된 전화입니다.",
        );
      }
      if (!answerableBridgeIds.has(call.bridgeId)) {
        throw new TelephonyCallError(
          "inbound_call_answer_unavailable",
          "비즈콜 앱으로 온 전화는 휴대폰 앱에서 받아 주세요.",
        );
      }
      requestedBridgeId = call.bridgeId;

      const [binding] = await tx
        .select({ id: staffTelephonyBindings.id })
        .from(staffTelephonyBindings)
        .where(
          and(
            eq(staffTelephonyBindings.endpointId, call.endpointId),
            eq(staffTelephonyBindings.staffUserId, actor.id),
            eq(staffTelephonyBindings.isActive, true),
          ),
        )
        .limit(1);
      if (!binding) {
        throw new TelephonyCallError(
          "inbound_call_owned_by_other_staff",
          "본인에게 연결된 센트릭스 회선만 받을 수 있습니다.",
        );
      }

      await tx
        .update(telephonyInboundCommands)
        .set({
          status: "expired",
          completedAt: requestedAt,
          resultCode: "command_expired",
          updatedAt: requestedAt,
        })
        .where(
          and(
            eq(telephonyInboundCommands.inboundCallId, inboundCallId),
            eq(telephonyInboundCommands.status, "queued"),
            lt(telephonyInboundCommands.expiresAt, requestedAt),
          ),
        );
      await tx
        .update(telephonyInboundCommands)
        .set({
          status: "expired",
          completedAt: requestedAt,
          resultCode: "dispatch_timeout",
          updatedAt: requestedAt,
        })
        .where(
          and(
            eq(telephonyInboundCommands.inboundCallId, inboundCallId),
            eq(telephonyInboundCommands.status, "dispatching"),
            lt(
              telephonyInboundCommands.requestedAt,
              new Date(
                requestedAt.getTime() -
                  INBOUND_ANSWER_DISPATCH_TIMEOUT_MS,
              ),
            ),
          ),
        );

      const [existing] = await tx
        .select()
        .from(telephonyInboundCommands)
        .where(
          and(
            eq(telephonyInboundCommands.inboundCallId, inboundCallId),
            inArray(telephonyInboundCommands.status, [
              "queued",
              "dispatching",
            ]),
          ),
        )
        .orderBy(desc(telephonyInboundCommands.requestedAt))
        .limit(1);
      if (existing) {
        return {
          ...inboundAnswerCommandResponse(existing),
          replayed: true,
        };
      }

      const commandId = createEventId();
      const [command] = await tx
        .insert(telephonyInboundCommands)
        .values({
          id: commandId,
          inboundCallId,
          endpointId: call.endpointId,
          requestedByUserId: actor.id,
          bridgeId: call.bridgeId,
          commandType: "answer",
          providerCallId: call.providerCallId,
          status: "queued",
          requestedAt,
          expiresAt,
          createdAt: requestedAt,
          updatedAt: requestedAt,
        })
        .returning();
      if (!command) throw new Error("inbound_answer_command_not_created");
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.inbound.answer_requested",
        targetType: "telephony_inbound_call",
        targetId: inboundCallId,
        metadata: {
          commandId,
          endpointId: call.endpointId,
          provider: "centrex",
        },
        occurredAt: requestedAt,
        createdAt: requestedAt,
      });
      return {
        ...inboundAnswerCommandResponse(command),
        replayed: false,
      };
    });
    if (requestedBridgeId) inboundCommandPollGate.hint(requestedBridgeId);
    return response;
  }

  async function pollInboundAnswerCommand(authentication: {
    bridgeId: string;
    endpointId: string;
  }) {
    if (
      !inboundCommandPollGate.shouldCheckDatabase(authentication.bridgeId)
    ) {
      return null;
    }
    const polledAt = now();
    try {
      const command = await db.transaction(async (tx) => {
        await tx
          .update(telephonyInboundCommands)
          .set({
            status: "expired",
            completedAt: polledAt,
            resultCode: "command_expired",
            updatedAt: polledAt,
          })
          .where(
            and(
              eq(telephonyInboundCommands.bridgeId, authentication.bridgeId),
              eq(
                telephonyInboundCommands.endpointId,
                authentication.endpointId,
              ),
              eq(telephonyInboundCommands.status, "queued"),
              lt(telephonyInboundCommands.expiresAt, polledAt),
            ),
          );
        await tx
          .update(telephonyInboundCommands)
          .set({
            status: "expired",
            completedAt: polledAt,
            resultCode: "dispatch_timeout",
            updatedAt: polledAt,
          })
          .where(
            and(
              eq(telephonyInboundCommands.bridgeId, authentication.bridgeId),
              eq(
                telephonyInboundCommands.endpointId,
                authentication.endpointId,
              ),
              eq(telephonyInboundCommands.status, "dispatching"),
              lt(
                telephonyInboundCommands.requestedAt,
                new Date(
                  polledAt.getTime() -
                    INBOUND_ANSWER_DISPATCH_TIMEOUT_MS,
                ),
              ),
            ),
          );

        const [pendingCommand] = await tx
          .select()
          .from(telephonyInboundCommands)
          .where(
            and(
              eq(telephonyInboundCommands.bridgeId, authentication.bridgeId),
              eq(
                telephonyInboundCommands.endpointId,
                authentication.endpointId,
              ),
              inArray(telephonyInboundCommands.status, [
                "queued",
                "dispatching",
              ]),
            ),
          )
          .orderBy(telephonyInboundCommands.requestedAt)
          .limit(1)
          .for("update");
        if (!pendingCommand) return null;

        const [call] = await tx
          .select({
            direction: telephonyInboundCalls.direction,
            state: telephonyInboundCalls.state,
          })
          .from(telephonyInboundCalls)
          .where(eq(telephonyInboundCalls.id, pendingCommand.inboundCallId))
          .limit(1);
        if (
          !call ||
          call.direction !== "inbound" ||
          call.state !== "ringing"
        ) {
          await tx
            .update(telephonyInboundCommands)
            .set({
              status: "expired",
              completedAt: polledAt,
              resultCode: "call_not_ringing",
              updatedAt: polledAt,
            })
            .where(eq(telephonyInboundCommands.id, pendingCommand.id));
          return null;
        }

        await tx
          .update(telephonyInboundCommands)
          .set({
            status: "dispatching",
            firstDispatchedAt: sql`coalesce(${telephonyInboundCommands.firstDispatchedAt}, ${polledAt})`,
            lastDispatchedAt: polledAt,
            dispatchAttempts: sql`${telephonyInboundCommands.dispatchAttempts} + 1`,
            updatedAt: polledAt,
          })
          .where(eq(telephonyInboundCommands.id, pendingCommand.id));
        return {
          schemaVersion: 1 as const,
          commandId: pendingCommand.id,
          inboundCallId: pendingCommand.inboundCallId,
          commandType: "answer" as const,
          expectedProviderCallId: pendingCommand.providerCallId,
          expiresAt: pendingCommand.expiresAt.toISOString(),
        };
      });
      inboundCommandPollGate.completeCheck(
        authentication.bridgeId,
        Boolean(command),
      );
      return command;
    } catch (error) {
      inboundCommandPollGate.failCheck(authentication.bridgeId);
      throw error;
    }
  }

  async function completeInboundAnswerCommand(
    commandId: string,
    result: CentrexBridgeCommandResult,
    authentication: { bridgeId: string; endpointId: string },
  ) {
    const completedAt = now();
    return db.transaction(async (tx) => {
      const [command] = await tx
        .select()
        .from(telephonyInboundCommands)
        .where(eq(telephonyInboundCommands.id, commandId))
        .limit(1)
        .for("update");
      if (!command) {
        throw new TelephonyCallError(
          "inbound_command_not_found",
          "수신전화 받기 명령을 찾을 수 없습니다.",
        );
      }
      if (
        command.bridgeId !== authentication.bridgeId ||
        command.endpointId !== authentication.endpointId
      ) {
        throw new TelephonyCallError(
          "inbound_command_identity_mismatch",
          "bridge와 수신전화 받기 명령의 회선이 일치하지 않습니다.",
        );
      }
      if (command.status === "succeeded" || command.status === "failed") {
        return {
          ...inboundAnswerCommandResponse(command),
          replayed: true,
        };
      }
      if (command.status === "expired") {
        return {
          ...inboundAnswerCommandResponse(command),
          replayed: true,
        };
      }
      if (command.status !== "dispatching") {
        throw new TelephonyCallError(
          "inbound_command_not_dispatching",
          "아직 bridge로 전달되지 않은 명령입니다.",
        );
      }

      const [updated] = await tx
        .update(telephonyInboundCommands)
        .set({
          status: result.status,
          completedAt,
          resultCode: result.resultCode,
          updatedAt: completedAt,
        })
        .where(eq(telephonyInboundCommands.id, command.id))
        .returning();
      if (!updated) throw new Error("inbound_answer_command_not_completed");
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: command.requestedByUserId,
        action: "telephony.inbound.answer_completed",
        targetType: "telephony_inbound_call",
        targetId: command.inboundCallId,
        metadata: {
          commandId: command.id,
          status: result.status,
          resultCode: result.resultCode,
        },
        occurredAt: completedAt,
        createdAt: completedAt,
      });
      return {
        ...inboundAnswerCommandResponse(updated),
        replayed: false,
      };
    });
  }

  function decryptedOptional(
    encrypted: {
      ciphertext: Buffer | null;
      nonce: Buffer | null;
      keyVersion: string | null;
    },
    context: string,
  ): string | null {
    if (!encrypted.ciphertext || !encrypted.nonce || !encrypted.keyVersion) {
      return null;
    }
    return protection.decrypt(
      {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        keyVersion: encrypted.keyVersion,
      },
      context,
    );
  }

  type MessageThreadIdentity = {
    key: string;
    caseIdx: string | null;
    clientIdx: number | null;
    consultationId: string | null;
    customerName: string;
    phone: string;
    receiptCode?: string | null;
  };

  async function loadMessageHubRows() {
    const outgoing = await db
      .select({
        id: telephonyMessages.id,
        targetSource: telephonyMessages.targetSource,
        consultationId: telephonyMessages.consultationId,
        consultationRequestId: telephonyMessages.consultationRequestId,
        directoryClientIdx: telephonyMessageDirectoryTargets.clientIdx,
        directoryCaseIdx: telephonyMessageDirectoryTargets.caseIdx,
        directoryClientNameCiphertext:
          telephonyMessageDirectoryTargets.clientNameCiphertext,
        directoryClientNameNonce:
          telephonyMessageDirectoryTargets.clientNameNonce,
        directoryClientNameKeyVersion:
          telephonyMessageDirectoryTargets.clientNameKeyVersion,
        directoryPhoneCiphertext:
          telephonyMessageDirectoryTargets.phoneCiphertext,
        directoryPhoneNonce: telephonyMessageDirectoryTargets.phoneNonce,
        directoryPhoneKeyVersion:
          telephonyMessageDirectoryTargets.phoneKeyVersion,
        legalFriendsCaseIdx: legalFriendsCaseLinks.caseIdx,
        consultationReceiptCode: consultations.publicReceiptCode,
        consultationAnonymousLabel: consultations.anonymousLabel,
        consultationNameCiphertext: consultations.preferredNameCiphertext,
        consultationNameNonce: consultations.preferredNameNonce,
        consultationNameKeyVersion: consultations.preferredNameKeyVersion,
        consultationPhoneCiphertext: consultationRequests.phoneCiphertext,
        consultationPhoneNonce: consultationRequests.phoneNonce,
        consultationPhoneKeyVersion: consultationRequests.phoneKeyVersion,
        provider: telephonyMessages.provider,
        messageKind: telephonyMessages.messageKind,
        commandStatus: telephonyMessages.commandStatus,
        bodyCiphertext: telephonyMessages.bodyCiphertext,
        bodyNonce: telephonyMessages.bodyNonce,
        bodyKeyVersion: telephonyMessages.bodyKeyVersion,
        bodyByteLength: telephonyMessages.bodyByteLength,
        imageFileId: telephonyMessages.imageFileIdSnapshot,
        imageUrl: telephonyMessages.imageUrlSnapshot,
        imageName: telephonyMessages.imageOriginalNameSnapshot,
        requestedAt: telephonyMessages.requestedAt,
        staffUserId: telephonyMessages.staffUserId,
        staffDisplayName: staffProfiles.displayName,
        endpointId: telephonyEndpoints.id,
        endpointLabel: telephonyEndpoints.label,
        endpointLineNumber: telephonyEndpoints.lineNumber,
        endpointPublicNumber: telephonyEndpoints.publicNumber,
        endpointExtension: telephonyEndpoints.extension,
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
      .leftJoin(
        telephonyMessageDirectoryTargets,
        eq(
          telephonyMessageDirectoryTargets.telephonyMessageId,
          telephonyMessages.id,
        ),
      )
      .leftJoin(
        consultations,
        eq(consultations.id, telephonyMessages.consultationId),
      )
      .leftJoin(
        consultationRequests,
        eq(consultationRequests.id, telephonyMessages.consultationRequestId),
      )
      .leftJoin(
        legalFriendsCaseLinks,
        eq(legalFriendsCaseLinks.consultationId, telephonyMessages.consultationId),
      )
      .orderBy(desc(telephonyMessages.requestedAt))
      .limit(500);

    const incoming = await db
      .select({
        id: telephonyInboundMessages.id,
        matchedOutboundMessageId:
          telephonyInboundMessages.matchedOutboundMessageId,
        targetSource: telephonyInboundMessages.targetSource,
        consultationId: telephonyInboundMessages.consultationId,
        directoryClientIdx: telephonyInboundMessages.directoryClientIdx,
        directoryCaseIdx: telephonyInboundMessages.directoryCaseIdx,
        matchStrategy: telephonyInboundMessages.matchStrategy,
        legalFriendsCaseIdx: legalFriendsCaseLinks.caseIdx,
        consultationReceiptCode: consultations.publicReceiptCode,
        consultationAnonymousLabel: consultations.anonymousLabel,
        consultationNameCiphertext: consultations.preferredNameCiphertext,
        consultationNameNonce: consultations.preferredNameNonce,
        consultationNameKeyVersion: consultations.preferredNameKeyVersion,
        directoryClientNameCiphertext:
          telephonyMessageDirectoryTargets.clientNameCiphertext,
        directoryClientNameNonce:
          telephonyMessageDirectoryTargets.clientNameNonce,
        directoryClientNameKeyVersion:
          telephonyMessageDirectoryTargets.clientNameKeyVersion,
        remotePhoneCiphertext: telephonyInboundMessages.remotePhoneCiphertext,
        remotePhoneNonce: telephonyInboundMessages.remotePhoneNonce,
        remotePhoneKeyVersion: telephonyInboundMessages.remotePhoneKeyVersion,
        bodyCiphertext: telephonyInboundMessages.bodyCiphertext,
        bodyNonce: telephonyInboundMessages.bodyNonce,
        bodyKeyVersion: telephonyInboundMessages.bodyKeyVersion,
        bodyByteLength: telephonyInboundMessages.bodyByteLength,
        messageKind: telephonyInboundMessages.messageKind,
        receivedAt: telephonyInboundMessages.receivedAt,
        endpointId: telephonyEndpoints.id,
        endpointLabel: telephonyEndpoints.label,
        endpointLineNumber: telephonyEndpoints.lineNumber,
        endpointPublicNumber: telephonyEndpoints.publicNumber,
        endpointExtension: telephonyEndpoints.extension,
      })
      .from(telephonyInboundMessages)
      .innerJoin(
        telephonyEndpoints,
        eq(telephonyEndpoints.id, telephonyInboundMessages.endpointId),
      )
      .leftJoin(
        telephonyMessageDirectoryTargets,
        eq(
          telephonyMessageDirectoryTargets.telephonyMessageId,
          telephonyInboundMessages.matchedOutboundMessageId,
        ),
      )
      .leftJoin(
        consultations,
        eq(consultations.id, telephonyInboundMessages.consultationId),
      )
      .leftJoin(
        legalFriendsCaseLinks,
        eq(legalFriendsCaseLinks.consultationId, telephonyInboundMessages.consultationId),
      )
      .orderBy(desc(telephonyInboundMessages.receivedAt))
      .limit(500);

    const mailboxes = await db
      .select({
        id: telephonyEndpoints.id,
        label: telephonyEndpoints.label,
        lineNumber: telephonyEndpoints.lineNumber,
        publicNumber: telephonyEndpoints.publicNumber,
        extension: telephonyEndpoints.extension,
        isActive: telephonyEndpoints.isActive,
        credentialEndpointId: telephonyEndpointCredentials.endpointId,
        lastSyncedAt: telephonyMessageMailboxStates.lastSyncedAt,
        lastFailedAt: telephonyMessageMailboxStates.lastFailedAt,
        lastErrorCode: telephonyMessageMailboxStates.lastErrorCode,
      })
      .from(telephonyEndpoints)
      .leftJoin(
        telephonyEndpointCredentials,
        eq(telephonyEndpointCredentials.endpointId, telephonyEndpoints.id),
      )
      .leftJoin(
        telephonyMessageMailboxStates,
        eq(telephonyMessageMailboxStates.endpointId, telephonyEndpoints.id),
      )
      .where(
        and(
          eq(telephonyEndpoints.provider, "centrex"),
          eq(telephonyEndpoints.endpointType, "representative"),
        ),
      )
      .orderBy(telephonyEndpoints.publicNumber, telephonyEndpoints.lineNumber);
    return { outgoing, incoming, mailboxes };
  }

  function outgoingThreadIdentity(
    row: Awaited<ReturnType<typeof loadMessageHubRows>>["outgoing"][number],
  ): MessageThreadIdentity | null {
    if (
      row.targetSource === "legal_friends_directory" &&
      row.directoryCaseIdx &&
      row.directoryClientIdx
    ) {
      const customerName = decryptedOptional(
        {
          ciphertext: row.directoryClientNameCiphertext,
          nonce: row.directoryClientNameNonce,
          keyVersion: row.directoryClientNameKeyVersion,
        },
        `telephony_message_directory_targets/${row.id}/client_name`,
      );
      const phone = decryptedOptional(
        {
          ciphertext: row.directoryPhoneCiphertext,
          nonce: row.directoryPhoneNonce,
          keyVersion: row.directoryPhoneKeyVersion,
        },
        `telephony_message_directory_targets/${row.id}/phone`,
      );
      return {
        key: `case:${row.directoryCaseIdx}`,
        caseIdx: String(row.directoryCaseIdx),
        clientIdx: row.directoryClientIdx,
        consultationId: null,
        customerName: customerName ?? "리걸프렌즈 고객",
        phone: phone ?? "번호 미확인",
      };
    }
    if (!row.consultationId) return null;
    const customerName =
      decryptedOptional(
        {
          ciphertext: row.consultationNameCiphertext,
          nonce: row.consultationNameNonce,
          keyVersion: row.consultationNameKeyVersion,
        },
        `consultations.preferred_name:${row.consultationId}`,
      ) ?? row.consultationAnonymousLabel ?? "상담 고객";
    const phone = row.consultationRequestId
      ? decryptedOptional(
          {
            ciphertext: row.consultationPhoneCiphertext,
            nonce: row.consultationPhoneNonce,
            keyVersion: row.consultationPhoneKeyVersion,
          },
          `consultation_requests.phone:${row.consultationRequestId}`,
        )
      : null;
    return {
      key: row.legalFriendsCaseIdx
        ? `case:${row.legalFriendsCaseIdx}`
        : `consultation:${row.consultationId}`,
      caseIdx: row.legalFriendsCaseIdx ?? null,
      clientIdx: null,
      consultationId: row.consultationId,
      customerName,
      phone: phone ?? "번호 미확인",
      receiptCode: row.consultationReceiptCode,
    };
  }

  function incomingThreadIdentity(
    row: Awaited<ReturnType<typeof loadMessageHubRows>>["incoming"][number],
  ): MessageThreadIdentity {
    const phone = protection.decrypt(
      {
        ciphertext: row.remotePhoneCiphertext,
        nonce: row.remotePhoneNonce,
        keyVersion: row.remotePhoneKeyVersion,
      },
      `telephony_inbound_messages/${row.id}/remote_phone`,
    );
    if (
      row.targetSource === "legal_friends_directory" &&
      row.directoryCaseIdx &&
      row.directoryClientIdx &&
      row.matchedOutboundMessageId
    ) {
      const customerName = decryptedOptional(
        {
          ciphertext: row.directoryClientNameCiphertext,
          nonce: row.directoryClientNameNonce,
          keyVersion: row.directoryClientNameKeyVersion,
        },
        `telephony_message_directory_targets/${row.matchedOutboundMessageId}/client_name`,
      );
      return {
        key: `case:${row.directoryCaseIdx}`,
        caseIdx: String(row.directoryCaseIdx),
        clientIdx: row.directoryClientIdx,
        consultationId: null,
        customerName: customerName ?? "리걸프렌즈 고객",
        phone: messagePhoneDisplay(phone),
      };
    }
    if (row.targetSource === "consultation" && row.consultationId) {
      const customerName =
        decryptedOptional(
          {
            ciphertext: row.consultationNameCiphertext,
            nonce: row.consultationNameNonce,
            keyVersion: row.consultationNameKeyVersion,
          },
          `consultations.preferred_name:${row.consultationId}`,
        ) ?? row.consultationAnonymousLabel ?? "상담 고객";
      return {
        key: row.legalFriendsCaseIdx
          ? `case:${row.legalFriendsCaseIdx}`
          : `consultation:${row.consultationId}`,
        caseIdx: row.legalFriendsCaseIdx ?? null,
        clientIdx: null,
        consultationId: row.consultationId,
        customerName,
        phone: messagePhoneDisplay(phone),
        receiptCode: row.consultationReceiptCode,
      };
    }
    return {
      key: `unmatched:${row.id}`,
      caseIdx: null,
      clientIdx: null,
      consultationId: null,
      customerName: "고객 연결 확인 필요",
      phone: messagePhoneDisplay(phone),
    };
  }

  async function auditMessageView(input: {
    actor: StaffPrincipal;
    action: "telephony.message_hub.viewed" | "telephony.message_thread.viewed";
    targetType: "telephony_message_hub" | "telephony_message_thread";
    targetId: string;
    metadata: Record<string, unknown>;
  }) {
    const viewedAt = now();
    const recentCutoff = new Date(viewedAt.getTime() - 15 * 60_000);
    const [recent] = await db
      .select({ id: staffAuditLogs.id })
      .from(staffAuditLogs)
      .where(
        and(
          eq(staffAuditLogs.actorUserId, input.actor.id),
          eq(staffAuditLogs.action, input.action),
          eq(staffAuditLogs.targetType, input.targetType),
          eq(staffAuditLogs.targetId, input.targetId),
          gte(staffAuditLogs.occurredAt, recentCutoff),
        ),
      )
      .limit(1);
    if (recent) return;
    await db.insert(staffAuditLogs).values({
      id: createEventId(),
      actorUserId: input.actor.id,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
      occurredAt: viewedAt,
      createdAt: viewedAt,
    });
  }

  async function getMessageHub(actor: StaffPrincipal) {
    const { outgoing, incoming, mailboxes } = await loadMessageHubRows();
    type ThreadSummary = MessageThreadIdentity & {
      messageCount: number;
      lastDirection: "outbound" | "inbound";
      lastMessageKind: "sms" | "lms" | "mms";
      lastMessagePreview: string;
      lastMessageAt: string;
      needsConnection: boolean;
    };
    const threads = new Map<string, ThreadSummary>();
    const add = (
      identity: MessageThreadIdentity,
      message: {
        direction: "outbound" | "inbound";
        kind: "sms" | "lms" | "mms";
        body: string;
        occurredAt: Date;
        needsConnection: boolean;
      },
    ) => {
      const current = threads.get(identity.key);
      const lastMessageAt = message.occurredAt.toISOString();
      if (!current) {
        threads.set(identity.key, {
          ...identity,
          messageCount: 1,
          lastDirection: message.direction,
          lastMessageKind: message.kind,
          lastMessagePreview: message.body.slice(0, 90),
          lastMessageAt,
          needsConnection: message.needsConnection,
        });
        return;
      }
      current.messageCount += 1;
      current.needsConnection ||= message.needsConnection;
      if (lastMessageAt > current.lastMessageAt) {
        Object.assign(current, {
          ...identity,
          lastDirection: message.direction,
          lastMessageKind: message.kind,
          lastMessagePreview: message.body.slice(0, 90),
          lastMessageAt,
        });
      }
    };
    for (const row of outgoing) {
      const identity = outgoingThreadIdentity(row);
      if (!identity) continue;
      add(identity, {
        direction: "outbound",
        kind: row.messageKind,
        body: protection.decrypt(
          {
            ciphertext: row.bodyCiphertext,
            nonce: row.bodyNonce,
            keyVersion: row.bodyKeyVersion,
          },
          `telephony_messages/${row.id}/body`,
        ),
        occurredAt: row.requestedAt,
        needsConnection: false,
      });
    }
    for (const row of incoming) {
      add(incomingThreadIdentity(row), {
        direction: "inbound",
        kind: row.messageKind,
        body: protection.decrypt(
          {
            ciphertext: row.bodyCiphertext,
            nonce: row.bodyNonce,
            keyVersion: row.bodyKeyVersion,
          },
          `telephony_inbound_messages/${row.id}/body`,
        ),
        occurredAt: row.receivedAt,
        needsConnection: row.matchStrategy === "unmatched",
      });
    }
    const items = [...threads.values()].sort((left, right) =>
      right.lastMessageAt.localeCompare(left.lastMessageAt),
    );
    await auditMessageView({
      actor,
      action: "telephony.message_hub.viewed",
      targetType: "telephony_message_hub",
      targetId: actor.id,
      metadata: {
        threadCount: items.length,
        unmatchedCount: items.filter((item) => item.needsConnection).length,
      },
    });
    return {
      items,
      mailboxes: mailboxes.map((mailbox) => ({
        id: mailbox.id,
        label: mailbox.label,
        lineNumber: mailbox.lineNumber,
        publicNumber: mailbox.publicNumber,
        extension: mailbox.extension,
        isActive: mailbox.isActive,
        credentialConfigured: Boolean(mailbox.credentialEndpointId),
        lastSyncedAt: mailbox.lastSyncedAt?.toISOString() ?? null,
        lastFailedAt: mailbox.lastFailedAt?.toISOString() ?? null,
        lastErrorCode: mailbox.lastErrorCode,
      })),
    };
  }

  async function getMessageThread(threadKey: string, actor: StaffPrincipal) {
    if (
      !/^case:[1-9][0-9]{0,99}$/.test(threadKey) &&
      !/^consultation:[0-9a-f-]{36}$/i.test(threadKey) &&
      !/^unmatched:[0-9a-f-]{36}$/i.test(threadKey)
    ) {
      throw new TelephonyCallError(
        "message_thread_not_found",
        "문자 대화를 찾을 수 없습니다.",
      );
    }
    const { outgoing, incoming } = await loadMessageHubRows();
    const timeline: Array<{
      id: string;
      direction: "outbound" | "inbound";
      provider: "centrex" | "solapi";
      messageKind: "sms" | "lms" | "mms";
      body: string;
      bodyByteLength: number;
      occurredAt: string;
      status: string;
      staffDisplayName: string | null;
      imageAttached: boolean;
      imageUrl: string | null;
      imageName: string | null;
      endpoint: {
        id: string;
        label: string;
        lineNumber: string;
        publicNumber: string | null;
        extension: string;
      };
      matchStrategy: string | null;
    }> = [];
    let target: MessageThreadIdentity | null = null;
    for (const row of outgoing) {
      const identity = outgoingThreadIdentity(row);
      if (!identity || identity.key !== threadKey) continue;
      target ??= identity;
      timeline.push({
        id: row.id,
        direction: "outbound",
        provider: row.provider,
        messageKind: row.messageKind,
        body: protection.decrypt(
          {
            ciphertext: row.bodyCiphertext,
            nonce: row.bodyNonce,
            keyVersion: row.bodyKeyVersion,
          },
          `telephony_messages/${row.id}/body`,
        ),
        bodyByteLength: row.bodyByteLength,
        occurredAt: row.requestedAt.toISOString(),
        status: row.commandStatus,
        staffDisplayName: row.staffDisplayName,
        imageAttached: Boolean(row.imageFileId),
        imageUrl: row.imageUrl,
        imageName: row.imageName,
        endpoint: {
          id: row.endpointId,
          label: row.endpointLabel,
          lineNumber: row.endpointLineNumber,
          publicNumber:
            row.provider === "solapi"
              ? solapiMmsSender ?? null
              : row.endpointPublicNumber,
          extension: row.endpointExtension,
        },
        matchStrategy: null,
      });
    }
    for (const row of incoming) {
      const identity = incomingThreadIdentity(row);
      if (identity.key !== threadKey) continue;
      target ??= identity;
      timeline.push({
        id: row.id,
        direction: "inbound",
        provider: "centrex",
        messageKind: row.messageKind,
        body: protection.decrypt(
          {
            ciphertext: row.bodyCiphertext,
            nonce: row.bodyNonce,
            keyVersion: row.bodyKeyVersion,
          },
          `telephony_inbound_messages/${row.id}/body`,
        ),
        bodyByteLength: row.bodyByteLength,
        occurredAt: row.receivedAt.toISOString(),
        status: "received",
        staffDisplayName: null,
        imageAttached: false,
        imageUrl: null,
        imageName: null,
        endpoint: {
          id: row.endpointId,
          label: row.endpointLabel,
          lineNumber: row.endpointLineNumber,
          publicNumber: row.endpointPublicNumber,
          extension: row.endpointExtension,
        },
        matchStrategy: row.matchStrategy,
      });
    }
    if (!target || timeline.length === 0) {
      throw new TelephonyCallError(
        "message_thread_not_found",
        "문자 대화를 찾을 수 없습니다.",
      );
    }
    timeline.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    await auditMessageView({
      actor,
      action: "telephony.message_thread.viewed",
      targetType: "telephony_message_thread",
      targetId: threadKey,
      metadata: {
        caseIdx: target.caseIdx,
        messageCount: timeline.length,
      },
    });
    return { thread: target, timeline };
  }

  async function listMessageTemplates(actor: StaffPrincipal) {
    const rows = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.ownerUserId, actor.id))
      .orderBy(asc(messageTemplates.name));
    return {
      items: rows.map(templateResponse),
    };
  }

  function templateResponse(template: typeof messageTemplates.$inferSelect) {
    return {
      id: template.id,
      name: template.name,
      body: template.body,
      bodyByteLength: template.bodyByteLength,
      image:
        template.imageFileId &&
        template.imageUrl &&
        template.imageOriginalName &&
        template.imageByteLength &&
        template.imageWidth &&
        template.imageHeight
          ? {
              url: template.imageUrl,
              originalName: template.imageOriginalName,
              byteLength: template.imageByteLength,
              width: template.imageWidth,
              height: template.imageHeight,
            }
          : null,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }

  async function uploadTemplateImage(image: NonNullable<MessageTemplateCreate["image"]>) {
    if (!solapiClient) {
      throw new TelephonyCallError(
        "mms_feature_disabled",
        "이미지 템플릿을 사용하려면 솔라피 MMS 연동을 먼저 설정해야 합니다.",
      );
    }
    let inspected: ReturnType<typeof inspectMmsJpeg>;
    try {
      inspected = inspectMmsJpeg(image.fileBase64);
    } catch {
      throw new TelephonyCallError(
        "message_image_invalid",
        "이미지는 200KB 이하 JPG이고 1500×1440px 이하여야 합니다.",
      );
    }
    try {
      const uploaded = await solapiClient.uploadMmsImage({
        fileBase64: image.fileBase64,
        name: image.originalName,
      });
      return {
        imageFileId: uploaded.fileId,
        imageUrl: uploaded.url,
        imageOriginalName: image.originalName,
        imageByteLength: inspected.bytes,
        imageWidth: inspected.width,
        imageHeight: inspected.height,
      };
    } catch (error) {
      throw new TelephonyCallError(
        error instanceof SolapiDeliveryError && error.code === "provider_rejected"
          ? "message_image_invalid"
          : "message_image_upload_failed",
        error instanceof Error
          ? error.message
          : "이미지를 업로드하지 못했습니다.",
      );
    }
  }

  async function createMessageTemplate(
    input: MessageTemplateCreate,
    actor: StaffPrincipal,
  ) {
    const createdAt = now();
    const [conflict] = await db
      .select({ id: messageTemplates.id })
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.ownerUserId, actor.id),
          sql`lower(${messageTemplates.name}) = lower(${input.name})`,
        ),
      )
      .limit(1);
    if (conflict) {
      throw new TelephonyCallError(
        "message_template_name_conflict",
        "내 템플릿에 같은 이름이 이미 있습니다.",
      );
    }
    const imageValues = input.image
      ? await uploadTemplateImage(input.image)
      : {};
    const [created] = await db
      .insert(messageTemplates)
      .values({
        id: createEventId(),
        ownerUserId: actor.id,
        name: input.name,
        body: input.body,
        bodyByteLength: centrexMessageByteLength(input.body),
        ...imageValues,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      throw new TelephonyCallError(
        "message_template_name_conflict",
        "내 템플릿에 같은 이름이 이미 있습니다.",
      );
    }
    await db.insert(staffAuditLogs).values({
      id: createEventId(),
      actorUserId: actor.id,
      action: "telephony.message_template.created",
      targetType: "message_template",
      targetId: created.id,
      metadata: {
        bodyByteLength: created.bodyByteLength,
      },
      occurredAt: createdAt,
      createdAt,
    });
    return templateResponse(created);
  }

  async function updateMessageTemplate(
    templateId: string,
    input: MessageTemplateUpdate,
    actor: StaffPrincipal,
  ) {
    const updatedAt = now();
    return db.transaction(async (tx) => {
      const [template] = await tx
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.id, templateId))
        .limit(1)
        .for("update");
      if (!template) {
        throw new TelephonyCallError(
          "message_template_not_found",
          "문자 템플릿을 찾을 수 없습니다.",
        );
      }
      if (template.ownerUserId !== actor.id) {
        throw new TelephonyCallError(
          "message_template_owned_by_other_staff",
          "다른 직원의 개인 템플릿은 수정할 수 없습니다.",
        );
      }
      const [conflict] = await tx
        .select({ id: messageTemplates.id })
        .from(messageTemplates)
        .where(
          and(
            ne(messageTemplates.id, templateId),
            eq(messageTemplates.ownerUserId, actor.id),
            sql`lower(${messageTemplates.name}) = lower(${input.name})`,
          ),
        )
        .limit(1);
      if (conflict) {
        throw new TelephonyCallError(
          "message_template_name_conflict",
          "내 템플릿에 같은 이름이 이미 있습니다.",
        );
      }
      const imageValues =
        input.image === undefined
          ? {}
          : input.image === null
            ? {
                imageFileId: null,
                imageUrl: null,
                imageOriginalName: null,
                imageByteLength: null,
                imageWidth: null,
                imageHeight: null,
              }
            : await uploadTemplateImage(input.image);
      const [updated] = await tx
        .update(messageTemplates)
        .set({
          name: input.name,
          body: input.body,
          bodyByteLength: centrexMessageByteLength(input.body),
          ...imageValues,
          updatedByUserId: actor.id,
          updatedAt,
        })
        .where(eq(messageTemplates.id, templateId))
        .returning();
      if (!updated) throw new Error("message_template_not_updated");
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.message_template.updated",
        targetType: "message_template",
        targetId: templateId,
        metadata: {
          bodyByteLength: updated.bodyByteLength,
        },
        occurredAt: updatedAt,
        createdAt: updatedAt,
      });
      return templateResponse(updated);
    });
  }

  async function deleteMessageTemplate(
    templateId: string,
    actor: StaffPrincipal,
  ) {
    const deletedAt = now();
    return db.transaction(async (tx) => {
      const [template] = await tx
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.id, templateId))
        .limit(1)
        .for("update");
      if (!template) {
        throw new TelephonyCallError(
          "message_template_not_found",
          "문자 템플릿을 찾을 수 없습니다.",
        );
      }
      if (template.ownerUserId !== actor.id) {
        throw new TelephonyCallError(
          "message_template_owned_by_other_staff",
          "다른 직원의 개인 템플릿은 삭제할 수 없습니다.",
        );
      }
      const [deleted] = await tx
        .delete(messageTemplates)
        .where(
          and(
            eq(messageTemplates.id, templateId),
            eq(messageTemplates.ownerUserId, actor.id),
          ),
        )
        .returning({ id: messageTemplates.id });
      if (!deleted) throw new Error("message_template_not_deleted");
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.message_template.deleted",
        targetType: "message_template",
        targetId: templateId,
        metadata: {
          bodyByteLength: template.bodyByteLength,
          hadImage: template.imageFileId !== null,
        },
        occurredAt: deletedAt,
        createdAt: deletedAt,
      });
      return { id: deleted.id, deleted: true as const };
    });
  }

  async function requestMessage(
    consultationId: string,
    input: TelephonyMessageSend,
    actor: StaffPrincipal,
  ) {
    if (!dispatchEnabled) {
      throw new TelephonyCallError(
        "feature_disabled",
        "센트릭스 문자 발송이 아직 활성화되지 않았습니다.",
      );
    }
    const textKind = centrexMessageKind(input.body);
    if (textKind === "too_long") {
      throw new TelephonyCallError(
        "message_body_invalid",
        "문자 내용은 센트릭스 LMS 기준 720바이트 이하여야 합니다.",
      );
    }
    const requestedAt = now();
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(telephonyMessages)
        .where(eq(telephonyMessages.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) {
        if (
          existing.consultationId !== consultationId ||
          existing.staffUserId !== actor.id
        ) {
          throw new TelephonyCallError(
            "message_idempotency_conflict",
            "문자 발송 재시도 식별자가 다른 요청과 충돌했습니다.",
          );
        }
        return { ...messageResponse(existing), replayed: true };
      }

      const [consultation] = await tx
        .select({ id: consultations.id })
        .from(consultations)
        .where(eq(consultations.id, consultationId))
        .limit(1)
        .for("update");
      if (!consultation) {
        throw new TelephonyCallError(
          "consultation_not_found",
          "상담을 찾을 수 없습니다.",
        );
      }
      const [assignment] = await tx
        .select({ assigneeUserId: consultationAssignments.assigneeUserId })
        .from(consultationAssignments)
        .where(eq(consultationAssignments.consultationId, consultationId))
        .limit(1);
      if (!assignment) {
        throw new TelephonyCallError(
          "consultation_not_assigned",
          "상담하기로 담당자를 먼저 지정해 주세요.",
        );
      }
      if (assignment.assigneeUserId !== actor.id) {
        throw new TelephonyCallError(
          "consultation_assigned_to_other_staff",
          "현재 담당자만 이 상담 고객에게 문자를 보낼 수 있습니다.",
        );
      }
      const [request] = await tx
        .select({
          id: consultationRequests.id,
          phoneFingerprint: consultationRequests.phoneFingerprint,
        })
        .from(consultationRequests)
        .where(
          and(
            eq(consultationRequests.consultationId, consultationId),
            eq(consultationRequests.contactChannel, "phone"),
            isNotNull(consultationRequests.phoneCiphertext),
            isNotNull(consultationRequests.phoneNonce),
            isNotNull(consultationRequests.phoneKeyVersion),
            isNotNull(consultationRequests.phoneFingerprint),
          ),
        )
        .orderBy(desc(consultationRequests.submittedAt))
        .limit(1);
      if (!request?.phoneFingerprint) {
        throw new TelephonyCallError(
          "consultation_phone_not_collected",
          "전화번호가 수집된 상담 고객에게만 문자를 보낼 수 있습니다.",
        );
      }
      const [endpoint] = await tx
        .select({ id: telephonyEndpoints.id })
        .from(staffTelephonyBindings)
        .innerJoin(
          telephonyEndpoints,
          eq(telephonyEndpoints.id, staffTelephonyBindings.endpointId),
        )
        .where(
          and(
            eq(staffTelephonyBindings.staffUserId, actor.id),
            eq(staffTelephonyBindings.isActive, true),
            eq(staffTelephonyBindings.isPrimary, true),
            eq(telephonyEndpoints.provider, "centrex"),
            eq(telephonyEndpoints.isActive, true),
          ),
        )
        .limit(1);
      if (!endpoint) {
        throw new TelephonyCallError(
          "centrex_endpoint_not_linked",
          "직원 계정에 활성 센트릭스 회선이 연결되지 않았습니다.",
        );
      }

      let templateName: string | null = null;
      let imageFileId: string | null = null;
      let imageUrl: string | null = null;
      let imageOriginalName: string | null = null;
      if (input.templateId) {
        const [template] = await tx
          .select({
            id: messageTemplates.id,
            name: messageTemplates.name,
            ownerUserId: messageTemplates.ownerUserId,
            imageFileId: messageTemplates.imageFileId,
            imageUrl: messageTemplates.imageUrl,
            imageOriginalName: messageTemplates.imageOriginalName,
          })
          .from(messageTemplates)
          .where(eq(messageTemplates.id, input.templateId))
          .limit(1)
          .for("key share");
        if (!template) {
          throw new TelephonyCallError(
            "message_template_not_found",
            "선택한 문자 템플릿을 찾을 수 없습니다.",
          );
        }
        if (template.ownerUserId !== actor.id) {
          throw new TelephonyCallError(
            "message_template_owned_by_other_staff",
            "다른 직원의 개인 템플릿은 사용할 수 없습니다.",
          );
        }
        templateName = template.name;
        imageFileId = template.imageFileId;
        imageUrl = template.imageUrl;
        imageOriginalName = template.imageOriginalName;
      }

      const provider = imageFileId ? ("solapi" as const) : ("centrex" as const);
      const messageKind = imageFileId ? ("mms" as const) : textKind;
      if (provider === "solapi" && (!solapiClient || !solapiMmsSender)) {
        throw new TelephonyCallError(
          "mms_feature_disabled",
          "이미지 문자를 보내려면 솔라피 MMS 발신번호 설정이 필요합니다.",
        );
      }

      const messageId = createTelephonyMessageId();
      const eventId = createEventId();
      const encryptedBody = protection.encrypt(
        input.body,
        `telephony_messages/${messageId}/body`,
      );
      const bodyByteLength = centrexMessageByteLength(input.body);
      const event: PlatformEvent = {
        eventId,
        eventType: "telephony.message.requested",
        eventVersion: 1,
        occurredAt: requestedAt.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        data:
          provider === "solapi"
            ? {
                messageId,
                targetSource: "consultation",
                consultationId,
                requestId: request.id,
                endpointId: endpoint.id,
                staffUserId: actor.id,
                provider: "solapi",
                channel: "mms",
                command: "send-many",
                contentRef: `telephony_messages/${messageId}/body`,
              }
            : {
                messageId,
                targetSource: "consultation",
                consultationId,
                requestId: request.id,
                endpointId: endpoint.id,
                staffUserId: actor.id,
                provider: "centrex",
                channel: "sms",
                command: "smssend",
                contentRef: `telephony_messages/${messageId}/body`,
              },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(
        eventRow(event, messageId, "telephony_message"),
      );
      const [message] = await tx
        .insert(telephonyMessages)
        .values({
          id: messageId,
          provider,
          endpointId: endpoint.id,
          staffUserId: actor.id,
          targetSource: "consultation",
          consultationId,
          consultationRequestId: request.id,
          templateId: input.templateId,
          templateNameSnapshot: templateName,
          imageFileIdSnapshot: imageFileId,
          imageUrlSnapshot: imageUrl,
          imageOriginalNameSnapshot: imageOriginalName,
          outboxEventId: eventId,
          idempotencyKey: input.idempotencyKey,
          remotePhoneFingerprint: request.phoneFingerprint,
          bodyCiphertext: encryptedBody.ciphertext,
          bodyNonce: encryptedBody.nonce,
          bodyKeyVersion: encryptedBody.keyVersion,
          bodyFingerprint: protection.fingerprint(input.body),
          messageKind,
          bodyByteLength,
          commandStatus: "queued",
          requestedAt,
          createdAt: requestedAt,
          updatedAt: requestedAt,
        })
        .returning();
      if (!message) throw new Error("telephony_message_not_created");
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.message.requested",
        targetType: "telephony_message",
        targetId: messageId,
        metadata: {
          consultationId,
          endpointId: endpoint.id,
          templateId: input.templateId,
          messageKind,
          bodyByteLength,
        },
        occurredAt: requestedAt,
        createdAt: requestedAt,
      });
      return { ...messageResponse(message), replayed: false };
    });
  }

  async function requestDirectoryMessage(
    targetInput: { clientIdx: number; caseIdx: number },
    input: TelephonyMessageSend,
    actor: StaffPrincipal,
  ) {
    if (!dispatchEnabled) {
      throw new TelephonyCallError(
        "feature_disabled",
        "센트릭스 문자 발송이 아직 활성화되지 않았습니다.",
      );
    }
    const textKind = centrexMessageKind(input.body);
    if (textKind === "too_long") {
      throw new TelephonyCallError(
        "message_body_invalid",
        "문자 내용은 센트릭스 LMS 기준 720바이트 이하여야 합니다.",
      );
    }
    const requestedAt = now();
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(telephonyMessages)
        .where(eq(telephonyMessages.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) {
        const [existingTarget] = await tx
          .select({
            clientIdx: telephonyMessageDirectoryTargets.clientIdx,
            caseIdx: telephonyMessageDirectoryTargets.caseIdx,
          })
          .from(telephonyMessageDirectoryTargets)
          .where(
            eq(
              telephonyMessageDirectoryTargets.telephonyMessageId,
              existing.id,
            ),
          )
          .limit(1);
        if (
          existing.targetSource !== "legal_friends_directory" ||
          existing.staffUserId !== actor.id ||
          existingTarget?.clientIdx !== targetInput.clientIdx ||
          existingTarget?.caseIdx !== targetInput.caseIdx
        ) {
          throw new TelephonyCallError(
            "message_idempotency_conflict",
            "문자 발송 재시도 식별자가 다른 요청과 충돌했습니다.",
          );
        }
        return { ...messageResponse(existing), replayed: true };
      }

      const targetResult = await tx.execute(
        sql<LegalFriendsDirectoryCallTargetRow>`SELECT * FROM public.resolve_legalfriends_directory_call_target(${targetInput.clientIdx}, ${targetInput.caseIdx})`,
      );
      const [target] = targetResult.rows as LegalFriendsDirectoryCallTargetRow[];
      if (!target) {
        throw new TelephonyCallError(
          "directory_target_not_found",
          "삭제되었거나 현재 조회할 수 없는 리걸프렌즈 고객입니다.",
        );
      }
      if (!/^[0-9]{9,15}$/.test(target.phone)) {
        throw new TelephonyCallError(
          "directory_phone_not_callable",
          "문자를 보낼 수 있는 전화번호가 등록되어 있지 않습니다.",
        );
      }

      const [endpoint] = await tx
        .select({ id: telephonyEndpoints.id })
        .from(staffTelephonyBindings)
        .innerJoin(
          telephonyEndpoints,
          eq(telephonyEndpoints.id, staffTelephonyBindings.endpointId),
        )
        .where(
          and(
            eq(staffTelephonyBindings.staffUserId, actor.id),
            eq(staffTelephonyBindings.isActive, true),
            eq(staffTelephonyBindings.isPrimary, true),
            eq(telephonyEndpoints.provider, "centrex"),
            eq(telephonyEndpoints.isActive, true),
          ),
        )
        .limit(1);
      if (!endpoint) {
        throw new TelephonyCallError(
          "centrex_endpoint_not_linked",
          "직원 계정에 활성 센트릭스 회선이 연결되지 않았습니다.",
        );
      }

      let templateName: string | null = null;
      let imageFileId: string | null = null;
      let imageUrl: string | null = null;
      let imageOriginalName: string | null = null;
      if (input.templateId) {
        const [template] = await tx
          .select({
            id: messageTemplates.id,
            name: messageTemplates.name,
            ownerUserId: messageTemplates.ownerUserId,
            imageFileId: messageTemplates.imageFileId,
            imageUrl: messageTemplates.imageUrl,
            imageOriginalName: messageTemplates.imageOriginalName,
          })
          .from(messageTemplates)
          .where(eq(messageTemplates.id, input.templateId))
          .limit(1)
          .for("key share");
        if (!template) {
          throw new TelephonyCallError(
            "message_template_not_found",
            "선택한 문자 템플릿을 찾을 수 없습니다.",
          );
        }
        if (template.ownerUserId !== actor.id) {
          throw new TelephonyCallError(
            "message_template_owned_by_other_staff",
            "다른 직원의 개인 템플릿은 사용할 수 없습니다.",
          );
        }
        templateName = template.name;
        imageFileId = template.imageFileId;
        imageUrl = template.imageUrl;
        imageOriginalName = template.imageOriginalName;
      }

      const provider = imageFileId ? ("solapi" as const) : ("centrex" as const);
      const messageKind = imageFileId ? ("mms" as const) : textKind;
      if (provider === "solapi" && (!solapiClient || !solapiMmsSender)) {
        throw new TelephonyCallError(
          "mms_feature_disabled",
          "이미지 문자를 보내려면 솔라피 MMS 발신번호 설정이 필요합니다.",
        );
      }

      const messageId = createTelephonyMessageId();
      const eventId = createEventId();
      const encryptedBody = protection.encrypt(
        input.body,
        `telephony_messages/${messageId}/body`,
      );
      const encryptedPhone = protection.encrypt(
        target.phone,
        `telephony_message_directory_targets/${messageId}/phone`,
      );
      const encryptedClientName = protection.encrypt(
        target.client_name,
        `telephony_message_directory_targets/${messageId}/client_name`,
      );
      const phoneFingerprint = protection.fingerprint(target.phone);
      const bodyByteLength = centrexMessageByteLength(input.body);
      const event: PlatformEvent = {
        eventId,
        eventType: "telephony.message.requested",
        eventVersion: 1,
        occurredAt: requestedAt.toISOString(),
        producer: "lawand.gateway",
        correlationId: messageId,
        data:
          provider === "solapi"
            ? {
                messageId,
                targetSource: "legal_friends_directory",
                directoryClientIdx: targetInput.clientIdx,
                directoryCaseIdx: targetInput.caseIdx,
                endpointId: endpoint.id,
                staffUserId: actor.id,
                provider: "solapi",
                channel: "mms",
                command: "send-many",
                contentRef: `telephony_messages/${messageId}/body`,
              }
            : {
                messageId,
                targetSource: "legal_friends_directory",
                directoryClientIdx: targetInput.clientIdx,
                directoryCaseIdx: targetInput.caseIdx,
                endpointId: endpoint.id,
                staffUserId: actor.id,
                provider: "centrex",
                channel: "sms",
                command: "smssend",
                contentRef: `telephony_messages/${messageId}/body`,
              },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(
        eventRow(event, messageId, "telephony_message"),
      );
      const [message] = await tx
        .insert(telephonyMessages)
        .values({
          id: messageId,
          provider,
          endpointId: endpoint.id,
          staffUserId: actor.id,
          targetSource: "legal_friends_directory",
          consultationId: null,
          consultationRequestId: null,
          templateId: input.templateId,
          templateNameSnapshot: templateName,
          imageFileIdSnapshot: imageFileId,
          imageUrlSnapshot: imageUrl,
          imageOriginalNameSnapshot: imageOriginalName,
          outboxEventId: eventId,
          idempotencyKey: input.idempotencyKey,
          remotePhoneFingerprint: phoneFingerprint,
          bodyCiphertext: encryptedBody.ciphertext,
          bodyNonce: encryptedBody.nonce,
          bodyKeyVersion: encryptedBody.keyVersion,
          bodyFingerprint: protection.fingerprint(input.body),
          messageKind,
          bodyByteLength,
          commandStatus: "queued",
          requestedAt,
          createdAt: requestedAt,
          updatedAt: requestedAt,
        })
        .returning();
      if (!message) throw new Error("telephony_message_not_created");
      await tx.insert(telephonyMessageDirectoryTargets).values({
        telephonyMessageId: messageId,
        clientIdx: targetInput.clientIdx,
        caseIdx: targetInput.caseIdx,
        clientNameCiphertext: encryptedClientName.ciphertext,
        clientNameNonce: encryptedClientName.nonce,
        clientNameKeyVersion: encryptedClientName.keyVersion,
        phoneCiphertext: encryptedPhone.ciphertext,
        phoneNonce: encryptedPhone.nonce,
        phoneKeyVersion: encryptedPhone.keyVersion,
        createdAt: requestedAt,
      });
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.directory_message.requested",
        targetType: "legalfriends_directory_client",
        targetId: String(targetInput.clientIdx),
        metadata: {
          messageId,
          caseIdx: targetInput.caseIdx,
          endpointId: endpoint.id,
          templateId: input.templateId,
          messageKind,
          bodyByteLength,
        },
        occurredAt: requestedAt,
        createdAt: requestedAt,
      });
      return { ...messageResponse(message), replayed: false };
    });
  }

  async function getMessage(messageId: string, actor: StaffPrincipal) {
    const [message] = await db
      .select()
      .from(telephonyMessages)
      .where(eq(telephonyMessages.id, messageId))
      .limit(1);
    if (!message) {
      throw new TelephonyCallError(
        "message_not_found",
        "문자 발송 요청을 찾을 수 없습니다.",
      );
    }
    if (message.staffUserId !== actor.id) {
      throw new TelephonyCallError(
        "message_owned_by_other_staff",
        "문자를 보낸 담당자만 발송 결과를 확인할 수 있습니다.",
      );
    }
    return messageResponse(message);
  }

  async function requestClickToCall(
    consultationId: string,
    actor: StaffPrincipal,
  ) {
    if (!dispatchEnabled) {
      throw new TelephonyCallError(
        "feature_disabled",
        "센트릭스 클릭투콜이 아직 활성화되지 않았습니다.",
      );
    }
    const requestedAt = now();
    return db.transaction(async (tx) => {
      const [consultation] = await tx
        .select({ id: consultations.id })
        .from(consultations)
        .where(eq(consultations.id, consultationId))
        .limit(1)
        .for("update");
      if (!consultation) {
        throw new TelephonyCallError(
          "consultation_not_found",
          "상담을 찾을 수 없습니다.",
        );
      }

      const [assignment] = await tx
        .select({ assigneeUserId: consultationAssignments.assigneeUserId })
        .from(consultationAssignments)
        .where(eq(consultationAssignments.consultationId, consultationId))
        .limit(1);
      if (!assignment) {
        throw new TelephonyCallError(
          "consultation_not_assigned",
          "상담하기로 담당자를 먼저 지정해 주세요.",
        );
      }
      if (assignment.assigneeUserId !== actor.id) {
        throw new TelephonyCallError(
          "consultation_assigned_to_other_staff",
          "현재 담당자만 이 상담의 클릭투콜을 실행할 수 있습니다.",
        );
      }

      const [request] = await tx
        .select({
          id: consultationRequests.id,
          phoneFingerprint: consultationRequests.phoneFingerprint,
        })
        .from(consultationRequests)
        .where(
          and(
            eq(consultationRequests.consultationId, consultationId),
            eq(consultationRequests.contactChannel, "phone"),
            isNotNull(consultationRequests.phoneCiphertext),
            isNotNull(consultationRequests.phoneNonce),
            isNotNull(consultationRequests.phoneKeyVersion),
            isNotNull(consultationRequests.phoneFingerprint),
          ),
        )
        .orderBy(desc(consultationRequests.submittedAt))
        .limit(1);
      if (!request?.phoneFingerprint) {
        throw new TelephonyCallError(
          "consultation_phone_not_collected",
          "전화번호가 수집된 상담만 클릭투콜을 실행할 수 있습니다.",
        );
      }

      const [endpoint] = await tx
        .select({ id: telephonyEndpoints.id })
        .from(staffTelephonyBindings)
        .innerJoin(
          telephonyEndpoints,
          eq(telephonyEndpoints.id, staffTelephonyBindings.endpointId),
        )
        .where(
          and(
            eq(staffTelephonyBindings.staffUserId, actor.id),
            eq(staffTelephonyBindings.isActive, true),
            eq(staffTelephonyBindings.isPrimary, true),
            eq(telephonyEndpoints.provider, "centrex"),
            eq(telephonyEndpoints.isActive, true),
          ),
        )
        .limit(1);
      if (!endpoint) {
        throw new TelephonyCallError(
          "centrex_endpoint_not_linked",
          "직원 계정에 활성 센트릭스 회선이 연결되지 않았습니다.",
        );
      }

      const [recentCall] = await tx
        .select()
        .from(telephonyCalls)
        .where(
          and(
            eq(telephonyCalls.consultationId, consultationId),
            eq(telephonyCalls.staffUserId, actor.id),
            or(
              and(
                inArray(telephonyCalls.commandStatus, [
                  "queued",
                  "dispatching",
                ]),
                gte(
                  telephonyCalls.requestedAt,
                  new Date(
                    requestedAt.getTime() - DUPLICATE_COMMAND_WINDOW_MS,
                  ),
                ),
              ),
              and(
                eq(telephonyCalls.commandStatus, "succeeded"),
                isNull(telephonyCalls.reconciledAt),
              ),
            ),
          ),
        )
        .orderBy(desc(telephonyCalls.requestedAt))
        .limit(1);
      if (recentCall) {
        return { ...callResponse(recentCall), replayed: true };
      }

      const callId = createTelephonyCallId();
      const eventId = createEventId();
      const event: PlatformEvent = {
        eventId,
        eventType: "telephony.call.requested",
        eventVersion: 1,
        occurredAt: requestedAt.toISOString(),
        producer: "lawand.gateway",
        correlationId: consultationId,
        data: {
          callId,
          consultationId,
          requestId: request.id,
          endpointId: endpoint.id,
          staffUserId: actor.id,
          provider: "centrex",
          direction: "outbound",
          command: "clickdial",
        },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(eventRow(event, callId));
      const [call] = await tx
        .insert(telephonyCalls)
        .values({
          id: callId,
          provider: "centrex",
          direction: "outbound",
          endpointId: endpoint.id,
          staffUserId: actor.id,
          consultationId,
          consultationRequestId: request.id,
          outboxEventId: eventId,
          remotePhoneFingerprint: request.phoneFingerprint,
          commandStatus: "queued",
          outcome: "unknown",
          requestedAt,
          createdAt: requestedAt,
          updatedAt: requestedAt,
        })
        .returning();
      if (!call) throw new Error("telephony_call_not_created");
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.click_to_call.requested",
        targetType: "consultation",
        targetId: consultationId,
        metadata: {
          callId,
          endpointId: endpoint.id,
          provider: "centrex",
        },
        occurredAt: requestedAt,
        createdAt: requestedAt,
      });
      return { ...callResponse(call), replayed: false };
    });
  }

  async function requestDirectoryClickToCall(
    input: { clientIdx: number; caseIdx: number },
    actor: StaffPrincipal,
  ) {
    if (!dispatchEnabled) {
      throw new TelephonyCallError(
        "feature_disabled",
        "센트릭스 클릭투콜이 아직 활성화되지 않았습니다.",
      );
    }
    const requestedAt = now();
    return db.transaction(async (tx) => {
      const targetResult = await tx.execute(
        sql<LegalFriendsDirectoryCallTargetRow>`SELECT * FROM public.resolve_legalfriends_directory_call_target(${input.clientIdx}, ${input.caseIdx})`,
      );
      const [target] = targetResult.rows as LegalFriendsDirectoryCallTargetRow[];
      if (!target) {
        throw new TelephonyCallError(
          "directory_target_not_found",
          "삭제되었거나 현재 조회할 수 없는 리걸프렌즈 고객입니다.",
        );
      }
      if (!/^[0-9]{9,15}$/.test(target.phone)) {
        throw new TelephonyCallError(
          "directory_phone_not_callable",
          "센트릭스로 연결할 수 있는 전화번호가 등록되어 있지 않습니다.",
        );
      }

      const [endpoint] = await tx
        .select({ id: telephonyEndpoints.id })
        .from(staffTelephonyBindings)
        .innerJoin(
          telephonyEndpoints,
          eq(telephonyEndpoints.id, staffTelephonyBindings.endpointId),
        )
        .where(
          and(
            eq(staffTelephonyBindings.staffUserId, actor.id),
            eq(staffTelephonyBindings.isActive, true),
            eq(staffTelephonyBindings.isPrimary, true),
            eq(telephonyEndpoints.provider, "centrex"),
            eq(telephonyEndpoints.isActive, true),
          ),
        )
        .limit(1);
      if (!endpoint) {
        throw new TelephonyCallError(
          "centrex_endpoint_not_linked",
          "직원 계정에 활성 센트릭스 회선이 연결되지 않았습니다.",
        );
      }

      const phoneFingerprint = protection.fingerprint(target.phone);
      const [recentCall] = await tx
        .select()
        .from(telephonyCalls)
        .where(
          and(
            eq(telephonyCalls.targetSource, "legal_friends_directory"),
            eq(telephonyCalls.staffUserId, actor.id),
            eq(telephonyCalls.remotePhoneFingerprint, phoneFingerprint),
            or(
              and(
                inArray(telephonyCalls.commandStatus, ["queued", "dispatching"]),
                gte(
                  telephonyCalls.requestedAt,
                  new Date(requestedAt.getTime() - DUPLICATE_COMMAND_WINDOW_MS),
                ),
              ),
              and(
                eq(telephonyCalls.commandStatus, "succeeded"),
                isNull(telephonyCalls.reconciledAt),
              ),
            ),
          ),
        )
        .orderBy(desc(telephonyCalls.requestedAt))
        .limit(1);
      if (recentCall) {
        return { ...callResponse(recentCall), replayed: true };
      }

      const callId = createTelephonyCallId();
      const eventId = createEventId();
      const phoneEncrypted = protection.encrypt(
        target.phone,
        `telephony_call_directory_targets/${callId}/phone`,
      );
      const clientNameEncrypted = protection.encrypt(
        target.client_name,
        `telephony_call_directory_targets/${callId}/client_name`,
      );
      const event: PlatformEvent = {
        eventId,
        eventType: "telephony.call.requested",
        eventVersion: 1,
        occurredAt: requestedAt.toISOString(),
        producer: "lawand.gateway",
        correlationId: callId,
        data: {
          callId,
          targetSource: "legal_friends_directory",
          directoryClientIdx: input.clientIdx,
          directoryCaseIdx: input.caseIdx,
          endpointId: endpoint.id,
          staffUserId: actor.id,
          provider: "centrex",
          direction: "outbound",
          command: "clickdial",
        },
      };
      assertPlatformEvent(event);
      await tx.insert(outboxEvents).values(eventRow(event, callId));
      const [call] = await tx
        .insert(telephonyCalls)
        .values({
          id: callId,
          provider: "centrex",
          direction: "outbound",
          targetSource: "legal_friends_directory",
          endpointId: endpoint.id,
          staffUserId: actor.id,
          consultationId: null,
          consultationRequestId: null,
          outboxEventId: eventId,
          remotePhoneFingerprint: phoneFingerprint,
          commandStatus: "queued",
          outcome: "unknown",
          requestedAt,
          createdAt: requestedAt,
          updatedAt: requestedAt,
        })
        .returning();
      if (!call) throw new Error("telephony_call_not_created");
      await tx.insert(telephonyCallDirectoryTargets).values({
        telephonyCallId: callId,
        clientIdx: input.clientIdx,
        caseIdx: input.caseIdx,
        clientNameCiphertext: clientNameEncrypted.ciphertext,
        clientNameNonce: clientNameEncrypted.nonce,
        clientNameKeyVersion: clientNameEncrypted.keyVersion,
        phoneCiphertext: phoneEncrypted.ciphertext,
        phoneNonce: phoneEncrypted.nonce,
        phoneKeyVersion: phoneEncrypted.keyVersion,
        createdAt: requestedAt,
      });
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.directory_click_to_call.requested",
        targetType: "legalfriends_directory_client",
        targetId: String(input.clientIdx),
        metadata: {
          callId,
          caseIdx: input.caseIdx,
          endpointId: endpoint.id,
          provider: "centrex",
        },
        occurredAt: requestedAt,
        createdAt: requestedAt,
      });
      return { ...callResponse(call), replayed: false };
    });
  }

  async function getCall(callId: string, actor: StaffPrincipal) {
    const [call] = await db
      .select()
      .from(telephonyCalls)
      .where(eq(telephonyCalls.id, callId))
      .limit(1);
    if (!call) {
      throw new TelephonyCallError(
        "call_not_found",
        "통화 요청을 찾을 수 없습니다.",
      );
    }
    if (call.staffUserId !== actor.id) {
      throw new TelephonyCallError(
        "call_owned_by_other_staff",
        "발신을 실행한 담당자만 통화 결과를 확인할 수 있습니다.",
      );
    }
    return callResponse(call);
  }

  async function confirmDisposition(
    callId: string,
    disposition: TelephonyCallDisposition,
    actor: StaffPrincipal,
  ) {
    const confirmedAt = now();
    return db.transaction(async (tx) => {
      const [call] = await tx
        .select()
        .from(telephonyCalls)
        .where(eq(telephonyCalls.id, callId))
        .limit(1)
        .for("update");
      if (!call) {
        throw new TelephonyCallError(
          "call_not_found",
          "통화 요청을 찾을 수 없습니다.",
        );
      }
      if (call.staffUserId !== actor.id) {
        throw new TelephonyCallError(
          "call_owned_by_other_staff",
          "발신을 실행한 담당자만 통화 결과를 확정할 수 있습니다.",
        );
      }
      if (!call.reconciledAt) {
        throw new TelephonyCallError(
          "call_not_reconciled",
          "센트릭스 통화 종료 결과를 확인한 뒤 결과를 선택해 주세요.",
        );
      }
      const replayed = call.disposition === disposition;
      const [updated] = await tx
        .update(telephonyCalls)
        .set({
          disposition,
          dispositionConfirmedAt: confirmedAt,
          dispositionConfirmedByUserId: actor.id,
          updatedAt: confirmedAt,
        })
        .where(eq(telephonyCalls.id, call.id))
        .returning();
      if (!updated) throw new Error("telephony_disposition_not_updated");
      if (!replayed || !call.dispositionConfirmedAt) {
        await tx.insert(staffAuditLogs).values({
          id: createEventId(),
          actorUserId: actor.id,
          action: "telephony.call.disposition_confirmed",
          targetType: "telephony_call",
          targetId: call.id,
          metadata: {
            consultationId: call.consultationId,
            providerOutcome: call.outcome,
            previousDisposition: call.disposition,
            disposition,
          },
          occurredAt: confirmedAt,
          createdAt: confirmedAt,
        });
      }
      return { ...callResponse(updated), replayed };
    });
  }

  return {
    completePhoneDeskFollowUp,
    completeInboundAnswerCommand,
    confirmDisposition,
    createDirectoryConsultation,
    createStaffConsultation,
    createMessageTemplate,
    deleteMessageTemplate,
    getCall,
    getCallActivitySnapshot,
    getInboundCallSnapshot,
    getMessage,
    getMessageHub,
    getMessageThread,
    listMessageTemplates,
    getPhoneDeskCalls,
    getPhoneDeskCall,
    pollInboundAnswerCommand,
    requestClickToCall,
    requestDirectoryClickToCall,
    requestDirectoryMessage,
    requestInboundAnswer,
    searchLegalFriendsClients,
    requestMessage,
    resolvePhoneDeskCall,
    savePhoneDeskAftercare,
    updateMessageTemplate,
  };
}

export type TelephonyService = ReturnType<typeof createTelephonyService>;
