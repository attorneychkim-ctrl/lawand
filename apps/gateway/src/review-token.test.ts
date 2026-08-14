import assert from "node:assert/strict";
import test from "node:test";

import { createDataProtection } from "./crypto.js";
import {
  createReviewRequestToken,
  verifyReviewRequestToken,
} from "./review-token.js";

const protection = createDataProtection({
  encryptionKey: Buffer.alloc(32, 1).toString("base64"),
  hmacKey: Buffer.alloc(32, 2).toString("base64"),
  keyVersion: "test-v1",
});

test("후기 요청 토큰은 요청 식별자를 위변조 방지 서명으로 묶는다", () => {
  const requestId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1";
  const token = createReviewRequestToken(requestId, protection);
  const tamperedToken = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

  assert.equal(verifyReviewRequestToken(token, protection), requestId);
  assert.equal(verifyReviewRequestToken(tamperedToken, protection), null);
  assert.equal(verifyReviewRequestToken("not-a-token", protection), null);
});
