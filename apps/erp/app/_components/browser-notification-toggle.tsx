"use client";

import { useCallback, useSyncExternalStore } from "react";

type PermissionState =
  | NotificationPermission
  | "checking"
  | "unsupported";

export const notificationPermissionChangedEvent =
  "lawand:notification-permission-changed";

function subscribeNotificationPermission(onStoreChange: () => void) {
  window.addEventListener(notificationPermissionChangedEvent, onStoreChange);
  window.addEventListener("focus", onStoreChange);
  return () => {
    window.removeEventListener(
      notificationPermissionChangedEvent,
      onStoreChange,
    );
    window.removeEventListener("focus", onStoreChange);
  };
}

function notificationPermissionSnapshot(): PermissionState {
  return "Notification" in window
    ? Notification.permission
    : "unsupported";
}

function serverNotificationPermissionSnapshot(): PermissionState {
  return "checking";
}

export function BrowserNotificationToggle() {
  const permission = useSyncExternalStore(
    subscribeNotificationPermission,
    notificationPermissionSnapshot,
    serverNotificationPermissionSnapshot,
  );

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    await Notification.requestPermission();
    window.dispatchEvent(new Event(notificationPermissionChangedEvent));
  }, []);

  if (permission === "checking" || permission === "unsupported") return null;

  const label = permission === "granted"
    ? "알림 켜짐"
    : permission === "denied"
      ? "알림 차단됨"
      : "알림 켜기";

  return (
    <button
      aria-label={
        permission === "denied"
          ? "브라우저 설정에서 로앤 ERP 알림을 허용해 주세요"
          : label
      }
      className={`browser-notification-toggle is-${permission}`}
      disabled={permission !== "default"}
      onClick={() => void requestPermission()}
      title={
        permission === "denied"
          ? "브라우저 설정에서 이 사이트의 알림을 허용해 주세요"
          : undefined
      }
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6.5 10a5.5 5.5 0 0 1 11 0v3.25l1.75 2.5H4.75l1.75-2.5V10Z" />
        <path d="M9.75 19h4.5" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
