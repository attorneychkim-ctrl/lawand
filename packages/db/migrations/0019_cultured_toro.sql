ALTER TABLE "self_diagnosis_case_profiles" ADD COLUMN "estimated_spend" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "self_diagnosis_case_profiles" ADD COLUMN "living_cost_type" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "self_diagnosis_case_profiles" ADD COLUMN "living_cost_cost" bigint DEFAULT 0 NOT NULL;