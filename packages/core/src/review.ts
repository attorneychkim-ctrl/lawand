import { z } from "zod";

export const CURRENT_REVIEW_PRIVACY_NOTICE_VERSION = "2026-07-29.1";
export const CURRENT_REVIEW_PUBLICATION_CONSENT_VERSION = "2026-07-29.1";

export const reviewPracticeAreaSchema = z.enum([
  "personal_rehabilitation",
  "personal_bankruptcy",
  "other",
]);

export const reviewProgressStageSchema = z.enum([
  "consultation",
  "commencement",
  "discharge",
  "other",
]);

export const reviewExperienceKeywordSchema = z.enum([
  "친절",
  "세심",
  "꼼꼼",
  "신뢰",
  "든든",
  "정확",
  "빠름",
  "체계적",
]);

const reviewPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^010\d{8}$/, "010으로 시작하는 휴대전화 번호를 입력해 주세요."));

export const reviewSubmissionSchema = z
  .object({
    source: z.literal("homepage").default("homepage"),
    idempotencyKey: z.uuid(),
    practiceArea: reviewPracticeAreaSchema,
    progressStage: reviewProgressStageSchema,
    experienceKeywords: z
      .array(reviewExperienceKeywordSchema)
      .min(1, "도움을 느낀 점을 하나 이상 골라 주세요.")
      .max(3, "도움을 느낀 점은 세 개까지 고를 수 있습니다.")
      .refine((values) => new Set(values).size === values.length, {
        message: "같은 경험 키워드를 중복해서 고를 수 없습니다.",
      }),
    authorDisplay: z
      .string()
      .trim()
      .min(2, "공개 이름을 두 글자 이상 입력해 주세요.")
      .max(20, "공개 이름은 스무 글자까지 입력할 수 있습니다."),
    content: z
      .string()
      .trim()
      .min(20, "후기를 스무 글자 이상 남겨 주세요.")
      .max(3_000, "후기는 3,000자까지 남길 수 있습니다."),
    phone: reviewPhoneSchema,
    privacyNoticeVersion: z.literal(CURRENT_REVIEW_PRIVACY_NOTICE_VERSION),
    publicationConsentVersion: z.literal(
      CURRENT_REVIEW_PUBLICATION_CONSENT_VERSION,
    ),
    consentAgreedAt: z.iso.datetime({ offset: true }),
    privacyConsent: z.literal(true),
    publicationConsent: z.literal(true),
    website: z.literal("").optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (/\d{7,}|@/.test(value.authorDisplay)) {
      context.addIssue({
        code: "custom",
        message: "공개 이름에는 연락처나 이메일을 입력할 수 없습니다.",
        path: ["authorDisplay"],
      });
    }
  });

export const reviewSubmissionResponseSchema = z
  .object({
    publicReceiptCode: z.string().regex(/^RV-\d{6}-[23456789A-HJ-NP-Z]{8}$/),
    acceptedAt: z.iso.datetime({ offset: true }),
    status: z.literal("pending_review"),
    replayed: z.boolean(),
  })
  .strict();

export function detectReviewPiiFlags(value: string): string[] {
  const checks: Array<[string, RegExp]> = [
    ["phone", /(?:^|[^\d])01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}(?:[^\d]|$)/u],
    ["email", /[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu],
    [
      "resident_registration_number",
      /(?:^|[^\d])\d{6}[-\s]?[1-8]\d{6}(?:[^\d]|$)/u,
    ],
    ["case_number", /20\d{2}\s*[가-힣]{1,8}\s*\d{3,}/u],
    [
      "account_number",
      /(?:계좌|은행|입금)[^\n\d]{0,12}\d{2,6}[-\s]\d{2,6}[-\s]\d{2,8}/u,
    ],
    [
      "detailed_address",
      /(?:서울|부산|대전|대구|인천|광주|울산|세종|제주|경기|강원|충청|경상|전라)[^\n]{0,30}(?:구|군|시)\s+[가-힣\d-]{2,}\s*(?:로|길|동)\s*\d+/u,
    ],
  ];

  return checks
    .filter(([, pattern]) => pattern.test(value))
    .map(([flag]) => flag);
}

export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;
export type ReviewSubmissionResponse = z.infer<
  typeof reviewSubmissionResponseSchema
>;
