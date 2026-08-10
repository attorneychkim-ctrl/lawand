-- The gateway may resolve an inbound caller only through this narrow function.
-- It deliberately does not expose the private CB tables themselves to lawand_app.
CREATE OR REPLACE FUNCTION public.resolve_inbound_phone_directory(
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
  tertiary_staff_name text
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
    tertiary_member."name"::text AS tertiary_staff_name
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
  ORDER BY case_record.update_dt DESC, case_record.idx DESC
  LIMIT 8
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_inbound_phone_directory(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_inbound_phone_directory(text) TO lawand_app;
