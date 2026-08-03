import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyConsultationSubmission,
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
      submittedAt,
    },
    [candidate()],
  );

  assert.equal(decision.action, "attach_identity_enrichment");
  assert.deepEqual(decision.eventTypes, ["consultation.request.updated"]);
});

test("7일 안의 같은 전화번호는 새 상담으로 만들고 중복 의심만 표시한다", () => {
  const decision = classifyConsultationSubmission(
    {
      phoneFingerprint: "phone-a",
      payloadFingerprint: "payload-b",
      journeySessionId: "01984c7d-8500-7000-8000-000000000099",
      hasProvidedName: false,
      submittedAt,
    },
    [
      candidate({
        latestRequestAt: new Date("2026-07-24T09:30:00.000Z"),
      }),
    ],
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
      submittedAt,
    },
    [candidate({ state: "closed" })],
  );

  assert.equal(decision.action, "create_new");
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
