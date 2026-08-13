CREATE TYPE "public"."consultation_assignment_transfer_reason" AS ENUM('workload_balance', 'absence', 'expertise', 'manager_adjustment', 'other');--> statement-breakpoint
CREATE TYPE "public"."consultation_assignment_transfer_status" AS ENUM('pending', 'succeeded', 'failed', 'needs_confirmation');--> statement-breakpoint
CREATE TABLE "consultation_assignment_transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consultation_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"previous_assignee_user_id" uuid NOT NULL,
	"previous_assignee_membership_id" uuid NOT NULL,
	"target_assignee_user_id" uuid NOT NULL,
	"target_assignee_membership_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"reason" "consultation_assignment_transfer_reason" NOT NULL,
	"target_manager_external_account_id" varchar(200) NOT NULL,
	"target_manager_member_idx" integer NOT NULL,
	"outbox_event_id" uuid NOT NULL,
	"status" "consultation_assignment_transfer_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_assignment_transfers_distinct_assignee" CHECK ("consultation_assignment_transfers"."previous_assignee_user_id" <> "consultation_assignment_transfers"."target_assignee_user_id"),
	CONSTRAINT "consultation_assignment_transfers_target_manager_nonempty" CHECK (length(btrim("consultation_assignment_transfers"."target_manager_external_account_id")) > 0),
	CONSTRAINT "consultation_assignment_transfers_target_member_positive" CHECK ("consultation_assignment_transfers"."target_manager_member_idx" > 0),
	CONSTRAINT "consultation_assignment_transfers_status_consistent" CHECK (("consultation_assignment_transfers"."status" = 'pending' AND "consultation_assignment_transfers"."finished_at" IS NULL)
        OR ("consultation_assignment_transfers"."status" <> 'pending' AND "consultation_assignment_transfers"."finished_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "consultation_assignments" DROP CONSTRAINT "consultation_assignments_method_allowed";--> statement-breakpoint
ALTER TABLE "consultation_assignment_transfers" ADD CONSTRAINT "consultation_assignment_transfers_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_assignment_transfers" ADD CONSTRAINT "consultation_assignment_transfers_assignment_id_consultation_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."consultation_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_assignment_transfers" ADD CONSTRAINT "consultation_assignment_transfers_previous_assignee_user_id_staff_users_id_fk" FOREIGN KEY ("previous_assignee_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_assignment_transfers" ADD CONSTRAINT "consultation_assignment_transfers_previous_assignee_membership_id_staff_memberships_id_fk" FOREIGN KEY ("previous_assignee_membership_id") REFERENCES "public"."staff_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_assignment_transfers" ADD CONSTRAINT "consultation_assignment_transfers_target_assignee_user_id_staff_users_id_fk" FOREIGN KEY ("target_assignee_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_assignment_transfers" ADD CONSTRAINT "consultation_assignment_transfers_target_assignee_membership_id_staff_memberships_id_fk" FOREIGN KEY ("target_assignee_membership_id") REFERENCES "public"."staff_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_assignment_transfers" ADD CONSTRAINT "consultation_assignment_transfers_requested_by_user_id_staff_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_assignment_transfers" ADD CONSTRAINT "consultation_assignment_transfers_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_assignment_transfers_outbox_uidx" ON "consultation_assignment_transfers" USING btree ("outbox_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_assignment_transfers_pending_uidx" ON "consultation_assignment_transfers" USING btree ("consultation_id") WHERE "consultation_assignment_transfers"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "consultation_assignment_transfers_consultation_requested_idx" ON "consultation_assignment_transfers" USING btree ("consultation_id","requested_at");--> statement-breakpoint
ALTER TABLE "consultation_assignments" ADD CONSTRAINT "consultation_assignments_method_allowed" CHECK ("consultation_assignments"."assignment_method" IN ('self_claim', 'phone_desk_conversion', 'transfer'));--> statement-breakpoint
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
        'notificationKind', CASE
          WHEN NEW.event_type = 'consultation.assignment.transferred'
            THEN 'assignment_transferred'
          WHEN NEW.payload #>> '{data,repeatStage}' = 'before_assignment'
            THEN 'repeat_unassigned'
          WHEN NEW.payload #>> '{data,repeatStage}' = 'after_assignment'
            THEN 'repeat_assigned'
          ELSE NULL
        END
      )::text
    );
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON TABLE "consultation_assignment_transfers" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE consultation_assignment_transfers TO lawand_app';
    EXECUTE 'GRANT UPDATE ON TABLE consultation_assignments TO lawand_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    EXECUTE 'GRANT SELECT ON TABLE consultation_assignment_transfers TO lawand_viewer';
  END IF;
END
$$;
