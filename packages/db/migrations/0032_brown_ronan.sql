CREATE TABLE "telephony_call_observation_links" (
	"observed_call_id" uuid PRIMARY KEY NOT NULL,
	"telephony_call_id" uuid NOT NULL,
	"match_method" varchar(50) NOT NULL,
	"time_delta_ms" integer NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_call_observation_links_method" CHECK ("telephony_call_observation_links"."match_method" = 'endpoint_phone_time_v1'),
	CONSTRAINT "telephony_call_observation_links_time_delta" CHECK ("telephony_call_observation_links"."time_delta_ms" BETWEEN -5000 AND 120000)
);
--> statement-breakpoint
ALTER TABLE "telephony_call_observation_links" ADD CONSTRAINT "telephony_call_observation_links_observed_call_id_telephony_inbound_calls_id_fk" FOREIGN KEY ("observed_call_id") REFERENCES "public"."telephony_inbound_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_call_observation_links" ADD CONSTRAINT "telephony_call_observation_links_telephony_call_id_telephony_calls_id_fk" FOREIGN KEY ("telephony_call_id") REFERENCES "public"."telephony_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_call_observation_links_call_uidx" ON "telephony_call_observation_links" USING btree ("telephony_call_id");--> statement-breakpoint
CREATE INDEX "telephony_call_observation_links_linked_idx" ON "telephony_call_observation_links" USING btree ("linked_at");--> statement-breakpoint
WITH candidates AS (
	SELECT
		observed.id AS observed_call_id,
		command.id AS telephony_call_id,
		round(extract(epoch FROM (observed.ringing_at - command.requested_at)) * 1000)::integer AS time_delta_ms,
		row_number() OVER (
			PARTITION BY observed.id
			ORDER BY abs(extract(epoch FROM (observed.ringing_at - command.requested_at))), command.requested_at DESC, command.id
		) AS observed_rank,
		row_number() OVER (
			PARTITION BY command.id
			ORDER BY abs(extract(epoch FROM (observed.ringing_at - command.requested_at))), observed.ringing_at, observed.id
		) AS command_rank
	FROM "telephony_inbound_calls" observed
	INNER JOIN "telephony_calls" command
		ON command.provider = 'centrex'
		AND command.direction = 'outbound'
		AND command.endpoint_id = observed.endpoint_id
		AND command.remote_phone_fingerprint = observed.remote_phone_fingerprint
		AND command.command_status IN ('dispatching', 'succeeded', 'unknown')
		AND command.requested_at BETWEEN observed.ringing_at - interval '120 seconds' AND observed.ringing_at + interval '5 seconds'
	WHERE observed.direction = 'outbound'
)
INSERT INTO "telephony_call_observation_links" (
	"observed_call_id",
	"telephony_call_id",
	"match_method",
	"time_delta_ms",
	"linked_at",
	"created_at"
)
SELECT
	observed_call_id,
	telephony_call_id,
	'endpoint_phone_time_v1',
	time_delta_ms,
	now(),
	now()
FROM candidates
WHERE observed_rank = 1 AND command_rank = 1
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_telephony_desk_observed_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM pg_notify(
		'lawand_telephony_desk_events',
		json_build_object(
			'eventType', 'observed_call.changed',
			'entityId', NEW.inbound_call_id,
			'direction', NEW.direction::text,
			'occurredAt', NEW.occurred_at
		)::text
	);
	RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS telephony_desk_observed_event_notify ON telephony_inbound_events;--> statement-breakpoint
CREATE TRIGGER telephony_desk_observed_event_notify
AFTER INSERT ON telephony_inbound_events
FOR EACH ROW
EXECUTE FUNCTION notify_telephony_desk_observed_event();--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_telephony_desk_click_to_call()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM pg_notify(
		'lawand_telephony_desk_events',
		json_build_object(
			'eventType', 'click_to_call.changed',
			'entityId', NEW.id,
			'direction', NEW.direction::text,
			'occurredAt', NEW.updated_at
		)::text
	);
	RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS telephony_desk_click_to_call_notify ON telephony_calls;--> statement-breakpoint
CREATE TRIGGER telephony_desk_click_to_call_notify
AFTER INSERT OR UPDATE ON telephony_calls
FOR EACH ROW
EXECUTE FUNCTION notify_telephony_desk_click_to_call();--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_telephony_desk_observation_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM pg_notify(
		'lawand_telephony_desk_events',
		json_build_object(
			'eventType', 'click_to_call.linked',
			'entityId', NEW.observed_call_id,
			'direction', 'outbound',
			'occurredAt', NEW.linked_at
		)::text
	);
	RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS telephony_desk_observation_link_notify ON telephony_call_observation_links;--> statement-breakpoint
CREATE TRIGGER telephony_desk_observation_link_notify
AFTER INSERT ON telephony_call_observation_links
FOR EACH ROW
EXECUTE FUNCTION notify_telephony_desk_observation_link();
