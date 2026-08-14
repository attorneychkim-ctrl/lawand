"use client";

const NOTIFICATION_SERVICE_WORKER_PATH = "/notification-service-worker.js";
const NOTIFICATION_ICON_PATH = "/notification-icon.png";
const NOTIFICATION_BADGE_PATH = "/notification-badge.png";
const NOTIFICATION_CLOSE_DELAY_MS = 10_000;
const SERVICE_WORKER_READY_TIMEOUT_MS = 2_000;

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
};

type TelephonyBrowserNotification = {
  title: string;
  body: string;
  notificationId: string;
  callId: string;
  href: string;
  occurredAt: string;
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
  deskHref: string;
  occurredAt: string;
  detailActionTitle: string;
  deskActionTitle: string;
};

let serviceWorkerRegistration: Promise<ServiceWorkerRegistration> | null =
  null;

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
      (error) => {
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
  const notification = new Notification(input.title, options);
  const closeTimer = window.setTimeout(
    () => notification.close(),
    NOTIFICATION_CLOSE_DELAY_MS,
  );
  notification.onclick = () => {
    window.clearTimeout(closeTimer);
    window.focus();
    window.location.assign(input.href);
    notification.close();
  };
}

async function showErpBrowserNotification(input: ErpBrowserNotification) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
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
        actions: [
          { action: "erp-detail", title: input.detailActionTitle },
          { action: "erp-desk", title: input.deskActionTitle },
        ],
        renotify: true,
        ...(Number.isFinite(occurredAt) ? { timestamp: occurredAt } : {}),
      };
      await registration.showNotification(
        input.title,
        richOptions as NotificationOptions,
      );
      closePersistentNotification(registration, tag, input.notificationId);
      return true;
    }
  } catch {
    // 서비스 워커 표시가 지원되지 않으면 아래 페이지 Notification으로 대체한다.
  }

  try {
    showPageNotification(input, sharedOptions);
    return true;
  } catch {
    return false;
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
    deskHref: "/",
    occurredAt: input.occurredAt,
    detailActionTitle: "상담 보기",
    deskActionTitle: "상담데스크",
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
    deskHref: "/phone-desk",
    occurredAt: input.occurredAt,
    detailActionTitle: "전화 보기",
    deskActionTitle: "전화데스크",
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
    detailActionTitle: "후기 보기",
    deskActionTitle: "후기관리",
  });
}
