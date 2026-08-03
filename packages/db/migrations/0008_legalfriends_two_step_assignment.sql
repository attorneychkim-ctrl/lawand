CREATE TABLE "legalfriends_case_links" (
	"consultation_id" uuid PRIMARY KEY NOT NULL,
	"outbox_event_id" uuid NOT NULL,
	"case_idx" varchar(100) NOT NULL,
	"manager_external_account_id" varchar(200) NOT NULL,
	"case_created_at" timestamp with time zone NOT NULL,
	"manager_assigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "staff_external_accounts_provider_staff_uidx";--> statement-breakpoint
DROP INDEX "staff_external_accounts_provider_external_uidx";--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD COLUMN "legalfriends_account_id" varchar(100);--> statement-breakpoint
ALTER TABLE "legalfriends_case_links" ADD CONSTRAINT "legalfriends_case_links_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legalfriends_case_links" ADD CONSTRAINT "legalfriends_case_links_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legalfriends_case_links_outbox_uidx" ON "legalfriends_case_links" USING btree ("outbox_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legalfriends_case_links_case_idx_uidx" ON "legalfriends_case_links" USING btree ("case_idx");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_external_accounts_active_provider_staff_uidx" ON "staff_external_accounts" USING btree ("provider","staff_user_id") WHERE "staff_external_accounts"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_external_accounts_active_provider_external_uidx" ON "staff_external_accounts" USING btree ("provider","external_account_id") WHERE "staff_external_accounts"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_pending_legalfriends_uidx" ON "staff_invitations" USING btree ("legalfriends_account_id") WHERE "staff_invitations"."legalfriends_account_id" IS NOT NULL
          AND "staff_invitations"."accepted_at" IS NULL
          AND "staff_invitations"."revoked_at" IS NULL;
