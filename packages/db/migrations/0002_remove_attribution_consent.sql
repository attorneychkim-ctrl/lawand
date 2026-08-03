ALTER TABLE "consultation_requests" DROP CONSTRAINT "consultation_requests_attribution_consent_complete";--> statement-breakpoint
ALTER TABLE "consultation_requests" DROP COLUMN "attribution_notice_version";--> statement-breakpoint
ALTER TABLE "consultation_requests" DROP COLUMN "attribution_consent_agreed_at";--> statement-breakpoint
ALTER TABLE "journey_sessions" DROP COLUMN "collection_notice_version";