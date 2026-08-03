"use server";

import { revalidatePath } from "next/cache";

import {
  assignConsultationToMe,
  confirmKakaoHomepageEntry,
  ConsultationGatewayError,
  invalidateKakaoHomepageEntry,
} from "../lib/gateway";
import { requireStaff } from "../lib/session";

export type ConsultationAssignmentActionState = {
  error: string;
};

export async function assignConsultationToMeAction(
  consultationId: string,
  previousState: ConsultationAssignmentActionState,
): Promise<ConsultationAssignmentActionState> {
  void previousState;
  await requireStaff();
  try {
    await assignConsultationToMe(consultationId);
  } catch (error) {
    return {
      error:
        error instanceof ConsultationGatewayError
          ? error.message
          : "담당자를 지정하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  revalidatePath("/");
  revalidatePath(`/consultations/${consultationId}`);
  return { error: "" };
}

export type KakaoEntryActionState = {
  error: string;
};

function kakaoEntryError(error: unknown) {
  return error instanceof ConsultationGatewayError
    ? error.message
    : "카카오 상담 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function confirmKakaoHomepageEntryAction(
  consultationId: string,
  previousState: KakaoEntryActionState,
  formData: FormData,
): Promise<KakaoEntryActionState> {
  void previousState;
  await requireStaff();
  try {
    await confirmKakaoHomepageEntry(
      consultationId,
      String(formData.get("displayName") ?? ""),
    );
  } catch (error) {
    return { error: kakaoEntryError(error) };
  }
  revalidatePath("/");
  revalidatePath(`/consultations/${consultationId}`);
  return { error: "" };
}

export async function invalidateKakaoHomepageEntryAction(
  consultationId: string,
  previousState: KakaoEntryActionState,
): Promise<KakaoEntryActionState> {
  void previousState;
  await requireStaff();
  try {
    await invalidateKakaoHomepageEntry(consultationId);
  } catch (error) {
    return { error: kakaoEntryError(error) };
  }
  revalidatePath("/");
  revalidatePath(`/consultations/${consultationId}`);
  return { error: "" };
}
