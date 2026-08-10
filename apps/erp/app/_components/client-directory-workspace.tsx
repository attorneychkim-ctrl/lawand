"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import type {
  LegalFriendsClientDirectoryItem,
  LegalFriendsClientDirectorySearch,
} from "../../lib/gateway";
import { ClickToCallButton } from "./click-to-call-button";
import { MessageComposeButton } from "./message-compose-button";

const revivalStateLabels = new Map([
  [5, "상담대기"], [10, "상담완료"], [11, "재상담필요"], [15, "계약"],
  [20, "서류준비"], [21, "부채증명서 발급중"], [22, "부채증명서 발급완료"],
  [25, "신청서 작성 진행중"], [30, "신청서 제출"], [35, "금지명령"],
  [40, "보정기간"], [45, "개시결정"], [50, "채권자 집회기일"], [55, "인가결정"],
]);

const bankruptcyStateLabels = new Map([
  [5, "상담대기"], [10, "상담완료"], [11, "재상담필요"], [15, "계약"],
  [20, "서류준비"], [21, "부채증명서 발급중"], [22, "부채증명서 발급완료"],
  [25, "신청서 작성 진행중"], [30, "신청서 제출"], [40, "보정기간"],
  [100, "파산선고"], [105, "의견청취기일"], [110, "재산환가 및 배당"],
  [115, "파산폐지"], [120, "면책결정"], [125, "면책불허가"],
]);

function caseTypeLabel(caseType: number) {
  return caseType === 1 ? "개인회생" : caseType === 2 ? "파산면책" : "기타사건";
}

function caseStateLabel(item: LegalFriendsClientDirectoryItem) {
  const labels = item.caseType === 2 ? bankruptcyStateLabels : revivalStateLabels;
  return labels.get(item.caseState) ?? `진행 상태 ${item.caseState}`;
}

function formatPhone(value: string | null) {
  if (!value) return "전화번호 미등록";
  const digits = value.replace(/\D/g, "");
  if (/^02\d{7,8}$/.test(digits)) {
    const split = digits.length === 9 ? 5 : 6;
    return `${digits.slice(0, 2)}-${digits.slice(2, split)}-${digits.slice(split)}`;
  }
  if (/^\d{10}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return value;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${year}.${month}.${day}.` : value;
}

export function ClientDirectoryWorkspace({ staffName }: { staffName: string }) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [result, setResult] = useState<LegalFriendsClientDirectorySearch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/client-directory?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | (LegalFriendsClientDirectorySearch & { message?: string })
        | null;
      if (!response.ok || !body) {
        throw new Error(body?.message ?? "고객 정보를 조회하지 못했습니다.");
      }
      setSubmittedQuery(query.trim());
      setResult(body);
    } catch (searchError) {
      setResult(null);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "고객 정보를 조회하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="client-directory-workspace">
      <form className="client-directory-search" onSubmit={(event) => void search(event)}>
        <label htmlFor="client-directory-query">
          <span>고객명 또는 전화번호</span>
          <small>고객명은 2글자 이상, 전화번호는 끝 4자리부터 검색할 수 있습니다.</small>
        </label>
        <div>
          <input
            autoComplete="off"
            id="client-directory-query"
            maxLength={30}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 홍길동 또는 1234"
            value={query}
          />
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "찾는 중…" : "고객 찾기"}
          </button>
        </div>
      </form>

      {error ? <p className="error-banner" role="alert">{error}</p> : null}

      {result ? (
        <section className="client-directory-results" aria-live="polite">
          <div className="client-directory-result-heading">
            <div>
              <p className="eyebrow">SEARCH RESULT</p>
              <h2>검색 결과</h2>
            </div>
            <span className="count-badge">
              {submittedQuery} · {result.items.length}건
            </span>
          </div>
          {result.items.length === 0 ? (
            <p className="client-directory-empty">
              삭제되지 않은 사건 중 일치하는 고객을 찾지 못했습니다.
            </p>
          ) : (
            <div className="client-directory-list">
              {result.items.map((item) => (
                <article className="client-directory-card" key={`${item.clientIdx}:${item.caseIdx}`}>
                  <div className="client-directory-card-main">
                    <div className="client-directory-identity">
                      <div>
                        <strong>{item.clientName}</strong>
                        <span>{formatPhone(item.phone)}</span>
                      </div>
                      <div className="client-directory-badges">
                        <span>{caseTypeLabel(item.caseType)}</span>
                        <span>{caseStateLabel(item)}</span>
                        {item.isClosed ? <span className="is-muted">종결</span> : null}
                        {item.isRepealed ? <span className="is-warning">폐지</span> : null}
                      </div>
                    </div>
                    <dl>
                      <div><dt>사건명</dt><dd>{item.caseName || "미등록"}</dd></div>
                      <div><dt>사건번호</dt><dd>{item.caseNumber || "미등록"}</dd></div>
                      <div><dt>법원</dt><dd>{item.courtName || "미등록"}</dd></div>
                      <div><dt>담당</dt><dd>{item.staffNames.join(" · ") || "미지정"}</dd></div>
                      <div><dt>등록일</dt><dd>{formatDate(item.caseCreatedOn)}</dd></div>
                      <div><dt>최근 갱신</dt><dd>{formatDate(item.caseUpdatedOn)}</dd></div>
                    </dl>
                  </div>
                  <div className="client-directory-actions">
                    {item.callable ? (
                      <>
                        <MessageComposeButton
                          customerName={item.clientName}
                          directoryTarget={{
                            clientIdx: item.clientIdx,
                            caseIdx: item.caseIdx,
                          }}
                          receiptCode={item.caseNumber ?? "미등록"}
                          staffName={staffName}
                        />
                        <ClickToCallButton
                          directoryTarget={{
                            clientIdx: item.clientIdx,
                            caseIdx: item.caseIdx,
                            clientName: item.clientName,
                          }}
                        />
                      </>
                    ) : (
                      <p>문자·전화를 보낼 수 있는 전화번호가 없습니다.</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="client-directory-intro">
          <div>
            <strong>리걸프렌즈 고객정보</strong>
            <p>삭제 처리되지 않은 로앤 사건의 고객명·전화번호·사건·담당 정보를 조회합니다.</p>
          </div>
          <div>
            <strong>문자와 전화 연결</strong>
            <p>내 개인 템플릿으로 문자를 보내거나 연결된 센트릭스 회선으로 바로 전화할 수 있습니다.</p>
          </div>
        </section>
      )}
    </section>
  );
}
