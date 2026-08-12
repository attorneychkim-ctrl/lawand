-- Drizzle의 PostgreSQL migrator는 pending 파일 전체를 한 트랜잭션에 적용한다.
-- ALTER TYPE ... ADD VALUE로 추가한 enum은 commit 전에는 다음 migration에서 사용할 수 없으므로,
-- 새 타입으로 원자 교체해 0052의 call_picked_up 데이터 복구도 같은 migrate 실행에서 허용한다.
ALTER TYPE "public"."telephony_aftercare_result" RENAME TO "telephony_aftercare_result_old";--> statement-breakpoint
CREATE TYPE "public"."telephony_aftercare_result" AS ENUM(
	'consultation_completed',
	'reconsultation_required',
	'no_answer',
	'busy',
	'manager_callback_requested',
	'rejected',
	'public_institution',
	'creditor',
	'wrong_number',
	'internal_completed',
	'internal_follow_up',
	'internal_no_answer',
	'other'
);--> statement-breakpoint
ALTER TABLE "public"."telephony_call_aftercare"
	DROP CONSTRAINT "telephony_call_aftercare_other_text_crypto";--> statement-breakpoint
ALTER TABLE "public"."telephony_call_aftercare"
	ALTER COLUMN "result" TYPE "public"."telephony_aftercare_result"
	USING "result"::text::"public"."telephony_aftercare_result";--> statement-breakpoint
ALTER TABLE "public"."telephony_call_aftercare"
	ADD CONSTRAINT "telephony_call_aftercare_other_text_crypto" CHECK (
		(
			"result" = 'other'
			AND "other_text_ciphertext" IS NOT NULL
			AND "other_text_nonce" IS NOT NULL
			AND "other_text_key_version" IS NOT NULL
		) OR (
			"result" <> 'other'
			AND "other_text_ciphertext" IS NULL
			AND "other_text_nonce" IS NULL
			AND "other_text_key_version" IS NULL
		)
	);--> statement-breakpoint
DROP TYPE "public"."telephony_aftercare_result_old";--> statement-breakpoint
ALTER TYPE "public"."telephony_call_relation_type" RENAME TO "telephony_call_relation_type_old";--> statement-breakpoint
CREATE TYPE "public"."telephony_call_relation_type" AS ENUM(
	'transfer_attempted',
	'transfer_completed',
	'transfer_returned',
	'transfer_unresolved',
	'call_picked_up',
	'staff_resolved'
);--> statement-breakpoint
ALTER TABLE "public"."telephony_call_relations"
	ALTER COLUMN "relation_type" TYPE "public"."telephony_call_relation_type"
	USING "relation_type"::text::"public"."telephony_call_relation_type";--> statement-breakpoint
DROP TYPE "public"."telephony_call_relation_type_old";
