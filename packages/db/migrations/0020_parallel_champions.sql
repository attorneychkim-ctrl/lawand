CREATE TYPE "public"."case_study_practice_area" AS ENUM('personal_rehabilitation', 'personal_bankruptcy');--> statement-breakpoint
CREATE TYPE "public"."case_study_publication_status" AS ENUM('draft', 'preview', 'published', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."case_study_review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "public_case_studies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(160) NOT NULL,
	"source_case_fingerprint" "bytea" NOT NULL,
	"source_snapshot_hash" "bytea" NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"source_office_idx" integer NOT NULL,
	"practice_area" "case_study_practice_area" NOT NULL,
	"publication_status" "case_study_publication_status" DEFAULT 'draft' NOT NULL,
	"privacy_review_status" "case_study_review_status" DEFAULT 'pending' NOT NULL,
	"legal_review_status" "case_study_review_status" DEFAULT 'pending' NOT NULL,
	"publication_basis" varchar(100),
	"title" text NOT NULL,
	"dek" text NOT NULL,
	"content" jsonb NOT NULL,
	"financial_snapshot" jsonb NOT NULL,
	"timeline" jsonb NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"cohort_size" integer NOT NULL,
	"anonymization_version" varchar(50) NOT NULL,
	"prompt_version" varchar(50) NOT NULL,
	"generation_model" varchar(100) NOT NULL,
	"generation_reasoning_effort" varchar(20) NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"privacy_reviewed_at" timestamp with time zone,
	"legal_reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_case_studies_office_56" CHECK ("public_case_studies"."source_office_idx" = 56),
	CONSTRAINT "public_case_studies_source_hashes" CHECK (octet_length("public_case_studies"."source_case_fingerprint") = 32
        AND octet_length("public_case_studies"."source_snapshot_hash") = 32),
	CONSTRAINT "public_case_studies_safe_snapshot" CHECK (jsonb_typeof("public_case_studies"."source_snapshot") = 'object'
        AND jsonb_typeof("public_case_studies"."content") = 'object'
        AND jsonb_typeof("public_case_studies"."financial_snapshot") = 'object'
        AND jsonb_typeof("public_case_studies"."timeline") = 'array'),
	CONSTRAINT "public_case_studies_nonempty_copy" CHECK (length(btrim("public_case_studies"."slug")) > 0
        AND length(btrim("public_case_studies"."title")) > 0
        AND length(btrim("public_case_studies"."dek")) > 0),
	CONSTRAINT "public_case_studies_anonymity_floor" CHECK ("public_case_studies"."cohort_size" >= 5),
	CONSTRAINT "public_case_studies_tags_count" CHECK (cardinality("public_case_studies"."tags") BETWEEN 2 AND 8),
	CONSTRAINT "public_case_studies_publication_gate" CHECK ((
        "public_case_studies"."publication_status" = 'published'
        AND "public_case_studies"."privacy_review_status" = 'approved'
        AND "public_case_studies"."legal_review_status" = 'approved'
        AND "public_case_studies"."publication_basis" IS NOT NULL
        AND "public_case_studies"."privacy_reviewed_at" IS NOT NULL
        AND "public_case_studies"."legal_reviewed_at" IS NOT NULL
        AND "public_case_studies"."published_at" IS NOT NULL
        AND "public_case_studies"."withdrawn_at" IS NULL
      ) OR (
        "public_case_studies"."publication_status" IN ('draft', 'preview')
        AND "public_case_studies"."published_at" IS NULL
        AND "public_case_studies"."withdrawn_at" IS NULL
      ) OR (
        "public_case_studies"."publication_status" = 'withdrawn'
        AND "public_case_studies"."withdrawn_at" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "public_case_studies_slug_uidx" ON "public_case_studies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "public_case_studies_source_fingerprint_uidx" ON "public_case_studies" USING btree ("source_case_fingerprint");--> statement-breakpoint
CREATE INDEX "public_case_studies_visible_idx" ON "public_case_studies" USING btree ("publication_status","generated_at") WHERE "public_case_studies"."publication_status" IN ('preview', 'published');--> statement-breakpoint
CREATE INDEX "public_case_studies_tags_gin_idx" ON "public_case_studies" USING gin ("tags");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public_case_studies FROM lawand_app';
    EXECUTE 'GRANT SELECT ON TABLE public_case_studies TO lawand_app';
  END IF;
END
$$;
