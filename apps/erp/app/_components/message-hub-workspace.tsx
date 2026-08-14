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
  TelephonyMessage,
} from "../../lib/gateway";
import {
  MessageConversationComposer,
  NewMessageDialog,
  type MessageRecipient,
} from "./message-conversation-composer";
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

function mergeHubItems(
  leading: MessageThreadSummary[],
  trailing: MessageThreadSummary[],
) {
  const seen = new Set<string>();
  return [...leading, ...trailing].filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

function mergeTimeline(
  left: MessageThread["timeline"],
  right: MessageThread["timeline"],
) {
  const seen = new Set<string>();
  return [...left, ...right]
    .filter((item) => {
      const key = `${item.direction}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      a.occurredAt === b.occurredAt
        ? `${a.direction}:${a.id}`.localeCompare(`${b.direction}:${b.id}`)
        : a.occurredAt.localeCompare(b.occurredAt),
    );
}

function recipientFromThread(
  target: MessageThread["thread"] | MessageThreadSummary | undefined,
): MessageRecipient | null {
  if (!target) return null;
  if (target.targetSource === "consultation" && target.consultationId) {
    return {
      kind: "consultation",
      consultationId: target.consultationId,
      customerName: target.customerName,
      phone: target.phone,
      receiptCode: target.receiptCode ?? "ERP 상담",
    };
  }
  if (
    target.targetSource === "legal_friends_directory" &&
    target.clientIdx &&
    target.caseIdx
  ) {
    return {
      kind: "directory",
      clientIdx: target.clientIdx,
      caseIdx: Number(target.caseIdx),
      customerName: target.customerName,
      phone: target.phone,
      receiptCode: `Case_idx ${target.caseIdx}`,
    };
  }
  if (target.targetSource === "manual" && target.manualContactId) {
    return {
      kind: "manual",
      contactId: target.manualContactId,
      customerName: target.customerName,
      phone: target.phone,
      receiptCode: "직접 입력",
    };
  }
  const phone = target.phone.replace(/[^0-9]/g, "");
  if (/^01\d{8,9}$/.test(phone)) {
    return {
      kind: "manual",
      phone,
      customerName: target.customerName,
      receiptCode: "미연결 수신",
    };
  }
  return null;
}

export function MessageHubWorkspace({
  initialHub,
  initialTemplates,
  staffName,
}: {
  initialHub: MessageHub;
  initialTemplates: MessageTemplate[];
  staffName: string;
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
  const [hubLoadingMore, setHubLoadingMore] = useState(false);
  const [threadLoadingOlder, setThreadLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const latestThreadRequest = useRef(0);
  const hubLoadingMoreRef = useRef(false);
  const threadLoadingOlderRef = useRef(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  const filteredThreads = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return normalized
      ? hub.items.filter((item) => threadSearchText(item).includes(normalized))
      : hub.items;
  }, [hub.items, query]);

  const selectedSummary = hub.items.find((item) => item.key === selectedKey);
  const currentThreadTarget =
    thread?.thread.key === selectedKey ? thread.thread : selectedSummary;
  const selectedRecipient = useMemo(
    () => recipientFromThread(currentThreadTarget),
    [currentThreadTarget],
  );
  const configuredMailboxCount = hub.mailboxes.filter(
    (item) => item.isActive && item.credentialConfigured,
  ).length;
  const healthyMailboxCount = hub.mailboxes.filter(
    (item) => item.isActive && item.lastSyncedAt && !item.lastErrorCode,
  ).length;

  const fetchHubPage = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/messages?${params.toString()}`, {
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as
      | (MessageHub & { message?: string })
      | null;
    if (!response.ok || !result) {
      throw new Error(result?.message ?? "문자 내역을 새로고침하지 못했습니다.");
    }
    return result;
  }, []);

  const refreshHub = useCallback(async () => {
    const result = await fetchHubPage();
    setHub((current) => ({
      ...result,
      items: mergeHubItems(result.items, current.items),
    }));
    setSelectedKey((current) => current ?? result.items[0]?.key ?? null);
    return result;
  }, [fetchHubPage]);

  const loadMoreHub = useCallback(async () => {
    if (!hub.nextCursor || hubLoadingMoreRef.current || query.trim()) return;
    hubLoadingMoreRef.current = true;
    setHubLoadingMore(true);
    try {
      const result = await fetchHubPage(hub.nextCursor);
      setHub((current) => ({
        ...current,
        items: mergeHubItems(current.items, result.items),
        nextCursor: result.nextCursor,
      }));
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "이전 문자 대화를 불러오지 못했습니다.",
      );
    } finally {
      hubLoadingMoreRef.current = false;
      setHubLoadingMore(false);
    }
  }, [fetchHubPage, hub.nextCursor, query]);

  const fetchThreadPage = useCallback(async (key: string, cursor?: string) => {
    const params = new URLSearchParams({ key, limit: "50" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/messages/thread?${params.toString()}`, {
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as
      | (MessageThread & { message?: string })
      | null;
    if (!response.ok || !result) {
      throw new Error(result?.message ?? "문자 대화를 불러오지 못했습니다.");
    }
    return result;
  }, []);

  const loadLatestThread = useCallback(
    async (key: string, polling = false) => {
      const requestSequence = ++latestThreadRequest.current;
      const timeline = timelineRef.current;
      const shouldStickToBottom =
        !polling ||
        !timeline ||
        timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 80;
      try {
        const result = await fetchThreadPage(key);
        if (requestSequence !== latestThreadRequest.current) return;
        setThread((current) =>
          current?.thread.key === key
            ? {
                ...result,
                timeline: mergeTimeline(current.timeline, result.timeline),
              }
            : result,
        );
        setLoadError("");
        if (shouldStickToBottom) {
          window.requestAnimationFrame(() => {
            const element = timelineRef.current;
            if (element) element.scrollTop = element.scrollHeight;
          });
        }
      } catch (error) {
        if (requestSequence !== latestThreadRequest.current) return;
        setThread((current) =>
          current?.thread.key === key ? current : null,
        );
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
    },
    [fetchThreadPage],
  );

  const loadOlderMessages = useCallback(async () => {
    if (
      !selectedKey ||
      thread?.thread.key !== selectedKey ||
      !thread.nextCursor ||
      threadLoadingOlderRef.current
    ) {
      return;
    }
    const element = timelineRef.current;
    const previousHeight = element?.scrollHeight ?? 0;
    const previousTop = element?.scrollTop ?? 0;
    threadLoadingOlderRef.current = true;
    setThreadLoadingOlder(true);
    try {
      const result = await fetchThreadPage(selectedKey, thread.nextCursor);
      setThread((current) =>
        current?.thread.key === selectedKey
          ? {
              ...current,
              timeline: mergeTimeline(result.timeline, current.timeline),
              nextCursor: result.nextCursor,
            }
          : current,
      );
      window.requestAnimationFrame(() => {
        const currentElement = timelineRef.current;
        if (currentElement) {
          currentElement.scrollTop =
            previousTop + currentElement.scrollHeight - previousHeight;
        }
      });
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "이전 문자를 불러오지 못했습니다.",
      );
    } finally {
      threadLoadingOlderRef.current = false;
      setThreadLoadingOlder(false);
    }
  }, [fetchThreadPage, selectedKey, thread]);

  useEffect(() => {
    latestThreadRequest.current += 1;
    if (!selectedKey) return;
    const initialTimer = window.setTimeout(() => {
      setLoadError("");
      setThreadLoading(true);
      void loadLatestThread(selectedKey);
    }, 0);
    const timer = window.setInterval(() => {
      void loadLatestThread(selectedKey, true);
    }, 15_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadLatestThread, selectedKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshHub().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refreshHub]);

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
      await refreshHub();
      if (selectedKey) await loadLatestThread(selectedKey);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "문자 내역을 새로고침하지 못했습니다.",
      );
    }
  }

  async function handleSent(
    message: TelephonyMessage,
    recipient: MessageRecipient,
  ) {
    try {
      const result = await refreshHub();
      const nextKey =
        recipient.kind === "directory"
          ? `case:${recipient.caseIdx}`
          : message.targetSource === "manual" && message.manualContactId
            ? `manual:${message.manualContactId}`
            : result.items.find(
                (item) =>
                  recipient.kind === "consultation" &&
                  item.consultationId === recipient.consultationId,
              )?.key ?? selectedKey;
      if (nextKey) {
        setSelectedKey(nextKey);
        setThreadLoading(true);
        await loadLatestThread(nextKey);
      }
      setNewMessageOpen(false);
    } catch {
      if (selectedKey) void loadLatestThread(selectedKey);
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
              <MessageTemplateWorkspace embedded initialItems={initialTemplates} />
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
          <strong>{hub.total}</strong>
        </div>
        <div>
          <span>연결 확인 필요</span>
          <strong>{hub.needsConnectionTotal}</strong>
        </div>
        <div>
          <span>대표 수신함</span>
          <strong>{configuredMailboxCount}/{hub.mailboxes.length}</strong>
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
                <small>{formatPhone(mailbox.lineNumber)} · 내선 {mailbox.extension}</small>
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
            <button
              className="primary-button message-new-button"
              onClick={() => setNewMessageOpen(true)}
              type="button"
            >
              + 새 메시지
            </button>
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
              aria-label="문자 목록 새로고침"
              className="secondary-button message-refresh-button"
              onClick={() => void refreshAll()}
              type="button"
            >
              ↻
            </button>
          </header>
          <div
            className="message-thread-list"
            onScroll={(event) => {
              const element = event.currentTarget;
              if (
                element.scrollHeight - element.scrollTop - element.clientHeight < 120
              ) {
                void loadMoreHub();
              }
            }}
          >
            {filteredThreads.length === 0 ? (
              <p className="message-thread-empty">
                {query ? "불러온 대화에서 검색 결과가 없습니다." : "아직 문자 내역이 없습니다."}
              </p>
            ) : (
              filteredThreads.map((item) => (
                <button
                  className={item.key === selectedKey ? "is-selected" : ""}
                  key={item.key}
                  onClick={() => {
                    if (item.key === selectedKey) return;
                    latestThreadRequest.current += 1;
                    setSelectedKey(item.key);
                    setThread(null);
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
                        : item.targetSource === "manual"
                          ? "직접 입력"
                          : "고객 연결 확인 필요"}
                    {item.needsConnection ? <i>미연결</i> : null}
                  </span>
                  <span className="message-thread-preview">
                    <b>{item.lastDirection === "inbound" ? "수신" : "발신"}</b>
                    {item.lastMessagePreview}
                  </span>
                  <small>{formatPhone(item.phone)} · {item.messageCount}건</small>
                </button>
              ))
            )}
            {hubLoadingMore ? (
              <p className="message-thread-loading">이전 대화를 불러오는 중…</p>
            ) : !query && hub.nextCursor ? (
              <button
                className="message-thread-load-more"
                onClick={() => void loadMoreHub()}
                type="button"
              >
                이전 대화 더 보기
              </button>
            ) : null}
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
                    : selectedSummary?.targetSource === "manual"
                      ? "직접 입력한 연락처"
                      : selectedSummary?.needsConnection
                        ? "발신 맥락이 없어 고객 연결을 확인해야 합니다."
                        : "왼쪽에서 고객 대화를 선택해 주세요."}
                {selectedSummary ? ` · ${formatPhone(selectedSummary.phone)}` : ""}
              </p>
            </div>
            <button
              className="secondary-button"
              onClick={() => setTemplateOpen(true)}
              type="button"
            >
              템플릿 관리
            </button>
          </header>

          {loadError ? <p className="error-banner" role="alert">{loadError}</p> : null}

          <div
            className="message-timeline"
            aria-live="polite"
            onScroll={(event) => {
              if (event.currentTarget.scrollTop < 100) {
                void loadOlderMessages();
              }
            }}
            ref={timelineRef}
          >
            {threadLoadingOlder ? (
              <p className="message-timeline-loading">이전 문자를 불러오는 중…</p>
            ) : thread?.thread.key === selectedKey && thread.nextCursor ? (
              <button
                className="message-timeline-load-more"
                onClick={() => void loadOlderMessages()}
                type="button"
              >
                이전 문자 더 보기
              </button>
            ) : null}
            {!selectedKey ? (
              <p className="message-conversation-empty">표시할 문자 대화가 없습니다.</p>
            ) : threadLoading || (!loadError && thread?.thread.key !== selectedKey) ? (
              <p className="message-conversation-empty">최근 대화를 불러오는 중입니다…</p>
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

          {selectedRecipient ? (
            <MessageConversationComposer
              key={selectedRecipient.kind === "manual"
                ? selectedRecipient.contactId ?? selectedRecipient.phone
                : selectedRecipient.kind === "consultation"
                  ? selectedRecipient.consultationId
                  : `${selectedRecipient.clientIdx}:${selectedRecipient.caseIdx}`}
              onSent={(message, recipient) => void handleSent(message, recipient)}
              recipient={selectedRecipient}
              staffName={staffName}
              templates={initialTemplates}
            />
          ) : (
            <p className="message-composer-unavailable">
              이 수신 건은 고객 연결을 확인한 뒤 새 메시지에서 번호를 선택해 보내세요.
            </p>
          )}
        </div>
      </section>
      {templateModal}
      {newMessageOpen ? (
        <NewMessageDialog
          onClose={() => setNewMessageOpen(false)}
          onSent={(message, recipient) => void handleSent(message, recipient)}
          open
          staffName={staffName}
          templates={initialTemplates}
        />
      ) : null}
    </div>
  );
}
