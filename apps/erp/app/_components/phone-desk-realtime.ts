"use client";

export type PhoneDeskRealtimePayload = {
  eventType:
    | "observed_call.changed"
    | "click_to_call.changed"
    | "click_to_call.linked"
    | "call_activity.changed"
    | "aftercare.changed"
    | "follow_up.changed";
  entityId: string;
  direction: "inbound" | "outbound";
  occurredAt: string;
};

type PhoneDeskRealtimeMessage =
  | { kind: "sync" }
  | { kind: "changed"; payload: PhoneDeskRealtimePayload };

type Listener = (message: PhoneDeskRealtimeMessage) => void;

const eventTypes = new Set<PhoneDeskRealtimePayload["eventType"]>([
  "observed_call.changed",
  "click_to_call.changed",
  "click_to_call.linked",
  "call_activity.changed",
  "aftercare.changed",
  "follow_up.changed",
]);
const listeners = new Set<Listener>();
let stream: EventSource | null = null;

function emit(message: PhoneDeskRealtimeMessage) {
  for (const listener of listeners) listener(message);
}

function parsePayload(event: MessageEvent<string>) {
  try {
    const value = JSON.parse(event.data) as Partial<PhoneDeskRealtimePayload>;
    if (
      typeof value.eventType !== "string" ||
      !eventTypes.has(value.eventType as PhoneDeskRealtimePayload["eventType"]) ||
      typeof value.entityId !== "string" ||
      (value.direction !== "inbound" && value.direction !== "outbound") ||
      typeof value.occurredAt !== "string"
    ) {
      return null;
    }
    return value as PhoneDeskRealtimePayload;
  } catch {
    return null;
  }
}

function openStream() {
  if (stream) return;
  const next = new EventSource("/api/phone-desk/stream");
  next.addEventListener("telephony.desk.sync", () => emit({ kind: "sync" }));
  next.addEventListener("telephony.desk.changed", (event) => {
    const payload = parsePayload(event as MessageEvent<string>);
    if (payload) emit({ kind: "changed", payload });
  });
  stream = next;
}

export function subscribePhoneDeskRealtime(listener: Listener) {
  listeners.add(listener);
  openStream();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stream?.close();
    stream = null;
  };
}
