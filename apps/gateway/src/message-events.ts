import type { DatabaseNotification, DatabasePool, DatabasePoolClient } from "@lawand/db";

const CHANNEL = "lawand_message_events";

export type MessageEventNotification = {
  eventId: string;
  eventType: "message.received";
  messageId: string;
  threadKey: string;
  targetUserIds: string[];
  occurredAt: string;
};
export type MessageEventSource = {
  subscribe(listener: (message: { kind: "sync" } | { kind: "changed"; notification: MessageEventNotification }) => void): () => void;
  getRecentNotifications?(): Promise<MessageEventNotification[]>;
};

export type MessageEventSnapshotRow = {
  event_id: string;
  target_source: string | null;
  consultation_id: string | null;
  directory_case_idx: number | null;
  manual_contact_id: string | null;
  legal_friends_case_idx: string | null;
  target_user_ids: string[];
  occurred_at: Date;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseMessageEventNotification(payload?: string): MessageEventNotification | null {
  if (!payload) return null;
  try {
    const value = JSON.parse(payload) as Partial<MessageEventNotification>;
    if (
      !uuidPattern.test(value.eventId ?? "") || value.eventType !== "message.received" ||
      !uuidPattern.test(value.messageId ?? "") || typeof value.threadKey !== "string" ||
      !Array.isArray(value.targetUserIds) || !value.targetUserIds.every((id) => uuidPattern.test(id)) ||
      typeof value.occurredAt !== "string" || !Number.isFinite(Date.parse(value.occurredAt))
    ) return null;
    return value as MessageEventNotification;
  } catch { return null; }
}

export function messageEventNotificationFromSnapshot(
  row: MessageEventSnapshotRow,
): MessageEventNotification | null {
  const threadKey =
    row.target_source === "legal_friends_directory" && row.directory_case_idx
      ? `case:${row.directory_case_idx}`
      : row.target_source === "manual" && row.manual_contact_id
        ? `manual:${row.manual_contact_id}`
        : row.legal_friends_case_idx
          ? `case:${row.legal_friends_case_idx}`
          : row.consultation_id
            ? `consultation:${row.consultation_id}`
            : `unmatched:${row.event_id}`;
  return parseMessageEventNotification(JSON.stringify({
    eventId: row.event_id,
    eventType: "message.received",
    messageId: row.event_id,
    threadKey,
    targetUserIds: row.target_user_ids,
    occurredAt: row.occurred_at.toISOString(),
  }));
}

export function createPostgresMessageEventSource(options: {
  pool: DatabasePool;
  snapshotPool?: DatabasePool;
  reconnectDelayMs?: number;
  onError?: (error: unknown) => void;
}) {
  const listeners = new Set<Parameters<MessageEventSource["subscribe"]>[0]>();
  let client: DatabasePoolClient | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let stopped = true;

  function emit(message: { kind: "sync" } | { kind: "changed"; notification: MessageEventNotification }) {
    for (const listener of listeners) listener(message);
  }
  function release(current: DatabasePoolClient) {
    current.removeAllListeners();
    try { current.release(true); } catch { /* 이미 닫힌 연결 */ }
  }
  function reconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect().catch((error) => { options.onError?.(error); reconnect(); });
    }, options.reconnectDelayMs ?? 1_000);
    reconnectTimer.unref();
  }
  async function connect() {
    const next = await options.pool.connect();
    if (stopped) { next.release(); return; }
    next.on("notification", (message: DatabaseNotification) => {
      if (message.channel !== CHANNEL) return;
      const notification = parseMessageEventNotification(message.payload);
      if (notification) emit({ kind: "changed", notification });
      else options.onError?.(new Error("문자 실시간 이벤트 payload가 올바르지 않습니다."));
    });
    const disconnected = (error?: unknown) => {
      if (client !== next) return;
      client = null;
      if (error) options.onError?.(error);
      release(next);
      reconnect();
    };
    next.on("error", disconnected);
    next.on("end", disconnected);
    try { await next.query(`LISTEN ${CHANNEL}`); }
    catch (error) { release(next); throw error; }
    if (stopped) { release(next); return; }
    client = next;
    emit({ kind: "sync" });
  }
  return {
    async start() { if (!stopped) return; stopped = false; await connect(); },
    async stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      const current = client;
      client = null;
      if (!current) return;
      try { await current.query(`UNLISTEN ${CHANNEL}`); current.release(); }
      catch { release(current); }
    },
    subscribe(listener: Parameters<MessageEventSource["subscribe"]>[0]) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async getRecentNotifications() {
      const result = await (options.snapshotPool ?? options.pool)
        .query<MessageEventSnapshotRow>(`
          SELECT
            message.id::text AS event_id,
            message.target_source::text AS target_source,
            message.consultation_id::text AS consultation_id,
            message.directory_case_idx,
            message.manual_contact_id::text AS manual_contact_id,
            case_link.case_idx AS legal_friends_case_idx,
            COALESCE(
              array_agg(notification.staff_user_id::text ORDER BY notification.staff_user_id)
                FILTER (WHERE notification.staff_user_id IS NOT NULL),
              ARRAY[]::text[]
            ) AS target_user_ids,
            message.received_at AS occurred_at
          FROM public.telephony_inbound_messages AS message
          LEFT JOIN public.telephony_inbound_message_notifications AS notification
            ON notification.inbound_message_id = message.id
          LEFT JOIN public.legalfriends_case_links AS case_link
            ON case_link.consultation_id = message.consultation_id
          WHERE message.received_at >= now() - interval '5 minutes'
          GROUP BY message.id, case_link.case_idx
          ORDER BY message.received_at ASC, message.id ASC
          LIMIT 200
        `);
      return result.rows.flatMap((row) => {
        const notification = messageEventNotificationFromSnapshot(row);
        return notification ? [notification] : [];
      });
    },
  } satisfies MessageEventSource & { start(): Promise<void>; stop(): Promise<void> };
}
