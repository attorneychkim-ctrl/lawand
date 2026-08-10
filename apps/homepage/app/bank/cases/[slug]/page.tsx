import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCaseStudyBySlug } from "@/lib/case-studies";
import { ADVERTISING_RESPONSIBLE_LAWYER_LABEL } from "@/lib/legal-identity";

import {
  ArrowIcon,
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "../../_components/site-chrome";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function formatWon(value: number) {
  return `약 ${(value / 10_000).toLocaleString("ko-KR")}만원`;
}

function formatIncomeStatus(value: number) {
  return value > 0 ? formatWon(value) : "소득 활동 없음";
}

function formatLiquidationValue(value: number) {
  return value > 0 ? formatWon(value) : "기록상 0원";
}

function formatGeneratedDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = await getCaseStudyBySlug(slug);
  if (!item) return {};

  return {
    alternates: { canonical: `/bank/cases/${item.slug}` },
    description: item.dek,
    openGraph: {
      description: item.dek,
      title: `${item.title} | 법무법인 로앤`,
      url: `https://lawandfirm.com/bank/cases/${item.slug}`,
    },
    robots:
      item.publicationStatus === "preview"
        ? { follow: false, index: false }
        : undefined,
    title: item.title,
  };
}

export const dynamic = "force-dynamic";

export default async function CaseStudyDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const item = await getCaseStudyBySlug(slug);
  if (!item) notFound();

  const figures = item.financialSnapshot;
  const allocationTotal = Math.max(
    1,
    figures.estimatedMonthlySpend + figures.monthlyPayment,
  );
  const spendRatio = Math.round(
    Math.min(100, (figures.estimatedMonthlySpend / allocationTotal) * 100) *
      100,
  ) / 100;
  const paymentRatio = Math.round(Math.max(0, 100 - spendRatio) * 100) / 100;
  const isPreview = item.publicationStatus === "preview";
  const isPersonalRehabilitation =
    item.practiceArea === "personal_rehabilitation";
  const practiceLabel =
    isPersonalRehabilitation
      ? "개인회생"
      : "개인파산·면책";
  const dischargeTiming = item.timeline.find(
    (step) => step.label === "면책허가",
  )?.timing;

  const articleJsonLd =
    item.publicationStatus === "published"
      ? {
          "@context": "https://schema.org",
          "@type": "Article",
          author: {
            "@type": "Organization",
            name: "법무법인 로앤",
          },
          datePublished: item.generatedAt.toISOString(),
          description: item.dek,
          headline: item.title,
          mainEntityOfPage: `https://lawandfirm.com/bank/cases/${item.slug}`,
          publisher: {
            "@type": "Organization",
            name: "법무법인 로앤",
          },
        }
      : null;

  return (
    <>
      <a className="skip-link" href="#case-study-content">
        사례 본문으로 바로가기
      </a>
      <SiteHeader />

      <main
        className={`case-study-detail${
          isPersonalRehabilitation ? "" : " case-study-detail-bankruptcy"
        }`}
        id="case-study-content"
      >
        {articleJsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
          />
        )}

        <section className="case-study-detail-hero">
          <div className="case-study-detail-orbit" aria-hidden="true" />
          <div className="shell case-study-detail-hero-grid">
            <div>
              <nav className="breadcrumb breadcrumb-light" aria-label="현재 위치">
                <a href="/bank">회생·파산 홈</a>
                <span aria-hidden="true">/</span>
                <Link href="/bank/cases">사례로 이해하기</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{practiceLabel}</span>
              </nav>
              <div className="case-study-detail-tags">
                {item.tags.slice(0, 6).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <h1>{item.title}</h1>
              <p>{item.dek}</p>
              <div className="case-study-detail-origin">
                <span>로앤 실제 사건 기반</span>
                <span>개인 식별정보 제거</span>
                <span>금액·기간 일반화</span>
              </div>
            </div>

            <aside aria-label="사례 핵심 수치">
              <span>반올림한 사례 수치</span>
              {isPersonalRehabilitation ? (
                <dl>
                  <div>
                    <dt>월 소득</dt>
                    <dd>{formatWon(figures.monthlyIncome)}</dd>
                  </div>
                  <div>
                    <dt>총 채무</dt>
                    <dd>{formatWon(figures.totalDebt)}</dd>
                  </div>
                  <div>
                    <dt>월 변제금</dt>
                    <dd>{formatWon(figures.monthlyPayment)}</dd>
                  </div>
                  <div>
                    <dt>변제기간</dt>
                    <dd>{figures.paymentCount}개월</dd>
                  </div>
                </dl>
              ) : (
                <dl>
                  <div>
                    <dt>소득 상태</dt>
                    <dd>{formatIncomeStatus(figures.monthlyIncome)}</dd>
                  </div>
                  <div>
                    <dt>총 채무</dt>
                    <dd>{formatWon(figures.totalDebt)}</dd>
                  </div>
                  <div>
                    <dt>청산가치</dt>
                    <dd>{formatLiquidationValue(figures.liquidationValue)}</dd>
                  </div>
                  <div>
                    <dt>면책허가</dt>
                    <dd>{dischargeTiming ?? "별도 심사"}</dd>
                  </div>
                </dl>
              )}
              <p>
                공개 조합과 같은 사건 {item.cohortSize}건 이상을 확인한 뒤 작성한
                사례입니다.
              </p>
            </aside>
          </div>
        </section>

        {isPreview && (
          <div className="shell case-study-preview-notice" role="note">
            <strong>로컬 피드백용 초안입니다.</strong>
            개인정보 검수와 책임 변호사의 법률·광고 검토, 공개 근거 확인 전에는 운영
            홈페이지에 노출되지 않습니다.
          </div>
        )}

        <article>
          <section className="case-study-opening">
            <div className="shell case-study-reading-column">
              <p className="eyebrow">먼저 이해할 점</p>
              <p className="case-study-opening-copy">{item.content.opening}</p>
            </div>
          </section>

          <section className="case-study-situation">
            <div className="shell case-study-two-column">
              <header>
                <span>01</span>
                <p className="eyebrow">출발 상황</p>
                <h2>
                  {isPersonalRehabilitation
                    ? "무엇이 겹쳐 있었을까요?"
                    : "왜 계속 갚기 어려운 상태였을까요?"}
                </h2>
              </header>
              <div>
                <p>{item.content.situation}</p>
                <dl className="case-study-fact-grid">
                  {isPersonalRehabilitation ? (
                    <>
                      <div>
                        <dt>담보 없는 채무</dt>
                        <dd>{formatWon(figures.unsecuredDebt)}</dd>
                      </div>
                      <div>
                        <dt>담보부 채무</dt>
                        <dd>
                          {figures.securedDebt > 0
                            ? formatWon(figures.securedDebt)
                            : "기록상 없음"}
                        </dd>
                      </div>
                      <div>
                        <dt>청산가치</dt>
                        <dd>{formatWon(figures.liquidationValue)}</dd>
                      </div>
                      <div>
                        <dt>자료상 변제율</dt>
                        <dd>약 {figures.repaymentRatePercent}%</dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt>현재 소득 상태</dt>
                        <dd>{formatIncomeStatus(figures.monthlyIncome)}</dd>
                      </div>
                      <div>
                        <dt>총 채무</dt>
                        <dd>{formatWon(figures.totalDebt)}</dd>
                      </div>
                      <div>
                        <dt>담보 없는 채무</dt>
                        <dd>{formatWon(figures.unsecuredDebt)}</dd>
                      </div>
                      <div>
                        <dt>청산가치</dt>
                        <dd>{formatLiquidationValue(figures.liquidationValue)}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>
            </div>
          </section>

          <section className="case-study-issues">
            <div className="shell">
              <div className="case-study-section-heading">
                <div>
                  <span>02</span>
                  <p className="eyebrow">핵심 쟁점</p>
                  <h2>숫자 뒤에서 확인한 조건</h2>
                </div>
                <p>
                  {isPersonalRehabilitation
                    ? "채무액 하나로 결론을 내리지 않고, 소득이 이어지는지와 재산이 어떻게 평가되는지를 함께 봅니다."
                    : "채무액만 비교하지 않고 현재와 장래의 지급능력, 보유·처분 재산, 채무 경위와 면책 쟁점을 함께 확인합니다."}
                </p>
              </div>
              <ol className="case-study-issue-grid">
                {item.content.keyIssues.map((issue, index) => (
                  <li key={issue.title}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <h3>{issue.title}</h3>
                    <p>{issue.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section
            className={`case-study-calculation${
              isPersonalRehabilitation ? "" : " case-study-bankruptcy-analysis"
            }`}
            id="case-study-financial-analysis"
          >
            <div className="shell case-study-calculation-grid">
              <div>
                <span>03</span>
                <p className="eyebrow light-eyebrow">
                  {isPersonalRehabilitation
                    ? "변제금 이해하기"
                    : "지급불능 이해하기"}
                </p>
                <h2>
                  {isPersonalRehabilitation ? (
                    <>
                      월 소득이
                      <br />
                      어떻게 나뉘었을까요?
                    </>
                  ) : (
                    <>
                      월 변제금이 아니라
                      <br />
                      갚을 능력을 봅니다.
                    </>
                  )}
                </h2>
                <p>{item.content.calculation}</p>
              </div>
              {isPersonalRehabilitation ? (
                <div className="case-study-allocation-card">
                  <header>
                    <span>월 소득</span>
                    <strong>{formatWon(figures.monthlyIncome)}</strong>
                  </header>
                  <div className="case-study-allocation-bar" aria-hidden="true">
                    <span style={{ width: `${spendRatio}%` }} />
                    <span style={{ width: `${paymentRatio}%` }} />
                  </div>
                  <dl>
                    <div>
                      <dt>
                        <i className="is-spend" /> 예상 지출
                      </dt>
                      <dd>{formatWon(figures.estimatedMonthlySpend)}</dd>
                    </div>
                    <div>
                      <dt>
                        <i className="is-payment" /> 월 변제금
                      </dt>
                      <dd>{formatWon(figures.monthlyPayment)}</dd>
                    </div>
                  </dl>
                  <div className="case-study-plan-summary">
                    <div>
                      <span>명목 총변제액</span>
                      <strong>{formatWon(figures.totalPayment)}</strong>
                    </div>
                    <div>
                      <span>변제 횟수</span>
                      <strong>{figures.paymentCount}회</strong>
                    </div>
                  </div>
                  {figures.additionalLivingCost > 0 && (
                    <div className="case-study-additional-cost">
                      <div>
                        <span>기록상 별도 반영된 추가생계비</span>
                        <strong>
                          {figures.additionalLivingCostType} ·{" "}
                          {formatWon(figures.additionalLivingCost)}
                        </strong>
                      </div>
                      <p>
                        지출만으로 자동 인정되지는 않으며, 필요성·계속성·증빙을 함께
                        확인합니다.
                      </p>
                    </div>
                  )}
                  <small>
                    금액은 비식별화를 위해 반올림했습니다. 월 금액의 단순 곱과 원천
                    총액은 반올림 때문에 차이가 날 수 있습니다.
                  </small>
                </div>
              ) : (
                <div className="case-study-bankruptcy-analysis-card">
                  <header>
                    <span>사건 자료의 재정 구조</span>
                    <strong>{formatWon(figures.totalDebt)}</strong>
                    <small>확인한 총 채무</small>
                  </header>
                  <dl>
                    <div>
                      <dt>현재 월소득</dt>
                      <dd>{formatIncomeStatus(figures.monthlyIncome)}</dd>
                    </div>
                    <div>
                      <dt>담보부 채무</dt>
                      <dd>
                        {figures.securedDebt > 0
                          ? formatWon(figures.securedDebt)
                          : "기록상 없음"}
                      </dd>
                    </div>
                    <div>
                      <dt>처분·배당 관점의 청산가치</dt>
                      <dd>{formatLiquidationValue(figures.liquidationValue)}</dd>
                    </div>
                  </dl>
                  <ol>
                    <li>
                      <span>01</span>
                      <div>
                        <strong>지급능력 확인</strong>
                        <p>현재와 장래의 소득으로 채무를 계속 갚을 수 있는지 봅니다.</p>
                      </div>
                    </li>
                    <li>
                      <span>02</span>
                      <div>
                        <strong>재산관계 확인</strong>
                        <p>예금·보험·차량·보증금과 최근 처분 내역을 자료로 확인합니다.</p>
                      </div>
                    </li>
                    <li>
                      <span>03</span>
                      <div>
                        <strong>별도 면책심사</strong>
                        <p>면책불허가 사유와 책임이 남는 비면책채권을 구분합니다.</p>
                      </div>
                    </li>
                  </ol>
                  <small>
                    청산가치가 기록상 0원이어도 재산 확인 절차가 생략된다는 뜻은
                    아닙니다. 공개 수치는 비식별화를 위해 반올림했습니다.
                  </small>
                </div>
              )}
            </div>
          </section>

          <section className="case-study-principles">
            <div className="shell case-study-principles-grid">
              {isPersonalRehabilitation ? (
                <>
                  <div>
                    <p className="eyebrow">청산가치 보장</p>
                    <h2>명목 총액만 비교하면 안 됩니다.</h2>
                    <p>{item.content.liquidationValueNote}</p>
                    <a href="/bank/personal-rehabilitation/repayment">
                      개인회생 변제금 산정 구조 보기
                      <ArrowIcon />
                    </a>
                  </div>
                  <div>
                    <p className="eyebrow">자녀 수와 부양가족</p>
                    <h2>가족관계와 인정 생계비는 다릅니다.</h2>
                    <p>{item.content.familyNote}</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="eyebrow">재산과 청산가치</p>
                    <h2>재산을 어떻게 정리할지도 확인합니다.</h2>
                    <p>{item.content.liquidationValueNote}</p>
                    <a href="/bank/personal-bankruptcy/eligibility">
                      개인파산·면책 기준 보기
                      <ArrowIcon />
                    </a>
                  </div>
                  <div>
                    <p className="eyebrow">파산선고와 면책</p>
                    <h2>파산선고만으로 채무가 없어지지는 않습니다.</h2>
                    <p>
                      파산선고 뒤에도 면책불허가 사유를 따로 심사하고, 면책허가가
                      확정되어야 면책의 효력이 생깁니다. 조세·벌금·일부 손해배상·
                      양육비처럼 법에서 정한 채권은 면책 후에도 책임이 남을 수 있습니다.
                    </p>
                  </div>
                  <div className="case-study-bankruptcy-family-note">
                    <p className="eyebrow">생계와 가족관계 자료</p>
                    <h2>가족 수 하나로 지급불능을 단정하지 않습니다.</h2>
                    <p>{item.content.familyNote}</p>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="case-study-process">
            <div className="shell">
              <div className="case-study-section-heading">
                <div>
                  <span>04</span>
                  <p className="eyebrow">절차의 흐름</p>
                  <h2>
                    {isPersonalRehabilitation
                      ? "실제 경과일로 본 접수부터 인가까지"
                      : "실제 경과일로 본 파산선고와 면책허가"}
                  </h2>
                </div>
                <p>{item.content.processExplanation}</p>
              </div>
              <ol className="case-study-process-list">
                {item.timeline.map((step, index) => (
                  <li key={step.label}>
                    <div>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <i aria-hidden="true" />
                    </div>
                    <small>{step.timing}</small>
                    <h3>{step.label}</h3>
                    <p>{step.description}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="case-study-outcome">
            <div className="shell case-study-outcome-grid">
              <div>
                <span>05</span>
                <p className="eyebrow light-eyebrow">
                  {isPersonalRehabilitation ? "확인된 결과" : "면책심사 결과"}
                </p>
                <h2>
                  {isPersonalRehabilitation
                    ? "인가 이후가 끝은 아닙니다."
                    : "파산선고 뒤, 별도로 면책을 허가받았습니다."}
                </h2>
              </div>
              <p>{item.content.outcome}</p>
            </div>
          </section>

          <section className="case-study-differences">
            <div className="shell case-study-differences-grid">
              <div>
                <p className="eyebrow">내 사건과 달라질 수 있는 점</p>
                <h2>사례의 숫자를 그대로 대입하지 마세요.</h2>
              </div>
              <ul>
                {item.content.differences.map((difference) => (
                  <li key={difference}>{difference}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="case-study-lawand-note">
            <div className="shell case-study-lawand-note-inner">
              <div>
                <p className="eyebrow">로앤이 확인하는 방식</p>
                <p>{item.content.lawandNote}</p>
              </div>
              <a
                className="button button-inverse"
                href="/bank/consultation"
                data-consultation-cta="case-study-detail"
              >
                내 조건을 정리해 상담 요청
                <ArrowIcon />
              </a>
            </div>
          </section>

          <section className="case-study-sources">
            <div className="shell case-study-sources-grid">
              <div>
                <p className="eyebrow">공식 근거</p>
                <h2>법률 설명은 현행 법령과 법원 안내를 확인했습니다.</h2>
              </div>
              <div>
                {isPersonalRehabilitation ? (
                  <ul>
                    <li>
                      <a
                        href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제579조"
                        target="_blank"
                        rel="noreferrer"
                      >
                        국가법령정보센터 · 제579조 가용소득
                        <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제611조"
                        target="_blank"
                        rel="noreferrer"
                      >
                        국가법령정보센터 · 제611조 변제계획
                        <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제614조"
                        target="_blank"
                        rel="noreferrer"
                      >
                        국가법령정보센터 · 제614조 인가요건
                        <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://scourt.go.kr/nm/min_2/min_2_2/min_2_2_3/index.html"
                        target="_blank"
                        rel="noreferrer"
                      >
                        대한민국 법원 · 개인회생 관련용어
                        <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                  </ul>
                ) : (
                  <ul>
                    <li>
                      <a
                        href="https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0305&lsiSeq=267359&urlMode=lsScJoRltInfoR"
                        target="_blank"
                        rel="noreferrer"
                      >
                        국가법령정보센터 · 제305조 지급불능과 파산원인
                        <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1028276011"
                        target="_blank"
                        rel="noreferrer"
                      >
                        국가법령정보센터 · 제564조 면책허가
                        <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033090089"
                        target="_blank"
                        rel="noreferrer"
                      >
                        국가법령정보센터 · 제566조 면책의 효력
                        <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://www.scourt.go.kr/nm/min_2/min_2_1/min_2_1_5/index.html"
                        target="_blank"
                        rel="noreferrer"
                      >
                        대한민국 법원 · 파산 및 면책 동시신청 안내
                        <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                  </ul>
                )}
                <dl className="article-meta">
                  <div>
                    <dt>사례 편집</dt>
                    <dd>법무법인 로앤 콘텐츠팀</dd>
                  </div>
                  <div>
                    <dt>광고책임변호사</dt>
                    <dd>{ADVERTISING_RESPONSIBLE_LAWYER_LABEL}</dd>
                  </div>
                  <div>
                    <dt>{isPreview ? "초안 생성" : "공개일"}</dt>
                    <dd>
                      <time dateTime={item.generatedAt.toISOString()}>
                        {formatGeneratedDate(item.generatedAt)}
                      </time>
                    </dd>
                  </div>
                </dl>
                <p className="case-study-source-caution">
                  사례의 공개 수치는 반올림·범주화한 값입니다. 다른 사건의 결과를
                  보장하지 않으며 법령·법원 실무와 사실관계가 달라지면 설명의 적용도
                  달라질 수 있습니다.
                </p>
              </div>
            </div>
          </section>
        </article>

        <section className="case-study-next">
          <div className="shell case-study-next-inner">
            <div>
              <p className="eyebrow light-eyebrow">CASE BY CASE</p>
              <h2>
                {isPersonalRehabilitation
                  ? "내 상황에서는 어떤 숫자를 먼저 확인해야 할까요?"
                  : "내 상황에서는 지급능력과 재산을 어떻게 확인할까요?"}
              </h2>
              <p>
                {isPersonalRehabilitation
                  ? "소득·채무·재산·가족 상황을 정리해 남기면 상담할 때 확인할 쟁점을 구체화할 수 있습니다."
                  : "현재 소득과 채무, 보유·처분 재산, 채무가 생긴 경위를 정리하면 파산과 면책에서 확인할 쟁점을 구체화할 수 있습니다."}
              </p>
            </div>
            <div>
              <a
                className="button button-inverse"
                href="/bank/self-diagnosis"
              >
                유사사례 5건 찾아보기
                <ArrowIcon />
              </a>
              <a
                className="button button-outline-light"
                href="/bank/consultation"
                data-consultation-cta="case-study-bottom"
              >
                상담 요청하기
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <MobileActions />
    </>
  );
}
