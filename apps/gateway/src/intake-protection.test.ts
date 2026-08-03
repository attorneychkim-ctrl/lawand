import assert from "node:assert/strict";
import test from "node:test";

import { createPublicIntakeProtection } from "./intake-protection.js";

const clientKey = "a".repeat(43);

test("같은 idempotency key의 정상 재시도는 전화·네트워크 한도를 추가 소비하지 않는다", () => {
  let now = 1_000;
  const protection = createPublicIntakeProtection({
    hmacKey: "test-hmac-key",
    now: () => now,
    limits: {
      idempotentReplay: { limit: 3, windowMs: 10_000 },
      phoneBurst: { limit: 1, windowMs: 10_000 },
      phoneDaily: { limit: 1, windowMs: 20_000 },
      networkBurst: { limit: 1, windowMs: 10_000 },
      networkDaily: { limit: 1, windowMs: 20_000 },
    },
  });
  const submission = {
    clientKey,
    idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
    phone: "01012345678",
  };

  assert.deepEqual(protection.check(submission), { allowed: true });
  now += 100;
  assert.deepEqual(protection.check(submission), { allowed: true });
  now += 100;
  assert.deepEqual(protection.check(submission), { allowed: true });
  now += 100;
  assert.deepEqual(protection.check(submission), { allowed: true });

  now += 100;
  const blocked = protection.check(submission);
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    assert.equal(blocked.dimension, "idempotent_replay");
    assert.ok(blocked.retryAfterSeconds > 0);
  }
});

test("새 접수키를 반복하는 같은 전화번호만 제한하고 다른 전화번호는 허용한다", () => {
  let now = 10_000;
  const protection = createPublicIntakeProtection({
    hmacKey: "test-hmac-key",
    now: () => now,
    limits: {
      phoneBurst: { limit: 2, windowMs: 60_000 },
      phoneDaily: { limit: 10, windowMs: 600_000 },
      networkBurst: { limit: 100, windowMs: 60_000 },
      networkDaily: { limit: 100, windowMs: 600_000 },
    },
  });

  for (let index = 0; index < 2; index += 1) {
    assert.deepEqual(
      protection.check({
        clientKey,
        idempotencyKey: `01984c7d-8500-7000-8000-00000000000${index}`,
        phone: "01012345678",
      }),
      { allowed: true },
    );
    now += 1_000;
  }

  const blocked = protection.check({
    clientKey,
    idempotencyKey: "01984c7d-8500-7000-8000-000000000009",
    phone: "01012345678",
  });
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    assert.equal(blocked.dimension, "phone");
  }

  assert.deepEqual(
    protection.check({
      clientKey,
      idempotencyKey: "01984c7d-8500-7000-8000-000000000010",
      phone: "01087654321",
    }),
    { allowed: true },
  );
});

test("네트워크 키가 없거나 올바르지 않아도 전화번호 기준 방어는 유지한다", () => {
  const protection = createPublicIntakeProtection({
    hmacKey: "test-hmac-key",
    limits: {
      phoneBurst: { limit: 1, windowMs: 60_000 },
      phoneDaily: { limit: 10, windowMs: 600_000 },
    },
  });

  assert.deepEqual(
    protection.check({
      clientKey: null,
      idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
      phone: "01012345678",
    }),
    { allowed: true },
  );
  const blocked = protection.check({
    clientKey: "raw-ip-must-not-be-accepted",
    idempotencyKey: "01984c7d-8500-7000-8000-000000000002",
    phone: "01012345678",
  });
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    assert.equal(blocked.dimension, "phone");
  }
});

test("카카오 홈페이지 진입은 가짜 전화번호 없이 멱등키와 네트워크로 제한한다", () => {
  const protection = createPublicIntakeProtection({
    hmacKey: "test-hmac-key",
    limits: {
      networkBurst: { limit: 1, windowMs: 60_000 },
      networkDaily: { limit: 10, windowMs: 600_000 },
    },
  });
  const first = {
    clientKey,
    idempotencyKey: "01984c7d-8500-7000-8000-000000000101",
  };
  assert.deepEqual(protection.checkKakaoEntry(first), { allowed: true });
  assert.deepEqual(protection.checkKakaoEntry(first), { allowed: true });

  const blocked = protection.checkKakaoEntry({
    clientKey,
    idempotencyKey: "01984c7d-8500-7000-8000-000000000102",
  });
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    assert.equal(blocked.dimension, "network");
  }
});
