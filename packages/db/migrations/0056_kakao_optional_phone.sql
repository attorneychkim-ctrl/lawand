ALTER TABLE "consultation_requests" DROP CONSTRAINT "consultation_requests_phone_crypto_complete";--> statement-breakpoint
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_contact_channel_identity";--> statement-breakpoint
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
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_contact_channel_identity" CHECK (("consultations"."contact_channel" = 'phone' AND "consultations"."phone_fingerprint" IS NOT NULL)
        OR "consultations"."contact_channel" = 'kakao_channel'
        OR ("consultations"."contact_channel" = 'naver_booking' AND "consultations"."phone_fingerprint" IS NULL));