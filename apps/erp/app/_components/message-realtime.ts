"use client";

export type MessageRealtimePayload = {
  eventId: string; eventType: "message.received"; messageId: string;
  threadKey: string; occurredAt: string;
};
type Listener = (message: { kind: "sync" } | { kind: "changed"; payload: MessageRealtimePayload }) => void;
const listeners = new Set<Listener>();
let stream: EventSource | null = null;
function emit(message: Parameters<Listener>[0]) { for (const listener of listeners) listener(message); }
function open() {
  if (stream) return;
  const next = new EventSource("/api/messages/stream");
  next.addEventListener("message.sync", () => emit({ kind: "sync" }));
  next.addEventListener("message.received", (event) => {
    try {
      const value = JSON.parse((event as MessageEvent<string>).data) as Partial<MessageRealtimePayload>;
      if (value.eventType === "message.received" && typeof value.eventId === "string" &&
        typeof value.messageId === "string" && typeof value.threadKey === "string" && typeof value.occurredAt === "string") {
        emit({ kind: "changed", payload: value as MessageRealtimePayload });
      }
    } catch { /* 다음 정상 이벤트를 기다린다. */ }
  });
  stream = next;
}
export function subscribeMessageRealtime(listener: Listener) {
  listeners.add(listener); open();
  return () => { listeners.delete(listener); if (!listeners.size) { stream?.close(); stream = null; } };
}
