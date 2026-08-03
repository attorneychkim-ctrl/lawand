CREATE TYPE "public"."naver_booking_entry_status" AS ENUM('details_pending', 'ready', 'cancelled');--> statement-breakpoint
ALTER TABLE "consultation_requests" DROP CONSTRAINT "consultation_requests_phone_crypto_complete";--> statement-breakpoint
ALTER TABLE "consultation_requests" DROP CONSTRAINT "consultation_requests_privacy_basis_consistent";--> statement-breakpoint
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_contact_channel_identity";--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "contact_channel" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "consultations" ALTER COLUMN "contact_channel" DROP DEFAULT;--> statement-breakpoint
CREATE TYPE "public"."consultation_contact_channel_new" AS ENUM('phone', 'kakao_channel', 'naver_booking');--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "contact_channel" TYPE "public"."consultation_contact_channel_new" USING "contact_channel"::text::"public"."consultation_contact_channel_new";--> statement-breakpoint
ALTER TABLE "consultations" ALTER COLUMN "contact_channel" TYPE "public"."consultation_contact_channel_new" USING "contact_channel"::text::"public"."consultation_contact_channel_new";--> statement-breakpoint
DROP TYPE "public"."consultation_contact_channel";--> statement-breakpoint
ALTER TYPE "public"."consultation_contact_channel_new" RENAME TO "consultation_contact_channel";--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "contact_channel" SET DEFAULT 'phone';--> statement-breakpoint
ALTER TABLE "consultations" ALTER COLUMN "contact_channel" SET DEFAULT 'phone';--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "privacy_basis" DROP DEFAULT;--> statement-breakpoint
CREATE TYPE "public"."privacy_basis_new" AS ENUM('explicit_consent', 'customer_initiated_channel_message', 'customer_initiated_channel_entry', 'customer_initiated_booking');--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "privacy_basis" TYPE "public"."privacy_basis_new" USING "privacy_basis"::text::"public"."privacy_basis_new";--> statement-breakpoint
DROP TYPE "public"."privacy_basis";--> statement-breakpoint
ALTER TYPE "public"."privacy_basis_new" RENAME TO "privacy_basis";--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "privacy_basis" SET DEFAULT 'explicit_consent';--> statement-breakpoint
CREATE TABLE "naver_booking_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consultation_id" uuid NOT NULL,
	"first_request_id" uuid NOT NULL,
	"business_id" varchar(32) NOT NULL,
	"booking_number" varchar(32) NOT NULL,
	"details_url" text NOT NULL,
	"status" "naver_booking_entry_status" DEFAULT 'details_pending' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"source_message_uid" bigint NOT NULL,
	"source_received_at" timestamp with time zone NOT NULL,
	"details_captured_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "naver_booking_entries_business_id_format" CHECK ("naver_booking_entries"."business_id" ~ '^[0-9]+$'),
	CONSTRAINT "naver_booking_entries_booking_number_format" CHECK ("naver_booking_entries"."booking_number" ~ '^[0-9]+$'),
	CONSTRAINT "naver_booking_entries_details_url" CHECK ("naver_booking_entries"."details_url" LIKE 'https://partner.booking.naver.com/bizes/%'),
	CONSTRAINT "naver_booking_entries_status_consistent" CHECK ((
        "naver_booking_entries"."status" = 'details_pending'
        AND "naver_booking_entries"."details_captured_at" IS NULL
        AND "naver_booking_entries"."cancelled_at" IS NULL
      ) OR (
        "naver_booking_entries"."status" = 'ready'
        AND "naver_booking_entries"."details_captured_at" IS NOT NULL
        AND "naver_booking_entries"."cancelled_at" IS NULL
      ) OR (
        "naver_booking_entries"."status" = 'cancelled'
        AND "naver_booking_entries"."cancelled_at" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "naver_booking_mailbox_checkpoints" (
	"mailbox_key" varchar(64) PRIMARY KEY NOT NULL,
	"uid_validity" bigint NOT NULL,
	"last_seen_uid" bigint NOT NULL,
	"initialized_at" timestamp with time zone NOT NULL,
	"last_successful_poll_at" timestamp with time zone NOT NULL,
	"last_error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "naver_booking_mailbox_checkpoints_uid_validity_positive" CHECK ("naver_booking_mailbox_checkpoints"."uid_validity" > 0),
	CONSTRAINT "naver_booking_mailbox_checkpoints_last_seen_uid_nonnegative" CHECK ("naver_booking_mailbox_checkpoints"."last_seen_uid" >= 0)
);
--> statement-breakpoint
ALTER TABLE "naver_booking_entries" ADD CONSTRAINT "naver_booking_entries_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naver_booking_entries" ADD CONSTRAINT "naver_booking_entries_first_request_id_consultation_requests_id_fk" FOREIGN KEY ("first_request_id") REFERENCES "public"."consultation_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "naver_booking_entries_consultation_uidx" ON "naver_booking_entries" USING btree ("consultation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "naver_booking_entries_first_request_uidx" ON "naver_booking_entries" USING btree ("first_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "naver_booking_entries_business_booking_uidx" ON "naver_booking_entries" USING btree ("business_id","booking_number");--> statement-breakpoint
CREATE INDEX "naver_booking_entries_status_scheduled_idx" ON "naver_booking_entries" USING btree ("status","scheduled_at");--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_phone_crypto_complete" CHECK ((
        "consultation_requests"."contact_channel" = 'phone'
        AND "consultation_requests"."phone_fingerprint" IS NOT NULL
        AND "consultation_requests"."phone_ciphertext" IS NOT NULL
        AND "consultation_requests"."phone_nonce" IS NOT NULL
        AND "consultation_requests"."phone_key_version" IS NOT NULL
      ) OR (
        "consultation_requests"."contact_channel" IN ('kakao_channel', 'naver_booking')
        AND "consultation_requests"."phone_fingerprint" IS NULL
        AND "consultation_requests"."phone_ciphertext" IS NULL
        AND "consultation_requests"."phone_nonce" IS NULL
        AND "consultation_requests"."phone_key_version" IS NULL
      ));--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_privacy_basis_consistent" CHECK (("consultation_requests"."privacy_basis" = 'explicit_consent' AND "consultation_requests"."consent_agreed_at" IS NOT NULL)
        OR ("consultation_requests"."privacy_basis" IN ('customer_initiated_channel_message', 'customer_initiated_channel_entry', 'customer_initiated_booking') AND "consultation_requests"."consent_agreed_at" IS NULL));--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_contact_channel_identity" CHECK (("consultations"."contact_channel" = 'phone' AND "consultations"."phone_fingerprint" IS NOT NULL)
        OR ("consultations"."contact_channel" IN ('kakao_channel', 'naver_booking') AND "consultations"."phone_fingerprint" IS NULL));
