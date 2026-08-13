ALTER TABLE "consultation_requests" DROP CONSTRAINT "consultation_requests_phone_crypto_complete";--> statement-breakpoint
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_contact_channel_identity";--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "soft_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "soft_deleted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_soft_deleted_by_user_id_staff_users_id_fk" FOREIGN KEY ("soft_deleted_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultations_soft_deleted_at_idx" ON "consultations" USING btree ("soft_deleted_at");--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_phone_crypto_complete" CHECK ((
        (
          "consultation_requests"."phone_fingerprint" IS NOT NULL
          AND "consultation_requests"."phone_ciphertext" IS NOT NULL
          AND "consultation_requests"."phone_nonce" IS NOT NULL
          AND "consultation_requests"."phone_key_version" IS NOT NULL
        ) OR (
          "consultation_requests"."phone_fingerprint" IS NULL
          AND "consultation_requests"."phone_ciphertext" IS NULL
          AND "consultation_requests"."phone_nonce" IS NULL
          AND "consultation_requests"."phone_key_version" IS NULL
        )
      )
        AND ("consultation_requests"."contact_channel" <> 'phone' OR "consultation_requests"."phone_fingerprint" IS NOT NULL)
        AND ("consultation_requests"."contact_channel" <> 'naver_booking' OR "consultation_requests"."phone_fingerprint" IS NULL));--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_soft_delete_consistent" CHECK (("consultations"."soft_deleted_at" IS NULL AND "consultations"."soft_deleted_by_user_id" IS NULL)
        OR ("consultations"."soft_deleted_at" IS NOT NULL AND "consultations"."soft_deleted_by_user_id" IS NOT NULL AND "consultations"."state" = 'closed'));--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_contact_channel_identity" CHECK (("consultations"."contact_channel" = 'phone' AND "consultations"."phone_fingerprint" IS NOT NULL)
        OR "consultations"."contact_channel" = 'kakao_channel'
        OR ("consultations"."contact_channel" = 'naver_booking' AND "consultations"."phone_fingerprint" IS NULL));
