"use client";

import type { ReviewRecordType } from "../../lib/gateway";

export type ReviewRealtimeChangedPayload = {
  eventId: string;
  eventType: "review.linked" | "review.changed";
  recordId: string;
  recordType: ReviewRecordType;
  occurredAt: string;
};

type ReviewRealtimeMessage =
  | { kind: "open" }
  | { kind: "sync" }
  | { kind: "changed"; payload: ReviewRealtimeChangedPayload }
  | { kind: "error" };

type ReviewRealtimeListener = (message: ReviewRealtimeMessage) => void;

const listeners = new Set<ReviewRealtimeListener>();
let stream: EventSource | null = null;

function emit(message: ReviewRealtimeMessage) {
  for (const listener of listeners) listener(message);
}

function parsePayload(
  event: MessageEvent<string>,
): ReviewRealtimeChangedPayload | null {
  try {
    const value = JSON.parse(event.data) as Partial<ReviewRealtimeChangedPayload>;
    return value.eventType === "review.linked" || value.eventType === "review.changed"
      ? typeof value.eventId === "string" &&
        typeof value.recordId === "string" &&
        (value.recordType === "review" || value.recordType === "submission") &&
        typeof value.occurredAt === "string"
        ? {
            eventId: value.eventId,
            eventType: value.eventType,
            recordId: value.recordId,
            recordType: value.recordType,
            occurredAt: value.occurredAt,
          }
        : null
      : null;
  } catch {
    return null;
  }
}

function openStream() {
  if (stream) return;
  const next = new EventSource("/api/reviews/stream");
  next.onopen = () => emit({ kind: "open" });
  next.onerror = () => emit({ kind: "error" });
  next.addEventListener("review.sync", () => emit({ kind: "sync" }));
  next.addEventListener("review.changed", (event) => {
    const payload = parsePayload(event as MessageEvent<string>);
    if (payload) emit({ kind: "changed", payload });
  });
  stream = next;
}

export function subscribeReviewRealtime(listener: ReviewRealtimeListener) {
  listeners.add(listener);
  openStream();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stream?.close();
    stream = null;
  };
}
