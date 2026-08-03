CREATE TYPE "public"."review_pii_status" AS ENUM('clear', 'flagged', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."review_practice_area" AS ENUM('personal_rehabilitation', 'personal_bankruptcy', 'other');--> statement-breakpoint
CREATE TYPE "public"."review_progress_stage" AS ENUM('consultation', 'commencement', 'discharge', 'other');--> statement-breakpoint
CREATE TYPE "public"."review_publication_status" AS ENUM('published', 'review_required', 'withheld');--> statement-breakpoint
CREATE TABLE "customer_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_key" varchar(100) NOT NULL,
	"legacy_id" bigint NOT NULL,
	"legacy_content_id" bigint,
	"legacy_url" text NOT NULL,
	"author_display" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"practice_area" "review_practice_area" NOT NULL,
	"progress_stage" "review_progress_stage" NOT NULL,
	"legacy_category1" varchar(127),
	"legacy_category2" varchar(127),
	"experience_keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"source_status" varchar(20),
	"publication_status" "review_publication_status" NOT NULL,
	"pii_status" "review_pii_status" NOT NULL,
	"pii_flags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"source_hash" "bytea" NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"original_created_at" timestamp with time zone NOT NULL,
	"original_updated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_reviews_legacy_id_positive" CHECK ("customer_reviews"."legacy_id" > 0),
	CONSTRAINT "customer_reviews_nonempty_text" CHECK (length(btrim("customer_reviews"."title")) > 0
        AND length(btrim("customer_reviews"."content")) > 0
        AND length(btrim("customer_reviews"."author_display")) > 0),
	CONSTRAINT "customer_reviews_comment_count_nonnegative" CHECK ("customer_reviews"."comment_count" >= 0),
	CONSTRAINT "customer_reviews_source_hash_length" CHECK (octet_length("customer_reviews"."source_hash") = 32),
	CONSTRAINT "customer_reviews_publication_consistent" CHECK ((
        "customer_reviews"."publication_status" = 'published'
        AND "customer_reviews"."pii_status" IN ('clear', 'reviewed')
        AND "customer_reviews"."published_at" IS NOT NULL
      ) OR (
        "customer_reviews"."publication_status" <> 'published'
        AND "customer_reviews"."published_at" IS NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "review_import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_key" varchar(100) NOT NULL,
	"source_row_count" integer NOT NULL,
	"source_sha256" "bytea" NOT NULL,
	"published_count" integer NOT NULL,
	"review_required_count" integer NOT NULL,
	"withheld_count" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_import_batches_source_hash_length" CHECK (octet_length("review_import_batches"."source_sha256") = 32),
	CONSTRAINT "review_import_batches_counts_nonnegative" CHECK ("review_import_batches"."source_row_count" >= 0
        AND "review_import_batches"."published_count" >= 0
        AND "review_import_batches"."review_required_count" >= 0
        AND "review_import_batches"."withheld_count" >= 0),
	CONSTRAINT "review_import_batches_counts_match" CHECK ("review_import_batches"."source_row_count" = "review_import_batches"."published_count"
        + "review_import_batches"."review_required_count"
        + "review_import_batches"."withheld_count"),
	CONSTRAINT "review_import_batches_time_order" CHECK ("review_import_batches"."completed_at" >= "review_import_batches"."started_at")
);
--> statement-breakpoint
ALTER TABLE "customer_reviews" ADD CONSTRAINT "customer_reviews_import_batch_id_review_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."review_import_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_reviews_source_legacy_uidx" ON "customer_reviews" USING btree ("source_key","legacy_id");--> statement-breakpoint
CREATE INDEX "customer_reviews_public_recent_idx" ON "customer_reviews" USING btree ("original_created_at","id") WHERE "customer_reviews"."publication_status" = 'published';--> statement-breakpoint
CREATE INDEX "customer_reviews_public_area_stage_idx" ON "customer_reviews" USING btree ("practice_area","progress_stage","original_created_at") WHERE "customer_reviews"."publication_status" = 'published';--> statement-breakpoint
CREATE INDEX "customer_reviews_keywords_gin_idx" ON "customer_reviews" USING gin ("experience_keywords");--> statement-breakpoint
CREATE INDEX "customer_reviews_import_batch_idx" ON "customer_reviews" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "review_import_batches_source_completed_idx" ON "review_import_batches" USING btree ("source_key","completed_at");