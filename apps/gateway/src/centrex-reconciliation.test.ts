import assert from "node:assert/strict";
import test from "node:test";

import type { CentrexCallHistoryRecord } from "./centrex.js";
import {
  centrexDestinationMatches,
  matchCentrexCallHistory,
  parseCentrexHistoryTime,
} from "./centrex-reconciliation.js";

function record(
  overrides: Partial<CentrexCallHistoryRecord> = {},
): CentrexCallHistoryRecord {
  return {
    number: "1",
    time: "2026-08-05 15:11:02",
    source: "0704607****",
    destination: "0104908****",
    durationSeconds: 22,
    billableSeconds: 16,
    status: "OK",
    kind: "OUT",
    ...overrides,
  };
}

test("센트릭스 한국 시간과 마스킹된 수신번호를 안전하게 비교한다", () => {
  assert.equal(
    parseCentrexHistoryTime("2026-08-05 15:11:02")?.toISOString(),
    "2026-08-05T06:11:02.000Z",
  );
  assert.equal(
    centrexDestinationMatches("010-4908-****", "01049081234"),
    true,
  );
  assert.equal(
    centrexDestinationMatches("010-4908-****", "01077771234"),
    false,
  );
});

test("요청 시각에 가장 가까운 종료 통화를 매칭하고 연결 시간을 보존한다", () => {
  const match = matchCentrexCallHistory({
    records: [
      record({ time: "2026-08-05 15:06:00", durationSeconds: 56 }),
      record(),
    ],
    destination: "01049081234",
    requestedAt: new Date("2026-08-05T06:11:00.000Z"),
    currentTime: new Date("2026-08-05T06:12:00.000Z"),
    usedStartedAt: new Set(),
  });

  assert.equal(match?.outcome, "answered");
  assert.equal(match?.startedAt.toISOString(), "2026-08-05T06:11:02.000Z");
  assert.equal(match?.endedAt.toISOString(), "2026-08-05T06:11:24.000Z");
  assert.equal(match?.record.billableSeconds, 16);
});

test("이미 사용한 이력과 아직 안정화되지 않은 0초 실패는 매칭하지 않는다", () => {
  const failed = record({
    time: "2026-08-05 15:13:00",
    durationSeconds: 0,
    billableSeconds: 0,
    status: "FAIL",
  });
  const base = {
    records: [failed],
    destination: "01049081234",
    requestedAt: new Date("2026-08-05T06:13:00.000Z"),
  };

  assert.equal(
    matchCentrexCallHistory({
      ...base,
      currentTime: new Date("2026-08-05T06:13:06.000Z"),
      usedStartedAt: new Set(),
    }),
    null,
  );
  assert.equal(
    matchCentrexCallHistory({
      ...base,
      currentTime: new Date("2026-08-05T06:13:10.000Z"),
      usedStartedAt: new Set(["2026-08-05T06:13:00.000Z"]),
    }),
    null,
  );
  assert.equal(
    matchCentrexCallHistory({
      ...base,
      currentTime: new Date("2026-08-05T06:13:10.000Z"),
      usedStartedAt: new Set(),
    })?.outcome,
    "failed",
  );
});
