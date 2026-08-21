import "server-only";

import { createHash } from "node:crypto";

import { createSingleFlight } from "@lawand/core";
import type {
  ConsultationCustomerNameTag,
  ConsultationAssigneeTransferInput,
  DesktopNotificationPreferenceUpdate,
  LegalFriendsConsultationHandling,
  LegalFriendsDirectoryConsultationCreate,
  ResidenceRegion,
  ReviewGiftCouponSend,
  StaffConsultationCreate,
} from "@lawand/core";

import { readStaffSessionToken } from "./session";

const gatewayUrl =
  process.env.LAWAND_GATEWAY_URL ?? "http://127.0.0.1:3022";
const gatewayReadSingleFlight = createSingleFlight();

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
  contactPreference: "as_soon_as_possible" | "scheduled_window";
  contactWindowStart: string | null;
  contactWindowEnd: string | null;
  phone: string | null;
  softDeletedAt: string | null;
  softDeletedByUserId: string | null;
  staffCreated: boolean;
  existingCustomer: boolean;
  existingCustomerStaffNames: string[];
  referrerStaffNames: string[] | null;
  legalFriendsRegistered: boolean;
  nameMismatch: boolean;
  requiresLegalFriendsReview: boolean;
  residenceRegion: string | null;
  mode: "quick" | "detailed" | "self_diagnosis";
  dedupeOutcome:
    | "new"
    | "exact_duplicate"
    | "identity_enrichment"
    | "repeat_unassigned"
    | "repeat_assigned"
    | "suspected_duplicate";
  requestCount: number;
  groupMemberCount: number;
  channelCounts: {
    phone: number;
    kakao_channel: number;
    naver_booking: number;
  };
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
  autoSendTrigger: "consultation_assigned" | "consultation_completed" | "no_answer" | "busy" | "manager_callback_requested" | "rejected" | null;
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

export type ReviewRecordType = "review" | "submission";
export type ReviewListFilter =
  | "all"
  | "reply_needed"
  | "pending"
  | "published"
  | "restricted"
  | "mine";
export type ReviewRestrictionReason =
  | "privacy"
  | "unverified"
  | "abusive_or_manipulated"
  | "customer_request"
  | "duplicate"
  | "other";

export type ReviewManagementListItem = {
  id: string;
  recordType: ReviewRecordType;
  receiptCode: string | null;
  authorDisplay: string;
  contentPreview: string;
  practiceArea: "personal_rehabilitation" | "personal_bankruptcy" | "other";
  progressStage: "consultation" | "commencement" | "discharge" | "other";
  status: "pending" | "published" | "restricted";
  restrictionReason: ReviewRestrictionReason | null;
  replyStatus: "waiting" | "answered" | "not_applicable";
  giftCouponStatus: "waiting" | "sent";
  linked: boolean;
  mine: boolean;
  occurredAt: string;
};

export type ReviewManagementSnapshot = {
  items: ReviewManagementListItem[];
  total: number;
  page: number;
  pageSize: 20;
  pageCount: number;
  filter: ReviewListFilter;
  summary: Record<ReviewListFilter, number>;
};

export type ReviewManagementDetail = {
  id: string;
  recordType: ReviewRecordType;
  receiptCode: string | null;
  authorDisplay: string;
  content: string;
  submittedPhone: string | null;
  practiceArea: ReviewManagementListItem["practiceArea"];
  progressStage: ReviewManagementListItem["progressStage"];
  experienceKeywords: string[];
  piiStatus: "clear" | "flagged" | "reviewed";
  piiFlags: string[];
  status: ReviewManagementListItem["status"];
  restrictionReason: ReviewRestrictionReason | null;
  restrictionNote: string | null;
  occurredAt: string;
  publishedAt: string | null;
  linkedCustomer: {
    clientIdx: number;
    caseIdx: number;
    clientName: string;
    phone: string | null;
    livingPlace: string | null;
    caseType: number;
    caseCategory: number;
    caseState: number;
    maxState: number;
    isClosed: boolean;
    isRepealed: boolean;
    courtName: string | null;
    caseNumber: string | null;
    caseName: string | null;
    staff: Array<{
      name: string;
      externalMemberIdx: number;
      position: 1 | 2 | 3;
    }>;
    caseCreatedOn: string;
    caseUpdatedOn: string;
    dutyManagerUserIds: string[];
  } | null;
  linkSource: "invitation" | "exact_phone" | "manual" | null;
  reply: {
    id: string;
    content: string;
    createdByName: string;
    updatedByName: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  canReply: boolean;
};

export type ReviewRequestTemplate = {
  id: string;
  presetKey: "consultation" | "commencement" | "discharge" | "other" | null;
  name: string;
  body: string;
  bodyByteLength: number;
  defaultProgressStage:
    | "consultation"
    | "commencement"
    | "discharge"
    | "other";
  createdAt: string;
  updatedAt: string;
};

export type ReviewRequestBatchResult = {
  items: Array<{
    clientIdx: number;
    caseIdx: number;
    status: "sent" | "failed";
    messageId: string | null;
    errorCode: string | null;
    replayed: boolean;
  }>;
  sentCount: number;
  failedCount: number;
};

export type MessageThreadSummary = {
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
  messageCount: number;
  lastDirection: "outbound" | "inbound";
  lastMessageKind: "sms" | "lms" | "mms";
  lastMessagePreview: string;
  lastMessageAt: string;
  needsConnection: boolean;
  unreadCount: number;
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
  total: number;
  needsConnectionTotal: number;
  nextCursor: string | null;
  mailboxes: MessageMailbox[];
};

export type MessageThread = {
  thread: Pick<
    MessageThreadSummary,
    | "key"
    | "caseIdx"
    | "clientIdx"
    | "consultationId"
    | "manualContactId"
    | "targetSource"
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
  nextCursor: string | null;
};

export type TelephonyMessage = {
  id: string;
  targetSource: "consultation" | "legal_friends_directory" | "manual";
  consultationId: string | null;
  manualContactId: string | null;
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
  endpointType: "personal" | "representative";
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
    | null;
};

export type TelephonyInboundCallSnapshot = {
  snapshotAt: string;
  items: TelephonyInboundCall[];
};

export type TelephonyCallActivity = {
  id: string;
  observedCallId: string | null;
  currentEndpointOwnedByActor: boolean;
  answerableInboundCallId: string | null;
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
  callRegion: "seoul" | "daejeon" | "busan" | "unclassified";
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
    extension: string;
    staffUserId: string | null;
    displayName: string | null;
    kind: "customer" | "consultation" | "internal";
    direction: "inbound" | "outbound";
    state: "ringing" | "connected" | "ended";
    remoteExtension: string | null;
    startedAt: string;
  }>;
  internalCallers: Array<{
    staffUserId: string | null;
    displayName: string | null;
    extension: string;
    organization: { key: string; name: string } | null;
    region: { key: string; name: string } | null;
    department: string | null;
    jobTitle: string | null;
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
  canOpenLiveAftercare: boolean;
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
    endpointType: "personal" | "representative";
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
  source: "aftercare" | "consultation_schedule";
  aftercareId: string | null;
  consultationRequestId: string | null;
  callId: string | null;
  result: PhoneDeskCallResult | null;
  consultationId: string | null;
  customerName: string;
  remotePhone: string;
  contactTarget:
    | {
        source: "consultation";
        consultationId: string;
        receiptCode: string;
      }
    | {
        source: "legal_friends_directory";
        clientIdx: number;
        caseIdx: number;
        receiptCode: string;
      }
    | null;
  dueAt: string;
  dueEndAt: string | null;
  assignee: { staffUserId: string; displayName: string };
};

export type PhoneDeskFollowUpSnapshot = {
  snapshotAt: string;
  items: PhoneDeskFollowUp[];
};

export type PhoneDeskFollowUpDuty = {
  snapshotAt: string;
  count: number;
  followUpCount: number;
  transferConfirmationCount: number;
  items: Array<{
    id: string;
    source: "aftercare" | "consultation_schedule";
    dueAt: string;
    dueEndAt: string | null;
  }>;
};

export type PhoneDeskCallSnapshot = {
  snapshotAt: string;
  items: PhoneDeskCall[];
  assigneeOptions: Array<{ staffUserId: string; displayName: string }>;
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
  dedupeOutcome:
    | "new"
    | "exact_duplicate"
    | "repeat_unassigned"
    | "repeat_assigned"
    | "suspected_duplicate";
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
  canResolveFinalParticipant: boolean;
  legalFriendsMatch: Extract<
    NonNullable<TelephonyInboundCall["customerMatch"]>,
    { source: "legal_friends" }
  > | null;
  recommendedAssigneeUserIds: string[];
  aftercareAutomations?: Array<{
    result: "no_answer" | "busy" | "manager_callback_requested" | "rejected" | "consultation_completed";
    kind: "message_template" | "review_request";
    available: boolean;
    templateName: string | null;
    templateBody: string | null;
    latest: { status: "pending" | "sent" | "failed" | "unknown"; occurredAt: string } | null;
  }>;
};

export type PhoneDeskAftercareInput = {
  result: PhoneDeskCallResult;
  otherText?: string;
  memo?: string;
  consultation:
    | { mode: "none" }
    | { mode: "link"; consultationId: string }
    | {
        mode: "create";
        customerName: string;
        customerNameTag?: ConsultationCustomerNameTag;
        directorySource?: {
          clientIdx: number;
          caseIdx: number;
          relationship: "referrer";
        };
        residenceRegion: ResidenceRegion;
        assigneeUserId?: string;
        transferNote?: string;
      };
  followUp:
    | { enabled: false }
    | { enabled: true; dueAt: string; assigneeUserId: string };
  phonebook?:
    | { mode: "none" }
    | {
        mode: "save";
        displayName: string;
        originalPhone: string;
        connectedPhone?: string | null;
      };
  automaticMessage: {
    enabled: boolean;
    reviewRequestEnabled?: boolean;
  };
};

export type PhonebookContact = {
  id: string;
  displayName: string;
  originalPhone: string;
  connectedPhone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PhonebookContactInput = {
  displayName: string;
  originalPhone: string;
  connectedPhone?: string | null;
};

export type ConsultationDetail = {
  id: string;
  publicReceiptCode: string;
  state: string;
  displayName: string;
  contactChannel: "phone" | "kakao_channel" | "naver_booking";
  phone: string | null;
  softDeletedAt: string | null;
  softDeletedByUserId: string | null;
  staffCreated: boolean;
  existingCustomer: boolean;
  legalFriendsRegistered: boolean;
  nameMismatch: boolean;
  requiresLegalFriendsReview: boolean;
  legalFriendsMatches: Array<{
    clientIdx: number;
    clientName: string;
    caseIdx: number;
    caseNumber: string | null;
    caseName: string | null;
    caseType: number;
    caseState: number;
    isClosed: boolean;
    isRepealed: boolean;
    courtName: string | null;
    staffNames: string[];
    caseCreatedOn: string;
    caseUpdatedOn: string;
  }>;
  legalFriendsHandling: {
    mode: LegalFriendsConsultationHandling["mode"];
    directoryClientIdx: number | null;
    directoryCaseIdx: number | null;
    decidedByUserId: string;
    decidedAt: string;
  } | null;
  group: {
    id: string;
    canonicalConsultationId: string;
    createdReason: "automatic_phone_7d" | "manual_link" | "manual_split";
    createdAt: string;
    memberCount: number;
    nameMismatch: boolean;
    members: Array<{
      id: string;
      publicReceiptCode: string;
      canonical: boolean;
      state: string;
      displayName: string;
      contactChannel: "phone" | "kakao_channel" | "naver_booking";
      phone: string | null;
      requestCount: number;
      firstRequestedAt: string;
      lastRequestedAt: string;
      kakaoStatus: "pending" | "confirmed" | "invalid" | null;
    }>;
    events: Array<{
      id: string;
      consultationId: string;
      eventType: string;
      actorUserId: string | null;
      actorDisplayName: string | null;
      metadata: Record<string, unknown>;
      occurredAt: string;
    }>;
  } | null;
  kakaoEntry: {
    id: string;
    consultationId: string;
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
  assignmentOptions: Array<{
    userId: string;
    displayName: string;
    membershipId: string;
    organizationName: string;
    department: string;
    jobTitle: string;
  }>;
  assignmentTransfers: Array<{
    id: string;
    previousAssigneeUserId: string;
    previousAssigneeDisplayName: string;
    targetAssigneeUserId: string;
    targetAssigneeDisplayName: string;
    requestedByUserId: string;
    requestedByDisplayName: string;
    reason: ConsultationAssigneeTransferInput["reason"];
    status: "pending" | "succeeded" | "failed" | "needs_confirmation";
    eventStatus: "pending" | "published" | "dead";
    requestedAt: string;
    finishedAt: string | null;
    lastError: string | null;
  }>;
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
    consultationId: string;
    consultationReceiptCode: string;
    mode: "quick" | "detailed" | "self_diagnosis";
    source:
      | "homepage"
      | "kakao_channel"
      | "homepage_kakao"
      | "naver_booking_email"
      | "erp_phone_desk"
      | "erp_staff"
      | "erp_client_directory";
    createdByUserId: string | null;
    createdByDisplayName: string | null;
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

export type DesktopNotificationDevice = {
  id: string;
  name: string;
  platform: "windows";
  appVersion: string;
  status: "active" | "revoked";
  connectionState: "never_connected" | "online" | "offline" | "revoked";
  lastSeenAt: string | null;
  lastDeliveredAt: string | null;
  createdAt: string;
};

async function gatewayFetch(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
    streaming?: boolean;
    timeoutMs?: number;
    sessionToken?: string;
  } = {},
) {
  const sessionToken =
    options.sessionToken ?? await readStaffSessionToken();
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

async function coalescedGatewayRead<T>(
  path: string,
  errorMessage: (status: number) => string,
): Promise<T> {
  const sessionToken = await readStaffSessionToken();
  if (!sessionToken) throw new Error("직원 로그인이 필요합니다.");
  const sessionKey = createHash("sha256")
    .update(sessionToken, "utf8")
    .digest("hex");
  return gatewayReadSingleFlight.run(`${sessionKey}:${path}`, async () => {
    const response = await gatewayFetch(path, { sessionToken });
    if (!response.ok) throw new Error(errorMessage(response.status));
    return (await response.json()) as T;
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

export class DesktopNotificationGatewayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function desktopNotificationResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new DesktopNotificationGatewayError(
      response.status,
      body?.error ?? "desktop_notification_error",
      body?.message ?? "PC 알림 요청을 처리하지 못했습니다.",
    );
  }
  return (await response.json()) as T;
}

type PagedDateOptions<TFilter extends string> = {
  page?: number;
  pageSize?: ListPageSize;
  filter?: TFilter;
  assigneeUserId?: string;
  from?: string;
  to?: string;
  search?: string;
  includeFollowUps?: boolean;
};

function pagedDateParams<TFilter extends string>(
  options: PagedDateOptions<TFilter>,
) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
    filter: options.filter ?? "all",
  });
  if (options.assigneeUserId) {
    params.set("assigneeUserId", options.assigneeUserId);
  }
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  if (options.search) params.set("q", options.search);
  if (options.includeFollowUps) params.set("includeFollowUps", "1");
  return params;
}

export async function getConsultations(
  options: PagedDateOptions<ConsultationListFilter> = {},
): Promise<ConsultationListSnapshot> {
  return coalescedGatewayRead<ConsultationListSnapshot>(
    `/v1/consultations?${pagedDateParams(options).toString()}`,
    (status) => `상담 목록 조회 실패 (${status})`,
  );
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
  return coalescedGatewayRead<TelephonyInboundCallSnapshot>(
    "/v1/telephony-inbound-calls",
    (status) => `수신전화 상태 조회 실패 (${status})`,
  );
}

export async function getTelephonyCallActivities(): Promise<TelephonyCallActivitySnapshot> {
  return coalescedGatewayRead<TelephonyCallActivitySnapshot>(
    "/v1/telephony-call-activities",
    (status) => `통화 활동 상태 조회 실패 (${status})`,
  );
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

export type TelephonyRealtimeAck = {
  deliveryId: string;
  clientElapsedMs: number;
  callState:
    | "ringing"
    | "connected"
    | "transferring"
    | "needs_confirmation"
    | "ended"
    | "pending"
    | "failed"
    | "unknown";
  displayMode: "phone_desk" | "notification" | "snapshot";
};

export type PhoneDeskCallResolutionInput = {
  finalLegId?: string;
  finalStaffUserId?: string;
};

export async function getPhoneDeskCalls(
  options: PagedDateOptions<PhoneDeskListFilter> = {},
): Promise<PhoneDeskCallSnapshot> {
  return coalescedGatewayRead<PhoneDeskCallSnapshot>(
    `/v1/phone-desk/calls?${pagedDateParams(options).toString()}`,
    (status) => `전화데스크 목록 조회 실패 (${status})`,
  );
}

export async function getPhoneDeskFollowUps(): Promise<PhoneDeskFollowUpSnapshot> {
  return phoneDeskResponse<PhoneDeskFollowUpSnapshot>(
    await gatewayFetch("/v1/phone-desk/follow-ups"),
  );
}

export async function getPhoneDeskFollowUpDuty(): Promise<PhoneDeskFollowUpDuty> {
  return phoneDeskResponse<PhoneDeskFollowUpDuty>(
    await gatewayFetch("/v1/phone-desk/follow-ups/duty"),
  );
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

export async function createStaffConsultation(
  input: StaffConsultationCreate,
): Promise<ClientDirectoryConsultationResult> {
  return phoneDeskResponse<ClientDirectoryConsultationResult>(
    await gatewayFetch("/v1/staff/consultations", {
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

export async function getPhonebookContacts(): Promise<{
  items: PhonebookContact[];
  total: number;
}> {
  return phoneDeskResponse(
    await gatewayFetch("/v1/phonebook"),
  );
}

export async function createPhonebookContact(
  input: PhonebookContactInput,
): Promise<PhonebookContact> {
  return phoneDeskResponse(
    await gatewayFetch("/v1/phonebook", { method: "POST", body: input }),
  );
}

export async function updatePhonebookContact(
  contactId: string,
  input: PhonebookContactInput,
): Promise<PhonebookContact> {
  return phoneDeskResponse(
    await gatewayFetch(`/v1/phonebook/${contactId}`, {
      method: "POST",
      body: input,
    }),
  );
}

export async function deactivatePhonebookContact(
  contactId: string,
): Promise<{ id: string; deactivated: true }> {
  return phoneDeskResponse(
    await gatewayFetch(`/v1/phonebook/${contactId}`, { method: "DELETE" }),
  );
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

export async function acknowledgeTelephonyRealtime(
  input: TelephonyRealtimeAck,
): Promise<{ status: "recorded" | "replayed" | "expired" }> {
  const response = await gatewayFetch("/v1/telephony-realtime/ack", {
    method: "POST",
    body: input,
    timeoutMs: 3_000,
  });
  const body = (await response.json().catch(() => null)) as {
    status?: "recorded" | "replayed" | "expired";
  } | null;
  if (
    ![200, 202, 410].includes(response.status) ||
    !body?.status
  ) {
    throw new ConsultationGatewayError(
      response.status,
      `전화 실시간 지연 기록 실패 (${response.status})`,
    );
  }
  return { status: body.status };
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

export async function softDeleteStaffConsultation(id: string): Promise<{
  consultationId: string;
  state: "closed";
  softDeletedAt: string;
  softDeletedByUserId: string;
  replayed: boolean;
}> {
  return phoneDeskResponse(
    await gatewayFetch(`/v1/consultations/${id}`, {
      method: "DELETE",
    }),
  );
}

export async function linkConsultationGroup(
  id: string,
  targetReceiptCode: string,
): Promise<{
  groupId: string;
  canonicalConsultationId: string;
  memberCount: number;
  replayed: boolean;
}> {
  return phoneDeskResponse(
    await gatewayFetch(`/v1/consultations/${id}/group/link`, {
      method: "POST",
      body: { targetReceiptCode },
    }),
  );
}

export async function splitConsultationGroup(id: string): Promise<{
  previousGroupId: string;
  newGroupId: string;
  consultationId: string;
  previousGroupCanonicalConsultationId: string;
}> {
  return phoneDeskResponse(
    await gatewayFetch(`/v1/consultations/${id}/group/split`, {
      method: "POST",
      body: {},
    }),
  );
}

export async function assignConsultationToMe(
  id: string,
  legalFriendsHandling?: LegalFriendsConsultationHandling,
): Promise<{
  assignmentId: string;
  consultationId: string;
  state: "assigned";
  assignedAt: string;
  replayed: boolean;
  queuedEventTypes: string[];
}> {
  const response = await gatewayFetch(
    `/v1/consultations/${id}/assign-to-me`,
    {
      method: "POST",
      ...(legalFriendsHandling
        ? { body: { legalFriendsHandling } }
        : {}),
    },
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

export async function requestConsultationAssigneeTransfer(
  id: string,
  input: ConsultationAssigneeTransferInput,
): Promise<{
  consultationId: string;
  transferId: string;
  eventId: string;
  state: "queued";
  replayed: boolean;
}> {
  const response = await gatewayFetch(
    `/v1/consultations/${id}/assignee-transfer`,
    { method: "POST", body: input },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ConsultationGatewayError(
      response.status,
      body?.message ?? `담당자 변경 요청 실패 (${response.status})`,
    );
  }
  return (await response.json()) as {
    consultationId: string;
    transferId: string;
    eventId: string;
    state: "queued";
    replayed: boolean;
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

export async function restoreInvalidatedLegalFriendsCase(id: string): Promise<{
  consultationId: string;
  eventId: string;
  state: "queued";
  replayed: boolean;
}> {
  const response = await gatewayFetch(
    `/v1/consultations/${id}/legalfriends/restore`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ConsultationGatewayError(
      response.status,
      body?.message ?? `무효 상담 복원 요청 실패 (${response.status})`,
    );
  }
  return (await response.json()) as {
    consultationId: string;
    eventId: string;
    state: "queued";
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

async function reviewResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ConsultationGatewayError(
      response.status,
      body?.message ?? `후기 처리 실패 (${response.status})`,
    );
  }
  return (await response.json()) as T;
}

export async function getReviews(input: {
  page?: number;
  filter?: ReviewListFilter;
} = {}): Promise<ReviewManagementSnapshot> {
  const params = new URLSearchParams({
    page: String(input.page ?? 1),
    filter: input.filter ?? "all",
  });
  return reviewResponse(
    await gatewayFetch(`/v1/reviews?${params.toString()}`),
  );
}

export async function getReviewDetail(
  recordType: ReviewRecordType,
  id: string,
): Promise<ReviewManagementDetail | null> {
  const response = await gatewayFetch(`/v1/reviews/${recordType}/${id}`);
  if (response.status === 404) return null;
  return reviewResponse(response);
}

export async function getReviewDutyCount(): Promise<{ count: number }> {
  return reviewResponse(await gatewayFetch("/v1/reviews/duty-count"));
}

export async function getReviewNotification(
  recordType: ReviewRecordType,
  id: string,
): Promise<{
  id: string;
  recordType: ReviewRecordType;
  href: string;
  customerName: string;
  receiptCode: string | null;
  caseNumber: string | null;
  caseName: string | null;
  managerNames: string[];
  status: ReviewManagementListItem["status"];
} | null> {
  const response = await gatewayFetch(
    `/v1/reviews/${recordType}/${id}/notification`,
  );
  if (response.status === 404) return null;
  return reviewResponse(response);
}

export async function openReviewEventStream(
  signal: AbortSignal,
): Promise<Response> {
  return gatewayFetch("/v1/review-events/stream", {
    signal,
    streaming: true,
  });
}

export async function getMessageDutyCount(): Promise<{ count: number }> {
  return reviewResponse(await gatewayFetch("/v1/messages/duty-count"));
}

export async function getMessageNotification(id: string): Promise<{
  id: string; threadKey: string; href: string; customerLabel: string; receivedAt: string;
} | null> {
  const response = await gatewayFetch(`/v1/messages/${id}/notification`);
  if (response.status === 404) return null;
  return reviewResponse(response);
}

export async function listUnreadMessageNotifications(): Promise<{ items: Array<{ messageId: string }> }> {
  return reviewResponse(await gatewayFetch("/v1/messages/notifications"));
}

export async function openMessageEventStream(signal: AbortSignal): Promise<Response> {
  return gatewayFetch("/v1/message-events/stream", { signal, streaming: true });
}

export async function linkReviewCustomer(
  recordType: ReviewRecordType,
  id: string,
  input: { clientIdx: number; caseIdx: number },
): Promise<ReviewManagementDetail> {
  return reviewResponse(
    await gatewayFetch(`/v1/reviews/${recordType}/${id}/link`, {
      method: "POST",
      body: input,
    }),
  );
}

export async function moderateReview(
  recordType: ReviewRecordType,
  id: string,
  input: {
    action: "publish" | "restrict";
    reason: ReviewRestrictionReason | null;
    note: string | null;
  },
): Promise<{
  recordType: ReviewRecordType;
  id: string;
  detail: ReviewManagementDetail;
}> {
  return reviewResponse(
    await gatewayFetch(`/v1/reviews/${recordType}/${id}/moderation`, {
      method: "POST",
      body: input,
    }),
  );
}

export async function upsertReviewReply(
  reviewId: string,
  input: { content: string },
): Promise<ReviewManagementDetail> {
  return reviewResponse(
    await gatewayFetch(`/v1/reviews/review/${reviewId}/reply`, {
      method: "POST",
      body: input,
    }),
  );
}

export async function getReviewRequestTemplates(): Promise<
  ReviewRequestTemplate[]
> {
  const body = await reviewResponse<{ items: ReviewRequestTemplate[] }>(
    await gatewayFetch("/v1/review-request-templates"),
  );
  return body.items;
}

export async function createReviewRequestTemplate(input: {
  name: string;
  body: string;
  defaultProgressStage: ReviewRequestTemplate["defaultProgressStage"];
}): Promise<ReviewRequestTemplate> {
  return reviewResponse(
    await gatewayFetch("/v1/review-request-templates", {
      method: "POST",
      body: input,
    }),
  );
}

export async function updateReviewRequestTemplate(
  templateId: string,
  input: {
    name: string;
    body: string;
    defaultProgressStage: ReviewRequestTemplate["defaultProgressStage"];
  },
): Promise<ReviewRequestTemplate> {
  return reviewResponse(
    await gatewayFetch(`/v1/review-request-templates/${templateId}`, {
      method: "POST",
      body: input,
    }),
  );
}

export async function deleteReviewRequestTemplate(
  templateId: string,
): Promise<{ id: string; deleted: true }> {
  return reviewResponse(
    await gatewayFetch(`/v1/review-request-templates/${templateId}`, {
      method: "DELETE",
    }),
  );
}

export async function sendReviewRequests(input: {
  templateId: string;
  targets: Array<{
    clientIdx: number;
    caseIdx: number;
    idempotencyKey: string;
  }>;
}): Promise<ReviewRequestBatchResult> {
  return reviewResponse(
    await gatewayFetch("/v1/review-requests/send", {
      method: "POST",
      body: input,
      timeoutMs: 60_000,
    }),
  );
}

export async function sendReviewGiftCoupon(
  recordType: ReviewRecordType,
  id: string,
  input: ReviewGiftCouponSend,
): Promise<ReviewGiftCouponDelivery & { replayed: boolean }> {
  return reviewResponse(await gatewayFetch(`/v1/reviews/${recordType}/${id}/gift-coupons`, { method: "POST", body: input, timeoutMs: 30_000 }));
}

export type ReviewGiftCouponDelivery = {
  id: string;
  status: "prepared" | "sent" | "unknown";
  productKey: string;
  brandName: string;
  goodsName: string;
  salePrice: number;
  reason: "review_thanks" | "service_recovery" | "event";
  orderNo: string | null;
  requestedAt: string;
  respondedAt: string | null;
};

export async function getReviewGiftCoupon(recordType: ReviewRecordType, id: string): Promise<{ delivery: ReviewGiftCouponDelivery | null }> {
  return reviewResponse(await gatewayFetch(`/v1/reviews/${recordType}/${id}/gift-coupons`));
}

export async function getMessageTemplates(): Promise<MessageTemplate[]> {
  const body = await messageResponse<{ items: MessageTemplate[] }>(
    await gatewayFetch("/v1/message-templates"),
  );
  return body.items;
}

export async function getMessageHub(input?: {
  cursor?: string;
  limit?: number;
}): Promise<MessageHub> {
  const searchParams = new URLSearchParams();
  if (input?.cursor) searchParams.set("cursor", input.cursor);
  if (input?.limit) searchParams.set("limit", String(input.limit));
  const query = searchParams.size ? `?${searchParams.toString()}` : "";
  return messageResponse(await gatewayFetch(`/v1/messages${query}`));
}

export async function getMessageThread(
  key: string,
  input?: { cursor?: string; limit?: number },
): Promise<MessageThread> {
  const searchParams = new URLSearchParams({ key });
  if (input?.cursor) searchParams.set("cursor", input.cursor);
  if (input?.limit) searchParams.set("limit", String(input.limit));
  return messageResponse(
    await gatewayFetch(`/v1/messages/thread?${searchParams.toString()}`),
  );
}

export async function createMessageTemplate(input: {
  name: string;
  body: string;
  autoSendTrigger: MessageTemplate["autoSendTrigger"];
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
    autoSendTrigger: MessageTemplate["autoSendTrigger"];
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
  input: {
    idempotencyKey: string;
    templateId: string | null;
    body: string;
    image?: { originalName: string; fileBase64: string } | null;
  },
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
  image?: { originalName: string; fileBase64: string } | null;
}): Promise<TelephonyMessage> {
  return messageResponse(
    await gatewayFetch("/v1/client-directory/messages", {
      method: "POST",
      body: input,
    }),
  );
}

export async function requestManualMessage(input: {
  idempotencyKey: string;
  templateId: string | null;
  body: string;
  contactId?: string | null;
  phone?: string | null;
  customerName?: string | null;
  image?: { originalName: string; fileBase64: string } | null;
}): Promise<TelephonyMessage> {
  return messageResponse(
    await gatewayFetch("/v1/messages/manual", {
      method: "POST",
      body: input,
      timeoutMs: 20_000,
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

export async function getDesktopNotificationDevices(): Promise<
  DesktopNotificationDevice[]
> {
  const body = await desktopNotificationResponse<{
    items: DesktopNotificationDevice[];
  }>(await gatewayFetch("/v1/desktop-notifications/devices"));
  return body.items;
}

export async function getDesktopNotificationPreferences(): Promise<
  DesktopNotificationPreferenceUpdate["preferences"]
> {
  const body = await desktopNotificationResponse<DesktopNotificationPreferenceUpdate>(
    await gatewayFetch("/v1/desktop-notifications/preferences"),
  );
  return body.preferences;
}

export async function updateDesktopNotificationPreferences(
  preferences: DesktopNotificationPreferenceUpdate["preferences"],
): Promise<DesktopNotificationPreferenceUpdate["preferences"]> {
  const body = await desktopNotificationResponse<DesktopNotificationPreferenceUpdate>(
    await gatewayFetch("/v1/desktop-notifications/preferences", {
      method: "PUT",
      body: { preferences },
    }),
  );
  return body.preferences;
}

export async function createDesktopNotificationPairing(): Promise<{
  pairingCode: string;
  expiresAt: string;
}> {
  return desktopNotificationResponse(
    await gatewayFetch("/v1/desktop-notifications/pairings", {
      method: "POST",
    }),
  );
}

export async function sendDesktopNotificationTest(): Promise<{
  notificationId: string;
  queuedDeviceCount: number;
  expiresAt: string;
}> {
  return desktopNotificationResponse(
    await gatewayFetch("/v1/desktop-notifications/test", {
      method: "POST",
    }),
  );
}

export async function revokeDesktopNotificationDevice(
  deviceId: string,
): Promise<{ id: string; revoked: true }> {
  return desktopNotificationResponse(
    await gatewayFetch(`/v1/desktop-notifications/devices/${deviceId}`, {
      method: "DELETE",
    }),
  );
}
