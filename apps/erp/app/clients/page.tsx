import type { Metadata } from "next";

import { requireStaff } from "../../lib/session";
import { ClientDirectoryWorkspace } from "../_components/client-directory-workspace";
import { StaffBar } from "../_components/staff-bar";

export const metadata: Metadata = {
  title: "고객 찾기 | 로앤 ERP",
};

export default async function ClientsPage() {
  const staff = await requireStaff();
  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell client-directory-shell">
        <header className="erp-header">
          <div>
            <p className="eyebrow">CLIENT DIRECTORY</p>
            <h1>고객 찾기</h1>
            <p>고객과 사건을 확인한 뒤 문자·전화하거나 기존 고객의 신건과 소개 상담을 등록합니다.</p>
          </div>
          <p className="header-context">검색 결과 <strong>최대 30건</strong></p>
        </header>
        <ClientDirectoryWorkspace staffName={staff.displayName} />
        <p className="security-note">
          고객 검색과 문자·클릭투콜·신건상담 등록은 직원 계정 기준으로 감사 기록에 남습니다.
        </p>
      </main>
    </>
  );
}
