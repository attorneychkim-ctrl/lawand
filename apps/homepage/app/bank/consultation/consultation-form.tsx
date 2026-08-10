"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ConsultationSubmission,
  ConsultationSubmissionResponse,
  ResidenceRegion,
} from "@lawand/core";
import { CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION } from "@lawand/core";

import { KakaoConsultationEntry } from "@/app/_components/kakao-consultation-entry";
import { moveAttention } from "@/lib/move-attention";

import { getConsultationAttribution } from "../../_components/journey-tracker";
import {
  ArrowIcon,
  CheckIcon,
  KakaoChatIcon,
  PhoneIcon,
} from "../_components/site-chrome";

type FormMode = "quick" | "detailed";
type CallbackMode = "asap" | "scheduled";
type FormStep =
  | "topic"
  | "urgency"
  | "income"
  | "debts"
  | "assets"
  | "discharge"
  | "concern"
  | "schedule"
  | "contact"
  | "review";

type FormData = {
  topic: string;
  urgencies: string[];
  incomes: string[];
  unsecuredDebt: string;
  securedDebt: string;
  assets: string;
  discharge: string;
  dischargeYear: string;
  concern: string;
  residenceRegion: ResidenceRegion | "";
  callbackMode: CallbackMode | "";
  callbackDate: string;
  callbackTime: string;
  nickname: string;
  phone: string;
  privacyAgreed: boolean;
};

type DateOption = {
  value: string;
  label: string;
  sublabel: string;
  isToday: boolean;
};

const TOPIC_OPTIONS = [
  "개인회생",
  "개인파산·면책",
  "두 제도를 비교하고 싶어요",
  "독촉·법원 문서·압류 대응",
  "아직 잘 모르겠어요",
  "기타",
];

const URGENCY_OPTIONS = [
  "아직 연체 전이지만 다음 납부가 어려울 수 있어요",
  "연체가 시작됐어요",
  "전화·문자 독촉을 받고 있어요",
  "지급명령·소장 등 법원 문서를 받았어요",
  "통장·급여 등이 압류됐어요",
  "경매·강제집행이 진행 중이에요",
  "해당 없음",
  "잘 모르겠어요",
];

const INCOME_OPTIONS = [
  "급여",
  "사업·자영업",
  "프리랜서·일용직",
  "연금·공적급여",
  "현재 정기적인 소득 없음",
  "잘 모르겠어요",
];

const DEBT_OPTIONS = [
  "없음",
  "3천만원 미만",
  "3천만~5천만원",
  "5천만~1억원",
  "1억~3억원",
  "3억~5억원",
  "5억~10억원",
  "10억~15억원",
  "15억원 이상",
  "잘 모르겠어요",
];

const ASSET_OPTIONS = [
  "거의 없음",
  "1천만원 미만",
  "1천만~3천만원",
  "3천만~5천만원",
  "5천만~1억원",
  "1억~3억원",
  "3억원 이상",
  "잘 모르겠어요",
];

const DISCHARGE_OPTIONS = [
  "없음",
  "개인회생 면책을 받은 적 있어요",
  "개인파산 면책을 받은 적 있어요",
  "면책받은 적은 있으나 절차를 잘 모르겠어요",
  "잘 모르겠어요",
];

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

const DETAIL_STEPS: FormStep[] = [
  "topic",
  "urgency",
  "income",
  "debts",
  "assets",
  "discharge",
  "concern",
  "schedule",
  "contact",
  "review",
];

const QUICK_STEPS: FormStep[] = ["schedule", "contact", "review"];
const CONSULTATION_PRIVACY_NOTICE_VERSION =
  CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION;

const initialData: FormData = {
  topic: "",
  urgencies: [],
  incomes: [],
  unsecuredDebt: "",
  securedDebt: "",
  assets: "",
  discharge: "",
  dischargeYear: "",
  concern: "",
  residenceRegion: "",
  callbackMode: "",
  callbackDate: "",
  callbackTime: "",
  nickname: "",
  phone: "",
  privacyAgreed: false,
};

function getKoreanDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
    weekday: pick("weekday"),
  };
}

function toDateValue(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function makeDateOptions(now = new Date(), count = 5): DateOption[] {
  const current = getKoreanDateParts(now);
  const anchor = new Date(Date.UTC(current.year, current.month - 1, current.day));
  const options: DateOption[] = [];

  for (let offset = 0; options.length < count && offset < 14; offset += 1) {
    const candidate = new Date(anchor);
    candidate.setUTCDate(anchor.getUTCDate() + offset);
    const weekday = candidate.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }

    const year = candidate.getUTCFullYear();
    const month = candidate.getUTCMonth() + 1;
    const day = candidate.getUTCDate();
    const isToday = offset === 0;
    const earliestToday =
      Math.ceil((current.hour * 60 + current.minute + 30) / 30) * 30;
    if (isToday && earliestToday > 18 * 60 + 30) {
      continue;
    }
    const weekdayLabel = new Intl.DateTimeFormat("ko-KR", {
      weekday: "short",
      timeZone: "UTC",
    }).format(candidate);

    options.push({
      value: toDateValue(year, month, day),
      label: isToday ? "오늘" : `${month}월 ${day}일`,
      sublabel: weekdayLabel,
      isToday,
    });
  }

  return options;
}

function makeTimeOptions(dateValue: string, dateOptions: DateOption[], now = new Date()) {
  if (!dateValue) {
    return [];
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0 || weekday === 6) {
    return [];
  }

  const selectedDate = dateOptions.find((option) => option.value === dateValue);
  const current = getKoreanDateParts(now);
  const start = 8 * 60;
  const lastStart = 18 * 60 + 30;
  let first = start;

  if (selectedDate?.isToday) {
    const minimumLead = current.hour * 60 + current.minute + 30;
    first = Math.max(start, Math.ceil(minimumLead / 30) * 30);
  }

  const options: string[] = [];
  for (let minutes = first; minutes <= lastStart; minutes += 30) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    options.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }

  return options;
}

function formatTimeRange(time: string) {
  if (!time) {
    return "";
  }

  const [hour, minute] = time.split(":").map(Number);
  const start = hour * 60 + minute;
  const end = start + 30;
  const format = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

  return `${format(start)}~${format(end)}`;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function isValidPhone(value: string) {
  return /^010\d{8}$/.test(value.replace(/\D/g, ""));
}

function isExclusiveChoice(value: string) {
  return value === "해당 없음" || value === "잘 모르겠어요";
}

function formatDateLabel(value: string) {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function getNextBusinessOpening(now = new Date()) {
  const current = getKoreanDateParts(now);
  const anchor = new Date(Date.UTC(current.year, current.month - 1, current.day));

  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(anchor);
    candidate.setUTCDate(anchor.getUTCDate() + offset);
    const weekday = candidate.getUTCDay();
    const isWeekday = weekday !== 0 && weekday !== 6;
    const isToday = offset === 0;
    const beforeClose = current.hour < 19;
    if (isWeekday && (!isToday || beforeClose)) {
      if (isToday && current.hour >= 8) {
        return "운영시간에는 보통 10분 이내";
      }
      const month = candidate.getUTCMonth() + 1;
      const day = candidate.getUTCDate();
      return `${isToday ? "오늘" : `${month}월 ${day}일`} 오전 8시부터 순서대로`;
    }
  }

  return "다음 운영일 오전 8시부터 순서대로";
}

function OptionButton({
  children,
  selected,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      className={`consultation-option${selected ? " is-selected" : ""}`}
      type={type}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="consultation-option-check" aria-hidden="true">
        {selected ? <CheckIcon /> : null}
      </span>
      <span>{children}</span>
    </button>
  );
}

export function ConsultationForm() {
  const [mode, setMode] = useState<FormMode | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<FormData>(initialData);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    window.crypto.randomUUID(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const completeRef = useRef<HTMLElement>(null);
  const entryRef = useRef<HTMLElement>(null);
  const stepCardRef = useRef<HTMLDivElement>(null);
  const attentionRequestedRef = useRef(false);

  const steps = mode === "detailed" ? DETAIL_STEPS : QUICK_STEPS;
  const currentStep = steps[stepIndex];
  const dateOptions = useMemo(() => makeDateOptions(now), [now]);
  const timeOptions = useMemo(
    () => makeTimeOptions(data.callbackDate, dateOptions, now),
    [data.callbackDate, dateOptions, now],
  );
  const callbackExpectation = useMemo(() => getNextBusinessOpening(now), [now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!attentionRequestedRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      attentionRequestedRef.current = false;
      const scrollTarget = receipt
        ? completeRef.current
        : mode
          ? stepCardRef.current
          : entryRef.current;
      if (!scrollTarget) return;

      moveAttention(scrollTarget, {
        focusTarget: scrollTarget.querySelector<HTMLElement>(
          "[data-attention-heading]",
        ),
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mode, receipt, stepIndex]);

  const update = <Key extends keyof FormData>(key: Key, value: FormData[Key]) => {
    setData((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const toggleMulti = (
    key: "urgencies" | "incomes",
    value: string,
    exclusiveValues: string[],
  ) => {
    const current = data[key];
    if (current.includes(value)) {
      update(
        key,
        current.filter((item) => item !== value),
      );
      return;
    }

    if (exclusiveValues.includes(value)) {
      update(key, [value]);
      return;
    }

    update(
      key,
      [...current.filter((item) => !exclusiveValues.includes(item)), value],
    );
  };

  const validateCurrentStep = () => {
    switch (currentStep) {
      case "topic":
        return data.topic ? "" : "가장 가까운 항목을 하나 선택해 주세요.";
      case "urgency":
        return data.urgencies.length ? "" : "현재 단계와 가까운 항목을 선택해 주세요.";
      case "income":
        return data.incomes.length ? "" : "소득 형태를 하나 이상 선택해 주세요.";
      case "debts":
        return data.unsecuredDebt && data.securedDebt
          ? ""
          : "두 채무 항목의 대략적인 범위를 각각 선택해 주세요.";
      case "assets":
        return data.assets ? "" : "순재산의 대략적인 범위를 선택해 주세요.";
      case "discharge":
        return data.discharge ? "" : "면책 이력과 가까운 항목을 선택해 주세요.";
      case "schedule":
        if (!data.callbackMode) {
          return "연락받을 시점을 선택해 주세요.";
        }
        if (
          data.callbackMode === "scheduled" &&
          (!data.callbackDate ||
            !data.callbackTime ||
            !timeOptions.includes(data.callbackTime))
        ) {
          return "연락받을 날짜와 시간대를 선택해 주세요.";
        }
        return "";
      case "contact":
        if (!data.residenceRegion) {
          return "현재 거주 중인 시·도를 선택해 주세요.";
        }
        if (!isValidPhone(data.phone)) {
          return "010으로 시작하는 휴대전화 번호 11자리를 확인해 주세요.";
        }
        if (!data.privacyAgreed) {
          return "상담 요청을 위한 개인정보 수집·이용에 동의해 주세요.";
        }
        return "";
      default:
        return "";
    }
  };

  const goNext = () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    attentionRequestedRef.current = true;
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const goBack = () => {
    setError("");
    attentionRequestedRef.current = true;
    if (stepIndex === 0) {
      setMode(null);
      return;
    }
    setStepIndex((current) => current - 1);
  };

  const start = (selectedMode: FormMode) => {
    attentionRequestedRef.current = true;
    setMode(selectedMode);
    setStepIndex(0);
    setError("");
    setReceipt("");
  };

  const submitConsultation = async () => {
    if (!mode || isSubmitting) return;
    const residenceRegion = data.residenceRegion;
    if (!residenceRegion) {
      setError("현재 거주 중인 시·도를 선택해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    const agreedAt = new Date().toISOString();
    const attribution = getConsultationAttribution();
    const scheduledStart =
      data.callbackMode === "scheduled"
        ? new Date(
            `${data.callbackDate}T${data.callbackTime}:00+09:00`,
          )
        : null;
    const payload: ConsultationSubmission = {
      source: "homepage",
      idempotencyKey,
      mode,
      phone: data.phone,
      ...(data.nickname.trim() ? { name: data.nickname.trim() } : {}),
      contact:
        data.callbackMode === "scheduled" && scheduledStart
          ? {
              preference: "scheduled_window",
              windowStart: scheduledStart.toISOString(),
              windowEnd: new Date(
                scheduledStart.getTime() + 30 * 60 * 1_000,
              ).toISOString(),
            }
          : { preference: "as_soon_as_possible" },
      privacyNoticeVersion: CONSULTATION_PRIVACY_NOTICE_VERSION,
      consentAgreedAt: agreedAt,
      attribution,
      intake: {
        residenceRegion,
        ...(data.topic ? { topic: data.topic } : {}),
        urgencies: data.urgencies,
        incomes: data.incomes,
        ...(data.unsecuredDebt
          ? { unsecuredDebt: data.unsecuredDebt }
          : {}),
        ...(data.securedDebt ? { securedDebt: data.securedDebt } : {}),
        ...(data.assets ? { assets: data.assets } : {}),
        ...(data.discharge ? { discharge: data.discharge } : {}),
        ...(data.dischargeYear
          ? { dischargeYear: data.dischargeYear }
          : {}),
        ...(data.concern.trim() ? { concern: data.concern.trim() } : {}),
      },
    };

    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as
        | ConsultationSubmissionResponse
        | { message?: string };
      if (!response.ok || !("publicReceiptCode" in result)) {
        throw new Error(
          "message" in result && result.message
            ? result.message
            : "상담 요청을 접수하지 못했습니다.",
        );
      }
      attentionRequestedRef.current = true;
      setReceipt(result.publicReceiptCode);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? `${submissionError.message} 잠시 후 같은 버튼을 다시 눌러주세요.`
          : "상담 요청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const restart = () => {
    attentionRequestedRef.current = true;
    setMode(null);
    setStepIndex(0);
    setData(initialData);
    setReceipt("");
    setError("");
    setIdempotencyKey(window.crypto.randomUUID());
  };

  if (receipt) {
    const callbackText =
      data.callbackMode === "asap"
        ? callbackExpectation
        : `${formatDateLabel(data.callbackDate)} ${formatTimeRange(data.callbackTime)} 사이`;

    return (
      <section
        className="consultation-complete shell"
        aria-labelledby="complete-title"
        ref={completeRef}
      >
        <div className="complete-mark" aria-hidden="true">
          <CheckIcon />
        </div>
        <p className="eyebrow">상담 요청 접수 완료</p>
        <h1 data-attention-heading id="complete-title" tabIndex={-1}>
          남겨주신 내용을 확인하고
          <br />
          전화드리겠습니다.
        </h1>
        <p className="complete-lead">
          입력한 거주 지역, 연락처와 희망 시간을 한 번 더 확인해 주세요.
        </p>

        <dl className="complete-summary">
          <div>
            <dt>접수번호</dt>
            <dd>{receipt}</dd>
          </div>
          <div>
            <dt>연락받을 번호</dt>
            <dd>{formatPhone(data.phone)}</dd>
          </div>
          <div>
            <dt>연락 희망 시간</dt>
            <dd>{callbackText}</dd>
          </div>
          <div>
            <dt>거주 지역</dt>
            <dd>
              {RESIDENCE_REGION_OPTIONS.find(
                (option) => option.value === data.residenceRegion,
              )?.label ?? "확인 필요"}
            </dd>
          </div>
          <div>
            <dt>상담 방식</dt>
            <dd>{mode === "detailed" ? "상황을 미리 남겼어요" : "빠른 상담 요청"}</dd>
          </div>
        </dl>

        <div className="complete-expectation">
          <span>연락 안내</span>
          <p>
            빠른 연락을 요청하셨다면 운영시간에 접수된 순서대로 확인합니다.
            시간대를 선택하셨다면 그 30분 구간 안에 연락드립니다.
          </p>
        </div>

        <div className="complete-actions">
          <button className="button button-secondary" type="button" onClick={restart}>
            새 상담 요청
          </button>
          <a className="text-link" href="/bank">
            회생·파산 홈으로
            <ArrowIcon />
          </a>
        </div>
      </section>
    );
  }

  if (!mode) {
    return (
      <>
        <section className="consultation-intro">
          <div className="shell consultation-intro-grid">
            <div className="consultation-intro-copy">
              <p className="eyebrow">상담 요청</p>
              <h1>
                편한 만큼만 남기고,
                <br />
                전화로 이어가세요.
              </h1>
              <p>
                연락만 먼저 요청하거나, 상담자가 미리 볼 수 있도록 현재 상황을
                정리할 수 있습니다. 아직 어떤 절차인지 정하지 않아도 괜찮습니다.
              </p>
            </div>
            <div className="consultation-safety">
              <strong>상담 초기에는 받지 않습니다</strong>
              <p>
                주민등록번호, 계좌번호, 사건번호 전체와 원본 서류는 입력하거나 보내지
                마세요.
              </p>
            </div>
          </div>
        </section>

        <section
          className="consultation-entry shell"
          aria-labelledby="entry-title"
          ref={entryRef}
        >
          <div className="intake-notice" role="status">
            상담 요청을 완료하면 입력 내용이 암호화되어 안전하게 접수됩니다.
          </div>
          <div className="consultation-entry-heading">
            <p className="eyebrow">시작 방법</p>
            <h2 data-attention-heading id="entry-title" tabIndex={-1}>
              어떤 방식이 편하신가요?
            </h2>
            <p>선택한 뒤에도 이전 화면으로 돌아와 바꿀 수 있습니다.</p>
          </div>
          <div className="consultation-entry-options">
            <button type="button" onClick={() => start("quick")}>
              <span className="entry-time">약 30초</span>
              <strong>연락만 먼저 받고 싶어요</strong>
              <span className="entry-description">
                거주 지역, 연락받을 시간과 전화번호만 남깁니다.
              </span>
              <span className="entry-action">
                빠른 상담 요청
                <ArrowIcon />
              </span>
            </button>
            <button type="button" onClick={() => start("detailed")}>
              <span className="entry-time">약 2~3분</span>
              <strong>상황을 미리 남기고 싶어요</strong>
              <span className="entry-description">
                소득·채무·재산과 지금 가장 걱정되는 일을 정리합니다.
              </span>
              <span className="entry-action">
                상세 상황 남기기
                <ArrowIcon />
              </span>
            </button>
          </div>
          <div className="consultation-channel-alternatives">
            <div className="consultation-phone-alternative">
              <PhoneIcon />
              <div>
                <strong>직접 전화하는 편이 좋다면</strong>
                <span>평일 오전 8시–오후 7시</span>
              </div>
              <a href="tel:16708480">1670-8480</a>
            </div>
            <KakaoConsultationEntry
              className="consultation-kakao-alternative"
              placement="consultation-start-kakao"
            >
              <KakaoChatIcon />
              <span>
                <strong>카톡상담을 원하신다면</strong>
                <small>별도 1:1 채팅방에서 상담</small>
              </span>
              <ArrowIcon />
            </KakaoConsultationEntry>
          </div>
        </section>
      </>
    );
  }

  const progress = ((stepIndex + 1) / steps.length) * 100;

  return (
    <section className="consultation-flow shell">
      <div className="intake-notice" role="status">
        입력 내용은 제출 전까지 이 화면에만 남으며, 완료 버튼을 누르면 암호화해
        접수합니다.
      </div>

      <div className="consultation-progress" aria-label={`전체 ${steps.length}단계 중 ${stepIndex + 1}단계`}>
        <div>
          <span>{mode === "quick" ? "빠른 상담 요청" : "상세 상황 남기기"}</span>
          <strong>
            {stepIndex + 1} / {steps.length}
          </strong>
        </div>
        <span className="consultation-progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>
      </div>

      <div className="consultation-step-card" ref={stepCardRef}>
        {currentStep === "topic" ? (
          <fieldset>
            <legend data-attention-heading tabIndex={-1}>
              어떤 도움이 가장 필요하신가요?
            </legend>
            <p className="step-description">
              아직 정하지 못했다면 ‘잘 모르겠어요’를 선택해도 됩니다.
            </p>
            <div className="consultation-option-grid">
              {TOPIC_OPTIONS.map((option) => (
                <OptionButton
                  key={option}
                  selected={data.topic === option}
                  onClick={() => update("topic", option)}
                >
                  {option}
                </OptionButton>
              ))}
            </div>
          </fieldset>
        ) : null}

        {currentStep === "urgency" ? (
          <fieldset>
            <legend data-attention-heading tabIndex={-1}>
              현재 채무와 절차는 어디까지 진행됐나요?
            </legend>
            <p className="step-description">해당하는 항목을 모두 선택해 주세요.</p>
            <div className="consultation-option-grid">
              {URGENCY_OPTIONS.map((option) => (
                <OptionButton
                  key={option}
                  selected={data.urgencies.includes(option)}
                  onClick={() =>
                    toggleMulti(
                      "urgencies",
                      option,
                      URGENCY_OPTIONS.filter(isExclusiveChoice),
                    )
                  }
                >
                  {option}
                </OptionButton>
              ))}
            </div>
          </fieldset>
        ) : null}

        {currentStep === "income" ? (
          <fieldset>
            <legend data-attention-heading tabIndex={-1}>
              현재 어떤 소득이 있나요?
            </legend>
            <p className="step-description">두 가지 이상이면 모두 선택해 주세요.</p>
            <div className="consultation-option-grid">
              {INCOME_OPTIONS.map((option) => (
                <OptionButton
                  key={option}
                  selected={data.incomes.includes(option)}
                  onClick={() =>
                    toggleMulti("incomes", option, [
                      "현재 정기적인 소득 없음",
                      "잘 모르겠어요",
                    ])
                  }
                >
                  {option}
                </OptionButton>
              ))}
            </div>
          </fieldset>
        ) : null}

        {currentStep === "debts" ? (
          <fieldset>
            <legend data-attention-heading tabIndex={-1}>
              채무는 대략 어느 정도인가요?
            </legend>
            <p className="step-description">
              정확하지 않아도 괜찮습니다. 담보 여부에 따라 나누어 선택해 주세요.
            </p>
            <div className="debt-guides">
              <span>
                <strong>담보 없는 채무</strong>
                신용대출·카드대금·대부업·보증채무 등
              </span>
              <span>
                <strong>담보부 채무</strong>
                주택·차량 등 특정 재산을 담보로 한 채무
              </span>
            </div>
            <div className="debt-select-grid">
              <label>
                <span>담보 없는 채무</span>
                <select
                  value={data.unsecuredDebt}
                  onChange={(event) => update("unsecuredDebt", event.target.value)}
                >
                  <option value="">범위를 선택해 주세요</option>
                  {DEBT_OPTIONS.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>담보부 채무</span>
                <select
                  value={data.securedDebt}
                  onChange={(event) => update("securedDebt", event.target.value)}
                >
                  <option value="">범위를 선택해 주세요</option>
                  {DEBT_OPTIONS.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        ) : null}

        {currentStep === "assets" ? (
          <fieldset>
            <legend data-attention-heading tabIndex={-1}>
              담보채무를 뺀 재산은 대략 얼마인가요?
            </legend>
            <p className="step-description">
              주택·보증금·차량·예금·보험 해약환급금 등에서 관련 담보채무를 뺀
              대략적인 순재산입니다.
            </p>
            <div className="consultation-option-grid compact">
              {ASSET_OPTIONS.map((option) => (
                <OptionButton
                  key={option}
                  selected={data.assets === option}
                  onClick={() => update("assets", option)}
                >
                  {option}
                </OptionButton>
              ))}
            </div>
            <div className="step-boundary-note">
              이 금액 하나만으로 개인회생 가능 여부가 정해지지는 않습니다. 상담에서
              재산 구성과 가치를 다시 확인합니다.
            </div>
          </fieldset>
        ) : null}

        {currentStep === "discharge" ? (
          <fieldset>
            <legend data-attention-heading tabIndex={-1}>
              과거에 면책결정이 확정된 적이 있나요?
            </legend>
            <p className="step-description">
              개인회생이나 개인파산 절차를 마친 적이 있는지 알려주세요.
            </p>
            <div className="consultation-option-grid">
              {DISCHARGE_OPTIONS.map((option) => (
                <OptionButton
                  key={option}
                  selected={data.discharge === option}
                  onClick={() => {
                    update("discharge", option);
                    if (option === "없음" || option === "잘 모르겠어요") {
                      update("dischargeYear", "");
                    }
                  }}
                >
                  {option}
                </OptionButton>
              ))}
            </div>
            {data.discharge && data.discharge !== "없음" && data.discharge !== "잘 모르겠어요" ? (
              <label className="revealed-field">
                <span>면책결정이 확정된 연도 <small>선택</small></span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1990"
                  max={getKoreanDateParts(now).year}
                  placeholder="예: 2022"
                  value={data.dischargeYear}
                  onChange={(event) => update("dischargeYear", event.target.value.slice(0, 4))}
                />
                <small>정확한 날짜는 상담에서 다시 확인합니다.</small>
              </label>
            ) : null}
          </fieldset>
        ) : null}

        {currentStep === "concern" ? (
          <fieldset>
            <legend data-attention-heading tabIndex={-1}>
              가장 걱정되거나 먼저 묻고 싶은 것이 있나요?
            </legend>
            <p className="step-description">
              적지 않아도 다음 단계로 갈 수 있습니다.
            </p>
            <label className="consultation-textarea">
              <span className="sr-only">가장 걱정되는 내용</span>
              <textarea
                maxLength={500}
                rows={7}
                value={data.concern}
                placeholder="예: 다음 주 급여일 전에 통장이 압류될까 걱정돼요."
                onChange={(event) => update("concern", event.target.value)}
              />
              <span>{data.concern.length} / 500자</span>
            </label>
            <div className="step-boundary-note">
              주민등록번호·계좌번호·사건번호 전체, 건강정보·범죄경력 등 민감정보,
              제3자의 개인정보나 원본 서류 내용은 적지 마세요.
            </div>
          </fieldset>
        ) : null}

        {currentStep === "schedule" ? (
          <fieldset>
            <legend data-attention-heading tabIndex={-1}>
              언제 연락드릴까요?
            </legend>
            <p className="step-description">
              빠르게 연락받거나 편한 30분 구간을 선택할 수 있습니다.
            </p>
            <div className="callback-mode-grid">
              <button
                type="button"
                className={data.callbackMode === "asap" ? "is-selected" : ""}
                onClick={() => {
                  update("callbackMode", "asap");
                  update("callbackDate", "");
                  update("callbackTime", "");
                }}
              >
                <span>가능한 빨리</span>
                <strong>{callbackExpectation}</strong>
                <small>운영시간에 접수된 순서대로 확인해 연락드립니다.</small>
              </button>
              <button
                type="button"
                className={data.callbackMode === "scheduled" ? "is-selected" : ""}
                onClick={() => update("callbackMode", "scheduled")}
              >
                <span>시간 선택</span>
                <strong>편한 30분 구간 고르기</strong>
                <small>선택한 구간 안에 전화드리는 방식입니다.</small>
              </button>
            </div>

            {data.callbackMode === "scheduled" ? (
              <div className="schedule-picker">
                <div className="date-option-row" aria-label="연락 날짜">
                  {dateOptions.map((option) => (
                    <button
                      type="button"
                      className={data.callbackDate === option.value ? "is-selected" : ""}
                      key={option.value}
                      onClick={() => {
                        update("callbackDate", option.value);
                        update("callbackTime", "");
                        setCustomDateOpen(false);
                      }}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.sublabel}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={customDateOpen ? "is-selected" : ""}
                    onClick={() => setCustomDateOpen(true)}
                  >
                    <strong>다른 날짜</strong>
                    <span>직접 선택</span>
                  </button>
                </div>

                {customDateOpen ? (
                  <label className="custom-date-field">
                    <span>다른 평일 선택</span>
                    <input
                      type="date"
                      value={data.callbackDate}
                      min={dateOptions[0]?.value}
                      onChange={(event) => {
                        update("callbackDate", event.target.value);
                        update("callbackTime", "");
                      }}
                    />
                  </label>
                ) : null}

                {data.callbackDate ? (
                  <>
                    <p className="schedule-label">
                      {formatDateLabel(data.callbackDate)} 연락 가능 시간
                    </p>
                    {timeOptions.length ? (
                      <div className="time-option-grid">
                        {timeOptions.map((time) => (
                          <button
                            type="button"
                            className={data.callbackTime === time ? "is-selected" : ""}
                            key={time}
                            onClick={() => update("callbackTime", time)}
                          >
                            {formatTimeRange(time)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="schedule-empty">
                        오늘 선택할 수 있는 시간이 지났습니다. 다음 평일을 선택해 주세요.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}
          </fieldset>
        ) : null}

        {currentStep === "contact" ? (
          <fieldset>
            <legend data-attention-heading tabIndex={-1}>
              거주 지역과 연락처를 알려주세요.
            </legend>
            <p className="step-description">
              이름이나 편하게 불릴 호칭은 적지 않아도 됩니다.
            </p>
            <div className="contact-fields">
              <label>
                <span>현재 거주 중인 지역</span>
                <select
                  value={data.residenceRegion}
                  onChange={(event) =>
                    update(
                      "residenceRegion",
                      event.target.value as ResidenceRegion | "",
                    )
                  }
                >
                  <option value="">시·도를 선택해 주세요</option>
                  {RESIDENCE_REGION_OPTIONS.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small>
                  관할 법원과 지역별 업무 처리 특성을 상담 전에 참고합니다. 정확한
                  주소는 받지 않으며, 시·도만으로 관할이 확정되지는 않습니다.
                </small>
              </label>
              <label>
                <span>
                  이름 또는 호칭 <small>선택</small>
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  maxLength={30}
                  placeholder="예: 홍길동, 홍○○"
                  value={data.nickname}
                  onChange={(event) => update("nickname", event.target.value)}
                />
                <small>
                  입력하지 않으면 접수번호를 기준으로 한 익명 표기로 접수됩니다.
                </small>
              </label>
              <label>
                <span>휴대전화 번호</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="010-0000-0000"
                  value={formatPhone(data.phone)}
                  onChange={(event) => update("phone", event.target.value.replace(/\D/g, "").slice(0, 11))}
                />
              </label>
            </div>

            <div className="privacy-agreement">
              <div className="privacy-agreement-heading">
                <input
                  id="consultation-privacy-consent"
                  type="checkbox"
                  checked={data.privacyAgreed}
                  onChange={(event) => update("privacyAgreed", event.target.checked)}
                />
                <label htmlFor="consultation-privacy-consent">
                  <strong>[필수] 개인정보 수집·이용에 동의합니다.</strong>
                  <small>
                    상담 준비·연락·지역별 운영 분석 · 거주 시·도, 휴대전화 번호와 연락
                    희망 시점 · 요청일로부터 1년
                  </small>
                </label>
              </div>
              <details className="privacy-agreement-disclosure">
                <summary>수집·이용 내용 자세히 보기</summary>
                <div className="privacy-agreement-disclosure-content">
                  <dl className="privacy-agreement-details">
                    <div>
                      <dt>개인정보처리자</dt>
                      <dd>법무법인 로앤</dd>
                    </div>
                    <div>
                      <dt>수집·이용 목적</dt>
                      <dd>
                        상담 요청 접수, 관할 법원 및 지역별 업무 처리 특성의 1차 확인,
                        담당 상담 배정, 연락 일정 조율, 상담 준비·응대, 상담 이력 및
                        중복 요청 확인, 지역별 상담·캠페인 운영 분석
                      </dd>
                    </div>
                    <div>
                      <dt>수집 항목</dt>
                      <dd>
                        <strong>필수</strong> 거주 시·도, 휴대전화 번호, 연락 희망 시점
                        <br />
                        <strong>선택</strong> 이름·호칭, 도움 분야, 현재 단계, 소득 형태,
                        채무·재산 범위, 과거 면책 이력, 직접 남긴 상담 내용
                      </dd>
                    </div>
                    <div>
                      <dt>보유·이용 기간</dt>
                      <dd>
                        상담 요청일로부터 1년. 기간이 지나거나 처리 목적을 달성해 더 이상
                        필요하지 않으면 지체 없이 파기합니다. 다만, 다른 법령에 보존
                        의무가 있는 경우에는 해당 기간 동안 분리 보관합니다.
                      </dd>
                    </div>
                    <div>
                      <dt>동의 거부 안내</dt>
                      <dd>
                        동의를 거부할 수 있으나, 필수 항목의 수집·이용에 동의하지 않으면
                        온라인 상담 요청을 접수할 수 없습니다. 정확한 주소, 이름·호칭과
                        상세 상담 내용은 남기지 않아도 빠른 상담을 요청할 수 있습니다.
                      </dd>
                    </div>
                  </dl>
                  <p className="privacy-agreement-footnote">
                    거주 시·도는 요청별 광고 유입 정보와 결합해 지역 단위 성과를
                    분석할 수 있지만, 이름·전화번호·상담 내용은 분석 이벤트에 넣지
                    않습니다. 위 정보는 광고성 정보 전송에는 사용하지 않습니다.
                    주민등록번호·계좌번호·건강정보·범죄경력 등 민감정보와 제3자의
                    개인정보는 입력하지 마세요.
                  </p>
                  <span className="privacy-agreement-version">
                    고지 기준일 {CONSULTATION_PRIVACY_NOTICE_VERSION}
                  </span>
                  <a className="privacy-policy-link" href="/privacy">
                    전체 개인정보처리방침 보기
                  </a>
                </div>
              </details>
            </div>
            <div className="step-boundary-note">
              주민등록번호·계좌번호·원본 서류는 이 상담 요청에서 받지 않습니다.
            </div>
          </fieldset>
        ) : null}

        {currentStep === "review" ? (
          <div className="consultation-review">
            <p className="eyebrow">제출 전 확인</p>
            <h1 data-attention-heading tabIndex={-1}>
              이 내용으로 상담을 요청할까요?
            </h1>
            <p className="step-description">
              특히 거주 지역, 전화번호와 연락받을 시간을 한 번 더 확인해 주세요.
            </p>

            <dl className="review-list">
              <div>
                <dt>연락받을 번호</dt>
                <dd>{formatPhone(data.phone)}</dd>
              </div>
              <div>
                <dt>이름 또는 호칭</dt>
                <dd>{data.nickname.trim() || "입력하지 않음 · 익명으로 접수"}</dd>
              </div>
              <div>
                <dt>거주 지역</dt>
                <dd>
                  {RESIDENCE_REGION_OPTIONS.find(
                    (option) => option.value === data.residenceRegion,
                  )?.label ?? "확인 필요"}
                </dd>
              </div>
              <div>
                <dt>연락 희망 시간</dt>
                <dd>
                  {data.callbackMode === "asap"
                    ? callbackExpectation
                    : `${formatDateLabel(data.callbackDate)} ${formatTimeRange(data.callbackTime)}`}
                </dd>
              </div>
              <div>
                <dt>남긴 내용</dt>
                <dd>
                  {mode === "detailed"
                    ? `${data.topic} · 소득 ${data.incomes.join(", ")} · 담보 없는 채무 ${data.unsecuredDebt} · 담보부 채무 ${data.securedDebt}`
                    : "빠른 상담 요청"}
                </dd>
              </div>
            </dl>

            {mode === "detailed" ? (
              <details className="review-details">
                <summary>상세 답변 모두 보기</summary>
                <dl>
                  <div>
                    <dt>현재 단계</dt>
                    <dd>{data.urgencies.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>순재산</dt>
                    <dd>{data.assets}</dd>
                  </div>
                  <div>
                    <dt>과거 면책</dt>
                    <dd>
                      {data.discharge}
                      {data.dischargeYear ? ` · ${data.dischargeYear}년경` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>가장 걱정되는 내용</dt>
                    <dd>{data.concern.trim() || "입력하지 않음"}</dd>
                  </div>
                </dl>
              </details>
            ) : null}

            <div className="review-context-note">
              <CheckIcon />
              <p>
                내부 방문 경로와 허용된 광고 유입 정보는 이 요청에 자동 연결합니다.
                자유 입력 내용과 연락처는 분석 이벤트에 보내지 않습니다.
              </p>
            </div>

            <div className="consultation-submit-note">
              완료를 누르면 상담 요청이 접수되고 접수번호가 발급됩니다.
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="consultation-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="consultation-step-actions">
          <button className="button button-secondary" type="button" onClick={goBack}>
            이전
          </button>
          {currentStep === "review" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={submitConsultation}
              disabled={isSubmitting}
            >
              {isSubmitting ? "안전하게 접수 중…" : "상담 요청 완료"}
              <ArrowIcon />
            </button>
          ) : (
            <button className="button button-primary" type="button" onClick={goNext}>
              다음
              <ArrowIcon />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
