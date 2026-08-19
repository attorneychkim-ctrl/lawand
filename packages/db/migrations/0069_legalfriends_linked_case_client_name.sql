-- ERP 상담에 저장된 신뢰 가능한 Case_idx로 리걸프렌즈 현재 고객명을 조회한다.
-- 최초 상담 이름 원장은 유지하고 gateway 표시 경계에서만 최신 이름을 우선하기 위한
-- 최소 security-definer 함수다. lawand_app의 CB 테이블 직접 접근 차단은 유지한다.
CREATE FUNCTION public.resolve_linked_legalfriends_case_client(
  requested_case_idx text
)
RETURNS TABLE(
  client_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH normalized AS (
    SELECT CASE
      WHEN btrim(requested_case_idx) ~ '^[1-9][0-9]{0,9}$' THEN
        CASE
          WHEN btrim(requested_case_idx)::numeric <= 2147483647
          THEN btrim(requested_case_idx)::integer
          ELSE NULL
        END
      ELSE NULL
    END AS case_idx
  )
  SELECT client."name"::text AS client_name
  FROM normalized
  INNER JOIN "CB"."TblCase" AS case_record
    ON case_record.idx = normalized.case_idx
  INNER JOIN "CB"."TblCSClient" AS client
    ON client."Case_idx" = case_record.idx
  WHERE NULLIF(btrim(client."name"), '') IS NOT NULL
  LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_linked_legalfriends_case_client(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_linked_legalfriends_case_client(text) TO lawand_app;
