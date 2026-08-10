CREATE OR REPLACE FUNCTION public.notify_telephony_inbound_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
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
--> statement-breakpoint
DROP TRIGGER IF EXISTS telephony_inbound_events_realtime_notify
  ON public.telephony_inbound_events;
--> statement-breakpoint
CREATE TRIGGER telephony_inbound_events_realtime_notify
AFTER INSERT ON public.telephony_inbound_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_telephony_inbound_realtime_event();
