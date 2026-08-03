CREATE TYPE "public"."consultation_mode" AS ENUM('quick', 'detailed');--> statement-breakpoint
CREATE TYPE "public"."consultation_state" AS ENUM('requested', 'assigned', 'contacted', 'completed', 'engaged', 'closed');--> statement-breakpoint
CREATE TYPE "public"."contact_preference" AS ENUM('as_soon_as_possible', 'scheduled_window');--> statement-breakpoint
CREATE TYPE "public"."dedupe_outcome" AS ENUM('new', 'exact_duplicate', 'identity_enrichment', 'suspected_duplicate');--> statement-breakpoint
CREATE TYPE "public"."journey_event_type" AS ENUM('page_view', 'consultation_cta_clicked');--> statement-breakpoint
CREATE TYPE "public"."landing_page_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'published', 'dead');--> statement-breakpoint
CREATE TABLE "consultation_attributions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consultation_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"journey_session_id" uuid NOT NULL,
	"landing_page_id" uuid,
	"landing_page_key_snapshot" varchar(100),
	"landing_page_version_snapshot" varchar(50),
	"submitted_from_path" text NOT NULL,
	"cta_path" text,
	"cta_placement" varchar(100),
	"cta_clicked_at" timestamp with time zone,
	"source_snapshot" jsonb NOT NULL,
	"attribution_model" varchar(50) DEFAULT 'submission_session_v1' NOT NULL,
	"attributed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_attributions_internal_submit_path" CHECK ("consultation_attributions"."submitted_from_path" LIKE '/%' AND "consultation_attributions"."submitted_from_path" NOT LIKE '//%'),
	CONSTRAINT "consultation_attributions_cta_complete" CHECK ((
        "consultation_attributions"."cta_path" IS NULL
        AND "consultation_attributions"."cta_placement" IS NULL
        AND "consultation_attributions"."cta_clicked_at" IS NULL
      ) OR (
        "consultation_attributions"."cta_path" IS NOT NULL
        AND "consultation_attributions"."cta_placement" IS NOT NULL
        AND "consultation_attributions"."cta_clicked_at" IS NOT NULL
        AND "consultation_attributions"."cta_path" LIKE '/%'
        AND "consultation_attributions"."cta_path" NOT LIKE '//%'
      )),
	CONSTRAINT "consultation_attributions_source_object" CHECK (jsonb_typeof("consultation_attributions"."source_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "consultation_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consultation_id" uuid NOT NULL,
	"source" varchar(50) DEFAULT 'homepage' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"mode" "consultation_mode" NOT NULL,
	"phone_fingerprint" "bytea" NOT NULL,
	"phone_ciphertext" "bytea" NOT NULL,
	"phone_nonce" "bytea" NOT NULL,
	"phone_key_version" varchar(50) NOT NULL,
	"has_provided_name" boolean DEFAULT false NOT NULL,
	"name_ciphertext" "bytea",
	"name_nonce" "bytea",
	"name_key_version" varchar(50),
	"intake_ciphertext" "bytea" NOT NULL,
	"intake_nonce" "bytea" NOT NULL,
	"intake_key_version" varchar(50) NOT NULL,
	"payload_fingerprint" "bytea" NOT NULL,
	"contact_preference" "contact_preference" NOT NULL,
	"contact_window_start" timestamp with time zone,
	"contact_window_end" timestamp with time zone,
	"privacy_notice_version" varchar(50) NOT NULL,
	"consent_agreed_at" timestamp with time zone NOT NULL,
	"journey_session_id" uuid,
	"dedupe_outcome" "dedupe_outcome" NOT NULL,
	"candidate_consultation_id" uuid,
	"submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_requests_id_consultation_unique" UNIQUE("id","consultation_id"),
	CONSTRAINT "consultation_requests_name_crypto_complete" CHECK ((
        "consultation_requests"."has_provided_name" = false
        AND "consultation_requests"."name_ciphertext" IS NULL
        AND "consultation_requests"."name_nonce" IS NULL
        AND "consultation_requests"."name_key_version" IS NULL
      ) OR (
        "consultation_requests"."has_provided_name" = true
        AND "consultation_requests"."name_ciphertext" IS NOT NULL
        AND "consultation_requests"."name_nonce" IS NOT NULL
        AND "consultation_requests"."name_key_version" IS NOT NULL
      )),
	CONSTRAINT "consultation_requests_contact_window_consistent" CHECK ((
        "consultation_requests"."contact_preference" = 'as_soon_as_possible'
        AND "consultation_requests"."contact_window_start" IS NULL
        AND "consultation_requests"."contact_window_end" IS NULL
      ) OR (
        "consultation_requests"."contact_preference" = 'scheduled_window'
        AND "consultation_requests"."contact_window_start" IS NOT NULL
        AND "consultation_requests"."contact_window_end" IS NOT NULL
        AND "consultation_requests"."contact_window_end" > "consultation_requests"."contact_window_start"
      )),
	CONSTRAINT "consultation_requests_candidate_consistent" CHECK (("consultation_requests"."dedupe_outcome" = 'suspected_duplicate' AND "consultation_requests"."candidate_consultation_id" IS NOT NULL)
        OR ("consultation_requests"."dedupe_outcome" <> 'suspected_duplicate' AND "consultation_requests"."candidate_consultation_id" IS NULL)),
	CONSTRAINT "consultation_requests_candidate_is_different" CHECK ("consultation_requests"."candidate_consultation_id" IS NULL OR "consultation_requests"."candidate_consultation_id" <> "consultation_requests"."consultation_id"),
	CONSTRAINT "consultation_requests_fingerprint_lengths" CHECK (octet_length("consultation_requests"."phone_fingerprint") = 32
        AND octet_length("consultation_requests"."payload_fingerprint") = 32),
	CONSTRAINT "consultation_requests_nonce_lengths" CHECK (octet_length("consultation_requests"."phone_nonce") = 12
        AND octet_length("consultation_requests"."intake_nonce") = 12
        AND ("consultation_requests"."name_nonce" IS NULL OR octet_length("consultation_requests"."name_nonce") = 12))
);
--> statement-breakpoint
CREATE TABLE "consultation_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consultation_id" uuid NOT NULL,
	"from_state" "consultation_state",
	"to_state" "consultation_state" NOT NULL,
	"reason" varchar(200),
	"actor_type" varchar(50) NOT NULL,
	"actor_id" varchar(100),
	"changed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_status_history_actual_change" CHECK ("consultation_status_history"."from_state" IS NULL OR "consultation_status_history"."from_state" <> "consultation_status_history"."to_state")
);
--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_receipt_code" varchar(32) NOT NULL,
	"state" "consultation_state" DEFAULT 'requested' NOT NULL,
	"phone_fingerprint" "bytea" NOT NULL,
	"anonymous_label" varchar(64) NOT NULL,
	"preferred_name_ciphertext" "bytea",
	"preferred_name_nonce" "bytea",
	"preferred_name_key_version" varchar(50),
	"first_requested_at" timestamp with time zone NOT NULL,
	"last_requested_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultations_request_time_order" CHECK ("consultations"."last_requested_at" >= "consultations"."first_requested_at"),
	CONSTRAINT "consultations_name_crypto_complete" CHECK ((
        "consultations"."preferred_name_ciphertext" IS NULL
        AND "consultations"."preferred_name_nonce" IS NULL
        AND "consultations"."preferred_name_key_version" IS NULL
      ) OR (
        "consultations"."preferred_name_ciphertext" IS NOT NULL
        AND "consultations"."preferred_name_nonce" IS NOT NULL
        AND "consultations"."preferred_name_key_version" IS NOT NULL
      )),
	CONSTRAINT "consultations_phone_fingerprint_length" CHECK (octet_length("consultations"."phone_fingerprint") = 32),
	CONSTRAINT "consultations_name_nonce_length" CHECK ("consultations"."preferred_name_nonce" IS NULL OR octet_length("consultations"."preferred_name_nonce") = 12),
	CONSTRAINT "consultations_closed_state_consistent" CHECK (("consultations"."state" = 'closed' AND "consultations"."closed_at" IS NOT NULL)
        OR ("consultations"."state" <> 'closed' AND "consultations"."closed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "journey_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journey_session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" "journey_event_type" NOT NULL,
	"path" text NOT NULL,
	"landing_page_id" uuid,
	"cta_placement" varchar(100),
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_events_sequence_positive" CHECK ("journey_events"."sequence" > 0),
	CONSTRAINT "journey_events_internal_path" CHECK ("journey_events"."path" LIKE '/%' AND "journey_events"."path" NOT LIKE '//%'),
	CONSTRAINT "journey_events_cta_context" CHECK (("journey_events"."event_type" = 'consultation_cta_clicked' AND "journey_events"."cta_placement" IS NOT NULL)
        OR ("journey_events"."event_type" = 'page_view' AND "journey_events"."cta_placement" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "journey_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"first_landing_page_id" uuid,
	"first_landing_path" text NOT NULL,
	"referrer_host" varchar(253),
	"adpilot_click_id" varchar(200),
	"platform_click_id" varchar(200),
	"utm_source" varchar(100),
	"utm_medium" varchar(100),
	"utm_campaign" varchar(200),
	"utm_term" varchar(200),
	"utm_content" varchar(200),
	"external_campaign_id" varchar(100),
	"external_ad_group_id" varchar(100),
	"external_keyword_id" varchar(100),
	"external_creative_id" varchar(100),
	"matched_keyword" varchar(200),
	"match_type" varchar(16),
	"collection_notice_version" varchar(50),
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_sessions_internal_landing_path" CHECK ("journey_sessions"."first_landing_path" LIKE '/%' AND "journey_sessions"."first_landing_path" NOT LIKE '//%'),
	CONSTRAINT "journey_sessions_time_order" CHECK ("journey_sessions"."last_seen_at" >= "journey_sessions"."started_at"),
	CONSTRAINT "journey_sessions_match_type" CHECK ("journey_sessions"."match_type" IS NULL OR "journey_sessions"."match_type" IN ('exact', 'phrase', 'broad', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "marketing_landing_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"page_key" varchar(100) NOT NULL,
	"version" integer NOT NULL,
	"route_path" text NOT NULL,
	"intent_key" varchar(100) NOT NULL,
	"template_key" varchar(100) NOT NULL,
	"status" "landing_page_status" DEFAULT 'draft' NOT NULL,
	"copy_approval_id" varchar(100),
	"content_checksum" "bytea",
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_landing_pages_version_positive" CHECK ("marketing_landing_pages"."version" > 0),
	CONSTRAINT "marketing_landing_pages_internal_route" CHECK ("marketing_landing_pages"."route_path" LIKE '/%' AND "marketing_landing_pages"."route_path" NOT LIKE '//%')
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"event_version" integer NOT NULL,
	"correlation_id" uuid NOT NULL,
	"causation_id" uuid,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_version_positive" CHECK ("outbox_events"."event_version" > 0),
	CONSTRAINT "outbox_events_attempts_nonnegative" CHECK ("outbox_events"."attempts" >= 0),
	CONSTRAINT "outbox_events_published_consistent" CHECK (("outbox_events"."status" = 'published' AND "outbox_events"."published_at" IS NOT NULL)
        OR ("outbox_events"."status" <> 'published' AND "outbox_events"."published_at" IS NULL)),
	CONSTRAINT "outbox_events_payload_object" CHECK (jsonb_typeof("outbox_events"."payload") = 'object'),
	CONSTRAINT "outbox_events_envelope_consistent" CHECK ("outbox_events"."payload"->>'eventId' = "outbox_events"."id"::text
        AND "outbox_events"."payload"->>'eventType' = "outbox_events"."event_type"
        AND ("outbox_events"."payload"->>'eventVersion')::integer = "outbox_events"."event_version"
        AND "outbox_events"."payload"->>'correlationId' = "outbox_events"."correlation_id"::text)
);
--> statement-breakpoint
ALTER TABLE "consultation_attributions" ADD CONSTRAINT "consultation_attributions_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_attributions" ADD CONSTRAINT "consultation_attributions_journey_session_id_journey_sessions_id_fk" FOREIGN KEY ("journey_session_id") REFERENCES "public"."journey_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_attributions" ADD CONSTRAINT "consultation_attributions_landing_page_id_marketing_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."marketing_landing_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_attributions" ADD CONSTRAINT "consultation_attribution_request_consultation_fk" FOREIGN KEY ("request_id","consultation_id") REFERENCES "public"."consultation_requests"("id","consultation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_journey_session_id_journey_sessions_id_fk" FOREIGN KEY ("journey_session_id") REFERENCES "public"."journey_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_candidate_consultation_id_consultations_id_fk" FOREIGN KEY ("candidate_consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_status_history" ADD CONSTRAINT "consultation_status_history_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_events" ADD CONSTRAINT "journey_events_journey_session_id_journey_sessions_id_fk" FOREIGN KEY ("journey_session_id") REFERENCES "public"."journey_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_events" ADD CONSTRAINT "journey_events_landing_page_id_marketing_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."marketing_landing_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_sessions" ADD CONSTRAINT "journey_sessions_first_landing_page_id_marketing_landing_pages_id_fk" FOREIGN KEY ("first_landing_page_id") REFERENCES "public"."marketing_landing_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_attributions_request_uidx" ON "consultation_attributions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "consultation_attributions_consultation_idx" ON "consultation_attributions" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "consultation_attributions_session_idx" ON "consultation_attributions" USING btree ("journey_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_requests_source_idempotency_uidx" ON "consultation_requests" USING btree ("source","idempotency_key");--> statement-breakpoint
CREATE INDEX "consultation_requests_consultation_submitted_idx" ON "consultation_requests" USING btree ("consultation_id","submitted_at");--> statement-breakpoint
CREATE INDEX "consultation_requests_phone_submitted_idx" ON "consultation_requests" USING btree ("phone_fingerprint","submitted_at");--> statement-breakpoint
CREATE INDEX "consultation_requests_payload_fingerprint_idx" ON "consultation_requests" USING btree ("payload_fingerprint");--> statement-breakpoint
CREATE INDEX "consultation_status_history_consultation_changed_idx" ON "consultation_status_history" USING btree ("consultation_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "consultations_public_receipt_code_uidx" ON "consultations" USING btree ("public_receipt_code");--> statement-breakpoint
CREATE INDEX "consultations_phone_fingerprint_idx" ON "consultations" USING btree ("phone_fingerprint");--> statement-breakpoint
CREATE INDEX "consultations_state_last_requested_idx" ON "consultations" USING btree ("state","last_requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_events_session_sequence_uidx" ON "journey_events" USING btree ("journey_session_id","sequence");--> statement-breakpoint
CREATE INDEX "journey_events_session_occurred_idx" ON "journey_events" USING btree ("journey_session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "journey_sessions_adpilot_click_idx" ON "journey_sessions" USING btree ("adpilot_click_id");--> statement-breakpoint
CREATE INDEX "journey_sessions_external_ad_group_idx" ON "journey_sessions" USING btree ("external_ad_group_id");--> statement-breakpoint
CREATE INDEX "journey_sessions_started_at_idx" ON "journey_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_landing_pages_key_version_uidx" ON "marketing_landing_pages" USING btree ("page_key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_landing_pages_active_key_uidx" ON "marketing_landing_pages" USING btree ("page_key") WHERE "marketing_landing_pages"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_landing_pages_active_route_uidx" ON "marketing_landing_pages" USING btree ("route_path") WHERE "marketing_landing_pages"."status" = 'active';--> statement-breakpoint
CREATE INDEX "marketing_landing_pages_route_idx" ON "marketing_landing_pages" USING btree ("route_path");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("available_at","created_at") WHERE "outbox_events"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");
