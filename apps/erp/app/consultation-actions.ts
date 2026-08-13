"use server";

import { revalidatePath } from "next/cache";

import {
  consultationAssigneeTransferInputSchema,
  consultationGroupLinkSchema,
} from "@lawand/core";

import {
  assignConsultationToMe,
  confirmKakaoHomepageEntry,
  ConsultationGatewayError,
  invalidateLegalFriendsCase,
  invalidateKakaoHomepageEntry,
  linkConsultationGroup,
  requestConsultationAssigneeTransfer,
  softDeleteStaffConsultation,
  splitConsultationGroup,
} from "../lib/gateway";
import { requireAdmin, requireStaff } from "../lib/session";

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

export type ConsultationSoftDeleteActionState = {
  error: string;
};

export async function softDeleteStaffConsultationAction(
  consultationId: string,
  previousState: ConsultationSoftDeleteActionState,
): Promise<ConsultationSoftDeleteActionState> {
  void previousState;
  await requireAdmin();
  try {
    await softDeleteStaffConsultation(consultationId);
  } catch (error) {
    return {
      error:
        error instanceof ConsultationGatewayError
          ? error.message
          : "상담을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  revalidatePath("/");
  revalidatePath(`/consultations/${consultationId}`);
  return { error: "" };
}

export type ConsultationGroupActionState = {
  error: string;
};

export async function linkConsultationGroupAction(
  consultationId: string,
  previousState: ConsultationGroupActionState,
  formData: FormData,
): Promise<ConsultationGroupActionState> {
  void previousState;
  await requireStaff();
  const parsed = consultationGroupLinkSchema.safeParse({
    targetReceiptCode: String(formData.get("targetReceiptCode") ?? "")
      .trim()
      .toUpperCase(),
  });
  if (!parsed.success) {
    return { error: "연결할 상담의 접수번호를 정확히 입력해 주세요." };
  }
  try {
    const result = await linkConsultationGroup(
      consultationId,
      parsed.data.targetReceiptCode,
    );
    revalidatePath("/");
    revalidatePath(`/consultations/${consultationId}`);
    revalidatePath(
      `/consultations/${result.canonicalConsultationId}`,
    );
  } catch (error) {
    return {
      error:
        error instanceof ConsultationGatewayError
          ? error.message
          : "상담을 묶지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  return { error: "" };
}

export async function splitConsultationGroupAction(
  consultationId: string,
  canonicalConsultationId: string,
  previousState: ConsultationGroupActionState,
): Promise<ConsultationGroupActionState> {
  void previousState;
  await requireStaff();
  try {
    await splitConsultationGroup(consultationId);
  } catch (error) {
    return {
      error:
        error instanceof ConsultationGatewayError
          ? error.message
          : "상담을 분리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  revalidatePath("/");
  revalidatePath(`/consultations/${consultationId}`);
  revalidatePath(`/consultations/${canonicalConsultationId}`);
  return { error: "" };
}
