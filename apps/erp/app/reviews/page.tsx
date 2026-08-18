import type { Metadata } from "next";

import {
  getReviewRequestTemplates,
  getReviews,
  type ReviewManagementSnapshot,
  type ReviewRequestTemplate,
} from "../../lib/gateway";
import { requireStaff } from "../../lib/session";
import { ReviewWorkspace } from "../_components/review-workspace";
import { StaffBar } from "../_components/staff-bar";

export const metadata: Metadata = {
  title: "후기관리",
};

const emptySnapshot: ReviewManagementSnapshot = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
  filter: "all",
  summary: {
    all: 0,
    reply_needed: 0,
    pending: 0,
    published: 0,
    restricted: 0,
    mine: 0,
  },
};

export default async function ReviewsPage() {
  const staff = await requireStaff();
  let initialSnapshot = emptySnapshot;
  let initialTemplates: ReviewRequestTemplate[] = [];
  let loadError = "";
  try {
    [initialSnapshot, initialTemplates] = await Promise.all([
      getReviews(),
      getReviewRequestTemplates(),
    ]);
  } catch {
    loadError = "후기관리 정보를 불러오지 못했습니다. 게이트웨이 상태를 확인해 주세요.";
  }
  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell review-management-shell">
        <header className="erp-header">
          <div>
            <p className="eyebrow">REVIEW CARE</p>
            <h1>후기관리</h1>
            <p>
              고객 사건을 확인하고 공개 상태와 공식 답글, 상품 발송, 후기 요청 문자를 한곳에서 관리합니다.
            </p>
          </div>
          <p className="header-context">
            담당자 중심 <strong>모두 답글 가능</strong>
          </p>
        </header>
        {loadError ? <p className="error-banner" role="alert">{loadError}</p> : null}
        {!loadError ? (
          <ReviewWorkspace
            initialSnapshot={initialSnapshot}
            initialTemplates={initialTemplates}
            staffName={staff.displayName}
          />
        ) : null}
        <p className="security-note">
          후기 고객 연결·개인정보 열람·공개 제한·답글·요청 문자는 직원 계정 기준으로 감사 기록에 남습니다.
        </p>
      </main>
    </>
  );
}
