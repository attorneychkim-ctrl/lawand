CREATE TABLE "desktop_notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"notification_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desktop_notification_deliveries_status_allowed" CHECK ("desktop_notification_deliveries"."status" IN ('pending', 'delivered')),
	CONSTRAINT "desktop_notification_deliveries_attempt_nonnegative" CHECK ("desktop_notification_deliveries"."attempt_count" >= 0),
	CONSTRAINT "desktop_notification_deliveries_terminal_state" CHECK (("desktop_notification_deliveries"."status" = 'pending' AND "desktop_notification_deliveries"."delivered_at" IS NULL) OR ("desktop_notification_deliveries"."status" = 'delivered' AND "desktop_notification_deliveries"."delivered_at" IS NOT NULL)),
	CONSTRAINT "desktop_notification_deliveries_opened_after_delivery" CHECK ("desktop_notification_deliveries"."opened_at" IS NULL OR "desktop_notification_deliveries"."delivered_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "desktop_notification_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"platform" varchar(20) NOT NULL,
	"app_version" varchar(40) NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_delivered_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desktop_notification_devices_token_hash_length" CHECK (octet_length("desktop_notification_devices"."token_hash") = 32),
	CONSTRAINT "desktop_notification_devices_platform_allowed" CHECK ("desktop_notification_devices"."platform" IN ('windows')),
	CONSTRAINT "desktop_notification_devices_status_allowed" CHECK ("desktop_notification_devices"."status" IN ('active', 'revoked')),
	CONSTRAINT "desktop_notification_devices_revocation_state" CHECK (("desktop_notification_devices"."status" = 'active' AND "desktop_notification_devices"."revoked_at" IS NULL) OR ("desktop_notification_devices"."status" = 'revoked' AND "desktop_notification_devices"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "desktop_notification_pairings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desktop_notification_pairings_token_hash_length" CHECK (octet_length("desktop_notification_pairings"."token_hash") = 32),
	CONSTRAINT "desktop_notification_pairings_expiry_after_creation" CHECK ("desktop_notification_pairings"."expires_at" > "desktop_notification_pairings"."created_at"),
	CONSTRAINT "desktop_notification_pairings_used_after_creation" CHECK ("desktop_notification_pairings"."used_at" IS NULL OR "desktop_notification_pairings"."used_at" >= "desktop_notification_pairings"."created_at")
);
--> statement-breakpoint
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
CREATE TABLE "desktop_notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"source_event_id" uuid,
	"event_type" varchar(60) NOT NULL,
	"payload_ciphertext" "bytea" NOT NULL,
	"payload_nonce" "bytea" NOT NULL,
	"payload_key_version" varchar(50) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desktop_notifications_event_type_format" CHECK ("desktop_notifications"."event_type" ~ '^[a-z][a-z0-9_.-]{2,59}$'),
	CONSTRAINT "desktop_notifications_payload_crypto" CHECK (octet_length("desktop_notifications"."payload_nonce") = 12 AND octet_length("desktop_notifications"."payload_ciphertext") >= 17),
	CONSTRAINT "desktop_notifications_expiry_after_creation" CHECK ("desktop_notifications"."expires_at" > "desktop_notifications"."created_at")
);
--> statement-breakpoint
ALTER TABLE "desktop_notification_deliveries" ADD CONSTRAINT "desktop_notification_deliveries_notification_id_desktop_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."desktop_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_notification_deliveries" ADD CONSTRAINT "desktop_notification_deliveries_device_id_desktop_notification_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."desktop_notification_devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_notification_devices" ADD CONSTRAINT "desktop_notification_devices_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_notification_pairings" ADD CONSTRAINT "desktop_notification_pairings_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_notification_preferences" ADD CONSTRAINT "desktop_notification_preferences_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_notifications" ADD CONSTRAINT "desktop_notifications_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_notification_deliveries_notification_device_uidx" ON "desktop_notification_deliveries" USING btree ("notification_id","device_id");--> statement-breakpoint
CREATE INDEX "desktop_notification_deliveries_device_status_created_idx" ON "desktop_notification_deliveries" USING btree ("device_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_notification_devices_token_hash_uidx" ON "desktop_notification_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "desktop_notification_devices_staff_status_idx" ON "desktop_notification_devices" USING btree ("staff_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_notification_pairings_token_hash_uidx" ON "desktop_notification_pairings" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "desktop_notification_pairings_staff_expires_idx" ON "desktop_notification_pairings" USING btree ("staff_user_id","expires_at");--> statement-breakpoint
CREATE INDEX "desktop_notifications_staff_created_idx" ON "desktop_notifications" USING btree ("staff_user_id","created_at");--> statement-breakpoint
CREATE INDEX "desktop_notifications_expires_idx" ON "desktop_notifications" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_notifications_staff_source_event_uidx" ON "desktop_notifications" USING btree ("staff_user_id","source_event_id") WHERE "desktop_notifications"."source_event_id" IS NOT NULL;
--> statement-breakpoint
REVOKE ALL ON TABLE
  "desktop_notification_pairings",
  "desktop_notification_devices",
  "desktop_notifications",
  "desktop_notification_deliveries"
FROM PUBLIC;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    REVOKE ALL ON TABLE
      "desktop_notification_pairings",
      "desktop_notification_devices",
      "desktop_notifications",
      "desktop_notification_deliveries"
    FROM lawand_app;
    GRANT SELECT, INSERT, UPDATE ON TABLE
      "desktop_notification_pairings",
      "desktop_notification_devices",
      "desktop_notifications",
      "desktop_notification_deliveries"
    TO lawand_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    REVOKE ALL ON TABLE
      "desktop_notification_pairings",
      "desktop_notification_devices",
      "desktop_notifications",
      "desktop_notification_deliveries"
    FROM lawand_viewer;
  END IF;
END $$;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notify_review_link_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_id uuid;
  target_type text;
BEGIN
  target_id := COALESCE(NEW.review_id, NEW.submission_id);
  target_type := CASE WHEN NEW.review_id IS NOT NULL THEN 'review' ELSE 'submission' END;
  PERFORM pg_notify(
    'lawand_review_events',
    json_build_object(
      'eventId', NEW.id,
      'eventType', CASE
        WHEN TG_OP = 'INSERT' THEN 'review.linked'
        WHEN NEW.directory_client_idx IS DISTINCT FROM OLD.directory_client_idx
          OR NEW.directory_case_idx IS DISTINCT FROM OLD.directory_case_idx
          OR NEW.source IS DISTINCT FROM OLD.source
          OR NEW.linked_by_user_id IS DISTINCT FROM OLD.linked_by_user_id
          THEN 'review.linked'
        ELSE 'review.changed'
      END,
      'recordId', target_id,
      'recordType', target_type,
      'occurredAt', statement_timestamp()
    )::text
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.cleanup_expired_desktop_notification_records()
RETURNS TABLE(expired_pairing_count bigint, expired_notification_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cleanup_at timestamptz := statement_timestamp();
BEGIN
  DELETE FROM public.desktop_notification_pairings
  WHERE expires_at <= cleanup_at;
  GET DIAGNOSTICS expired_pairing_count = ROW_COUNT;

  DELETE FROM public.desktop_notifications
  WHERE expires_at <= cleanup_at;
  GET DIAGNOSTICS expired_notification_count = ROW_COUNT;

  RETURN NEXT;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.cleanup_expired_desktop_notification_records() FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    GRANT EXECUTE ON FUNCTION public.cleanup_expired_desktop_notification_records() TO lawand_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    REVOKE ALL ON FUNCTION public.cleanup_expired_desktop_notification_records() FROM lawand_viewer;
  END IF;
END $$;
