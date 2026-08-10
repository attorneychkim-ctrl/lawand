import type { Metadata } from "next";
import Link from "next/link";

import { InvitationForm } from "../../_components/invitation-form";
import {
  inspectStaffInvitation,
  StaffGatewayError,
} from "../../../lib/staff-auth";

export const metadata: Metadata = {
  title: "직원 초대 | 로앤 ERP",
};

const roleLabels = {
  admin: "관리자",
  full_time: "정규직",
  part_time: "아르바이트",
  separate_accounting: "별산",
  civil_complaint_vendor: "민원업체",
};

function formatCentrexLine(value: string | null) {
  if (!value) return "지정하지 않음";
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
}

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
          <p className="eyebrow">LAWAND ERP · INVITATION</p>
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
        <p className="eyebrow">LAWAND ERP · INVITATION</p>
        <h1>직원 계정 만들기</h1>
        <p className="auth-lead">
          회사가 지정한 직원 정보를 확인한 뒤 비밀번호를 설정해 주세요.
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
          <div>
            <dt>소속·지역</dt>
            <dd>
              {invitation.organization.name} · {invitation.region.name}
            </dd>
          </div>
          <div>
            <dt>부서·직책</dt>
            <dd>
              {invitation.department} · {invitation.jobTitle}
            </dd>
          </div>
          <div>
            <dt>역할·권한</dt>
            <dd>{roleLabels[invitation.role]}</dd>
          </div>
          <div>
            <dt>센트릭스 회선</dt>
            <dd>
              {formatCentrexLine(invitation.centrexLineNumber)}
              {invitation.centrexExtension
                ? ` · 내선 ${invitation.centrexExtension}`
                : ""}
            </dd>
          </div>
          <div>
            <dt>리걸프렌즈 계정</dt>
            <dd>{invitation.legalFriendsId ?? "연결하지 않음"}</dd>
            <dt>리걸프렌즈 member_idx</dt>
            <dd>
              {invitation.legalFriendsMemberIdx ?? "연결하지 않음"}
            </dd>
          </div>
        </dl>
        <InvitationForm token={token} />
      </section>
    </main>
  );
}
