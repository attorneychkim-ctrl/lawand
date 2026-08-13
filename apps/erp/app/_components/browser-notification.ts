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
  input: ConsultationBrowserNotification,
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

export async function showConsultationBrowserNotification(
  input: ConsultationBrowserNotification,
) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  const tag = `lawand-consultation:${input.consultationId}`;
  const occurredAt = Date.parse(input.occurredAt);
  const sharedOptions: NotificationOptions = {
    badge: NOTIFICATION_BADGE_PATH,
    body: input.body,
    data: {
      kind: "consultation",
      eventId: input.eventId,
      href: input.href,
      deskHref: "/",
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
          { action: "consultation-detail", title: "상담 보기" },
          { action: "consultation-desk", title: "상담데스크" },
        ],
        renotify: true,
        ...(Number.isFinite(occurredAt) ? { timestamp: occurredAt } : {}),
      };
      await registration.showNotification(
        input.title,
        richOptions as NotificationOptions,
      );
      closePersistentNotification(registration, tag, input.eventId);
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
