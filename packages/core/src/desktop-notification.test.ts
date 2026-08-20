import assert from "node:assert/strict";
import test from "node:test";

import {
  desktopNotificationDeliveryAckSchema,
  desktopNotificationDeviceTokenSchema,
  desktopNotificationPairingExchangeSchema,
  desktopNotificationPreferenceDefaults,
  desktopNotificationPreferenceKeys,
  desktopNotificationPreferenceUpdateSchema,
} from "./desktop-notification.js";

test("PC 알림 개인 설정은 모든 고정 이벤트를 빠짐없이 저장한다", () => {
  const preferences = { ...desktopNotificationPreferenceDefaults };
  assert.equal(
    desktopNotificationPreferenceUpdateSchema.safeParse({ preferences })
      .success,
    true,
  );
  assert.deepEqual(Object.keys(preferences), [
    ...desktopNotificationPreferenceKeys,
  ]);
  assert.equal(
    desktopNotificationPreferenceUpdateSchema.safeParse({
      preferences: {
        ...preferences,
        "consultation.assignment": "yes",
      },
    }).success,
    false,
  );
  const { [desktopNotificationPreferenceKeys[0]]: _missing, ...incomplete } =
    preferences;
  void _missing;
  assert.equal(
    desktopNotificationPreferenceUpdateSchema.safeParse({
      preferences: incomplete,
    }).success,
    false,
  );
});

test("Windows PC 연결은 일회용 코드와 제한된 기기 정보만 받는다", () => {
  assert.deepEqual(
    desktopNotificationPairingExchangeSchema.parse({
      pairingCode: "a".repeat(43),
      deviceName: "  LAWAND-DESK-01  ",
      platform: "windows",
      appVersion: "0.1.0",
    }),
    {
      pairingCode: "a".repeat(43),
      deviceName: "LAWAND-DESK-01",
      platform: "windows",
      appVersion: "0.1.0",
    },
  );

  assert.equal(
    desktopNotificationPairingExchangeSchema.safeParse({
      pairingCode: "short",
      deviceName: "LAWAND-DESK-01",
      platform: "windows",
      appVersion: "0.1.0",
    }).success,
    false,
  );
  assert.equal(
    desktopNotificationPairingExchangeSchema.safeParse({
      pairingCode: "a".repeat(43),
      deviceName: "LAWAND-DESK-01",
      platform: "macos",
      appVersion: "0.1.0",
    }).success,
    false,
  );
  assert.equal(
    desktopNotificationPairingExchangeSchema.safeParse({
      pairingCode: "a".repeat(43),
      deviceName: "업무 PC\n위조",
      platform: "windows",
      appVersion: "0.1.0",
    }).success,
    false,
  );
});

test("PC 인증 토큰과 전달 확인은 엄격한 계약만 허용한다", () => {
  assert.equal(
    desktopNotificationDeviceTokenSchema.parse("b".repeat(43)),
    "b".repeat(43),
  );
  assert.equal(
    desktopNotificationDeliveryAckSchema.safeParse({
      deliveryId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b1",
      outcome: "displayed",
    }).success,
    true,
  );
  assert.equal(
    desktopNotificationDeliveryAckSchema.safeParse({
      deliveryId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b1",
      outcome: "failed",
    }).success,
    false,
  );
});
