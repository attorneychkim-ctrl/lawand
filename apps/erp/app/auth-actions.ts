"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  acceptStaffInvitation,
  createStaffInvitation,
  loginStaff,
  logoutStaff,
  reassignStaffCentrexBridge,
  StaffGatewayError,
  type StaffRole,
  updateStaffCentrexLineNumber,
  updateStaffLegalFriendsAccount,
} from "../lib/staff-auth";
import {
  clearStaffSessionCookie,
  readStaffSessionToken,
  requireAdmin,
  setStaffSessionCookie,
} from "../lib/session";

export type AuthActionState = {
  error: string;
};

export type InvitationActionState = {
  error: string;
  invitationUrl: string;
  expiresAt: string;
};

export type LegalFriendsAccountActionState = {
  error: string;
  saved: boolean;
};

export type CentrexLineActionState = {
  error: string;
  saved: boolean;
  verified: boolean;
  bridgeConnected: boolean;
  reassigned: boolean;
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown): string {
  if (error instanceof StaffGatewayError) return error.message;
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    const result = await loginStaff({
      email: field(formData, "email"),
      password: field(formData, "password"),
    });
    await setStaffSessionCookie(result.sessionToken, result.expiresAt);
  } catch (error) {
    return { error: errorMessage(error) };
  }
  redirect("/");
}

export async function acceptInvitationAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = field(formData, "password");
  if (password !== field(formData, "passwordConfirmation")) {
    return { error: "비밀번호 확인이 일치하지 않습니다." };
  }
  try {
    const result = await acceptStaffInvitation({
      token: field(formData, "token"),
      password,
    });
    await setStaffSessionCookie(result.sessionToken, result.expiresAt);
  } catch (error) {
    return { error: errorMessage(error) };
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const token = await readStaffSessionToken();
  if (token) {
    try {
      await logoutStaff(token);
    } catch {
      // 쿠키는 항상 제거해 이 브라우저의 세션을 종료한다.
    }
  }
  await clearStaffSessionCookie();
  redirect("/login");
}

export async function createInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  await requireAdmin();
  const token = await readStaffSessionToken();
  if (!token) {
    return {
      error: "로그인이 만료되었습니다.",
      invitationUrl: "",
      expiresAt: "",
    };
  }
  try {
    const legalFriendsId = field(formData, "legalFriendsId").trim();
    const legalFriendsMemberIdx = field(
      formData,
      "legalFriendsMemberIdx",
    ).trim();
    const centrexLineNumber = field(
      formData,
      "centrexLineNumber",
    ).trim();
    const centrexExtension = field(
      formData,
      "centrexExtension",
    ).trim();
    const invitation = await createStaffInvitation(token, {
      email: field(formData, "email"),
      name: field(formData, "name"),
      organization: field(formData, "organization") as
        | "lawand"
        | "legalflow",
      region: field(formData, "region") as
        | "seoul"
        | "daejeon"
        | "busan",
      department: field(formData, "department"),
      jobTitle: field(formData, "jobTitle"),
      role: field(formData, "role") as StaffRole,
      ...(centrexLineNumber || centrexExtension
        ? {
            centrexLineNumber,
            centrexExtension,
          }
        : {}),
      ...(legalFriendsId
        ? {
            legalFriendsId,
            legalFriendsMemberIdx: Number(legalFriendsMemberIdx),
          }
        : {}),
    });
    const baseUrl =
      process.env.LAWAND_ERP_BASE_URL ?? "http://127.0.0.1:3021";
    return {
      error: "",
      invitationUrl: `${baseUrl.replace(/\/$/, "")}/invitations/${invitation.token}`,
      expiresAt: invitation.expiresAt,
    };
  } catch (error) {
    return {
      error: errorMessage(error),
      invitationUrl: "",
      expiresAt: "",
    };
  }
}

export async function updateCentrexLineAction(
  _previousState: CentrexLineActionState,
  formData: FormData,
): Promise<CentrexLineActionState> {
  await requireAdmin();
  const token = await readStaffSessionToken();
  if (!token) {
    return {
      error: "로그인이 만료되었습니다.",
      saved: false,
      verified: false,
      bridgeConnected: false,
      reassigned: false,
    };
  }

  if (field(formData, "intent") === "reassign") {
    try {
      await reassignStaffCentrexBridge(
        token,
        field(formData, "staffUserId"),
      );
      revalidatePath("/staff");
      return {
        error: "",
        saved: false,
        verified: false,
        bridgeConnected: false,
        reassigned: true,
      };
    } catch (error) {
      return {
        error: errorMessage(error),
        saved: false,
        verified: false,
        bridgeConnected: false,
        reassigned: false,
      };
    }
  }

  const lineNumber = field(formData, "centrexLineNumber").trim();
  const extension = field(formData, "centrexExtension").trim();
  const password = field(formData, "centrexPassword");
  try {
    const result = await updateStaffCentrexLineNumber(
      token,
      field(formData, "staffUserId"),
      lineNumber || null,
      extension || null,
      password || null,
    );
    revalidatePath("/staff");
    return {
      error: "",
      saved: true,
      verified: result.credentialUpdated,
      bridgeConnected: result.bridgeConnected,
      reassigned: false,
    };
  } catch (error) {
    return {
      error: errorMessage(error),
      saved: false,
      verified: false,
      bridgeConnected: false,
      reassigned: false,
    };
  }
}

export async function updateLegalFriendsAccountAction(
  _previousState: LegalFriendsAccountActionState,
  formData: FormData,
): Promise<LegalFriendsAccountActionState> {
  await requireAdmin();
  const token = await readStaffSessionToken();
  if (!token) return { error: "로그인이 만료되었습니다.", saved: false };

  const accountId = field(formData, "legalFriendsId").trim();
  const memberIdx = field(formData, "legalFriendsMemberIdx").trim();
  try {
    await updateStaffLegalFriendsAccount(
      token,
      field(formData, "staffUserId"),
      accountId || null,
      memberIdx ? Number(memberIdx) : null,
    );
    revalidatePath("/staff");
    return { error: "", saved: true };
  } catch (error) {
    return { error: errorMessage(error), saved: false };
  }
}
