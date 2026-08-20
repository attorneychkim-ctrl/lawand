import {
  isSafeConsultationCustomerName,
  type ConsultationIntakeAnswers,
  type ResidenceRegion,
} from "@lawand/core";

export const LEGALFRIENDS_CREATE_CASE_URL =
  "https://www.legalfriends.co.kr/api/bankruptcy/case/createForLawnV2";
export const LEGALFRIENDS_CHANGE_MANAGER_URL =
  "https://www.legalfriends.co.kr/api/bankruptcy/case/changeManager";
export const KAKAO_LEGALFRIENDS_PLACEHOLDER_PHONE = "01000000000";
export const KAKAO_LEGALFRIENDS_PLACEHOLDER_LIVING_PLACE = "미수집";

const residenceNames: Record<
  Exclude<ResidenceRegion, "overseas_or_other">,
  string
> = {
  seoul: "서울특별시",
  busan: "부산광역시",
  daegu: "대구광역시",
  incheon: "인천광역시",
  gwangju: "광주광역시",
  daejeon: "대전광역시",
  ulsan: "울산광역시",
  sejong: "세종특별자치시",
  gyeonggi: "경기도",
  gangwon: "강원도",
  chungbuk: "충청북도",
  chungnam: "충청남도",
  jeonbuk: "전라북도",
  jeonnam: "전라남도",
  gyeongbuk: "경상북도",
  gyeongnam: "경상남도",
  jeju: "제주특별자치도",
};

const memoLabels: Array<
  [
    keyof Omit<ConsultationIntakeAnswers, "residenceRegion">,
    string,
  ]
> = [
  ["topic", "도움 분야"],
  ["urgencies", "현재 단계"],
  ["incomes", "소득"],
  ["unsecuredDebt", "담보 없는 채무"],
  ["securedDebt", "담보부 채무"],
  ["assets", "담보를 제외한 순재산"],
  ["discharge", "과거 면책"],
  ["dischargeYear", "면책 연도"],
  ["concern", "남긴 내용"],
  ["selfDiagnosis", "자가진단"],
];

export type LegalFriendsCasePayload = {
  case_type: 1 | 2 | 3;
  member_idx: number;
  name: string;
  phone: string;
  living_place: string;
  memo: string;
};

export class LegalFriendsPayloadError extends Error {
  constructor(
    readonly code:
      | "unsupported_residence_region"
      | "assignee_mapping_missing"
      | "consultation_phone_not_collected"
      | "invalid_consultation_intake"
      | "invalid_consultation_customer_name",
  ) {
    super(
      code === "unsupported_residence_region"
        ? "리걸프렌즈가 해외·기타 거주지역을 지원하지 않습니다."
        : code === "assignee_mapping_missing"
          ? "담당 직원의 리걸프렌즈 계정 매핑이 없습니다."
          : code === "consultation_phone_not_collected"
            ? "전화번호가 수집되지 않은 상담은 리걸프렌즈에 등록할 수 없습니다."
            : code === "invalid_consultation_customer_name"
              ? "저장된 고객명을 확인한 뒤 리걸프렌즈에 등록해 주세요."
              : "저장된 상담정보의 거주지역 또는 상담 항목을 확인해 주세요.",
    );
  }
}

export class LegalFriendsDeliveryError extends Error {
  constructor(
    readonly code:
      | "authentication_failed"
      | "invalid_request"
      | "rate_limited"
      | "remote_server_error"
      | "invalid_success_response"
      | "unexpected_http_status"
      | "ambiguous_delivery",
    message: string,
    readonly options: {
      httpStatus?: number;
      retryable: boolean;
      retryAfterSeconds?: number;
    },
  ) {
    super(message);
  }
}

function caseType(topic: string | undefined): 1 | 2 | 3 {
  if (topic === "개인파산·면책") return 2;
  if (topic === "기타") return 3;
  return 1;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!/^010\d{8}$/.test(digits)) {
    throw new Error("저장된 휴대전화 번호 형식이 올바르지 않습니다.");
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function memoValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : null;
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${key}=${String(item)}`)
      .join(", ");
  }
  return typeof value === "string" && value.length > 0 ? value : null;
}

function createMemo(
  mode: "quick" | "detailed" | "self_diagnosis",
  intake: ConsultationIntakeAnswers,
): string {
  const lines = [
    `접수 방식: ${
      mode === "quick"
        ? "빠른 상담"
        : mode === "self_diagnosis"
          ? "자가진단"
          : "상세 상담"
    }`,
  ];
  for (const [key, label] of memoLabels) {
    const value = memoValue(intake[key]);
    if (value) lines.push(`${label}: ${value}`);
  }
  return lines.join("\n");
}

export function createLegalFriendsCasePayload(input: {
  mode: "quick" | "detailed" | "self_diagnosis";
  memberIdx: number;
  name: string;
  phone: string;
  intake: ConsultationIntakeAnswers;
  livingPlaceOverride?: string;
}): LegalFriendsCasePayload {
  if (!isSafeConsultationCustomerName(input.name)) {
    throw new LegalFriendsPayloadError("invalid_consultation_customer_name");
  }
  if (
    !input.livingPlaceOverride &&
    input.intake.residenceRegion === "overseas_or_other"
  ) {
    throw new LegalFriendsPayloadError("unsupported_residence_region");
  }
  if (
    !Number.isSafeInteger(input.memberIdx) ||
    input.memberIdx <= 0
  ) {
    throw new LegalFriendsPayloadError("assignee_mapping_missing");
  }

  return {
    case_type: caseType(input.intake.topic),
    member_idx: input.memberIdx,
    name: input.name,
    phone: formatPhone(input.phone),
    living_place:
      input.livingPlaceOverride ??
      residenceNames[
        input.intake.residenceRegion as Exclude<
          ResidenceRegion,
          "overseas_or_other"
        >
      ],
    memo: createMemo(input.mode, input.intake),
  };
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isInteger(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1_000));
}

function caseIdxFromResponse(value: unknown): string | null {
  if (
    (typeof value === "string" || typeof value === "number") &&
    /^\S{1,100}$/.test(String(value))
  ) {
    return String(value);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of [
    "case_idx",
    "case_id",
    "caseIdx",
    "caseId",
    "Case_idx",
    "Case_id",
    "idx",
  ]) {
    const candidate = record[key];
    if (
      (typeof candidate === "string" || typeof candidate === "number") &&
      /^\S{1,100}$/.test(String(candidate))
    ) {
      return String(candidate);
    }
  }
  for (const key of ["data", "result"]) {
    const nested = caseIdxFromResponse(record[key]);
    if (nested) return nested;
  }
  return null;
}

function businessResponseCode(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = (value as Record<string, unknown>).code;
  if (
    typeof candidate === "number" &&
    Number.isSafeInteger(candidate)
  ) {
    return candidate;
  }
  if (typeof candidate === "string" && /^-?\d+$/.test(candidate)) {
    return Number(candidate);
  }
  return null;
}

export function createLegalFriendsClient(options: {
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  async function throwForError(
    response: Response,
    operation: "신건등록" | "담당자 변경",
  ): Promise<never> {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 401 || response.status === 403) {
      throw new LegalFriendsDeliveryError(
        "authentication_failed",
        `리걸프렌즈 ${operation} API 인증에 실패했습니다.`,
        { httpStatus: response.status, retryable: false },
      );
    }
    if ([400, 404, 409, 422].includes(response.status)) {
      throw new LegalFriendsDeliveryError(
        "invalid_request",
        `리걸프렌즈 ${operation} API가 요청을 거부했습니다. (HTTP ${response.status})`,
        { httpStatus: response.status, retryable: false },
      );
    }
    if (
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429
    ) {
      const requestedRetryAfter = retryAfterSeconds(
        response.headers.get("retry-after"),
      );
      throw new LegalFriendsDeliveryError(
        "rate_limited",
        `리걸프렌즈 ${operation} API가 잠시 후 재시도를 요청했습니다. (HTTP ${response.status})`,
        {
          httpStatus: response.status,
          retryable: true,
          ...(requestedRetryAfter !== undefined
            ? { retryAfterSeconds: requestedRetryAfter }
            : {}),
        },
      );
    }
    if (response.status >= 500) {
      throw new LegalFriendsDeliveryError(
        "remote_server_error",
        `리걸프렌즈 ${operation} API에 일시 장애가 발생했습니다. (HTTP ${response.status})`,
        { httpStatus: response.status, retryable: true },
      );
    }
    throw new LegalFriendsDeliveryError(
      "unexpected_http_status",
      `리걸프렌즈 ${operation} API가 예상하지 못한 상태를 반환했습니다. (HTTP ${response.status})`,
      { httpStatus: response.status, retryable: false },
    );
  }

  async function createCase(
    payload: LegalFriendsCasePayload,
    context: {
      eventId: string;
      consultationId: string;
    },
  ): Promise<{ httpStatus: number; caseIdx: string }> {
    let response: Response;
    try {
      response = await fetchImpl(LEGALFRIENDS_CREATE_CASE_URL, {
        method: "POST",
        headers: {
          authorization: options.token,
          "content-type": "application/json",
          "idempotency-key": context.eventId,
          "x-correlation-id": context.consultationId,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new LegalFriendsDeliveryError(
        "ambiguous_delivery",
        "리걸프렌즈 신건등록 결과를 확인할 수 없습니다. 중복 등록 여부를 먼저 확인해 주세요.",
        { retryable: false },
      );
    }

    if (!response.ok) await throwForError(response, "신건등록");
    let body: unknown;
    try {
      const text = await response.text();
      if (text.length > 64 * 1024) throw new Error("response_too_large");
      body = JSON.parse(text) as unknown;
    } catch {
      throw new LegalFriendsDeliveryError(
        "invalid_success_response",
        "리걸프렌즈 신건등록 성공 응답을 해석하지 못했습니다.",
        { httpStatus: response.status, retryable: false },
      );
    }
    const responseCode = businessResponseCode(body);
    if (responseCode === null) {
      throw new LegalFriendsDeliveryError(
        "invalid_success_response",
        "리걸프렌즈 신건등록 응답에 업무 결과 code가 없습니다.",
        { httpStatus: response.status, retryable: false },
      );
    }
    if (responseCode !== 0) {
      throw new LegalFriendsDeliveryError(
        "invalid_request",
        `리걸프렌즈 신건등록 API가 업무 오류를 반환했습니다. (code ${responseCode})`,
        { httpStatus: response.status, retryable: false },
      );
    }
    const caseIdx = caseIdxFromResponse(body);
    if (!caseIdx) {
      throw new LegalFriendsDeliveryError(
        "invalid_success_response",
        "리걸프렌즈 신건등록 응답에 사건 식별자가 없습니다.",
        { httpStatus: response.status, retryable: false },
      );
    }
    return { httpStatus: response.status, caseIdx };
  }

  async function changeManager(
    caseIdx: string,
    memberId: string,
    context: { eventId: string; consultationId: string },
  ): Promise<{ httpStatus: number }> {
    let response: Response;
    try {
      response = await fetchImpl(LEGALFRIENDS_CHANGE_MANAGER_URL, {
        method: "POST",
        headers: {
          authorization: options.token,
          case_idx: caseIdx,
          "content-type": "application/json",
          "idempotency-key": `${context.eventId}:change-manager`,
          "x-correlation-id": context.consultationId,
        },
        body: JSON.stringify({ member_id: memberId }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new LegalFriendsDeliveryError(
        "ambiguous_delivery",
        "리걸프렌즈 담당자 변경 결과를 확인할 수 없습니다. 현재 담당자를 먼저 확인해 주세요.",
        { retryable: false },
      );
    }
    if (!response.ok) await throwForError(response, "담당자 변경");
    let body: unknown;
    try {
      const text = await response.text();
      if (text.length > 64 * 1024) throw new Error("response_too_large");
      body = JSON.parse(text) as unknown;
    } catch {
      throw new LegalFriendsDeliveryError(
        "invalid_success_response",
        "리걸프렌즈 담당자 변경 성공 응답을 해석하지 못했습니다.",
        { httpStatus: response.status, retryable: false },
      );
    }
    const responseCode = businessResponseCode(body);
    if (responseCode === null) {
      throw new LegalFriendsDeliveryError(
        "invalid_success_response",
        "리걸프렌즈 담당자 변경 응답에 업무 결과 code가 없습니다.",
        { httpStatus: response.status, retryable: false },
      );
    }
    if (responseCode !== 0) {
      throw new LegalFriendsDeliveryError(
        "invalid_request",
        `리걸프렌즈 담당자 변경 API가 업무 오류를 반환했습니다. (code ${responseCode})`,
        { httpStatus: response.status, retryable: false },
      );
    }
    return { httpStatus: response.status };
  }

  return { changeManager, createCase };
}

export type LegalFriendsClient = ReturnType<typeof createLegalFriendsClient>;
