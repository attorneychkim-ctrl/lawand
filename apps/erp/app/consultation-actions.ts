"use server";

import { revalidatePath } from "next/cache";

import { consultationAssigneeTransferInputSchema } from "@lawand/core";

import {
  assignConsultationToMe,
  confirmKakaoHomepageEntry,
  ConsultationGatewayError,
  invalidateLegalFriendsCase,
  invalidateKakaoHomepageEntry,
  requestConsultationAssigneeTransfer,
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

export type LegalFriendsInvalidationActionState = {
  error: string;
};

export async function invalidateLegalFriendsCaseAction(
  consultationId: string,
  previousState: LegalFriendsInvalidationActionState,
): Promise<LegalFriendsInvalidationActionState> {
  void previousState;
  await requireStaff();
  try {
    await invalidateLegalFriendsCase(consultationId);
  } catch (error) {
    return {
      error:
        error instanceof ConsultationGatewayError
          ? error.message
          : "무효 처리를 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  revalidatePath("/");
  revalidatePath(`/consultations/${consultationId}`);
  return { error: "" };
}

export type ConsultationAssigneeTransferActionState = {
  error: string;
  eventId: string;
};

export async function requestConsultationAssigneeTransferAction(
  consultationId: string,
  previousState: ConsultationAssigneeTransferActionState,
  formData: FormData,
): Promise<ConsultationAssigneeTransferActionState> {
  void previousState;
  await requireStaff();
  const parsed = consultationAssigneeTransferInputSchema.safeParse({
    targetStaffUserId: String(formData.get("targetStaffUserId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) {
    return { error: "새 담당자와 변경 사유를 선택해 주세요.", eventId: "" };
  }
  try {
    const result = await requestConsultationAssigneeTransfer(
      consultationId,
      parsed.data,
    );
    revalidatePath("/");
    revalidatePath(`/consultations/${consultationId}`);
    return { error: "", eventId: result.eventId };
  } catch (error) {
    return {
      error:
        error instanceof ConsultationGatewayError
          ? error.message
          : "담당자 변경을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      eventId: "",
    };
  }
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
