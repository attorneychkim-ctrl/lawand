CREATE TABLE "staff_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_key" varchar(50) NOT NULL,
	"region_key" varchar(50) NOT NULL,
	"department" varchar(100) NOT NULL,
	"job_title" varchar(100) NOT NULL,
	"role" "staff_role" NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "staff_organizations" (
	"key" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_regions" (
	"key" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DELETE FROM "staff_invitations";--> statement-breakpoint
INSERT INTO "staff_organizations" ("key", "name")
VALUES ('lawand', '법무법인 로앤'), ('legalflow', '리걸플로');--> statement-breakpoint
INSERT INTO "staff_regions" ("key", "name")
VALUES ('seoul', '서울'), ('daejeon', '대전'), ('busan', '부산');--> statement-breakpoint
ALTER TABLE "staff_role_assignments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "staff_role_assignments" CASCADE;--> statement-breakpoint
ALTER TABLE "staff_invitations" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "staff_memberships" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."staff_role";--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('admin', 'full_time', 'part_time', 'separate_accounting', 'civil_complaint_vendor');--> statement-breakpoint
ALTER TABLE "staff_invitations" ALTER COLUMN "role" SET DATA TYPE "public"."staff_role" USING "role"::"public"."staff_role";--> statement-breakpoint
ALTER TABLE "staff_memberships" ALTER COLUMN "role" SET DATA TYPE "public"."staff_role" USING "role"::"public"."staff_role";--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD COLUMN "display_name" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD COLUMN "organization_key" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD COLUMN "region_key" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD COLUMN "department" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD COLUMN "job_title" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_organization_key_staff_organizations_key_fk" FOREIGN KEY ("organization_key") REFERENCES "public"."staff_organizations"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_region_key_staff_regions_key_fk" FOREIGN KEY ("region_key") REFERENCES "public"."staff_regions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_assigned_by_user_id_staff_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_memberships_user_org_region_uidx" ON "staff_memberships" USING btree ("user_id","organization_key","region_key");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_memberships_primary_user_uidx" ON "staff_memberships" USING btree ("user_id") WHERE "staff_memberships"."is_primary" = true AND "staff_memberships"."is_active" = true;--> statement-breakpoint
CREATE INDEX "staff_memberships_role_idx" ON "staff_memberships" USING btree ("role");--> statement-breakpoint
CREATE INDEX "staff_memberships_org_region_idx" ON "staff_memberships" USING btree ("organization_key","region_key");--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_organization_key_staff_organizations_key_fk" FOREIGN KEY ("organization_key") REFERENCES "public"."staff_organizations"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_region_key_staff_regions_key_fk" FOREIGN KEY ("region_key") REFERENCES "public"."staff_regions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" DROP COLUMN "department";--> statement-breakpoint
ALTER TABLE "staff_profiles" DROP COLUMN "job_title";
