ALTER TABLE "message_templates" DROP CONSTRAINT "message_templates_owner_audit_consistent";--> statement-breakpoint
ALTER TABLE "telephony_messages" DROP CONSTRAINT "telephony_messages_template_snapshot_pair";--> statement-breakpoint
ALTER TABLE "telephony_messages" DROP CONSTRAINT "telephony_messages_template_id_message_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DELETE FROM "message_templates" WHERE "owner_user_id" IS NULL;--> statement-breakpoint
DROP INDEX "message_templates_active_name_idx";--> statement-breakpoint
ALTER TABLE "message_templates" ALTER COLUMN "owner_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message_templates" ALTER COLUMN "created_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message_templates" ALTER COLUMN "updated_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message_templates" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_owner_audit_consistent" CHECK ("message_templates"."created_by_user_id" = "message_templates"."owner_user_id"
        AND "message_templates"."updated_by_user_id" = "message_templates"."owner_user_id");--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_template_snapshot_pair" CHECK ("telephony_messages"."template_id" IS NULL OR "telephony_messages"."template_name_snapshot" IS NOT NULL);
