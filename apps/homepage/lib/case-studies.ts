import { Pool } from "pg";

export type CaseStudyContent = {
  calculation: string;
  dek: string;
  differences: string[];
  familyNote: string;
  keyIssues: Array<{ body: string; title: string }>;
  lawandNote: string;
  liquidationValueNote: string;
  opening: string;
  outcome: string;
  processExplanation: string;
  situation: string;
  tags: string[];
  title: string;
};

export type CaseStudyFinancialSnapshot = {
  additionalLivingCost: number;
  additionalLivingCostType: string;
  estimatedMonthlySpend: number;
  liquidationValue: number;
  monthlyIncome: number;
  monthlyPayment: number;
  paymentCount: number;
  repaymentRatePercent: number;
  securedDebt: number;
  totalDebt: number;
  totalPayment: number;
  unsecuredDebt: number;
};

export type CaseStudyTimelineItem = {
  description: string;
  elapsedDays: number;
  label: string;
  timing: string;
};

export type PublicCaseStudy = {
  cohortSize: number;
  content: CaseStudyContent;
  dek: string;
  financialSnapshot: CaseStudyFinancialSnapshot;
  generatedAt: Date;
  id: string;
  practiceArea: "personal_bankruptcy" | "personal_rehabilitation";
  publicationStatus: "preview" | "published";
  slug: string;
  tags: string[];
  timeline: CaseStudyTimelineItem[];
  title: string;
};

declare global {
  // Next.js 개발 중 모듈 재평가로 PostgreSQL 풀이 누적되지 않게 한다.
  var lawandHomepageCaseStudyPool: Pool | undefined;
}

function databasePool() {
  const connectionString = process.env.LAWAND_APP_DATABASE_URL;
  if (!connectionString) {
    throw new Error("LAWAND_APP_DATABASE_URL 환경변수가 필요합니다.");
  }

  const existing = globalThis.lawandHomepageCaseStudyPool;
  if (existing) return existing;

  const pool = new Pool({
    application_name: "lawand-homepage-case-studies",
    connectionString,
    max: 3,
  });
  if (process.env.NODE_ENV !== "production") {
    globalThis.lawandHomepageCaseStudyPool = pool;
  }
  return pool;
}

function previewEnabled() {
  return process.env.NODE_ENV !== "production";
}

function mapRow(row: {
  cohort_size: number;
  content: CaseStudyContent;
  dek: string;
  financial_snapshot: CaseStudyFinancialSnapshot;
  generated_at: Date;
  id: string;
  practice_area: PublicCaseStudy["practiceArea"];
  publication_status: PublicCaseStudy["publicationStatus"];
  slug: string;
  tags: string[];
  timeline: CaseStudyTimelineItem[];
  title: string;
}): PublicCaseStudy {
  return {
    cohortSize: row.cohort_size,
    content: row.content,
    dek: row.dek,
    financialSnapshot: row.financial_snapshot,
    generatedAt: row.generated_at,
    id: row.id,
    practiceArea: row.practice_area,
    publicationStatus: row.publication_status,
    slug: row.slug,
    tags: row.tags,
    timeline: row.timeline,
    title: row.title,
  };
}

const selectColumns = `
  id,
  slug,
  practice_area,
  publication_status,
  title,
  dek,
  content,
  financial_snapshot || jsonb_build_object(
    'additionalLivingCostType',
    source_snapshot->'plan'->>'livingCostType'
  ) AS financial_snapshot,
  timeline,
  tags,
  cohort_size,
  generated_at
`;

export async function getCaseStudies(limit = 20) {
  const result = await databasePool().query(
    `SELECT ${selectColumns}
     FROM public_case_studies
     WHERE publication_status = 'published'
       OR ($1::boolean AND publication_status = 'preview')
     ORDER BY generated_at DESC, id
     LIMIT $2`,
    [previewEnabled(), Math.max(1, Math.min(limit, 100))],
  );
  return result.rows.map(mapRow);
}

export async function getCaseStudyBySlug(slug: string) {
  const result = await databasePool().query(
    `SELECT ${selectColumns}
     FROM public_case_studies
     WHERE slug = $1
       AND (
         publication_status = 'published'
         OR ($2::boolean AND publication_status = 'preview')
       )
     LIMIT 1`,
    [slug, previewEnabled()],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
