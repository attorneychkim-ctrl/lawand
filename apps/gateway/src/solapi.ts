import { createHmac, randomBytes } from "node:crypto";

import {
  MMS_IMAGE_MAX_BYTES,
  MMS_IMAGE_MAX_HEIGHT,
  MMS_IMAGE_MAX_WIDTH,
} from "@lawand/core";

export const SOLAPI_MESSAGES_ENDPOINT =
  "https://api.solapi.com/messages/v4/send-many/detail";
export const SOLAPI_STORAGE_ENDPOINT =
  "https://api.solapi.com/storage/v1/files";

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

export type SolapiMmsMessage = {
  to: string;
  from: string;
  text: string;
  type: "MMS";
  imageId: string;
  customFields?: { lawandMessageId: string };
};

export type SolapiMmsImage = {
  fileId: string;
  url: string;
  fileSize: number;
  width: number;
  height: number;
};

export type SolapiClient = {
  sendAlimtalk(message: SolapiAlimtalkMessage): Promise<SolapiAlimtalkDelivery>;
  uploadMmsImage(input: {
    fileBase64: string;
    name: string;
  }): Promise<SolapiMmsImage>;
  sendMms(message: SolapiMmsMessage): Promise<SolapiAlimtalkDelivery>;
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
      return "솔라피가 메시지 요청을 접수하지 않았습니다.";
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
    case "invalid_image_response":
      return "솔라피 이미지 업로드 결과를 확인하지 못했습니다.";
    case "invalid_recipient":
      return "문자를 받을 휴대전화 번호 형식이 올바르지 않습니다.";
    case "invalid_sender":
      return "솔라피 발신번호 형식이 올바르지 않습니다.";
    case "invalid_mms_image":
      return "MMS 이미지는 200KB 이하 JPG이고 1500×1440px 이하여야 합니다.";
    default:
      return "솔라피 메시지 요청을 처리하지 못했습니다.";
  }
}

export function inspectMmsJpeg(fileBase64: string): {
  bytes: number;
  width: number;
  height: number;
} {
  const file = Buffer.from(fileBase64, "base64");
  if (
    file.length < 10 ||
    file.length > MMS_IMAGE_MAX_BYTES ||
    file[0] !== 0xff ||
    file[1] !== 0xd8
  ) {
    throw new SolapiDeliveryError("invalid_mms_image", {
      retryable: false,
    });
  }
  let offset = 2;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  while (offset + 8 < file.length) {
    if (file[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (file[offset] === 0xff) offset += 1;
    const marker = file[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > file.length) break;
    const segmentLength = file.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > file.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const height = file.readUInt16BE(offset + 3);
      const width = file.readUInt16BE(offset + 5);
      if (
        width < 1 ||
        height < 1 ||
        width > MMS_IMAGE_MAX_WIDTH ||
        height > MMS_IMAGE_MAX_HEIGHT
      ) {
        throw new SolapiDeliveryError("invalid_mms_image", {
          retryable: false,
        });
      }
      return { bytes: file.length, width, height };
    }
    offset += segmentLength;
  }
  throw new SolapiDeliveryError("invalid_mms_image", {
    retryable: false,
  });
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
  storageEndpoint?: string;
  fetchImplementation?: Fetch;
  now?: () => Date;
  createSalt?: () => string;
  timeoutMs?: number;
}): SolapiClient {
  const {
    apiKey,
    apiSecret,
    endpoint = SOLAPI_MESSAGES_ENDPOINT,
    storageEndpoint = SOLAPI_STORAGE_ENDPOINT,
    fetchImplementation = fetch,
    now = () => new Date(),
    createSalt = () => randomBytes(16).toString("hex"),
    timeoutMs = 10_000,
  } = options;

  async function postJson(target: string, value: unknown): Promise<{
    body: unknown;
    httpStatus: number;
  }> {
    const dateTime = now().toISOString();
    const authorization = createSolapiAuthHeader({
      apiKey,
      apiSecret,
      dateTime,
      salt: createSalt(),
    });
    let response: Response;
    try {
      response = await fetchImplementation(target, {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/json",
        },
        body: JSON.stringify(value),
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
    return { body, httpStatus: response.status };
  }

  async function sendMessage(
    message: SolapiAlimtalkMessage | SolapiMmsMessage,
  ): Promise<SolapiAlimtalkDelivery> {
    const result = await postJson(endpoint, {
      messages: [message],
      strict: true,
      allowDuplicates: false,
      showMessageList: true,
    });
    return deliveryFromBody(result.body, result.httpStatus);
  }

  return {
    sendAlimtalk: sendMessage,
    sendMms: sendMessage,
    async uploadMmsImage(input) {
      const result = await postJson(storageEndpoint, {
        file: input.fileBase64,
        type: "MMS",
        name: input.name,
      });
      if (!isRecord(result.body)) {
        throw new SolapiDeliveryError("invalid_image_response", {
          retryable: false,
          httpStatus: result.httpStatus,
        });
      }
      const fileId = nonemptyString(result.body.fileId);
      const url = nonemptyString(result.body.url);
      const fileSize = result.body.fileSize;
      const width = result.body.width;
      const height = result.body.height;
      if (
        !fileId ||
        !url ||
        typeof fileSize !== "number" ||
        typeof width !== "number" ||
        typeof height !== "number"
      ) {
        throw new SolapiDeliveryError("invalid_image_response", {
          retryable: false,
          httpStatus: result.httpStatus,
        });
      }
      return { fileId, url, fileSize, width, height };
    },
  };
}

export function createSolapiMmsMessage(options: {
  to: string;
  from: string;
  text: string;
  imageId: string;
  messageId?: string;
}): SolapiMmsMessage {
  const to = options.to.replace(/\D/g, "");
  const from = options.from.replace(/\D/g, "");
  if (!/^01\d{8,9}$/.test(to)) {
    throw new SolapiDeliveryError("invalid_recipient", { retryable: false });
  }
  if (!/^0\d{8,10}$/.test(from)) {
    throw new SolapiDeliveryError("invalid_sender", { retryable: false });
  }
  return {
    to,
    from,
    text: options.text,
    type: "MMS",
    imageId: options.imageId,
    ...(options.messageId
      ? { customFields: { lawandMessageId: options.messageId } }
      : {}),
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
