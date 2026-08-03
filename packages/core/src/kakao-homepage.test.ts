import assert from "node:assert/strict";
import test from "node:test";

import {
  kakaoHomepageEntryConfirmationSchema,
  kakaoHomepageEntryReceiptSchema,
  kakaoHomepageEntrySubmissionSchema,
} from "./kakao-homepage.js";

test("홈페이지 카카오 진입은 UUID 멱등키와 선택적 유입정보만 받는다", () => {
  assert.equal(
    kakaoHomepageEntrySubmissionSchema.safeParse({
      source: "homepage_kakao",
      idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
    }).success,
    true,
  );
  assert.equal(
    kakaoHomepageEntrySubmissionSchema.safeParse({
      source: "homepage_kakao",
      idempotencyKey: "not-a-uuid",
    }).success,
    false,
  );
});

test("카카오 채팅 표시명은 빈 값과 제어 문자를 거부한다", () => {
  assert.equal(
    kakaoHomepageEntryConfirmationSchema.safeParse({
      displayName: "김민수",
    }).success,
    true,
  );
  assert.equal(
    kakaoHomepageEntryConfirmationSchema.safeParse({
      displayName: "김민수\n테스트",
    }).success,
    false,
  );
});

test("홈페이지 카카오 진입 응답은 대기·확정·무효 상태만 허용한다", () => {
  assert.equal(
    kakaoHomepageEntryReceiptSchema.safeParse({
      publicReceiptCode: "LA-260730-23456789",
      acceptedAt: "2026-07-30T09:00:00.000Z",
      status: "pending",
      replayed: false,
    }).success,
    true,
  );
});
