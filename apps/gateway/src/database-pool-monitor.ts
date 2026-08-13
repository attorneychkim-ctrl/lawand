import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import type { DatabasePool } from "@lawand/db";

type MonitoredPool = {
  name: "request" | "listener";
  pool: DatabasePool;
  maxConnections: number;
};

export type DatabasePoolState = {
  total: number;
  idle: number;
  used: number;
  waiting: number;
  max: number;
  utilizationPercent: number;
};

export function databasePoolState(
  pool: Pick<DatabasePool, "totalCount" | "idleCount" | "waitingCount">,
  maxConnections: number,
): DatabasePoolState {
  const used = Math.max(0, pool.totalCount - pool.idleCount);
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    used,
    waiting: pool.waitingCount,
    max: maxConnections,
    utilizationPercent: Math.min(100, used / maxConnections * 100),
  };
}

export function createDatabasePoolMonitor(options: {
  pools: readonly MonitoredPool[];
  metricsEnabled: boolean;
  region: string;
  sampleIntervalMs?: number;
  publishIntervalMs?: number;
  cloudWatchClient?: Pick<CloudWatchClient, "send">;
}) {
  const sampleIntervalMs = options.sampleIntervalMs ?? 1_000;
  const publishIntervalMs = options.publishIntervalMs ?? 60_000;
  const cloudWatchClient = options.metricsEnabled
    ? options.cloudWatchClient ?? new CloudWatchClient({ region: options.region })
    : null;
  const peaks = new Map(
    options.pools.map(({ name }) => [
      name,
      { waiting: 0, utilizationPercent: 0, used: 0 },
    ]),
  );
  const waitingIncidents = new Set<MonitoredPool["name"]>();
  let sampleTimer: NodeJS.Timeout | null = null;
  let publishTimer: NodeJS.Timeout | null = null;
  let publishing: Promise<void> | null = null;

  function snapshot() {
    return Object.fromEntries(
      options.pools.map(({ name, pool, maxConnections }) => [
        name,
        databasePoolState(pool, maxConnections),
      ]),
    ) as Record<MonitoredPool["name"], DatabasePoolState>;
  }

  function sample() {
    const occurredAt = new Date().toISOString();
    for (const { name, pool, maxConnections } of options.pools) {
      const state = databasePoolState(pool, maxConnections);
      const peak = peaks.get(name)!;
      peak.waiting = Math.max(peak.waiting, state.waiting);
      peak.used = Math.max(peak.used, state.used);
      peak.utilizationPercent = Math.max(
        peak.utilizationPercent,
        state.utilizationPercent,
      );
      if (state.waiting > 0 && !waitingIncidents.has(name)) {
        waitingIncidents.add(name);
        console.warn(
          JSON.stringify({
            event: "database_pool_waiting",
            pool: name,
            waiting: state.waiting,
            used: state.used,
            max: state.max,
            occurredAt,
          }),
        );
      } else if (state.waiting === 0 && waitingIncidents.delete(name)) {
        console.info(
          JSON.stringify({
            event: "database_pool_recovered",
            pool: name,
            occurredAt,
          }),
        );
      }
    }
  }

  async function publish() {
    if (!cloudWatchClient || publishing) return publishing;
    const captured = new Map(
      [...peaks].map(([name, peak]) => [name, { ...peak }]),
    );
    for (const peak of peaks.values()) {
      peak.waiting = 0;
      peak.used = 0;
      peak.utilizationPercent = 0;
    }
    const timestamp = new Date();
    publishing = cloudWatchClient
      .send(
        new PutMetricDataCommand({
          Namespace: "Lawand/Gateway",
          MetricData: options.pools.flatMap(({ name }) => {
            const peak = captured.get(name)!;
            const dimensions = [
              { Name: "Service", Value: "lawand-gateway" },
              { Name: "Pool", Value: name },
            ];
            return [
              {
                MetricName: "DatabasePoolWaitingCount",
                Dimensions: dimensions,
                Timestamp: timestamp,
                Unit: "Count" as const,
                Value: peak.waiting,
              },
              {
                MetricName: "DatabasePoolUsedConnections",
                Dimensions: dimensions,
                Timestamp: timestamp,
                Unit: "Count" as const,
                Value: peak.used,
              },
              {
                MetricName: "DatabasePoolUtilization",
                Dimensions: dimensions,
                Timestamp: timestamp,
                Unit: "Percent" as const,
                Value: peak.utilizationPercent,
              },
            ];
          }),
        }),
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        for (const [name, capturedPeak] of captured) {
          const peak = peaks.get(name)!;
          peak.waiting = Math.max(peak.waiting, capturedPeak.waiting);
          peak.used = Math.max(peak.used, capturedPeak.used);
          peak.utilizationPercent = Math.max(
            peak.utilizationPercent,
            capturedPeak.utilizationPercent,
          );
        }
        console.error(
          JSON.stringify({
            event: "database_pool_metrics_publish_failed",
            errorName:
              error instanceof Error ? error.name : "unknown_error",
            occurredAt: new Date().toISOString(),
          }),
        );
      })
      .finally(() => {
        publishing = null;
      });
    return publishing;
  }

  function start() {
    if (sampleTimer) return;
    sample();
    sampleTimer = setInterval(sample, sampleIntervalMs);
    sampleTimer.unref();
    if (cloudWatchClient) {
      publishTimer = setInterval(() => void publish(), publishIntervalMs);
      publishTimer.unref();
    }
  }

  async function stop() {
    if (sampleTimer) clearInterval(sampleTimer);
    if (publishTimer) clearInterval(publishTimer);
    sampleTimer = null;
    publishTimer = null;
    await publishing;
  }

  return { start, stop, snapshot, publish };
}
