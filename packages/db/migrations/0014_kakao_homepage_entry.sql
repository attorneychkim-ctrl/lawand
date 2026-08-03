CREATE TYPE "public"."kakao_homepage_entry_status" AS ENUM('pending', 'confirmed', 'invalid');--> statement-breakpoint
ALTER TABLE "consultation_requests" DROP CONSTRAINT "consultation_requests_privacy_basis_consistent";--> statement-breakpoint
ALTER TYPE "public"."privacy_basis" RENAME TO "privacy_basis_old";--> statement-breakpoint
CREATE TYPE "public"."privacy_basis" AS ENUM('explicit_consent', 'customer_initiated_channel_message', 'customer_initiated_channel_entry');--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "privacy_basis" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "privacy_basis" TYPE "public"."privacy_basis" USING "privacy_basis"::text::"public"."privacy_basis";--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "privacy_basis" SET DEFAULT 'explicit_consent';--> statement-breakpoint
DROP TYPE "public"."privacy_basis_old";--> statement-breakpoint
CREATE TABLE "kakao_homepage_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consultation_id" uuid NOT NULL,
	"first_request_id" uuid NOT NULL,
	"status" "kakao_homepage_entry_status" DEFAULT 'pending' NOT NULL,
	"click_count" integer DEFAULT 1 NOT NULL,
	"first_clicked_at" timestamp with time zone NOT NULL,
	"last_clicked_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_user_id" uuid,
	"invalidated_at" timestamp with time zone,
	"invalidated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kakao_homepage_entries_click_count_positive" CHECK ("kakao_homepage_entries"."click_count" > 0),
	CONSTRAINT "kakao_homepage_entries_click_order" CHECK ("kakao_homepage_entries"."last_clicked_at" >= "kakao_homepage_entries"."first_clicked_at"),
	CONSTRAINT "kakao_homepage_entries_status_consistent" CHECK ((
        "kakao_homepage_entries"."status" = 'pending'
        AND "kakao_homepage_entries"."confirmed_at" IS NULL
        AND "kakao_homepage_entries"."confirmed_by_user_id" IS NULL
        AND "kakao_homepage_entries"."invalidated_at" IS NULL
        AND "kakao_homepage_entries"."invalidated_by_user_id" IS NULL
      ) OR (
        "kakao_homepage_entries"."status" = 'confirmed'
        AND "kakao_homepage_entries"."confirmed_at" IS NOT NULL
        AND "kakao_homepage_entries"."confirmed_by_user_id" IS NOT NULL
        AND "kakao_homepage_entries"."invalidated_at" IS NULL
        AND "kakao_homepage_entries"."invalidated_by_user_id" IS NULL
      ) OR (
        "kakao_homepage_entries"."status" = 'invalid'
        AND "kakao_homepage_entries"."confirmed_at" IS NULL
        AND "kakao_homepage_entries"."confirmed_by_user_id" IS NULL
        AND "kakao_homepage_entries"."invalidated_at" IS NOT NULL
        AND "kakao_homepage_entries"."invalidated_by_user_id" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "kakao_homepage_entries" ADD CONSTRAINT "kakao_homepage_entries_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kakao_homepage_entries" ADD CONSTRAINT "kakao_homepage_entries_first_request_id_consultation_requests_id_fk" FOREIGN KEY ("first_request_id") REFERENCES "public"."consultation_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kakao_homepage_entries" ADD CONSTRAINT "kakao_homepage_entries_confirmed_by_user_id_staff_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kakao_homepage_entries" ADD CONSTRAINT "kakao_homepage_entries_invalidated_by_user_id_staff_users_id_fk" FOREIGN KEY ("invalidated_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_homepage_entries_consultation_uidx" ON "kakao_homepage_entries" USING btree ("consultation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_homepage_entries_first_request_uidx" ON "kakao_homepage_entries" USING btree ("first_request_id");--> statement-breakpoint
CREATE INDEX "kakao_homepage_entries_status_last_clicked_idx" ON "kakao_homepage_entries" USING btree ("status","last_clicked_at");--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_privacy_basis_consistent" CHECK (("consultation_requests"."privacy_basis" = 'explicit_consent' AND "consultation_requests"."consent_agreed_at" IS NOT NULL)
        OR ("consultation_requests"."privacy_basis" IN ('customer_initiated_channel_message', 'customer_initiated_channel_entry') AND "consultation_requests"."consent_agreed_at" IS NULL));
