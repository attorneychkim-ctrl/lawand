import { z } from "zod";

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
