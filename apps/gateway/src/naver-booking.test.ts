import assert from "node:assert/strict";
import test from "node:test";

import {
  NAVER_BOOKING_BUSINESS_POLL_MS,
  NAVER_BOOKING_OFF_HOURS_POLL_MS,
  naverBookingPollIntervalMs,
  parseNaverBookingEmail,
} from "./naver-booking.js";

function bookingMail(overrides: { from?: string; subject?: string } = {}) {
  const from =
    overrides.from ?? "naverbooking_noreply@navercorp.com";
  const subject =
    overrides.subject ??
    "[네이버 예약] 법무법인 로앤 새로운 예약이 확정 되었습니다.";
  return Buffer.from(
    [
      `From: 네이버 예약 <${from}>`,
      "To: lawandfirm@naver.com",
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "Date: Fri, 31 Jul 2026 13:35:00 +0900",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      "예약자명",
      "김*환님",
      "예약신청",
      "2026.07.31. 13:34:22",
      "예약번호",
      "1234567890",
      "예약상품",
      "개인회생·파산 상담",
      "이용일시",
      "2026.07.31.(금) 오후 3:00, 1명",
      "옵션",
      "서울 상담",
      "요청사항",
      "채무 상황을 상담하고 싶습니다.",
      "자세히 보기",
      "https://partner.booking.naver.com/bizes/987654/booking-list-view/bookings/1234567890",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

test("네이버 예약 확정 메일에서 예약 식별자와 상담 시각을 추출한다", async () => {
  const parsed = await parseNaverBookingEmail(bookingMail(), {
    sourceMessageUid: 1100,
    fallbackReceivedAt: new Date("2026-07-31T04:35:00.000Z"),
  });

  assert.ok(parsed);
  assert.equal(parsed.businessId, "987654");
  assert.equal(parsed.bookingNumber, "1234567890");
  assert.equal(parsed.maskedName, "김*환");
  assert.equal(parsed.scheduledAt, "2026-07-31T06:00:00.000Z");
  assert.equal(parsed.attendeeCount, 1);
  assert.equal(parsed.requestedAt, "2026-07-31T04:34:22.000Z");
  assert.equal(parsed.sourceMessageUid, 1100);
});

test("발신자나 제목이 다른 메일은 예약으로 접수하지 않는다", async () => {
  assert.equal(
    await parseNaverBookingEmail(
      bookingMail({ from: "someone@example.com" }),
      {
        sourceMessageUid: 1,
        fallbackReceivedAt: new Date(),
      },
    ),
    null,
  );
  assert.equal(
    await parseNaverBookingEmail(
      bookingMail({ subject: "[네이버 예약] 광고 안내" }),
      {
        sourceMessageUid: 2,
        fallbackReceivedAt: new Date(),
      },
    ),
    null,
  );
});

test("평일 08시부터 19시 전까지는 5분, 그 밖에는 30분 간격이다", () => {
  assert.equal(
    naverBookingPollIntervalMs(
      new Date("2026-07-31T04:35:00.000Z"),
    ),
    NAVER_BOOKING_BUSINESS_POLL_MS,
  );
  assert.equal(
    naverBookingPollIntervalMs(
      new Date("2026-07-31T10:00:00.000Z"),
    ),
    NAVER_BOOKING_OFF_HOURS_POLL_MS,
  );
  assert.equal(
    naverBookingPollIntervalMs(
      new Date("2026-08-01T04:35:00.000Z"),
    ),
    NAVER_BOOKING_OFF_HOURS_POLL_MS,
  );
});
