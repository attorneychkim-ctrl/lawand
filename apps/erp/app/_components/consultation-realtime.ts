"use client";

export type ConsultationRealtimeChangedPayload = {
  eventId: string;
  eventType: string;
  consultationId: string;
  occurredAt: string;
  notificationKind:
    | "repeat_unassigned"
    | "repeat_assigned"
    | "assignment_transferred"
    | null;
};

export type ConsultationRealtimeMessage =
  | { kind: "open" }
  | { kind: "sync" }
  | { kind: "changed"; payload: ConsultationRealtimeChangedPayload }
  | { kind: "error" };

type ConsultationRealtimeListener = (
  message: ConsultationRealtimeMessage,
) => void;

const listeners = new Set<ConsultationRealtimeListener>();
let stream: EventSource | null = null;

function emit(message: ConsultationRealtimeMessage) {
  for (const listener of listeners) listener(message);
}

function parseChangedPayload(
  event: MessageEvent<string>,
): ConsultationRealtimeChangedPayload | null {
  try {
    const payload = JSON.parse(event.data) as Partial<
      ConsultationRealtimeChangedPayload
    >;
    return typeof payload.eventId === "string" &&
        typeof payload.eventType === "string" &&
        typeof payload.consultationId === "string" &&
        typeof payload.occurredAt === "string" &&
        (payload.notificationKind === undefined ||
          payload.notificationKind === null ||
          payload.notificationKind === "repeat_unassigned" ||
          payload.notificationKind === "repeat_assigned" ||
          payload.notificationKind === "assignment_transferred")
      ? {
          eventId: payload.eventId,
          eventType: payload.eventType,
          consultationId: payload.consultationId,
          occurredAt: payload.occurredAt,
          notificationKind:
            payload.notificationKind === "repeat_unassigned" ||
            payload.notificationKind === "repeat_assigned" ||
            payload.notificationKind === "assignment_transferred"
              ? payload.notificationKind
              : null,
        }
      : null;
  } catch {
    return null;
  }
}

function openStream() {
  if (stream) return;
  const nextStream = new EventSource("/api/consultations/stream");
  nextStream.onopen = () => emit({ kind: "open" });
  nextStream.onerror = () => emit({ kind: "error" });
  nextStream.addEventListener("consultation.sync", () => {
    emit({ kind: "sync" });
  });
  nextStream.addEventListener("consultation.changed", (event) => {
    const payload = parseChangedPayload(event as MessageEvent<string>);
    if (payload) emit({ kind: "changed", payload });
  });
  stream = nextStream;
}

export function subscribeConsultationRealtime(
  listener: ConsultationRealtimeListener,
) {
  listeners.add(listener);
  openStream();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stream?.close();
    stream = null;
  };
}
