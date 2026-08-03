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
const pagePath = "/bank/personal-bankruptcy/documents";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "개인파산 필요서류, 신청서부터 상황별 증빙까지",
  description:
    "개인파산·면책 신청서, 진술서, 채권자목록, 재산목록, 현재 생활상황과 수입·지출 목록 등 기본 서류와 재산·거래·소득별 증빙, 보정 전 확인사항을 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인파산 필요서류, 신청서부터 상황별 증빙까지 | 법무법인 로앤",
    description:
      "개인파산 서류는 이름만 갖추는 것으로 끝나지 않습니다. 채무·재산·소득·최근 거래가 목록과 증빙에서 서로 맞아야 합니다.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const coreDocuments = [
  {
    number: "01",
    label: "신청",
    title: "파산 및 면책 신청서",
    body: "신청인의 인적사항, 신청취지와 신청이유를 적는 문서입니다. 개인인 채무자가 파산을 신청하면 반대 의사표시가 없는 한 면책도 함께 신청한 것으로 보지만, 실제 제출에는 법원의 최신 파산·면책 표준양식을 사용합니다.",
    point: "주소와 송달장소, 연락처가 정확한지 확인하고 변경되면 법원에 알립니다.",
  },
  {
    number: "02",
    label: "경위",
    title: "진술서",
    body: "경력과 생활상황, 채무가 늘어난 경위, 지급이 어려워진 과정, 과거 채무조정이나 도산절차 등을 사실대로 설명합니다. 최근 차입·재산 처분·일부 채권자에 대한 변제도 다른 목록과 맞춰야 합니다.",
    point: "불리해 보이는 사실도 임의로 빼지 말고 시기와 자금 흐름을 함께 설명합니다.",
  },
  {
    number: "03",
    label: "채무",
    title: "채권자목록",
    body: "채권자의 이름과 주소, 채권 원인·금액, 보증·담보와 소송·집행 여부 등을 정리합니다. 금융회사뿐 아니라 개인채권자, 양도된 채권, 보증채무, 세금과 벌금 등도 확인합니다.",
    point: "독촉이 오는 채권만 적지 말고 신용조회·계약서·판결문과 대조해 누락을 줄입니다.",
  },
  {
    number: "04",
    label: "재산",
    title: "재산목록",
    body: "현금·예금, 보험, 임대차보증금, 부동산, 차량, 증권·가상자산, 퇴직금과 받을 돈 등 재산을 적고 현재 가치와 권리관계를 보여주는 자료를 붙입니다.",
    point: "본인 명의가 아니더라도 실질적으로 보유하거나 반환받을 권리가 있는 재산인지 살펴봅니다.",
  },
  {
    number: "05",
    label: "생활",
    title: "현재의 생활상황",
    body: "동거 가족, 주거 형태, 생활비 부담, 건강과 부양 상황, 다른 가족의 소득 지원 등 현재 생활을 설명합니다. 가족관계·주거·소득 자료와 내용이 서로 맞아야 합니다.",
    point: "가족의 자료는 필요한 범위와 제출 근거를 확인하고 민감정보를 안전하게 다룹니다.",
  },
  {
    number: "06",
    label: "수지",
    title: "수입 및 지출에 관한 목록",
    body: "급여·사업·연금·공적급여와 정기 지원 등 실제 수입, 주거비·의료비·교육비 등 계속되는 지출을 월 단위로 정리합니다. 현재 소득이 없으면 언제부터 왜 없는지와 생활비 조달 방법을 설명합니다.",
    point: "목록의 금액을 급여명세·세금자료·계좌 흐름과 같은 기준기간으로 대조합니다.",
  },
];

const evidenceGroups = [
  {
    title: "본인·가족·주소와 주거",
    body: "가족관계·혼인관계 증명, 주민등록등본·주소변동 자료, 임대차계약서 등으로 가족관계와 실제 거주·보증금 상황을 확인합니다.",
  },
  {
    title: "급여·연금·공적급여",
    body: "재직·퇴직 자료, 급여명세와 입금내역, 원천징수·소득금액 자료, 연금·공적급여 수급자료 등으로 현재 수입과 변동 경위를 설명합니다.",
  },
  {
    title: "사업·프리랜서·폐업",
    body: "사업자등록·휴폐업, 종합소득세·부가가치세, 매출·비용과 거래계좌 자료를 정리합니다. 폐업했다면 폐업 시점과 자산·보증금·미수금의 처리도 확인합니다.",
  },
  {
    title: "계좌·보험·증권·가상자산",
    body: "법원이 요구한 기간의 계좌거래와 잔액, 보험 가입·해약환급금, 증권·가상자산 보유와 거래내역을 재산목록 및 최근 자금 흐름과 맞춥니다.",
  },
  {
    title: "부동산·차량·보증금과 받을 돈",
    body: "등기사항증명, 시가와 담보 자료, 자동차등록원부, 임대차계약, 경매·배당 자료, 대여금·미수금 등 권리의 존재와 현재 가치를 확인합니다.",
  },
  {
    title: "채무·세금·보증·소송",
    body: "부채증명, 계약서, 판결·지급명령, 압류·경매, 체납과 보증 관련 문서를 채권자목록과 대조합니다. 채권이 양도되었다면 현재 채권자도 확인합니다.",
  },
  {
    title: "최근 처분·송금·일부 변제",
    body: "재산 매각, 보험 해지, 큰 금액의 인출·송금, 가족 간 거래와 특정 채권자에게 한 변제가 있다면 법원이 요구한 기간의 계약·계좌 자료로 사용처를 설명합니다.",
  },
  {
    title: "과거 채무조정·회생·파산",
    body: "신용회복위원회 등 사적 채무조정과 과거 회생·개인회생·파산·면책 사건이 있다면 협약·결정문·확정 여부 등 관련 자료를 확인합니다.",
  },
];

const preparationSteps = [
  {
    title: "접수 법원의 최신 목록 확인",
    body: "대법원 표준양식과 자료제출목록이 기준이지만 법원은 자료 일부를 면제하거나 법원별 목록과 사건별 추가자료를 요구할 수 있습니다.",
  },
  {
    title: "채무·재산·계좌를 먼저 목록화",
    body: "서류부터 발급하지 말고 채권자, 모든 계좌·보험, 부동산·차량·보증금, 소득원과 최근 주요 거래를 먼저 한 표에 정리합니다.",
  },
  {
    title: "기간과 숫자, 경위를 대조",
    body: "신청서·진술서·각 목록의 금액과 시점이 증빙에 나타난 흐름과 맞는지 확인하고 차이가 있으면 이유를 적을 자료를 함께 찾습니다.",
  },
  {
    title: "보정과 관재인 요구를 별도 관리",
    body: "접수 후 보정명령이나 파산관재인의 추가 제출요구를 받을 수 있습니다. 문서마다 요구 항목·기준기간·제출기한을 나누어 확인합니다.",
  },
];

const faqs = [
  {
    question: "개인파산 필요서류는 누구나 똑같은가요?",
    answer:
      "아닙니다. 법률과 대법원 예규가 정한 기본 양식과 자료제출목록은 있지만, 관할 법원은 자료 일부를 면제하거나 법원별 목록 및 사건별 추가자료를 요구할 수 있습니다. 재산·소득·사업·최근 거래와 채무 발생 경위에 따라서도 실제 제출 범위가 달라집니다.",
  },
  {
    question: "신청할 때 서류를 모두 내지 못하면 접수할 수 없나요?",
    answer:
      "채무자회생법 제302조는 법정 첨부서류를 신청과 동시에 붙일 수 없을 때 그 사유를 소명하고 지체 없이 제출하도록 정합니다. 다만 제출하지 않은 채 방치하거나 법원의 보정 요구와 기한에 응하지 않으면 사건 진행에 영향을 줄 수 있으므로, 빠진 자료와 보완 일정을 접수 법원 기준으로 확인해야 합니다.",
  },
  {
    question: "현재 소득이 없어도 소득 관련 자료가 필요한가요?",
    answer:
      "소득이 없다는 사실만 적기보다 마지막 근무·사업 시점, 퇴직·폐업 자료, 공적급여나 가족 지원, 현재 생활비 조달 방법을 설명할 자료가 필요할 수 있습니다. 지급불능과 현재 생활상황을 확인하기 위한 것이므로 사건별 요구 범위를 확인해야 합니다.",
  },
  {
    question: "채권자 한 곳을 빠뜨렸다면 어떻게 해야 하나요?",
    answer:
      "누락을 발견하면 미루지 말고 현재 사건 단계와 보완 방법을 확인해야 합니다. 파산·면책에서는 채권자목록이 재산 조사와 채권자 통지, 면책 효력 판단에 연결되므로 채권자 이름뿐 아니라 현재 주소, 양도 여부와 채권 원인·금액도 함께 점검하는 것이 중요합니다.",
  },
  {
    question: "가족 명의 계좌나 가족 간 거래도 제출해야 하나요?",
    answer:
      "가족의 모든 자료를 일률적으로 제출하는 것은 아닙니다. 다만 생활비를 가족 계좌로 관리했거나 재산 이전·대금 수수 등 신청인의 재산과 거래를 확인하는 데 관련이 있으면 소명을 요구받을 수 있습니다. 요구 범위와 개인정보 처리 방법을 확인해 필요한 자료만 안전하게 제출해야 합니다.",
  },
  {
    question: "파산관재인이 신청 때 없던 서류를 더 요구할 수 있나요?",
    answer:
      "그럴 수 있습니다. 파산관재인은 재산·채무와 면책 관련 사실을 조사하므로 계좌, 보험, 처분대금, 가족 간 거래나 채무 사용처 등에 관해 추가 자료와 설명을 요청할 수 있습니다. 처음 낸 서류와 답변 내용이 달라지지 않도록 제출본을 보관하는 편이 좋습니다.",
  },
  {
    question: "모든 서류의 발급기간과 원본 기준이 같은가요?",
    answer:
      "같지 않습니다. 서류별 발급 형태·표시 범위와 법원이 요구하는 기준기간이 다를 수 있고 전자제출 방식도 확인해야 합니다. 인터넷에 있는 하나의 유효기간이나 원본·사본 기준을 모든 자료에 적용하지 말고, 최신 양식·자료제출목록과 실제 보정문서를 기준으로 준비해야 합니다.",
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
      name: "필요서류",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "개인파산 필요서류, 신청서부터 상황별 증빙까지",
  description:
    "개인파산·면책 신청의 기본 작성서류, 재산·소득·거래별 증빙과 보정 전 확인사항을 공식 자료를 바탕으로 설명합니다.",
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

export default function PersonalBankruptcyDocumentsPage() {
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
              <a href="/bank/personal-bankruptcy">개인파산·면책</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">필요서류</span>
            </nav>

            <div className="eligibility-hero-grid">
              <div className="eligibility-hero-copy">
                <p className="eyebrow">개인파산 필요서류</p>
                <h1>
                  서류의 개수보다
                  <br />
                  <span>재산과 거래의 연결이 중요합니다.</span>
                </h1>
                <p className="eligibility-lead">
                  파산·면책 신청서와 다섯 개의 표준 작성서류가 기본입니다. 여기에
                  채무·재산·소득과 최근 거래를 확인할 자료를 붙여, 진술한 경위와
                  목록의 숫자가 서로 맞는지 보여주어야 합니다.
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
                  현행 법령·법원 예규 기준
                </p>
              </div>

              <aside className="eligibility-summary" aria-label="개인파산 필요서류 핵심 요약">
                <p>네 묶음으로 나눠보세요</p>
                <ol>
                  <li>
                    <a href="#core-documents">
                      <span>01</span>
                      <strong>표준 작성서류</strong>
                      <small>신청서·진술서·세 가지 목록</small>
                    </a>
                  </li>
                  <li>
                    <a href="#evidence-groups">
                      <span>02</span>
                      <strong>채무·재산 증빙</strong>
                      <small>채권·계좌·보험·권리관계</small>
                    </a>
                  </li>
                  <li>
                    <a href="#evidence-groups">
                      <span>03</span>
                      <strong>소득·생활 증빙</strong>
                      <small>직업·사업·주거·가족 상황</small>
                    </a>
                  </li>
                  <li>
                    <a href="#preparation">
                      <span>04</span>
                      <strong>거래·보정 대비</strong>
                      <small>최근 흐름과 제출기한 대조</small>
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
              대법원 표준 자료제출목록이 있어도 실제 제출자료는 관할 법원과 사건에 따라
              가감될 수 있습니다. 아래 목록을 확정 체크리스트로 사용하기보다 준비 범위를
              파악한 뒤 접수 법원의 최신 양식과 보정문서를 다시 확인하세요.
            </p>
          </div>
        </section>

        <section className="section eligibility-requirements" id="core-documents">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">표준 작성서류</p>
                <h2>
                  여섯 문서가
                  <br />
                  같은 사실을 말해야 합니다
                </h2>
              </div>
              <p>
                현행 대법원 예규는 파산·면책 신청서부터 수입 및 지출 목록까지 여섯
                표준양식을 두고 있습니다.
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

        <section className="section income-section" id="evidence-groups">
          <div className="shell income-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">상황별 소명자료</p>
              <h2>
                내게 해당하는 재산과
                <br />
                거래를 빠짐없이 찾습니다
              </h2>
              <p>
                아래 자료가 모든 신청자에게 전부 필요한 것은 아닙니다. 작성서류에 적은
                사실을 무엇으로 확인할 수 있는지 찾는 기준으로 보세요.
              </p>
            </div>

            <div className="income-points">
              {evidenceGroups.map((group) => (
                <article key={group.title}>
                  <span>확인자료</span>
                  <h3>{group.title}</h3>
                  <p>{group.body}</p>
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
                  발급보다 먼저
                  <br />
                  전체 흐름을 그려보세요
                </h2>
              </div>
              <p>
                목록을 만든 뒤 증빙을 발급하고, 숫자·기간·거래 경위를 대조하면 누락과
                반복 발급을 줄일 수 있습니다.
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
                민감정보를 가린 사본이나 문서명·기준기간만으로 확인할 수 있는지 먼저
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
                목록에 없는 자료도
                <br />
                추가로 필요할 수 있습니다
              </h2>
              <p>
                표준양식, 법원별 자료목록과 관재인의 추가 조사자료를 구분해
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
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제302조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    제302조 파산신청서와 첨부서류
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한규칙/제72조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    규칙 제72조 개인 신청인의 추가 첨부서류
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2200000106431&chrClsCd=010201"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>대법원 재판예규</span>
                    개인파산·면책 표준양식과 자료제출목록
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
                판단이 아닙니다. 관할 법원의 최신 양식, 보정·관재인 요구와 사건의
                사실관계에 따라 필요한 자료가 달라질 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">서류가 확인되는 절차도 살펴보세요</h2>
            </div>
            <div className="related-links">
              <a href="/bank/personal-bankruptcy/process">
                <span>절차와 기간</span>
                법원 심사와 관재인 조사는 어떻게 진행될까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-bankruptcy/eligibility">
                <span>신청자격</span>
                지급불능과 면책심사는 무엇이 다를까
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              어떤 자료가 필요한지
              <br />
              항목부터 정리해 보세요.
            </>
          }
          body="현재 알고 있는 채권자와 재산, 직업·소득 형태, 최근 큰 거래부터 말씀해 주세요. 상담 초기에는 주민등록번호·계좌번호나 원본 서류를 보내지 않아도 됩니다."
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
