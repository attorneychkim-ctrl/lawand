CREATE TYPE "public"."telephony_bridge_event_type" AS ENUM('inbound.ringing', 'inbound.connected', 'inbound.ended');--> statement-breakpoint
CREATE TYPE "public"."telephony_inbound_call_state" AS ENUM('ringing', 'connected', 'ended');--> statement-breakpoint
CREATE TABLE "telephony_inbound_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" "telephony_provider" DEFAULT 'centrex' NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"bridge_id" varchar(80) NOT NULL,
	"provider_call_id" varchar(100) NOT NULL,
	"remote_phone_ciphertext" "bytea" NOT NULL,
	"remote_phone_nonce" "bytea" NOT NULL,
	"remote_phone_key_version" varchar(50) NOT NULL,
	"remote_phone_fingerprint" "bytea" NOT NULL,
	"remote_phone_masked" varchar(20) NOT NULL,
	"incoming_line_last4" varchar(4) NOT NULL,
	"state" "telephony_inbound_call_state" DEFAULT 'ringing' NOT NULL,
	"ringing_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"provider_end_cause" varchar(30),
	"last_event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_inbound_calls_bridge_id_format" CHECK ("telephony_inbound_calls"."bridge_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$'),
	CONSTRAINT "telephony_inbound_calls_provider_call_id_format" CHECK ("telephony_inbound_calls"."provider_call_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'),
	CONSTRAINT "telephony_inbound_calls_phone_crypto" CHECK (octet_length("telephony_inbound_calls"."remote_phone_nonce") = 12
        AND octet_length("telephony_inbound_calls"."remote_phone_fingerprint") = 32
        AND octet_length("telephony_inbound_calls"."remote_phone_ciphertext") >= 17),
	CONSTRAINT "telephony_inbound_calls_masked_phone" CHECK ("telephony_inbound_calls"."remote_phone_masked" ~ '^\*\*\*[0-9]{4}$'),
	CONSTRAINT "telephony_inbound_calls_line_last4" CHECK ("telephony_inbound_calls"."incoming_line_last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "telephony_inbound_calls_state_times" CHECK ((
        "telephony_inbound_calls"."state" = 'ringing'
        AND "telephony_inbound_calls"."connected_at" IS NULL
        AND "telephony_inbound_calls"."ended_at" IS NULL
        AND "telephony_inbound_calls"."provider_end_cause" IS NULL
      ) OR (
        "telephony_inbound_calls"."state" = 'connected'
        AND "telephony_inbound_calls"."connected_at" IS NOT NULL
        AND "telephony_inbound_calls"."ended_at" IS NULL
        AND "telephony_inbound_calls"."provider_end_cause" IS NULL
      ) OR (
        "telephony_inbound_calls"."state" = 'ended'
        AND "telephony_inbound_calls"."ended_at" IS NOT NULL
        AND "telephony_inbound_calls"."provider_end_cause" IS NOT NULL
      )),
	CONSTRAINT "telephony_inbound_calls_time_order" CHECK (("telephony_inbound_calls"."connected_at" IS NULL OR "telephony_inbound_calls"."connected_at" >= "telephony_inbound_calls"."ringing_at")
        AND ("telephony_inbound_calls"."ended_at" IS NULL OR "telephony_inbound_calls"."ended_at" >= "telephony_inbound_calls"."ringing_at")
        AND "telephony_inbound_calls"."last_event_at" >= "telephony_inbound_calls"."ringing_at")
);
--> statement-breakpoint
CREATE TABLE "telephony_inbound_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inbound_call_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"bridge_id" varchar(80) NOT NULL,
	"event_type" "telephony_bridge_event_type" NOT NULL,
	"provider_call_id" varchar(100) NOT NULL,
	"provider_channel_id" varchar(100),
	"provider_end_cause" varchar(30),
	"event_fingerprint" "bytea" NOT NULL,
	"authentication_nonce_hash" "bytea" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_inbound_events_hash_lengths" CHECK (octet_length("telephony_inbound_events"."event_fingerprint") = 32
        AND octet_length("telephony_inbound_events"."authentication_nonce_hash") = 32),
	CONSTRAINT "telephony_inbound_events_details" CHECK ((
        "telephony_inbound_events"."event_type" = 'inbound.ringing'
        AND "telephony_inbound_events"."provider_channel_id" IS NULL
        AND "telephony_inbound_events"."provider_end_cause" IS NULL
      ) OR (
        "telephony_inbound_events"."event_type" = 'inbound.connected'
        AND "telephony_inbound_events"."provider_end_cause" IS NULL
      ) OR (
        "telephony_inbound_events"."event_type" = 'inbound.ended'
        AND "telephony_inbound_events"."provider_channel_id" IS NULL
        AND "telephony_inbound_events"."provider_end_cause" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "telephony_inbound_calls" ADD CONSTRAINT "telephony_inbound_calls_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_inbound_events" ADD CONSTRAINT "telephony_inbound_events_inbound_call_id_telephony_inbound_calls_id_fk" FOREIGN KEY ("inbound_call_id") REFERENCES "public"."telephony_inbound_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_inbound_events" ADD CONSTRAINT "telephony_inbound_events_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_inbound_calls_endpoint_provider_call_uidx" ON "telephony_inbound_calls" USING btree ("endpoint_id","provider_call_id");--> statement-breakpoint
CREATE INDEX "telephony_inbound_calls_state_last_event_idx" ON "telephony_inbound_calls" USING btree ("state","last_event_at");--> statement-breakpoint
CREATE INDEX "telephony_inbound_calls_phone_ringing_idx" ON "telephony_inbound_calls" USING btree ("remote_phone_fingerprint","ringing_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_inbound_events_bridge_nonce_uidx" ON "telephony_inbound_events" USING btree ("bridge_id","authentication_nonce_hash");--> statement-breakpoint
CREATE INDEX "telephony_inbound_events_call_occurred_idx" ON "telephony_inbound_events" USING btree ("inbound_call_id","occurred_at");