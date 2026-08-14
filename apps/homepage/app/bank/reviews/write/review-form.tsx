"use client";

import { useMemo, useRef, useState } from "react";

import {
  CURRENT_REVIEW_PRIVACY_NOTICE_VERSION,
  CURRENT_REVIEW_PUBLICATION_CONSENT_VERSION,
  type ReviewSubmission,
  type ReviewSubmissionResponse,
} from "@lawand/core";

import {
  ArrowIcon,
  CheckIcon,
} from "../../_components/site-chrome";

type PracticeArea = ReviewSubmission["practiceArea"] | "";
type ProgressStage = ReviewSubmission["progressStage"] | "";
type ExperienceKeyword = ReviewSubmission["experienceKeywords"][number];

type ReviewFormData = {
  authorDisplay: string;
  content: string;
  experienceKeywords: ExperienceKeyword[];
  phone: string;
  practiceArea: PracticeArea;
  privacyConsent: boolean;
  progressStage: ProgressStage;
  publicationConsent: boolean;
  website: string;
};

const PRACTICE_AREAS: Array<{
  description: string;
  label: string;
  value: Exclude<PracticeArea, "">;
}> = [
  {
    value: "personal_rehabilitation",
    label: "개인회생",
    description: "변제계획을 세워 진행한 경우",
  },
  {
    value: "personal_bankruptcy",
    label: "개인파산·면책",
    description: "파산선고 또는 면책 절차를 진행한 경우",
  },
  {
    value: "other",
    label: "아직 잘 모르겠어요",
    description: "상담만 받았거나 분야 구분이 어려운 경우",
  },
];

const PROGRESS_STAGES: Array<{
  label: string;
  value: Exclude<ProgressStage, "">;
}> = [
  { value: "consultation", label: "상담을 받은 뒤" },
  { value: "commencement", label: "개시·절차 진행 중" },
  { value: "discharge", label: "면책결정 이후" },
  { value: "other", label: "그 밖의 시점" },
];

const EXPERIENCE_KEYWORDS = [
  "친절",
  "세심",
  "꼼꼼",
  "신뢰",
  "든든",
  "정확",
  "빠름",
  "체계적",
] as const satisfies readonly ExperienceKeyword[];

const initialForm: ReviewFormData = {
  authorDisplay: "",
  content: "",
  experienceKeywords: [],
  phone: "",
  practiceArea: "",
  privacyConsent: false,
  progressStage: "",
  publicationConsent: false,
  website: "",
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function displayArea(value: PracticeArea) {
  return (
    PRACTICE_AREAS.find((option) => option.value === value)?.label ??
    "분야를 선택해 주세요"
  );
}

function displayStage(value: ProgressStage) {
  return (
    PROGRESS_STAGES.find((option) => option.value === value)?.label ??
    "작성 시점을 선택해 주세요"
  );
}

function validate(form: ReviewFormData): string | null {
  if (!form.practiceArea) return "함께한 분야를 골라 주세요.";
  if (!form.progressStage) return "후기를 쓰는 시점을 골라 주세요.";
  if (form.experienceKeywords.length === 0) {
    return "도움을 느낀 점을 하나 이상 골라 주세요.";
  }
  if (form.authorDisplay.trim().length < 2) {
    return "공개 이름을 두 글자 이상 입력해 주세요.";
  }
  if (/\d{7,}|@/.test(form.authorDisplay)) {
    return "공개 이름에는 연락처나 이메일을 입력할 수 없습니다.";
  }
  if (form.content.trim().length < 20) {
    return "후기를 스무 글자 이상 남겨 주세요.";
  }
  if (!/^010\d{8}$/.test(form.phone.replace(/\D/g, ""))) {
    return "010으로 시작하는 휴대전화 번호를 확인해 주세요.";
  }
  if (!form.privacyConsent || !form.publicationConsent) {
    return "개인정보 수집과 후기 공개 내용을 모두 확인해 주세요.";
  }
  return null;
}

export function ReviewForm({ requestToken }: { requestToken?: string }) {
  const [form, setForm] = useState<ReviewFormData>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReviewSubmissionResponse | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const errorRef = useRef<HTMLDivElement>(null);

  const previewContent = useMemo(
    () =>
      form.content.trim() ||
      "작성하신 후기가 이곳에 미리 보입니다. 결과보다 과정에서 실제로 느낀 점을 편하게 들려주세요.",
    [form.content],
  );

  function setValue<Key extends keyof ReviewFormData>(
    key: Key,
    value: ReviewFormData[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function toggleKeyword(keyword: ExperienceKeyword) {
    setForm((current) => {
      if (current.experienceKeywords.includes(keyword)) {
        return {
          ...current,
          experienceKeywords: current.experienceKeywords.filter(
            (value) => value !== keyword,
          ),
        };
      }
      if (current.experienceKeywords.length >= 3) {
        setError("도움을 느낀 점은 세 개까지 고를 수 있습니다.");
        return current;
      }
      setError(null);
      return {
        ...current,
        experienceKeywords: [...current.experienceKeywords, keyword],
      };
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    if (!form.practiceArea || !form.progressStage) return;

    setSubmitting(true);
    setError(null);
    const submittedAt = new Date().toISOString();
    const payload: ReviewSubmission = {
      source: "homepage",
      idempotencyKey: idempotencyKey.current,
      practiceArea: form.practiceArea,
      progressStage: form.progressStage,
      experienceKeywords: form.experienceKeywords,
      authorDisplay: form.authorDisplay.trim(),
      content: form.content.trim(),
      phone: form.phone,
      privacyNoticeVersion: CURRENT_REVIEW_PRIVACY_NOTICE_VERSION,
      publicationConsentVersion:
        CURRENT_REVIEW_PUBLICATION_CONSENT_VERSION,
      consentAgreedAt: submittedAt,
      privacyConsent: true,
      publicationConsent: true,
      ...(requestToken ? { requestToken } : {}),
      website: form.website as "",
    };

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as
        | ReviewSubmissionResponse
        | { message?: string };
      if (!response.ok) {
        throw new Error(
          "message" in body && body.message
            ? body.message
            : "후기를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
      setResult(body as ReviewSubmissionResponse);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "후기를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <section className="review-write-complete shell">
        <div className="review-complete-mark" aria-hidden="true">
          <CheckIcon />
        </div>
        <p className="eyebrow">REVIEW RECEIVED</p>
        <h1>
          소중한 경험을
          <br />
          맡겨주셔서 감사합니다.
        </h1>
        <p>
          후기는 아직 공개되지 않았습니다. 담당자가 실제 이용 여부와 개인정보
          포함 여부를 확인한 뒤 공개하며, 확인이 필요할 때만 입력하신 번호로
          연락드립니다.
        </p>
        <dl>
          <div>
            <dt>후기 접수번호</dt>
            <dd>{result.publicReceiptCode}</dd>
          </div>
          <div>
            <dt>현재 상태</dt>
            <dd>운영 검수 대기</dd>
          </div>
        </dl>
        <div className="review-complete-actions">
          <a className="button button-primary" href="/bank/reviews">
            다른 고객후기 보기
            <ArrowIcon />
          </a>
          <a className="button button-secondary" href="/bank">
            회생·파산 홈으로
          </a>
        </div>
        <small>
          공개 전 철회나 수정이 필요하면 대표번호 1670-8480으로 접수번호를
          알려주세요.
        </small>
      </section>
    );
  }

  return (
    <>
      <section className="review-write-intro">
        <div className="shell">
          <nav className="breadcrumb" aria-label="현재 위치">
            <a href="/bank">회생·파산 홈</a>
            <span aria-hidden="true">/</span>
            <a href="/bank/reviews">고객후기</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">후기 남기기</span>
          </nav>
          <div className="review-write-intro-grid">
            <div>
              <p className="eyebrow">YOUR EXPERIENCE, IN YOUR WORDS</p>
              <h1>
                누군가에게는
                <br />
                <span>당신의 과정이 용기가 됩니다.</span>
              </h1>
            </div>
            <div>
              <p>
                거창한 성공담이 아니어도 괜찮습니다. 처음 연락할 때의 마음,
                설명을 들으며 달라진 점, 진행 중 기억에 남은 태도를 작성자님의
                말로 남겨주세요.
              </p>
              <ul>
                <li>별점 없이 과정의 경험만 받습니다.</li>
                <li>개인정보 확인 뒤에만 공개합니다.</li>
                <li>임의로 좋은 표현을 덧붙이지 않습니다.</li>
              </ul>
            </div>
          </div>
          {requestToken ? (
            <p className="review-request-arrival" role="status">
              로앤 담당자가 보내드린 전용 링크로 들어오셨습니다. 작성하신
              후기는 해당 고객 사건과 안전하게 연결되어 담당자가 확인합니다.
            </p>
          ) : null}
        </div>
      </section>

      <section className="review-write-body">
        <div className="shell review-write-layout">
          <form className="review-write-form" onSubmit={submit} noValidate>
            <div
              className="review-form-error"
              hidden={!error}
              ref={errorRef}
              role="alert"
              tabIndex={-1}
            >
              {error}
            </div>

            <fieldset className="review-form-section">
              <legend>
                <span>01</span>
                어떤 과정을 함께하셨나요?
              </legend>
              <p className="review-field-help">
                후기의 결과를 단정하려는 질문이 아니라, 읽는 분이 맥락을
                이해하도록 함께 표시하는 정보입니다.
              </p>
              <div className="review-choice-grid review-area-choices">
                {PRACTICE_AREAS.map((option) => (
                  <label key={option.value}>
                    <input
                      checked={form.practiceArea === option.value}
                      name="practiceArea"
                      onChange={() => setValue("practiceArea", option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>

              <div className="review-field-block">
                <span className="review-field-label">후기를 쓰는 시점</span>
                <div className="review-choice-grid review-stage-choices">
                  {PROGRESS_STAGES.map((option) => (
                    <label key={option.value}>
                      <input
                        checked={form.progressStage === option.value}
                        name="progressStage"
                        onChange={() =>
                          setValue("progressStage", option.value)
                        }
                        type="radio"
                        value={option.value}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </fieldset>

            <fieldset className="review-form-section">
              <legend>
                <span>02</span>
                어떤 점이 기억에 남았나요?
              </legend>
              <p className="review-field-help">
                가장 가까운 표현을 한 개에서 세 개까지 골라주세요.
              </p>
              <div className="review-keyword-choices">
                {EXPERIENCE_KEYWORDS.map((keyword) => {
                  const selected =
                    form.experienceKeywords.includes(keyword);
                  return (
                    <label key={keyword}>
                      <input
                        checked={selected}
                        onChange={() => toggleKeyword(keyword)}
                        type="checkbox"
                        value={keyword}
                      />
                      <span>
                        {selected ? <CheckIcon /> : null}
                        {keyword}
                      </span>
                    </label>
                  );
                })}
              </div>

              <label className="review-text-field review-content-field">
                <span>
                  후기 원문
                  <small>{form.content.length.toLocaleString("ko-KR")} / 3,000</small>
                </span>
                <textarea
                  maxLength={3_000}
                  onChange={(event) => setValue("content", event.target.value)}
                  placeholder={"예) 처음 상담을 요청할 때는 무엇부터 말해야 할지 막막했습니다. 담당자와 이야기하며 어떤 순서로 준비하면 되는지 알게 되었고…"}
                  rows={9}
                  value={form.content}
                />
                <small>
                  주민등록번호, 계좌번호, 사건번호, 상세 주소와 다른 사람의
                  개인정보는 적지 말아주세요.
                </small>
              </label>
            </fieldset>

            <fieldset className="review-form-section">
              <legend>
                <span>03</span>
                공개 이름과 확인 연락처
              </legend>
              <div className="review-contact-grid">
                <label className="review-text-field">
                  <span>공개 이름</span>
                  <input
                    autoComplete="nickname"
                    maxLength={20}
                    onChange={(event) =>
                      setValue("authorDisplay", event.target.value)
                    }
                    placeholder="예: 김○○ 고객"
                    type="text"
                    value={form.authorDisplay}
                  />
                  <small>
                    실명 대신 일부를 가린 이름이나 별칭을 권합니다.
                  </small>
                </label>
                <label className="review-text-field">
                  <span>휴대전화 번호</span>
                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    onChange={(event) =>
                      setValue("phone", formatPhone(event.target.value))
                    }
                    placeholder="010-0000-0000"
                    type="tel"
                    value={form.phone}
                  />
                  <small>
                    공개되지 않으며 작성자 확인·수정·철회 대응에만 씁니다.
                  </small>
                </label>
              </div>

              <div className="review-honeypot" aria-hidden="true">
                <label>
                  웹사이트
                  <input
                    autoComplete="off"
                    onChange={(event) =>
                      setValue("website", event.target.value)
                    }
                    tabIndex={-1}
                    type="text"
                    value={form.website}
                  />
                </label>
              </div>

              <div className="review-consents">
                <label>
                  <input
                    checked={form.privacyConsent}
                    onChange={(event) =>
                      setValue("privacyConsent", event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>[필수] 후기 접수 개인정보 수집·이용 동의</strong>
                    <small>
                      휴대전화 번호와 작성 내용을 작성자 확인, 개인정보 검수,
                      수정·철회 대응 목적으로 접수일부터 1년간 보관합니다.
                    </small>
                  </span>
                </label>
                <details>
                  <summary>수집·이용 내용 자세히 보기</summary>
                  <p>
                    개인정보처리자는 법무법인 로앤입니다. 수집 항목은 휴대전화
                    번호, 공개 이름, 분야·작성 시점·경험 키워드와 후기
                    원문입니다. 동의를 거부할 수 있으나 후기 접수는 할 수
                    없습니다. 검수 중인 원문과 연락처는 암호화해 보관하고
                    보관기간이 지나면 법령상 별도 의무가 없는 한 파기합니다.
                    {" "}
                    <a href="/privacy">전체 개인정보처리방침 보기</a>
                  </p>
                </details>

                <label>
                  <input
                    checked={form.publicationConsent}
                    onChange={(event) =>
                      setValue("publicationConsent", event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>[필수] 후기 공개 동의</strong>
                    <small>
                      검수 후 공개 이름, 분야, 작성 시점, 경험 키워드와 후기
                      원문이 홈페이지에 공개될 수 있음에 동의합니다.
                    </small>
                  </span>
                </label>
                <details>
                  <summary>공개·편집 기준 자세히 보기</summary>
                  <p>
                    제출 즉시 공개되지 않습니다. 실제 이용 여부와 개인정보,
                    광고 표현을 확인한 뒤 공개하며 개인정보 가림과 명백한
                    오탈자 외에는 좋은 표현을 임의로 덧붙이지 않습니다. 공개
                    뒤에도 철회를 요청할 수 있고, 후기의 개별 경험은 다른
                    사건의 결과를 보장하지 않습니다.
                  </p>
                </details>
              </div>

              <button
                className="button button-primary review-submit"
                disabled={submitting}
                type="submit"
              >
                {submitting ? "안전하게 접수하는 중…" : "이 내용으로 후기 맡기기"}
                {!submitting ? <ArrowIcon /> : null}
              </button>
              <p className="review-submit-note">
                후기 작성은 상담 요청이나 사건 진행에 영향을 주지 않습니다.
                광고성 문자 발송에도 사용하지 않습니다.
              </p>
            </fieldset>
          </form>

          <aside className="review-live-preview" aria-label="후기 공개 미리보기">
            <div>
              <p className="eyebrow">PUBLIC PREVIEW</p>
              <span>공개될 내용 미리보기</span>
            </div>
            <article>
              <header>
                <span>{displayArea(form.practiceArea)}</span>
                <span>{displayStage(form.progressStage)}</span>
              </header>
              <p>{previewContent}</p>
              <footer>
                <strong>{form.authorDisplay.trim() || "공개 이름"}</strong>
                {form.experienceKeywords.length > 0 ? (
                  <ul>
                    {form.experienceKeywords.map((keyword) => (
                      <li key={keyword}>{keyword}</li>
                    ))}
                  </ul>
                ) : (
                  <small>도움을 느낀 점</small>
                )}
              </footer>
            </article>
            <p>
              휴대전화 번호와 동의 기록은 이 미리보기와 공개 후기에서 보이지
              않습니다.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
