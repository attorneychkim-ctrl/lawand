import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  fetchStaffSession,
  StaffGatewayError,
  type StaffPrincipal,
} from "./staff-auth";

const STAFF_SESSION_COOKIE = "lawand_erp_staff_session";

export async function readStaffSessionToken(): Promise<string | null> {
  return (await cookies()).get(STAFF_SESSION_COOKIE)?.value ?? null;
}

export async function setStaffSessionCookie(
  token: string,
  expiresAt: string,
): Promise<void> {
  (await cookies()).set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
    priority: "high",
  });
}

export async function clearStaffSessionCookie(): Promise<void> {
  (await cookies()).delete(STAFF_SESSION_COOKIE);
}

export async function getCurrentStaff(): Promise<StaffPrincipal | null> {
  const token = await readStaffSessionToken();
  if (!token) return null;
  try {
    return await fetchStaffSession(token);
  } catch (error) {
    if (error instanceof StaffGatewayError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function requireStaff(): Promise<StaffPrincipal> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

export async function requireAdmin(): Promise<StaffPrincipal> {
  const staff = await requireStaff();
  if (!staff.roles.includes("admin")) redirect("/");
  return staff;
}
