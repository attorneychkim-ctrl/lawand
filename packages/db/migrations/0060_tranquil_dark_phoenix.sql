CREATE TYPE "public"."review_customer_link_source" AS ENUM('invitation', 'exact_phone', 'manual');--> statement-breakpoint
CREATE TYPE "public"."review_request_status" AS ENUM('queued', 'sent', 'failed', 'redeemed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."review_restriction_reason" AS ENUM('privacy', 'unverified', 'abusive_or_manipulated', 'customer_request', 'duplicate', 'other');--> statement-breakpoint
CREATE TABLE "customer_review_link_managers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"link_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"external_member_idx" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_review_link_managers_values_positive" CHECK ("customer_review_link_managers"."external_member_idx" > 0 AND "customer_review_link_managers"."position" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "customer_review_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid,
	"submission_id" uuid,
	"directory_client_idx" integer NOT NULL,
	"directory_case_idx" integer NOT NULL,
	"source" "review_customer_link_source" NOT NULL,
	"linked_by_user_id" uuid,
	"linked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_review_links_subject_present" CHECK ("customer_review_links"."review_id" IS NOT NULL OR "customer_review_links"."submission_id" IS NOT NULL),
	CONSTRAINT "customer_review_links_directory_positive" CHECK ("customer_review_links"."directory_client_idx" > 0 AND "customer_review_links"."directory_case_idx" > 0),
	CONSTRAINT "customer_review_links_actor_consistent" CHECK (("customer_review_links"."source" = 'manual' AND "customer_review_links"."linked_by_user_id" IS NOT NULL)
        OR ("customer_review_links"."source" <> 'manual' AND "customer_review_links"."linked_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "customer_review_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_review_replies_content_length" CHECK (length(btrim("customer_review_replies"."content")) BETWEEN 2 AND 3000)
);
--> statement-breakpoint
CREATE TABLE "customer_review_request_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"body" text NOT NULL,
	"body_byte_length" integer NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_review_request_templates_name_nonempty" CHECK (length(btrim("customer_review_request_templates"."name")) > 0),
	CONSTRAINT "customer_review_request_templates_body_nonempty" CHECK (length(btrim("customer_review_request_templates"."body")) > 0),
	CONSTRAINT "customer_review_request_templates_body_byte_length" CHECK ("customer_review_request_templates"."body_byte_length" BETWEEN 1 AND 500),
	CONSTRAINT "customer_review_request_templates_link_variable" CHECK (position('{{후기작성링크}}' in "customer_review_request_templates"."body") > 0),
	CONSTRAINT "customer_review_request_templates_owner_audit_consistent" CHECK ("customer_review_request_templates"."created_by_user_id" = "customer_review_request_templates"."owner_user_id"
        AND "customer_review_request_templates"."updated_by_user_id" = "customer_review_request_templates"."owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "customer_review_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"directory_client_idx" integer NOT NULL,
	"directory_case_idx" integer NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"telephony_message_id" uuid,
	"status" "review_request_status" DEFAULT 'queued' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_submission_id" uuid,
	"redeemed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error_code" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_review_requests_directory_positive" CHECK ("customer_review_requests"."directory_client_idx" > 0 AND "customer_review_requests"."directory_case_idx" > 0),
	CONSTRAINT "customer_review_requests_expiry_order" CHECK ("customer_review_requests"."expires_at" > "customer_review_requests"."requested_at"),
	CONSTRAINT "customer_review_requests_status_consistent" CHECK ((
        "customer_review_requests"."status" = 'queued'
        AND "customer_review_requests"."telephony_message_id" IS NULL
        AND "customer_review_requests"."sent_at" IS NULL
        AND "customer_review_requests"."redeemed_submission_id" IS NULL
        AND "customer_review_requests"."redeemed_at" IS NULL
        AND "customer_review_requests"."failed_at" IS NULL
        AND "customer_review_requests"."last_error_code" IS NULL
      ) OR (
        "customer_review_requests"."status" = 'sent'
        AND "customer_review_requests"."telephony_message_id" IS NOT NULL
        AND "customer_review_requests"."sent_at" IS NOT NULL
        AND "customer_review_requests"."redeemed_submission_id" IS NULL
        AND "customer_review_requests"."redeemed_at" IS NULL
        AND "customer_review_requests"."failed_at" IS NULL
        AND "customer_review_requests"."last_error_code" IS NULL
      ) OR (
        "customer_review_requests"."status" = 'redeemed'
        AND "customer_review_requests"."telephony_message_id" IS NOT NULL
        AND "customer_review_requests"."sent_at" IS NOT NULL
        AND "customer_review_requests"."redeemed_submission_id" IS NOT NULL
        AND "customer_review_requests"."redeemed_at" IS NOT NULL
        AND "customer_review_requests"."failed_at" IS NULL
        AND "customer_review_requests"."last_error_code" IS NULL
      ) OR (
        "customer_review_requests"."status" = 'failed'
        AND "customer_review_requests"."telephony_message_id" IS NULL
        AND "customer_review_requests"."sent_at" IS NULL
        AND "customer_review_requests"."redeemed_submission_id" IS NULL
        AND "customer_review_requests"."redeemed_at" IS NULL
        AND "customer_review_requests"."failed_at" IS NOT NULL
        AND "customer_review_requests"."last_error_code" IS NOT NULL
      ) OR (
        "customer_review_requests"."status" = 'cancelled'
        AND "customer_review_requests"."redeemed_submission_id" IS NULL
        AND "customer_review_requests"."redeemed_at" IS NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "customer_review_submissions" DROP CONSTRAINT "customer_review_submissions_publication_link";--> statement-breakpoint
ALTER TABLE "customer_reviews" DROP CONSTRAINT "customer_reviews_legacy_id_positive";--> statement-breakpoint
ALTER TABLE "customer_reviews" DROP CONSTRAINT "customer_reviews_source_hash_length";--> statement-breakpoint
ALTER TABLE "customer_reviews" ALTER COLUMN "legacy_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_reviews" ALTER COLUMN "legacy_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_reviews" ALTER COLUMN "source_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_reviews" ALTER COLUMN "import_batch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_review_submissions" ADD COLUMN "moderated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_review_submissions" ADD COLUMN "decision_reason" "review_restriction_reason";--> statement-breakpoint
ALTER TABLE "customer_review_submissions" ADD COLUMN "decision_note" varchar(500);--> statement-breakpoint
ALTER TABLE "customer_reviews" ADD COLUMN "restriction_reason" "review_restriction_reason";--> statement-breakpoint
ALTER TABLE "customer_reviews" ADD COLUMN "restriction_note" varchar(500);--> statement-breakpoint
ALTER TABLE "customer_reviews" ADD COLUMN "restricted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_reviews" ADD COLUMN "restricted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_review_link_managers" ADD CONSTRAINT "customer_review_link_managers_link_id_customer_review_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."customer_review_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_link_managers" ADD CONSTRAINT "customer_review_link_managers_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_links" ADD CONSTRAINT "customer_review_links_review_id_customer_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."customer_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_links" ADD CONSTRAINT "customer_review_links_submission_id_customer_review_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."customer_review_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_links" ADD CONSTRAINT "customer_review_links_linked_by_user_id_staff_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_replies" ADD CONSTRAINT "customer_review_replies_review_id_customer_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."customer_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_replies" ADD CONSTRAINT "customer_review_replies_created_by_user_id_staff_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_replies" ADD CONSTRAINT "customer_review_replies_updated_by_user_id_staff_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_request_templates" ADD CONSTRAINT "customer_review_request_templates_owner_user_id_staff_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_request_templates" ADD CONSTRAINT "customer_review_request_templates_created_by_user_id_staff_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_request_templates" ADD CONSTRAINT "customer_review_request_templates_updated_by_user_id_staff_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_requests" ADD CONSTRAINT "customer_review_requests_requested_by_user_id_staff_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_requests" ADD CONSTRAINT "customer_review_requests_template_id_customer_review_request_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."customer_review_request_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_requests" ADD CONSTRAINT "customer_review_requests_telephony_message_id_telephony_messages_id_fk" FOREIGN KEY ("telephony_message_id") REFERENCES "public"."telephony_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_requests" ADD CONSTRAINT "customer_review_requests_redeemed_submission_id_customer_review_submissions_id_fk" FOREIGN KEY ("redeemed_submission_id") REFERENCES "public"."customer_review_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_link_managers_link_staff_uidx" ON "customer_review_link_managers" USING btree ("link_id","staff_user_id");--> statement-breakpoint
CREATE INDEX "customer_review_link_managers_staff_idx" ON "customer_review_link_managers" USING btree ("staff_user_id","link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_links_review_uidx" ON "customer_review_links" USING btree ("review_id") WHERE "customer_review_links"."review_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_links_submission_uidx" ON "customer_review_links" USING btree ("submission_id") WHERE "customer_review_links"."submission_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customer_review_links_directory_idx" ON "customer_review_links" USING btree ("directory_client_idx","directory_case_idx");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_replies_review_uidx" ON "customer_review_replies" USING btree ("review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_request_templates_owner_name_lower_uidx" ON "customer_review_request_templates" USING btree ("owner_user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_requests_idempotency_uidx" ON "customer_review_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_requests_message_uidx" ON "customer_review_requests" USING btree ("telephony_message_id") WHERE "customer_review_requests"."telephony_message_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_requests_submission_uidx" ON "customer_review_requests" USING btree ("redeemed_submission_id") WHERE "customer_review_requests"."redeemed_submission_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customer_review_requests_target_requested_idx" ON "customer_review_requests" USING btree ("directory_client_idx","directory_case_idx","requested_at");--> statement-breakpoint
CREATE INDEX "customer_review_requests_staff_requested_idx" ON "customer_review_requests" USING btree ("requested_by_user_id","requested_at");--> statement-breakpoint
ALTER TABLE "customer_review_submissions" ADD CONSTRAINT "customer_review_submissions_moderated_by_user_id_staff_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_reviews" ADD CONSTRAINT "customer_reviews_restricted_by_user_id_staff_users_id_fk" FOREIGN KEY ("restricted_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_review_submissions" ADD CONSTRAINT "customer_review_submissions_publication_link" CHECK ((
        "customer_review_submissions"."status" = 'published'
        AND "customer_review_submissions"."moderated_at" IS NOT NULL
        AND "customer_review_submissions"."moderated_by_user_id" IS NOT NULL
        AND "customer_review_submissions"."published_review_id" IS NOT NULL
        AND "customer_review_submissions"."decision_reason" IS NULL
        AND "customer_review_submissions"."decision_note" IS NULL
      ) OR (
        "customer_review_submissions"."status" IN ('rejected', 'withdrawn')
        AND "customer_review_submissions"."moderated_at" IS NOT NULL
        AND "customer_review_submissions"."moderated_by_user_id" IS NOT NULL
        AND "customer_review_submissions"."published_review_id" IS NULL
        AND "customer_review_submissions"."decision_reason" IS NOT NULL
      ) OR (
        "customer_review_submissions"."status" = 'pending_review'
        AND "customer_review_submissions"."moderated_at" IS NULL
        AND "customer_review_submissions"."moderated_by_user_id" IS NULL
        AND "customer_review_submissions"."published_review_id" IS NULL
        AND "customer_review_submissions"."decision_reason" IS NULL
        AND "customer_review_submissions"."decision_note" IS NULL
      ));--> statement-breakpoint
ALTER TABLE "customer_reviews" ADD CONSTRAINT "customer_reviews_source_provenance" CHECK ((
        "customer_reviews"."import_batch_id" IS NOT NULL
        AND "customer_reviews"."legacy_id" IS NOT NULL
        AND "customer_reviews"."legacy_url" IS NOT NULL
        AND "customer_reviews"."source_hash" IS NOT NULL
      ) OR (
        "customer_reviews"."import_batch_id" IS NULL
        AND "customer_reviews"."legacy_id" IS NULL
        AND "customer_reviews"."legacy_content_id" IS NULL
        AND "customer_reviews"."legacy_url" IS NULL
        AND "customer_reviews"."source_hash" IS NULL
      ));--> statement-breakpoint
ALTER TABLE "customer_reviews" ADD CONSTRAINT "customer_reviews_restriction_consistent" CHECK ((
        "customer_reviews"."publication_status" = 'withheld'
        AND (
          (
            "customer_reviews"."import_batch_id" IS NOT NULL
            AND "customer_reviews"."restriction_reason" IS NULL
            AND "customer_reviews"."restriction_note" IS NULL
            AND "customer_reviews"."restricted_at" IS NULL
            AND "customer_reviews"."restricted_by_user_id" IS NULL
          ) OR (
            "customer_reviews"."restriction_reason" IS NOT NULL
            AND "customer_reviews"."restricted_at" IS NOT NULL
            AND "customer_reviews"."restricted_by_user_id" IS NOT NULL
          )
        )
      ) OR (
        "customer_reviews"."publication_status" <> 'withheld'
        AND "customer_reviews"."restriction_reason" IS NULL
        AND "customer_reviews"."restriction_note" IS NULL
        AND "customer_reviews"."restricted_at" IS NULL
        AND "customer_reviews"."restricted_by_user_id" IS NULL
      ));--> statement-breakpoint
ALTER TABLE "customer_reviews" ADD CONSTRAINT "customer_reviews_legacy_id_positive" CHECK ("customer_reviews"."legacy_id" IS NULL OR "customer_reviews"."legacy_id" > 0);--> statement-breakpoint
ALTER TABLE "customer_reviews" ADD CONSTRAINT "customer_reviews_source_hash_length" CHECK ("customer_reviews"."source_hash" IS NULL OR octet_length("customer_reviews"."source_hash") = 32);
--> statement-breakpoint
CREATE FUNCTION public.resolve_review_directory_target(
  requested_client_idx integer,
  requested_case_idx integer
)
RETURNS TABLE(
  client_idx integer,
  case_idx integer,
  client_name text,
  phone text,
  living_place text,
  case_type smallint,
  case_category smallint,
  case_state smallint,
  max_state smallint,
  is_closed smallint,
  is_repealed smallint,
  court_name text,
  case_number text,
  case_name text,
  primary_staff_name text,
  secondary_staff_name text,
  tertiary_staff_name text,
  primary_member_idx integer,
  secondary_member_idx integer,
  tertiary_member_idx integer,
  case_created_on text,
  case_updated_on text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    client.idx AS client_idx,
    case_record.idx AS case_idx,
    COALESCE(client."name"::text, '이름 미확인') AS client_name,
    client.phone_search::text AS phone,
    client.living_place::text AS living_place,
    case_record.case_type,
    case_record.case_category,
    case_record.case_state,
    case_record.max_state,
    case_record.is_close AS is_closed,
    case_record.is_repeal AS is_repealed,
    case_record.court_name::text AS court_name,
    case_record.case_number::text AS case_number,
    case_record.case_name::text AS case_name,
    primary_member."name"::text AS primary_staff_name,
    secondary_member."name"::text AS secondary_staff_name,
    tertiary_member."name"::text AS tertiary_staff_name,
    case_record."Member_idx" AS primary_member_idx,
    case_record.sub_member_idx AS secondary_member_idx,
    case_record.sub_member2_idx AS tertiary_member_idx,
    to_char(case_record.create_dt, 'YYYY-MM-DD') AS case_created_on,
    to_char(case_record.update_dt, 'YYYY-MM-DD') AS case_updated_on
  FROM "CB"."TblCSClient" AS client
  INNER JOIN "CB"."TblCase" AS case_record
    ON case_record.idx = client."Case_idx"
  LEFT JOIN "CB"."TblMember" AS primary_member
    ON primary_member.idx = case_record."Member_idx"
  LEFT JOIN "CB"."TblMember" AS secondary_member
    ON secondary_member.idx = case_record.sub_member_idx
  LEFT JOIN "CB"."TblMember" AS tertiary_member
    ON tertiary_member.idx = case_record.sub_member2_idx
  WHERE client.idx = requested_client_idx
    AND case_record.idx = requested_case_idx
    AND COALESCE(case_record.del_flag, 0) <> 1
  LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_review_directory_target(integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_review_directory_target(integer, integer) TO lawand_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notify_review_link_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_id uuid;
  target_type text;
BEGIN
  target_id := COALESCE(NEW.review_id, NEW.submission_id);
  target_type := CASE WHEN NEW.review_id IS NOT NULL THEN 'review' ELSE 'submission' END;
  PERFORM pg_notify(
    'lawand_review_events',
    json_build_object(
      'eventId', gen_random_uuid(),
      'eventType', CASE
        WHEN TG_OP = 'INSERT' THEN 'review.linked'
        WHEN NEW.directory_client_idx IS DISTINCT FROM OLD.directory_client_idx
          OR NEW.directory_case_idx IS DISTINCT FROM OLD.directory_case_idx
          OR NEW.source IS DISTINCT FROM OLD.source
          OR NEW.linked_by_user_id IS DISTINCT FROM OLD.linked_by_user_id
          THEN 'review.linked'
        ELSE 'review.changed'
      END,
      'recordId', target_id,
      'recordType', target_type,
      'occurredAt', statement_timestamp()
    )::text
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customer_review_links_realtime_notify
AFTER INSERT OR UPDATE ON public.customer_review_links
FOR EACH ROW
EXECUTE FUNCTION public.notify_review_link_realtime_event();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notify_review_record_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_id uuid;
  target_type text;
BEGIN
  IF TG_TABLE_NAME = 'customer_review_replies' THEN
    target_id := NEW.review_id;
    target_type := 'review';
  ELSE
    target_id := NEW.id;
    target_type := CASE
      WHEN TG_TABLE_NAME = 'customer_reviews' THEN 'review'
      ELSE 'submission'
    END;
  END IF;
  PERFORM pg_notify(
    'lawand_review_events',
    json_build_object(
      'eventId', gen_random_uuid(),
      'eventType', 'review.changed',
      'recordId', target_id,
      'recordType', target_type,
      'occurredAt', statement_timestamp()
    )::text
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customer_reviews_realtime_notify
AFTER UPDATE ON public.customer_reviews
FOR EACH ROW
EXECUTE FUNCTION public.notify_review_record_realtime_event();
--> statement-breakpoint
CREATE TRIGGER customer_review_submissions_realtime_notify
AFTER INSERT OR UPDATE ON public.customer_review_submissions
FOR EACH ROW
EXECUTE FUNCTION public.notify_review_record_realtime_event();
--> statement-breakpoint
CREATE TRIGGER customer_review_replies_realtime_notify
AFTER INSERT OR UPDATE ON public.customer_review_replies
FOR EACH ROW
EXECUTE FUNCTION public.notify_review_record_realtime_event();
--> statement-breakpoint
REVOKE ALL ON TABLE
  customer_review_links,
  customer_review_link_managers,
  customer_review_replies,
  customer_review_request_templates,
  customer_review_requests
FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE customer_reviews TO lawand_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE customer_review_submissions TO lawand_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE customer_review_links TO lawand_app';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON TABLE customer_review_link_managers TO lawand_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE customer_review_replies TO lawand_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE customer_review_request_templates TO lawand_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE customer_review_requests TO lawand_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    EXECUTE 'GRANT SELECT ON TABLE customer_reviews, customer_review_submissions, customer_review_links, customer_review_link_managers, customer_review_replies, customer_review_request_templates, customer_review_requests TO lawand_viewer';
  END IF;
END
$$;
