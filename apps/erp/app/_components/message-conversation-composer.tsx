/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  centrexMessageByteLength,
  MMS_IMAGE_MAX_BYTES,
  MMS_IMAGE_MAX_HEIGHT,
  MMS_IMAGE_MAX_WIDTH,
  renderMessageTemplate,
} from "@lawand/core";

import type {
  ConsultationListSnapshot,
  LegalFriendsClientDirectoryItem,
  LegalFriendsClientDirectorySearch,
  MessageTemplate,
  TelephonyMessage,
} from "../../lib/gateway";

type ImageDraft = {
  originalName: string;
  fileBase64: string;
  previewUrl: string;
};

export type MessageRecipient =
  | {
      kind: "consultation";
      consultationId: string;
      customerName: string;
      phone: string;
      receiptCode: string;
    }
  | {
      kind: "directory";
      clientIdx: number;
      caseIdx: number;
      customerName: string;
      phone: string;
      receiptCode: string;
    }
  | {
      kind: "manual";
      contactId?: string;
      phone?: string;
      customerName: string;
      receiptCode: string;
    };

const pendingStatuses = new Set(["queued", "dispatching"]);

function normalizePhone(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (/^\d{10}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return value;
}

function readImage(file: File): Promise<ImageDraft> {
  return new Promise((resolve, reject) => {
    if (file.type !== "image/jpeg" || file.size > MMS_IMAGE_MAX_BYTES) {
      reject(new Error("이미지는 200KB 이하 JPG 파일만 첨부할 수 있습니다."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
    reader.onload = () => {
      const previewUrl = String(reader.result ?? "");
      const image = new Image();
      image.onerror = () => reject(new Error("올바른 JPG 이미지인지 확인해 주세요."));
      image.onload = () => {
        if (
          image.width > MMS_IMAGE_MAX_WIDTH ||
          image.height > MMS_IMAGE_MAX_HEIGHT
        ) {
          reject(new Error("이미지 해상도는 1500×1440px 이하여야 합니다."));
          return;
        }
        resolve({
          originalName: file.name,
          fileBase64: previewUrl.slice(previewUrl.indexOf(",") + 1),
          previewUrl,
        });
      };
      image.src = previewUrl;
    };
    reader.readAsDataURL(file);
  });
}

function messageStatus(message: TelephonyMessage | null) {
  if (!message) return "";
  if (message.commandStatus === "queued") return "발송 대기열에 등록했습니다.";
  if (message.commandStatus === "dispatching") return "문자를 발송하고 있습니다.";
  if (message.commandStatus === "succeeded") {
    return message.messageKind === "mms"
      ? "이미지 문자를 발송했습니다."
      : "문자를 발송했습니다.";
  }
  return message.lastErrorMessage ?? "문자 발송 결과를 확인해 주세요.";
}

export function MessageConversationComposer({
  recipient,
  templates,
  staffName,
  onSent,
}: {
  recipient: MessageRecipient;
  templates: MessageTemplate[];
  staffName: string;
  onSent: (message: TelephonyMessage, recipient: MessageRecipient) => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [imageDraft, setImageDraft] = useState<ImageDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<TelephonyMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const byteLength = centrexMessageByteLength(body);
  const attachedImage = imageDraft?.previewUrl ?? selectedTemplate?.image?.url ?? null;

  useEffect(() => {
    if (!message || !pendingStatuses.has(message.commandStatus)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/telephony-messages/${message.id}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const result = (await response.json().catch(() => null)) as
            | (TelephonyMessage & { message?: string })
            | null;
          if (!response.ok || !result) {
            throw new Error(result?.message ?? "문자 상태를 확인하지 못했습니다.");
          }
          setMessage(result);
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setError(
              reason instanceof Error
                ? reason.message
                : "문자 상태를 확인하지 못했습니다.",
            );
          }
        });
    }, 1_500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [message]);

  function selectTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    setMessage(null);
    setError("");
    const template = templates.find((item) => item.id === templateId);
    setBody(
      template
        ? renderMessageTemplate(template.body, {
            "{{고객명}}": recipient.customerName,
            "{{담당자명}}": staffName,
            "{{접수번호}}": recipient.receiptCode,
          })
        : "",
    );
  }

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setImageDraft(await readImage(file));
      setMessage(null);
    } catch (reason) {
      setImageDraft(null);
      setError(
        reason instanceof Error ? reason.message : "이미지를 확인하지 못했습니다.",
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeDirectImage() {
    setImageDraft(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function send() {
    if (sending || !body.trim() || byteLength > 720) return;
    setSending(true);
    setError("");
    setMessage(null);
    const common = {
      idempotencyKey: crypto.randomUUID(),
      templateId: selectedTemplate?.id ?? null,
      body,
      ...(imageDraft
        ? {
            image: {
              originalName: imageDraft.originalName,
              fileBase64: imageDraft.fileBase64,
            },
          }
        : {}),
    };
    let url: string;
    let payload: Record<string, unknown> = common;
    if (recipient.kind === "consultation") {
      url = `/api/consultations/${recipient.consultationId}/messages`;
    } else if (recipient.kind === "directory") {
      url = "/api/client-directory/messages";
      payload = {
        ...common,
        clientIdx: recipient.clientIdx,
        caseIdx: recipient.caseIdx,
      };
    } else {
      url = "/api/messages/manual";
      payload = {
        ...common,
        ...(recipient.contactId
          ? { contactId: recipient.contactId }
          : { phone: normalizePhone(recipient.phone ?? "") }),
        ...(!recipient.contactId
          ? { customerName: recipient.customerName }
          : {}),
      };
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as
        | (TelephonyMessage & { message?: string })
        | null;
      if (!response.ok || !result) {
        throw new Error(result?.message ?? "문자 발송을 요청하지 못했습니다.");
      }
      setMessage(result);
      setBody("");
      setSelectedTemplateId("");
      setImageDraft(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSent(result, recipient);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "문자 발송을 요청하지 못했습니다.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="message-inline-composer">
      <div className="message-inline-toolbar">
        <label>
          <span className="sr-only">내 문자 템플릿</span>
          <select
            onChange={(event) => selectTemplate(event.target.value)}
            value={selectedTemplateId}
          >
            <option value="">직접 입력</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}{template.image ? " · 이미지" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="message-image-attach-button">
          <input
            accept="image/jpeg,.jpg,.jpeg"
            onChange={(event) => void chooseImage(event.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 5h16v14H4z" />
            <path d="m6.5 16 4-4 3 3 2-2 2.5 3" />
            <circle cx="8.5" cy="9" r="1.25" />
          </svg>
          이미지
        </label>
        <span className={byteLength > 720 ? "is-error" : ""}>
          {attachedImage ? "MMS" : byteLength <= 80 ? "SMS" : "LMS"} · {byteLength}/720 byte
        </span>
      </div>
      {attachedImage ? (
        <div className="message-inline-image-preview">
          <img alt="첨부 이미지 미리보기" src={attachedImage} />
          <span>{imageDraft?.originalName ?? selectedTemplate?.image?.originalName}</span>
          {imageDraft ? (
            <button aria-label="직접 첨부 이미지 제거" onClick={removeDirectImage} type="button">
              ×
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="message-inline-input-row">
        <textarea
          aria-label={`${recipient.customerName} 고객에게 보낼 문자`}
          onChange={(event) => {
            setBody(event.target.value);
            setMessage(null);
            setError("");
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="문자를 입력하세요. Ctrl/⌘ + Enter로 전송"
          rows={3}
          value={body}
        />
        <button
          aria-label="문자 보내기"
          className="message-inline-send-button"
          disabled={sending || !body.trim() || byteLength > 720}
          onClick={() => void send()}
          type="button"
        >
          {sending ? "…" : "전송"}
        </button>
      </div>
      {error ? <p className="message-compose-error" role="alert">{error}</p> : null}
      {message ? (
        <p className={`message-compose-result is-${message.commandStatus}`} role="status">
          {messageStatus(message)}
        </p>
      ) : null}
    </div>
  );
}

type RecipientSource = "direct" | "erp" | "legal_friends";

export function NewMessageDialog({
  open,
  templates,
  staffName,
  onClose,
  onSent,
}: {
  open: boolean;
  templates: MessageTemplate[];
  staffName: string;
  onClose: () => void;
  onSent: (message: TelephonyMessage, recipient: MessageRecipient) => void;
}) {
  const [source, setSource] = useState<RecipientSource>("direct");
  const [recipient, setRecipient] = useState<MessageRecipient | null>(null);
  const [directName, setDirectName] = useState("");
  const [directPhone, setDirectPhone] = useState("");
  const [erpQuery, setErpQuery] = useState("");
  const [erpItems, setErpItems] = useState<ConsultationListSnapshot["items"]>([]);
  const [erpLoading, setErpLoading] = useState(false);
  const [legalQuery, setLegalQuery] = useState("");
  const [legalItems, setLegalItems] = useState<LegalFriendsClientDirectoryItem[]>([]);
  const [legalLoading, setLegalLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const erpRequested = useRef(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open || erpItems.length > 0 || erpLoading || erpRequested.current) return;
    const timer = window.setTimeout(() => {
      erpRequested.current = true;
      setErpLoading(true);
      void fetch("/api/consultations?page=1&pageSize=100&filter=mine", {
        cache: "no-store",
      })
        .then(async (response) => {
          const result = (await response.json().catch(() => null)) as
            | ConsultationListSnapshot
            | null;
          if (!response.ok || !result) throw new Error();
          setErpItems(result.items);
        })
        .catch(() => setSearchError("ERP 상담 고객을 불러오지 못했습니다."))
        .finally(() => setErpLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [erpItems.length, erpLoading, open]);

  const filteredErpItems = useMemo(() => {
    const query = erpQuery.trim().toLocaleLowerCase("ko-KR");
    if (!query) return erpItems.filter((item) => item.phone).slice(0, 20);
    const digits = normalizePhone(query);
    return erpItems
      .filter(
        (item) =>
          item.phone &&
          (item.displayName.toLocaleLowerCase("ko-KR").includes(query) ||
            item.publicReceiptCode.toLocaleLowerCase("ko-KR").includes(query) ||
            (digits.length >= 2 && normalizePhone(item.phone).includes(digits))),
      )
      .slice(0, 20);
  }, [erpItems, erpQuery]);

  async function searchLegalFriends() {
    const query = legalQuery.trim();
    if (!query) return;
    setLegalLoading(true);
    setSearchError("");
    try {
      const response = await fetch(
        `/api/client-directory?q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      const result = (await response.json().catch(() => null)) as
        | (LegalFriendsClientDirectorySearch & { message?: string })
        | null;
      if (!response.ok || !result) {
        throw new Error(result?.message ?? "리걸프렌즈 고객을 찾지 못했습니다.");
      }
      setLegalItems(result.items.filter((item) => item.callable && item.phone));
    } catch (reason) {
      setLegalItems([]);
      setSearchError(
        reason instanceof Error
          ? reason.message
          : "리걸프렌즈 고객을 찾지 못했습니다.",
      );
    } finally {
      setLegalLoading(false);
    }
  }

  function changeSource(nextSource: RecipientSource) {
    setSource(nextSource);
    setRecipient(null);
    setSearchError("");
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="message-compose-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="new-message-dialog-title"
        aria-modal="true"
        className="new-message-dialog"
        role="dialog"
      >
        <header>
          <div>
            <p className="section-kicker">NEW MESSAGE</p>
            <h2 id="new-message-dialog-title">새 메시지</h2>
            <p>번호를 직접 입력하거나 ERP·리걸프렌즈 고객을 찾아 보냅니다.</p>
          </div>
          <button aria-label="새 메시지 창 닫기" onClick={onClose} type="button">×</button>
        </header>

        <div className="new-message-source-tabs" role="tablist" aria-label="받는 사람 찾기">
          {([
            ["direct", "번호 직접 입력"],
            ["erp", "ERP 상담"],
            ["legal_friends", "리걸프렌즈"],
          ] as const).map(([value, label]) => (
            <button
              aria-selected={source === value}
              className={source === value ? "is-active" : ""}
              key={value}
              onClick={() => changeSource(value)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {!recipient ? (
          <div className="new-message-recipient-search">
            {source === "direct" ? (
              <div className="new-message-direct-fields">
                <label>
                  <span>전화번호</span>
                  <input
                    autoFocus
                    inputMode="tel"
                    onChange={(event) => setDirectPhone(event.target.value)}
                    placeholder="010-1234-5678"
                    value={directPhone}
                  />
                </label>
                <label>
                  <span>표시 이름 <small>선택</small></span>
                  <input
                    maxLength={50}
                    onChange={(event) => setDirectName(event.target.value)}
                    placeholder="고객 이름 또는 메모"
                    value={directName}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={!/^01\d{8,9}$/.test(normalizePhone(directPhone))}
                  onClick={() => {
                    const phone = normalizePhone(directPhone);
                    setRecipient({
                      kind: "manual",
                      phone,
                      customerName: directName.trim() || formatPhone(phone),
                      receiptCode: "직접 입력",
                    });
                  }}
                  type="button"
                >
                  이 번호로 작성
                </button>
              </div>
            ) : source === "erp" ? (
              <>
                <label className="new-message-search-field">
                  <span className="sr-only">ERP 고객 검색</span>
                  <input
                    autoFocus
                    onChange={(event) => setErpQuery(event.target.value)}
                    placeholder="고객명, 전화번호, 접수번호 검색"
                    type="search"
                    value={erpQuery}
                  />
                </label>
                <div className="new-message-result-list">
                  {erpLoading ? <p>ERP 상담 고객을 불러오는 중입니다…</p> : null}
                  {!erpLoading && filteredErpItems.length === 0 ? (
                    <p>문자를 보낼 수 있는 내 담당 상담 고객이 없습니다.</p>
                  ) : null}
                  {filteredErpItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setRecipient({
                        kind: "consultation",
                        consultationId: item.id,
                        customerName: item.displayName,
                        phone: item.phone ?? "",
                        receiptCode: item.publicReceiptCode,
                      })}
                      type="button"
                    >
                      <strong>{item.displayName}</strong>
                      <span>{formatPhone(item.phone ?? "")} · {item.publicReceiptCode}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="new-message-search-field is-with-button">
                  <input
                    autoFocus
                    onChange={(event) => setLegalQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void searchLegalFriends();
                    }}
                    placeholder="고객명 또는 전화번호 4자리 이상"
                    type="search"
                    value={legalQuery}
                  />
                  <button
                    className="secondary-button"
                    disabled={legalLoading || !legalQuery.trim()}
                    onClick={() => void searchLegalFriends()}
                    type="button"
                  >
                    {legalLoading ? "검색 중…" : "검색"}
                  </button>
                </div>
                <div className="new-message-result-list">
                  {!legalLoading && legalItems.length === 0 ? (
                    <p>검색어를 입력해 리걸프렌즈 고객을 찾아보세요.</p>
                  ) : null}
                  {legalItems.map((item) => (
                    <button
                      key={`${item.clientIdx}-${item.caseIdx}`}
                      onClick={() => setRecipient({
                        kind: "directory",
                        clientIdx: item.clientIdx,
                        caseIdx: item.caseIdx,
                        customerName: item.clientName,
                        phone: item.phone ?? "",
                        receiptCode: `Case_idx ${item.caseIdx}`,
                      })}
                      type="button"
                    >
                      <strong>{item.clientName}</strong>
                      <span>
                        {formatPhone(item.phone ?? "")} · Case_idx {item.caseIdx}
                        {item.caseName ? ` · ${item.caseName}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {searchError ? <p className="message-compose-error" role="alert">{searchError}</p> : null}
          </div>
        ) : (
          <div className="new-message-selected-recipient">
            <div>
              <span>받는 사람</span>
              <strong>{recipient.customerName}</strong>
              <small>{formatPhone(recipient.phone ?? "")} · {recipient.receiptCode}</small>
            </div>
            <button className="secondary-button" onClick={() => setRecipient(null)} type="button">
              변경
            </button>
          </div>
        )}

        {recipient ? (
          <MessageConversationComposer
            key={recipient.kind === "manual"
              ? recipient.contactId ?? recipient.phone
              : recipient.kind === "consultation"
                ? recipient.consultationId
                : `${recipient.clientIdx}:${recipient.caseIdx}`}
            onSent={onSent}
            recipient={recipient}
            staffName={staffName}
            templates={templates}
          />
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
