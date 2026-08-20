import { z } from "zod";

export const desktopNotificationPreferenceKeys = [
  "consultation.unassigned",
  "consultation.assigned_repeat",
  "consultation.assignment",
  "phone.targeted_inbound",
  "phone.internal_transfer",
  "phone.all_external",
  "message.assigned_reply",
  "message.unmatched",
  "review.assigned_new",
] as const;

export const desktopNotificationPreferenceKeySchema = z.enum(
  desktopNotificationPreferenceKeys,
);

export type DesktopNotificationPreferenceKey = z.infer<
  typeof desktopNotificationPreferenceKeySchema
>;

export const desktopNotificationPreferenceDefaults = {
  "consultation.unassigned": false,
  "consultation.assigned_repeat": true,
  "consultation.assignment": true,
  "phone.targeted_inbound": true,
  "phone.internal_transfer": true,
  "phone.all_external": false,
  "message.assigned_reply": true,
  "message.unmatched": false,
  "review.assigned_new": true,
} as const satisfies Record<DesktopNotificationPreferenceKey, boolean>;

export const desktopNotificationPreferenceUpdateSchema = z
  .object({
    preferences: z
      .object({
        "consultation.unassigned": z.boolean(),
        "consultation.assigned_repeat": z.boolean(),
        "consultation.assignment": z.boolean(),
        "phone.targeted_inbound": z.boolean(),
        "phone.internal_transfer": z.boolean(),
        "phone.all_external": z.boolean(),
        "message.assigned_reply": z.boolean(),
        "message.unmatched": z.boolean(),
        "review.assigned_new": z.boolean(),
      })
      .strict(),
  })
  .strict();

export type DesktopNotificationPreferenceUpdate = z.infer<
  typeof desktopNotificationPreferenceUpdateSchema
>;

export const desktopNotificationPairingCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9_-]{43}$/,
    "PC 연결 코드 형식이 올바르지 않습니다.",
  );

export const desktopNotificationDeviceTokenSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{43}$/,
    "PC 기기 인증 토큰 형식이 올바르지 않습니다.",
  );

export const desktopNotificationPairingExchangeSchema = z
  .object({
    pairingCode: desktopNotificationPairingCodeSchema,
    deviceName: z
      .string()
      .trim()
      .min(1, "컴퓨터 이름이 필요합니다.")
      .max(100, "컴퓨터 이름은 100자 이하여야 합니다.")
      .refine(
        (value) =>
          Array.from(value).every((character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return codePoint > 31 && codePoint !== 127;
          }),
        "컴퓨터 이름에는 제어 문자를 사용할 수 없습니다.",
      ),
    platform: z.literal("windows"),
    appVersion: z
      .string()
      .trim()
      .regex(
        /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/,
        "PC 알림 프로그램 버전 형식이 올바르지 않습니다.",
      )
      .max(40),
  })
  .strict();

export const desktopNotificationDeliveryAckSchema = z
  .object({
    deliveryId: z.uuid("PC 알림 전달 ID 형식이 올바르지 않습니다."),
    outcome: z.enum(["displayed", "opened"]),
  })
  .strict();

export type DesktopNotificationPairingExchange = z.infer<
  typeof desktopNotificationPairingExchangeSchema
>;

export type DesktopNotificationDeliveryAck = z.infer<
  typeof desktopNotificationDeliveryAckSchema
>;
