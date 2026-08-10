CREATE TABLE "telephony_endpoint_credentials" (
	"endpoint_id" uuid PRIMARY KEY NOT NULL,
	"password_sha512_ciphertext" "bytea" NOT NULL,
	"password_sha512_nonce" "bytea" NOT NULL,
	"password_sha512_key_version" varchar(50) NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"verified_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_endpoint_credentials_ciphertext_length" CHECK (octet_length("telephony_endpoint_credentials"."password_sha512_ciphertext") >= 17),
	CONSTRAINT "telephony_endpoint_credentials_nonce_length" CHECK (octet_length("telephony_endpoint_credentials"."password_sha512_nonce") = 12),
	CONSTRAINT "telephony_endpoint_credentials_key_version_nonempty" CHECK (length(btrim("telephony_endpoint_credentials"."password_sha512_key_version")) > 0)
);
--> statement-breakpoint
ALTER TABLE "telephony_endpoint_credentials" ADD CONSTRAINT "telephony_endpoint_credentials_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_endpoint_credentials" ADD CONSTRAINT "telephony_endpoint_credentials_verified_by_user_id_staff_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
REVOKE ALL ON TABLE "telephony_endpoint_credentials" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    EXECUTE 'REVOKE ALL ON TABLE telephony_endpoint_credentials FROM lawand_viewer';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telephony_endpoint_credentials TO lawand_app';
  END IF;
END
$$;
