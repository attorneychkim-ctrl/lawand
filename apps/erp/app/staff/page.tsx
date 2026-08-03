import type { Metadata } from "next";
import Link from "next/link";

import { StaffBar } from "../_components/staff-bar";
import { StaffInviteForm } from "../_components/staff-invite-form";
import { LegalFriendsAccountForm } from "../_components/legalfriends-account-form";
import { getStaffDirectory } from "../../lib/staff-auth";
import {
  readStaffSessionToken,
  requireAdmin,
} from "../../lib/session";

export const metadata: Metadata = {
  title: "직원 관리 | 로앤 ERP",
};

export default async function StaffPage() {
  const staff = await requireAdmin();
  const sessionToken = await readStaffSessionToken();
  const staffDirectory = sessionToken
    ? await getStaffDirectory(sessionToken)
    : [];

  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell staff-shell">
        <Link className="back-link" href="/">
          ← 상담 목록
        </Link>
        <header className="detail-header">
          <div>
            <p className="eyebrow">ERP ACCESS CONTROL</p>
            <h1>직원 관리</h1>
            <p>공개 회원가입 없이 초대받은 직원만 계정을 만들 수 있습니다.</p>
          </div>
        </header>
        <section className="erp-panel staff-panel">
          <StaffInviteForm />
        </section>
        <section className="erp-panel staff-directory">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">LEGALFRIENDS ACCOUNT</p>
              <h2>직원별 리걸프렌즈 계정</h2>
              <p>
                상담을 배정받는 직원의 리걸프렌즈 로그인 아이디를 연결합니다.
                아이디를 비우고 저장하면 연결이 해제됩니다.
              </p>
            </div>
          </div>
          <div className="staff-directory-list">
            {staffDirectory.map((member) => (
              <article key={member.id}>
                <div className="staff-directory-profile">
                  <h3>{member.displayName}</h3>
                  <p>{member.email}</p>
                  <p>
                    {member.organization.name} · {member.region.name} ·{" "}
                    {member.department} · {member.jobTitle}
                  </p>
                </div>
                <LegalFriendsAccountForm
                  legalFriendsId={member.legalFriendsId}
                  legalFriendsMemberIdx={
                    member.legalFriendsMemberIdx
                  }
                  staffUserId={member.id}
                />
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
