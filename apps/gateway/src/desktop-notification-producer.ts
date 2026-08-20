import type { DesktopNotificationPreferenceKey } from "@lawand/core";

import type { ConsultationEventSource } from "./consultation-events.js";
import type {
  DesktopNotificationEventQueueInput,
  DesktopNotificationService,
} from "./desktop-notification-service.js";
import type { MessageEventSource } from "./message-events.js";
import type { ReviewEventSource } from "./review-events.js";
import type { ReviewManagementService } from "./review-management-service.js";
import type { ConsultationService } from "./service.js";
import type { TelephonyInboundEventSource } from "./telephony-inbound-events.js";
import type { TelephonyDeskEventSource } from "./telephony-desk-events.js";
import type { TelephonyService } from "./telephony-service.js";

const BUSINESS_NOTIFICATION_DURATION_MS = 24 * 60 * 60 * 1_000;
const PHONE_NOTIFICATION_DURATION_MS = 2 * 60 * 1_000;
const MAX_BODY_LENGTH = 2_000;

const intakeLabels: Record<string, string> = {
  transferNote: "전달사항",
  note: "상담 내용",
  customerRequest: "고객 요청사항",
  concern: "가장 걱정되는 내용",
  topic: "도움 분야",
  urgencies: "현재 단계",
  incomes: "소득 형태",
  residenceRegion: "거주 지역",
};

const channelLabels: Record<string, string> = {
  phone: "전화 상담",
  kakao_channel: "카카오 상담",
  naver_booking: "네이버 예약",
};

const regionLabels: Record<string, string> = {
  seoul: "서울",
  daejeon: "대전",
  busan: "부산",
  unclassified: "지역 미분류",
};

function cleanText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function truncateDesktopNotificationBody(value: string): string {
  const normalized = cleanText(value);
  if (normalized.length <= MAX_BODY_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_BODY_LENGTH - 1).trimEnd()}…`;
}

function formatPhone(value: string | null | undefined): string {
  if (!value) return "전화번호 미수집";
  const digits = value.replace(/\D/g, "");
  if (/^010\d{8}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (/^0\d{8,10}$/.test(digits)) {
    return value;
  }
  return value;
}

function intakeValue(value: unknown): string | null {
  if (typeof value === "string") return cleanText(value) || null;
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  if (typeof value === "boolean") return value ? "있음" : "없음";
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string | number =>
        typeof item === "string" || typeof item === "number",
    );
    return items.length > 0 ? items.join(" · ") : null;
  }
  return null;
}

function consultationIntakeLines(intake: unknown): string[] {
  if (!intake || typeof intake !== "object" || Array.isArray(intake)) return [];
  const record = intake as Record<string, unknown>;
  const preferredKeys = [
    "transferNote",
    "note",
    "customerRequest",
    "concern",
    "topic",
    "urgencies",
    "incomes",
    "residenceRegion",
  ];
  const keys = [
    ...preferredKeys.filter((key) => key in record),
    ...Object.keys(record).filter(
      (key) => key !== "selfDiagnosis" && !preferredKeys.includes(key),
    ),
  ];
  return keys.flatMap((key) => {
    const value = intakeValue(record[key]);
    return value ? [`${intakeLabels[key] ?? key}: ${value}`] : [];
  });
}

function queueInput(
  input: Omit<DesktopNotificationEventQueueInput, "expiresAt"> & {
    durationMs: number;
    occurredAt: string;
  },
  now: () => Date,
): DesktopNotificationEventQueueInput | null {
  const occurredAt = new Date(input.occurredAt);
  const expiresAt = new Date(occurredAt.getTime() + input.durationMs);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now()) return null;
  const { durationMs: _durationMs, occurredAt: _occurredAt, ...notification } =
    input;
  return {
    ...notification,
    expiresAt,
  };
}

export function createDesktopNotificationProducer(options: {
  desktopNotifications: Pick<DesktopNotificationService, "queueEvent">;
  consultationEvents: ConsultationEventSource;
  reviewEvents: ReviewEventSource;
  messageEvents: MessageEventSource;
  telephonyInboundEvents: TelephonyInboundEventSource;
  telephonyDeskEvents: TelephonyDeskEventSource;
  consultationService: Pick<ConsultationService, "detail">;
  reviewManagementService: Pick<ReviewManagementService, "desktopNotification">;
  telephonyService: Pick<
    TelephonyService,
    | "getDesktopMessageNotification"
    | "getDesktopInboundCallNotification"
    | "getDesktopCallActivityNotifications"
  >;
  now?: () => Date;
  onError?: (error: unknown) => void;
}) {
  const now = options.now ?? (() => new Date());
  const pending = new Set<Promise<void>>();
  const replaying = new Set<string>();
  let unsubscribers: Array<() => void> = [];

  function track(task: Promise<unknown>) {
    const pendingTask = task
      .then(() => undefined)
      .catch((error) => options.onError?.(error))
      .finally(() => pending.delete(pendingTask));
    pending.add(pendingTask);
  }

  async function queueNotification(
    input: Omit<DesktopNotificationEventQueueInput, "expiresAt"> & {
      durationMs: number;
      occurredAt: string;
    },
  ) {
    const queued = queueInput(input, now);
    if (!queued) return;
    await options.desktopNotifications.queueEvent(queued);
  }

  function replay<T>(
    key: string,
    load: (() => Promise<T[]>) | undefined,
    handle: (notification: T) => Promise<void>,
  ) {
    if (!load || replaying.has(key)) return;
    replaying.add(key);
    track(
      (async () => {
        try {
          for (const notification of await load()) {
            await handle(notification);
          }
        } finally {
          replaying.delete(key);
        }
      })(),
    );
  }

  async function handleConsultation(
    notification: Parameters<
      Parameters<ConsultationEventSource["subscribe"]>[0]
    >[0] & { kind: "changed" },
  ) {
    const event = notification.notification;
    const preferenceKey: DesktopNotificationPreferenceKey | null =
      event.eventType === "consultation.requested"
        ? "consultation.unassigned"
        : event.notificationKind === "repeat_unassigned"
          ? "consultation.unassigned"
          : event.notificationKind === "repeat_assigned"
            ? "consultation.assigned_repeat"
            : event.notificationKind === "assignment_transferred"
              ? "consultation.assignment"
              : null;
    if (!preferenceKey) return;
    const consultation = await options.consultationService.detail(
      event.consultationId,
    );
    if (!consultation) return;
    const latestRequest = consultation.requests[0];
    const targetUserIds =
      preferenceKey === "consultation.unassigned"
        ? undefined
        : consultation.assignment?.assigneeUserId
          ? [consultation.assignment.assigneeUserId]
          : [];
    if (targetUserIds?.length === 0) return;
    const customerName =
      latestRequest?.name ?? consultation.displayName ?? "상담 고객";
    const kindLabel =
      preferenceKey === "consultation.assigned_repeat"
        ? "담당 상담 재요청"
        : preferenceKey === "consultation.assignment"
          ? "새 담당 상담"
          : event.notificationKind === "repeat_unassigned"
            ? "상담 재요청"
            : "새 상담";
    const summary = [
      `${formatPhone(latestRequest?.phone)} · ${
        channelLabels[latestRequest?.contactChannel ?? consultation.contactChannel] ??
        "상담"
      }`,
      ...consultationIntakeLines(latestRequest?.intake),
    ];
    await queueNotification({
      sourceEventId: event.eventId,
      eventType: `desktop.consultation.${
        preferenceKey.split(".").slice(1).join("_")
      }`,
      preferenceKey,
      ...(targetUserIds ? { targetUserIds } : {}),
      payload: {
        title: `${kindLabel} · ${customerName}`,
        body: truncateDesktopNotificationBody(summary.join("\n")),
        category: "consultation",
        deepLinkPath: `/consultations/${event.consultationId}`,
      },
      durationMs: BUSINESS_NOTIFICATION_DURATION_MS,
      occurredAt: event.occurredAt,
    });
  }

  async function handleMessage(
    notification: Parameters<
      Parameters<MessageEventSource["subscribe"]>[0]
    >[0] & { kind: "changed" },
  ) {
    const event = notification.notification;
    const message = await options.telephonyService.getDesktopMessageNotification(
      event.messageId,
    );
    if (!message) return;
    const preferenceKey: DesktopNotificationPreferenceKey =
      message.targetSource === null
        ? "message.unmatched"
        : "message.assigned_reply";
    await queueNotification({
      sourceEventId: event.eventId,
      eventType: `desktop.${preferenceKey.replaceAll(".", "_")}`,
      preferenceKey,
      targetUserIds: event.targetUserIds,
      payload: {
        title: `새 문자 · ${message.customerName}`,
        body: truncateDesktopNotificationBody(
          `${formatPhone(message.phone)}\n${message.body}`,
        ),
        category: "message",
        deepLinkPath: message.href,
      },
      durationMs: BUSINESS_NOTIFICATION_DURATION_MS,
      occurredAt: event.occurredAt,
    });
  }

  async function handleReview(
    notification: Parameters<
      Parameters<ReviewEventSource["subscribe"]>[0]
    >[0] & { kind: "changed" },
  ) {
    const event = notification.notification;
    if (event.eventType !== "review.linked") return;
    const review = await options.reviewManagementService.desktopNotification(
      event.recordType,
      event.recordId,
    );
    if (!review || review.targetUserIds.length === 0) return;
    const caseLabel = [review.caseNumber, review.caseName]
      .filter(Boolean)
      .join(" · ");
    await queueNotification({
      sourceEventId: event.eventId,
      eventType: "desktop.review.assigned_new",
      preferenceKey: "review.assigned_new",
      targetUserIds: review.targetUserIds,
      payload: {
        title: `담당 고객 후기 · ${review.customerName}`,
        body: truncateDesktopNotificationBody(
          [
            review.submittedPhone
              ? formatPhone(review.submittedPhone)
              : review.receiptCode ?? "홈페이지 고객후기",
            caseLabel || "연결 사건을 확인해 주세요.",
            review.content,
          ].join("\n"),
        ),
        category: "review",
        deepLinkPath: review.href,
      },
      durationMs: BUSINESS_NOTIFICATION_DURATION_MS,
      occurredAt: event.occurredAt,
    });
  }

  async function handlePhone(
    notification: Parameters<
      Parameters<TelephonyInboundEventSource["subscribe"]>[0]
    >[0] & { kind: "changed" },
  ) {
    const event = notification.notification;
    if (event.eventType !== "inbound.ringing") return;
    const call =
      await options.telephonyService.getDesktopInboundCallNotification(
        event.inboundCallId,
      );
    if (!call) return;
    const phone = formatPhone(call.remotePhone);
    const region = regionLabels[call.callRegion] ?? call.callRegion;
    const directTargets = call.directTargetUserIds;
    await Promise.all([
      ...(directTargets.length > 0
        ? [
            queueNotification({
              sourceEventId: event.eventId,
              eventType: "desktop.phone.targeted_inbound",
              preferenceKey: "phone.targeted_inbound",
              targetUserIds: directTargets,
              payload: {
                title: `[${region}] 내 담당·내 회선 전화 · ${call.customerName}`,
                body: `${phone}\n수신 회선 ${call.lineLabel}`,
                category: "phone",
                deepLinkPath: `/phone-desk/${call.id}`,
              },
              durationMs: PHONE_NOTIFICATION_DURATION_MS,
              occurredAt: event.occurredAt,
            }),
          ]
        : []),
      queueNotification({
        sourceEventId: event.eventId,
        eventType: "desktop.phone.all_external",
        preferenceKey: "phone.all_external",
        excludedUserIds: directTargets,
        payload: {
          title: `[${region}] 대표번호 수신 · ${call.customerName}`,
          body: `${phone}\n수신 회선 ${call.lineLabel}`,
          category: "phone",
          deepLinkPath: `/phone-desk/${call.id}`,
        },
        durationMs: PHONE_NOTIFICATION_DURATION_MS,
        occurredAt: event.occurredAt,
      }),
    ]);
  }

  async function handleCallActivity(callRootId?: string) {
    const calls =
      await options.telephonyService.getDesktopCallActivityNotifications(
        callRootId ? { callRootId } : undefined,
      );
    await Promise.all(
      calls.map((call) => {
        const internal = call.kind === "internal_inbound";
        const region = regionLabels[call.callRegion] ?? call.callRegion;
        const caller = call.callerName
          ? `${call.callerName}${call.callerExtension ? ` · 내선 ${call.callerExtension}` : ""}`
          : `내선 ${call.callerExtension ?? "확인 중"}`;
        const title = internal
          ? `내선 전화 · ${caller}`
          : call.kind === "transfer_returned"
            ? `[${region}] 고객 전화 복귀 · ${call.customerName}`
            : `[${region}] 호전환 전화 · ${call.customerName}`;
        const body = internal
          ? `수신 ${call.lineLabel} · 내선 ${call.targetExtension}`
          : `${formatPhone(call.remotePhone)}\n수신 회선 ${call.lineLabel}`;
        return queueNotification({
          sourceEventId: call.sourceEventId,
          eventType: `desktop.phone.${call.kind}`,
          preferenceKey: "phone.internal_transfer",
          targetUserIds: call.targetUserIds,
          payload: {
            title,
            body: truncateDesktopNotificationBody(body),
            category: "phone",
            deepLinkPath: `/phone-desk/${call.callRootId}`,
          },
          durationMs: PHONE_NOTIFICATION_DURATION_MS,
          occurredAt: call.occurredAt,
        });
      }),
    );
  }

  return {
    start() {
      if (unsubscribers.length > 0) return;
      unsubscribers = [
        options.consultationEvents.subscribe((message) => {
          if (message.kind === "changed") {
            track(handleConsultation(message));
          } else {
            replay(
              "consultation",
              options.consultationEvents.getRecentNotifications
                ? () => options.consultationEvents.getRecentNotifications!()
                : undefined,
              (notification) =>
                handleConsultation({ kind: "changed", notification }),
            );
          }
        }),
        options.messageEvents.subscribe((message) => {
          if (message.kind === "changed") {
            track(handleMessage(message));
          } else {
            replay(
              "message",
              options.messageEvents.getRecentNotifications
                ? () => options.messageEvents.getRecentNotifications!()
                : undefined,
              (notification) =>
                handleMessage({ kind: "changed", notification }),
            );
          }
        }),
        options.reviewEvents.subscribe((message) => {
          if (message.kind === "changed") {
            track(handleReview(message));
          } else {
            replay(
              "review",
              options.reviewEvents.getRecentNotifications
                ? () => options.reviewEvents.getRecentNotifications!()
                : undefined,
              (notification) =>
                handleReview({ kind: "changed", notification }),
            );
          }
        }),
        options.telephonyInboundEvents.subscribe((message) => {
          if (message.kind === "changed") {
            track(handlePhone(message));
          } else {
            replay(
              "telephony-inbound",
              options.telephonyInboundEvents.getRecentNotifications
                ? () =>
                    options.telephonyInboundEvents.getRecentNotifications!()
                : undefined,
              (notification) =>
                handlePhone({ kind: "changed", notification }),
            );
          }
        }),
        options.telephonyDeskEvents.subscribe((message) => {
          if (
            message.kind === "changed" &&
            message.notification.eventType === "call_activity.changed"
          ) {
            track(handleCallActivity(message.notification.entityId));
          } else if (message.kind === "sync") {
            replay(
              "telephony-call-activity",
              async () => [undefined],
              () => handleCallActivity(),
            );
          }
        }),
      ];
    },
    async stop() {
      for (const unsubscribe of unsubscribers) unsubscribe();
      unsubscribers = [];
      await Promise.allSettled([...pending]);
    },
  };
}

export type DesktopNotificationProducer = ReturnType<
  typeof createDesktopNotificationProducer
>;
