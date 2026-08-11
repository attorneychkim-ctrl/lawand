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
  type MessageTemplateCreate,
  type MessageTemplateUpdate,
  type PhoneDeskAftercareSave,
  type TelephonyMessageSend,
  type TelephonyCallDisposition,
  type CentrexBridgeCommandResult,
  type PlatformEvent,
} from "@lawand/core";
import {
  consultationAssignments,
  consultationRequests,
  consultationStatusHistory,
  consultations,
  legalFriendsCaseLinks,
  messageTemplates,
  outboxEvents,
  staffAuditLogs,
  staffMemberships,
  staffProfiles,
  staffUsers,
  staffTelephonyBindings,
  telephonyCallObservationLinks,
  telephonyCallAftercare,
  telephonyCallDirectoryTargets,
  telephonyCalls,
  telephonyEndpointCredentials,
  telephonyEndpoints,
  telephonyInboundCalls,
  telephonyInboundCommands,
  telephonyInboundMessages,
  telephonyMessageDirectoryTargets,
  telephonyMessageMailboxStates,
  telephonyMessages,
  telephonyFollowUpTasks,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { StaffPrincipal } from "./auth.js";
import type { DataProtection } from "./crypto.js";
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
const INBOUND_ANSWER_DISPATCH_TIMEOUT_MS = 3 * 60_000;
const PHONE_DESK_DEFAULT_LIMIT = 20;
const PHONE_DESK_MAX_LIMIT = 100;

export type PhoneDeskListFilter =
  | "all"
  | "inbound"
  | "click_to_call"
  | "centrex_direct"
  | "active";

export type PhoneDeskListQuery = {
  page: number;
  pageSize: 20 | 50 | 100;
  filter?: PhoneDeskListFilter;
  from?: Date;
  to?: Date;
};

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
        caseType: number;
        caseState: number;
        isClosed: boolean;
        isRepealed: boolean;
        courtName: string | null;
        caseCreatedOn: string;
        caseUpdatedOn: string;
        staffNames: string[];
      }>;
    }
  | null;

type LegalFriendsDirectoryRow = {
  client_name: string | null;
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

type LegalFriendsClientSearchRow = {
  client_idx: number;
  case_idx: number;
  client_name: string | null;
  phone: string | null;
  phone_search: string | null;
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

export type LegalFriendsClientDirectoryItem = {
  clientIdx: number;
  caseIdx: number;
  clientName: string;
  phone: string | null;
  callable: boolean;
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
      | "centrex_endpoint_not_linked"
      | "call_not_found"
      | "call_owned_by_other_staff"
      | "call_not_reconciled"
      | "call_not_ended"
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
  now?: () => Date;
}) {
  const {
    db,
    protection,
    dispatchEnabled,
    solapiClient = null,
    solapiMmsSender = null,
    answerableBridgeIds = new Set<string>(),
    now = () => new Date(),
  } = options;

  async function resolveLegalFriendsPhone(
    phone: string,
  ): Promise<Extract<PhoneCustomerMatch, { source: "legal_friends" }> | null> {
    const result = await db.execute(
      sql<LegalFriendsDirectoryRow>`SELECT * FROM public.resolve_inbound_phone_directory(${phone})`,
    );
    const rows = result.rows as LegalFriendsDirectoryRow[];
    if (rows.length === 0) return null;

    const clientName = rows.find((row) => row.client_name)?.client_name ?? "이름 미확인";
    return {
      source: "legal_friends",
      clientName,
      cases: rows.map((row) => ({
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
      })),
    };
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

  async function resolvePhoneCustomer(phone: string): Promise<PhoneCustomerMatch> {
    const phoneFingerprint = protection.fingerprint(phone);
    const [consultation] = await db
      .select({
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
      .where(eq(consultations.phoneFingerprint, phoneFingerprint))
      .orderBy(desc(consultations.lastRequestedAt))
      .limit(1);

    if (consultation) {
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
      return {
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
      };
    }

    return resolveLegalFriendsPhone(phone);
  }

  async function latestInboundAnswerCommand(inboundCallId: string) {
    const [command] = await db
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
      .where(eq(telephonyInboundCommands.inboundCallId, inboundCallId))
      .orderBy(desc(telephonyInboundCommands.requestedAt))
      .limit(1);
    return command ? inboundAnswerCommandResponse(command) : null;
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
      }
    >();

    for (const row of rows) {
      let item = items.get(row.id);
      if (!item) {
        const remotePhone = protection.decrypt(
          {
            ciphertext: row.remotePhoneCiphertext,
            nonce: row.remotePhoneNonce,
            keyVersion: row.remotePhoneKeyVersion,
          },
          `telephony_inbound_calls/${row.id}/remote_phone`,
        );
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
          customerMatch: await resolvePhoneCustomer(remotePhone),
          answerCommand: await latestInboundAnswerCommand(row.id),
          answerAvailable: answerableBridgeIds.has(row.bridgeId),
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
    const emptySummary = {
      all: 0,
      inbound: 0,
      clickToCall: 0,
      centrexDirect: 0,
      active: 0,
    };
    let summary = emptySummary;
    if (!callId) {
      const [[observedSummary], [standaloneSummary]] = await Promise.all([
        db
          .select({
            all: count(),
            inbound: sql<number>`count(*) filter (where ${telephonyInboundCalls.direction} = 'inbound')::int`,
            clickToCall: sql<number>`count(*) filter (where ${telephonyInboundCalls.direction} = 'outbound' and ${telephonyCallObservationLinks.observedCallId} is not null)::int`,
            centrexDirect: sql<number>`count(*) filter (where ${telephonyInboundCalls.direction} = 'outbound' and ${telephonyCallObservationLinks.observedCallId} is null)::int`,
            active: sql<number>`count(*) filter (where ${telephonyInboundCalls.state} in ('ringing', 'connected'))::int`,
          })
          .from(telephonyInboundCalls)
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
      ]);
      const observedAll = Number(observedSummary?.all ?? 0);
      const standaloneAll = Number(standaloneSummary?.all ?? 0);
      summary = {
        all: observedAll + standaloneAll,
        inbound: Number(observedSummary?.inbound ?? 0),
        clickToCall:
          Number(observedSummary?.clickToCall ?? 0) + standaloneAll,
        centrexDirect: Number(observedSummary?.centrexDirect ?? 0),
        active:
          Number(observedSummary?.active ?? 0) +
          Number(standaloneSummary?.active ?? 0),
      };
    }
    const total = callId
      ? 0
      : selectedFilter === "click_to_call"
        ? summary.clickToCall
        : selectedFilter === "centrex_direct"
          ? summary.centrexDirect
          : summary[selectedFilter];
    const pageCount = Math.max(1, Math.ceil(total / normalizedLimit));
    const page = callId ? 1 : Math.min(requestedPage, pageCount);
    const offset = callId ? 0 : (page - 1) * normalizedLimit;
    const fetchLimit = callId
      ? normalizedLimit * 2
      : offset + normalizedLimit;
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
          : selectedFilter === "active"
            ? inArray(telephonyInboundCalls.state, ["ringing", "connected"])
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
              eq(telephonyCallObservationLinks.telephonyCallId, callId),
            )
          : and(observedDateCondition, observedFilterCondition),
      )
      .orderBy(desc(telephonyInboundCalls.ringingAt))
      .limit(fetchLimit);

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
      .orderBy(desc(telephonyCalls.requestedAt))
      .limit(fetchLimit);

    const endpointIds = [
      ...new Set([
        ...observedRows.map((row) => row.endpointId),
        ...standaloneClickRows.map((row) => row.endpointId),
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

    const customerCache = new Map<string, Promise<PhoneCustomerMatch>>();
    const customerMatch = (phone: string) => {
      const existing = customerCache.get(phone);
      if (existing) return existing;
      const pending = resolvePhoneCustomer(phone);
      customerCache.set(phone, pending);
      return pending;
    };
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
        const durationSeconds = row.connectedAt && row.endedAt
          ? Math.max(
              0,
              Math.round(
                (row.endedAt.getTime() - row.connectedAt.getTime()) / 1_000,
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
          id: row.id,
          observedCallId: row.id,
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
          state: row.state,
          remotePhone,
          occurredAt: row.ringingAt.toISOString(),
          ringingAt: row.ringingAt.toISOString(),
          connectedAt: row.connectedAt?.toISOString() ?? null,
          endedAt: row.endedAt?.toISOString() ?? null,
          lastEventAt: row.lastEventAt.toISOString(),
          ringSeconds,
          durationSeconds,
          providerEndCause: row.providerEndCause,
          endpoint: {
            id: row.endpointId,
            label: row.endpointLabel,
            lineNumber: row.endpointLineNumber,
            extension: row.endpointExtension,
          },
          endpointOwners: ownersByEndpoint.get(row.endpointId) ?? [],
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
          direction: "outbound" as const,
          receptionMode: null,
          source: "click_to_call" as const,
          state,
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
          endpointOwners: ownersByEndpoint.get(row.endpointId) ?? [],
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

    const baseItems = [...observedItems, ...standaloneClickItems]
      .sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime(),
      )
      .slice(offset, offset + normalizedLimit);
    const observedIds = baseItems.flatMap((item) =>
      item.observedCallId ? [item.observedCallId] : [],
    );
    const commandIds = baseItems.flatMap((item) =>
      item.clickToCall ? [item.clickToCall.id] : [],
    );
    const aftercareRows =
      observedIds.length || commandIds.length
        ? await db
            .select({
              id: telephonyCallAftercare.id,
              observedCallId: telephonyCallAftercare.observedCallId,
              telephonyCallId: telephonyCallAftercare.telephonyCallId,
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
        (item.observedCallId
          ? aftercareByObserved.get(item.observedCallId)
          : undefined) ??
        (item.clickToCall
          ? aftercareByCommand.get(item.clickToCall.id)
          : undefined);
      return { ...item, aftercare: row ? aftercareResponse(row) : null };
    });
    const openFollowUps = await db
      .select({
        id: telephonyFollowUpTasks.id,
        aftercareId: telephonyFollowUpTasks.aftercareId,
        dueAt: telephonyFollowUpTasks.dueAt,
        assigneeUserId: telephonyFollowUpTasks.assigneeUserId,
        assigneeDisplayName: staffProfiles.displayName,
        result: telephonyCallAftercare.result,
        observedCallId: telephonyCallAftercare.observedCallId,
        telephonyCallId: telephonyCallAftercare.telephonyCallId,
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
      followUps: openFollowUps.map((task) => ({
        id: task.id,
        aftercareId: task.aftercareId,
        callId: task.observedCallId ?? task.telephonyCallId!,
        result: task.result,
        consultationId: task.consultationId,
        dueAt: task.dueAt.toISOString(),
        assignee: {
          staffUserId: task.assigneeUserId,
          displayName: task.assigneeDisplayName,
        },
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

  async function getPhoneDeskCall(callId: string) {
    const [snapshot, staffOptions] = await Promise.all([
      getPhoneDeskCalls(1, callId),
      activePhoneDeskStaff(),
    ]);
    const call = snapshot.items[0];
    if (!call) {
      throw new TelephonyCallError(
        "call_not_found",
        "전화 원장을 찾을 수 없습니다.",
      );
    }
    const legalFriendsMatch =
      call.customerMatch?.source === "legal_friends"
        ? call.customerMatch
        : await resolveLegalFriendsPhone(call.remotePhone);
    const recommended = new Set<string>();
    if (call.customerMatch?.source === "consultation") {
      const assignee = call.customerMatch.consultation.assigneeUserId;
      if (assignee) recommended.add(assignee);
    }
    if (legalFriendsMatch) {
      const names = new Set(
        legalFriendsMatch.cases.flatMap((item) => item.staffNames),
      );
      for (const staff of staffOptions) {
        if (names.has(staff.displayName)) recommended.add(staff.staffUserId);
      }
    }
    if (recommended.size === 0 && call.clickToCall) {
      recommended.add(call.clickToCall.requestedBy.staffUserId);
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
    const confirmedAt = now();
    const dueAt = input.followUp.enabled
      ? assertValidFollowUpDueAt(input.followUp.dueAt, confirmedAt)
      : null;
    const observedCallId = call.observedCallId;
    const telephonyCallId = call.clickToCall?.id ?? null;
    const remotePhoneFingerprint = protection.fingerprint(call.remotePhone);

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
    return db.transaction(async (tx) => {
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
  }

  async function pollInboundAnswerCommand(authentication: {
    bridgeId: string;
    endpointId: string;
  }) {
    const polledAt = now();
    return db.transaction(async (tx) => {
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
            eq(telephonyInboundCommands.endpointId, authentication.endpointId),
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
            eq(telephonyInboundCommands.endpointId, authentication.endpointId),
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

      const [command] = await tx
        .select()
        .from(telephonyInboundCommands)
        .where(
          and(
            eq(telephonyInboundCommands.bridgeId, authentication.bridgeId),
            eq(telephonyInboundCommands.endpointId, authentication.endpointId),
            inArray(telephonyInboundCommands.status, [
              "queued",
              "dispatching",
            ]),
          ),
        )
        .orderBy(telephonyInboundCommands.requestedAt)
        .limit(1)
        .for("update");
      if (!command) return null;

      const [call] = await tx
        .select({
          direction: telephonyInboundCalls.direction,
          state: telephonyInboundCalls.state,
        })
        .from(telephonyInboundCalls)
        .where(eq(telephonyInboundCalls.id, command.inboundCallId))
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
          .where(eq(telephonyInboundCommands.id, command.id));
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
        .where(eq(telephonyInboundCommands.id, command.id));
      return {
        schemaVersion: 1 as const,
        commandId: command.id,
        inboundCallId: command.inboundCallId,
        commandType: "answer" as const,
        expectedProviderCallId: command.providerCallId,
        expiresAt: command.expiresAt.toISOString(),
      };
    });
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

  function maskedMessagePhone(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7) return "번호 미확인";
    return `${digits.slice(0, 3)}-${"*".repeat(Math.max(3, digits.length - 7))}-${digits.slice(-4)}`;
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
    phoneMasked: string;
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
        phoneMasked: phone ? maskedMessagePhone(phone) : "번호 미확인",
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
      phoneMasked: phone ? maskedMessagePhone(phone) : "번호 미확인",
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
        phoneMasked: maskedMessagePhone(phone),
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
        phoneMasked: maskedMessagePhone(phone),
        receiptCode: row.consultationReceiptCode,
      };
    }
    return {
      key: `unmatched:${row.id}`,
      caseIdx: null,
      clientIdx: null,
      consultationId: null,
      customerName: "고객 연결 확인 필요",
      phoneMasked: maskedMessagePhone(phone),
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
      let imageOriginalName: string | null = null;
      if (input.templateId) {
        const [template] = await tx
          .select({
            id: messageTemplates.id,
            name: messageTemplates.name,
            ownerUserId: messageTemplates.ownerUserId,
            imageFileId: messageTemplates.imageFileId,
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
      let imageOriginalName: string | null = null;
      if (input.templateId) {
        const [template] = await tx
          .select({
            id: messageTemplates.id,
            name: messageTemplates.name,
            ownerUserId: messageTemplates.ownerUserId,
            imageFileId: messageTemplates.imageFileId,
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
    createMessageTemplate,
    deleteMessageTemplate,
    getCall,
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
    savePhoneDeskAftercare,
    updateMessageTemplate,
  };
}

export type TelephonyService = ReturnType<typeof createTelephonyService>;
