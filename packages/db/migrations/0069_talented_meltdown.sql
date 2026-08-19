ALTER TABLE "telephony_inbound_messages" DROP CONSTRAINT "telephony_inbound_messages_match_reference";--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD COLUMN "sender_number_snapshot" varchar(20);--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD COLUMN "reply_mailbox_endpoint_id" uuid;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_reply_mailbox_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("reply_mailbox_endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telephony_messages_reply_mailbox_remote_requested_idx" ON "telephony_messages" USING btree ("reply_mailbox_endpoint_id","remote_phone_fingerprint","requested_at");--> statement-breakpoint
ALTER TABLE "telephony_inbound_messages" ADD CONSTRAINT "telephony_inbound_messages_match_reference" CHECK ((
        "telephony_inbound_messages"."match_strategy" = 'unmatched'
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NULL
        AND "telephony_inbound_messages"."target_source" IS NULL
        AND "telephony_inbound_messages"."consultation_id" IS NULL
        AND "telephony_inbound_messages"."directory_client_idx" IS NULL
        AND "telephony_inbound_messages"."directory_case_idx" IS NULL
        AND "telephony_inbound_messages"."manual_contact_id" IS NULL
      ) OR (
        "telephony_inbound_messages"."match_strategy" IN ('latest_outbound', 'reply_mailbox_latest_outbound')
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NOT NULL
        AND "telephony_inbound_messages"."target_source" = 'consultation'
        AND "telephony_inbound_messages"."consultation_id" IS NOT NULL
        AND "telephony_inbound_messages"."directory_client_idx" IS NULL
        AND "telephony_inbound_messages"."directory_case_idx" IS NULL
        AND "telephony_inbound_messages"."manual_contact_id" IS NULL
      ) OR (
        "telephony_inbound_messages"."match_strategy" IN ('latest_outbound', 'reply_mailbox_latest_outbound')
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NOT NULL
        AND "telephony_inbound_messages"."target_source" = 'legal_friends_directory'
        AND "telephony_inbound_messages"."consultation_id" IS NULL
        AND "telephony_inbound_messages"."directory_client_idx" > 0
        AND "telephony_inbound_messages"."directory_case_idx" > 0
        AND "telephony_inbound_messages"."manual_contact_id" IS NULL
      ) OR (
        "telephony_inbound_messages"."match_strategy" IN ('latest_outbound', 'reply_mailbox_latest_outbound')
        AND "telephony_inbound_messages"."matched_outbound_message_id" IS NOT NULL
        AND "telephony_inbound_messages"."target_source" = 'manual'
        AND "telephony_inbound_messages"."consultation_id" IS NULL
        AND "telephony_inbound_messages"."directory_client_idx" IS NULL
        AND "telephony_inbound_messages"."directory_case_idx" IS NULL
        AND "telephony_inbound_messages"."manual_contact_id" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_sender_number_snapshot_format" CHECK ("telephony_messages"."sender_number_snapshot" IS NULL OR "telephony_messages"."sender_number_snapshot" ~ '^0[0-9]{8,10}$');
