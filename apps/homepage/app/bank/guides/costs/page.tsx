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
const pagePath = "/bank/guides/costs";
const reviewedDate = "2026-07-31";
const serviceFeeUnit = 5_640;
const electronicStampFee = 27_000;

export const metadata: Metadata = {
  title: "개인회생 비용 총정리, 법원비용·변호사비 구분",
  description:
    "개인회생 비용을 변호사 보수, 인지대, 송달료, 사건별 추가 실비로 나눠 설명합니다. 2026년 7월 송달료 기준과 채권자 수별 법원비용 예시, 계약 전 확인사항을 확인하세요.",
  keywords: [
    "개인회생 비용",
    "개인회생 변호사 비용",
    "개인회생 신청 비용",
    "개인회생 법원 비용",
    "개인회생 송달료",
    "개인회생 인지대",
    "개인회생 수임료",
  ],
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인회생 비용, 총액보다 먼저 항목을 나눠 보세요 | 법무법인 로앤",
    description:
      "변호사 보수와 법원비용은 다른 돈입니다. 현재 기준의 인지대·송달료 계산식과 견적 비교 기준을 확인하세요.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const costParts = [
  {
    number: "01",
    label: "보수",
    title: "변호사 보수",
    body: "법률상담, 신청서·채권자목록·재산목록·변제계획안 작성, 보정 대응 등 위임받는 업무의 대가입니다. 정해진 단일 공정가격이 있는 항목이 아니므로 사건의 자료량과 쟁점, 채권자 수, 맡기는 업무 범위에 따라 달라질 수 있습니다.",
    check:
      "부가가치세 포함 여부와 개시·인가·면책까지 어느 단계가 포함되는지 서면 견적과 위임계약서에서 확인하세요.",
  },
  {
    number: "02",
    label: "인지",
    title: "신청 인지대",
    body: "개인회생절차 개시신청서에 붙이는 법원 수수료입니다. 현행 인지법상 기본 인지액은 3만 원이며, 전자문서로 제출할 때에는 그 금액의 10분의 9가 적용되어 2만 7천 원입니다.",
    check:
      "전자제출인지 종이제출인지에 따라 금액이 달라질 수 있으므로 실제 접수 방식과 납부서를 확인하세요.",
  },
  {
    number: "03",
    label: "송달",
    title: "송달료",
    body: "법원이 신청인과 채권자 등에게 문서를 보내는 비용입니다. 개인회생은 기본 10회분에 채권자 1명당 8회분을 더해 계산하고, 2026년 7월 1일부터 e-Post 적용 사건의 1회 송달료 기준금액은 5,640원입니다.",
    check:
      "채무 건수가 아니라 법원에 제출할 채권자 수를 먼저 확정해야 예상 송달료를 계산할 수 있습니다.",
  },
  {
    number: "04",
    label: "추가",
    title: "사건별 실비·예납금",
    body: "채무증명서 발급, 서류 발급·복사와 같은 준비 실비가 들 수 있습니다. 법원이 외부회생위원을 선임하는 사건이라면 그 보수를 위한 예납금이 별도로 생길 수 있으며, 금액과 납부 시점은 관할 법원과 사건의 명령을 확인해야 합니다.",
    check:
      "‘실비 별도’라는 한 줄만 보지 말고 예상 항목, 정산 방식과 추가 납부 전 안내 절차를 확인하세요.",
  },
];

const courtCostExamples = [1, 5, 10, 20].map((creditorCount) => {
  const serviceCount = 10 + creditorCount * 8;
  const serviceFee = serviceCount * serviceFeeUnit;

  return {
    creditorCount,
    serviceCount,
    serviceFee,
    electronicTotal: electronicStampFee + serviceFee,
  };
});

const quoteChecklist = [
  {
    title: "표시 금액에 부가가치세가 포함됐나요?",
    body: "광고의 첫 금액과 실제 계약 총액이 달라지는 대표적인 지점입니다.",
  },
  {
    title: "법원비용과 변호사 보수가 분리돼 있나요?",
    body: "인지대·송달료를 수임료에 포함한 것처럼 보이게 적지 않았는지 확인합니다.",
  },
  {
    title: "채무증명서 발급비용은 누가 부담하나요?",
    body: "발급 대행 여부와 기관별 실비가 별도인지 미리 구분합니다.",
  },
  {
    title: "보정명령 대응이 포함되나요?",
    body: "횟수 제한, 추가 보수 조건과 자료 준비의 역할을 확인합니다.",
  },
  {
    title: "개시·인가 뒤 업무는 어디까지인가요?",
    body: "채권자집회 안내, 변제현황 확인과 면책신청이 포함되는지 묻습니다.",
  },
  {
    title: "중도 해지·기각 시 정산 기준이 있나요?",
    body: "진행 단계별 보수와 이미 사용한 실비의 반환 기준을 계약서에서 확인합니다.",
  },
  {
    title: "분할 납부의 일정과 조건은 무엇인가요?",
    body: "분납 가능 여부뿐 아니라 접수 시점과 미납 시 처리 기준을 함께 봅니다.",
  },
  {
    title: "추가비용은 언제, 어떻게 동의받나요?",
    body: "사전 설명 없이 비용이 늘지 않도록 안내와 승인 방식을 확인합니다.",
  },
];

const estimateInputs = [
  {
    title: "채권자 수",
    body: "송달료와 사건 자료량에 직접 영향을 줍니다. 같은 금융회사라도 채권 양도 여부에 따라 목록을 다시 확인할 수 있습니다.",
  },
  {
    title: "소득의 형태",
    body: "급여소득인지, 사업·프리랜서 소득인지에 따라 정리할 장부와 소명자료의 범위가 달라집니다.",
  },
  {
    title: "재산과 최근 거래",
    body: "부동산·보증금·차량·보험·퇴직금과 최근 처분·이체 내역에 설명이 필요한지 확인합니다.",
  },
  {
    title: "채무 원인과 긴급절차",
    body: "최근 대출, 투자·도박성 지출, 세금·담보채무, 진행 중인 압류나 경매가 있는지 살펴봅니다.",
  },
];

const faqs = [
  {
    question: "개인회생 비용은 총 얼마인가요?",
    answer:
      "모든 사건에 공통인 하나의 총액은 없습니다. 법원에 내는 인지대·송달료, 사건에 따라 생기는 예납금·서류 실비, 위임 범위에 따른 변호사 보수를 나눠 합산해야 합니다. 특히 송달료는 채권자 수에 따라 달라지고, 변호사 보수는 사건의 자료량과 쟁점 및 업무 범위에 따라 달라질 수 있습니다.",
  },
  {
    question: "개인회생 변호사 비용과 법원비용은 같은 돈인가요?",
    answer:
      "다릅니다. 변호사 보수는 법률사무를 위임한 대가이고, 인지대·송달료·예납금은 절차를 위해 법원에 납부하는 비용입니다. 견적에서는 두 항목이 분리돼 있는지, 누가 언제 납부하는지 확인하는 것이 좋습니다.",
  },
  {
    question: "개인회생 송달료는 어떻게 계산하나요?",
    answer:
      "법원 안내의 계산 구조는 기본 10회분에 채권자 1명당 8회분을 더하는 방식입니다. 2026년 7월 1일부터 e-Post 적용 사건의 1회 기준금액은 5,640원이므로, 현재 예상 송달료는 5,640원 × (10 + 채권자 수 × 8)로 계산할 수 있습니다. 실제 납부액은 접수 당시 법원의 납부서를 기준으로 확인해야 합니다.",
  },
  {
    question: "전자소송으로 신청하면 인지대가 줄어드나요?",
    answer:
      "전자문서 제출에는 원래 인지액의 10분의 9가 적용됩니다. 개인회생 개시신청의 기본 인지액 3만 원을 기준으로 하면 2만 7천 원입니다. 다만 송달료와 그 밖의 실비까지 같은 비율로 줄어드는 것은 아닙니다.",
  },
  {
    question: "채권자가 많으면 변호사 비용도 늘어나나요?",
    answer:
      "송달료는 계산식에 따라 늘어납니다. 변호사 보수는 법률사무소의 보수 기준과 실제 업무 범위에 따라 달라지므로 자동으로 같은 비율만큼 늘어난다고 단정할 수는 없습니다. 채권자목록 정리와 양도채권 확인 등 추가 업무가 견적에 어떻게 반영되는지 물어보세요.",
  },
  {
    question: "외부회생위원 보수는 모든 사건에 필요한가요?",
    answer:
      "모든 개인회생 사건에 같은 금액이 자동 부과된다고 볼 수 없습니다. 법원이 외부회생위원을 선임하거나 예납을 명한 경우에 별도 비용이 생길 수 있으므로 관할 법원과 실제 명령을 확인해야 합니다.",
  },
  {
    question: "개인회생 비용을 분납할 수 있나요?",
    answer:
      "변호사 보수의 분할 납부 가능 여부와 일정은 각 위임계약에 따라 정해집니다. 법원비용도 납부해야 하는 시점이 있으므로 ‘분납 가능’ 문구만 보지 말고 첫 납부액, 접수 예정일, 잔금 일정과 미납 시 처리 기준을 함께 확인하세요.",
  },
  {
    question: "개인회생 비용과 매달 내는 변제금은 다른가요?",
    answer:
      "다릅니다. 이 페이지의 비용은 신청·대리·절차 진행에 드는 돈이고, 변제금은 인가된 변제계획에 따라 채권자에게 갚는 돈입니다. 월 변제금은 소득·생계비·재산의 청산가치와 변제기간 등을 바탕으로 별도로 심사합니다.",
  },
  {
    question: "비용이 부담되면 무료 지원을 받을 수 있나요?",
    answer:
      "소득과 사건 적정성 등 요건을 충족하면 대한법률구조공단의 개인회생·개인파산 무료법률구조를 검토할 수 있습니다. 법원 안내상 지원 대상으로 결정되면 변호사 보수와 인지대·송달료 지원이 가능하지만, 누구나 자동으로 지원받는 것은 아니므로 공단의 최신 기준과 심사를 확인해야 합니다.",
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
      name: "비용 안내",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "개인회생 비용 총정리, 법원비용·변호사비 구분",
  description:
    "개인회생 비용을 변호사 보수, 인지대, 송달료와 사건별 추가 실비로 나누고 현재 법원 기준과 계약 전 확인사항을 설명합니다.",
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

const formatWon = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

export default function PersonalRehabilitationCostsPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      <SiteHeader />

      <main id="main-content">
        <section className="cost-hero">
          <div className="cost-hero-orbit" aria-hidden="true" />
          <div className="shell">
            <nav className="breadcrumb" aria-label="현재 위치">
              <a href="/bank">회생·파산</a>
              <span aria-hidden="true">/</span>
              <a href="/bank/personal-rehabilitation">개인회생</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">비용</span>
            </nav>

            <div className="cost-hero-grid">
              <div className="cost-hero-copy">
                <p className="eyebrow">개인회생 비용 안내</p>
                <h1>
                  총액을 묻기 전에,
                  <br />
                  <span>무엇을 합친 비용인지 보세요.</span>
                </h1>
                <p className="cost-hero-lead">
                  개인회생 비용은 변호사 보수 하나가 아닙니다. 법원에 내는 인지대와
                  송달료, 사건에 따라 생기는 실비를 분리해야 광고 금액과 실제 계약
                  금액을 제대로 비교할 수 있습니다.
                </p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#court-costs">
                    법원비용 예시 보기
                    <ArrowIcon />
                  </a>
                  <a className="button button-secondary" href="#contract-check">
                    계약 전 확인하기
                  </a>
                </div>
                <p className="eligibility-date">
                  <span>기준일</span>
                  <time dateTime={reviewedDate}>2026년 7월 31일</time>
                  <span aria-hidden="true">·</span>
                  현행 법령·법원 공지 기준
                </p>
              </div>

              <aside className="cost-hero-ledger" aria-label="현재 개인회생 법원비용 핵심 숫자">
                <p>현재 확인되는 법원 기본값</p>
                <dl>
                  <div>
                    <dt>전자제출 인지액</dt>
                    <dd>
                      <strong>27,000원</strong>
                      <small>종이 신청 기본 인지액 30,000원</small>
                    </dd>
                  </div>
                  <div>
                    <dt>1회 송달료</dt>
                    <dd>
                      <strong>5,640원</strong>
                      <small>2026년 7월 1일 e-Post 적용 사건 기준</small>
                    </dd>
                  </div>
                  <div>
                    <dt>송달 횟수</dt>
                    <dd>
                      <strong>10 + 8 × N</strong>
                      <small>N은 법원에 제출하는 채권자 수</small>
                    </dd>
                  </div>
                </dl>
                <p className="cost-hero-ledger-note">
                  변호사 보수, 외부회생위원 예납금과 그 밖의 실비는 위 숫자에 포함되지
                  않습니다.
                </p>
              </aside>
            </div>
          </div>
        </section>

        <section className="cost-answer-band" aria-label="개인회생 비용의 구성">
          <div className="shell">
            <strong>한 줄로 정리하면</strong>
            <p>
              개인회생 총비용 = <b>변호사 보수</b> + <b>인지대·송달료</b> +{" "}
              <b>사건별 실비·예납금</b>입니다. 매달 채권자에게 내는 변제금은 신청비용과
              별도로 계산됩니다.
            </p>
          </div>
        </section>

        <section className="section cost-parts-section" id="cost-parts">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">비용의 네 가지 항목</p>
                <h2>
                  한 덩어리의 수임료처럼
                  <br />
                  비교하지 마세요
                </h2>
              </div>
              <p>
                같은 ‘개인회생 비용’이라는 표현 안에 납부처와 산정 방식이 다른 돈이
                섞여 있습니다. 먼저 네 항목으로 나누면 견적의 빠진 부분이 보입니다.
              </p>
            </div>

            <div className="cost-parts-list">
              {costParts.map((part) => (
                <article key={part.number}>
                  <div className="cost-part-index">
                    <span>{part.number}</span>
                    <small>{part.label}</small>
                  </div>
                  <div>
                    <h3>{part.title}</h3>
                    <p>{part.body}</p>
                    <div className="cost-part-check">
                      <CheckIcon />
                      <span>{part.check}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section cost-calculator-section" id="court-costs">
          <div className="shell">
            <div className="cost-calculator-heading">
              <div className="section-heading">
                <p className="eyebrow light-eyebrow">법원 기본비용 예시</p>
                <h2>
                  채권자 수를 알면
                  <br />
                  송달료를 먼저 계산할 수 있습니다
                </h2>
              </div>
              <div className="cost-formula">
                <span>2026. 7. 1. 이후 기준</span>
                <strong>5,640원 × (10 + 채권자 수 × 8)</strong>
                <p>
                  법원 송달료 안내의 횟수 계산식에 현재 e-Post 1회 기준금액을
                  적용했습니다.
                </p>
              </div>
            </div>

            <div className="cost-table-wrap">
              <table>
                <caption>
                  채권자 수에 따른 개인회생 송달료 및 전자제출 인지대 포함 기본비용 예시
                </caption>
                <thead>
                  <tr>
                    <th scope="col">채권자 수</th>
                    <th scope="col">계산 횟수</th>
                    <th scope="col">예상 송달료</th>
                    <th scope="col">전자 인지대 포함</th>
                  </tr>
                </thead>
                <tbody>
                  {courtCostExamples.map((example) => (
                    <tr key={example.creditorCount}>
                      <th scope="row" data-label="채권자 수">
                        {example.creditorCount}명
                      </th>
                      <td data-label="계산 횟수">{example.serviceCount}회분</td>
                      <td data-label="예상 송달료">{formatWon(example.serviceFee)}</td>
                      <td data-label="전자 인지대 포함">
                        <strong>{formatWon(example.electronicTotal)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cost-calculator-notes">
              <p>
                <span className="cost-note-icon" aria-hidden="true">
                  i
                </span>
                <span className="cost-note-copy">
                  위 표는 <strong>전자제출 인지대 27,000원과 예상 송달료만</strong> 더한
                  예시입니다. 변호사 보수, 외부회생위원 예납금, 서류 발급비용 등은
                  포함하지 않았습니다.
                </span>
              </p>
              <p>
                실제 납부액은 접수 시점의 기준, 채권자목록과 법원의 납부명령에 따라
                달라질 수 있습니다. 남은 송달료가 있으면 절차에 따라 환급될 수 있고
                부족하면 추가 납부가 필요할 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="section cost-separation-section">
          <div className="shell cost-separation-grid">
            <div className="section-heading">
              <p className="eyebrow">비용과 변제금 구분</p>
              <h2>
                신청할 때 드는 돈과
                <br />
                매달 갚는 돈은 다릅니다
              </h2>
              <p>
                검색 결과에서 두 금액이 섞이면 실제 자금계획을 세우기 어렵습니다.
                납부 목적과 상대방부터 구분하세요.
              </p>
            </div>

            <div className="cost-separation-cards">
              <article>
                <span>신청·진행 비용</span>
                <h3>이번 페이지에서 설명하는 비용</h3>
                <p>법률사무를 맡기고 법원 절차를 시작·진행하기 위해 드는 돈입니다.</p>
                <ul>
                  <li>변호사 보수</li>
                  <li>인지대·송달료</li>
                  <li>예납금·서류 실비</li>
                </ul>
              </article>
              <article>
                <span>변제계획 납부액</span>
                <h3>채권자에게 갚는 월 변제금</h3>
                <p>
                  소득·생계비·재산의 청산가치와 변제기간 등을 토대로 법원이 심사하는
                  별도 금액입니다.
                </p>
                <a href="/bank/personal-rehabilitation/repayment">
                  변제금 산정 기준 보기
                  <ArrowIcon />
                </a>
              </article>
            </div>
          </div>
        </section>

        <section className="section cost-contract-section" id="contract-check">
          <div className="shell">
            <div className="cost-contract-heading">
              <div className="section-heading">
                <p className="eyebrow light-eyebrow">견적·계약 확인표</p>
                <h2>
                  가장 싼 첫 숫자보다
                  <br />
                  포함 범위를 비교하세요
                </h2>
              </div>
              <p>
                계약 뒤 예상하지 못한 추가비용을 줄이려면 구두 설명이 아니라 견적서와
                위임계약서의 문구를 확인해야 합니다.
              </p>
            </div>

            <ol className="cost-contract-grid">
              {quoteChecklist.map((item, index) => (
                <li key={item.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section cost-estimate-section">
          <div className="shell cost-estimate-grid">
            <div className="section-heading">
              <p className="eyebrow">정확한 견적에 필요한 정보</p>
              <h2>
                네 가지를 알면
                <br />
                비용 범위를 더 분명히 볼 수 있습니다
              </h2>
              <p>
                처음 문의할 때 주민등록번호나 계좌번호를 보낼 필요는 없습니다. 아래
                항목은 대략적인 범위만 말씀해도 됩니다.
              </p>
            </div>

            <div className="cost-estimate-list">
              {estimateInputs.map((item, index) => (
                <article key={item.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section cost-support-section">
          <div className="shell cost-support-grid">
            <div>
              <p className="eyebrow">비용 지원도 확인하세요</p>
              <h2>
                비용이 어렵다면
                <br />
                공적 지원 대상인지 먼저 볼 수 있습니다
              </h2>
            </div>
            <div className="cost-support-content">
              <article>
                <span>대한법률구조공단</span>
                <h3>일정 요건을 충족하는 개인회생 무료법률구조</h3>
                <p>
                  서울회생법원 안내에 따르면 공단 상담 결과 개인회생 이용이 적정하고
                  소득 등 지원요건을 충족하는 경우 변호사 신청대리와 변호사 보수,
                  인지대·송달료 지원을 받을 수 있습니다.
                </p>
                <a
                  href="https://slb.scourt.go.kr/rel/guide/support/index_g.jsp"
                  target="_blank"
                  rel="noreferrer"
                >
                  법원 지원 안내 확인
                  <span aria-hidden="true">↗</span>
                </a>
              </article>
              <article>
                <span>소상공인 소송구조</span>
                <h3>2026년 2월부터 확대된 법원 지원 범위</h3>
                <p>
                  법원은 연 매출 3억 원 이하 소상공인을 개인도산절차 소송구조 대상에
                  포함했습니다. 실제 지원 여부는 자력 부족과 승소 가능성 등 소송구조
                  요건 및 법원의 결정을 확인해야 합니다.
                </p>
                <a
                  href="https://www.scourt.go.kr/portal/news/NewsViewAction.work?gubun=6&searchOption=&searchWord=&seqnum=2922"
                  target="_blank"
                  rel="noreferrer"
                >
                  대법원 보도자료 확인
                  <span aria-hidden="true">↗</span>
                </a>
              </article>
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="shell faq-grid">
            <div className="section-heading">
              <p className="eyebrow">개인회생 비용 FAQ</p>
              <h2>
                총액을 비교하기 전에
                <br />
                자주 묻는 질문
              </h2>
              <p>
                법원비용, 변호사 비용, 분납과 변제금에 관해 검색할 때 자주 생기는
                오해를 정리했습니다.
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
                법원 공지와 현행 법령을
                <br />
                기준으로 확인했습니다
              </h2>
            </div>
            <div className="evidence-content">
              <ul>
                <li>
                  <a
                    href="https://scourt.go.kr/nm/min_2/min_2_2/min_2_2_2/index.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>대한민국 법원</span>
                    개인회생 신청비용·송달료 계산 구조
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://bsgodung.scourt.go.kr/dcboard/new/DcNewsViewAction.work?gubun=41&seqnum=20455"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>대한민국 법원</span>
                    2026년 7월 1회 송달료 기준금액 인상
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/민사소송등인지법/제9조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    개인회생절차 개시신청 인지액
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/민사소송등인지법/제16조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    전자문서 제출 시 인지액 특례
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scourt.go.kr/portal/dcboard/DcNewsViewAction.work?cbub_code=000221&gubun=41&pageIndex=1&searchOption=&searchWord=&seqnum=2500"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>서울회생법원</span>
                    외부회생위원 민사예납금 안내
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
                    <time dateTime={reviewedDate}>2026년 7월 31일</time>
                  </dd>
                </div>
              </dl>
              <p>
                이 글은 일반적인 비용 구조를 설명하는 정보이며 개별 사건의 확정
                견적이나 결과를 보장하지 않습니다. 법원비용은 공지·법령 개정과 실제
                납부명령에 따라 달라질 수 있고, 변호사 보수는 위임 범위와 사건 내용에
                따라 정해집니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">비용에 영향을 주는 절차와 자료도 확인하세요</h2>
            </div>
            <div className="related-links">
              <a href="/bank/personal-rehabilitation/eligibility">
                <span>신청자격</span>
                비용 전에 개인회생을 검토할 조건부터 보기
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/process">
                <span>절차와 기간</span>
                신청부터 면책까지 어떤 업무가 이어질까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/documents">
                <span>필요서류</span>
                소득·재산·채권을 어떤 자료로 확인할까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/repayment">
                <span>변제금</span>
                매달 납부할 금액은 무엇으로 정할까
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              내 사건의 비용 범위를
              <br />
              항목별로 확인하고 싶다면.
            </>
          }
          body="대략적인 채권자 수, 소득 형태, 재산과 가장 급한 문제를 말씀해 주세요. 상담 초기에는 주민등록번호·계좌번호나 원본 서류를 보내지 않아도 됩니다."
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
