import assert from "node:assert/strict";
import test from "node:test";
import {
  ReviewManagementError,
  serializeReviewOccurredAt,
} from "./review-management-service.js";
import { reviewPracticeAreaFromDirectoryCaseType } from "./review-directory.js";
import { maskedReviewAuthorDisplay } from "./review-service.js";

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

test("후기 요청 사건 유형은 고객 작성 화면의 세 가지 분야 기본값으로 변환한다", () => {
  assert.equal(reviewPracticeAreaFromDirectoryCaseType(1), "personal_rehabilitation");
  assert.equal(reviewPracticeAreaFromDirectoryCaseType(2), "personal_bankruptcy");
  assert.equal(reviewPracticeAreaFromDirectoryCaseType(3), "other");
});

test("전용 후기 링크는 고객 실명 전체 대신 첫 글자만 남긴 공개 이름을 만든다", () => {
  assert.equal(maskedReviewAuthorDisplay("김법률"), "김○○ 고객");
  assert.equal(maskedReviewAuthorDisplay(""), "고○○ 고객");
});
