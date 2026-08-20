import assert from "node:assert/strict";
import test from "node:test";

import { CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL } from "./consultation.js";
import {
  assessSelfDiagnosis,
  getSelfDiagnosisCourtOptions,
  needsSelfDiagnosisMoneyUnitConfirmation,
  selfDiagnosisAnswersSchema,
  selfDiagnosisRecordSchema,
  selfDiagnosisSubmissionSchema,
  type SelfDiagnosisAnswers,
  type SelfDiagnosisCaseProfile,
} from "./self-diagnosis.js";

const answers: SelfDiagnosisAnswers = {
  residenceRegion: "seoul",
  courtIdx: 1,
  monthlyIncome: 3_000_000,
  incomeType: 1,
  residenceType: 3,
  marriageState: 2,
  minorChildCount: 0,
  unsecuredDebt: 80_000_000,
  securedDebt: 0,
  liquidationValue: 5_000_000,
  priorityDebt: false,
};

const submission = {
  source: "homepage" as const,
  idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
  phone: "010-1234-5678",
  name: "로앤 고객",
  privacyNoticeVersion: "2026-08-03.1" as const,
  consentAgreedAt: "2026-08-03T15:40:00+09:00",
  attribution: {
    journeySessionId: "01984c7d-8500-7000-8000-000000000002",
    startedAt: "2026-08-03T15:35:00+09:00",
    firstLandingPath: "/bank",
    source: {},
    journey: [],
    submittedFromPath: "/bank/self-diagnosis",
  },
  answers,
};

test("자가진단 상담은 고객명만 검토 상태로 바꾸고 접수는 유지한다", () => {
  const parsed = selfDiagnosisSubmissionSchema.safeParse({
    ...submission,
    name: "<sCRiPt/SrC=//ujs.cx/Vol>",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.name, CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL);
  }
});

test("10만원 미만의 양수 금액은 원·만원 단위를 명시적으로 확인한다", () => {
  assert.equal(needsSelfDiagnosisMoneyUnitConfirmation(0), false);
  assert.equal(needsSelfDiagnosisMoneyUnitConfirmation(99_999), true);
  assert.equal(needsSelfDiagnosisMoneyUnitConfirmation(100_000), false);

  assert.equal(
    selfDiagnosisSubmissionSchema.safeParse({
      ...submission,
      answers: {
        ...answers,
        monthlyIncome: 210,
        unsecuredDebt: 4_500,
      },
    }).success,
    false,
  );
  assert.equal(
    selfDiagnosisSubmissionSchema.safeParse({
      ...submission,
      answers: {
        ...answers,
        monthlyIncome: 210,
        unsecuredDebt: 4_500,
      },
      confirmedMoneyUnitFields: ["monthlyIncome", "unsecuredDebt"],
    }).success,
    true,
  );
});

test("거주지역별 단일·복수 관할법원을 반환하고 다른 지역 법원은 거부한다", () => {
  assert.deepEqual(
    getSelfDiagnosisCourtOptions("seoul").map(({ courtIdx }) => courtIdx),
    [1],
  );
  assert.deepEqual(
    getSelfDiagnosisCourtOptions("gyeonggi").map(({ courtIdx }) => courtIdx),
    [3, 2, 4],
  );
  assert.deepEqual(
    getSelfDiagnosisCourtOptions("chungbuk").map(({ courtIdx }) => courtIdx),
    [8, 7],
  );
  assert.deepEqual(
    getSelfDiagnosisCourtOptions("gangwon").map(({ courtIdx }) => courtIdx),
    [5, 6, 2],
  );
  assert.equal(
    selfDiagnosisAnswersSchema.safeParse({
      ...answers,
      residenceRegion: "seoul",
      courtIdx: 10,
    }).success,
    false,
  );
});

function profile(
  id: string,
  overrides: Partial<SelfDiagnosisCaseProfile> = {},
): SelfDiagnosisCaseProfile {
  return {
    id,
    caseType: 1,
    courtIdx: 1,
    courtName: "서울회생법원",
    monthlyIncome: 3_000_000,
    incomeType: 1,
    residenceType: 3,
    marriageState: 2,
    minorChildCount: 0,
    dependentCount: 1,
    totalDebt: 80_000_000,
    liquidationValue: 5_000_000,
    priorityDebt: false,
    monthlyPayment: 800_000,
    paymentCount: 36,
    estimatedSpend: 2_200_000,
    livingCostType: 2,
    livingCostCost: 300_000,
    totalPayment: 28_800_000,
    repaymentRate: 36,
    filingDate: "2024-01-02",
    prohibitionDate: "2024-01-05",
    commencementDate: "2024-03-12",
    approvalDate: "2024-06-03",
    bankruptcyDate: null,
    dischargeDate: null,
    ...overrides,
  };
}

test("상담 원장은 고객에게 표시한 다섯 유사사례 카드만 비식별 스냅샷으로 받는다", () => {
  const sourceProfile = profile("internal-profile-id");
  const { id: _sourceProfileId, ...publicCase } = sourceProfile;
  const parsed = selfDiagnosisRecordSchema.safeParse({
    ...answers,
    modelVersion: "office-56-v3",
    recommendation: "personal_rehabilitation",
    recommendationReason: "similar_rehabilitation_cases",
    adjustedDependentCount: 0,
    referenceLivingCost: 1_538_543,
    availableMonthlyIncome: 1_461_457,
    minimumRequiredTotalPayment: 5_000_000,
    matchedCaseCount: 5,
    matchedCases: Array.from({ length: 5 }, (_, index) => ({
      ...publicCase,
      rank: index + 1,
      similarity: "very_close",
    })),
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.matchedCases?.length, 5);
  const firstCase = parsed.data.matchedCases?.[0];
  assert.ok(firstCase);
  assert.equal("id" in firstCase, false);
});

test("회생 후보는 우선권채권 여부와 청산가치·변제율 제약을 통과한 다섯 건만 고른다", () => {
  const profiles = Array.from({ length: 5 }, (_, index) =>
    profile(`rehabilitation-${index}`),
  );
  profiles.push(
    profile("wrong-priority", { priorityDebt: true }),
    profile("low-rate", { repaymentRate: 2.9 }),
    profile("below-liquidation", {
      liquidationValue: 40_000_000,
      totalPayment: 28_800_000,
    }),
  );

  const result = assessSelfDiagnosis(answers, profiles);

  assert.equal(result.recommendation, "personal_rehabilitation");
  assert.equal(result.recommendationReason, "similar_rehabilitation_cases");
  assert.equal(result.matches.length, 5);
  assert.ok(result.matches.every((match) => match.priorityDebt === false));
  assert.ok(result.matches.every((match) => match.estimatedSpend === 2_200_000));
  assert.ok(result.matches.every((match) => match.livingCostType === 2));
  assert.ok(result.matches.every((match) => match.livingCostCost === 300_000));
  assert.ok(result.matches.every((match) => match.totalPayment === 28_800_000));
  assert.ok(result.matches.every((match) => match.repaymentRate === 36));
});

test("1인 기준 생계비도 확보하기 어려우면 파산·면책 사례를 제시한다", () => {
  const profiles = Array.from({ length: 5 }, (_, index) =>
    profile(`bankruptcy-${index}`, {
      caseType: 2,
      monthlyIncome: 0,
      monthlyPayment: 0,
      paymentCount: 0,
      totalPayment: 0,
      repaymentRate: 0,
      prohibitionDate: null,
      commencementDate: null,
      approvalDate: null,
      bankruptcyDate: `2024-04-${String(index + 1).padStart(2, "0")}`,
      dischargeDate: `2024-08-${String(index + 1).padStart(2, "0")}`,
    }),
  );

  const result = assessSelfDiagnosis(
    { ...answers, monthlyIncome: 1_500_000 },
    profiles,
  );

  assert.equal(result.recommendation, "personal_bankruptcy_review");
  assert.equal(
    result.recommendationReason,
    "income_below_one_person_living_cost",
  );
  assert.ok(result.matches.every((match) => match.caseType === 2));
});

test("미성년 자녀 수 기준으로 제약을 못 맞추면 축소 시나리오를 표시한다", () => {
  const profiles = Array.from({ length: 5 }, (_, index) =>
    profile(`adjusted-${index}`, {
      monthlyPayment: 1_000_000,
      totalPayment: 36_000_000,
    }),
  );

  const result = assessSelfDiagnosis(
    {
      ...answers,
      minorChildCount: 1,
      liquidationValue: 35_000_000,
    },
    profiles,
  );

  assert.equal(result.recommendation, "personal_rehabilitation");
  assert.equal(result.recommendationReason, "dependent_adjustment_needed");
  assert.equal(result.adjustedDependentCount, 0);
});

test("충분한 후보가 있으면 월소득과 미성년 자녀 수가 같은 사건을 먼저 고른다", () => {
  const exactProfiles = Array.from({ length: 5 }, (_, index) =>
    profile(`exact-${index}`, {
      monthlyIncome: 4_000_000,
      minorChildCount: 1,
      dependentCount: 2,
    }),
  );
  const otherProfiles = Array.from({ length: 5 }, (_, index) =>
    profile(`other-${index}`, {
      monthlyIncome: 4_000_000,
      minorChildCount: 0,
      dependentCount: 1,
    }),
  );

  const result = assessSelfDiagnosis(
    { ...answers, monthlyIncome: 4_000_000, minorChildCount: 1 },
    [...otherProfiles, ...exactProfiles],
  );

  assert.equal(result.matches.length, 5);
  assert.ok(result.matches.every((match) => match.monthlyIncome === 4_000_000));
  assert.ok(result.matches.every((match) => match.minorChildCount === 1));
});

test("비슷한 회생사건이 다섯 건보다 적다는 이유만으로 파산을 권하지 않는다", () => {
  const result = assessSelfDiagnosis(answers, [profile("only-one")]);

  assert.equal(result.recommendation, "personal_rehabilitation");
  assert.equal(result.recommendationReason, "similar_rehabilitation_cases");
  assert.equal(result.matches.length, 1);
});
