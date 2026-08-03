CREATE TYPE "public"."staff_account_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('admin', 'manager', 'consultant', 'viewer');--> statement-breakpoint
CREATE TABLE "staff_audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(100),
	"target_id" varchar(100),
	"metadata" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_audit_logs_metadata_object" CHECK (jsonb_typeof("staff_audit_logs"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "staff_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"role" "staff_role" NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitations_email_normalized" CHECK ("staff_invitations"."email" = lower(btrim("staff_invitations"."email"))),
	CONSTRAINT "staff_invitations_token_hash_length" CHECK (octet_length("staff_invitations"."token_hash") = 32),
	CONSTRAINT "staff_invitations_expiry_after_creation" CHECK ("staff_invitations"."expires_at" > "staff_invitations"."created_at"),
	CONSTRAINT "staff_invitations_terminal_state" CHECK ("staff_invitations"."accepted_at" IS NULL OR "staff_invitations"."revoked_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(50) NOT NULL,
	"department" varchar(100),
	"job_title" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_role_assignments" (
	"user_id" uuid NOT NULL,
	"role" "staff_role" NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_user_id" uuid,
	CONSTRAINT "staff_role_assignments_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_sessions_token_hash_length" CHECK (octet_length("staff_sessions"."token_hash") = 32),
	CONSTRAINT "staff_sessions_expiry_after_creation" CHECK ("staff_sessions"."expires_at" > "staff_sessions"."created_at"),
	CONSTRAINT "staff_sessions_seen_after_creation" CHECK ("staff_sessions"."last_seen_at" >= "staff_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"status" "staff_account_status" DEFAULT 'active' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_normalized" CHECK ("staff_users"."email" = lower(btrim("staff_users"."email"))),
	CONSTRAINT "staff_users_failed_login_nonnegative" CHECK ("staff_users"."failed_login_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "staff_audit_logs" ADD CONSTRAINT "staff_audit_logs_actor_user_id_staff_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_user_id_staff_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_role_assignments" ADD CONSTRAINT "staff_role_assignments_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_role_assignments" ADD CONSTRAINT "staff_role_assignments_assigned_by_user_id_staff_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_audit_logs_actor_occurred_idx" ON "staff_audit_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "staff_audit_logs_target_occurred_idx" ON "staff_audit_logs" USING btree ("target_type","target_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_token_hash_uidx" ON "staff_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_invitations_email_created_idx" ON "staff_invitations" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "staff_role_assignments_role_idx" ON "staff_role_assignments" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_sessions_token_hash_uidx" ON "staff_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_sessions_user_expires_idx" ON "staff_sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_email_uidx" ON "staff_users" USING btree ("email");
