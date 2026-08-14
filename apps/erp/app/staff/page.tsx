import type { Metadata } from "next";
import Link from "next/link";

import { StaffBar } from "../_components/staff-bar";
import { StaffDirectoryWorkspace } from "../_components/staff-directory-workspace";
import { StaffInviteForm } from "../_components/staff-invite-form";
import { getStaffDirectory } from "../../lib/staff-auth";
import {
  readStaffSessionToken,
  requireAdmin,
} from "../../lib/session";

export const metadata: Metadata = {
  title: "직원 관리",
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
            <p className="eyebrow">PEOPLE &amp; INTEGRATIONS</p>
            <h1>직원 관리</h1>
            <p>
              직원 계정과 업무 시스템 연결 상태를 한곳에서 확인하고 관리합니다.
            </p>
          </div>
          <div className="staff-header-note">
            <strong>관리자 전용</strong>
            <span>변경 내용은 감사 원장에 기록됩니다.</span>
          </div>
        </header>
        <section className="erp-panel staff-directory">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ACTIVE DIRECTORY</p>
              <h2>직원 및 업무 연동 현황</h2>
              <p>
                센트릭스 번호·내선과 실제 Windows bridge 배정을 대조하고,
                리걸프렌즈 계정을 함께 관리합니다.
              </p>
            </div>
          </div>
          <StaffDirectoryWorkspace items={staffDirectory} />
        </section>
        <details className="erp-panel staff-panel staff-invite-disclosure">
          <summary>
            <span>
              <span className="eyebrow">INVITE STAFF</span>
              <strong>새 직원 초대</strong>
            </span>
            <span>초대 양식 열기</span>
          </summary>
          <div className="staff-invite-body">
            <p>
              공개 회원가입은 사용하지 않습니다. 이름과 이메일로 초대하고, 직원이
              가입 후 업무 정보와 연결을 직접 완성할 수 있습니다.
            </p>
            <StaffInviteForm />
          </div>
        </details>
      </main>
    </>
  );
}
