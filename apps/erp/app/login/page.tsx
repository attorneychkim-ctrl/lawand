import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "../_components/login-form";
import { LawandOsBrand } from "../_components/lawand-os-brand";
import { getCurrentStaff } from "../../lib/session";

export const metadata: Metadata = {
  title: "직원 로그인",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ passwordChanged?: string }>;
}) {
  if (await getCurrentStaff()) redirect("/");
  const { passwordChanged } = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <LawandOsBrand className="auth-brand-lockup" />
        <p className="eyebrow">SECURE STAFF ACCESS</p>
        <h1>직원 로그인</h1>
        <p className="auth-lead">
          초대받아 등록된 법무법인 로앤 직원만 이용할 수 있습니다.
        </p>
        {passwordChanged === "1" ? (
          <p className="form-success auth-success" role="status">
            비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인해 주세요.
          </p>
        ) : null}
        <LoginForm />
        <p className="auth-note">
          계정이 없다면 LAW&amp; OS 관리자에게 직원 초대를 요청해 주세요.
        </p>
      </section>
    </main>
  );
}
