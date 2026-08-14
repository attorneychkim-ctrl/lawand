CREATE TABLE "telephony_phonebook_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name_ciphertext" "bytea" NOT NULL,
	"display_name_nonce" "bytea" NOT NULL,
	"display_name_key_version" varchar(50) NOT NULL,
	"original_phone_fingerprint" "bytea" NOT NULL,
	"original_phone_ciphertext" "bytea" NOT NULL,
	"original_phone_nonce" "bytea" NOT NULL,
	"original_phone_key_version" varchar(50) NOT NULL,
	"connected_phone_fingerprint" "bytea",
	"connected_phone_ciphertext" "bytea",
	"connected_phone_nonce" "bytea",
	"connected_phone_key_version" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"deactivated_by_user_id" uuid,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_phonebook_contacts_display_name_crypto" CHECK (octet_length("telephony_phonebook_contacts"."display_name_ciphertext") >= 17
        AND octet_length("telephony_phonebook_contacts"."display_name_nonce") = 12
        AND length(btrim("telephony_phonebook_contacts"."display_name_key_version")) > 0),
	CONSTRAINT "telephony_phonebook_contacts_original_phone_crypto" CHECK (octet_length("telephony_phonebook_contacts"."original_phone_fingerprint") = 32
        AND octet_length("telephony_phonebook_contacts"."original_phone_ciphertext") >= 17
        AND octet_length("telephony_phonebook_contacts"."original_phone_nonce") = 12
        AND length(btrim("telephony_phonebook_contacts"."original_phone_key_version")) > 0),
	CONSTRAINT "telephony_phonebook_contacts_connected_phone_crypto" CHECK ((
        "telephony_phonebook_contacts"."connected_phone_fingerprint" IS NULL
        AND "telephony_phonebook_contacts"."connected_phone_ciphertext" IS NULL
        AND "telephony_phonebook_contacts"."connected_phone_nonce" IS NULL
        AND "telephony_phonebook_contacts"."connected_phone_key_version" IS NULL
      ) OR (
        octet_length("telephony_phonebook_contacts"."connected_phone_fingerprint") = 32
        AND octet_length("telephony_phonebook_contacts"."connected_phone_ciphertext") >= 17
        AND octet_length("telephony_phonebook_contacts"."connected_phone_nonce") = 12
        AND length(btrim("telephony_phonebook_contacts"."connected_phone_key_version")) > 0
        AND "telephony_phonebook_contacts"."connected_phone_fingerprint" <> "telephony_phonebook_contacts"."original_phone_fingerprint"
      )),
	CONSTRAINT "telephony_phonebook_contacts_active_state" CHECK ((
        "telephony_phonebook_contacts"."is_active" = true
        AND "telephony_phonebook_contacts"."deactivated_at" IS NULL
        AND "telephony_phonebook_contacts"."deactivated_by_user_id" IS NULL
      ) OR (
        "telephony_phonebook_contacts"."is_active" = false
        AND "telephony_phonebook_contacts"."deactivated_at" IS NOT NULL
        AND "telephony_phonebook_contacts"."deactivated_by_user_id" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "telephony_phonebook_contacts" ADD CONSTRAINT "telephony_phonebook_contacts_created_by_user_id_staff_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_phonebook_contacts" ADD CONSTRAINT "telephony_phonebook_contacts_updated_by_user_id_staff_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_phonebook_contacts" ADD CONSTRAINT "telephony_phonebook_contacts_deactivated_by_user_id_staff_users_id_fk" FOREIGN KEY ("deactivated_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_phonebook_contacts_active_original_phone_uidx" ON "telephony_phonebook_contacts" USING btree ("original_phone_fingerprint") WHERE "telephony_phonebook_contacts"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_phonebook_contacts_active_connected_phone_uidx" ON "telephony_phonebook_contacts" USING btree ("connected_phone_fingerprint") WHERE "telephony_phonebook_contacts"."is_active" = true AND "telephony_phonebook_contacts"."connected_phone_fingerprint" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "telephony_phonebook_contacts_active_updated_idx" ON "telephony_phonebook_contacts" USING btree ("is_active","updated_at");
--> statement-breakpoint
CREATE FUNCTION public.enforce_telephony_phonebook_number_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.is_active AND EXISTS (
    SELECT 1
    FROM public.telephony_phonebook_contacts AS existing
    WHERE existing.is_active
      AND existing.id <> NEW.id
      AND (
        existing.original_phone_fingerprint = NEW.original_phone_fingerprint
        OR existing.connected_phone_fingerprint = NEW.original_phone_fingerprint
        OR (
          NEW.connected_phone_fingerprint IS NOT NULL
          AND (
            existing.original_phone_fingerprint = NEW.connected_phone_fingerprint
            OR existing.connected_phone_fingerprint = NEW.connected_phone_fingerprint
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'active phonebook phone already exists'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enforce_telephony_phonebook_number_uniqueness() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER telephony_phonebook_contacts_number_uniqueness
BEFORE INSERT OR UPDATE OF original_phone_fingerprint, connected_phone_fingerprint, is_active
ON public.telephony_phonebook_contacts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_telephony_phonebook_number_uniqueness();
--> statement-breakpoint
REVOKE ALL ON TABLE telephony_phonebook_contacts FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE telephony_phonebook_contacts TO lawand_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    EXECUTE 'GRANT SELECT ON TABLE telephony_phonebook_contacts TO lawand_viewer';
  END IF;
END
$$;
