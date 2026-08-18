import assert from "node:assert/strict";
import test from "node:test";

import type { DatabasePool } from "@lawand/db";

import {
  consultationEventNotificationFromSnapshot,
  createPostgresConsultationEventSource,
  parseConsultationEventNotification,
} from "./consultation-events.js";

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

test("최근 outbox snapshot은 실시간 알림과 같은 비식별 payload로 복원한다", () => {
  assert.deepEqual(
    consultationEventNotificationFromSnapshot({
      event_id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
      event_type: "consultation.request.updated",
      consultation_id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
      occurred_at: new Date("2026-08-18T01:02:03.000Z"),
      repeat_stage: "before_assignment",
    }),
    {
      eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1",
      eventType: "consultation.request.updated",
      consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2",
      occurredAt: "2026-08-18T01:02:03.000Z",
      notificationKind: "repeat_unassigned",
    },
  );
});

test("최근 outbox snapshot 조회는 영구 LISTEN 연결과 분리된 요청 풀을 사용한다", async () => {
  let snapshotQueries = 0;
  const source = createPostgresConsultationEventSource({
    pool: {
      query() {
        throw new Error("LISTEN 전용 풀로 snapshot을 조회하면 안 됩니다.");
      },
    } as unknown as DatabasePool,
    snapshotPool: {
      async query() {
        snapshotQueries += 1;
        return { rows: [] };
      },
    } as unknown as DatabasePool,
  });

  assert.deepEqual(await source.getRecentNotifications?.(), []);
  assert.equal(snapshotQueries, 1);
});
