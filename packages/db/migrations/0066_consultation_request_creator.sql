ALTER TABLE "consultation_requests" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
UPDATE "consultation_requests" AS request
SET "created_by_user_id" = history."actor_id"::uuid
FROM "consultation_status_history" AS history
WHERE request."created_by_user_id" IS NULL
  AND request."source" IN ('erp_staff', 'erp_client_directory', 'erp_phone_desk')
  AND history."consultation_id" = request."consultation_id"
  AND history."actor_type" = 'staff'
  AND history."changed_at" = request."submitted_at"
  AND history."reason" IN (
    'staff_manual_registration',
    'client_directory_referral',
    'client_directory_conversion',
    'phone_desk_conversion'
  )
  AND history."actor_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_created_by_user_id_staff_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
