import "server-only";

import type {
  LegalFriendsDirectoryConsultationCreate,
  ResidenceRegion,
} from "@lawand/core";

import { readStaffSessionToken } from "./session";

const gatewayUrl =
  process.env.LAWAND_GATEWAY_URL ?? "http://127.0.0.1:3022";

function internalKey(): string {
  const value = process.env.LAWAND_INTERNAL_API_KEY;
  if (!value) {
    throw new Error("LAWAND_INTERNAL_API_KEY가 설정되지 않았습니다.");
  }
  return value;
}

export type ConsultationListItem = {
  id: string;
  publicReceiptCode: string;
  state: string;
  displayName: string;
  contactChannel: "phone" | "kakao_channel" | "naver_booking";
  phone: string | null;
  existingCustomer: boolean;
  residenceRegion: string | null;
  mode: "quick" | "detailed" | "self_diagnosis";
  dedupeOutcome:
    | "new"
    | "exact_duplicate"
    | "identity_enrichment"
    | "suspected_duplicate";
  requestCount: number;
  assigneeUserId: string | null;
  assigneeDisplayName: string | null;
  kakaoEntry: {
    status: "pending" | "confirmed" | "invalid";
    nameProvided: boolean;
    clickCount: number;
    lastClickedAt: string;
  } | null;
  naverBooking: {
    bookingNumber: string;
    status: "details_pending" | "ready" | "cancelled";
    scheduledAt: string;
  } | null;
  latestTelephony: {
    disposition: TelephonyCallDisposition | null;
    aftercareResult: PhoneDeskCallResult | null;
    requestedAt: string;
  } | null;
  firstRequestedAt: string;
  lastRequestedAt: string;
};

export type ListPageSize = 20 | 50 | 100;

export type ConsultationListFilter =
  | "all"
  | "waiting"
  | "mine"
  | "attention"
  | "today";

export type ConsultationListSnapshot = {
  items: ConsultationListItem[];
  total: number;
  page: number;
  pageSize: ListPageSize;
  pageCount: number;
  summary: Record<ConsultationListFilter, number>;
};

export type TelephonyCall = {
  id: string;
  targetSource: "consultation" | "legal_friends_directory";
  consultationId: string | null;
  endpointId: string;
  commandStatus: "queued" | "dispatching" | "succeeded" | "failed" | "unknown";
  outcome: "unknown" | "answered" | "no_answer" | "busy" | "failed" | "cancelled";
  requestedAt: string;
  dispatchedAt: string | null;
  providerRespondedAt: string | null;
  providerStatus: string | null;
  providerStartedAt: string | null;
  providerEndedAt: string | null;
  providerDurationSeconds: number | null;
  providerBillableSeconds: number | null;
  providerRingSeconds: number | null;
  reconciledAt: string | null;
  disposition: TelephonyCallDisposition | null;
  dispositionConfirmedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  replayed?: boolean;
};

export type MessageTemplate = {
  id: string;
  name: string;
  body: string;
  bodyByteLength: number;
  image: {
    url: string;
    originalName: string;
    byteLength: number;
    width: number;
    height: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageThreadSummary = {
  key: string;
  caseIdx: string | null;
  clientIdx: number | null;
  consultationId: string | null;
  customerName: string;
  phone: string;
  receiptCode?: string | null;
  messageCount: number;
  lastDirection: "outbound" | "inbound";
  lastMessageKind: "sms" | "lms" | "mms";
  lastMessagePreview: string;
  lastMessageAt: string;
  needsConnection: boolean;
};

export type MessageMailbox = {
  id: string;
  label: string;
  lineNumber: string;
  publicNumber: string | null;
  extension: string;
  isActive: boolean;
  credentialConfigured: boolean;
  lastSyncedAt: string | null;
  lastFailedAt: string | null;
  lastErrorCode: string | null;
};

export type MessageHub = {
  items: MessageThreadSummary[];
  mailboxes: MessageMailbox[];
};

export type MessageThread = {
  thread: Pick<
    MessageThreadSummary,
    | "key"
    | "caseIdx"
    | "clientIdx"
    | "consultationId"
    | "customerName"
    | "phone"
    | "receiptCode"
  >;
  timeline: Array<{
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
  }>;
};

export type TelephonyMessage = {
  id: string;
  targetSource: "consultation" | "legal_friends_directory";
  consultationId: string | null;
  endpointId: string;
  templateId: string | null;
  templateName: string | null;
  provider: "centrex" | "solapi";
  messageKind: "sms" | "lms" | "mms";
  imageAttached: boolean;
  imageName: string | null;
  bodyByteLength: number;
  commandStatus: "queued" | "dispatching" | "succeeded" | "failed" | "unknown";
  requestedAt: string;
  dispatchedAt: string | null;
  providerRespondedAt: string | null;
  providerCode: string | null;
  providerRemainingCount: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  replayed?: boolean;
};

export type TelephonyCallDisposition =
  | "customer_conversation"
  | "voicemail"
  | "no_answer"
  | "rejected"
  | "busy"
  | "caller_cancelled"
  | "callback_required";

export type TelephonyInboundCall = {
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
  answerAvailable: boolean;
  deliveryDelayed: boolean;
  owners: Array<{ staffUserId: string; displayName: string }>;
  answerCommand: {
    id: string;
    inboundCallId: string;
    status: "queued" | "dispatching" | "succeeded" | "failed" | "expired";
    requestedAt: string;
    expiresAt: string;
    completedAt: string | null;
    resultCode: string | null;
  } | null;
  customerMatch:
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
};

export type TelephonyInboundCallSnapshot = {
  snapshotAt: string;
  items: TelephonyInboundCall[];
};

export type TelephonyCallActivity = {
  id: string;
  observedCallId: string | null;
  scope: "external" | "internal";
  direction: "inbound" | "outbound" | null;
  state:
    | "ringing"
    | "connected"
    | "transferring"
    | "needs_confirmation"
    | "ended";
  correlationStatus: "pending" | "confirmed" | "needs_confirmation" | "rejected";
  remotePhone: string | null;
  originalLineLast4: string | null;
  startedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  lastEventAt: string;
  currentEndpoint: {
    id: string;
    label: string;
    lineNumber: string;
    extension: string;
  };
  participants: Array<{
    legId: string;
    endpointId: string;
    staffUserId: string | null;
    displayName: string | null;
    kind: "customer" | "consultation" | "internal";
    direction: "inbound" | "outbound";
    state: "ringing" | "connected" | "ended";
    remoteExtension: string | null;
    startedAt: string;
  }>;
  transfer: {
    state:
      | "transfer_attempted"
      | "transfer_completed"
      | "transfer_returned"
      | "transfer_unresolved";
    correlationStatus: "pending" | "confirmed" | "needs_confirmation" | "rejected";
  } | null;
  customerMatch: TelephonyInboundCall["customerMatch"];
  notificationKind:
    | "external_inbound"
    | "internal_inbound"
    | "transferred_customer"
    | "transfer_returned"
    | null;
  notificationTargetUserIds: string[];
  canOpenAftercare: boolean;
};

export type TelephonyCallActivitySnapshot = {
  snapshotAt: string;
  items: TelephonyCallActivity[];
};

export type PhoneDeskCall = {
  id: string;
  observedCallId: string | null;
  callRootId: string | null;
  scope: "external" | "internal";
  direction: "inbound" | "outbound" | "internal";
  receptionMode: "office_bridge" | "uplus_network" | null;
  source: "inbound" | "click_to_call" | "centrex_direct" | "internal";
  state:
    | "pending"
    | "ringing"
    | "connected"
    | "ended"
    | "failed"
    | "unknown";
  correlationStatus: "pending" | "confirmed" | "needs_confirmation" | "rejected";
  remotePhone: string | null;
  occurredAt: string;
  ringingAt: string | null;
  connectedAt: string | null;
  endedAt: string | null;
  lastEventAt: string;
  ringSeconds: number | null;
  durationSeconds: number | null;
  providerEndCause: string | null;
  finalStaffUserId: string | null;
  endpoint: {
    id: string;
    label: string;
    lineNumber: string;
    extension: string;
  };
  endpointOwners: Array<{ staffUserId: string; displayName: string }>;
  participants: Array<{
    legId: string;
    endpointId: string;
    extension: string;
    staffUserId: string | null;
    displayName: string | null;
    direction: "inbound" | "outbound";
    state: "ringing" | "connected" | "ended";
  }>;
  relationType:
    | "transfer_attempted"
    | "transfer_completed"
    | "transfer_returned"
    | "transfer_unresolved"
    | "call_picked_up"
    | "staff_resolved"
    | null;
  customerMatch: TelephonyInboundCall["customerMatch"];
  clickToCall: {
    id: string;
    commandStatus: TelephonyCall["commandStatus"];
    outcome: TelephonyCall["outcome"];
    disposition: TelephonyCallDisposition | null;
    requestedAt: string;
    requestedBy: { staffUserId: string; displayName: string };
    consultation: {
      id: string;
      publicReceiptCode: string;
      displayName: string;
      state: string;
    } | null;
    directoryClient: {
      clientIdx: number;
      caseIdx: number;
      displayName: string;
    } | null;
    observationLink: {
      method: "endpoint_phone_time_v1";
      timeDeltaMs: number;
    } | null;
  } | null;
  aftercare: PhoneDeskAftercare | null;
};

export type PhoneDeskCallResult =
  | "consultation_completed"
  | "reconsultation_required"
  | "no_answer"
  | "busy"
  | "manager_callback_requested"
  | "rejected"
  | "public_institution"
  | "creditor"
  | "wrong_number"
  | "internal_completed"
  | "internal_follow_up"
  | "internal_no_answer"
  | "other";

export type PhoneDeskAftercare = {
  id: string;
  result: PhoneDeskCallResult;
  otherText: string | null;
  memo: string | null;
  consultationId: string | null;
  confirmedBy: { staffUserId: string; displayName: string };
  confirmedAt: string;
  followUp: {
    id: string;
    state: "open" | "completed" | "cancelled";
    dueAt: string;
    assignee: { staffUserId: string; displayName: string };
    completedAt: string | null;
  } | null;
};

export type PhoneDeskFollowUp = {
  id: string;
  aftercareId: string;
  callId: string;
  result: PhoneDeskCallResult;
  consultationId: string | null;
  dueAt: string;
  assignee: { staffUserId: string; displayName: string };
};

export type PhoneDeskCallSnapshot = {
  snapshotAt: string;
  items: PhoneDeskCall[];
  total: number;
  page: number;
  pageSize: ListPageSize;
  pageCount: number;
  summary: {
    all: number;
    inbound: number;
    clickToCall: number;
    centrexDirect: number;
    internal: number;
    active: number;
  };
  followUps: PhoneDeskFollowUp[];
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

export type LegalFriendsClientDirectorySearch = {
  queryType: "name" | "phone";
  items: LegalFriendsClientDirectoryItem[];
};

export type ClientDirectoryConsultationResult = {
  consultationId: string;
  publicReceiptCode: string;
  acceptedAt: string;
  replayed: boolean;
};

export type PhoneDeskStaffOption = {
  staffUserId: string;
  displayName: string;
  membershipId: string;
  department: string;
  jobTitle: string;
};

export type PhoneDeskCallDetail = {
  snapshotAt: string;
  call: PhoneDeskCall;
  staffOptions: PhoneDeskStaffOption[];
  legalFriendsMatch: Extract<
    NonNullable<TelephonyInboundCall["customerMatch"]>,
    { source: "legal_friends" }
  > | null;
  recommendedAssigneeUserIds: string[];
};

export type PhoneDeskAftercareInput = {
  result: PhoneDeskCallResult;
  otherText?: string;
  memo?: string;
  consultation:
    | { mode: "none" }
    | { mode: "link"; consultationId: string }
    | { mode: "create"; customerName: string; assigneeUserId?: string };
  followUp:
    | { enabled: false }
    | { enabled: true; dueAt: string; assigneeUserId: string };
};

export type ConsultationDetail = {
  id: string;
  publicReceiptCode: string;
  state: string;
  displayName: string;
  contactChannel: "phone" | "kakao_channel" | "naver_booking";
  existingCustomer: boolean;
  kakaoEntry: {
    id: string;
    status: "pending" | "confirmed" | "invalid";
    nameProvided: boolean;
    clickCount: number;
    firstClickedAt: string;
    lastClickedAt: string;
    confirmedAt: string | null;
    invalidatedAt: string | null;
  } | null;
  naverBooking: {
    id: string;
    businessId: string;
    bookingNumber: string;
    detailsUrl: string;
    status: "details_pending" | "ready" | "cancelled";
    scheduledAt: string;
    sourceReceivedAt: string;
    detailsCapturedAt: string | null;
    cancelledAt: string | null;
  } | null;
  directorySource: {
    clientIdx: number;
    caseIdx: number;
    relationship: "customer" | "referrer";
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
  } | null;
  assignment: {
    id: string;
    assigneeUserId: string;
    displayName: string;
    organization: { key: string; name: string };
    region: { key: string; name: string };
    department: string;
    jobTitle: string;
    assignmentMethod: string;
    assignedAt: string;
  } | null;
  integrationRequests: Array<{
    id: string;
    eventType: string;
    status: "pending" | "published" | "dead";
    attempts: number;
    availableAt: string;
    lockedAt: string | null;
    publishedAt: string | null;
    lastError: string | null;
    providerDelivery: {
      groupId: string;
      messageId: string;
      statusCode: string;
      acceptedAt: string;
    } | null;
    deliveryAttempts: Array<{
      attemptNumber: number;
      status: "started" | "succeeded" | "retry_scheduled" | "dead";
      httpStatus: number | null;
      errorCode: string | null;
      errorMessage: string | null;
      startedAt: string;
      finishedAt: string | null;
    }>;
  }>;
  legalFriendsCase: {
    caseIdx: string;
    managerExternalAccountId: string;
    caseCreatedAt: string;
    managerAssignedAt: string | null;
  } | null;
  telephonyCalls: Array<
    Omit<TelephonyCall, "consultationId" | "endpointId" | "replayed"> & {
      staffUserId: string;
      staffDisplayName: string;
      endpoint: {
        id: string;
        label: string;
        lineNumber: string;
        extension: string;
      };
      reconciledAt: string | null;
      aftercareResult: PhoneDeskCallResult | null;
    }
  >;
  telephonyMessages: Array<{
    id: string;
    staffUserId: string;
    staffDisplayName: string;
    endpoint: {
      id: string;
      label: string;
      lineNumber: string;
      extension: string;
    };
    templateId: string | null;
    templateName: string | null;
    provider: "centrex" | "solapi";
    imageAttached: boolean;
    imageName: string | null;
    body: string;
    messageKind: "sms" | "lms" | "mms";
    bodyByteLength: number;
    commandStatus: TelephonyMessage["commandStatus"];
    requestedAt: string;
    dispatchedAt: string | null;
    providerRespondedAt: string | null;
    providerCode: string | null;
    providerRemainingCount: number | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  }>;
  firstRequestedAt: string;
  lastRequestedAt: string;
  requests: Array<{
    id: string;
    mode: "quick" | "detailed" | "self_diagnosis";
    source:
      | "homepage"
      | "kakao_channel"
      | "homepage_kakao"
      | "naver_booking_email"
      | "erp_phone_desk"
      | "erp_client_directory";
    contactChannel: "phone" | "kakao_channel" | "naver_booking";
    phone: string | null;
    name: string | null;
    intake: Record<string, unknown>;
    contactPreference: "as_soon_as_possible" | "scheduled_window";
    contactWindowStart: string | null;
    contactWindowEnd: string | null;
    privacyNoticeVersion: string;
    privacyBasis:
      | "explicit_consent"
      | "customer_initiated_channel_message"
      | "customer_initiated_channel_entry"
      | "customer_initiated_booking"
      | "staff_recorded_phone_interaction";
    consentAgreedAt: string | null;
    dedupeOutcome: ConsultationListItem["dedupeOutcome"];
    candidateReceiptCode: string | null;
    submittedAt: string;
    attribution: {
      firstLandingPageKey: string | null;
      firstLandingPageVersion: string | null;
      submittedFromPath: string;
      ctaPath: string | null;
      ctaPlacement: string | null;
      source: Record<string, unknown>;
    } | null;
  }>;
};

async function gatewayFetch(
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
    streaming?: boolean;
    timeoutMs?: number;
  } = {},
) {
  const sessionToken = await readStaffSessionToken();
  if (!sessionToken) {
    throw new Error("직원 로그인이 필요합니다.");
  }
  return fetch(`${gatewayUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "x-lawand-internal-key": internalKey(),
      "x-lawand-staff-session": sessionToken,
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    cache: "no-store",
    signal:
      options.signal ??
      (options.streaming
        ? undefined
        : AbortSignal.timeout(options.timeoutMs ?? 8_000)),
  });
}

export class ConsultationGatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type PagedDateOptions<TFilter extends string> = {
  page?: number;
  pageSize?: ListPageSize;
  filter?: TFilter;
  from?: string;
  to?: string;
};

function pagedDateParams<TFilter extends string>(
  options: PagedDateOptions<TFilter>,
) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
    filter: options.filter ?? "all",
  });
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  return params;
}

export async function getConsultations(
  options: PagedDateOptions<ConsultationListFilter> = {},
): Promise<ConsultationListSnapshot> {
  const response = await gatewayFetch(
    `/v1/consultations?${pagedDateParams(options).toString()}`,
  );
  if (!response.ok) {
    throw new Error(`상담 목록 조회 실패 (${response.status})`);
  }
  return (await response.json()) as ConsultationListSnapshot;
}

export async function openConsultationEventStream(
  signal: AbortSignal,
): Promise<Response> {
  return gatewayFetch("/v1/consultation-events/stream", {
    signal,
    streaming: true,
  });
}

export async function getTelephonyInboundCalls(): Promise<TelephonyInboundCallSnapshot> {
  const response = await gatewayFetch("/v1/telephony-inbound-calls");
  if (!response.ok) {
    throw new Error(`수신전화 상태 조회 실패 (${response.status})`);
  }
  return (await response.json()) as TelephonyInboundCallSnapshot;
}

export async function getTelephonyCallActivities(): Promise<TelephonyCallActivitySnapshot> {
  const response = await gatewayFetch("/v1/telephony-call-activities");
  if (!response.ok) {
    throw new Error(`통화 활동 상태 조회 실패 (${response.status})`);
  }
  return (await response.json()) as TelephonyCallActivitySnapshot;
}

export async function answerTelephonyInboundCall(
  inboundCallId: string,
): Promise<NonNullable<TelephonyInboundCall["answerCommand"]> & {
  replayed: boolean;
}> {
  const response = await gatewayFetch(
    `/v1/telephony-inbound-calls/${inboundCallId}/answer`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ConsultationGatewayError(
      response.status,
      body?.message ?? `전화 받기 요청 실패 (${response.status})`,
    );
  }
  return (await response.json()) as NonNullable<
    TelephonyInboundCall["answerCommand"]
  > & { replayed: boolean };
}

export async function openTelephonyInboundEventStream(
  signal: AbortSignal,
): Promise<Response> {
  return gatewayFetch("/v1/telephony-inbound-events/stream", {
    signal,
    streaming: true,
  });
}

export type PhoneDeskListFilter =
  | "all"
  | "inbound"
  | "click_to_call"
  | "centrex_direct"
  | "internal"
  | "active";

export type PhoneDeskCallResolutionInput = {
  finalLegId: string;
};

export async function getPhoneDeskCalls(
  options: PagedDateOptions<PhoneDeskListFilter> = {},
): Promise<PhoneDeskCallSnapshot> {
  const response = await gatewayFetch(
    `/v1/phone-desk/calls?${pagedDateParams(options).toString()}`,
  );
  if (!response.ok) {
    throw new Error(`전화데스크 목록 조회 실패 (${response.status})`);
  }
  return (await response.json()) as PhoneDeskCallSnapshot;
}

export async function searchLegalFriendsClientDirectory(
  query: string,
): Promise<LegalFriendsClientDirectorySearch> {
  const params = new URLSearchParams({ q: query, limit: "30" });
  return phoneDeskResponse<LegalFriendsClientDirectorySearch>(
    await gatewayFetch(`/v1/client-directory?${params.toString()}`),
  );
}

export async function createClientDirectoryConsultation(
  input: LegalFriendsDirectoryConsultationCreate,
): Promise<ClientDirectoryConsultationResult> {
  return phoneDeskResponse<ClientDirectoryConsultationResult>(
    await gatewayFetch("/v1/client-directory/consultations", {
      method: "POST",
      body: input,
    }),
  );
}

async function phoneDeskResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ConsultationGatewayError(
      response.status,
      body?.message ?? `전화데스크 처리 실패 (${response.status})`,
    );
  }
  return (await response.json()) as T;
}

export async function getPhoneDeskCall(
  callId: string,
): Promise<PhoneDeskCallDetail> {
  return phoneDeskResponse<PhoneDeskCallDetail>(
    await gatewayFetch(`/v1/phone-desk/calls/${callId}`),
  );
}

export async function savePhoneDeskAftercare(
  callId: string,
  input: PhoneDeskAftercareInput,
): Promise<PhoneDeskCallDetail> {
  return phoneDeskResponse<PhoneDeskCallDetail>(
    await gatewayFetch(`/v1/phone-desk/calls/${callId}/aftercare`, {
      method: "POST",
      body: input,
    }),
  );
}

export async function resolvePhoneDeskCall(
  callId: string,
  input: PhoneDeskCallResolutionInput,
): Promise<PhoneDeskCallDetail> {
  return phoneDeskResponse<PhoneDeskCallDetail>(
    await gatewayFetch(`/v1/phone-desk/calls/${callId}/resolve`, {
      method: "POST",
      body: input,
    }),
  );
}

export async function completePhoneDeskFollowUp(
  taskId: string,
): Promise<{ id: string; state: "completed"; completedAt: string }> {
  return phoneDeskResponse(
    await gatewayFetch(`/v1/phone-desk/follow-ups/${taskId}/complete`, {
      method: "POST",
      body: { completed: true },
    }),
  );
}

export async function openPhoneDeskEventStream(
  signal: AbortSignal,
): Promise<Response> {
  return gatewayFetch("/v1/phone-desk/events/stream", {
    signal,
    streaming: true,
  });
}

export async function getConsultation(
  id: string,
): Promise<ConsultationDetail | null> {
  const response = await gatewayFetch(`/v1/consultations/${id}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`상담 상세 조회 실패 (${response.status})`);
  }
  return (await response.json()) as ConsultationDetail;
}

export async function assignConsultationToMe(id: string): Promise<{
  assignmentId: string;
  consultationId: string;
  state: "assigned";
  assignedAt: string;
  replayed: boolean;
  queuedEventTypes: string[];
}> {
  const response = await gatewayFetch(
    `/v1/consultations/${id}/assign-to-me`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ConsultationGatewayError(
      response.status,
      body?.message ?? `담당 배정 실패 (${response.status})`,
    );
  }
  return (await response.json()) as {
    assignmentId: string;
    consultationId: string;
    state: "assigned";
    assignedAt: string;
    replayed: boolean;
    queuedEventTypes: string[];
  };
}

export async function invalidateLegalFriendsCase(id: string): Promise<{
  consultationId: string;
  eventId: string | null;
  state: "queued" | "invalidated";
  targetManagerExternalAccountId: "lawandfirm_s999";
  targetManagerMemberIdx: 1824;
  replayed: boolean;
}> {
  const response = await gatewayFetch(
    `/v1/consultations/${id}/legalfriends/invalidate`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ConsultationGatewayError(
      response.status,
      body?.message ?? `무효 처리 요청 실패 (${response.status})`,
    );
  }
  return (await response.json()) as {
    consultationId: string;
    eventId: string | null;
    state: "queued" | "invalidated";
    targetManagerExternalAccountId: "lawandfirm_s999";
    targetManagerMemberIdx: 1824;
    replayed: boolean;
  };
}

async function telephonyResponse(response: Response): Promise<TelephonyCall> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ConsultationGatewayError(
      response.status,
      body?.message ?? `클릭투콜 처리 실패 (${response.status})`,
    );
  }
  return (await response.json()) as TelephonyCall;
}

async function messageResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ConsultationGatewayError(
      response.status,
      body?.message ?? `문자 처리 실패 (${response.status})`,
    );
  }
  return (await response.json()) as T;
}

export async function getMessageTemplates(): Promise<MessageTemplate[]> {
  const body = await messageResponse<{ items: MessageTemplate[] }>(
    await gatewayFetch("/v1/message-templates"),
  );
  return body.items;
}

export async function getMessageHub(): Promise<MessageHub> {
  return messageResponse(await gatewayFetch("/v1/messages"));
}

export async function getMessageThread(key: string): Promise<MessageThread> {
  return messageResponse(
    await gatewayFetch(`/v1/messages/thread?key=${encodeURIComponent(key)}`),
  );
}

export async function createMessageTemplate(input: {
  name: string;
  body: string;
  image?: { originalName: string; fileBase64: string } | null;
}): Promise<MessageTemplate> {
  return messageResponse(
    await gatewayFetch("/v1/message-templates", {
      method: "POST",
      body: input,
      timeoutMs: 20_000,
    }),
  );
}

export async function updateMessageTemplate(
  templateId: string,
  input: {
    name: string;
    body: string;
    image?: { originalName: string; fileBase64: string } | null;
  },
): Promise<MessageTemplate> {
  return messageResponse(
    await gatewayFetch(`/v1/message-templates/${templateId}`, {
      method: "POST",
      body: input,
      timeoutMs: 20_000,
    }),
  );
}

export async function deleteMessageTemplate(
  templateId: string,
): Promise<{ id: string; deleted: true }> {
  return messageResponse(
    await gatewayFetch(`/v1/message-templates/${templateId}`, {
      method: "DELETE",
    }),
  );
}

export async function requestConsultationMessage(
  consultationId: string,
  input: { idempotencyKey: string; templateId: string | null; body: string },
): Promise<TelephonyMessage> {
  return messageResponse(
    await gatewayFetch(`/v1/consultations/${consultationId}/messages`, {
      method: "POST",
      body: input,
    }),
  );
}

export async function requestDirectoryMessage(input: {
  clientIdx: number;
  caseIdx: number;
  idempotencyKey: string;
  templateId: string | null;
  body: string;
}): Promise<TelephonyMessage> {
  return messageResponse(
    await gatewayFetch("/v1/client-directory/messages", {
      method: "POST",
      body: input,
    }),
  );
}

export async function getTelephonyMessage(
  messageId: string,
): Promise<TelephonyMessage> {
  return messageResponse(
    await gatewayFetch(`/v1/telephony-messages/${messageId}`),
  );
}

export async function requestConsultationClickToCall(
  consultationId: string,
): Promise<TelephonyCall> {
  return telephonyResponse(
    await gatewayFetch(
      `/v1/consultations/${consultationId}/click-to-call`,
      { method: "POST" },
    ),
  );
}

export async function requestDirectoryClickToCall(input: {
  clientIdx: number;
  caseIdx: number;
}): Promise<TelephonyCall> {
  return telephonyResponse(
    await gatewayFetch("/v1/client-directory/click-to-call", {
      method: "POST",
      body: input,
    }),
  );
}

export async function getTelephonyCall(callId: string): Promise<TelephonyCall> {
  return telephonyResponse(
    await gatewayFetch(`/v1/telephony-calls/${callId}`),
  );
}

export async function confirmTelephonyCallDisposition(
  callId: string,
  disposition: TelephonyCallDisposition,
): Promise<TelephonyCall> {
  return telephonyResponse(
    await gatewayFetch(`/v1/telephony-calls/${callId}/disposition`, {
      method: "POST",
      body: { disposition },
    }),
  );
}

async function kakaoEntryAction<T>(
  id: string,
  action: "confirm" | "invalidate",
  body?: unknown,
): Promise<T> {
  const response = await gatewayFetch(
    `/v1/consultations/${id}/kakao-entry/${action}`,
    { method: "POST", ...(body === undefined ? {} : { body }) },
  );
  if (!response.ok) {
    const responseBody = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ConsultationGatewayError(
      response.status,
      responseBody?.message ?? `카카오 상담 처리 실패 (${response.status})`,
    );
  }
  return (await response.json()) as T;
}

export async function confirmKakaoHomepageEntry(
  id: string,
  displayName: string,
) {
  return kakaoEntryAction<{
    consultationId: string;
    entryId: string;
    status: "confirmed";
    displayName: string;
    confirmedAt: string;
    replayed: boolean;
  }>(id, "confirm", { displayName });
}

export async function invalidateKakaoHomepageEntry(id: string) {
  return kakaoEntryAction<{
    consultationId: string;
    entryId: string;
    status: "invalid";
    invalidatedAt: string;
    replayed: boolean;
  }>(id, "invalidate");
}
