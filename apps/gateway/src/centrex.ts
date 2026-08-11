import {
  CENTREX_LMS_MAX_BYTES,
  centrexMessageByteLength,
} from "@lawand/core";

export const CENTREX_CLICKDIAL_URL =
  "https://centrex.uplus.co.kr/RestApi/clickdial";
export const CENTREX_SMS_SEND_URL =
  "https://centrex.uplus.co.kr/RestApi/smssend";
export const CENTREX_USERINFO_URL =
  "https://centrex.uplus.co.kr/RestApi/userinfo";
export const CENTREX_CALLHISTORY_URL =
  "https://centrex.uplus.co.kr/RestApi/callhistory";
export const CENTREX_SET_RING_CALLBACK_URL =
  "https://centrex.uplus.co.kr/RestApi/setringcallback";
export const CENTREX_INBOUND_CALL_HISTORY_URL =
  "https://centrex.uplus.co.kr/RestApi/getinboundcall";
export const CENTREX_RECEIVED_SMS_LIST_URL =
  "https://centrex.uplus.co.kr/RestApi/getrecvsmslist";

export class CentrexDeliveryError extends Error {
  constructor(
    readonly code:
      | "authentication_failed"
      | "permission_denied"
      | "invalid_request"
      | "message_too_long"
      | "recipient_limit_exceeded"
      | "message_quota_exhausted"
      | "provider_rejected"
      | "unexpected_http_status"
      | "invalid_response"
      | "ambiguous_delivery",
    message: string,
    readonly options: {
      commandStatus: "failed" | "unknown";
      httpStatus?: number;
      providerCode?: string;
    },
  ) {
    super(message);
  }
}

type CentrexClickDialInput = {
  apiLoginId: string;
  passwordSha512: string;
  destination: string;
};

type CentrexMessageInput = {
  apiLoginId: string;
  passwordSha512: string;
  destination: string;
  message: string;
};

type CentrexCredentials = Pick<
  CentrexClickDialInput,
  "apiLoginId" | "passwordSha512"
>;

export type CentrexCallHistoryRecord = {
  number: string;
  time: string;
  source: string;
  destination: string;
  durationSeconds: number;
  billableSeconds: number;
  status: string;
  kind: string;
};

export type CentrexInboundCallHistoryRecord = {
  number: string;
  time: string;
  source: string;
  destination: string;
  durationSeconds: number;
  status: "ANSWERED" | "NO ANSWER" | "CANCEL" | "BUSY" | "FAILED";
  channel: string;
  destinationChannel: string;
  endTime: string;
  applicationData: string;
};

export type CentrexReceivedMessageRecord = {
  number: string;
  time: string;
  source: string;
  message: string;
};

function normalizedCredentials(input: CentrexCredentials) {
  const apiLoginId = input.apiLoginId.replace(/\D/g, "");
  const passwordSha512 = input.passwordSha512.toLowerCase();
  if (!/^[0-9]{8,50}$/.test(apiLoginId)) {
    throw new CentrexDeliveryError(
      "invalid_request",
      "센트릭스 API 로그인 ID 형식이 올바르지 않습니다.",
      { commandStatus: "failed" },
    );
  }
  if (!/^[0-9a-f]{128}$/.test(passwordSha512)) {
    throw new CentrexDeliveryError(
      "invalid_request",
      "센트릭스 비밀번호 SHA-512 설정이 올바르지 않습니다.",
      { commandStatus: "failed" },
    );
  }
  return { apiLoginId, passwordSha512 };
}

function normalizedInput(input: CentrexClickDialInput) {
  const credentials = normalizedCredentials(input);
  const destination = input.destination.replace(/\D/g, "");
  if (!/^0[0-9]{8,10}$/.test(destination)) {
    throw new CentrexDeliveryError(
      "invalid_request",
      "발신 대상 전화번호 형식이 올바르지 않습니다.",
      { commandStatus: "failed" },
    );
  }
  return { ...credentials, destination };
}

function normalizedMessageInput(input: CentrexMessageInput) {
  const normalized = normalizedInput(input);
  const message = input.message.trim();
  const byteLength = centrexMessageByteLength(message);
  if (!message || byteLength > CENTREX_LMS_MAX_BYTES) {
    throw new CentrexDeliveryError(
      "message_too_long",
      "문자 내용은 센트릭스 LMS 기준 720바이트 이하여야 합니다.",
      { commandStatus: "failed" },
    );
  }
  return { ...normalized, message, byteLength };
}

function responseCode(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const code = (value as Record<string, unknown>).SVC_RT;
  return typeof code === "string" && /^[0-9]{4}$/.test(code) ? code : null;
}

function responseStatus(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = (value as Record<string, unknown>).DATAS;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const status = (data as Record<string, unknown>).STATUS;
  return typeof status === "string" ? status : null;
}

function nonnegativeInteger(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[0-9]+$/.test(value)
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function callHistoryRecords(value: unknown): CentrexCallHistoryRecord[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = (value as Record<string, unknown>).DATAS;
  if (data === null) return [];
  if (!Array.isArray(data) || data.length > 200) return null;
  const records: CentrexCallHistoryRecord[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const durationSeconds = nonnegativeInteger(record.DURATION);
    const billableSeconds = nonnegativeInteger(record.BILLSEC);
    if (
      typeof record.NO !== "string" &&
      typeof record.NO !== "number"
    ) {
      return null;
    }
    if (
      typeof record.TIME !== "string" ||
      typeof record.SRC !== "string" ||
      typeof record.DST !== "string" ||
      typeof record.STATUS !== "string" ||
      typeof record.KIND !== "string" ||
      durationSeconds === null ||
      billableSeconds === null
    ) {
      return null;
    }
    records.push({
      number: String(record.NO),
      time: record.TIME,
      source: record.SRC,
      destination: record.DST,
      durationSeconds,
      billableSeconds,
      status: record.STATUS.trim().toUpperCase(),
      kind: record.KIND,
    });
  }
  return records;
}

function inboundCallHistoryRecords(
  value: unknown,
): CentrexInboundCallHistoryRecord[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = (value as Record<string, unknown>).DATAS;
  if (data === null) return [];
  if (!Array.isArray(data) || data.length > 200) return null;
  const records: CentrexInboundCallHistoryRecord[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const durationSeconds = nonnegativeInteger(record.DURATION);
    const status =
      typeof record.STATUS === "string"
        ? record.STATUS.trim().toUpperCase()
        : "";
    if (
      (typeof record.NO !== "string" && typeof record.NO !== "number") ||
      typeof record.TIME !== "string" ||
      typeof record.SRC !== "string" ||
      typeof record.DST !== "string" ||
      typeof record.CHANNEL !== "string" ||
      typeof record.DSTCHANNEL !== "string" ||
      typeof record.ENDTIME !== "string" ||
      typeof record.APPDATA !== "string" ||
      durationSeconds === null ||
      !["ANSWERED", "NO ANSWER", "CANCEL", "BUSY", "FAILED"].includes(
        status,
      )
    ) {
      return null;
    }
    records.push({
      number: String(record.NO),
      time: record.TIME,
      source: record.SRC,
      destination: record.DST,
      durationSeconds,
      status: status as CentrexInboundCallHistoryRecord["status"],
      channel: record.CHANNEL,
      destinationChannel: record.DSTCHANNEL,
      endTime: record.ENDTIME,
      applicationData: record.APPDATA,
    });
  }
  return records;
}

function receivedMessageRecords(
  value: unknown,
): CentrexReceivedMessageRecord[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = (value as Record<string, unknown>).DATAS;
  if (data === null) return [];
  if (!Array.isArray(data) || data.length > 200) return null;
  const records: CentrexReceivedMessageRecord[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const source =
      typeof record.SRC === "string" ? record.SRC.replace(/\D/g, "") : "";
    const message =
      typeof record.MNESSAGE === "string" ? record.MNESSAGE : "";
    if (
      (typeof record.NO !== "string" && typeof record.NO !== "number") ||
      typeof record.TIME !== "string" ||
      !/^0[0-9]{8,10}$/.test(source) ||
      !message.trim() ||
      centrexMessageByteLength(message) > CENTREX_LMS_MAX_BYTES
    ) {
      return null;
    }
    records.push({
      number: String(record.NO),
      time: record.TIME,
      source,
      message,
    });
  }
  return records;
}

function listInfo(value: unknown): {
  page: number;
  pageSize: number;
  total: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>).LISTINFO;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const page = nonnegativeInteger(record.page);
  const pageSize = nonnegativeInteger(record.numperpage);
  const total = nonnegativeInteger(record.total);
  if (page === null || page < 1 || pageSize === null || total === null) {
    return null;
  }
  return { page, pageSize, total };
}

async function parsedResponse(
  response: Response,
  operation: string,
  maximumBytes: number,
): Promise<unknown> {
  try {
    const text = await response.text();
    if (text.length > maximumBytes) throw new Error("response_too_large");
    return JSON.parse(text) as unknown;
  } catch {
    throw new CentrexDeliveryError(
      "invalid_response",
      `센트릭스 ${operation} 응답을 해석하지 못했습니다.`,
      { commandStatus: "unknown", httpStatus: response.status },
    );
  }
}

function providerFailure(code: string, httpStatus: number) {
  if (["1003", "1004", "1007", "1008"].includes(code)) {
    return new CentrexDeliveryError(
      "authentication_failed",
      "센트릭스 계정 인증에 실패했습니다. 비밀번호 상태를 확인해 주세요.",
      { commandStatus: "failed", httpStatus, providerCode: code },
    );
  }
  if (["1005", "2002"].includes(code)) {
    return new CentrexDeliveryError(
      "permission_denied",
      "센트릭스 회선에 클릭투콜 API 권한이 없습니다.",
      { commandStatus: "failed", httpStatus, providerCode: code },
    );
  }
  if (["1001", "1002", "4001"].includes(code)) {
    return new CentrexDeliveryError(
      "invalid_request",
      "센트릭스가 클릭투콜 요청 형식을 거부했습니다.",
      { commandStatus: "failed", httpStatus, providerCode: code },
    );
  }
  return new CentrexDeliveryError(
    "provider_rejected",
    "센트릭스가 클릭투콜 명령을 수행하지 못했습니다.",
    { commandStatus: "failed", httpStatus, providerCode: code },
  );
}

export function createCentrexClient(options: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 45_000;

  async function clickDial(input: CentrexClickDialInput): Promise<{
    httpStatus: number;
    providerCode: "0000";
  }> {
    const normalized = normalizedInput(input);
    const body = new URLSearchParams({
      id: normalized.apiLoginId,
      pass: normalized.passwordSha512,
      destnumber: normalized.destination,
    });
    let response: Response;
    try {
      response = await fetchImpl(CENTREX_CLICKDIAL_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new CentrexDeliveryError(
        "ambiguous_delivery",
        "센트릭스 클릭투콜 결과를 확인할 수 없습니다. 전화기 상태를 먼저 확인해 주세요.",
        { commandStatus: "unknown" },
      );
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CentrexDeliveryError(
        "unexpected_http_status",
        `센트릭스가 예상하지 못한 HTTP 상태를 반환했습니다. (${response.status})`,
        {
          commandStatus: response.status >= 500 ? "unknown" : "failed",
          httpStatus: response.status,
        },
      );
    }

    let parsed: unknown;
    try {
      const text = await response.text();
      if (text.length > 64 * 1024) throw new Error("response_too_large");
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 클릭투콜 응답을 해석하지 못했습니다.",
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }

    const code = responseCode(parsed);
    if (!code) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 클릭투콜 응답에 결과 코드가 없습니다.",
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }
    if (code !== "0000") throw providerFailure(code, response.status);
    if (responseStatus(parsed)?.toUpperCase() !== "OK") {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스가 성공 코드와 일치하지 않는 명령 상태를 반환했습니다.",
        {
          commandStatus: "unknown",
          httpStatus: response.status,
          providerCode: code,
        },
      );
    }
    return { httpStatus: response.status, providerCode: "0000" };
  }

  async function sendMessage(input: CentrexMessageInput): Promise<{
    httpStatus: number;
    providerCode: "0000";
    remainingCount: number;
  }> {
    const normalized = normalizedMessageInput(input);
    let response: Response;
    try {
      response = await fetchImpl(CENTREX_SMS_SEND_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          id: normalized.apiLoginId,
          pass: normalized.passwordSha512,
          destnumber: normalized.destination,
          smsmsg: normalized.message,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new CentrexDeliveryError(
        "ambiguous_delivery",
        "센트릭스 문자 발송 결과를 확인할 수 없습니다. 발송 내역을 먼저 확인해 주세요.",
        { commandStatus: "unknown" },
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CentrexDeliveryError(
        "unexpected_http_status",
        `센트릭스 문자 발송이 예상하지 못한 HTTP 상태를 반환했습니다. (${response.status})`,
        {
          commandStatus: response.status >= 500 ? "unknown" : "failed",
          httpStatus: response.status,
        },
      );
    }
    const parsed = await parsedResponse(response, "문자 발송", 64 * 1024);
    const code = responseCode(parsed);
    if (!code) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 문자 발송 응답에 결과 코드가 없습니다.",
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }
    if (code !== "0000") {
      const messageErrors: Record<
        string,
        { code: CentrexDeliveryError["code"]; message: string }
      > = {
        "3002": {
          code: "message_too_long",
          message: "센트릭스가 문자 길이 초과로 발송을 거부했습니다.",
        },
        "3003": {
          code: "recipient_limit_exceeded",
          message: "센트릭스가 수신번호 개수 초과로 발송을 거부했습니다.",
        },
        "3004": {
          code: "message_quota_exhausted",
          message: "센트릭스 문자의 남은 발송 가능 건수가 없습니다.",
        },
      };
      const known = messageErrors[code];
      if (known) {
        throw new CentrexDeliveryError(known.code, known.message, {
          commandStatus: "failed",
          httpStatus: response.status,
          providerCode: code,
        });
      }
      throw providerFailure(code, response.status);
    }
    const data =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).DATAS
        : null;
    const remainingCount =
      data && typeof data === "object" && !Array.isArray(data)
        ? nonnegativeInteger((data as Record<string, unknown>).RESTCOUNT)
        : null;
    if (
      responseStatus(parsed)?.trim().toUpperCase() !== "OK" ||
      remainingCount === null
    ) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 문자 발송 결과를 확인하지 못했습니다.",
        {
          commandStatus: "unknown",
          httpStatus: response.status,
          providerCode: code,
        },
      );
    }
    return {
      httpStatus: response.status,
      providerCode: "0000",
      remainingCount,
    };
  }

  async function getUserInfo(input: CentrexCredentials): Promise<{
    httpStatus: number;
    name: string;
    extension: string;
    lineNumber: string;
  }> {
    const normalized = normalizedCredentials(input);
    let response: Response;
    try {
      response = await fetchImpl(CENTREX_USERINFO_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          id: normalized.apiLoginId,
          pass: normalized.passwordSha512,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new CentrexDeliveryError(
        "ambiguous_delivery",
        "센트릭스 사용자 정보를 확인하지 못했습니다.",
        { commandStatus: "unknown" },
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CentrexDeliveryError(
        "unexpected_http_status",
        `센트릭스가 예상하지 못한 HTTP 상태를 반환했습니다. (${response.status})`,
        { commandStatus: "failed", httpStatus: response.status },
      );
    }
    let parsed: unknown;
    try {
      const text = await response.text();
      if (text.length > 64 * 1024) throw new Error("response_too_large");
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 사용자 정보 응답을 해석하지 못했습니다.",
        { commandStatus: "failed", httpStatus: response.status },
      );
    }
    const code = responseCode(parsed);
    if (!code) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 사용자 정보 응답에 결과 코드가 없습니다.",
        { commandStatus: "failed", httpStatus: response.status },
      );
    }
    if (code !== "0000") throw providerFailure(code, response.status);
    const data =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).DATAS
        : null;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 사용자 정보가 비어 있습니다.",
        { commandStatus: "failed", httpStatus: response.status },
      );
    }
    const record = data as Record<string, unknown>;
    const name = typeof record.NAME === "string" ? record.NAME : "";
    const extension =
      typeof record.EXTEN === "string" ? record.EXTEN.replace(/\D/g, "") : "";
    const lineNumber =
      typeof record.NUMBER070 === "string"
        ? record.NUMBER070.replace(/\D/g, "")
        : "";
    if (!extension || !/^070[0-9]{8}$/.test(lineNumber)) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 사용자 정보의 회선 번호를 확인하지 못했습니다.",
        { commandStatus: "failed", httpStatus: response.status },
      );
    }
    return { httpStatus: response.status, name, extension, lineNumber };
  }

  async function getCallHistory(
    input: CentrexCredentials & { page?: number },
  ): Promise<{
    httpStatus: number;
    providerCode: "0000" | "OK";
    records: CentrexCallHistoryRecord[];
  }> {
    const normalized = normalizedCredentials(input);
    const page = input.page ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > 10_000) {
      throw new CentrexDeliveryError(
        "invalid_request",
        "센트릭스 통화이력 페이지 형식이 올바르지 않습니다.",
        { commandStatus: "failed" },
      );
    }
    let response: Response;
    try {
      response = await fetchImpl(CENTREX_CALLHISTORY_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          id: normalized.apiLoginId,
          pass: normalized.passwordSha512,
          page: String(page),
          calltype: "outbound",
        }),
        signal: AbortSignal.timeout(Math.min(timeoutMs, 20_000)),
      });
    } catch {
      throw new CentrexDeliveryError(
        "ambiguous_delivery",
        "센트릭스 통화이력을 확인하지 못했습니다.",
        { commandStatus: "unknown" },
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CentrexDeliveryError(
        "unexpected_http_status",
        `센트릭스 통화이력이 예상하지 못한 HTTP 상태를 반환했습니다. (${response.status})`,
        {
          commandStatus: "unknown",
          httpStatus: response.status,
        },
      );
    }
    let parsed: unknown;
    try {
      const text = await response.text();
      if (text.length > 512 * 1024) throw new Error("response_too_large");
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 통화이력 응답을 해석하지 못했습니다.",
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }
    const rawCode =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).SVC_RT
        : null;
    const code = typeof rawCode === "string" ? rawCode.toUpperCase() : null;
    if (code !== "0000" && code !== "OK") {
      if (code && /^[0-9]{4}$/.test(code)) {
        throw providerFailure(code, response.status);
      }
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 통화이력 응답에 정상 결과 코드가 없습니다.",
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }
    const records = callHistoryRecords(parsed);
    if (!records) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 통화이력 목록 형식이 올바르지 않습니다.",
        {
          commandStatus: "unknown",
          httpStatus: response.status,
          providerCode: code,
        },
      );
    }
    return {
      httpStatus: response.status,
      providerCode: code,
      records,
    };
  }

  async function setRingCallback(
    input: CentrexCredentials & {
      callbackPath: string;
      callbackHost: string;
      callbackPort: number;
    },
  ): Promise<{ httpStatus: number; providerCode: "0000" }> {
    const normalized = normalizedCredentials(input);
    if (!/^\/[A-Za-z0-9/_-]{1,180}\.html$/.test(input.callbackPath)) {
      throw new CentrexDeliveryError(
        "invalid_request",
        "센트릭스 수신 알림 경로 형식이 올바르지 않습니다.",
        { commandStatus: "failed" },
      );
    }
    const ipv4Parts = input.callbackHost.split(".");
    if (
      ipv4Parts.length !== 4 ||
      ipv4Parts.some((part) => {
        const value = Number(part);
        return !/^(0|[1-9][0-9]{0,2})$/.test(part) || value > 255;
      }) ||
      !Number.isInteger(input.callbackPort) ||
      input.callbackPort < 1 ||
      input.callbackPort > 65_535
    ) {
      throw new CentrexDeliveryError(
        "invalid_request",
        "센트릭스 수신 알림 서버 주소 형식이 올바르지 않습니다.",
        { commandStatus: "failed" },
      );
    }
    let response: Response;
    try {
      response = await fetchImpl(CENTREX_SET_RING_CALLBACK_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          id: normalized.apiLoginId,
          pass: normalized.passwordSha512,
          callbackurl: input.callbackPath,
          callbackhost: input.callbackHost,
          callbackport: String(input.callbackPort),
        }),
        signal: AbortSignal.timeout(Math.min(timeoutMs, 20_000)),
      });
    } catch {
      throw new CentrexDeliveryError(
        "ambiguous_delivery",
        "센트릭스 수신 알림 설정 결과를 확인하지 못했습니다.",
        { commandStatus: "unknown" },
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CentrexDeliveryError(
        "unexpected_http_status",
        `센트릭스 수신 알림 설정이 예상하지 못한 HTTP 상태를 반환했습니다. (${response.status})`,
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }
    const parsed = await parsedResponse(
      response,
      "수신 알림 설정",
      64 * 1024,
    );
    const code = responseCode(parsed);
    if (!code) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 수신 알림 설정 응답에 결과 코드가 없습니다.",
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }
    if (code !== "0000") throw providerFailure(code, response.status);
    if (responseStatus(parsed)?.toUpperCase() !== "OK") {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 수신 알림 설정 상태를 확인하지 못했습니다.",
        {
          commandStatus: "unknown",
          httpStatus: response.status,
          providerCode: code,
        },
      );
    }
    return { httpStatus: response.status, providerCode: "0000" };
  }

  async function getInboundCallHistory(
    input: CentrexCredentials & { page?: number; pageSize?: number },
  ): Promise<{
    httpStatus: number;
    providerCode: "0000";
    records: CentrexInboundCallHistoryRecord[];
  }> {
    const normalized = normalizedCredentials(input);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 10_000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 200
    ) {
      throw new CentrexDeliveryError(
        "invalid_request",
        "센트릭스 수신 통화이력 페이지 형식이 올바르지 않습니다.",
        { commandStatus: "failed" },
      );
    }
    let response: Response;
    try {
      response = await fetchImpl(CENTREX_INBOUND_CALL_HISTORY_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          id: normalized.apiLoginId,
          pass: normalized.passwordSha512,
          page: String(page),
          num_per_page: String(pageSize),
        }),
        signal: AbortSignal.timeout(Math.min(timeoutMs, 20_000)),
      });
    } catch {
      throw new CentrexDeliveryError(
        "ambiguous_delivery",
        "센트릭스 수신 통화이력을 확인하지 못했습니다.",
        { commandStatus: "unknown" },
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CentrexDeliveryError(
        "unexpected_http_status",
        `센트릭스 수신 통화이력이 예상하지 못한 HTTP 상태를 반환했습니다. (${response.status})`,
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }
    const parsed = await parsedResponse(
      response,
      "수신 통화이력",
      1024 * 1024,
    );
    const code = responseCode(parsed);
    if (!code) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 수신 통화이력 응답에 결과 코드가 없습니다.",
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }
    if (code !== "0000") throw providerFailure(code, response.status);
    const records = inboundCallHistoryRecords(parsed);
    if (!records) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 수신 통화이력 목록 형식이 올바르지 않습니다.",
        {
          commandStatus: "unknown",
          httpStatus: response.status,
          providerCode: code,
        },
      );
    }
    return {
      httpStatus: response.status,
      providerCode: "0000",
      records,
    };
  }

  async function getReceivedMessages(
    input: CentrexCredentials & { page?: number },
  ): Promise<{
    httpStatus: number;
    providerCode: "0000" | "4002" | "4004";
    page: number;
    pageSize: number;
    total: number;
    records: CentrexReceivedMessageRecord[];
  }> {
    const normalized = normalizedCredentials(input);
    const page = input.page ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > 10_000) {
      throw new CentrexDeliveryError(
        "invalid_request",
        "센트릭스 수신문자 페이지 형식이 올바르지 않습니다.",
        { commandStatus: "failed" },
      );
    }
    let response: Response;
    try {
      response = await fetchImpl(CENTREX_RECEIVED_SMS_LIST_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          id: normalized.apiLoginId,
          pass: normalized.passwordSha512,
          page: String(page),
        }),
        signal: AbortSignal.timeout(Math.min(timeoutMs, 20_000)),
      });
    } catch {
      throw new CentrexDeliveryError(
        "ambiguous_delivery",
        "센트릭스 수신문자 목록을 확인하지 못했습니다.",
        { commandStatus: "unknown" },
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CentrexDeliveryError(
        "unexpected_http_status",
        `센트릭스 수신문자 조회가 예상하지 못한 HTTP 상태를 반환했습니다. (${response.status})`,
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }
    const parsed = await parsedResponse(response, "수신문자 목록", 1024 * 1024);
    const code = responseCode(parsed);
    if (!code) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 수신문자 응답에 결과 코드가 없습니다.",
        { commandStatus: "unknown", httpStatus: response.status },
      );
    }
    if (code === "4002" || code === "4004") {
      const info = listInfo(parsed);
      return {
        httpStatus: response.status,
        providerCode: code,
        page: info?.page ?? page,
        pageSize: info?.pageSize ?? 0,
        total: info?.total ?? 0,
        records: [],
      };
    }
    if (code !== "0000") throw providerFailure(code, response.status);
    const records = receivedMessageRecords(parsed);
    const info = listInfo(parsed);
    if (!records || !info) {
      throw new CentrexDeliveryError(
        "invalid_response",
        "센트릭스 수신문자 목록 형식이 올바르지 않습니다.",
        {
          commandStatus: "unknown",
          httpStatus: response.status,
          providerCode: code,
        },
      );
    }
    return {
      httpStatus: response.status,
      providerCode: "0000",
      ...info,
      records,
    };
  }

  return {
    clickDial,
    getCallHistory,
    getInboundCallHistory,
    getReceivedMessages,
    getUserInfo,
    sendMessage,
    setRingCallback,
  };
}

export type CentrexClient = ReturnType<typeof createCentrexClient>;
