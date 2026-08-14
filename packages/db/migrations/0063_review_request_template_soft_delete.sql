DROP INDEX "customer_review_request_templates_owner_name_lower_uidx";--> statement-breakpoint
ALTER TABLE "customer_review_request_templates" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_request_templates_owner_name_lower_uidx" ON "customer_review_request_templates" USING btree ("owner_user_id",lower("name")) WHERE "customer_review_request_templates"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "customer_review_request_templates" ADD CONSTRAINT "customer_review_request_templates_preset_active" CHECK ("customer_review_request_templates"."preset_key" IS NULL OR "customer_review_request_templates"."deleted_at" IS NULL);
