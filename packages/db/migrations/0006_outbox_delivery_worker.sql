CREATE TYPE "public"."outbox_delivery_attempt_status" AS ENUM('started', 'succeeded', 'retry_scheduled', 'dead');--> statement-breakpoint
CREATE TABLE "outbox_delivery_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outbox_event_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"worker_id" varchar(100) NOT NULL,
	"status" "outbox_delivery_attempt_status" DEFAULT 'started' NOT NULL,
	"http_status" integer,
	"error_code" varchar(100),
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_delivery_attempts_number_positive" CHECK ("outbox_delivery_attempts"."attempt_number" > 0),
	CONSTRAINT "outbox_delivery_attempts_http_status_valid" CHECK ("outbox_delivery_attempts"."http_status" IS NULL OR ("outbox_delivery_attempts"."http_status" >= 100 AND "outbox_delivery_attempts"."http_status" <= 599)),
	CONSTRAINT "outbox_delivery_attempts_finished_consistent" CHECK ((
        "outbox_delivery_attempts"."status" = 'started'
        AND "outbox_delivery_attempts"."finished_at" IS NULL
      ) OR (
        "outbox_delivery_attempts"."status" <> 'started'
        AND "outbox_delivery_attempts"."finished_at" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "locked_by" varchar(100);--> statement-breakpoint
ALTER TABLE "outbox_delivery_attempts" ADD CONSTRAINT "outbox_delivery_attempts_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_delivery_attempts_event_number_uidx" ON "outbox_delivery_attempts" USING btree ("outbox_event_id","attempt_number");--> statement-breakpoint
CREATE INDEX "outbox_delivery_attempts_event_started_idx" ON "outbox_delivery_attempts" USING btree ("outbox_event_id","started_at");--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_lease_consistent" CHECK ((
        "outbox_events"."status" = 'pending'
        AND "outbox_events"."locked_at" IS NOT NULL
        AND "outbox_events"."locked_by" IS NOT NULL
      ) OR (
        "outbox_events"."locked_at" IS NULL
        AND "outbox_events"."locked_by" IS NULL
      ));
