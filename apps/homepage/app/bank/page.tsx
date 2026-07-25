import type { Metadata } from "next";

const siteUrl = "https://lawandfirm.com";

export const metadata: Metadata = {
  title: "개인회생·개인파산, 조건부터 차분히",
  description:
    "개인회생과 개인파산 중 무엇을 확인해야 할지 소득·재산·채무 조건부터 알아보세요. 실제 고객후기와 사례를 살펴보고 법무법인 로앤에 상담을 요청할 수 있습니다.",
  alternates: {
    canonical: "/bank",
  },
  openGraph: {
    title: "개인회생·개인파산, 조건부터 차분히 | 법무법인 로앤",
    description:
      "빚의 크기보다 지금의 조건부터. 개인회생·개인파산의 차이와 확인할 쟁점을 차분히 안내합니다.",
    url: `${siteUrl}/bank`,
  },
};

const intents = [
  {
    number: "01",
    eyebrow: "정기적인 소득이 있다면",
    title: "개인회생 조건부터",
    body: "급여·사업·연금 등 계속될 수입과 채무·재산을 함께 확인합니다.",
    href: "#compare",
    link: "회생 기준 살펴보기",
  },
  {
    number: "02",
    eyebrow: "소득활동이 어렵다면",
    title: "개인파산·면책 조건부터",
    body: "현재 재산으로 채무를 갚기 어려운 상태와 면책 심사의 쟁점을 나누어 봅니다.",
    href: "#compare",
    link: "파산·면책 살펴보기",
  },
  {
    number: "03",
    eyebrow: "독촉·압류가 걱정된다면",
    title: "지금 확인할 순서부터",
    body: "받은 문서의 종류와 기한, 진행 중인 집행 절차를 먼저 구분해야 합니다.",
    href: "#first-check",
    link: "먼저 확인할 것",
  },
  {
    number: "04",
    eyebrow: "어느 제도인지 모르겠다면",
    title: "두 제도의 차이부터",
    body: "소득, 재산, 변제 재원이라는 세 가지 축으로 차분히 비교합니다.",
    href: "#compare",
    link: "차이 비교하기",
  },
];

const reviews = [
  {
    author: "황** 고객님",
    category: "개인회생 · 개시결정",
    date: "2026.07.22",
    text: "회생 개시결정 어려울뻔 했는데 노하우로 조정하시더니 잘 풀려서 결정났습니다. 중간중간 꼼꼼하고 친절하게 설명해주셔서 감사합니다",
  },
  {
    author: "박** 고객님",
    category: "개인회생 · 개시결정",
    date: "2023.12.05",
    text: "막막한 마음으로 알아보다가 법무법인 로앤 이라는 곳을 알았습니다. 후기가좋아 상담을하고 진행을 하여 개인회생 개시결정을 받게 되었습니다 상담도 너무 친절하시고 꼼꼼하고 정확한 일처리 감사합니다",
  },
  {
    author: "임** 고객님",
    category: "개인회생 · 개시결정",
    date: "2023.05.02",
    text: "법무법인 로앤 관계자분들 덕분에 아무 문제없이 개인회생 개시결정문을 받았습니다. 10여년 전의 채무들이고 다른 어렵고 복잡한 문제들이 많았는데, 친절하고 자세하게 개인회생 업무를 진행시켜주셔서 생각보다 빨리 오늘 개시결정문을 받아볼 수 있었습니다. 감사합니다.",
  },
];

const officeAddresses = [
  {
    city: "서울",
    address: "서울특별시 강남구 논현로87길 25 HB타워 3층, 4층",
  },
  {
    city: "대전",
    address: "대전광역시 서구 둔산중로78번길 26 민석타워 14층",
  },
  {
    city: "부산",
    address: "부산광역시 연제구 법원로 38 로펌빌딩 401호",
  },
];

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
  address: officeAddresses.map(({ city, address }) => ({
    "@type": "PostalAddress",
    streetAddress: address,
    addressLocality: city,
    addressCountry: "KR",
  })),
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

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7.1 3.8 9.7 8l-2.2 2a15.7 15.7 0 0 0 6.5 6.5l2-2.2 4.2 2.6-1.1 3.2c-.3.8-1.1 1.3-2 1.2C9.5 20.4 3.6 14.5 2.7 6.9c-.1-.9.4-1.7 1.2-2l3.2-1.1Z" />
    </svg>
  );
}

function Logo() {
  return (
    <span className="brand" aria-label="법무법인 로앤">
      <span className="brand-mark">LAW&amp;</span>
      <span className="brand-korean">법무법인 로앤</span>
    </span>
  );
}

export default function BankHomePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      <header className="site-header">
        <div className="shell header-inner">
          <a className="logo-link" href="/bank" aria-label="LAW& 법무법인 로앤 회생·파산 홈">
            <Logo />
          </a>

          <nav className="desktop-nav" aria-label="주요 메뉴">
            <a href="#compare">개인회생</a>
            <a href="#compare">개인파산·면책</a>
            <a href="#reviews">고객후기</a>
            <a href="#cases">사례</a>
            <a href="#about">로앤 소개</a>
          </nav>

          <a className="header-cta" href="#consultation">
            상담 요청
            <ArrowIcon />
          </a>

          <details className="mobile-menu">
            <summary aria-label="메뉴 열기">
              <span />
              <span />
              <span />
            </summary>
            <nav aria-label="모바일 메뉴">
              <a href="#compare">개인회생·개인파산 비교</a>
              <a href="#first-check">먼저 확인할 것</a>
              <a href="#cases">사례로 이해하기</a>
              <a href="#reviews">고객후기</a>
              <a href="#about">로앤 소개</a>
              <a href="#consultation">상담 요청</a>
            </nav>
          </details>
        </div>
      </header>

      <main id="main-content">
        <section className="hero">
          <div className="hero-glow" aria-hidden="true" />
          <div className="shell hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">개인회생 · 개인파산 · 면책</p>
              <h1>
                빚의 크기보다,
                <br />
                <span>지금의 조건부터 봅니다.</span>
              </h1>
              <p className="hero-description">
                소득·재산·채무와 현재 상황을 차분히 정리하고, 어떤 제도를 더 확인해야
                하는지 이해하기 쉽게 안내합니다.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#starting-points">
                  내 상황에 맞는 정보 찾기
                  <ArrowIcon />
                </a>
                <a className="button button-secondary" href="#consultation">
                  사람에게 상담 요청
                </a>
              </div>
              <p className="hero-assurance">
                <span aria-hidden="true">●</span>
                개인정보 입력 없이 먼저 둘러볼 수 있습니다.
              </p>
            </div>

            <aside className="hero-guide" aria-label="먼저 확인할 질문">
              <p className="guide-kicker">어디서부터 봐야 할지 모르겠다면</p>
              <h2>세 가지를 먼저 확인하세요</h2>
              <ol>
                <li>
                  <span>1</span>
                  앞으로 계속될 수입이 있나요?
                </li>
                <li>
                  <span>2</span>
                  현재 가진 재산과 담보채무는 어느 정도인가요?
                </li>
                <li>
                  <span>3</span>
                  독촉·소송·압류 등 급한 절차가 진행 중인가요?
                </li>
              </ol>
              <a href="#first-check">
                확인 순서 알아보기
                <ArrowIcon />
              </a>
            </aside>
          </div>

          <div className="shell trust-row" aria-label="서비스 원칙">
            <span>변호사 검토 정보</span>
            <span>과장 없는 제도 비교</span>
            <span>상담 전 최소 정보 수집</span>
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
                지금 가진 조건과 걱정에서 시작하면 됩니다.
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
              <h2>둘 중 하나를 서둘러 고르기보다<br />차이를 정확히 이해해야 합니다</h2>
              <p>
                개인회생은 장래의 계속적인 수입을 변제 재원으로 삼고, 개인파산은 현재
                재산으로 모든 채무를 변제할 수 없는 상태에서 파산과 면책을 심사하는
                절차입니다.
              </p>
            </div>

            <div className="compare-grid">
              <article className="compare-card compare-rehabilitation">
                <div className="compare-label">개인회생</div>
                <h3>계속될 수입이 있는 개인채무자</h3>
                <p>
                  급여·사업·연금 등 정기적인 수입 가능성을 바탕으로 법원이 인가한
                  변제계획을 수행하는 절차입니다.
                </p>
                <ul>
                  <li>
                    <CheckIcon />
                    앞으로 얻을 수입의 계속성
                  </li>
                  <li>
                    <CheckIcon />
                    무담보·담보 채무 한도
                  </li>
                  <li>
                    <CheckIcon />
                    재산가치와 월 변제 재원
                  </li>
                </ul>
                <a href="#first-check">
                  개인회생에서 확인할 것
                  <ArrowIcon />
                </a>
              </article>

              <article className="compare-card compare-bankruptcy">
                <div className="compare-label">개인파산 · 면책</div>
                <h3>현재 재산으로 채무 변제가 어려운 개인</h3>
                <p>
                  파산절차에서 재산을 정리하고, 별도의 면책 심사를 거쳐 남은 채무의
                  책임 면제 여부를 법원이 결정합니다.
                </p>
                <ul>
                  <li>
                    <CheckIcon />
                    현재의 지급불능 상태
                  </li>
                  <li>
                    <CheckIcon />
                    소득활동 가능성과 보유 재산
                  </li>
                  <li>
                    <CheckIcon />
                    면책불허가 사유와 예외 채무
                  </li>
                </ul>
                <a href="#first-check">
                  파산·면책에서 확인할 것
                  <ArrowIcon />
                </a>
              </article>
            </div>

            <div className="source-note">
              <span>공식 근거</span>
              <p>
                위 내용은 법원의 개인회생·개인파산 안내를 바탕으로 한 일반적인
                설명입니다. 실제 적용은 소득·재산·채무 구성과 법원 심사에 따라 달라질
                수 있습니다.
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
              <h2>금액 하나보다<br />조건의 조합이 중요합니다</h2>
              <p>
                같은 채무액이라도 소득의 형태, 재산의 가치, 가족 상황과 현재 진행 중인
                절차에 따라 먼저 확인할 쟁점이 달라집니다.
              </p>
              <a className="text-link" href="#consultation">
                내 조건을 정리해 상담 요청
                <ArrowIcon />
              </a>
            </div>

            <ol className="check-list">
              <li>
                <span>01</span>
                <div>
                  <h3>소득</h3>
                  <p>급여·사업·연금 등 수입의 종류와 앞으로 계속될 가능성</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>재산</h3>
                  <p>주거, 차량, 보험, 예금과 담보채무를 포함한 실제 가치</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>채무와 현재 단계</h3>
                  <p>채권자·채무 원인과 독촉, 지급명령, 소송, 압류 진행 여부</p>
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
                <h2>결과보다, 어떤 조건을 확인했는지 봅니다</h2>
              </div>
              <p>
                아래 사례는 기존 공개자료를 바탕으로 핵심 맥락만 정리했습니다.
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
                <h3>정기적인 소득으로 변제계획을 세운 경우</h3>
                <p>
                  월 소득만 보는 것이 아니라 재산가치, 가구 상황과 채무 구성을 함께
                  확인해 개인회생 절차를 진행한 사례입니다.
                </p>
                <div className="case-point">
                  <span>핵심 확인</span>
                  소득의 계속성과 월 변제 재원
                </div>
                <a href="#consultation">
                  내 상황과 다른 점 확인하기
                  <ArrowIcon />
                </a>
              </article>

              <article className="case-card">
                <div className="case-topline">
                  <span>개인파산 · 면책</span>
                  <span>건강 악화 · 소득활동 곤란</span>
                </div>
                <h3>건강 문제로 소득활동이 어려워진 경우</h3>
                <p>
                  현재 소득활동 가능성과 병원비로 증가한 채무의 경위, 보유 재산을 함께
                  확인해 파산·면책 절차를 진행한 사례입니다.
                </p>
                <div className="case-point">
                  <span>핵심 확인</span>
                  지급불능 상태와 면책 심사 쟁점
                </div>
                <a href="#consultation">
                  내 상황과 다른 점 확인하기
                  <ArrowIcon />
                </a>
              </article>
            </div>
          </div>
        </section>

        <section className="section review-section" id="reviews">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow light-eyebrow">고객후기</p>
                <h2>먼저 경험한 고객의<br />말을 그대로 전합니다</h2>
              </div>
              <div className="review-heading-copy">
                <p>
                  기존 로앤 홈페이지에 고객이 남긴 공개 후기 중 일부입니다. 원문의
                  표현과 작성 당시의 진행단계를 함께 표시했습니다.
                </p>
                <span>개별 사건의 결과는 사실관계와 시점에 따라 달라질 수 있습니다.</span>
              </div>
            </div>

            <div className="review-grid">
              {reviews.map((review) => (
                <figure className="review-card" key={`${review.author}-${review.date}`}>
                  <div className="quote-mark" aria-hidden="true">
                    “
                  </div>
                  <blockquote>{review.text}</blockquote>
                  <figcaption>
                    <span>{review.author}</span>
                    <span>{review.category}</span>
                    <time dateTime={review.date.replaceAll(".", "-")}>{review.date}</time>
                  </figcaption>
                </figure>
              ))}
            </div>

            <p className="review-migration-note">
              전체 고객후기는 개인정보와 공개 상태를 다시 확인한 뒤 순차적으로 이관합니다.
            </p>
          </div>
        </section>

        <section className="section about-section" id="about">
          <div className="shell about-grid">
            <div className="about-statement">
              <p className="eyebrow">LAW&amp; PRINCIPLE</p>
              <h2>
                불안을 키우지 않고,
                <br />
                다음 행동을 선명하게.
              </h2>
            </div>
            <div className="principle-grid">
              <article>
                <span>01</span>
                <h3>쉽고 정확한 설명</h3>
                <p>법률용어보다 고객이 지금 궁금해하는 질문의 언어로 설명합니다.</p>
              </article>
              <article>
                <span>02</span>
                <h3>사람이 책임지는 판단</h3>
                <p>자동화는 준비를 돕고, 법률 판단과 고객 안내는 사람이 책임집니다.</p>
              </article>
              <article>
                <span>03</span>
                <h3>계약 후에도 끊기지 않게</h3>
                <p>계약 후 사건 정보와 할 일은 리걸프렌즈에서 안전하게 공유합니다.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="consultation-section" id="consultation">
          <div className="shell consultation-grid">
            <div>
              <p className="eyebrow">사람에게 상담 요청</p>
              <h2>
                아직 어떤 절차인지
                <br />
                정하지 않아도 괜찮습니다.
              </h2>
            </div>
            <div className="consultation-copy">
              <p>
                지금 알고 있는 내용부터 말씀해 주세요. 상담 요청 단계에서는 주민등록번호,
                계좌번호나 원본 서류를 받지 않습니다.
              </p>
              <div className="consultation-actions">
                <a className="button button-inverse" href="tel:16708480">
                  <PhoneIcon />
                  1670-8480
                </a>
                <a className="button button-outline-light" href="mailto:lawand5@lawandfirm.com">
                  이메일로 문의
                  <ArrowIcon />
                </a>
              </div>
              <span>평일 오전 8시–오후 7시 · 주말 및 공휴일 휴무</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell">
          <div className="footer-top">
            <Logo />
            <div className="footer-links">
              <a href="#main-content">개인정보처리방침</a>
              <a href="#main-content">이용약관</a>
              <a href="#about">AI·자동화 원칙</a>
            </div>
          </div>
          <div className="office-grid">
            {officeAddresses.map((office) => (
              <address key={office.city}>
                <strong>{office.city} 사무소</strong>
                <span>{office.address}</span>
              </address>
            ))}
          </div>
          <div className="footer-bottom">
            <p>
              법무법인 로앤 · 대표변호사 김충환 · 사업자등록번호 783-86-00865
              <br />
              광고책임변호사 표시는 책임자 확정 후 배포 전에 반영합니다.
            </p>
            <p>© {new Date().getFullYear()} LAW&amp;. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <nav className="mobile-actions" aria-label="빠른 상담">
        <a href="tel:16708480">
          <PhoneIcon />
          전화 상담
        </a>
        <a href="#consultation">
          상담 요청
          <ArrowIcon />
        </a>
      </nav>

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
