import type {
  DatabaseNotification,
  DatabasePool,
  DatabasePoolClient,
} from "@lawand/db";

const CONSULTATION_EVENT_CHANNEL = "lawand_consultation_events";
const DEFAULT_RECONNECT_DELAY_MS = 1_000;

export type ConsultationEventNotification = {
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

export type ConsultationEventMessage =
  | { kind: "changed"; notification: ConsultationEventNotification }
  | { kind: "sync" };

export type ConsultationEventSource = {
  subscribe(
    listener: (message: ConsultationEventMessage) => void,
  ): () => void;
  getRecentNotifications?(): Promise<ConsultationEventNotification[]>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ConsultationEventSnapshotRow = {
  event_id: string;
  event_type: string;
  consultation_id: string;
  occurred_at: Date;
  repeat_stage: string | null;
};

export function consultationEventNotificationFromSnapshot(
  row: ConsultationEventSnapshotRow,
) {
  const notificationKind =
    row.event_type === "consultation.assignment.transferred"
      ? "assignment_transferred" as const
      : row.repeat_stage === "before_assignment"
        ? "repeat_unassigned" as const
        : row.repeat_stage === "after_assignment"
          ? "repeat_assigned" as const
          : null;
  return parseConsultationEventNotification(JSON.stringify({
    eventId: row.event_id,
    eventType: row.event_type,
    consultationId: row.consultation_id,
    occurredAt: row.occurred_at.toISOString(),
    notificationKind,
  }));
}

export function parseConsultationEventNotification(
  payload: string | undefined,
): ConsultationEventNotification | null {
  if (!payload) return null;
  try {
    const value = JSON.parse(payload) as Record<string, unknown>;
    if (
      typeof value.eventId !== "string" ||
      !uuidPattern.test(value.eventId) ||
      typeof value.eventType !== "string" ||
      !value.eventType.startsWith("consultation.") ||
      typeof value.consultationId !== "string" ||
      !uuidPattern.test(value.consultationId) ||
      typeof value.occurredAt !== "string" ||
      !Number.isFinite(Date.parse(value.occurredAt)) ||
      (value.notificationKind !== undefined &&
        value.notificationKind !== null &&
        value.notificationKind !== "repeat_unassigned" &&
        value.notificationKind !== "repeat_assigned" &&
        value.notificationKind !== "assignment_transferred")
    ) {
      return null;
    }
    return {
      eventId: value.eventId,
      eventType: value.eventType,
      consultationId: value.consultationId,
      occurredAt: value.occurredAt,
      notificationKind:
        value.notificationKind === "repeat_unassigned" ||
        value.notificationKind === "repeat_assigned" ||
        value.notificationKind === "assignment_transferred"
          ? value.notificationKind
          : null,
    };
  } catch {
    return null;
  }
}

export function createPostgresConsultationEventSource(options: {
  pool: DatabasePool;
  snapshotPool: DatabasePool;
  reconnectDelayMs?: number;
  onError?: (error: unknown) => void;
}) {
  const listeners = new Set<
    (message: ConsultationEventMessage) => void
  >();
  const reconnectDelayMs =
    options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  let client: DatabasePoolClient | null = null;
  let connectPromise: Promise<void> | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let stopped = true;

  function emit(message: ConsultationEventMessage) {
    for (const listener of listeners) {
      try {
        listener(message);
      } catch (error) {
        options.onError?.(error);
      }
    }
  }

  function detach(current: DatabasePoolClient) {
    current.removeAllListeners("notification");
    current.removeAllListeners("error");
    current.removeAllListeners("end");
  }

  function release(current: DatabasePoolClient) {
    detach(current);
    try {
      current.release(true);
    } catch {
      // 이미 종료된 연결은 추가 정리가 필요하지 않다.
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect().catch((error) => {
        options.onError?.(error);
        scheduleReconnect();
      });
    }, reconnectDelayMs);
    reconnectTimer.unref();
  }

  function handleDisconnect(current: DatabasePoolClient, error?: unknown) {
    if (client !== current) return;
    client = null;
    if (error) options.onError?.(error);
    release(current);
    scheduleReconnect();
  }

  async function establishConnection() {
    const nextClient = await options.pool.connect();
    if (stopped) {
      nextClient.release();
      return;
    }

    const onNotification = (message: DatabaseNotification) => {
      if (message.channel !== CONSULTATION_EVENT_CHANNEL) return;
      const notification = parseConsultationEventNotification(
        message.payload,
      );
      if (!notification) {
        options.onError?.(
          new Error("상담 실시간 이벤트 payload가 올바르지 않습니다."),
        );
        return;
      }
      emit({ kind: "changed", notification });
    };
    const onError = (error: Error) =>
      handleDisconnect(nextClient, error);
    const onEnd = () => handleDisconnect(nextClient);

    nextClient.on("notification", onNotification);
    nextClient.on("error", onError);
    nextClient.on("end", onEnd);
    try {
      await nextClient.query(`LISTEN ${CONSULTATION_EVENT_CHANNEL}`);
    } catch (error) {
      release(nextClient);
      throw error;
    }

    if (stopped) {
      release(nextClient);
      return;
    }
    client = nextClient;
    emit({ kind: "sync" });
  }

  function connect() {
    if (connectPromise) return connectPromise;
    connectPromise = establishConnection().finally(() => {
      connectPromise = null;
    });
    return connectPromise;
  }

  async function start() {
    if (!stopped) return;
    stopped = false;
    await connect();
  }

  async function stop() {
    stopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    await connectPromise?.catch(() => undefined);
    const current = client;
    client = null;
    if (!current) return;
    detach(current);
    try {
      await current.query(`UNLISTEN ${CONSULTATION_EVENT_CHANNEL}`);
      current.release();
    } catch {
      try {
        current.release(true);
      } catch {
        // 종료 중 이미 닫힌 연결은 무시한다.
      }
    }
  }

  return {
    start,
    stop,
    subscribe(listener: (message: ConsultationEventMessage) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async getRecentNotifications() {
      const result = await options.snapshotPool.query<ConsultationEventSnapshotRow>(`
        SELECT
          id::text AS event_id,
          event_type,
          aggregate_id::text AS consultation_id,
          occurred_at,
          payload #>> '{data,repeatStage}' AS repeat_stage
        FROM public.outbox_events
        WHERE aggregate_type = 'consultation'
          AND event_type LIKE 'consultation.%'
          AND occurred_at >= now() - interval '5 minutes'
        ORDER BY occurred_at ASC, id ASC
        LIMIT 200
      `);
      return result.rows.flatMap((row) => {
        const notification = consultationEventNotificationFromSnapshot(row);
        return notification ? [notification] : [];
      });
    },
  } satisfies ConsultationEventSource & {
    start(): Promise<void>;
    stop(): Promise<void>;
  };
}
