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
const pagePath = "/bank/personal-rehabilitation/repayment";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "개인회생 변제금, 월 납부액을 정하는 기준",
  description:
    "개인회생 변제금은 소득에서 생계비를 빼는 계산만으로 확정되지 않습니다. 가용소득, 청산가치, 변제기간, 우선권 있는 채권과 수행 가능성을 함께 설명합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인회생 변제금, 월 납부액을 정하는 기준 | 법무법인 로앤",
    description:
      "채무액에 정해진 비율을 곱하는 방식이 아닙니다. 소득·생계비·재산과 변제기간이 어떻게 연결되는지 확인하세요.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const repaymentFactors = [
  {
    number: "01",
    label: "소득",
    title: "앞으로 합리적으로 예상되는 소득",
    body: "급여·연금·사업·임대소득뿐 아니라 상여금과 그 밖에 합리적으로 예상되는 소득을 확인합니다. 월별 편차가 있으면 최근 자료와 앞으로의 근무·영업 상황을 함께 봅니다.",
    point: "통장에 들어온 한 달 금액만으로 정하지 않고 반복 가능성과 산정 기간을 설명해야 합니다.",
  },
  {
    number: "02",
    label: "공제",
    title: "세금·보험료 등 법에서 정한 금액",
    body: "소득세, 주민세 개인분, 개인지방소득세, 건강보험료와 법령이 정한 유사 금액은 가용소득을 산정할 때 소득에서 공제하는 항목입니다.",
    point: "실제 납부 내역과 소득 자료가 서로 맞는지 확인합니다.",
  },
  {
    number: "03",
    label: "생활",
    title: "법원이 인정하는 생계비",
    body: "생계비는 신청인과 피부양자의 인간다운 생활을 유지하는 데 필요한 금액입니다. 가구원 수만 세는 것이 아니라 연령, 실제 부양관계, 거주지역과 개별 지출 사유 등을 법원이 종합해 정합니다.",
    point: "주거비·의료비처럼 추가로 설명할 지출은 필요성과 계속성을 자료로 보여줘야 합니다.",
  },
  {
    number: "04",
    label: "영업",
    title: "사업을 계속하는 데 필요한 비용",
    body: "영업소득자는 매출 전부가 소득으로 남는 것이 아닙니다. 영업의 경영·보존·계속에 필요한 비용을 구분하고, 매출과 비용의 실제 흐름을 자료로 설명합니다.",
    point: "개인 생활비와 사업비를 나누고 일회성 비용과 반복 비용을 구분합니다.",
  },
  {
    number: "05",
    label: "재산",
    title: "총변제액과 비교하는 청산가치",
    body: "변제계획 인가결정일을 기준으로 평가한 개인회생채권의 총변제액은 원칙적으로 파산할 때 채권자가 배당받을 총액보다 적지 않아야 합니다. 재산이 많으면 이 기준이 월 변제금이나 기간에 영향을 줄 수 있습니다.",
    point: "부동산·보증금·차량·예금·보험·퇴직금 등 재산의 범위와 가액을 먼저 확인합니다.",
  },
  {
    number: "06",
    label: "계획",
    title: "변제기간·채권 구조와 수행 가능성",
    body: "변제기간은 원칙적으로 변제개시일부터 3년을 넘지 않지만 특별한 사정이 있으면 5년 이내로 정할 수 있습니다. 채권자 또는 회생위원이 이의를 진술한 경우에는 변제기간 동안의 가용소득 전부 제공도 추가 인가요건이 됩니다.",
    point: "계산상 가능한 금액과 실제로 계속 납부할 수 있는 금액이 함께 맞아야 합니다.",
  },
];

const situationPoints = [
  {
    title: "급여·상여가 일정하지 않을 때",
    body: "급여명세, 입금내역, 원천징수 자료와 근로계약을 기간별로 놓고 평균과 변동 원인을 확인합니다. 상여·수당도 앞으로 합리적으로 예상되는지 살펴봅니다.",
  },
  {
    title: "사업·프리랜서 소득일 때",
    body: "매출 입금과 세금 신고자료만 보지 않고 원가·임차료·인건비 등 영업을 계속하는 데 필요한 비용을 구분해 실제 월 소득을 설명합니다.",
  },
  {
    title: "부양가족이 있을 때",
    body: "주민등록상 가구원 수와 법원이 보는 피부양자 수가 항상 같지는 않습니다. 함께 사는지뿐 아니라 실제 부양 여부, 각자의 소득과 생활관계를 확인합니다.",
  },
  {
    title: "주거비·의료비 부담이 클 때",
    body: "지출이 있다는 사실만으로 전액이 공제되는 것은 아닙니다. 기본 생계비를 넘어 별도로 고려할 필요성과 금액, 앞으로도 계속될 가능성을 자료로 설명합니다.",
  },
  {
    title: "재산이나 보증금이 있을 때",
    body: "월 가용소득만으로 청산가치를 충족하지 못하면 총변제액을 조정해야 할 수 있습니다. 명의뿐 아니라 반환받을 보증금, 보험 환급금과 받을 돈도 살펴봅니다.",
  },
  {
    title: "세금·담보채무 등이 있을 때",
    body: "채권의 성격에 따라 변제계획 안팎의 처리 방식이 다를 수 있습니다. 일반 채무 총액만으로 월 부담을 예상하지 말고 우선권·담보 여부와 별도 납부액을 구분합니다.",
  },
];

const reviewSteps = [
  {
    title: "소득의 기준 기간을 정합니다",
    body: "최근 급여·매출 자료를 모아 월평균을 확인하고, 이직·휴직·폐업·계절성처럼 앞으로의 소득을 바꿀 사유를 따로 적습니다.",
  },
  {
    title: "공제와 생계비 근거를 맞춥니다",
    body: "세금·보험료, 실제 부양관계와 주거·의료 등 필요한 지출을 나누고 소득 및 지출 목록의 숫자와 증빙을 대조합니다.",
  },
  {
    title: "재산과 채권 성격을 확인합니다",
    body: "청산가치에 반영될 재산의 범위와 가액, 우선권 또는 담보가 문제 되는 채권을 확인해 월 가용소득만으로 놓친 부담이 없는지 봅니다.",
  },
  {
    title: "기간 전체의 수행 가능성을 봅니다",
    body: "한 달만 낼 수 있는 최대액이 아니라 변제기간 동안 계속 납부할 수 있는 계획인지 검토합니다. 법원의 보정에 따라 인가 전 계획안이 수정될 수 있습니다.",
  },
];

const faqs = [
  {
    question: "개인회생 변제금은 채무액의 몇 퍼센트인가요?",
    answer:
      "모든 사건에 적용되는 고정 비율은 없습니다. 법에서 정한 가용소득, 재산의 청산가치, 변제기간, 채권의 성격과 계획의 수행 가능성을 함께 심사합니다. 같은 채무액이어도 소득·가족·재산 상황이 다르면 변제계획이 달라질 수 있습니다.",
  },
  {
    question: "월 소득에서 최저생계비만 빼면 되나요?",
    answer:
      "그렇게 단순하게 확정되지 않습니다. 법률은 세금·보험료 등, 법원이 정하는 생계비와 영업소득자의 필요한 영업비용을 공제하도록 정합니다. 생계비도 공표된 기준 하나만 기계적으로 적용하는 것이 아니라 실제 부양관계와 개별 사정을 법원이 종합해 판단합니다.",
  },
  {
    question: "주민등록상 가족은 모두 부양가족으로 인정되나요?",
    answer:
      "주민등록이나 가족관계만으로 자동 인정된다고 단정할 수 없습니다. 실제로 함께 생활비를 부담하는지, 가족에게 별도 소득이 있는지, 연령과 건강 상태 등 부양의 필요성을 구체적으로 확인합니다.",
  },
  {
    question: "재산이 있으면 월 변제금이 반드시 올라가나요?",
    answer:
      "재산이 있다는 이유만으로 일정 금액이 자동 가산되는 것은 아닙니다. 다만 총변제액의 현재가치가 파산 시 채권자 배당액보다 적지 않아야 하는 청산가치 보장 기준 때문에, 재산의 종류와 평가액에 따라 월 변제금이나 변제기간의 조정이 필요할 수 있습니다.",
  },
  {
    question: "상여금이나 들쭉날쭉한 매출도 소득에 포함되나요?",
    answer:
      "법률은 합리적으로 예상되는 모든 종류의 소득을 출발점으로 삼습니다. 따라서 이름만으로 제외하거나 전액 포함한다고 단정하지 않고, 과거 지급·매출 내역과 계약, 계절성, 현재 근무·영업 상황을 토대로 앞으로의 예상 가능성을 설명해야 합니다.",
  },
  {
    question: "변제기간은 항상 3년인가요?",
    answer:
      "변제기간은 원칙적으로 변제개시일부터 3년을 초과할 수 없습니다. 다만 청산가치 보장 요건을 충족하기 위해 필요한 경우 등 특별한 사정이 있으면 5년 이내로 정할 수 있어 실제 기간은 제출한 변제계획과 법원의 심사를 확인해야 합니다.",
  },
  {
    question: "계산한 예상 변제금이 그대로 인가되나요?",
    answer:
      "아닙니다. 예상액은 자료를 정리하기 위한 출발점입니다. 법원은 변제계획이 법률에 맞고 공정·형평하며 수행 가능한지 심사하고, 재산·소득 누락이나 산정 근거가 부족하면 보정을 요구할 수 있습니다. 인가 전에는 변제계획안이 수정될 수도 있습니다.",
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
      name: "변제금",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "개인회생 변제금, 월 납부액을 정하는 기준",
  description:
    "개인회생 변제금에 영향을 주는 가용소득, 생계비, 청산가치, 변제기간과 수행 가능성을 공식 자료를 바탕으로 설명합니다.",
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

export default function PersonalRehabilitationRepaymentPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      <SiteHeader />

      <main id="main-content">
        <section className="eligibility-hero">
          <div className="eligibility-hero-orbit" aria-hidden="true" />
          <div className="shell">
            <nav className="breadcrumb" aria-label="현재 위치">
              <a href="/bank">회생·파산</a>
              <span aria-hidden="true">/</span>
              <a href="/bank/personal-rehabilitation">개인회생</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">변제금</span>
            </nav>

            <div className="eligibility-hero-grid">
              <div className="eligibility-hero-copy">
                <p className="eyebrow">개인회생 변제금</p>
                <h1>
                  채무액의 정해진 비율로
                  <br />
                  <span>월 변제금이 결정되지는 않습니다.</span>
                </h1>
                <p className="eligibility-lead">
                  예상 소득에서 법이 정한 공제와 생계비 등을 뺀 가용소득이 출발점입니다.
                  여기에 재산의 청산가치, 변제기간, 채권의 성격과 계획을 계속 수행할 수
                  있는지를 함께 살펴야 합니다.
                </p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#factors">
                    산정 기준 보기
                    <ArrowIcon />
                  </a>
                  <a className="button button-secondary" href="#review-flow">
                    확인 순서 보기
                  </a>
                </div>
                <p className="eligibility-date">
                  <span>기준일</span>
                  <time dateTime={reviewedDate}>2026년 7월 26일</time>
                  <span aria-hidden="true">·</span>
                  현행 법령·법원 안내 기준
                </p>
              </div>

              <aside className="eligibility-summary" aria-label="개인회생 변제금 핵심 요약">
                <p>네 축을 함께 보세요</p>
                <ol>
                  <li>
                    <a href="#factors">
                      <span>01</span>
                      <strong>예상 소득</strong>
                      <small>급여·사업·연금과 변동 소득</small>
                    </a>
                  </li>
                  <li>
                    <a href="#factors">
                      <span>02</span>
                      <strong>공제와 생계비</strong>
                      <small>법정 공제·부양·필요 지출</small>
                    </a>
                  </li>
                  <li>
                    <a href="#situations">
                      <span>03</span>
                      <strong>청산가치</strong>
                      <small>재산과 총변제액의 비교</small>
                    </a>
                  </li>
                  <li>
                    <a href="#review-flow">
                      <span>04</span>
                      <strong>수행 가능성</strong>
                      <small>기간 전체의 지속 가능한 계획</small>
                    </a>
                  </li>
                </ol>
              </aside>
            </div>
          </div>
        </section>

        <section className="eligibility-answer-band" aria-label="가용소득의 출발점">
          <div className="shell">
            <strong>가용소득의 출발점</strong>
            <p>
              예상 가능한 모든 소득에서 세금·보험료 등 법정 공제, 법원이 정하는
              생계비와 필요한 영업비용을 뺀 나머지를 봅니다. 이 금액은 예상 변제금의
              출발점이지 법원의 인가를 받은 확정 월 변제금은 아닙니다.
            </p>
          </div>
        </section>

        <section className="section eligibility-requirements" id="factors">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">변제금 산정 기준</p>
                <h2>
                  월 가용소득과
                  <br />
                  변제계획 전체를 함께 봅니다
                </h2>
              </div>
              <p>
                월 납부액 하나만 계산하기보다 소득·공제·재산·기간이 서로 맞는지를
                순서대로 확인해야 합니다.
              </p>
            </div>

            <div className="qualification-list">
              {repaymentFactors.map((factor) => (
                <article key={factor.number}>
                  <div className="qualification-index">
                    <span>{factor.number}</span>
                    <small>{factor.label}</small>
                  </div>
                  <div className="qualification-copy">
                    <h3>{factor.title}</h3>
                    <p>{factor.body}</p>
                    <div>
                      <CheckIcon />
                      {factor.point}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section income-section" id="situations">
          <div className="shell income-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">상황별 확인</p>
              <h2>
                같은 소득이어도
                <br />
                확인할 근거는 다릅니다
              </h2>
              <p>
                직업·가족·지출·재산 상황에 따라 산정 근거가 달라집니다. 아래 항목 중
                내게 해당하는 사실을 자료와 함께 정리하세요.
              </p>
            </div>

            <div className="income-points">
              {situationPoints.map((point) => (
                <article key={point.title}>
                  <span>변제금 변수</span>
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section self-check-section" id="review-flow">
          <div className="shell">
            <div className="self-check-heading">
              <div className="section-heading">
                <p className="eyebrow">예상액 확인 순서</p>
                <h2>
                  숫자를 넣기 전에
                  <br />
                  기준부터 맞추세요
                </h2>
              </div>
              <p>
                같은 자료도 어느 기간을 기준으로 보느냐에 따라 평균이 달라집니다.
                소득에서 시작해 공제·재산·수행 가능성 순서로 확인합니다.
              </p>
            </div>

            <ol className="self-check-grid">
              {reviewSteps.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="privacy-note">
              <span aria-hidden="true">i</span>
              <p>
                온라인의 단순 계산 결과는 법원이 인가한 변제계획이 아닙니다. 특히
                부양가족·추가 생계비·사업비·재산 가액을 임의로 넣으면 예상액의 차이가
                커질 수 있으므로, 숫자와 함께 인정 근거를 확인해야 합니다.
              </p>
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="shell faq-grid">
            <div className="section-heading">
              <p className="eyebrow">자주 묻는 질문</p>
              <h2>
                계산보다 먼저
                <br />
                오해를 정리하세요
              </h2>
              <p>
                고정 비율, 가구원 수, 생계비와 재산에 관해 자주 생기는 질문을
                정리했습니다.
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
              <p className="eyebrow">공식 근거</p>
              <h2>
                법률이 정한 산정 구조와
                <br />
                인가요건을 확인했습니다
              </h2>
            </div>
            <div className="evidence-content">
              <ul>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제579조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    제579조 가용소득의 정의
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제611조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    제611조 변제계획의 내용·기간
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제614조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    제614조 청산가치·수행 가능성 등 인가요건
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://slb.scourt.go.kr/rel/guide/personal_r/index.jsp"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>서울회생법원</span>
                    개인회생 제도·청산가치 안내
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
                이 글은 일반적인 제도 안내이며 개별 사건의 확정 변제금이나 인가 결과를
                제시하지 않습니다. 법령·법원 실무와 사건의 소득·재산·채권 구조에 따라
                실제 변제계획은 달라질 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">산정에 필요한 자료와 절차도 확인하세요</h2>
            </div>
            <div className="related-links">
              <a href="/bank/personal-rehabilitation/documents">
                <span>필요서류</span>
                소득·생계비·재산을 어떤 자료로 확인할까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/process">
                <span>절차와 기간</span>
                변제계획은 언제 심사하고 납부할까
                <ArrowIcon />
              </a>
              <a href="/bank/situations/self-employed">
                <span>자영업자 개인회생</span>
                매출에서 필요한 영업비용을 어떻게 구분할까
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              예상 변제금의 근거가
              <br />
              서로 맞는지 궁금하다면.
            </>
          }
          body="최근 소득의 형태와 대략적인 가구 구성·재산·채무부터 말씀해 주세요. 상담 초기에는 주민등록번호·계좌번호나 원본 서류를 보내지 않아도 됩니다."
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
