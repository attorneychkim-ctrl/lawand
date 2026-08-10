CREATE TYPE "public"."telephony_call_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_outcome" AS ENUM('unknown', 'answered', 'no_answer', 'busy', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."telephony_command_status" AS ENUM('queued', 'dispatching', 'succeeded', 'failed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."telephony_endpoint_type" AS ENUM('personal', 'representative');--> statement-breakpoint
CREATE TYPE "public"."telephony_provider" AS ENUM('centrex');--> statement-breakpoint
CREATE TABLE "staff_telephony_bindings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telephony_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" "telephony_provider" DEFAULT 'centrex' NOT NULL,
	"direction" "telephony_call_direction" DEFAULT 'outbound' NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"consultation_id" uuid NOT NULL,
	"consultation_request_id" uuid NOT NULL,
	"outbox_event_id" uuid NOT NULL,
	"remote_phone_fingerprint" "bytea" NOT NULL,
	"command_status" "telephony_command_status" DEFAULT 'queued' NOT NULL,
	"outcome" "telephony_call_outcome" DEFAULT 'unknown' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"dispatched_at" timestamp with time zone,
	"provider_responded_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"last_error_code" varchar(100),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_calls_remote_phone_fingerprint_length" CHECK (octet_length("telephony_calls"."remote_phone_fingerprint") = 32),
	CONSTRAINT "telephony_calls_dispatch_time_order" CHECK ("telephony_calls"."dispatched_at" IS NULL OR "telephony_calls"."dispatched_at" >= "telephony_calls"."requested_at"),
	CONSTRAINT "telephony_calls_provider_response_time_order" CHECK ("telephony_calls"."provider_responded_at" IS NULL OR "telephony_calls"."provider_responded_at" >= "telephony_calls"."requested_at"),
	CONSTRAINT "telephony_calls_error_pair" CHECK (("telephony_calls"."last_error_code" IS NULL AND "telephony_calls"."last_error_message" IS NULL)
        OR ("telephony_calls"."last_error_code" IS NOT NULL AND "telephony_calls"."last_error_message" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "telephony_endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" "telephony_provider" DEFAULT 'centrex' NOT NULL,
	"endpoint_type" "telephony_endpoint_type" DEFAULT 'personal' NOT NULL,
	"label" varchar(100) NOT NULL,
	"line_number" varchar(20) NOT NULL,
	"extension" varchar(20) NOT NULL,
	"api_login_id" varchar(50) NOT NULL,
	"credential_key" varchar(100) NOT NULL,
	"region_key" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"password_expires_at" timestamp with time zone,
	"last_auth_succeeded_at" timestamp with time zone,
	"last_auth_failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_endpoints_label_nonempty" CHECK (length(btrim("telephony_endpoints"."label")) > 0),
	CONSTRAINT "telephony_endpoints_line_number_format" CHECK ("telephony_endpoints"."line_number" ~ '^070[0-9]{8}$'),
	CONSTRAINT "telephony_endpoints_extension_format" CHECK ("telephony_endpoints"."extension" ~ '^[0-9]{2,10}$'),
	CONSTRAINT "telephony_endpoints_api_login_format" CHECK ("telephony_endpoints"."api_login_id" ~ '^[0-9]{8,50}$'),
	CONSTRAINT "telephony_endpoints_credential_key_format" CHECK ("telephony_endpoints"."credential_key" ~ '^[a-z0-9][a-z0-9._-]{0,99}$')
);
--> statement-breakpoint
ALTER TABLE "staff_telephony_bindings" ADD CONSTRAINT "staff_telephony_bindings_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_telephony_bindings" ADD CONSTRAINT "staff_telephony_bindings_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_telephony_bindings" ADD CONSTRAINT "staff_telephony_bindings_assigned_by_user_id_staff_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_consultation_request_id_consultation_requests_id_fk" FOREIGN KEY ("consultation_request_id") REFERENCES "public"."consultation_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_endpoints" ADD CONSTRAINT "telephony_endpoints_region_key_staff_regions_key_fk" FOREIGN KEY ("region_key") REFERENCES "public"."staff_regions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_telephony_bindings_active_staff_endpoint_uidx" ON "staff_telephony_bindings" USING btree ("staff_user_id","endpoint_id") WHERE "staff_telephony_bindings"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_telephony_bindings_primary_staff_uidx" ON "staff_telephony_bindings" USING btree ("staff_user_id") WHERE "staff_telephony_bindings"."is_active" = true AND "staff_telephony_bindings"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_calls_outbox_event_uidx" ON "telephony_calls" USING btree ("outbox_event_id");--> statement-breakpoint
CREATE INDEX "telephony_calls_consultation_requested_idx" ON "telephony_calls" USING btree ("consultation_id","requested_at");--> statement-breakpoint
CREATE INDEX "telephony_calls_staff_requested_idx" ON "telephony_calls" USING btree ("staff_user_id","requested_at");--> statement-breakpoint
CREATE INDEX "telephony_calls_command_status_requested_idx" ON "telephony_calls" USING btree ("command_status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_endpoints_active_provider_line_uidx" ON "telephony_endpoints" USING btree ("provider","line_number") WHERE "telephony_endpoints"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_endpoints_active_provider_login_uidx" ON "telephony_endpoints" USING btree ("provider","api_login_id") WHERE "telephony_endpoints"."is_active" = true;