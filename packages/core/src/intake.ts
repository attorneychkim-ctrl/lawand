import { z } from "zod";

import { consultationAttributionInputSchema } from "./attribution.js";
import { consultationModeSchema, dedupeOutcomeSchema } from "./consultation.js";

export const CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION = "2026-07-28.1";

export const residenceRegionSchema = z.enum([
  "seoul",
  "busan",
  "daegu",
  "incheon",
  "gwangju",
  "daejeon",
  "ulsan",
  "sejong",
  "gyeonggi",
  "gangwon",
  "chungbuk",
  "chungnam",
  "jeonbuk",
  "jeonnam",
  "gyeongbuk",
  "gyeongnam",
  "jeju",
  "overseas_or_other",
]);

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^010\d{8}$/));

const optionalAnswer = (maxLength: number) =>
  z.string().trim().max(maxLength).optional();

export const consultationIntakeAnswersSchema = z
  .object({
    residenceRegion: residenceRegionSchema,
    topic: optionalAnswer(100),
    urgencies: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
    incomes: z.array(z.string().trim().min(1).max(100)).max(6).default([]),
    unsecuredDebt: optionalAnswer(100),
    securedDebt: optionalAnswer(100),
    assets: optionalAnswer(100),
    discharge: optionalAnswer(100),
    dischargeYear: z.string().regex(/^\d{4}$/).optional(),
    concern: optionalAnswer(500),
  })
  .strict();

const asapContactSchema = z
  .object({
    preference: z.literal("as_soon_as_possible"),
  })
  .strict();

const scheduledContactSchema = z
  .object({
    preference: z.literal("scheduled_window"),
    windowStart: z.iso.datetime({ offset: true }),
    windowEnd: z.iso.datetime({ offset: true }),
  })
  .strict();

export const consultationSubmissionSchema = z
  .object({
    source: z.literal("homepage").default("homepage"),
    idempotencyKey: z.uuid(),
    mode: consultationModeSchema,
    phone: phoneSchema,
    name: z.string().trim().min(1).max(30).optional(),
    contact: z.discriminatedUnion("preference", [
      asapContactSchema,
      scheduledContactSchema,
    ]),
    privacyNoticeVersion: z.literal(
      CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
    ),
    consentAgreedAt: z.iso.datetime({ offset: true }),
    attribution: consultationAttributionInputSchema,
    intake: consultationIntakeAnswersSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "detailed") {
      const requiredAnswers = [
        value.intake.topic,
        value.intake.unsecuredDebt,
        value.intake.securedDebt,
        value.intake.assets,
        value.intake.discharge,
      ];
      if (
        requiredAnswers.some((answer) => !answer) ||
        value.intake.urgencies.length === 0 ||
        value.intake.incomes.length === 0
      ) {
        context.addIssue({
          code: "custom",
          message: "상세 상담의 필수 답변이 누락되었습니다.",
          path: ["intake"],
        });
      }
    }

    if (value.contact.preference === "scheduled_window") {
      const start = new Date(value.contact.windowStart);
      const end = new Date(value.contact.windowEnd);
      if (end.getTime() - start.getTime() !== 30 * 60 * 1_000) {
        context.addIssue({
          code: "custom",
          message: "연락 희망 구간은 30분이어야 합니다.",
          path: ["contact", "windowEnd"],
        });
      }

      const koreanTime = new Date(start.getTime() + 9 * 60 * 60 * 1_000);
      const weekday = koreanTime.getUTCDay();
      const hour = koreanTime.getUTCHours();
      const minute = koreanTime.getUTCMinutes();
      const isBusinessWindow =
        weekday >= 1 &&
        weekday <= 5 &&
        (minute === 0 || minute === 30) &&
        koreanTime.getUTCSeconds() === 0 &&
        hour >= 8 &&
        (hour < 18 || (hour === 18 && minute <= 30));
      if (!isBusinessWindow) {
        context.addIssue({
          code: "custom",
          message: "연락 희망 시간은 평일 08:00~19:00의 30분 구간이어야 합니다.",
          path: ["contact", "windowStart"],
        });
      }
    }
  });

export const consultationSubmissionResponseSchema = z
  .object({
    publicReceiptCode: z.string().regex(/^LA-\d{6}-[23456789A-HJ-NP-Z]{8}$/),
    acceptedAt: z.iso.datetime({ offset: true }),
    dedupeOutcome: dedupeOutcomeSchema,
    replayed: z.boolean(),
  })
  .strict();

export type ConsultationIntakeAnswers = z.infer<
  typeof consultationIntakeAnswersSchema
>;
export type ResidenceRegion = z.infer<typeof residenceRegionSchema>;
export type ConsultationSubmission = z.infer<
  typeof consultationSubmissionSchema
>;
export type ConsultationSubmissionResponse = z.infer<
  typeof consultationSubmissionResponseSchema
>;
