"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { ResidenceRegion } from "@lawand/core";

import { getConsultationAttributionForCta } from "./journey-tracker";

const KAKAO_ENTRY_STORAGE_KEY = "lawand.bank.kakao-entry.v4";
const KAKAO_ENTRY_REUSE_MS = 30 * 60 * 1_000;

const RESIDENCE_REGION_OPTIONS: Array<{
  value: ResidenceRegion;
  label: string;
}> = [
  { value: "seoul", label: "서울" },
  { value: "busan", label: "부산" },
  { value: "daegu", label: "대구" },
  { value: "incheon", label: "인천" },
  { value: "gwangju", label: "광주" },
  { value: "daejeon", label: "대전" },
  { value: "ulsan", label: "울산" },
  { value: "sejong", label: "세종" },
  { value: "gyeonggi", label: "경기" },
  { value: "gangwon", label: "강원" },
  { value: "chungbuk", label: "충북" },
  { value: "chungnam", label: "충남" },
  { value: "jeonbuk", label: "전북" },
  { value: "jeonnam", label: "전남" },
  { value: "gyeongbuk", label: "경북" },
  { value: "gyeongnam", label: "경남" },
  { value: "jeju", label: "제주" },
  { value: "overseas_or_other", label: "해외·기타" },
];

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

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
  const [displayName, setDisplayName] = useState("");
  const [residenceRegion, setResidenceRegion] = useState<
    ResidenceRegion | ""
  >("");
  const [phone, setPhone] = useState("");
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const displayNameId = useId();
  const residenceRegionId = useId();
  const phoneId = useId();
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
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])',
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
          onSubmit={(event) => {
            if (!displayName.trim()) {
              event.preventDefault();
              displayNameRef.current?.setCustomValidity(
                "이름 또는 카카오톡 표시명을 입력해 주세요.",
              );
              displayNameRef.current?.reportValidity();
              return;
            }
            if (!residenceRegion) {
              event.preventDefault();
              return;
            }
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

          <label htmlFor={displayNameId}>
            이름 또는 카카오톡 표시명 <span>필수</span>
          </label>
          <input
            ref={displayNameRef}
            autoComplete="name"
            id={displayNameId}
            maxLength={40}
            name="displayName"
            onChange={(event) => {
              event.currentTarget.setCustomValidity("");
              setDisplayName(event.target.value);
            }}
            placeholder="예: 김민수, 민수"
            required
            type="text"
            value={displayName}
          />
          <label htmlFor={residenceRegionId}>
            거주 지역 <span>필수</span>
          </label>
          <select
            id={residenceRegionId}
            name="residenceRegion"
            onChange={(event) =>
              setResidenceRegion(event.target.value as ResidenceRegion | "")
            }
            required
            value={residenceRegion}
          >
            <option value="">시·도 선택</option>
            {RESIDENCE_REGION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor={phoneId}>
            휴대전화 번호
            <span className="is-optional">선택 · 입력하지 않으셔도 돼요</span>
          </label>
          <input
            autoComplete="tel"
            id={phoneId}
            inputMode="numeric"
            maxLength={13}
            name="phone"
            onChange={(event) =>
              setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))
            }
            pattern="010-[0-9]{4}-[0-9]{4}"
            placeholder="010-0000-0000"
            type="tel"
            value={formatPhone(phone)}
          />
          <p className="kakao-entry-modal-help">
            버튼을 누르면 이 이름과 거주 지역으로 상담이 접수되고 카카오톡
            채팅방이 새로 열립니다. 전화번호를 남기면 상담원이 더 빠르게 고객을
            확인할 수 있지만, 입력하지 않으셔도 카카오 상담을 이용할 수 있어요.
          </p>
          <p className="kakao-entry-modal-privacy">
            입력한 이름·거주 지역과 선택 입력한 전화번호는 상담 확인을 위해
            암호화해 보관합니다. 카카오 사용자 ID와 메시지 원문은 홈페이지에서
            받지 않습니다. 자세한 내용은{" "}
            <a href="/privacy" rel="noopener noreferrer" target="_blank">
              개인정보처리방침
            </a>
            에서 확인할 수 있습니다.
          </p>

          <aside
            aria-label="카카오톡 상담 접수 안내"
            className="kakao-entry-modal-message-guide"
          >
            <strong>꼭 확인해 주세요</strong>
            <p>
              카카오톡 채팅방이 열리기만 하면 상담원에게 접수되지 않아요.
            </p>
            <p>
              카카오톡으로 이동한 뒤 <strong>“상담 신청합니다”라고 메시지를 한 번
              보내주세요.</strong>
            </p>
            <p>메시지를 보내야 상담원이 고객님의 상담 요청을 확인할 수 있어요.</p>
          </aside>

          <div className="kakao-entry-modal-actions">
            <button
              className="kakao-entry-modal-cancel"
              onClick={() => setOpen(false)}
              type="button"
            >
              취소
            </button>
            <button
              className="kakao-entry-modal-submit"
              disabled={!displayName.trim() || !residenceRegion}
              type="submit"
            >
              카카오톡 열고 상담 메시지 보내기
            </button>
          </div>
          <p className="kakao-entry-modal-submit-note">
            카카오톡이 열리면 채팅방에서 메시지를 꼭 보내주세요.
          </p>
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
