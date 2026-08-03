ALTER TABLE "staff_external_accounts" ADD COLUMN "external_member_idx" integer;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD COLUMN "legalfriends_member_idx" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_external_accounts_active_provider_member_idx_uidx" ON "staff_external_accounts" USING btree ("provider","external_member_idx") WHERE "staff_external_accounts"."is_active" = true AND "staff_external_accounts"."external_member_idx" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_pending_legalfriends_member_idx_uidx" ON "staff_invitations" USING btree ("legalfriends_member_idx") WHERE "staff_invitations"."legalfriends_member_idx" IS NOT NULL
          AND "staff_invitations"."accepted_at" IS NULL
          AND "staff_invitations"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "staff_external_accounts" ADD CONSTRAINT "staff_external_accounts_member_idx_positive" CHECK ("staff_external_accounts"."external_member_idx" IS NULL OR "staff_external_accounts"."external_member_idx" > 0);--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_legalfriends_member_idx_positive" CHECK ("staff_invitations"."legalfriends_member_idx" IS NULL OR "staff_invitations"."legalfriends_member_idx" > 0);
