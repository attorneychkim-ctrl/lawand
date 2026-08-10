import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseCentrexObservationLinkCandidate,
} from "./centrex-observation-link.js";

test("관측 발신은 허용 시각창 안에서 가장 가까운 클릭투콜 하나를 고른다", () => {
  const observedAt = new Date("2026-08-06T06:00:10.000Z");
  const selected = chooseCentrexObservationLinkCandidate(observedAt, [
    {
      id: "01980000-0000-7000-8000-000000000001",
      requestedAt: new Date("2026-08-06T06:00:00.000Z"),
    },
    {
      id: "01980000-0000-7000-8000-000000000002",
      requestedAt: new Date("2026-08-06T06:00:08.000Z"),
    },
  ]);

  assert.equal(selected?.id, "01980000-0000-7000-8000-000000000002");
  assert.equal(selected?.timeDeltaMs, 2_000);
});

test("관측 발신은 2분보다 오래됐거나 5초 넘게 미래인 명령과 연결하지 않는다", () => {
  const observedAt = new Date("2026-08-06T06:00:10.000Z");
  const selected = chooseCentrexObservationLinkCandidate(observedAt, [
    {
      id: "01980000-0000-7000-8000-000000000001",
      requestedAt: new Date("2026-08-06T05:58:09.999Z"),
    },
    {
      id: "01980000-0000-7000-8000-000000000002",
      requestedAt: new Date("2026-08-06T06:00:15.001Z"),
    },
  ]);

  assert.equal(selected, null);
});
