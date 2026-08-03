import type { Metadata } from "next";

import { ADVERTISING_RESPONSIBLE_LAWYER_LABEL } from "@/lib/legal-identity";

import {
  ArrowIcon,
  CheckIcon,
  ConsultationSection,
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "../../_components/site-chrome";

const siteUrl = "https://lawandfirm.com";
const pagePath = "/bank/personal-rehabilitation/process";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "개인회생 절차와 기간, 신청부터 면책까지",
  description:
    "개인회생 신청 준비부터 법원 심사, 개시결정, 채권자집회, 변제계획 인가, 변제 수행과 면책까지의 흐름과 기간에 영향을 주는 요인을 공식 자료로 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인회생 절차와 기간, 신청부터 면책까지 | 법무법인 로앤",
    description:
      "개인회생은 신청만으로 끝나지 않습니다. 법원 심사부터 개시·인가·변제·면책까지 각 단계에서 확인할 일을 순서대로 안내합니다.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const processSteps = [
  {
    number: "01",
    id: "prepare",
    phase: "신청 전",
    title: "채무·재산·소득 자료를 맞추고 신청서를 준비합니다",
    body: "채권자목록, 재산목록, 소득·지출 목록과 소득을 증명할 자료를 바탕으로 신청서를 작성합니다. 채권자나 재산을 빠뜨리면 뒤 단계에서 보정과 목록 수정이 필요할 수 있으므로, 이름과 금액만이 아니라 담보·보증·세금까지 구분합니다.",
    timing: "자료 수집 기간은 소득 형태와 채권자 수에 따라 달라집니다.",
    point: "변제계획안은 원칙적으로 신청일부터 14일 이내 제출해야 하며, 상당한 이유가 있으면 법원이 기간을 늘릴 수 있습니다.",
  },
  {
    number: "02",
    id: "review",
    phase: "접수 후 심사",
    title: "법원이 서류를 심사하고 필요한 보정을 요청합니다",
    body: "법원 또는 회생위원은 신청자격, 채권·재산·소득의 누락 여부, 가용소득과 청산가치, 변제계획의 실현 가능성을 확인합니다. 설명이 부족하거나 자료끼리 금액이 맞지 않으면 보정권고·보정명령에 따라 정해진 기한 안에 자료를 보완합니다.",
    timing: "보정 횟수와 자료 제출 속도가 개시결정까지의 기간에 큰 영향을 줍니다.",
    point: "신청서를 냈다는 사실만으로 모든 독촉·압류가 곧바로 멈추는 것은 아닙니다. 금지·중지명령이나 개시결정의 범위와 시점을 확인해야 합니다.",
  },
  {
    number: "03",
    id: "commencement",
    phase: "개시결정",
    title: "법원이 개인회생절차를 시작할지 결정합니다",
    body: "개시결정이 나면 법원은 개인회생채권에 대한 이의기간과 채권자집회 기일을 함께 정하고, 채권자에게 채권자목록과 변제계획안을 송달합니다. 목록에 기재된 채권에 의한 강제집행·가압류·변제 요구 등은 법에서 정한 범위에서 중지되거나 금지됩니다.",
    timing: "법률은 신청일부터 1개월 이내에 개시 여부를 결정하도록 정하지만, 실제 사건은 보정·송달과 사건 사정에 따라 더 걸릴 수 있습니다.",
    point: "개시결정은 변제계획을 최종 승인한 인가결정이나 채무 책임을 면하는 면책결정과 다릅니다.",
  },
  {
    number: "04",
    id: "objection",
    phase: "채권 확인",
    title: "채권 이의기간을 거쳐 채권자집회에 출석합니다",
    body: "개인회생채권자는 정해진 기간에 채권의 내용에 이의를 제기할 수 있습니다. 채권자집회에서 채무자는 출석해 요구가 있으면 변제계획을 설명해야 하고, 채권자는 변제계획에 관해 이의를 진술할 수 있습니다.",
    timing: "개시결정 때 이의기간과 집회기일이 지정되며, 특별한 사정이 있으면 변경될 수 있습니다.",
    point: "개인회생은 채권자의 찬반 투표로 인가를 정하는 절차는 아니지만, 이의가 있으면 법정 인가요건을 추가로 확인합니다.",
  },
  {
    number: "05",
    id: "approval",
    phase: "인가결정",
    title: "법원이 변제계획의 인가요건을 심사합니다",
    body: "법원은 변제계획이 법률에 맞고 공정·형평하며 수행 가능한지, 청산가치와 가용소득 등 인가요건을 갖췄는지 판단합니다. 필요한 경우 인가 전까지 변제계획안을 수정할 수 있고, 법원이 수정을 명할 수도 있습니다.",
    timing: "서울회생법원 안내상 채권자집회 후 인가결정까지 통상 약 1개월이지만 재판부와 사건 사정에 따라 달라질 수 있습니다.",
    point: "인가결정 전에도 제출한 변제계획안의 변제개시일이 도래하면 안내된 계좌에 적립을 시작해야 할 수 있습니다.",
  },
  {
    number: "06",
    id: "repayment",
    phase: "변제 수행",
    title: "인가된 계획에 따라 정해진 금액을 계속 납부합니다",
    body: "채무자는 인가된 변제계획에 따라 변제금을 납부합니다. 변제기간은 원칙적으로 변제개시일부터 3년을 넘지 않지만, 청산가치 보장 등 특별한 사정이 있으면 5년 이내로 정할 수 있습니다.",
    timing: "변제기간 동안 소득과 납부 상태를 계속 관리해야 합니다.",
    point: "납부가 어려워졌다면 그대로 연체하기보다 소득 감소의 원인과 회복 가능성을 확인하고 변제계획 변경 가능성 등을 검토해야 합니다.",
  },
  {
    number: "07",
    id: "discharge",
    phase: "면책",
    title: "변제를 마친 뒤 법원의 면책결정을 확인합니다",
    body: "변제계획에 따른 변제를 완료하면 법원은 신청 또는 직권으로 면책결정을 합니다. 면책결정이 있어야 변제계획에 따라 갚지 못한 개인회생채권에 대한 책임이 법에서 정한 범위에서 면제됩니다.",
    timing: "마지막 납부가 끝났다는 사실과 면책결정은 같은 날 자동으로 이루어지는 것이 아닙니다.",
    point: "조세·벌금 등 법에서 정한 비면책채권과 악의로 목록에서 누락한 채권 등은 면책의 효력이 미치지 않을 수 있습니다.",
  },
];

const delayFactors = [
  {
    title: "자료의 누락과 불일치",
    body: "채권자목록·재산목록·소득 자료의 숫자가 맞지 않거나 계좌 거래의 설명이 빠지면 추가 보정이 이어질 수 있습니다.",
  },
  {
    title: "채권자 수와 송달",
    body: "채권자가 많거나 주소가 정확하지 않으면 송달과 목록 정리에 시간이 더 필요할 수 있습니다.",
  },
  {
    title: "소득·가구 상황의 변동",
    body: "이직·휴직·사업 매출 변화나 부양가족·주거비 변동은 가용소득과 변제계획을 다시 계산하게 할 수 있습니다.",
  },
  {
    title: "채권 이의와 추가 쟁점",
    body: "채권 금액이나 재산 평가에 다툼이 있거나 최근 대출·재산 처분의 설명이 필요한 경우 심사가 길어질 수 있습니다.",
  },
];

const decisionPoints = [
  {
    label: "개시결정",
    title: "절차를 시작한다는 결정",
    body: "신청자격과 제출 자료를 심사해 개인회생절차를 열고, 채권 이의기간과 채권자집회 기일을 정합니다.",
  },
  {
    label: "인가결정",
    title: "변제계획을 승인하는 결정",
    body: "채무자가 얼마를 어떤 기간과 방법으로 변제할지 정한 계획이 법정 요건을 충족하는지 판단합니다.",
  },
  {
    label: "면책결정",
    title: "남은 책임을 면하는 결정",
    body: "변제를 완료한 뒤 별도의 재판으로 내려집니다. 비면책채권 등에는 효력이 미치지 않을 수 있습니다.",
  },
];

const deadlineChecklist = [
  {
    title: "법원에서 받은 문서",
    body: "보정권고·명령, 집회기일 통지, 결정문에 적힌 제출기한과 출석일을 바로 확인합니다.",
  },
  {
    title: "변제금 첫 납부일",
    body: "인가결정일만 기다리지 말고 제출한 변제계획안과 개시결정 안내에 적힌 변제개시일을 확인합니다.",
  },
  {
    title: "소득·주소의 변화",
    body: "이직, 휴직, 폐업, 급여 변동이나 주소 변경이 생기면 진행 중인 사건에 어떻게 반영할지 확인합니다.",
  },
  {
    title: "새로 알게 된 채권",
    body: "누락한 채권을 발견하면 임의로 미루지 말고 목록 수정 가능 시기와 필요한 절차를 확인합니다.",
  },
];

const faqs = [
  {
    question: "개인회생을 신청하면 독촉과 압류가 바로 멈추나요?",
    answer:
      "신청서를 접수했다는 사실만으로 모든 절차가 자동으로 멈추는 것은 아닙니다. 법원은 개시결정 전 필요하다고 인정하면 중지·금지명령을 할 수 있고, 개시결정 뒤에는 목록에 기재된 채권에 의한 강제집행·가압류·변제 요구 등이 법에서 정한 범위에서 중지되거나 금지됩니다. 진행 중인 경매·압류의 종류와 결정 내용을 각각 확인해야 합니다.",
  },
  {
    question: "신청부터 개시결정까지 정확히 한 달인가요?",
    answer:
      "법률은 법원이 신청일부터 1개월 이내에 개시 여부를 결정하도록 정합니다. 다만 실제 진행에서는 보정자료 제출, 채권자와 재산의 확인, 송달 등 사건별 사정 때문에 더 걸릴 수 있어 한 달 안에 반드시 결정된다고 단정할 수 없습니다.",
  },
  {
    question: "채권자집회에는 꼭 출석해야 하나요?",
    answer:
      "채무자는 개인회생채권자집회에 출석해 채권자의 요구가 있으면 변제계획을 설명해야 합니다. 정당한 사유 없이 출석하지 않거나 절차상 의무를 이행하지 않으면 사건 진행에 영향을 줄 수 있으므로 지정된 기일을 확인해야 합니다.",
  },
  {
    question: "변제금은 인가결정이 난 뒤부터 내면 되나요?",
    answer:
      "반드시 그렇지는 않습니다. 서울회생법원은 인가결정 이후가 아니라 법원에 제출된 변제계획안에서 정한 변제시기부터 적립금을 입금해야 한다고 안내합니다. 개시결정 때 안내된 계좌와 본인의 변제개시일을 확인해야 합니다.",
  },
  {
    question: "변제를 모두 마치면 자동으로 면책되나요?",
    answer:
      "마지막 변제금 납부와 면책결정은 구분됩니다. 변제계획에 따른 변제를 완료하면 법원이 신청 또는 직권으로 면책결정을 하므로 사건검색과 결정문을 통해 면책 여부를 확인해야 합니다. 비면책채권에는 면책 효력이 미치지 않을 수 있습니다.",
  },
];

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "회생·파산",
      item: `${siteUrl}/bank`,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "개인회생",
      item: `${siteUrl}/bank/personal-rehabilitation`,
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "절차와 기간",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "개인회생 절차와 기간, 신청부터 면책까지",
  description:
    "개인회생의 신청 준비, 법원 심사, 개시결정, 채권자집회, 인가, 변제 수행과 면책까지 각 단계와 기간을 설명합니다.",
  inLanguage: "ko-KR",
  mainEntityOfPage: `${siteUrl}${pagePath}`,
  datePublished: reviewedDate,
  dateModified: reviewedDate,
  author: {
    "@type": "Organization",
    name: "법무법인 로앤",
    url: siteUrl,
  },
  publisher: {
    "@type": "Organization",
    name: "법무법인 로앤",
    url: siteUrl,
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function PersonalRehabilitationProcessPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      <SiteHeader />

      <main id="main-content">
        <section className="process-hero">
          <div className="process-hero-orbit" aria-hidden="true" />
          <div className="shell">
            <nav className="breadcrumb" aria-label="현재 위치">
              <a href="/bank">회생·파산</a>
              <span aria-hidden="true">/</span>
              <a href="/bank/personal-rehabilitation">개인회생</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">절차·기간</span>
            </nav>

            <div className="process-hero-grid">
              <div className="process-hero-copy">
                <p className="eyebrow">개인회생 절차와 기간</p>
                <h1>
                  신청보다 중요한 건
                  <br />
                  <span>
                    그다음 일정을
                    <br className="process-mobile-break" />
                    놓치지 않는 것입니다.
                  </span>
                </h1>
                <p className="process-lead">
                  개인회생은 신청서를 내고 끝나는 절차가 아닙니다. 법원의 서류 심사와
                  보정, 개시결정, 채권 확인, 채권자집회와 인가를 거쳐 변제계획을
                  수행한 뒤 면책결정을 확인해야 합니다.
                </p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#timeline">
                    전체 절차 보기
                    <ArrowIcon />
                  </a>
                  <a className="button button-secondary" href="#deadlines">
                    놓치면 안 될 일정
                  </a>
                </div>
                <p className="eligibility-date">
                  <span>기준일</span>
                  <time dateTime={reviewedDate}>2026년 7월 26일</time>
                  <span aria-hidden="true">·</span>
                  현행 법령·법원 안내 기준
                </p>
              </div>

              <aside className="process-summary" aria-label="개인회생 절차 핵심 요약">
                <p>전체 흐름 한눈에 보기</p>
                <ol>
                  <li>
                    <span>01</span>
                    <div>
                      <strong>준비·신청</strong>
                      <small>목록과 변제계획안 제출</small>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <strong>심사·개시</strong>
                      <small>보정 뒤 절차 개시 여부 판단</small>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <strong>채권 확인·인가</strong>
                      <small>이의기간과 채권자집회</small>
                    </div>
                  </li>
                  <li>
                    <span>04</span>
                    <div>
                      <strong>변제·면책</strong>
                      <small>계획 수행 뒤 면책결정</small>
                    </div>
                  </li>
                </ol>
                <a href="#decisions">
                  개시·인가·면책 차이 보기
                  <ArrowIcon />
                </a>
              </aside>
            </div>
          </div>
        </section>

        <section className="process-answer-band" aria-label="기간 안내">
          <div className="shell">
            <strong>기간을 볼 때</strong>
            <p>
              법에 정해진 기한과 실제 사건이 끝나는 기간은 다릅니다. 보정 횟수,
              채권자 송달, 이의와 소득·재산의 변동에 따라 개시·인가 시점이 달라질 수
              있으므로 “몇 개월이면 끝난다”는 식으로 단정할 수 없습니다.
            </p>
          </div>
        </section>

        <section className="section process-timeline-section" id="timeline">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">신청부터 면책까지</p>
                <h2>
                  개인회생은
                  <br />
                  일곱 단계를 거칩니다
                </h2>
              </div>
              <p>
                각 단계의 결정은 의미가 다릅니다. 지금 받은 문서의 제목과 제출기한,
                다음 기일을 함께 확인하세요.
              </p>
            </div>

            <ol className="process-timeline">
              {processSteps.map((step) => (
                <li id={step.id} key={step.number}>
                  <div className="process-marker" aria-hidden="true">
                    <span>{step.number}</span>
                  </div>
                  <article>
                    <div className="process-step-heading">
                      <span>{step.phase}</span>
                      <h3>{step.title}</h3>
                    </div>
                    <p>{step.body}</p>
                    <dl>
                      <div>
                        <dt>기간을 좌우하는 점</dt>
                        <dd>{step.timing}</dd>
                      </div>
                    </dl>
                    <div className="process-step-point">
                      <CheckIcon />
                      <p>{step.point}</p>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section process-delay-section">
          <div className="shell process-delay-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">기간이 달라지는 이유</p>
              <h2>
                같은 날 신청해도
                <br />
                진행 속도는 다를 수 있습니다
              </h2>
              <p>
                법원의 사건 수만이 아니라 제출한 자료와 송달, 사건 중 생긴 변화가
                다음 결정 시점에 영향을 줍니다.
              </p>
            </div>

            <div className="process-delay-cards">
              {delayFactors.map((factor, index) => (
                <article key={factor.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{factor.title}</h3>
                  <p>{factor.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section process-decisions-section" id="decisions">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">세 결정의 차이</p>
                <h2>
                  개시·인가·면책은
                  <br />
                  같은 결정이 아닙니다
                </h2>
              </div>
              <p>
                개시결정을 받았다고 변제계획이 최종 승인되거나 곧바로 면책되는 것은
                아닙니다.
              </p>
            </div>

            <div className="process-decision-grid">
              {decisionPoints.map((point, index) => (
                <article key={point.label}>
                  <span className="process-decision-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <small>{point.label}</small>
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section process-deadlines-section" id="deadlines">
          <div className="shell">
            <div className="process-deadlines-heading">
              <div className="section-heading">
                <p className="eyebrow">진행 중 체크리스트</p>
                <h2>
                  결정 이름보다 먼저
                  <br />
                  날짜부터 확인하세요
                </h2>
              </div>
              <p>
                보정기한·집회기일·변제개시일은 사건마다 다릅니다. 법원에서 받은 최신
                문서와 사건검색을 기준으로 관리해야 합니다.
              </p>
            </div>

            <ul className="process-deadline-list">
              {deadlineChecklist.map((item, index) => (
                <li key={item.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="process-caution">
              <span aria-hidden="true">i</span>
              <p>
                지급명령·소송·압류·경매 문서를 이미 받았다면 개인회생 일정과 별개로
                그 문서의 불복·대응 기한이 진행될 수 있습니다. 문서명과 받은 날짜를
                먼저 확인하세요.
              </p>
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="shell faq-grid">
            <div className="section-heading">
              <p className="eyebrow">자주 묻는 질문</p>
              <h2>
                절차가 시작돼도
                <br />
                확인할 일은 남아 있습니다
              </h2>
              <p>
                신청·개시·인가·면책을 혼동하면 중요한 기한이나 납부 시기를 놓치기
                쉽습니다.
              </p>
            </div>

            <div className="faq-list">
              {faqs.map((faq, index) => (
                <details key={faq.question}>
                  <summary>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {faq.question}
                    <i aria-hidden="true">+</i>
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section evidence-section" id="sources">
          <div className="shell evidence-grid">
            <div>
              <p className="eyebrow">공식 근거와 검토 정보</p>
              <h2>
                절차와 기간의 근거를
                <br />
                직접 확인할 수 있습니다
              </h2>
            </div>
            <div className="evidence-content">
              <ul>
                <li>
                  <a
                    href="https://slb.scourt.go.kr/rel/guide/personal_r/index.jsp"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>서울회생법원</span>
                    개인회생 제도·절차 안내
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채무자 회생 및 파산에 관한 법률
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://slb.scourt.go.kr/dcboard/new/DcNewsViewAction.work?gubun=47&amp;seqnum=142"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>서울회생법원 FAQ</span>
                    변제금 적립 시작 시기 안내
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
              </ul>
              <dl className="article-meta">
                <div>
                  <dt>작성</dt>
                  <dd>법무법인 로앤 콘텐츠팀</dd>
                </div>
                <div>
                  <dt>광고책임변호사</dt>
                  <dd>{ADVERTISING_RESPONSIBLE_LAWYER_LABEL}</dd>
                </div>
                <div>
                  <dt>최초 작성·최근 검토</dt>
                  <dd>
                    <time dateTime={reviewedDate}>2026년 7월 26일</time>
                  </dd>
                </div>
              </dl>
              <p>
                이 글은 일반적인 제도 안내이며 개별 사건에 대한 법률 판단이 아닙니다.
                법령·법원 실무와 사건의 사실관계에 따라 절차와 기간은 달라질 수
                있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">신청 전 기준도 함께 확인하세요</h2>
            </div>
            <div className="related-links">
              <a href="/bank/situations/collection-and-seizure">
                <span>독촉·압류 대응</span>
                지금 받은 문서에서 무엇부터 확인할까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/documents">
                <span>필요서류</span>
                신청과 보정에 어떤 자료가 필요할까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/repayment">
                <span>변제금</span>
                월 납부액은 어떤 기준으로 정할까
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              지금 어느 단계인지
              <br />
              정확히 모르겠다면.
            </>
          }
          body="법원이나 채권자에게 받은 문서의 이름과 날짜, 현재 소득과 대략적인 채무·재산부터 말씀해 주세요. 먼저 확인할 기한과 쟁점을 상담에서 함께 정리합니다."
        />
      </main>

      <SiteFooter />
      <MobileActions />

      {[breadcrumbJsonLd, articleJsonLd, faqJsonLd].map((data, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}
    </>
  );
}
