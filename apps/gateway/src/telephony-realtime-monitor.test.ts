import assert from "node:assert/strict";
import test from "node:test";

import type { CloudWatchClient } from "@aws-sdk/client-cloudwatch";

import {
  createTelephonyRealtimeMonitor,
  parseTelephonyRealtimeAck,
} from "./telephony-realtime-monitor.js";

const deliveryId = "019fa6a4-6834-7782-aa0b-4e71ffb8a301";

test("브라우저 지연 ACK는 허용된 비식별 필드만 받는다", () => {
  assert.deepEqual(
    parseTelephonyRealtimeAck({
      deliveryId,
      clientElapsedMs: 125.5,
      callState: "ringing",
      displayMode: "notification",
    }),
    {
      deliveryId,
      clientElapsedMs: 125.5,
      callState: "ringing",
      displayMode: "notification",
    },
  );
  assert.equal(
    parseTelephonyRealtimeAck({
      deliveryId,
      clientElapsedMs: 125.5,
      callState: "ringing",
      displayMode: "notification",
      remotePhone: "01012345678",
    }),
    null,
  );
  assert.equal(
    parseTelephonyRealtimeAck({
      deliveryId,
      clientElapsedMs: -1,
      callState: "ringing",
      displayMode: "notification",
    }),
    null,
  );
});

test("gateway SSE부터 브라우저 준비까지의 원시 지연값을 CloudWatch에 묶어 보낸다", async () => {
  let current = new Date("2026-08-14T01:00:00.200Z");
  const published: Array<{
    MetricName?: string;
    Values?: number[];
  }> = [];
  const cloudWatchClient = {
    send: async (command: {
      input: {
        MetricData?: Array<{ MetricName?: string; Values?: number[] }>;
      };
    }) => {
      published.push(...(command.input.MetricData ?? []));
      return {};
    },
  } as unknown as Pick<CloudWatchClient, "send">;
  const monitor = createTelephonyRealtimeMonitor({
    metricsEnabled: true,
    region: "ap-northeast-2",
    cloudWatchClient,
    now: () => current,
    createId: () => deliveryId,
  });
  const delivery = monitor.createDelivery({
    eventType: "call_activity.changed",
    entityId: "019fa6a4-6834-7782-aa0b-4e71ffb8a302",
    direction: "inbound",
    occurredAt: "2026-08-14T01:00:00.000Z",
  });
  assert.deepEqual(delivery, {
    deliveryId,
    gatewaySentAt: "2026-08-14T01:00:00.200Z",
  });

  current = new Date("2026-08-14T01:00:00.500Z");
  assert.deepEqual(
    monitor.acknowledge({
      deliveryId,
      clientElapsedMs: 180,
      callState: "ringing",
      displayMode: "notification",
    }),
    { status: "recorded" },
  );
  assert.deepEqual(
    monitor.acknowledge({
      deliveryId,
      clientElapsedMs: 190,
      callState: "ringing",
      displayMode: "notification",
    }),
    { status: "replayed" },
  );
  await monitor.publish();

  const values = new Map(
    published.map((metric) => [metric.MetricName, metric.Values]),
  );
  assert.deepEqual(values.get("TelephonyEventToGatewaySseLatency"), [200]);
  assert.deepEqual(
    values.get("TelephonyGatewaySseToBrowserReadyLatency"),
    [300],
  );
  assert.deepEqual(values.get("TelephonyEventToBrowserReadyLatency"), [500]);
  assert.deepEqual(values.get("TelephonyBrowserProcessingLatency"), [180]);
});

test("전화 후처리 변경은 실시간 통화 지연 표본을 만들지 않는다", () => {
  const monitor = createTelephonyRealtimeMonitor({
    metricsEnabled: false,
    region: "ap-northeast-2",
    createId: () => deliveryId,
  });
  assert.equal(
    monitor.createDelivery({
      eventType: "aftercare.changed",
      entityId: "019fa6a4-6834-7782-aa0b-4e71ffb8a302",
      direction: "inbound",
      occurredAt: "2026-08-14T01:00:00.000Z",
    }),
    null,
  );
});
