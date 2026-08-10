ALTER TABLE "staff_invitations" ADD COLUMN "centrex_extension" varchar(20);--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "centrex_extension" varchar(20);--> statement-breakpoint
UPDATE "staff_profiles" AS "profile"
SET "centrex_extension" = COALESCE(
  (
    SELECT "endpoint"."extension"
    FROM "telephony_endpoints" AS "endpoint"
    WHERE "endpoint"."provider" = 'centrex'
      AND "endpoint"."line_number" = "profile"."centrex_line_number"
      AND "endpoint"."is_active" = true
    ORDER BY "endpoint"."last_auth_succeeded_at" DESC NULLS LAST
    LIMIT 1
  ),
  right("profile"."centrex_line_number", 4)
)
WHERE "profile"."centrex_line_number" IS NOT NULL;--> statement-breakpoint
UPDATE "staff_invitations"
SET "centrex_extension" = right("centrex_line_number", 4)
WHERE "centrex_line_number" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_centrex_extension_format" CHECK ("staff_invitations"."centrex_extension" IS NULL OR "staff_invitations"."centrex_extension" ~ '^[0-9]{2,10}$');--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_centrex_pair" CHECK (("staff_invitations"."centrex_line_number" IS NULL) = ("staff_invitations"."centrex_extension" IS NULL));--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_centrex_extension_format" CHECK ("staff_profiles"."centrex_extension" IS NULL OR "staff_profiles"."centrex_extension" ~ '^[0-9]{2,10}$');--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_centrex_pair" CHECK (("staff_profiles"."centrex_line_number" IS NULL) = ("staff_profiles"."centrex_extension" IS NULL));
