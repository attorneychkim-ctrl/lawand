CREATE OR REPLACE FUNCTION public.notify_consultation_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.aggregate_type = 'consultation'
    AND NEW.event_type LIKE 'consultation.%'
  THEN
    PERFORM pg_notify(
      'lawand_consultation_events',
      json_build_object(
        'eventId', NEW.id,
        'eventType', NEW.event_type,
        'consultationId', NEW.aggregate_id,
        'occurredAt', NEW.occurred_at
      )::text
    );
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS outbox_events_consultation_realtime_notify
  ON public.outbox_events;
--> statement-breakpoint
CREATE TRIGGER outbox_events_consultation_realtime_notify
AFTER INSERT ON public.outbox_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_consultation_realtime_event();
