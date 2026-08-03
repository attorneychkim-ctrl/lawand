import { z } from "zod";

export const CURRENT_KAKAO_CONSULTATION_NOTICE_VERSION =
  "2026-07-30.kakao.1";

const kakaoUserPropertiesSchema = z
  .object({
    botUserKey: z.string().trim().min(1).max(200).optional(),
    plusfriendUserKey: z.string().trim().min(1).max(200).optional(),
    isFriend: z.boolean().optional(),
  })
  .passthrough();

export const kakaoSkillRequestSchema = z
  .object({
    bot: z
      .object({
        id: z.string().trim().min(1).max(200),
        name: z.string().trim().max(200).optional(),
      })
      .passthrough(),
    userRequest: z
      .object({
        utterance: z.string().trim().max(1_000),
        user: z
          .object({
            id: z.string().trim().min(1).max(200),
            type: z.string().trim().max(50).optional(),
            properties: kakaoUserPropertiesSchema.optional(),
          })
          .passthrough(),
      })
      .passthrough(),
    action: z
      .object({
        clientExtra: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const kakaoConsultationReceiptSchema = z
  .object({
    publicReceiptCode: z.string().regex(/^LA-\d{6}-[23456789A-HJ-NP-Z]{8}$/),
    acceptedAt: z.iso.datetime({ offset: true }),
    replayed: z.boolean(),
  })
  .strict();

export const kakaoSkillResponseSchema = z
  .object({
    version: z.literal("2.0"),
    template: z
      .object({
        outputs: z
          .array(
            z
              .object({
                simpleText: z
                  .object({
                    text: z.string().trim().min(1).max(1_000),
                  })
                  .strict(),
              })
              .strict(),
          )
          .min(1)
          .max(3),
      })
      .strict(),
  })
  .strict();

export type KakaoSkillRequest = z.infer<typeof kakaoSkillRequestSchema>;
export type KakaoConsultationReceipt = z.infer<
  typeof kakaoConsultationReceiptSchema
>;
export type KakaoSkillResponse = z.infer<typeof kakaoSkillResponseSchema>;

export function kakaoSkillUserKey(request: KakaoSkillRequest): string {
  return (
    request.userRequest.user.properties?.plusfriendUserKey ??
    request.userRequest.user.properties?.botUserKey ??
    request.userRequest.user.id
  );
}

export function createKakaoSkillResponse(
  receipt: KakaoConsultationReceipt,
): KakaoSkillResponse {
  const lead = receipt.replayed
    ? "이미 접수된 상담입니다."
    : "상담 요청이 정상적으로 접수되었습니다.";
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text: [
              "[법무법인 로앤]",
              "",
              lead,
              `접수 번호: ${receipt.publicReceiptCode}`,
              "",
              "전화번호가 아직 없어 알림톡은 발송되지 않습니다.",
              "담당자가 이 채팅방에서 이어서 안내드리겠습니다.",
              "상담 운영시간: 평일 08시~19시",
            ].join("\n"),
          },
        },
      ],
    },
  };
}
