import { z } from "zod";

import { consultationAttributionInputSchema } from "./attribution.js";
import { residenceRegionSchema } from "./intake.js";

export const CURRENT_KAKAO_HOMEPAGE_ENTRY_NOTICE_VERSION =
  "2026-08-13.kakao-homepage-entry.3";

const kakaoHomepageDisplayNameSchema = z
  .string()
  .trim()
  .min(1, "이름 또는 카카오톡 표시명을 입력해 주세요.")
  .max(40, "이름 또는 카카오톡 표시명은 40자 이하로 입력해 주세요.")
  .refine(
    (value) =>
      [...value].every((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && codePoint > 31 && codePoint !== 127;
      }),
    "이름 또는 카카오톡 표시명에는 제어 문자를 사용할 수 없습니다.",
  );

export const kakaoHomepageEntryStatusSchema = z.enum([
  "pending",
  "confirmed",
  "invalid",
]);

export const kakaoHomepageEntrySubmissionSchema = z
  .object({
    source: z.literal("homepage_kakao"),
    idempotencyKey: z.uuid(),
    displayName: kakaoHomepageDisplayNameSchema,
    residenceRegion: residenceRegionSchema,
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
    displayName: kakaoHomepageDisplayNameSchema,
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

export function kakaoHomepageEntryAssignmentPolicy(input: {
  status: KakaoHomepageEntryStatus;
  nameProvided: boolean;
}) {
  if (input.status === "confirmed") return "assign" as const;
  if (input.status === "pending" && input.nameProvided) {
    return "confirm_and_assign" as const;
  }
  return "blocked" as const;
}
