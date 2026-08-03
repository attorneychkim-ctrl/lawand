import "server-only";

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
  residenceRegion: string | null;
  mode: "quick" | "detailed";
  dedupeOutcome:
    | "new"
    | "exact_duplicate"
    | "identity_enrichment"
    | "suspected_duplicate";
  requestCount: number;
  assigneeDisplayName: string | null;
  kakaoEntry: {
    status: "pending" | "confirmed" | "invalid";
    clickCount: number;
    lastClickedAt: string;
  } | null;
  naverBooking: {
    bookingNumber: string;
    status: "details_pending" | "ready" | "cancelled";
    scheduledAt: string;
  } | null;
  firstRequestedAt: string;
  lastRequestedAt: string;
};

export type ConsultationDetail = {
  id: string;
  publicReceiptCode: string;
  state: string;
  displayName: string;
  contactChannel: "phone" | "kakao_channel" | "naver_booking";
  kakaoEntry: {
    id: string;
    status: "pending" | "confirmed" | "invalid";
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
  firstRequestedAt: string;
  lastRequestedAt: string;
  requests: Array<{
    id: string;
    mode: "quick" | "detailed";
    source:
      | "homepage"
      | "kakao_channel"
      | "homepage_kakao"
      | "naver_booking_email";
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
      | "customer_initiated_booking";
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
  options: { method?: "GET" | "POST"; body?: unknown } = {},
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
    signal: AbortSignal.timeout(8_000),
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

export async function getConsultations(): Promise<ConsultationListItem[]> {
  const response = await gatewayFetch("/v1/consultations?limit=50");
  if (!response.ok) {
    throw new Error(`상담 목록 조회 실패 (${response.status})`);
  }
  const body = (await response.json()) as { items: ConsultationListItem[] };
  return body.items;
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
