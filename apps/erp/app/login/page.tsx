import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "../_components/login-form";
import { getCurrentStaff } from "../../lib/session";

export const metadata: Metadata = {
  title: "직원 로그인 | 로앤 ERP",
};

export default async function LoginPage() {
  if (await getCurrentStaff()) redirect("/");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">LAWAND ERP · STAFF ONLY</p>
        <h1>직원 로그인</h1>
        <p className="auth-lead">
          초대받아 등록된 법무법인 로앤 직원만 이용할 수 있습니다.
        </p>
        <LoginForm />
        <p className="auth-note">
          계정이 없다면 ERP 관리자에게 직원 초대를 요청해 주세요.
        </p>
      </section>
    </main>
  );
}
