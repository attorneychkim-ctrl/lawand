ALTER TABLE "consultations" ADD COLUMN "soft_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "soft_deleted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_soft_deleted_by_user_id_staff_users_id_fk" FOREIGN KEY ("soft_deleted_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultations_soft_deleted_at_idx" ON "consultations" USING btree ("soft_deleted_at");--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_soft_delete_consistent" CHECK (("consultations"."soft_deleted_at" IS NULL AND "consultations"."soft_deleted_by_user_id" IS NULL)
        OR ("consultations"."soft_deleted_at" IS NOT NULL AND "consultations"."soft_deleted_by_user_id" IS NOT NULL AND "consultations"."state" = 'closed'));