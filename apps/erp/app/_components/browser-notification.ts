"use client";

import { recordBrowserNotificationDiagnostic } from "./browser-notification-diagnostics";

const NOTIFICATION_SERVICE_WORKER_PATH = "/notification-service-worker.js";
const NOTIFICATION_ICON_PATH = "/notification-icon.png";
const NOTIFICATION_BADGE_PATH = "/notification-badge.png";
const NOTIFICATION_CLOSE_DELAY_MS = 20_000;
const SERVICE_WORKER_READY_TIMEOUT_MS = 2_000;
const NOTIFICATION_ENABLED_STORAGE_KEY =
  "lawand:browser-notifications-enabled";

export const browserNotificationSettingChangedEvent =
  "lawand:browser-notification-setting-changed";

let memoryNotificationPreference: boolean | null = null;

type RichNotificationAction = {
  action: string;
  title: string;
  icon?: string;
};

type RichNotificationOptions = NotificationOptions & {
  actions?: RichNotificationAction[];
  renotify?: boolean;
  timestamp?: number;
};

type ConsultationBrowserNotification = {
  title: string;
  body: string;
  eventId: string;
  consultationId: string;
  href: string;
  occurredAt: string;
  canClaim: boolean;
};

type TelephonyBrowserNotification = {
  title: string;
  body: string;
  notificationId: string;
  callId: string;
  href: string;
  occurredAt: string;
  answerCallId: string | null;
};

type ReviewBrowserNotification = {
  title: string;
  body: string;
  eventId: string;
  reviewId: string;
  href: string;
  occurredAt: string;
};

type ErpBrowserNotification = {
  title: string;
  body: string;
  notificationId: string;
  resourceKind: "consultation" | "telephony" | "review";
  resourceId: string;
  href: string;
  deskHref?: string;
  occurredAt: string;
  actions?: RichNotificationAction[];
  claimHref?: string;
  answerHref?: string;
};

let serviceWorkerRegistration: Promise<ServiceWorkerRegistration> | null =
  null;
const pageNotifications = new Map<string, Notification>();

export function browserNotificationsEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(
      NOTIFICATION_ENABLED_STORAGE_KEY,
    );
    if (stored === "disabled") return false;
    if (stored === "enabled") return true;
  } catch {
    // 저장소가 차단된 환경에서는 현재 탭의 메모리 설정을 사용한다.
  }
  return memoryNotificationPreference ?? true;
}

export function setBrowserNotificationsEnabled(enabled: boolean) {
  memoryNotificationPreference = enabled;
  try {
    window.localStorage.setItem(
      NOTIFICATION_ENABLED_STORAGE_KEY,
      enabled ? "enabled" : "disabled",
    );
  } catch {
    // 저장소가 차단돼도 현재 탭에서는 사용자가 고른 상태를 유지한다.
  }
  window.dispatchEvent(new Event(browserNotificationSettingChangedEvent));
}

async function registerNotificationServiceWorker() {
  const registration = await navigator.serviceWorker.register(
    NOTIFICATION_SERVICE_WORKER_PATH,
    {
      scope: "/",
      updateViaCache: "none",
    },
  );
  if (registration.active) return registration;

  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("notification_service_worker_timeout")),
      SERVICE_WORKER_READY_TIMEOUT_MS,
    );
    void navigator.serviceWorker.ready.then((readyRegistration) => {
      window.clearTimeout(timer);
      resolve(readyRegistration);
    }, (error) => {
      window.clearTimeout(timer);
      reject(error);
    });
  });
}

export function prepareBrowserNotifications() {
  if (!("serviceWorker" in navigator)) return null;
  if (!serviceWorkerRegistration) {
    serviceWorkerRegistration = registerNotificationServiceWorker().catch(
      (error: unknown) => {
        recordBrowserNotificationDiagnostic({
          channel: "service_worker",
          stage: "prepare",
          outcome: "failed",
          reason: error instanceof Error ? error.name : "unknown_error",
        });
        serviceWorkerRegistration = null;
        throw error;
      },
    );
  }
  return serviceWorkerRegistration;
}

function closePersistentNotification(
  registration: ServiceWorkerRegistration,
  tag: string,
  eventId: string,
) {
  window.setTimeout(() => {
    void registration.getNotifications({ tag }).then((notifications) => {
      for (const notification of notifications) {
        const data = notification.data as { eventId?: unknown } | null;
        if (data?.eventId === eventId) notification.close();
      }
    }).catch(() => undefined);
  }, NOTIFICATION_CLOSE_DELAY_MS);
}

function showPageNotification(
  input: ErpBrowserNotification,
  options: NotificationOptions,
) {
  const tag = options.tag ??
    `lawand-${input.resourceKind}:${input.resourceId}`;
  pageNotifications.get(tag)?.close();
  const notification = new Notification(input.title, options);
  pageNotifications.set(tag, notification);
  const closeTimer = window.setTimeout(
    () => notification.close(),
    NOTIFICATION_CLOSE_DELAY_MS,
  );
  notification.onclose = () => {
    window.clearTimeout(closeTimer);
    if (pageNotifications.get(tag) === notification) {
      pageNotifications.delete(tag);
    }
  };
  notification.onclick = () => {
    window.clearTimeout(closeTimer);
    window.focus();
    window.location.assign(input.href);
    notification.close();
  };
}

async function showErpBrowserNotification(input: ErpBrowserNotification) {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !browserNotificationsEnabled()
  ) {
    return false;
  }

  const tag = `lawand-${input.resourceKind}:${input.resourceId}`;
  const occurredAt = Date.parse(input.occurredAt);
  const sharedOptions: NotificationOptions = {
    badge: NOTIFICATION_BADGE_PATH,
    body: input.body,
    data: {
      kind: input.resourceKind,
      eventId: input.notificationId,
      href: input.href,
      deskHref: input.deskHref,
      claimHref: input.claimHref,
      answerHref: input.answerHref,
    },
    dir: "auto",
    icon: NOTIFICATION_ICON_PATH,
    lang: "ko",
    requireInteraction: false,
    tag,
  };

  try {
    const registration = await prepareBrowserNotifications();
    if (registration) {
      const richOptions: RichNotificationOptions = {
        ...sharedOptions,
        ...(input.actions?.length ? { actions: input.actions } : {}),
        renotify: true,
        ...(Number.isFinite(occurredAt) ? { timestamp: occurredAt } : {}),
      };
      await registration.showNotification(
        input.title,
        richOptions as NotificationOptions,
      );
      closePersistentNotification(registration, tag, input.notificationId);
      recordBrowserNotificationDiagnostic({
        channel: input.resourceKind,
        stage: "display",
        outcome: "succeeded",
        displayMethod: "service_worker",
      });
      return true;
    }
  } catch (error) {
    recordBrowserNotificationDiagnostic({
      channel: input.resourceKind,
      stage: "display",
      outcome: "failed",
      reason: error instanceof Error ? error.name : "service_worker_error",
      displayMethod: "service_worker",
    });
    // 서비스 워커 표시가 지원되지 않으면 아래 페이지 Notification으로 대체한다.
  }

  try {
    showPageNotification(input, sharedOptions);
    recordBrowserNotificationDiagnostic({
      channel: input.resourceKind,
      stage: "display",
      outcome: "succeeded",
      displayMethod: "page",
    });
    return true;
  } catch (error) {
    recordBrowserNotificationDiagnostic({
      channel: input.resourceKind,
      stage: "display",
      outcome: "failed",
      reason: error instanceof Error ? error.name : "page_notification_error",
      displayMethod: "page",
    });
    return false;
  }
}

async function closeErpBrowserNotification(
  resourceKind: ErpBrowserNotification["resourceKind"],
  resourceId: string,
) {
  const tag = `lawand-${resourceKind}:${resourceId}`;
  pageNotifications.get(tag)?.close();
  pageNotifications.delete(tag);
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await prepareBrowserNotifications();
    if (!registration) return;
    const notifications = await registration.getNotifications({ tag });
    for (const notification of notifications) notification.close();
  } catch {
    // 알림이 이미 닫혔거나 서비스 워커를 쓸 수 없으면 정리할 것이 없다.
  }
}

export function closeConsultationBrowserNotification(
  consultationId: string,
) {
  return closeErpBrowserNotification("consultation", consultationId);
}

export function closeTelephonyBrowserNotification(callId: string) {
  return closeErpBrowserNotification("telephony", callId);
}

export async function closeAllErpBrowserNotifications() {
  for (const notification of pageNotifications.values()) notification.close();
  pageNotifications.clear();
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await prepareBrowserNotifications();
    if (!registration) return;
    const notifications = await registration.getNotifications();
    for (const notification of notifications) {
      if (notification.tag.startsWith("lawand-")) notification.close();
    }
  } catch {
    // 서비스 워커를 쓸 수 없는 브라우저에는 닫을 persistent 알림도 없다.
  }
}

export function showConsultationBrowserNotification(
  input: ConsultationBrowserNotification,
) {
  return showErpBrowserNotification({
    title: input.title,
    body: input.body,
    notificationId: input.eventId,
    resourceKind: "consultation",
    resourceId: input.consultationId,
    href: input.href,
    occurredAt: input.occurredAt,
    ...(input.canClaim
      ? {
          actions: [{ action: "consultation-claim", title: "상담하기" }],
          claimHref: `/api/consultations/${input.consultationId}/claim`,
        }
      : {}),
  });
}

export function showTelephonyBrowserNotification(
  input: TelephonyBrowserNotification,
) {
  return showErpBrowserNotification({
    title: input.title,
    body: input.body,
    notificationId: input.notificationId,
    resourceKind: "telephony",
    resourceId: input.callId,
    href: input.href,
    occurredAt: input.occurredAt,
    ...(input.answerCallId
      ? {
          actions: [{ action: "telephony-answer", title: "수신하기" }],
          answerHref:
            `/api/telephony-inbound-calls/${input.answerCallId}/answer`,
        }
      : {}),
  });
}

export function showReviewBrowserNotification(
  input: ReviewBrowserNotification,
) {
  return showErpBrowserNotification({
    title: input.title,
    body: input.body,
    notificationId: input.eventId,
    resourceKind: "review",
    resourceId: input.reviewId,
    href: input.href,
    deskHref: "/reviews",
    occurredAt: input.occurredAt,
    actions: [
      { action: "erp-detail", title: "후기 보기" },
      { action: "erp-desk", title: "후기관리" },
    ],
  });
}
