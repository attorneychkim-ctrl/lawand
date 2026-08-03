import type { Metadata } from "next";

import { ADVERTISING_RESPONSIBLE_LAWYER_LABEL } from "@/lib/legal-identity";

import {
  ArrowIcon,
  CheckIcon,
  ConsultationSection,
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "../_components/site-chrome";

const siteUrl = "https://lawandfirm.com";
const pagePath = "/bank/compare";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "개인회생과 개인파산 차이, 무엇을 기준으로 볼까",
  description:
    "개인회생과 개인파산은 소득 유무만으로 나뉘지 않습니다. 변제 재원, 재산 처리, 채무 한도, 면책 절차를 공식 법원 자료를 바탕으로 비교합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인회생과 개인파산 차이, 무엇을 기준으로 볼까 | 법무법인 로앤",
    description:
      "앞으로의 소득으로 변제하는 개인회생과 현재 재산을 정리하고 면책을 심사하는 개인파산의 차이를 여섯 가지 기준으로 안내합니다.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const comparisonRows = [
  {
    number: "01",
    label: "신청 상태",
    rehabilitation:
      "현재 지급불능 상태이거나, 가까운 장래에 지급불능이 생길 우려가 있는 개인채무자가 검토할 수 있습니다.",
    bankruptcy:
      "현재의 소득·재산으로 일반적이고 계속해서 채무를 갚을 수 없는 지급불능 상태인지 심사합니다.",
  },
  {
    number: "02",
    label: "주된 변제 재원",
    rehabilitation:
      "앞으로 계속되거나 반복될 소득에서 생계비 등을 제외한 가용소득으로 변제계획을 수행합니다.",
    bankruptcy:
      "파산선고 당시 파산재단에 속하는 재산을 환가해 채권자에게 배당하는 것이 기본 구조입니다.",
  },
  {
    number: "03",
    label: "소득",
    rehabilitation:
      "급여·사업·연금 등 소득이 이어질 가능성과 실제로 일정 금액을 계속 변제할 수 있는지를 봅니다.",
    bankruptcy:
      "일정한 소득이 없어도 신청할 수 있지만, 소득이 있다면 가용소득으로 상당 부분을 변제할 수 있는지도 함께 봅니다.",
  },
  {
    number: "04",
    label: "재산",
    rehabilitation:
      "재산을 반드시 처분하는 절차는 아니지만, 총변제액의 현재가치가 재산을 처분했을 때의 배당액보다 적어서는 안 됩니다.",
    bankruptcy:
      "파산관재인이 파산재단에 속하는 재산을 관리·처분합니다. 압류할 수 없는 재산 등은 구체적으로 구분해 확인합니다.",
  },
  {
    number: "05",
    label: "채무 한도",
    rehabilitation:
      "담보부 개인회생채권은 15억 원 이하, 그 밖의 개인회생채권은 10억 원 이하여야 합니다.",
    bankruptcy:
      "개인회생과 같은 채무 총액 한도는 없습니다. 다만 지급불능 여부와 신청의 적법성은 별도로 심사합니다.",
  },
  {
    number: "06",
    label: "면책",
    rehabilitation:
      "인가된 변제계획을 수행한 뒤 법원의 면책결정을 받는 구조입니다. 일부 채무는 면책에서 제외될 수 있습니다.",
    bankruptcy:
      "파산선고만으로 채무 책임이 없어지지 않습니다. 별도의 면책 심사를 거쳐야 하고 불허가 사유와 비면책채권을 확인합니다.",
  },
];

const situationCards = [
  {
    tag: "소득은 있지만",
    title: "생계비를 빼면 남는 금액이 거의 없어요",
    body: "소득의 존재만으로 개인회생이 정해지지는 않습니다. 실제 가용소득과 앞으로의 소득 가능성, 가족·주거·의료 상황을 자료로 확인해야 합니다.",
  },
  {
    tag: "재산이 있다면",
    title: "집이나 차량이 있으면 파산은 안 되나요?",
    body: "재산이 있다는 사실 하나로 결론을 내릴 수 없습니다. 개인회생에서는 청산가치를, 개인파산에서는 파산재단에 들어가는 재산과 면제될 수 있는 재산을 구분합니다.",
  },
  {
    tag: "채무의 원인이",
    title: "주식·코인·도박이면 어느 절차인가요?",
    body: "채무 원인만으로 절차가 자동 결정되지는 않습니다. 다만 개인파산에서는 낭비·도박 등이 면책불허가 사유가 될 수 있어 경위와 거래 내역을 빠짐없이 살펴야 합니다.",
  },
  {
    tag: "채무 금액이",
    title: "개인회생 한도를 넘으면 어떻게 하나요?",
    body: "개인회생의 담보부·그 밖의 채무 한도를 넘는다면 개인회생 요건을 충족하지 못할 수 있습니다. 그렇다고 개인파산이 바로 답이 되는 것은 아니며 일반회생을 포함해 다시 검토해야 합니다.",
  },
];

const checkSteps = [
  {
    title: "앞으로의 소득",
    body: "급여·사업·연금 등 소득의 금액과 변동, 앞으로도 이어질 가능성을 확인합니다.",
  },
  {
    title: "생활에 필요한 지출",
    body: "가구 구성, 주거비, 의료비 등을 놓고 변제에 쓸 수 있는 금액이 실제로 있는지 봅니다.",
  },
  {
    title: "현재 재산의 가치",
    body: "부동산·차량·보증금·예금·보험·퇴직금 등 재산의 현재 가치와 담보를 정리합니다.",
  },
  {
    title: "채무의 구조와 원인",
    body: "채권자별 금액·담보·세금·보증채무와 최근 대출·투자·재산 처분 경위를 살핍니다.",
  },
];

const faqs = [
  {
    question: "소득이 있으면 개인파산을 신청할 수 없나요?",
    answer:
      "소득이 있다는 사실만으로 개인파산이 배제되지는 않습니다. 법원은 그 소득에서 생계비와 조세 등 필수 지출을 제외한 가용소득으로 채무의 상당 부분을 계속 변제할 수 있는지 등 구체적인 사정을 봅니다.",
  },
  {
    question: "개인파산을 신청하면 바로 모든 채무가 없어지나요?",
    answer:
      "아닙니다. 파산절차는 재산을 환가·배당하는 절차이고, 남은 채무의 책임을 면하는지는 별도의 면책절차에서 판단합니다. 면책불허가 사유가 있거나 법에서 정한 비면책채권이라면 책임이 남을 수 있습니다.",
  },
  {
    question: "개인회생을 하면 재산을 모두 처분해야 하나요?",
    answer:
      "개인회생은 재산을 반드시 모두 처분하는 절차는 아닙니다. 다만 변제계획에서 갚는 금액의 현재가치가 파산했을 때 채권자에게 배당될 총액보다 적지 않아야 하는 청산가치 보장 원칙을 충족해야 합니다.",
  },
  {
    question: "개인회생과 개인파산 중 채무가 더 많이 줄어드는 쪽을 고르면 되나요?",
    answer:
      "감면 비율만으로 선택할 수 없습니다. 각 절차의 신청요건, 소득과 재산, 면책불허가 사유, 비면책채권, 변제계획 수행 가능성을 법원이 각각 심사합니다. 특정 결과나 감면 폭은 미리 보장할 수 없습니다.",
  },
  {
    question: "개인회생 변제기간은 언제나 3년인가요?",
    answer:
      "원칙적으로 변제개시일부터 3년을 초과할 수 없습니다. 다만 법에서 정한 특별한 사정이 있는 경우에는 5년 이내로 정할 수 있으므로, 실제 기간은 변제계획과 법원의 심사를 확인해야 합니다.",
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
      name: "개인회생·개인파산 비교",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "개인회생과 개인파산 차이, 무엇을 기준으로 볼까",
  description:
    "개인회생과 개인파산을 신청 상태, 변제 재원, 소득, 재산, 채무 한도, 면책 절차를 기준으로 비교합니다.",
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

export default function ComparePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      <SiteHeader />

      <main id="main-content">
        <section className="compare-page-hero">
          <div className="compare-page-orbit" aria-hidden="true" />
          <div className="shell">
            <nav className="breadcrumb" aria-label="현재 위치">
              <a href="/bank">회생·파산</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">개인회생·개인파산 비교</span>
            </nav>

            <div className="compare-page-hero-grid">
              <div className="compare-page-hero-copy">
                <p className="eyebrow">개인회생과 개인파산 비교</p>
                <h1>
                  소득은 출발점일 뿐,
                  <br />
                  <span>절차를 정하는 답은 아닙니다.</span>
                </h1>
                <p className="compare-page-lead">
                  개인회생은 앞으로의 소득으로 일정 기간 변제하는 절차이고,
                  개인파산은 선고 당시의 재산을 정리한 뒤 별도로 면책을 심사하는
                  절차입니다. 실제 선택에서는 가용소득·재산·채무 구조와 면책 쟁점을
                  함께 확인해야 합니다.
                </p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#comparison">
                    여섯 가지 차이 보기
                    <ArrowIcon />
                  </a>
                  <a className="button button-secondary" href="#check-order">
                    내 상황 정리 순서
                  </a>
                </div>
                <p className="eligibility-date">
                  <span>기준일</span>
                  <time dateTime={reviewedDate}>2026년 7월 26일</time>
                  <span aria-hidden="true">·</span>
                  현행 법령·법원 안내 기준
                </p>
              </div>

              <aside className="compare-page-summary" aria-label="비교의 핵심">
                <p>먼저 보는 세 가지 축</p>
                <ol>
                  <li>
                    <span>01</span>
                    <div>
                      <strong>앞으로의 소득</strong>
                      <small>가용소득으로 계속 변제할 수 있는지</small>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <strong>현재의 재산</strong>
                      <small>보유·청산가치·환가 범위를 어떻게 볼지</small>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <strong>절차가 끝난 뒤</strong>
                      <small>변제 수행과 별도 면책 심사가 어떻게 다른지</small>
                    </div>
                  </li>
                </ol>
                <a href="#comparison">
                  비교표에서 한 번에 보기
                  <ArrowIcon />
                </a>
              </aside>
            </div>
          </div>
        </section>

        <section className="compare-answer-band" aria-label="핵심 답변">
          <div className="shell">
            <strong>먼저 답하면</strong>
            <p>
              개인회생은 “소득이 있는 절차”, 개인파산은 “소득이 없는 절차”라고만
              나누면 부족합니다. 매달 실제로 변제할 수 있는 금액과 재산의 처리,
              면책 심사까지 연결해서 봐야 합니다.
            </p>
          </div>
        </section>

        <section className="section comparison-section" id="comparison">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">여섯 가지 비교 기준</p>
                <h2>
                  같은 채무 문제라도
                  <br />
                  절차의 구조는 다릅니다
                </h2>
              </div>
              <p>
                아래 표는 어느 한쪽을 자동으로 추천하는 진단표가 아닙니다. 서로 다른
                법적 구조를 이해하기 위한 출발점입니다.
              </p>
            </div>

            <div className="comparison-table" role="table" aria-label="개인회생과 개인파산 비교">
              <div className="comparison-table-head" role="row">
                <span role="columnheader">비교 기준</span>
                <strong role="columnheader">개인회생</strong>
                <strong role="columnheader">개인파산·면책</strong>
              </div>
              {comparisonRows.map((row) => (
                <article className="comparison-table-row" role="row" key={row.label}>
                  <div className="comparison-topic" role="rowheader">
                    <span>{row.number}</span>
                    <strong>{row.label}</strong>
                  </div>
                  <div className="comparison-cell" role="cell">
                    <b>개인회생</b>
                    <p>{row.rehabilitation}</p>
                  </div>
                  <div className="comparison-cell" role="cell">
                    <b>개인파산·면책</b>
                    <p>{row.bankruptcy}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="comparison-caution">
              <span aria-hidden="true">i</span>
              <p>
                개인회생의 변제기간은 원칙적으로 3년을 넘지 않지만 법에서 정한 사정이
                있으면 5년 이내로 정할 수 있습니다. 개인파산은 정해진 월 변제기간을
                수행하는 대신 파산절차와 면책절차를 각각 거칩니다.
              </p>
            </div>
          </div>
        </section>

        <section className="section compare-principle-section">
          <div className="shell compare-principle-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">가장 중요한 차이</p>
              <h2>
                무엇으로 채무를
                <br />
                정리하는지가 다릅니다
              </h2>
              <p>
                개인회생은 장래 소득, 개인파산은 선고 당시 재산이 주된 재원입니다.
                그래서 소득과 재산을 따로 보지 않고 함께 계산해야 합니다.
              </p>
            </div>

            <div className="compare-principle-cards">
              <article>
                <span>PERSONAL REHABILITATION</span>
                <p className="compare-principle-number" aria-hidden="true">
                  01
                </p>
                <h3>앞으로 벌 소득으로 변제합니다</h3>
                <p>
                  생계비 등을 제외한 가용소득으로 변제계획을 세우고, 재산을 처분했을 때
                  채권자가 받을 가치 이상을 변제해야 합니다.
                </p>
                <a href="/bank/personal-rehabilitation/eligibility">
                  개인회생 신청자격 확인
                  <ArrowIcon />
                </a>
              </article>
              <article>
                <span>PERSONAL BANKRUPTCY</span>
                <p className="compare-principle-number" aria-hidden="true">
                  02
                </p>
                <h3>현재 재산을 정리하고 면책을 심사합니다</h3>
                <p>
                  파산재단에 속하는 재산을 환가·배당한 뒤, 남은 채무의 책임을 면할지는
                  별도의 면책절차에서 법원이 판단합니다.
                </p>
                <a href="/bank/personal-bankruptcy/eligibility">
                  개인파산 신청자격 확인
                  <ArrowIcon />
                </a>
              </article>
            </div>
          </div>
        </section>

        <section className="section situation-section" id="situations">
          <div className="shell">
            <div className="self-check-heading">
              <div className="section-heading">
                <p className="eyebrow">표만 보고 단정하기 어려운 경우</p>
                <h2>
                  조건 하나가 아니라
                  <br />
                  서로의 관계를 봅니다
                </h2>
              </div>
              <p>
                실제 사건에서는 소득·재산·채무 원인 중 하나만 떼어 판단하지 않습니다.
                자주 부딪히는 네 가지 상황을 먼저 짚어보세요.
              </p>
            </div>

            <div className="situation-grid">
              {situationCards.map((card, index) => (
                <article key={card.title}>
                  <div>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <small>{card.tag}</small>
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section check-order-section" id="check-order">
          <div className="shell check-order-grid">
            <div className="section-heading">
              <p className="eyebrow">내 상황 정리 순서</p>
              <h2>
                절차를 고르기 전에
                <br />
                네 묶음부터 적어보세요
              </h2>
              <p>
                처음부터 정확한 서류가 없어도 됩니다. 아는 금액과 모르는 항목을
                구분하는 것만으로도 상담에서 확인할 쟁점이 선명해집니다.
              </p>
            </div>

            <ol className="check-order-list">
              {checkSteps.map((step, index) => (
                <li key={step.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                  <CheckIcon />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="shell faq-grid">
            <div className="section-heading">
              <p className="eyebrow">자주 묻는 질문</p>
              <h2>
                어느 쪽이 더 낫다는
                <br />
                답부터 정하지 않습니다
              </h2>
              <p>
                제도마다 얻는 결과만 다른 것이 아니라 신청요건과 진행 방식, 재산 처리,
                면책 심사가 모두 다릅니다.
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
                비교의 기준이 된
                <br />
                원문을 함께 남깁니다
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
                    개인회생과 개인파산 비교 안내
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://slb.scourt.go.kr/rel/guide/personal_b/index.jsp"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>서울회생법원</span>
                    개인파산·면책 제도 안내
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
                    href="https://www.law.go.kr/LSW/precInfoP.do?mode=0&precSeq=136520"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>대법원 판례</span>
                    소득·가용소득과 지급불능 판단
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
                이 글은 일반적인 제도 비교이며 개별 사건에 대한 법률 판단이 아닙니다.
                소득·재산·채무의 구성과 법원의 심사에 따라 실제 적용은 달라질 수
                있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">조건을 더 구체적으로 확인하려면</h2>
            </div>
            <div className="related-links">
              <a href="/bank/personal-rehabilitation/eligibility">
                <span>개인회생</span>
                개인회생 신청자격 네 가지 확인하기
                <ArrowIcon />
              </a>
              <a href="/bank/personal-bankruptcy/eligibility">
                <span>개인파산</span>
                개인파산 신청자격과 면책 구분하기
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              아직 어느 절차인지
              <br />
              정하지 않아도 괜찮습니다.
            </>
          }
          body="앞으로의 소득과 현재 재산, 대략적인 채무부터 말씀해 주세요. 개인회생과 개인파산 중 어느 쪽을 단정하기보다 더 확인해야 할 쟁점을 상담에서 함께 정리합니다."
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
