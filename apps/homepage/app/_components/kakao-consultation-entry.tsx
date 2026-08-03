"use client";

import { useRef, type ReactNode } from "react";

import { getConsultationAttributionForCta } from "./journey-tracker";

const KAKAO_ENTRY_STORAGE_KEY = "lawand.bank.kakao-entry.v1";
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
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const attributionInput = useRef<HTMLInputElement>(null);

  return (
    <form
      action="/api/kakao-entry"
      className="kakao-entry-form"
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
      }}
    >
      <input
        ref={idempotencyInput}
        name="idempotencyKey"
        type="hidden"
      />
      <input ref={attributionInput} name="attribution" type="hidden" />
      <button className={className} type="submit">
        {children}
      </button>
    </form>
  );
}
