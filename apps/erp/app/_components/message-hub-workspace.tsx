/* eslint-disable @next/next/no-img-element */
"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type {
  MessageHub,
  MessageTemplate,
  MessageThread,
  MessageThreadSummary,
} from "../../lib/gateway";
import { MessageTemplateWorkspace } from "./message-template-workspace";

function formatKst(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function messageKindLabel(kind: "sms" | "lms" | "mms") {
  return kind.toUpperCase();
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^02\d{7}$/.test(digits)) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  if (/^02\d{8}$/.test(digits)) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (/^\d{10}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return value;
}

function deliveryLabel(status: string) {
  return status === "succeeded"
    ? "발송 완료"
    : status === "failed"
      ? "발송 실패"
      : status === "received"
        ? "수신"
        : status === "dispatching"
          ? "발송 중"
          : status === "queued"
            ? "발송 대기"
            : "결과 확인 중";
}

function MessageHistoryImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="message-history-image-unavailable">
        첨부 이미지를 표시할 수 없습니다.
      </span>
    );
  }
  return (
    <img
      alt="문자에 첨부된 이미지"
      className="message-history-image"
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={url}
    />
  );
}

function threadSearchText(thread: MessageThreadSummary) {
  return [
    thread.customerName,
    thread.phone,
    thread.caseIdx,
    thread.receiptCode,
    thread.lastMessagePreview,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ko-KR");
}

export function MessageHubWorkspace({
  initialHub,
  initialTemplates,
}: {
  initialHub: MessageHub;
  initialTemplates: MessageTemplate[];
}) {
  const router = useRouter();
  const [hub, setHub] = useState(initialHub);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialHub.items[0]?.key ?? null,
  );
  const [query, setQuery] = useState("");
  const [thread, setThread] = useState<MessageThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(
    Boolean(initialHub.items[0]),
  );
  const [loadError, setLoadError] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const latestThreadRequest = useRef(0);

  const filteredThreads = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return normalized
      ? hub.items.filter((item) => threadSearchText(item).includes(normalized))
      : hub.items;
  }, [hub.items, query]);

  const selectedSummary = hub.items.find((item) => item.key === selectedKey);
  const configuredMailboxCount = hub.mailboxes.filter(
    (item) => item.isActive && item.credentialConfigured,
  ).length;
  const healthyMailboxCount = hub.mailboxes.filter(
    (item) => item.isActive && item.lastSyncedAt && !item.lastErrorCode,
  ).length;

  const loadHub = useCallback(async () => {
    const response = await fetch("/api/messages", { cache: "no-store" });
    const result = (await response.json().catch(() => null)) as
      | (MessageHub & { message?: string })
      | null;
    if (!response.ok || !result) {
      throw new Error(result?.message ?? "문자 내역을 새로고침하지 못했습니다.");
    }
    setHub(result);
    setSelectedKey((current) =>
      current && result.items.some((item) => item.key === current)
        ? current
        : result.items[0]?.key ?? null,
    );
  }, []);

  const loadThread = useCallback(async (key: string) => {
    const requestSequence = ++latestThreadRequest.current;
    try {
      const response = await fetch(
        `/api/messages/thread?key=${encodeURIComponent(key)}`,
        { cache: "no-store" },
      );
      const result = (await response.json().catch(() => null)) as
        | (MessageThread & { message?: string })
        | null;
      if (!response.ok || !result) {
        throw new Error(result?.message ?? "문자 대화를 불러오지 못했습니다.");
      }
      if (requestSequence !== latestThreadRequest.current) return;
      setThread(result);
      setLoadError("");
    } catch (error) {
      if (requestSequence !== latestThreadRequest.current) return;
      setThread(null);
      setLoadError(
        error instanceof Error
          ? error.message
          : "문자 대화를 불러오지 못했습니다.",
      );
    } finally {
      if (requestSequence === latestThreadRequest.current) {
        setThreadLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    latestThreadRequest.current += 1;
    if (!selectedKey) return;
    const initialTimer = window.setTimeout(() => {
      setLoadError("");
      setThreadLoading(true);
      void loadThread(selectedKey);
    }, 0);
    const timer = window.setInterval(() => {
      void loadThread(selectedKey);
    }, 15_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadThread, selectedKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadHub().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadHub]);

  useEffect(() => {
    if (!templateOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTemplateOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [templateOpen]);

  async function refreshAll() {
    setLoadError("");
    try {
      await loadHub();
      if (selectedKey) await loadThread(selectedKey);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "문자 내역을 새로고침하지 못했습니다.",
      );
    }
  }

  function closeTemplates() {
    setTemplateOpen(false);
    router.refresh();
  }

  const templateModal =
    templateOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="message-template-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeTemplates();
            }}
          >
            <section
              aria-labelledby="message-template-modal-title"
              aria-modal="true"
              className="message-template-modal"
              role="dialog"
            >
              <header>
                <div>
                  <p className="section-kicker">PERSONAL TEMPLATE</p>
                  <h2 id="message-template-modal-title">내 문자 템플릿</h2>
                  <p>내 계정에서 사용할 문구와 JPG 명함 이미지를 관리합니다.</p>
                </div>
                <button
                  aria-label="템플릿 창 닫기"
                  autoFocus
                  onClick={closeTemplates}
                  type="button"
                >
                  ×
                </button>
              </header>
              <MessageTemplateWorkspace
                embedded
                initialItems={initialTemplates}
              />
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="message-hub-workspace">
      <section className="message-hub-metrics" aria-label="문자 현황">
        <div>
          <span>고객 대화</span>
          <strong>{hub.items.length}</strong>
        </div>
        <div>
          <span>연결 확인 필요</span>
          <strong>{hub.items.filter((item) => item.needsConnection).length}</strong>
        </div>
        <div>
          <span>대표 수신함</span>
          <strong>
            {configuredMailboxCount}/{hub.mailboxes.length}
          </strong>
        </div>
        <div className={healthyMailboxCount === configuredMailboxCount ? "is-healthy" : ""}>
          <span>정상 동기화</span>
          <strong>{healthyMailboxCount}</strong>
        </div>
      </section>

      <details className="message-mailbox-status">
        <summary>대표번호 수신함 상태 보기</summary>
        <div>
          {hub.mailboxes.map((mailbox) => (
            <article key={mailbox.id}>
              <span
                className={
                  mailbox.isActive && mailbox.credentialConfigured && !mailbox.lastErrorCode
                    ? "is-ready"
                    : ""
                }
              />
              <div>
                <strong>{formatPhone(mailbox.publicNumber ?? mailbox.lineNumber)}</strong>
                <small>
                  {formatPhone(mailbox.lineNumber)} · 내선 {mailbox.extension}
                </small>
              </div>
              <em>
                {!mailbox.credentialConfigured
                  ? "연결 전"
                  : !mailbox.isActive
                    ? "비활성"
                    : mailbox.lastErrorCode
                      ? "확인 필요"
                      : mailbox.lastSyncedAt
                        ? `${formatKst(mailbox.lastSyncedAt)} 확인`
                        : "첫 동기화 대기"}
              </em>
            </article>
          ))}
        </div>
      </details>

      <section className="erp-panel message-hub-panel">
        <aside className="message-thread-sidebar">
          <header>
            <label className="message-thread-search">
              <span className="sr-only">고객 문자 대화 검색</span>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="고객명, Case_idx, 번호 검색"
                type="search"
                value={query}
              />
            </label>
            <button
              className="secondary-button"
              onClick={() => void refreshAll()}
              type="button"
            >
              새로고침
            </button>
          </header>
          <div className="message-thread-list">
            {filteredThreads.length === 0 ? (
              <p className="message-thread-empty">
                {query ? "검색 결과가 없습니다." : "아직 문자 내역이 없습니다."}
              </p>
            ) : (
              filteredThreads.map((item) => (
                <button
                  className={item.key === selectedKey ? "is-selected" : ""}
                  key={item.key}
                  onClick={() => {
                    if (item.key === selectedKey) return;
                    setSelectedKey(item.key);
                    setThreadLoading(true);
                    setLoadError("");
                  }}
                  type="button"
                >
                  <span className="message-thread-heading">
                    <strong>{item.customerName}</strong>
                    <time>{formatKst(item.lastMessageAt)}</time>
                  </span>
                  <span className="message-thread-context">
                    {item.caseIdx
                      ? `Case_idx ${item.caseIdx}`
                      : item.receiptCode
                        ? `상담 ${item.receiptCode}`
                        : "고객 연결 확인 필요"}
                    {item.needsConnection ? <i>미연결</i> : null}
                  </span>
                  <span className="message-thread-preview">
                    <b>{item.lastDirection === "inbound" ? "수신" : "발신"}</b>
                    {item.lastMessagePreview}
                  </span>
                  <small>
                    {formatPhone(item.phone)} · {item.messageCount}건
                  </small>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="message-conversation">
          <header>
            <div>
              <p className="section-kicker">MESSAGE HISTORY</p>
              <h2>{selectedSummary?.customerName ?? "문자 대화"}</h2>
              <p>
                {selectedSummary?.caseIdx
                  ? `Case_idx ${selectedSummary.caseIdx}`
                  : selectedSummary?.receiptCode
                    ? `상담 ${selectedSummary.receiptCode}`
                    : selectedSummary?.needsConnection
                      ? "발신 맥락이 없어 고객 연결을 확인해야 합니다."
                      : "왼쪽에서 고객 대화를 선택해 주세요."}
                {selectedSummary ? ` · ${formatPhone(selectedSummary.phone)}` : ""}
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => setTemplateOpen(true)}
              type="button"
            >
              템플릿 관리
            </button>
          </header>

          {loadError ? (
            <p className="error-banner" role="alert">{loadError}</p>
          ) : null}

          <div className="message-timeline" aria-live="polite">
            {!selectedKey ? (
              <p className="message-conversation-empty">표시할 문자 대화가 없습니다.</p>
            ) : threadLoading || (!loadError && thread?.thread.key !== selectedKey) ? (
              <p className="message-conversation-empty">대화를 불러오는 중입니다…</p>
            ) : !thread ? (
              <p className="message-conversation-empty">대화를 불러오지 못했습니다.</p>
            ) : (
              thread.timeline.map((message) => (
                <article
                  className={`message-bubble-row is-${message.direction}`}
                  key={`${message.direction}-${message.id}`}
                >
                  <div className="message-history-bubble">
                    {message.imageUrl ? (
                      <MessageHistoryImage key={message.imageUrl} url={message.imageUrl} />
                    ) : message.imageAttached ? (
                      <span className="message-history-image-unavailable">
                        첨부 이미지를 표시할 수 없습니다.
                      </span>
                    ) : null}
                    <p>{message.body}</p>
                    <footer>
                      <span>
                        {messageKindLabel(message.messageKind)} · {message.provider === "solapi" ? "SOLAPI" : "U+ 센트릭스"}
                      </span>
                      <time>{formatKst(message.occurredAt)}</time>
                    </footer>
                  </div>
                  <small>
                    {message.direction === "outbound"
                      ? `${message.staffDisplayName ?? "담당자"} · ${deliveryLabel(message.status)}`
                      : `${formatPhone(message.endpoint.publicNumber ?? message.endpoint.lineNumber)} 수신`}
                  </small>
                </article>
              ))
            )}
          </div>
          <p className="message-match-note">
            수신 문자는 같은 휴대전화번호의 직전 발신 건을 기준으로 Case_idx에 연결됩니다.
          </p>
        </div>
      </section>
      {templateModal}
    </div>
  );
}
