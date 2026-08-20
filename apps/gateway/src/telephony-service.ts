import { createHash } from "node:crypto";

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
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  assertPlatformEvent,
  centrexMessageByteLength,
  centrexMessageKind,
  classifyConsultationSubmission,
  createConsultationId,
  createConsultationRequestId,
  createEventId,
  createPublicReceiptCode,
  createTelephonyCallId,
  createTelephonyMessageId,
  CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
  DEDUPE_WINDOWS,
  formatConsultationCustomerName,
  type DedupeOutcome,
  type ExistingConsultationCandidate,
  type LegalFriendsDirectoryConsultationCreate,
  type ManualTelephonyMessageSend,
  type MessageTemplateCreate,
  type MessageTemplateUpdate,
  type MessageTemplateAutoSendTrigger,
  type PhoneDeskAftercareSave,
  type PhoneDeskCallResolution,
  type PhonebookContactSave,
  type TelephonyMessageSend,
  type TelephonyCallDisposition,
  type CentrexBridgeCommandResult,
  type PlatformEvent,
  renderMessageTemplate,
  type ResidenceRegion,
  type StaffConsultationCreate,
} from "@lawand/core";
import {
  consultationAssignments,
  consultationDirectorySources,
  consultationGroupEvents,
  consultationGroupMembers,
  consultationGroups,
  consultationRequests,
  consultationStatusHistory,
  consultations,
  legalFriendsCaseLinks,
  messageTemplates,
  outboxEvents,
  staffAuditLogs,
  staffExternalAccounts,
  staffMemberships,
  staffOrganizations,
  staffProfiles,
  staffRegions,
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
  telephonyInboundMessageNotifications,
  telephonyInboundMessages,
  telephonyMessageDirectoryTargets,
  telephonyMessageManualContacts,
  telephonyMessageMailboxStates,
  telephonyMessages,
  telephonyFollowUpTasks,
  telephonyPhonebookContacts,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { StaffPrincipal } from "./auth.js";
import type { DataProtection } from "./crypto.js";
import { createInboundCommandPollGate } from "./inbound-command-poll-gate.js";
import {
  linkedLegalFriendsCaseNamesQuery,
  linkedLegalFriendsDisplayName,
  phoneDirectoryCustomersQuery,
  summarizeLinkedLegalFriendsCaseNames,
  type LinkedLegalFriendsCaseNameRow,
} from "./phone-directory.js";
import {
  inspectMmsJpeg,
  SolapiDeliveryError,
  type SolapiClient,
} from "./solapi.js";
import { classifyTelephonyCallRegion } from "./telephony-call-region.js";
import {
  centrexMessageDeliveryRoute,
  DEFAULT_CENTREX_MESSAGE_SENDER_LINE,
  solapiMessageDeliveryRoute,
  type TelephonyMessageDeliveryRoute,
} from "./telephony-message-routing.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const DUPLICATE_COMMAND_WINDOW_MS = 30_000;
const INBOUND_RINGING_SNAPSHOT_WINDOW_MS = 3 * 60_000;
const INBOUND_CONNECTED_SNAPSHOT_WINDOW_MS = 12 * 60 * 60_000;
const INBOUND_ENDED_SNAPSHOT_WINDOW_MS = 20_000;
const INTERNAL_SINGLE_LEG_CONFIRMATION_WINDOW_MS = 3 * 60_000;
const MANUAL_FINAL_PARTICIPANT_DELAY_MS = 2 * 60_000;
const INBOUND_ANSWER_COMMAND_TTL_MS = 20_000;
const INBOUND_ANSWER_EVENT_MAX_DELIVERY_DELAY_MS = 15_000;
const INBOUND_ANSWER_DISPATCH_TIMEOUT_MS = 3 * 60_000;
const PHONE_DESK_DEFAULT_LIMIT = 20;
const PHONE_DESK_MAX_LIMIT = 100;
const PHONE_CUSTOMER_CACHE_TTL_MS = 15_000;
const PHONE_CUSTOMER_CACHE_MAX_ENTRIES = 500;
const MESSAGE_PAGE_DEFAULT_LIMIT = 50;
const MESSAGE_PAGE_MAX_LIMIT = 50;
const PHONE_DESK_TRANSFER_RELATION_TYPES = [
  "transfer_attempted",
  "transfer_completed",
  "transfer_returned",
  "transfer_unresolved",
] as const;
const callRootCurrentEndpoint = alias(
  telephonyEndpoints,
  "call_root_current_endpoint",
);
const callLegEndpoint = alias(telephonyEndpoints, "call_leg_endpoint");

type MessagePageCursor = {
  occurredAt: string;
  id: string;
  direction?: "outbound" | "inbound";
  unread?: boolean;
};

function encodeMessagePageCursor(cursor: MessagePageCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeMessagePageCursor(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<MessagePageCursor>;
    if (
      typeof parsed.occurredAt !== "string" ||
      Number.isNaN(new Date(parsed.occurredAt).getTime()) ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      (parsed.direction !== undefined &&
        parsed.direction !== "outbound" &&
        parsed.direction !== "inbound") ||
      (parsed.unread !== undefined && typeof parsed.unread !== "boolean")
    ) {
      return null;
    }
    return parsed as MessagePageCursor;
  } catch {
    return null;
  }
}

function messagePageLimit(value: number | undefined) {
  if (!Number.isInteger(value) || !value) return MESSAGE_PAGE_DEFAULT_LIMIT;
  return Math.min(Math.max(value, 1), MESSAGE_PAGE_MAX_LIMIT);
}

function isMessageThreadKey(value: string) {
  return (
    /^case:[1-9][0-9]{0,99}$/.test(value) ||
    /^(?:consultation|manual|unmatched):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeConsultationName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("ko-KR");
}

function staffDedupeOutcome(
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
  assigneeUserId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  includeFollowUps?: boolean;
};

type PhoneDeskAssigneeItem = {
  scope: "external" | "internal";
  clickToCall: {
    requestedBy: { staffUserId: string; displayName: string };
  } | null;
  endpointOwners: Array<{ staffUserId: string; displayName: string }>;
  participants: Array<{
    staffUserId: string | null;
    displayName: string | null;
  }>;
};

export function phoneDeskItemAssignees(
  item: PhoneDeskAssigneeItem,
): Array<{ staffUserId: string; displayName: string }> {
  if (item.scope === "internal") {
    const seen = new Set<string>();
    return item.participants.flatMap((participant) => {
      if (
        !participant.staffUserId ||
        !participant.displayName ||
        seen.has(participant.staffUserId)
      ) {
        return [];
      }
      seen.add(participant.staffUserId);
      return [{
        staffUserId: participant.staffUserId,
        displayName: participant.displayName,
      }];
    });
  }
  if (item.clickToCall) return [item.clickToCall.requestedBy];
  return item.endpointOwners;
}

export function phoneDeskItemMatchesAssignee(
  item: PhoneDeskAssigneeItem,
  assigneeUserId: string | undefined,
): boolean {
  return !assigneeUserId || phoneDeskItemAssignees(item).some(
    (assignee) => assignee.staffUserId === assigneeUserId,
  );
}

export function isPhoneDeskAftercareWritableState(
  state:
    | "pending"
    | "ringing"
    | "connected"
    | "ended"
    | "failed"
    | "unknown",
): boolean {
  return state === "connected" || state === "ended";
}

export function canResolvePhoneDeskFinalParticipant(input: {
  scope: "external" | "internal";
  state:
    | "ringing"
    | "connected"
    | "transferring"
    | "needs_confirmation"
    | "ended";
  correlationStatus: "pending" | "confirmed" | "needs_confirmation" | "rejected";
  hasEndedCustomerLeg: boolean;
  hasActiveCustomerLeg: boolean;
  lastEventAt: Date;
  resolutionAt: Date;
}) {
  if (input.correlationStatus !== "needs_confirmation") return false;
  if (input.state === "ended") return true;
  return input.scope === "external" &&
    input.state === "needs_confirmation" &&
    input.hasEndedCustomerLeg &&
    !input.hasActiveCustomerLeg &&
    input.resolutionAt.getTime() - input.lastEventAt.getTime() >=
      MANUAL_FINAL_PARTICIPANT_DELAY_MS;
}

export function shouldAutoOpenConnectedAftercare(input: {
  scope: "external" | "internal";
  state:
    | "ringing"
    | "connected"
    | "transferring"
    | "needs_confirmation"
    | "ended";
  actorUserId: string;
  currentEndpointOwnerUserIds: readonly string[];
  participantUserIds: readonly (string | null)[];
}): boolean {
  return (
    input.scope === "external" &&
    input.state === "connected" &&
    (input.currentEndpointOwnerUserIds.includes(input.actorUserId) ||
      input.participantUserIds.includes(input.actorUserId))
  );
}

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

export function isStaleOneSidedInternalCall(input: {
  scope: "external" | "internal";
  state: "ringing" | "connected" | "transferring" | "needs_confirmation" | "ended";
  lastEventAt: Date;
  activeLegCount: number;
  snapshotAt: Date;
}): boolean {
  return input.scope === "internal" &&
    input.state !== "ended" &&
    input.activeLegCount <= 1 &&
    input.lastEventAt.getTime() <
      input.snapshotAt.getTime() - INTERNAL_SINGLE_LEG_CONFIRMATION_WINDOW_MS;
}

export type InternalCallNotificationCaller = {
  staffUserId: string | null;
  displayName: string | null;
  extension: string;
  organization: { key: string; name: string } | null;
  region: { key: string; name: string } | null;
  department: string | null;
  jobTitle: string | null;
};

type InternalCallNotificationParticipant = {
  direction: "inbound" | "outbound";
  extension: string;
  remoteExtension: string | null;
};

type InternalCallNotificationDirectoryEntry = {
  extension: string;
  staffUserId: string;
  displayName: string;
  organizationKey: string;
  organizationName: string;
  regionKey: string;
  regionName: string;
  department: string;
  jobTitle: string;
};

export function internalCallNotificationCallers(
  participants: readonly InternalCallNotificationParticipant[],
  directory: readonly InternalCallNotificationDirectoryEntry[],
): InternalCallNotificationCaller[] {
  const callerExtensions = new Set<string>();
  for (const participant of participants) {
    if (participant.direction === "inbound" && participant.remoteExtension) {
      callerExtensions.add(participant.remoteExtension);
    }
  }
  for (const participant of participants) {
    if (participant.direction === "outbound") {
      callerExtensions.add(participant.extension);
    }
  }

  const directoryByExtension = new Map<
    string,
    InternalCallNotificationDirectoryEntry[]
  >();
  for (const staff of directory) {
    const current = directoryByExtension.get(staff.extension) ?? [];
    if (!current.some((item) => item.staffUserId === staff.staffUserId)) {
      current.push(staff);
      directoryByExtension.set(staff.extension, current);
    }
  }

  const callers: InternalCallNotificationCaller[] = [];
  const seen = new Set<string>();
  for (const extension of callerExtensions) {
    const matchedStaff = directoryByExtension.get(extension) ?? [];
    if (matchedStaff.length === 0) {
      callers.push({
        staffUserId: null,
        displayName: null,
        extension,
        organization: null,
        region: null,
        department: null,
        jobTitle: null,
      });
      continue;
    }
    for (const staff of matchedStaff) {
      const key = `${staff.staffUserId}:${extension}`;
      if (seen.has(key)) continue;
      seen.add(key);
      callers.push({
        staffUserId: staff.staffUserId,
        displayName: staff.displayName,
        extension,
        organization: {
          key: staff.organizationKey,
          name: staff.organizationName,
        },
        region: { key: staff.regionKey, name: staff.regionName },
        department: staff.department,
        jobTitle: staff.jobTitle,
      });
    }
  }
  return callers;
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

export function externalInboundNotificationTargetUserIds(
  activeStaff: readonly { staffUserId: string }[],
): string[] {
  return [...new Set(activeStaff.map((staff) => staff.staffUserId))];
}

export function answerableInboundCallForActor(input: {
  rootState: "ringing" | "connected" | "transferring" | "needs_confirmation" | "ended";
  currentEndpointId: string;
  currentEndpointOwnedByActor: boolean;
  observedCall: {
    observedCallId: string;
    endpointId: string;
    bridgeId: string;
    state: "ringing" | "connected" | "ended";
  } | null;
  answerableBridgeIds: ReadonlySet<string>;
}): string | null {
  const observedCall = input.observedCall;
  return input.rootState === "ringing" &&
      observedCall?.state === "ringing" &&
      observedCall.endpointId === input.currentEndpointId &&
      input.answerableBridgeIds.has(observedCall.bridgeId) &&
      input.currentEndpointOwnedByActor
    ? observedCall.observedCallId
    : null;
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
      source: "staff";
      staffMembers: Array<{
        staffUserId: string;
        displayName: string;
        lineNumber: string;
        extension: string;
        department: string;
        jobTitle: string;
      }>;
    }
  | {
      source: "phonebook";
      contact: {
        id: string;
        displayName: string;
        originalPhone: string;
        connectedPhone: string | null;
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

export function phoneDeskTransferConfirmationDutyTargetUserIds(input: {
  participantUserIds: readonly (string | null)[];
  endpointOwnerUserIds: readonly string[];
  customerMatch: PhoneCustomerMatch;
  activeStaffUserIds: ReadonlySet<string>;
  fallbackAdminUserIds: readonly string[];
}) {
  const targetUserIds = new Set<string>();
  const addActive = (staffUserId: string | null | undefined) => {
    if (staffUserId && input.activeStaffUserIds.has(staffUserId)) {
      targetUserIds.add(staffUserId);
    }
  };

  for (const staffUserId of input.participantUserIds) addActive(staffUserId);
  for (const staffUserId of input.endpointOwnerUserIds) addActive(staffUserId);

  if (input.customerMatch?.source === "consultation") {
    addActive(input.customerMatch.consultation.assigneeUserId);
  } else if (input.customerMatch?.source === "legal_friends") {
    for (const legalFriendsCase of input.customerMatch.cases) {
      for (const staffUserId of legalFriendsCase.staffUserIds) {
        addActive(staffUserId);
      }
    }
  } else if (input.customerMatch?.source === "staff") {
    for (const staff of input.customerMatch.staffMembers) {
      addActive(staff.staffUserId);
    }
  }

  if (targetUserIds.size === 0) {
    for (const staffUserId of input.fallbackAdminUserIds) {
      addActive(staffUserId);
    }
  }
  return [...targetUserIds];
}

export function retainHigherPriorityPhoneCustomerMatch(
  matches: Map<string, PhoneCustomerMatch>,
  phone: string,
  candidate: NonNullable<PhoneCustomerMatch>,
) {
  if (matches.get(phone)) return false;
  matches.set(phone, candidate);
  return true;
}

export type PhonebookContact = {
  id: string;
  displayName: string;
  originalPhone: string;
  connectedPhone: string | null;
  createdAt: string;
  updatedAt: string;
};

type StaffPhoneCustomerMatch = Extract<
  PhoneCustomerMatch,
  { source: "staff" }
>;

export function staffPhoneCustomerMatches(
  rows: ReadonlyArray<{
    lineNumber: string | null;
    matchPhone?: string | null;
    staffUserId: string;
    displayName: string;
    extension: string | null;
    department: string;
    jobTitle: string;
  }>,
): Map<string, StaffPhoneCustomerMatch> {
  const membersByPhone = new Map<
    string,
    StaffPhoneCustomerMatch["staffMembers"]
  >();
  for (const staff of rows) {
    const matchPhone = staff.matchPhone ?? staff.lineNumber;
    if (!matchPhone || !staff.lineNumber || !staff.extension) continue;
    const members = membersByPhone.get(matchPhone) ?? [];
    if (members.some((member) => member.staffUserId === staff.staffUserId)) {
      continue;
    }
    members.push({
      staffUserId: staff.staffUserId,
      displayName: staff.displayName,
      lineNumber: staff.lineNumber,
      extension: staff.extension,
      department: staff.department,
      jobTitle: staff.jobTitle,
    });
    membersByPhone.set(matchPhone, members);
  }
  return new Map(
    [...membersByPhone].map(([phone, staffMembers]) => [
      phone,
      { source: "staff" as const, staffMembers },
    ]),
  );
}

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

function legalFriendsDirectoryConsultationSnapshot(
  source: LegalFriendsDirectoryConsultationSourceRow,
) {
  return {
    clientName: source.client_name,
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
      | "call_resolution_staff_required"
      | "call_resolution_staff_mismatch"
      | "call_resolution_staff_inactive"
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
      | "phonebook_contact_not_found"
      | "phonebook_phone_conflict"
      | "phonebook_call_phone_mismatch"
      | "phonebook_not_allowed"
      | "message_not_found"
      | "message_thread_not_found"
      | "message_cursor_invalid"
      | "message_owned_by_other_staff"
      | "message_template_not_found"
      | "message_template_inactive"
      | "message_template_name_conflict"
      | "message_template_auto_send_conflict"
      | "message_template_owned_by_other_staff"
      | "message_image_invalid"
      | "message_image_upload_failed"
      | "mms_feature_disabled"
      | "message_idempotency_conflict"
      | "message_body_invalid"
      | "centrex_message_sender_not_configured"
      | "manual_message_contact_not_found"
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

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function automaticCallbackScheduleText(
  dueAt: Date,
  assigneeName: string,
): string {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(dueAt);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((item) => item.type === type)?.value ?? "";
  const time = (value: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(value);
  const weekdays: Record<string, string> = {
    Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토", Sun: "일",
  };
  return `재연락 일정 : ${part("year")}-${part("month")}-${part("day")} (${weekdays[part("weekday")] ?? part("weekday")}), ${time(dueAt)} ~ ${time(new Date(dueAt.getTime() + 30 * 60_000))}, 담당자 ${assigneeName}`;
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
  targetSource: "consultation" | "legal_friends_directory" | "manual";
  consultationId: string | null;
  manualContactId: string | null;
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
    manualContactId: message.manualContactId,
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
  centrexMessageSenderLine?: string;
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
    centrexMessageSenderLine = DEFAULT_CENTREX_MESSAGE_SENDER_LINE,
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
  const phoneCustomerCache = new Map<
    string,
    { expiresAt: number; value: Promise<PhoneCustomerMatch> }
  >();

  async function resolveMessageDeliveryRoute(
    tx: DatabaseTransaction,
    provider: "centrex" | "solapi",
    actorUserId: string,
  ): Promise<TelephonyMessageDeliveryRoute> {
    if (provider === "centrex") {
      const [senderEndpoint] = await tx
        .select({
          id: telephonyEndpoints.id,
          lineNumber: telephonyEndpoints.lineNumber,
        })
        .from(telephonyEndpoints)
        .innerJoin(
          telephonyEndpointCredentials,
          eq(
            telephonyEndpointCredentials.endpointId,
            telephonyEndpoints.id,
          ),
        )
        .where(
          and(
            eq(telephonyEndpoints.provider, "centrex"),
            eq(telephonyEndpoints.endpointType, "representative"),
            eq(telephonyEndpoints.lineNumber, centrexMessageSenderLine),
            eq(telephonyEndpoints.isActive, true),
          ),
        )
        .limit(1);
      if (!senderEndpoint) {
        throw new TelephonyCallError(
          "centrex_message_sender_not_configured",
          "공용 센트릭스 문자 발신 회선이 활성화되지 않았습니다.",
        );
      }
      return centrexMessageDeliveryRoute(senderEndpoint);
    }

    const [actorEndpoint] = await tx
      .select({ id: telephonyEndpoints.id })
      .from(staffTelephonyBindings)
      .innerJoin(
        telephonyEndpoints,
        eq(telephonyEndpoints.id, staffTelephonyBindings.endpointId),
      )
      .where(
        and(
          eq(staffTelephonyBindings.staffUserId, actorUserId),
          eq(staffTelephonyBindings.isActive, true),
          eq(staffTelephonyBindings.isPrimary, true),
          eq(telephonyEndpoints.provider, "centrex"),
          eq(telephonyEndpoints.isActive, true),
        ),
      )
      .limit(1);
    if (!actorEndpoint) {
      throw new TelephonyCallError(
        "centrex_endpoint_not_linked",
        "직원 계정에 활성 센트릭스 회선이 연결되지 않았습니다.",
      );
    }
    if (!solapiMmsSender) {
      throw new TelephonyCallError(
        "mms_feature_disabled",
        "이미지 문자를 보내려면 솔라피 MMS 발신번호 설정이 필요합니다.",
      );
    }
    const replyMailboxes = await tx
      .select({ id: telephonyEndpoints.id })
      .from(telephonyEndpoints)
      .innerJoin(
        telephonyEndpointCredentials,
        eq(
          telephonyEndpointCredentials.endpointId,
          telephonyEndpoints.id,
        ),
      )
      .where(
        and(
          eq(telephonyEndpoints.provider, "centrex"),
          eq(telephonyEndpoints.endpointType, "representative"),
          eq(telephonyEndpoints.publicNumber, solapiMmsSender),
          eq(telephonyEndpoints.isActive, true),
        ),
      )
      .limit(2);
    return solapiMessageDeliveryRoute({
      actorEndpointId: actorEndpoint.id,
      senderNumber: solapiMmsSender,
      replyMailboxEndpointId:
        replyMailboxes.length === 1 ? replyMailboxes[0]!.id : null,
    });
  }

  function phonebookContactResponse(
    contact: typeof telephonyPhonebookContacts.$inferSelect,
  ): PhonebookContact {
    return {
      id: contact.id,
      displayName: protection.decrypt(
        {
          ciphertext: contact.displayNameCiphertext,
          nonce: contact.displayNameNonce,
          keyVersion: contact.displayNameKeyVersion,
        },
        `telephony_phonebook_contacts.display_name:${contact.id}`,
      ),
      originalPhone: protection.decrypt(
        {
          ciphertext: contact.originalPhoneCiphertext,
          nonce: contact.originalPhoneNonce,
          keyVersion: contact.originalPhoneKeyVersion,
        },
        `telephony_phonebook_contacts.original_phone:${contact.id}`,
      ),
      connectedPhone:
        contact.connectedPhoneCiphertext &&
        contact.connectedPhoneNonce &&
        contact.connectedPhoneKeyVersion
          ? protection.decrypt(
              {
                ciphertext: contact.connectedPhoneCiphertext,
                nonce: contact.connectedPhoneNonce,
                keyVersion: contact.connectedPhoneKeyVersion,
              },
              `telephony_phonebook_contacts.connected_phone:${contact.id}`,
            )
          : null,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }

  async function writePhonebookContact(
    tx: DatabaseTransaction,
    input: PhonebookContactSave,
    actor: StaffPrincipal,
    contactId: string | null,
    changedAt: Date,
  ): Promise<PhonebookContact> {
    const id = contactId ?? createEventId();
    let existing: typeof telephonyPhonebookContacts.$inferSelect | undefined;
    if (contactId) {
      [existing] = await tx
        .select()
        .from(telephonyPhonebookContacts)
        .where(
          and(
            eq(telephonyPhonebookContacts.id, contactId),
            eq(telephonyPhonebookContacts.isActive, true),
          ),
        )
        .limit(1)
        .for("update");
      if (!existing) {
        throw new TelephonyCallError(
          "phonebook_contact_not_found",
          "전화번호부 연락처를 찾을 수 없습니다.",
        );
      }
    }

    const originalFingerprint = protection.fingerprint(input.originalPhone);
    const connectedFingerprint = input.connectedPhone
      ? protection.fingerprint(input.connectedPhone)
      : null;
    const fingerprints = [originalFingerprint, connectedFingerprint]
      .filter((value): value is Buffer => Boolean(value))
      .sort((left, right) => left.compare(right));
    for (const fingerprint of fingerprints) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(fingerprint)} as bigint))`,
      );
    }
    const numberConditions = fingerprints.flatMap((fingerprint) => [
      eq(telephonyPhonebookContacts.originalPhoneFingerprint, fingerprint),
      eq(telephonyPhonebookContacts.connectedPhoneFingerprint, fingerprint),
    ]);
    const [conflict] = await tx
      .select({ id: telephonyPhonebookContacts.id })
      .from(telephonyPhonebookContacts)
      .where(
        and(
          eq(telephonyPhonebookContacts.isActive, true),
          contactId ? ne(telephonyPhonebookContacts.id, contactId) : undefined,
          or(...numberConditions),
        ),
      )
      .limit(1);
    if (conflict) {
      throw new TelephonyCallError(
        "phonebook_phone_conflict",
        "원번호 또는 연결번호가 다른 전화번호부 연락처에 이미 등록되어 있습니다.",
      );
    }

    const displayNameEncrypted = protection.encrypt(
      input.displayName,
      `telephony_phonebook_contacts.display_name:${id}`,
    );
    const originalPhoneEncrypted = protection.encrypt(
      input.originalPhone,
      `telephony_phonebook_contacts.original_phone:${id}`,
    );
    const connectedPhoneEncrypted = input.connectedPhone
      ? protection.encrypt(
          input.connectedPhone,
          `telephony_phonebook_contacts.connected_phone:${id}`,
        )
      : null;
    const values = {
      displayNameCiphertext: displayNameEncrypted.ciphertext,
      displayNameNonce: displayNameEncrypted.nonce,
      displayNameKeyVersion: displayNameEncrypted.keyVersion,
      originalPhoneFingerprint: originalFingerprint,
      originalPhoneCiphertext: originalPhoneEncrypted.ciphertext,
      originalPhoneNonce: originalPhoneEncrypted.nonce,
      originalPhoneKeyVersion: originalPhoneEncrypted.keyVersion,
      connectedPhoneFingerprint: connectedFingerprint,
      connectedPhoneCiphertext: connectedPhoneEncrypted?.ciphertext ?? null,
      connectedPhoneNonce: connectedPhoneEncrypted?.nonce ?? null,
      connectedPhoneKeyVersion: connectedPhoneEncrypted?.keyVersion ?? null,
      updatedByUserId: actor.id,
      updatedAt: changedAt,
    };
    const [saved] = existing
      ? await tx
          .update(telephonyPhonebookContacts)
          .set(values)
          .where(eq(telephonyPhonebookContacts.id, id))
          .returning()
      : await tx
          .insert(telephonyPhonebookContacts)
          .values({
            id,
            ...values,
            createdByUserId: actor.id,
            createdAt: changedAt,
          })
          .returning();
    if (!saved) throw new Error("phonebook_contact_not_saved");
    await tx.insert(staffAuditLogs).values({
      id: createEventId(),
      actorUserId: actor.id,
      action: existing
        ? "telephony.phonebook.updated"
        : "telephony.phonebook.created",
      targetType: "telephony_phonebook_contact",
      targetId: id,
      metadata: {
        originalPhoneLast4: input.originalPhone.slice(-4),
        connectedPhoneLast4: input.connectedPhone?.slice(-4) ?? null,
      },
      occurredAt: changedAt,
      createdAt: changedAt,
    });
    return phonebookContactResponse(saved);
  }

  async function listPhonebookContacts(actor: StaffPrincipal) {
    const rows = await db
      .select()
      .from(telephonyPhonebookContacts)
      .where(eq(telephonyPhonebookContacts.isActive, true))
      .orderBy(desc(telephonyPhonebookContacts.updatedAt))
      .limit(1_000);
    const viewedAt = now();
    const auditId = createEventId();
    await db.insert(staffAuditLogs).values({
      id: auditId,
      actorUserId: actor.id,
      action: "telephony.phonebook.viewed",
      targetType: "telephony_phonebook",
      targetId: auditId,
      metadata: { resultCount: rows.length },
      occurredAt: viewedAt,
      createdAt: viewedAt,
    });
    return {
      items: rows.map(phonebookContactResponse),
      total: rows.length,
    };
  }

  async function createPhonebookContact(
    input: PhonebookContactSave,
    actor: StaffPrincipal,
  ) {
    const result = await db.transaction((tx) =>
      writePhonebookContact(tx, input, actor, null, now()),
    );
    phoneCustomerCache.clear();
    return result;
  }

  async function updatePhonebookContact(
    contactId: string,
    input: PhonebookContactSave,
    actor: StaffPrincipal,
  ) {
    const result = await db.transaction((tx) =>
      writePhonebookContact(tx, input, actor, contactId, now()),
    );
    phoneCustomerCache.clear();
    return result;
  }

  async function deactivatePhonebookContact(
    contactId: string,
    actor: StaffPrincipal,
  ) {
    const deactivatedAt = now();
    const result = await db.transaction(async (tx) => {
      const [contact] = await tx
        .select({ id: telephonyPhonebookContacts.id })
        .from(telephonyPhonebookContacts)
        .where(
          and(
            eq(telephonyPhonebookContacts.id, contactId),
            eq(telephonyPhonebookContacts.isActive, true),
          ),
        )
        .limit(1)
        .for("update");
      if (!contact) {
        throw new TelephonyCallError(
          "phonebook_contact_not_found",
          "전화번호부 연락처를 찾을 수 없습니다.",
        );
      }
      await tx
        .update(telephonyPhonebookContacts)
        .set({
          isActive: false,
          updatedByUserId: actor.id,
          deactivatedByUserId: actor.id,
          deactivatedAt,
          updatedAt: deactivatedAt,
        })
        .where(eq(telephonyPhonebookContacts.id, contactId));
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "telephony.phonebook.deactivated",
        targetType: "telephony_phonebook_contact",
        targetId: contactId,
        metadata: {},
        occurredAt: deactivatedAt,
        createdAt: deactivatedAt,
      });
      return { id: contactId, deactivated: true as const };
    });
    phoneCustomerCache.clear();
    return result;
  }

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
    const customerName = formatConsultationCustomerName(
      input.customerName,
      input.directorySource?.relationship === "customer"
        ? "existing"
        : input.directorySource?.relationship === "referrer"
          ? "referral"
          : "none",
    );
    const requestSource = input.directorySource
      ? "erp_client_directory"
      : "erp_staff";
    const payloadFingerprint = protection.fingerprint(
      input.directorySource
        ? {
            source: requestSource,
            clientIdx: input.directorySource.clientIdx,
            caseIdx: input.directorySource.caseIdx,
            customerName,
            phone: input.phone,
            residenceRegion: input.residenceRegion,
            caseType: input.caseType,
            transferNote: input.transferNote,
            isReferral: input.directorySource.relationship === "referrer",
          }
        : {
            source: requestSource,
            customerName,
            phone: input.phone,
            residenceRegion: input.residenceRegion,
            caseType: input.caseType,
            transferNote: input.transferNote,
          },
    );
    const idempotencyFingerprint = protection.fingerprint({
      source: requestSource,
      idempotencyKey: input.idempotencyKey,
    });
    const phoneFingerprint = protection.fingerprint(input.phone);
    const nameFingerprint = protection.fingerprint({
      kind: "consultation_name",
      value: normalizeConsultationName(customerName),
    });

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(input.directorySource ? idempotencyFingerprint : phoneFingerprint)} as bigint))`,
      );
      const [existing] = await tx
        .select({
          consultationId: consultationRequests.consultationId,
          publicReceiptCode: consultations.publicReceiptCode,
          acceptedAt: consultationRequests.submittedAt,
          payloadFingerprint: consultationRequests.payloadFingerprint,
          dedupeOutcome: consultationRequests.dedupeOutcome,
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
          dedupeOutcome: existing.dedupeOutcome,
        };
      }

      let decision: ReturnType<typeof classifyConsultationSubmission>;
      let createGroupedMember = false;
      if (input.directorySource) {
        decision = {
          action: "create_new",
          createConsultation: true,
          createRequest: true,
          eventTypes: ["consultation.requested"],
        };
      } else {
        const candidateRows = await tx
          .select({
            consultationId: consultations.id,
            state: consultations.state,
            requestId: consultationRequests.id,
            payloadFingerprint: consultationRequests.payloadFingerprint,
            journeySessionId: consultationRequests.journeySessionId,
            hasProvidedName: consultationRequests.hasProvidedName,
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
              isNull(consultations.softDeletedAt),
              gte(
                consultationRequests.submittedAt,
                new Date(
                  acceptedAt.getTime() - DEDUPE_WINDOWS.suspectedDuplicateMs,
                ),
              ),
            ),
          )
          .orderBy(desc(consultationRequests.submittedAt));

        const candidateGroupRows = candidateRows.length > 0
          ? await tx
              .select({
                consultationId: consultationGroupMembers.consultationId,
                groupId: consultationGroups.id,
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
        const groupByCandidate = new Map(
          candidateGroupRows.map((row) => [row.consultationId, row]),
        );
        const canonicalIds = [
          ...new Set(
            candidateGroupRows.map((row) => row.canonicalConsultationId),
          ),
        ];
        const canonicalRows = canonicalIds.length > 0
          ? await tx
              .select({
                id: consultations.id,
                state: consultations.state,
                preferredNameCiphertext:
                  consultations.preferredNameCiphertext,
                preferredNameNonce: consultations.preferredNameNonce,
                preferredNameKeyVersion:
                  consultations.preferredNameKeyVersion,
              })
              .from(consultations)
              .where(inArray(consultations.id, canonicalIds))
          : [];
        const canonicalById = new Map(
          canonicalRows.map((row) => [row.id, row]),
        );
        const seenConsultations = new Set<string>();
        const candidates: ExistingConsultationCandidate[] = [];
        for (const row of candidateRows) {
          const canonicalConsultationId =
            groupByCandidate.get(row.consultationId)
              ?.canonicalConsultationId ?? row.consultationId;
          if (seenConsultations.has(canonicalConsultationId)) continue;
          seenConsultations.add(canonicalConsultationId);
          const identityRow =
            canonicalById.get(canonicalConsultationId) ?? row;
          const candidateName =
            identityRow.preferredNameCiphertext &&
            identityRow.preferredNameNonce &&
            identityRow.preferredNameKeyVersion
              ? protection.decrypt(
                  {
                    ciphertext: identityRow.preferredNameCiphertext,
                    nonce: identityRow.preferredNameNonce,
                    keyVersion: identityRow.preferredNameKeyVersion,
                  },
                  `consultations.preferred_name:${canonicalConsultationId}`,
                )
              : null;
          candidates.push({
            consultationId: canonicalConsultationId,
            latestRequestId: row.requestId,
            state:
              canonicalById.get(canonicalConsultationId)?.state ?? row.state,
            phoneFingerprint: phoneFingerprint.toString("hex"),
            latestPayloadFingerprint: row.payloadFingerprint.toString("hex"),
            latestJourneySessionId: row.journeySessionId,
            hasProvidedName: row.hasProvidedName,
            nameFingerprint: candidateName
              ? protection
                  .fingerprint({
                    kind: "consultation_name",
                    value: normalizeConsultationName(candidateName),
                  })
                  .toString("hex")
              : null,
            latestRequestAt: row.submittedAt,
          });
        }
        decision = classifyConsultationSubmission(
          {
            phoneFingerprint: phoneFingerprint.toString("hex"),
            payloadFingerprint: payloadFingerprint.toString("hex"),
            journeySessionId: null,
            hasProvidedName: true,
            nameFingerprint: nameFingerprint.toString("hex"),
            submittedAt: acceptedAt,
          },
          candidates,
        );
        if (decision.action === "idempotent_replay") {
          throw new Error("직원 신규등록 멱등성 판정 경로가 올바르지 않습니다.");
        }

        const repeatConsultationId =
          decision.action === "attach_repeat_request"
            ? decision.consultationId
            : null;
        const repeatGroupHasSameName =
          repeatConsultationId !== null &&
          candidateRows.some((row) => {
            if (
              (groupByCandidate.get(row.consultationId)
                ?.canonicalConsultationId ?? row.consultationId) !==
              repeatConsultationId
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
            return candidateName
              ? normalizeConsultationName(candidateName) ===
                  normalizeConsultationName(customerName)
              : false;
          });
        if (
          decision.action === "attach_repeat_request" &&
          !repeatGroupHasSameName
        ) {
          createGroupedMember = true;
        }
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

      const createConsultation =
        decision.createConsultation || createGroupedMember;
      const existingConsultationId =
        "consultationId" in decision ? decision.consultationId : null;
      if (!createConsultation && !existingConsultationId) {
        throw new Error("기존 상담 식별자를 찾을 수 없습니다.");
      }
      const consultationId = createConsultation
        ? createConsultationId()
        : existingConsultationId!;
      const requestId = createConsultationRequestId();
      const dedupeOutcome = staffDedupeOutcome(decision);
      let publicReceiptCode: string;
      const requestNameEncrypted = protection.encrypt(
        customerName,
        `consultation_requests.name:${requestId}`,
      );
      const phoneEncrypted = protection.encrypt(
        input.phone,
        `consultation_requests.phone:${requestId}`,
      );
      const intake = {
        residenceRegion: input.residenceRegion,
        topic:
          input.caseType === 2
            ? "개인파산·면책"
            : input.caseType === 3
              ? "기타"
              : "개인회생",
        ...(input.transferNote ? { transferNote: input.transferNote } : {}),
      };
      const intakeEncrypted = protection.encrypt(
        JSON.stringify(intake),
        `consultation_requests.intake:${requestId}`,
      );
      const sourceSnapshotEncrypted = source
        ? protection.encrypt(
            JSON.stringify(
              legalFriendsDirectoryConsultationSnapshot(source),
            ),
            `consultation_directory_sources/${consultationId}/snapshot`,
          )
        : null;

      if (createConsultation) {
        publicReceiptCode = createPublicReceiptCode(acceptedAt);
        const nameEncrypted = protection.encrypt(
          customerName,
          `consultations.preferred_name:${consultationId}`,
        );
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
      } else {
        const [existingConsultation] = await tx
          .select({ publicReceiptCode: consultations.publicReceiptCode })
          .from(consultations)
          .where(eq(consultations.id, consultationId))
          .limit(1);
        if (!existingConsultation) {
          throw new Error("중복 판정된 기존 상담을 찾을 수 없습니다.");
        }
        publicReceiptCode = existingConsultation.publicReceiptCode;
        await tx
          .update(consultations)
          .set({ lastRequestedAt: acceptedAt, updatedAt: acceptedAt })
          .where(eq(consultations.id, consultationId));
        await tx
          .update(consultationGroups)
          .set({ lastRequestedAt: acceptedAt, updatedAt: acceptedAt })
          .where(
            and(
              eq(consultationGroups.status, "active"),
              sql<boolean>`exists (
                select 1
                from ${consultationGroupMembers}
                where ${consultationGroupMembers.groupId} = ${consultationGroups.id}
                  and ${consultationGroupMembers.consultationId} = ${consultationId}
              )`,
            ),
          );
      }
      await tx.insert(consultationRequests).values({
        id: requestId,
        consultationId,
        createdByUserId: actor.id,
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
        dedupeOutcome,
        candidateConsultationId:
          decision.action === "create_suspected_duplicate"
            ? decision.candidateConsultationId
            : null,
        submittedAt: acceptedAt,
        createdAt: acceptedAt,
      });
      let groupedCanonicalConsultationId: string | null = null;
      if (
        createGroupedMember &&
        decision.action === "attach_repeat_request"
      ) {
        groupedCanonicalConsultationId = decision.consultationId;
        const [existingGroup] = await tx
          .select({ id: consultationGroups.id })
          .from(consultationGroupMembers)
          .innerJoin(
            consultationGroups,
            eq(consultationGroups.id, consultationGroupMembers.groupId),
          )
          .where(
            and(
              eq(
                consultationGroupMembers.consultationId,
                groupedCanonicalConsultationId,
              ),
              eq(consultationGroups.status, "active"),
            ),
          )
          .limit(1);
        const groupId = existingGroup?.id ?? createEventId();
        if (!existingGroup) {
          const [canonical] = await tx
            .select({
              firstRequestedAt: consultations.firstRequestedAt,
            })
            .from(consultations)
            .where(
              eq(consultations.id, groupedCanonicalConsultationId),
            )
            .limit(1);
          if (!canonical) {
            throw new Error("반복 상담의 대표 상담을 찾을 수 없습니다.");
          }
          await tx.insert(consultationGroups).values({
            id: groupId,
            canonicalConsultationId: groupedCanonicalConsultationId,
            phoneFingerprint,
            status: "active",
            createdReason: "automatic_phone_7d",
            createdByUserId: null,
            firstRequestedAt: canonical.firstRequestedAt,
            lastRequestedAt: acceptedAt,
            createdAt: acceptedAt,
            updatedAt: acceptedAt,
          });
          await tx.insert(consultationGroupMembers).values({
            consultationId: groupedCanonicalConsultationId,
            groupId,
            linkMethod: "automatic_phone_7d",
            linkedByUserId: null,
            linkedAt: acceptedAt,
            createdAt: acceptedAt,
          });
          await tx.insert(consultationGroupEvents).values({
            id: createEventId(),
            groupId,
            consultationId: groupedCanonicalConsultationId,
            eventType: "created",
            actorUserId: null,
            metadata: { reason: "same_phone_within_7_days" },
            occurredAt: acceptedAt,
            createdAt: acceptedAt,
          });
        }
        await tx.insert(consultationGroupMembers).values({
          consultationId,
          groupId,
          linkMethod: "automatic_phone_7d",
          linkedByUserId: null,
          linkedAt: acceptedAt,
          createdAt: acceptedAt,
        });
        await tx.insert(consultationGroupEvents).values({
          id: createEventId(),
          groupId,
          consultationId,
          eventType: "linked",
          actorUserId: null,
          metadata: {
            reason: "same_phone_within_7_days",
            canonicalConsultationId: groupedCanonicalConsultationId,
          },
          occurredAt: acceptedAt,
          createdAt: acceptedAt,
        });
        await tx
          .update(consultationGroups)
          .set({ lastRequestedAt: acceptedAt, updatedAt: acceptedAt })
          .where(eq(consultationGroups.id, groupId));
        await tx
          .update(consultations)
          .set({ lastRequestedAt: acceptedAt, updatedAt: acceptedAt })
          .where(eq(consultations.id, groupedCanonicalConsultationId));
      }
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
      if (createConsultation) {
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
      }

      const occurredAt = acceptedAt.toISOString();
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
            mode: "quick",
            privacyNoticeVersion: CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
            privacyBasis: "staff_recorded_phone_interaction",
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
        events.push(requestedEvent, requestNotificationEvent);
      }
      if (decision.action === "attach_repeat_request") {
        const eventConsultationId =
          groupedCanonicalConsultationId ?? consultationId;
        events.push({
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
            updateReason: "repeat_request",
            repeatStage: decision.stage,
            dedupeOutcome:
              decision.stage === "before_assignment"
                ? "repeat_unassigned"
                : "repeat_assigned",
          },
        });
      }
      if (decision.action === "create_suspected_duplicate") {
        events.push({
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
        });
      }
      for (const event of events) assertPlatformEvent(event);
      if (events.length > 0) {
        await tx
          .insert(outboxEvents)
          .values(
            events.map((event) =>
              eventRow(event, event.correlationId, "consultation"),
            ),
          );
      }
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
          dedupeOutcome,
          createdNewConsultation: createConsultation,
        },
        occurredAt: acceptedAt,
        createdAt: acceptedAt,
    });
    return {
        consultationId,
        publicReceiptCode,
        acceptedAt: acceptedAt.toISOString(),
        replayed: false,
        dedupeOutcome,
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
          event: "telephony_linked_legalfriends_case_name_lookup_failed",
          caseCount: normalizedCaseIdxs.length,
          occurredAt: now().toISOString(),
        }),
      );
      return new Map<string, string>();
    }
  }

  async function resolvePhoneCustomersUncached(phones: readonly string[]) {
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
        legalFriendsCaseIdx: legalFriendsCaseLinks.caseIdx,
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
      .leftJoin(
        legalFriendsCaseLinks,
        eq(legalFriendsCaseLinks.consultationId, consultations.id),
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
    const linkedCaseNames = await linkedLegalFriendsCaseNames(
      consultationRows.flatMap((row) =>
        row.legalFriendsCaseIdx ? [row.legalFriendsCaseIdx] : [],
      ),
    );

    const consultationMatchedPhones = new Set<string>();
    for (const consultation of consultationRows) {
      if (!consultation.phoneFingerprint) continue;
      const phone = phoneByFingerprint.get(
        consultation.phoneFingerprint.toString("hex"),
      );
      if (!phone || consultationMatchedPhones.has(phone)) continue;
      consultationMatchedPhones.add(phone);
      const storedDisplayName =
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
      const displayName = linkedLegalFriendsDisplayName(
        storedDisplayName,
        consultation.legalFriendsCaseIdx,
        linkedCaseNames,
      );
      retainHigherPriorityPhoneCustomerMatch(matches, phone, {
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

    const unmatchedAfterConsultations = uniquePhones.filter(
      (phone) => !consultationMatchedPhones.has(phone),
    );
    const staffProfileRows = unmatchedAfterConsultations.length
      ? await db
          .select({
            lineNumber: staffProfiles.centrexLineNumber,
            staffUserId: staffUsers.id,
            displayName: staffProfiles.displayName,
            extension: staffProfiles.centrexExtension,
            department: staffMemberships.department,
            jobTitle: staffMemberships.jobTitle,
          })
          .from(staffProfiles)
          .innerJoin(staffUsers, eq(staffUsers.id, staffProfiles.userId))
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
              eq(staffUsers.status, "active"),
              inArray(
                staffProfiles.centrexLineNumber,
                unmatchedAfterConsultations,
              ),
              isNotNull(staffProfiles.centrexLineNumber),
              isNotNull(staffProfiles.centrexExtension),
            ),
          )
          .orderBy(asc(staffProfiles.displayName))
      : [];
    const staffEndpointRows = unmatchedAfterConsultations.length
      ? await db
          .select({
            lineNumber: telephonyEndpoints.lineNumber,
            matchPhone: telephonyEndpoints.lineNumber,
            staffUserId: staffUsers.id,
            displayName: staffProfiles.displayName,
            extension: telephonyEndpoints.extension,
            department: staffMemberships.department,
            jobTitle: staffMemberships.jobTitle,
          })
          .from(staffTelephonyBindings)
          .innerJoin(
            telephonyEndpoints,
            eq(telephonyEndpoints.id, staffTelephonyBindings.endpointId),
          )
          .innerJoin(
            staffUsers,
            eq(staffUsers.id, staffTelephonyBindings.staffUserId),
          )
          .innerJoin(staffProfiles, eq(staffProfiles.userId, staffUsers.id))
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
              eq(staffUsers.status, "active"),
              eq(staffTelephonyBindings.isActive, true),
              eq(telephonyEndpoints.isActive, true),
              inArray(
                telephonyEndpoints.lineNumber,
                unmatchedAfterConsultations,
              ),
            ),
          )
          .orderBy(asc(staffProfiles.displayName))
      : [];
    const staffMatches = staffPhoneCustomerMatches([
      ...staffProfileRows,
      ...staffEndpointRows,
    ]);
    for (const [phone, staffMatch] of staffMatches) {
      retainHigherPriorityPhoneCustomerMatch(matches, phone, staffMatch);
    }

    const unmatchedAfterStaff = unmatchedAfterConsultations.filter(
      (phone) => !staffMatches.has(phone),
    );
    let legalFriendsMatches = new Map<
      string,
      Extract<PhoneCustomerMatch, { source: "legal_friends" }>
    >();
    try {
      legalFriendsMatches = await resolveLegalFriendsPhones(
        unmatchedAfterStaff,
      );
    } catch {
      console.error(
        JSON.stringify({
          event: "telephony_legalfriends_phone_lookup_failed",
          phoneCount: unmatchedAfterStaff.length,
          occurredAt: now().toISOString(),
        }),
      );
    }
    const unmatchedAfterLegalFriends: string[] = [];
    for (const phone of unmatchedAfterStaff) {
      const legalFriendsMatch = legalFriendsMatches.get(
        phone.replace(/[^0-9]/g, ""),
      );
      if (legalFriendsMatch) {
        retainHigherPriorityPhoneCustomerMatch(
          matches,
          phone,
          legalFriendsMatch,
        );
      } else {
        unmatchedAfterLegalFriends.push(phone);
      }
    }

    const phonebookEligiblePhones = new Set(unmatchedAfterLegalFriends);
    const unmatchedFingerprints = unmatchedAfterLegalFriends.map(
      (phone) => fingerprintsByPhone.get(phone)!,
    );
    const phonebookRows = unmatchedFingerprints.length
      ? await db
          .select()
          .from(telephonyPhonebookContacts)
          .where(
            and(
              eq(telephonyPhonebookContacts.isActive, true),
              or(
                inArray(
                  telephonyPhonebookContacts.originalPhoneFingerprint,
                  unmatchedFingerprints,
                ),
                inArray(
                  telephonyPhonebookContacts.connectedPhoneFingerprint,
                  unmatchedFingerprints,
                ),
              ),
            ),
          )
      : [];
    for (const contact of phonebookRows) {
      const displayName = protection.decrypt(
        {
          ciphertext: contact.displayNameCiphertext,
          nonce: contact.displayNameNonce,
          keyVersion: contact.displayNameKeyVersion,
        },
        `telephony_phonebook_contacts.display_name:${contact.id}`,
      );
      const originalPhone = protection.decrypt(
        {
          ciphertext: contact.originalPhoneCiphertext,
          nonce: contact.originalPhoneNonce,
          keyVersion: contact.originalPhoneKeyVersion,
        },
        `telephony_phonebook_contacts.original_phone:${contact.id}`,
      );
      const connectedPhone =
        contact.connectedPhoneCiphertext &&
        contact.connectedPhoneNonce &&
        contact.connectedPhoneKeyVersion
          ? protection.decrypt(
              {
                ciphertext: contact.connectedPhoneCiphertext,
                nonce: contact.connectedPhoneNonce,
                keyVersion: contact.connectedPhoneKeyVersion,
              },
              `telephony_phonebook_contacts.connected_phone:${contact.id}`,
            )
          : null;
      const match: NonNullable<PhoneCustomerMatch> = {
        source: "phonebook",
        contact: {
          id: contact.id,
          displayName,
          originalPhone,
          connectedPhone,
        },
      };
      for (const fingerprint of [
        contact.originalPhoneFingerprint,
        contact.connectedPhoneFingerprint,
      ]) {
        if (!fingerprint) continue;
        const phone = phoneByFingerprint.get(fingerprint.toString("hex"));
        if (!phone || !phonebookEligiblePhones.has(phone)) continue;
        retainHigherPriorityPhoneCustomerMatch(matches, phone, match);
      }
    }
    return matches;
  }

  async function resolvePhoneCustomers(phones: readonly string[]) {
    const uniquePhones = [...new Set(phones.filter(Boolean))];
    const matches = new Map<string, PhoneCustomerMatch>(
      uniquePhones.map((phone) => [phone, null]),
    );
    if (uniquePhones.length === 0) return matches;

    const current = now().getTime();
    const pendingByPhone = new Map<string, Promise<PhoneCustomerMatch>>();
    const missingPhones: string[] = [];
    for (const phone of uniquePhones) {
      const key = protection.fingerprint(phone).toString("hex");
      const cached = phoneCustomerCache.get(key);
      if (cached && cached.expiresAt > current) {
        pendingByPhone.set(phone, cached.value);
        continue;
      }
      if (cached) phoneCustomerCache.delete(key);
      missingPhones.push(phone);
    }

    if (missingPhones.length > 0) {
      const batch = resolvePhoneCustomersUncached(missingPhones);
      for (const phone of missingPhones) {
        const key = protection.fingerprint(phone).toString("hex");
        const value = batch.then((resolved) => resolved.get(phone) ?? null);
        phoneCustomerCache.set(key, {
          expiresAt: current + PHONE_CUSTOMER_CACHE_TTL_MS,
          value,
        });
        void value.catch(() => {
          const cached = phoneCustomerCache.get(key);
          if (cached?.value === value) phoneCustomerCache.delete(key);
        });
        pendingByPhone.set(phone, value);
      }
      while (phoneCustomerCache.size > PHONE_CUSTOMER_CACHE_MAX_ENTRIES) {
        const oldestKey = phoneCustomerCache.keys().next().value as
          | string
          | undefined;
        if (!oldestKey) break;
        phoneCustomerCache.delete(oldestKey);
      }
    }

    await Promise.all(
      [...pendingByPhone].map(async ([phone, pending]) => {
        matches.set(phone, await pending);
      }),
    );
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
        endpointType: telephonyEndpoints.endpointType,
        endpointLineNumber: telephonyEndpoints.lineNumber,
        endpointPublicNumber: telephonyEndpoints.publicNumber,
        endpointExtension: telephonyEndpoints.extension,
        endpointRegionKey: telephonyEndpoints.regionKey,
        legId: telephonyCallLegs.id,
        legEndpointId: telephonyCallLegs.endpointId,
        legExtension: callLegEndpoint.extension,
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
        callLegEndpoint,
        eq(callLegEndpoint.id, telephonyCallLegs.endpointId),
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
          endpointId: telephonyInboundCalls.endpointId,
          bridgeId: telephonyInboundCalls.bridgeId,
          state: telephonyInboundCalls.state,
        })
        .from(telephonyInboundCalls)
        .where(inArray(telephonyInboundCalls.callRootId, rootIds)),
    ]);
    const observedByRoot = new Map(
      observedRows.flatMap((row) =>
        row.rootId ? [[row.rootId, row] as const] : [],
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
    const internalRemoteExtensions = [
      ...new Set(
        rows.flatMap((row) =>
          row.scope === "internal" && row.legRemoteExtension
            ? [row.legRemoteExtension]
            : []
        ),
      ),
    ];
    const activityOwnerScope = internalRemoteExtensions.length
      ? or(
          inArray(staffTelephonyBindings.endpointId, activityEndpointIds),
          inArray(telephonyEndpoints.extension, internalRemoteExtensions),
        )
      : inArray(staffTelephonyBindings.endpointId, activityEndpointIds);
    const activityOwnerRows = await db
      .select({
        endpointId: staffTelephonyBindings.endpointId,
        extension: telephonyEndpoints.extension,
        staffUserId: staffTelephonyBindings.staffUserId,
        displayName: staffProfiles.displayName,
        organizationKey: staffMemberships.organizationKey,
        organizationName: staffOrganizations.name,
        regionKey: staffMemberships.regionKey,
        regionName: staffRegions.name,
        department: staffMemberships.department,
        jobTitle: staffMemberships.jobTitle,
      })
      .from(staffTelephonyBindings)
      .innerJoin(
        telephonyEndpoints,
        eq(telephonyEndpoints.id, staffTelephonyBindings.endpointId),
      )
      .innerJoin(
        staffUsers,
        and(
          eq(staffUsers.id, staffTelephonyBindings.staffUserId),
          eq(staffUsers.status, "active"),
        ),
      )
      .innerJoin(staffProfiles, eq(staffProfiles.userId, staffUsers.id))
      .innerJoin(
        staffMemberships,
        and(
          eq(staffMemberships.userId, staffTelephonyBindings.staffUserId),
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
      .where(
        and(
          activityOwnerScope,
          eq(staffTelephonyBindings.isActive, true),
          eq(telephonyEndpoints.isActive, true),
        ),
      );
    const ownersByActivityEndpoint = new Map<string, string[]>();
    const ownerRegionsByActivityEndpoint = new Map<string, string[]>();
    for (const owner of activityOwnerRows) {
      const current = ownersByActivityEndpoint.get(owner.endpointId) ?? [];
      current.push(owner.staffUserId);
      ownersByActivityEndpoint.set(owner.endpointId, current);
      const regions = ownerRegionsByActivityEndpoint.get(owner.endpointId) ?? [];
      regions.push(owner.regionKey);
      ownerRegionsByActivityEndpoint.set(owner.endpointId, regions);
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
                extension: row.legExtension!,
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
        isStaleOneSidedInternalCall({
          scope: root.scope,
          state: root.state,
          lastEventAt: root.lastEventAt,
          activeLegCount: participants.filter(
            (participant) => participant.state !== "ended",
          ).length,
          snapshotAt,
        })
      ) {
        continue;
      }
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
      const observedCall = observedByRoot.get(root.id) ?? null;
      const currentEndpointOwnedByActor = Boolean(
        ownersByActivityEndpoint
          .get(root.currentEndpointId!)
          ?.includes(actor.id),
      );
      const relations = relationsByRoot.get(root.id) ?? [];
      const latestTransferRelation = relations.find(
        (relation) =>
          relation.relationType === "transfer_attempted" ||
          relation.relationType === "transfer_completed" ||
          relation.relationType === "transfer_returned" ||
          relation.relationType === "transfer_unresolved",
      ) ?? null;
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
        latestTransferRelation?.relationType === "transfer_completed" ||
        latestTransferRelation?.relationType === "transfer_attempted"
      ) {
        const targetParticipant = latestTransferRelation.toLegId
          ? participantByLeg.get(latestTransferRelation.toLegId)
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
      } else if (latestTransferRelation?.relationType === "transfer_returned") {
        notificationKind = "transfer_returned";
        const targetParticipant = latestTransferRelation.fromLegId
          ? participantByLeg.get(latestTransferRelation.fromLegId)
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
        const internalInboundTargetUserIds = participants.flatMap((participant) =>
          participant.direction === "inbound"
            ? ownersByActivityEndpoint.get(participant.endpointId) ??
              (participant.staffUserId ? [participant.staffUserId] : [])
            : [],
        );
        if (internalInboundTargetUserIds.length > 0) {
          notificationKind = "internal_inbound";
          notificationTargetUserIds = internalInboundTargetUserIds;
        }
      } else if (root.direction === "inbound") {
        notificationKind = "external_inbound";
        notificationTargetUserIds = externalInboundNotificationTargetUserIds(
          allActiveStaff,
        );
      }
      notificationTargetUserIds = [...new Set(notificationTargetUserIds)];
      if (notificationKind && notificationTargetUserIds.length === 0) {
        notificationTargetUserIds = allActiveStaff.map(
          (staff) => staff.staffUserId,
        );
      }
      const displayedTransferRelation =
        latestTransferRelation?.relationType === "transfer_unresolved" &&
          root.correlationStatus === "confirmed"
          ? null
          : latestTransferRelation;
      const internalCallers = root.scope === "internal"
        ? internalCallNotificationCallers(participants, activityOwnerRows)
        : [];
      items.push({
        id: root.id,
        observedCallId: observedCall?.observedCallId ?? null,
        currentEndpointOwnedByActor,
        answerableInboundCallId: answerableInboundCallForActor({
          rootState: root.state,
          currentEndpointId: root.currentEndpointId!,
          currentEndpointOwnedByActor,
          observedCall,
          answerableBridgeIds,
        }),
        scope: root.scope,
        direction: root.direction,
        state: root.state,
        correlationStatus: root.correlationStatus,
        remotePhone,
        callRegion: classifyTelephonyCallRegion({
          endpointType: root.endpointType,
          lineNumber: root.endpointLineNumber,
          publicNumber: root.endpointPublicNumber,
          endpointRegionKey: root.endpointRegionKey,
          ownerRegionKeys:
            ownerRegionsByActivityEndpoint.get(root.currentEndpointId!) ?? [],
        }),
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
        internalCallers,
        transfer: displayedTransferRelation
          ? {
              state: displayedTransferRelation.relationType,
              correlationStatus: displayedTransferRelation.correlationStatus,
            }
          : null,
        customerMatch,
        notificationKind,
        notificationTargetUserIds,
        canOpenLiveAftercare: shouldAutoOpenConnectedAftercare({
          scope: root.scope,
          state: root.state,
          actorUserId: actor.id,
          currentEndpointOwnerUserIds:
            ownersByActivityEndpoint.get(root.currentEndpointId!) ?? [],
          participantUserIds: participants.map(
            (participant) => participant.staffUserId,
          ),
        }),
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
        endpointType: telephonyEndpoints.endpointType,
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
        endpointType: "personal" | "representative";
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
          endpointType: row.endpointType,
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

  async function listOpenPhoneDeskFollowUps() {
    const directRequest = alias(
      consultationRequests,
      "follow_up_consultation_request",
    );
    const callRequest = alias(
      consultationRequests,
      "follow_up_call_consultation_request",
    );
    const rows = await db
      .select({
        id: telephonyFollowUpTasks.id,
        aftercareId: telephonyFollowUpTasks.aftercareId,
        consultationRequestId: telephonyFollowUpTasks.consultationRequestId,
        dueAt: telephonyFollowUpTasks.dueAt,
        assigneeUserId: telephonyFollowUpTasks.assigneeUserId,
        assigneeDisplayName: staffProfiles.displayName,
        result: telephonyCallAftercare.result,
        observedCallId: telephonyCallAftercare.observedCallId,
        telephonyCallId: telephonyCallAftercare.telephonyCallId,
        callRootId: telephonyCallAftercare.callRootId,
        directWindowEnd: directRequest.contactWindowEnd,
        directPhoneCiphertext: directRequest.phoneCiphertext,
        directPhoneNonce: directRequest.phoneNonce,
        directPhoneKeyVersion: directRequest.phoneKeyVersion,
        rootPhoneCiphertext: telephonyCallRoots.remotePhoneCiphertext,
        rootPhoneNonce: telephonyCallRoots.remotePhoneNonce,
        rootPhoneKeyVersion: telephonyCallRoots.remotePhoneKeyVersion,
        observedPhoneCiphertext: telephonyInboundCalls.remotePhoneCiphertext,
        observedPhoneNonce: telephonyInboundCalls.remotePhoneNonce,
        observedPhoneKeyVersion: telephonyInboundCalls.remotePhoneKeyVersion,
        callTargetSource: telephonyCalls.targetSource,
        callRequestId: telephonyCalls.consultationRequestId,
        callPhoneCiphertext: callRequest.phoneCiphertext,
        callPhoneNonce: callRequest.phoneNonce,
        callPhoneKeyVersion: callRequest.phoneKeyVersion,
        directoryPhoneCiphertext:
          telephonyCallDirectoryTargets.phoneCiphertext,
        directoryPhoneNonce: telephonyCallDirectoryTargets.phoneNonce,
        directoryPhoneKeyVersion: telephonyCallDirectoryTargets.phoneKeyVersion,
        consultationId: consultations.id,
        consultationReceiptCode: consultations.publicReceiptCode,
        consultationAnonymousLabel: consultations.anonymousLabel,
        consultationNameCiphertext: consultations.preferredNameCiphertext,
        consultationNameNonce: consultations.preferredNameNonce,
        consultationNameKeyVersion: consultations.preferredNameKeyVersion,
      })
      .from(telephonyFollowUpTasks)
      .leftJoin(
        telephonyCallAftercare,
        eq(telephonyCallAftercare.id, telephonyFollowUpTasks.aftercareId),
      )
      .leftJoin(
        directRequest,
        eq(directRequest.id, telephonyFollowUpTasks.consultationRequestId),
      )
      .leftJoin(
        telephonyCallRoots,
        eq(telephonyCallRoots.id, telephonyCallAftercare.callRootId),
      )
      .leftJoin(
        telephonyInboundCalls,
        eq(telephonyInboundCalls.id, telephonyCallAftercare.observedCallId),
      )
      .leftJoin(
        telephonyCalls,
        eq(telephonyCalls.id, telephonyCallAftercare.telephonyCallId),
      )
      .leftJoin(
        callRequest,
        eq(callRequest.id, telephonyCalls.consultationRequestId),
      )
      .leftJoin(
        telephonyCallDirectoryTargets,
        eq(
          telephonyCallDirectoryTargets.telephonyCallId,
          telephonyCalls.id,
        ),
      )
      .leftJoin(
        consultations,
        or(
          eq(consultations.id, telephonyCallAftercare.consultationId),
          eq(consultations.id, directRequest.consultationId),
        ),
      )
      .innerJoin(
        staffProfiles,
        eq(staffProfiles.userId, telephonyFollowUpTasks.assigneeUserId),
      )
      .where(eq(telephonyFollowUpTasks.state, "open"))
      .orderBy(asc(telephonyFollowUpTasks.dueAt))
      .limit(PHONE_DESK_MAX_LIMIT);
    const customerMatch = createPhoneCustomerLoader();

    return Promise.all(
      rows.map(async (task) => {
        const remotePhone = task.callRootId &&
            task.rootPhoneCiphertext &&
            task.rootPhoneNonce &&
            task.rootPhoneKeyVersion
          ? protection.decrypt(
              {
                ciphertext: task.rootPhoneCiphertext,
                nonce: task.rootPhoneNonce,
                keyVersion: task.rootPhoneKeyVersion,
              },
              `telephony_inbound_calls/${task.callRootId}/remote_phone`,
            )
          : task.observedCallId &&
              task.observedPhoneCiphertext &&
              task.observedPhoneNonce &&
              task.observedPhoneKeyVersion
            ? protection.decrypt(
                {
                  ciphertext: task.observedPhoneCiphertext,
                  nonce: task.observedPhoneNonce,
                  keyVersion: task.observedPhoneKeyVersion,
                },
                `telephony_inbound_calls/${task.observedCallId}/remote_phone`,
              )
            : task.telephonyCallId &&
                task.callTargetSource === "legal_friends_directory" &&
                task.directoryPhoneCiphertext &&
                task.directoryPhoneNonce &&
                task.directoryPhoneKeyVersion
              ? protection.decrypt(
                  {
                    ciphertext: task.directoryPhoneCiphertext,
                    nonce: task.directoryPhoneNonce,
                    keyVersion: task.directoryPhoneKeyVersion,
                  },
                  `telephony_call_directory_targets/${task.telephonyCallId}/phone`,
                )
              : task.callRequestId &&
                  task.callPhoneCiphertext &&
                  task.callPhoneNonce &&
                  task.callPhoneKeyVersion
                ? protection.decrypt(
                    {
                      ciphertext: task.callPhoneCiphertext,
                      nonce: task.callPhoneNonce,
                      keyVersion: task.callPhoneKeyVersion,
                    },
                    `consultation_requests.phone:${task.callRequestId}`,
                  )
                : task.consultationRequestId &&
                    task.directPhoneCiphertext &&
                    task.directPhoneNonce &&
                    task.directPhoneKeyVersion
                  ? protection.decrypt(
                      {
                        ciphertext: task.directPhoneCiphertext,
                        nonce: task.directPhoneNonce,
                        keyVersion: task.directPhoneKeyVersion,
                      },
                      `consultation_requests.phone:${task.consultationRequestId}`,
                    )
                  : "";
        const linkedConsultation = task.consultationId
          ? {
              displayName:
                task.consultationNameCiphertext &&
                  task.consultationNameNonce &&
                  task.consultationNameKeyVersion
                  ? protection.decrypt(
                      {
                        ciphertext: task.consultationNameCiphertext,
                        nonce: task.consultationNameNonce,
                        keyVersion: task.consultationNameKeyVersion,
                      },
                      `consultations.preferred_name:${task.consultationId}`,
                    )
                  : task.consultationAnonymousLabel ?? "고객명 미확인",
              receiptCode: task.consultationReceiptCode!,
            }
          : null;
        const match = !linkedConsultation && remotePhone
          ? await customerMatch(remotePhone)
          : null;
        const matchedConsultation =
          match?.source === "consultation" ? match.consultation : null;
        const matchedDirectoryCase =
          match?.source === "legal_friends" ? match.cases[0] ?? null : null;
        const customerName =
          linkedConsultation?.displayName ??
          matchedConsultation?.displayName ??
          (match?.source === "staff"
            ? match.staffMembers.map((staff) => staff.displayName).join(" · ")
            : null) ??
          (match?.source === "legal_friends" ? match.clientName : null) ??
          (match?.source === "phonebook" ? match.contact.displayName : null) ??
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
          source: task.consultationRequestId
            ? ("consultation_schedule" as const)
            : ("aftercare" as const),
          aftercareId: task.aftercareId,
          consultationRequestId: task.consultationRequestId,
          callId:
            task.callRootId ?? task.observedCallId ?? task.telephonyCallId,
          result: task.result,
          consultationId: task.consultationId,
          customerName,
          remotePhone,
          contactTarget,
          dueAt: task.dueAt.toISOString(),
          dueEndAt: task.directWindowEnd?.toISOString() ?? null,
          assignee: {
            staffUserId: task.assigneeUserId,
            displayName: task.assigneeDisplayName,
          },
        };
      }),
    );
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
    const selectedAssigneeUserId = typeof queryOrLimit === "number"
      ? undefined
      : queryOrLimit.assigneeUserId;
    const from = typeof queryOrLimit === "number"
      ? undefined
      : queryOrLimit.from;
    const to = typeof queryOrLimit === "number" ? undefined : queryOrLimit.to;
    const search = typeof queryOrLimit === "number"
      ? ""
      : queryOrLimit.search?.trim() ?? "";
    const includeFollowUps = typeof queryOrLimit === "number"
      ? true
      : queryOrLimit.includeFollowUps ?? false;
    const snapshotAt = now();
    const normalizedSearchPhone = search.replace(/[^0-9]/g, "");
    const isPhoneSearch = Boolean(search) && /^[0-9() +.-]+$/.test(search);
    let searchPhones: string[] = [];
    if (search) {
      if (isPhoneSearch && normalizedSearchPhone.length >= 9) {
        searchPhones = [normalizedSearchPhone];
      } else {
        const directoryResult = await db.execute(
          sql<LegalFriendsClientSearchRow>`SELECT * FROM public.search_legalfriends_client_directory(${search}, ${50})`,
        );
        searchPhones = [
          ...new Set(
            (directoryResult.rows as LegalFriendsClientSearchRow[])
              .flatMap((row) => row.phone ? [row.phone.replace(/[^0-9]/g, "")] : [])
              .filter((phone) => phone.length >= 9 && phone.length <= 15),
          ),
        ];
      }
    }
    const searchFingerprints = searchPhones.map((phone) =>
      protection.fingerprint(phone)
    );
    const lastFourSearch = isPhoneSearch && normalizedSearchPhone.length === 4
      ? `***${normalizedSearchPhone}`
      : null;
    const observedSearchCondition = search
      ? or(
          searchFingerprints.length
            ? inArray(
                telephonyInboundCalls.remotePhoneFingerprint,
                searchFingerprints,
              )
            : undefined,
          searchFingerprints.length
            ? inArray(
                telephonyCallRoots.remotePhoneFingerprint,
                searchFingerprints,
              )
            : undefined,
          lastFourSearch
            ? eq(telephonyInboundCalls.remotePhoneMasked, lastFourSearch)
            : undefined,
          lastFourSearch
            ? eq(telephonyCallRoots.remotePhoneMasked, lastFourSearch)
            : undefined,
        ) ?? sql<boolean>`false`
      : undefined;
    const standaloneSearchCondition = search
      ? searchFingerprints.length
        ? inArray(telephonyCalls.remotePhoneFingerprint, searchFingerprints)
        : sql<boolean>`false`
      : undefined;
    const observedDateCondition = and(
      from ? gte(telephonyInboundCalls.ringingAt, from) : undefined,
      to ? lt(telephonyInboundCalls.ringingAt, to) : undefined,
      observedSearchCondition,
    );
    const standaloneDateCondition = and(
      from ? gte(telephonyCalls.requestedAt, from) : undefined,
      to ? lt(telephonyCalls.requestedAt, to) : undefined,
      standaloneSearchCondition,
    );
    const rootDateCondition = and(
      from ? gte(telephonyCallRoots.startedAt, from) : undefined,
      to ? lt(telephonyCallRoots.startedAt, to) : undefined,
      search ? sql<boolean>`false` : undefined,
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
    const internalFilterCondition =
      selectedFilter === "all" || selectedFilter === "internal"
        ? undefined
        : selectedFilter === "active"
          ? and(
              ne(telephonyCallRoots.state, "ended"),
              or(
                gte(
                  telephonyCallRoots.lastEventAt,
                  new Date(
                    snapshotAt.getTime() -
                      INTERNAL_SINGLE_LEG_CONFIRMATION_WINDOW_MS,
                  ),
                ),
                sql<boolean>`(
                  select count(*)
                  from telephony_call_legs as active_internal_leg
                  where active_internal_leg.root_id = ${telephonyCallRoots.id}
                    and active_internal_leg.state in ('ringing', 'connected')
                ) >= 2`,
              ),
            )
          : sql<boolean>`false`;
    const observedAssigneeCondition = selectedAssigneeUserId
      ? sql<boolean>`case
          when ${telephonyCallObservationLinks.telephonyCallId} is not null then exists (
            select 1
            from ${telephonyCalls}
            where ${telephonyCalls.id} = ${telephonyCallObservationLinks.telephonyCallId}
              and ${telephonyCalls.staffUserId} = ${selectedAssigneeUserId}
          )
          else exists (
            select 1
            from ${staffTelephonyBindings}
            where ${staffTelephonyBindings.endpointId} = coalesce(
              ${telephonyCallRoots.currentEndpointId},
              ${telephonyInboundCalls.endpointId}
            )
              and ${staffTelephonyBindings.staffUserId} = ${selectedAssigneeUserId}
              and ${staffTelephonyBindings.isActive} = true
          )
        end`
      : undefined;
    const standaloneAssigneeCondition = selectedAssigneeUserId
      ? eq(telephonyCalls.staffUserId, selectedAssigneeUserId)
      : undefined;
    const internalAssigneeCondition = selectedAssigneeUserId
      ? sql<boolean>`exists (
          select 1
          from ${telephonyCallLegs}
          where ${telephonyCallLegs.rootId} = ${telephonyCallRoots.id}
            and ${telephonyCallLegs.staffUserId} = ${selectedAssigneeUserId}
        )`
      : undefined;

    let summary = emptySummary;
    let total = 0;
    let page = 1;
    let pageCount = 1;
    let offset = 0;
    let selectedObservedIds: string[] = [];
    let selectedStandaloneIds: string[] = [];
    let selectedInternalIds: string[] = [];
    if (!callId) {
      const [[observedCount], [standaloneCount], [internalCount]] =
        await Promise.all([
        db
          .select({
            value: sql<number>`count(distinct coalesce(${telephonyInboundCalls.callRootId}, ${telephonyInboundCalls.id}))::int`,
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
          .where(
            and(
              observedDateCondition,
              observedFilterCondition,
              observedAssigneeCondition,
            ),
          ),
        db
          .select({
            value: count(),
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
              standaloneFilterCondition,
              standaloneAssigneeCondition,
            ),
          ),
        db
          .select({
            value: count(),
          })
          .from(telephonyCallRoots)
          .where(
            and(
              eq(telephonyCallRoots.scope, "internal"),
              rootDateCondition,
              internalFilterCondition,
              internalAssigneeCondition,
            ),
          ),
      ]);
      total = Number(observedCount?.value ?? 0) +
        Number(standaloneCount?.value ?? 0) +
        Number(internalCount?.value ?? 0);
      pageCount = Math.max(1, Math.ceil(total / normalizedLimit));
      page = Math.min(requestedPage, pageCount);
      offset = (page - 1) * normalizedLimit;
      const candidateLimit = offset + normalizedLimit;
      const observedCandidateId = sql<string>`coalesce(${telephonyInboundCalls.callRootId}, ${telephonyInboundCalls.id})`;
      const observedCandidateTime = sql<Date>`max(coalesce(${telephonyCallRoots.startedAt}, ${telephonyInboundCalls.ringingAt}))`;
      const [observedCandidates, standaloneCandidates, internalCandidates] =
        await Promise.all([
          db
            .select({ id: observedCandidateId, occurredAt: observedCandidateTime })
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
            .where(
              and(
                observedDateCondition,
                observedFilterCondition,
                observedAssigneeCondition,
              ),
            )
            .groupBy(observedCandidateId)
            .orderBy(desc(observedCandidateTime))
            .limit(candidateLimit),
          db
            .select({ id: telephonyCalls.id, occurredAt: telephonyCalls.requestedAt })
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
                standaloneFilterCondition,
                standaloneAssigneeCondition,
              ),
            )
            .orderBy(desc(telephonyCalls.requestedAt))
            .limit(candidateLimit),
          db
            .select({ id: telephonyCallRoots.id, occurredAt: telephonyCallRoots.startedAt })
            .from(telephonyCallRoots)
            .where(
              and(
                eq(telephonyCallRoots.scope, "internal"),
                rootDateCondition,
                internalFilterCondition,
                internalAssigneeCondition,
              ),
            )
            .orderBy(desc(telephonyCallRoots.startedAt))
            .limit(candidateLimit),
        ]);
      const selectedCandidates = [
        ...observedCandidates.map((candidate) => ({ ...candidate, kind: "observed" as const })),
        ...standaloneCandidates.map((candidate) => ({ ...candidate, kind: "standalone" as const })),
        ...internalCandidates.map((candidate) => ({ ...candidate, kind: "internal" as const })),
      ]
        .sort(
          (left, right) =>
            new Date(right.occurredAt).getTime() -
            new Date(left.occurredAt).getTime(),
        )
        .slice(offset, offset + normalizedLimit);
      selectedObservedIds = selectedCandidates.flatMap((candidate) =>
        candidate.kind === "observed" ? [candidate.id] : [],
      );
      selectedStandaloneIds = selectedCandidates.flatMap((candidate) =>
        candidate.kind === "standalone" ? [candidate.id] : [],
      );
      selectedInternalIds = selectedCandidates.flatMap((candidate) =>
        candidate.kind === "internal" ? [candidate.id] : [],
      );
      summary = {
        ...emptySummary,
        all: total,
        [selectedFilter === "all" ? "all" : selectedFilter === "click_to_call"
          ? "clickToCall"
          : selectedFilter === "centrex_direct"
            ? "centrexDirect"
            : selectedFilter]: total,
      };
    }
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
        endpointType: telephonyEndpoints.endpointType,
        endpointLabel: telephonyEndpoints.label,
        endpointLineNumber: telephonyEndpoints.lineNumber,
        endpointExtension: telephonyEndpoints.extension,
        rootEndpointId: callRootCurrentEndpoint.id,
        rootEndpointType: callRootCurrentEndpoint.endpointType,
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
          : selectedObservedIds.length
            ? or(
                inArray(telephonyInboundCalls.id, selectedObservedIds),
                inArray(telephonyInboundCalls.callRootId, selectedObservedIds),
              )
            : sql<boolean>`false`,
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
        endpointType: telephonyEndpoints.endpointType,
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
            : selectedStandaloneIds.length
              ? inArray(telephonyCalls.id, selectedStandaloneIds)
              : sql<boolean>`false`,
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
        endpointType: callRootCurrentEndpoint.endpointType,
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
          callId
            ? eq(telephonyCallRoots.id, callId)
            : selectedInternalIds.length
              ? inArray(telephonyCallRoots.id, selectedInternalIds)
              : sql<boolean>`false`,
        ),
      )
      .orderBy(desc(telephonyCallRoots.startedAt));

    const rootOnlyExternalRows = callId
      ? await db
          .select({
            id: telephonyCallRoots.id,
            direction: telephonyCallRoots.direction,
            state: telephonyCallRoots.state,
            correlationStatus: telephonyCallRoots.correlationStatus,
            currentEndpointId: telephonyCallRoots.currentEndpointId,
            remotePhoneCiphertext:
              telephonyCallRoots.remotePhoneCiphertext,
            remotePhoneNonce: telephonyCallRoots.remotePhoneNonce,
            remotePhoneKeyVersion: telephonyCallRoots.remotePhoneKeyVersion,
            startedAt: telephonyCallRoots.startedAt,
            connectedAt: telephonyCallRoots.connectedAt,
            endedAt: telephonyCallRoots.endedAt,
            lastEventAt: telephonyCallRoots.lastEventAt,
            finalStaffUserId: telephonyCallRoots.finalStaffUserId,
            endpointType: callRootCurrentEndpoint.endpointType,
            endpointLabel: callRootCurrentEndpoint.label,
            endpointLineNumber: callRootCurrentEndpoint.lineNumber,
            endpointExtension: callRootCurrentEndpoint.extension,
          })
          .from(telephonyCallRoots)
          .innerJoin(
            callRootCurrentEndpoint,
            eq(
              callRootCurrentEndpoint.id,
              telephonyCallRoots.currentEndpointId,
            ),
          )
          .where(
            and(
              eq(telephonyCallRoots.id, callId),
              eq(telephonyCallRoots.scope, "external"),
              notExists(
                db
                  .select({ id: telephonyInboundCalls.id })
                  .from(telephonyInboundCalls)
                  .where(
                    eq(
                      telephonyInboundCalls.callRootId,
                      telephonyCallRoots.id,
                    ),
                  ),
              ),
            ),
          )
          .limit(1)
      : [];

    const endpointIds = [
      ...new Set([
        ...observedRows.map((row) => row.endpointId),
        ...observedRows.flatMap((row) =>
          row.rootEndpointId ? [row.rootEndpointId] : [],
        ),
        ...standaloneClickRows.map((row) => row.endpointId),
        ...rootOnlyExternalRows.flatMap((row) =>
          row.currentEndpointId ? [row.currentEndpointId] : [],
        ),
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

    const rootOnlyExternalItems = await Promise.all(
      rootOnlyExternalRows.map(async (row) => {
        if (
          !row.direction ||
          !row.currentEndpointId ||
          !row.remotePhoneCiphertext ||
          !row.remotePhoneNonce ||
          !row.remotePhoneKeyVersion
        ) {
          throw new Error("phone_desk_external_root_data_incomplete");
        }
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
                (ringEndAt.getTime() - row.startedAt.getTime()) / 1_000,
              ),
            )
          : null;
        const durationSeconds = row.connectedAt && row.endedAt
          ? Math.max(
              0,
              Math.round(
                (row.endedAt.getTime() - row.connectedAt.getTime()) / 1_000,
              ),
            )
          : null;
        return {
          id: row.id,
          observedCallId: null,
          callRootId: row.id,
          scope: "external" as const,
          direction: row.direction,
          receptionMode:
            row.direction === "inbound"
              ? ("office_bridge" as const)
              : null,
          source:
            row.direction === "inbound"
              ? ("inbound" as const)
              : ("centrex_direct" as const),
          state:
            row.state === "ended"
              ? ("ended" as const)
              : row.state === "ringing"
                ? ("ringing" as const)
                : row.state === "needs_confirmation"
                  ? ("unknown" as const)
                  : ("connected" as const),
          correlationStatus: row.correlationStatus,
          remotePhone,
          occurredAt: row.startedAt.toISOString(),
          ringingAt: row.startedAt.toISOString(),
          connectedAt: row.connectedAt?.toISOString() ?? null,
          endedAt: row.endedAt?.toISOString() ?? null,
          lastEventAt: row.lastEventAt.toISOString(),
          ringSeconds,
          durationSeconds,
          providerEndCause: null,
          endpoint: {
            id: row.currentEndpointId,
            endpointType: row.endpointType,
            label: row.endpointLabel,
            lineNumber: row.endpointLineNumber,
            extension: row.endpointExtension,
          },
          finalStaffUserId: row.finalStaffUserId,
          endpointOwners:
            ownersByEndpoint.get(row.currentEndpointId) ?? [],
          participants: [],
          relationType: null,
          customerMatch: await customerMatch(remotePhone),
          clickToCall: null,
        };
      }),
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
            endpointType: row.rootEndpointType ?? row.endpointType,
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
            endpointType: row.endpointType,
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
      const staleOneSided = isStaleOneSidedInternalCall({
        scope: "internal",
        state: root.state,
        lastEventAt: root.lastEventAt,
        activeLegCount: participants.filter(
          (participant) => participant.state !== "ended",
        ).length,
        snapshotAt,
      });
      return [{
        id: root.id,
        observedCallId: null,
        callRootId: root.id,
        scope: "internal" as const,
        direction: "internal" as const,
        receptionMode: null,
        source: "internal" as const,
        state: staleOneSided
          ? ("unknown" as const)
          : root.state === "ended"
          ? ("ended" as const)
          : root.state === "ringing"
            ? ("ringing" as const)
            : root.state === "needs_confirmation"
              ? ("unknown" as const)
              : ("connected" as const),
        correlationStatus: staleOneSided
          ? ("needs_confirmation" as const)
          : root.correlationStatus,
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
          endpointType: root.endpointType,
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
      ...rootOnlyExternalItems,
      ...internalItems,
    ]
      .sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime(),
      );
    const assigneeOptions = callId
      ? []
      : (await activePhoneDeskStaff()).map((staff) => ({
          staffUserId: staff.staffUserId,
          displayName: staff.displayName,
        }));
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
      if (task.aftercareId && !followUpsByAftercare.has(task.aftercareId)) {
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
    const followUps = callId || !includeFollowUps
      ? []
      : await listOpenPhoneDeskFollowUps();

    return {
      snapshotAt: snapshotAt.toISOString(),
      items,
      assigneeOptions,
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

  async function getPhoneDeskFollowUps() {
    const snapshotAt = now();
    return {
      snapshotAt: snapshotAt.toISOString(),
      items: await listOpenPhoneDeskFollowUps(),
    };
  }

  async function countPhoneDeskTransferConfirmationDuties(
    actor: StaffPrincipal,
  ) {
    const [rows, activeStaff] = await Promise.all([
      db
        .select({
          id: telephonyCallRoots.id,
          originalEndpointId: telephonyCallRoots.originalEndpointId,
          currentEndpointId: telephonyCallRoots.currentEndpointId,
          remotePhoneCiphertext: telephonyCallRoots.remotePhoneCiphertext,
          remotePhoneNonce: telephonyCallRoots.remotePhoneNonce,
          remotePhoneKeyVersion: telephonyCallRoots.remotePhoneKeyVersion,
          legEndpointId: telephonyCallLegs.endpointId,
          legStaffUserId: telephonyCallLegs.staffUserId,
        })
        .from(telephonyCallRoots)
        .leftJoin(
          telephonyCallLegs,
          eq(telephonyCallLegs.rootId, telephonyCallRoots.id),
        )
        .where(
          and(
            eq(telephonyCallRoots.scope, "external"),
            eq(telephonyCallRoots.correlationStatus, "needs_confirmation"),
            inArray(telephonyCallRoots.state, ["needs_confirmation", "ended"]),
          ),
        )
        .orderBy(
          desc(telephonyCallRoots.lastEventAt),
          asc(telephonyCallLegs.startedAt),
        ),
      activePhoneDeskStaff(),
    ]);
    if (rows.length === 0) return 0;

    const candidates = new Map<
      string,
      {
        id: string;
        remotePhoneCiphertext: Buffer | null;
        remotePhoneNonce: Buffer | null;
        remotePhoneKeyVersion: string | null;
        endpointIds: Set<string>;
        participantUserIds: Set<string>;
      }
    >();
    for (const row of rows) {
      let candidate = candidates.get(row.id);
      if (!candidate) {
        candidate = {
          id: row.id,
          remotePhoneCiphertext: row.remotePhoneCiphertext,
          remotePhoneNonce: row.remotePhoneNonce,
          remotePhoneKeyVersion: row.remotePhoneKeyVersion,
          endpointIds: new Set([
            row.originalEndpointId,
            ...(row.currentEndpointId ? [row.currentEndpointId] : []),
          ]),
          participantUserIds: new Set(),
        };
        candidates.set(row.id, candidate);
      }
      if (row.legEndpointId) candidate.endpointIds.add(row.legEndpointId);
      if (row.legStaffUserId) {
        candidate.participantUserIds.add(row.legStaffUserId);
      }
    }

    const rootIds = [...candidates.keys()];
    const endpointIds = [
      ...new Set(
        [...candidates.values()].flatMap((candidate) => [
          ...candidate.endpointIds,
        ]),
      ),
    ];
    const [relationRows, endpointOwnerRows] = await Promise.all([
      db
        .select({ rootId: telephonyCallRelations.rootId })
        .from(telephonyCallRelations)
        .where(
          and(
            inArray(telephonyCallRelations.rootId, rootIds),
            inArray(telephonyCallRelations.relationType, [
              ...PHONE_DESK_TRANSFER_RELATION_TYPES,
            ]),
          ),
        ),
      endpointIds.length
        ? db
            .select({
              endpointId: staffTelephonyBindings.endpointId,
              staffUserId: staffTelephonyBindings.staffUserId,
            })
            .from(staffTelephonyBindings)
            .innerJoin(
              telephonyEndpoints,
              and(
                eq(telephonyEndpoints.id, staffTelephonyBindings.endpointId),
                eq(telephonyEndpoints.isActive, true),
              ),
            )
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
                eq(staffMemberships.userId, staffUsers.id),
                eq(staffMemberships.isPrimary, true),
                eq(staffMemberships.isActive, true),
              ),
            )
            .where(
              and(
                inArray(staffTelephonyBindings.endpointId, endpointIds),
                eq(staffTelephonyBindings.isActive, true),
              ),
            )
        : [],
    ]);
    const transferRootIds = new Set(relationRows.map((row) => row.rootId));
    const endpointOwnerUserIds = new Map<string, string[]>();
    for (const row of endpointOwnerRows) {
      const owners = endpointOwnerUserIds.get(row.endpointId) ?? [];
      owners.push(row.staffUserId);
      endpointOwnerUserIds.set(row.endpointId, owners);
    }
    const transferCandidates = [...candidates.values()].filter((candidate) =>
      transferRootIds.has(candidate.id),
    );
    if (transferCandidates.length === 0) return 0;

    const remotePhoneByRoot = new Map<string, string>();
    for (const candidate of transferCandidates) {
      if (
        !candidate.remotePhoneCiphertext ||
        !candidate.remotePhoneNonce ||
        !candidate.remotePhoneKeyVersion
      ) {
        continue;
      }
      remotePhoneByRoot.set(
        candidate.id,
        protection.decrypt(
          {
            ciphertext: candidate.remotePhoneCiphertext,
            nonce: candidate.remotePhoneNonce,
            keyVersion: candidate.remotePhoneKeyVersion,
          },
          `telephony_inbound_calls/${candidate.id}/remote_phone`,
        ),
      );
    }
    const customerMatches = await resolvePhoneCustomers([
      ...remotePhoneByRoot.values(),
    ]);
    const activeStaffUserIds = new Set(
      activeStaff.map((staff) => staff.staffUserId),
    );
    const fallbackAdminUserIds = actor.roles.includes("admin")
      ? [actor.id]
      : [];

    return transferCandidates.reduce((total, candidate) => {
      const remotePhone = remotePhoneByRoot.get(candidate.id);
      const targetUserIds = phoneDeskTransferConfirmationDutyTargetUserIds({
        participantUserIds: [...candidate.participantUserIds],
        endpointOwnerUserIds: [...candidate.endpointIds].flatMap(
          (endpointId) => endpointOwnerUserIds.get(endpointId) ?? [],
        ),
        customerMatch: remotePhone
          ? customerMatches.get(remotePhone) ?? null
          : null,
        activeStaffUserIds,
        fallbackAdminUserIds,
      });
      return total + Number(targetUserIds.includes(actor.id));
    }, 0);
  }

  async function getPhoneDeskFollowUpDuty(actor: StaffPrincipal) {
    const snapshotAt = now();
    const notificationFloor = new Date(snapshotAt.getTime() - 60 * 60_000);
    const notificationHorizon = new Date(
      snapshotAt.getTime() + 24 * 60 * 60_000,
    );
    const [[summary], candidates, transferConfirmationCount] = await Promise.all([
      db
        .select({ count: count() })
        .from(telephonyFollowUpTasks)
        .where(
          and(
            eq(telephonyFollowUpTasks.state, "open"),
            eq(telephonyFollowUpTasks.assigneeUserId, actor.id),
          ),
        ),
      db
        .select({
          id: telephonyFollowUpTasks.id,
          consultationRequestId:
            telephonyFollowUpTasks.consultationRequestId,
          dueAt: telephonyFollowUpTasks.dueAt,
          dueEndAt: consultationRequests.contactWindowEnd,
        })
        .from(telephonyFollowUpTasks)
        .leftJoin(
          consultationRequests,
          eq(
            consultationRequests.id,
            telephonyFollowUpTasks.consultationRequestId,
          ),
        )
        .where(
          and(
            eq(telephonyFollowUpTasks.state, "open"),
            eq(telephonyFollowUpTasks.assigneeUserId, actor.id),
            gte(telephonyFollowUpTasks.dueAt, notificationFloor),
            lt(telephonyFollowUpTasks.dueAt, notificationHorizon),
          ),
        )
        .orderBy(asc(telephonyFollowUpTasks.dueAt))
        .limit(PHONE_DESK_MAX_LIMIT),
      countPhoneDeskTransferConfirmationDuties(actor),
    ]);
    const followUpCount = summary?.count ?? 0;
    return {
      snapshotAt: snapshotAt.toISOString(),
      count: followUpCount + transferConfirmationCount,
      followUpCount,
      transferConfirmationCount,
      items: candidates.map((task) => ({
        id: task.id,
        source: task.consultationRequestId
          ? ("consultation_schedule" as const)
          : ("aftercare" as const),
        dueAt: task.dueAt.toISOString(),
        dueEndAt: task.dueEndAt?.toISOString() ?? null,
      })),
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

  async function getPhoneDeskCall(callId: string, actor?: StaffPrincipal) {
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
    let canResolveFinalParticipant = false;
    if (call.callRootId === callId) {
      const [root] = await db
        .select({
          scope: telephonyCallRoots.scope,
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
        const resolutionLegs = await db
          .select({
            kind: telephonyCallLegs.kind,
            state: telephonyCallLegs.state,
          })
          .from(telephonyCallLegs)
          .where(eq(telephonyCallLegs.rootId, callId));
        canResolveFinalParticipant =
          canResolvePhoneDeskFinalParticipant({
            scope: root.scope,
            state: root.state,
            correlationStatus: root.correlationStatus,
            hasEndedCustomerLeg: resolutionLegs.some(
              (leg) => leg.kind === "customer" && leg.state === "ended",
            ),
            hasActiveCustomerLeg: resolutionLegs.some(
              (leg) => leg.kind === "customer" && leg.state !== "ended",
            ),
            lastEventAt: root.lastEventAt,
            resolutionAt: new Date(snapshot.snapshotAt),
          });
        const staleOneSided = isStaleOneSidedInternalCall({
          scope: call.scope,
          state: root.state,
          lastEventAt: root.lastEventAt,
          activeLegCount: call.participants.filter(
            (participant) => participant.state !== "ended",
          ).length,
          snapshotAt: new Date(snapshot.snapshotAt),
        });
        call = {
          ...call,
          id: callId,
          state:
            staleOneSided
              ? "unknown"
              : root.state === "ringing"
              ? "ringing"
              : root.state === "ended"
                ? "ended"
                : root.state === "needs_confirmation"
                  ? "unknown"
                  : "connected",
          endedAt: root.endedAt?.toISOString() ?? null,
          lastEventAt: root.lastEventAt.toISOString(),
          finalStaffUserId: root.finalStaffUserId,
          correlationStatus: staleOneSided
            ? "needs_confirmation"
            : root.correlationStatus,
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
    const aftercareAutomations = actor && call.scope !== "internal"
      ? await Promise.all(
          (["no_answer", "busy", "manager_callback_requested", "rejected"] as const).map(
            async (result) => {
              const [template] = await db
                .select()
                .from(messageTemplates)
                .where(
                  and(
                    eq(messageTemplates.ownerUserId, actor.id),
                    eq(messageTemplates.autoSendTrigger, result),
                  ),
                )
                .limit(1);
              if (!template) {
                return {
                  result,
                  kind: "message_template" as const,
                  available: false,
                  templateName: null,
                  templateBody: null,
                  latest: null,
                };
              }
              const directory = call.clickToCall?.directoryClient;
              const matchedCase = legalFriendsMatch?.cases[0];
              const directoryTarget = directory
                ? { clientIdx: directory.clientIdx, caseIdx: directory.caseIdx }
                : matchedCase
                  ? { clientIdx: matchedCase.clientIdx, caseIdx: matchedCase.caseIdx }
                  : null;
              const consultationId = call.aftercare?.consultationId ??
                (call.customerMatch?.source === "consultation"
                  ? call.customerMatch.consultation.id
                  : null);
              const [latest] = consultationId
                ? await db
                    .select({ status: telephonyMessages.commandStatus, occurredAt: telephonyMessages.requestedAt })
                    .from(telephonyMessages)
                    .innerJoin(messageTemplates, eq(messageTemplates.id, telephonyMessages.templateId))
                    .where(
                      and(
                        eq(messageTemplates.autoSendTrigger, result),
                        eq(telephonyMessages.consultationId, consultationId),
                      ),
                    )
                    .orderBy(desc(telephonyMessages.requestedAt))
                    .limit(1)
                : directoryTarget
                  ? await db
                      .select({ status: telephonyMessages.commandStatus, occurredAt: telephonyMessages.requestedAt })
                      .from(telephonyMessages)
                      .innerJoin(messageTemplates, eq(messageTemplates.id, telephonyMessages.templateId))
                      .innerJoin(
                        telephonyMessageDirectoryTargets,
                        eq(telephonyMessageDirectoryTargets.telephonyMessageId, telephonyMessages.id),
                      )
                      .where(
                        and(
                          eq(messageTemplates.autoSendTrigger, result),
                          eq(telephonyMessageDirectoryTargets.clientIdx, directoryTarget.clientIdx),
                          eq(telephonyMessageDirectoryTargets.caseIdx, directoryTarget.caseIdx),
                        ),
                      )
                      .orderBy(desc(telephonyMessages.requestedAt))
                      .limit(1)
                  : [];
              const status = latest?.status === "succeeded"
                ? "sent"
                : latest?.status === "queued" || latest?.status === "dispatching"
                  ? "pending"
                  : latest?.status === "failed"
                    ? "failed"
                    : latest
                      ? "unknown"
                      : null;
              return {
                result,
                kind: "message_template" as const,
                available: true,
                templateName: template.name,
                templateBody: template.body,
                latest: latest && status
                  ? { status, occurredAt: latest.occurredAt.toISOString() }
                  : null,
              };
            },
          ),
        )
      : [];
    return {
      snapshotAt: snapshot.snapshotAt,
      call,
      staffOptions,
      canResolveFinalParticipant,
      legalFriendsMatch,
      recommendedAssigneeUserIds: [...recommended].filter((id) =>
        staffOptions.some((staff) => staff.staffUserId === id),
      ),
      aftercareAutomations,
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
          scope: telephonyCallRoots.scope,
          state: telephonyCallRoots.state,
          correlationStatus: telephonyCallRoots.correlationStatus,
          currentEndpointId: telephonyCallRoots.currentEndpointId,
          endedAt: telephonyCallRoots.endedAt,
          lastEventAt: telephonyCallRoots.lastEventAt,
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
      if (root.correlationStatus !== "needs_confirmation") {
        throw new TelephonyCallError(
          "call_resolution_not_required",
          "이미 최종 통화자가 확인된 전화입니다.",
        );
      }
      const rootLegs = await tx
        .select({
          id: telephonyCallLegs.id,
          endpointId: telephonyCallLegs.endpointId,
          staffUserId: telephonyCallLegs.staffUserId,
          kind: telephonyCallLegs.kind,
          state: telephonyCallLegs.state,
          lastEventAt: telephonyCallLegs.lastEventAt,
        })
        .from(telephonyCallLegs)
        .where(eq(telephonyCallLegs.rootId, root.id))
        .for("update");
      if (
        !canResolvePhoneDeskFinalParticipant({
          scope: root.scope,
          state: root.state,
          correlationStatus: root.correlationStatus,
          hasEndedCustomerLeg: rootLegs.some(
            (leg) => leg.kind === "customer" && leg.state === "ended",
          ),
          hasActiveCustomerLeg: rootLegs.some(
            (leg) => leg.kind === "customer" && leg.state !== "ended",
          ),
          lastEventAt: root.lastEventAt,
          resolutionAt: resolvedAt,
        })
      ) {
        throw new TelephonyCallError(
          "call_not_ended",
          "마지막 고객 연결이 끝난 뒤 2분이 지나면 담당자를 확정할 수 있습니다.",
        );
      }

      let selectedLeg = input.finalLegId
        ? rootLegs.find((leg) => leg.id === input.finalLegId)
        : undefined;
      if (input.finalLegId && (!selectedLeg || !selectedLeg.staffUserId)) {
        throw new TelephonyCallError(
          "call_resolution_leg_invalid",
          "선택한 통화자의 직원 연결 정보를 확인할 수 없습니다.",
        );
      }
      if (input.finalLegId && selectedLeg?.state !== "ended") {
        throw new TelephonyCallError(
          "call_resolution_leg_active",
          "선택한 통화자의 종료가 아직 확인되지 않았습니다.",
        );
      }
      const selectedStaffUserId =
        input.finalStaffUserId ?? selectedLeg?.staffUserId ?? null;
      if (!selectedStaffUserId) {
        throw new TelephonyCallError(
          "call_resolution_staff_required",
          "실제로 통화한 직원을 선택해 주세요.",
        );
      }
      if (
        input.finalStaffUserId &&
        selectedLeg?.staffUserId &&
        input.finalStaffUserId !== selectedLeg.staffUserId
      ) {
        throw new TelephonyCallError(
          "call_resolution_staff_mismatch",
          "선택한 통화 leg와 직원 정보가 일치하지 않습니다.",
        );
      }
      const [selectedStaff] = await tx
        .select({ id: staffUsers.id })
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
            eq(staffUsers.id, selectedStaffUserId),
            eq(staffUsers.status, "active"),
          ),
        )
        .limit(1);
      if (!selectedStaff) {
        throw new TelephonyCallError(
          "call_resolution_staff_inactive",
          "선택한 직원의 활성 계정을 확인할 수 없습니다.",
        );
      }
      if (!selectedLeg) {
        selectedLeg = rootLegs
          .filter((leg) => leg.staffUserId === selectedStaffUserId)
          .sort((left, right) => {
            if (left.state === "ended" && right.state !== "ended") return -1;
            if (left.state !== "ended" && right.state === "ended") return 1;
            return right.lastEventAt.getTime() - left.lastEventAt.getTime();
          })[0];
      }
      const [selectedBinding] = await tx
        .select({ endpointId: staffTelephonyBindings.endpointId })
        .from(staffTelephonyBindings)
        .innerJoin(
          telephonyEndpoints,
          and(
            eq(telephonyEndpoints.id, staffTelephonyBindings.endpointId),
            eq(telephonyEndpoints.isActive, true),
          ),
        )
        .where(
          and(
            eq(staffTelephonyBindings.staffUserId, selectedStaffUserId),
            eq(staffTelephonyBindings.isActive, true),
          ),
        )
        .orderBy(
          desc(staffTelephonyBindings.isPrimary),
          desc(staffTelephonyBindings.assignedAt),
        )
        .limit(1);
      const finalEndpointId =
        selectedLeg?.endpointId ?? selectedBinding?.endpointId ?? null;
      const terminalAt = root.endedAt ?? root.lastEventAt;
      const terminalizedLegs = await tx
        .update(telephonyCallLegs)
        .set({
          state: "ended",
          endedAt: sql`greatest(${telephonyCallLegs.startedAt}, ${terminalAt})`,
          providerEndCause: "MANUAL_STAFF_CONFIRMATION",
          lastEventAt: sql`greatest(${telephonyCallLegs.lastEventAt}, ${terminalAt})`,
          updatedAt: resolvedAt,
        })
        .where(
          and(
            eq(telephonyCallLegs.rootId, root.id),
            inArray(telephonyCallLegs.state, ["ringing", "connected"]),
          ),
        )
        .returning({ id: telephonyCallLegs.id });
      await tx
        .update(telephonyCallRoots)
        .set({
          state: "ended",
          correlationStatus: "confirmed",
          currentEndpointId: finalEndpointId ?? root.currentEndpointId,
          finalEndpointId,
          finalStaffUserId: selectedStaffUserId,
          endedAt: terminalAt,
          lastEventAt: root.lastEventAt,
          updatedAt: resolvedAt,
        })
        .where(eq(telephonyCallRoots.id, root.id));
      await tx
        .insert(telephonyCallRelations)
        .values({
          id: createEventId(),
          rootId: root.id,
          fromLegId: selectedLeg?.id ?? null,
          toLegId: selectedLeg?.id ?? null,
          relationType: "staff_resolved",
          correlationStatus: "confirmed",
          correlationKey: `staff-resolved:${root.id}`,
          evidence: {
            method: "phone_desk_final_participant_selection_v2",
            selectedLegId: selectedLeg?.id ?? null,
            selectedStaffUserId,
            selectedEndpointId: finalEndpointId,
            rootStateBeforeResolution: root.state,
            terminalizedActiveLegCount: terminalizedLegs.length,
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
          finalLegId: selectedLeg?.id ?? null,
          finalEndpointId,
          finalStaffUserId: selectedStaffUserId,
          rootStateBeforeResolution: root.state,
          terminalizedActiveLegCount: terminalizedLegs.length,
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
    if (!isPhoneDeskAftercareWritableState(call.state)) {
      throw new TelephonyCallError(
        "call_not_ended",
        "통화가 연결된 뒤 후처리를 저장해 주세요.",
      );
    }
    if (call.state === "ended" && call.correlationStatus !== "confirmed") {
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
    const phonebookInput = input.phonebook?.mode === "save"
      ? {
          displayName: input.phonebook.displayName,
          originalPhone: input.phonebook.originalPhone,
          connectedPhone: input.phonebook.connectedPhone ?? null,
        }
      : null;
    if (phonebookInput && call.scope === "internal") {
      throw new TelephonyCallError(
        "phonebook_not_allowed",
        "내선 통화는 공용 전화번호부에 저장하지 않습니다.",
      );
    }
    if (
      phonebookInput &&
      (!call.remotePhone ||
        ![
          phonebookInput.originalPhone,
          phonebookInput.connectedPhone,
        ].includes(call.remotePhone))
    ) {
      throw new TelephonyCallError(
        "phonebook_call_phone_mismatch",
        "현재 통화 번호를 원번호 또는 연결번호에 포함해 주세요.",
      );
    }
    const callRootId = call.callRootId === callId ? callId : null;
    const confirmedAt = now();
    const dueAt = input.followUp.enabled
      ? assertValidFollowUpDueAt(input.followUp.dueAt, confirmedAt)
      : null;
    const observedCallId = callRootId ? null : call.observedCallId;
    const telephonyCallId = callRootId ? null : call.clickToCall?.id ?? null;
    const remotePhoneFingerprint = call.remotePhone
      ? protection.fingerprint(call.remotePhone)
      : null;
    const automaticTrigger = (["no_answer", "busy", "manager_callback_requested", "rejected"] as const)
      .find((value) => value === input.result) ?? null;
    if (automaticTrigger === "manager_callback_requested" && !input.followUp.enabled) {
      const [automaticTemplate] = await db
        .select({ id: messageTemplates.id })
        .from(messageTemplates)
        .where(
          and(
            eq(messageTemplates.ownerUserId, actor.id),
            eq(messageTemplates.autoSendTrigger, automaticTrigger),
          ),
        )
        .limit(1);
      if (automaticTemplate) {
        throw new TelephonyCallError(
          "follow_up_due_invalid",
          "담당자 연결 요청 자동문자를 보내려면 재통화 업무와 일정을 함께 저장해 주세요.",
        );
      }
    }
    let savedAftercareId: string | null = null;
    let savedConsultationId: string | null = null;

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
        let directorySource:
          | LegalFriendsDirectoryConsultationSourceRow
          | undefined;
        if (input.consultation.directorySource) {
          const sourceResult = await tx.execute(
            sql<LegalFriendsDirectoryConsultationSourceRow>`SELECT * FROM public.resolve_legalfriends_directory_consultation_source(${input.consultation.directorySource.clientIdx}, ${input.consultation.directorySource.caseIdx})`,
          );
          [directorySource] =
            sourceResult.rows as LegalFriendsDirectoryConsultationSourceRow[];
          if (!directorySource) {
            throw new TelephonyCallError(
              "directory_target_not_found",
              "삭제되었거나 현재 조회할 수 없는 소개자 사건입니다.",
            );
          }
        }
        consultationId = createConsultationId();
        const requestId = createConsultationRequestId();
        const receiptCode = createPublicReceiptCode(confirmedAt);
        const customerName = formatConsultationCustomerName(
          input.consultation.customerName,
          input.consultation.customerNameTag ?? "none",
        );
        const nameEncrypted = protection.encrypt(
          customerName,
          `consultations.preferred_name:${consultationId}`,
        );
        const requestNameEncrypted = protection.encrypt(
          customerName,
          `consultation_requests.name:${requestId}`,
        );
        const directorySourceSnapshotEncrypted = directorySource
          ? protection.encrypt(
              JSON.stringify(
                legalFriendsDirectoryConsultationSnapshot(directorySource),
              ),
              `consultation_directory_sources/${consultationId}/snapshot`,
            )
          : null;
        const phoneEncrypted = protection.encrypt(
          call.remotePhone,
          `consultation_requests.phone:${requestId}`,
        );
        const intake = {
          channel: "phone_desk",
          callId,
          direction: call.direction,
          residenceRegion: input.consultation.residenceRegion,
          note: "직원이 통화 후 전화데스크에서 생성한 신건상담",
          ...(input.consultation.transferNote
            ? { transferNote: input.consultation.transferNote }
            : {}),
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
          createdByUserId: actor.id,
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
        if (
          input.consultation.directorySource &&
          directorySourceSnapshotEncrypted
        ) {
          await tx.insert(consultationDirectorySources).values({
            consultationId,
            consultationRequestId: requestId,
            directoryClientIdx: input.consultation.directorySource.clientIdx,
            directoryCaseIdx: input.consultation.directorySource.caseIdx,
            relationship: "referrer",
            snapshotCiphertext: directorySourceSnapshotEncrypted.ciphertext,
            snapshotNonce: directorySourceSnapshotEncrypted.nonce,
            snapshotKeyVersion: directorySourceSnapshotEncrypted.keyVersion,
            createdByUserId: actor.id,
            createdAt: confirmedAt,
          });
        }
        await tx.insert(consultationStatusHistory).values({
          id: createEventId(),
          consultationId,
          fromState: null,
          toState: "requested",
          reason: input.consultation.directorySource
            ? "phone_desk_referral_conversion"
            : "phone_desk_conversion",
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
      savedAftercareId = aftercareId;
      savedConsultationId = consultationId;
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
      if (phonebookInput) {
        await writePhonebookContact(
          tx,
          phonebookInput,
          actor,
          call.customerMatch?.source === "phonebook"
            ? call.customerMatch.contact.id
            : null,
          confirmedAt,
        );
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
          customerNameTag:
            input.consultation.mode === "create"
              ? input.consultation.customerNameTag ?? "none"
              : null,
          directorySourceRelationship:
            input.consultation.mode === "create"
              ? input.consultation.directorySource?.relationship ?? null
              : null,
          consultationId,
          followUpEnabled: input.followUp.enabled,
          followUpAssigneeUserId: input.followUp.enabled
            ? input.followUp.assigneeUserId
            : null,
          phonebookSaved: Boolean(phonebookInput),
        },
        occurredAt: confirmedAt,
        createdAt: confirmedAt,
      });
    });
    const automaticSourceId = savedAftercareId as string | null;
    if (input.automaticMessage?.enabled && automaticTrigger && automaticSourceId) {
      let automaticTarget:
        | { source: "consultation"; consultationId: string; customerName: string; receiptCode: string }
        | { source: "legal_friends_directory"; clientIdx: number; caseIdx: number; customerName: string; receiptCode: string }
        | null = null;
      if (savedConsultationId) {
        const [consultation] = await db
          .select({
            id: consultations.id,
            publicReceiptCode: consultations.publicReceiptCode,
            preferredNameCiphertext: consultations.preferredNameCiphertext,
            preferredNameNonce: consultations.preferredNameNonce,
            preferredNameKeyVersion: consultations.preferredNameKeyVersion,
            anonymousLabel: consultations.anonymousLabel,
          })
          .from(consultations)
          .where(eq(consultations.id, savedConsultationId))
          .limit(1);
        if (consultation) {
          automaticTarget = {
            source: "consultation",
            consultationId: consultation.id,
            customerName:
              consultation.preferredNameCiphertext && consultation.preferredNameNonce && consultation.preferredNameKeyVersion
                ? protection.decrypt(
                    {
                      ciphertext: consultation.preferredNameCiphertext,
                      nonce: consultation.preferredNameNonce,
                      keyVersion: consultation.preferredNameKeyVersion,
                    },
                    `consultations.preferred_name:${consultation.id}`,
                  )
                : consultation.anonymousLabel,
            receiptCode: consultation.publicReceiptCode,
          };
        }
      } else {
        const directory = call.clickToCall?.directoryClient;
        const matchedCase = detail.legalFriendsMatch?.cases[0];
        if (directory) {
          automaticTarget = {
            source: "legal_friends_directory",
            clientIdx: directory.clientIdx,
            caseIdx: directory.caseIdx,
            customerName: directory.displayName,
            receiptCode: "리걸프렌즈",
          };
        } else if (detail.legalFriendsMatch && matchedCase) {
          automaticTarget = {
            source: "legal_friends_directory",
            clientIdx: matchedCase.clientIdx,
            caseIdx: matchedCase.caseIdx,
            customerName: detail.legalFriendsMatch.clientName,
            receiptCode: matchedCase.caseNumber ?? "리걸프렌즈",
          };
        }
      }
      if (automaticTarget) {
        const followUpAssigneeUserId = input.followUp.enabled ? input.followUp.assigneeUserId : null;
        const scheduleText = automaticTrigger === "manager_callback_requested" && dueAt
          ? automaticCallbackScheduleText(
              dueAt,
              detail.staffOptions.find((staff) => staff.staffUserId === followUpAssigneeUserId)?.displayName ?? actor.displayName,
            )
          : undefined;
        await requestAutomaticMessage(
          {
            trigger: automaticTrigger,
            sourceId: automaticSourceId,
            target: automaticTarget.source === "consultation"
              ? { source: "consultation", consultationId: automaticTarget.consultationId }
              : { source: "legal_friends_directory", clientIdx: automaticTarget.clientIdx, caseIdx: automaticTarget.caseIdx },
            customerName: automaticTarget.customerName,
            receiptCode: automaticTarget.receiptCode,
            ...(scheduleText ? { scheduleText } : {}),
          },
          actor,
        );
      }
    }
    if (phonebookInput) phoneCustomerCache.clear();
    return getPhoneDeskCall(callId, actor);
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
          consultationRequestId:
            telephonyFollowUpTasks.consultationRequestId,
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
        metadata: {
          ...(task.aftercareId ? { aftercareId: task.aftercareId } : {}),
          ...(task.consultationRequestId
            ? { consultationRequestId: task.consultationRequestId }
            : {}),
        },
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
    targetSource:
      | "consultation"
      | "legal_friends_directory"
      | "manual"
      | null;
    caseIdx: string | null;
    clientIdx: number | null;
    consultationId: string | null;
    manualContactId: string | null;
    customerName: string;
    phone: string;
    receiptCode?: string | null;
  };

  async function loadMessageHubRows(input?: {
    outgoingIds?: readonly string[];
    incomingIds?: readonly string[];
    includeMailboxes?: boolean;
  }) {
    const outgoingIds = input?.outgoingIds;
    const incomingIds = input?.incomingIds;
    const outgoing = await db
      .select({
        id: telephonyMessages.id,
        targetSource: telephonyMessages.targetSource,
        consultationId: telephonyMessages.consultationId,
        consultationRequestId: telephonyMessages.consultationRequestId,
        manualContactId: telephonyMessages.manualContactId,
        manualPhoneCiphertext: telephonyMessageManualContacts.phoneCiphertext,
        manualPhoneNonce: telephonyMessageManualContacts.phoneNonce,
        manualPhoneKeyVersion: telephonyMessageManualContacts.phoneKeyVersion,
        manualDisplayNameCiphertext:
          telephonyMessageManualContacts.displayNameCiphertext,
        manualDisplayNameNonce: telephonyMessageManualContacts.displayNameNonce,
        manualDisplayNameKeyVersion:
          telephonyMessageManualContacts.displayNameKeyVersion,
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
        telephonyMessageManualContacts,
        eq(
          telephonyMessageManualContacts.id,
          telephonyMessages.manualContactId,
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
      .where(
        outgoingIds
          ? outgoingIds.length > 0
            ? inArray(telephonyMessages.id, [...outgoingIds])
            : sql<boolean>`false`
          : undefined,
      )
      .orderBy(desc(telephonyMessages.requestedAt));

    const incoming = await db
      .select({
        id: telephonyInboundMessages.id,
        matchedOutboundMessageId:
          telephonyInboundMessages.matchedOutboundMessageId,
        targetSource: telephonyInboundMessages.targetSource,
        consultationId: telephonyInboundMessages.consultationId,
        manualContactId: telephonyInboundMessages.manualContactId,
        manualPhoneCiphertext: telephonyMessageManualContacts.phoneCiphertext,
        manualPhoneNonce: telephonyMessageManualContacts.phoneNonce,
        manualPhoneKeyVersion: telephonyMessageManualContacts.phoneKeyVersion,
        manualDisplayNameCiphertext:
          telephonyMessageManualContacts.displayNameCiphertext,
        manualDisplayNameNonce: telephonyMessageManualContacts.displayNameNonce,
        manualDisplayNameKeyVersion:
          telephonyMessageManualContacts.displayNameKeyVersion,
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
        telephonyMessageManualContacts,
        eq(
          telephonyMessageManualContacts.id,
          telephonyInboundMessages.manualContactId,
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
      .where(
        incomingIds
          ? incomingIds.length > 0
            ? inArray(telephonyInboundMessages.id, [...incomingIds])
            : sql<boolean>`false`
          : undefined,
      )
      .orderBy(desc(telephonyInboundMessages.receivedAt));

    const mailboxes = input?.includeMailboxes === false ? [] : await db
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
    if (row.targetSource === "manual" && row.manualContactId) {
      const customerName = decryptedOptional(
        {
          ciphertext: row.manualDisplayNameCiphertext,
          nonce: row.manualDisplayNameNonce,
          keyVersion: row.manualDisplayNameKeyVersion,
        },
        `telephony_message_manual_contacts/${row.manualContactId}/display_name`,
      );
      const phone = decryptedOptional(
        {
          ciphertext: row.manualPhoneCiphertext,
          nonce: row.manualPhoneNonce,
          keyVersion: row.manualPhoneKeyVersion,
        },
        `telephony_message_manual_contacts/${row.manualContactId}/phone`,
      );
      return {
        key: `manual:${row.manualContactId}`,
        targetSource: "manual",
        caseIdx: null,
        clientIdx: null,
        consultationId: null,
        manualContactId: row.manualContactId,
        customerName: customerName ?? "직접 입력 고객",
        phone: phone ? messagePhoneDisplay(phone) : "번호 미확인",
      };
    }
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
        targetSource: "legal_friends_directory",
        caseIdx: String(row.directoryCaseIdx),
        clientIdx: row.directoryClientIdx,
        consultationId: null,
        manualContactId: null,
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
      targetSource: "consultation",
      caseIdx: row.legalFriendsCaseIdx ?? null,
      clientIdx: null,
      consultationId: row.consultationId,
      manualContactId: null,
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
    if (row.targetSource === "manual" && row.manualContactId) {
      const customerName = decryptedOptional(
        {
          ciphertext: row.manualDisplayNameCiphertext,
          nonce: row.manualDisplayNameNonce,
          keyVersion: row.manualDisplayNameKeyVersion,
        },
        `telephony_message_manual_contacts/${row.manualContactId}/display_name`,
      );
      return {
        key: `manual:${row.manualContactId}`,
        targetSource: "manual",
        caseIdx: null,
        clientIdx: null,
        consultationId: null,
        manualContactId: row.manualContactId,
        customerName: customerName ?? "직접 입력 고객",
        phone: messagePhoneDisplay(phone),
      };
    }
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
        targetSource: "legal_friends_directory",
        caseIdx: String(row.directoryCaseIdx),
        clientIdx: row.directoryClientIdx,
        consultationId: null,
        manualContactId: null,
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
        targetSource: "consultation",
        caseIdx: row.legalFriendsCaseIdx ?? null,
        clientIdx: null,
        consultationId: row.consultationId,
        manualContactId: null,
        customerName,
        phone: messagePhoneDisplay(phone),
        receiptCode: row.consultationReceiptCode,
      };
    }
    return {
      key: `unmatched:${row.id}`,
      targetSource: null,
      caseIdx: null,
      clientIdx: null,
      consultationId: null,
      manualContactId: null,
      customerName: "고객 연결 확인 필요",
      phone: messagePhoneDisplay(phone),
    };
  }

  const messageRecordUnion = sql`
    select
      case
        when message.target_source = 'legal_friends_directory'
          and directory_target.case_idx is not null
          then 'case:' || directory_target.case_idx::text
        when message.target_source = 'manual'
          and message.manual_contact_id is not null
          then 'manual:' || message.manual_contact_id::text
        when message.target_source = 'consultation'
          and case_link.case_idx is not null
          then 'case:' || case_link.case_idx::text
        when message.target_source = 'consultation'
          and message.consultation_id is not null
          then 'consultation:' || message.consultation_id::text
        else null
      end as thread_key,
      message.id as message_id,
      'outbound'::text as direction,
      message.message_kind::text as message_kind,
      message.requested_at as occurred_at,
      false as needs_connection
    from telephony_messages as message
    left join telephony_message_directory_targets as directory_target
      on directory_target.telephony_message_id = message.id
    left join legalfriends_case_links as case_link
      on case_link.consultation_id = message.consultation_id

    union all

    select
      case
        when inbound.target_source = 'legal_friends_directory'
          and inbound.directory_case_idx is not null
          then 'case:' || inbound.directory_case_idx::text
        when inbound.target_source = 'manual'
          and inbound.manual_contact_id is not null
          then 'manual:' || inbound.manual_contact_id::text
        when inbound.target_source = 'consultation'
          and case_link.case_idx is not null
          then 'case:' || case_link.case_idx::text
        when inbound.target_source = 'consultation'
          and inbound.consultation_id is not null
          then 'consultation:' || inbound.consultation_id::text
        else 'unmatched:' || inbound.id::text
      end as thread_key,
      inbound.id as message_id,
      'inbound'::text as direction,
      inbound.message_kind::text as message_kind,
      inbound.received_at as occurred_at,
      inbound.match_strategy = 'unmatched' as needs_connection
    from telephony_inbound_messages as inbound
    left join legalfriends_case_links as case_link
      on case_link.consultation_id = inbound.consultation_id
  `;

  type MessageHubPageRow = {
    thread_key: string;
    message_id: string;
    direction: "outbound" | "inbound";
    message_kind: "sms" | "lms" | "mms";
    occurred_at: Date | string;
    message_count: number;
    needs_connection: boolean;
    unread_count: number;
    total_threads: number;
    needs_connection_total: number;
  };

  type MessageTimelinePageRow = {
    thread_key: string;
    message_id: string;
    direction: "outbound" | "inbound";
    occurred_at: Date | string;
  };

  async function loadMessageHubPage(
    actor: StaffPrincipal,
    input?: { cursor?: string; limit?: number },
  ) {
    const limit = messagePageLimit(input?.limit);
    const cursor = decodeMessagePageCursor(input?.cursor);
    if (input?.cursor && (!cursor || !isMessageThreadKey(cursor.id))) {
      throw new TelephonyCallError(
        "message_cursor_invalid",
        "문자 목록을 이어 불러올 위치가 올바르지 않습니다.",
      );
    }
    const cursorCondition = cursor
      ? sql`and (has_unread, occurred_at, thread_key) < (${cursor.unread ?? false}, ${new Date(cursor.occurredAt)}, ${cursor.id})`
      : sql``;
    const result = await db.execute(sql<MessageHubPageRow>`
      with message_records as (${messageRecordUnion}),
      ranked as (
        select
          message_records.*,
          row_number() over (
            partition by thread_key
            order by occurred_at desc, message_id desc, direction desc
          ) as thread_rank,
          count(*) over (partition by thread_key)::int as message_count,
          bool_or(needs_connection) over (
            partition by thread_key
          ) as thread_needs_connection,
          count(notification.inbound_message_id) over (
            partition by thread_key
          )::int as unread_count
        from message_records
        left join telephony_inbound_message_notifications as notification
          on message_records.direction = 'inbound'
          and notification.inbound_message_id = message_records.message_id
          and notification.staff_user_id = ${actor.id}
          and notification.read_at is null
        where thread_key is not null
      ),
      thread_heads as (
        select
          thread_key,
          message_id,
          direction,
          message_kind,
          occurred_at,
          message_count,
          thread_needs_connection as needs_connection,
          unread_count,
          unread_count > 0 as has_unread
        from ranked
        where thread_rank = 1
      )
      select
        thread_heads.*,
        (select count(*)::int from thread_heads) as total_threads,
        (
          select count(*)::int
          from thread_heads
          where needs_connection
        ) as needs_connection_total
      from thread_heads
      where true ${cursorCondition}
      order by has_unread desc, occurred_at desc, thread_key desc
      limit ${limit + 1}
    `);
    const rows = result.rows as MessageHubPageRow[];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      total: rows[0]?.total_threads ?? 0,
      needsConnectionTotal: rows[0]?.needs_connection_total ?? 0,
      nextCursor:
        hasMore && last
          ? encodeMessagePageCursor({
              occurredAt: new Date(last.occurred_at).toISOString(),
              id: last.thread_key,
              unread: last.unread_count > 0,
            })
          : null,
    };
  }

  async function loadMessageTimelinePage(
    threadKey: string,
    input?: { cursor?: string; limit?: number },
  ) {
    const limit = messagePageLimit(input?.limit);
    const cursor = decodeMessagePageCursor(input?.cursor);
    if (
      input?.cursor &&
      (!cursor || !cursor.direction || !isUuid(cursor.id))
    ) {
      throw new TelephonyCallError(
        "message_cursor_invalid",
        "이전 문자를 이어 불러올 위치가 올바르지 않습니다.",
      );
    }
    const cursorCondition = cursor
      ? sql`and (occurred_at, message_id, direction) < (${new Date(cursor.occurredAt)}, ${cursor.id}::uuid, ${cursor.direction})`
      : sql``;
    const result = await db.execute(sql<MessageTimelinePageRow>`
      with message_records as (${messageRecordUnion})
      select thread_key, message_id, direction, occurred_at
      from message_records
      where thread_key = ${threadKey} ${cursorCondition}
      order by occurred_at desc, message_id desc, direction desc
      limit ${limit + 1}
    `);
    const rows = result.rows as MessageTimelinePageRow[];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeMessagePageCursor({
              occurredAt: new Date(last.occurred_at).toISOString(),
              id: last.message_id,
              direction: last.direction,
            })
          : null,
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

  async function getMessageHub(
    actor: StaffPrincipal,
    query?: { cursor?: string; limit?: number },
  ) {
    const page = await loadMessageHubPage(actor, query);
    const outgoingIds = page.items
      .filter((item) => item.direction === "outbound")
      .map((item) => item.message_id);
    const incomingIds = page.items
      .filter((item) => item.direction === "inbound")
      .map((item) => item.message_id);
    const { outgoing, incoming, mailboxes } = await loadMessageHubRows({
      outgoingIds,
      incomingIds,
    });
    const outgoingById = new Map(outgoing.map((row) => [row.id, row]));
    const incomingById = new Map(incoming.map((row) => [row.id, row]));
    type MessageThreadSummary = MessageThreadIdentity & {
      messageCount: number;
      lastDirection: "outbound" | "inbound";
      lastMessageKind: "sms" | "lms" | "mms";
      lastMessagePreview: string;
      lastMessageAt: string;
      needsConnection: boolean;
      unreadCount: number;
    };
    const items = page.items.flatMap<MessageThreadSummary>((record) => {
      if (record.direction === "outbound") {
        const row = outgoingById.get(record.message_id);
        if (!row) return [];
        const identity = outgoingThreadIdentity(row);
        if (!identity) return [];
        const body = protection.decrypt(
          {
            ciphertext: row.bodyCiphertext,
            nonce: row.bodyNonce,
            keyVersion: row.bodyKeyVersion,
          },
          `telephony_messages/${row.id}/body`,
        );
        return [{
          ...identity,
          messageCount: record.message_count,
          lastDirection: record.direction,
          lastMessageKind: row.messageKind,
          lastMessagePreview: body.slice(0, 90),
          lastMessageAt: row.requestedAt.toISOString(),
          needsConnection: record.needs_connection,
          unreadCount: record.unread_count,
        }];
      }
      const row = incomingById.get(record.message_id);
      if (!row) return [];
      const body = protection.decrypt(
        {
          ciphertext: row.bodyCiphertext,
          nonce: row.bodyNonce,
          keyVersion: row.bodyKeyVersion,
        },
        `telephony_inbound_messages/${row.id}/body`,
      );
      return [{
        ...incomingThreadIdentity(row),
        messageCount: record.message_count,
        lastDirection: record.direction,
        lastMessageKind: row.messageKind,
        lastMessagePreview: body.slice(0, 90),
        lastMessageAt: row.receivedAt.toISOString(),
        needsConnection: record.needs_connection,
        unreadCount: record.unread_count,
      }];
    });
    await auditMessageView({
      actor,
      action: "telephony.message_hub.viewed",
      targetType: "telephony_message_hub",
      targetId: actor.id,
      metadata: {
        threadCount: page.total,
        unmatchedCount: page.needsConnectionTotal,
        pageSize: items.length,
      },
    });
    return {
      items,
      total: page.total,
      needsConnectionTotal: page.needsConnectionTotal,
      nextCursor: page.nextCursor,
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

  async function getMessageDutyCount(actor: StaffPrincipal) {
    const [row] = await db
      .select({ count: count() })
      .from(telephonyInboundMessageNotifications)
      .where(and(
        eq(telephonyInboundMessageNotifications.staffUserId, actor.id),
        isNull(telephonyInboundMessageNotifications.readAt),
      ));
    return { count: row?.count ?? 0 };
  }

  async function getMessageNotification(messageId: string, actor: StaffPrincipal) {
    const [allowed] = await db
      .select({ id: telephonyInboundMessageNotifications.inboundMessageId })
      .from(telephonyInboundMessageNotifications)
      .where(and(
        eq(telephonyInboundMessageNotifications.inboundMessageId, messageId),
        eq(telephonyInboundMessageNotifications.staffUserId, actor.id),
      ))
      .limit(1);
    if (!allowed) return null;
    const { incoming } = await loadMessageHubRows({ outgoingIds: [], incomingIds: [messageId], includeMailboxes: false });
    const row = incoming[0];
    if (!row) return null;
    const identity = incomingThreadIdentity(row);
    return {
      id: row.id,
      threadKey: identity.key,
      href: `/messages?thread=${encodeURIComponent(identity.key)}`,
      customerLabel: identity.customerName,
      receivedAt: row.receivedAt.toISOString(),
    };
  }

  async function listUnreadMessageNotifications(actor: StaffPrincipal) {
    const rows = await db
      .select({ messageId: telephonyInboundMessageNotifications.inboundMessageId })
      .from(telephonyInboundMessageNotifications)
      .where(and(
        eq(telephonyInboundMessageNotifications.staffUserId, actor.id),
        isNull(telephonyInboundMessageNotifications.readAt),
      ))
      .orderBy(desc(telephonyInboundMessageNotifications.createdAt))
      .limit(20);
    return { items: rows };
  }

  async function getMessageThread(
    threadKey: string,
    actor: StaffPrincipal,
    query?: { cursor?: string; limit?: number },
  ) {
    if (!isMessageThreadKey(threadKey)) {
      throw new TelephonyCallError(
        "message_thread_not_found",
        "문자 대화를 찾을 수 없습니다.",
      );
    }
    const page = await loadMessageTimelinePage(threadKey, query);
    const outgoingIds = page.items
      .filter((item) => item.direction === "outbound")
      .map((item) => item.message_id);
    const incomingIds = page.items
      .filter((item) => item.direction === "inbound")
      .map((item) => item.message_id);
    const { outgoing, incoming } = await loadMessageHubRows({
      outgoingIds,
      incomingIds,
      includeMailboxes: false,
    });
    const outgoingById = new Map(outgoing.map((row) => [row.id, row]));
    const incomingById = new Map(incoming.map((row) => [row.id, row]));
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
    for (const record of page.items) {
      if (record.direction === "outbound") {
        const row = outgoingById.get(record.message_id);
        if (!row) continue;
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
        continue;
      }
      const row = incomingById.get(record.message_id);
      if (!row) continue;
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
    timeline.reverse();
    await db.execute(sql`
      with message_records as (${messageRecordUnion})
      update telephony_inbound_message_notifications as notification
      set read_at = ${now()}, updated_at = ${now()}
      where notification.staff_user_id = ${actor.id}
        and notification.read_at is null
        and notification.inbound_message_id in (
          select message_id from message_records
          where thread_key = ${threadKey} and direction = 'inbound'
        )
    `);
    await auditMessageView({
      actor,
      action: "telephony.message_thread.viewed",
      targetType: "telephony_message_thread",
      targetId: threadKey,
      metadata: {
        caseIdx: target.caseIdx,
        messageCount: timeline.length,
        hasOlder: Boolean(page.nextCursor),
      },
    });
    return { thread: target, timeline, nextCursor: page.nextCursor };
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

  async function requestAutomaticMessage(
    input: {
      trigger: MessageTemplateAutoSendTrigger;
      sourceId: string;
      target:
        | { source: "consultation"; consultationId: string }
        | { source: "legal_friends_directory"; clientIdx: number; caseIdx: number };
      customerName: string;
      receiptCode: string;
      scheduleText?: string;
    },
    actor: StaffPrincipal,
  ) {
    const [template] = await db
      .select()
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.ownerUserId, actor.id),
          eq(messageTemplates.autoSendTrigger, input.trigger),
        ),
      )
      .limit(1);
    if (!template) return null;
    let body = renderMessageTemplate(template.body, {
      "{{고객명}}": input.customerName,
      "{{담당자명}}": actor.displayName,
      "{{접수번호}}": input.receiptCode,
    });
    if (input.scheduleText) body = `${body.trimEnd()}\n\n${input.scheduleText}`;
    if (centrexMessageKind(body) === "too_long") {
      throw new TelephonyCallError(
        "message_body_invalid",
        "자동발송 문구를 포함하면 720바이트를 초과합니다. 템플릿 내용을 줄여 주세요.",
      );
    }
    const messageInput = {
      idempotencyKey: stableUuid(`automatic-message:${input.sourceId}:${input.trigger}`),
      templateId: template.id,
      body,
    };
    return input.target.source === "consultation"
      ? requestMessage(input.target.consultationId, messageInput, actor)
      : requestDirectoryMessage(
          { clientIdx: input.target.clientIdx, caseIdx: input.target.caseIdx },
          messageInput,
          actor,
        );
  }

  async function requestConsultationAssignedAutomaticMessage(
    consultationId: string,
    assignmentId: string,
    actor: StaffPrincipal,
  ) {
    const [consultation] = await db
      .select({
        id: consultations.id,
        publicReceiptCode: consultations.publicReceiptCode,
        anonymousLabel: consultations.anonymousLabel,
        preferredNameCiphertext: consultations.preferredNameCiphertext,
        preferredNameNonce: consultations.preferredNameNonce,
        preferredNameKeyVersion: consultations.preferredNameKeyVersion,
      })
      .from(consultations)
      .where(eq(consultations.id, consultationId))
      .limit(1);
    if (!consultation) return null;
    const [messageableRequest] = await db
      .select({ id: consultationRequests.id })
      .from(consultationRequests)
      .where(
        and(
          eq(consultationRequests.consultationId, consultationId),
          isNotNull(consultationRequests.phoneCiphertext),
          isNotNull(consultationRequests.phoneNonce),
          isNotNull(consultationRequests.phoneKeyVersion),
          isNotNull(consultationRequests.phoneFingerprint),
        ),
      )
      .orderBy(desc(consultationRequests.submittedAt))
      .limit(1);
    if (!messageableRequest) return null;
    const customerName =
      consultation.preferredNameCiphertext && consultation.preferredNameNonce && consultation.preferredNameKeyVersion
        ? protection.decrypt(
            {
              ciphertext: consultation.preferredNameCiphertext,
              nonce: consultation.preferredNameNonce,
              keyVersion: consultation.preferredNameKeyVersion,
            },
            `consultations.preferred_name:${consultation.id}`,
          )
        : consultation.anonymousLabel;
    return requestAutomaticMessage(
      {
        trigger: "consultation_assigned",
        sourceId: assignmentId,
        target: { source: "consultation", consultationId },
        customerName,
        receiptCode: consultation.publicReceiptCode,
      },
      actor,
    );
  }

  function templateResponse(template: typeof messageTemplates.$inferSelect) {
    return {
      id: template.id,
      name: template.name,
      body: template.body,
      bodyByteLength: template.bodyByteLength,
      autoSendTrigger: template.autoSendTrigger,
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
    if (input.autoSendTrigger) {
      const [triggerConflict] = await db
        .select({ id: messageTemplates.id })
        .from(messageTemplates)
        .where(
          and(
            eq(messageTemplates.ownerUserId, actor.id),
            eq(messageTemplates.autoSendTrigger, input.autoSendTrigger),
          ),
        )
        .limit(1);
      if (triggerConflict) {
        throw new TelephonyCallError(
          "message_template_auto_send_conflict",
          "이 자동발송 조건은 다른 내 템플릿에서 이미 사용 중입니다.",
        );
      }
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
        autoSendTrigger: input.autoSendTrigger,
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
      if (input.autoSendTrigger) {
        const [triggerConflict] = await tx
          .select({ id: messageTemplates.id })
          .from(messageTemplates)
          .where(
            and(
              ne(messageTemplates.id, templateId),
              eq(messageTemplates.ownerUserId, actor.id),
              eq(messageTemplates.autoSendTrigger, input.autoSendTrigger),
            ),
          )
          .limit(1);
        if (triggerConflict) {
          throw new TelephonyCallError(
            "message_template_auto_send_conflict",
            "이 자동발송 조건은 다른 내 템플릿에서 이미 사용 중입니다.",
          );
        }
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
          autoSendTrigger: input.autoSendTrigger,
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
    const directImage = input.image
      ? await uploadTemplateImage(input.image)
      : null;
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
      const [request] = await tx
        .select({
          id: consultationRequests.id,
          phoneFingerprint: consultationRequests.phoneFingerprint,
        })
        .from(consultationRequests)
        .where(
          and(
            or(
              eq(consultationRequests.consultationId, consultationId),
              inArray(
                consultationRequests.consultationId,
                tx
                  .select({
                    consultationId:
                      consultationGroupMembers.consultationId,
                  })
                  .from(consultationGroupMembers)
                  .innerJoin(
                    consultationGroups,
                    eq(
                      consultationGroups.id,
                      consultationGroupMembers.groupId,
                    ),
                  )
                  .where(
                    and(
                      eq(consultationGroups.status, "active"),
                      eq(
                        consultationGroups.canonicalConsultationId,
                        consultationId,
                      ),
                    ),
                  ),
              ),
            ),
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
      if (directImage) {
        imageFileId = directImage.imageFileId;
        imageUrl = directImage.imageUrl;
        imageOriginalName = directImage.imageOriginalName;
      }

      const provider = imageFileId ? ("solapi" as const) : ("centrex" as const);
      const messageKind = imageFileId ? ("mms" as const) : textKind;
      if (provider === "solapi" && (!solapiClient || !solapiMmsSender)) {
        throw new TelephonyCallError(
          "mms_feature_disabled",
          "이미지 문자를 보내려면 솔라피 MMS 발신번호 설정이 필요합니다.",
        );
      }
      const route = await resolveMessageDeliveryRoute(tx, provider, actor.id);

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
                endpointId: route.endpointId,
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
                endpointId: route.endpointId,
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
          endpointId: route.endpointId,
          senderNumberSnapshot: route.senderNumberSnapshot,
          replyMailboxEndpointId: route.replyMailboxEndpointId,
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
          endpointId: route.endpointId,
          replyMailboxEndpointId: route.replyMailboxEndpointId,
          senderNumberSnapshot: route.senderNumberSnapshot,
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
    const directImage = input.image
      ? await uploadTemplateImage(input.image)
      : null;
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
      if (directImage) {
        imageFileId = directImage.imageFileId;
        imageUrl = directImage.imageUrl;
        imageOriginalName = directImage.imageOriginalName;
      }

      const provider = imageFileId ? ("solapi" as const) : ("centrex" as const);
      const messageKind = imageFileId ? ("mms" as const) : textKind;
      if (provider === "solapi" && (!solapiClient || !solapiMmsSender)) {
        throw new TelephonyCallError(
          "mms_feature_disabled",
          "이미지 문자를 보내려면 솔라피 MMS 발신번호 설정이 필요합니다.",
        );
      }
      const route = await resolveMessageDeliveryRoute(tx, provider, actor.id);

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
                endpointId: route.endpointId,
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
                endpointId: route.endpointId,
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
          endpointId: route.endpointId,
          senderNumberSnapshot: route.senderNumberSnapshot,
          replyMailboxEndpointId: route.replyMailboxEndpointId,
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
          endpointId: route.endpointId,
          replyMailboxEndpointId: route.replyMailboxEndpointId,
          senderNumberSnapshot: route.senderNumberSnapshot,
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

  async function requestManualMessage(
    input: ManualTelephonyMessageSend,
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
    const directImage = input.image
      ? await uploadTemplateImage(input.image)
      : null;
    const requestedAt = now();
    const inputPhoneFingerprint = input.phone
      ? protection.fingerprint(input.phone)
      : null;

    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(telephonyMessages)
        .where(eq(telephonyMessages.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) {
        const targetMatches = input.contactId
          ? existing.manualContactId === input.contactId
          : inputPhoneFingerprint
            ? existing.remotePhoneFingerprint.equals(inputPhoneFingerprint)
            : false;
        if (
          existing.targetSource !== "manual" ||
          existing.staffUserId !== actor.id ||
          !targetMatches
        ) {
          throw new TelephonyCallError(
            "message_idempotency_conflict",
            "문자 발송 재시도 식별자가 다른 요청과 충돌했습니다.",
          );
        }
        return { ...messageResponse(existing), replayed: true };
      }

      let contact = input.contactId
        ? (
            await tx
              .select()
              .from(telephonyMessageManualContacts)
              .where(eq(telephonyMessageManualContacts.id, input.contactId))
              .limit(1)
          )[0]
        : inputPhoneFingerprint
          ? (
              await tx
                .select()
                .from(telephonyMessageManualContacts)
                .where(
                  eq(
                    telephonyMessageManualContacts.phoneFingerprint,
                    inputPhoneFingerprint,
                  ),
                )
                .limit(1)
            )[0]
          : undefined;

      if (!contact && input.phone && inputPhoneFingerprint) {
        const contactId = createEventId();
        const displayName = input.customerName?.trim() || input.phone;
        const encryptedPhone = protection.encrypt(
          input.phone,
          `telephony_message_manual_contacts/${contactId}/phone`,
        );
        const encryptedDisplayName = protection.encrypt(
          displayName,
          `telephony_message_manual_contacts/${contactId}/display_name`,
        );
        [contact] = await tx
          .insert(telephonyMessageManualContacts)
          .values({
            id: contactId,
            phoneFingerprint: inputPhoneFingerprint,
            phoneCiphertext: encryptedPhone.ciphertext,
            phoneNonce: encryptedPhone.nonce,
            phoneKeyVersion: encryptedPhone.keyVersion,
            displayNameCiphertext: encryptedDisplayName.ciphertext,
            displayNameNonce: encryptedDisplayName.nonce,
            displayNameKeyVersion: encryptedDisplayName.keyVersion,
            createdByUserId: actor.id,
            createdAt: requestedAt,
            updatedAt: requestedAt,
          })
          .onConflictDoNothing({
            target: telephonyMessageManualContacts.phoneFingerprint,
          })
          .returning();
        if (!contact) {
          [contact] = await tx
            .select()
            .from(telephonyMessageManualContacts)
            .where(
              eq(
                telephonyMessageManualContacts.phoneFingerprint,
                inputPhoneFingerprint,
              ),
            )
            .limit(1);
        }
      }
      if (!contact) {
        throw new TelephonyCallError(
          "manual_message_contact_not_found",
          "직접 입력 문자 대상을 찾을 수 없습니다.",
        );
      }

      let templateName: string | null = null;
      let imageFileId: string | null = null;
      let imageUrl: string | null = null;
      let imageOriginalName: string | null = null;
      if (input.templateId) {
        const [template] = await tx
          .select({
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
      if (directImage) {
        imageFileId = directImage.imageFileId;
        imageUrl = directImage.imageUrl;
        imageOriginalName = directImage.imageOriginalName;
      }

      const provider = imageFileId ? ("solapi" as const) : ("centrex" as const);
      const messageKind = imageFileId ? ("mms" as const) : textKind;
      if (provider === "solapi" && (!solapiClient || !solapiMmsSender)) {
        throw new TelephonyCallError(
          "mms_feature_disabled",
          "이미지 문자를 보내려면 솔라피 MMS 발신번호 설정이 필요합니다.",
        );
      }
      const route = await resolveMessageDeliveryRoute(tx, provider, actor.id);

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
        correlationId: contact.id,
        data:
          provider === "solapi"
            ? {
                messageId,
                targetSource: "manual",
                manualContactId: contact.id,
                endpointId: route.endpointId,
                staffUserId: actor.id,
                provider: "solapi",
                channel: "mms",
                command: "send-many",
                contentRef: `telephony_messages/${messageId}/body`,
              }
            : {
                messageId,
                targetSource: "manual",
                manualContactId: contact.id,
                endpointId: route.endpointId,
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
          endpointId: route.endpointId,
          senderNumberSnapshot: route.senderNumberSnapshot,
          replyMailboxEndpointId: route.replyMailboxEndpointId,
          staffUserId: actor.id,
          targetSource: "manual",
          consultationId: null,
          consultationRequestId: null,
          manualContactId: contact.id,
          templateId: input.templateId,
          templateNameSnapshot: templateName,
          imageFileIdSnapshot: imageFileId,
          imageUrlSnapshot: imageUrl,
          imageOriginalNameSnapshot: imageOriginalName,
          outboxEventId: eventId,
          idempotencyKey: input.idempotencyKey,
          remotePhoneFingerprint: contact.phoneFingerprint,
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
        action: "telephony.manual_message.requested",
        targetType: "telephony_message_manual_contact",
        targetId: contact.id,
        metadata: {
          messageId,
          endpointId: route.endpointId,
          replyMailboxEndpointId: route.replyMailboxEndpointId,
          senderNumberSnapshot: route.senderNumberSnapshot,
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

      const [request] = await tx
        .select({
          id: consultationRequests.id,
          phoneFingerprint: consultationRequests.phoneFingerprint,
        })
        .from(consultationRequests)
        .where(
          and(
            or(
              eq(consultationRequests.consultationId, consultationId),
              inArray(
                consultationRequests.consultationId,
                tx
                  .select({
                    consultationId:
                      consultationGroupMembers.consultationId,
                  })
                  .from(consultationGroupMembers)
                  .innerJoin(
                    consultationGroups,
                    eq(
                      consultationGroups.id,
                      consultationGroupMembers.groupId,
                    ),
                  )
                  .where(
                    and(
                      eq(consultationGroups.status, "active"),
                      eq(
                        consultationGroups.canonicalConsultationId,
                        consultationId,
                      ),
                    ),
                  ),
              ),
            ),
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
    createPhonebookContact,
    createDirectoryConsultation,
    createStaffConsultation,
    createMessageTemplate,
    deleteMessageTemplate,
    getCall,
    getCallActivitySnapshot,
    getInboundCallSnapshot,
    getMessage,
    getMessageDutyCount,
    getMessageHub,
    getMessageNotification,
    getMessageThread,
    listMessageTemplates,
    listUnreadMessageNotifications,
    getPhoneDeskCalls,
    getPhoneDeskCall,
    getPhoneDeskFollowUps,
    getPhoneDeskFollowUpDuty,
    listPhonebookContacts,
    pollInboundAnswerCommand,
    requestClickToCall,
    requestDirectoryClickToCall,
    requestDirectoryMessage,
    requestInboundAnswer,
    requestManualMessage,
    requestAutomaticMessage,
    requestConsultationAssignedAutomaticMessage,
    searchLegalFriendsClients,
    requestMessage,
    resolvePhoneDeskCall,
    savePhoneDeskAftercare,
    deactivatePhonebookContact,
    updateMessageTemplate,
    updatePhonebookContact,
  };
}

export type TelephonyService = ReturnType<typeof createTelephonyService>;
