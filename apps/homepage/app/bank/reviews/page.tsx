import type { Metadata } from "next";

import {
  formatReviewDate,
  getReviewPage,
  parseReviewFilters,
  reviewAreaLabel,
  reviewAreaOptions,
  reviewKeywordOptions,
  reviewStageLabel,
  reviewStageOptions,
  type ReviewFilters,
} from "@/lib/reviews";

import {
  ArrowIcon,
  ConsultationSection,
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "../_components/site-chrome";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function filterHref(
  filters: ReviewFilters,
  overrides: Partial<ReviewFilters>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.area !== "all") params.set("area", next.area);
  if (next.stage !== "all") params.set("stage", next.stage);
  if (next.keyword !== "전체") params.set("keyword", next.keyword);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/bank/reviews?${query}` : "/bank/reviews";
}

function pageNumbers(current: number, count: number) {
  const start = Math.max(1, Math.min(current - 2, count - 4));
  const end = Math.min(count, Math.max(current + 2, 5));
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const raw = await searchParams;
  const hasFilters = Object.values(raw).some((value) => value !== undefined);

  return {
    alternates: {
      canonical: "/bank/reviews",
    },
    description:
      "개인회생·파산을 먼저 겪은 고객이 직접 남긴 후기 원문을 분야, 진행 단계, 경험 키워드별로 살펴보세요.",
    openGraph: {
      description:
        "결과를 약속하는 문구가 아니라, 상담부터 개시·면책까지 고객이 직접 남긴 경험을 원문 그대로 전합니다.",
      title: "고객이 직접 남긴 개인회생·파산 후기 | 법무법인 로앤",
      url: "https://lawandfirm.com/bank/reviews",
    },
    robots: hasFilters ? { follow: true, index: false } : undefined,
    title: "고객이 직접 남긴 개인회생·파산 후기",
  };
}

export const dynamic = "force-dynamic";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const filters = parseReviewFilters({
    area: firstValue(raw.area),
    keyword: firstValue(raw.keyword),
    page: firstValue(raw.page),
    stage: firstValue(raw.stage),
  });
  const data = await getReviewPage(filters);
  const numbers = pageNumbers(data.filters.page, data.pageCount);
  const hasActiveFilters =
    data.filters.area !== "all" ||
    data.filters.stage !== "all" ||
    data.filters.keyword !== "전체";

  return (
    <>
      <a className="skip-link" href="#review-list">
        후기 목록으로 바로가기
      </a>
      <SiteHeader />

      <main>
        <section className="reviews-hero">
          <div className="reviews-hero-orbit" aria-hidden="true" />
          <div className="shell reviews-hero-grid">
            <div className="reviews-hero-copy">
              <nav className="breadcrumb breadcrumb-light" aria-label="현재 위치">
                <a href="/bank">회생·파산 홈</a>
                <span aria-hidden="true">/</span>
                <span aria-current="page">고객후기</span>
              </nav>
              <p className="eyebrow light-eyebrow">CLIENT VOICES</p>
              <h1>
                먼저 지나온 사람의 말이
                <br />
                <span>막막함을 조금 덜어주기를.</span>
              </h1>
              <p className="reviews-hero-description">
                결과만 앞세운 성공담이 아니라, 상담을 결심한 순간부터 개시와
                면책까지 고객이 직접 남긴 말입니다. 내 상황과 닮은 경험부터
                천천히 찾아보세요.
              </p>
              <div className="reviews-hero-actions">
                <a className="button button-inverse" href="#review-finder">
                  나와 비슷한 후기 찾기
                  <ArrowIcon />
                </a>
                <a
                  className="button button-outline-light"
                  href="/bank/consultation"
                  data-consultation-cta="reviews-hero"
                >
                  내 상황 상담 요청
                </a>
                <a
                  className="reviews-write-link"
                  href="/bank/reviews/write"
                >
                  로앤과 함께하셨나요? 후기 남기기
                  <ArrowIcon />
                </a>
              </div>
            </div>

            <aside className="reviews-proof" aria-label="후기 원천 정보">
              <span className="reviews-proof-kicker">직접 남긴 공개 후기</span>
              <strong>{data.totalCount.toLocaleString("ko-KR")}</strong>
              <span>건</span>
              <p>
                {data.oldestYear}년부터 기존 로앤 홈페이지에 쌓인 후기를
                개인정보 점검 후 옮겼습니다.
              </p>
              <dl>
                <div>
                  <dt>개인회생</dt>
                  <dd>
                    {data.areaCounts.personalRehabilitation.toLocaleString(
                      "ko-KR",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>파산·면책</dt>
                  <dd>
                    {data.areaCounts.personalBankruptcy.toLocaleString("ko-KR")}
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

        <section className="reviews-values" aria-labelledby="reviews-values-title">
          <div className="shell reviews-values-grid">
            <div>
              <p className="eyebrow">후기에 가장 자주 남은 말</p>
              <h2 id="reviews-values-title">
                사람들은 결과만큼
                <br />
                과정의 태도를 기억했습니다.
              </h2>
            </div>
            <ol aria-label="고객 경험 키워드">
              {data.topKeywords.map((item, index) => (
                <li key={item.keyword}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.keyword}</strong>
                  <small>{item.count.toLocaleString("ko-KR")}개의 후기</small>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="reviews-finder" id="review-finder">
          <div className="shell">
            <div className="reviews-finder-heading">
              <div>
                <p className="eyebrow">내 상황과 가까운 경험</p>
                <h2>지금 궁금한 과정부터 골라보세요.</h2>
              </div>
              <p>
                후기는 법률 판단이나 결과 보장이 아닙니다. 작성 당시의 분야와
                진행 단계는 후기의 맥락을 이해하기 위한 기준입니다.
              </p>
            </div>

            <form className="reviews-filter" action="/bank/reviews" method="get">
              <label>
                <span>분야</span>
                <select name="area" defaultValue={data.filters.area}>
                  {reviewAreaOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>작성 당시 단계</span>
                <select name="stage" defaultValue={data.filters.stage}>
                  {reviewStageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>고객이 느낀 도움</span>
                <select name="keyword" defaultValue={data.filters.keyword}>
                  {reviewKeywordOptions.map((keyword) => (
                    <option key={keyword} value={keyword}>
                      {keyword}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button button-primary" type="submit">
                후기 찾아보기
                <ArrowIcon />
              </button>
            </form>

            <div className="reviews-quick-filters" aria-label="빠른 후기 필터">
              {reviewKeywordOptions.slice(1).map((keyword) => (
                <a
                  aria-current={
                    data.filters.keyword === keyword ? "page" : undefined
                  }
                  href={filterHref(data.filters, { keyword, page: 1 })}
                  key={keyword}
                >
                  {keyword}
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="reviews-list-section" id="review-list">
          <div className="shell">
            <div className="reviews-results-heading">
              <div>
                <p>
                  {hasActiveFilters ? "선택한 조건의 후기" : "최근 공개 후기"}
                </p>
                <h2>
                  {data.filteredCount.toLocaleString("ko-KR")}
                  <span>개의 기록</span>
                </h2>
              </div>
              {hasActiveFilters ? (
                <a href="/bank/reviews">선택 조건 모두 지우기</a>
              ) : (
                <span>최신 작성일 순</span>
              )}
            </div>

            {data.items.length > 0 ? (
              <div className="reviews-list">
                {data.items.map((review) => {
                  const area = reviewAreaLabel(review.practiceArea);
                  const stage = reviewStageLabel(review.progressStage);
                  const longReview = review.content.length > 360;
                  const formattedDate = formatReviewDate(
                    review.originalCreatedAt,
                  );

                  return (
                    <article className="review-story" key={review.id}>
                      <header>
                        <div>
                          <span>{area}</span>
                          <span>{stage}</span>
                        </div>
                        <time dateTime={review.originalCreatedAt.toISOString()}>
                          {formattedDate}
                        </time>
                      </header>

                      {longReview ? (
                        <details className="review-story-content">
                          <summary>
                            <span className="review-story-preview">
                              {review.content}
                            </span>
                            <span className="review-story-more">
                              <span>후기 전체 읽기</span>
                              <span>후기 접기</span>
                            </span>
                          </summary>
                          <p>{review.content}</p>
                        </details>
                      ) : (
                        <p className="review-story-short">{review.content}</p>
                      )}

                      <footer>
                        <strong>{review.authorDisplay}</strong>
                        {review.experienceKeywords.length > 0 ? (
                          <ul aria-label="고객이 선택한 경험 키워드">
                            {review.experienceKeywords.map((keyword) => (
                              <li key={keyword}>{keyword}</li>
                            ))}
                          </ul>
                        ) : null}
                      </footer>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="reviews-empty">
                <strong>선택한 조건의 후기가 아직 없습니다.</strong>
                <p>분야나 진행 단계를 하나 줄여 다시 찾아보세요.</p>
                <a className="button button-secondary" href="/bank/reviews">
                  모든 후기 보기
                </a>
              </div>
            )}

            {data.pageCount > 1 ? (
              <nav className="reviews-pagination" aria-label="후기 페이지">
                {data.filters.page > 1 ? (
                  <a
                    className="reviews-page-direction"
                    href={filterHref(data.filters, {
                      page: data.filters.page - 1,
                    })}
                  >
                    이전
                  </a>
                ) : (
                  <span className="reviews-page-direction" aria-disabled="true">
                    이전
                  </span>
                )}
                <div>
                  {numbers.map((page) => (
                    <a
                      aria-current={
                        page === data.filters.page ? "page" : undefined
                      }
                      href={filterHref(data.filters, { page })}
                      key={page}
                    >
                      {page}
                    </a>
                  ))}
                </div>
                {data.filters.page < data.pageCount ? (
                  <a
                    className="reviews-page-direction"
                    href={filterHref(data.filters, {
                      page: data.filters.page + 1,
                    })}
                  >
                    다음
                  </a>
                ) : (
                  <span className="reviews-page-direction" aria-disabled="true">
                    다음
                  </span>
                )}
              </nav>
            ) : null}
          </div>
        </section>

        <section className="reviews-integrity">
          <div className="shell reviews-integrity-grid">
            <div>
              <p className="eyebrow">후기를 다루는 원칙</p>
              <h2>
                좋은 말만 골라
                <br />
                그럴듯하게 만들지 않습니다.
              </h2>
            </div>
            <div className="reviews-integrity-points">
              <article>
                <span>01</span>
                <div>
                  <h3>고객이 남긴 원문</h3>
                  <p>
                    문장과 표현을 임의로 미화하지 않습니다. 개인정보가 드러나는
                    부분만 가리고 나머지는 원문 그대로 싣습니다.
                  </p>
                </div>
              </article>
              <article>
                <span>02</span>
                <div>
                  <h3>작성 당시의 맥락</h3>
                  <p>
                    상담·개시결정·면책결정처럼 후기를 쓴 당시의 단계를 함께
                    표시합니다.
                  </p>
                </div>
              </article>
              <article>
                <span>03</span>
                <div>
                  <h3>결과를 약속하지 않는 기록</h3>
                  <p>
                    같은 절차라도 사실관계, 재산·소득, 법원과 시점에 따라
                    진행과 결과는 달라질 수 있습니다.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              후기 속 누군가와 달라도,
              <br />
              내 상황부터 확인하면 됩니다.
            </>
          }
          body="후기는 방향을 가늠하는 참고입니다. 지금 알고 있는 내용만 남겨주시면 내 상황에서 먼저 확인할 쟁점을 정리해 연락드리겠습니다."
        />
      </main>

      <SiteFooter />
      <MobileActions />
    </>
  );
}
