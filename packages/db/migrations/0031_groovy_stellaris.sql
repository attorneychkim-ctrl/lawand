ALTER TYPE "public"."telephony_bridge_event_type" ADD VALUE 'outbound.ringing';--> statement-breakpoint
ALTER TYPE "public"."telephony_bridge_event_type" ADD VALUE 'outbound.connected';--> statement-breakpoint
ALTER TYPE "public"."telephony_bridge_event_type" ADD VALUE 'outbound.ended';--> statement-breakpoint
ALTER TABLE "telephony_inbound_events" DROP CONSTRAINT "telephony_inbound_events_details";--> statement-breakpoint
DROP INDEX "telephony_inbound_calls_state_last_event_idx";--> statement-breakpoint
ALTER TABLE "telephony_inbound_calls" ADD COLUMN "direction" "telephony_call_direction" DEFAULT 'inbound' NOT NULL;--> statement-breakpoint
ALTER TABLE "telephony_inbound_events" ADD COLUMN "direction" "telephony_call_direction" DEFAULT 'inbound' NOT NULL;--> statement-breakpoint
CREATE INDEX "telephony_inbound_calls_state_last_event_idx" ON "telephony_inbound_calls" USING btree ("direction","state","last_event_at");--> statement-breakpoint
ALTER TABLE "telephony_inbound_events" ADD CONSTRAINT "telephony_inbound_events_details" CHECK ((
        "telephony_inbound_events"."direction" = 'inbound'
        AND ("telephony_inbound_events"."event_type")::text = 'inbound.ringing'
        AND "telephony_inbound_events"."provider_channel_id" IS NULL
        AND "telephony_inbound_events"."provider_end_cause" IS NULL
      ) OR (
        "telephony_inbound_events"."direction" = 'inbound'
        AND ("telephony_inbound_events"."event_type")::text = 'inbound.connected'
        AND "telephony_inbound_events"."provider_end_cause" IS NULL
      ) OR (
        "telephony_inbound_events"."direction" = 'inbound'
        AND ("telephony_inbound_events"."event_type")::text = 'inbound.ended'
        AND "telephony_inbound_events"."provider_channel_id" IS NULL
        AND "telephony_inbound_events"."provider_end_cause" IS NOT NULL
      ) OR (
        "telephony_inbound_events"."direction" = 'outbound'
        AND ("telephony_inbound_events"."event_type")::text = 'outbound.ringing'
        AND "telephony_inbound_events"."provider_channel_id" IS NULL
        AND "telephony_inbound_events"."provider_end_cause" IS NULL
      ) OR (
        "telephony_inbound_events"."direction" = 'outbound'
        AND ("telephony_inbound_events"."event_type")::text = 'outbound.connected'
        AND "telephony_inbound_events"."provider_end_cause" IS NULL
      ) OR (
        "telephony_inbound_events"."direction" = 'outbound'
        AND ("telephony_inbound_events"."event_type")::text = 'outbound.ended'
        AND "telephony_inbound_events"."provider_channel_id" IS NULL
        AND "telephony_inbound_events"."provider_end_cause" IS NOT NULL
      ));--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notify_telephony_inbound_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_notify(
    'lawand_telephony_inbound_events',
    json_build_object(
      'eventId', NEW.id,
      'eventType', NEW.event_type,
      'inboundCallId', NEW.inbound_call_id,
      'occurredAt', NEW.occurred_at
    )::text
  );

  RETURN NEW;
END;
$$;
