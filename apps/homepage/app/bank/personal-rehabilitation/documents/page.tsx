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
const pagePath = "/bank/personal-rehabilitation/documents";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "개인회생 필요서류, 기본 목록과 상황별 증빙",
  description:
    "개인회생 신청서, 채권자목록, 재산목록, 소득·지출 목록, 소득 증빙과 변제계획안 등 기본 서류와 직업·재산별 추가 자료, 보정 전 확인사항을 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인회생 필요서류, 기본 목록과 상황별 증빙 | 법무법인 로앤",
    description:
      "모든 신청자에게 똑같은 서류 한 묶음이 필요한 것은 아닙니다. 기본 작성서류와 상황별 증빙을 나누어 확인하세요.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const coreDocuments = [
  {
    number: "01",
    label: "신청 내용",
    title: "개인회생절차 개시신청서와 진술서",
    body: "신청서에는 신청의 취지와 원인, 재산과 채무 등 기본 사항을 적고, 진술서에는 채무가 늘어난 경위와 현재 생활·소득 상황을 구체적으로 설명합니다.",
    point: "목록과 증빙에 나타난 사실이 진술 내용과 서로 맞는지 확인합니다.",
  },
  {
    number: "02",
    label: "채무",
    title: "개인회생채권자목록",
    body: "채권자의 성명과 주소, 채권의 원인과 금액을 적습니다. 금융기관뿐 아니라 보증기관, 개인채권자, 세금과 이미 소송·압류가 진행 중인 채권도 빠짐없이 확인해야 합니다.",
    point: "채무확인서와 독촉장만 보지 말고 보증·양도된 채권과 담보 여부도 구분합니다.",
  },
  {
    number: "03",
    label: "재산",
    title: "재산목록과 가액을 보여주는 자료",
    body: "부동산, 임대차보증금, 차량, 예금, 보험 해약환급금, 퇴직금 예상액 등 현재 가진 재산과 그 가치를 적고 각 항목을 확인할 자료를 붙입니다.",
    point: "본인 명의만 기계적으로 나열하지 말고 반환받을 보증금과 받을 돈도 살펴봅니다.",
  },
  {
    number: "04",
    label: "생활",
    title: "소득 및 지출에 관한 목록",
    body: "월평균 소득, 가구 구성과 부양 사유, 주거비·의료비 등 계속 필요한 지출을 정리합니다. 변제에 사용할 수 있는 금액을 검토하는 기초 자료가 됩니다.",
    point: "목록의 월 소득은 급여명세·계좌 입금·세금 자료의 흐름과 연결되어야 합니다.",
  },
  {
    number: "05",
    label: "소득",
    title: "급여소득자·영업소득자임을 증명하는 자료",
    body: "급여소득자는 원천징수영수증이나 소득증명 등, 영업소득자는 사업자등록·소득금액·매출과 비용 자료 등으로 계속되거나 반복될 소득을 설명합니다.",
    point: "이직·휴직, 현금 수령, 월별 편차가 있다면 그 기간과 이유를 함께 정리합니다.",
  },
  {
    number: "06",
    label: "변제",
    title: "변제계획안",
    body: "앞으로 얼마를 언제부터 어떤 방법으로 변제할지 적는 문서입니다. 법률상 원칙적으로 신청일부터 14일 이내 제출할 수 있지만, 법원 안내와 사건 준비 상황에 따라 신청서와 함께 제출하는 경우가 많습니다.",
    point: "소득·생계비·재산 가치와 맞지 않는 계획은 뒤 심사에서 보완이 필요할 수 있습니다.",
  },
];

const situationDocuments = [
  {
    title: "본인·가족·주거",
    body: "주민등록등본·초본, 가족관계증명서, 혼인관계증명서, 임대차계약서 등으로 주소 변동, 가구 구성, 주거 형태를 확인합니다.",
  },
  {
    title: "급여·연금 소득",
    body: "재직증명, 근로계약, 급여명세, 급여 입금내역, 원천징수영수증, 소득금액증명 등 실제 금액과 계속성을 보여주는 자료를 확인합니다.",
  },
  {
    title: "사업·프리랜서 소득",
    body: "사업자등록, 종합소득세·부가가치세 자료, 매출 입금, 카드매출, 거래내역과 사업상 비용 등 소득 산정 근거를 정리합니다.",
  },
  {
    title: "부동산·차량·임차보증금",
    body: "등기사항증명서, 시가 자료, 자동차등록원부와 시가 자료, 임대차계약서와 보증금 내역 등 재산의 권리관계와 현재 가치를 확인합니다.",
  },
  {
    title: "예금·보험·퇴직금",
    body: "계좌내역과 잔액, 보험 가입·해약환급금 예상액, 퇴직금 예상액 등 목록에 적은 금액을 뒷받침할 자료를 준비합니다.",
  },
  {
    title: "세금·보증·과거 절차",
    body: "미납세액, 보증채무, 사적 채무조정 자료와 신청일 전 10년 안에 회생·파산·개인회생 등을 신청한 이력이 있다면 그 관련 서류를 확인합니다.",
  },
];

const preparationSteps = [
  {
    title: "관할 법원의 최신 양식 확인",
    body: "법원별 제출자료 목록과 양식이 달라질 수 있으므로 접수할 법원과 전자소송포털의 최신 안내를 먼저 확인합니다.",
  },
  {
    title: "발급 전에 전체 항목 만들기",
    body: "채권자·계좌·보험·차량·부동산·임대차·소득원을 먼저 목록으로 만들면 같은 서류를 여러 번 발급하거나 누락하는 일을 줄일 수 있습니다.",
  },
  {
    title: "기준일과 숫자 서로 맞추기",
    body: "신청서, 채권자목록, 재산목록, 소득·지출 목록과 변제계획안에 적힌 금액·기간·가구원이 증빙과 맞는지 확인합니다.",
  },
  {
    title: "보정문서의 기한대로 보완",
    body: "접수 뒤 추가 자료를 요구받을 수 있습니다. 보정권고·명령의 항목과 제출기한을 기준으로 답변하고, 준비가 어렵다면 기한이 지나기 전에 대응을 검토합니다.",
  },
];

const faqs = [
  {
    question: "개인회생 필요서류는 누구나 똑같은가요?",
    answer:
      "아닙니다. 법률상 기본 첨부서류는 정해져 있지만, 실제 증빙은 급여·사업 등 소득 형태, 보유 재산, 가족과 주거 상황, 채무 발생 경위, 과거 절차에 따라 달라집니다. 관할 법원의 최신 양식과 개별 보정 요구도 함께 확인해야 합니다.",
  },
  {
    question: "모든 서류를 원본으로 내야 하나요?",
    answer:
      "서류마다 원본·사본·발급 형태와 유효기간 안내가 다를 수 있습니다. 임의로 한 기준을 적용하기보다 관할 법원의 최신 제출자료 목록과 전자제출 안내를 확인하고, 제출본과 별도로 확인 가능한 사본을 정리해 두는 편이 좋습니다.",
  },
  {
    question: "소득이 일정하지 않은 프리랜서는 무엇을 준비하나요?",
    answer:
      "직업명보다 실제 소득의 금액과 반복 가능성을 보여주는 자료가 중요합니다. 계약·정산서, 입금내역, 세금 신고자료, 거래처와 비용 자료 등을 기간별로 정리하고 월별 편차가 큰 이유를 함께 설명할 수 있어야 합니다.",
  },
  {
    question: "채권자 한 곳을 빠뜨리면 나중에 추가할 수 있나요?",
    answer:
      "개시결정 전에는 법에서 정한 절차에 따라 채권자목록을 수정할 수 있지만, 시기와 누락 경위에 따라 추가 절차와 영향이 달라질 수 있습니다. 누락을 발견했다면 미루지 말고 사건 단계와 수정 방법을 바로 확인해야 합니다.",
  },
  {
    question: "변제계획안은 신청서와 같은 날 내야 하나요?",
    answer:
      "법률상 변제계획안은 원칙적으로 개인회생절차 개시신청일부터 14일 이내 제출하도록 정하고, 상당한 이유가 있으면 법원이 기간을 늘릴 수 있습니다. 다만 실제 접수 방식과 보완 요구가 달라질 수 있으므로 관할 법원의 안내에 맞춰 준비해야 합니다.",
  },
  {
    question: "보정권고나 보정명령을 받으면 신청이 잘못된 건가요?",
    answer:
      "추가 설명이나 자료 확인이 필요하다는 뜻일 수 있어 그 사실만으로 결과를 단정할 수 없습니다. 다만 정해진 기한을 넘기거나 요구한 내용을 충분히 설명하지 못하면 사건 진행에 영향을 줄 수 있으므로 문서별 요구사항과 기한을 정확히 확인해야 합니다.",
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
      name: "필요서류",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "개인회생 필요서류, 기본 목록과 상황별 증빙",
  description:
    "개인회생 신청의 기본 작성서류, 직업·재산별 증빙과 보정 전 확인사항을 공식 자료를 바탕으로 설명합니다.",
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

export default function PersonalRehabilitationDocumentsPage() {
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
              <span aria-current="page">필요서류</span>
            </nav>

            <div className="eligibility-hero-grid">
              <div className="eligibility-hero-copy">
                <p className="eyebrow">개인회생 필요서류</p>
                <h1>
                  서류 이름보다 먼저
                  <br />
                  <span>누락 없이 사실을 맞춰야 합니다.</span>
                </h1>
                <p className="eligibility-lead">
                  신청서와 채권자·재산·소득 목록은 기본이지만, 이를 뒷받침하는 자료는
                  직업과 재산, 가족 상황에 따라 달라집니다. 모든 사람에게 같은 서류
                  한 묶음을 적용하기보다 기본 문서와 상황별 증빙을 나누어 준비해야 합니다.
                </p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#core-documents">
                    기본 서류 보기
                    <ArrowIcon />
                  </a>
                  <a className="button button-secondary" href="#preparation">
                    준비 순서 확인
                  </a>
                </div>
                <p className="eligibility-date">
                  <span>기준일</span>
                  <time dateTime={reviewedDate}>2026년 7월 26일</time>
                  <span aria-hidden="true">·</span>
                  현행 법령·법원 안내 기준
                </p>
              </div>

              <aside className="eligibility-summary" aria-label="개인회생 필요서류 핵심 요약">
                <p>네 묶음으로 나눠보세요</p>
                <ol>
                  <li>
                    <a href="#core-documents">
                      <span>01</span>
                      <strong>작성서류</strong>
                      <small>신청서·목록·진술서·계획안</small>
                    </a>
                  </li>
                  <li>
                    <a href="#situation-documents">
                      <span>02</span>
                      <strong>소득 증빙</strong>
                      <small>급여·사업·프리랜서 자료</small>
                    </a>
                  </li>
                  <li>
                    <a href="#situation-documents">
                      <span>03</span>
                      <strong>재산·생활 증빙</strong>
                      <small>주거·보험·차량·가족 자료</small>
                    </a>
                  </li>
                  <li>
                    <a href="#preparation">
                      <span>04</span>
                      <strong>보정 대비</strong>
                      <small>누락·불일치와 제출기한 확인</small>
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
              아래는 준비 범위를 이해하기 위한 일반적인 안내입니다. 관할 법원, 신청
              시점과 사건 내용에 따라 양식·발급기간·추가 제출자료가 달라질 수 있으므로
              실제 제출 전 최신 법원 안내를 확인해야 합니다.
            </p>
          </div>
        </section>

        <section className="section eligibility-requirements" id="core-documents">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">기본 작성서류</p>
                <h2>
                  먼저 여섯 문서를
                  <br />
                  하나의 내용으로 맞춥니다
                </h2>
              </div>
              <p>
                서류마다 따로 작성하는 것처럼 보여도 채무·재산·소득과 변제계획의 숫자는
                서로 연결됩니다.
              </p>
            </div>

            <div className="qualification-list">
              {coreDocuments.map((document) => (
                <article key={document.number}>
                  <div className="qualification-index">
                    <span>{document.number}</span>
                    <small>{document.label}</small>
                  </div>
                  <div className="qualification-copy">
                    <h3>{document.title}</h3>
                    <p>{document.body}</p>
                    <div>
                      <CheckIcon />
                      {document.point}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section income-section" id="situation-documents">
          <div className="shell income-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">상황별 증빙</p>
              <h2>
                내 상황에 있는 항목만
                <br />
                구체적으로 확인하세요
              </h2>
              <p>
                아래 자료가 모든 신청자에게 전부 필요한 것은 아닙니다. 목록에 적은
                사실과 금액을 무엇으로 확인할 수 있는지 찾는 기준으로 보세요.
              </p>
            </div>

            <div className="income-points">
              {situationDocuments.map((document) => (
                <article key={document.title}>
                  <span>증빙자료</span>
                  <h3>{document.title}</h3>
                  <p>{document.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section self-check-section" id="preparation">
          <div className="shell">
            <div className="self-check-heading">
              <div className="section-heading">
                <p className="eyebrow">준비와 보정 순서</p>
                <h2>
                  발급부터 시작하지 말고
                  <br />
                  전체 목록부터 만드세요
                </h2>
              </div>
              <p>
                제출 직전에 숫자가 달라지거나 같은 자료를 다시 발급하는 일을 줄이려면
                항목 정리, 발급, 대조, 보정 순서로 준비하는 편이 안전합니다.
              </p>
            </div>

            <ol className="self-check-grid">
              {preparationSteps.map((step, index) => (
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
                주민등록번호·계좌번호·가족정보가 담긴 서류를 일반 이메일이나 메신저로
                먼저 보내지 마세요. 제출처와 전송 방법을 확인하고, 상담 초기에는
                민감정보를 가린 사본이나 문서명·기준일만으로 확인할 수 있는지 먼저
                문의하세요.
              </p>
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="shell faq-grid">
            <div className="section-heading">
              <p className="eyebrow">자주 묻는 질문</p>
              <h2>
                서류는 많아도
                <br />
                확인 원리는 같습니다
              </h2>
              <p>
                무엇을 적었는지, 어떤 자료로 확인되는지, 서로 숫자가 맞는지를 차례로
                살펴보세요.
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
              <p className="eyebrow">공식 근거와 최신 양식</p>
              <h2>
                제출 전에는 법원의
                <br />
                최신 자료를 다시 확인하세요
              </h2>
            </div>
            <div className="evidence-content">
              <ul>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채무자 회생 및 파산에 관한 법률 제589조
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
                    개인회생 제도·신청서류 안내
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://slb.scourt.go.kr/rel/information/min/MinListAction.work?gubun=0"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>서울회생법원</span>
                    민원서식 양식모음
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
                이 글은 일반적인 제도 안내이며 개별 사건의 확정 제출목록이나 법률
                판단이 아닙니다. 관할 법원의 최신 양식, 보정 요구와 사건의 사실관계에
                따라 필요한 자료가 달라질 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">서류가 쓰이는 절차도 확인하세요</h2>
            </div>
            <div className="related-links">
              <a href="/bank/personal-rehabilitation/repayment">
                <span>변제금</span>
                소득·생계비·재산이 어떻게 연결될까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/process">
                <span>절차와 기간</span>
                접수 뒤 보정과 심사는 어떻게 진행될까
                <ArrowIcon />
              </a>
              <a href="/bank/situations/self-employed">
                <span>자영업자 개인회생</span>
                사업 매출·비용·재산 자료는 무엇일까
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              어떤 서류부터 준비할지
              <br />
              막막하다면.
            </>
          }
          body="현재 직업과 소득 형태, 주거와 재산, 알고 있는 채권자부터 말씀해 주세요. 상담 초기에는 주민등록번호·계좌번호나 원본 서류를 보내지 않아도 됩니다."
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
