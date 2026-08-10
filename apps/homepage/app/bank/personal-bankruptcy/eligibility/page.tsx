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
const pagePath = "/bank/personal-bankruptcy/eligibility";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "개인파산 신청자격, 지급불능부터 확인하세요",
  description:
    "개인파산 신청자격은 소득이 없다는 사실 하나로 정해지지 않습니다. 지급불능, 재산과 가용소득, 면책 심사를 공식 법원 자료와 판례를 바탕으로 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인파산 신청자격, 지급불능부터 확인하세요 | 법무법인 로앤",
    description:
      "현재 소득·재산으로 채무를 일반적이고 계속해서 변제할 수 있는지, 파산선고와 면책은 어떻게 다른지 차례로 확인합니다.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const reviewPoints = [
  {
    number: "01",
    id: "payment-insolvency",
    label: "지급불능",
    title: "채무를 일반적이고 계속해서 갚을 수 없는 상태인가요?",
    body: "개인파산의 출발점은 지급불능입니다. 당장 갚아야 할 채무를 재산·신용·소득으로 계속 변제할 수 없는 객관적인 상태인지 봅니다. 단순히 연체 중이거나 채무가 재산보다 많다는 사정 하나만으로 결론이 정해지지는 않습니다.",
    point: "채무의 변제기와 규모, 보유 재산, 소득과 필수 지출을 함께 확인합니다.",
  },
  {
    number: "02",
    id: "income-capacity",
    label: "소득과 능력",
    title: "소득에서 생계비 등을 빼면 실제 변제 여력이 남나요?",
    body: "현재 소득이 있다는 이유만으로 개인파산을 신청할 수 없는 것은 아닙니다. 법원은 연령·직업·경력·노동능력·가족관계와 장래 소득을 살피고, 필수적인 생계비와 조세 등을 뺀 가용소득으로 채무의 상당 부분을 계속 변제할 수 있는지 구체적으로 판단합니다.",
    point: "‘일할 수 있다’거나 ‘소득이 있다’는 추상적인 사정만으로 판단하지 않습니다.",
  },
  {
    number: "03",
    id: "assets",
    label: "재산",
    title: "보유 재산과 최근 처분 내역을 빠짐없이 설명할 수 있나요?",
    body: "재산이 있다는 사실만으로 신청이 배제되지는 않지만, 파산재단에 속하는 재산은 파산관재인이 관리·조사하고 환가해 채권자에게 배당할 수 있습니다. 압류할 수 없는 재산과 법원이 인정하는 면제재산 등은 구체적으로 구분해야 합니다.",
    point: "부동산·보증금·차량·예금·보험·퇴직금과 최근 처분 내역까지 확인합니다.",
  },
  {
    number: "04",
    id: "discharge-review",
    label: "면책 심사",
    title: "파산선고와 별도로 면책받을 수 있는지도 살펴야 합니다",
    body: "파산선고는 재산을 정리하는 절차의 시작이고, 남은 채무의 책임을 면하는 면책은 별도의 재판입니다. 재산 은닉·허위 서류·과도한 낭비나 도박·일부 채권자에 대한 부당한 변제·최근 면책 이력 등이 면책 심사에서 문제가 될 수 있습니다.",
    point: "불리해 보이는 사실도 감추지 말고 발생 경위와 현재 자료를 그대로 확인해야 합니다.",
  },
];

const procedurePoints = [
  {
    tag: "파산신청",
    title: "지급불능 상태를 자료로 설명합니다",
    body: "채권자와 채무 금액, 현재 재산, 소득·지출, 채무가 늘어난 과정과 최근 재산 변동을 신청서류에 사실대로 적습니다.",
  },
  {
    tag: "파산선고",
    title: "재산을 조사하고 정리하는 절차입니다",
    body: "대부분의 개인파산사건에서는 파산관재인이 선임되어 파산재단에 속하는 재산을 관리·조사하고, 환가할 재산이 있으면 배당 절차를 진행합니다.",
  },
  {
    tag: "면책심사",
    title: "면책불허가 사유를 따로 확인합니다",
    body: "법원은 채무자와 채권자의 의견, 파산관재인의 조사 결과를 바탕으로 면책 여부를 심사합니다. 기일 출석과 자료 제출에도 성실히 응해야 합니다.",
  },
  {
    tag: "면책확정",
    title: "모든 채무가 없어지는 것은 아닙니다",
    body: "면책결정이 확정되면 원칙적으로 파산채권에 대한 책임이 면제되지만, 조세·벌금·일부 손해배상·양육비 등 법에서 정한 채권은 책임이 남을 수 있습니다.",
  },
];

const checklist = [
  {
    title: "전체 채무",
    body: "금융기관·보증기관·개인채권자·세금·보증채무 등 채권자별 원금, 이자, 담보와 현재 절차",
  },
  {
    title: "현재 재산",
    body: "부동산, 임대차보증금, 차량, 예금, 보험 해약환급금, 퇴직금, 주식·가상자산 등",
  },
  {
    title: "소득과 지출",
    body: "급여·사업·연금·공적급여의 흐름과 가구 구성, 주거비·의료비 등 계속 필요한 지출",
  },
  {
    title: "채무 발생 경위",
    body: "생활비·사업·보증·투자 등 채무가 생기고 늘어난 시기와 사용처를 보여주는 자료",
  },
  {
    title: "최근 재산 변동",
    body: "부동산·차량·예금 등의 처분, 명의 변경, 가족 간 거래와 일부 채권자에게 한 변제",
  },
  {
    title: "과거 면책",
    body: "이전 개인파산 면책 확정일부터 7년, 개인회생 면책 확정일부터 5년이 지났는지 확인할 결정문",
  },
];

const faqs = [
  {
    question: "소득이 있으면 개인파산을 신청할 수 없나요?",
    answer:
      "소득이 있다는 사실만으로 배제되지는 않습니다. 법원은 소득에서 생계비와 조세 등 필수 지출을 제외한 가용소득, 장래 소득 가능성, 재산과 채무 규모를 함께 보고 채무를 일반적·계속적으로 변제할 수 있는지 판단합니다.",
  },
  {
    question: "재산이 있으면 개인파산을 신청할 수 없나요?",
    answer:
      "재산 보유만으로 신청자격이 곧바로 부정되는 것은 아닙니다. 다만 파산재단에 속하는 재산은 파산관재인이 관리·처분할 수 있으므로, 압류할 수 없는 재산이나 면제재산과 구분해 현재 가치와 권리관계를 확인해야 합니다.",
  },
  {
    question: "채무가 얼마 이상이어야 신청할 수 있나요?",
    answer:
      "개인파산에는 개인회생과 같은 채무 총액의 상한이나 법정 최저금액이 따로 정해져 있지 않습니다. 금액만 보는 것이 아니라 소득·재산·신용으로 현재 채무를 계속 변제할 수 없는 지급불능 상태인지가 핵심입니다.",
  },
  {
    question: "주식·코인·도박으로 생긴 채무는 면책받을 수 없나요?",
    answer:
      "과도한 낭비나 도박 등으로 재산을 현저히 줄이거나 과대한 채무를 부담한 행위는 면책불허가 사유가 될 수 있습니다. 그러나 채무 원인이라는 이름만으로 결과가 자동 확정되는 것은 아니므로 거래 시기·금액·경위와 이후 상황을 숨김없이 검토해야 합니다.",
  },
  {
    question: "파산선고를 받으면 바로 채무가 없어지나요?",
    answer:
      "아닙니다. 파산절차와 면책절차는 별개입니다. 파산선고 뒤 재산 조사와 환가·배당, 면책 심사를 거쳐 면책결정이 확정되어야 원칙적으로 남은 파산채권에 대한 책임이 면제됩니다. 비면책채권은 별도로 남을 수 있습니다.",
  },
  {
    question: "예전에 면책받은 적이 있어도 다시 신청할 수 있나요?",
    answer:
      "과거 개인파산 면책결정 확정일부터 7년, 개인회생 면책결정 확정일부터 5년이 지나지 않았다면 면책불허가 사유가 될 수 있습니다. 이전 사건의 신청일이 아니라 면책결정 확정일을 확인해야 합니다.",
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
      name: "개인파산 신청자격",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "개인파산 신청자격, 지급불능부터 확인하세요",
  description:
    "개인파산 신청자격의 핵심인 지급불능과 소득·재산의 판단, 파산선고와 면책의 차이를 공식 자료를 바탕으로 설명합니다.",
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

export default function PersonalBankruptcyEligibilityPage() {
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
              <span aria-current="page">신청자격</span>
            </nav>

            <div className="eligibility-hero-grid">
              <div className="eligibility-hero-copy">
                <p className="eyebrow">개인파산 신청자격</p>
                <h1>
                  일을 못 해야만
                  <br />
                  <span>신청할 수 있는 것은 아닙니다.</span>
                </h1>
                <p className="eligibility-lead">
                  개인파산은 현재의 재산·신용·소득으로 채무를 일반적이고 계속해서
                  변제할 수 없는 지급불능 상태인지가 출발점입니다. 소득이나 재산 하나만
                  떼어 보지 않으며, 파산선고 뒤 남은 채무의 책임을 면할지는 별도의
                  면책절차에서 법원이 판단합니다.
                </p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#review-points">
                    판단 기준 보기
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

              <aside className="eligibility-summary" aria-label="개인파산 신청자격 핵심 요약">
                <p>한눈에 보는 판단 기준</p>
                <ol>
                  <li>
                    <a href="#payment-insolvency">
                      <span>01</span>
                      <strong>지급불능</strong>
                      <small>계속 변제할 수 없는 상태</small>
                    </a>
                  </li>
                  <li>
                    <a href="#income-capacity">
                      <span>02</span>
                      <strong>소득·가용소득</strong>
                      <small>필수 지출 뒤의 실제 여력</small>
                    </a>
                  </li>
                  <li>
                    <a href="#assets">
                      <span>03</span>
                      <strong>재산과 처분</strong>
                      <small>현재 가치와 최근 변동</small>
                    </a>
                  </li>
                  <li>
                    <a href="#discharge-review">
                      <span>04</span>
                      <strong>별도의 면책</strong>
                      <small>불허가 사유·비면책채권</small>
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
              개인파산에는 개인회생과 같은 채무 총액 한도가 없습니다. 다만 채무 금액이
              크거나 소득이 없다는 이유만으로 자격이 자동 인정되는 것도 아닙니다.
              지급불능과 신청의 적법성, 면책 여부를 법원이 각각 심사합니다.
            </p>
          </div>
        </section>

        <section className="section eligibility-requirements" id="review-points">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">신청 전 판단 축</p>
                <h2>
                  자격은 네 가지를
                  <br />
                  연결해서 봅니다
                </h2>
              </div>
              <p>
                법원은 나이·직업 같은 한 가지 조건이나 단순한 부채초과만으로 지급불능을
                판단하지 않습니다. 현재 자료와 앞으로의 변제 가능성을 구체적으로
                확인합니다.
              </p>
            </div>

            <div className="qualification-list">
              {reviewPoints.map((point) => (
                <article id={point.id} key={point.number}>
                  <div className="qualification-index">
                    <span>{point.number}</span>
                    <small>{point.label}</small>
                  </div>
                  <div className="qualification-copy">
                    <h3>{point.title}</h3>
                    <p>{point.body}</p>
                    <div>
                      <CheckIcon />
                      {point.point}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section income-section" id="bankruptcy-and-discharge">
          <div className="shell income-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">파산과 면책의 차이</p>
              <h2>
                파산선고가 곧
                <br />
                면책은 아닙니다
              </h2>
              <p>
                파산은 재산을 조사·정리하는 절차이고, 면책은 그 뒤 남은 채무에 대한
                책임을 면할지 판단하는 별도의 절차입니다.
              </p>
            </div>

            <div className="income-points">
              {procedurePoints.map((point) => (
                <article key={point.tag}>
                  <span>{point.tag}</span>
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section self-check-section" id="self-check">
          <div className="shell">
            <div className="self-check-heading">
              <div className="section-heading">
                <p className="eyebrow">상담 전 체크리스트</p>
                <h2>
                  유리한 자료만 고르지 말고
                  <br />
                  전체 흐름을 모아보세요
                </h2>
              </div>
              <p>
                처음부터 모든 증명서를 발급할 필요는 없습니다. 무엇이 있고 무엇을
                모르는지 표시해 두면 누락이나 서로 맞지 않는 설명을 줄일 수 있습니다.
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
              <h2>
                소득·재산 하나로
                <br />
                미리 단정하지 마세요
              </h2>
              <p>
                파산 신청자격과 면책 여부는 같은 질문이 아닙니다. 자주 혼동하는 지점을
                일반적인 기준으로 나누어 설명합니다.
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
                근거를 직접 확인할 수 있게
                <br />
                출처와 기준일을 남깁니다
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
                    href="https://law.go.kr/LSW/precInfoP.do?mode=0&precSeq=136520"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>대법원 판례</span>
                    2008마1904·1905 지급불능 판단 기준
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
              <h2 id="related-title">아직 어느 절차인지 판단하기 어렵다면</h2>
            </div>
            <div className="related-links">
              <a href="/bank/compare">
                <span>제도 비교</span>
                개인회생과 개인파산은 무엇이 다를까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-bankruptcy/process">
                <span>절차와 기간</span>
                신청 뒤 파산선고와 면책은 어떻게 진행될까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-bankruptcy/documents">
                <span>필요서류</span>
                채무·재산·소득과 최근 거래는 어떻게 준비할까
                <ArrowIcon />
              </a>
              <a href="/bank/situations/investment-debt">
                <span>주식·코인 채무</span>
                투자 거래와 면책 심사는 어떻게 다를까
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              지급불능과 면책을
              <br />
              따로 확인해 보세요.
            </>
          }
          body="현재 소득과 재산, 대략적인 채무, 채무가 늘어난 경위부터 말씀해 주세요. 파산 신청자격과 면책 심사에서 더 확인할 쟁점을 상담에서 함께 정리합니다."
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
