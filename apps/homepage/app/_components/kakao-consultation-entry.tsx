"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { getConsultationAttributionForCta } from "./journey-tracker";

const KAKAO_ENTRY_STORAGE_KEY = "lawand.bank.kakao-entry.v2";
const KAKAO_ENTRY_REUSE_MS = 30 * 60 * 1_000;

function entryIdempotencyKey(): string {
  try {
    const existing = window.sessionStorage.getItem(KAKAO_ENTRY_STORAGE_KEY);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as {
          createdAt?: unknown;
          id?: unknown;
        };
        if (
          typeof parsed.id === "string" &&
          typeof parsed.createdAt === "number" &&
          Date.now() - parsed.createdAt < KAKAO_ENTRY_REUSE_MS
        ) {
          return parsed.id;
        }
      } catch {
        // 이전 저장 형식은 새 키로 교체한다.
      }
    }
    const created = window.crypto.randomUUID();
    window.sessionStorage.setItem(
      KAKAO_ENTRY_STORAGE_KEY,
      JSON.stringify({ id: created, createdAt: Date.now() }),
    );
    return created;
  } catch {
    return window.crypto.randomUUID();
  }
}

export function KakaoConsultationEntry({
  children,
  className,
  placement,
}: {
  children: ReactNode;
  className?: string;
  placement: string;
}) {
  const [open, setOpen] = useState(false);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const displayNameId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const attributionInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      displayNameRef.current?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled])',
        ) ?? []),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  const modal = open ? (
    <div
      className="kakao-entry-modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setOpen(false);
      }}
    >
      <section
        ref={dialogRef}
        aria-describedby={dialogDescriptionId}
        aria-labelledby={dialogTitleId}
        aria-modal="true"
        className="kakao-entry-modal"
        role="dialog"
      >
        <button
          aria-label="카톡상담 입력창 닫기"
          className="kakao-entry-modal-close"
          onClick={() => setOpen(false)}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>

        <div className="kakao-entry-modal-heading">
          <span>카카오톡 1:1 상담</span>
          <h2 id={dialogTitleId}>어떤 이름으로 찾아볼까요?</h2>
          <p id={dialogDescriptionId}>
            카카오톡 채팅방에서 사용하는 이름이나 표시명을 남겨주시면,
            상담원이 도착한 메시지를 바로 확인할 수 있어요.
          </p>
        </div>

        <form
          action="/api/kakao-entry"
          className="kakao-entry-modal-form"
          method="post"
          rel="noopener noreferrer"
          target="_blank"
          onSubmit={() => {
            if (idempotencyInput.current) {
              idempotencyInput.current.value = entryIdempotencyKey();
            }
            if (attributionInput.current) {
              attributionInput.current.value = JSON.stringify(
                getConsultationAttributionForCta(placement),
              );
            }
            window.setTimeout(() => setOpen(false), 0);
          }}
        >
          <input
            ref={idempotencyInput}
            name="idempotencyKey"
            type="hidden"
          />
          <input ref={attributionInput} name="attribution" type="hidden" />

          <label htmlFor={displayNameId}>이름 또는 카카오톡 표시명</label>
          <input
            ref={displayNameRef}
            autoComplete="name"
            id={displayNameId}
            maxLength={40}
            name="displayName"
            placeholder="예: 김민수, 민수"
            required
            type="text"
          />
          <p className="kakao-entry-modal-help">
            확인을 누르면 이 이름으로 상담이 접수되고 카카오톡 채팅방이 새로
            열립니다. 전화번호와 카카오 사용자 ID는 홈페이지에서 수집하지
            않습니다.
          </p>
          <p className="kakao-entry-modal-privacy">
            입력한 이름은 상담 확인을 위해 암호화해 보관합니다. 자세한 내용은{" "}
            <a href="/privacy" rel="noopener noreferrer" target="_blank">
              개인정보처리방침
            </a>
            에서 확인할 수 있습니다.
          </p>

          <div className="kakao-entry-modal-actions">
            <button
              className="kakao-entry-modal-cancel"
              onClick={() => setOpen(false)}
              type="button"
            >
              취소
            </button>
            <button className="kakao-entry-modal-submit" type="submit">
              확인하고 카카오톡 열기
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  return (
    <span className="kakao-entry-form">
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={className}
        onClick={() => setOpen(true)}
        type="button"
      >
        {children}
      </button>
      {modal ? createPortal(modal, document.body) : null}
    </span>
  );
}
