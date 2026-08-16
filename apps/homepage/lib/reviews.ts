import { Pool } from "pg";

import { maskReviewAuthorDisplay } from "@lawand/core";

export const REVIEW_PAGE_SIZE = 9;

export const reviewAreaOptions = [
  { label: "전체 분야", value: "all" },
  { label: "개인회생", value: "personal_rehabilitation" },
  { label: "파산·면책", value: "personal_bankruptcy" },
] as const;

export const reviewStageOptions = [
  { label: "모든 과정", value: "all" },
  { label: "상담", value: "consultation" },
  { label: "개시결정", value: "commencement" },
  { label: "면책결정", value: "discharge" },
] as const;

export const reviewKeywordOptions = [
  "전체",
  "친절",
  "세심",
  "꼼꼼",
  "신뢰",
  "든든",
  "정확",
  "빠름",
  "체계적",
] as const;

export type ReviewArea = (typeof reviewAreaOptions)[number]["value"];
export type ReviewStage = (typeof reviewStageOptions)[number]["value"];
export type ReviewKeyword = (typeof reviewKeywordOptions)[number];

export type ReviewFilters = {
  area: ReviewArea;
  keyword: ReviewKeyword;
  page: number;
  stage: ReviewStage;
};

export type PublicReview = {
  authorDisplay: string;
  content: string;
  experienceKeywords: string[];
  id: string;
  originalCreatedAt: Date;
  practiceArea: Exclude<ReviewArea, "all"> | "other";
  progressStage: Exclude<ReviewStage, "all"> | "other";
  reply: {
    content: string;
    updatedAt: Date;
  } | null;
};

export type ReviewPageData = {
  areaCounts: {
    personalBankruptcy: number;
    personalRehabilitation: number;
  };
  filters: ReviewFilters;
  filteredCount: number;
  items: PublicReview[];
  oldestYear: number;
  pageCount: number;
  topKeywords: Array<{ count: number; keyword: string }>;
  totalCount: number;
};

export type ReviewEvidence = {
  areaCounts: {
    personalBankruptcy: number;
    personalRehabilitation: number;
  };
  firstReviewDate: Date;
  latestReviewDate: Date;
  stageCounts: Array<{
    count: number;
    stage: Exclude<ReviewStage, "all"> | "other";
  }>;
  topKeywords: Array<{ count: number; keyword: string }>;
  totalCount: number;
};

declare global {
  // Next.js 개발 중 모듈 재평가로 PostgreSQL 풀이 누적되지 않게 한다.
  var lawandHomepageReviewPool: Pool | undefined;
}

function databasePool(): Pool {
  const connectionString = process.env.LAWAND_APP_DATABASE_URL;
  if (!connectionString) {
    throw new Error("LAWAND_APP_DATABASE_URL 환경변수가 필요합니다.");
  }

  const existing = globalThis.lawandHomepageReviewPool;
  if (existing) return existing;

  const pool = new Pool({
    application_name: "lawand-homepage-reviews",
    connectionString,
    max: 5,
  });
  if (process.env.NODE_ENV !== "production") {
    globalThis.lawandHomepageReviewPool = pool;
  }
  return pool;
}

function validArea(value: string | undefined): ReviewArea {
  return reviewAreaOptions.some((option) => option.value === value)
    ? (value as ReviewArea)
    : "all";
}

function validStage(value: string | undefined): ReviewStage {
  return reviewStageOptions.some((option) => option.value === value)
    ? (value as ReviewStage)
    : "all";
}

function validKeyword(value: string | undefined): ReviewKeyword {
  return reviewKeywordOptions.includes(value as ReviewKeyword)
    ? (value as ReviewKeyword)
    : "전체";
}

export function parseReviewFilters(input: {
  area?: string;
  keyword?: string;
  page?: string;
  stage?: string;
}): ReviewFilters {
  const parsedPage = Number(input.page ?? "1");
  return {
    area: validArea(input.area),
    keyword: validKeyword(input.keyword),
    page:
      Number.isInteger(parsedPage) && parsedPage > 0
        ? Math.min(parsedPage, 1000)
        : 1,
    stage: validStage(input.stage),
  };
}

function whereClause(filters: ReviewFilters) {
  const clauses = ["publication_status = 'published'"];
  const values: Array<number | string> = [];

  if (filters.area !== "all") {
    values.push(filters.area);
    clauses.push(`practice_area = $${values.length}`);
  }
  if (filters.stage !== "all") {
    values.push(filters.stage);
    clauses.push(`progress_stage = $${values.length}`);
  }
  if (filters.keyword !== "전체") {
    values.push(filters.keyword);
    clauses.push(`$${values.length} = ANY(experience_keywords)`);
  }

  return { sql: clauses.join(" AND "), values };
}

const areaLabels = new Map<string, string>(
  reviewAreaOptions.map((option) => [option.value, option.label]),
);
const stageLabels = new Map<string, string>(
  reviewStageOptions.map((option) => [option.value, option.label]),
);

export function reviewAreaLabel(value: PublicReview["practiceArea"]) {
  return areaLabels.get(value) ?? "회생·파산";
}

export function reviewStageLabel(value: PublicReview["progressStage"]) {
  return stageLabels.get(value) ?? "진행 과정";
}

export function formatReviewDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(value)
    .replaceAll(" ", "");
}

const PUBLIC_REVIEW_COLUMNS = `
  id,
  author_display,
  content,
  practice_area,
  progress_stage,
  experience_keywords,
  original_created_at,
  (
    SELECT reply.content
    FROM customer_review_replies reply
    WHERE reply.review_id = customer_reviews.id
  ) AS reply_content,
  (
    SELECT reply.updated_at
    FROM customer_review_replies reply
    WHERE reply.review_id = customer_reviews.id
  ) AS reply_updated_at`;

type PublicReviewRow = {
  author_display: string;
  content: string;
  experience_keywords: string[];
  id: string;
  original_created_at: Date;
  practice_area: PublicReview["practiceArea"];
  progress_stage: PublicReview["progressStage"];
  reply_content: string | null;
  reply_updated_at: Date | null;
};

function toPublicReview(row: PublicReviewRow): PublicReview {
  return {
    authorDisplay: maskReviewAuthorDisplay(row.author_display),
    content: row.content,
    experienceKeywords: row.experience_keywords,
    id: row.id,
    originalCreatedAt: row.original_created_at,
    practiceArea: row.practice_area,
    progressStage: row.progress_stage,
    reply:
      row.reply_content && row.reply_updated_at
        ? { content: row.reply_content, updatedAt: row.reply_updated_at }
        : null,
  };
}

export async function getRecentReviews(limit: number): Promise<PublicReview[]> {
  const pool = databasePool();
  const result = await pool.query<PublicReviewRow>(
    `SELECT ${PUBLIC_REVIEW_COLUMNS}
     FROM customer_reviews
     WHERE publication_status = 'published'
     ORDER BY original_created_at DESC, legacy_id DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows.map(toPublicReview);
}

export async function getReviewPage(
  filters: ReviewFilters,
): Promise<ReviewPageData> {
  const pool = databasePool();
  const where = whereClause(filters);

  const [totalResult, aggregateResult, keywordResult] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM customer_reviews
       WHERE ${where.sql}`,
      where.values,
    ),
    pool.query<{
      personal_bankruptcy: string;
      personal_rehabilitation: string;
      oldest_year: string;
      total_count: string;
    }>(
      `SELECT
        count(*) FILTER (
          WHERE practice_area = 'personal_rehabilitation'
        )::text AS personal_rehabilitation,
        count(*) FILTER (
          WHERE practice_area = 'personal_bankruptcy'
        )::text AS personal_bankruptcy,
        extract(year FROM min(original_created_at))::integer::text
          AS oldest_year,
        count(*)::text AS total_count
       FROM customer_reviews
       WHERE publication_status = 'published'`,
    ),
    pool.query<{ count: string; keyword: string }>(
      `SELECT keyword, count(*)::text AS count
       FROM customer_reviews,
       LATERAL unnest(experience_keywords) AS keyword
       WHERE publication_status = 'published'
       GROUP BY keyword
       ORDER BY count(*) DESC, keyword
       LIMIT 4`,
    ),
  ]);

  const totalCount = Number(totalResult.rows[0]?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(totalCount / REVIEW_PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const listValues = [
    ...where.values,
    REVIEW_PAGE_SIZE,
    (page - 1) * REVIEW_PAGE_SIZE,
  ];
  const limitParameter = where.values.length + 1;
  const offsetParameter = where.values.length + 2;
  const listResult = await pool.query<PublicReviewRow>(
    `SELECT ${PUBLIC_REVIEW_COLUMNS}
     FROM customer_reviews
     WHERE ${where.sql}
     ORDER BY original_created_at DESC, legacy_id DESC
     LIMIT $${limitParameter}
     OFFSET $${offsetParameter}`,
    listValues,
  );

  const aggregate = aggregateResult.rows[0];
  return {
    areaCounts: {
      personalBankruptcy: Number(aggregate?.personal_bankruptcy ?? 0),
      personalRehabilitation: Number(
        aggregate?.personal_rehabilitation ?? 0,
      ),
    },
    filters: { ...filters, page },
    filteredCount: totalCount,
    items: listResult.rows.map(toPublicReview),
    oldestYear: Number(aggregate?.oldest_year ?? new Date().getFullYear()),
    pageCount,
    topKeywords: keywordResult.rows.map((row) => ({
      count: Number(row.count),
      keyword: row.keyword,
    })),
    totalCount: Number(aggregate?.total_count ?? 0),
  };
}

export async function getReviewEvidence(): Promise<ReviewEvidence> {
  const pool = databasePool();
  const [aggregateResult, stageResult, keywordResult] = await Promise.all([
    pool.query<{
      first_review_date: Date;
      latest_review_date: Date;
      personal_bankruptcy: string;
      personal_rehabilitation: string;
      total_count: string;
    }>(
      `SELECT
        count(*)::text AS total_count,
        count(*) FILTER (
          WHERE practice_area = 'personal_rehabilitation'
        )::text AS personal_rehabilitation,
        count(*) FILTER (
          WHERE practice_area = 'personal_bankruptcy'
        )::text AS personal_bankruptcy,
        min(original_created_at) AS first_review_date,
        max(original_created_at) AS latest_review_date
       FROM customer_reviews
       WHERE publication_status = 'published'`,
    ),
    pool.query<{
      count: string;
      progress_stage: ReviewEvidence["stageCounts"][number]["stage"];
    }>(
      `SELECT progress_stage, count(*)::text AS count
       FROM customer_reviews
       WHERE publication_status = 'published'
       GROUP BY progress_stage
       ORDER BY count(*) DESC`,
    ),
    pool.query<{ count: string; keyword: string }>(
      `SELECT keyword, count(*)::text AS count
       FROM customer_reviews,
       LATERAL unnest(experience_keywords) AS keyword
       WHERE publication_status = 'published'
       GROUP BY keyword
       ORDER BY count(*) DESC, keyword
       LIMIT 4`,
    ),
  ]);

  const aggregate = aggregateResult.rows[0];
  if (!aggregate?.first_review_date || !aggregate.latest_review_date) {
    throw new Error("공개 고객후기 근거 데이터를 찾을 수 없습니다.");
  }

  return {
    areaCounts: {
      personalBankruptcy: Number(aggregate.personal_bankruptcy),
      personalRehabilitation: Number(aggregate.personal_rehabilitation),
    },
    firstReviewDate: aggregate.first_review_date,
    latestReviewDate: aggregate.latest_review_date,
    stageCounts: stageResult.rows.map((row) => ({
      count: Number(row.count),
      stage: row.progress_stage,
    })),
    topKeywords: keywordResult.rows.map((row) => ({
      count: Number(row.count),
      keyword: row.keyword,
    })),
    totalCount: Number(aggregate.total_count),
  };
}
