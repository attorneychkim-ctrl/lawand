import assert from "node:assert/strict";
import test from "node:test";

import {
  messageEventNotificationFromSnapshot,
  parseMessageEventNotification,
} from "./message-events.js";

test("문자 수신 실시간 이벤트의 대상 직원과 대화 키를 검증한다", () => {
  const parsed = parseMessageEventNotification(JSON.stringify({
    eventId: "11111111-1111-4111-8111-111111111111",
    eventType: "message.received",
    messageId: "22222222-2222-4222-8222-222222222222",
    threadKey: "case:123",
    targetUserIds: ["33333333-3333-4333-8333-333333333333"],
    occurredAt: "2026-08-18T01:00:00.000Z",
  }));
  assert.equal(parsed?.threadKey, "case:123");
  assert.deepEqual(parsed?.targetUserIds, ["33333333-3333-4333-8333-333333333333"]);
});

test("대상 직원 UUID가 잘못된 문자 이벤트는 거부한다", () => {
  assert.equal(parseMessageEventNotification(JSON.stringify({
    eventId: "11111111-1111-4111-8111-111111111111",
    eventType: "message.received",
    messageId: "22222222-2222-4222-8222-222222222222",
    threadKey: "case:123", targetUserIds: ["all"], occurredAt: "2026-08-18T01:00:00.000Z",
  })), null);
});

test("문자 원장 snapshot은 대상 직원과 안정적인 대화 키를 복원한다", () => {
  const notification = messageEventNotificationFromSnapshot({
    event_id: "11111111-1111-4111-8111-111111111111",
    target_source: "consultation",
    consultation_id: "22222222-2222-4222-8222-222222222222",
    directory_case_idx: null,
    manual_contact_id: null,
    legal_friends_case_idx: "9876",
    target_user_ids: ["33333333-3333-4333-8333-333333333333"],
    occurred_at: new Date("2026-08-20T01:00:00.000Z"),
  });
  assert.equal(notification?.eventId, "11111111-1111-4111-8111-111111111111");
  assert.equal(notification?.threadKey, "case:9876");
  assert.deepEqual(notification?.targetUserIds, [
    "33333333-3333-4333-8333-333333333333",
  ]);
});
