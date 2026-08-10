ALTER TABLE "staff_invitations" ADD COLUMN "centrex_line_number" varchar(20);--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "centrex_line_number" varchar(20);--> statement-breakpoint
UPDATE "staff_profiles" AS "profile"
SET
  "centrex_line_number" = "endpoint"."line_number",
  "updated_at" = now()
FROM "staff_telephony_bindings" AS "binding"
INNER JOIN "telephony_endpoints" AS "endpoint"
  ON "endpoint"."id" = "binding"."endpoint_id"
WHERE "profile"."user_id" = "binding"."staff_user_id"
  AND "profile"."centrex_line_number" IS NULL
  AND "binding"."is_active" = true
  AND "binding"."is_primary" = true
  AND "endpoint"."is_active" = true;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_centrex_line_number_format" CHECK ("staff_invitations"."centrex_line_number" IS NULL OR "staff_invitations"."centrex_line_number" ~ '^070[0-9]{8}$');--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_centrex_line_number_format" CHECK ("staff_profiles"."centrex_line_number" IS NULL OR "staff_profiles"."centrex_line_number" ~ '^070[0-9]{8}$');
