ALTER TABLE "self_diagnosis_case_profiles" ADD COLUMN "residence_type" integer;--> statement-breakpoint
UPDATE "self_diagnosis_case_profiles" SET "residence_type" = 100;--> statement-breakpoint
ALTER TABLE "self_diagnosis_case_profiles" ALTER COLUMN "residence_type" SET NOT NULL;
