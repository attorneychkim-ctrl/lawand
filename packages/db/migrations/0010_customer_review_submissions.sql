CREATE TYPE "public"."review_submission_status" AS ENUM('pending_review', 'published', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TABLE "customer_review_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_receipt_code" varchar(32) NOT NULL,
	"source" varchar(50) DEFAULT 'homepage' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"author_display" varchar(100) NOT NULL,
	"practice_area" "review_practice_area" NOT NULL,
	"progress_stage" "review_progress_stage" NOT NULL,
	"experience_keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"phone_fingerprint" "bytea" NOT NULL,
	"phone_ciphertext" "bytea" NOT NULL,
	"phone_nonce" "bytea" NOT NULL,
	"phone_key_version" varchar(50) NOT NULL,
	"content_ciphertext" "bytea" NOT NULL,
	"content_nonce" "bytea" NOT NULL,
	"content_key_version" varchar(50) NOT NULL,
	"payload_fingerprint" "bytea" NOT NULL,
	"pii_status" "review_pii_status" NOT NULL,
	"pii_flags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "review_submission_status" DEFAULT 'pending_review' NOT NULL,
	"privacy_notice_version" varchar(50) NOT NULL,
	"publication_consent_version" varchar(50) NOT NULL,
	"consent_agreed_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"retention_expires_at" timestamp with time zone NOT NULL,
	"moderated_at" timestamp with time zone,
	"published_review_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_review_submissions_nonempty_author" CHECK (length(btrim("customer_review_submissions"."author_display")) > 0),
	CONSTRAINT "customer_review_submissions_phone_fingerprint_length" CHECK (octet_length("customer_review_submissions"."phone_fingerprint") = 32),
	CONSTRAINT "customer_review_submissions_payload_fingerprint_length" CHECK (octet_length("customer_review_submissions"."payload_fingerprint") = 32),
	CONSTRAINT "customer_review_submissions_nonce_length" CHECK (octet_length("customer_review_submissions"."phone_nonce") = 12
        AND octet_length("customer_review_submissions"."content_nonce") = 12),
	CONSTRAINT "customer_review_submissions_keywords_count" CHECK (cardinality("customer_review_submissions"."experience_keywords") BETWEEN 1 AND 3),
	CONSTRAINT "customer_review_submissions_keywords_allowed" CHECK ("customer_review_submissions"."experience_keywords" <@ ARRAY[
        '친절', '세심', '꼼꼼', '신뢰', '든든', '정확', '빠름', '체계적'
      ]::text[]),
	CONSTRAINT "customer_review_submissions_retention_order" CHECK ("customer_review_submissions"."retention_expires_at" > "customer_review_submissions"."submitted_at"),
	CONSTRAINT "customer_review_submissions_publication_link" CHECK ((
        "customer_review_submissions"."status" = 'published'
        AND "customer_review_submissions"."moderated_at" IS NOT NULL
        AND "customer_review_submissions"."published_review_id" IS NOT NULL
      ) OR (
        "customer_review_submissions"."status" <> 'published'
        AND "customer_review_submissions"."published_review_id" IS NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "customer_review_submissions" ADD CONSTRAINT "customer_review_submissions_published_review_id_customer_reviews_id_fk" FOREIGN KEY ("published_review_id") REFERENCES "public"."customer_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_submissions_receipt_uidx" ON "customer_review_submissions" USING btree ("public_receipt_code");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_submissions_source_idempotency_uidx" ON "customer_review_submissions" USING btree ("source","idempotency_key");--> statement-breakpoint
CREATE INDEX "customer_review_submissions_status_submitted_idx" ON "customer_review_submissions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "customer_review_submissions_phone_submitted_idx" ON "customer_review_submissions" USING btree ("phone_fingerprint","submitted_at");--> statement-breakpoint
CREATE INDEX "customer_review_submissions_payload_idx" ON "customer_review_submissions" USING btree ("payload_fingerprint");