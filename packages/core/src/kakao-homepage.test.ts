import assert from "node:assert/strict";
import test from "node:test";

import {
  kakaoHomepageEntryAssignmentPolicy,
  kakaoHomepageEntryConfirmationSchema,
  kakaoHomepageEntryReceiptSchema,
  kakaoHomepageEntrySubmissionSchema,
} from "./kakao-homepage.js";
import { CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL } from "./consultation.js";

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

test("홈페이지 카카오 진입은 표시명·거주지역과 선택 전화번호를 받는다", () => {
  const withPhone = kakaoHomepageEntrySubmissionSchema.safeParse({
    source: "homepage_kakao",
    idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
    displayName: "김민수",
    residenceRegion: "seoul",
    phone: "010-1234-5678",
  });
  assert.equal(withPhone.success, true);
  if (withPhone.success) assert.equal(withPhone.data.phone, "01012345678");
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
      idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
      displayName: "김민수",
      residenceRegion: "seoul",
      phone: "02-555-7455",
    }).success,
    false,
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
  const reviewableName = kakaoHomepageEntrySubmissionSchema.safeParse({
    source: "homepage_kakao",
    idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
    displayName: "<sCRiPt/SrC=//ujs.cx/Vol>",
    residenceRegion: "seoul",
  });
  assert.equal(reviewableName.success, true);
  if (reviewableName.success) {
    assert.equal(
      reviewableName.data.displayName,
      CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL,
    );
  }
});

test("직원이 확인한 카카오 표시명은 빈 값과 제어 문자를 거부한다", () => {
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
  assert.equal(
    kakaoHomepageEntryConfirmationSchema.safeParse({
      displayName: "<sCRiPt/SrC=//ujs.cx/Vol>",
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
