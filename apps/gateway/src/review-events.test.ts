import assert from "node:assert/strict";
import test from "node:test";

import {
  parseReviewEventNotification,
  reviewEventNotificationFromSnapshot,
} from "./review-events.js";

test("개인정보 없는 후기 실시간 이벤트를 복원한다", () => {
  assert.deepEqual(
    parseReviewEventNotification(
      JSON.stringify({
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
        eventType: "review.linked",
        recordId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        recordType: "submission",
        occurredAt: "2026-08-14T09:00:00+00:00",
      }),
    ),
    {
      eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
      eventType: "review.linked",
      recordId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
      recordType: "submission",
      occurredAt: "2026-08-14T09:00:00+00:00",
    },
  );
});

test("허용되지 않은 후기 이벤트와 식별자는 거부한다", () => {
  assert.equal(
    parseReviewEventNotification(
      JSON.stringify({
        eventId: "not-a-uuid",
        eventType: "review.linked",
        recordId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        recordType: "submission",
        occurredAt: "2026-08-14T09:00:00+00:00",
      }),
    ),
    null,
  );
  assert.equal(
    parseReviewEventNotification(
      JSON.stringify({
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
        eventType: "review.deleted",
        recordId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        recordType: "submission",
        occurredAt: "2026-08-14T09:00:00+00:00",
      }),
    ),
    null,
  );
});

test("후기 연결 원장 ID를 재시작 뒤에도 같은 이벤트 ID로 복원한다", () => {
  const notification = reviewEventNotificationFromSnapshot({
    event_id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
    review_id: null,
    submission_id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
    occurred_at: new Date("2026-08-20T01:00:00.000Z"),
  });
  assert.equal(notification?.eventId, "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1");
  assert.equal(notification?.recordType, "submission");
  assert.equal(notification?.recordId, "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2");
});
