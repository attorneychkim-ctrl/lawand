import type { Metadata } from "next";

import {
  formatReviewDate,
  getRecentReviews,
  reviewAreaLabel,
  reviewStageLabel,
  type PublicReview,
} from "@/lib/reviews";

import {
  ArrowIcon,
  CheckIcon,
  ConsultationSection,
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "./_components/site-chrome";

const siteUrl = "https://lawandfirm.com";

export const metadata: Metadata = {
  title: "개인회생·개인파산, 무엇부터 확인해야 할까",
  description:
    "개인회생과 개인파산 중 어느 쪽을 봐야 할지, 소득·재산·채무부터 짚어보세요. 실제 고객후기와 사례를 함께 보고 법무법인 로앤에 상담을 요청할 수 있습니다.",
  alternates: {
    canonical: "/bank",
  },
  openGraph: {
    title: "개인회생·개인파산, 무엇부터 확인해야 할까 | 법무법인 로앤",
    description:
      "채무 금액보다 지금의 조건이 먼저입니다. 개인회생과 개인파산이 무엇이 다르고 무엇을 따져야 하는지 안내합니다.",
    url: `${siteUrl}/bank`,
  },
};

const intents = [
  {
    number: "01",
    eyebrow: "매달 들어오는 소득이 있다면",
    title: "개인회생이 맞을까",
    body: "급여·사업·연금처럼 앞으로도 이어질 소득이 있다면, 채무와 재산을 함께 놓고 봐야 합니다.",
    href: "/bank/personal-rehabilitation/eligibility",
    link: "개인회생 신청자격 보기",
  },
  {
    number: "02",
    eyebrow: "지금은 일하기 어렵다면",
    title: "개인파산·면책은 어떨까",
    body: "가진 재산으로 채무를 갚기 어려운 상태인지, 면책 심사에서는 무엇을 보는지 나눠서 짚어봅니다.",
    href: "/bank/personal-bankruptcy/eligibility",
    link: "파산·면책 기준 보기",
  },
  {
    number: "03",
    eyebrow: "독촉장·압류가 걱정된다면",
    title: "지금 뭘 먼저 해야 할까",
    body: "받은 문서가 무엇인지, 기한은 언제까지인지, 이미 시작된 절차가 있는지부터 구분해야 합니다.",
    href: "/bank/situations/collection-and-seizure",
    link: "독촉·압류 대응 보기",
  },
  {
    number: "04",
    eyebrow: "어느 쪽인지 모르겠다면",
    title: "두 제도는 뭐가 다를까",
    body: "소득, 재산, 변제 재원이라는 세 가지 축으로 나란히 놓고 보면 차이가 분명해집니다.",
    href: "/bank/compare",
    link: "차이 비교하기",
  },
];

const HOME_REVIEW_COUNT = 3;

const legalServiceJsonLd = {
  "@context": "https://schema.org",
  "@type": "LegalService",
  "@id": `${siteUrl}/#organization`,
  name: "법무법인 로앤",
  alternateName: "LAW&",
  url: siteUrl,
  telephone: "+82-1670-8480",
  email: "lawand5@lawandfirm.com",
  areaServed: "KR",
  address: [
    {
      "@type": "PostalAddress",
      streetAddress: "서울특별시 강남구 논현로87길 25 HB타워 3층, 4층",
      addressLocality: "서울",
      addressCountry: "KR",
    },
    {
      "@type": "PostalAddress",
      streetAddress: "대전광역시 서구 둔산중로78번길 26 민석타워 14층",
      addressLocality: "대전",
      addressCountry: "KR",
    },
    {
      "@type": "PostalAddress",
      streetAddress: "부산광역시 연제구 법원로 38 로펌빌딩 401호",
      addressLocality: "부산",
      addressCountry: "KR",
    },
  ],
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "08:00",
      closes: "19:00",
    },
  ],
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${siteUrl}/#website`,
  url: siteUrl,
  name: "법무법인 로앤",
  alternateName: "LAW&",
  inLanguage: "ko-KR",
  publisher: {
    "@id": `${siteUrl}/#organization`,
  },
};

// 공개 후기 원장을 5분 주기로 다시 읽어, 첫 화면의 응답 속도를 유지하면서도
// 새로 공개된 후기가 홈에 반영되게 한다.
export const revalidate = 300;

export default async function BankHomePage() {
  // 후기 조회가 실패해도 첫 화면의 나머지 안내와 상담 경로는 그대로 열려 있어야 한다.
  let reviews: PublicReview[] = [];
  try {
    reviews = await getRecentReviews(HOME_REVIEW_COUNT);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "homepage_recent_reviews_failed",
        message: error instanceof Error ? error.message : "unknown_error",
        occurredAt: new Date().toISOString(),
      }),
    );
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      <SiteHeader />

      <main id="main-content">
        <section className="hero">
          <div className="hero-glow" aria-hidden="true" />
          <div className="shell hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">개인회생 · 개인파산 · 면책</p>
              <h1>
                채무 금액보다,
                <br />
                <span>지금의 조건이 먼저입니다.</span>
              </h1>
              <p className="hero-description">
                같은 금액이라도 소득과 재산, 채무가 어떻게 얽혀 있느냐에 따라 확인할
                것이 달라집니다. 무엇을 먼저 봐야 하는지 순서대로 짚어드립니다.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#starting-points">
                  내 상황부터 짚어보기
                  <ArrowIcon />
                </a>
                <a
                  className="button button-secondary"
                  href="/bank/consultation"
                  data-consultation-cta="home-hero"
                >
                  바로 상담 요청하기
                </a>
              </div>
              <p className="hero-assurance">
                <span aria-hidden="true">●</span>
                이름이나 연락처를 남기지 않아도 끝까지 둘러볼 수 있습니다.
              </p>
            </div>

            <aside className="hero-guide" aria-label="먼저 확인할 질문">
              <p className="guide-kicker">어디서부터 봐야 할지 모르겠다면</p>
              <h2>이 세 가지를 먼저 떠올려 보세요</h2>
              <ol>
                <li>
                  <span>1</span>
                  매달 들어오는 소득이 있나요?
                </li>
                <li>
                  <span>2</span>
                  집·차·보험 같은 재산이 남아 있나요?
                </li>
                <li>
                  <span>3</span>
                  독촉이나 압류처럼 급한 일이 있나요?
                </li>
              </ol>
              <a href="#first-check">
                확인 순서 알아보기
                <ArrowIcon />
              </a>
            </aside>
          </div>

          <div className="shell trust-row" aria-label="서비스 원칙">
            <span>법령·법원 자료에 근거한 정보</span>
            <span>과장 없는 제도 비교</span>
            <span>꼭 필요한 정보만 수집</span>
          </div>
        </section>

        <section className="section section-intents" id="starting-points">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">지금 궁금한 것부터</p>
                <h2>내 상황과 가까운 질문을 골라보세요</h2>
              </div>
              <p>
                제도를 먼저 고를 필요는 없습니다.
                <br />
                지금의 형편과 걱정에서 출발하면 충분합니다.
              </p>
            </div>

            <div className="intent-grid">
              {intents.map((intent) => (
                <article className="intent-card" key={intent.number}>
                  <span className="card-number">{intent.number}</span>
                  <p>{intent.eyebrow}</p>
                  <h3>{intent.title}</h3>
                  <div className="card-rule" />
                  <p className="card-body">{intent.body}</p>
                  <a href={intent.href}>
                    {intent.link}
                    <ArrowIcon />
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section compare-section" id="compare">
          <div className="shell">
            <div className="section-heading centered-heading">
              <p className="eyebrow">개인회생과 개인파산</p>
              <h2>서둘러 고르기 전에<br />무엇이 다른지부터 봅니다</h2>
              <p>
                개인회생은 앞으로 들어올 소득을 재원으로 삼아 법원이 인가한 변제계획을
                이행하는 절차이고, 개인파산은 지금의 재산으로는 채무를 다 갚을 수 없는
                상태에서 파산과 면책을 심사받는 절차입니다.
              </p>
            </div>

            <div className="compare-grid">
              <article className="compare-card compare-rehabilitation">
                <div className="compare-label">개인회생</div>
                <h3>앞으로도 소득이 이어지는 분</h3>
                <p>
                  급여·사업·연금처럼 계속 들어올 소득을 근거로, 법원이 인가한 변제계획을
                  정해진 기간 동안 이행하는 절차입니다.
                </p>
                <ul>
                  <li>
                    <CheckIcon />
                    소득이 앞으로도 이어질 수 있는지
                  </li>
                  <li>
                    <CheckIcon />
                    담보·무담보 채무가 한도 안에 있는지
                  </li>
                  <li>
                    <CheckIcon />
                    재산 가치와 매달 갚을 수 있는 금액
                  </li>
                </ul>
                <a href="/bank/personal-rehabilitation">
                  개인회생에서 따져볼 것
                  <ArrowIcon />
                </a>
              </article>

              <article className="compare-card compare-bankruptcy">
                <div className="compare-label">개인파산 · 면책</div>
                <h3>지금 재산으로는 갚기 어려운 분</h3>
                <p>
                  파산 절차로 남은 재산을 정리한 뒤, 별도의 면책 심사를 거쳐 남은 채무의
                  책임을 면할지 법원이 판단합니다.
                </p>
                <ul>
                  <li>
                    <CheckIcon />
                    지금 채무를 갚을 수 없는 상태인지
                  </li>
                  <li>
                    <CheckIcon />
                    일해서 벌 수 있는 여력과 남은 재산
                  </li>
                  <li>
                    <CheckIcon />
                    면책이 막히는 사유나 예외 채무가 있는지
                  </li>
                </ul>
                <a href="/bank/personal-bankruptcy">
                  파산·면책에서 따져볼 것
                  <ArrowIcon />
                </a>
              </article>
            </div>

            <div className="source-note">
              <span>공식 근거</span>
              <p>
                위 설명은 법원의 개인회생·개인파산 안내를 바탕으로 정리한 일반적인
                내용입니다. 실제로 어떻게 적용되는지는 소득·재산·채무의 구성과 법원의
                심사에 따라 달라질 수 있습니다.
              </p>
              <a
                href="https://slb.scourt.go.kr/rel/information/qna/member_manual.pdf"
                target="_blank"
                rel="noreferrer"
              >
                서울회생법원 개인도산 자료 보기
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </section>

        <section className="section first-check-section" id="first-check">
          <div className="shell first-check-grid">
            <div className="section-heading">
              <p className="eyebrow">상담 전 확인 순서</p>
              <h2>같은 채무액이라도<br />확인할 것은 사람마다 다릅니다</h2>
              <p>
                소득의 형태, 재산의 가치, 가족 상황, 이미 시작된 절차. 이 중 하나만
                달라져도 먼저 확인해야 할 쟁점이 바뀝니다.
              </p>
              <a
                className="text-link"
                href="/bank/consultation"
                data-consultation-cta="home-first-check"
              >
                내 상황을 정리해 상담 요청하기
                <ArrowIcon />
              </a>
            </div>

            <ol className="check-list">
              <li>
                <span>01</span>
                <div>
                  <h3>소득</h3>
                  <p>급여·사업·연금 중 어떤 소득이 얼마나, 언제까지 이어질 수 있는지</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>재산</h3>
                  <p>집·차량·보험·예금에서 담보채무를 뺀 실제 가치가 얼마인지</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>채무와 현재 단계</h3>
                  <p>누구에게 왜 생긴 채무인지, 독촉·지급명령·소송·압류가 어디까지 왔는지</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="section cases-section" id="cases">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">사례로 이해하기</p>
                <h2>결과보다, 무엇을 확인했는지를 봅니다</h2>
              </div>
              <p>
                아래 사례는 기존 공개자료에서 핵심 맥락만 정리한 것입니다.
                <br />
                다른 사건의 결과를 보장하지 않습니다.
              </p>
            </div>

            <div className="case-grid">
              <article className="case-card">
                <div className="case-topline">
                  <span>개인회생</span>
                  <span>급여소득 · 1인 가구</span>
                </div>
                <h3>매달 들어오는 소득으로 변제계획을 세운 경우</h3>
                <p>
                  월 소득만 보지 않고 재산 가치와 가구 상황, 채무 구성을 함께 확인한 뒤
                  개인회생으로 진행한 사례입니다.
                </p>
                <div className="case-point">
                  <span>핵심 확인</span>
                  소득이 이어질 수 있는지, 매달 얼마를 갚을 수 있는지
                </div>
                <a
                  href="/bank/consultation"
                  data-consultation-cta="home-case-rehabilitation"
                >
                  내 상황은 어떤지 물어보기
                  <ArrowIcon />
                </a>
              </article>

              <article className="case-card">
                <div className="case-topline">
                  <span>개인파산 · 면책</span>
                  <span>건강 악화 · 소득활동 곤란</span>
                </div>
                <h3>건강 문제로 일을 계속하기 어려워진 경우</h3>
                <p>
                  지금 일할 수 있는 여력과 병원비로 늘어난 채무의 경위, 남은 재산을 함께
                  확인한 뒤 파산·면책으로 진행한 사례입니다.
                </p>
                <div className="case-point">
                  <span>핵심 확인</span>
                  채무를 갚을 수 없는 상태인지, 면책 심사에서 무엇을 보는지
                </div>
                <a
                  href="/bank/consultation"
                  data-consultation-cta="home-case-bankruptcy"
                >
                  내 상황은 어떤지 물어보기
                  <ArrowIcon />
                </a>
              </article>
            </div>
          </div>
        </section>

        {reviews.length > 0 ? (
          <section className="section review-section" id="reviews">
            <div className="shell">
              <div className="section-heading heading-row">
                <div>
                  <p className="eyebrow light-eyebrow">고객후기</p>
                  <h2>먼저 겪어본 분들의<br />말을 그대로 옮겼습니다</h2>
                </div>
                <div className="review-heading-copy">
                  <p>
                    로앤 홈페이지에 고객이 직접 남긴 공개 후기 중 가장 최근의
                    {" "}
                    {reviews.length}건입니다. 표현을 다듬지 않고 원문 그대로, 작성
                    당시의 진행 단계와 함께 싣습니다.
                  </p>
                  <span>개별 사건의 결과는 사실관계와 시점에 따라 달라질 수 있습니다.</span>
                </div>
              </div>

              <div className="review-grid">
                {reviews.map((review) => (
                  <figure className="review-card" key={review.id}>
                    <div className="quote-mark" aria-hidden="true">
                      “
                    </div>
                    <blockquote>{review.content}</blockquote>
                    <figcaption>
                      <span>{review.authorDisplay}</span>
                      <span>
                        {reviewAreaLabel(review.practiceArea)} ·{" "}
                        {reviewStageLabel(review.progressStage)}
                      </span>
                      <time dateTime={review.originalCreatedAt.toISOString()}>
                        {formatReviewDate(review.originalCreatedAt)}
                      </time>
                    </figcaption>
                  </figure>
                ))}
              </div>

              <a className="review-migration-note" href="/bank/reviews">
                고객이 직접 남긴 후기 전체 보기
                <ArrowIcon />
              </a>
            </div>
          </section>
        ) : null}

        <section className="section about-section" id="about">
          <div className="shell about-grid">
            <div className="about-statement">
              <p className="eyebrow">LAW&amp; PRINCIPLE</p>
              <h2>
                불안을 키우지 않고,
                <br />
                다음 행동을 선명하게.
              </h2>
              <a className="button button-secondary" href="/about">
                로앤의 일하는 방식
                <ArrowIcon />
              </a>
            </div>
            <div className="principle-grid">
              <article>
                <span>01</span>
                <h3>쉽고 정확한 설명</h3>
                <p>법률용어로 말하지 않습니다. 지금 궁금해하는 그 질문의 언어로 설명합니다.</p>
              </article>
              <article>
                <span>02</span>
                <h3>사람이 책임지는 판단</h3>
                <p>자동화는 준비를 도울 뿐, 법률 판단과 안내는 끝까지 사람이 책임집니다.</p>
              </article>
              <article>
                <span>03</span>
                <h3>계약 후에도 끊기지 않게</h3>
                <p>사건이 시작된 뒤에도 진행 상황과 할 일을 리걸프렌즈에서 함께 확인합니다.</p>
              </article>
            </div>
          </div>
        </section>

        <ConsultationSection />
      </main>

      <SiteFooter />
      <MobileActions />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legalServiceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
    </>
  );
}
