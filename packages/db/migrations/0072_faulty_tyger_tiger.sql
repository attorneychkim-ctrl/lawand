CREATE TABLE "desktop_notification_preferences" (
	"staff_user_id" uuid NOT NULL,
	"event_key" varchar(50) NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desktop_notification_preferences_pk" PRIMARY KEY("staff_user_id","event_key"),
	CONSTRAINT "desktop_notification_preferences_event_key_allowed" CHECK ("desktop_notification_preferences"."event_key" IN (
        'consultation.unassigned',
        'consultation.assigned_repeat',
        'consultation.assignment',
        'phone.targeted_inbound',
        'phone.internal_transfer',
        'phone.all_external',
        'message.assigned_reply',
        'message.unmatched',
        'review.assigned_new'
      ))
);
--> statement-breakpoint
ALTER TABLE "desktop_notifications" ADD COLUMN "source_event_id" uuid;--> statement-breakpoint
ALTER TABLE "desktop_notification_preferences" ADD CONSTRAINT "desktop_notification_preferences_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_notifications_staff_source_event_uidx" ON "desktop_notifications" USING btree ("staff_user_id","source_event_id") WHERE "desktop_notifications"."source_event_id" IS NOT NULL;--> statement-breakpoint
REVOKE ALL ON TABLE "desktop_notification_preferences" FROM PUBLIC;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    REVOKE ALL ON TABLE "desktop_notification_preferences" FROM lawand_app;
    GRANT SELECT, INSERT, UPDATE ON TABLE
      "desktop_notification_preferences"
    TO lawand_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    REVOKE ALL ON TABLE "desktop_notification_preferences" FROM lawand_viewer;
  END IF;
END $$;
