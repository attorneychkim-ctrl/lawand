import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import {
  assertPlatformEvent,
  createConsultationId,
  createConsultationRequestId,
  createEventId,
  createPublicReceiptCode,
  createTelephonyCallId,
  CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
  type PhoneDeskAftercareSave,
  type TelephonyCallDisposition,
  type CentrexBridgeCommandResult,
  type PlatformEvent,
} from "@lawand/core";
import {
  consultationAssignments,
  consultationRequests,
  consultationStatusHistory,
  consultations,
  outboxEvents,
  staffAuditLogs,
  staffMemberships,
  staffProfiles,
  staffUsers,
  staffTelephonyBindings,
  telephonyCallObservationLinks,
  telephonyCallAftercare,
  telephonyCalls,
  telephonyEndpoints,
  telephonyInboundCalls,
  telephonyInboundCommands,
  telephonyFollowUpTasks,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { StaffPrincipal } from "./auth.js";
import type { DataProtection } from "./crypto.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const DUPLICATE_COMMAND_WINDOW_MS = 30_000;
const INBOUND_RINGING_SNAPSHOT_WINDOW_MS = 3 * 60_000;
const INBOUND_CONNECTED_SNAPSHOT_WINDOW_MS = 12 * 60 * 60_000;
const INBOUND_ENDED_SNAPSHOT_WINDOW_MS = 20_000;
const INBOUND_ANSWER_COMMAND_TTL_MS = 20_000;
const INBOUND_ANSWER_DISPATCH_TIMEOUT_MS = 3 * 60_000;
const PHONE_DESK_DEFAULT_LIMIT = 50;
const PHONE_DESK_MAX_LIMIT = 100;

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

export class TelephonyCallError extends Error {
  constructor(
    readonly code:
      | "feature_disabled"
      | "consultation_not_found"
      | "consultation_not_assigned"
      | "consultation_assigned_to_other_staff"
      | "consultation_phone_not_collected"
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

function eventRow(event: PlatformEvent, callId: string) {
  return {
    id: event.eventId,
    aggregateType: "telephony_call",
    aggregateId: callId,
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
  consultationId: string;
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

export function createTelephonyService(options: {
  db: Database;
  protection: DataProtection;
  dispatchEnabled: boolean;
  answerableBridgeIds?: ReadonlySet<string>;
  now?: () => Date;
}) {
  const {
    db,
    protection,
    dispatchEnabled,
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
    limit = PHONE_DESK_DEFAULT_LIMIT,
    callId?: string,
  ) {
    const normalizedLimit = Math.min(
      Math.max(Math.trunc(limit) || PHONE_DESK_DEFAULT_LIMIT, 1),
      PHONE_DESK_MAX_LIMIT,
    );
    const snapshotAt = now();
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
          : undefined,
      )
      .orderBy(desc(telephonyInboundCalls.lastEventAt))
      .limit(normalizedLimit * 2);

    const standaloneClickRows = await db
      .select({
        id: telephonyCalls.id,
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
      .innerJoin(
        consultationRequests,
        eq(consultationRequests.id, telephonyCalls.consultationRequestId),
      )
      .innerJoin(
        staffProfiles,
        eq(staffProfiles.userId, telephonyCalls.staffUserId),
      )
      .innerJoin(
        consultations,
        eq(consultations.id, telephonyCalls.consultationId),
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
          callId ? eq(telephonyCalls.id, callId) : undefined,
        ),
      )
      .orderBy(desc(telephonyCalls.requestedAt))
      .limit(normalizedLimit * 2);

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
        const hasClickToCall = Boolean(
          row.linkedCallId &&
            row.clickConsultationId &&
            row.clickRequestedAt &&
            row.clickStaffUserId &&
            row.clickStaffDisplayName &&
            row.consultationReceiptCode &&
            row.consultationState &&
            row.consultationAnonymousLabel,
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
                consultation: {
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
                },
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
        if (!row.phoneCiphertext || !row.phoneNonce || !row.phoneKeyVersion) {
          throw new Error("phone_desk_click_to_call_phone_not_found");
        }
        const remotePhone = protection.decrypt(
          {
            ciphertext: row.phoneCiphertext,
            nonce: row.phoneNonce,
            keyVersion: row.phoneKeyVersion,
          },
          `consultation_requests.phone:${row.consultationRequestId}`,
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
            consultation: {
              id: row.consultationId,
              publicReceiptCode: row.consultationReceiptCode,
              state: row.consultationState,
              displayName: consultationDisplayName({
                consultationId: row.consultationId,
                consultationAnonymousLabel: row.consultationAnonymousLabel,
                consultationNameCiphertext: row.consultationNameCiphertext,
                consultationNameNonce: row.consultationNameNonce,
                consultationNameKeyVersion: row.consultationNameKeyVersion,
              }),
            },
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
      .slice(0, normalizedLimit);
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
    getCall,
    getInboundCallSnapshot,
    getPhoneDeskCalls,
    getPhoneDeskCall,
    pollInboundAnswerCommand,
    requestClickToCall,
    requestInboundAnswer,
    savePhoneDeskAftercare,
  };
}

export type TelephonyService = ReturnType<typeof createTelephonyService>;
