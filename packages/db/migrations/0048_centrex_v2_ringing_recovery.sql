-- bridge v0.8.0의 inbound call.ringing JSON에서 incomingLineNumber가 빠져
-- v2 원장을 만들지 못한 동안에도, 병행 v1 원장은 정상 보존됐다. 먼저 이미 존재하는
-- v2 leg를 연결하고, 남은 v1 통화만 동일 UUID의 external root로 멱등 승격한다.
--
-- 같은 결함 이벤트가 1분 동안 FIFO 선두를 막은 경우 U+ 종료 이력이 먼저 root를 만들고,
-- 늦은 v1 ringing이 별도 legacy 통화를 만들었다. 회선·고객 지문·시작 2초·종료 3초가 모두
-- 일치하고 양쪽 후보가 각각 하나뿐인 종료 통화만 같은 통화로 확정한다. 후처리가 양쪽에
-- 있으면 분류·상담·확정자가 같고 메모·재통화가 없는 중복만 하나로 접는다.
CREATE TEMP TABLE centrex_v2_delayed_ring_duplicates ON COMMIT DROP AS
WITH candidate_pairs AS (
  SELECT
    canonical.id AS canonical_id,
    canonical.call_root_id AS canonical_root_id,
    canonical.call_leg_id AS canonical_leg_id,
    canonical.endpoint_id,
    duplicate.id AS duplicate_id,
    duplicate.bridge_id AS duplicate_bridge_id,
    duplicate.provider_call_id AS duplicate_provider_call_id,
    duplicate.ringing_at AS duplicate_ringing_at,
    duplicate.last_event_at AS duplicate_last_event_at,
    duplicate.created_at AS duplicate_created_at,
    duplicate.updated_at AS duplicate_updated_at,
    count(*) OVER (PARTITION BY canonical.id) AS canonical_match_count,
    count(*) OVER (PARTITION BY duplicate.id) AS duplicate_match_count
  FROM telephony_inbound_calls AS canonical
  INNER JOIN telephony_inbound_calls AS duplicate
    ON duplicate.id <> canonical.id
    AND duplicate.endpoint_id = canonical.endpoint_id
    AND duplicate.direction = canonical.direction
    AND duplicate.remote_phone_fingerprint = canonical.remote_phone_fingerprint
    AND duplicate.incoming_line_last4 = canonical.incoming_line_last4
    AND abs(extract(epoch FROM duplicate.ringing_at - canonical.ringing_at)) <= 2
    AND abs(extract(epoch FROM duplicate.ended_at - canonical.ended_at)) <= 3
  WHERE canonical.direction = 'inbound'
    AND canonical.state = 'ended'
    AND duplicate.state = 'ended'
    AND canonical.bridge_id IN ('uplus-ring-callback', 'uplus-inbound-history')
    AND duplicate.bridge_id NOT IN (
      'uplus-ring-callback',
      'uplus-inbound-history',
      'centrex-observation-timeout'
    )
    AND canonical.call_root_id IS NOT NULL
    AND canonical.call_leg_id IS NOT NULL
    AND duplicate.call_root_id IS NULL
    AND duplicate.call_leg_id IS NULL
    AND canonical.ended_at IS NOT NULL
    AND duplicate.ended_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM telephony_inbound_commands AS command
      WHERE command.inbound_call_id = duplicate.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM telephony_call_observation_links AS link
      WHERE link.observed_call_id = duplicate.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM telephony_call_aftercare AS duplicate_aftercare
      INNER JOIN telephony_call_aftercare AS canonical_aftercare
        ON canonical_aftercare.call_root_id = canonical.call_root_id
      WHERE duplicate_aftercare.observed_call_id = duplicate.id
        AND (
          duplicate_aftercare.result <> canonical_aftercare.result
          OR duplicate_aftercare.consultation_id IS DISTINCT FROM canonical_aftercare.consultation_id
          OR duplicate_aftercare.confirmed_by_user_id <> canonical_aftercare.confirmed_by_user_id
          OR duplicate_aftercare.other_text_ciphertext IS NOT NULL
          OR duplicate_aftercare.memo_ciphertext IS NOT NULL
          OR canonical_aftercare.other_text_ciphertext IS NOT NULL
          OR canonical_aftercare.memo_ciphertext IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM telephony_follow_up_tasks AS follow_up
            WHERE follow_up.aftercare_id = duplicate_aftercare.id
          )
        )
    )
)
SELECT
  canonical_id,
  canonical_root_id,
  canonical_leg_id,
  endpoint_id,
  duplicate_id,
  duplicate_bridge_id,
  duplicate_provider_call_id,
  duplicate_ringing_at,
  duplicate_last_event_at,
  duplicate_created_at,
  duplicate_updated_at
FROM candidate_pairs
WHERE canonical_match_count = 1
  AND duplicate_match_count = 1;--> statement-breakpoint

DELETE FROM telephony_call_aftercare AS duplicate_aftercare
USING
  centrex_v2_delayed_ring_duplicates AS recovered,
  telephony_call_aftercare AS canonical_aftercare
WHERE duplicate_aftercare.observed_call_id = recovered.duplicate_id
  AND canonical_aftercare.call_root_id = recovered.canonical_root_id
  AND duplicate_aftercare.result = canonical_aftercare.result
  AND duplicate_aftercare.consultation_id IS NOT DISTINCT FROM canonical_aftercare.consultation_id
  AND duplicate_aftercare.confirmed_by_user_id = canonical_aftercare.confirmed_by_user_id
  AND duplicate_aftercare.other_text_ciphertext IS NULL
  AND duplicate_aftercare.memo_ciphertext IS NULL
  AND canonical_aftercare.other_text_ciphertext IS NULL
  AND canonical_aftercare.memo_ciphertext IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM telephony_follow_up_tasks AS follow_up
    WHERE follow_up.aftercare_id = duplicate_aftercare.id
  );--> statement-breakpoint

UPDATE telephony_call_aftercare AS duplicate_aftercare
SET
  call_root_id = recovered.canonical_root_id,
  observed_call_id = NULL,
  telephony_call_id = NULL
FROM centrex_v2_delayed_ring_duplicates AS recovered
WHERE duplicate_aftercare.observed_call_id = recovered.duplicate_id
  AND NOT EXISTS (
    SELECT 1
    FROM telephony_call_aftercare AS canonical_aftercare
    WHERE canonical_aftercare.call_root_id = recovered.canonical_root_id
  );--> statement-breakpoint

UPDATE telephony_inbound_events AS event
SET inbound_call_id = recovered.canonical_id
FROM centrex_v2_delayed_ring_duplicates AS recovered
WHERE event.inbound_call_id = recovered.duplicate_id;--> statement-breakpoint

INSERT INTO telephony_call_provider_identifiers (
  id, root_id, leg_id, endpoint_id, provider, role, provider_value,
  first_observed_at, last_observed_at, created_at
)
SELECT
  gen_random_uuid(),
  recovered.canonical_root_id,
  recovered.canonical_leg_id,
  recovered.endpoint_id,
  'centrex',
  'root',
  recovered.duplicate_provider_call_id,
  recovered.duplicate_ringing_at,
  recovered.duplicate_last_event_at,
  recovered.duplicate_created_at
FROM centrex_v2_delayed_ring_duplicates AS recovered
ON CONFLICT (endpoint_id, role, provider_value) DO NOTHING;--> statement-breakpoint

DELETE FROM telephony_inbound_calls AS duplicate
USING centrex_v2_delayed_ring_duplicates AS recovered
WHERE duplicate.id = recovered.duplicate_id;--> statement-breakpoint

UPDATE telephony_inbound_calls AS canonical
SET
  bridge_id = recovered.duplicate_bridge_id,
  provider_call_id = recovered.duplicate_provider_call_id,
  ringing_at = LEAST(canonical.ringing_at, recovered.duplicate_ringing_at),
  last_event_at = GREATEST(canonical.last_event_at, recovered.duplicate_last_event_at),
  updated_at = GREATEST(canonical.updated_at, recovered.duplicate_updated_at)
FROM centrex_v2_delayed_ring_duplicates AS recovered
WHERE canonical.id = recovered.canonical_id;--> statement-breakpoint

DROP TABLE centrex_v2_delayed_ring_duplicates;--> statement-breakpoint

UPDATE telephony_inbound_calls AS call
SET
  call_root_id = leg.root_id,
  call_leg_id = leg.id
FROM telephony_call_legs AS leg
WHERE leg.endpoint_id = call.endpoint_id
  AND leg.provider_call_id = call.provider_call_id
  AND (call.call_root_id IS NULL OR call.call_leg_id IS NULL);--> statement-breakpoint

INSERT INTO telephony_call_roots (
  id, provider, scope, direction, state, correlation_status,
  original_endpoint_id, current_endpoint_id, final_endpoint_id, final_staff_user_id,
  remote_phone_ciphertext, remote_phone_nonce, remote_phone_key_version,
  remote_phone_fingerprint, remote_phone_masked, original_line_last4,
  started_at, connected_at, ended_at, last_event_at, created_at, updated_at
)
SELECT
  call.id,
  call.provider,
  'external'::telephony_call_scope,
  call.direction,
  call.state::text::telephony_call_root_state,
  'confirmed'::telephony_call_correlation_status,
  call.endpoint_id,
  call.endpoint_id,
  CASE WHEN call.state = 'ended' THEN call.endpoint_id ELSE NULL END,
  CASE WHEN call.state = 'ended' THEN owner.staff_user_id ELSE NULL END,
  call.remote_phone_ciphertext,
  call.remote_phone_nonce,
  call.remote_phone_key_version,
  call.remote_phone_fingerprint,
  call.remote_phone_masked,
  call.incoming_line_last4,
  call.ringing_at,
  call.connected_at,
  call.ended_at,
  call.last_event_at,
  call.created_at,
  call.updated_at
FROM telephony_inbound_calls AS call
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN count(*) = 1 THEN min(binding.staff_user_id::text)::uuid
    ELSE NULL
  END AS staff_user_id
  FROM staff_telephony_bindings AS binding
  WHERE binding.endpoint_id = call.endpoint_id
    AND binding.is_active = true
) AS owner ON true
WHERE call.call_root_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM telephony_call_legs AS existing_leg
    WHERE existing_leg.endpoint_id = call.endpoint_id
      AND existing_leg.provider_call_id = call.provider_call_id
  )
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

INSERT INTO telephony_call_legs (
  id, root_id, endpoint_id, staff_user_id, bridge_id, kind, direction, state,
  remote_party_kind, remote_extension, provider_call_id, provider_channel_id,
  provider_end_cause, correlation_status, started_at, connected_at, ended_at,
  last_event_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  root.id,
  call.endpoint_id,
  owner.staff_user_id,
  call.bridge_id,
  'customer'::telephony_call_leg_kind,
  call.direction,
  call.state::text::telephony_call_leg_state,
  'external'::telephony_call_party_kind,
  NULL,
  call.provider_call_id,
  channel.provider_channel_id,
  CASE
    WHEN call.state = 'ended' THEN COALESCE(call.provider_end_cause, 'legacy_unknown')
    ELSE NULL
  END,
  'confirmed'::telephony_call_correlation_status,
  call.ringing_at,
  call.connected_at,
  call.ended_at,
  call.last_event_at,
  call.created_at,
  call.updated_at
FROM telephony_inbound_calls AS call
INNER JOIN telephony_call_roots AS root
  ON root.id = COALESCE(call.call_root_id, call.id)
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN count(*) = 1 THEN min(binding.staff_user_id::text)::uuid
    ELSE NULL
  END AS staff_user_id
  FROM staff_telephony_bindings AS binding
  WHERE binding.endpoint_id = call.endpoint_id
    AND binding.is_active = true
) AS owner ON true
LEFT JOIN LATERAL (
  SELECT event.provider_channel_id
  FROM telephony_inbound_events AS event
  WHERE event.inbound_call_id = call.id
    AND event.provider_channel_id IS NOT NULL
  ORDER BY event.occurred_at DESC
  LIMIT 1
) AS channel ON true
WHERE call.call_leg_id IS NULL
ON CONFLICT (endpoint_id, provider_call_id) DO NOTHING;--> statement-breakpoint

UPDATE telephony_inbound_calls AS call
SET
  call_root_id = leg.root_id,
  call_leg_id = leg.id
FROM telephony_call_legs AS leg
WHERE leg.endpoint_id = call.endpoint_id
  AND leg.provider_call_id = call.provider_call_id
  AND (call.call_root_id IS NULL OR call.call_leg_id IS NULL);--> statement-breakpoint

INSERT INTO telephony_call_provider_identifiers (
  id, root_id, leg_id, endpoint_id, provider, role, provider_value,
  first_observed_at, last_observed_at, created_at
)
SELECT
  gen_random_uuid(), leg.root_id, leg.id, leg.endpoint_id, 'centrex', 'root',
  leg.provider_call_id, leg.started_at, leg.last_event_at, leg.created_at
FROM telephony_call_legs AS leg
INNER JOIN telephony_inbound_calls AS call
  ON call.call_leg_id = leg.id
WHERE call.call_root_id = leg.root_id
ON CONFLICT (endpoint_id, role, provider_value) DO NOTHING;--> statement-breakpoint

INSERT INTO telephony_call_provider_identifiers (
  id, root_id, leg_id, endpoint_id, provider, role, provider_value,
  first_observed_at, last_observed_at, created_at
)
SELECT
  gen_random_uuid(), leg.root_id, leg.id, leg.endpoint_id, 'centrex', 'channel',
  leg.provider_channel_id, leg.connected_at, leg.last_event_at, leg.created_at
FROM telephony_call_legs AS leg
INNER JOIN telephony_inbound_calls AS call
  ON call.call_leg_id = leg.id
WHERE call.call_root_id = leg.root_id
  AND leg.provider_channel_id IS NOT NULL
  AND leg.connected_at IS NOT NULL
ON CONFLICT (endpoint_id, role, provider_value) DO NOTHING;--> statement-breakpoint

-- 누락 기간에 legacy 관측 통화로 저장된 후처리도 승격된 동일 UUID root를 단일
-- source로 사용한다. 클릭 명령과의 기존 observation link는 그대로 보존한다.
UPDATE telephony_call_aftercare AS aftercare
SET
  call_root_id = aftercare.observed_call_id,
  observed_call_id = NULL,
  telephony_call_id = NULL
WHERE aftercare.observed_call_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM telephony_call_roots AS root
    WHERE root.id = aftercare.observed_call_id
  );
