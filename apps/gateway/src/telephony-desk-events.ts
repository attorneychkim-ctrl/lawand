import type {
  DatabaseNotification,
  DatabasePool,
  DatabasePoolClient,
} from "@lawand/db";

const TELEPHONY_DESK_EVENT_CHANNEL = "lawand_telephony_desk_events";
const DEFAULT_RECONNECT_DELAY_MS = 1_000;

export type TelephonyDeskEventNotification = {
  eventType:
    | "observed_call.changed"
    | "click_to_call.changed"
    | "click_to_call.linked"
    | "aftercare.changed"
    | "follow_up.changed";
  entityId: string;
  direction: "inbound" | "outbound";
  occurredAt: string;
};

export type TelephonyDeskEventMessage =
  | { kind: "changed"; notification: TelephonyDeskEventNotification }
  | { kind: "sync" };

export type TelephonyDeskEventSource = {
  subscribe(listener: (message: TelephonyDeskEventMessage) => void): () => void;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const eventTypes = new Set<TelephonyDeskEventNotification["eventType"]>([
  "observed_call.changed",
  "click_to_call.changed",
  "click_to_call.linked",
  "aftercare.changed",
  "follow_up.changed",
]);

export function parseTelephonyDeskEventNotification(
  payload: string | undefined,
): TelephonyDeskEventNotification | null {
  if (!payload) return null;
  try {
    const value = JSON.parse(payload) as Record<string, unknown>;
    const keys = Object.keys(value);
    if (
      keys.length !== 4 ||
      !keys.every((key) =>
        ["eventType", "entityId", "direction", "occurredAt"].includes(key),
      ) ||
      typeof value.eventType !== "string" ||
      !eventTypes.has(
        value.eventType as TelephonyDeskEventNotification["eventType"],
      ) ||
      typeof value.entityId !== "string" ||
      !uuidPattern.test(value.entityId) ||
      (value.direction !== "inbound" && value.direction !== "outbound") ||
      typeof value.occurredAt !== "string" ||
      !Number.isFinite(Date.parse(value.occurredAt))
    ) {
      return null;
    }
    return {
      eventType:
        value.eventType as TelephonyDeskEventNotification["eventType"],
      entityId: value.entityId,
      direction: value.direction,
      occurredAt: value.occurredAt,
    };
  } catch {
    return null;
  }
}

export function createPostgresTelephonyDeskEventSource(options: {
  pool: DatabasePool;
  reconnectDelayMs?: number;
  onError?: (error: unknown) => void;
}) {
  const listeners = new Set<
    (message: TelephonyDeskEventMessage) => void
  >();
  const reconnectDelayMs =
    options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  let client: DatabasePoolClient | null = null;
  let connectPromise: Promise<void> | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let stopped = true;

  function emit(message: TelephonyDeskEventMessage) {
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
      if (message.channel !== TELEPHONY_DESK_EVENT_CHANNEL) return;
      const notification = parseTelephonyDeskEventNotification(
        message.payload,
      );
      if (!notification) {
        options.onError?.(
          new Error("전화데스크 실시간 이벤트 payload가 올바르지 않습니다."),
        );
        return;
      }
      emit({ kind: "changed", notification });
    };
    const onError = (error: Error) => handleDisconnect(nextClient, error);
    const onEnd = () => handleDisconnect(nextClient);

    nextClient.on("notification", onNotification);
    nextClient.on("error", onError);
    nextClient.on("end", onEnd);
    try {
      await nextClient.query(`LISTEN ${TELEPHONY_DESK_EVENT_CHANNEL}`);
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
      await current.query(`UNLISTEN ${TELEPHONY_DESK_EVENT_CHANNEL}`);
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
    subscribe(listener: (message: TelephonyDeskEventMessage) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
