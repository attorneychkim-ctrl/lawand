import assert from "node:assert/strict";
import test from "node:test";
import {
  ReviewManagementError,
  serializeReviewOccurredAt,
} from "./review-management-service.js";

test("후기 목록 시각은 raw SQL 문자열과 Date를 모두 ISO 시각으로 직렬화한다", () => {
  const expected = "2026-08-14T03:21:09.123Z";

  assert.equal(serializeReviewOccurredAt(expected), expected);
  assert.equal(serializeReviewOccurredAt(new Date(expected)), expected);
});

test("유효하지 않은 후기 목록 시각은 안전하게 거부한다", () => {
  assert.throws(
    () => serializeReviewOccurredAt("not-a-timestamp"),
    (error: unknown) =>
      error instanceof ReviewManagementError &&
      error.code === "review_occurred_at_invalid",
  );
});
