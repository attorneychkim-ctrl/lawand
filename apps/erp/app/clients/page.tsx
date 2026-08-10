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
            <p>리걸프렌즈를 따로 열지 않고 고객과 사건을 확인한 뒤 바로 전화합니다.</p>
          </div>
          <p className="header-context">검색 결과 <strong>최대 30건</strong></p>
        </header>
        <ClientDirectoryWorkspace />
        <p className="security-note">
          고객 검색과 클릭투콜 요청은 직원 계정 기준으로 감사 기록에 남습니다.
        </p>
      </main>
    </>
  );
}
