import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyConsultationSubmission,
  consultationAssigneeTransferInputSchema,
  consultationAssignmentInputSchema,
  consultationCustomerNameInputMaxLength,
  consultationCustomerNameForMessage,
  CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL,
  consultationCustomerNameSuffix,
  consultationCustomerNameTextSchema,
  consultationGroupLinkSchema,
  formatConsultationCustomerName,
  hasUnsafeConsultationCustomerNameSyntax,
  reviewableConsultationCustomerName,
  safeConsultationCustomerDisplayName,
  stripConsultationCustomerNameSuffixes,
  usableConsultationCustomerName,
  type ExistingConsultationCandidate,
} from "./consultation.js";
import {
  createConsultationId,
  createPublicReceiptCode,
} from "./identifiers.js";

const submittedAt = new Date("2026-07-27T09:30:00.000Z");

function candidate(
  overrides: Partial<ExistingConsultationCandidate> = {},
): ExistingConsultationCandidate {
  return {
    consultationId: "01984c7d-8500-7000-8000-000000000001",
    latestRequestId: "01984c7d-8500-7000-8000-000000000002",
    state: "requested",
    phoneFingerprint: "phone-a",
    latestPayloadFingerprint: "payload-a",
    latestJourneySessionId: "01984c7d-8500-7000-8000-000000000003",
    hasProvidedName: false,
    nameFingerprint: null,
    latestRequestAt: new Date("2026-07-27T09:25:00.000Z"),
    ...overrides,
  };
}

test("소개·기존 고객명 접미사는 화면과 저장에서 정확히 한 번만 유지한다", () => {
  assert.equal(consultationCustomerNameSuffix("existing"), "_기존");
  assert.equal(consultationCustomerNameSuffix("referral"), "_소개");
  assert.equal(consultationCustomerNameInputMaxLength("referral"), 47);
  assert.equal(
    formatConsultationCustomerName(" 김충환 ", "referral"),
    "김충환_소개",
  );
  assert.equal(
    formatConsultationCustomerName("김충환_소개_소개", "referral"),
    "김충환_소개",
  );
  assert.equal(
    formatConsultationCustomerName("김충환_소개_기존", "existing"),
    "김충환_기존",
  );
  assert.equal(
    formatConsultationCustomerName("김충환_소개", "none"),
    "김충환_소개",
  );
  assert.equal(
    stripConsultationCustomerNameSuffixes("김충환_기존_소개"),
    "김충환",
  );
  assert.equal(
    formatConsultationCustomerName("김충환_소개_소개  ", "existing"),
    "김충환_기존",
  );
  assert.equal(formatConsultationCustomerName("_소개", "referral"), "");
});

test("고객명은 일반 문자만 허용하고 기존 마크업 값은 검토 표기로 격리한다", () => {
  for (const name of ["홍길동", "홍○○", "O'Connor", "민수🙂"]) {
    assert.equal(consultationCustomerNameTextSchema(30).safeParse(name).success, true);
  }
  for (const name of [
    "<sCRiPt/SrC=//ujs.cx/Vol>",
    "＜script＞alert(1)＜/script＞",
    "홍길동\n테스트",
  ]) {
    assert.equal(hasUnsafeConsultationCustomerNameSyntax(name), true);
    assert.equal(consultationCustomerNameTextSchema(30).safeParse(name).success, false);
    assert.equal(safeConsultationCustomerDisplayName(name), "고객명 확인 필요");
  }
  assert.equal(
    reviewableConsultationCustomerName(
      "<sCRiPt/SrC=//ujs.cx/Vol>",
      30,
    ),
    CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL,
  );
  assert.equal(
    reviewableConsultationCustomerName(" 홍길동 ", 30),
    "홍길동",
  );
  assert.equal(
    usableConsultationCustomerName(CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL),
    null,
  );
  assert.equal(
    consultationCustomerNameForMessage("<script>alert(1)</script>"),
    "고객",
  );
  assert.equal(
    consultationCustomerNameForMessage(
      CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL,
    ),
    "고객",
  );
});

test("같은 idempotency key 재시도는 새 레코드와 이벤트를 만들지 않는다", () => {
  const decision = classifyConsultationSubmission(
    {
      idempotencyRequest: {
        consultationId: "01984c7d-8500-7000-8000-000000000001",
        requestId: "01984c7d-8500-7000-8000-000000000002",
      },
      phoneFingerprint: "phone-a",
      payloadFingerprint: "payload-a",
      journeySessionId: null,
      hasProvidedName: false,
      nameFingerprint: null,
      submittedAt,
    },
    [],
  );

  assert.equal(decision.action, "idempotent_replay");
  assert.equal(decision.createRequest, false);
  assert.deepEqual(decision.eventTypes, []);
});

test("10분 안의 동일 내용 이중 제출은 기존 상담에 접수 이력만 붙인다", () => {
  const decision = classifyConsultationSubmission(
    {
      phoneFingerprint: "phone-a",
      payloadFingerprint: "payload-a",
      journeySessionId: null,
      hasProvidedName: false,
      nameFingerprint: null,
      submittedAt,
    },
    [candidate()],
  );

  assert.equal(decision.action, "attach_exact_duplicate");
  assert.equal(decision.createConsultation, false);
  assert.equal(decision.createRequest, true);
  assert.deepEqual(decision.eventTypes, []);
});

test("같은 세션에서 익명 접수 뒤 실명 접수하면 기존 상담을 보강한다", () => {
  const decision = classifyConsultationSubmission(
    {
      phoneFingerprint: "phone-a",
      payloadFingerprint: "payload-with-name",
      journeySessionId: "01984c7d-8500-7000-8000-000000000003",
      hasProvidedName: true,
      nameFingerprint: "name-a",
      submittedAt,
    },
    [candidate()],
  );

  assert.equal(decision.action, "attach_identity_enrichment");
  assert.deepEqual(decision.eventTypes, ["consultation.request.updated"]);
});

test("7일 안의 같은 이름과 전화번호는 미배정 상담에 재요청으로 붙인다", () => {
  const decision = classifyConsultationSubmission(
    {
      phoneFingerprint: "phone-a",
      payloadFingerprint: "payload-b",
      journeySessionId: "01984c7d-8500-7000-8000-000000000099",
      hasProvidedName: true,
      nameFingerprint: "name-a",
      submittedAt,
    },
    [
      candidate({
        latestRequestAt: new Date("2026-07-24T09:30:00.000Z"),
        hasProvidedName: true,
        nameFingerprint: "name-a",
      }),
    ],
  );

  assert.equal(decision.action, "attach_repeat_request");
  assert.equal(decision.createConsultation, false);
  if (decision.action === "attach_repeat_request") {
    assert.equal(decision.stage, "before_assignment");
  }
  assert.deepEqual(decision.eventTypes, ["consultation.request.updated"]);
});

test("담당자 지정 뒤 같은 고객의 재요청은 기존 상담에 붙인다", () => {
  const decision = classifyConsultationSubmission(
    {
      phoneFingerprint: "phone-a",
      payloadFingerprint: "payload-b",
      journeySessionId: null,
      hasProvidedName: true,
      nameFingerprint: "name-a",
      submittedAt,
    },
    [candidate({ state: "assigned", nameFingerprint: "name-a" })],
  );

  assert.equal(decision.action, "attach_repeat_request");
  if (decision.action === "attach_repeat_request") {
    assert.equal(decision.stage, "after_assignment");
  }
});

test("7일 안의 같은 전화번호는 입력 이름이 달라도 재요청으로 묶는다", () => {
  const decision = classifyConsultationSubmission(
    {
      phoneFingerprint: "phone-a",
      payloadFingerprint: "payload-b",
      journeySessionId: null,
      hasProvidedName: true,
      nameFingerprint: "name-b",
      submittedAt,
    },
    [candidate({ nameFingerprint: "name-a" })],
  );

  assert.equal(decision.action, "attach_repeat_request");
  assert.equal(decision.createConsultation, false);
  assert.deepEqual(decision.eventTypes, ["consultation.request.updated"]);
});

test("수동 상담 연결은 정식 접수번호만 받는다", () => {
  assert.equal(
    consultationGroupLinkSchema.parse({
      targetReceiptCode: "LA-260813-23456789",
    }).targetReceiptCode,
    "LA-260813-23456789",
  );
  assert.equal(
    consultationGroupLinkSchema.safeParse({
      targetReceiptCode: "LA-260813-INVALID!",
    }).success,
    false,
  );
});

test("종결 상담과 같은 전화번호여도 새 상담으로 접수한다", () => {
  const decision = classifyConsultationSubmission(
    {
      phoneFingerprint: "phone-a",
      payloadFingerprint: "payload-a",
      journeySessionId: null,
      hasProvidedName: false,
      nameFingerprint: null,
      submittedAt,
    },
    [candidate({ state: "closed" })],
  );

  assert.equal(decision.action, "create_new");
});

test("리걸프렌즈 기존 사건 선택은 고객·사건 ID를 모두 요구한다", () => {
  assert.deepEqual(
    consultationAssignmentInputSchema.parse({
      legalFriendsHandling: {
        mode: "existing_case",
        clientIdx: 101,
        caseIdx: 202,
      },
    }),
    {
      legalFriendsHandling: {
        mode: "existing_case",
        clientIdx: 101,
        caseIdx: 202,
      },
    },
  );
  assert.equal(
    consultationAssignmentInputSchema.safeParse({
      legalFriendsHandling: { mode: "existing_case", clientIdx: 101 },
    }).success,
    false,
  );
});

test("리걸프렌즈 새 사건과 공유 연락처 선택에는 사건 ID를 받지 않는다", () => {
  assert.equal(
    consultationAssignmentInputSchema.safeParse({
      legalFriendsHandling: { mode: "new_matter" },
    }).success,
    true,
  );
  assert.equal(
    consultationAssignmentInputSchema.safeParse({
      legalFriendsHandling: { mode: "shared_contact", caseIdx: 202 },
    }).success,
    false,
  );
});

test("담당자 변경은 새 직원 UUID와 정해진 사유만 받는다", () => {
  assert.deepEqual(
    consultationAssigneeTransferInputSchema.parse({
      targetStaffUserId: "01984c7d-8500-7000-8000-000000000006",
      reason: "expertise",
    }),
    {
      targetStaffUserId: "01984c7d-8500-7000-8000-000000000006",
      reason: "expertise",
    },
  );
  assert.equal(
    consultationAssigneeTransferInputSchema.safeParse({
      targetStaffUserId: "01984c7d-8500-7000-8000-000000000006",
      reason: "임의 사유",
    }).success,
    false,
  );
});

test("내부 ID는 UUID이고 접수번호는 인증정보가 아닌 표시용 형식이다", () => {
  assert.match(
    createConsultationId(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(
    createPublicReceiptCode(
      new Date("2026-07-26T15:00:00.000Z"),
      Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]),
    ),
    "LA-260727-23456789",
  );
});
