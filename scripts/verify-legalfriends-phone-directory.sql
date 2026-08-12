WITH member_rows AS (
  SELECT
    idx,
    update_dt,
    md5(jsonb_build_array(
      idx,
      type,
      member_id,
      name,
      position,
      "Office_idx",
      to_char(create_dt, 'YYYY-MM-DD HH24:MI:SS'),
      to_char(update_dt, 'YYYY-MM-DD HH24:MI:SS')
    )::text) AS digest
  FROM "CB"."TblMember"
), case_rows AS (
  SELECT
    idx,
    update_dt,
    md5(jsonb_build_array(
      idx,
      case_type,
      case_category,
      case_state,
      max_state,
      is_close,
      is_repeal,
      "Office_idx",
      "Member_idx",
      sub_member_idx,
      sub_member2_idx,
      "Court_idx",
      court_name,
      case_number,
      case_name,
      del_flag,
      to_char(create_dt, 'YYYY-MM-DD HH24:MI:SS'),
      to_char(update_dt, 'YYYY-MM-DD HH24:MI:SS')
    )::text) AS digest
  FROM "CB"."TblCase"
), client_rows AS (
  SELECT
    idx,
    update_dt,
    md5(jsonb_build_array(
      idx,
      "Case_idx",
      name,
      phone,
      living_place,
      name_search,
      phone_search,
      to_char(create_dt, 'YYYY-MM-DD HH24:MI:SS'),
      to_char(update_dt, 'YYYY-MM-DD HH24:MI:SS')
    )::text) AS digest
  FROM "CB"."TblCSClient"
), summaries AS (
  SELECT
    'TblMember' AS table_name,
    COUNT(*)::text AS row_count,
    MIN(idx)::text AS min_idx,
    MAX(idx)::text AS max_idx,
    to_char(MAX(update_dt), 'YYYY-MM-DD HH24:MI:SS') AS max_update_dt,
    bit_xor((('x' || substring(digest FROM 1 FOR 15))::bit(60))::bigint)::text AS digest_a,
    bit_xor((('x' || substring(digest FROM 16 FOR 15))::bit(60))::bigint)::text AS digest_b
  FROM member_rows
  UNION ALL
  SELECT
    'TblCase',
    COUNT(*)::text,
    MIN(idx)::text,
    MAX(idx)::text,
    to_char(MAX(update_dt), 'YYYY-MM-DD HH24:MI:SS'),
    bit_xor((('x' || substring(digest FROM 1 FOR 15))::bit(60))::bigint)::text,
    bit_xor((('x' || substring(digest FROM 16 FOR 15))::bit(60))::bigint)::text
  FROM case_rows
  UNION ALL
  SELECT
    'TblCSClient',
    COUNT(*)::text,
    MIN(idx)::text,
    MAX(idx)::text,
    to_char(MAX(update_dt), 'YYYY-MM-DD HH24:MI:SS'),
    bit_xor((('x' || substring(digest FROM 1 FOR 15))::bit(60))::bigint)::text,
    bit_xor((('x' || substring(digest FROM 16 FOR 15))::bit(60))::bigint)::text
  FROM client_rows
)
SELECT jsonb_agg(
  jsonb_build_object(
    'table', table_name,
    'rows', row_count,
    'minIdx', min_idx,
    'maxIdx', max_idx,
    'maxUpdateDt', max_update_dt,
    'digestA', digest_a,
    'digestB', digest_b
  ) ORDER BY table_name
)::text
FROM summaries;
