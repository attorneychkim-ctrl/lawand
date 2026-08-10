import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  centrexBridgeCanonicalRequest,
  verifyCentrexBridgeRequest,
} from "./centrex-bridge-auth.js";

const bridgeId = "seoul-phone-01";
const endpointId = "01980000-0000-7000-8000-000000000002";
const secret = Buffer.alloc(32, 7);
const body = Buffer.from('{"schemaVersion":1}', "utf8");
const timestamp = "1785975011";
const nonce = "AQIDBAUGBwgJCgsMDQ4PEA";

function signedHeaders(overrides: Record<string, string> = {}) {
  const canonical = centrexBridgeCanonicalRequest({
    bridgeId,
    timestamp,
    nonce,
    body,
  });
  return {
    "x-lawand-bridge-id": bridgeId,
    "x-lawand-bridge-timestamp": timestamp,
    "x-lawand-bridge-nonce": nonce,
    "x-lawand-bridge-signature": `v1=${createHmac("sha256", secret)
      .update(canonical)
      .digest("hex")}`,
    ...overrides,
  };
}

test("센트릭스 bridge HMAC 서명과 endpoint 고정을 검증한다", () => {
  const result = verifyCentrexBridgeRequest({
    headers: signedHeaders(),
    body,
    keys: { [bridgeId]: { endpointId, secret } },
    now: new Date(Number(timestamp) * 1_000),
  });
  assert.equal(result.bridgeId, bridgeId);
  assert.equal(result.endpointId, endpointId);
  assert.equal(result.authenticationNonceHash.length, 32);
});

test("본문 변조와 허용 시각 밖 요청을 거부한다", () => {
  assert.throws(
    () =>
      verifyCentrexBridgeRequest({
        headers: signedHeaders(),
        body: Buffer.from('{"schemaVersion":2}', "utf8"),
        keys: { [bridgeId]: { endpointId, secret } },
        now: new Date(Number(timestamp) * 1_000),
      }),
    { code: "invalid_signature" },
  );
  assert.throws(
    () =>
      verifyCentrexBridgeRequest({
        headers: signedHeaders(),
        body,
        keys: { [bridgeId]: { endpointId, secret } },
        now: new Date((Number(timestamp) + 301) * 1_000),
      }),
    { code: "stale_request" },
  );
});

test("받기 명령 polling은 GET 경로까지 HMAC 서명에 묶는다", () => {
  const emptyBody = Buffer.alloc(0);
  const path = "/v1/centrex-bridge/commands/next";
  const canonical = centrexBridgeCanonicalRequest({
    bridgeId,
    timestamp,
    nonce,
    body: emptyBody,
    method: "GET",
    path,
  });
  const headers = {
    "x-lawand-bridge-id": bridgeId,
    "x-lawand-bridge-timestamp": timestamp,
    "x-lawand-bridge-nonce": nonce,
    "x-lawand-bridge-signature": `v1=${createHmac("sha256", secret)
      .update(canonical)
      .digest("hex")}`,
  };
  const result = verifyCentrexBridgeRequest({
    headers,
    body: emptyBody,
    keys: { [bridgeId]: { endpointId, secret } },
    now: new Date(Number(timestamp) * 1_000),
    method: "GET",
    path,
  });
  assert.equal(result.endpointId, endpointId);
  assert.throws(
    () =>
      verifyCentrexBridgeRequest({
        headers,
        body: emptyBody,
        keys: { [bridgeId]: { endpointId, secret } },
        now: new Date(Number(timestamp) * 1_000),
        method: "GET",
        path: `${path}/tampered`,
      }),
    { code: "invalid_signature" },
  );
});
