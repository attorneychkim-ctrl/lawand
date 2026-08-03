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
const pagePath = "/bank/personal-bankruptcy/process";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "개인파산 절차와 기간, 파산선고부터 면책까지",
  description:
    "개인파산·면책 신청, 법원 심사와 보정, 파산선고, 파산관재인 조사, 환가·배당 또는 폐지, 면책결정과 확정까지의 절차와 기간 변수를 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인파산 절차와 기간, 파산선고부터 면책까지 | 법무법인 로앤",
    description:
      "파산선고가 곧 면책은 아닙니다. 신청부터 관재인 조사, 재산 정리와 면책결정까지 각 단계에서 확인할 일을 안내합니다.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const processSteps = [
  {
    number: "01",
    id: "application",
    phase: "신청 준비",
    title: "채무·재산·소득과 채무 발생 경위를 빠짐없이 정리합니다",
    body: "채권자목록, 재산목록, 수입·지출과 현재 생활상황, 진술서와 증빙을 준비합니다. 금융기관뿐 아니라 개인채권자·보증·세금과 소송 중인 채무, 최근 재산 처분과 일부 채권자에게 한 변제도 확인합니다.",
    timing: "채권자 수와 재산·거래 내역의 범위에 따라 준비기간이 달라집니다.",
    point: "개인이 파산을 신청하면 반대 의사표시가 없는 한 그 신청과 동시에 면책도 신청한 것으로 봅니다.",
  },
  {
    number: "02",
    id: "review",
    phase: "접수·심사",
    title: "법원이 신청서와 지급불능 여부를 심사하고 보정을 요청합니다",
    body: "법원은 현재 재산·신용·소득으로 채무를 계속 변제할 수 없는지, 신청이 적법한지와 자료의 누락·불일치를 확인합니다. 설명이 부족하면 보정명령 등에 따라 자료를 보완하고, 사건에 따라 파산관재인 선임 비용의 예납을 명할 수 있습니다.",
    timing: "보정 횟수, 예납 시기와 추가 자료 제출 속도가 파산선고까지의 기간에 영향을 줍니다.",
    point: "신청서를 접수했다는 사실만으로 모든 독촉·압류·소송이 자동으로 멈추는 것은 아닙니다.",
  },
  {
    number: "03",
    id: "declaration",
    phase: "파산선고",
    title: "법원이 파산을 선고하고 파산관재인을 선임합니다",
    body: "법원이 지급불능 등 파산원인을 인정하면 파산을 선고합니다. 파산선고와 함께 파산관재인을 선임하고 채권신고기간, 채권자집회와 채권조사 기일 등 필요한 일정을 정합니다.",
    timing: "법률은 제1회 채권자집회 기일을 원칙적으로 파산선고일부터 4개월 이내로 정하도록 하지만, 실제 진행은 결정문과 기일통지를 확인해야 합니다.",
    point: "파산선고는 재산 정리 절차를 시작하는 결정이며 남은 채무의 책임을 면하는 면책결정이 아닙니다.",
  },
  {
    number: "04",
    id: "investigation",
    phase: "관재인 조사",
    title: "파산관재인이 재산·채무와 면책 관련 사실을 조사합니다",
    body: "파산관재인은 파산재단에 속하는 재산을 관리·조사하고 채권자 의견을 확인합니다. 채무자는 계좌·보험·부동산·차량·보증금과 최근 거래, 채무 사용처 등에 관한 자료를 제출하고 질문과 출석 요구에 성실히 응해야 합니다.",
    timing: "재산 누락 의심, 가족 간 거래, 최근 처분이나 채무 발생 경위의 추가 설명이 필요하면 조사가 길어질 수 있습니다.",
    point: "불리해 보이는 사실도 임의로 빼지 말고 발생 시기와 자금 흐름을 자료로 설명해야 합니다.",
  },
  {
    number: "05",
    id: "estate",
    phase: "재산 정리",
    title: "환가할 재산 유무에 따라 파산절차의 경로가 갈립니다",
    body: "환가할 재산이 있으면 파산관재인이 법에서 정한 절차에 따라 이를 환가하고 채권자에게 배당한 뒤 파산절차를 종결합니다. 절차비용을 충당할 재산이 부족한 경우 등에는 법원이 파산절차를 폐지할 수 있습니다.",
    timing: "부동산·보증금·보험·소송 중인 권리처럼 가치평가나 처분에 시간이 필요한 재산이 있으면 기간이 늘어날 수 있습니다.",
    point: "파산절차가 폐지되거나 종결되었다고 면책까지 자동으로 허가된 것은 아닙니다.",
  },
  {
    number: "06",
    id: "discharge-review",
    phase: "면책 심사",
    title: "법원이 면책불허가 사유와 채권자 의견을 별도로 심사합니다",
    body: "법원은 파산관재인의 조사 결과, 채무자의 설명과 채권자 의견을 바탕으로 재산 은닉·허위 서류·의무 위반·과도한 낭비나 도박 등 법에서 정한 면책불허가 사유가 있는지 확인합니다. 필요한 경우 심문이나 의견청취기일이 진행됩니다.",
    timing: "이의 제기, 추가 조사와 재량면책을 검토할 사정이 있으면 결정까지 더 시간이 필요할 수 있습니다.",
    point: "지정된 기일에 출석하지 않거나 관재인의 연락·자료 요구에 응하지 않으면 사건 진행과 면책 판단에 영향을 줄 수 있습니다.",
  },
  {
    number: "07",
    id: "discharge",
    phase: "면책결정·확정",
    title: "면책결정이 확정되었는지 마지막으로 확인합니다",
    body: "면책허가결정이 확정되면 파산절차에서 배당되지 않은 파산채권에 대한 책임이 원칙적으로 면제됩니다. 다만 조세·벌금·일부 손해배상·양육비 등 법에서 정한 비면책채권에는 효력이 미치지 않습니다.",
    timing: "면책결정은 내려진 때가 아니라 확정된 뒤 효력이 생기므로 결정문과 확정 여부를 구분해 확인합니다.",
    point: "파산선고일, 파산절차 폐지·종결일과 면책결정 확정일은 서로 다른 날짜일 수 있습니다.",
  },
];

const delayFactors = [
  {
    title: "보정과 예납",
    body: "신청서 누락, 채권자 주소나 금액의 불일치, 예납금 납부 지연은 파산선고 전 심사기간을 늘릴 수 있습니다.",
  },
  {
    title: "최근 거래와 재산 조사",
    body: "가족 간 송금, 부동산·차량 처분, 보험 해지나 특정 채권자에 대한 변제가 있으면 자금 흐름을 추가로 확인할 수 있습니다.",
  },
  {
    title: "환가할 재산과 권리관계",
    body: "부동산, 보증금, 상속재산이나 소송 중인 권리처럼 평가·회수·배당에 시간이 필요한 재산이 있으면 절차가 길어질 수 있습니다.",
  },
  {
    title: "채권자 이의와 면책 쟁점",
    body: "채권자의 이의, 채권 누락이나 면책불허가 사유에 관한 다툼이 있으면 추가 조사와 심리가 이어질 수 있습니다.",
  },
];

const decisionPoints = [
  {
    label: "파산선고",
    title: "재산 정리 절차를 시작하는 결정",
    body: "지급불능 등 파산원인을 인정하고 파산관재인을 통해 파산재단에 속하는 재산과 채권을 조사·정리합니다.",
  },
  {
    label: "파산절차 종결·폐지",
    title: "재산 정리 절차를 마치는 결정",
    body: "환가·배당을 마치면 종결하고, 절차를 계속할 재산이 부족한 경우 등에는 폐지할 수 있습니다. 그 자체가 면책은 아닙니다.",
  },
  {
    label: "면책허가결정",
    title: "남은 채무의 책임을 판단하는 결정",
    body: "면책불허가 사유와 사건의 경위를 별도로 심사해 내립니다. 확정되어야 효력이 생기며 비면책채권에는 미치지 않습니다.",
  },
];

const deadlineChecklist = [
  {
    title: "보정명령과 예납명령",
    body: "법원 문서의 제출기한·납부기한과 요구한 자료의 기준기간을 먼저 확인합니다.",
  },
  {
    title: "파산관재인의 연락",
    body: "면담·자료 제출·추가 설명 요청을 받은 날짜와 답변기한을 기록하고 연락처 변경도 알립니다.",
  },
  {
    title: "채권자집회·의견청취기일",
    body: "출석이 필요한 기일과 장소를 결정문·통지서에서 확인하고 참석이 어렵다면 미리 대응 방법을 확인합니다.",
  },
  {
    title: "새로 발견한 채권과 재산",
    body: "목록에서 빠진 사실을 알게 되면 미루지 말고 현재 사건 단계와 보완 방법을 확인합니다.",
  },
];

const faqs = [
  {
    question: "파산신청과 면책신청은 따로 해야 하나요?",
    answer:
      "법률은 개인인 채무자가 파산을 신청한 경우 반대 의사를 표시하지 않는 한 그 신청과 동시에 면책도 신청한 것으로 봅니다. 실제 접수에서는 법원의 최신 파산·면책 신청 양식과 사건번호, 제출한 채권자목록을 확인해야 합니다.",
  },
  {
    question: "개인파산을 신청하면 독촉과 압류가 바로 멈추나요?",
    answer:
      "신청서 접수만으로 모든 독촉·소송·압류가 일률적으로 자동 중지된다고 볼 수 없습니다. 파산선고 전후의 효력은 채권과 집행의 종류, 대상 재산과 법원의 결정에 따라 달라질 수 있으므로 이미 받은 지급명령·압류·경매 문서의 대응기한을 별도로 확인해야 합니다.",
  },
  {
    question: "신청부터 면책까지 몇 개월이 걸리나요?",
    answer:
      "모든 사건에 적용되는 고정 기간은 없습니다. 보정과 예납, 관재인 조사, 재산 환가·배당, 채권자 이의와 면책 쟁점에 따라 달라집니다. 평균 기간만 믿기보다 현재 받은 문서의 기한과 다음 기일을 기준으로 진행상태를 확인해야 합니다.",
  },
  {
    question: "파산관재인은 모든 개인파산사건에 선임되나요?",
    answer:
      "법률은 원칙적으로 파산선고와 동시에 파산관재인을 선임하도록 정하고 있으며 서울회생법원도 대부분의 개인파산사건에서 관재인이 선임된다고 안내합니다. 다만 실제 절차 운영과 필요한 예납금·조사 범위는 법원과 사건 사정에 따라 확인해야 합니다.",
  },
  {
    question: "파산선고를 받으면 모든 재산을 잃나요?",
    answer:
      "모든 재산이 일률적으로 처분되는 것은 아닙니다. 파산재단에 속하는 재산은 관재인이 관리·환가할 수 있지만 압류할 수 없는 재산, 면제재산 등은 법에서 정한 범위와 법원의 판단에 따라 구분됩니다. 재산의 명칭만으로 제외된다고 단정하지 말고 취득시기와 권리관계를 확인해야 합니다.",
  },
  {
    question: "환가할 재산이 없어 파산절차가 폐지되면 바로 면책되나요?",
    answer:
      "아닙니다. 파산절차의 폐지·종결과 면책 여부는 별개의 판단입니다. 재산 정리 절차가 끝난 뒤에도 법원은 면책불허가 사유, 채무자의 의무 이행과 채권자 의견 등을 심사해 면책허가 여부를 결정합니다.",
  },
  {
    question: "면책결정문을 받으면 바로 효력이 생기나요?",
    answer:
      "법률상 면책결정은 확정된 뒤 효력이 생깁니다. 결정일과 확정일을 구분해 사건검색이나 확정증명 등을 통해 확인하고, 조세·벌금·일부 손해배상·양육비 등 비면책채권이 있는지도 별도로 살펴야 합니다.",
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
      name: "개인파산·면책",
      item: `${siteUrl}/bank/personal-bankruptcy`,
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
  headline: "개인파산 절차와 기간, 파산선고부터 면책까지",
  description:
    "개인파산·면책 신청, 법원 심사, 파산선고, 관재인 조사, 재산 환가·배당 또는 폐지와 면책결정까지 각 단계와 기간 변수를 설명합니다.",
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

export default function PersonalBankruptcyProcessPage() {
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
              <a href="/bank/personal-bankruptcy">개인파산·면책</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">절차·기간</span>
            </nav>

            <div className="process-hero-grid">
              <div className="process-hero-copy">
                <p className="eyebrow">개인파산 절차와 기간</p>
                <h1>
                  파산선고는 끝이 아니라
                  <br />
                  <span>
                    면책심사의
                    <br className="process-mobile-break" />
                    {" "}시작입니다.
                  </span>
                </h1>
                <p className="process-lead">
                  개인파산은 신청서를 내고 바로 채무 책임이 없어지는 절차가 아닙니다.
                  법원 심사와 파산선고, 파산관재인의 재산·채무 조사, 환가·배당 또는
                  폐지를 거쳐 별도로 면책결정이 확정되어야 합니다.
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

              <aside className="process-summary" aria-label="개인파산·면책 절차 핵심 요약">
                <p>전체 흐름 한눈에 보기</p>
                <ol>
                  <li>
                    <span>01</span>
                    <div>
                      <strong>파산·면책 신청</strong>
                      <small>목록·진술서와 증빙 제출</small>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <strong>심사·파산선고</strong>
                      <small>보정 뒤 관재인 선임</small>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <strong>조사·재산 정리</strong>
                      <small>환가·배당 또는 절차 폐지</small>
                    </div>
                  </li>
                  <li>
                    <span>04</span>
                    <div>
                      <strong>면책심사·확정</strong>
                      <small>별도의 면책허가 판단</small>
                    </div>
                  </li>
                </ol>
                <a href="#decisions">
                  선고·종결·면책 차이 보기
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
              개인파산·면책 전체에 모든 사건이 똑같이 적용받는 고정 완료기간은
              없습니다. 보정과 예납, 관재인 조사, 재산 환가·배당, 채권자 이의와 면책
              쟁점에 따라 달라지므로 법원에서 받은 최신 문서의 기한과 기일을 기준으로
              확인해야 합니다.
            </p>
          </div>
        </section>

        <section className="section process-timeline-section" id="timeline">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">신청부터 면책까지</p>
                <h2>
                  개인파산·면책은
                  <br />
                  일곱 단계를 거칩니다
                </h2>
              </div>
              <p>
                파산절차와 면책절차가 함께 진행되더라도 각 단계의 목적과 결정의 효력은
                다릅니다.
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
                끝나는 시점은 다릅니다
              </h2>
              <p>
                제출 속도뿐 아니라 조사할 재산과 거래, 환가 여부와 면책 쟁점이 전체
                기간을 바꿉니다.
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
                  선고·종결·면책은
                  <br />
                  같은 결정이 아닙니다
                </h2>
              </div>
              <p>
                법원 문서에서 어떤 결정이 내려졌는지에 따라 현재 단계와 남은 절차가
                달라집니다.
              </p>
            </div>

            <div className="process-decision-grid">
              {decisionPoints.map((point, index) => (
                <article key={point.label}>
                  <div className="process-decision-number">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
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
                  결정 이름과 함께
                  <br />
                  답변기한도 확인하세요
                </h2>
              </div>
              <p>
                보정·예납·관재인 자료 제출과 기일은 사건마다 다릅니다. 전화로 들은
                날짜보다 법원·관재인이 보낸 최신 문서를 기준으로 관리하세요.
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
                법원 기일에 정당한 사유 없이 출석하지 않거나 파산관재인의 연락과
                자료 요구에 응하지 않으면 파산·면책 사건 진행에 영향을 줄 수 있습니다.
                연락처나 주소가 바뀌었다면 송달을 놓치지 않도록 바로 확인하세요.
              </p>
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="shell faq-grid">
            <div className="section-heading">
              <p className="eyebrow">자주 묻는 질문</p>
              <h2>
                파산선고 뒤에도
                <br />
                확인할 절차가 남습니다
              </h2>
              <p>
                동시신청, 관재인 조사, 재산 정리와 면책결정의 효력을 구분해
                설명합니다.
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
                절차와 결정의 근거를
                <br />
                직접 확인할 수 있습니다
              </h2>
            </div>
            <div className="evidence-content">
              <ul>
                <li>
                  <a
                    href="https://slb.scourt.go.kr/rel/guide/personal_b/index.jsp"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>서울회생법원</span>
                    개인파산·면책 제도와 절차 안내
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제305조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    제305조 지급불능과 파산선고
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제312조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    제312조 관재인 선임과 기일
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제556조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    제556조 파산·면책 동시신청
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제564조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    제564조부터 제566조 면책결정과 효력
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
                이 글은 일반적인 제도 안내이며 개별 사건의 완료기간이나 면책 결과를
                보장하지 않습니다. 법령·법원 실무와 재산·채권·거래 내역에 따라 실제
                절차와 필요한 대응은 달라질 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">신청 전 기준과 제도 차이도 확인하세요</h2>
            </div>
            <div className="related-links">
              <a href="/bank/situations/collection-and-seizure">
                <span>독촉·압류 대응</span>
                지금 받은 문서에서 무엇부터 확인할까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-bankruptcy/documents">
                <span>필요서류</span>
                관재인 조사에 대비해 무엇을 준비할까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-bankruptcy/eligibility">
                <span>신청자격</span>
                지급불능과 면책심사는 어떤 기준으로 볼까
                <ArrowIcon />
              </a>
              <a href="/bank/compare">
                <span>제도 비교</span>
                개인회생과 개인파산은 무엇이 다를까
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
              문서부터 확인해 보세요.
            </>
          }
          body="법원이나 파산관재인에게 받은 문서의 이름과 날짜, 현재 알고 있는 채무·재산부터 말씀해 주세요. 먼저 확인할 기한과 남은 절차를 상담에서 함께 정리합니다."
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
