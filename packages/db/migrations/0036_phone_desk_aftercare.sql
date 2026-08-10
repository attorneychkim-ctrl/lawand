CREATE TYPE "public"."telephony_aftercare_result" AS ENUM('consultation_completed', 'reconsultation_required', 'no_answer', 'busy', 'manager_callback_requested', 'rejected', 'public_institution', 'creditor', 'wrong_number', 'other');--> statement-breakpoint
CREATE TYPE "public"."telephony_follow_up_state" AS ENUM('open', 'completed', 'cancelled');--> statement-breakpoint
ALTER TABLE "consultation_requests" DROP CONSTRAINT "consultation_requests_privacy_basis_consistent";--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "privacy_basis" DROP DEFAULT;--> statement-breakpoint
CREATE TYPE "public"."privacy_basis_phone_desk" AS ENUM('explicit_consent', 'customer_initiated_channel_message', 'customer_initiated_channel_entry', 'customer_initiated_booking', 'staff_recorded_phone_interaction');--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "privacy_basis" TYPE "public"."privacy_basis_phone_desk" USING "privacy_basis"::text::"public"."privacy_basis_phone_desk";--> statement-breakpoint
DROP TYPE "public"."privacy_basis";--> statement-breakpoint
ALTER TYPE "public"."privacy_basis_phone_desk" RENAME TO "privacy_basis";--> statement-breakpoint
ALTER TABLE "consultation_requests" ALTER COLUMN "privacy_basis" SET DEFAULT 'explicit_consent';--> statement-breakpoint
CREATE TABLE "telephony_call_aftercare" (
	"id" uuid PRIMARY KEY NOT NULL,
	"observed_call_id" uuid,
	"telephony_call_id" uuid,
	"consultation_id" uuid,
	"result" "telephony_aftercare_result" NOT NULL,
	"other_text_ciphertext" "bytea",
	"other_text_nonce" "bytea",
	"other_text_key_version" varchar(50),
	"memo_ciphertext" "bytea",
	"memo_nonce" "bytea",
	"memo_key_version" varchar(50),
	"confirmed_by_user_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_call_aftercare_source_present" CHECK ("telephony_call_aftercare"."observed_call_id" IS NOT NULL OR "telephony_call_aftercare"."telephony_call_id" IS NOT NULL),
	CONSTRAINT "telephony_call_aftercare_other_text_crypto" CHECK ((
        "telephony_call_aftercare"."result" = 'other'
        AND "telephony_call_aftercare"."other_text_ciphertext" IS NOT NULL
        AND "telephony_call_aftercare"."other_text_nonce" IS NOT NULL
        AND "telephony_call_aftercare"."other_text_key_version" IS NOT NULL
      ) OR (
        "telephony_call_aftercare"."result" <> 'other'
        AND "telephony_call_aftercare"."other_text_ciphertext" IS NULL
        AND "telephony_call_aftercare"."other_text_nonce" IS NULL
        AND "telephony_call_aftercare"."other_text_key_version" IS NULL
      )),
	CONSTRAINT "telephony_call_aftercare_memo_crypto" CHECK ((
        "telephony_call_aftercare"."memo_ciphertext" IS NULL
        AND "telephony_call_aftercare"."memo_nonce" IS NULL
        AND "telephony_call_aftercare"."memo_key_version" IS NULL
      ) OR (
        "telephony_call_aftercare"."memo_ciphertext" IS NOT NULL
        AND "telephony_call_aftercare"."memo_nonce" IS NOT NULL
        AND "telephony_call_aftercare"."memo_key_version" IS NOT NULL
      )),
	CONSTRAINT "telephony_call_aftercare_nonce_lengths" CHECK (("telephony_call_aftercare"."other_text_nonce" IS NULL OR octet_length("telephony_call_aftercare"."other_text_nonce") = 12)
        AND ("telephony_call_aftercare"."memo_nonce" IS NULL OR octet_length("telephony_call_aftercare"."memo_nonce") = 12))
);
--> statement-breakpoint
CREATE TABLE "telephony_follow_up_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aftercare_id" uuid NOT NULL,
	"assignee_user_id" uuid NOT NULL,
	"state" "telephony_follow_up_state" DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"completed_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_follow_up_tasks_state_times" CHECK ((
        "telephony_follow_up_tasks"."state" = 'open'
        AND "telephony_follow_up_tasks"."completed_at" IS NULL
        AND "telephony_follow_up_tasks"."completed_by_user_id" IS NULL
        AND "telephony_follow_up_tasks"."cancelled_at" IS NULL
      ) OR (
        "telephony_follow_up_tasks"."state" = 'completed'
        AND "telephony_follow_up_tasks"."completed_at" IS NOT NULL
        AND "telephony_follow_up_tasks"."completed_by_user_id" IS NOT NULL
        AND "telephony_follow_up_tasks"."cancelled_at" IS NULL
      ) OR (
        "telephony_follow_up_tasks"."state" = 'cancelled'
        AND "telephony_follow_up_tasks"."completed_at" IS NULL
        AND "telephony_follow_up_tasks"."completed_by_user_id" IS NULL
        AND "telephony_follow_up_tasks"."cancelled_at" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "consultation_assignments" DROP CONSTRAINT "consultation_assignments_method_allowed";--> statement-breakpoint
ALTER TABLE "telephony_call_aftercare" ADD CONSTRAINT "telephony_call_aftercare_observed_call_id_telephony_inbound_calls_id_fk" FOREIGN KEY ("observed_call_id") REFERENCES "public"."telephony_inbound_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_aftercare" ADD CONSTRAINT "telephony_call_aftercare_telephony_call_id_telephony_calls_id_fk" FOREIGN KEY ("telephony_call_id") REFERENCES "public"."telephony_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_aftercare" ADD CONSTRAINT "telephony_call_aftercare_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_aftercare" ADD CONSTRAINT "telephony_call_aftercare_confirmed_by_user_id_staff_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_follow_up_tasks" ADD CONSTRAINT "telephony_follow_up_tasks_aftercare_id_telephony_call_aftercare_id_fk" FOREIGN KEY ("aftercare_id") REFERENCES "public"."telephony_call_aftercare"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_follow_up_tasks" ADD CONSTRAINT "telephony_follow_up_tasks_assignee_user_id_staff_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_follow_up_tasks" ADD CONSTRAINT "telephony_follow_up_tasks_created_by_user_id_staff_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_follow_up_tasks" ADD CONSTRAINT "telephony_follow_up_tasks_completed_by_user_id_staff_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_call_aftercare_observed_uidx" ON "telephony_call_aftercare" USING btree ("observed_call_id") WHERE "telephony_call_aftercare"."observed_call_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_call_aftercare_command_uidx" ON "telephony_call_aftercare" USING btree ("telephony_call_id") WHERE "telephony_call_aftercare"."telephony_call_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "telephony_call_aftercare_consultation_idx" ON "telephony_call_aftercare" USING btree ("consultation_id","confirmed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_follow_up_tasks_open_aftercare_uidx" ON "telephony_follow_up_tasks" USING btree ("aftercare_id") WHERE "telephony_follow_up_tasks"."state" = 'open';--> statement-breakpoint
CREATE INDEX "telephony_follow_up_tasks_open_due_idx" ON "telephony_follow_up_tasks" USING btree ("due_at","assignee_user_id") WHERE "telephony_follow_up_tasks"."state" = 'open';--> statement-breakpoint
ALTER TABLE "consultation_assignments" ADD CONSTRAINT "consultation_assignments_method_allowed" CHECK ("consultation_assignments"."assignment_method" IN ('self_claim', 'phone_desk_conversion'));--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_privacy_basis_consistent" CHECK (("consultation_requests"."privacy_basis" = 'explicit_consent' AND "consultation_requests"."consent_agreed_at" IS NOT NULL)
        OR ("consultation_requests"."privacy_basis" IN ('customer_initiated_channel_message', 'customer_initiated_channel_entry', 'customer_initiated_booking', 'staff_recorded_phone_interaction') AND "consultation_requests"."consent_agreed_at" IS NULL));--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_telephony_desk_aftercare()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	call_direction text;
BEGIN
	SELECT direction::text
	INTO call_direction
	FROM telephony_inbound_calls
	WHERE id = NEW.observed_call_id;

	IF call_direction IS NULL THEN
		SELECT 'outbound'
		INTO call_direction
		WHERE NEW.telephony_call_id IS NOT NULL;
	END IF;

	PERFORM pg_notify(
		'lawand_telephony_desk_events',
		json_build_object(
			'eventType', 'aftercare.changed',
			'entityId', NEW.id,
			'direction', coalesce(call_direction, 'inbound'),
			'occurredAt', NEW.updated_at
		)::text
	);
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER telephony_desk_aftercare_notify
AFTER INSERT OR UPDATE ON telephony_call_aftercare
FOR EACH ROW
EXECUTE FUNCTION notify_telephony_desk_aftercare();--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_telephony_desk_follow_up()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	call_direction text;
BEGIN
	SELECT coalesce(observed.direction::text, 'outbound')
	INTO call_direction
	FROM telephony_call_aftercare aftercare
	LEFT JOIN telephony_inbound_calls observed ON observed.id = aftercare.observed_call_id
	WHERE aftercare.id = NEW.aftercare_id;

	PERFORM pg_notify(
		'lawand_telephony_desk_events',
		json_build_object(
			'eventType', 'follow_up.changed',
			'entityId', NEW.id,
			'direction', coalesce(call_direction, 'inbound'),
			'occurredAt', NEW.updated_at
		)::text
	);
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER telephony_desk_follow_up_notify
AFTER INSERT OR UPDATE ON telephony_follow_up_tasks
FOR EACH ROW
EXECUTE FUNCTION notify_telephony_desk_follow_up();
