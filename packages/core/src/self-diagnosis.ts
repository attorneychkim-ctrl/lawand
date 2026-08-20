import { z } from "zod";

import { consultationAttributionInputSchema } from "./attribution.js";
import { consultationCustomerNameTextSchema } from "./consultation.js";
import { CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION } from "./privacy.js";

export const SELF_DIAGNOSIS_MODEL_VERSION = "office-56-v3";

export const SELF_DIAGNOSIS_COURTS = [
  { idx: 1, name: "서울회생법원" },
  { idx: 2, name: "의정부지방법원" },
  { idx: 3, name: "수원회생법원" },
  { idx: 4, name: "인천지방법원" },
  { idx: 5, name: "춘천지방법원" },
  { idx: 6, name: "춘천지방법원 강릉지원" },
  { idx: 7, name: "대전회생법원" },
  { idx: 8, name: "청주지방법원" },
  { idx: 9, name: "대구회생법원" },
  { idx: 10, name: "부산회생법원" },
  { idx: 11, name: "창원지방법원" },
  { idx: 12, name: "울산지방법원" },
  { idx: 13, name: "광주회생법원" },
  { idx: 14, name: "전주지방법원" },
  { idx: 15, name: "제주지방법원" },
] as const;

export const SELF_DIAGNOSIS_RESIDENCE_REGIONS = [
  { value: "seoul", label: "서울" },
  { value: "busan", label: "부산" },
  { value: "daegu", label: "대구" },
  { value: "incheon", label: "인천" },
  { value: "gwangju", label: "광주" },
  { value: "daejeon", label: "대전" },
  { value: "ulsan", label: "울산" },
  { value: "sejong", label: "세종" },
  { value: "gyeonggi", label: "경기" },
  { value: "gangwon", label: "강원" },
  { value: "chungbuk", label: "충북" },
  { value: "chungnam", label: "충남" },
  { value: "jeonbuk", label: "전북" },
  { value: "jeonnam", label: "전남" },
  { value: "gyeongbuk", label: "경북" },
  { value: "gyeongnam", label: "경남" },
  { value: "jeju", label: "제주" },
] as const;

const selfDiagnosisResidenceRegionValues = SELF_DIAGNOSIS_RESIDENCE_REGIONS.map(
  ({ value }) => value,
) as [
  (typeof SELF_DIAGNOSIS_RESIDENCE_REGIONS)[number]["value"],
  ...(typeof SELF_DIAGNOSIS_RESIDENCE_REGIONS)[number]["value"][],
];

export const selfDiagnosisResidenceRegionSchema = z.enum(
  selfDiagnosisResidenceRegionValues,
);

export type SelfDiagnosisResidenceRegion = z.infer<
  typeof selfDiagnosisResidenceRegionSchema
>;

type SelfDiagnosisCourtOption = {
  courtIdx: number;
  description: string;
};

export const SELF_DIAGNOSIS_COURT_OPTIONS_BY_REGION: Record<
  SelfDiagnosisResidenceRegion,
  readonly SelfDiagnosisCourtOption[]
> = {
  seoul: [{ courtIdx: 1, description: "서울 거주 기준" }],
  busan: [{ courtIdx: 10, description: "부산 거주 기준" }],
  daegu: [{ courtIdx: 9, description: "대구 거주 기준" }],
  incheon: [{ courtIdx: 4, description: "인천 거주 기준" }],
  gwangju: [{ courtIdx: 13, description: "광주 거주 기준" }],
  daejeon: [{ courtIdx: 7, description: "대전 거주 기준" }],
  ulsan: [
    { courtIdx: 12, description: "울산의 기본 관할" },
    { courtIdx: 10, description: "법률상 추가 신청 가능" },
  ],
  sejong: [{ courtIdx: 7, description: "세종 거주 기준" }],
  gyeonggi: [
    {
      courtIdx: 3,
      description:
        "수원·성남·안양·안산·평택 등 경기 남부 관할 시·군",
    },
    {
      courtIdx: 2,
      description: "의정부·고양·파주·남양주 등 경기 북부 관할 시·군",
    },
    { courtIdx: 4, description: "부천·김포 거주" },
  ],
  gangwon: [
    { courtIdx: 5, description: "철원을 제외한 강원 지역의 기본 관할" },
    {
      courtIdx: 6,
      description: "강릉·동해·삼척·속초·양양·고성 거주 시",
    },
    { courtIdx: 2, description: "철원 거주 시" },
  ],
  chungbuk: [
    { courtIdx: 8, description: "충북의 기본 관할" },
    { courtIdx: 7, description: "법률상 추가 신청 가능" },
  ],
  chungnam: [{ courtIdx: 7, description: "충남 거주 기준" }],
  jeonbuk: [
    { courtIdx: 14, description: "전북의 기본 관할" },
    { courtIdx: 13, description: "법률상 추가 신청 가능" },
  ],
  jeonnam: [{ courtIdx: 13, description: "전남 거주 기준" }],
  gyeongbuk: [{ courtIdx: 9, description: "경북 거주 기준" }],
  gyeongnam: [
    { courtIdx: 11, description: "경남의 기본 관할" },
    { courtIdx: 10, description: "법률상 추가 신청 가능" },
  ],
  jeju: [
    { courtIdx: 15, description: "제주의 기본 관할" },
    { courtIdx: 13, description: "법률상 추가 신청 가능" },
  ],
};

export function getSelfDiagnosisCourtOptions(
  residenceRegion: SelfDiagnosisResidenceRegion,
) {
  return SELF_DIAGNOSIS_COURT_OPTIONS_BY_REGION[residenceRegion].map(
    (option) => ({
      ...option,
      name:
        SELF_DIAGNOSIS_COURTS.find(
          (court) => court.idx === option.courtIdx,
        )?.name ?? "관할법원 확인 필요",
    }),
  );
}

export const SELF_DIAGNOSIS_INCOME_TYPES = [
  { value: 1, label: "급여소득" },
  { value: 2, label: "사업소득" },
  { value: 3, label: "급여+사업소득" },
  { value: 4, label: "연금소득" },
  { value: 5, label: "생계급여" },
  { value: 6, label: "급여변동" },
  { value: 100, label: "기타" },
] as const;

export const SELF_DIAGNOSIS_RESIDENCE_TYPES = [
  { value: 1, label: "자가" },
  { value: 2, label: "사택·기숙사" },
  { value: 3, label: "임차(전·월세)" },
  { value: 4, label: "친족 소유 무상거주" },
  { value: 5, label: "친족 외 소유 무상거주" },
  { value: 100, label: "기타" },
] as const;

export const SELF_DIAGNOSIS_MARRIAGE_STATES = [
  { value: 1, label: "기혼" },
  { value: 2, label: "미혼" },
  { value: 3, label: "이혼" },
] as const;

export const SELF_DIAGNOSIS_LIVING_COST_TYPES = [
  { value: 0, label: "추가생계비 없음" },
  { value: 1, label: "생계비" },
  { value: 2, label: "주거비" },
  { value: 3, label: "의료비" },
  { value: 4, label: "교육비" },
  { value: 5, label: "식비" },
  { value: 6, label: "전기·가스·수도료" },
  { value: 7, label: "교통비·차량유지비" },
  { value: 8, label: "의복비" },
  { value: 9, label: "통신비" },
  { value: 100, label: "기타" },
] as const;

export const SELF_DIAGNOSIS_LIVING_COST_2026 = [
  0,
  1_538_543,
  2_519_575,
  3_215_422,
  3_896_843,
  4_534_031,
  5_133_571,
] as const;

const moneySchema = z.number().int().min(0).max(100_000_000_000);
export const SELF_DIAGNOSIS_MONEY_UNIT_WARNING_THRESHOLD = 100_000;
export const SELF_DIAGNOSIS_MONEY_UNIT_FIELDS = [
  "monthlyIncome",
  "unsecuredDebt",
  "securedDebt",
  "liquidationValue",
] as const;
export type SelfDiagnosisMoneyUnitField =
  (typeof SELF_DIAGNOSIS_MONEY_UNIT_FIELDS)[number];

export function needsSelfDiagnosisMoneyUnitConfirmation(value: number) {
  return value > 0 && value < SELF_DIAGNOSIS_MONEY_UNIT_WARNING_THRESHOLD;
}

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^010\d{8}$/));

export const selfDiagnosisAnswersSchema = z
  .object({
    residenceRegion: selfDiagnosisResidenceRegionSchema,
    courtIdx: z.number().int().min(1).max(15),
    monthlyIncome: moneySchema.max(100_000_000),
    incomeType: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(100),
    ]),
    residenceType: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(100),
    ]),
    marriageState: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    minorChildCount: z.number().int().min(0).max(10),
    unsecuredDebt: moneySchema,
    securedDebt: moneySchema,
    liquidationValue: moneySchema,
    priorityDebt: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.unsecuredDebt + value.securedDebt <= 0) {
      context.addIssue({
        code: "custom",
        message: "채무액을 입력해 주세요.",
        path: ["unsecuredDebt"],
      });
    }
    if (
      !SELF_DIAGNOSIS_COURT_OPTIONS_BY_REGION[value.residenceRegion].some(
        (option) => option.courtIdx === value.courtIdx,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "거주지역에 맞는 관할법원을 선택해 주세요.",
        path: ["courtIdx"],
      });
    }
  });

export const selfDiagnosisRecommendationSchema = z.enum([
  "personal_rehabilitation",
  "personal_bankruptcy_review",
]);

const selfDiagnosisCaseDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

/**
 * 고객 결과 화면에 표시한 유사사례 카드의 비식별 스냅샷이다.
 * 원천 사건 ID·사건번호·이름·전화번호는 이 계약에 포함하지 않는다.
 */
export const selfDiagnosisMatchSchema = z
  .object({
    caseType: z.union([z.literal(1), z.literal(2)]),
    courtIdx: z.number().int().min(1).max(15),
    courtName: z.string().trim().min(1).max(50),
    monthlyIncome: moneySchema,
    incomeType: z.number().int().min(0).max(1_000),
    residenceType: z.number().int().min(0).max(1_000),
    marriageState: z.number().int().min(0).max(1_000),
    minorChildCount: z.number().int().min(0).max(100),
    dependentCount: z.number().min(0).max(100),
    totalDebt: moneySchema,
    liquidationValue: moneySchema,
    priorityDebt: z.boolean(),
    monthlyPayment: moneySchema,
    paymentCount: z.number().int().min(0).max(60),
    estimatedSpend: moneySchema,
    livingCostType: z.number().int().min(0).max(1_000),
    livingCostCost: moneySchema,
    totalPayment: moneySchema,
    repaymentRate: z.number().min(0).max(1_000),
    filingDate: selfDiagnosisCaseDateSchema,
    prohibitionDate: selfDiagnosisCaseDateSchema,
    commencementDate: selfDiagnosisCaseDateSchema,
    approvalDate: selfDiagnosisCaseDateSchema,
    bankruptcyDate: selfDiagnosisCaseDateSchema,
    dischargeDate: selfDiagnosisCaseDateSchema,
    rank: z.number().int().min(1).max(5),
    similarity: z.enum(["very_close", "close", "reference"]),
  })
  .strict();

export const selfDiagnosisRecordSchema = selfDiagnosisAnswersSchema.and(
  z
    .object({
      modelVersion: z.literal(SELF_DIAGNOSIS_MODEL_VERSION),
      recommendation: selfDiagnosisRecommendationSchema,
      recommendationReason: z.enum([
        "similar_rehabilitation_cases",
        "dependent_adjustment_needed",
        "income_below_one_person_living_cost",
        "repayment_constraints_not_met",
      ]),
      adjustedDependentCount: z.number().int().min(0).max(10),
      referenceLivingCost: moneySchema,
      availableMonthlyIncome: moneySchema,
      minimumRequiredTotalPayment: moneySchema,
      matchedCaseCount: z.number().int().min(0).max(5),
      // 이전 접수 원장과의 읽기 호환을 위해 optional로 두고, 신규 자가진단은 반드시 기록한다.
      matchedCases: z.array(selfDiagnosisMatchSchema).length(5).optional(),
    })
    .strict(),
);

export const selfDiagnosisSubmissionSchema = z
  .object({
    source: z.literal("homepage").default("homepage"),
    idempotencyKey: z.uuid(),
    phone: phoneSchema,
    name: consultationCustomerNameTextSchema(30).optional(),
    privacyNoticeVersion: z.literal(
      CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
    ),
    consentAgreedAt: z.iso.datetime({ offset: true }),
    attribution: consultationAttributionInputSchema,
    answers: selfDiagnosisAnswersSchema,
    confirmedMoneyUnitFields: z
      .array(z.enum(SELF_DIAGNOSIS_MONEY_UNIT_FIELDS))
      .max(SELF_DIAGNOSIS_MONEY_UNIT_FIELDS.length)
      .refine((fields) => new Set(fields).size === fields.length, {
        message: "금액 단위 확인 항목이 중복되었습니다.",
      })
      .default([]),
  })
  .strict()
  .superRefine((submission, context) => {
    for (const field of SELF_DIAGNOSIS_MONEY_UNIT_FIELDS) {
      if (
        needsSelfDiagnosisMoneyUnitConfirmation(submission.answers[field]) &&
        !submission.confirmedMoneyUnitFields.includes(field)
      ) {
        context.addIssue({
          code: "custom",
          message: "10만원 미만 금액의 원·만원 단위를 확인해 주세요.",
          path: ["confirmedMoneyUnitFields"],
        });
      }
    }
  });

export type SelfDiagnosisAnswers = z.infer<typeof selfDiagnosisAnswersSchema>;
export type SelfDiagnosisRecord = z.infer<typeof selfDiagnosisRecordSchema>;
export type SelfDiagnosisSubmission = z.infer<
  typeof selfDiagnosisSubmissionSchema
>;
export type SelfDiagnosisRecommendation = z.infer<
  typeof selfDiagnosisRecommendationSchema
>;

export type SelfDiagnosisCaseProfile = {
  id: string;
  caseType: 1 | 2;
  courtIdx: number;
  courtName: string;
  monthlyIncome: number;
  incomeType: number;
  residenceType: number;
  marriageState: number;
  minorChildCount: number;
  dependentCount: number;
  totalDebt: number;
  liquidationValue: number;
  priorityDebt: boolean;
  monthlyPayment: number;
  paymentCount: number;
  estimatedSpend: number;
  livingCostType: number;
  livingCostCost: number;
  totalPayment: number;
  repaymentRate: number;
  filingDate: string | null;
  prohibitionDate: string | null;
  commencementDate: string | null;
  approvalDate: string | null;
  bankruptcyDate: string | null;
  dischargeDate: string | null;
};

export type SelfDiagnosisMatch = Omit<SelfDiagnosisCaseProfile, "id"> & {
  rank: number;
  similarity: "very_close" | "close" | "reference";
};

export type SelfDiagnosisAssessment = {
  modelVersion: typeof SELF_DIAGNOSIS_MODEL_VERSION;
  recommendation: SelfDiagnosisRecommendation;
  recommendationReason:
    | "similar_rehabilitation_cases"
    | "dependent_adjustment_needed"
    | "income_below_one_person_living_cost"
    | "repayment_constraints_not_met";
  adjustedDependentCount: number;
  referenceLivingCost: number;
  availableMonthlyIncome: number;
  minimumRequiredTotalPayment: number;
  matches: SelfDiagnosisMatch[];
};

export type SelfDiagnosisSubmissionResponse = {
  publicReceiptCode: string;
  acceptedAt: string;
  dedupeOutcome:
    | "new"
    | "exact_duplicate"
    | "identity_enrichment"
    | "repeat_unassigned"
    | "repeat_assigned"
    | "suspected_duplicate";
  replayed: boolean;
  assessment: SelfDiagnosisAssessment;
};

function livingCost(dependentCount: number): number {
  const householdSize = Math.min(6, Math.max(1, dependentCount + 1));
  return (
    SELF_DIAGNOSIS_LIVING_COST_2026[householdSize] ??
    SELF_DIAGNOSIS_LIVING_COST_2026[1]
  );
}

function logarithmicDistance(left: number, right: number): number {
  return Math.abs(Math.log((left + 100_000) / (right + 100_000)));
}

function scoreProfile(
  answers: SelfDiagnosisAnswers,
  profile: SelfDiagnosisCaseProfile,
  adjustedDependentCount: number,
): number {
  return (
    (profile.courtIdx === answers.courtIdx ? 0 : 1.6) +
    logarithmicDistance(profile.monthlyIncome, answers.monthlyIncome) * 10 +
    (profile.incomeType === answers.incomeType ? 0 : 1.8) +
    (profile.residenceType === answers.residenceType ? 0 : 0.45) +
    (profile.marriageState === answers.marriageState ? 0 : 1.4) +
    Math.min(3, Math.abs(profile.minorChildCount - answers.minorChildCount)) *
      8 +
    Math.min(3, Math.abs(profile.dependentCount - (adjustedDependentCount + 1))) *
      0.9 +
    logarithmicDistance(profile.totalDebt, answers.unsecuredDebt + answers.securedDebt) *
      1.1 +
    logarithmicDistance(profile.liquidationValue, answers.liquidationValue) *
      1.35
  );
}

type ScoredProfile = {
  profile: SelfDiagnosisCaseProfile;
  score: number;
};

function prioritizeComparableProfiles(
  answers: SelfDiagnosisAnswers,
  candidates: ScoredProfile[],
): ScoredProfile[] {
  const exactChildren = candidates.filter(
    ({ profile }) => profile.minorChildCount === answers.minorChildCount,
  );
  const exactIncomeAndChildren = exactChildren.filter(
    ({ profile }) => profile.monthlyIncome === answers.monthlyIncome,
  );
  const closeIncomeAndChildren = exactChildren.filter(({ profile }) => {
    if (profile.monthlyIncome <= 0) return false;
    const tolerance = Math.max(100_000, answers.monthlyIncome * 0.05);
    return Math.abs(profile.monthlyIncome - answers.monthlyIncome) <= tolerance;
  });

  const preferred =
    exactIncomeAndChildren.length >= 5
      ? exactIncomeAndChildren
      : closeIncomeAndChildren.length >= 5
        ? closeIncomeAndChildren
        : exactChildren.length >= 5
          ? exactChildren
          : candidates;

  return preferred.sort((left, right) => left.score - right.score);
}

function publicMatch(
  profile: SelfDiagnosisCaseProfile,
  rank: number,
  score: number,
): SelfDiagnosisMatch {
  const { id: _id, ...safeProfile } = profile;
  return {
    ...safeProfile,
    rank,
    similarity: score < 2.4 ? "very_close" : score < 4.8 ? "close" : "reference",
  };
}

export function assessSelfDiagnosis(
  rawAnswers: SelfDiagnosisAnswers,
  profiles: SelfDiagnosisCaseProfile[],
): SelfDiagnosisAssessment {
  const answers = selfDiagnosisAnswersSchema.parse(rawAnswers);
  const minimumRequiredTotalPayment = Math.max(
    answers.liquidationValue,
    Math.ceil(answers.unsecuredDebt * 0.03),
  );

  let adjustedDependentCount = answers.minorChildCount;
  while (
    adjustedDependentCount > 0 &&
    Math.max(0, answers.monthlyIncome - livingCost(adjustedDependentCount)) * 60 <
      minimumRequiredTotalPayment
  ) {
    adjustedDependentCount -= 1;
  }

  const referenceLivingCost = livingCost(adjustedDependentCount);
  const availableMonthlyIncome = Math.max(
    0,
    answers.monthlyIncome - referenceLivingCost,
  );
  const belowOnePersonLivingCost =
    answers.monthlyIncome <= SELF_DIAGNOSIS_LIVING_COST_2026[1];
  const planMeetsConstraints =
    availableMonthlyIncome > 0 &&
    availableMonthlyIncome * 60 >= minimumRequiredTotalPayment;

  const rehabilitationCandidates = prioritizeComparableProfiles(
    answers,
    profiles
      .filter(
        (profile) =>
          profile.caseType === 1 &&
          profile.priorityDebt === answers.priorityDebt &&
          profile.monthlyPayment > 0 &&
          profile.paymentCount >= 1 &&
          profile.paymentCount <= 60 &&
          profile.repaymentRate >= 3 &&
          profile.totalPayment >= profile.liquidationValue &&
          profile.totalPayment >= minimumRequiredTotalPayment &&
          profile.monthlyPayment <=
            Math.max(availableMonthlyIncome * 1.25, 100_000),
      )
      .map((profile) => ({
        profile,
        score: scoreProfile(answers, profile, adjustedDependentCount),
      })),
  );

  const useBankruptcy = belowOnePersonLivingCost || !planMeetsConstraints;
  const candidatePool = useBankruptcy
      ? prioritizeComparableProfiles(
          answers,
          profiles
            .filter(
              (profile) =>
                profile.caseType === 2 &&
                profile.totalDebt > 0 &&
                profile.bankruptcyDate !== null,
            )
            .map((profile) => ({
              profile,
              score:
                (profile.courtIdx === answers.courtIdx ? 0 : 1.8) +
                logarithmicDistance(
                  profile.totalDebt,
                  answers.unsecuredDebt + answers.securedDebt,
                ) *
                  2.4 +
                logarithmicDistance(
                  profile.liquidationValue,
                  answers.liquidationValue,
                ) *
                  1.2 +
                (profile.marriageState === answers.marriageState ? 0 : 0.8) +
                Math.min(
                  3,
                  Math.abs(profile.minorChildCount - answers.minorChildCount),
                ) *
                  0.5,
            })),
        )
    : rehabilitationCandidates;

  const recommendationReason = belowOnePersonLivingCost
    ? "income_below_one_person_living_cost"
    : !planMeetsConstraints
      ? "repayment_constraints_not_met"
      : adjustedDependentCount < answers.minorChildCount
        ? "dependent_adjustment_needed"
        : "similar_rehabilitation_cases";

  return {
    modelVersion: SELF_DIAGNOSIS_MODEL_VERSION,
    recommendation: useBankruptcy
      ? "personal_bankruptcy_review"
      : "personal_rehabilitation",
    recommendationReason,
    adjustedDependentCount,
    referenceLivingCost,
    availableMonthlyIncome,
    minimumRequiredTotalPayment,
    matches: candidatePool
      .slice(0, 5)
      .map(({ profile, score }, index) => publicMatch(profile, index + 1, score)),
  };
}
