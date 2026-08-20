import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTelephonyInboundEventNotification,
  telephonyInboundEventNotificationFromSnapshot,
} from "./telephony-inbound-events.js";

test("수신전화 원장 알림 payload에서 실시간 이벤트를 복원한다", () => {
  assert.deepEqual(
    parseTelephonyInboundEventNotification(
      JSON.stringify({
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
        eventType: "inbound.ringing",
        inboundCallId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        occurredAt: "2026-08-06T01:15:15+00:00",
      }),
    ),
    {
      eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
      eventType: "inbound.ringing",
      inboundCallId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
      occurredAt: "2026-08-06T01:15:15+00:00",
    },
  );
  assert.equal(
    parseTelephonyInboundEventNotification(
      JSON.stringify({
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a3",
        eventType: "inbound.answer.changed",
        inboundCallId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        occurredAt: "2026-08-06T01:15:16+00:00",
      }),
    )?.eventType,
    "inbound.answer.changed",
  );
});

test("허용하지 않은 이벤트와 잘못된 식별자는 수신전화 payload로 받지 않는다", () => {
  assert.equal(
    parseTelephonyInboundEventNotification(
      JSON.stringify({
        eventId: "not-a-uuid",
        eventType: "inbound.ringing",
        inboundCallId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        occurredAt: "2026-08-06T01:15:15+00:00",
      }),
    ),
    null,
  );
  assert.equal(
    parseTelephonyInboundEventNotification(
      JSON.stringify({
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
        eventType: "telephony.call.requested",
        inboundCallId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        occurredAt: "2026-08-06T01:15:15+00:00",
      }),
    ),
    null,
  );
  assert.equal(
    parseTelephonyInboundEventNotification(
      JSON.stringify({
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
        eventType: "outbound.ringing",
        inboundCallId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        occurredAt: "2026-08-06T01:15:15+00:00",
      }),
    ),
    null,
  );
});

test("수신전화 원장 snapshot은 원래 ringing 이벤트 ID와 시각을 복원한다", () => {
  const notification = telephonyInboundEventNotificationFromSnapshot({
    event_id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
    event_type: "inbound.ringing",
    inbound_call_id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
    occurred_at: new Date("2026-08-20T01:00:00.000Z"),
  });
  assert.equal(notification?.eventId, "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1");
  assert.equal(notification?.occurredAt, "2026-08-20T01:00:00.000Z");
});
