"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { centrexMessageByteLength } from "@lawand/core";

import type {
  LegalFriendsClientDirectoryItem,
  LegalFriendsClientDirectorySearch,
  ReviewListFilter,
  ReviewManagementSnapshot,
  ReviewRequestBatchResult,
  ReviewRequestTemplate,
} from "../../lib/gateway";
import { subscribeReviewRealtime } from "./review-realtime";

const filterLabels: Array<{ value: ReviewListFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "reply_needed", label: "답글 필요" },
  { value: "pending", label: "검수 대기" },
  { value: "published", label: "공개" },
  { value: "restricted", label: "공개 제한" },
  { value: "mine", label: "내 담당 후기" },
];

const statusLabels = {
  pending: "검수 대기",
  published: "공개",
  restricted: "공개 제한",
} as const;

const areaLabels = {
  personal_rehabilitation: "개인회생",
  personal_bankruptcy: "파산·면책",
  other: "기타·상담",
} as const;

const stageLabels = {
  consultation: "상담 후",
  commencement: "절차 진행 중",
  discharge: "면책 후",
  other: "기타 시점",
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatPhone(value: string | null) {
  if (!value) return "전화번호 미등록";
  const digits = value.replace(/\D/g, "");
  return /^\d{11}$/.test(digits)
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : value;
}

function targetKey(item: Pick<LegalFriendsClientDirectoryItem, "clientIdx" | "caseIdx">) {
  return `${item.clientIdx}:${item.caseIdx}`;
}

function caseTypeLabel(value: number) {
  return value === 1 ? "개인회생" : value === 2 ? "파산면책" : "기타사건";
}

export function ReviewWorkspace({
  initialSnapshot,
  initialTemplates,
  staffName,
}: {
  initialSnapshot: ReviewManagementSnapshot;
  initialTemplates: ReviewRequestTemplate[];
  staffName: string;
}) {
  const [tab, setTab] = useState<"manage" | "request">("manage");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialTemplates[0]?.id ?? "",
  );
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState(
    "{{고객명}}님, 안녕하세요. 법무법인 로앤 {{담당자명}}입니다. 함께한 경험을 아래 링크에 남겨주시면 감사하겠습니다.\n{{후기작성링크}}",
  );
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<LegalFriendsClientDirectorySearch | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState(
    new Map<string, LegalFriendsClientDirectoryItem>(),
  );
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<ReviewRequestBatchResult | null>(null);
  const requestKeys = useRef(new Map<string, string>());

  const loadSnapshot = useCallback(async (filter: ReviewListFilter, page = 1) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/reviews?filter=${filter}&page=${page}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as
        | (ReviewManagementSnapshot & { message?: string })
        | null;
      if (!response.ok || !body) {
        throw new Error(body?.message ?? "후기 목록을 불러오지 못했습니다.");
      }
      setSnapshot(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "후기 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => subscribeReviewRealtime((message) => {
    if (message.kind === "changed" || message.kind === "sync") {
      void loadSnapshot(snapshot.filter, snapshot.page);
    }
  }), [loadSnapshot, snapshot.filter, snapshot.page]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const templateBodyByteLength = centrexMessageByteLength(templateBody);
  const templateValid =
    templateBodyByteLength <= 500 &&
    templateBody.includes("{{후기작성링크}}");

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTemplateBusy(true);
    setError("");
    try {
      const response = await fetch(
        editingTemplateId
          ? `/api/review-request-templates/${editingTemplateId}`
          : "/api/review-request-templates",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: templateName, body: templateBody }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | (ReviewRequestTemplate & { message?: string })
        | null;
      if (!response.ok || !body) {
        throw new Error(body?.message ?? "템플릿을 저장하지 못했습니다.");
      }
      setTemplates((current) =>
        editingTemplateId
          ? current.map((item) => item.id === body.id ? body : item)
          : [body, ...current],
      );
      setSelectedTemplateId(body.id);
      setEditingTemplateId(null);
      setTemplateName("");
      setTemplateBody(
        "{{고객명}}님, 안녕하세요. 법무법인 로앤 {{담당자명}}입니다. 함께한 경험을 아래 링크에 남겨주시면 감사하겠습니다.\n{{후기작성링크}}",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "템플릿을 저장하지 못했습니다.");
    } finally {
      setTemplateBusy(false);
    }
  }

  function editTemplate(template: ReviewRequestTemplate) {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateBody(template.body);
  }

  async function deleteTemplate(template: ReviewRequestTemplate) {
    if (!window.confirm(`“${template.name}” 템플릿을 삭제할까요?`)) return;
    setTemplateBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/review-request-templates/${template.id}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "템플릿을 삭제하지 못했습니다.");
      const next = templates.filter((item) => item.id !== template.id);
      setTemplates(next);
      setSelectedTemplateId(next[0]?.id ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "템플릿을 삭제하지 못했습니다.");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function searchCustomers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError("");
    try {
      const response = await fetch(`/api/client-directory?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | (LegalFriendsClientDirectorySearch & { message?: string })
        | null;
      if (!response.ok || !body) throw new Error(body?.message ?? "고객을 찾지 못했습니다.");
      setSearchResult(body);
    } catch (caught) {
      setSearchResult(null);
      setError(caught instanceof Error ? caught.message : "고객을 찾지 못했습니다.");
    } finally {
      setSearching(false);
    }
  }

  function toggleTarget(item: LegalFriendsClientDirectoryItem) {
    const key = targetKey(item);
    setSelectedTargets((current) => {
      const next = new Map(current);
      if (next.has(key)) {
        next.delete(key);
        for (const requestKey of requestKeys.current.keys()) {
          if (requestKey.endsWith(`:${key}`)) {
            requestKeys.current.delete(requestKey);
          }
        }
      } else if (next.size < 30) {
        next.set(key, item);
      }
      return next;
    });
    setSendResult(null);
  }

  async function send() {
    if (!selectedTemplate || selectedTargets.size === 0) return;
    if (!window.confirm(`${selectedTargets.size}명에게 후기 요청 문자를 보낼까요?`)) return;
    setSending(true);
    setError("");
    setSendResult(null);
    const targets = [...selectedTargets.values()].map((item) => {
      const requestKey = `${selectedTemplate.id}:${targetKey(item)}`;
      let idempotencyKey = requestKeys.current.get(requestKey);
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        requestKeys.current.set(requestKey, idempotencyKey);
      }
      return {
        clientIdx: item.clientIdx,
        caseIdx: item.caseIdx,
        idempotencyKey,
      };
    });
    try {
      const response = await fetch("/api/review-requests/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          targets,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | (ReviewRequestBatchResult & { message?: string })
        | null;
      if (!response.ok || !body) throw new Error(body?.message ?? "후기 요청을 보내지 못했습니다.");
      setSendResult(body);
      const failedKeys = new Set(
        body.items
          .filter((item) => item.status === "failed")
          .map((item) => `${item.clientIdx}:${item.caseIdx}`),
      );
      setSelectedTargets((current) =>
        new Map([...current].filter(([key]) => failedKeys.has(key))),
      );
      for (const item of body.items) {
        requestKeys.current.delete(
          `${selectedTemplate.id}:${item.clientIdx}:${item.caseIdx}`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "후기 요청을 보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="review-workspace">
      <div className="review-tabs" role="tablist" aria-label="후기관리 기능">
        <button
          aria-selected={tab === "manage"}
          className={tab === "manage" ? "is-active" : undefined}
          onClick={() => setTab("manage")}
          role="tab"
          type="button"
        >
          후기 관리
          <span>{snapshot.summary.all}</span>
        </button>
        <button
          aria-selected={tab === "request"}
          className={tab === "request" ? "is-active" : undefined}
          onClick={() => setTab("request")}
          role="tab"
          type="button"
        >
          후기 요청
          <span>{selectedTargets.size}</span>
        </button>
      </div>

      {error ? <p className="error-banner" role="alert">{error}</p> : null}

      {tab === "manage" ? (
        <div className="review-manage-panel" role="tabpanel">
          <div className="review-filter-row">
            {filterLabels.map((filter) => (
              <button
                className={snapshot.filter === filter.value ? "is-active" : undefined}
                disabled={loading}
                key={filter.value}
                onClick={() => void loadSnapshot(filter.value)}
                type="button"
              >
                {filter.label}
                <span>{snapshot.summary[filter.value]}</span>
              </button>
            ))}
          </div>
          <div className="review-list-heading">
            <p><strong>{snapshot.total}</strong>건 · 최신 작성순</p>
            {loading ? <span>동기화 중…</span> : <span>실시간 연결</span>}
          </div>
          {snapshot.items.length ? (
            <div className="review-erp-list">
              {snapshot.items.map((item) => (
                <Link
                  className="review-erp-card"
                  href={`/reviews/${item.recordType}/${item.id}`}
                  key={`${item.recordType}:${item.id}`}
                >
                  <div className="review-card-status">
                    <span className={`status-${item.status}`}>{statusLabels[item.status]}</span>
                    {item.replyStatus === "waiting" ? <span className="needs-reply">답글 필요</span> : null}
                    {item.replyStatus === "answered" ? <span>답글 완료</span> : null}
                    {item.mine ? <span className="is-mine">내 담당</span> : null}
                  </div>
                  <div className="review-card-copy">
                    <div>
                      <strong>{item.authorDisplay}</strong>
                      <span>{item.receiptCode ?? "이전 홈페이지 후기"}</span>
                    </div>
                    <p>{item.contentPreview}</p>
                  </div>
                  <div className="review-card-meta">
                    <span>{areaLabels[item.practiceArea]} · {stageLabels[item.progressStage]}</span>
                    <span>{item.linked ? "고객 연결됨" : "고객 연결 필요"}</span>
                    <time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="review-empty">선택한 조건에 해당하는 후기가 없습니다.</p>
          )}
          {snapshot.pageCount > 1 ? (
            <div className="review-pagination">
              <button disabled={snapshot.page <= 1 || loading} onClick={() => void loadSnapshot(snapshot.filter, snapshot.page - 1)} type="button">이전</button>
              <span>{snapshot.page} / {snapshot.pageCount}</span>
              <button disabled={snapshot.page >= snapshot.pageCount || loading} onClick={() => void loadSnapshot(snapshot.filter, snapshot.page + 1)} type="button">다음</button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="review-request-panel" role="tabpanel">
          <section className="review-template-panel">
            <header>
              <div><p className="eyebrow">MY TEMPLATE</p><h2>내 후기 요청 템플릿</h2></div>
              <span>{templates.length}개</span>
            </header>
            <div className="review-template-layout">
              <div className="review-template-list">
                {templates.length ? templates.map((template) => (
                  <article className={selectedTemplateId === template.id ? "is-selected" : undefined} key={template.id}>
                    <button onClick={() => setSelectedTemplateId(template.id)} type="button">
                      <strong>{template.name}</strong>
                      <span>{template.bodyByteLength}바이트</span>
                      <p>{template.body}</p>
                    </button>
                    <div>
                      <button onClick={() => editTemplate(template)} type="button">수정</button>
                      <button disabled={templateBusy} onClick={() => void deleteTemplate(template)} type="button">삭제</button>
                    </div>
                  </article>
                )) : <p>아직 템플릿이 없습니다. 첫 문구를 만들어 주세요.</p>}
              </div>
              <form className="review-template-form" onSubmit={(event) => void saveTemplate(event)}>
                <h3>{editingTemplateId ? "템플릿 수정" : "새 템플릿"}</h3>
                <label><span>템플릿 이름</span><input maxLength={80} onChange={(event) => setTemplateName(event.target.value)} placeholder="예: 사건 종결 후 후기 요청" required value={templateName} /></label>
                <label><span>문자 내용</span><textarea maxLength={720} onChange={(event) => setTemplateBody(event.target.value)} required rows={7} value={templateBody} /></label>
                <p className={templateValid ? undefined : "is-invalid"}>{templateBodyByteLength} / 500바이트 · <code>{"{{후기작성링크}}"}</code> 필수</p>
                <div className="review-template-variables"><code>{"{{고객명}}"}</code><code>{"{{담당자명}}"}</code><code>{"{{사건번호}}"}</code><code>{"{{후기작성링크}}"}</code></div>
                <div className="review-form-actions">
                  {editingTemplateId ? <button onClick={() => { setEditingTemplateId(null); setTemplateName(""); }} type="button">취소</button> : null}
                  <button className="primary-button" disabled={templateBusy || !templateValid} type="submit">{templateBusy ? "저장 중…" : "템플릿 저장"}</button>
                </div>
              </form>
            </div>
          </section>

          <section className="review-customer-picker">
            <header>
              <div><p className="eyebrow">RECIPIENTS</p><h2>후기를 요청할 고객</h2></div>
              <span>선택 {selectedTargets.size} / 30명</span>
            </header>
            <form onSubmit={(event) => void searchCustomers(event)}>
              <label htmlFor="review-customer-query">고객명 또는 전화번호</label>
              <div><input id="review-customer-query" maxLength={30} onChange={(event) => setQuery(event.target.value)} placeholder="예: 홍길동 또는 1234" value={query} /><button className="primary-button" disabled={searching} type="submit">{searching ? "찾는 중…" : "고객 찾기"}</button></div>
            </form>
            {searchResult ? (
              <div className="review-customer-results">
                {searchResult.items.length ? searchResult.items.map((item) => {
                  const key = targetKey(item);
                  const checked = selectedTargets.has(key);
                  return (
                    <label className={checked ? "is-selected" : undefined} key={key}>
                      <input checked={checked} disabled={!item.callable || (!checked && selectedTargets.size >= 30)} onChange={() => toggleTarget(item)} type="checkbox" />
                      <span className="review-customer-check" aria-hidden="true">✓</span>
                      <span><strong>{item.clientName}</strong><small>{formatPhone(item.phone)}</small></span>
                      <span><strong>{caseTypeLabel(item.caseType)}</strong><small>{item.caseNumber ?? item.caseName ?? "사건정보 미등록"}</small></span>
                      <span><strong>{item.staffNames.join(" · ") || "담당 미지정"}</strong><small>{item.courtName ?? "법원 미등록"}</small></span>
                    </label>
                  );
                }) : <p>일치하는 고객 사건을 찾지 못했습니다.</p>}
              </div>
            ) : <p className="review-picker-help">리걸프렌즈 고객찾기와 같은 기준으로 삭제되지 않은 사건을 검색합니다.</p>}
          </section>

          <section className="review-send-dock">
            <div>
              <p>발신 담당자</p><strong>{staffName}</strong>
            </div>
            <div>
              <p>선택 템플릿</p><strong>{selectedTemplate?.name ?? "템플릿을 선택해 주세요"}</strong>
            </div>
            <div>
              <p>수신 고객</p><strong>{selectedTargets.size}명</strong>
            </div>
            <button className="primary-button" disabled={sending || !selectedTemplate || selectedTargets.size === 0} onClick={() => void send()} type="button">{sending ? "요청 등록 중…" : `${selectedTargets.size}명에게 후기 요청`}</button>
          </section>
          {sendResult ? (
            <p className={sendResult.failedCount ? "review-send-result has-failure" : "review-send-result"} role="status">
              발송 요청 {sendResult.sentCount}건 완료{sendResult.failedCount ? ` · 실패 ${sendResult.failedCount}건` : ""}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
