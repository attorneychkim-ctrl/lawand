import { simpleParser } from "mailparser";

export const CURRENT_NAVER_BOOKING_BASIS_VERSION =
  "2026-07-31.naver-booking.1";
export const NAVER_BOOKING_SENDER =
  "naverbooking_noreply@navercorp.com";
export const NAVER_BOOKING_BUSINESS_POLL_MS = 5 * 60 * 1_000;
export const NAVER_BOOKING_OFF_HOURS_POLL_MS = 30 * 60 * 1_000;

export type NaverBookingEmail = {
  businessId: string;
  bookingNumber: string;
  detailsUrl: string;
  maskedName: string;
  productName: string;
  scheduledAt: string;
  attendeeCount: number | null;
  option: string | null;
  customerRequest: string | null;
  requestedAt: string | null;
  messageReceivedAt: string;
  sourceMessageUid: number;
};

const bookingDetailsUrlPattern =
  /https:\/\/partner\.booking\.naver\.com\/bizes\/([0-9]+)\/booking-list-view\/bookings\/([0-9]+)/u;

function compact(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function linesFrom(value: string) {
  return value
    .split(/\r?\n/u)
    .map(compact)
    .filter(Boolean);
}

function labeledValue(lines: string[], label: string): string | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line === label) return lines[index + 1] ?? null;
    if (line.startsWith(`${label} `)) {
      return compact(line.slice(label.length));
    }
    if (line.startsWith(`${label}:`)) {
      return compact(line.slice(label.length + 1));
    }
  }
  return null;
}

function koreanDateTime(value: string): Date | null {
  const match =
    /(\d{4})\.(\d{1,2})\.(\d{1,2})\.(?:\([^)]+\))?\s*(오전|오후)\s*(\d{1,2}):(\d{2})/u.exec(
      value,
    );
  if (!match) return null;
  const [, year, month, day, meridiem, rawHour, minute] = match;
  let hour = Number(rawHour);
  if (meridiem === "오전" && hour === 12) hour = 0;
  if (meridiem === "오후" && hour < 12) hour += 12;
  const iso =
    `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}` +
    `T${String(hour).padStart(2, "0")}:${minute}:00+09:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function koreanTimestamp(value: string): Date | null {
  const match =
    /(\d{4})\.(\d{1,2})\.(\d{1,2})\.\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/u.exec(
      value,
    );
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const iso =
    `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}` +
    `T${hour!.padStart(2, "0")}:${minute}:${second}+09:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isConfirmedBookingSubject(subject: string) {
  const normalized = subject.replace(/\s+/gu, "");
  return normalized.includes("새로운예약이확정되었습니다.");
}

export async function parseNaverBookingEmail(
  source: Buffer,
  options: {
    sourceMessageUid: number;
    fallbackReceivedAt: Date;
  },
): Promise<NaverBookingEmail | null> {
  const mail = await simpleParser(source, {
    skipHtmlToText: false,
    skipTextToHtml: true,
  });
  const senderMatches = mail.from?.value.some(
    ({ address }) => address?.toLowerCase() === NAVER_BOOKING_SENDER,
  );
  if (!senderMatches || !isConfirmedBookingSubject(mail.subject ?? "")) {
    return null;
  }

  const text = mail.text ?? "";
  const html = typeof mail.html === "string" ? mail.html : "";
  const urlMatch = bookingDetailsUrlPattern.exec(
    `${text}\n${html}`.replaceAll("&amp;", "&"),
  );
  if (!urlMatch) {
    throw new Error("naver_booking_details_url_missing");
  }
  const [, businessId, bookingNumber] = urlMatch;
  const lines = linesFrom(text);
  const scheduledText = labeledValue(lines, "이용일시");
  const scheduledAt = scheduledText
    ? koreanDateTime(scheduledText)
    : null;
  if (!scheduledAt) {
    throw new Error("naver_booking_schedule_missing");
  }

  const maskedName =
    labeledValue(lines, "예약자명")?.replace(/님$/u, "").trim() ||
    "예약자";
  const productName =
    labeledValue(lines, "예약상품") || "네이버 예약 상담";
  const attendeeMatch = scheduledText?.match(/,\s*(\d+)\s*명/u);
  const requestedText = labeledValue(lines, "예약신청");
  const receivedAt =
    mail.date instanceof Date && !Number.isNaN(mail.date.getTime())
      ? mail.date
      : options.fallbackReceivedAt;

  return {
    businessId: businessId!,
    bookingNumber: bookingNumber!,
    detailsUrl: urlMatch[0]!,
    maskedName: compact(maskedName).slice(0, 80),
    productName: compact(productName).slice(0, 200),
    scheduledAt: scheduledAt.toISOString(),
    attendeeCount: attendeeMatch ? Number(attendeeMatch[1]) : null,
    option: labeledValue(lines, "옵션")?.slice(0, 500) ?? null,
    customerRequest:
      labeledValue(lines, "요청사항")?.slice(0, 2_000) ?? null,
    requestedAt: requestedText
      ? koreanTimestamp(requestedText)?.toISOString() ?? null
      : null,
    messageReceivedAt: receivedAt.toISOString(),
    sourceMessageUid: options.sourceMessageUid,
  };
}

export function naverBookingPollIntervalMs(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
  const businessDay = !["Sat", "Sun"].includes(parts.weekday ?? "");
  const hour = Number(parts.hour);
  return businessDay && hour >= 8 && hour < 19
    ? NAVER_BOOKING_BUSINESS_POLL_MS
    : NAVER_BOOKING_OFF_HOURS_POLL_MS;
}
