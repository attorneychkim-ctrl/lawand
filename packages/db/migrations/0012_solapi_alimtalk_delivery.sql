CREATE TABLE "alimtalk_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consultation_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"outbox_event_id" uuid NOT NULL,
	"template_purpose" varchar(50) NOT NULL,
	"provider_group_id" varchar(100) NOT NULL,
	"provider_message_id" varchar(100) NOT NULL,
	"provider_status_code" varchar(20) NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alimtalk_deliveries_template_purpose_allowed" CHECK ("alimtalk_deliveries"."template_purpose" IN ('consultation_requested', 'consultation_assigned')),
	CONSTRAINT "alimtalk_deliveries_status_nonempty" CHECK (length(btrim("alimtalk_deliveries"."provider_status_code")) > 0)
);
--> statement-breakpoint
ALTER TABLE "alimtalk_deliveries" ADD CONSTRAINT "alimtalk_deliveries_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alimtalk_deliveries" ADD CONSTRAINT "alimtalk_deliveries_request_id_consultation_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."consultation_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alimtalk_deliveries" ADD CONSTRAINT "alimtalk_deliveries_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alimtalk_deliveries_outbox_uidx" ON "alimtalk_deliveries" USING btree ("outbox_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alimtalk_deliveries_message_uidx" ON "alimtalk_deliveries" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "alimtalk_deliveries_consultation_accepted_idx" ON "alimtalk_deliveries" USING btree ("consultation_id","accepted_at");
