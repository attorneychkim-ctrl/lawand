import { z } from "zod";

import { consultationAttributionInputSchema } from "./attribution.js";

export const CURRENT_KAKAO_HOMEPAGE_ENTRY_NOTICE_VERSION =
  "2026-07-30.kakao-homepage-entry.1";

export const kakaoHomepageEntryStatusSchema = z.enum([
  "pending",
  "confirmed",
  "invalid",
]);

export const kakaoHomepageEntrySubmissionSchema = z
  .object({
    source: z.literal("homepage_kakao"),
    idempotencyKey: z.uuid(),
    attribution: consultationAttributionInputSchema.optional(),
  })
  .strict();

export const kakaoHomepageEntryReceiptSchema = z
  .object({
    publicReceiptCode: z.string().regex(/^LA-\d{6}-[23456789A-HJ-NP-Z]{8}$/),
    acceptedAt: z.iso.datetime({ offset: true }),
    status: kakaoHomepageEntryStatusSchema,
    replayed: z.boolean(),
  })
  .strict();

export const kakaoHomepageEntryConfirmationSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "카카오 채팅방에 표시된 고객명을 입력해 주세요.")
      .max(40, "고객명은 40자 이하로 입력해 주세요.")
      .refine(
        (value) =>
          [...value].every((character) => {
            const codePoint = character.codePointAt(0);
            return codePoint !== undefined && codePoint > 31 && codePoint !== 127;
          }),
        "고객명에는 제어 문자를 사용할 수 없습니다.",
      ),
  })
  .strict();

export type KakaoHomepageEntryStatus = z.infer<
  typeof kakaoHomepageEntryStatusSchema
>;
export type KakaoHomepageEntrySubmission = z.infer<
  typeof kakaoHomepageEntrySubmissionSchema
>;
export type KakaoHomepageEntryReceipt = z.infer<
  typeof kakaoHomepageEntryReceiptSchema
>;
export type KakaoHomepageEntryConfirmation = z.infer<
  typeof kakaoHomepageEntryConfirmationSchema
>;
