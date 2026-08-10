CREATE TYPE "public"."telephony_call_disposition" AS ENUM('customer_conversation', 'voicemail', 'no_answer', 'rejected', 'busy', 'caller_cancelled');--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD COLUMN "provider_status" varchar(30);--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD COLUMN "provider_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD COLUMN "provider_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD COLUMN "provider_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD COLUMN "provider_billable_seconds" integer;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD COLUMN "disposition" "telephony_call_disposition";--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD COLUMN "disposition_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD COLUMN "disposition_confirmed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_disposition_confirmed_by_user_id_staff_users_id_fk" FOREIGN KEY ("disposition_confirmed_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_calls_endpoint_provider_started_uidx" ON "telephony_calls" USING btree ("endpoint_id","provider_started_at") WHERE "telephony_calls"."provider_started_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_provider_duration_nonnegative" CHECK ("telephony_calls"."provider_duration_seconds" IS NULL OR "telephony_calls"."provider_duration_seconds" >= 0);--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_provider_billable_nonnegative" CHECK ("telephony_calls"."provider_billable_seconds" IS NULL OR "telephony_calls"."provider_billable_seconds" >= 0);--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_provider_time_order" CHECK ("telephony_calls"."provider_ended_at" IS NULL
        OR "telephony_calls"."provider_started_at" IS NULL
        OR "telephony_calls"."provider_ended_at" >= "telephony_calls"."provider_started_at");--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_reconciliation_complete" CHECK ("telephony_calls"."reconciled_at" IS NULL OR (
        "telephony_calls"."provider_status" IS NOT NULL
        AND "telephony_calls"."provider_started_at" IS NOT NULL
        AND "telephony_calls"."provider_ended_at" IS NOT NULL
        AND "telephony_calls"."provider_duration_seconds" IS NOT NULL
        AND "telephony_calls"."provider_billable_seconds" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_disposition_confirmation_pair" CHECK ((
        "telephony_calls"."disposition" IS NULL
        AND "telephony_calls"."disposition_confirmed_at" IS NULL
        AND "telephony_calls"."disposition_confirmed_by_user_id" IS NULL
      ) OR (
        "telephony_calls"."disposition" IS NOT NULL
        AND "telephony_calls"."disposition_confirmed_at" IS NOT NULL
        AND "telephony_calls"."disposition_confirmed_by_user_id" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_disposition_after_reconciliation" CHECK ("telephony_calls"."disposition" IS NULL OR "telephony_calls"."reconciled_at" IS NOT NULL);