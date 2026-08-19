"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import {
  stripConsultationCustomerNameSuffixes,
  type ConsultationCustomerNameTag,
  type ResidenceRegion,
} from "@lawand/core";

import type {
  ClientDirectoryConsultationResult,
  LegalFriendsClientDirectoryItem,
  LegalFriendsClientDirectorySearch,
} from "../../lib/gateway";
import { ConsultationCustomerNameInput } from "./consultation-customer-name-input";

type DirectoryRelationship = "none" | "customer" | "referrer";

function customerNameTag(
  relationship: DirectoryRelationship,
): ConsultationCustomerNameTag {
  return relationship === "customer"
    ? "existing"
    : relationship === "referrer"
      ? "referral"
      : "none";
}

const residenceOptions: Array<{ value: ResidenceRegion; label: string }> = [
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

function defaultCaseType(caseType: number): 1 | 2 | 3 {
  return caseType === 2 ? 2 : caseType === 3 ? 3 : 1;
}

function formatPhone(value: string | null) {
  if (!value) return "전화번호 미등록";
  const digits = value.replace(/\D/g, "");
  return /^\d{11}$/.test(digits)
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : value;
}

function sourceCaseLabel(item: LegalFriendsClientDirectoryItem) {
  const type =
    item.caseType === 1
      ? "개인회생"
      : item.caseType === 2
        ? "파산면책"
        : "기타사건";
  return `${type} · ${item.caseNumber || item.caseName || `Case ${item.caseIdx}`}`;
}

export function ConsultationCreateButton() {
  const router = useRouter();
  const titleId = useId();
  const sourceHelpId = useId();
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [residenceRegion, setResidenceRegion] = useState<
    ResidenceRegion | ""
  >("");
  const [caseType, setCaseType] = useState<1 | 2 | 3>(1);
  const [transferNote, setTransferNote] = useState("");
  const [relationship, setRelationship] =
    useState<DirectoryRelationship>("none");
  const [selectedSource, setSelectedSource] =
    useState<LegalFriendsClientDirectoryItem | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceResult, setSourceResult] =
    useState<LegalFriendsClientDirectorySearch | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, submitting]);

  function resetCustomerFields() {
    setCustomerName("");
    setPhone("");
    setResidenceRegion("");
    setCaseType(1);
    setTransferNote("");
  }

  function openDialog() {
    resetCustomerFields();
    setRelationship("none");
    setSelectedSource(null);
    setSourceQuery("");
    setSourceResult(null);
    setSourceError("");
    setIdempotencyKey(crypto.randomUUID());
    setError("");
    setOpen(true);
  }

  function changeRelationship(next: Exclude<DirectoryRelationship, "none">) {
    const value = relationship === next ? "none" : next;
    if (selectedSource && relationship === "customer") resetCustomerFields();
    if (value !== "none") {
      setCustomerName((current) =>
        stripConsultationCustomerNameSuffixes(current),
      );
    }
    setRelationship(value);
    setSelectedSource(null);
    setSourceQuery("");
    setSourceResult(null);
    setSourceError("");
    setError("");
  }

  async function searchDirectory() {
    setSourceLoading(true);
    setSourceError("");
    try {
      const response = await fetch(
        `/api/client-directory?q=${encodeURIComponent(sourceQuery)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as
        | (LegalFriendsClientDirectorySearch & { message?: string })
        | null;
      if (!response.ok || !body) {
        throw new Error(body?.message ?? "고객 정보를 조회하지 못했습니다.");
      }
      setSourceResult(body);
    } catch (reason) {
      setSourceResult(null);
      setSourceError(
        reason instanceof Error
          ? reason.message
          : "고객 정보를 조회하지 못했습니다.",
      );
    } finally {
      setSourceLoading(false);
    }
  }

  function handleSourceQueryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!sourceLoading) void searchDirectory();
  }

  function selectSource(item: LegalFriendsClientDirectoryItem) {
    setSelectedSource(item);
    setSourceError("");
    if (relationship === "customer") {
      setCustomerName(
        stripConsultationCustomerNameSuffixes(item.clientName),
      );
      setPhone(item.phone ?? "");
      setResidenceRegion(item.residenceRegion ?? "");
      setCaseType(defaultCaseType(item.caseType));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!residenceRegion || !idempotencyKey) {
      setError("거주 지역을 선택해 주세요.");
      return;
    }
    if (relationship !== "none" && !selectedSource) {
      setError(
        relationship === "customer"
          ? "고객찾기에서 기존 고객을 선택해 주세요."
          : "고객찾기에서 소개자를 선택해 주세요.",
      );
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          customerName,
          phone,
          residenceRegion,
          caseType,
          ...(transferNote.trim() ? { transferNote: transferNote.trim() } : {}),
          directorySource:
            relationship !== "none" && selectedSource
              ? {
                  clientIdx: selectedSource.clientIdx,
                  caseIdx: selectedSource.caseIdx,
                  relationship,
                }
              : null,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | (ClientDirectoryConsultationResult & { message?: string })
        | null;
      if (!response.ok || !result?.consultationId) {
        throw new Error(result?.message ?? "신규상담을 등록하지 못했습니다.");
      }
      router.push(`/consultations/${result.consultationId}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "신규상담을 등록하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const dialog = open ? (
    <div
      className="client-consultation-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) setOpen(false);
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="client-consultation-dialog consultation-create-dialog"
        role="dialog"
      >
        <header>
          <div>
            <p className="section-kicker">NEW CONSULTATION</p>
            <h2 id={titleId}>신규상담 등록</h2>
            <p>
              직원이 접수한 상담도 최초 알림톡을 보내고 작업 큐에 등록합니다. 최근 같은 고객은 기존 상담에 묶고, 리걸프렌즈 고객이면 담당 배정 전에 처리 방법을 확인합니다.
            </p>
          </div>
          <button
            aria-label="신규상담 등록 창 닫기"
            disabled={submitting}
            onClick={() => setOpen(false)}
            type="button"
          >
            ×
          </button>
        </header>

        <form
          className="client-consultation-form"
          onSubmit={(event) => void submit(event)}
        >
          <div
            aria-describedby={sourceHelpId}
            className="client-consultation-source-options"
          >
            <label
              className={`client-consultation-referral${
                relationship === "customer" ? " is-selected" : ""
              }`}
            >
              <input
                checked={relationship === "customer"}
                onChange={() => changeRelationship("customer")}
                type="checkbox"
              />
              <span>
                <strong>기존고객</strong>
                <small>고객찾기에서 본인을 선택하고 정보를 기본값으로 가져옵니다.</small>
              </span>
            </label>
            <label
              className={`client-consultation-referral${
                relationship === "referrer" ? " is-selected" : ""
              }`}
            >
              <input
                checked={relationship === "referrer"}
                onChange={() => changeRelationship("referrer")}
                type="checkbox"
              />
              <span>
                <strong>소개건</strong>
                <small>고객찾기에서 소개자를 선택하고 새 고객 정보는 직접 입력합니다.</small>
              </span>
            </label>
          </div>
          <small className="consultation-source-help" id={sourceHelpId}>
            두 항목은 동시에 선택할 수 없습니다. 해당하지 않으면 체크 없이 신규 고객을 등록하세요.
          </small>

          {relationship !== "none" ? (
            <section className="consultation-source-picker">
              <div className="consultation-source-search">
                <label htmlFor={`${titleId}-source-query`}>
                  {relationship === "customer" ? "기존 고객 찾기" : "소개자 찾기"}
                </label>
                <div>
                  <input
                    autoComplete="off"
                    id={`${titleId}-source-query`}
                    maxLength={30}
                    onChange={(event) => setSourceQuery(event.target.value)}
                    onKeyDown={handleSourceQueryKeyDown}
                    placeholder="고객명 또는 전화번호 끝 4자리"
                    value={sourceQuery}
                  />
                  <button
                    className="secondary-button"
                    disabled={sourceLoading}
                    onClick={() => void searchDirectory()}
                    type="button"
                  >
                    {sourceLoading ? "찾는 중…" : "고객 찾기"}
                  </button>
                </div>
              </div>

              {sourceError ? (
                <p className="client-consultation-error" role="alert">
                  {sourceError}
                </p>
              ) : null}

              {selectedSource ? (
                <div className="client-consultation-source consultation-create-source">
                  <div>
                    <span>{relationship === "customer" ? "선택 고객" : "소개자"}</span>
                    <strong>{selectedSource.clientName}</strong>
                  </div>
                  <div>
                    <span>기존 사건</span>
                    <strong>{sourceCaseLabel(selectedSource)}</strong>
                  </div>
                  <div>
                    <span>기존 담당</span>
                    <strong>{selectedSource.staffNames.join(" · ") || "미지정"}</strong>
                  </div>
                </div>
              ) : null}

              {sourceResult ? (
                sourceResult.items.length === 0 ? (
                  <p className="consultation-source-empty">
                    삭제되지 않은 사건 중 일치하는 고객을 찾지 못했습니다.
                  </p>
                ) : (
                  <div
                    aria-label="고객찾기 검색 결과"
                    className="consultation-source-results"
                    role="listbox"
                  >
                    {sourceResult.items.map((item) => {
                      const selected =
                        selectedSource?.clientIdx === item.clientIdx &&
                        selectedSource.caseIdx === item.caseIdx;
                      return (
                        <button
                          aria-selected={selected}
                          className={selected ? "is-selected" : undefined}
                          key={`${item.clientIdx}:${item.caseIdx}`}
                          onClick={() => selectSource(item)}
                          role="option"
                          type="button"
                        >
                          <span>
                            <strong>{item.clientName}</strong>
                            <small>{formatPhone(item.phone)}</small>
                          </span>
                          <span>
                            <strong>{sourceCaseLabel(item)}</strong>
                            <small>{item.staffNames.join(" · ") || "담당 미지정"}</small>
                          </span>
                          <b>{selected ? "선택됨" : "선택"}</b>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : null}
            </section>
          ) : null}

          <div className="client-consultation-fields">
            <label>
              <span>이름</span>
              <ConsultationCustomerNameInput
                autoFocus
                onValueChange={setCustomerName}
                required
                tag={customerNameTag(relationship)}
                value={customerName}
              />
            </label>
            <label>
              <span>휴대전화</span>
              <input
                autoComplete="tel"
                inputMode="tel"
                maxLength={20}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="010-0000-0000"
                required
                value={phone}
              />
              <small>상담 연락과 상담하기 이후 외부 등록에 사용할 번호입니다.</small>
            </label>
            <label>
              <span>거주 지역</span>
              <select
                onChange={(event) =>
                  setResidenceRegion(
                    event.target.value as ResidenceRegion | "",
                  )
                }
                required
                value={residenceRegion}
              >
                <option value="">지역 선택</option>
                {residenceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>사건 유형</span>
              <select
                onChange={(event) =>
                  setCaseType(Number(event.target.value) as 1 | 2 | 3)
                }
                value={caseType}
              >
                <option value={1}>개인회생</option>
                <option value={2}>개인파산·면책</option>
                <option value={3}>기타</option>
              </select>
            </label>
          </div>

          <label className="client-consultation-note">
            <span>전달사항</span>
            <textarea
              maxLength={2000}
              onChange={(event) => setTransferNote(event.target.value)}
              placeholder="어떤 용건으로 연락했고 현재 어떤 상황인지, 다음 담당자가 알아야 할 내용을 적어 주세요."
              rows={5}
              value={transferNote}
            />
            <small>선택 입력 · 상담 상세의 고객 핵심정보에 표시됩니다.</small>
          </label>

          {error ? (
            <p className="client-consultation-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="client-consultation-actions">
            <button
              className="secondary-button"
              disabled={submitting}
              onClick={() => setOpen(false)}
              type="button"
            >
              취소
            </button>
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? "등록 중…" : "신규상담 등록"}
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button className="queue-create-button" onClick={openDialog} type="button">
        <span aria-hidden="true">＋</span>
        신규등록
      </button>
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
