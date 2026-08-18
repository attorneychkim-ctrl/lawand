"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import type {
  PhoneDeskAftercareInput,
  PhoneDeskCallDetail,
  PhoneDeskCallResult,
} from "../../lib/gateway";
import { MessageComposeButton } from "./message-compose-button";

const resultOptions = [
  { value: "consultation_completed", label: "상담완료" },
  { value: "reconsultation_required", label: "재상담필요" },
  { value: "no_answer", label: "부재 및 무응답" },
  { value: "busy", label: "통화중" },
  { value: "manager_callback_requested", label: "담당자 연결 요청" },
  { value: "rejected", label: "거절" },
  { value: "public_institution", label: "법원 등 관공서" },
  { value: "creditor", label: "채권자 등" },
  { value: "wrong_number", label: "잘못 걸린 전화" },
  { value: "other", label: "기타" },
] as const satisfies ReadonlyArray<{
  value: PhoneDeskCallResult;
  label: string;
}>;

const internalResultOptions = [
  { value: "internal_completed", label: "내선 통화 완료" },
  { value: "internal_follow_up", label: "내부 확인 필요" },
  { value: "internal_no_answer", label: "내선 미연결" },
] as const satisfies ReadonlyArray<{
  value: PhoneDeskCallResult;
  label: string;
}>;

const followUpDefaultResults = new Set<PhoneDeskCallResult>([
  "reconsultation_required",
  "no_answer",
  "busy",
  "manager_callback_requested",
  "rejected",
  "internal_follow_up",
]);

const consultationStateLabels: Record<string, string> = {
  requested: "신규 접수",
  assigned: "상담 진행",
  contacted: "연락 완료",
  completed: "상담 완료",
  engaged: "계약",
  closed: "종결",
};

const residenceRegionOptions = [
  ["seoul", "서울"], ["busan", "부산"], ["daegu", "대구"],
  ["incheon", "인천"], ["gwangju", "광주"], ["daejeon", "대전"],
  ["ulsan", "울산"], ["sejong", "세종"], ["gyeonggi", "경기"],
  ["gangwon", "강원"], ["chungbuk", "충북"], ["chungnam", "충남"],
  ["jeonbuk", "전북"], ["jeonnam", "전남"], ["gyeongbuk", "경북"],
  ["gyeongnam", "경남"], ["jeju", "제주"],
  ["overseas_or_other", "해외·기타"],
] as const;

const revivalStateLabels = new Map([
  [5, "상담대기"],
  [10, "상담완료"],
  [11, "재상담필요"],
  [15, "계약"],
  [20, "서류준비"],
  [21, "부채증명서 발급중"],
  [22, "부채증명서 발급완료"],
  [25, "신청서 작성 진행중"],
  [30, "신청서 제출"],
  [35, "금지명령"],
  [40, "보정기간"],
  [45, "개시결정"],
  [50, "채권자 집회기일"],
  [55, "인가결정"],
]);

const bankruptcyStateLabels = new Map([
  [5, "상담대기"],
  [10, "상담완료"],
  [11, "재상담필요"],
  [15, "계약"],
  [20, "서류준비"],
  [21, "부채증명서 발급중"],
  [22, "부채증명서 발급완료"],
  [25, "신청서 작성 진행중"],
  [30, "신청서 제출"],
  [40, "보정기간"],
  [100, "파산선고"],
  [105, "의견청취기일"],
  [110, "재산환가 및 배당"],
  [115, "파산폐지"],
  [120, "면책결정"],
  [125, "면책불허가"],
]);

type FollowUpDateOption = {
  value: string;
  label: string;
  sublabel: string;
};

type LinkedConsultationContext = {
  id: string;
  publicReceiptCode: string;
  displayName: string;
  state: string;
  firstRequestedAt: string | null;
  lastRequestedAt: string | null;
  assigneeDisplayName: string | null;
};

export const phoneDeskResultLabels = Object.fromEntries(
  [...resultOptions, ...internalResultOptions].map((item) => [item.value, item.label]),
) as Record<PhoneDeskCallResult, string>;

function nextHalfHourValue() {
  const next = new Date();
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() < 30 ? 30 : 60);
  if (next.getTime() <= Date.now() + 10 * 60_000) {
    next.setMinutes(next.getMinutes() + 30);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(next);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function kstDateTimeValue(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(", ", "T");
}

function formatDate(value: string | null) {
  if (!value) return "확인되지 않음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day
    ? `${year}.${month}.${day}.`
    : value;
}

function makeFollowUpDateOptions(
  minimumDueAt: string,
  count = 5,
): FollowUpDateOption[] {
  if (!minimumDueAt) return [];
  const [dateValue, minimumTime] = minimumDueAt.split("T");
  const [year, month, day] = dateValue.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  const options: FollowUpDateOption[] = [];

  for (let offset = 0; options.length < count && offset < 14; offset += 1) {
    const candidate = new Date(anchor);
    candidate.setUTCDate(anchor.getUTCDate() + offset);
    const weekday = candidate.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (offset === 0 && minimumTime > "18:30") continue;
    const candidateMonth = candidate.getUTCMonth() + 1;
    const candidateDay = candidate.getUTCDate();
    const value = `${candidate.getUTCFullYear()}-${String(candidateMonth).padStart(2, "0")}-${String(candidateDay).padStart(2, "0")}`;
    options.push({
      value,
      label: offset === 0 ? "오늘" : offset === 1 ? "내일" : `${candidateMonth}월 ${candidateDay}일`,
      sublabel: new Intl.DateTimeFormat("ko-KR", {
        timeZone: "UTC",
        weekday: "short",
      }).format(candidate),
    });
  }
  return options;
}

function makeFollowUpTimeOptions(
  dateValue: string,
  minimumDueAt: string,
  selectedTime: string,
) {
  if (!dateValue || !minimumDueAt) return [];
  const [minimumDate, minimumTime] = minimumDueAt.split("T");
  const start = 8 * 60;
  const lastStart = 18 * 60 + 30;
  let first = start;
  if (dateValue === minimumDate) {
    const [hour, minute] = minimumTime.split(":").map(Number);
    first = Math.max(first, hour * 60 + minute);
  }
  const options: string[] = [];
  for (let minutes = first; minutes <= lastStart; minutes += 30) {
    options.push(
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    );
  }
  if (selectedTime && !options.includes(selectedTime)) {
    options.push(selectedTime);
    options.sort();
  }
  return options;
}

function formatTimeRange(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const start = hour * 60 + minute;
  const end = start + 30;
  const display = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${display(start)}~${display(end)}`;
}

function caseTypeLabel(caseType: number) {
  return caseType === 1
    ? "개인회생"
    : caseType === 2
      ? "파산면책"
      : "기타사건";
}

function caseStateLabel(caseType: number, caseState: number) {
  const label = caseType === 2
    ? bankruptcyStateLabels.get(caseState)
    : revivalStateLabels.get(caseState);
  return label ?? `진행 상태 ${caseState}`;
}

function formatPhone(phone: string | null) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (/^02\d{7,8}$/.test(digits)) {
    const split = digits.length === 9 ? 5 : 6;
    return `${digits.slice(0, 2)}-${digits.slice(2, split)}-${digits.slice(split)}`;
  }
  if (/^\d{10}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function suggestedConsultation(
  detail: PhoneDeskCallDetail,
): LinkedConsultationContext | null {
  const resolved = detail.call.customerMatch?.source === "consultation"
    ? detail.call.customerMatch.consultation
    : null;
  const clicked = detail.call.clickToCall?.consultation ?? null;
  if (clicked) {
    if (resolved?.id === clicked.id) return resolved;
    return {
      ...clicked,
      firstRequestedAt: null,
      lastRequestedAt: null,
      assigneeDisplayName: null,
    };
  }
  return resolved;
}

function messageTarget(detail: PhoneDeskCallDetail) {
  const consultation = detail.call.clickToCall?.consultation ??
    (detail.call.customerMatch?.source === "consultation"
      ? detail.call.customerMatch.consultation
      : null);
  if (consultation) {
    return {
      source: "consultation" as const,
      consultationId: consultation.id,
      customerName: consultation.displayName,
      receiptCode: consultation.publicReceiptCode,
    };
  }
  const clickedDirectory = detail.call.clickToCall?.directoryClient;
  if (clickedDirectory) {
    return {
      source: "legal_friends_directory" as const,
      clientIdx: clickedDirectory.clientIdx,
      caseIdx: clickedDirectory.caseIdx,
      customerName: clickedDirectory.displayName,
      receiptCode: "리걸프렌즈",
    };
  }
  const legalFriends = detail.legalFriendsMatch;
  const latestCase = legalFriends?.cases[0];
  if (legalFriends && latestCase) {
    return {
      source: "legal_friends_directory" as const,
      clientIdx: latestCase.clientIdx,
      caseIdx: latestCase.caseIdx,
      customerName: legalFriends.clientName,
      receiptCode: latestCase.caseNumber ?? "리걸프렌즈",
    };
  }
  return null;
}

export function PhoneAftercareForm({
  detail,
  staffName,
  onSaved,
  returnTo,
}: {
  detail: PhoneDeskCallDetail;
  staffName: string;
  onSaved?: (next: PhoneDeskCallDetail) => void;
  returnTo?: string;
}) {
  const router = useRouter();
  const existing = detail.call.aftercare;
  const internal = detail.call.scope === "internal";
  const suggested = suggestedConsultation(detail);
  const recommendedAssignee = detail.recommendedAssigneeUserIds[0] ?? "";
  const existingPhonebook = detail.call.customerMatch?.source === "phonebook"
    ? detail.call.customerMatch.contact
    : null;
  const canOfferPhonebook = Boolean(
    !internal &&
      detail.call.remotePhone &&
      (!detail.call.customerMatch || existingPhonebook),
  );
  const [result, setResult] = useState<PhoneDeskCallResult | "">(
    existing?.result ?? "consultation_completed",
  );
  const [otherText, setOtherText] = useState(existing?.otherText ?? "");
  const [memo, setMemo] = useState(existing?.memo ?? "");
  const [phonebookEnabled, setPhonebookEnabled] = useState(
    Boolean(existingPhonebook),
  );
  const [phonebookName, setPhonebookName] = useState(
    existingPhonebook?.displayName ?? "",
  );
  const [phonebookOriginalPhone, setPhonebookOriginalPhone] = useState(
    existingPhonebook?.originalPhone ?? detail.call.remotePhone ?? "",
  );
  const [phonebookConnectedPhone, setPhonebookConnectedPhone] = useState(
    existingPhonebook?.connectedPhone ?? "",
  );
  const [consultationMode, setConsultationMode] = useState<
    "none" | "link" | "create"
  >(internal ? "none" : existing?.consultationId || suggested ? "link" : "none");
  const [customerName, setCustomerName] = useState(
    detail.legalFriendsMatch?.clientName ??
      (detail.call.customerMatch?.source === "legal_friends"
        ? detail.call.customerMatch.clientName
        : ""),
  );
  const [residenceRegion, setResidenceRegion] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [consultationAssignee, setConsultationAssignee] = useState(
    recommendedAssignee,
  );
  const [followUpEnabled, setFollowUpEnabled] = useState(
    existing?.followUp?.state === "open",
  );
  const existingFollowUpDueAt = existing?.followUp?.state === "open"
    ? kstDateTimeValue(existing.followUp.dueAt)
    : "";
  const [followUpDate, setFollowUpDate] = useState(
    existingFollowUpDueAt.split("T")[0] ?? "",
  );
  const [followUpTime, setFollowUpTime] = useState(
    existingFollowUpDueAt.split("T")[1] ?? "",
  );
  const [minimumDueAt, setMinimumDueAt] = useState("");
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [followUpAssignee, setFollowUpAssignee] = useState(
    existing?.followUp?.state === "open"
      ? existing.followUp.assignee.staffUserId
      : recommendedAssignee,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [automaticSelections, setAutomaticSelections] = useState<
    Partial<Record<PhoneDeskCallResult, boolean>>
  >({});

  useEffect(() => {
    queueMicrotask(() => {
      const minimum = nextHalfHourValue();
      setMinimumDueAt(minimum);
      const [date, time] = minimum.split("T");
      setFollowUpDate((current) => current || date);
      setFollowUpTime((current) => current || time);
    });
  }, []);

  const linkedConsultationId =
    existing?.consultationId ?? suggested?.id ?? null;
  const followUpDateOptions = useMemo(
    () => makeFollowUpDateOptions(minimumDueAt),
    [minimumDueAt],
  );
  const followUpTimeOptions = useMemo(
    () => makeFollowUpTimeOptions(
      followUpDate,
      minimumDueAt,
      followUpTime,
    ),
    [followUpDate, followUpTime, minimumDueAt],
  );
  const followUpDueAt = followUpDate && followUpTime
    ? `${followUpDate}T${followUpTime}`
    : "";
  const followUpDueValid = Boolean(
    followUpDueAt && minimumDueAt && followUpDueAt >= minimumDueAt,
  );
  const safeMessageTarget = messageTarget(detail);
  const selectedAutomation = detail.aftercareAutomations?.find(
    (item) => item.result === result,
  ) ?? null;
  const automaticMessageAvailable = Boolean(
    safeMessageTarget && selectedAutomation?.available,
  );

  const automaticMessageDefault = Boolean(
    automaticMessageAvailable &&
      selectedAutomation?.latest?.status !== "sent" &&
      selectedAutomation?.latest?.status !== "pending" &&
      selectedAutomation?.latest?.status !== "unknown",
  );
  const sendAutomaticMessage = result
    ? automaticSelections[result] ?? automaticMessageDefault
    : false;
  const normalizedOriginalPhone = phonebookOriginalPhone.replace(/\D/g, "");
  const normalizedConnectedPhone = phonebookConnectedPhone.replace(/\D/g, "");
  const phonebookCallNumberIncluded = Boolean(
    detail.call.remotePhone &&
      [normalizedOriginalPhone, normalizedConnectedPhone].includes(
        detail.call.remotePhone,
      ),
  );
  const canSave = Boolean(
    result &&
      (result !== "other" || otherText.trim()) &&
      (consultationMode !== "link" || linkedConsultationId) &&
      (consultationMode !== "create" || (customerName.trim() && residenceRegion)) &&
      (!followUpEnabled || (followUpDueValid && followUpAssignee)) &&
      (!phonebookEnabled ||
        (phonebookName.trim() &&
          normalizedOriginalPhone.length >= 8 &&
          phonebookCallNumberIncluded)),
  );
  const visibleResultOptions = internal ? internalResultOptions : resultOptions;

  function chooseResult(value: PhoneDeskCallResult) {
    setResult(value);
    setFollowUpEnabled(followUpDefaultResults.has(value));
    if (
      canOfferPhonebook &&
      !existingPhonebook &&
      (value === "public_institution" || value === "creditor")
    ) {
      setPhonebookEnabled(true);
    }
    setSaved(false);
  }

  async function save() {
    if (!result || !canSave) return;
    setSaving(true);
    setError("");
    setSaved(false);
    const consultation: PhoneDeskAftercareInput["consultation"] =
      consultationMode === "link" && linkedConsultationId
        ? { mode: "link", consultationId: linkedConsultationId }
        : consultationMode === "create"
          ? {
              mode: "create",
              customerName: customerName.trim(),
              residenceRegion: residenceRegion as Extract<
                PhoneDeskAftercareInput["consultation"],
                { mode: "create" }
              >["residenceRegion"],
              ...(consultationAssignee
                ? { assigneeUserId: consultationAssignee }
                : {}),
              ...(transferNote.trim()
                ? { transferNote: transferNote.trim() }
                : {}),
            }
          : { mode: "none" };
    const input: PhoneDeskAftercareInput = {
      result,
      ...(result === "other" ? { otherText: otherText.trim() } : {}),
      ...(memo.trim() ? { memo: memo.trim() } : {}),
      consultation,
      followUp: followUpEnabled
        ? {
            enabled: true,
            dueAt: `${followUpDueAt}:00+09:00`,
            assigneeUserId: followUpAssignee,
          }
        : { enabled: false },
      phonebook: phonebookEnabled
        ? {
            mode: "save",
            displayName: phonebookName.trim(),
            originalPhone: normalizedOriginalPhone,
            ...(normalizedConnectedPhone
              ? { connectedPhone: normalizedConnectedPhone }
              : {}),
          }
          : { mode: "none" },
      automaticMessage: { enabled: sendAutomaticMessage && automaticMessageAvailable },
    };
    try {
      const response = await fetch(
        `/api/phone-desk/calls/${detail.call.id}/aftercare`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | (PhoneDeskCallDetail & { message?: string })
        | null;
      if (!response.ok || !body?.call) {
        throw new Error(body?.message ?? "통화 후처리를 저장하지 못했습니다.");
      }
      setSaved(true);
      onSaved?.(body);
      if (returnTo) {
        router.push(returnTo);
      }
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "통화 후처리를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="phone-aftercare-form">
      <fieldset className="phone-aftercare-section">
        <legend>통화 결과</legend>
        <div className="phone-aftercare-results">
          {visibleResultOptions.map((option) => (
            <button
              aria-pressed={result === option.value}
              className={result === option.value ? "is-selected" : undefined}
              key={option.value}
              onClick={() => chooseResult(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        {result === "other" ? (
          <label className="phone-aftercare-field">
            <span>기타 내용</span>
            <input
              maxLength={500}
              onChange={(event) => setOtherText(event.target.value)}
              placeholder="통화 결과를 입력해 주세요"
              value={otherText}
            />
          </label>
        ) : null}
      </fieldset>

      {!internal ? <>
        <section className="phone-aftercare-message-action">
          <div>
            <strong>고객에게 문자 남기기</strong>
            <span>{automaticMessageAvailable
              ? selectedAutomation?.kind === "review_request"
                ? "후기관리 → 후기 요청 → 기본 템플릿의 ‘상담을 받은 뒤’ 내용과 개인 후기 작성 링크가 발송됩니다."
                : result === "manager_callback_requested"
                  ? "후처리를 저장하면 등록된 내 템플릿과 재연락 일정·담당자가 고객에게 발송됩니다."
                  : "후처리를 저장하면 이 결과에 등록된 내 문자 템플릿이 고객에게 발송됩니다."
              : "통화 결과와 관계없이 안내나 부재 메시지를 바로 보낼 수 있습니다."}</span>
          </div>
          {automaticMessageAvailable ? (
            <div className="phone-aftercare-message-unavailable">
              <label className="phone-aftercare-choice">
                <input
                  checked={sendAutomaticMessage}
                  disabled={selectedAutomation?.latest?.status === "pending"}
                  onChange={(event) => {
                    if (!result) return;
                    setAutomaticSelections((current) => ({
                      ...current,
                      [result]: event.target.checked,
                    }));
                  }}
                  type="checkbox"
                />
                <span>
                  <strong>{selectedAutomation?.kind === "review_request" ? "후기 요청 문자 발송" : "자동문자 발송 예정"}</strong>
                  <span>사용 템플릿: {selectedAutomation?.templateName}</span>
                </span>
              </label>
              {selectedAutomation?.latest ? (
                <small>
                  {new Intl.DateTimeFormat("ko-KR", {
                    timeZone: "Asia/Seoul",
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(selectedAutomation.latest.occurredAt))}
                  {selectedAutomation.latest.status === "sent"
                    ? " 발송 완료 · 다시 보내려면 체크하세요."
                    : selectedAutomation.latest.status === "pending"
                      ? " 발송 처리 중"
                      : selectedAutomation.latest.status === "unknown"
                        ? " 발송 결과 확인 필요 · 중복 발송 여부를 먼저 확인하세요."
                        : " 이전 발송 실패 · 다시 시도할 수 있습니다."}
                </small>
              ) : null}
              {selectedAutomation?.templateBody ? (
                <details>
                  <summary>발송될 내용 미리보기</summary>
                  <p style={{ whiteSpace: "pre-wrap" }}>{selectedAutomation.templateBody}</p>
                </details>
              ) : null}
            </div>
          ) : safeMessageTarget?.source === "consultation" ? (
            <MessageComposeButton
              consultationId={safeMessageTarget.consultationId}
              customerName={safeMessageTarget.customerName}
              receiptCode={safeMessageTarget.receiptCode}
              staffName={staffName}
            />
          ) : safeMessageTarget?.source === "legal_friends_directory" ? (
            <MessageComposeButton
              customerName={safeMessageTarget.customerName}
              directoryTarget={{
                clientIdx: safeMessageTarget.clientIdx,
                caseIdx: safeMessageTarget.caseIdx,
              }}
              receiptCode={safeMessageTarget.receiptCode}
              staffName={staffName}
            />
          ) : (
            <div className="phone-aftercare-message-unavailable">
              <button className="message-button" disabled type="button">문자 보내기</button>
              <small>상담 또는 리걸프렌즈 고객 연결 후 사용할 수 있습니다.</small>
            </div>
          )}
        </section>

        {canOfferPhonebook ? (
          <fieldset className="phone-aftercare-section phone-aftercare-phonebook">
            <legend>발신자 정보</legend>
            <label className="phone-aftercare-choice">
              <input
                checked={phonebookEnabled}
                onChange={(event) => setPhonebookEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>{existingPhonebook ? "전화번호부 정보 수정" : "전화번호부에 저장"}</strong>
                <span>다음 수신부터 저장한 이름과 전화번호를 알림에 표시합니다.</span>
              </span>
            </label>
            {phonebookEnabled ? (
              <div className="phone-aftercare-grid">
                <label className="phone-aftercare-field">
                  <span>발신자 이름</span>
                  <input
                    maxLength={100}
                    onChange={(event) => setPhonebookName(event.target.value)}
                    placeholder="예: 서울회생법원"
                    value={phonebookName}
                  />
                </label>
                <label className="phone-aftercare-field">
                  <span>원번호</span>
                  <input
                    inputMode="tel"
                    maxLength={20}
                    onChange={(event) => setPhonebookOriginalPhone(event.target.value)}
                    placeholder="02-530-1953"
                    value={formatPhone(phonebookOriginalPhone)}
                  />
                </label>
                <label className="phone-aftercare-field">
                  <span>연결번호 <small>선택</small></span>
                  <input
                    inputMode="tel"
                    maxLength={20}
                    onChange={(event) => setPhonebookConnectedPhone(event.target.value)}
                    placeholder="착신·지역 연결 시 보이는 번호"
                    value={formatPhone(phonebookConnectedPhone)}
                  />
                </label>
                <p className="phone-aftercare-phonebook-help">
                  원번호와 연결번호 어느 쪽으로 전화가 와도 같은 발신자로 찾습니다.
                  현재 통화 번호는 둘 중 하나에 포함되어야 합니다.
                </p>
                {!phonebookCallNumberIncluded ? (
                  <p className="phone-aftercare-schedule-error">
                    현재 통화 번호 {formatPhone(detail.call.remotePhone)}를 원번호 또는 연결번호에 입력해 주세요.
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>
        ) : null}

        <fieldset className="phone-aftercare-section">
        <legend>상담데스크 연결</legend>
        {suggested || existing?.consultationId ? (
          <div className={`phone-aftercare-choice-block${consultationMode === "link" ? " is-selected" : ""}`}>
            <label className="phone-aftercare-choice">
              <input
                checked={consultationMode === "link"}
                onChange={() => setConsultationMode("link")}
                type="radio"
              />
              <span>
                <strong>기존 상담에 연결</strong>
                <span>같은 전화번호로 등록된 상담 기록에 이 통화를 연결합니다.</span>
              </span>
            </label>
            {suggested ? (
              <div className="phone-aftercare-consultation-context">
                <div className="phone-aftercare-context-heading">
                  <Link href={`/consultations/${suggested.id}`}>
                    {suggested.displayName} · {suggested.publicReceiptCode}
                  </Link>
                  <span>{consultationStateLabels[suggested.state] ?? suggested.state}</span>
                </div>
                <dl>
                  <div>
                    <dt>등록일</dt>
                    <dd>{formatDate(suggested.firstRequestedAt)}</dd>
                  </div>
                  <div>
                    <dt>최근 요청</dt>
                    <dd>{formatDate(suggested.lastRequestedAt)}</dd>
                  </div>
                  <div>
                    <dt>담당자</dt>
                    <dd>{suggested.assigneeDisplayName ?? "미배정"}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="phone-aftercare-consultation-context">
                <Link href={`/consultations/${existing!.consultationId}`}>
                  이미 연결된 상담 상세 보기
                </Link>
              </div>
            )}
          </div>
        ) : null}
        <label className="phone-aftercare-choice">
          <input
            checked={consultationMode === "create"}
            onChange={() => setConsultationMode("create")}
            type="radio"
          />
          <span>
            <strong>신건상담으로 저장</strong>
            <span>전화데스크 통화와 상담데스크 고객을 함께 연결합니다.</span>
          </span>
        </label>
        <label className="phone-aftercare-choice">
          <input
            checked={consultationMode === "none"}
            onChange={() => setConsultationMode("none")}
            type="radio"
          />
          <span>
            <strong>전화데스크에만 저장</strong>
            <span>상담데스크 고객은 만들거나 연결하지 않습니다.</span>
          </span>
        </label>
        {consultationMode === "create" ? (
          <>
            <div className="phone-aftercare-grid">
              <label className="phone-aftercare-field">
                <span>고객명</span>
                <input
                  maxLength={50}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="고객명"
                  value={customerName}
                />
              </label>
              <label className="phone-aftercare-field">
                <span>상담 담당자</span>
                <select
                  onChange={(event) => setConsultationAssignee(event.target.value)}
                  value={consultationAssignee}
                >
                  <option value="">미배정으로 생성</option>
                  {detail.staffOptions.map((staff) => (
                    <option key={staff.staffUserId} value={staff.staffUserId}>
                      {staff.displayName} · {staff.department}
                    </option>
                  ))}
                </select>
              </label>
              <label className="phone-aftercare-field">
                <span>거주 지역</span>
                <select
                  onChange={(event) => setResidenceRegion(event.target.value)}
                  required
                  value={residenceRegion}
                >
                  <option value="">지역 선택</option>
                  {residenceRegionOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="phone-aftercare-field phone-aftercare-transfer-note">
              <span>전달사항</span>
              <textarea
                maxLength={2000}
                onChange={(event) => setTransferNote(event.target.value)}
                placeholder="어떤 용건으로 연락했고 현재 어떤 상황인지, 다음 담당자가 알아야 할 내용을 적어 주세요."
                rows={4}
                value={transferNote}
              />
              <small>선택 입력 · 생성된 상담의 고객 핵심정보에 표시됩니다.</small>
            </label>
          </>
        ) : null}

        {detail.legalFriendsMatch ? (
          <section className="phone-aftercare-directory-context" aria-label="리걸프렌즈 동기화 정보">
            <div className="phone-aftercare-directory-heading">
              <div>
                <strong>리걸프렌즈 동기화 정보</strong>
                <span>{detail.legalFriendsMatch.clientName} · 관련 사건 {detail.legalFriendsMatch.cases.length}건</span>
              </div>
              <span>전화번호 일치</span>
            </div>
            <div className="phone-aftercare-directory-list">
              {detail.legalFriendsMatch.cases.slice(0, 3).map((caseItem, index) => (
                <article key={`${caseItem.caseType}-${caseItem.caseUpdatedOn}-${index}`}>
                  <div>
                    <strong>{caseTypeLabel(caseItem.caseType)}</strong>
                    <span>{caseStateLabel(caseItem.caseType, caseItem.caseState)}</span>
                    {caseItem.isClosed ? <em>종결</em> : caseItem.isRepealed ? <em>폐지</em> : null}
                  </div>
                  <dl>
                    <div>
                      <dt>담당</dt>
                      <dd>{caseItem.staffNames.join(" · ") || "미지정"}</dd>
                    </div>
                    <div>
                      <dt>법원</dt>
                      <dd>{caseItem.courtName || "미등록"}</dd>
                    </div>
                    <div>
                      <dt>사건 등록</dt>
                      <dd>{formatDateOnly(caseItem.caseCreatedOn)}</dd>
                    </div>
                    <div>
                      <dt>최근 갱신</dt>
                      <dd>{formatDateOnly(caseItem.caseUpdatedOn)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            {detail.legalFriendsMatch.cases.length > 3 ? (
              <p>최근 갱신 기준 3건을 표시했습니다. 그 외 {detail.legalFriendsMatch.cases.length - 3}건이 더 있습니다.</p>
            ) : null}
          </section>
        ) : null}
        </fieldset>
      </> : (
        <p className="info-banner">
          내선 통화는 고객 상담과 연결하지 않고 사내 통화 기록으로만 저장합니다.
        </p>
      )}

      <fieldset className="phone-aftercare-section is-follow-up">
        <legend>{internal ? "내부 확인 업무" : "재통화 업무"}</legend>
        <label className="phone-aftercare-toggle">
          <input
            checked={followUpEnabled}
            onChange={(event) => setFollowUpEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>{internal ? "내부 확인 업무 큐에 추가" : "재통화 업무 큐에 추가"}</strong>
            <small>필요한 결과는 기본으로 체크되며 언제든 해제할 수 있습니다.</small>
          </span>
        </label>
        {followUpEnabled ? (
          <div className="phone-aftercare-follow-up-fields">
            <div className="phone-aftercare-schedule-picker">
              <p>재통화할 날짜와 30분 구간을 차례로 선택해 주세요.</p>
              <div className="phone-aftercare-date-options" aria-label="재통화 날짜">
                {followUpDateOptions.map((option) => (
                  <button
                    aria-pressed={followUpDate === option.value}
                    className={followUpDate === option.value ? "is-selected" : undefined}
                    key={option.value}
                    onClick={() => {
                      setFollowUpDate(option.value);
                      setFollowUpTime("");
                      setCustomDateOpen(false);
                    }}
                    type="button"
                  >
                    <strong>{option.label}</strong>
                    <span>{option.sublabel}</span>
                  </button>
                ))}
                <button
                  aria-pressed={customDateOpen || Boolean(followUpDate && !followUpDateOptions.some((option) => option.value === followUpDate))}
                  className={customDateOpen || Boolean(followUpDate && !followUpDateOptions.some((option) => option.value === followUpDate)) ? "is-selected" : undefined}
                  onClick={() => setCustomDateOpen(true)}
                  type="button"
                >
                  <strong>다른 날짜</strong>
                  <span>직접 선택</span>
                </button>
              </div>
              {customDateOpen ? (
                <label className="phone-aftercare-custom-date">
                  <span>재통화 날짜</span>
                  <input
                    min={minimumDueAt.split("T")[0] || undefined}
                    onChange={(event) => {
                      setFollowUpDate(event.target.value);
                      setFollowUpTime("");
                    }}
                    type="date"
                    value={followUpDate}
                  />
                </label>
              ) : null}
              {followUpDate ? (
                <>
                  <p className="phone-aftercare-schedule-label">
                    {formatDateOnly(followUpDate)} 재통화 시간
                  </p>
                  {followUpTimeOptions.length ? (
                    <div className="phone-aftercare-time-options">
                      {followUpTimeOptions.map((time) => (
                        <button
                          aria-pressed={followUpTime === time}
                          className={followUpTime === time ? "is-selected" : undefined}
                          key={time}
                          onClick={() => setFollowUpTime(time)}
                          type="button"
                        >
                          {formatTimeRange(time)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="phone-aftercare-schedule-empty">선택 가능한 업무시간이 지났습니다. 다음 날짜를 선택해 주세요.</p>
                  )}
                </>
              ) : null}
              {followUpDueAt && !followUpDueValid ? (
                <p className="phone-aftercare-schedule-error">현재보다 이후의 30분 구간을 선택해 주세요.</p>
              ) : null}
            </div>
            <label className="phone-aftercare-field">
              <span>담당자</span>
              <select
                onChange={(event) => setFollowUpAssignee(event.target.value)}
                required
                value={followUpAssignee}
              >
                <option value="">담당자 선택</option>
                {detail.staffOptions.map((staff) => (
                  <option key={staff.staffUserId} value={staff.staffUserId}>
                    {staff.displayName} · {staff.department}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </fieldset>

      <label className="phone-aftercare-field">
        <span>통화 메모</span>
        <textarea
          maxLength={2000}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="다음 담당자가 바로 이해할 수 있도록 핵심 내용을 남겨 주세요."
          rows={5}
          value={memo}
        />
      </label>

      {error ? <p className="phone-aftercare-error" role="alert">{error}</p> : null}
      {saved ? <p className="phone-aftercare-success" role="status">통화 후처리와 업무 큐를 저장했습니다.</p> : null}
      <button
        className="primary-button phone-aftercare-submit"
        disabled={!canSave || saving}
        onClick={save}
        type="button"
      >
        {saving ? "저장 중…" : existing ? "후처리 수정 저장" : "후처리 저장"}
      </button>
    </div>
  );
}

export function PhoneAftercareDialog({
  callId,
  staffName,
  open,
  onClose,
  onSaved,
}: {
  callId: string | null;
  staffName: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (next: PhoneDeskCallDetail) => void;
}) {
  const [detail, setDetail] = useState<PhoneDeskCallDetail | null>(null);
  const [error, setError] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    queueMicrotask(() => setPortalReady(true));
  }, []);

  useEffect(() => {
    if (!open || !portalReady) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, portalReady]);

  useEffect(() => {
    if (!open || !callId || !portalReady) return;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.scrollTo({ top: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [callId, open, portalReady]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !callId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setDetail(null);
        setError("");
      }
    });
    void fetch(`/api/phone-desk/calls/${callId}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | (PhoneDeskCallDetail & { message?: string })
          | null;
        if (!response.ok || !body?.call) {
          throw new Error(body?.message ?? "통화 상세를 불러오지 못했습니다.");
        }
        setDetail(body);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "통화 상세를 불러오지 못했습니다.",
        );
      });
    return () => controller.abort();
  }, [callId, open]);

  if (!open || !callId || !portalReady) return null;
  return createPortal(
    <div
      className="phone-aftercare-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="phone-aftercare-dialog-title"
        aria-modal="true"
        className="phone-aftercare-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">CALL AFTERCARE</p>
            <h2 id="phone-aftercare-dialog-title">
              {detail?.call.state === "connected"
                ? "통화 중 후처리"
                : "통화 후처리"}
            </h2>
            <p>
              {detail
                ? detail.call.state === "connected"
                  ? `${formatPhone(detail.call.remotePhone)} 통화 중입니다. 메모·재연락 일정·문자를 바로 남길 수 있습니다.`
                  : detail.call.scope === "internal"
                  ? "내선 통화 결과를 정리해 주세요."
                  : `${formatPhone(detail.call.remotePhone)} 통화 결과를 정리해 주세요.`
                : "통화 정보를 불러오는 중입니다."}
            </p>
          </div>
          <button aria-label="닫기" onClick={onClose} type="button">×</button>
        </header>
        {error ? <p className="error-banner" role="alert">{error}</p> : null}
        {detail ? (
          <PhoneAftercareForm
            detail={detail}
            staffName={staffName}
            onSaved={(next) => {
              setDetail(next);
              onSaved?.(next);
            }}
          />
        ) : !error ? (
          <p className="phone-aftercare-loading">통화 상세를 불러오는 중…</p>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
