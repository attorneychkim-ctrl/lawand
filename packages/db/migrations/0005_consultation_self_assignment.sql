CREATE TABLE "consultation_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consultation_id" uuid NOT NULL,
	"assignee_user_id" uuid NOT NULL,
	"assignee_membership_id" uuid NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"assignment_method" varchar(50) DEFAULT 'self_claim' NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_assignments_method_allowed" CHECK ("consultation_assignments"."assignment_method" IN ('self_claim'))
);
--> statement-breakpoint
ALTER TABLE "consultation_assignments" ADD CONSTRAINT "consultation_assignments_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_assignments" ADD CONSTRAINT "consultation_assignments_assignee_user_id_staff_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_assignments" ADD CONSTRAINT "consultation_assignments_assignee_membership_id_staff_memberships_id_fk" FOREIGN KEY ("assignee_membership_id") REFERENCES "public"."staff_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_assignments" ADD CONSTRAINT "consultation_assignments_assigned_by_user_id_staff_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_assignments_consultation_uidx" ON "consultation_assignments" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "consultation_assignments_assignee_assigned_idx" ON "consultation_assignments" USING btree ("assignee_user_id","assigned_at");
