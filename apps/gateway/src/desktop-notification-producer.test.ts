import assert from "node:assert/strict";
import test from "node:test";

import type { ConsultationEventMessage } from "./consultation-events.js";
import {
  createDesktopNotificationProducer,
  truncateDesktopNotificationBody,
} from "./desktop-notification-producer.js";
import type { DesktopNotificationEventQueueInput } from "./desktop-notification-service.js";
import type { MessageEventSource } from "./message-events.js";
import type { ReviewEventMessage } from "./review-events.js";
import type { TelephonyInboundEventMessage } from "./telephony-inbound-events.js";
import type { TelephonyDeskEventMessage } from "./telephony-desk-events.js";

function eventSource<Message>() {
  const listeners = new Set<(message: Message) => void>();
  return {
    subscribe(listener: (message: Message) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(message: Message) {
      for (const listener of listeners) listener(message);
    },
  };
}

test("PC 알림 본문은 줄바꿈을 보존하고 Windows 계약 길이를 넘지 않는다", () => {
  const body = truncateDesktopNotificationBody(` 첫 줄\r\n${"가".repeat(2_100)} `);
  assert.equal(body.startsWith("첫 줄\n"), true);
  assert.equal(body.length, 2_000);
  assert.equal(body.endsWith("…"), true);
});

test("실제 ERP 이벤트는 기존 대상자와 개인 설정 키를 보존해 PC 큐로 변환한다", async () => {
  const consultationEvents = eventSource<ConsultationEventMessage>();
  const messageEvents = eventSource<
    Parameters<Parameters<MessageEventSource["subscribe"]>[0]>[0]
  >();
  const reviewEvents = eventSource<ReviewEventMessage>();
  const telephonyInboundEvents = eventSource<TelephonyInboundEventMessage>();
  const telephonyDeskEvents = eventSource<TelephonyDeskEventMessage>();
  const queued: DesktopNotificationEventQueueInput[] = [];
  const producer = createDesktopNotificationProducer({
    desktopNotifications: {
      async queueEvent(input: DesktopNotificationEventQueueInput) {
        queued.push(input);
        return { queuedUserCount: 1, queuedDeviceCount: 1 };
      },
    },
    consultationEvents,
    messageEvents,
    reviewEvents,
    telephonyInboundEvents,
    telephonyDeskEvents,
    consultationService: {
      async detail() {
        return {
          displayName: "김로앤",
          contactChannel: "phone",
          assignment: { assigneeUserId: "33333333-3333-4333-8333-333333333333" },
          requests: [{
            name: "김로앤",
            phone: "01012345678",
            contactChannel: "phone",
            intake: { note: "오늘 오후에 통화하고 싶습니다." },
          }],
        };
      },
    },
    telephonyService: {
      async getDesktopMessageNotification() {
        return {
          id: "22222222-2222-4222-8222-222222222222",
          threadKey: "consultation:one",
          href: "/messages?thread=consultation%3Aone",
          customerName: "김로앤",
          phone: "01012345678",
          body: "문자 원문입니다.",
          targetSource: "consultation",
          receivedAt: "2026-08-20T01:00:00.000Z",
        };
      },
      async getDesktopInboundCallNotification() {
        return {
          id: "55555555-5555-4555-8555-555555555555",
          customerName: "김로앤",
          remotePhone: "01012345678",
          callRegion: "seoul",
          lineLabel: "서울 대표번호",
          directTargetUserIds: [
            "33333333-3333-4333-8333-333333333333",
          ],
          occurredAt: "2026-08-20T01:00:00.000Z",
        };
      },
      async getDesktopCallActivityNotifications() {
        return [];
      },
    },
    reviewManagementService: {
      async desktopNotification() {
        return {
          id: "44444444-4444-4444-8444-444444444444",
          recordType: "submission" as const,
          href: "/reviews/submission/44444444-4444-4444-8444-444444444444",
          customerName: "김로앤",
          submittedPhone: "01012345678",
          content: "상담 후기 원문입니다.",
          receiptCode: "RV-TEST",
          caseNumber: "2026개회1",
          caseName: "개인회생",
          targetUserIds: ["33333333-3333-4333-8333-333333333333"],
          occurredAt: "2026-08-20T01:00:00.000Z",
        };
      },
    },
    now: () => new Date("2026-08-20T01:00:00.000Z"),
  } as unknown as Parameters<typeof createDesktopNotificationProducer>[0]);
  producer.start();

  consultationEvents.emit({
    kind: "changed",
    notification: {
      eventId: "11111111-1111-4111-8111-111111111111",
      eventType: "consultation.request.updated",
      consultationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      occurredAt: "2026-08-20T01:00:00.000Z",
      notificationKind: "repeat_assigned",
    },
  });
  messageEvents.emit({
    kind: "changed",
    notification: {
      eventId: "22222222-2222-4222-8222-222222222223",
      eventType: "message.received",
      messageId: "22222222-2222-4222-8222-222222222222",
      threadKey: "consultation:one",
      targetUserIds: ["33333333-3333-4333-8333-333333333333"],
      occurredAt: "2026-08-20T01:00:00.000Z",
    },
  });
  reviewEvents.emit({
    kind: "changed",
    notification: {
      eventId: "44444444-4444-4444-8444-444444444445",
      eventType: "review.linked",
      recordId: "44444444-4444-4444-8444-444444444444",
      recordType: "submission",
      occurredAt: "2026-08-20T01:00:00.000Z",
    },
  });
  telephonyInboundEvents.emit({
    kind: "changed",
    notification: {
      eventId: "55555555-5555-4555-8555-555555555556",
      eventType: "inbound.ringing",
      inboundCallId: "55555555-5555-4555-8555-555555555555",
      occurredAt: "2026-08-20T01:00:00.000Z",
    },
  });
  await producer.stop();

  assert.equal(queued.length, 5);
  assert.deepEqual(
    queued.map((item) => item.preferenceKey).sort(),
    [
      "consultation.assigned_repeat",
      "message.assigned_reply",
      "phone.all_external",
      "phone.targeted_inbound",
      "review.assigned_new",
    ],
  );
  assert.equal(
    queued.find((item) => item.preferenceKey === "consultation.assigned_repeat")
      ?.payload.body.includes(
        "010-1234-5678 · 전화 상담\n상담 내용: 오늘 오후에 통화하고 싶습니다.",
      ),
    true,
  );
  assert.deepEqual(
    queued.find((item) => item.preferenceKey === "phone.all_external")
      ?.excludedUserIds,
    ["33333333-3333-4333-8333-333333333333"],
  );
});

test("내선·호전환·복귀는 실제 수신 직원에게 같은 개인 설정으로 전달한다", async () => {
  const consultationEvents = eventSource<ConsultationEventMessage>();
  const messageEvents = eventSource<
    Parameters<Parameters<MessageEventSource["subscribe"]>[0]>[0]
  >();
  const reviewEvents = eventSource<ReviewEventMessage>();
  const telephonyInboundEvents = eventSource<TelephonyInboundEventMessage>();
  const telephonyDeskEvents = eventSource<TelephonyDeskEventMessage>();
  const queued: DesktopNotificationEventQueueInput[] = [];
  const producer = createDesktopNotificationProducer({
    desktopNotifications: {
      async queueEvent(input: DesktopNotificationEventQueueInput) {
        queued.push(input);
        return { queuedUserCount: 1, queuedDeviceCount: 1 };
      },
    },
    consultationEvents,
    messageEvents,
    reviewEvents,
    telephonyInboundEvents,
    telephonyDeskEvents,
    consultationService: { async detail() { return null; } },
    reviewManagementService: {
      async desktopNotification() { return null; },
    },
    telephonyService: {
      async getDesktopMessageNotification() { return null; },
      async getDesktopInboundCallNotification() { return null; },
      async getDesktopCallActivityNotifications() {
        const common = {
          callRootId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          targetUserIds: ["33333333-3333-4333-8333-333333333333"],
          occurredAt: "2026-08-20T01:00:00.000Z",
          customerName: "김로앤",
          remotePhone: "01012345678",
          callRegion: "seoul",
          lineLabel: "김수신 회선",
          targetExtension: "202",
          callerName: "박발신",
          callerExtension: "201",
        };
        return [
          {
            ...common,
            sourceEventId: "11111111-1111-4111-8111-111111111111",
            kind: "internal_inbound" as const,
          },
          {
            ...common,
            sourceEventId: "22222222-2222-4222-8222-222222222222",
            kind: "transferred_customer" as const,
          },
          {
            ...common,
            sourceEventId: "44444444-4444-4444-8444-444444444444",
            kind: "transfer_returned" as const,
          },
        ];
      },
    },
    now: () => new Date("2026-08-20T01:00:01.000Z"),
  } as unknown as Parameters<typeof createDesktopNotificationProducer>[0]);
  producer.start();

  telephonyDeskEvents.emit({
    kind: "changed",
    notification: {
      eventType: "call_activity.changed",
      entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      direction: "inbound",
      occurredAt: "2026-08-20T01:00:00.000Z",
    },
  });
  await producer.stop();

  assert.equal(queued.length, 3);
  assert.deepEqual(
    queued.map((item) => item.preferenceKey),
    [
      "phone.internal_transfer",
      "phone.internal_transfer",
      "phone.internal_transfer",
    ],
  );
  assert.ok(queued.every((item) =>
    item.targetUserIds?.includes("33333333-3333-4333-8333-333333333333"),
  ));
  assert.deepEqual(
    queued.map((item) => item.payload.title),
    [
      "내선 전화 · 박발신 · 내선 201",
      "[서울] 호전환 전화 · 김로앤",
      "[서울] 고객 전화 복귀 · 김로앤",
    ],
  );
});

test("재연결 재생은 원래 발생 시각으로 만료를 계산하고 지난 전화는 큐에 넣지 않는다", async () => {
  const consultationEvents = eventSource<ConsultationEventMessage>();
  const reviewEvents = eventSource<ReviewEventMessage>();
  const telephonyDeskEvents = eventSource<TelephonyDeskEventMessage>();
  const messageEvents = {
    ...eventSource<Parameters<Parameters<MessageEventSource["subscribe"]>[0]>[0]>(),
    async getRecentNotifications() {
      return [{
        eventId: "22222222-2222-4222-8222-222222222222",
        eventType: "message.received" as const,
        messageId: "22222222-2222-4222-8222-222222222222",
        threadKey: "consultation:one",
        targetUserIds: ["33333333-3333-4333-8333-333333333333"],
        occurredAt: "2026-08-20T01:00:00.000Z",
      }];
    },
  };
  const telephonyInboundEvents = {
    ...eventSource<TelephonyInboundEventMessage>(),
    async getRecentNotifications() {
      return [{
        eventId: "55555555-5555-4555-8555-555555555555",
        eventType: "inbound.ringing" as const,
        inboundCallId: "66666666-6666-4666-8666-666666666666",
        occurredAt: "2026-08-20T01:00:00.000Z",
      }];
    },
  };
  const queued: DesktopNotificationEventQueueInput[] = [];
  const producer = createDesktopNotificationProducer({
    desktopNotifications: {
      async queueEvent(input: DesktopNotificationEventQueueInput) {
        queued.push(input);
        return { queuedUserCount: 1, queuedDeviceCount: 1 };
      },
    },
    consultationEvents,
    messageEvents,
    reviewEvents,
    telephonyInboundEvents,
    telephonyDeskEvents,
    consultationService: { async detail() { return null; } },
    reviewManagementService: {
      async desktopNotification() { return null; },
    },
    telephonyService: {
      async getDesktopMessageNotification() {
        return {
          id: "22222222-2222-4222-8222-222222222222",
          threadKey: "consultation:one",
          href: "/messages?thread=consultation%3Aone",
          customerName: "김로앤",
          phone: "01012345678",
          body: "재생된 문자입니다.",
          targetSource: "consultation" as const,
          receivedAt: "2026-08-20T01:00:00.000Z",
        };
      },
      async getDesktopInboundCallNotification() {
        return {
          id: "66666666-6666-4666-8666-666666666666",
          customerName: "김로앤",
          remotePhone: "01012345678",
          callRegion: "seoul" as const,
          lineLabel: "서울 대표번호",
          directTargetUserIds: [],
          occurredAt: "2026-08-20T01:00:00.000Z",
        };
      },
      async getDesktopCallActivityNotifications() { return []; },
    },
    now: () => new Date("2026-08-20T01:05:00.000Z"),
  } as unknown as Parameters<typeof createDesktopNotificationProducer>[0]);
  producer.start();
  messageEvents.emit({ kind: "sync" });
  telephonyInboundEvents.emit({ kind: "sync" });
  await producer.stop();

  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.preferenceKey, "message.assigned_reply");
  assert.equal(
    queued[0]?.expiresAt.toISOString(),
    "2026-08-21T01:00:00.000Z",
  );
});
