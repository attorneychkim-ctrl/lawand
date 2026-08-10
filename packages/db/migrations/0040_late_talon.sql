CREATE TYPE "public"."telephony_message_kind" AS ENUM('sms', 'lms', 'mms');--> statement-breakpoint
CREATE TYPE "public"."telephony_message_provider" AS ENUM('centrex', 'solapi');--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid,
	"name" varchar(80) NOT NULL,
	"body" text NOT NULL,
	"body_byte_length" integer NOT NULL,
	"image_file_id" varchar(100),
	"image_url" text,
	"image_original_name" varchar(100),
	"image_byte_length" integer,
	"image_width" integer,
	"image_height" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_name_nonempty" CHECK (length(btrim("message_templates"."name")) > 0),
	CONSTRAINT "message_templates_body_nonempty" CHECK (length(btrim("message_templates"."body")) > 0),
	CONSTRAINT "message_templates_body_byte_length" CHECK ("message_templates"."body_byte_length" >= 1 AND "message_templates"."body_byte_length" <= 720),
	CONSTRAINT "message_templates_owner_audit_consistent" CHECK ((
        "message_templates"."owner_user_id" IS NULL
        AND "message_templates"."created_by_user_id" IS NULL
        AND "message_templates"."updated_by_user_id" IS NULL
      ) OR (
        "message_templates"."owner_user_id" IS NOT NULL
        AND "message_templates"."created_by_user_id" = "message_templates"."owner_user_id"
        AND "message_templates"."updated_by_user_id" = "message_templates"."owner_user_id"
      )),
	CONSTRAINT "message_templates_image_metadata_complete" CHECK ((
        "message_templates"."image_file_id" IS NULL
        AND "message_templates"."image_url" IS NULL
        AND "message_templates"."image_original_name" IS NULL
        AND "message_templates"."image_byte_length" IS NULL
        AND "message_templates"."image_width" IS NULL
        AND "message_templates"."image_height" IS NULL
      ) OR (
        "message_templates"."image_file_id" IS NOT NULL
        AND "message_templates"."image_url" IS NOT NULL
        AND "message_templates"."image_original_name" IS NOT NULL
        AND "message_templates"."image_byte_length" BETWEEN 1 AND 204800
        AND "message_templates"."image_width" BETWEEN 1 AND 1500
        AND "message_templates"."image_height" BETWEEN 1 AND 1440
      ))
);
--> statement-breakpoint
CREATE TABLE "telephony_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" "telephony_message_provider" DEFAULT 'centrex' NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"consultation_id" uuid NOT NULL,
	"consultation_request_id" uuid NOT NULL,
	"template_id" uuid,
	"template_name_snapshot" varchar(80),
	"image_file_id_snapshot" varchar(100),
	"image_original_name_snapshot" varchar(100),
	"outbox_event_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"remote_phone_fingerprint" "bytea" NOT NULL,
	"body_ciphertext" "bytea" NOT NULL,
	"body_nonce" "bytea" NOT NULL,
	"body_key_version" varchar(50) NOT NULL,
	"body_fingerprint" "bytea" NOT NULL,
	"message_kind" "telephony_message_kind" NOT NULL,
	"body_byte_length" integer NOT NULL,
	"command_status" "telephony_command_status" DEFAULT 'queued' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"dispatched_at" timestamp with time zone,
	"provider_responded_at" timestamp with time zone,
	"provider_code" varchar(20),
	"provider_remaining_count" integer,
	"last_error_code" varchar(100),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_messages_remote_phone_fingerprint_length" CHECK (octet_length("telephony_messages"."remote_phone_fingerprint") = 32),
	CONSTRAINT "telephony_messages_body_ciphertext_length" CHECK (octet_length("telephony_messages"."body_ciphertext") >= 17),
	CONSTRAINT "telephony_messages_body_nonce_length" CHECK (octet_length("telephony_messages"."body_nonce") = 12),
	CONSTRAINT "telephony_messages_body_key_version_nonempty" CHECK (length(btrim("telephony_messages"."body_key_version")) > 0),
	CONSTRAINT "telephony_messages_body_fingerprint_length" CHECK (octet_length("telephony_messages"."body_fingerprint") = 32),
	CONSTRAINT "telephony_messages_kind_byte_length" CHECK ((
        "telephony_messages"."message_kind" = 'sms'
        AND "telephony_messages"."body_byte_length" >= 1
        AND "telephony_messages"."body_byte_length" <= 80
      ) OR (
        "telephony_messages"."message_kind" = 'lms'
        AND "telephony_messages"."body_byte_length" >= 81
        AND "telephony_messages"."body_byte_length" <= 720
      ) OR (
        "telephony_messages"."message_kind" = 'mms'
        AND "telephony_messages"."body_byte_length" >= 1
        AND "telephony_messages"."body_byte_length" <= 720
      )),
	CONSTRAINT "telephony_messages_provider_kind" CHECK ((
        "telephony_messages"."provider" = 'centrex'
        AND "telephony_messages"."message_kind" IN ('sms', 'lms')
      ) OR (
        "telephony_messages"."provider" = 'solapi'
        AND "telephony_messages"."message_kind" = 'mms'
      )),
	CONSTRAINT "telephony_messages_image_snapshot_pair" CHECK ((
        "telephony_messages"."message_kind" = 'mms'
        AND "telephony_messages"."image_file_id_snapshot" IS NOT NULL
        AND "telephony_messages"."image_original_name_snapshot" IS NOT NULL
      ) OR (
        "telephony_messages"."message_kind" <> 'mms'
        AND "telephony_messages"."image_file_id_snapshot" IS NULL
        AND "telephony_messages"."image_original_name_snapshot" IS NULL
      )),
	CONSTRAINT "telephony_messages_template_snapshot_pair" CHECK (("telephony_messages"."template_id" IS NULL) = ("telephony_messages"."template_name_snapshot" IS NULL)),
	CONSTRAINT "telephony_messages_dispatch_time_order" CHECK ("telephony_messages"."dispatched_at" IS NULL OR "telephony_messages"."dispatched_at" >= "telephony_messages"."requested_at"),
	CONSTRAINT "telephony_messages_provider_response_time_order" CHECK ("telephony_messages"."provider_responded_at" IS NULL OR "telephony_messages"."provider_responded_at" >= "telephony_messages"."requested_at"),
	CONSTRAINT "telephony_messages_provider_remaining_nonnegative" CHECK ("telephony_messages"."provider_remaining_count" IS NULL OR "telephony_messages"."provider_remaining_count" >= 0),
	CONSTRAINT "telephony_messages_error_pair" CHECK (("telephony_messages"."last_error_code" IS NULL AND "telephony_messages"."last_error_message" IS NULL)
        OR ("telephony_messages"."last_error_code" IS NOT NULL AND "telephony_messages"."last_error_message" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_owner_user_id_staff_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_user_id_staff_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_updated_by_user_id_staff_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_consultation_request_id_consultation_requests_id_fk" FOREIGN KEY ("consultation_request_id") REFERENCES "public"."consultation_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_messages" ADD CONSTRAINT "telephony_messages_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_owner_name_lower_uidx" ON "message_templates" USING btree ("owner_user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "message_templates_active_name_idx" ON "message_templates" USING btree ("owner_user_id","is_active","name");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_messages_outbox_event_uidx" ON "telephony_messages" USING btree ("outbox_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_messages_idempotency_key_uidx" ON "telephony_messages" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "telephony_messages_consultation_requested_idx" ON "telephony_messages" USING btree ("consultation_id","requested_at");--> statement-breakpoint
CREATE INDEX "telephony_messages_status_requested_idx" ON "telephony_messages" USING btree ("command_status","requested_at");
--> statement-breakpoint
INSERT INTO "message_templates" (
	"id", "name", "body", "body_byte_length", "is_active"
) VALUES
	(
		'00000000-0000-4000-8000-000000000001',
		'상담 접수 확인',
		'{{고객명}}님, 법무법인 로앤입니다. 상담 요청(접수번호 {{접수번호}})을 확인했습니다. 담당 {{담당자명}}이 연락드리겠습니다.',
		121,
		true
	),
	(
		'00000000-0000-4000-8000-000000000002',
		'부재 안내',
		'{{고객명}}님, 법무법인 로앤 {{담당자명}}입니다. 상담 요청으로 연락드렸으나 연결되지 않아 문자드립니다. 편하신 시간에 회신해 주세요.',
		131,
		true
	),
	(
		'00000000-0000-4000-8000-000000000003',
		'상담 준비 안내',
		'{{고객명}}님, 법무법인 로앤 {{담당자명}}입니다. 상담 전에 현재 채무와 소득·재산을 확인할 수 있는 자료를 준비해 주시면 안내에 도움이 됩니다. 구체적인 서류는 상담 후 별도로 안내드리겠습니다.',
		189,
		true
	);
--> statement-breakpoint
REVOKE ALL ON TABLE "message_templates" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "telephony_messages" FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
		EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE message_templates TO lawand_app';
		EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telephony_messages TO lawand_app';
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
		EXECUTE 'GRANT SELECT ON TABLE message_templates TO lawand_viewer';
		EXECUTE 'GRANT SELECT ON TABLE telephony_messages TO lawand_viewer';
	END IF;
END
$$;
