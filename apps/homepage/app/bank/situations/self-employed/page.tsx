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
const pagePath = "/bank/situations/self-employed";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "자영업자 개인회생, 매출과 소득은 어떻게 볼까",
  description:
    "자영업자 개인회생은 매출액만으로 판단하지 않습니다. 계속 가능한 영업소득, 필요한 영업비용, 사업재산과 준비자료를 공식 기준에 따라 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "자영업자 개인회생, 매출과 소득은 어떻게 볼까 | 법무법인 로앤",
    description:
      "매출에서 실제 영업비용을 뺀 소득과 사업을 계속할 수 있는지를 함께 확인하세요.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const reviewAxes = [
  {
    number: "01",
    label: "계속성",
    title: "앞으로도 이어질 영업소득",
    body: "개인회생의 영업소득자는 사업소득·부동산임대소득·농업소득 등과 비슷한 소득을 장래 계속적 또는 반복적으로 얻을 가능성이 있어야 합니다. 현재 사업을 유지할 수 있는지, 계절 변동과 최근 영업상태는 어떤지부터 확인합니다.",
    point: "사업기간, 최근 영업상태와 앞으로의 매출·비용 근거를 함께 정리합니다.",
  },
  {
    number: "02",
    label: "소득",
    title: "매출이 아닌 실제 순소득",
    body: "카드·현금·계좌이체·플랫폼 정산을 포함한 전체 매출에서 임차료, 재료·상품 매입, 직원 인건비처럼 영업의 경영·보존·계속에 필요한 비용을 확인합니다. 매출액이나 세무서 소득금액 하나만으로 월 소득을 확정하지 않습니다.",
    point: "월별 매출과 실제 지출을 같은 기간, 같은 사업장 기준으로 맞춥니다.",
  },
  {
    number: "03",
    label: "재산",
    title: "사업을 계속해도 남는 재산",
    body: "사업장 임차보증금, 권리금 반환 가능성, 시설·비품·차량, 재고, 외상매출금과 사업계좌 잔액은 재산 심사와 연결될 수 있습니다. 사업에 필요하다는 이유만으로 모두 재산에서 제외되지는 않습니다.",
    point: "소유자, 현재 가치, 담보와 반환 가능성을 자료로 구분합니다.",
  },
  {
    number: "04",
    label: "계획",
    title: "변제계획의 수행 가능성",
    body: "순소득에서 법정 공제와 법원이 정하는 생계비 등을 반영한 가용소득, 재산의 청산가치, 전체 채무와 변제기간을 함께 봅니다. 사업 전망이 불명확하거나 적자가 반복된다면 예정한 변제를 계속 수행할 수 있는지 구체적인 설명이 필요합니다.",
    point: "좋은 달 하나보다 변제기간 동안 유지할 수 있는 금액인지 확인합니다.",
  },
];

const incomeChecks = [
  {
    title: "전체 매출",
    body: "세금신고 매출뿐 아니라 카드·현금영수증, 계좌이체, 배달·예약·오픈마켓·PG 정산 등 실제 영업으로 들어온 금액을 월별로 맞춥니다.",
  },
  {
    title: "필요한 영업비용",
    body: "사업장 임차료, 재료·상품 매입, 직원 인건비, 전기·가스 등 실제 지출과 영업에 필요한지를 확인합니다. 개인 생활비와 사업비는 나눠야 합니다.",
  },
  {
    title: "세무자료와 실제 흐름",
    body: "부가가치세 신고, 소득금액증명, 손익계산서만 보지 않고 사업계좌와 매입·매출 자료를 대조합니다. 신고자료와 실제 흐름이 다르면 차이를 설명합니다.",
  },
  {
    title: "계절·비정기 변동",
    body: "성수기·비수기, 휴업, 공사나 날씨 영향이 있다면 충분한 기간의 월별 흐름을 봅니다. 일시적인 최고·최저 매출을 장래 평균으로 바로 적용하지 않습니다.",
  },
  {
    title: "가용소득",
    body: "확인된 영업소득에서 세금·사회보험료 등 법정 공제, 법원이 정하는 생계비와 필요한 영업비용을 반영합니다. 개인회생 변제금은 이 계산만이 아니라 청산가치와 수행 가능성도 함께 심사합니다.",
  },
];

const evidenceGroups = [
  {
    title: "사업 상태와 신고자료",
    body: "사업자등록증, 휴·폐업사실증명, 부가가치세과세표준증명 또는 면세사업자 자료, 종합소득세 신고서와 소득금액증명 등 업종·과세유형에 맞는 자료를 확인합니다.",
  },
  {
    title: "월별 매출자료",
    body: "카드매출, 현금영수증, 세금계산서, 배달·예약·오픈마켓·PG 정산내역과 현금·계좌이체 매출을 월별로 정리합니다. 여러 사업장이면 각각 나눕니다.",
  },
  {
    title: "사업계좌와 금융흐름",
    body: "사업용·개인용으로 함께 쓴 계좌를 포함해 매출 입금과 비용 지출이 보이는 거래내역을 준비합니다. 가족 계좌를 이용했다면 소유관계와 사용 경위를 구분합니다.",
  },
  {
    title: "영업비용 증빙",
    body: "임대차계약서, 임차료·관리비·공과금, 매입 세금계산서, 직원 급여와 사회보험 자료, 운송·플랫폼 수수료 등 실제 지출을 확인할 자료를 모읍니다.",
  },
  {
    title: "사업재산과 계약",
    body: "임차보증금, 시설·비품·기계·차량, 재고, 외상매출금, 프랜차이즈 보증금·권리금 관련 계약과 현재 가치를 확인합니다. 담보나 미납금이 있다면 함께 표시합니다.",
  },
  {
    title: "채무·세금과 최근 변동",
    body: "사업대출, 카드·보증채무, 거래처 미지급금, 국세·지방세와 사회보험료 체납을 빠짐없이 적습니다. 최근 대출, 큰 송금, 재고·설비 처분과 폐업 준비가 있다면 사용처도 정리합니다.",
  },
];

const situationSteps = [
  {
    title: "사업을 계속하는 경우",
    body: "현재 계약, 단골·거래처, 정산주기와 고정비를 바탕으로 앞으로의 매출과 비용이 반복될 수 있는지 설명합니다. 사업 유지에 필요한 자산과 처분 가능한 자산도 구분합니다.",
  },
  {
    title: "개업한 지 얼마 안 된 경우",
    body: "과거 자료가 짧다면 개업자금, 실제 주문·계약, 플랫폼 정산, 최근 월별 실적과 향후 비용을 확인합니다. 예상 매출만으로 소득을 확정하지 않습니다.",
  },
  {
    title: "폐업을 준비하거나 마친 경우",
    body: "영업소득이 더 이어지지 않는다면 재취업·전업 등 새 소득의 근거를 살펴야 합니다. 보증금, 권리금, 재고·설비 처분대금과 미수금의 잔존 여부도 확인합니다.",
  },
  {
    title: "가족과 함께 운영하는 경우",
    body: "사업자 명의만 보지 않고 누가 실제 영업을 하고 매출과 비용을 부담했는지 확인합니다. 배우자·가족의 노동과 소득, 공동자금의 소유관계를 사실대로 구분합니다.",
  },
];

const cautionPoints = [
  {
    title: "매출을 줄여 쓰지 않기",
    body: "현금매출이나 다른 계좌의 매출을 빼면 세무자료·카드자료·계좌 흐름과 맞지 않을 수 있습니다. 누락분이 있다면 숨기지 말고 금액과 발생 경위를 구분해 정리합니다.",
  },
  {
    title: "비용을 임의로 만들지 않기",
    body: "세법상 경비로 신고했다는 이유만으로 개인회생에서 모두 같은 방식으로 공제되는 것은 아닙니다. 실제 지출 여부와 영업 유지에 필요한 비용인지 자료로 설명합니다.",
  },
  {
    title: "사업재산을 옮기지 않기",
    body: "신청을 앞두고 재고·장비·차량이나 매출대금을 가족·지인에게 이전하면 재산 은닉이나 허위 진술 등 중대한 쟁점이 될 수 있습니다. 처분이 필요하다면 과정과 대금을 기록합니다.",
  },
  {
    title: "고정 산식으로 단정하지 않기",
    body: "업종별 경비율, 매출의 일정 비율이나 한두 달의 실적만으로 순소득과 변제금을 확정할 수 없습니다. 관할 법원, 업종과 증빙, 사업 전망에 따라 보정과 심사가 달라질 수 있습니다.",
  },
];

const faqs = [
  {
    question: "자영업자도 개인회생을 신청할 수 있나요?",
    answer:
      "가능합니다. 법은 장래 사업소득 등을 계속적 또는 반복적으로 얻을 가능성이 있는 사람을 영업소득자로 정하고 있습니다. 다만 지급불능 또는 그 염려, 담보 15억원·무담보 10억원 이하의 채무 한도, 가용소득과 변제계획 수행 가능성 등 일반 요건도 함께 충족해야 합니다.",
  },
  {
    question: "월 매출이 높으면 변제금도 그대로 높아지나요?",
    answer:
      "매출액이 곧 개인회생의 월 소득이나 변제금은 아닙니다. 실제 매출에서 영업의 경영·보존·계속에 필요한 비용을 확인해 순소득을 살피고, 법정 공제·생계비·청산가치·변제기간과 수행 가능성을 함께 심사합니다.",
  },
  {
    question: "세무서의 소득금액증명만 제출하면 되나요?",
    answer:
      "소득금액증명은 중요한 자료지만 그것만으로 실제 영업소득이 모두 확인된다고 단정하기 어렵습니다. 부가가치세 신고, 매입·매출자료, 카드·플랫폼 정산, 사업계좌와 실제 비용을 함께 대조할 수 있고 관할 법원이 추가 자료를 요구할 수 있습니다.",
  },
  {
    question: "현금매출이나 배달앱 매출도 포함해야 하나요?",
    answer:
      "실제 영업으로 얻은 매출이라면 결제수단이나 정산채널과 관계없이 전체 흐름을 확인해야 합니다. 카드·현금영수증·계좌이체·배달앱·PG 정산을 월별로 맞추고 누락이나 정산 시점 차이가 있다면 설명합니다.",
  },
  {
    question: "적자인데도 개인회생을 진행할 수 있나요?",
    answer:
      "일시적인 적자만으로 결론이 정해지지는 않지만, 생계비 등을 반영한 뒤 채권자에게 제공할 가용소득과 변제계획의 수행 가능성이 필요합니다. 적자가 반복되고 사업 전망이 불명확하다면 사업 유지, 비용 조정, 전업·재취업 후 소득 등 실제 계획을 더 구체적으로 확인해야 합니다.",
  },
  {
    question: "사업을 폐업하면 개인회생을 못 하나요?",
    answer:
      "폐업 자체만으로 개인회생이 불가능해지는 것은 아닙니다. 다만 폐업한 사업의 영업소득은 계속될 소득으로 보기 어려우므로 재취업·전업 등 앞으로 반복될 소득의 근거가 필요합니다. 보증금·재고·시설 처분대금과 미수금도 재산자료에서 함께 확인합니다.",
  },
  {
    question: "사업장 보증금과 장비도 모두 처분해야 하나요?",
    answer:
      "사업재산이 있다는 이유만으로 곧바로 전부 처분해야 한다고 단정할 수 없습니다. 다만 보증금 반환 가능액, 시설·장비·차량·재고의 현재 가치 등은 재산 및 청산가치 심사와 연결될 수 있으므로 사업 유지 필요성과 소유·담보관계를 함께 확인해야 합니다.",
  },
  {
    question: "최근 1년 자료만 준비하면 충분한가요?",
    answer:
      "서울회생법원 직무편람은 원칙적으로 최근 1년의 영업소득을 기초로 산정하는 실무를 설명하지만, 이를 모든 법원과 모든 사건의 고정 제출기간으로 볼 수는 없습니다. 계절 변동, 휴업·신규 개업, 신고자료의 차이 등에 따라 더 긴 기간이나 추가 자료를 요구할 수 있습니다.",
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
      name: "채무 상황별 안내",
      item: `${siteUrl}/bank/situations`,
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "자영업자 개인회생",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "자영업자 개인회생, 매출과 소득은 어떻게 볼까",
  description:
    "자영업자의 계속 가능한 영업소득, 필요한 영업비용, 사업재산과 개인회생 준비자료를 공식 자료를 바탕으로 설명합니다.",
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

export default function SelfEmployedPage() {
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
              <a href="/bank/situations">채무 상황별 안내</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">자영업자 개인회생</span>
            </nav>

            <div className="eligibility-hero-grid">
              <div className="eligibility-hero-copy">
                <p className="eyebrow">자영업자 개인회생</p>
                <h1>
                  매출보다,
                  <br />
                  <span>실제로 남는 소득을 봅니다.</span>
                </h1>
                <p className="eligibility-lead">
                  자영업자도 앞으로 계속적·반복적으로 영업소득을 얻을 가능성이 있다면
                  개인회생을 검토할 수 있습니다. 전체 매출에서 실제로 필요한 영업비용을
                  구분하고, 사업재산과 변제계획의 수행 가능성을 함께 확인해야 합니다.
                </p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#review-axes">
                    먼저 확인할 기준
                    <ArrowIcon />
                  </a>
                  <a className="button button-secondary" href="#evidence">
                    준비자료 보기
                  </a>
                </div>
                <p className="eligibility-date">
                  <span>기준일</span>
                  <time dateTime={reviewedDate}>2026년 7월 26일</time>
                  <span aria-hidden="true">·</span>
                  현행 법령·서울회생법원 공개자료 기준
                </p>
              </div>

              <aside className="eligibility-summary" aria-label="자영업자 개인회생 핵심 요약">
                <p>네 가지를 함께 확인하세요</p>
                <ol>
                  <li>
                    <a href="#review-axes">
                      <span>01</span>
                      <strong>소득의 계속성</strong>
                      <small>사업을 이어갈 수 있는지</small>
                    </a>
                  </li>
                  <li>
                    <a href="#income">
                      <span>02</span>
                      <strong>매출과 영업비용</strong>
                      <small>월별 실제 순소득</small>
                    </a>
                  </li>
                  <li>
                    <a href="#evidence">
                      <span>03</span>
                      <strong>사업재산</strong>
                      <small>보증금·재고·시설·미수금</small>
                    </a>
                  </li>
                  <li>
                    <a href="#situations">
                      <span>04</span>
                      <strong>사업의 다음 상태</strong>
                      <small>유지·신규·폐업·공동운영</small>
                    </a>
                  </li>
                </ol>
              </aside>
            </div>
          </div>
        </section>

        <section className="eligibility-answer-band" aria-label="먼저 알아둘 점">
          <div className="shell">
            <strong>먼저 알아둘 점</strong>
            <p>
              매출액이 곧 개인회생 소득이나 변제금은 아닙니다. 실제 매출과 필요한
              영업비용을 자료로 확인해 순소득을 살피고, 생계비·재산·전체 채무와
              변제기간 동안의 수행 가능성을 함께 판단합니다.
            </p>
          </div>
        </section>

        <section className="section eligibility-requirements" id="review-axes">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">판단의 출발점</p>
                <h2>
                  사업자등록증 하나보다
                  <br />
                  네 축을 함께 봅니다
                </h2>
              </div>
              <p>
                개인회생 자격은 자영업자라는 직업명으로 정해지지 않습니다. 앞으로의
                영업소득, 실제 순소득, 사업재산과 변제계획을 연결해 확인합니다.
              </p>
            </div>

            <div className="qualification-list">
              {reviewAxes.map((axis) => (
                <article key={axis.number}>
                  <div className="qualification-index">
                    <span>{axis.number}</span>
                    <small>{axis.label}</small>
                  </div>
                  <div className="qualification-copy">
                    <h3>{axis.title}</h3>
                    <p>{axis.body}</p>
                    <div>
                      <CheckIcon />
                      {axis.point}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section income-section" id="income">
          <div className="shell income-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">소득 확인 구조</p>
              <h2>
                전체 매출에서
                <br />
                실제 비용을 구분합니다
              </h2>
              <p>
                법은 영업의 경영·보존·계속을 위해 필요한 비용을 가용소득에서 공제하도록
                정합니다. 어떤 비용이 필요한지는 업종과 실제 자료에 따라 확인합니다.
              </p>
            </div>

            <div className="income-points">
              {incomeChecks.map((check) => (
                <article key={check.title}>
                  <span>확인 기준</span>
                  <h3>{check.title}</h3>
                  <p>{check.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section eligibility-requirements" id="evidence">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">준비자료</p>
                <h2>
                  신고자료와 실제 계좌 흐름이
                  <br />
                  서로 맞아야 합니다
                </h2>
              </div>
              <p>
                업종과 과세유형, 사업기간과 관할 법원에 따라 요구자료는 달라질 수
                있습니다. 먼저 자료의 기간과 사업장을 맞추는 것이 중요합니다.
              </p>
            </div>

            <div className="qualification-list">
              {evidenceGroups.map((group, index) => (
                <article key={group.title}>
                  <div className="qualification-index">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <small>자료</small>
                  </div>
                  <div className="qualification-copy">
                    <h3>{group.title}</h3>
                    <p>{group.body}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="privacy-note">
              <span aria-hidden="true">i</span>
              <p>
                상담 초기에는 주민등록번호·계좌번호가 모두 보이는 원본이나 직원·고객의
                개인정보가 담긴 명부를 보내지 마세요. 필요한 자료의 범위와 안전한
                제출방법을 안내받은 뒤, 사건 확인에 필요하지 않은 개인정보는 가려서
                전달하세요.
              </p>
            </div>
          </div>
        </section>

        <section className="section self-check-section" id="situations">
          <div className="shell">
            <div className="self-check-heading">
              <div className="section-heading">
                <p className="eyebrow">사업 상태별 확인</p>
                <h2>
                  지금 사업을 어떻게 할지도
                  <br />
                  소득 판단과 연결됩니다
                </h2>
              </div>
              <p>
                유지·개업·폐업·공동운영은 필요한 소득자료와 사업재산 설명이 서로
                다릅니다.
              </p>
            </div>

            <ol className="self-check-grid">
              {situationSteps.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section income-section" id="cautions">
          <div className="shell income-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">신청 전 주의</p>
              <h2>
                매출·비용·재산을
                <br />
                임의로 맞추지 마세요
              </h2>
              <p>
                소득자료는 세무신고, 카드·플랫폼 정산과 계좌 거래가 서로 연결됩니다.
                확인되지 않는 부분은 추정치로 확정하지 않고 차이를 설명합니다.
              </p>
            </div>

            <div className="income-points">
              {cautionPoints.map((point) => (
                <article key={point.title}>
                  <span>주의사항</span>
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="shell faq-grid">
            <div className="section-heading">
              <p className="eyebrow">자주 묻는 질문</p>
              <h2>
                매출액 하나로
                <br />
                결론 내리지 않습니다
              </h2>
              <p>
                사업의 지속 가능성, 실제 순소득과 재산을 함께 확인해야 할 질문을
                모았습니다.
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
                법률과 법원의
                <br />
                공개 기준을 확인했습니다
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
                    채무자회생법 제579조 영업소득자와 가용소득
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제589조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채무자회생법 제589조 신청서와 첨부서류
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
                    채무자회생법 제614조 변제계획 인가요건
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scourt.go.kr/nm/min_2/min_2_2/min_2_2_1/index.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>대한민국 법원</span>
                    개인회생 개요·영업소득자 신청자격과 첨부자료
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://slb.scourt.go.kr/rel/information/qna/member_manual.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>서울회생법원</span>
                    회생위원 직무편람 제5판 영업소득 조사·산정 실무
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
                이 글은 일반적인 제도 안내이며 개인회생 개시·인가나 특정 변제금을
                보장하지 않습니다. 관할 법원, 업종·사업기간, 실제 매출·비용, 재산과
                제출자료에 따라 소득 산정과 보정 내용이 달라질 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">자격·변제금과 준비자료도 이어서 확인하세요</h2>
            </div>
            <div className="related-links">
              <a href="/bank/personal-rehabilitation/eligibility">
                <span>개인회생 신청자격</span>
                소득·채무·지급불능 상태는 어떻게 볼까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/repayment">
                <span>개인회생 변제금</span>
                가용소득과 청산가치는 어떻게 반영될까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/documents">
                <span>개인회생 필요서류</span>
                공통서류와 상황별 자료는 무엇일까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/process">
                <span>개인회생 절차·기간</span>
                신청 뒤에는 어떤 순서로 진행될까
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              매출이 아니라
              <br />
              실제 사업 흐름부터 확인하세요.
            </>
          }
          body="업종과 사업기간, 최근 월별 매출·영업비용, 사업을 계속할 계획과 주요 사업재산부터 말씀해 주세요. 상담 초기에는 계좌 원본이나 직원·고객의 개인정보를 보내지 않아도 됩니다."
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
