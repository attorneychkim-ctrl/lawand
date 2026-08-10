import assert from "node:assert/strict";
import {
  createDecipheriv,
  createHmac,
} from "node:crypto";
import test from "node:test";

import { encryptCentrexBridgeCredentialEnvelope } from "./centrex-bridge-provisioning.js";

function deriveKey(secret: Buffer, label: string) {
  return createHmac("sha256", secret).update(label, "utf8").digest();
}

test("bridge 프로비저닝 명령은 비밀번호 원문 없이 인증 암호문만 만든다", () => {
  const secret = Buffer.alloc(32, 7);
  const commandId = "01980000-0000-7000-8000-000000000071";
  const envelope = encryptCentrexBridgeCredentialEnvelope({
    commandId,
    loginId: "07046074535",
    password: "bridge-password-test",
    secret,
    iv: Buffer.from("000102030405060708090a0b0c0d0e0f", "hex"),
  });
  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes("07046074535"), false);
  assert.equal(serialized.includes("bridge-password-test"), false);
  assert.deepEqual(envelope, {
    algorithm: "A256CBC-HS256",
    iv: "AAECAwQFBgcICQoLDA0ODw",
    ciphertext:
      "3ENNLpwpRBAfxyMgX6vN6hygtuSoZzf9rVNe_GtTAMDONFy_cnZvfud6hvi16AHyr14ICn-f44UllOmYyQOk3A",
    mac: "VLebi_32-gIzNif86Gn_YKSHFZaDhmR5xd8arcHgXgc",
  });

  const encryptionKey = deriveKey(
    secret,
    "lawand-centrex-provisioning-encryption-v1",
  );
  const decipher = createDecipheriv(
    "aes-256-cbc",
    encryptionKey,
    Buffer.from(envelope.iv, "base64url"),
  );
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]);
  assert.deepEqual(JSON.parse(plaintext.toString("utf8")), {
    loginId: "07046074535",
    password: "bridge-password-test",
  });
  plaintext.fill(0);
  encryptionKey.fill(0);
});
