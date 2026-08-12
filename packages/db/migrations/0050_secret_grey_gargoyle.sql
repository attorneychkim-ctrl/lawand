CREATE TABLE "consultation_directory_sources" (
	"consultation_id" uuid PRIMARY KEY NOT NULL,
	"consultation_request_id" uuid NOT NULL,
	"directory_client_idx" integer NOT NULL,
	"directory_case_idx" integer NOT NULL,
	"relationship" varchar(20) NOT NULL,
	"snapshot_ciphertext" "bytea" NOT NULL,
	"snapshot_nonce" "bytea" NOT NULL,
	"snapshot_key_version" varchar(50) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_directory_sources_ids_positive" CHECK ("consultation_directory_sources"."directory_client_idx" > 0 AND "consultation_directory_sources"."directory_case_idx" > 0),
	CONSTRAINT "consultation_directory_sources_relationship_allowed" CHECK ("consultation_directory_sources"."relationship" IN ('customer', 'referrer')),
	CONSTRAINT "consultation_directory_sources_crypto" CHECK (octet_length("consultation_directory_sources"."snapshot_nonce") = 12
        AND octet_length("consultation_directory_sources"."snapshot_ciphertext") >= 17)
);
--> statement-breakpoint
ALTER TABLE "consultation_directory_sources" ADD CONSTRAINT "consultation_directory_sources_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_directory_sources" ADD CONSTRAINT "consultation_directory_sources_created_by_user_id_staff_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_directory_sources" ADD CONSTRAINT "consultation_directory_sources_request_consultation_fk" FOREIGN KEY ("consultation_request_id","consultation_id") REFERENCES "public"."consultation_requests"("id","consultation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_directory_sources_request_uidx" ON "consultation_directory_sources" USING btree ("consultation_request_id");--> statement-breakpoint
CREATE INDEX "consultation_directory_sources_client_case_idx" ON "consultation_directory_sources" USING btree ("directory_client_idx","directory_case_idx");--> statement-breakpoint
REVOKE ALL ON TABLE "consultation_directory_sources" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE consultation_directory_sources TO lawand_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawand_viewer') THEN
    EXECUTE 'GRANT SELECT ON TABLE consultation_directory_sources TO lawand_viewer';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "CB"."TblCSClient"
  ADD COLUMN IF NOT EXISTS "living_place" varchar(20);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.search_legalfriends_client_directory(text, integer);--> statement-breakpoint
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
CREATE FUNCTION public.resolve_legalfriends_directory_consultation_source(
  requested_client_idx integer,
  requested_case_idx integer
)
RETURNS TABLE(
  client_name text,
  phone text,
  living_place text,
  case_type smallint,
  case_state smallint,
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
  SELECT
    COALESCE(client."name"::text, '이름 미확인') AS client_name,
    client.phone_search::text AS phone,
    client.living_place::text AS living_place,
    case_record.case_type,
    case_record.case_state,
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
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_legalfriends_directory_consultation_source(integer, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_legalfriends_directory_consultation_source(integer, integer) TO lawand_app;
