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
const pagePath = "/bank/personal-rehabilitation/eligibility";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "개인회생 신청자격, 네 가지를 먼저 확인하세요",
  description:
    "개인회생 신청자격은 소득, 채무 한도, 현재의 변제 곤란 상태, 최근 면책 이력을 함께 봅니다. 급여소득자·자영업자·프리랜서가 놓치기 쉬운 기준까지 공식 자료를 바탕으로 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인회생 신청자격, 네 가지를 먼저 확인하세요 | 법무법인 로앤",
    description:
      "소득이 있다는 사실만으로 정해지지 않습니다. 채무와 재산, 변제 가능성, 최근 면책 이력을 함께 확인해야 합니다.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const qualifications = [
  {
    number: "01",
    id: "payment-difficulty",
    label: "현재 상태",
    title: "지금 채무를 갚기 어렵거나, 곧 어려워질 우려가 있나요?",
    body: "이미 제때 갚을 수 없는 상태뿐 아니라, 가까운 장래에 그렇게 될 염려가 있는 개인채무자도 신청을 검토할 수 있습니다. 재산보다 채무가 많다는 계산 하나만으로 결론이 정해지지는 않습니다.",
    point: "소득·필수 지출·재산·채무의 변제기와 규모를 함께 확인합니다.",
  },
  {
    number: "02",
    id: "ongoing-income",
    label: "소득",
    title: "앞으로도 계속되거나 반복될 소득이 있나요?",
    body: "법은 급여소득자와 영업소득자를 대상으로 합니다. 정규직인지보다 급여·사업·연금 등 소득이 앞으로도 이어질 가능성과 이를 자료로 설명할 수 있는지가 중요합니다.",
    point: "프리랜서·일용직·자영업자도 소득의 계속성을 구체적으로 봅니다.",
  },
  {
    number: "03",
    id: "debt-limit",
    label: "채무 한도",
    title: "담보부와 그 밖의 채무가 각각 한도 안에 있나요?",
    body: "개인회생절차 개시 신청 당시 담보부 개인회생채권은 15억 원 이하, 그 밖의 개인회생채권은 10억 원 이하여야 합니다. 두 금액은 합쳐서 하나의 한도로 계산하지 않습니다.",
    point: "근저당·보증·우선권이 있는 채권은 분류와 금액을 따로 확인해야 합니다.",
  },
  {
    number: "04",
    id: "prior-discharge",
    label: "최근 면책",
    title: "이전에 면책받았다면 5년이 지났나요?",
    body: "개인회생이나 개인파산 절차에서 면책을 받은 적이 있다면, 새 신청일을 기준으로 그 면책결정 확정일부터 5년이 지나지 않은 경우 신청이 기각될 수 있습니다.",
    point: "과거 사건의 신청일이 아니라 면책결정 확정일을 확인합니다.",
  },
];

const checklist = [
  {
    title: "소득 자료",
    body: "최근 급여명세, 급여 입금 내역, 소득금액증명, 매출·비용 자료처럼 소득의 금액과 흐름을 보여주는 자료",
  },
  {
    title: "채무 목록",
    body: "금융기관·보증기관·개인채권자·세금 등 빠뜨리지 않은 채권자별 원금, 이자, 담보 여부",
  },
  {
    title: "재산 목록",
    body: "부동산, 차량, 임대차보증금, 예금, 보험 해약환급금, 퇴직금 예상액 등 현재 가치",
  },
  {
    title: "가구와 지출",
    body: "함께 생활하는 가족, 부양 사유, 주거비·의료비처럼 계속 필요한 지출과 그 근거",
  },
  {
    title: "과거 절차",
    body: "이전 개인회생·파산 신청 여부와 면책결정 확정일, 현재 진행 중인 조정 절차",
  },
  {
    title: "급한 일정",
    body: "지급명령, 소송, 급여·계좌 압류, 경매 등 이미 받은 문서의 종류와 도달일·기한",
  },
];

const faqs = [
  {
    question: "프리랜서나 일용직도 개인회생을 신청할 수 있나요?",
    answer:
      "직업의 이름만으로 제외되지는 않습니다. 소득이 계속되거나 반복될 가능성이 있는지, 금액과 흐름을 객관적인 자료로 설명할 수 있는지를 확인해야 합니다.",
  },
  {
    question: "재산이 있으면 개인회생을 신청할 수 없나요?",
    answer:
      "재산이 있다는 이유만으로 신청할 수 없는 것은 아닙니다. 다만 변제계획에서 갚는 금액의 현재가치가 재산을 처분했을 때 채권자에게 돌아갈 가치보다 적지 않아야 하는 청산가치 보장 원칙을 함께 검토합니다.",
  },
  {
    question: "아직 연체 전이어도 신청자격을 검토할 수 있나요?",
    answer:
      "법은 이미 지급불능인 경우뿐 아니라 그러한 사실이 생길 염려가 있는 경우도 포함합니다. 다만 단순한 걱정만이 아니라 소득, 지출, 채무의 변제기와 규모를 바탕으로 현재 상황을 구체적으로 확인해야 합니다.",
  },
  {
    question: "주식·코인·도박으로 생긴 채무도 개인회생이 가능한가요?",
    answer:
      "채무가 생긴 원인 하나만으로 개인회생 신청자격이 곧바로 배제되는 것은 아닙니다. 다만 채무 발생 경위, 최근 거래, 재산 처분, 진술의 성실성 등이 절차에서 별도로 검토될 수 있으므로 사실을 빠짐없이 밝혀야 합니다.",
  },
  {
    question: "소득이 있으면 신청자격이 바로 인정되나요?",
    answer:
      "아닙니다. 소득의 계속 가능성뿐 아니라 생계에 필요한 비용을 제외하고 변제에 쓸 금액이 있는지, 채무 한도와 재산 가치, 최근 면책 이력 등도 함께 심사합니다. 최종적인 절차 개시 여부는 법원이 판단합니다.",
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
      name: "개인회생 신청자격",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "개인회생 신청자격, 네 가지를 먼저 확인하세요",
  description:
    "개인회생 신청자격의 핵심인 변제 곤란 상태, 계속적 소득, 채무 한도, 최근 면책 이력을 공식 자료를 바탕으로 설명합니다.",
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

export default function PersonalRehabilitationEligibilityPage() {
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
              <span aria-current="page">신청자격</span>
            </nav>

            <div className="eligibility-hero-grid">
              <div className="eligibility-hero-copy">
                <p className="eyebrow">개인회생 신청자격</p>
                <h1>
                  소득이 있다는 것만으로
                  <br />
                  <span>신청자격이 정해지지는 않습니다.</span>
                </h1>
                <p className="eligibility-lead">
                  개인회생은 지금 채무를 갚기 어렵거나 곧 어려워질 우려가 있는 개인이,
                  앞으로 계속되거나 반복될 소득으로 변제계획을 이행하는 절차입니다.
                  채무 한도와 최근 면책 이력도 함께 확인해야 하며, 최종적인 절차 개시
                  여부는 법원이 제출 자료를 심사해 판단합니다.
                </p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#requirements">
                    네 가지 기준 보기
                    <ArrowIcon />
                  </a>
                  <a className="button button-secondary" href="#self-check">
                    확인할 자료 정리하기
                  </a>
                </div>
                <p className="eligibility-date">
                  <span>기준일</span>
                  <time dateTime={reviewedDate}>2026년 7월 26일</time>
                  <span aria-hidden="true">·</span>
                  현행 법령·법원 안내 기준
                </p>
              </div>

              <aside className="eligibility-summary" aria-label="개인회생 신청자격 핵심 요약">
                <p>한눈에 보는 신청자격</p>
                <ol>
                  <li>
                    <a href="#payment-difficulty">
                      <span>01</span>
                      <strong>현재 상태</strong>
                      <small>갚기 어렵거나 그럴 우려</small>
                    </a>
                  </li>
                  <li>
                    <a href="#ongoing-income">
                      <span>02</span>
                      <strong>계속될 소득</strong>
                      <small>급여·사업 등 반복 가능성</small>
                    </a>
                  </li>
                  <li>
                    <a href="#debt-limit">
                      <span>03</span>
                      <strong>채무 한도</strong>
                      <small>담보 15억 · 그 밖의 채무 10억</small>
                    </a>
                  </li>
                  <li>
                    <a href="#prior-discharge">
                      <span>04</span>
                      <strong>최근 면책</strong>
                      <small>면책 확정일부터 5년</small>
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
              아래 기준은 스스로 가능·불가능을 판정하는 테스트가 아닙니다. 네 가지에
              모두 해당해 보여도 변제계획과 제출 자료, 재산 가치 등 개별 사정을 법원이
              심사합니다.
            </p>
          </div>
        </section>

        <section className="section eligibility-requirements" id="requirements">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">기본 요건</p>
                <h2>
                  신청 전에
                  <br />
                  네 가지를 함께 봅니다
                </h2>
              </div>
              <p>
                하나의 숫자나 직업명으로 결론 내리지 않습니다. 신청 당시의 소득·재산·
                채무와 과거 절차를 서로 연결해 확인해야 합니다.
              </p>
            </div>

            <div className="qualification-list">
              {qualifications.map((qualification) => (
                <article id={qualification.id} key={qualification.number}>
                  <div className="qualification-index">
                    <span>{qualification.number}</span>
                    <small>{qualification.label}</small>
                  </div>
                  <div className="qualification-copy">
                    <h3>{qualification.title}</h3>
                    <p>{qualification.body}</p>
                    <div>
                      <CheckIcon />
                      {qualification.point}
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
              <p className="eyebrow light-eyebrow">소득에서 자주 놓치는 점</p>
              <h2>
                “소득이 있다”와
                <br />
                “계속 갚을 수 있다”는 다릅니다
              </h2>
              <p>
                법원은 소득의 이름보다 실제 흐름과 지속 가능성, 생계비를 제외하고
                변제에 쓸 수 있는 금액을 구체적으로 봅니다.
              </p>
            </div>

            <div className="income-points">
              <article>
                <span>계속성</span>
                <h3>앞으로도 이어질 수 있는가</h3>
                <p>
                  근로계약, 거래 내역, 사업 현황 등으로 신청 뒤에도 소득이 이어질
                  가능성을 설명합니다.
                </p>
              </article>
              <article>
                <span>가용소득</span>
                <h3>생계비를 빼고 남는 금액이 있는가</h3>
                <p>
                  월 소득 전체를 갚는 것이 아니라, 법원이 인정하는 생계비와 필요한
                  지출을 고려해 변제 재원을 살핍니다.
                </p>
              </article>
              <article>
                <span>청산가치</span>
                <h3>재산 가치보다 적게 갚는 계획은 아닌가</h3>
                <p>
                  변제계획에서 갚는 금액의 현재가치는 재산을 처분했을 때 채권자에게
                  돌아갈 가치보다 적지 않아야 합니다.
                </p>
              </article>
              <article>
                <span>자료</span>
                <h3>소득과 지출을 설명할 수 있는가</h3>
                <p>
                  현금으로 받은 소득이나 월별 편차가 큰 소득도 실제 흐름을 보여주는
                  자료를 빠짐없이 준비해야 합니다.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section self-check-section" id="self-check">
          <div className="shell">
            <div className="self-check-heading">
              <div className="section-heading">
                <p className="eyebrow">상담 전 체크리스트</p>
                <h2>정확한 숫자가 아니어도<br />아는 범위부터 모아보세요</h2>
              </div>
              <p>
                지금 바로 서류를 발급할 필요는 없습니다. 무엇이 있고 무엇을 모르는지
                구분해 두면 신청자격을 확인할 때 빠뜨리는 항목이 줄어듭니다.
              </p>
            </div>

            <ul className="self-check-grid">
              {checklist.map((item, index) => (
                <li key={item.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="privacy-note">
              <span aria-hidden="true">i</span>
              <p>
                이 페이지에서는 어떤 정보도 입력받거나 저장하지 않습니다. 상담을 요청할
                때도 처음부터 주민등록번호·계좌번호·원본 서류를 보내지 마세요.
              </p>
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="shell faq-grid">
            <div className="section-heading">
              <p className="eyebrow">자주 묻는 질문</p>
              <h2>조건 하나만 보고<br />미리 단정하지 마세요</h2>
              <p>
                신청자격과 실제 변제계획은 서로 연결되어 있습니다. 자주 오해하는 지점을
                일반적인 기준으로 정리했습니다.
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
              <h2>근거를 직접 확인할 수 있게<br />출처와 기준일을 남깁니다</h2>
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
                    개인회생 제도·신청자격 안내
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
                법령·실무 기준이 바뀌거나 사실관계가 다르면 설명의 적용도 달라질 수
                있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">아직 판단이 어렵다면</h2>
            </div>
            <div className="related-links">
              <a href="/bank/personal-rehabilitation/repayment">
                <span>변제금</span>
                월 납부액은 어떤 기준으로 정할까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/process">
                <span>절차와 기간</span>
                신청 뒤에는 어떤 순서로 진행될까
                <ArrowIcon />
              </a>
              <a href="/bank/situations/investment-debt">
                <span>주식·코인 채무</span>
                투자 채무는 어떤 자료와 기준을 확인할까
                <ArrowIcon />
              </a>
              <a href="/bank/situations/self-employed">
                <span>자영업자 개인회생</span>
                매출과 실제 영업소득은 어떻게 확인할까
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              네 가지 기준만으로
              <br />
              결론 내리기 어렵다면.
            </>
          }
          body="소득의 형태와 대략적인 채무·재산, 가장 급한 일부터 말씀해 주세요. 어떤 쟁점을 더 확인해야 하는지 상담에서 함께 정리합니다."
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
