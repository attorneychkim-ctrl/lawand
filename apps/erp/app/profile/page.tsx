import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CentrexLineForm } from "../_components/centrex-line-form";
import { LegalFriendsAccountForm } from "../_components/legalfriends-account-form";
import { PasswordChangeForm } from "../_components/password-change-form";
import { StaffBar } from "../_components/staff-bar";
import { StaffProfileForm } from "../_components/staff-profile-form";
import { getOwnStaffProfile } from "../../lib/staff-auth";
import { readStaffSessionToken, requireStaff } from "../../lib/session";

export const metadata: Metadata = {
  title: "내 정보 | 로앤 ERP",
};

const roleLabels = {
  admin: "관리자",
  full_time: "정규직",
  part_time: "아르바이트",
  separate_accounting: "별산",
  civil_complaint_vendor: "민원업체",
};

export default async function ProfilePage() {
  const staff = await requireStaff();
  const sessionToken = await readStaffSessionToken();
  if (!sessionToken) redirect("/login");
  const profile = await getOwnStaffProfile(sessionToken);

  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell profile-shell">
        <Link className="back-link" href="/">
          ← 상담 목록
        </Link>
        <header className="detail-header profile-header">
          <div>
            <p className="eyebrow">MY PROFILE &amp; CONNECTIONS</p>
            <h1>내 정보</h1>
            <p>
              업무 기본 정보와 전화·리걸프렌즈 연결을 직접 관리합니다.
            </p>
          </div>
          <div className="profile-identity-card">
            <span aria-hidden="true">{profile.displayName.slice(0, 1)}</span>
            <div>
              <strong>{profile.displayName}</strong>
              <small>{profile.email}</small>
              <small>{roleLabels[profile.role]}</small>
            </div>
          </div>
        </header>

        <div className="profile-layout">
          <section className="erp-panel profile-section">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">BASIC INFORMATION</p>
                <h2>기본 정보</h2>
                <p>이름과 로그인 이메일은 고정되며 나머지 업무 정보는 직접 수정할 수 있습니다.</p>
              </div>
            </div>
            <dl className="profile-fixed-fields">
              <div>
                <dt>이름</dt>
                <dd>{profile.displayName}</dd>
              </div>
              <div>
                <dt>로그인 이메일</dt>
                <dd>{profile.email}</dd>
              </div>
            </dl>
            <StaffProfileForm allowRoleEdit={false} profile={profile} />
          </section>

          <section className="erp-panel profile-section profile-password-section">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">ACCOUNT SECURITY</p>
                <h2>비밀번호 변경</h2>
                <p>현재 비밀번호를 다시 확인한 뒤 변경하며, 완료되면 모든 기기에서 로그아웃됩니다.</p>
              </div>
            </div>
            <PasswordChangeForm />
          </section>
        </div>

        <section className="erp-panel profile-section profile-connections">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">WORK CONNECTIONS</p>
              <h2>업무 시스템 연결</h2>
              <p>본인 회선과 외부 계정을 입력하고 연결 상태를 바로 확인할 수 있습니다.</p>
            </div>
          </div>
          <div className="staff-directory-integrations">
            <CentrexLineForm
              centrexExtension={profile.centrexExtension}
              centrexLineNumber={profile.centrexLineNumber}
              connection={profile.centrexConnection}
              staffUserId={profile.id}
            />
            <div className="staff-legalfriends-card">
              <div className="integration-form-heading">
                <div>
                  <span className="integration-kicker">리걸프렌즈</span>
                  <strong>내 외부 계정</strong>
                </div>
                <span
                  className={`connection-badge ${
                    profile.legalFriendsId ? "is-connected" : "is-neutral"
                  }`}
                >
                  {profile.legalFriendsId ? "연결 완료" : "미연결"}
                </span>
              </div>
              <LegalFriendsAccountForm
                legalFriendsId={profile.legalFriendsId}
                legalFriendsMemberIdx={profile.legalFriendsMemberIdx}
                staffUserId={profile.id}
              />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
