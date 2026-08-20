import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopPairingProtection } from "./desktop-pairing-protection.js";

test("같은 일회용 연결 코드는 짧은 반복 대입을 제한한다", () => {
  let now = 1_000;
  const protection = createDesktopPairingProtection({
    hmacKey: "test-hmac-key",
    now: () => now,
    limits: {
      pairingCode: { limit: 2, windowMs: 10_000 },
      networkBurst: { limit: 100, windowMs: 10_000 },
      networkDaily: { limit: 100, windowMs: 20_000 },
    },
  });
  const input = {
    pairingCode: "a".repeat(43),
    networkAddress: "203.0.113.10",
  };

  assert.deepEqual(protection.check(input), { allowed: true });
  now += 100;
  assert.deepEqual(protection.check(input), { allowed: true });
  now += 100;
  const blocked = protection.check(input);
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.dimension, "pairing_code");

  now += 10_000;
  assert.deepEqual(protection.check(input), { allowed: true });
});

test("연결 코드를 바꿔도 같은 네트워크의 반복 요청은 제한한다", () => {
  const limited: string[] = [];
  const protection = createDesktopPairingProtection({
    hmacKey: "test-hmac-key",
    limits: {
      pairingCode: { limit: 100, windowMs: 60_000 },
      networkBurst: { limit: 2, windowMs: 60_000 },
      networkDaily: { limit: 100, windowMs: 600_000 },
    },
    onLimited: ({ dimension }) => limited.push(dimension),
  });

  for (let index = 0; index < 2; index += 1) {
    assert.deepEqual(
      protection.check({
        pairingCode: `${index}`.repeat(43),
        networkAddress: "203.0.113.20",
      }),
      { allowed: true },
    );
  }
  const blocked = protection.check({
    pairingCode: "z".repeat(43),
    networkAddress: "203.0.113.20",
  });
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.dimension, "network");
  assert.deepEqual(limited, ["network"]);

  assert.deepEqual(
    protection.check({
      pairingCode: "y".repeat(43),
      networkAddress: "203.0.113.21",
    }),
    { allowed: true },
  );
});
