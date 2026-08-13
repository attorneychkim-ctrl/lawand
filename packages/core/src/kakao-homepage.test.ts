import assert from "node:assert/strict";
import test from "node:test";

import {
  kakaoHomepageEntryAssignmentPolicy,
  kakaoHomepageEntryConfirmationSchema,
  kakaoHomepageEntryReceiptSchema,
  kakaoHomepageEntrySubmissionSchema,
} from "./kakao-homepage.js";

test("고객 입력 이름이 있는 대기 접수만 상담하기에서 확인·배정을 함께 허용한다", () => {
  assert.equal(
    kakaoHomepageEntryAssignmentPolicy({
      status: "pending",
      nameProvided: true,
    }),
    "confirm_and_assign",
  );
  assert.equal(
    kakaoHomepageEntryAssignmentPolicy({
      status: "pending",
      nameProvided: false,
    }),
    "blocked",
  );
  assert.equal(
    kakaoHomepageEntryAssignmentPolicy({
      status: "confirmed",
      nameProvided: false,
    }),
    "assign",
  );
  assert.equal(
    kakaoHomepageEntryAssignmentPolicy({
      status: "invalid",
      nameProvided: true,
    }),
    "blocked",
  );
});

test("홈페이지 카카오 진입은 표시명·거주지역과 UUID 멱등키를 받는다", () => {
  assert.equal(
    kakaoHomepageEntrySubmissionSchema.safeParse({
      source: "homepage_kakao",
      idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
      displayName: "김민수",
      residenceRegion: "seoul",
    }).success,
    true,
  );
  assert.equal(
    kakaoHomepageEntrySubmissionSchema.safeParse({
      source: "homepage_kakao",
      idempotencyKey: "not-a-uuid",
      displayName: "김민수",
      residenceRegion: "seoul",
    }).success,
    false,
  );
  assert.equal(
    kakaoHomepageEntrySubmissionSchema.safeParse({
      source: "homepage_kakao",
      idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
      displayName: " ",
      residenceRegion: "seoul",
    }).success,
    false,
  );
  assert.equal(
    kakaoHomepageEntrySubmissionSchema.safeParse({
      source: "homepage_kakao",
      idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
      displayName: "김민수",
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
