"use client";

import { useMemo, useState } from "react";

import {
  CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
  SELF_DIAGNOSIS_INCOME_TYPES,
  SELF_DIAGNOSIS_LIVING_COST_TYPES,
  SELF_DIAGNOSIS_MARRIAGE_STATES,
  SELF_DIAGNOSIS_RESIDENCE_REGIONS,
  SELF_DIAGNOSIS_RESIDENCE_TYPES,
  getSelfDiagnosisCourtOptions,
  type SelfDiagnosisResidenceRegion,
  type SelfDiagnosisSubmissionResponse,
} from "@lawand/core";

import { getConsultationAttribution } from "@/app/_components/journey-tracker";

import { ArrowIcon } from "../_components/site-chrome";

type FormData = {
  residenceRegion: SelfDiagnosisResidenceRegion | "";
  courtIdx: string;
  monthlyIncome: string;
  incomeType: string;
  residenceType: string;
  marriageState: string;
  minorChildCount: string;
  unsecuredDebt: string;
  securedDebt: string;
  liquidationValue: string;
  priorityDebt: "yes" | "no" | "";
  name: string;
  phone: string;
  consent: boolean;
};

const initialData: FormData = {
  residenceRegion: "",
  courtIdx: "",
  monthlyIncome: "",
  incomeType: "",
  residenceType: "",
  marriageState: "",
  minorChildCount: "0",
  unsecuredDebt: "",
  securedDebt: "0",
  liquidationValue: "0",
  priorityDebt: "",
  name: "",
  phone: "",
  consent: false,
};

const steps = ["지역·소득", "채무·재산", "가족·거주", "결과 받기"];

const minorChildCountOptions = [
  { value: "0", label: "0명" },
  { value: "1", label: "1명" },
  { value: "2", label: "2명" },
  { value: "3", label: "3명" },
  { value: "4", label: "4명" },
  { value: "5", label: "5명" },
  { value: "6", label: "6명 이상" },
] as const;

const incomeTypeLabels = Object.fromEntries(
  SELF_DIAGNOSIS_INCOME_TYPES.map((item) => [item.value, item.label]),
) as Record<number, string>;

const residenceTypeLabels = Object.fromEntries(
  SELF_DIAGNOSIS_RESIDENCE_TYPES.map((item) => [item.value, item.label]),
) as Record<number, string>;

const marriageStateLabels = Object.fromEntries(
  SELF_DIAGNOSIS_MARRIAGE_STATES.map((item) => [item.value, item.label]),
) as Record<number, string>;

const livingCostTypeLabels = Object.fromEntries(
  SELF_DIAGNOSIS_LIVING_COST_TYPES.map((item) => [item.value, item.label]),
) as Record<number, string>;

function digits(value: string) {
  return value.replace(/\D/gu, "").slice(0, 12);
}

function numberValue(value: string) {
  return Number(value.replace(/\D/gu, "")) || 0;
}

function formatInputMoney(value: string) {
  const amount = numberValue(value);
  return amount > 0 ? amount.toLocaleString("ko-KR") : "";
}

function formatWon(value: number) {
  if (value >= 100_000_000) {
    const eok = value / 100_000_000;
    return `${Number.isInteger(eok) ? eok : eok.toFixed(1)}억원`;
  }
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatPhone(value: string) {
  const valueDigits = digits(value).slice(0, 11);
  if (valueDigits.length <= 3) return valueDigits;
  if (valueDigits.length <= 7) {
    return `${valueDigits.slice(0, 3)}-${valueDigits.slice(3)}`;
  }
  return `${valueDigits.slice(0, 3)}-${valueDigits.slice(3, 7)}-${valueDigits.slice(7)}`;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function formatCaseDate(value: string | null) {
  return value ?? "날짜 기록 없음";
}

function formatPersonCount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMinorChildCount(value: number) {
  return value >= 6 ? "6명 이상" : `${value}명`;
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatLivingCost(type: number, cost: number) {
  if (type === 0) return "추가 인정 없음";
  const label = livingCostTypeLabels[type] ?? `코드 ${type}`;
  return cost > 0 ? `${label} · ${formatWon(cost)}` : `${label} · 금액 기록 없음`;
}

function elapsedCaseDays(filingDate: string | null, eventDate: string | null) {
  if (!filingDate || !eventDate) return null;
  const filingTime = Date.parse(`${filingDate}T00:00:00.000Z`);
  const eventTime = Date.parse(`${eventDate}T00:00:00.000Z`);
  if (!Number.isFinite(filingTime) || !Number.isFinite(eventTime)) return null;
  if (eventTime < filingTime) return null;
  return Math.round((eventTime - filingTime) / 86_400_000);
}

type DiagnosisMatch =
  SelfDiagnosisSubmissionResponse["assessment"]["matches"][number];

function CaseTimeline({ match }: { match: DiagnosisMatch }) {
  const events = (
    match.caseType === 1
      ? [
          { date: match.filingDate, label: "신청서 접수" },
          { date: match.prohibitionDate, label: "금지결정" },
          { date: match.commencementDate, label: "개시결정" },
          { date: match.approvalDate, label: "인가결정" },
        ]
      : [
          { date: match.filingDate, label: "신청서 접수" },
          { date: match.bankruptcyDate, label: "파산선고" },
          { date: match.dischargeDate, label: "면책허가" },
        ]
  ).filter((event) => event.date !== null);

  return (
    <ol className="diagnosis-timeline" aria-label="사건 진행일">
      {events.map((event) => (
        <li key={event.label}>
          <time dateTime={event.date ?? undefined}>
            {formatCaseDate(event.date)}
          </time>
          <strong>{event.label}</strong>
          <small>
            {event.label === "신청서 접수"
              ? "접수 기준일"
              : `접수일로부터 +${elapsedCaseDays(match.filingDate, event.date) ?? "-"}일`}
          </small>
        </li>
      ))}
    </ol>
  );
}

function FinancialPlan({ match }: { match: DiagnosisMatch }) {
  const allocationTotal = Math.max(
    1,
    match.estimatedSpend + match.monthlyPayment,
  );
  const spendShare = Math.min(
    100,
    Math.max(0, (match.estimatedSpend / allocationTotal) * 100),
  );
  const paymentShare = Math.max(0, 100 - spendShare);

  return (
    <section className="diagnosis-financial-plan" aria-label="변제계획 구성">
      <header>
        <div>
          <span>월소득 배분</span>
          <strong>{formatWon(match.monthlyIncome)}</strong>
        </div>
        <small>원천 사건의 인가 변제계획</small>
      </header>
      <div
        className="diagnosis-allocation-chart"
        role="img"
        aria-label={`예상 지출금액 ${formatWon(match.estimatedSpend)}, 월 변제금 ${formatWon(match.monthlyPayment)}`}
      >
        <span
          className="is-spend"
          style={{ width: `${spendShare}%` }}
        />
        <span
          className="is-payment"
          style={{ width: `${paymentShare}%` }}
        />
      </div>
      <div className="diagnosis-allocation-legend">
        <span><i className="is-spend" />예상 지출 {formatWon(match.estimatedSpend)}</span>
        <span><i className="is-payment" />월 변제 {formatWon(match.monthlyPayment)}</span>
      </div>
      <div className="diagnosis-plan-totals">
        <div>
          <span>총변제금</span>
          <strong>{formatWon(match.totalPayment)}</strong>
        </div>
        <div>
          <span>변제율</span>
          <strong>{formatPercent(match.repaymentRate)}%</strong>
        </div>
      </div>
    </section>
  );
}

export function SelfDiagnosisForm() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<FormData>(initialData);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SelfDiagnosisSubmissionResponse | null>(
    null,
  );

  const totalDebt = useMemo(
    () => numberValue(data.unsecuredDebt) + numberValue(data.securedDebt),
    [data.securedDebt, data.unsecuredDebt],
  );

  const courtOptions = useMemo(
    () =>
      data.residenceRegion
        ? getSelfDiagnosisCourtOptions(data.residenceRegion)
        : [],
    [data.residenceRegion],
  );

  const setField = <Key extends keyof FormData>(key: Key, value: FormData[Key]) => {
    setData((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const selectResidenceRegion = (value: string) => {
    const residenceRegion = value as SelfDiagnosisResidenceRegion | "";
    const options = residenceRegion
      ? getSelfDiagnosisCourtOptions(residenceRegion)
      : [];
    setData((current) => ({
      ...current,
      residenceRegion,
      courtIdx: options.length === 1 ? String(options[0]?.courtIdx ?? "") : "",
    }));
    setError("");
  };

  const validateStep = () => {
    if (
      step === 0 &&
      (!data.residenceRegion ||
        !data.courtIdx ||
        !data.incomeType ||
        numberValue(data.monthlyIncome) <= 0)
    ) {
      return "현재 거주지역, 관할법원, 소득형태와 월평균 소득을 모두 입력해 주세요.";
    }
    if (
      step === 1 &&
      (totalDebt <= 0 || data.priorityDebt === "")
    ) {
      return "채무액과 조세·우선권채권 여부를 확인해 주세요.";
    }
    if (
      step === 2 &&
      (!data.marriageState ||
        !data.residenceType)
    ) {
      return "혼인상태와 거주형태를 선택해 주세요.";
    }
    if (step === 3) {
      if (!data.name.trim()) return "이름을 입력해 주세요.";
      if (!/^010\d{8}$/u.test(digits(data.phone))) {
        return "010으로 시작하는 휴대전화 번호를 입력해 주세요.";
      }
      if (!data.consent) return "개인정보 수집·이용에 동의해 주세요.";
    }
    return "";
  };

  const next = () => {
    const message = validateStep();
    if (message) {
      setError(message);
      return;
    }
    setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const submit = async () => {
    const message = validateStep();
    if (message) {
      setError(message);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/self-diagnoses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "homepage",
          idempotencyKey: window.crypto.randomUUID(),
          phone: data.phone,
          name: data.name.trim(),
          privacyNoticeVersion: CURRENT_CONSULTATION_PRIVACY_NOTICE_VERSION,
          consentAgreedAt: new Date().toISOString(),
          attribution: getConsultationAttribution(),
          answers: {
            residenceRegion: data.residenceRegion,
            courtIdx: numberValue(data.courtIdx),
            monthlyIncome: numberValue(data.monthlyIncome),
            incomeType: numberValue(data.incomeType),
            residenceType: numberValue(data.residenceType),
            marriageState: numberValue(data.marriageState),
            minorChildCount: numberValue(data.minorChildCount),
            unsecuredDebt: numberValue(data.unsecuredDebt),
            securedDebt: numberValue(data.securedDebt),
            liquidationValue: numberValue(data.liquidationValue),
            priorityDebt: data.priorityDebt === "yes",
          },
        }),
      });
      const body = (await response.json()) as SelfDiagnosisSubmissionResponse & {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.message ?? "자가진단 결과를 만들지 못했습니다.");
      }
      setResult(body);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "자가진단 결과를 만들지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const { assessment } = result;
    const payments = assessment.matches.map((match) => match.monthlyPayment);
    const paymentCounts = assessment.matches.map((match) => match.paymentCount);
    const isRehabilitation =
      assessment.recommendation === "personal_rehabilitation";
    return (
      <section className="diagnosis-results shell" aria-labelledby="diagnosis-result-title">
        <div className="diagnosis-result-lead">
          <p className="eyebrow">진단번호 {result.publicReceiptCode}</p>
          <h2 id="diagnosis-result-title">
            {isRehabilitation
              ? "나의 상황과 유사한 사례 5건을 찾았습니다."
              : "파산·면책 사례도 함께 살펴봐야 합니다."}
          </h2>
          <p>
            {isRehabilitation
              ? `유사사례의 월 변제금은 ${formatWon(Math.min(...payments))}부터 ${formatWon(Math.max(...payments))}, 대표 변제기간은 ${median(paymentCounts)}개월입니다.`
              : "현재 소득과 청산가치·최소 변제조건을 함께 보면 회생 변제계획보다 파산·면책 적합성 검토가 우선될 수 있습니다."}
          </p>
        </div>

        {assessment.recommendationReason === "dependent_adjustment_needed" ? (
          <div className="diagnosis-caution">
            미성년 자녀 {formatMinorChildCount(numberValue(data.minorChildCount))}을 모두 부양가족으로 반영하면
            제약을 맞추기 어려워, {assessment.adjustedDependentCount}명 반영
            시나리오로 비교했습니다. 실제 인정 여부는 법원의 판단과 소명자료에
            따라 달라집니다.
          </div>
        ) : null}

        <div className="diagnosis-result-grid">
          {assessment.matches.map((match) => (
            <article className="diagnosis-case-card" key={match.rank}>
              <header>
                <span>유사사례 {String(match.rank).padStart(2, "0")}</span>
                <strong>
                  {match.similarity === "very_close"
                    ? "매우 가까움"
                    : match.similarity === "close"
                      ? "가까움"
                      : "참고 범위"}
                </strong>
              </header>
              {match.caseType === 1 ? (
                <>
                  <div className="diagnosis-payment">
                    <span>월 변제금</span>
                    <strong>{formatWon(match.monthlyPayment)}</strong>
                    <small>{match.paymentCount}개월 변제</small>
                  </div>
                  <FinancialPlan match={match} />
                </>
              ) : (
                <div className="diagnosis-payment is-bankruptcy">
                  <span>절차 결과</span>
                  <strong>파산·면책</strong>
                  <small>월 변제금 없음</small>
                </div>
              )}
              <dl>
                <div><dt>법원</dt><dd>{match.courtName}</dd></div>
                <div>
                  <dt>월소득</dt>
                  <dd>
                    {match.caseType === 2 && match.monthlyIncome === 0
                      ? "원천 기록 없음"
                      : formatWon(match.monthlyIncome)}
                  </dd>
                </div>
                <div><dt>총채무</dt><dd>{formatWon(match.totalDebt)}</dd></div>
                <div><dt>청산가치</dt><dd>{formatWon(match.liquidationValue)}</dd></div>
                <div>
                  <dt>소득·혼인</dt>
                  <dd>
                    {match.caseType === 2 && match.incomeType === 0
                      ? "소득형태 기록 없음"
                      : incomeTypeLabels[
                          match.incomeType as keyof typeof incomeTypeLabels
                        ] ?? "기타"}
                    {" · "}
                    {marriageStateLabels[
                      match.marriageState as keyof typeof marriageStateLabels
                    ] ?? "기타"}
                  </dd>
                </div>
                <div><dt>거주형태</dt><dd>{residenceTypeLabels[match.residenceType as keyof typeof residenceTypeLabels] ?? `코드 ${match.residenceType}`}</dd></div>
                <div>
                  <dt>미성년 자녀 수</dt>
                  <dd>{match.minorChildCount}명</dd>
                </div>
                <div>
                  <dt>인정된 부양가족 수</dt>
                  <dd>{formatPersonCount(match.dependentCount)}명 · 본인 포함</dd>
                </div>
                {match.caseType === 1 ? (
                  <>
                    <div>
                      <dt>예상 지출금액</dt>
                      <dd>{formatWon(match.estimatedSpend)}</dd>
                    </div>
                    <div>
                      <dt>추가생계비</dt>
                      <dd>{formatLivingCost(match.livingCostType, match.livingCostCost)}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
              <CaseTimeline match={match} />
            </article>
          ))}
        </div>

        <div className="diagnosis-result-notice">
          <strong>이 결과는 상담 전 비교자료입니다.</strong>
          <p>
            실제 변제금·기간·부양가족 인정·절차 선택은 채권 구성, 재산 평가,
            최근 거래와 법원 보정에 따라 달라집니다. 특정 결과를 보장하지 않으며,
            입력 정보는 ERP 상담 원장에 등록되었습니다.
          </p>
          <div>
            <a className="button" href="/bank/consultation">상담 내용 더 남기기</a>
            <button
              className="button button-outline"
              type="button"
              onClick={() => {
                setData(initialData);
                setResult(null);
                setStep(0);
              }}
            >
              다시 진단하기
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="diagnosis-workspace shell" aria-labelledby="diagnosis-form-title">
      <div className="diagnosis-progress" aria-label={`전체 4단계 중 ${step + 1}단계`}>
        {steps.map((label, index) => (
          <div className={index <= step ? "is-active" : ""} key={label}>
            <span>{index + 1}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </div>

      <div className="diagnosis-form-card">
        {step === 0 ? (
          <fieldset>
            <legend id="diagnosis-form-title">현재 거주지역과 소득</legend>
            <p>거주지역으로 관할법원을 먼저 안내하고 유사사건 비교에 반영합니다.</p>
            <label>
              <span>현재 거주 중인 지역</span>
              <select
                value={data.residenceRegion}
                onChange={(event) => selectResidenceRegion(event.target.value)}
              >
                <option value="">지역을 선택해 주세요</option>
                {SELF_DIAGNOSIS_RESIDENCE_REGIONS.map((region) => (
                  <option value={region.value} key={region.value}>
                    {region.label}
                  </option>
                ))}
              </select>
            </label>
            {courtOptions.length === 1 ? (
              <div className="diagnosis-court-result" role="status">
                <span>거주지역 기준 관할법원</span>
                <strong>{courtOptions[0]?.name}</strong>
                <small>{courtOptions[0]?.description}</small>
              </div>
            ) : null}
            {courtOptions.length > 1 ? (
              <label>
                <span>관할법원 선택</span>
                <select
                  value={data.courtIdx}
                  onChange={(event) => setField("courtIdx", event.target.value)}
                >
                  <option value="">해당하는 법원을 선택해 주세요</option>
                  {courtOptions.map((court) => (
                    <option value={court.courtIdx} key={court.courtIdx}>
                      {court.name} · {court.description}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {courtOptions.length > 0 ? (
              <p className="diagnosis-jurisdiction-note">
                거주지역 기준의 1차 안내입니다. 실제 관할은 직장·영업소나 관련
                사건의 계속 여부 등에 따라 달라질 수 있습니다.
              </p>
            ) : null}
            <div className="diagnosis-field-grid">
              <label>
                <span>월평균 소득</span>
                <div className="diagnosis-money-input">
                  <input inputMode="numeric" value={formatInputMoney(data.monthlyIncome)} onChange={(event) => setField("monthlyIncome", digits(event.target.value))} placeholder="예: 2,800,000" />
                  <em>원</em>
                </div>
              </label>
              <label>
                <span>소득형태</span>
                <select value={data.incomeType} onChange={(event) => setField("incomeType", event.target.value)}>
                  <option value="">소득형태를 선택해 주세요</option>
                  {SELF_DIAGNOSIS_INCOME_TYPES.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
            </div>
          </fieldset>
        ) : null}

        {step === 1 ? (
          <fieldset>
            <legend>채무와 청산가치</legend>
            <p>청산가치는 변제계획이 넘어야 할 제한조건으로 먼저 확인합니다.</p>
            <div className="diagnosis-field-grid">
              {([
                ["unsecuredDebt", "담보 없는 채무"],
                ["securedDebt", "담보부 채무"],
                ["liquidationValue", "예상 청산가치"],
              ] as const).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <div className="diagnosis-money-input">
                    <input inputMode="numeric" value={formatInputMoney(data[key])} onChange={(event) => setField(key, digits(event.target.value))} placeholder="0" />
                    <em>원</em>
                  </div>
                </label>
              ))}
            </div>
            <div className="diagnosis-total">입력한 총채무 <strong>{formatWon(totalDebt)}</strong></div>
            <fieldset className="diagnosis-choice-group">
              <legend>조세 등 우선권채권이 있나요?</legend>
              <div>
                <button className={data.priorityDebt === "no" ? "is-selected" : ""} type="button" onClick={() => setField("priorityDebt", "no")}>없음</button>
                <button className={data.priorityDebt === "yes" ? "is-selected" : ""} type="button" onClick={() => setField("priorityDebt", "yes")}>있음</button>
              </div>
            </fieldset>
          </fieldset>
        ) : null}

        {step === 2 ? (
          <fieldset>
            <legend>혼인·미성년 자녀·거주 조건</legend>
            <p>미성년 자녀 수를 부양가족 판단의 출발값으로 두고 비교합니다.</p>
            <div className="diagnosis-field-grid">
              <label>
                <span>혼인상태</span>
                <select value={data.marriageState} onChange={(event) => setField("marriageState", event.target.value)}>
                  <option value="">선택해 주세요</option>
                  {SELF_DIAGNOSIS_MARRIAGE_STATES.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label>
                <span>거주형태</span>
                <select value={data.residenceType} onChange={(event) => setField("residenceType", event.target.value)}>
                  <option value="">선택해 주세요</option>
                  {SELF_DIAGNOSIS_RESIDENCE_TYPES.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="diagnosis-choice-group diagnosis-child-choice-group">
              <legend>미성년 자녀 수</legend>
              <div role="radiogroup" aria-label="미성년 자녀 수 선택">
                {minorChildCountOptions.map(({ value, label }) => (
                  <button
                    aria-checked={data.minorChildCount === value}
                    className={data.minorChildCount === value ? "is-selected" : ""}
                    key={value}
                    role="radio"
                    type="button"
                    onClick={() => setField("minorChildCount", value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </fieldset>
        ) : null}

        {step === 3 ? (
          <fieldset>
            <legend>결과를 확인할 연락정보</legend>
            <p>진단 결과와 입력값은 로앤 ERP의 상담 원장에 함께 등록됩니다.</p>
            <div className="diagnosis-field-grid">
              <label>
                <span>이름</span>
                <input autoComplete="name" value={data.name} onChange={(event) => setField("name", event.target.value.slice(0, 30))} placeholder="성함을 입력해 주세요" />
              </label>
              <label>
                <span>휴대전화</span>
                <input autoComplete="tel" inputMode="tel" value={formatPhone(data.phone)} onChange={(event) => setField("phone", digits(event.target.value))} placeholder="010-0000-0000" />
              </label>
            </div>
            <label className="diagnosis-consent">
              <input type="checkbox" checked={data.consent} onChange={(event) => setField("consent", event.target.checked)} />
              <span>
                자가진단 및 상담을 위한 개인정보 수집·이용에 동의합니다.
                <a href="/privacy" target="_blank" rel="noreferrer"> 상세보기</a>
              </span>
            </label>
          </fieldset>
        ) : null}

        {error ? <p className="diagnosis-error" role="alert">{error}</p> : null}
        <div className="diagnosis-actions">
          {step > 0 ? <button className="button button-outline" type="button" onClick={() => { setStep((current) => current - 1); setError(""); }}>이전</button> : <span />}
          {step < steps.length - 1 ? (
            <button className="button button-primary" type="button" onClick={next}>
              다음 조건
              <ArrowIcon />
            </button>
          ) : (
            <button className="button button-primary" type="button" disabled={submitting} onClick={submit}>
              {submitting ? "로앤 사건 비교 중…" : "유사사건 5건 보기"}
              {!submitting ? <ArrowIcon /> : null}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
