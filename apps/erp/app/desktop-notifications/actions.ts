"use server";

import { revalidatePath } from "next/cache";

import {
  desktopNotificationPreferenceDefaults,
  desktopNotificationPreferenceKeys,
} from "@lawand/core";
import type { DesktopNotificationPreferenceUpdate } from "@lawand/core";

import {
  createDesktopNotificationPairing,
  DesktopNotificationGatewayError,
  revokeDesktopNotificationDevice,
  sendDesktopNotificationTest,
  updateDesktopNotificationPreferences,
} from "../../lib/gateway";
import { requireAdmin } from "../../lib/session";

export type DesktopNotificationActionState = {
  status: "idle" | "success" | "error";
  message: string;
  pairingCode: string;
  expiresAt: string;
  queuedDeviceCount: number;
};

export type DesktopNotificationPreferenceActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialDesktopNotificationActionState: DesktopNotificationActionState = {
  status: "idle",
  message: "",
  pairingCode: "",
  expiresAt: "",
  queuedDeviceCount: 0,
};

function actionError(error: unknown): DesktopNotificationActionState {
  return {
    ...initialDesktopNotificationActionState,
    status: "error",
    message:
      error instanceof DesktopNotificationGatewayError
        ? error.message
        : "PC 알림 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}

export async function createDesktopNotificationPairingAction(
  _previousState: DesktopNotificationActionState,
): Promise<DesktopNotificationActionState> {
  void _previousState;
  await requireAdmin();
  try {
    const pairing = await createDesktopNotificationPairing();
    return {
      status: "success",
      message:
        "LAW& OS PC 알림 프로그램에 아래 일회용 연결 코드를 붙여넣어 주세요.",
      pairingCode: pairing.pairingCode,
      expiresAt: pairing.expiresAt,
      queuedDeviceCount: 0,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function sendDesktopNotificationTestAction(
  _previousState: DesktopNotificationActionState,
): Promise<DesktopNotificationActionState> {
  void _previousState;
  await requireAdmin();
  try {
    const result = await sendDesktopNotificationTest();
    revalidatePath("/desktop-notifications");
    return {
      ...initialDesktopNotificationActionState,
      status: "success",
      message: `연결된 컴퓨터 ${result.queuedDeviceCount}대에 테스트 알림을 보냈습니다.`,
      queuedDeviceCount: result.queuedDeviceCount,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeDesktopNotificationDeviceAction(
  _previousState: DesktopNotificationActionState,
  formData: FormData,
): Promise<DesktopNotificationActionState> {
  await requireAdmin();
  const deviceId = formData.get("deviceId");
  if (
    typeof deviceId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      deviceId,
    )
  ) {
    return {
      ...initialDesktopNotificationActionState,
      status: "error",
      message: "해제할 컴퓨터 정보가 올바르지 않습니다.",
    };
  }
  try {
    await revokeDesktopNotificationDevice(deviceId);
    revalidatePath("/desktop-notifications");
    return {
      ...initialDesktopNotificationActionState,
      status: "success",
      message: "컴퓨터 연결을 해제했습니다.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveDesktopNotificationPreferencesAction(
  _previousState: DesktopNotificationPreferenceActionState,
  formData: FormData,
): Promise<DesktopNotificationPreferenceActionState> {
  void _previousState;
  await requireAdmin();
  const preferences: DesktopNotificationPreferenceUpdate["preferences"] = {
    ...desktopNotificationPreferenceDefaults,
  };
  for (const eventKey of desktopNotificationPreferenceKeys) {
    preferences[eventKey] = formData.get(eventKey) === "on";
  }
  try {
    await updateDesktopNotificationPreferences(preferences);
    revalidatePath("/desktop-notifications");
    return {
      status: "success",
      message: "개인 PC 알림 설정을 저장했습니다.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof DesktopNotificationGatewayError
          ? error.message
          : "PC 알림 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
