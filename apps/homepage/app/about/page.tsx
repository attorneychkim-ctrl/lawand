import type { Metadata } from "next";

import { getReviewEvidence } from "@/lib/reviews";

import {
  ArrowIcon,
  ConsultationSection,
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "../bank/_components/site-chrome";
import { AboutConversation } from "./about-conversation";

const pagePath = "/about";

const offices = [
  {
    city: "서울",
    address: "서울특별시 강남구 논현로87길 25 HB타워 3층, 4층",
    telephone: "1670-8480",
    businessNumber: "783-86-00865",
  },
  {
    city: "대전",
    address: "대전광역시 서구 둔산중로78번길 26 민석타워 14층",
    telephone: "1566-8401",
    businessNumber: "372-85-00799",
  },
  {
    city: "부산",
    address: "부산광역시 연제구 법원로 38 로펌빌딩 401호",
    telephone: "1566-8406",
    businessNumber: "608-85-37517",
  },
] as const;

const stageLabels = new Map([
  ["consultation", "상담 후"],
  ["commencement", "개시·절차 진행"],
  ["discharge", "면책결정 후"],
  ["other", "그 밖의 시점"],
]);

export const metadata: Metadata = {
  title: "법무법인 로앤 소개",
  description:
    "법무법인 로앤의 일하는 방식, 실제 공개 고객후기 데이터, 서울·대전·부산 사무소와 사람 중심의 법률 판단·자동화 원칙을 확인하세요.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "법무법인 로앤 소개 | 큰말보다 확인 가능한 과정",
    description:
      "무엇을 중요하게 보는지 네 가지 질문에 답하고, 로앤의 실제 기록과 일하는 원칙을 확인해 보세요.",
    type: "website",
    url: `https://lawandfirm.com${pagePath}`,
  },
};

export const dynamic = "force-dynamic";

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    year: "numeric",
  })
    .format(value)
    .replaceAll(" ", "");
}

export default async function AboutPage() {
  const evidence = await getReviewEvidence();
  const maxStageCount = Math.max(
    ...evidence.stageCounts.map((stage) => stage.count),
  );

  const aboutPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "법무법인 로앤 소개",
    url: "https://lawandfirm.com/about",
    mainEntity: {
      "@type": "LegalService",
      name: "법무법인 로앤",
      legalName: "법무법인 로앤",
      identifier: "110146-0091058",
      telephone: "1670-8480",
      address: offices.map((office) => ({
        "@type": "PostalAddress",
        addressCountry: "KR",
        addressLocality: office.city,
        streetAddress: office.address,
      })),
    },
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <SiteHeader />

      <main id="main-content" className="about-page">
        <section className="about-hero">
          <div className="about-hero-rings" aria-hidden="true" />
          <div className="shell">
            <nav className="breadcrumb breadcrumb-light" aria-label="현재 위치">
              <a href="/bank">회생·파산 홈</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">로앤 소개</span>
            </nav>
            <div className="about-hero-grid">
              <div>
                <p className="eyebrow light-eyebrow">ABOUT LAW&amp;</p>
                <h1>
                  신뢰는 큰말보다,
                  <br />
                  <span>확인 가능한 과정에서</span>
                  <br />
                  시작된다고 믿습니다.
                </h1>
                <p className="about-hero-description">
                  법률 문제를 처음 마주한 사람에게 필요한 것은 결과를 앞세운
                  약속보다, 지금 무엇을 확인하고 누가 판단하며 다음 과정이
                  어떻게 이어지는지 알 수 있는 설명입니다.
                </p>
                <a className="button button-inverse" href="#conversation">
                  질문으로 로앤 알아보기
                  <ArrowIcon />
                </a>
              </div>

              <aside className="about-hero-ledger" aria-label="확인 가능한 로앤 정보">
                <p>확인 가능한 로앤</p>
                <dl>
                  <div>
                    <dt>현재 공개 고객후기</dt>
                    <dd>
                      {evidence.totalCount.toLocaleString("ko-KR")}
                      <span>건</span>
                    </dd>
                  </div>
                  <div>
                    <dt>후기 작성일 범위</dt>
                    <dd className="about-ledger-period">
                      {formatMonth(evidence.firstReviewDate)}
                      <span>—</span>
                      {formatMonth(evidence.latestReviewDate)}
                    </dd>
                  </div>
                  <div>
                    <dt>실제 사무소</dt>
                    <dd>
                      3<span>곳</span>
                    </dd>
                    <small>서울 · 대전 · 부산</small>
                  </div>
                </dl>
                <p>
                  출처가 불분명한 누적 상담·성공 숫자는 쓰지 않습니다. 공개
                  후기 원장과 공식 법인·사무소 정보처럼 확인 가능한 값만
                  표시합니다.
                </p>
              </aside>
            </div>
          </div>
        </section>

        <AboutConversation />

        <section className="about-principles">
          <div className="shell">
            <div className="about-section-heading">
              <div>
                <p className="eyebrow">HOW WE WORK</p>
                <h2>
                  답은 달라도,
                  <br />
                  일하는 기준은 같습니다.
                </h2>
              </div>
              <p>
                소개 페이지에서 무엇을 선택했든 실제 상담과 사건에서는 같은
                네 가지 기준을 적용합니다.
              </p>
            </div>
            <div className="about-principle-cards">
              <article>
                <span>01</span>
                <h3>결론 전에 사실부터</h3>
                <p>
                  채무액이나 소득 한 가지로 가능 여부를 단정하지 않습니다.
                  확인된 사실과 아직 필요한 자료를 먼저 구분합니다.
                </p>
              </article>
              <article>
                <span>02</span>
                <h3>범위와 변수까지 설명</h3>
                <p>
                  유리한 내용만 말하지 않습니다. 법원, 시점, 재산·소득과
                  사실관계에 따라 달라질 수 있는 변수도 함께 설명합니다.
                </p>
              </article>
              <article>
                <span>03</span>
                <h3>판단의 책임은 사람에게</h3>
                <p>
                  자동화는 접수와 정리, 누락 확인을 돕습니다. 법률 판단과
                  중요한 안내, 최종 결정은 사람이 책임집니다.
                </p>
              </article>
              <article>
                <span>04</span>
                <h3>다음 단계까지 끊기지 않게</h3>
                <p>
                  상담 접수, 담당 배정, 계약 뒤 사건 진행의 역할을 나누고
                  기록해 현재 단계와 다음 할 일이 이어지게 합니다.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="about-evidence" id="evidence">
          <div className="shell about-evidence-grid">
            <div className="about-evidence-copy">
              <p className="eyebrow light-eyebrow">EVIDENCE, NOT CLAIMS</p>
              <h2>
                우리가 잘한다고 말하기보다,
                <br />
                고객이 남긴 기록을 엽니다.
              </h2>
              <p>
                2016년 10월부터 현재까지 작성된 공개 후기의 원문·작성일·작성
                당시 단계를 보존하고 있습니다. 별점이나 ‘베스트 후기’로
                줄 세우지 않습니다.
              </p>
              <a className="button button-outline-light" href="/bank/reviews">
                공개 후기 원문 살펴보기
                <ArrowIcon />
              </a>
            </div>

            <div className="about-evidence-dashboard">
              <header>
                <span>공개 후기 원장</span>
                <strong>
                  {evidence.totalCount.toLocaleString("ko-KR")}
                  <small>건</small>
                </strong>
              </header>
              <div className="about-stage-chart">
                <p>작성 당시 단계</p>
                {evidence.stageCounts.map((item) => (
                  <div key={item.stage}>
                    <span>{stageLabels.get(item.stage) ?? "작성 당시"}</span>
                    <div>
                      <i
                        style={{
                          width: `${(item.count / maxStageCount) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>{item.count.toLocaleString("ko-KR")}</strong>
                  </div>
                ))}
              </div>
              <div className="about-keyword-ledger">
                <p>고객이 선택한 경험 키워드</p>
                <ol>
                  {evidence.topKeywords.map((item, index) => (
                    <li key={item.keyword}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{item.keyword}</strong>
                      <small>
                        {item.count.toLocaleString("ko-KR")}건
                      </small>
                    </li>
                  ))}
                </ol>
              </div>
              <footer>
                삭제 상태와 개인정보 검수 대기 후기는 집계에서 제외합니다.
                키워드는 한 후기에 여러 개가 선택될 수 있습니다.
              </footer>
            </div>
          </div>
        </section>

        <section className="about-system" id="automation">
          <div className="shell">
            <div className="about-section-heading">
              <div>
                <p className="eyebrow">HUMAN RESPONSIBILITY</p>
                <h2>
                  기술은 더 꼼꼼하게,
                  <br />
                  판단은 더 분명하게.
                </h2>
              </div>
              <p>
                로앤은 반복 업무를 자동화하지만 사람의 책임을 자동화하지
                않습니다.
              </p>
            </div>
            <div className="about-system-grid">
              <article>
                <span>자동화가 돕는 일</span>
                <ul>
                  <li>상담 요청을 빠뜨리지 않고 접수·분류하기</li>
                  <li>담당 배정과 외부 시스템 인계를 기록하기</li>
                  <li>자료와 진행 단계에서 누락될 수 있는 항목 찾기</li>
                  <li>긴 상담·문서의 요약 초안을 준비하기</li>
                </ul>
              </article>
              <article>
                <span>사람이 책임지는 일</span>
                <ul>
                  <li>개인회생·파산 적용 가능성과 법률 쟁점 판단</li>
                  <li>사실관계와 불확실성을 반영한 실제 상담</li>
                  <li>법원에 제출할 내용과 중요한 고객 안내 확정</li>
                  <li>사건 결과와 고객에게 미치는 영향에 대한 설명</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="about-offices" id="offices">
          <div className="shell">
            <div className="about-section-heading">
              <div>
                <p className="eyebrow">REAL PLACES, REAL CONTACT</p>
                <h2>
                  온라인에서 시작해도,
                  <br />
                  실제 사람과 장소로 이어집니다.
                </h2>
              </div>
              <div className="about-legal-identity">
                <span>법인등록번호 110146-0091058</span>
                <strong>대표변호사 김충환</strong>
              </div>
            </div>
            <div className="about-office-grid">
              {offices.map((office, index) => (
                <article key={office.city}>
                  <header>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{office.city} 사무소</strong>
                  </header>
                  <address>{office.address}</address>
                  <dl>
                    <div>
                      <dt>전화</dt>
                      <dd>
                        <a href={`tel:${office.telephone.replaceAll("-", "")}`}>
                          {office.telephone}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>사업자번호</dt>
                      <dd>{office.businessNumber}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              소개를 다 읽지 않아도,
              <br />
              궁금한 것부터 물어보세요.
            </>
          }
          body="현재 상황을 모두 정리하지 못했어도 괜찮습니다. 연락만 먼저 요청하거나, 알고 있는 범위에서 상황을 남길 수 있습니다."
        />
      </main>

      <SiteFooter />
      <MobileActions />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(aboutPageJsonLd),
        }}
      />
    </>
  );
}
