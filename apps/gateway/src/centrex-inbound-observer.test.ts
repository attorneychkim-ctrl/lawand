import assert from "node:assert/strict";
import test from "node:test";

import { selectCentrexSyntheticInboundCall } from "./centrex-bridge-service.js";
import {
  normalizeCentrexInboundHistoryTimeline,
  reconcileCentrexInboundHistoryBatch,
} from "./centrex-inbound-observer.js";

test("늦은 bridge 수신은 같은 시각의 종료된 U+ 이력 원장을 재사용한다", () => {
  const history = {
    id: "history-call",
    bridgeId: "uplus-inbound-history",
    ringingAt: new Date("2026-08-12T01:12:06.000Z"),
    endedAt: new Date("2026-08-12T01:12:19.000Z"),
  };
  assert.equal(
    selectCentrexSyntheticInboundCall(
      new Date("2026-08-12T01:12:06.231Z"),
      [history],
    ),
    history,
  );
});

test("시간 근거가 멀거나 후보가 둘이면 늦은 수신을 임의 병합하지 않는다", () => {
  const eventAt = new Date("2026-08-12T01:12:06.231Z");
  const exact = {
    bridgeId: "uplus-ring-callback",
    ringingAt: new Date("2026-08-12T01:12:06.000Z"),
    endedAt: null,
  };
  assert.equal(
    selectCentrexSyntheticInboundCall(eventAt, [
      exact,
      { ...exact, bridgeId: "uplus-inbound-history" },
    ]),
    null,
  );
  assert.equal(
    selectCentrexSyntheticInboundCall(eventAt, [
      {
        ...exact,
        ringingAt: new Date("2026-08-12T01:12:12.000Z"),
      },
    ]),
    null,
  );
  assert.equal(
    selectCentrexSyntheticInboundCall(eventAt, [
      {
        ...exact,
        endedAt: new Date("2026-08-12T01:12:05.000Z"),
      },
    ]),
    null,
  );
});

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
