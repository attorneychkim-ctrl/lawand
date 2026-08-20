ALTER TABLE "telephony_follow_up_tasks" ALTER COLUMN "aftercare_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "telephony_follow_up_tasks" ADD COLUMN "consultation_request_id" uuid;--> statement-breakpoint
ALTER TABLE "telephony_follow_up_tasks" ADD CONSTRAINT "telephony_follow_up_tasks_consultation_request_id_consultation_requests_id_fk" FOREIGN KEY ("consultation_request_id") REFERENCES "public"."consultation_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_follow_up_tasks_open_consultation_request_uidx" ON "telephony_follow_up_tasks" USING btree ("consultation_request_id") WHERE "telephony_follow_up_tasks"."state" = 'open';--> statement-breakpoint
ALTER TABLE "telephony_follow_up_tasks" ADD CONSTRAINT "telephony_follow_up_tasks_single_source" CHECK (num_nonnulls("telephony_follow_up_tasks"."aftercare_id", "telephony_follow_up_tasks"."consultation_request_id") = 1);--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_telephony_desk_follow_up()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	call_direction text;
BEGIN
	IF NEW.consultation_request_id IS NOT NULL THEN
		call_direction := 'outbound';
	ELSE
		SELECT coalesce(observed.direction::text, 'outbound')
		INTO call_direction
		FROM telephony_call_aftercare aftercare
		LEFT JOIN telephony_inbound_calls observed ON observed.id = aftercare.observed_call_id
		WHERE aftercare.id = NEW.aftercare_id;
	END IF;

	PERFORM pg_notify(
		'lawand_telephony_desk_events',
		json_build_object(
			'eventType', 'follow_up.changed',
			'entityId', NEW.id,
			'direction', coalesce(call_direction, 'outbound'),
			'occurredAt', NEW.updated_at
		)::text
	);
	RETURN NEW;
END;
$$;
