import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyConsultationSubmission,
  consultationAssignmentInputSchema,
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

test("같은 전화번호라도 이름이 다르면 자동 병합하지 않는다", () => {
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

  assert.equal(decision.action, "create_suspected_duplicate");
  assert.equal(decision.createConsultation, true);
  assert.deepEqual(decision.eventTypes, [
    "consultation.requested",
    "consultation.duplicate_suspected",
  ]);
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
