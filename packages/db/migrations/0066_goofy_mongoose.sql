CREATE TABLE "telephony_inbound_message_notifications" (
	"inbound_message_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"reason" varchar(30) NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_inbound_message_notifications_inbound_message_id_staff_user_id_pk" PRIMARY KEY("inbound_message_id","staff_user_id"),
	CONSTRAINT "telephony_inbound_message_notifications_reason" CHECK ("telephony_inbound_message_notifications"."reason" IN ('latest_sender', 'consultation_assignee', 'unmatched_admin'))
);
--> statement-breakpoint
ALTER TABLE "telephony_inbound_message_notifications" ADD CONSTRAINT "telephony_inbound_message_notifications_inbound_message_id_telephony_inbound_messages_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."telephony_inbound_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_inbound_message_notifications" ADD CONSTRAINT "telephony_inbound_message_notifications_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telephony_inbound_message_notifications_staff_unread_idx" ON "telephony_inbound_message_notifications" USING btree ("staff_user_id","read_at","created_at");