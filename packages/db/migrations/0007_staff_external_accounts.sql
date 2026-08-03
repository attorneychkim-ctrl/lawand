CREATE TABLE "staff_external_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(50) NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"external_account_id" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_external_accounts_provider_allowed" CHECK ("staff_external_accounts"."provider" IN ('legalfriends')),
	CONSTRAINT "staff_external_accounts_external_id_nonempty" CHECK (length(btrim("staff_external_accounts"."external_account_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "staff_external_accounts" ADD CONSTRAINT "staff_external_accounts_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_external_accounts_provider_staff_uidx" ON "staff_external_accounts" USING btree ("provider","staff_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_external_accounts_provider_external_uidx" ON "staff_external_accounts" USING btree ("provider","external_account_id");
