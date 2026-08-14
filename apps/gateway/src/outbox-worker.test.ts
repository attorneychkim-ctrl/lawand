import assert from "node:assert/strict";
import test from "node:test";

import { createDataProtection } from "./crypto.js";
import { resolveStoredRegistrationName } from "./outbox-worker.js";

const protection = createDataProtection({
  encryptionKey: Buffer.alloc(32, 1).toString("base64"),
  hmacKey: Buffer.alloc(32, 2).toString("base64"),
  keyVersion: "v1",
});

test("묶음 구성 상담의 이름은 대표가 아니라 암호문 소유 상담 문맥으로 복호화한다", () => {
  const canonicalConsultationId =
    "01984c7d-8500-7000-8000-000000000001";
  const requestConsultationId =
    "01984c7d-8500-7000-8000-000000000002";
  const encryptedName = protection.encrypt(
    "구성 상담 고객",
    `consultations.preferred_name:${requestConsultationId}`,
  );

  assert.equal(
    resolveStoredRegistrationName(protection, {
      consultationId: requestConsultationId,
      anonymousLabel: "익명-테스트",
      preferredNameCiphertext: encryptedName.ciphertext,
      preferredNameNonce: encryptedName.nonce,
      preferredNameKeyVersion: encryptedName.keyVersion,
    }),
    "구성 상담 고객",
  );
  assert.throws(() =>
    protection.decrypt(
      encryptedName,
      `consultations.preferred_name:${canonicalConsultationId}`,
    ),
  );
});

test("저장된 선호 이름이 없으면 상담 익명 표시명을 사용한다", () => {
  assert.equal(
    resolveStoredRegistrationName(protection, {
      consultationId: "01984c7d-8500-7000-8000-000000000003",
      anonymousLabel: "익명-테스트",
      preferredNameCiphertext: null,
      preferredNameNonce: null,
      preferredNameKeyVersion: null,
    }),
    "익명-테스트",
  );
});
