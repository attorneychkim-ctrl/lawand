CREATE TABLE "telephony_inbound_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" "telephony_message_provider" DEFAULT 'centrex' NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"provider_sequence" varchar(50) NOT NULL,
	"provider_identity_fingerprint" "bytea" NOT NULL,
	"remote_phone_fingerprint" "bytea" NOT NULL,
	"remote_phone_ciphertext" "bytea" NOT NULL,
	"remote_phone_nonce" "bytea" NOT NULL,
	"remote_phone_key_version" varchar(50) NOT NULL,
	"body_ciphertext" "bytea" NOT NULL,
	"body_nonce" "bytea" NOT NULL,
	"body_key_version" varchar(50) NOT NULL,
	"body_fingerprint" "bytea" NOT NULL,
	"message_kind" "telephony_message_kind" NOT NULL,
	"body_byte_length" integer NOT NULL,
	"matched_outbound_message_id" uuid,
	"target_source" "telephony_call_target_source",
	"consultation_id" uuid,
	"directory_client_idx" integer,
	"directory_case_idx" integer,
	"match_strategy" varchar(30) DEFAULT 'unmatched' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_inbound_messages_provider" CHECK ("telephony_inbound_messages"."provider" = 'centrex'),
	CONSTRAINT "telephony_inbound_messages_provider_identity_length" CHECK (octet_length("telephony_inbound_messages"."provider_identity_fingerprint") = 32),
	CONSTRAINT "telephony_inbound_messages_remote_phone_crypto" CHECK (octet_length("telephony_inbound_messages"."remote_phone_fingerprint") = 32
        AND octet_length("telephony_inbound_messages"."remote_phone_ciphertext") >= 17
        AND octet_length("telephony_inbound_messages"."remote_phone_nonce") = 12
        AND length(btrim("telephony_inbound_messages"."remote_phone_key_version")) > 0),
	CONSTRAINT "telephony_inbound_messages_body_crypto" CHECK (octet_length("telephony_inbound_messages"."body_fingerprint") = 32
        AND octet_length("telephony_inbound_messages"."body_ciphertext") >= 17
        AND octet_length("telephony_inbound_messages"."body_nonce") = 12
        AND length(btrim("telephony_inbound_messages"."body_key_version")) > 0),
	CONSTRAINT "telephony_inbound_messages_kind_byte_length" CHECK ((
        "telephony_inbound_messages"."message_kind" = 'sms'
        AND "telephony_inbound_messages"."body_byte_length" BETWEEN 1 AND 80
      ) OR (
        "telephony_inbound_messages"."message_kind" = 'lms'
        AND "telephony_inbound_messages"."body_byte_length" BETWEEN 81 AND 720
      )),
	CONSTRAINT "telephony_inbound_messages_match_reference" CHECK ((
        "telephony_inbound_messages"."match_strategy" = 'unmatched'
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NULL
        AND "telephony_inbound_messages"."target_source" IS NULL
        AND "telephony_inbound_messages"."consultation_id" IS NULL
        AND "telephony_inbound_messages"."directory_client_idx" IS NULL
        AND "telephony_inbound_messages"."directory_case_idx" IS NULL
      ) OR (
        "telephony_inbound_messages"."match_strategy" = 'latest_outbound'
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NOT NULL
        AND "telephony_inbound_messages"."target_source" = 'consultation'
        AND "telephony_inbound_messages"."consultation_id" IS NOT NULL
        AND "telephony_inbound_messages"."directory_client_idx" IS NULL
        AND "telephony_inbound_messages"."directory_case_idx" IS NULL
      ) OR (
        "telephony_inbound_messages"."match_strategy" = 'latest_outbound'
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NOT NULL
        AND "telephony_inbound_messages"."target_source" = 'legal_friends_directory'
        AND "telephony_inbound_messages"."consultation_id" IS NULL
        AND "telephony_inbound_messages"."directory_client_idx" > 0
        AND "telephony_inbound_messages"."directory_case_idx" > 0
      )),
	CONSTRAINT "telephony_inbound_messages_fetch_time_order" CHECK ("telephony_inbound_messages"."fetched_at" >= "telephony_inbound_messages"."received_at" - interval '5 minutes')
);
--> statement-breakpoint
CREATE TABLE "telephony_message_mailbox_states" (
	"endpoint_id" uuid PRIMARY KEY NOT NULL,
	"next_page" integer DEFAULT 1 NOT NULL,
	"poll_backfill_next" boolean DEFAULT false NOT NULL,
	"backfill_completed_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"last_error_code" varchar(100),
	"last_imported_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_message_mailbox_states_next_page_positive" CHECK ("telephony_message_mailbox_states"."next_page" > 0),
	CONSTRAINT "telephony_message_mailbox_states_error_pair" CHECK (("telephony_message_mailbox_states"."last_failed_at" IS NULL AND "telephony_message_mailbox_states"."last_error_code" IS NULL)
        OR ("telephony_message_mailbox_states"."last_failed_at" IS NOT NULL AND "telephony_message_mailbox_states"."last_error_code" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "telephony_endpoints" ADD COLUMN "public_number" varchar(20);--> statement-breakpoint
ALTER TABLE "telephony_inbound_messages" ADD CONSTRAINT "telephony_inbound_messages_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_inbound_messages" ADD CONSTRAINT "telephony_inbound_messages_matched_outbound_message_id_telephony_messages_id_fk" FOREIGN KEY ("matched_outbound_message_id") REFERENCES "public"."telephony_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_inbound_messages" ADD CONSTRAINT "telephony_inbound_messages_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_message_mailbox_states" ADD CONSTRAINT "telephony_message_mailbox_states_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_inbound_messages_provider_identity_uidx" ON "telephony_inbound_messages" USING btree ("endpoint_id","provider_identity_fingerprint");--> statement-breakpoint
CREATE INDEX "telephony_inbound_messages_endpoint_received_idx" ON "telephony_inbound_messages" USING btree ("endpoint_id","received_at");--> statement-breakpoint
CREATE INDEX "telephony_inbound_messages_remote_received_idx" ON "telephony_inbound_messages" USING btree ("remote_phone_fingerprint","received_at");--> statement-breakpoint
CREATE INDEX "telephony_inbound_messages_case_received_idx" ON "telephony_inbound_messages" USING btree ("directory_case_idx","received_at");--> statement-breakpoint
CREATE INDEX "telephony_inbound_messages_consultation_received_idx" ON "telephony_inbound_messages" USING btree ("consultation_id","received_at");--> statement-breakpoint
CREATE INDEX "telephony_message_mailbox_states_sync_idx" ON "telephony_message_mailbox_states" USING btree ("last_synced_at");--> statement-breakpoint
ALTER TABLE "telephony_endpoints" ADD CONSTRAINT "telephony_endpoints_public_number_scope" CHECK ((
        "telephony_endpoints"."endpoint_type" = 'personal'
        AND "telephony_endpoints"."public_number" IS NULL
      ) OR (
        "telephony_endpoints"."endpoint_type" = 'representative'
        AND (
          "telephony_endpoints"."public_number" IS NULL
          OR "telephony_endpoints"."public_number" ~ '^0[0-9]{8,10}$'
        )
      ));--> statement-breakpoint
REVOKE ALL ON TABLE "telephony_inbound_messages" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE "telephony_message_mailbox_states" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telephony_inbound_messages TO lawand_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telephony_message_mailbox_states TO lawand_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    EXECUTE 'GRANT SELECT ON TABLE telephony_inbound_messages TO lawand_viewer';
    EXECUTE 'GRANT SELECT ON TABLE telephony_message_mailbox_states TO lawand_viewer';
  END IF;
END
$$;--> statement-breakpoint
INSERT INTO "telephony_endpoints" (
  "id", "provider", "endpoint_type", "label", "line_number",
  "public_number", "extension", "api_login_id", "credential_key", "is_active"
) VALUES
  ('7deb9584-daae-402f-801c-1f5d4bb1bf95', 'centrex', 'representative', '대표 문자함 042-484-0488', '07052149190', '0424840488', '0488', '07052149190', 'representative-9190', false),
  ('aaaedf91-f57b-4ff3-a67a-fe1f25bdfaba', 'centrex', 'representative', '대표 문자함 070-4607-0588', '07046070588', NULL, '0588', '07046070588', 'representative-0588', false),
  ('f2892617-b0e1-44cd-b85a-18ff6f49f62c', 'centrex', 'representative', '대표 문자함 051-505-1909', '07052257584', '0515051909', '1909', '07052257584', 'representative-7584', false),
  ('687c82da-85c9-491e-8d79-80180a12484e', 'centrex', 'representative', '대표 문자함 051-502-1919', '07052148594', '0515021919', '1919', '07052148594', 'representative-8594', false),
  ('753fbc66-7fc6-46a3-8bbe-de244f599892', 'centrex', 'representative', '대표 문자함 042-485-0488', '07052257426', '0424850488', '3623', '07052257426', 'representative-7426', false),
  ('c2a78c43-b4ca-4072-9a63-d5e7afb83e7c', 'centrex', 'representative', '대표 문자함 02-555-7455', '07046079605', '025557455', '7455', '07046079605', 'representative-9605', false),
  ('9d49e914-98c8-42ab-a409-b1227e381a70', 'centrex', 'representative', '대표 문자함 02-555-7465', '07075999388', '025557465', '7465', '07075999388', 'representative-9388', false)
ON CONFLICT DO NOTHING;
