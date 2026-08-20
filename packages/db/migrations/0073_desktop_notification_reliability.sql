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
