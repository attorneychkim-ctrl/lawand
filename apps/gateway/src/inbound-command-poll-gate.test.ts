import assert from "node:assert/strict";
import test from "node:test";

import { createInboundCommandPollGate } from "./inbound-command-poll-gate.js";

test("24개 bridge의 빈 폴링은 0.75초마다 DB를 조회하지 않는다", () => {
  let current = 0;
  const gate = createInboundCommandPollGate({ now: () => current });
  const bridgeIds = Array.from({ length: 24 }, (_, index) => `slot-${index}`);
  let databaseChecks = 0;

  for (let tick = 0; tick < 80; tick += 1) {
    for (const bridgeId of bridgeIds) {
      if (!gate.shouldCheckDatabase(bridgeId)) continue;
      databaseChecks += 1;
      gate.completeCheck(bridgeId, false);
    }
    current += 750;
  }

  assert.ok(databaseChecks <= 24 * 6, String(databaseChecks));
  assert.ok(databaseChecks < 24 * 80 / 10, String(databaseChecks));
});

test("받기 명령 힌트는 복구 점검 주기를 기다리지 않고 즉시 DB를 확인한다", () => {
  let current = 0;
  const gate = createInboundCommandPollGate({ now: () => current });
  assert.equal(gate.shouldCheckDatabase("slot-1"), true);
  gate.completeCheck("slot-1", false);

  current = 1_000;
  assert.equal(gate.shouldCheckDatabase("slot-1"), false);
  gate.hint("slot-1");
  assert.equal(gate.shouldCheckDatabase("slot-1"), true);
  gate.completeCheck("slot-1", true);
  assert.equal(gate.shouldCheckDatabase("slot-1"), true);

  gate.completeCheck("slot-1", false);
  assert.equal(gate.shouldCheckDatabase("slot-1"), false);
});

test("DB 확인 실패는 다음 bridge 폴링에서 바로 재시도한다", () => {
  const gate = createInboundCommandPollGate({ now: () => 0 });
  assert.equal(gate.shouldCheckDatabase("slot-1"), true);
  gate.failCheck("slot-1");
  assert.equal(gate.shouldCheckDatabase("slot-1"), true);
});
