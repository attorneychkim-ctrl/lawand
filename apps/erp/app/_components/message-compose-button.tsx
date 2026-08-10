/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  centrexMessageByteLength,
  renderMessageTemplate,
} from "@lawand/core";

import type { MessageTemplate, TelephonyMessage } from "../../lib/gateway";

const pendingStatuses = new Set(["queued", "dispatching"]);

function messageStatus(message: TelephonyMessage | null) {
  if (!message) return "";
  if (message.commandStatus === "queued") return "발송 대기열에 등록했습니다.";
  if (message.commandStatus === "dispatching") return "문자 발송을 요청하고 있습니다.";
  if (message.commandStatus === "succeeded") {
    return message.messageKind === "mms"
      ? "이미지 문자를 발송했습니다."
      : "문자를 발송했습니다.";
  }
  return message.lastErrorMessage ?? "문자 발송 결과를 확인해 주세요.";
}

export function MessageComposeButton({
  consultationId,
  customerName,
  receiptCode,
  staffName,
}: {
  consultationId: string;
  customerName: string;
  receiptCode: string;
  staffName: string;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<TelephonyMessage | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, sending]);

  async function openComposer() {
    setOpen(true);
    setError("");
    if (templates.length > 0 || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/message-templates", {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as
        | { items?: MessageTemplate[]; message?: string }
        | null;
      if (!response.ok || !result?.items) {
        throw new Error(result?.message ?? "문자 템플릿을 불러오지 못했습니다.");
      }
      setTemplates(result.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문자 템플릿을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!message || !pendingStatuses.has(message.commandStatus)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/telephony-messages/${message.id}`, {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        const result = (await response.json().catch(() => null)) as
          | (TelephonyMessage & { message?: string })
          | null;
        if (!response.ok || !result) {
          throw new Error(result?.message ?? "문자 상태를 확인하지 못했습니다.");
        }
        setMessage(result);
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "문자 상태를 확인하지 못했습니다.");
        }
      });
    }, 1_500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [message]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? null,
    [selectedId, templates],
  );
  const byteLength = centrexMessageByteLength(body);

  function selectTemplate(templateId: string) {
    setSelectedId(templateId);
    setMessage(null);
    setError("");
    const template = templates.find((item) => item.id === templateId);
    setBody(
      template
        ? renderMessageTemplate(template.body, {
            "{{고객명}}": customerName,
            "{{담당자명}}": staffName,
            "{{접수번호}}": receiptCode,
          })
        : "",
    );
  }

  async function sendMessage() {
    if (!body.trim() || byteLength > 720) return;
    const kind = selectedTemplate?.image ? "이미지 문자(MMS)" : byteLength <= 80 ? "단문 문자(SMS)" : "장문 문자(LMS)";
    if (!window.confirm(`${customerName} 고객에게 ${kind}를 보낼까요?`)) return;
    setSending(true);
    setError("");
    setMessage(null);
    try {
      const response = await fetch(`/api/consultations/${consultationId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          templateId: selectedTemplate?.id ?? null,
          body,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | (TelephonyMessage & { message?: string })
        | null;
      if (!response.ok || !result) {
        throw new Error(result?.message ?? "문자 발송을 요청하지 못했습니다.");
      }
      setMessage(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문자 발송을 요청하지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  const dialog = open ? (
    <div
      className="message-compose-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !sending) setOpen(false);
      }}
    >
      <section
        aria-labelledby="message-compose-title"
        aria-modal="true"
        className="message-compose-dialog"
        role="dialog"
      >
        <header>
          <div>
            <p className="section-kicker">CUSTOMER MESSAGE</p>
            <h2 id="message-compose-title">{customerName} 고객에게 문자 보내기</h2>
            <p>템플릿을 고른 뒤 내용을 마지막으로 확인하고 보내세요.</p>
          </div>
          <button aria-label="문자 보내기 창 닫기" disabled={sending} onClick={() => setOpen(false)} type="button">×</button>
        </header>

        <div className="message-compose-grid">
          <div className="message-compose-form">
            <label>
              <span>내 템플릿</span>
              <select onChange={(event) => selectTemplate(event.target.value)} value={selectedId}>
                <option value="">직접 입력</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.scope === "personal" ? "내 템플릿 · " : "기본 · "}{template.name}{template.image ? " · 이미지" : ""}
                  </option>
                ))}
              </select>
            </label>
            {loading ? <p className="message-compose-help">템플릿을 불러오는 중입니다…</p> : null}
            <label>
              <span>보낼 내용</span>
              <textarea
                autoFocus
                maxLength={720}
                onChange={(event) => setBody(event.target.value)}
                placeholder="고객에게 보낼 내용을 입력해 주세요."
                rows={9}
                value={body}
              />
            </label>
            <div className="message-compose-meta">
              <span>{selectedTemplate?.image ? "MMS" : byteLength <= 80 ? "SMS" : "LMS"}</span>
              <span className={byteLength > 720 ? "is-error" : ""}>{byteLength} / 720 byte</span>
            </div>
            <p className="message-compose-help">
              이미지와 자주 쓰는 문구는 <Link href="/message-templates">내 문자 템플릿</Link>에서 만들 수 있습니다.
            </p>
            {error ? <p className="message-compose-error" role="alert">{error}</p> : null}
            {message ? (
              <p className={`message-compose-result is-${message.commandStatus}`} role="status">
                {messageStatus(message)}
              </p>
            ) : null}
            <div className="message-compose-actions">
              <button className="secondary-button" disabled={sending} onClick={() => setOpen(false)} type="button">취소</button>
              <button className="primary-button" disabled={sending || !body.trim() || byteLength > 720 || pendingStatuses.has(message?.commandStatus ?? "")} onClick={() => void sendMessage()} type="button">
                {sending ? "발송 요청 중…" : pendingStatuses.has(message?.commandStatus ?? "") ? "발송 중…" : "문자 보내기"}
              </button>
            </div>
          </div>

          <div aria-label="문자 미리보기" className="message-phone-preview">
            <div className="message-phone-speaker" />
            <div className="message-phone-header">
              <span>‹</span><strong>{customerName}</strong><span>•••</span>
            </div>
            <div className="message-phone-time">오전 10:30</div>
            <div className="message-phone-bubble">
              {selectedTemplate?.image ? (
                <img alt={`${selectedTemplate.image.originalName} 미리보기`} src={selectedTemplate.image.url} />
              ) : null}
              <p>{body || "입력한 문자가 여기에 표시됩니다."}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button className="message-button" onClick={() => void openComposer()} type="button">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h7" /></svg>
        문자 보내기
      </button>
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
