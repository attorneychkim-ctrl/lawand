"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";

import {
  stripConsultationCustomerNameSuffixes,
  type ResidenceRegion,
} from "@lawand/core";

import type {
  ClientDirectoryConsultationResult,
  LegalFriendsClientDirectoryItem,
} from "../../lib/gateway";
import { ConsultationCustomerNameInput } from "./consultation-customer-name-input";

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

function sourceCaseTypeLabel(caseType: number) {
  return caseType === 1 ? "개인회생" : caseType === 2 ? "파산면책" : "기타사건";
}

export function ClientDirectoryConsultationButton({
  item,
}: {
  item: LegalFriendsClientDirectoryItem;
}) {
  const router = useRouter();
  const titleId = useId();
  const referralHelpId = useId();
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [residenceRegion, setResidenceRegion] = useState<ResidenceRegion | "">("");
  const [caseType, setCaseType] = useState<1 | 2 | 3>(1);
  const [isReferral, setIsReferral] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, submitting]);

  function openDialog() {
    setCustomerName(
      stripConsultationCustomerNameSuffixes(item.clientName),
    );
    setPhone(item.phone ?? "");
    setResidenceRegion(item.residenceRegion ?? "");
    setCaseType(defaultCaseType(item.caseType));
    setIsReferral(false);
    setIdempotencyKey(crypto.randomUUID());
    setError("");
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!residenceRegion || !idempotencyKey) {
      setError("거주 지역을 선택해 주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/client-directory/consultations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientIdx: item.clientIdx,
          caseIdx: item.caseIdx,
          idempotencyKey,
          customerName,
          phone,
          residenceRegion,
          caseType,
          isReferral,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | (ClientDirectoryConsultationResult & { message?: string })
        | null;
      if (!response.ok || !result?.consultationId) {
        throw new Error(result?.message ?? "신건상담을 등록하지 못했습니다.");
      }
      router.push(`/consultations/${result.consultationId}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "신건상담을 등록하지 못했습니다.",
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
        className="client-consultation-dialog"
        role="dialog"
      >
        <header>
          <div>
            <p className="section-kicker">NEW CONSULTATION</p>
            <h2 id={titleId}>신건상담에 등록</h2>
            <p>리걸프렌즈 고객정보를 기본값으로 가져왔습니다. 상담 고객에 맞게 모두 수정할 수 있습니다.</p>
          </div>
          <button
            aria-label="신건상담 등록 창 닫기"
            disabled={submitting}
            onClick={() => setOpen(false)}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="client-consultation-source">
          <div>
            <span>선택한 기존 고객</span>
            <strong>{item.clientName}</strong>
          </div>
          <div>
            <span>기존 사건</span>
            <strong>{item.caseNumber || item.caseName || `Case ${item.caseIdx}`}</strong>
          </div>
          <div>
            <span>기존 담당</span>
            <strong>{item.staffNames.join(" · ") || "미지정"}</strong>
          </div>
        </div>

        <form className="client-consultation-form" onSubmit={(event) => void submit(event)}>
          <div className="client-consultation-fields">
            <label>
              <span>이름</span>
              <ConsultationCustomerNameInput
                autoFocus
                onValueChange={setCustomerName}
                required
                tag={isReferral ? "referral" : "existing"}
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
              <small>상담 알림과 리걸프렌즈 등록에 사용할 010 휴대전화 번호입니다.</small>
            </label>
            <label>
              <span>거주 지역</span>
              <select
                onChange={(event) => setResidenceRegion(event.target.value as ResidenceRegion | "")}
                required
                value={residenceRegion}
              >
                <option value="">지역 선택</option>
                {residenceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>사건 유형</span>
              <select
                onChange={(event) => setCaseType(Number(event.target.value) as 1 | 2 | 3)}
                value={caseType}
              >
                <option value={1}>개인회생</option>
                <option value={2}>개인파산·면책</option>
                <option value={3}>기타</option>
              </select>
              <small>기존 사건 유형은 {sourceCaseTypeLabel(item.caseType)}입니다.</small>
            </label>
          </div>

          <label className={`client-consultation-referral${isReferral ? " is-selected" : ""}`}>
            <input
              aria-describedby={referralHelpId}
              checked={isReferral}
              onChange={(event) => {
                setCustomerName((current) =>
                  stripConsultationCustomerNameSuffixes(current),
                );
                setIsReferral(event.target.checked);
              }}
              type="checkbox"
            />
            <span>
              <strong>소개건</strong>
              <small id={referralHelpId}>
                {isReferral
                  ? `${item.clientName} 고객을 소개자로 남깁니다. 위 이름·전화번호는 소개받은 새 고객 정보로 바꿔 주세요.`
                  : "선택한 기존 고객 본인의 새 상담이면 체크하지 않습니다."}
              </small>
            </span>
          </label>

          {error ? <p className="client-consultation-error" role="alert">{error}</p> : null}

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
              {submitting ? "등록 중…" : "신건상담 등록"}
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button className="client-consultation-button" onClick={openDialog} type="button">
        신건상담에 등록
      </button>
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
