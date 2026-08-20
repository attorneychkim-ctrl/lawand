"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  REVIEW_REQUEST_DEFAULT_TEMPLATES,
  REVIEW_REQUEST_TEMPLATE_VARIABLES,
  centrexMessageByteLength,
  centrexMessageKind,
  renderReviewRequestTemplate,
  type ReviewRequestTemplateVariable,
} from "@lawand/core";

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
  consultation: "상담을 받은 뒤",
  commencement: "개시절차 진행 중",
  discharge: "면책결정 이후",
  other: "그 밖의 시점",
} as const;

const newTemplateBody =
  REVIEW_REQUEST_DEFAULT_TEMPLATES.find(
    (template) => template.presetKey === "other",
  )?.body ?? "{{고객명}}님, 후기 작성 부탁드립니다.\n{{후기작성링크}}";

const templatePresetOrder = new Map([
  ["consultation", 1],
  ["commencement", 2],
  ["discharge", 3],
  ["other", 4],
]);

const templatePreviewValues = {
  "{{고객명}}": "홍길동",
  "{{담당자명}}": "김담당",
  "{{사건번호}}": "2026개회1234",
  "{{후기작성링크}}": "https://lawandfirm.com/bank/reviews/write#전용링크",
} satisfies Record<ReviewRequestTemplateVariable, string>;

function sortTemplates(items: ReviewRequestTemplate[]) {
  return [...items].sort((left, right) => {
    const leftPreset = left.presetKey
      ? (templatePresetOrder.get(left.presetKey) ?? 5)
      : 6;
    const rightPreset = right.presetKey
      ? (templatePresetOrder.get(right.presetKey) ?? 5)
      : 6;
    if (leftPreset !== rightPreset) return leftPreset - rightPreset;
    if (!left.presetKey && !right.presetKey) {
      const updatedOrder = right.updatedAt.localeCompare(left.updatedAt);
      if (updatedOrder !== 0) return updatedOrder;
    }
    return left.name.localeCompare(right.name, "ko");
  });
}

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

function caseStateLabel(item: LegalFriendsClientDirectoryItem) {
  const labels = item.caseType === 2 ? bankruptcyStateLabels : revivalStateLabels;
  const state = labels.get(item.caseState) ?? `진행 상태 ${item.caseState}`;
  return [state, item.isClosed ? "종결" : null, item.isRepealed ? "폐지" : null]
    .filter(Boolean)
    .join(" · ");
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
  const initialTemplate = initialTemplates[0] ?? null;
  const [tab, setTab] = useState<"manage" | "request">("manage");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialTemplate?.id ?? "",
  );
  const [creatingTemplate, setCreatingTemplate] = useState(!initialTemplate);
  const [templateName, setTemplateName] = useState(initialTemplate?.name ?? "");
  const [templateBody, setTemplateBody] = useState(
    initialTemplate?.body ?? newTemplateBody,
  );
  const [templateProgressStage, setTemplateProgressStage] = useState<
    ReviewRequestTemplate["defaultProgressStage"]
  >(initialTemplate?.defaultProgressStage ?? "other");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateNotice, setTemplateNotice] = useState("");
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
  const defaultTemplates = useMemo(
    () => templates.filter((template) => Boolean(template.presetKey)),
    [templates],
  );
  const customTemplates = useMemo(
    () => templates.filter((template) => !template.presetKey),
    [templates],
  );
  const templateBodyByteLength = centrexMessageByteLength(templateBody);
  const templateVariables = templateBody.match(/\{\{[^{}]+\}\}/g) ?? [];
  const invalidTemplateVariables = templateVariables.filter(
    (variable) =>
      !(REVIEW_REQUEST_TEMPLATE_VARIABLES as readonly string[]).includes(
        variable,
      ),
  );
  const templateValid =
    templateName.trim().length > 0 &&
    templateBody.trim().length > 0 &&
    templateBodyByteLength <= 500 &&
    templateBody.includes("{{후기작성링크}}") &&
    invalidTemplateVariables.length === 0;
  const templateDirty = creatingTemplate
    ? true
    : Boolean(
        selectedTemplate &&
          (templateName !== selectedTemplate.name ||
            templateBody !== selectedTemplate.body ||
            templateProgressStage !== selectedTemplate.defaultProgressStage),
      );
  const templatePreview = templateBody.trim()
    ? renderReviewRequestTemplate(templateBody, {
        ...templatePreviewValues,
        "{{담당자명}}": staffName,
      })
    : "문자 내용을 입력하면 실제 발송 형태를 여기에서 확인할 수 있습니다.";
  const templatePreviewKind = centrexMessageKind(templatePreview);

  useEffect(() => {
    if (!templateDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [templateDirty]);

  function loadTemplate(template: ReviewRequestTemplate) {
    setSelectedTemplateId(template.id);
    setCreatingTemplate(false);
    setTemplateName(template.name);
    setTemplateBody(template.body);
    setTemplateProgressStage(template.defaultProgressStage);
    setTemplateNotice("");
    setError("");
  }

  function confirmTemplateDraftDiscard() {
    return (
      !templateDirty ||
      window.confirm(
        "저장하지 않은 템플릿 변경사항이 있습니다. 변경사항을 버리고 이동할까요?",
      )
    );
  }

  function selectTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template || (!creatingTemplate && template.id === selectedTemplateId)) {
      return;
    }
    if (!confirmTemplateDraftDiscard()) return;
    loadTemplate(template);
  }

  function startCreatingTemplate() {
    if (!confirmTemplateDraftDiscard()) return;
    setSelectedTemplateId("");
    setCreatingTemplate(true);
    setTemplateName("");
    setTemplateBody(newTemplateBody);
    setTemplateProgressStage("other");
    setTemplateNotice("");
    setError("");
  }

  function discardTemplateDraft() {
    if (creatingTemplate) {
      const fallback = templates[0];
      if (fallback) {
        loadTemplate(fallback);
      }
      return;
    }
    if (selectedTemplate) loadTemplate(selectedTemplate);
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templateValid || (!creatingTemplate && !selectedTemplate)) return;
    setTemplateBusy(true);
    setError("");
    setTemplateNotice("");
    try {
      const response = await fetch(
        creatingTemplate
          ? "/api/review-request-templates"
          : `/api/review-request-templates/${selectedTemplateId}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: templateName,
            body: templateBody,
            defaultProgressStage: templateProgressStage,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | (ReviewRequestTemplate & { message?: string })
        | null;
      if (!response.ok || !body) {
        throw new Error(body?.message ?? "템플릿을 저장하지 못했습니다.");
      }
      setTemplates((current) =>
        sortTemplates(
          creatingTemplate
            ? [...current, body]
            : current.map((item) => (item.id === body.id ? body : item)),
        ),
      );
      setSelectedTemplateId(body.id);
      setCreatingTemplate(false);
      setTemplateName(body.name);
      setTemplateBody(body.body);
      setTemplateProgressStage(body.defaultProgressStage);
      setTemplateNotice(
        creatingTemplate
          ? "새 템플릿을 추가했습니다. 이 템플릿으로 고객을 선택해 발송할 수 있습니다."
          : "템플릿 변경사항을 저장했습니다.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "템플릿을 저장하지 못했습니다.");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function deleteTemplate(template: ReviewRequestTemplate) {
    if (template.presetKey) return;
    if (!window.confirm(`“${template.name}” 템플릿을 삭제할까요?`)) return;
    setTemplateBusy(true);
    setError("");
    setTemplateNotice("");
    try {
      const response = await fetch(`/api/review-request-templates/${template.id}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "템플릿을 삭제하지 못했습니다.");
      const next = templates.filter((item) => item.id !== template.id);
      setTemplates(next);
      const deletedIndex = templates.findIndex((item) => item.id === template.id);
      const fallback = next[Math.min(Math.max(deletedIndex, 0), next.length - 1)];
      if (fallback) {
        loadTemplate(fallback);
        setTemplateNotice(`“${template.name}” 템플릿을 삭제했습니다.`);
      } else {
        setSelectedTemplateId("");
        setCreatingTemplate(true);
        setTemplateName("");
        setTemplateBody(newTemplateBody);
        setTemplateProgressStage("other");
      }
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
    if (
      !selectedTemplate ||
      creatingTemplate ||
      templateDirty ||
      selectedTargets.size === 0
    ) {
      return;
    }
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
                    <span className={`gift-coupon-${item.giftCouponStatus}`}>
                      {item.giftCouponStatus === "sent" ? "발송완료" : "발송대기"}
                    </span>
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
              <span>기본 {defaultTemplates.length}종 · 전체 {templates.length}개</span>
            </header>
            <div className="review-template-toolbar">
              <label className="review-template-selector" htmlFor="review-template-select">
                <span>사용할 템플릿</span>
                <select
                  disabled={templateBusy}
                  id="review-template-select"
                  onChange={(event) => selectTemplate(event.target.value)}
                  value={creatingTemplate ? "" : selectedTemplateId}
                >
                  {creatingTemplate ? <option value="">새 템플릿 작성 중</option> : null}
                  {defaultTemplates.length ? (
                    <optgroup label="기본 템플릿">
                      {defaultTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          [기본] {template.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {customTemplates.length ? (
                    <optgroup label="내가 추가한 템플릿">
                      {customTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <div className="review-template-selection-state" aria-live="polite">
                <span className={selectedTemplate?.presetKey ? "is-default" : "is-custom"}>
                  {creatingTemplate
                    ? "새 템플릿"
                    : selectedTemplate?.presetKey
                      ? "기본 템플릿"
                      : "추가 템플릿"}
                </span>
                <span className={templateDirty ? "is-unsaved" : "is-saved"}>
                  {creatingTemplate
                    ? "저장 후 발송 가능"
                    : templateDirty
                      ? "저장되지 않은 변경"
                      : "저장됨"}
                </span>
              </div>
              <button
                className="review-template-new-button"
                disabled={templateBusy || creatingTemplate}
                onClick={startCreatingTemplate}
                type="button"
              >
                <span aria-hidden="true">＋</span>
                새 템플릿 만들기
              </button>
            </div>
            <div className="review-template-layout">
              <aside className="review-template-preview" aria-label="선택한 템플릿 문자 미리보기">
                <header>
                  <div>
                    <p className="eyebrow">MESSAGE PREVIEW</p>
                    <h3>고객에게 보이는 문자</h3>
                  </div>
                  <span>
                    {templatePreviewKind === "sms"
                      ? "SMS 예상"
                      : templatePreviewKind === "lms"
                        ? "LMS 예상"
                        : "길이 확인 필요"}
                  </span>
                </header>
                <div className="review-template-phone">
                  <div className="review-template-phone-header">
                    <span aria-hidden="true">‹</span>
                    <div>
                      <strong>법무법인 로앤</strong>
                      <small>후기 요청 문자 · 예시</small>
                    </div>
                  </div>
                  <div className="review-template-message">
                    <p>{templatePreview}</p>
                    <span>발송 전 미리보기</span>
                  </div>
                </div>
                <footer>
                  <strong>예시 데이터로 치환했습니다.</strong>
                  <p>
                    실제 발송 시 고객명·담당자명·사건번호와 고객별 1회용 링크가
                    자동으로 들어갑니다.
                  </p>
                </footer>
              </aside>
              <form className="review-template-form" onSubmit={(event) => void saveTemplate(event)}>
                <div className="review-template-form-heading">
                  <div>
                    <p className="eyebrow">TEMPLATE EDITOR</p>
                    <h3>{creatingTemplate ? "새 템플릿 작성" : "템플릿 내용 확인·수정"}</h3>
                  </div>
                  <span className={selectedTemplate?.presetKey ? "is-default" : "is-custom"}>
                    {creatingTemplate
                      ? "새 템플릿"
                      : selectedTemplate?.presetKey
                        ? "기본 템플릿"
                        : "추가 템플릿"}
                  </span>
                </div>
                {selectedTemplate?.presetKey && !creatingTemplate ? (
                  <p className="review-template-lock-note">
                    기본 템플릿은 이름과 후기 시점이 고정됩니다. 문자 내용은 자유롭게
                    수정할 수 있고 삭제되지 않습니다.
                  </p>
                ) : null}
                <label>
                  <span>템플릿 이름</span>
                  <input
                    maxLength={80}
                    onChange={(event) => {
                      setTemplateName(event.target.value);
                      setTemplateNotice("");
                    }}
                    placeholder="예: 사건 종결 후 후기 요청"
                    readOnly={Boolean(selectedTemplate?.presetKey) && !creatingTemplate}
                    required
                    value={templateName}
                  />
                </label>
                <label>
                  <span>후기 작성 시 기본 시점</span>
                  <select
                    disabled={Boolean(selectedTemplate?.presetKey) && !creatingTemplate}
                    onChange={(event) => {
                      setTemplateProgressStage(
                        event.target.value as ReviewRequestTemplate["defaultProgressStage"],
                      );
                      setTemplateNotice("");
                    }}
                    value={templateProgressStage}
                  >
                    {Object.entries(stageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>문자 내용</span>
                  <textarea
                    aria-describedby="review-template-validation"
                    maxLength={720}
                    onChange={(event) => {
                      setTemplateBody(event.target.value);
                      setTemplateNotice("");
                    }}
                    required
                    rows={10}
                    value={templateBody}
                  />
                </label>
                <div className="review-template-validation" id="review-template-validation">
                  <span className={templateBodyByteLength <= 500 ? "is-valid" : "is-invalid"}>
                    {templateBodyByteLength} / 500바이트
                  </span>
                  <span className={templateBody.includes("{{후기작성링크}}") ? "is-valid" : "is-invalid"}>
                    후기 작성 링크 {templateBody.includes("{{후기작성링크}}") ? "포함" : "필수"}
                  </span>
                  {invalidTemplateVariables.length ? (
                    <span className="is-invalid">허용되지 않은 변수가 있습니다.</span>
                  ) : null}
                </div>
                <div className="review-template-variables"><code>{"{{고객명}}"}</code><code>{"{{담당자명}}"}</code><code>{"{{사건번호}}"}</code><code>{"{{후기작성링크}}"}</code></div>
                {templateNotice ? <p className="review-template-notice" role="status">{templateNotice}</p> : null}
                <div className="review-template-form-footer">
                  <div>
                    {!creatingTemplate && selectedTemplate && !selectedTemplate.presetKey ? (
                      <button
                        className="review-template-delete-button"
                        disabled={templateBusy}
                        onClick={() => void deleteTemplate(selectedTemplate)}
                        type="button"
                      >
                        템플릿 삭제
                      </button>
                    ) : (
                      <span>기본 템플릿 4개는 항상 유지됩니다.</span>
                    )}
                  </div>
                  <div className="review-form-actions">
                    {(creatingTemplate || templateDirty) ? (
                      <button disabled={templateBusy} onClick={discardTemplateDraft} type="button">
                        {creatingTemplate ? "작성 취소" : "변경 취소"}
                      </button>
                    ) : null}
                    <button
                      aria-busy={templateBusy}
                      className="primary-button"
                      disabled={templateBusy || !templateValid || (!creatingTemplate && !templateDirty)}
                      type="submit"
                    >
                      {templateBusy
                        ? "저장 중…"
                        : creatingTemplate
                          ? "새 템플릿 추가"
                          : "변경사항 저장"}
                    </button>
                  </div>
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
            <div className="review-selected-customers" aria-live="polite">
              <header>
                <div>
                  <strong>선택한 수신 고객</strong>
                  <span>검색을 바꿔도 아래 목록은 발송 전까지 유지됩니다.</span>
                </div>
                <b>{selectedTargets.size}명</b>
              </header>
              {selectedTargets.size ? (
                <div>
                  {[...selectedTargets.values()].map((item) => (
                    <article key={targetKey(item)}>
                      <span>
                        <small>고객명</small>
                        <strong>{item.clientName}</strong>
                      </span>
                      <span>
                        <small>전화번호</small>
                        <strong>{formatPhone(item.phone)}</strong>
                      </span>
                      <span>
                        <small>사건명</small>
                        <strong>{item.caseName ?? caseTypeLabel(item.caseType)}</strong>
                      </span>
                      <span>
                        <small>사건 진행상태</small>
                        <strong>{caseStateLabel(item)}</strong>
                      </span>
                      <button
                        aria-label={`${item.clientName} 고객 선택 해제`}
                        onClick={() => toggleTarget(item)}
                        type="button"
                      >
                        제외
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p>고객찾기 결과에서 수신 고객을 선택해 주세요.</p>
              )}
            </div>
          </section>

          <section className={selectedTargets.size ? "review-send-dock" : "review-send-dock is-idle"}>
            <div>
              <p>발신 담당자</p><strong>{staffName}</strong>
            </div>
            <div>
              <p>선택 템플릿</p>
              <strong>
                {creatingTemplate
                  ? "새 템플릿 저장 필요"
                  : selectedTemplate?.name ?? "템플릿을 선택해 주세요"}
              </strong>
              {templateDirty ? <small>변경사항을 저장해야 발송할 수 있습니다.</small> : null}
            </div>
            <div>
              <p>수신 고객</p><strong>{selectedTargets.size}명</strong>
            </div>
            <button
              aria-busy={sending}
              className="primary-button"
              disabled={
                sending ||
                creatingTemplate ||
                templateDirty ||
                !selectedTemplate ||
                selectedTargets.size === 0
              }
              onClick={() => void send()}
              type="button"
            >
              {sending ? "요청 등록 중…" : `${selectedTargets.size}명에게 후기 요청`}
            </button>
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
