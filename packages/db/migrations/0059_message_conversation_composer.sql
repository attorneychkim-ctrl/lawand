CREATE TYPE "public"."telephony_message_target_source" AS ENUM('consultation', 'legal_friends_directory', 'manual');--> statement-breakpoint
CREATE TABLE "telephony_message_manual_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_fingerprint" "bytea" NOT NULL,
	"phone_ciphertext" "bytea" NOT NULL,
	"phone_nonce" "bytea" NOT NULL,
	"phone_key_version" varchar(50) NOT NULL,
	"display_name_ciphertext" "bytea" NOT NULL,
	"display_name_nonce" "bytea" NOT NULL,
	"display_name_key_version" varchar(50) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_message_manual_contacts_crypto" CHECK (octet_length("telephony_message_manual_contacts"."phone_fingerprint") = 32
        AND octet_length("telephony_message_manual_contacts"."phone_ciphertext") >= 17
        AND octet_length("telephony_message_manual_contacts"."phone_nonce") = 12
        AND length(btrim("telephony_message_manual_contacts"."phone_key_version")) > 0
        AND octet_length("telephony_message_manual_contacts"."display_name_ciphertext") >= 17
        AND octet_length("telephony_message_manual_contacts"."display_name_nonce") = 12
        AND length(btrim("telephony_message_manual_contacts"."display_name_key_version")) > 0)
);
--> statement-breakpoint
ALTER TABLE "telephony_inbound_messages" DROP CONSTRAINT "telephony_inbound_messages_match_reference";--> statement-breakpoint
ALTER TABLE "telephony_messages" DROP CONSTRAINT "telephony_messages_target_reference";--> statement-breakpoint
ALTER TABLE "telephony_inbound_messages" ALTER COLUMN "target_source" SET DATA TYPE "public"."telephony_message_target_source" USING "target_source"::text::"public"."telephony_message_target_source";--> statement-breakpoint
ALTER TABLE "telephony_messages" ALTER COLUMN "target_source" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "telephony_messages" ALTER COLUMN "target_source" SET DATA TYPE "public"."telephony_message_target_source" USING "target_source"::text::"public"."telephony_message_target_source";--> statement-breakpoint
ALTER TABLE "telephony_messages" ALTER COLUMN "target_source" SET DEFAULT 'consultation';--> statement-breakpoint
ALTER TABLE "telephony_inbound_messages" ADD COLUMN "manual_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD COLUMN "manual_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "telephony_message_manual_contacts" ADD CONSTRAINT "telephony_message_manual_contacts_created_by_user_id_staff_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_message_manual_contacts_phone_uidx" ON "telephony_message_manual_contacts" USING btree ("phone_fingerprint");--> statement-breakpoint
ALTER TABLE "telephony_inbound_messages" ADD CONSTRAINT "telephony_inbound_messages_manual_contact_id_telephony_message_manual_contacts_id_fk" FOREIGN KEY ("manual_contact_id") REFERENCES "public"."telephony_message_manual_contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_manual_contact_id_telephony_message_manual_contacts_id_fk" FOREIGN KEY ("manual_contact_id") REFERENCES "public"."telephony_message_manual_contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telephony_inbound_messages_manual_contact_received_idx" ON "telephony_inbound_messages" USING btree ("manual_contact_id","received_at");--> statement-breakpoint
CREATE INDEX "telephony_inbound_messages_received_idx" ON "telephony_inbound_messages" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "telephony_messages_requested_idx" ON "telephony_messages" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "telephony_messages_manual_contact_requested_idx" ON "telephony_messages" USING btree ("manual_contact_id","requested_at");--> statement-breakpoint
ALTER TABLE "telephony_inbound_messages" ADD CONSTRAINT "telephony_inbound_messages_match_reference" CHECK ((
        "telephony_inbound_messages"."match_strategy" = 'unmatched'
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NULL
        AND "telephony_inbound_messages"."target_source" IS NULL
        AND "telephony_inbound_messages"."consultation_id" IS NULL
        AND "telephony_inbound_messages"."directory_client_idx" IS NULL
        AND "telephony_inbound_messages"."directory_case_idx" IS NULL
        AND "telephony_inbound_messages"."manual_contact_id" IS NULL
      ) OR (
        "telephony_inbound_messages"."match_strategy" = 'latest_outbound'
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NOT NULL
        AND "telephony_inbound_messages"."target_source" = 'consultation'
        AND "telephony_inbound_messages"."consultation_id" IS NOT NULL
        AND "telephony_inbound_messages"."directory_client_idx" IS NULL
        AND "telephony_inbound_messages"."directory_case_idx" IS NULL
        AND "telephony_inbound_messages"."manual_contact_id" IS NULL
      ) OR (
        "telephony_inbound_messages"."match_strategy" = 'latest_outbound'
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NOT NULL
        AND "telephony_inbound_messages"."target_source" = 'legal_friends_directory'
        AND "telephony_inbound_messages"."consultation_id" IS NULL
        AND "telephony_inbound_messages"."directory_client_idx" > 0
        AND "telephony_inbound_messages"."directory_case_idx" > 0
        AND "telephony_inbound_messages"."manual_contact_id" IS NULL
      ) OR (
        "telephony_inbound_messages"."match_strategy" = 'latest_outbound'
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NOT NULL
        AND "telephony_inbound_messages"."target_source" = 'manual'
        AND "telephony_inbound_messages"."consultation_id" IS NULL
        AND "telephony_inbound_messages"."directory_client_idx" IS NULL
        AND "telephony_inbound_messages"."directory_case_idx" IS NULL
        AND "telephony_inbound_messages"."manual_contact_id" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_target_reference" CHECK ((
        "telephony_messages"."target_source" = 'consultation'
        AND "telephony_messages"."consultation_id" IS NOT NULL
        AND "telephony_messages"."consultation_request_id" IS NOT NULL
        AND "telephony_messages"."manual_contact_id" IS NULL
      ) OR (
        "telephony_messages"."target_source" = 'legal_friends_directory'
        AND "telephony_messages"."consultation_id" IS NULL
        AND "telephony_messages"."consultation_request_id" IS NULL
        AND "telephony_messages"."manual_contact_id" IS NULL
      ) OR (
        "telephony_messages"."target_source" = 'manual'
        AND "telephony_messages"."consultation_id" IS NULL
        AND "telephony_messages"."consultation_request_id" IS NULL
        AND "telephony_messages"."manual_contact_id" IS NOT NULL
      ));--> statement-breakpoint
REVOKE ALL ON TABLE "telephony_message_manual_contacts" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE telephony_message_manual_contacts TO lawand_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    EXECUTE 'GRANT SELECT ON TABLE telephony_message_manual_contacts TO lawand_viewer';
  END IF;
END
$$;
