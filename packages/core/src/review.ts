import { z } from "zod";

import {
  CENTREX_LMS_MAX_BYTES,
  centrexMessageByteLength,
} from "./telephony.js";

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
    requestToken: z
      .string()
      .trim()
      .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/i,
        "후기 요청 링크가 올바르지 않습니다.",
      )
      .optional(),
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

export const reviewRestrictionReasonSchema = z.enum([
  "privacy",
  "unverified",
  "abusive_or_manipulated",
  "customer_request",
  "duplicate",
  "other",
]);

export const reviewModerationSchema = z
  .object({
    action: z.enum(["publish", "restrict"]),
    reason: reviewRestrictionReasonSchema.nullable().default(null),
    note: z.string().trim().max(500).nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === "restrict" && !value.reason) {
      context.addIssue({
        code: "custom",
        message: "공개 제한 사유를 선택해 주세요.",
        path: ["reason"],
      });
    }
    if (value.action === "publish" && (value.reason || value.note)) {
      context.addIssue({
        code: "custom",
        message: "공개로 변경할 때는 제한 사유를 남길 수 없습니다.",
        path: ["reason"],
      });
    }
    if (value.reason === "other" && !value.note) {
      context.addIssue({
        code: "custom",
        message: "기타 사유의 내용을 입력해 주세요.",
        path: ["note"],
      });
    }
  });

export const reviewReplyUpsertSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(2, "답글을 두 글자 이상 입력해 주세요.")
      .max(3_000, "답글은 3,000자까지 입력할 수 있습니다."),
  })
  .strict();

export const reviewCustomerLinkSchema = z
  .object({
    clientIdx: z.number().int().positive(),
    caseIdx: z.number().int().positive(),
  })
  .strict();

export const REVIEW_REQUEST_TEMPLATE_VARIABLES = [
  "{{고객명}}",
  "{{담당자명}}",
  "{{사건번호}}",
  "{{후기작성링크}}",
] as const;

export type ReviewRequestTemplateVariable =
  (typeof REVIEW_REQUEST_TEMPLATE_VARIABLES)[number];

function reviewRequestTemplateVariables(value: string): string[] {
  return value.match(/\{\{[^{}]+\}\}/g) ?? [];
}

function validateReviewRequestTemplateBody(
  value: string,
  context: z.RefinementCtx,
) {
  for (const variable of reviewRequestTemplateVariables(value)) {
    if (
      !(REVIEW_REQUEST_TEMPLATE_VARIABLES as readonly string[]).includes(
        variable,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: `허용되지 않은 후기 요청 변수입니다: ${variable}`,
      });
    }
  }
  if (!value.includes("{{후기작성링크}}")) {
    context.addIssue({
      code: "custom",
      message: "후기 요청 템플릿에는 {{후기작성링크}}가 필요합니다.",
    });
  }
  // 실제 링크와 고객 정보를 치환할 여유를 남긴다.
  if (centrexMessageByteLength(value) > 500) {
    context.addIssue({
      code: "custom",
      message: "후기 요청 템플릿은 링크 치환 전 500바이트 이하여야 합니다.",
    });
  }
}

const reviewRequestTemplateBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(CENTREX_LMS_MAX_BYTES)
  .superRefine(validateReviewRequestTemplateBody);

export const reviewRequestTemplateCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    body: reviewRequestTemplateBodySchema,
  })
  .strict();

export const reviewRequestTemplateUpdateSchema =
  reviewRequestTemplateCreateSchema;

export const reviewRequestBatchSendSchema = z
  .object({
    templateId: z.uuid(),
    targets: z
      .array(
        z
          .object({
            clientIdx: z.number().int().positive(),
            caseIdx: z.number().int().positive(),
            idempotencyKey: z.uuid(),
          })
          .strict(),
      )
      .min(1, "후기를 요청할 고객을 한 명 이상 선택해 주세요.")
      .max(30, "후기 요청 문자는 한 번에 30명까지 보낼 수 있습니다."),
  })
  .strict()
  .superRefine((value, context) => {
    const targets = value.targets.map(
      (target) => `${target.clientIdx}:${target.caseIdx}`,
    );
    if (new Set(targets).size !== targets.length) {
      context.addIssue({
        code: "custom",
        message: "같은 고객 사건을 중복 선택할 수 없습니다.",
        path: ["targets"],
      });
    }
  });

export function renderReviewRequestTemplate(
  body: string,
  values: Record<ReviewRequestTemplateVariable, string>,
): string {
  return REVIEW_REQUEST_TEMPLATE_VARIABLES.reduce(
    (rendered, variable) => rendered.replaceAll(variable, values[variable]),
    body,
  );
}

export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;
export type ReviewSubmissionResponse = z.infer<
  typeof reviewSubmissionResponseSchema
>;
export type ReviewRestrictionReason = z.infer<
  typeof reviewRestrictionReasonSchema
>;
export type ReviewModeration = z.infer<typeof reviewModerationSchema>;
export type ReviewReplyUpsert = z.infer<typeof reviewReplyUpsertSchema>;
export type ReviewCustomerLink = z.infer<typeof reviewCustomerLinkSchema>;
export type ReviewRequestTemplateCreate = z.infer<
  typeof reviewRequestTemplateCreateSchema
>;
export type ReviewRequestTemplateUpdate = z.infer<
  typeof reviewRequestTemplateUpdateSchema
>;
export type ReviewRequestBatchSend = z.infer<
  typeof reviewRequestBatchSendSchema
>;
