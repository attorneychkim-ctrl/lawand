import assert from "node:assert/strict";
import test from "node:test";

import { createSingleFlight } from "./single-flight.js";

test("같은 키의 동시 요청은 작업을 한 번만 실행한다", async () => {
  const singleFlight = createSingleFlight();
  let calls = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operation = async () => {
    calls += 1;
    await barrier;
    return { snapshotAt: "2026-08-13T00:00:00.000Z" };
  };

  const requests = Array.from({ length: 20 }, () =>
    singleFlight.run("staff-session:telephony", operation),
  );
  assert.equal(calls, 1);
  release();
  const results = await Promise.all(requests);
  assert.equal(calls, 1);
  assert.equal(new Set(results).size, 1);
});

test("완료되거나 실패한 작업은 다음 요청에서 다시 실행한다", async () => {
  const singleFlight = createSingleFlight();
  let calls = 0;
  const operation = async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary");
    return calls;
  };

  await assert.rejects(singleFlight.run("key", operation), /temporary/);
  assert.equal(await singleFlight.run("key", operation), 2);
});
