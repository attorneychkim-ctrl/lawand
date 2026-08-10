import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptCentrexCredential,
  encryptCentrexCredential,
} from "./centrex-credential-vault.js";
import { createDataProtection } from "./crypto.js";

const protection = createDataProtection({
  encryptionKey: Buffer.alloc(32, 7).toString("base64"),
  hmacKey: Buffer.alloc(32, 8).toString("base64"),
  keyVersion: "test-v1",
});

test("센트릭스 SHA-512는 endpoint 문맥에 묶어 암호화한다", () => {
  const endpointId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4";
  const passwordSha512 = "a".repeat(128);
  const encrypted = encryptCentrexCredential(
    protection,
    endpointId,
    passwordSha512,
  );

  assert.equal(
    encrypted.ciphertext.includes(Buffer.from(passwordSha512, "utf8")),
    false,
  );
  assert.equal(
    decryptCentrexCredential(protection, {
      endpointId,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      keyVersion: encrypted.keyVersion,
    }),
    passwordSha512,
  );
  assert.throws(() =>
    decryptCentrexCredential(protection, {
      endpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a5",
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      keyVersion: encrypted.keyVersion,
    }),
  );
});
