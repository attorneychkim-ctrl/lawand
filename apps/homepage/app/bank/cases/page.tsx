import type { Metadata } from "next";

import { getCaseStudies } from "@/lib/case-studies";

import {
  ArrowIcon,
  ConsultationSection,
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "../_components/site-chrome";

export const metadata: Metadata = {
  alternates: { canonical: "/bank/cases" },
  description:
    "실제 개인회생·파산 사건을 비식별화해 소득·채무·재산, 변제금 산정과 면책 심사, 법원 절차를 이해하기 쉽게 설명합니다.",
  openGraph: {
    description:
      "결과만 나열하지 않고 실제 사건에서 확인한 소득·재산·가족 조건과 절차의 흐름을 살펴봅니다.",
    title: "사례로 이해하는 개인회생·파산 | 법무법인 로앤",
    url: "https://lawandfirm.com/bank/cases",
  },
  title: "사례로 이해하는 개인회생·파산",
};

export const dynamic = "force-dynamic";

function formatWon(value: number) {
  return `약 ${(value / 10_000).toLocaleString("ko-KR")}만원`;
}

function formatIncomeStatus(value: number) {
  return value > 0 ? formatWon(value) : "소득 활동 없음";
}

function formatLiquidationValue(value: number) {
  return value > 0 ? formatWon(value) : "기록상 0원";
}

export default async function CaseStudiesPage() {
  const cases = await getCaseStudies();

  return (
    <>
      <a className="skip-link" href="#case-study-list">
        사례 목록으로 바로가기
      </a>
      <SiteHeader />

      <main className="case-studies-page">
        <section className="case-studies-hero">
          <div className="case-studies-hero-orbit" aria-hidden="true" />
          <div className="shell case-studies-hero-grid">
            <div>
              <nav className="breadcrumb breadcrumb-light" aria-label="현재 위치">
                <a href="/bank">회생·파산 홈</a>
                <span aria-hidden="true">/</span>
                <span aria-current="page">사례로 이해하기</span>
              </nav>
              <p className="eyebrow light-eyebrow">REAL CASE, CLEAR CONTEXT</p>
              <h1>
                결과보다,
                <br />
                <span>판단과 과정을 봅니다.</span>
              </h1>
              <p>
                로앤이 진행한 실제 사건에서 직접 식별정보를 없애고 금액과 시점을
                넓게 다듬었습니다. 개인회생·파산을 고민하는 분이 자신의 상황과 다른
                점까지 이해할 수 있도록 출발 조건부터 설명합니다.
              </p>
              <a className="button button-inverse" href="#case-study-list">
                첫 사례 읽어보기
                <ArrowIcon />
              </a>
            </div>

            <aside className="case-studies-method" aria-label="사례 공개 원칙">
              <span>사례 공개 원칙</span>
              <ol>
                <li>
                  <strong>01</strong>
                  이름·전화·사건번호·직장명·주소 제거
                </li>
                <li>
                  <strong>02</strong>
                  금액 반올림, 정확한 날짜는 경과기간으로 변환
                </li>
                <li>
                  <strong>03</strong>
                  결과 보장이 아닌 판단·쟁점·절차 중심 설명
                </li>
              </ol>
              <p>
                같은 제도라도 소득·재산·가족·채권 구조와 법원 심사에 따라 결과와
                기간은 달라질 수 있습니다.
              </p>
            </aside>
          </div>
        </section>

        <section className="case-studies-library" id="case-study-list">
          <div className="shell">
            <div className="case-studies-library-heading">
              <div>
                <p className="eyebrow">사례로 이해하기</p>
                <h2>한 사건씩, 확인한 이유까지 풀어냅니다.</h2>
              </div>
              <p>
                공개 사례의 숫자는 이해를 위한 반올림 값입니다. 내 사건의 예상
                변제금이나 결론으로 그대로 대입할 수 없습니다.
              </p>
            </div>

            {cases.length === 0 ? (
              <div className="case-studies-empty">
                <strong>검수를 마친 사례를 준비하고 있습니다.</strong>
                <p>
                  공개 근거와 비식별화, 법률 설명 검토가 끝난 사례부터 한 건씩
                  추가합니다.
                </p>
              </div>
            ) : (
              <div className="case-studies-grid">
                {cases.map((item, index) => {
                  const isPersonalRehabilitation =
                    item.practiceArea === "personal_rehabilitation";
                  const dischargeTiming = item.timeline.find(
                    (step) => step.label === "면책허가",
                  )?.timing;

                  return (
                    <article
                      className={`case-study-list-card${
                        isPersonalRehabilitation ? "" : " is-bankruptcy"
                      }`}
                      key={item.id}
                    >
                    <div className="case-study-list-number">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {item.publicationStatus === "preview" && (
                        <em>로컬 검수용 초안</em>
                      )}
                    </div>
                    <div className="case-study-list-tags">
                      {item.tags.slice(0, 5).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.dek}</p>
                    {isPersonalRehabilitation ? (
                      <dl>
                        <div>
                          <dt>월 소득</dt>
                          <dd>{formatWon(item.financialSnapshot.monthlyIncome)}</dd>
                        </div>
                        <div>
                          <dt>총 채무</dt>
                          <dd>{formatWon(item.financialSnapshot.totalDebt)}</dd>
                        </div>
                        <div>
                          <dt>월 변제금</dt>
                          <dd>{formatWon(item.financialSnapshot.monthlyPayment)}</dd>
                        </div>
                        <div>
                          <dt>변제기간</dt>
                          <dd>{item.financialSnapshot.paymentCount}개월</dd>
                        </div>
                      </dl>
                    ) : (
                      <div className="case-study-bankruptcy-summary">
                        <div>
                          <span>확인한 총 채무</span>
                          <strong>
                            {formatWon(item.financialSnapshot.totalDebt)}
                          </strong>
                        </div>
                        <ol aria-label="파산·면책 사례의 확인 흐름">
                          <li>
                            <span>01</span>
                            <strong>지급능력</strong>
                            <small>
                              {formatIncomeStatus(
                                item.financialSnapshot.monthlyIncome,
                              )}
                            </small>
                          </li>
                          <li>
                            <span>02</span>
                            <strong>재산 확인</strong>
                            <small>
                              청산가치 {formatLiquidationValue(
                                item.financialSnapshot.liquidationValue,
                              )}
                            </small>
                          </li>
                          <li>
                            <span>03</span>
                            <strong>면책심사</strong>
                            <small>{dischargeTiming ?? "별도 심사"}</small>
                          </li>
                        </ol>
                      </div>
                    )}
                    <div className="case-study-list-point">
                      <span>핵심 쟁점</span>
                      <strong>{item.content.keyIssues[0]?.title}</strong>
                    </div>
                    <a href={`/bank/cases/${item.slug}`}>
                      {isPersonalRehabilitation
                        ? "변제금과 절차 자세히 보기"
                        : "파산선고와 면책 과정 보기"}
                      <ArrowIcon />
                    </a>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="case-studies-boundary">
          <div className="shell case-studies-boundary-grid">
            <p className="eyebrow">사례를 읽을 때</p>
            <div>
              <h2>닮은 숫자보다 다른 조건을 먼저 보세요.</h2>
              <p>
                월 소득과 채무액이 같아도 실제 부양관계, 재산 평가, 최근 거래,
                우선권 있는 채권, 소득의 계속성에 따라 적용 절차와 심사 결과는
                달라집니다. 사례는 법률 판단을 대신하는 답이 아니라 상담 전에 질문을
                구체화하는 자료입니다.
              </p>
            </div>
          </div>
        </section>

        <ConsultationSection />
      </main>

      <SiteFooter />
      <MobileActions />
    </>
  );
}
