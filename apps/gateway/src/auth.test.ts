import assert from "node:assert/strict";
import test from "node:test";

import {
  hashStaffPassword,
  resolveStaffCentrexConnectionStatus,
  verifyStaffPassword,
} from "./auth.js";

test("직원 비밀번호는 scrypt 해시로 검증된다", async () => {
  const encoded = await hashStaffPassword("correct horse battery staple");

  assert.match(encoded, /^scrypt\$/);
  assert.equal(
    await verifyStaffPassword("correct horse battery staple", encoded),
    true,
  );
  assert.equal(await verifyStaffPassword("wrong password", encoded), false);
  assert.equal(encoded.includes("correct horse battery staple"), false);
});

test("알 수 없는 비밀번호 해시 형식은 거부한다", async () => {
  assert.equal(await verifyStaffPassword("password", "plain$password"), false);
});

test("직원 센트릭스 상태는 정상·연결 중·실패·오프라인을 구분한다", () => {
  const base = {
    centrexLineNumber: "07046074591",
    centrexExtension: "4591",
    requestedEndpointExists: true,
    assignedEndpointExists: true,
    assignedEndpointMatches: true,
    credentialConfigured: true,
    bridgeExists: true,
    bridgeMatches: true,
    bridgeOnline: true,
    bridgeState: "connected",
    legacyBridgeConfigured: false,
  } as const;

  assert.equal(resolveStaffCentrexConnectionStatus(base), "connected");
  assert.equal(
    resolveStaffCentrexConnectionStatus({
      ...base,
      bridgeState: "provisioning",
    }),
    "bridge_provisioning",
  );
  assert.equal(
    resolveStaffCentrexConnectionStatus({
      ...base,
      bridgeState: "failed",
    }),
    "bridge_failed",
  );
  assert.equal(
    resolveStaffCentrexConnectionStatus({
      ...base,
      bridgeOnline: false,
      bridgeState: "failed",
    }),
    "bridge_offline",
  );
});
