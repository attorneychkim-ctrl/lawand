"use client";

import { useEffect, useState } from "react";
import { showMessageBrowserNotification } from "./browser-notification";
import { subscribeMessageRealtime } from "./message-realtime";

type Toast = { id: string; title: string; body: string; href: string };

export function MessageNotificationBridge() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const processMessage = async (messageId: string, eventId = messageId, occurredAt?: string) => {
      const storageKey = `lawand:message-notified:${messageId}`;
      const leaseKey = `${storageKey}:lease`;
      try {
        if (window.localStorage.getItem(storageKey)) return;
        const leaseAt = Number(window.localStorage.getItem(leaseKey) ?? "0");
        if (Date.now() - leaseAt < 8_000) return;
        window.localStorage.setItem(leaseKey, String(Date.now()));
      } catch { /* 저장소가 막혀도 현재 탭에서 알림을 시도한다. */ }
      const response = await fetch(`/api/messages/${messageId}/notification`, { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const value = await response.json() as { customerLabel: string; href: string; receivedAt: string };
      const toast = { id: eventId, title: "새 문자 도착", body: `${value.customerLabel} 고객이 문자를 보냈습니다.`, href: value.href };
      setToasts((items) => [...items.filter((item) => item.id !== toast.id), toast].slice(-3));
      window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== toast.id)), 8_000);
      const displayed = await showMessageBrowserNotification({
        title: toast.title, body: toast.body, eventId,
        messageId, href: value.href, occurredAt: occurredAt ?? value.receivedAt,
      });
      try {
        if (displayed) window.localStorage.setItem(storageKey, String(Date.now()));
        window.localStorage.removeItem(leaseKey);
      } catch { /* 브라우저 중복 방지만 생략 */ }
    };
    return subscribeMessageRealtime((message) => {
      if (message.kind === "changed") {
        void processMessage(message.payload.messageId, message.payload.eventId, message.payload.occurredAt);
        return;
      }
      void fetch("/api/messages/notifications", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((value: { items?: Array<{ messageId: string }> } | null) => {
          for (const item of value?.items ?? []) void processMessage(item.messageId);
        })
        .catch(() => undefined);
    });
  }, []);
  if (!toasts.length) return null;
  return <aside aria-live="assertive" className="telephony-toast-stack">
    {toasts.map((toast) => <button className="telephony-toast" key={toast.id} onClick={() => window.location.assign(toast.href)} type="button">
      <strong>{toast.title}</strong><span>{toast.body}</span>
    </button>)}
  </aside>;
}
