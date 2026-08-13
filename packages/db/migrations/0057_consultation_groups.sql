CREATE TABLE "consultation_group_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"consultation_id" uuid NOT NULL,
	"event_type" varchar(40) NOT NULL,
	"actor_user_id" uuid,
	"metadata" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_group_events_type_allowed" CHECK ("consultation_group_events"."event_type" IN ('created', 'linked', 'unlinked', 'canonical_changed', 'merged'))
);
--> statement-breakpoint
CREATE TABLE "consultation_group_members" (
	"consultation_id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"link_method" varchar(40) NOT NULL,
	"linked_by_user_id" uuid,
	"linked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_group_members_method_allowed" CHECK ("consultation_group_members"."link_method" IN ('automatic_phone_7d', 'manual_link', 'manual_split')),
	CONSTRAINT "consultation_group_members_actor_consistent" CHECK (("consultation_group_members"."link_method" = 'automatic_phone_7d' AND "consultation_group_members"."linked_by_user_id" IS NULL)
        OR ("consultation_group_members"."link_method" IN ('manual_link', 'manual_split') AND "consultation_group_members"."linked_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "consultation_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"canonical_consultation_id" uuid NOT NULL,
	"phone_fingerprint" "bytea",
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"merged_into_group_id" uuid,
	"created_reason" varchar(40) NOT NULL,
	"created_by_user_id" uuid,
	"first_requested_at" timestamp with time zone NOT NULL,
	"last_requested_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_groups_status_allowed" CHECK ("consultation_groups"."status" IN ('active', 'merged')),
	CONSTRAINT "consultation_groups_merge_consistent" CHECK (("consultation_groups"."status" = 'active' AND "consultation_groups"."merged_into_group_id" IS NULL)
        OR ("consultation_groups"."status" = 'merged' AND "consultation_groups"."merged_into_group_id" IS NOT NULL AND "consultation_groups"."merged_into_group_id" <> "consultation_groups"."id")),
	CONSTRAINT "consultation_groups_reason_allowed" CHECK ("consultation_groups"."created_reason" IN ('automatic_phone_7d', 'manual_link', 'manual_split')),
	CONSTRAINT "consultation_groups_actor_consistent" CHECK (("consultation_groups"."created_reason" = 'automatic_phone_7d' AND "consultation_groups"."created_by_user_id" IS NULL)
        OR ("consultation_groups"."created_reason" IN ('manual_link', 'manual_split') AND "consultation_groups"."created_by_user_id" IS NOT NULL)),
	CONSTRAINT "consultation_groups_request_time_order" CHECK ("consultation_groups"."last_requested_at" >= "consultation_groups"."first_requested_at"),
	CONSTRAINT "consultation_groups_phone_fingerprint_length" CHECK ("consultation_groups"."phone_fingerprint" IS NULL OR octet_length("consultation_groups"."phone_fingerprint") = 32)
);
--> statement-breakpoint
ALTER TABLE "consultation_group_events" ADD CONSTRAINT "consultation_group_events_group_id_consultation_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."consultation_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_group_events" ADD CONSTRAINT "consultation_group_events_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_group_events" ADD CONSTRAINT "consultation_group_events_actor_user_id_staff_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_group_members" ADD CONSTRAINT "consultation_group_members_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_group_members" ADD CONSTRAINT "consultation_group_members_group_id_consultation_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."consultation_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_group_members" ADD CONSTRAINT "consultation_group_members_linked_by_user_id_staff_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_groups" ADD CONSTRAINT "consultation_groups_canonical_consultation_id_consultations_id_fk" FOREIGN KEY ("canonical_consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_groups" ADD CONSTRAINT "consultation_groups_created_by_user_id_staff_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_groups" ADD CONSTRAINT "consultation_groups_merged_into_group_id_fk" FOREIGN KEY ("merged_into_group_id") REFERENCES "public"."consultation_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultation_group_events_group_occurred_idx" ON "consultation_group_events" USING btree ("group_id","occurred_at");--> statement-breakpoint
CREATE INDEX "consultation_group_events_consultation_idx" ON "consultation_group_events" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "consultation_group_members_group_idx" ON "consultation_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_groups_canonical_uidx" ON "consultation_groups" USING btree ("canonical_consultation_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "consultation_groups_phone_last_requested_idx" ON "consultation_groups" USING btree ("phone_fingerprint","last_requested_at");--> statement-breakpoint
CREATE INDEX "consultation_groups_merged_into_idx" ON "consultation_groups" USING btree ("merged_into_group_id");--> statement-breakpoint
REVOKE ALL ON TABLE "consultation_groups" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE "consultation_group_members" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE "consultation_group_events" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE consultation_groups TO lawand_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE consultation_group_members TO lawand_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE consultation_group_events TO lawand_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    EXECUTE 'GRANT SELECT ON TABLE consultation_groups, consultation_group_members, consultation_group_events TO lawand_viewer';
  END IF;
END
$$;
