"use client";

export type BrowserNotificationDiagnostic = {
  channel: "consultation" | "telephony" | "review" | "message" | "follow_up" | "service_worker";
  stage: "sse" | "prepare" | "display";
  outcome: "connected" | "disconnected" | "sync" | "succeeded" | "failed";
  reason?: string;
  displayMethod?: "service_worker" | "page";
};

const lastDiagnosticAt = new Map<string, number>();

export function recordBrowserNotificationDiagnostic(
  diagnostic: BrowserNotificationDiagnostic,
) {
  const key = [
    diagnostic.channel,
    diagnostic.stage,
    diagnostic.outcome,
    diagnostic.reason ?? "",
    diagnostic.displayMethod ?? "",
  ].join(":");
  const current = Date.now();
  if (current - (lastDiagnosticAt.get(key) ?? 0) < 30_000) return;
  lastDiagnosticAt.set(key, current);
  const payload = JSON.stringify({
    ...diagnostic,
    permission:
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission,
    visibility: document.visibilityState,
    online: navigator.onLine,
  });
  void fetch("/api/browser-notification-diagnostics", {
    method: "POST",
    cache: "no-store",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: payload,
  }).catch(() => undefined);
}
