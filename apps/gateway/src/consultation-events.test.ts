import assert from "node:assert/strict";
import test from "node:test";

import { parseConsultationEventNotification } from "./consultation-events.js";

test("상담 outbox 알림 payload에서 실시간 이벤트를 복원한다", () => {
  assert.deepEqual(
    parseConsultationEventNotification(
      JSON.stringify({
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
        eventType: "consultation.requested",
        consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        occurredAt: "2026-08-05T09:00:00+00:00",
      }),
    ),
    {
      eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
      eventType: "consultation.requested",
      consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
      occurredAt: "2026-08-05T09:00:00+00:00",
    },
  );
});

test("상담 외 이벤트와 잘못된 식별자는 실시간 payload로 받지 않는다", () => {
  assert.equal(
    parseConsultationEventNotification(
      JSON.stringify({
        eventId: "not-a-uuid",
        eventType: "consultation.requested",
        consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        occurredAt: "2026-08-05T09:00:00+00:00",
      }),
    ),
    null,
  );
  assert.equal(
    parseConsultationEventNotification(
      JSON.stringify({
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
        eventType: "alimtalk.consultation.request_notification.requested",
        consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        occurredAt: "2026-08-05T09:00:00+00:00",
      }),
    ),
    null,
  );
});
