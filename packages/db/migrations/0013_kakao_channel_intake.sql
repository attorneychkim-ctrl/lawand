CREATE TYPE "public"."consultation_contact_channel" AS ENUM('phone', 'kakao_channel');--> statement-breakpoint
CREATE TYPE "public"."privacy_basis" AS ENUM('explicit_consent', 'customer_initiated_channel_message');--> statement-breakpoint
CREATE TABLE "kakao_consultation_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consultation_id" uuid NOT NULL,
	"first_request_id" uuid NOT NULL,
	"bot_id" varchar(200) NOT NULL,
	"user_fingerprint" "bytea" NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kakao_consultation_contacts_fingerprint_length" CHECK (octet_length("kakao_consultation_contacts"."user_fingerprint") = 32),
	CONSTRAINT "kakao_consultation_contacts_seen_order" CHECK ("kakao_consultation_contacts"."last_seen_at" >= "kakao_consultation_contacts"."first_seen_at")
);
--> statement-breakpoint
ALTER TABLE "consultation_requests" DROP CONSTRAINT "consultation_requests_fingerprint_lengths";--> statement-breakpoint
ALTER TABLE "consultation_requests" DROP CONSTRAINT "consultation_requests_nonce_lengths";--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "phone_fingerprint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "phone_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "phone_nonce" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "phone_key_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "consent_agreed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consultations" ALTER COLUMN "phone_fingerprint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD COLUMN "contact_channel" "consultation_contact_channel" DEFAULT 'phone' NOT NULL;--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD COLUMN "privacy_basis" "privacy_basis" DEFAULT 'explicit_consent' NOT NULL;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "contact_channel" "consultation_contact_channel" DEFAULT 'phone' NOT NULL;--> statement-breakpoint
ALTER TABLE "kakao_consultation_contacts" ADD CONSTRAINT "kakao_consultation_contacts_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kakao_consultation_contacts" ADD CONSTRAINT "kakao_consultation_contacts_first_request_id_consultation_requests_id_fk" FOREIGN KEY ("first_request_id") REFERENCES "public"."consultation_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_consultation_contacts_consultation_uidx" ON "kakao_consultation_contacts" USING btree ("consultation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_consultation_contacts_bot_user_uidx" ON "kakao_consultation_contacts" USING btree ("bot_id","user_fingerprint");--> statement-breakpoint
CREATE INDEX "kakao_consultation_contacts_last_seen_idx" ON "kakao_consultation_contacts" USING btree ("last_seen_at");--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_phone_crypto_complete" CHECK ((
        "consultation_requests"."contact_channel" = 'phone'
        AND "consultation_requests"."phone_fingerprint" IS NOT NULL
        AND "consultation_requests"."phone_ciphertext" IS NOT NULL
        AND "consultation_requests"."phone_nonce" IS NOT NULL
        AND "consultation_requests"."phone_key_version" IS NOT NULL
      ) OR (
        "consultation_requests"."contact_channel" = 'kakao_channel'
        AND "consultation_requests"."phone_fingerprint" IS NULL
        AND "consultation_requests"."phone_ciphertext" IS NULL
        AND "consultation_requests"."phone_nonce" IS NULL
        AND "consultation_requests"."phone_key_version" IS NULL
      ));--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_privacy_basis_consistent" CHECK (("consultation_requests"."privacy_basis" = 'explicit_consent' AND "consultation_requests"."consent_agreed_at" IS NOT NULL)
        OR ("consultation_requests"."privacy_basis" = 'customer_initiated_channel_message' AND "consultation_requests"."consent_agreed_at" IS NULL));--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_fingerprint_lengths" CHECK (("consultation_requests"."phone_fingerprint" IS NULL OR octet_length("consultation_requests"."phone_fingerprint") = 32)
        AND octet_length("consultation_requests"."payload_fingerprint") = 32);--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_nonce_lengths" CHECK (("consultation_requests"."phone_nonce" IS NULL OR octet_length("consultation_requests"."phone_nonce") = 12)
        AND octet_length("consultation_requests"."intake_nonce") = 12
        AND ("consultation_requests"."name_nonce" IS NULL OR octet_length("consultation_requests"."name_nonce") = 12));--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_contact_channel_identity" CHECK (("consultations"."contact_channel" = 'phone' AND "consultations"."phone_fingerprint" IS NOT NULL)
        OR ("consultations"."contact_channel" = 'kakao_channel' AND "consultations"."phone_fingerprint" IS NULL));