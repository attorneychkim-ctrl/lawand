ALTER TYPE "public"."consultation_mode" ADD VALUE 'self_diagnosis';--> statement-breakpoint
CREATE TABLE "self_diagnosis_case_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"model_version" varchar(50) NOT NULL,
	"source_office_idx" integer NOT NULL,
	"case_type" integer NOT NULL,
	"court_idx" integer NOT NULL,
	"court_name" varchar(50) NOT NULL,
	"monthly_income" bigint NOT NULL,
	"income_type" integer NOT NULL,
	"marriage_state" integer NOT NULL,
	"minor_child_count" integer NOT NULL,
	"dependent_count" real NOT NULL,
	"total_debt" bigint NOT NULL,
	"liquidation_value" bigint NOT NULL,
	"priority_debt" boolean NOT NULL,
	"monthly_payment" bigint NOT NULL,
	"payment_count" integer NOT NULL,
	"total_payment" bigint NOT NULL,
	"repayment_rate" real NOT NULL,
	"filing_to_prohibition_days" integer,
	"filing_to_commencement_days" integer,
	"filing_to_approval_days" integer,
	"filing_to_bankruptcy_days" integer,
	"filing_to_discharge_days" integer,
	"imported_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "self_diagnosis_profiles_office_56" CHECK ("self_diagnosis_case_profiles"."source_office_idx" = 56),
	CONSTRAINT "self_diagnosis_profiles_case_type" CHECK ("self_diagnosis_case_profiles"."case_type" IN (1, 2)),
	CONSTRAINT "self_diagnosis_profiles_nonnegative" CHECK ("self_diagnosis_case_profiles"."monthly_income" >= 0
        AND "self_diagnosis_case_profiles"."minor_child_count" >= 0
        AND "self_diagnosis_case_profiles"."dependent_count" >= 0
        AND "self_diagnosis_case_profiles"."total_debt" > 0
        AND "self_diagnosis_case_profiles"."liquidation_value" >= 0
        AND "self_diagnosis_case_profiles"."monthly_payment" >= 0
        AND "self_diagnosis_case_profiles"."payment_count" >= 0
        AND "self_diagnosis_case_profiles"."payment_count" <= 60
        AND "self_diagnosis_case_profiles"."total_payment" >= 0
        AND "self_diagnosis_case_profiles"."repayment_rate" >= 0)
);
--> statement-breakpoint
CREATE INDEX "self_diagnosis_profiles_match_idx" ON "self_diagnosis_case_profiles" USING btree ("model_version","case_type","priority_debt","court_idx","income_type");--> statement-breakpoint
CREATE INDEX "self_diagnosis_profiles_financial_idx" ON "self_diagnosis_case_profiles" USING btree ("case_type","monthly_income","total_debt","liquidation_value");