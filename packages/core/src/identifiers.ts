import { randomBytes } from "node:crypto";

import { v7 as uuidv7 } from "uuid";

const RECEIPT_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const RECEIPT_RANDOM_LENGTH = 8;

export type ConsultationId = string;
export type ConsultationRequestId = string;
export type EventId = string;
export type ReviewSubmissionId = string;

export function createConsultationId(): ConsultationId {
  return uuidv7();
}

export function createConsultationRequestId(): ConsultationRequestId {
  return uuidv7();
}

export function createEventId(): EventId {
  return uuidv7();
}

export function createReviewSubmissionId(): ReviewSubmissionId {
  return uuidv7();
}

function createReceiptCode(
  prefix: "LA" | "RV",
  now = new Date(),
  entropy = randomBytes(RECEIPT_RANDOM_LENGTH),
): string {
  if (entropy.length < RECEIPT_RANDOM_LENGTH) {
    throw new Error("접수번호 생성에는 최소 8바이트의 난수가 필요합니다.");
  }

  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((parts, part) => {
      if (part.type !== "literal") {
        parts[part.type] = part.value;
      }
      return parts;
    }, {});
  const date = `${dateParts.year}${dateParts.month}${dateParts.day}`;

  let suffix = "";
  for (let index = 0; index < RECEIPT_RANDOM_LENGTH; index += 1) {
    const byte = entropy[index];
    if (byte === undefined) {
      throw new Error("접수번호 난수를 읽지 못했습니다.");
    }
    suffix += RECEIPT_ALPHABET[byte % RECEIPT_ALPHABET.length];
  }

  return `${prefix}-${date}-${suffix}`;
}

export function createPublicReceiptCode(
  now = new Date(),
  entropy = randomBytes(RECEIPT_RANDOM_LENGTH),
): string {
  return createReceiptCode("LA", now, entropy);
}

export function createReviewReceiptCode(
  now = new Date(),
  entropy = randomBytes(RECEIPT_RANDOM_LENGTH),
): string {
  return createReceiptCode("RV", now, entropy);
}
