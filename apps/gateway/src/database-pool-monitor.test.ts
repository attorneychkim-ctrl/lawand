import assert from "node:assert/strict";
import test from "node:test";

import type { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import type { DatabasePool } from "@lawand/db";

import {
  createDatabasePoolMonitor,
  databasePoolState,
} from "./database-pool-monitor.js";

test("DB 풀 상태는 실제 사용·대기·사용률을 계산한다", () => {
  assert.deepEqual(
    databasePoolState(
      { totalCount: 20, idleCount: 3, waitingCount: 7 },
      20,
    ),
    {
      total: 20,
      idle: 3,
      used: 17,
      waiting: 7,
      max: 20,
      utilizationPercent: 85,
    },
  );
});

test("DB 풀 사용률은 연결 생성 중에도 100%를 넘지 않는다", () => {
  assert.equal(
    databasePoolState(
      { totalCount: 21, idleCount: 0, waitingCount: 1 },
      20,
    ).utilizationPercent,
    100,
  );
});

test("DB 풀 대기 최고값을 CloudWatch 사용자 지표로 발행한다", async () => {
  const requestPool = {
    totalCount: 20,
    idleCount: 0,
    waitingCount: 4,
  } as DatabasePool;
  const listenerPool = {
    totalCount: 3,
    idleCount: 0,
    waitingCount: 0,
  } as DatabasePool;
  let metricData: Array<{ MetricName?: string; Value?: number }> = [];
  const cloudWatchClient = {
    send: async (command: {
      input: { MetricData?: Array<{ MetricName?: string; Value?: number }> };
    }) => {
      metricData = command.input.MetricData ?? [];
      return {};
    },
  } as unknown as Pick<CloudWatchClient, "send">;
  const monitor = createDatabasePoolMonitor({
    pools: [
      { name: "request", pool: requestPool, maxConnections: 20 },
      { name: "listener", pool: listenerPool, maxConnections: 4 },
    ],
    metricsEnabled: true,
    region: "ap-northeast-2",
    sampleIntervalMs: 60_000,
    publishIntervalMs: 60_000,
    cloudWatchClient,
  });
  monitor.start();
  await monitor.publish();
  await monitor.stop();

  const waitingMetrics = metricData.filter(
    (metric) => metric.MetricName === "DatabasePoolWaitingCount",
  );
  assert.equal(waitingMetrics.length, 2);
  assert.equal(waitingMetrics[0]?.Value, 4);
  assert.equal(waitingMetrics[1]?.Value, 0);
});
