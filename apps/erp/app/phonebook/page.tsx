import type { Metadata } from "next";

import { requireStaff } from "../../lib/session";
import { PhonebookWorkspace } from "../_components/phonebook-workspace";
import { StaffBar } from "../_components/staff-bar";

export const metadata: Metadata = {
  title: "전화번호부 | 로앤 ERP",
};

export default async function PhonebookPage() {
  const staff = await requireStaff();
  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell phonebook-shell">
        <header className="erp-header">
          <div>
            <p className="eyebrow">CALLER DIRECTORY</p>
            <h1>전화번호부</h1>
            <p>법원·채권자·기관처럼 상담 고객이 아닌 발신자를 저장하고 수신 전에 확인합니다.</p>
          </div>
          <p className="header-context">원번호와 <strong>연결번호 동시 식별</strong></p>
        </header>
        <PhonebookWorkspace />
        <p className="security-note">
          이름과 번호 원문은 암호화하며 등록·수정·삭제 이력은 직원 계정 기준으로 감사 기록에 남습니다.
        </p>
      </main>
    </>
  );
}
