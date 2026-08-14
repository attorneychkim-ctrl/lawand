import type { Metadata } from "next";
import Link from "next/link";

import { InvitationForm } from "../../_components/invitation-form";
import { LawandOsBrand } from "../../_components/lawand-os-brand";
import {
  inspectStaffInvitation,
  StaffGatewayError,
} from "../../../lib/staff-auth";

export const metadata: Metadata = {
  title: "직원 초대",
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let invitation;
  try {
    invitation = await inspectStaffInvitation(token);
  } catch (error) {
    const message =
      error instanceof StaffGatewayError
        ? error.message
        : "초대 정보를 확인하지 못했습니다.";
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <LawandOsBrand className="auth-brand-lockup" />
          <p className="eyebrow">STAFF INVITATION</p>
          <h1>초대 링크를 사용할 수 없습니다</h1>
          <p className="auth-lead">{message}</p>
          <Link className="primary-link" href="/login">
            로그인 화면으로
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card invitation-card">
        <LawandOsBrand className="auth-brand-lockup" />
        <p className="eyebrow">STAFF INVITATION</p>
        <h1>직원 계정 만들기</h1>
        <p className="auth-lead">
          이름과 로그인 이메일을 확인한 뒤 비밀번호를 설정해 주세요. 업무 정보와
          전화·리걸프렌즈 연결은 가입 후 직접 입력할 수 있습니다.
        </p>
        <dl className="invitation-summary">
          <div>
            <dt>이메일</dt>
            <dd>{invitation.email}</dd>
          </div>
          <div>
            <dt>이름</dt>
            <dd>{invitation.displayName}</dd>
          </div>
        </dl>
        <InvitationForm token={token} />
      </section>
    </main>
  );
}
