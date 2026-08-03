import assert from "node:assert/strict";
import test from "node:test";

import { createDataProtection } from "./crypto.js";

const protection = createDataProtection({
  encryptionKey: Buffer.alloc(32, 1).toString("base64"),
  hmacKey: Buffer.alloc(32, 2).toString("base64"),
  keyVersion: "test-v1",
});

test("AES-256-GCM 암호화는 컨텍스트가 같을 때만 복호화된다", () => {
  const encrypted = protection.encrypt("01012345678", "phone:request-1");
  assert.equal(
    protection.decrypt(encrypted, "phone:request-1"),
    "01012345678",
  );
  assert.throws(() => protection.decrypt(encrypted, "phone:request-2"));
});

test("HMAC 지문은 객체 키 순서와 무관하고 원문을 노출하지 않는다", () => {
  const left = protection.fingerprint({ phone: "01012345678", mode: "quick" });
  const right = protection.fingerprint({ mode: "quick", phone: "01012345678" });
  assert.deepEqual(left, right);
  assert.equal(left.length, 32);
  assert.equal(left.includes(Buffer.from("01012345678")), false);
});
