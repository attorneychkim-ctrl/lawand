import { timingSafeEqual } from "node:crypto";

import type { DataProtection } from "./crypto.js";

const reviewRequestTokenPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i;

function requestSignature(requestId: string, protection: DataProtection) {
  return protection.fingerprint({
    kind: "review-request-token-v1",
    requestId,
  });
}

export function createReviewRequestToken(
  requestId: string,
  protection: DataProtection,
) {
  return `${requestId}.${requestSignature(requestId, protection).toString("base64url")}`;
}

export function verifyReviewRequestToken(
  token: string,
  protection: DataProtection,
): string | null {
  const match = reviewRequestTokenPattern.exec(token);
  const requestId = match?.[1];
  const encodedSignature = match?.[2];
  if (!requestId || !encodedSignature) return null;
  const provided = Buffer.from(encodedSignature, "base64url");
  const expected = requestSignature(requestId, protection);
  return provided.length === expected.length &&
    timingSafeEqual(provided, expected)
    ? requestId
    : null;
}
