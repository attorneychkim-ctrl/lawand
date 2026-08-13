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
      notificationKind: null,
    },
  );
});

test("상담 재요청 알림은 개인정보 없이 배정 전후 구분만 전달한다", () => {
  assert.deepEqual(
    parseConsultationEventNotification(
      JSON.stringify({
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
        eventType: "consultation.request.updated",
        consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        occurredAt: "2026-08-05T09:00:00+00:00",
        notificationKind: "repeat_assigned",
      }),
    ),
    {
      eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
      eventType: "consultation.request.updated",
      consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
      occurredAt: "2026-08-05T09:00:00+00:00",
      notificationKind: "repeat_assigned",
    },
  );
});

test("담당자 변경 완료 알림은 새 담당자 식별 없이 종류만 전달한다", () => {
  assert.deepEqual(
    parseConsultationEventNotification(
      JSON.stringify({
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a3",
        eventType: "consultation.assignment.transferred",
        consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
        occurredAt: "2026-08-13T09:00:00+00:00",
        notificationKind: "assignment_transferred",
      }),
    ),
    {
      eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a3",
      eventType: "consultation.assignment.transferred",
      consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
      occurredAt: "2026-08-13T09:00:00+00:00",
      notificationKind: "assignment_transferred",
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
