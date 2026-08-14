"use client";

import { useEffect, useRef } from "react";

import { showReviewBrowserNotification } from "./browser-notification";
import { subscribeReviewRealtime } from "./review-realtime";

type ReviewNotification = {
  id: string;
  recordType: "review" | "submission";
  href: string;
  customerName: string;
  receiptCode: string | null;
  caseNumber: string | null;
  caseName: string | null;
  managerNames: string[];
};

function isReviewNotification(value: unknown): value is ReviewNotification {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ReviewNotification>;
  return (
    typeof item.id === "string" &&
    (item.recordType === "review" || item.recordType === "submission") &&
    typeof item.href === "string" &&
    typeof item.customerName === "string" &&
    Array.isArray(item.managerNames)
  );
}

export function ReviewNotificationBridge() {
  const seenEventIds = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeReviewRealtime((message) => {
      if (
        message.kind !== "changed" ||
        message.payload.eventType !== "review.linked" ||
        seenEventIds.current.has(message.payload.eventId)
      ) {
        return;
      }
      seenEventIds.current.add(message.payload.eventId);
      void (async () => {
        const storageKey = `lawand:review-notified:${message.payload.recordType}:${message.payload.recordId}`;
        try {
          if (window.localStorage.getItem(storageKey)) return;
        } catch {
          // 저장소가 막힌 브라우저에서도 Notification API는 시도한다.
        }
        let value: unknown = null;
        try {
          const response = await fetch(
            `/api/reviews/${message.payload.recordType}/${message.payload.recordId}/notification`,
            { cache: "no-store", headers: { accept: "application/json" } },
          );
          if (response.ok) value = await response.json();
        } catch {
          value = null;
        }
        if (!active || !isReviewNotification(value)) return;
        try {
          if (window.localStorage.getItem(storageKey)) return;
          window.localStorage.setItem(storageKey, String(Date.now()));
        } catch {
          // 저장소가 막힌 브라우저에서도 Notification API는 시도한다.
        }
        const caseText = [value.caseNumber, value.caseName]
          .filter(Boolean)
          .join(" · ");
        await showReviewBrowserNotification({
          title: `담당 고객 후기 · ${value.customerName}`,
          body: [
            value.receiptCode ?? "홈페이지 고객후기",
            caseText || "연결 사건을 확인해 주세요.",
            "후기관리에서 공개 여부를 확인하고 답글을 남겨주세요.",
          ].join("\n"),
          eventId: message.payload.eventId,
          reviewId: value.id,
          href: value.href,
          occurredAt: message.payload.occurredAt,
        });
      })();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return null;
}
