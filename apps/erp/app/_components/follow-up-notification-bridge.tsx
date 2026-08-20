"use client";

import { useEffect } from "react";

import type { PhoneDeskFollowUpDuty } from "../../lib/gateway";
import { showFollowUpBrowserNotification } from "./browser-notification";
import { subscribePhoneDeskRealtime } from "./phone-desk-realtime";

const REFRESH_INTERVAL_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;

function formatWindow(start: string, end: string | null) {
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(start));
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const startTime = time.format(new Date(start));
  return end
    ? `${date} ${startTime}~${time.format(new Date(end))}`
    : `${date} ${startTime}`;
}

export function FollowUpNotificationBridge() {
  useEffect(() => {
    let active = true;
    const timers = new Map<string, { dueAt: string; timer: number }>();
    const memoryNotified = new Set<string>();

    const notify = async (item: PhoneDeskFollowUpDuty["items"][number]) => {
      const notificationKey = `${item.id}:${item.dueAt}`;
      const storedKey = `lawand:follow-up-notified:${notificationKey}`;
      const leaseKey = `lawand:follow-up-notification-lease:${notificationKey}`;
      if (memoryNotified.has(notificationKey)) return;
      const leaseToken = crypto.randomUUID();
      try {
        if (window.localStorage.getItem(storedKey)) {
          memoryNotified.add(notificationKey);
          return;
        }
        const currentLease = JSON.parse(
          window.localStorage.getItem(leaseKey) ?? "null",
        ) as { token?: unknown; expiresAt?: unknown } | null;
        if (
          typeof currentLease?.expiresAt === "number" &&
          currentLease.expiresAt > Date.now()
        ) {
          return;
        }
        window.localStorage.setItem(
          leaseKey,
          JSON.stringify({ token: leaseToken, expiresAt: Date.now() + 8_000 }),
        );
        const acquired = JSON.parse(
          window.localStorage.getItem(leaseKey) ?? "null",
        ) as { token?: unknown } | null;
        if (acquired?.token !== leaseToken) return;
      } catch {
        // 저장소가 차단된 환경에서는 현재 탭의 메모리 중복 방지만 사용한다.
      }

      const shown = await showFollowUpBrowserNotification({
        title:
          item.source === "consultation_schedule"
            ? "홈페이지 예약 상담 시간입니다"
            : "재통화 예정 시간입니다",
        body: `${formatWindow(item.dueAt, item.dueEndAt)} · 전화데스크에서 고객과 업무를 확인해 주세요.`,
        eventId: notificationKey,
        taskId: item.id,
        href: "/phone-desk",
        occurredAt: item.dueAt,
      });
      if (shown) {
        memoryNotified.add(notificationKey);
        try {
          window.localStorage.setItem(storedKey, String(Date.now()));
        } catch {
          // 표시 성공은 현재 탭 메모리에도 기록되어 있다.
        }
      }
      try {
        const currentLease = JSON.parse(
          window.localStorage.getItem(leaseKey) ?? "null",
        ) as { token?: unknown } | null;
        if (currentLease?.token === leaseToken) {
          window.localStorage.removeItem(leaseKey);
        }
      } catch {
        // 정리할 브라우저 저장소가 없다.
      }
    };

    const synchronize = async () => {
      let duty: PhoneDeskFollowUpDuty | null = null;
      try {
        const response = await fetch("/api/phone-desk/follow-ups/duty", {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (response.ok) duty = (await response.json()) as PhoneDeskFollowUpDuty;
      } catch {
        duty = null;
      }
      if (!active || !duty || !Array.isArray(duty.items)) return;

      const currentDueAt = new Map(
        duty.items.map((item) => [item.id, item.dueAt] as const),
      );
      for (const [taskId, scheduled] of timers) {
        if (currentDueAt.get(taskId) === scheduled.dueAt) continue;
        window.clearTimeout(scheduled.timer);
        timers.delete(taskId);
      }
      for (const item of duty.items) {
        if (timers.has(item.id)) continue;
        const delay = new Date(item.dueAt).getTime() - Date.now();
        if (delay <= 0) {
          void notify(item);
          continue;
        }
        const timer = window.setTimeout(() => {
          timers.delete(item.id);
          void notify(item);
        }, Math.min(delay, MAX_TIMER_DELAY_MS));
        timers.set(item.id, { dueAt: item.dueAt, timer });
      }
    };

    queueMicrotask(() => void synchronize());
    const interval = window.setInterval(() => void synchronize(), REFRESH_INTERVAL_MS);
    const unsubscribe = subscribePhoneDeskRealtime((message) => {
      if (
        message.kind === "sync" ||
        message.payload.eventType === "follow_up.changed"
      ) {
        void synchronize();
      }
    });
    return () => {
      active = false;
      window.clearInterval(interval);
      for (const scheduled of timers.values()) {
        window.clearTimeout(scheduled.timer);
      }
      timers.clear();
      unsubscribe();
    };
  }, []);

  return null;
}
