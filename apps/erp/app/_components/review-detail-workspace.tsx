"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import type {
  LegalFriendsClientDirectoryItem,
  LegalFriendsClientDirectorySearch,
  ReviewManagementDetail,
  ReviewRestrictionReason,
} from "../../lib/gateway";
import { ReviewGifticonPanel } from "./review-gifticon-panel";

const restrictionLabels: Record<ReviewRestrictionReason, string> = {
  privacy: "개인정보 포함",
  unverified: "이용 사실 확인 불가",
  abusive_or_manipulated: "의도적 악성·조작 의심",
  customer_request: "고객의 공개 철회 요청",
  duplicate: "중복 후기",
  other: "기타",
};

const areaLabels = {
  personal_rehabilitation: "개인회생",
  personal_bankruptcy: "파산·면책",
  other: "기타·상담",
} as const;

const stageLabels = {
  consultation: "상담 후",
  commencement: "개시·절차 진행 중",
  discharge: "면책 후",
  other: "기타 시점",
} as const;

const linkSourceLabels = {
  invitation: "전용 후기 요청 링크",
  exact_phone: "휴대전화 정확 일치",
  manual: "직원 수동 연결",
} as const;

function formatDate(value: string | null) {
  if (!value) return "없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatPhone(value: string | null) {
  if (!value) return "미등록";
  const digits = value.replace(/\D/g, "");
  return /^\d{11}$/.test(digits)
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : value;
}

function caseTypeLabel(value: number) {
  return value === 1 ? "개인회생" : value === 2 ? "파산면책" : "기타사건";
}

export function ReviewDetailWorkspace({
  detail: initialDetail,
  staffName,
}: {
  detail: ReviewManagementDetail;
  staffName: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [reason, setReason] = useState<ReviewRestrictionReason | "">(
    initialDetail.restrictionReason ?? "",
  );
  const [restrictionNote, setRestrictionNote] = useState(
    initialDetail.restrictionNote ?? "",
  );
  const [reply, setReply] = useState(initialDetail.reply?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [linkSearchOpen, setLinkSearchOpen] = useState(!initialDetail.linkedCustomer);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<LegalFriendsClientDirectorySearch | null>(null);

  async function changePublication(action: "publish" | "restrict") {
    if (action === "restrict" && !reason) {
      setError("공개 제한 사유를 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/reviews/${detail.recordType}/${detail.id}/moderation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            reason: action === "restrict" ? reason : null,
            note: action === "restrict" && restrictionNote.trim() ? restrictionNote.trim() : null,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { recordType: "review" | "submission"; id: string; detail: ReviewManagementDetail; message?: string }
        | null;
      if (!response.ok || !body?.detail) throw new Error(body?.message ?? "공개 상태를 변경하지 못했습니다.");
      setDetail(body.detail);
      setNotice(action === "publish" ? "홈페이지 공개 상태로 변경했습니다." : "홈페이지 공개를 제한했습니다.");
      if (body.recordType !== initialDetail.recordType || body.id !== initialDetail.id) {
        router.replace(`/reviews/${body.recordType}/${body.id}`);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "공개 상태를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/reviews/review/${detail.id}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: reply }),
      });
      const body = (await response.json().catch(() => null)) as (ReviewManagementDetail & { message?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.message ?? "답글을 저장하지 못했습니다.");
      setDetail(body);
      setReply(body.reply?.content ?? "");
      setNotice("공식 답글을 저장했습니다. 공개 후기에도 바로 표시됩니다.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "답글을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function searchCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError("");
    try {
      const response = await fetch(`/api/client-directory?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as (LegalFriendsClientDirectorySearch & { message?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.message ?? "고객을 찾지 못했습니다.");
      setSearchResult(body);
    } catch (caught) {
      setSearchResult(null);
      setError(caught instanceof Error ? caught.message : "고객을 찾지 못했습니다.");
    } finally {
      setSearching(false);
    }
  }

  async function connectCustomer(item: LegalFriendsClientDirectoryItem) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/reviews/${detail.recordType}/${detail.id}/link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientIdx: item.clientIdx, caseIdx: item.caseIdx }),
      });
      const body = (await response.json().catch(() => null)) as (ReviewManagementDetail & { message?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.message ?? "고객 사건을 연결하지 못했습니다.");
      setDetail(body);
      setLinkSearchOpen(false);
      setNotice("고객 사건과 담당자들을 연결했습니다.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "고객 사건을 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const customer = detail.linkedCustomer;
  return (
    <main className="erp-shell review-detail-shell">
      <div className="review-detail-back"><Link href="/reviews">← 후기관리로 돌아가기</Link></div>
      <header className="review-detail-hero">
        <div>
          <div className="review-detail-statuses">
            <span className={`status-${detail.status}`}>{detail.status === "published" ? "홈페이지 공개" : detail.status === "pending" ? "검수 대기" : "공개 제한"}</span>
            <span>{areaLabels[detail.practiceArea]}</span>
            <span>{stageLabels[detail.progressStage]}</span>
          </div>
          <p className="eyebrow">CUSTOMER REVIEW</p>
          <h1>{detail.authorDisplay}님의 후기</h1>
          <p>{detail.receiptCode ?? "이전 홈페이지에서 이관한 후기"} · {formatDate(detail.occurredAt)}</p>
        </div>
        <dl>
          <div><dt>고객 연결</dt><dd>{customer ? customer.clientName : "연결 필요"}</dd></div>
          <div><dt>답글</dt><dd>{detail.reply ? "답글 완료" : detail.canReply ? "답글 필요" : "공개 후 작성"}</dd></div>
          <div><dt>공개일</dt><dd>{formatDate(detail.publishedAt)}</dd></div>
        </dl>
      </header>

      {error ? <p className="error-banner" role="alert">{error}</p> : null}
      {notice ? <p className="success-banner" role="status">{notice}</p> : null}

      <div className="review-detail-grid">
        <div className="review-detail-main">
          <section className="review-content-panel">
            <header><div><p className="eyebrow">ORIGINAL REVIEW</p><h2>후기 원문</h2></div><span>{detail.content.length.toLocaleString("ko-KR")}자</span></header>
            <blockquote>{detail.content}</blockquote>
            <div className="review-keywords">{detail.experienceKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
            {detail.piiFlags.length ? <p className="review-pii-warning">개인정보 검출 항목: {detail.piiFlags.join(" · ")}</p> : null}
          </section>

          <section className="review-customer-detail-panel">
            <header>
              <div><p className="eyebrow">CUSTOMER &amp; CASE</p><h2>고객·사건 정보</h2></div>
              {customer ? <button onClick={() => setLinkSearchOpen((value) => !value)} type="button">연결 변경</button> : null}
            </header>
            {customer ? (
              <>
                <div className="review-customer-identity">
                  <span aria-hidden="true">{customer.clientName.slice(0, 1)}</span>
                  <div><small>고객 전체 이름</small><strong>{customer.clientName}</strong><p>{formatPhone(customer.phone ?? detail.submittedPhone)}</p></div>
                  <i>{detail.linkSource ? linkSourceLabels[detail.linkSource] : "연결됨"}</i>
                </div>
                <dl className="review-case-facts">
                  <div><dt>사건 종류</dt><dd>{caseTypeLabel(customer.caseType)}</dd></div>
                  <div><dt>사건명</dt><dd>{customer.caseName ?? "미등록"}</dd></div>
                  <div><dt>사건번호</dt><dd>{customer.caseNumber ?? "미등록"}</dd></div>
                  <div><dt>법원</dt><dd>{customer.courtName ?? "미등록"}</dd></div>
                  <div><dt>진행 상태 코드</dt><dd>{customer.caseState} / 최고 {customer.maxState}</dd></div>
                  <div><dt>종결·폐지</dt><dd>{customer.isClosed ? "종결" : "진행"}{customer.isRepealed ? " · 폐지" : ""}</dd></div>
                  <div><dt>거주지 정보</dt><dd>{customer.livingPlace ?? "미등록"}</dd></div>
                  <div><dt>등록·갱신</dt><dd>{customer.caseCreatedOn} · {customer.caseUpdatedOn}</dd></div>
                </dl>
                <div className="review-manager-list">
                  <h3>관련 사건 담당자</h3>
                  {customer.staff.length ? customer.staff.map((manager) => (
                    <div key={`${manager.externalMemberIdx}:${manager.position}`}><span>{manager.position === 1 ? "주담당" : `${manager.position}순위 담당`}</span><strong>{manager.name}</strong><small>리걸프렌즈 사건 담당자</small></div>
                  )) : <p>리걸프렌즈에 담당자가 지정되지 않았습니다.</p>}
                  <p>{customer.dutyManagerUserIds.length > 0 ? `ERP 계정이 연결된 담당자 ${customer.dutyManagerUserIds.length}명에게 답글 의무를 알립니다.` : "ERP 계정이 연결된 담당자가 없어 직원 연결 확인이 필요합니다."}</p>
                </div>
              </>
            ) : (
              <div className="review-customer-unlinked"><strong>고객 사건이 연결되지 않았습니다.</strong><p>신규 후기는 전화번호가 정확히 한 사건과 일치할 때만 자동 연결됩니다. 이전 후기나 여러 후보가 있는 경우 아래에서 직접 선택해 주세요.</p><p>후기 입력 전화: {formatPhone(detail.submittedPhone)}</p></div>
            )}
            {linkSearchOpen ? (
              <div className="review-link-search">
                <form onSubmit={(event) => void searchCustomer(event)}><label htmlFor="review-link-query">고객명 또는 전화번호</label><div><input id="review-link-query" maxLength={30} onChange={(event) => setQuery(event.target.value)} placeholder="고객명 2글자 또는 전화번호 4자리" value={query} /><button className="primary-button" disabled={searching} type="submit">{searching ? "찾는 중…" : "고객 찾기"}</button></div></form>
                {searchResult ? <div className="review-link-results">{searchResult.items.map((item) => <article key={`${item.clientIdx}:${item.caseIdx}`}><div><strong>{item.clientName}</strong><span>{formatPhone(item.phone)}</span></div><div><strong>{caseTypeLabel(item.caseType)} · {item.caseNumber ?? "번호 미등록"}</strong><span>{item.caseName ?? item.courtName ?? "사건정보 미등록"}</span></div><div><span>{item.staffNames.join(" · ") || "담당 미지정"}</span><button disabled={busy} onClick={() => void connectCustomer(item)} type="button">이 사건 연결</button></div></article>)}</div> : null}
              </div>
            ) : null}
          </section>

          <section className="review-reply-panel">
            <header><div><p className="eyebrow">OFFICIAL REPLY</p><h2>공식 답글</h2></div><span>{detail.reply ? `${detail.reply.updatedByName} · ${formatDate(detail.reply.updatedAt)}` : "누구나 작성 가능"}</span></header>
            {detail.canReply ? (
              <form onSubmit={(event) => void saveReply(event)}><textarea maxLength={3000} onChange={(event) => setReply(event.target.value)} placeholder="고객의 경험을 존중하는 공식 답글을 작성해 주세요." required rows={8} value={reply} /><div><p>주된 답글 의무자는 연결 사건 담당자이며, 다른 직원도 대신 작성하거나 수정할 수 있습니다.</p><button className="primary-button" disabled={busy || reply.trim().length < 2} type="submit">{busy ? "저장 중…" : detail.reply ? "답글 수정 저장" : "답글 공개"}</button></div></form>
            ) : <p className="review-reply-locked">후기를 공개 원장으로 전환한 뒤 답글을 작성할 수 있습니다.</p>}
          </section>

          <ReviewGifticonPanel key={`${detail.recordType}:${detail.id}`} customer={customer} receiptCode={detail.receiptCode} submittedPhone={detail.submittedPhone} recordType={detail.recordType} recordId={detail.id} />
        </div>

        <aside className="review-detail-sidebar">
          <section className="review-moderation-panel">
            <p className="eyebrow">PUBLICATION</p>
            <h2>공개 상태</h2>
            <p>공개 제한은 사유를 반드시 남기며, 홈페이지에서는 즉시 보이지 않게 됩니다.</p>
            <label><span>공개 제한 사유</span><select onChange={(event) => setReason(event.target.value as ReviewRestrictionReason | "")} value={reason}><option value="">사유 선택</option>{Object.entries(restrictionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>상세 메모</span><textarea maxLength={500} onChange={(event) => setRestrictionNote(event.target.value)} placeholder={reason === "other" ? "기타 사유를 반드시 적어 주세요." : "필요한 경우 내부 메모를 남겨 주세요."} rows={4} value={restrictionNote} /></label>
            <div>
              <button disabled={busy || !reason} onClick={() => void changePublication("restrict")} type="button">공개 제한으로 변경</button>
              <button className="primary-button" disabled={busy || detail.status === "published"} onClick={() => void changePublication("publish")} type="button">홈페이지에 공개</button>
            </div>
            {detail.restrictionReason ? <small>현재 제한 사유: {restrictionLabels[detail.restrictionReason]}{detail.restrictionNote ? ` · ${detail.restrictionNote}` : ""}</small> : null}
          </section>
          <section className="review-operation-note"><strong>운영 원칙</strong><ul><li>악성 표현이어도 고객의 실제 경험인지 먼저 확인합니다.</li><li>개인정보·조작·중복·철회 요청은 사유와 함께 공개 제한합니다.</li><li>답글 작성·수정자는 모두 감사 원장에 남습니다.</li><li>기프티콘은 긍정적 후기의 대가로 지급하지 않습니다.</li></ul><p>현재 처리 직원 · {staffName}</p></section>
        </aside>
      </div>
    </main>
  );
}
