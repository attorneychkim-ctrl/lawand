CREATE TYPE "public"."review_gift_coupon_status" AS ENUM('prepared', 'sent', 'failed', 'cancelled', 'unknown');--> statement-breakpoint
CREATE TABLE "review_gift_coupon_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"record_type" varchar(20) NOT NULL,
	"record_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"directory_client_idx" integer NOT NULL,
	"directory_case_idx" integer NOT NULL,
	"phone_ciphertext" "bytea" NOT NULL,
	"phone_nonce" "bytea" NOT NULL,
	"phone_key_version" varchar(50) NOT NULL,
	"phone_fingerprint" "bytea" NOT NULL,
	"product_key" varchar(50) NOT NULL,
	"goods_code" varchar(20) NOT NULL,
	"brand_name_snapshot" varchar(100) NOT NULL,
	"goods_name_snapshot" varchar(200) NOT NULL,
	"sale_price_snapshot" integer NOT NULL,
	"reason" varchar(40) NOT NULL,
	"tr_id" varchar(25) NOT NULL,
	"provider_order_no" varchar(30),
	"status" "review_gift_coupon_status" DEFAULT 'prepared' NOT NULL,
	"last_error_code" varchar(100),
	"requested_at" timestamp with time zone NOT NULL,
	"provider_responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_gift_coupon_record_type" CHECK ("review_gift_coupon_deliveries"."record_type" IN ('review', 'submission')),
	CONSTRAINT "review_gift_coupon_reason" CHECK ("review_gift_coupon_deliveries"."reason" IN ('review_thanks', 'service_recovery', 'event')),
	CONSTRAINT "review_gift_coupon_directory_positive" CHECK ("review_gift_coupon_deliveries"."directory_client_idx" > 0 AND "review_gift_coupon_deliveries"."directory_case_idx" > 0),
	CONSTRAINT "review_gift_coupon_crypto" CHECK (octet_length("review_gift_coupon_deliveries"."phone_nonce") = 12 AND octet_length("review_gift_coupon_deliveries"."phone_ciphertext") >= 17 AND octet_length("review_gift_coupon_deliveries"."phone_fingerprint") = 32),
	CONSTRAINT "review_gift_coupon_price_positive" CHECK ("review_gift_coupon_deliveries"."sale_price_snapshot" > 0)
);
--> statement-breakpoint
ALTER TABLE "review_gift_coupon_deliveries" ADD CONSTRAINT "review_gift_coupon_deliveries_requested_by_user_id_staff_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_gift_coupon_idempotency_uidx" ON "review_gift_coupon_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "review_gift_coupon_tr_id_uidx" ON "review_gift_coupon_deliveries" USING btree ("tr_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_gift_coupon_one_active_per_review_uidx" ON "review_gift_coupon_deliveries" USING btree ("record_type","record_id") WHERE "review_gift_coupon_deliveries"."status" IN ('prepared', 'sent', 'unknown');--> statement-breakpoint
CREATE INDEX "review_gift_coupon_requested_idx" ON "review_gift_coupon_deliveries" USING btree ("requested_at");
--> statement-breakpoint
REVOKE ALL ON TABLE "review_gift_coupon_deliveries" FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "review_gift_coupon_deliveries" TO lawand_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    GRANT SELECT ON TABLE "review_gift_coupon_deliveries" TO lawand_viewer;
  END IF;
END $$;
