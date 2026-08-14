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

function safeActionUrl(value, pathPrefix, pathSuffix) {
  const url = sameOriginUrl(value, "/");
  return url.pathname.startsWith(pathPrefix) && url.pathname.endsWith(pathSuffix)
    ? url
    : null;
}

async function postActionThenOpen(actionUrl, targetUrl) {
  if (actionUrl) {
    try {
      await fetch(actionUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
    } catch {
      // 상세 화면에서 이미 처리됐거나 실패한 현재 상태를 다시 확인할 수 있다.
    }
  }
  return focusOrOpen(targetUrl);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  const target = sameOriginUrl(data.href, "/");
  if (event.action === "consultation-claim") {
    event.waitUntil(postActionThenOpen(
      safeActionUrl(data.claimHref, "/api/consultations/", "/claim"),
      target,
    ));
    return;
  }
  if (event.action === "telephony-answer") {
    event.waitUntil(postActionThenOpen(
      safeActionUrl(
        data.answerHref,
        "/api/telephony-inbound-calls/",
        "/answer",
      ),
      target,
    ));
    return;
  }
  event.waitUntil(focusOrOpen(target));
});
