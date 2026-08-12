-- bridge v0.8.0의 inbound call.ringing JSON에서 incomingLineNumber가 빠져
-- v2 원장을 만들지 못한 동안에도, 병행 v1 원장은 정상 보존됐다. 먼저 이미 존재하는
-- v2 leg를 연결하고, 남은 v1 통화만 동일 UUID의 external root로 멱등 승격한다.
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
