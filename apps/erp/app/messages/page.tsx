import type { Metadata } from "next";

import {
  getMessageHub,
  getMessageTemplates,
  type MessageHub,
  type MessageTemplate,
} from "../../lib/gateway";
import { requireStaff } from "../../lib/session";
import { MessageHubWorkspace } from "../_components/message-hub-workspace";
import { StaffBar } from "../_components/staff-bar";

export const metadata: Metadata = {
  title: "문자 | 로앤 ERP",
};

export const dynamic = "force-dynamic";

const emptyHub: MessageHub = { items: [], mailboxes: [] };

export default async function MessagesPage() {
  const staff = await requireStaff();
  let hub = emptyHub;
  let templates: MessageTemplate[] = [];
  let loadError = "";
  const [hubResult, templateResult] = await Promise.allSettled([
    getMessageHub(),
    getMessageTemplates(),
  ]);
  if (hubResult.status === "fulfilled") {
    hub = hubResult.value;
  } else {
    loadError = "문자 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (templateResult.status === "fulfilled") {
    templates = templateResult.value;
  }

  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell message-hub-shell">
        <header className="erp-header">
          <div>
            <p className="eyebrow">CUSTOMER MESSAGES</p>
            <h1>문자</h1>
            <p>Case_idx별로 SMS·LMS·MMS 발신과 대표번호 수신 내역을 함께 확인합니다.</p>
          </div>
          <p className="header-context">
            대표번호 수신함 <strong>자동 확인</strong>
          </p>
        </header>
        {loadError ? (
          <p className="error-banner" role="alert">{loadError}</p>
        ) : (
          <MessageHubWorkspace
            initialHub={hub}
            initialTemplates={templates}
          />
        )}
        <p className="security-note">
          전체 문자 본문과 고객 연결 정보는 인증된 직원 화면에서만 복호화됩니다.
        </p>
      </main>
    </>
  );
}
