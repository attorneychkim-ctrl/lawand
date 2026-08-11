CREATE TYPE "public"."telephony_call_correlation_status" AS ENUM('pending', 'confirmed', 'needs_confirmation', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_leg_kind" AS ENUM('customer', 'consultation', 'internal');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_leg_state" AS ENUM('ringing', 'connected', 'ended');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_observation_type" AS ENUM('ringing', 'channels', 'ended');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_party_kind" AS ENUM('external', 'internal', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_relation_type" AS ENUM('transfer_attempted', 'transfer_completed', 'transfer_returned', 'transfer_unresolved');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_root_state" AS ENUM('ringing', 'connected', 'transferring', 'needs_confirmation', 'ended');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_scope" AS ENUM('external', 'internal');--> statement-breakpoint
CREATE TYPE "public"."telephony_channel_kind" AS ENUM('sip', 'pjsip', 'local', 'local_xfer', 'other', 'none');--> statement-breakpoint
CREATE TYPE "public"."telephony_provider_identifier_role" AS ENUM('root', 'channel', 'source');--> statement-breakpoint
CREATE TABLE "telephony_call_legs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"root_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"staff_user_id" uuid,
	"bridge_id" varchar(80) NOT NULL,
	"kind" "telephony_call_leg_kind" NOT NULL,
	"direction" "telephony_call_direction" NOT NULL,
	"state" "telephony_call_leg_state" DEFAULT 'ringing' NOT NULL,
	"remote_party_kind" "telephony_call_party_kind" NOT NULL,
	"remote_extension" varchar(10),
	"provider_call_id" varchar(100) NOT NULL,
	"provider_channel_id" varchar(100),
	"provider_end_cause" varchar(30),
	"correlation_status" "telephony_call_correlation_status" DEFAULT 'confirmed' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"last_event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_call_legs_bridge_id_format" CHECK ("telephony_call_legs"."bridge_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$'),
	CONSTRAINT "telephony_call_legs_provider_ids" CHECK ("telephony_call_legs"."provider_call_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
        AND ("telephony_call_legs"."provider_channel_id" IS NULL OR "telephony_call_legs"."provider_channel_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$')),
	CONSTRAINT "telephony_call_legs_remote_extension" CHECK (("telephony_call_legs"."remote_party_kind" = 'external' AND "telephony_call_legs"."remote_extension" IS NULL)
        OR ("telephony_call_legs"."remote_party_kind" <> 'external' AND ("telephony_call_legs"."remote_extension" IS NULL OR "telephony_call_legs"."remote_extension" ~ '^[0-9]{2,10}$'))),
	CONSTRAINT "telephony_call_legs_state_times" CHECK ((
        "telephony_call_legs"."state" = 'ringing'
        AND "telephony_call_legs"."connected_at" IS NULL
        AND "telephony_call_legs"."ended_at" IS NULL
        AND "telephony_call_legs"."provider_end_cause" IS NULL
      ) OR (
        "telephony_call_legs"."state" = 'connected'
        AND "telephony_call_legs"."connected_at" IS NOT NULL
        AND "telephony_call_legs"."ended_at" IS NULL
        AND "telephony_call_legs"."provider_end_cause" IS NULL
      ) OR (
        "telephony_call_legs"."state" = 'ended'
        AND "telephony_call_legs"."ended_at" IS NOT NULL
        AND "telephony_call_legs"."provider_end_cause" IS NOT NULL
      )),
	CONSTRAINT "telephony_call_legs_time_order" CHECK (("telephony_call_legs"."connected_at" IS NULL OR "telephony_call_legs"."connected_at" >= "telephony_call_legs"."started_at")
        AND ("telephony_call_legs"."ended_at" IS NULL OR "telephony_call_legs"."ended_at" >= "telephony_call_legs"."started_at")
        AND "telephony_call_legs"."last_event_at" >= "telephony_call_legs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "telephony_call_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"bridge_id" varchar(80) NOT NULL,
	"root_id" uuid,
	"leg_id" uuid,
	"observation_type" "telephony_call_observation_type" NOT NULL,
	"direction" "telephony_call_direction",
	"party_kind" "telephony_call_party_kind",
	"provider_call_id" varchar(100) NOT NULL,
	"related_provider_call_id" varchar(100),
	"source_provider_call_id" varchar(100),
	"context_provider_call_id" varchar(100),
	"remote_party_fingerprint" "bytea",
	"remote_party_masked" varchar(20),
	"incoming_line_last4" varchar(4),
	"agent_extension" varchar(10) NOT NULL,
	"channel_kind" "telephony_channel_kind" NOT NULL,
	"related_channel_kind" "telephony_channel_kind" NOT NULL,
	"provider_end_cause" varchar(30),
	"correlation_status" "telephony_call_correlation_status" DEFAULT 'pending' NOT NULL,
	"event_fingerprint" "bytea" NOT NULL,
	"authentication_nonce_hash" "bytea" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_call_observations_bridge_id_format" CHECK ("telephony_call_observations"."bridge_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$'),
	CONSTRAINT "telephony_call_observations_provider_ids" CHECK ("telephony_call_observations"."provider_call_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
        AND ("telephony_call_observations"."related_provider_call_id" IS NULL OR "telephony_call_observations"."related_provider_call_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$')
        AND ("telephony_call_observations"."source_provider_call_id" IS NULL OR "telephony_call_observations"."source_provider_call_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$')
        AND ("telephony_call_observations"."context_provider_call_id" IS NULL OR "telephony_call_observations"."context_provider_call_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$')),
	CONSTRAINT "telephony_call_observations_hash_lengths" CHECK (octet_length("telephony_call_observations"."event_fingerprint") = 32
        AND octet_length("telephony_call_observations"."authentication_nonce_hash") = 32
        AND ("telephony_call_observations"."remote_party_fingerprint" IS NULL OR octet_length("telephony_call_observations"."remote_party_fingerprint") = 32)),
	CONSTRAINT "telephony_call_observations_remote_party" CHECK ((
        "telephony_call_observations"."remote_party_fingerprint" IS NULL
        AND "telephony_call_observations"."remote_party_masked" IS NULL
      ) OR (
        "telephony_call_observations"."remote_party_fingerprint" IS NOT NULL
        AND "telephony_call_observations"."remote_party_masked" ~ '^\*\*\*[0-9]{2,4}$'
      )),
	CONSTRAINT "telephony_call_observations_line_extension" CHECK (("telephony_call_observations"."incoming_line_last4" IS NULL OR "telephony_call_observations"."incoming_line_last4" ~ '^[0-9]{2,4}$')
        AND "telephony_call_observations"."agent_extension" ~ '^[0-9]{2,10}$')
);
--> statement-breakpoint
CREATE TABLE "telephony_call_provider_identifiers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"root_id" uuid NOT NULL,
	"leg_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"provider" "telephony_provider" DEFAULT 'centrex' NOT NULL,
	"role" "telephony_provider_identifier_role" NOT NULL,
	"provider_value" varchar(100) NOT NULL,
	"first_observed_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_call_provider_identifiers_value_format" CHECK ("telephony_call_provider_identifiers"."provider_value" ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'),
	CONSTRAINT "telephony_call_provider_identifiers_time_order" CHECK ("telephony_call_provider_identifiers"."last_observed_at" >= "telephony_call_provider_identifiers"."first_observed_at")
);
--> statement-breakpoint
CREATE TABLE "telephony_call_relations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"root_id" uuid NOT NULL,
	"from_leg_id" uuid,
	"to_leg_id" uuid,
	"relation_type" "telephony_call_relation_type" NOT NULL,
	"correlation_status" "telephony_call_correlation_status" NOT NULL,
	"correlation_key" varchar(220) NOT NULL,
	"evidence" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_call_relations_key_nonempty" CHECK (length(btrim("telephony_call_relations"."correlation_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "telephony_call_roots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" "telephony_provider" DEFAULT 'centrex' NOT NULL,
	"scope" "telephony_call_scope" NOT NULL,
	"direction" "telephony_call_direction",
	"state" "telephony_call_root_state" DEFAULT 'ringing' NOT NULL,
	"correlation_status" "telephony_call_correlation_status" DEFAULT 'confirmed' NOT NULL,
	"original_endpoint_id" uuid NOT NULL,
	"current_endpoint_id" uuid,
	"final_endpoint_id" uuid,
	"final_staff_user_id" uuid,
	"remote_phone_ciphertext" "bytea",
	"remote_phone_nonce" "bytea",
	"remote_phone_key_version" varchar(50),
	"remote_phone_fingerprint" "bytea",
	"remote_phone_masked" varchar(20),
	"original_line_last4" varchar(4),
	"started_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"last_event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_call_roots_scope_direction" CHECK (("telephony_call_roots"."scope" = 'external' AND "telephony_call_roots"."direction" IS NOT NULL)
        OR ("telephony_call_roots"."scope" = 'internal' AND "telephony_call_roots"."direction" IS NULL)),
	CONSTRAINT "telephony_call_roots_remote_party" CHECK ((
        "telephony_call_roots"."scope" = 'external'
        AND "telephony_call_roots"."remote_phone_ciphertext" IS NOT NULL
        AND "telephony_call_roots"."remote_phone_nonce" IS NOT NULL
        AND "telephony_call_roots"."remote_phone_key_version" IS NOT NULL
        AND "telephony_call_roots"."remote_phone_fingerprint" IS NOT NULL
        AND "telephony_call_roots"."remote_phone_masked" IS NOT NULL
        AND "telephony_call_roots"."original_line_last4" IS NOT NULL
        AND octet_length("telephony_call_roots"."remote_phone_ciphertext") >= 17
        AND octet_length("telephony_call_roots"."remote_phone_nonce") = 12
        AND octet_length("telephony_call_roots"."remote_phone_fingerprint") = 32
        AND "telephony_call_roots"."remote_phone_masked" ~ '^\*\*\*[0-9]{4}$'
        AND "telephony_call_roots"."original_line_last4" ~ '^[0-9]{4}$'
      ) OR (
        "telephony_call_roots"."scope" = 'internal'
        AND "telephony_call_roots"."remote_phone_ciphertext" IS NULL
        AND "telephony_call_roots"."remote_phone_nonce" IS NULL
        AND "telephony_call_roots"."remote_phone_key_version" IS NULL
        AND "telephony_call_roots"."remote_phone_fingerprint" IS NULL
        AND "telephony_call_roots"."remote_phone_masked" IS NULL
        AND "telephony_call_roots"."original_line_last4" IS NULL
      )),
	CONSTRAINT "telephony_call_roots_time_order" CHECK (("telephony_call_roots"."connected_at" IS NULL OR "telephony_call_roots"."connected_at" >= "telephony_call_roots"."started_at")
        AND ("telephony_call_roots"."ended_at" IS NULL OR "telephony_call_roots"."ended_at" >= "telephony_call_roots"."started_at")
        AND "telephony_call_roots"."last_event_at" >= "telephony_call_roots"."started_at"),
	CONSTRAINT "telephony_call_roots_end_state" CHECK (("telephony_call_roots"."state" = 'ended' AND "telephony_call_roots"."ended_at" IS NOT NULL)
        OR ("telephony_call_roots"."state" <> 'ended'))
);
--> statement-breakpoint
ALTER TABLE "telephony_call_aftercare" DROP CONSTRAINT "telephony_call_aftercare_source_present";--> statement-breakpoint
ALTER TABLE "telephony_call_aftercare" ADD COLUMN "call_root_id" uuid;--> statement-breakpoint
ALTER TABLE "telephony_inbound_calls" ADD COLUMN "call_root_id" uuid;--> statement-breakpoint
ALTER TABLE "telephony_inbound_calls" ADD COLUMN "call_leg_id" uuid;--> statement-breakpoint
ALTER TABLE "telephony_call_legs" ADD CONSTRAINT "telephony_call_legs_root_id_telephony_call_roots_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."telephony_call_roots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_legs" ADD CONSTRAINT "telephony_call_legs_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_legs" ADD CONSTRAINT "telephony_call_legs_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_observations" ADD CONSTRAINT "telephony_call_observations_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_observations" ADD CONSTRAINT "telephony_call_observations_root_id_telephony_call_roots_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."telephony_call_roots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_observations" ADD CONSTRAINT "telephony_call_observations_leg_id_telephony_call_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."telephony_call_legs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_provider_identifiers" ADD CONSTRAINT "telephony_call_provider_identifiers_root_id_telephony_call_roots_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."telephony_call_roots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_provider_identifiers" ADD CONSTRAINT "telephony_call_provider_identifiers_leg_id_telephony_call_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."telephony_call_legs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_provider_identifiers" ADD CONSTRAINT "telephony_call_provider_identifiers_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_relations" ADD CONSTRAINT "telephony_call_relations_root_id_telephony_call_roots_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."telephony_call_roots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_relations" ADD CONSTRAINT "telephony_call_relations_from_leg_id_telephony_call_legs_id_fk" FOREIGN KEY ("from_leg_id") REFERENCES "public"."telephony_call_legs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_relations" ADD CONSTRAINT "telephony_call_relations_to_leg_id_telephony_call_legs_id_fk" FOREIGN KEY ("to_leg_id") REFERENCES "public"."telephony_call_legs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_roots" ADD CONSTRAINT "telephony_call_roots_original_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("original_endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_roots" ADD CONSTRAINT "telephony_call_roots_current_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("current_endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_roots" ADD CONSTRAINT "telephony_call_roots_final_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("final_endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_roots" ADD CONSTRAINT "telephony_call_roots_final_staff_user_id_staff_users_id_fk" FOREIGN KEY ("final_staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_call_legs_endpoint_provider_uidx" ON "telephony_call_legs" USING btree ("endpoint_id","provider_call_id");--> statement-breakpoint
CREATE INDEX "telephony_call_legs_root_state_idx" ON "telephony_call_legs" USING btree ("root_id","kind","state");--> statement-breakpoint
CREATE INDEX "telephony_call_legs_staff_last_event_idx" ON "telephony_call_legs" USING btree ("staff_user_id","last_event_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_call_observations_bridge_nonce_uidx" ON "telephony_call_observations" USING btree ("bridge_id","authentication_nonce_hash");--> statement-breakpoint
CREATE INDEX "telephony_call_observations_provider_call_idx" ON "telephony_call_observations" USING btree ("provider_call_id","occurred_at");--> statement-breakpoint
CREATE INDEX "telephony_call_observations_root_occurred_idx" ON "telephony_call_observations" USING btree ("root_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_call_provider_identifiers_endpoint_role_uidx" ON "telephony_call_provider_identifiers" USING btree ("endpoint_id","role","provider_value");--> statement-breakpoint
CREATE INDEX "telephony_call_provider_identifiers_provider_value_idx" ON "telephony_call_provider_identifiers" USING btree ("provider","provider_value");--> statement-breakpoint
CREATE INDEX "telephony_call_provider_identifiers_root_leg_idx" ON "telephony_call_provider_identifiers" USING btree ("root_id","leg_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_call_relations_correlation_key_uidx" ON "telephony_call_relations" USING btree ("correlation_key");--> statement-breakpoint
CREATE INDEX "telephony_call_relations_root_occurred_idx" ON "telephony_call_relations" USING btree ("root_id","occurred_at");--> statement-breakpoint
CREATE INDEX "telephony_call_roots_state_last_event_idx" ON "telephony_call_roots" USING btree ("scope","state","last_event_at");--> statement-breakpoint
CREATE INDEX "telephony_call_roots_phone_started_idx" ON "telephony_call_roots" USING btree ("remote_phone_fingerprint","started_at");--> statement-breakpoint
CREATE INDEX "telephony_call_roots_current_endpoint_idx" ON "telephony_call_roots" USING btree ("current_endpoint_id","state");--> statement-breakpoint
ALTER TABLE "telephony_call_aftercare" ADD CONSTRAINT "telephony_call_aftercare_call_root_id_telephony_call_roots_id_fk" FOREIGN KEY ("call_root_id") REFERENCES "public"."telephony_call_roots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_inbound_calls" ADD CONSTRAINT "telephony_inbound_calls_call_root_id_telephony_call_roots_id_fk" FOREIGN KEY ("call_root_id") REFERENCES "public"."telephony_call_roots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_inbound_calls" ADD CONSTRAINT "telephony_inbound_calls_call_leg_id_telephony_call_legs_id_fk" FOREIGN KEY ("call_leg_id") REFERENCES "public"."telephony_call_legs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_call_aftercare_root_uidx" ON "telephony_call_aftercare" USING btree ("call_root_id") WHERE "telephony_call_aftercare"."call_root_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "telephony_call_aftercare" ADD CONSTRAINT "telephony_call_aftercare_source_present" CHECK (num_nonnulls("telephony_call_aftercare"."observed_call_id", "telephony_call_aftercare"."telephony_call_id", "telephony_call_aftercare"."call_root_id") = 1);--> statement-breakpoint

-- 기존 수·발신 원장을 동일 UUID의 external root로 승격한다. root 복호화 AAD도 기존
-- telephony_inbound_calls/{id}/remote_phone 계약을 그대로 사용하므로 재암호화가 필요 없다.
INSERT INTO telephony_call_roots (
  id, provider, scope, direction, state, correlation_status,
  original_endpoint_id, current_endpoint_id, final_endpoint_id, final_staff_user_id,
  remote_phone_ciphertext, remote_phone_nonce, remote_phone_key_version,
  remote_phone_fingerprint, remote_phone_masked, original_line_last4,
  started_at, connected_at, ended_at, last_event_at, created_at, updated_at
)
SELECT
  call.id,
  call.provider,
  'external'::telephony_call_scope,
  call.direction,
  call.state::text::telephony_call_root_state,
  'confirmed'::telephony_call_correlation_status,
  call.endpoint_id,
  call.endpoint_id,
  CASE WHEN call.state = 'ended' THEN call.endpoint_id ELSE NULL END,
  CASE WHEN call.state = 'ended' THEN owner.staff_user_id ELSE NULL END,
  call.remote_phone_ciphertext,
  call.remote_phone_nonce,
  call.remote_phone_key_version,
  call.remote_phone_fingerprint,
  call.remote_phone_masked,
  call.incoming_line_last4,
  call.ringing_at,
  call.connected_at,
  call.ended_at,
  call.last_event_at,
  call.created_at,
  call.updated_at
FROM telephony_inbound_calls AS call
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN count(*) = 1 THEN min(binding.staff_user_id::text)::uuid
    ELSE NULL
  END AS staff_user_id
  FROM staff_telephony_bindings AS binding
  WHERE binding.endpoint_id = call.endpoint_id
    AND binding.is_active = true
) AS owner ON true
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

INSERT INTO telephony_call_legs (
  id, root_id, endpoint_id, staff_user_id, bridge_id, kind, direction, state,
  remote_party_kind, remote_extension, provider_call_id, provider_channel_id,
  provider_end_cause, correlation_status, started_at, connected_at, ended_at,
  last_event_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  call.id,
  call.endpoint_id,
  owner.staff_user_id,
  call.bridge_id,
  'customer'::telephony_call_leg_kind,
  call.direction,
  call.state::text::telephony_call_leg_state,
  'external'::telephony_call_party_kind,
  NULL,
  call.provider_call_id,
  channel.provider_channel_id,
  CASE
    WHEN call.state = 'ended' THEN COALESCE(call.provider_end_cause, 'legacy_unknown')
    ELSE NULL
  END,
  'confirmed'::telephony_call_correlation_status,
  call.ringing_at,
  call.connected_at,
  call.ended_at,
  call.last_event_at,
  call.created_at,
  call.updated_at
FROM telephony_inbound_calls AS call
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN count(*) = 1 THEN min(binding.staff_user_id::text)::uuid
    ELSE NULL
  END AS staff_user_id
  FROM staff_telephony_bindings AS binding
  WHERE binding.endpoint_id = call.endpoint_id
    AND binding.is_active = true
) AS owner ON true
LEFT JOIN LATERAL (
  SELECT event.provider_channel_id
  FROM telephony_inbound_events AS event
  WHERE event.inbound_call_id = call.id
    AND event.provider_channel_id IS NOT NULL
  ORDER BY event.occurred_at DESC
  LIMIT 1
) AS channel ON true
ON CONFLICT (endpoint_id, provider_call_id) DO NOTHING;--> statement-breakpoint

UPDATE telephony_inbound_calls AS call
SET
  call_root_id = leg.root_id,
  call_leg_id = leg.id
FROM telephony_call_legs AS leg
WHERE leg.endpoint_id = call.endpoint_id
  AND leg.provider_call_id = call.provider_call_id
  AND call.call_root_id IS NULL;--> statement-breakpoint

INSERT INTO telephony_call_provider_identifiers (
  id, root_id, leg_id, endpoint_id, provider, role, provider_value,
  first_observed_at, last_observed_at, created_at
)
SELECT
  gen_random_uuid(), leg.root_id, leg.id, leg.endpoint_id, 'centrex', 'root',
  leg.provider_call_id, leg.started_at, leg.last_event_at, leg.created_at
FROM telephony_call_legs AS leg
ON CONFLICT (endpoint_id, role, provider_value) DO NOTHING;--> statement-breakpoint

INSERT INTO telephony_call_provider_identifiers (
  id, root_id, leg_id, endpoint_id, provider, role, provider_value,
  first_observed_at, last_observed_at, created_at
)
SELECT
  gen_random_uuid(), leg.root_id, leg.id, leg.endpoint_id, 'centrex', 'channel',
  leg.provider_channel_id, leg.connected_at, leg.last_event_at, leg.created_at
FROM telephony_call_legs AS leg
WHERE leg.provider_channel_id IS NOT NULL
  AND leg.connected_at IS NOT NULL
ON CONFLICT (endpoint_id, role, provider_value) DO NOTHING;--> statement-breakpoint

-- 리걸프렌즈 담당자는 표시명과 별도로 원본 Member_idx를 반환한다.
DROP FUNCTION IF EXISTS public.resolve_inbound_phone_directory(text);--> statement-breakpoint
CREATE FUNCTION public.resolve_inbound_phone_directory(
  requested_phone text
)
RETURNS TABLE(
  client_name text,
  case_idx integer,
  case_number text,
  case_name text,
  case_type smallint,
  case_state smallint,
  is_closed smallint,
  is_repealed smallint,
  primary_staff_name text,
  secondary_staff_name text,
  tertiary_staff_name text,
  primary_member_idx integer,
  secondary_member_idx integer,
  tertiary_member_idx integer,
  court_name text,
  case_created_on text,
  case_updated_on text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH normalized AS (
    SELECT regexp_replace(requested_phone, '[^0-9]', '', 'g') AS phone_search
  )
  SELECT
    client."name"::text AS client_name,
    case_record.idx AS case_idx,
    case_record.case_number::text AS case_number,
    case_record.case_name::text AS case_name,
    case_record.case_type,
    case_record.case_state,
    case_record.is_close AS is_closed,
    case_record.is_repeal AS is_repealed,
    primary_member."name"::text AS primary_staff_name,
    secondary_member."name"::text AS secondary_staff_name,
    tertiary_member."name"::text AS tertiary_staff_name,
    case_record."Member_idx" AS primary_member_idx,
    case_record.sub_member_idx AS secondary_member_idx,
    case_record.sub_member2_idx AS tertiary_member_idx,
    case_record.court_name::text AS court_name,
    to_char(case_record.create_dt, 'YYYY-MM-DD') AS case_created_on,
    to_char(case_record.update_dt, 'YYYY-MM-DD') AS case_updated_on
  FROM normalized
  INNER JOIN "CB"."TblCSClient" AS client
    ON client.phone_search = normalized.phone_search
  INNER JOIN "CB"."TblCase" AS case_record
    ON case_record.idx = client."Case_idx"
  LEFT JOIN "CB"."TblMember" AS primary_member
    ON primary_member.idx = case_record."Member_idx"
  LEFT JOIN "CB"."TblMember" AS secondary_member
    ON secondary_member.idx = case_record.sub_member_idx
  LEFT JOIN "CB"."TblMember" AS tertiary_member
    ON tertiary_member.idx = case_record.sub_member2_idx
  WHERE normalized.phone_search ~ '^[0-9]{9,15}$'
    AND COALESCE(case_record.del_flag, 0) <> 1
  ORDER BY case_record.update_dt DESC, case_record.idx DESC
  LIMIT 8
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_inbound_phone_directory(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_inbound_phone_directory(text) TO lawand_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.notify_telephony_call_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  activity_id uuid;
  activity_direction text;
  activity_time timestamptz;
BEGIN
  activity_id := COALESCE(
    (to_jsonb(NEW)->>'root_id')::uuid,
    (to_jsonb(NEW)->>'id')::uuid
  );
  IF TG_TABLE_NAME = 'telephony_call_roots' THEN
    activity_direction := COALESCE(to_jsonb(NEW)->>'direction', 'inbound');
    activity_time := (to_jsonb(NEW)->>'last_event_at')::timestamptz;
  ELSE
    SELECT COALESCE(root.direction::text, 'inbound')
    INTO activity_direction
    FROM telephony_call_roots AS root
    WHERE root.id = activity_id;
    activity_time := COALESCE(
      (to_jsonb(NEW)->>'updated_at')::timestamptz,
      (to_jsonb(NEW)->>'occurred_at')::timestamptz,
      now()
    );
  END IF;
  PERFORM pg_notify(
    'lawand_telephony_desk_events',
    json_build_object(
      'eventType', 'call_activity.changed',
      'entityId', activity_id,
      'direction', activity_direction,
      'occurredAt', activity_time
    )::text
  );
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER telephony_call_roots_activity_notify
AFTER INSERT OR UPDATE ON telephony_call_roots
FOR EACH ROW EXECUTE FUNCTION public.notify_telephony_call_activity();--> statement-breakpoint
CREATE TRIGGER telephony_call_legs_activity_notify
AFTER INSERT OR UPDATE ON telephony_call_legs
FOR EACH ROW EXECUTE FUNCTION public.notify_telephony_call_activity();--> statement-breakpoint
CREATE TRIGGER telephony_call_relations_activity_notify
AFTER INSERT OR UPDATE ON telephony_call_relations
FOR EACH ROW EXECUTE FUNCTION public.notify_telephony_call_activity();--> statement-breakpoint

REVOKE ALL ON TABLE telephony_call_roots FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE telephony_call_legs FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE telephony_call_provider_identifiers FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE telephony_call_relations FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE telephony_call_observations FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telephony_call_roots TO lawand_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telephony_call_legs TO lawand_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telephony_call_provider_identifiers TO lawand_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telephony_call_relations TO lawand_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telephony_call_observations TO lawand_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    GRANT SELECT ON TABLE telephony_call_roots TO lawand_viewer;
    GRANT SELECT ON TABLE telephony_call_legs TO lawand_viewer;
    GRANT SELECT ON TABLE telephony_call_provider_identifiers TO lawand_viewer;
    GRANT SELECT ON TABLE telephony_call_relations TO lawand_viewer;
    GRANT SELECT ON TABLE telephony_call_observations TO lawand_viewer;
  END IF;
END
$$;
