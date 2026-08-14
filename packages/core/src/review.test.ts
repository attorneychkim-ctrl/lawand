import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT_REVIEW_PRIVACY_NOTICE_VERSION,
  CURRENT_REVIEW_PUBLICATION_CONSENT_VERSION,
  REVIEW_REQUEST_DEFAULT_TEMPLATES,
  detectReviewPiiFlags,
  renderReviewRequestTemplate,
  reviewModerationSchema,
  reviewRequestTemplateCreateSchema,
  reviewSubmissionSchema,
} from "./review.js";
import { centrexMessageByteLength } from "./telephony.js";

const validSubmission = {
  source: "homepage",
  idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
  practiceArea: "personal_rehabilitation",
  progressStage: "discharge",
  experienceKeywords: ["친절", "든든"],
  authorDisplay: "김○○ 고객",
  content: "처음에는 막막했지만 진행 순서를 이해하기 쉽게 설명해 주셔서 안심할 수 있었습니다.",
  phone: "010-1234-5678",
  privacyNoticeVersion: CURRENT_REVIEW_PRIVACY_NOTICE_VERSION,
  publicationConsentVersion: CURRENT_REVIEW_PUBLICATION_CONSENT_VERSION,
  consentAgreedAt: "2026-07-29T09:00:00+09:00",
  privacyConsent: true,
  publicationConsent: true,
  website: "",
} as const;

test("후기 제출 계약은 전화번호를 정규화하고 정해진 필드만 받는다", () => {
  const parsed = reviewSubmissionSchema.parse(validSubmission);
  assert.equal(parsed.phone, "01012345678");
  assert.equal(parsed.experienceKeywords.length, 2);

  assert.equal(
    reviewSubmissionSchema.safeParse({
      ...validSubmission,
      hiddenTrackingValue: "no",
    }).success,
    false,
  );
});

test("전용 후기 요청 링크는 이미 보유한 이름과 전화번호를 다시 요구하지 않는다", () => {
  const parsed = reviewSubmissionSchema.safeParse({
    ...validSubmission,
    authorDisplay: undefined,
    phone: undefined,
    requestToken:
      "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  });
  assert.equal(parsed.success, true);

  assert.equal(
    reviewSubmissionSchema.safeParse({
      ...validSubmission,
      authorDisplay: undefined,
      phone: undefined,
    }).success,
    false,
  );
});

test("후기 제출 계약은 실제 작성자의 짧은 글과 과한 키워드 선택을 막는다", () => {
  assert.equal(
    reviewSubmissionSchema.safeParse({
      ...validSubmission,
      content: "좋아요",
    }).success,
    false,
  );
  assert.equal(
    reviewSubmissionSchema.safeParse({
      ...validSubmission,
      experienceKeywords: ["친절", "세심", "꼼꼼", "신뢰"],
    }).success,
    false,
  );
});

test("후기 개인정보 탐지는 자동 공개 전에 연락처와 사건번호를 표시한다", () => {
  assert.deepEqual(
    detectReviewPiiFlags(
      "연락처는 010-1234-5678이고 사건은 2026개회12345입니다.",
    ),
    ["phone", "case_number"],
  );
});

test("공개 제한에는 사유가 필요하고 기타 사유에는 메모가 필요하다", () => {
  assert.equal(
    reviewModerationSchema.safeParse({
      action: "restrict",
      reason: null,
      note: null,
    }).success,
    false,
  );
  assert.equal(
    reviewModerationSchema.safeParse({
      action: "restrict",
      reason: "other",
      note: "고객과 사실관계를 추가 확인 중",
    }).success,
    true,
  );
});

test("개인 후기 요청 템플릿은 전용 링크를 요구하고 허용 변수만 치환한다", () => {
  const body =
    "{{고객명}}님, {{담당자명}}입니다. 사건 {{사건번호}} 후기: {{후기작성링크}}";
  assert.equal(
    reviewRequestTemplateCreateSchema.safeParse({
      name: "종결 고객",
      body,
      defaultProgressStage: "discharge",
    })
      .success,
    true,
  );
  assert.equal(
    reviewRequestTemplateCreateSchema.safeParse({
      name: "잘못된 변수",
      body: "{{고객}}님 후기: {{후기작성링크}}",
      defaultProgressStage: "other",
    }).success,
    false,
  );
  assert.equal(
    renderReviewRequestTemplate(body, {
      "{{고객명}}": "홍길동",
      "{{담당자명}}": "김담당",
      "{{사건번호}}": "2026개회1234",
      "{{후기작성링크}}": "https://example.test/review",
    }),
    "홍길동님, 김담당입니다. 사건 2026개회1234 후기: https://example.test/review",
  );
});

test("후기 요청 기본 템플릿은 네 시점을 빠짐없이 고정하고 문자 제한을 지킨다", () => {
  assert.deepEqual(
    REVIEW_REQUEST_DEFAULT_TEMPLATES.map((template) => template.presetKey),
    ["consultation", "commencement", "discharge", "other"],
  );
  for (const template of REVIEW_REQUEST_DEFAULT_TEMPLATES) {
    assert.equal(template.defaultProgressStage, template.presetKey);
    assert.equal(template.body.includes("{{후기작성링크}}"), true);
    assert.equal(centrexMessageByteLength(template.body) <= 500, true);
  }
});
