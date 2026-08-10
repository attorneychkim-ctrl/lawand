CREATE TABLE "telephony_message_directory_targets" (
	"telephony_message_id" uuid PRIMARY KEY NOT NULL,
	"client_idx" integer NOT NULL,
	"case_idx" integer NOT NULL,
	"client_name_ciphertext" "bytea" NOT NULL,
	"client_name_nonce" "bytea" NOT NULL,
	"client_name_key_version" varchar(50) NOT NULL,
	"phone_ciphertext" "bytea" NOT NULL,
	"phone_nonce" "bytea" NOT NULL,
	"phone_key_version" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_message_directory_targets_ids_positive" CHECK ("telephony_message_directory_targets"."client_idx" > 0 AND "telephony_message_directory_targets"."case_idx" > 0),
	CONSTRAINT "telephony_message_directory_targets_crypto" CHECK (octet_length("telephony_message_directory_targets"."client_name_nonce") = 12
        AND octet_length("telephony_message_directory_targets"."client_name_ciphertext") >= 17
        AND octet_length("telephony_message_directory_targets"."phone_nonce") = 12
        AND octet_length("telephony_message_directory_targets"."phone_ciphertext") >= 17)
);
--> statement-breakpoint
ALTER TABLE "telephony_messages" ALTER COLUMN "consultation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "telephony_messages" ALTER COLUMN "consultation_request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD COLUMN "target_source" "telephony_call_target_source" DEFAULT 'consultation' NOT NULL;--> statement-breakpoint
ALTER TABLE "telephony_message_directory_targets" ADD CONSTRAINT "telephony_message_directory_targets_telephony_message_id_telephony_messages_id_fk" FOREIGN KEY ("telephony_message_id") REFERENCES "public"."telephony_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telephony_message_directory_targets_client_case_idx" ON "telephony_message_directory_targets" USING btree ("client_idx","case_idx");--> statement-breakpoint
REVOKE ALL ON TABLE "telephony_message_directory_targets" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telephony_message_directory_targets TO lawand_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    EXECUTE 'GRANT SELECT ON TABLE telephony_message_directory_targets TO lawand_viewer';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_target_reference" CHECK ((
        "telephony_messages"."target_source" = 'consultation'
        AND "telephony_messages"."consultation_id" IS NOT NULL
        AND "telephony_messages"."consultation_request_id" IS NOT NULL
      ) OR (
        "telephony_messages"."target_source" = 'legal_friends_directory'
        AND "telephony_messages"."consultation_id" IS NULL
        AND "telephony_messages"."consultation_request_id" IS NULL
      ));
