import type { DesktopNotificationService } from "./desktop-notification-service.js";

const DEFAULT_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1_000;

export function createDesktopNotificationMaintenance(options: {
  desktopNotifications: Pick<DesktopNotificationService, "cleanupExpired">;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}) {
  const intervalMs =
    options.intervalMs ?? DEFAULT_MAINTENANCE_INTERVAL_MS;
  let timer: NodeJS.Timeout | null = null;
  let pending: Promise<void> | null = null;

  function runNow() {
    if (pending) return pending;
    pending = options.desktopNotifications
      .cleanupExpired()
      .then(() => undefined)
      .catch((error) => options.onError?.(error))
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  return {
    start() {
      if (timer) return;
      void runNow();
      timer = setInterval(() => void runNow(), intervalMs);
      timer.unref();
    },
    runNow,
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      await pending;
    },
  };
}

export type DesktopNotificationMaintenance = ReturnType<
  typeof createDesktopNotificationMaintenance
>;
