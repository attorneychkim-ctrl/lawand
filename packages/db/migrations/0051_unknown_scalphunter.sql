ALTER TYPE "public"."telephony_aftercare_result" ADD VALUE 'internal_completed' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."telephony_aftercare_result" ADD VALUE 'internal_follow_up' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."telephony_aftercare_result" ADD VALUE 'internal_no_answer' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."telephony_call_relation_type" ADD VALUE 'call_picked_up';--> statement-breakpoint
ALTER TYPE "public"."telephony_call_relation_type" ADD VALUE 'staff_resolved';