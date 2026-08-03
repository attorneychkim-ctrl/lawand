import { createHmac, randomBytes } from "node:crypto";

export const SOLAPI_MESSAGES_ENDPOINT =
  "https://api.solapi.com/messages/v4/send-many/detail";

export type AlimtalkTemplatePurpose =
  | "consultation_requested"
  | "consultation_assigned";

export type SolapiAlimtalkVariables = Record<`#{${string}}`, string>;

export type SolapiAlimtalkMessage = {
  to: string;
  type: "ATA";
  customFields?: {
    lawandEventId: string;
  };
  kakaoOptions: {
    pfId: string;
    templateId: string;
    disableSms: true;
    variables: SolapiAlimtalkVariables;
  };
};

export type SolapiAlimtalkDelivery = {
  httpStatus: number;
  groupId: string;
  messageId: string;
  statusCode: string;
};

export type SolapiClient = {
  sendAlimtalk(message: SolapiAlimtalkMessage): Promise<SolapiAlimtalkDelivery>;
};

type Fetch = typeof fetch;

export class SolapiDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly options: {
      retryable: boolean;
      httpStatus?: number;
      retryAfterSeconds?: number;
    },
  ) {
    super(solapiErrorMessage(code));
  }
}

function solapiErrorMessage(code: string): string {
  switch (code) {
    case "provider_rejected":
      return "솔라피가 알림톡 요청을 접수하지 않았습니다.";
    case "authentication_failed":
      return "솔라피 인증에 실패했습니다. API 자격증명을 확인해 주세요.";
    case "rate_limited":
      return "솔라피 요청 한도를 초과했습니다. 잠시 뒤 다시 시도합니다.";
    case "provider_unavailable":
      return "솔라피가 일시적으로 응답하지 않습니다. 잠시 뒤 다시 시도합니다.";
    case "ambiguous_delivery":
      return "솔라피 응답을 확인하지 못했습니다. 중복 발송 방지를 위해 발송 내역 확인이 필요합니다.";
    case "invalid_success_response":
      return "솔라피 성공 응답에서 발송 식별자를 확인하지 못했습니다.";
    default:
      return "알림톡 발송 요청을 처리하지 못했습니다.";
  }
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1_000));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonemptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function deliveryFromBody(
  body: unknown,
  httpStatus: number,
): SolapiAlimtalkDelivery {
  if (!isRecord(body)) {
    throw new SolapiDeliveryError("invalid_success_response", {
      retryable: false,
      httpStatus,
    });
  }

  const groupInfo = isRecord(body.groupInfo) ? body.groupInfo : null;
  const groupId = nonemptyString(groupInfo?.groupId);
  const messages = Array.isArray(body.messageList) ? body.messageList : [];
  const message = messages.find(isRecord);
  const messageId = nonemptyString(message?.messageId);
  const statusCode = nonemptyString(message?.statusCode);
  const failedMessages = Array.isArray(body.failedMessageList)
    ? body.failedMessageList
    : [];

  if (
    failedMessages.length > 0 ||
    !groupId ||
    !messageId ||
    statusCode !== "2000"
  ) {
    throw new SolapiDeliveryError(
      failedMessages.length > 0 || statusCode
        ? "provider_rejected"
        : "invalid_success_response",
      {
        retryable: false,
        httpStatus,
      },
    );
  }

  return { httpStatus, groupId, messageId, statusCode };
}

export function createSolapiAuthHeader(options: {
  apiKey: string;
  apiSecret: string;
  dateTime: string;
  salt: string;
}): string {
  const signature = createHmac("sha256", options.apiSecret)
    .update(options.dateTime + options.salt)
    .digest("hex");
  return [
    `HMAC-SHA256 apiKey=${options.apiKey}`,
    `date=${options.dateTime}`,
    `salt=${options.salt}`,
    `signature=${signature}`,
  ].join(", ");
}

export function createSolapiClient(options: {
  apiKey: string;
  apiSecret: string;
  endpoint?: string;
  fetchImplementation?: Fetch;
  now?: () => Date;
  createSalt?: () => string;
  timeoutMs?: number;
}): SolapiClient {
  const {
    apiKey,
    apiSecret,
    endpoint = SOLAPI_MESSAGES_ENDPOINT,
    fetchImplementation = fetch,
    now = () => new Date(),
    createSalt = () => randomBytes(16).toString("hex"),
    timeoutMs = 10_000,
  } = options;

  return {
    async sendAlimtalk(message) {
      const dateTime = now().toISOString();
      const authorization = createSolapiAuthHeader({
        apiKey,
        apiSecret,
        dateTime,
        salt: createSalt(),
      });
      let response: Response;
      try {
        response = await fetchImplementation(endpoint, {
          method: "POST",
          headers: {
            authorization,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messages: [message],
            strict: true,
            allowDuplicates: false,
            showMessageList: true,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new SolapiDeliveryError("ambiguous_delivery", {
          retryable: false,
        });
      }

      if (!response.ok) {
        const retryAfter = retryAfterSeconds(response);
        if (response.status === 401 || response.status === 403) {
          throw new SolapiDeliveryError("authentication_failed", {
            retryable: false,
            httpStatus: response.status,
          });
        }
        if (response.status === 429) {
          throw new SolapiDeliveryError("rate_limited", {
            retryable: true,
            httpStatus: response.status,
            ...(retryAfter === undefined
              ? {}
              : { retryAfterSeconds: retryAfter }),
          });
        }
        if (response.status >= 500) {
          throw new SolapiDeliveryError("provider_unavailable", {
            retryable: true,
            httpStatus: response.status,
            ...(retryAfter === undefined
              ? {}
              : { retryAfterSeconds: retryAfter }),
          });
        }
        throw new SolapiDeliveryError("provider_rejected", {
          retryable: false,
          httpStatus: response.status,
        });
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new SolapiDeliveryError("invalid_success_response", {
          retryable: false,
          httpStatus: response.status,
        });
      }
      return deliveryFromBody(body, response.status);
    },
  };
}

export function createSolapiAlimtalkMessage(options: {
  to: string;
  pfId: string;
  templateId: string;
  variables: SolapiAlimtalkVariables;
  eventId?: string;
}): SolapiAlimtalkMessage {
  const to = options.to.replace(/\D/g, "");
  if (!/^01\d{8,9}$/.test(to)) {
    throw new SolapiDeliveryError("invalid_recipient", {
      retryable: false,
    });
  }
  return {
    to,
    type: "ATA",
    ...(options.eventId
      ? { customFields: { lawandEventId: options.eventId } }
      : {}),
    kakaoOptions: {
      pfId: options.pfId,
      templateId: options.templateId,
      disableSms: true,
      variables: options.variables,
    },
  };
}

const koreaTimestamp = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const koreaDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const koreaTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatAlimtalkTimestamp(value: Date): string {
  return koreaTimestamp.format(value);
}

export function formatAlimtalkContactSchedule(contact: {
  preference: "as_soon_as_possible" | "scheduled_window";
  windowStart: Date | null;
  windowEnd: Date | null;
}): string {
  if (contact.preference === "as_soon_as_possible") {
    return "가능한 빠른 시간";
  }
  if (!contact.windowStart || !contact.windowEnd) {
    throw new SolapiDeliveryError("invalid_contact_schedule", {
      retryable: false,
    });
  }

  const startDate = koreaDate.format(contact.windowStart);
  const endDate = koreaDate.format(contact.windowEnd);
  const startTime = koreaTime.format(contact.windowStart);
  const endTime = koreaTime.format(contact.windowEnd);
  return startDate === endDate
    ? `${startDate} ${startTime}~${endTime}`
    : `${startDate} ${startTime}~${endDate} ${endTime}`;
}
