CREATE TABLE "staff_telephony_bridge_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"bridge_id" varchar(80) NOT NULL,
	"current_endpoint_id" uuid,
	"pending_endpoint_id" uuid,
	"state" varchar(30) DEFAULT 'assigned' NOT NULL,
	"provisioning_command_id" uuid,
	"provisioning_expires_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"last_login_succeeded_at" timestamp with time zone,
	"last_login_failed_at" timestamp with time zone,
	"last_result_code" varchar(60),
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_telephony_bridge_assignments_bridge_format" CHECK ("staff_telephony_bridge_assignments"."bridge_id" ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$'),
	CONSTRAINT "staff_telephony_bridge_assignments_state" CHECK ("staff_telephony_bridge_assignments"."state" IN ('assigned', 'provisioning', 'connected', 'failed')),
	CONSTRAINT "staff_telephony_bridge_assignments_provisioning" CHECK ((
        "staff_telephony_bridge_assignments"."state" = 'provisioning'
        AND "staff_telephony_bridge_assignments"."pending_endpoint_id" IS NOT NULL
        AND "staff_telephony_bridge_assignments"."provisioning_command_id" IS NOT NULL
        AND "staff_telephony_bridge_assignments"."provisioning_expires_at" IS NOT NULL
      ) OR (
        "staff_telephony_bridge_assignments"."state" <> 'provisioning'
        AND "staff_telephony_bridge_assignments"."pending_endpoint_id" IS NULL
        AND "staff_telephony_bridge_assignments"."provisioning_command_id" IS NULL
        AND "staff_telephony_bridge_assignments"."provisioning_expires_at" IS NULL
      )),
	CONSTRAINT "staff_telephony_bridge_assignments_result_code" CHECK ("staff_telephony_bridge_assignments"."last_result_code" IS NULL OR "staff_telephony_bridge_assignments"."last_result_code" ~ '^[A-Za-z0-9_.:-]{1,60}$')
);
--> statement-breakpoint
ALTER TABLE "staff_telephony_bridge_assignments" ADD CONSTRAINT "staff_telephony_bridge_assignments_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_telephony_bridge_assignments" ADD CONSTRAINT "staff_telephony_bridge_assignments_current_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("current_endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_telephony_bridge_assignments" ADD CONSTRAINT "staff_telephony_bridge_assignments_pending_endpoint_id_telephony_endpoints_id_fk" FOREIGN KEY ("pending_endpoint_id") REFERENCES "public"."telephony_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_telephony_bridge_assignments" ADD CONSTRAINT "staff_telephony_bridge_assignments_assigned_by_user_id_staff_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_telephony_bridge_assignments_staff_uidx" ON "staff_telephony_bridge_assignments" USING btree ("staff_user_id") WHERE "staff_telephony_bridge_assignments"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_telephony_bridge_assignments_bridge_uidx" ON "staff_telephony_bridge_assignments" USING btree ("bridge_id") WHERE "staff_telephony_bridge_assignments"."is_active" = true;--> statement-breakpoint
REVOKE ALL ON TABLE "staff_telephony_bridge_assignments" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "staff_telephony_bridge_assignments" TO lawand_app;--> statement-breakpoint
GRANT SELECT ON TABLE "staff_telephony_bridge_assignments" TO lawand_viewer;
