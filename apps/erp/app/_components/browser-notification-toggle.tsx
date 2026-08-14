"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  browserNotificationSettingChangedEvent,
  browserNotificationsEnabled,
  closeAllErpBrowserNotifications,
  setBrowserNotificationsEnabled,
} from "./browser-notification";

type NotificationToggleState =
  | "default"
  | "denied"
  | "enabled"
  | "disabled"
  | "checking"
  | "unsupported";

export const notificationPermissionChangedEvent =
  "lawand:notification-permission-changed";

function subscribeNotificationPermission(onStoreChange: () => void) {
  window.addEventListener(notificationPermissionChangedEvent, onStoreChange);
  window.addEventListener(
    browserNotificationSettingChangedEvent,
    onStoreChange,
  );
  window.addEventListener("focus", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(
      notificationPermissionChangedEvent,
      onStoreChange,
    );
    window.removeEventListener(
      browserNotificationSettingChangedEvent,
      onStoreChange,
    );
    window.removeEventListener("focus", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function notificationPermissionSnapshot(): NotificationToggleState {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission !== "granted") {
    return Notification.permission;
  }
  return browserNotificationsEnabled() ? "enabled" : "disabled";
}

function serverNotificationPermissionSnapshot(): NotificationToggleState {
  return "checking";
}

export function BrowserNotificationToggle() {
  const permission = useSyncExternalStore(
    subscribeNotificationPermission,
    notificationPermissionSnapshot,
    serverNotificationPermissionSnapshot,
  );

  const toggleNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    if (permission === "enabled") {
      setBrowserNotificationsEnabled(false);
      await closeAllErpBrowserNotifications();
      return;
    }
    if (permission === "disabled") {
      setBrowserNotificationsEnabled(true);
      return;
    }
    const nextPermission = await Notification.requestPermission();
    if (nextPermission === "granted") {
      setBrowserNotificationsEnabled(true);
    }
    window.dispatchEvent(new Event(notificationPermissionChangedEvent));
  }, [permission]);

  if (permission === "checking" || permission === "unsupported") return null;

  const label = permission === "enabled"
    ? "알림 켜짐"
    : permission === "disabled"
      ? "알림 꺼짐"
    : permission === "denied"
      ? "알림 차단됨"
      : "알림 켜기";

  return (
    <button
      aria-label={
        permission === "denied"
          ? "브라우저 설정에서 로앤 ERP 알림을 허용해 주세요"
          : permission === "enabled"
            ? "브라우저 알림 끄기"
            : permission === "disabled"
              ? "브라우저 알림 켜기"
          : label
      }
      className={`browser-notification-toggle is-${permission}`}
      disabled={permission === "denied"}
      onClick={() => void toggleNotifications()}
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
        {permission === "disabled" ? <path d="m4 4 16 16" /> : null}
      </svg>
      <span>{label}</span>
    </button>
  );
}
