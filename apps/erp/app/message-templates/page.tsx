import type { Metadata } from "next";
import Link from "next/link";

import { getMessageTemplates } from "../../lib/gateway";
import { requireStaff } from "../../lib/session";
import { MessageTemplateWorkspace } from "../_components/message-template-workspace";
import { StaffBar } from "../_components/staff-bar";

export const metadata: Metadata = {
  title: "내 문자 템플릿 | 로앤 ERP",
};

export const dynamic = "force-dynamic";

export default async function MessageTemplatesPage() {
  const staff = await requireStaff();
  const templates = await getMessageTemplates();
  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell message-template-shell">
        <Link className="page-back-link" href="/">← 상담 목록</Link>
        <header className="detail-header">
          <div>
            <p className="eyebrow">PERSONAL MESSAGING</p>
            <h1>내 문자 템플릿</h1>
            <p>자주 보내는 문구와 명함 이미지를 저장하고 상담 화면에서 바로 선택합니다.</p>
          </div>
          <div className="staff-header-note">
            <strong>{staff.displayName}님의 개인 설정</strong>
            <span>다른 직원에게는 내 템플릿이 보이지 않습니다.</span>
          </div>
        </header>
        <MessageTemplateWorkspace initialItems={templates} />
      </main>
    </>
  );
}
