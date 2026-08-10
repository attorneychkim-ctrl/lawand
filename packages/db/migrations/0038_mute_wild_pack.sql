ALTER TABLE "staff_telephony_bridge_assignments" DROP CONSTRAINT "staff_telephony_bridge_assignments_state";--> statement-breakpoint
ALTER TABLE "staff_telephony_bridge_assignments" ALTER COLUMN "staff_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_telephony_bridge_assignments" ADD CONSTRAINT "staff_telephony_bridge_assignments_ownership" CHECK ((
        "staff_telephony_bridge_assignments"."state" = 'idle'
        AND "staff_telephony_bridge_assignments"."staff_user_id" IS NULL
        AND "staff_telephony_bridge_assignments"."current_endpoint_id" IS NULL
      ) OR (
        "staff_telephony_bridge_assignments"."state" <> 'idle'
        AND "staff_telephony_bridge_assignments"."staff_user_id" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "staff_telephony_bridge_assignments" ADD CONSTRAINT "staff_telephony_bridge_assignments_state" CHECK ("staff_telephony_bridge_assignments"."state" IN ('idle', 'assigned', 'provisioning', 'connected', 'failed'));