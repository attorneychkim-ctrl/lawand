import { randomUUID } from "node:crypto";

import {
  CloudWatchClient,
  PutMetricDataCommand,
  type MetricDatum,
} from "@aws-sdk/client-cloudwatch";

const DEFAULT_DELIVERY_TTL_MS = 10 * 60_000;
const DEFAULT_MAX_DELIVERIES = 10_000;
const DEFAULT_MAX_SAMPLES = 5_000;
const DEFAULT_PUBLISH_INTERVAL_MS = 60_000;
const DEFAULT_SLOW_THRESHOLD_MS = 2_000;
const MAX_CLIENT_ELAPSED_MS = 5 * 60_000;
const CLOUDWATCH_VALUES_PER_DATUM = 150;
const CLOUDWATCH_DATUMS_PER_REQUEST = 1_000;

const measuredEventTypes = new Set<TelephonyRealtimeEventType>([
  "observed_call.changed",
  "click_to_call.changed",
  "click_to_call.linked",
  "call_activity.changed",
]);
const callStates = new Set<TelephonyRealtimeCallState>([
  "ringing",
  "connected",
  "transferring",
  "needs_confirmation",
  "ended",
  "pending",
  "failed",
  "unknown",
]);
const displayModes = new Set<TelephonyRealtimeDisplayMode>([
  "phone_desk",
  "notification",
  "snapshot",
]);

export type TelephonyRealtimeEventType =
  | "observed_call.changed"
  | "click_to_call.changed"
  | "click_to_call.linked"
  | "call_activity.changed"
  | "aftercare.changed"
  | "follow_up.changed";

export type TelephonyRealtimeCallState =
  | "ringing"
  | "connected"
  | "transferring"
  | "needs_confirmation"
  | "ended"
  | "pending"
  | "failed"
  | "unknown";

export type TelephonyRealtimeDisplayMode =
  | "phone_desk"
  | "notification"
  | "snapshot";

export type TelephonyRealtimeDelivery = {
  deliveryId: string;
  gatewaySentAt: string;
};

export type TelephonyRealtimeAck = {
  deliveryId: string;
  clientElapsedMs: number;
  callState: TelephonyRealtimeCallState;
  displayMode: TelephonyRealtimeDisplayMode;
};

type DeliveryRecord = {
  deliveryId: string;
  eventType: TelephonyRealtimeEventType;
  entityId: string;
  direction: "inbound" | "outbound";
  occurredAt: Date;
  gatewaySentAt: Date;
  expiresAt: number;
  acknowledgedAt: Date | null;
};

type LatencySample = {
  eventType: TelephonyRealtimeEventType;
  direction: "inbound" | "outbound";
  callState: TelephonyRealtimeCallState;
  displayMode: TelephonyRealtimeDisplayMode;
  eventToGatewayMs: number;
  gatewayToBrowserMs: number;
  eventToBrowserMs: number;
  browserProcessingMs: number;
};

type MetricKey = Pick<
  LatencySample,
  "eventType" | "direction" | "callState" | "displayMode"
>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedLatency(later: Date, earlier: Date) {
  return Math.min(
    24 * 60 * 60_000,
    Math.max(0, later.getTime() - earlier.getTime()),
  );
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index] ?? 0;
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

function latencySummary(values: number[]) {
  return {
    p50Ms: rounded(percentile(values, 0.5)),
    p95Ms: rounded(percentile(values, 0.95)),
    maxMs: rounded(Math.max(...values)),
  };
}

function metricKey(input: MetricKey) {
  return [
    input.eventType,
    input.direction,
    input.callState,
    input.displayMode,
  ].join("|");
}

export function parseTelephonyRealtimeAck(
  value: unknown,
): TelephonyRealtimeAck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 4 ||
    !keys.every((key) =>
      ["deliveryId", "clientElapsedMs", "callState", "displayMode"].includes(
        key,
      ),
    ) ||
    typeof record.deliveryId !== "string" ||
    !uuidPattern.test(record.deliveryId) ||
    typeof record.clientElapsedMs !== "number" ||
    !Number.isFinite(record.clientElapsedMs) ||
    record.clientElapsedMs < 0 ||
    record.clientElapsedMs > MAX_CLIENT_ELAPSED_MS ||
    typeof record.callState !== "string" ||
    !callStates.has(record.callState as TelephonyRealtimeCallState) ||
    typeof record.displayMode !== "string" ||
    !displayModes.has(record.displayMode as TelephonyRealtimeDisplayMode)
  ) {
    return null;
  }
  return {
    deliveryId: record.deliveryId,
    clientElapsedMs: record.clientElapsedMs,
    callState: record.callState as TelephonyRealtimeCallState,
    displayMode: record.displayMode as TelephonyRealtimeDisplayMode,
  };
}

function metricData(samples: LatencySample[], timestamp: Date): MetricDatum[] {
  const grouped = new Map<
    string,
    { key: MetricKey; samples: LatencySample[] }
  >();
  for (const sample of samples) {
    const key = metricKey(sample);
    const current = grouped.get(key);
    if (current) current.samples.push(sample);
    else grouped.set(key, { key: sample, samples: [sample] });
  }

  const definitions = [
    ["TelephonyEventToGatewaySseLatency", "eventToGatewayMs"],
    ["TelephonyGatewaySseToBrowserReadyLatency", "gatewayToBrowserMs"],
    ["TelephonyEventToBrowserReadyLatency", "eventToBrowserMs"],
    ["TelephonyBrowserProcessingLatency", "browserProcessingMs"],
  ] as const;
  const result: MetricDatum[] = [];
  for (const { key, samples: groupSamples } of grouped.values()) {
    const dimensions = [
      { Name: "Service", Value: "lawand-gateway" },
      { Name: "EventType", Value: key.eventType },
      { Name: "Direction", Value: key.direction },
      { Name: "CallState", Value: key.callState },
      { Name: "DisplayMode", Value: key.displayMode },
    ];
    for (const [name, field] of definitions) {
      const values = groupSamples.map((sample) => rounded(sample[field]));
      for (
        let offset = 0;
        offset < values.length;
        offset += CLOUDWATCH_VALUES_PER_DATUM
      ) {
        result.push({
          MetricName: name,
          Dimensions: dimensions,
          Timestamp: timestamp,
          Unit: "Milliseconds",
          Values: values.slice(offset, offset + CLOUDWATCH_VALUES_PER_DATUM),
        });
      }
    }
  }
  return result;
}

export function createTelephonyRealtimeMonitor(options: {
  metricsEnabled: boolean;
  region: string;
  publishIntervalMs?: number;
  deliveryTtlMs?: number;
  maxDeliveries?: number;
  maxSamples?: number;
  slowThresholdMs?: number;
  cloudWatchClient?: Pick<CloudWatchClient, "send">;
  now?: () => Date;
  createId?: () => string;
}) {
  const publishIntervalMs =
    options.publishIntervalMs ?? DEFAULT_PUBLISH_INTERVAL_MS;
  const deliveryTtlMs = options.deliveryTtlMs ?? DEFAULT_DELIVERY_TTL_MS;
  const maxDeliveries = options.maxDeliveries ?? DEFAULT_MAX_DELIVERIES;
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
  const slowThresholdMs =
    options.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS;
  const cloudWatchClient = options.metricsEnabled
    ? options.cloudWatchClient ?? new CloudWatchClient({ region: options.region })
    : null;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const deliveries = new Map<string, DeliveryRecord>();
  const warnedEvents = new Map<string, number>();
  let samples: LatencySample[] = [];
  let droppedSamples = 0;
  let publishTimer: NodeJS.Timeout | null = null;
  let publishing: Promise<void> | null = null;

  function cleanup(current: number) {
    for (const [deliveryId, delivery] of deliveries) {
      if (delivery.expiresAt > current) break;
      deliveries.delete(deliveryId);
    }
    for (const [key, expiresAt] of warnedEvents) {
      if (expiresAt > current) break;
      warnedEvents.delete(key);
    }
    while (deliveries.size >= maxDeliveries) {
      const oldest = deliveries.keys().next().value as string | undefined;
      if (!oldest) break;
      deliveries.delete(oldest);
    }
  }

  function createDelivery(input: {
    eventType: TelephonyRealtimeEventType;
    entityId: string;
    direction: "inbound" | "outbound";
    occurredAt: string;
  }): TelephonyRealtimeDelivery | null {
    if (!measuredEventTypes.has(input.eventType)) return null;
    const occurredAt = new Date(input.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return null;
    const gatewaySentAt = now();
    const deliveryId = createId();
    cleanup(gatewaySentAt.getTime());
    deliveries.set(deliveryId, {
      deliveryId,
      eventType: input.eventType,
      entityId: input.entityId,
      direction: input.direction,
      occurredAt,
      gatewaySentAt,
      expiresAt: gatewaySentAt.getTime() + deliveryTtlMs,
      acknowledgedAt: null,
    });
    return {
      deliveryId,
      gatewaySentAt: gatewaySentAt.toISOString(),
    };
  }

  function acknowledge(input: TelephonyRealtimeAck) {
    const acknowledgedAt = now();
    cleanup(acknowledgedAt.getTime());
    const delivery = deliveries.get(input.deliveryId);
    if (!delivery || delivery.expiresAt <= acknowledgedAt.getTime()) {
      return { status: "expired" as const };
    }
    if (delivery.acknowledgedAt) return { status: "replayed" as const };
    delivery.acknowledgedAt = acknowledgedAt;
    const sample: LatencySample = {
      eventType: delivery.eventType,
      direction: delivery.direction,
      callState: input.callState,
      displayMode: input.displayMode,
      eventToGatewayMs: boundedLatency(
        delivery.gatewaySentAt,
        delivery.occurredAt,
      ),
      gatewayToBrowserMs: boundedLatency(
        acknowledgedAt,
        delivery.gatewaySentAt,
      ),
      eventToBrowserMs: boundedLatency(acknowledgedAt, delivery.occurredAt),
      browserProcessingMs: input.clientElapsedMs,
    };
    if (samples.length >= maxSamples) {
      samples.shift();
      droppedSamples += 1;
    }
    samples.push(sample);

    const warningKey = [
      delivery.eventType,
      delivery.entityId,
      delivery.occurredAt.toISOString(),
    ].join(":");
    if (
      sample.eventToBrowserMs >= slowThresholdMs &&
      !warnedEvents.has(warningKey)
    ) {
      warnedEvents.set(warningKey, delivery.expiresAt);
      console.warn(
        JSON.stringify({
          event: "telephony_realtime_latency_slow",
          eventType: sample.eventType,
          direction: sample.direction,
          callState: sample.callState,
          displayMode: sample.displayMode,
          eventToGatewayMs: rounded(sample.eventToGatewayMs),
          gatewayToBrowserMs: rounded(sample.gatewayToBrowserMs),
          eventToBrowserMs: rounded(sample.eventToBrowserMs),
          browserProcessingMs: rounded(sample.browserProcessingMs),
          occurredAt: acknowledgedAt.toISOString(),
        }),
      );
    }
    return { status: "recorded" as const };
  }

  async function publish() {
    if (publishing) return publishing;
    const captured = samples;
    const capturedDropped = droppedSamples;
    samples = [];
    droppedSamples = 0;
    if (captured.length === 0 && capturedDropped === 0) return;

    const timestamp = now();
    const grouped = new Map<
      string,
      { key: MetricKey; samples: LatencySample[] }
    >();
    for (const sample of captured) {
      const key = metricKey(sample);
      const current = grouped.get(key);
      if (current) current.samples.push(sample);
      else grouped.set(key, { key: sample, samples: [sample] });
    }
    for (const { key, samples: groupSamples } of grouped.values()) {
      const eventToGateway = latencySummary(
        groupSamples.map((sample) => sample.eventToGatewayMs),
      );
      const gatewayToBrowser = latencySummary(
        groupSamples.map((sample) => sample.gatewayToBrowserMs),
      );
      const eventToBrowser = latencySummary(
        groupSamples.map((sample) => sample.eventToBrowserMs),
      );
      const browserProcessing = latencySummary(
        groupSamples.map((sample) => sample.browserProcessingMs),
      );
      console.info(
        JSON.stringify({
          event: "telephony_realtime_latency_summary",
          eventType: key.eventType,
          direction: key.direction,
          callState: key.callState,
          displayMode: key.displayMode,
          samples: groupSamples.length,
          eventToGatewayP50Ms: eventToGateway.p50Ms,
          eventToGatewayP95Ms: eventToGateway.p95Ms,
          eventToGatewayMaxMs: eventToGateway.maxMs,
          gatewayToBrowserP50Ms: gatewayToBrowser.p50Ms,
          gatewayToBrowserP95Ms: gatewayToBrowser.p95Ms,
          gatewayToBrowserMaxMs: gatewayToBrowser.maxMs,
          eventToBrowserP50Ms: eventToBrowser.p50Ms,
          eventToBrowserP95Ms: eventToBrowser.p95Ms,
          eventToBrowserMaxMs: eventToBrowser.maxMs,
          browserProcessingP50Ms: browserProcessing.p50Ms,
          browserProcessingP95Ms: browserProcessing.p95Ms,
          browserProcessingMaxMs: browserProcessing.maxMs,
          droppedSamples: capturedDropped,
          occurredAt: timestamp.toISOString(),
        }),
      );
    }

    if (!cloudWatchClient || captured.length === 0) return;
    const data = metricData(captured, timestamp);
    publishing = (async () => {
      for (
        let offset = 0;
        offset < data.length;
        offset += CLOUDWATCH_DATUMS_PER_REQUEST
      ) {
        await cloudWatchClient.send(
          new PutMetricDataCommand({
            Namespace: "Lawand/Gateway",
            MetricData: data.slice(
              offset,
              offset + CLOUDWATCH_DATUMS_PER_REQUEST,
            ),
          }),
        );
      }
    })()
      .catch((error: unknown) => {
        console.error(
          JSON.stringify({
            event: "telephony_realtime_metrics_publish_failed",
            errorName: error instanceof Error ? error.name : "unknown_error",
            samples: captured.length,
            occurredAt: now().toISOString(),
          }),
        );
      })
      .finally(() => {
        publishing = null;
      });
    return publishing;
  }

  function start() {
    if (publishTimer) return;
    publishTimer = setInterval(() => void publish(), publishIntervalMs);
    publishTimer.unref();
  }

  async function stop() {
    if (publishTimer) clearInterval(publishTimer);
    publishTimer = null;
    await publish();
    await publishing;
  }

  return { createDelivery, acknowledge, start, stop, publish };
}

export type TelephonyRealtimeMonitor = ReturnType<
  typeof createTelephonyRealtimeMonitor
>;
