-- Pending migration 전체를 한 트랜잭션에 적용하는 Drizzle migrator에서도 이후 migration이
-- 새 값을 즉시 사용할 수 있도록 enum을 새 타입으로 원자 교체한다.
ALTER TYPE "public"."dedupe_outcome" RENAME TO "dedupe_outcome_old";--> statement-breakpoint
CREATE TYPE "public"."dedupe_outcome" AS ENUM(
	'new',
	'exact_duplicate',
	'identity_enrichment',
	'repeat_unassigned',
	'repeat_assigned',
	'suspected_duplicate'
);--> statement-breakpoint
ALTER TABLE "public"."consultation_requests"
	DROP CONSTRAINT "consultation_requests_candidate_consistent";--> statement-breakpoint
ALTER TABLE "public"."consultation_requests"
	ALTER COLUMN "dedupe_outcome" TYPE "public"."dedupe_outcome"
	USING "dedupe_outcome"::text::"public"."dedupe_outcome";--> statement-breakpoint
ALTER TABLE "public"."consultation_requests"
	ADD CONSTRAINT "consultation_requests_candidate_consistent" CHECK (("dedupe_outcome" = 'suspected_duplicate' AND "candidate_consultation_id" IS NOT NULL)
		OR ("dedupe_outcome" <> 'suspected_duplicate' AND "candidate_consultation_id" IS NULL));--> statement-breakpoint
DROP TYPE "public"."dedupe_outcome_old";--> statement-breakpoint
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
        'occurredAt', NEW.occurred_at,
        'notificationKind', CASE NEW.payload #>> '{data,repeatStage}'
          WHEN 'before_assignment' THEN 'repeat_unassigned'
          WHEN 'after_assignment' THEN 'repeat_assigned'
          ELSE NULL
        END
      )::text
    );
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TABLE "consultation_legalfriends_handlings" (
	"consultation_id" uuid PRIMARY KEY NOT NULL,
	"mode" varchar(32) NOT NULL,
	"directory_client_idx" integer,
	"directory_case_idx" integer,
	"decided_by_user_id" uuid NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_legalfriends_handlings_mode_allowed" CHECK ("consultation_legalfriends_handlings"."mode" IN ('existing_case', 'new_matter', 'shared_contact')),
	CONSTRAINT "consultation_legalfriends_handlings_directory_consistent" CHECK (("consultation_legalfriends_handlings"."mode" = 'existing_case'
        AND "consultation_legalfriends_handlings"."directory_client_idx" IS NOT NULL
        AND "consultation_legalfriends_handlings"."directory_client_idx" > 0
        AND "consultation_legalfriends_handlings"."directory_case_idx" IS NOT NULL
        AND "consultation_legalfriends_handlings"."directory_case_idx" > 0)
        OR ("consultation_legalfriends_handlings"."mode" IN ('new_matter', 'shared_contact')
          AND "consultation_legalfriends_handlings"."directory_client_idx" IS NULL
          AND "consultation_legalfriends_handlings"."directory_case_idx" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "consultation_legalfriends_handlings" ADD CONSTRAINT "consultation_legalfriends_handlings_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_legalfriends_handlings" ADD CONSTRAINT "consultation_legalfriends_handlings_decided_by_user_id_staff_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultation_legalfriends_handlings_directory_idx" ON "consultation_legalfriends_handlings" USING btree ("directory_client_idx","directory_case_idx");
--> statement-breakpoint
REVOKE ALL ON TABLE "consultation_legalfriends_handlings" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE consultation_legalfriends_handlings TO lawand_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    EXECUTE 'GRANT SELECT ON TABLE consultation_legalfriends_handlings TO lawand_viewer';
  END IF;
END
$$;
