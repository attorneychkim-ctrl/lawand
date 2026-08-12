-- 전화번호로 해석된 리걸프렌즈 고객을 전화데스크 후처리와 재통화 큐의 문자·발신
-- 대상으로 다시 검증할 수 있도록 고객 식별자를 함께 반환한다. 삭제 사건 제외와
-- Office_idx=56 동기화 원천 경계는 기존 함수와 동일하게 유지한다.
DROP FUNCTION IF EXISTS public.resolve_inbound_phone_directory(text);--> statement-breakpoint
CREATE FUNCTION public.resolve_inbound_phone_directory(
  requested_phone text
)
RETURNS TABLE(
  client_idx integer,
  client_name text,
  case_idx integer,
  case_number text,
  case_name text,
  case_type smallint,
  case_state smallint,
  is_closed smallint,
  is_repealed smallint,
  primary_staff_name text,
  secondary_staff_name text,
  tertiary_staff_name text,
  primary_member_idx integer,
  secondary_member_idx integer,
  tertiary_member_idx integer,
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
    client.idx AS client_idx,
    client."name"::text AS client_name,
    case_record.idx AS case_idx,
    case_record.case_number::text AS case_number,
    case_record.case_name::text AS case_name,
    case_record.case_type,
    case_record.case_state,
    case_record.is_close AS is_closed,
    case_record.is_repeal AS is_repealed,
    primary_member."name"::text AS primary_staff_name,
    secondary_member."name"::text AS secondary_staff_name,
    tertiary_member."name"::text AS tertiary_staff_name,
    case_record."Member_idx" AS primary_member_idx,
    case_record.sub_member_idx AS secondary_member_idx,
    case_record.sub_member2_idx AS tertiary_member_idx,
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
GRANT EXECUTE ON FUNCTION public.resolve_inbound_phone_directory(text) TO lawand_app;
