CREATE TYPE "public"."telephony_inbound_command_status" AS ENUM('queued', 'dispatching', 'succeeded', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "telephony_inbound_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inbound_call_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"bridge_id" varchar(80) NOT NULL,
	"command_type" varchar(30) DEFAULT 'answer' NOT NULL,
	"provider_call_id" varchar(100) NOT NULL,
	"status" "telephony_inbound_command_status" DEFAULT 'queued' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"first_dispatched_at" timestamp with time zone,
	"last_dispatched_at" timestamp with time zone,
	"dispatch_attempts" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"result_code" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_inbound_commands_bridge_id_format" CHECK ("telephony_inbound_commands"."bridge_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$'),
	CONSTRAINT "telephony_inbound_commands_provider_call_id_format" CHECK ("telephony_inbound_commands"."provider_call_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'),
	CONSTRAINT "telephony_inbound_commands_type" CHECK ("telephony_inbound_commands"."command_type" = 'answer'),
	CONSTRAINT "telephony_inbound_commands_time_order" CHECK ("telephony_inbound_commands"."expires_at" > "telephony_inbound_commands"."requested_at"
        AND ("telephony_inbound_commands"."first_dispatched_at" IS NULL OR "telephony_inbound_commands"."first_dispatched_at" >= "telephony_inbound_commands"."requested_at")
        AND ("telephony_inbound_commands"."last_dispatched_at" IS NULL OR "telephony_inbound_commands"."last_dispatched_at" >= "telephony_inbound_commands"."first_dispatched_at")
        AND ("telephony_inbound_commands"."completed_at" IS NULL OR "telephony_inbound_commands"."completed_at" >= "telephony_inbound_commands"."requested_at")),
	CONSTRAINT "telephony_inbound_commands_attempts_nonnegative" CHECK ("telephony_inbound_commands"."dispatch_attempts" >= 0),
	CONSTRAINT "telephony_inbound_commands_status_details" CHECK ((
        "telephony_inbound_commands"."status" = 'queued'
        AND "telephony_inbound_commands"."first_dispatched_at" IS NULL
        AND "telephony_inbound_commands"."last_dispatched_at" IS NULL
        AND "telephony_inbound_commands"."dispatch_attempts" = 0
        AND "telephony_inbound_commands"."completed_at" IS NULL
        AND "telephony_inbound_commands"."result_code" IS NULL
      ) OR (
        "telephony_inbound_commands"."status" = 'dispatching'
        AND "telephony_inbound_commands"."first_dispatched_at" IS NOT NULL
        AND "telephony_inbound_commands"."last_dispatched_at" IS NOT NULL
        AND "telephony_inbound_commands"."dispatch_attempts" > 0
        AND "telephony_inbound_commands"."completed_at" IS NULL
        AND "telephony_inbound_commands"."result_code" IS NULL
      ) OR (
        "telephony_inbound_commands"."status" IN ('succeeded', 'failed')
        AND "telephony_inbound_commands"."first_dispatched_at" IS NOT NULL
        AND "telephony_inbound_commands"."last_dispatched_at" IS NOT NULL
        AND "telephony_inbound_commands"."dispatch_attempts" > 0
        AND "telephony_inbound_commands"."completed_at" IS NOT NULL
        AND "telephony_inbound_commands"."result_code" IS NOT NULL
      ) OR (
        "telephony_inbound_commands"."status" = 'expired'
        AND "telephony_inbound_commands"."completed_at" IS NOT NULL
        AND "telephony_inbound_commands"."result_code" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "telephony_inbound_commands" ADD CONSTRAINT "telephony_inbound_commands_inbound_call_id_telephony_inbound_calls_id_fk" FOREIGN KEY ("inbound_call_id") REFERENCES "public"."telephony_inbound_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_inbound_commands" ADD CONSTRAINT "telephony_inbound_commands_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_inbound_commands" ADD CONSTRAINT "telephony_inbound_commands_requested_by_user_id_staff_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_inbound_commands_active_call_uidx" ON "telephony_inbound_commands" USING btree ("inbound_call_id","command_type") WHERE "telephony_inbound_commands"."status" IN ('queued', 'dispatching');--> statement-breakpoint
CREATE INDEX "telephony_inbound_commands_bridge_dispatch_idx" ON "telephony_inbound_commands" USING btree ("bridge_id","endpoint_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "telephony_inbound_commands_call_requested_idx" ON "telephony_inbound_commands" USING btree ("inbound_call_id","requested_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notify_telephony_inbound_command_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM pg_notify(
    'lawand_telephony_inbound_events',
    json_build_object(
      'eventId', NEW.id,
      'eventType', 'inbound.answer.changed',
      'inboundCallId', NEW.inbound_call_id,
      'occurredAt', COALESCE(NEW.completed_at, NEW.last_dispatched_at, NEW.requested_at)
    )::text
  );

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER telephony_inbound_commands_realtime_notify
AFTER INSERT OR UPDATE OF status ON public.telephony_inbound_commands
FOR EACH ROW
EXECUTE FUNCTION public.notify_telephony_inbound_command_realtime_event();
