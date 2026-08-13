/* 로앤 ERP 네이티브 알림의 안전한 이동 액션만 처리한다. Web Push 수신은 별도 범위다. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function sameOriginUrl(value, fallbackPath) {
  try {
    const url = new URL(
      typeof value === "string" ? value : fallbackPath,
      self.location.origin,
    );
    return url.origin === self.location.origin
      ? url
      : new URL(fallbackPath, self.location.origin);
  } catch {
    return new URL(fallbackPath, self.location.origin);
  }
}

async function focusOrOpen(targetUrl) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const exact = windows.find((client) => client.url === targetUrl.href);
  if (exact) return exact.focus();

  const current = windows.find(
    (client) => new URL(client.url).origin === self.location.origin,
  );
  if (current) {
    try {
      const navigated = await current.navigate(targetUrl.href);
      return (navigated ?? current).focus();
    } catch {
      return current.focus();
    }
  }
  return self.clients.openWindow(targetUrl.href);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  const target = event.action === "consultation-desk"
    ? sameOriginUrl(data.deskHref, "/")
    : sameOriginUrl(data.href, "/");
  event.waitUntil(focusOrOpen(target));
});
