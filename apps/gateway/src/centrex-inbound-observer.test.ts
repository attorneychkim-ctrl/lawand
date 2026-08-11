import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCentrexInboundHistoryTimeline,
  reconcileCentrexInboundHistoryBatch,
} from "./centrex-inbound-observer.js";

test("U+ 초 단위 시작 시각이 콜백보다 앞서도 유효한 수신 시간축으로 정규화한다", () => {
  const timeline = normalizeCentrexInboundHistoryTimeline({
    currentRingingAt: new Date("2026-08-11T02:35:32.470Z"),
    currentConnectedAt: null,
    providerStartedAt: new Date("2026-08-11T02:35:32.000Z"),
    providerEndedAt: new Date("2026-08-11T02:36:08.000Z"),
    providerAnswered: true,
  });

  assert.equal(timeline.ringingAt.toISOString(), "2026-08-11T02:35:32.000Z");
  assert.equal(
    timeline.connectedAt?.toISOString(),
    "2026-08-11T02:35:32.470Z",
  );
  assert.equal(timeline.endedAt.toISOString(), "2026-08-11T02:36:08.000Z");
  assert.ok(timeline.connectedAt >= timeline.ringingAt);
  assert.ok(timeline.endedAt >= timeline.connectedAt);
  assert.equal(
    Math.round(
      (timeline.endedAt.getTime() - timeline.connectedAt.getTime()) / 1_000,
    ),
    36,
  );
});

test("bridge가 관측한 연결 시각은 U+ 종료 이력보다 우선해 보존한다", () => {
  const timeline = normalizeCentrexInboundHistoryTimeline({
    currentRingingAt: new Date("2026-08-11T02:35:32.470Z"),
    currentConnectedAt: new Date("2026-08-11T02:35:35.250Z"),
    providerStartedAt: new Date("2026-08-11T02:35:32.000Z"),
    providerEndedAt: new Date("2026-08-11T02:36:08.000Z"),
    providerAnswered: true,
  });

  assert.equal(timeline.ringingAt.toISOString(), "2026-08-11T02:35:32.000Z");
  assert.equal(
    timeline.connectedAt?.toISOString(),
    "2026-08-11T02:35:35.250Z",
  );
  assert.equal(timeline.endedAt.toISOString(), "2026-08-11T02:36:08.000Z");
});

test("한 수신 이력의 실패가 같은 회선의 다음 이력 처리를 막지 않는다", async () => {
  const processed: number[] = [];
  const failures: number[] = [];
  const result = await reconcileCentrexInboundHistoryBatch(
    [1, 2, 3],
    async (record) => {
      processed.push(record);
      if (record === 2) throw new Error("database_check_violation");
      return record === 3;
    },
    (_error, record) => failures.push(record),
  );

  assert.deepEqual(processed, [1, 2, 3]);
  assert.deepEqual(failures, [2]);
  assert.deepEqual(result, { reconciled: 1, failed: 1 });
});
