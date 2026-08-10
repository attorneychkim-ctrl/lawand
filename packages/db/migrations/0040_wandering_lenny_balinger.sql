CREATE TYPE "public"."telephony_call_target_source" AS ENUM('consultation', 'legal_friends_directory');--> statement-breakpoint
CREATE TABLE "telephony_call_directory_targets" (
	"telephony_call_id" uuid PRIMARY KEY NOT NULL,
	"client_idx" integer NOT NULL,
	"case_idx" integer NOT NULL,
	"client_name_ciphertext" "bytea" NOT NULL,
	"client_name_nonce" "bytea" NOT NULL,
	"client_name_key_version" varchar(50) NOT NULL,
	"phone_ciphertext" "bytea" NOT NULL,
	"phone_nonce" "bytea" NOT NULL,
	"phone_key_version" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_call_directory_targets_ids_positive" CHECK ("telephony_call_directory_targets"."client_idx" > 0 AND "telephony_call_directory_targets"."case_idx" > 0),
	CONSTRAINT "telephony_call_directory_targets_crypto" CHECK (octet_length("telephony_call_directory_targets"."client_name_nonce") = 12
        AND octet_length("telephony_call_directory_targets"."client_name_ciphertext") >= 17
        AND octet_length("telephony_call_directory_targets"."phone_nonce") = 12
        AND octet_length("telephony_call_directory_targets"."phone_ciphertext") >= 17)
);
--> statement-breakpoint
ALTER TABLE "telephony_calls" ALTER COLUMN "consultation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "telephony_calls" ALTER COLUMN "consultation_request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD COLUMN "target_source" "telephony_call_target_source" DEFAULT 'consultation' NOT NULL;--> statement-breakpoint
ALTER TABLE "telephony_call_directory_targets" ADD CONSTRAINT "telephony_call_directory_targets_telephony_call_id_telephony_calls_id_fk" FOREIGN KEY ("telephony_call_id") REFERENCES "public"."telephony_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telephony_call_directory_targets_client_case_idx" ON "telephony_call_directory_targets" USING btree ("client_idx","case_idx");--> statement-breakpoint
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_target_reference" CHECK ((
        "telephony_calls"."target_source" = 'consultation'
        AND "telephony_calls"."consultation_id" IS NOT NULL
        AND "telephony_calls"."consultation_request_id" IS NOT NULL
      ) OR (
        "telephony_calls"."target_source" = 'legal_friends_directory'
        AND "telephony_calls"."consultation_id" IS NULL
        AND "telephony_calls"."consultation_request_id" IS NULL
      ));--> statement-breakpoint
DROP FUNCTION IF EXISTS public.resolve_inbound_phone_directory(text);--> statement-breakpoint
CREATE FUNCTION public.resolve_inbound_phone_directory(
  requested_phone text
)
RETURNS TABLE(
  client_name text,
  case_type smallint,
  case_state smallint,
  is_closed smallint,
  is_repealed smallint,
  primary_staff_name text,
  secondary_staff_name text,
  tertiary_staff_name text,
  court_name text,
  case_created_on text,
  case_updated_on text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH normalized AS (
    SELECT regexp_replace(requested_phone, '[^0-9]', '', 'g') AS phone_search
  )
  SELECT
    client."name"::text AS client_name,
    case_record.case_type,
    case_record.case_state,
    case_record.is_close AS is_closed,
    case_record.is_repeal AS is_repealed,
    primary_member."name"::text AS primary_staff_name,
    secondary_member."name"::text AS secondary_staff_name,
    tertiary_member."name"::text AS tertiary_staff_name,
    case_record.court_name::text AS court_name,
    to_char(case_record.create_dt, 'YYYY-MM-DD') AS case_created_on,
    to_char(case_record.update_dt, 'YYYY-MM-DD') AS case_updated_on
  FROM normalized
  INNER JOIN "CB"."TblCSClient" AS client
    ON client.phone_search = normalized.phone_search
  INNER JOIN "CB"."TblCase" AS case_record
    ON case_record.idx = client."Case_idx"
  LEFT JOIN "CB"."TblMember" AS primary_member
    ON primary_member.idx = case_record."Member_idx"
  LEFT JOIN "CB"."TblMember" AS secondary_member
    ON secondary_member.idx = case_record.sub_member_idx
  LEFT JOIN "CB"."TblMember" AS tertiary_member
    ON tertiary_member.idx = case_record.sub_member2_idx
  WHERE normalized.phone_search ~ '^[0-9]{9,15}$'
    AND COALESCE(case_record.del_flag, 0) <> 1
  ORDER BY case_record.update_dt DESC, case_record.idx DESC
  LIMIT 8
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_inbound_phone_directory(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_inbound_phone_directory(text) TO lawand_app;--> statement-breakpoint
CREATE FUNCTION public.search_legalfriends_client_directory(
  requested_query text,
  requested_limit integer
)
RETURNS TABLE(
  client_idx integer,
  case_idx integer,
  client_name text,
  phone text,
  phone_search text,
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
  case_created_on text,
  case_updated_on text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH normalized AS (
    SELECT
      lower(regexp_replace(btrim(requested_query), '[[:space:]]+', '', 'g')) AS name_query,
      regexp_replace(requested_query, '[^0-9]', '', 'g') AS phone_query,
      btrim(requested_query) ~ '^[0-9() +.-]+$' AS is_phone_query,
      LEAST(GREATEST(COALESCE(requested_limit, 30), 1), 50) AS result_limit
  )
  SELECT
    client.idx AS client_idx,
    case_record.idx AS case_idx,
    client."name"::text AS client_name,
    client.phone::text AS phone,
    client.phone_search::text AS phone_search,
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
    to_char(case_record.create_dt, 'YYYY-MM-DD') AS case_created_on,
    to_char(case_record.update_dt, 'YYYY-MM-DD') AS case_updated_on
  FROM normalized
  INNER JOIN "CB"."TblCSClient" AS client ON true
  INNER JOIN "CB"."TblCase" AS case_record
    ON case_record.idx = client."Case_idx"
  LEFT JOIN "CB"."TblMember" AS primary_member
    ON primary_member.idx = case_record."Member_idx"
  LEFT JOIN "CB"."TblMember" AS secondary_member
    ON secondary_member.idx = case_record.sub_member_idx
  LEFT JOIN "CB"."TblMember" AS tertiary_member
    ON tertiary_member.idx = case_record.sub_member2_idx
  WHERE COALESCE(case_record.del_flag, 0) <> 1
    AND (
      (
        normalized.is_phone_query
        AND length(normalized.phone_query) BETWEEN 4 AND 15
        AND client.phone_search LIKE '%' || normalized.phone_query || '%'
      )
      OR (
        NOT normalized.is_phone_query
        AND length(normalized.name_query) BETWEEN 2 AND 30
        AND lower(
          regexp_replace(
            COALESCE(client.name_search, client."name", ''),
            '[[:space:]]+',
            '',
            'g'
          )
        ) LIKE '%' || normalized.name_query || '%'
      )
    )
  ORDER BY
    CASE
      WHEN normalized.is_phone_query AND client.phone_search = normalized.phone_query THEN 0
      WHEN NOT normalized.is_phone_query AND lower(regexp_replace(COALESCE(client."name", ''), '[[:space:]]+', '', 'g')) = normalized.name_query THEN 0
      ELSE 1
    END,
    case_record.update_dt DESC,
    case_record.idx DESC
  LIMIT (SELECT result_limit FROM normalized)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.search_legalfriends_client_directory(text, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.search_legalfriends_client_directory(text, integer) TO lawand_app;--> statement-breakpoint
CREATE FUNCTION public.resolve_legalfriends_directory_call_target(
  requested_client_idx integer,
  requested_case_idx integer
)
RETURNS TABLE(
  client_name text,
  phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    COALESCE(client."name"::text, '이름 미확인') AS client_name,
    client.phone_search::text AS phone
  FROM "CB"."TblCSClient" AS client
  INNER JOIN "CB"."TblCase" AS case_record
    ON case_record.idx = client."Case_idx"
  WHERE client.idx = requested_client_idx
    AND case_record.idx = requested_case_idx
    AND COALESCE(case_record.del_flag, 0) <> 1
    AND client.phone_search ~ '^[0-9]{9,15}$'
  LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_legalfriends_directory_call_target(integer, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_legalfriends_directory_call_target(integer, integer) TO lawand_app;
