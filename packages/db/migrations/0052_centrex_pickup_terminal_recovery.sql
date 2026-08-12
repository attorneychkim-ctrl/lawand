-- 다른 endpoint의 CHANNEL_LIST가 활성 외부 수신 root의 exact provider root를 가리키고,
-- 그 target endpoint에서 adjacent channel의 종료까지 관측됐으며 호전환 시도가 전혀 없는
-- 경우만 당겨받기로 복구한다. 시간 근접이나 HCAUSE만으로는 후보를 만들지 않는다.
CREATE TEMP TABLE centrex_call_pickup_evidence ON COMMIT DROP AS
WITH raw_candidates AS (
  SELECT
    observation.id AS channels_observation_id,
    root.id AS root_id,
    source_leg.id AS source_leg_id,
    source_leg.endpoint_id AS source_endpoint_id,
    observation.endpoint_id AS target_endpoint_id,
    observation.bridge_id AS target_bridge_id,
    observation.provider_call_id AS provider_root_id,
    observation.related_provider_call_id AS provider_channel_id,
    observation.occurred_at AS connected_at,
    observation.received_at AS channels_received_at,
    ended_observation.id AS ended_observation_id,
    ended_observation.provider_end_cause,
    ended_observation.occurred_at AS ended_at,
    ended_observation.received_at AS ended_received_at,
    target_owner.staff_user_id,
    row_number() OVER (
      PARTITION BY root.id, observation.endpoint_id
      ORDER BY observation.occurred_at, observation.id
    ) AS candidate_order
  FROM telephony_call_observations AS observation
  INNER JOIN telephony_call_provider_identifiers AS identifier
    ON identifier.role = 'root'
    AND identifier.provider_value = observation.provider_call_id
  INNER JOIN telephony_call_roots AS root
    ON root.id = identifier.root_id
  INNER JOIN telephony_call_legs AS source_leg
    ON source_leg.id = identifier.leg_id
    AND source_leg.root_id = root.id
  INNER JOIN LATERAL (
    SELECT ended.id, ended.provider_end_cause, ended.occurred_at, ended.received_at
    FROM telephony_call_observations AS ended
    WHERE ended.endpoint_id = observation.endpoint_id
      AND ended.observation_type = 'ended'
      AND ended.provider_call_id = observation.related_provider_call_id
      AND ended.provider_end_cause IS NOT NULL
      AND ended.occurred_at >= observation.occurred_at
      AND ended.occurred_at <= observation.occurred_at + interval '12 hours'
    ORDER BY ended.occurred_at, ended.id
    LIMIT 1
  ) AS ended_observation ON true
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN count(*) = 1 THEN min(binding.staff_user_id::text)::uuid
      ELSE NULL
    END AS staff_user_id
    FROM staff_telephony_bindings AS binding
    WHERE binding.endpoint_id = observation.endpoint_id
      AND binding.is_active = true
  ) AS target_owner ON true
  WHERE observation.observation_type = 'channels'
    AND observation.root_id IS NULL
    AND observation.leg_id IS NULL
    AND observation.related_provider_call_id IS NOT NULL
    AND observation.endpoint_id <> source_leg.endpoint_id
    AND root.scope = 'external'
    AND root.direction = 'inbound'
    AND source_leg.kind = 'customer'
    AND source_leg.direction = 'inbound'
    AND observation.occurred_at >= root.started_at
    AND observation.occurred_at <= root.started_at + interval '12 hours'
    AND (source_leg.ended_at IS NULL OR source_leg.ended_at >= observation.occurred_at)
    AND (
      SELECT count(DISTINCT matching_identifier.root_id)
      FROM telephony_call_provider_identifiers AS matching_identifier
      WHERE matching_identifier.role = 'root'
        AND matching_identifier.provider_value = observation.provider_call_id
    ) = 1
    AND NOT EXISTS (
      SELECT 1
      FROM telephony_call_legs AS target_leg
      WHERE target_leg.root_id = root.id
        AND target_leg.endpoint_id = observation.endpoint_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM telephony_call_relations AS relation
      WHERE relation.root_id = root.id
        AND relation.relation_type IN (
          'transfer_attempted',
          'transfer_completed',
          'transfer_returned',
          'transfer_unresolved'
        )
    )
)
SELECT gen_random_uuid() AS target_leg_id, raw_candidates.*
FROM raw_candidates
WHERE candidate_order = 1;--> statement-breakpoint

INSERT INTO telephony_call_legs (
  id, root_id, endpoint_id, staff_user_id, bridge_id, kind, direction, state,
  remote_party_kind, remote_extension, provider_call_id, provider_channel_id,
  provider_end_cause, correlation_status, started_at, connected_at, ended_at,
  last_event_at, created_at, updated_at
)
SELECT
  evidence.target_leg_id,
  evidence.root_id,
  evidence.target_endpoint_id,
  evidence.staff_user_id,
  evidence.target_bridge_id,
  'customer'::telephony_call_leg_kind,
  'inbound'::telephony_call_direction,
  'ended'::telephony_call_leg_state,
  'external'::telephony_call_party_kind,
  NULL,
  evidence.provider_root_id,
  evidence.provider_channel_id,
  evidence.provider_end_cause,
  'confirmed'::telephony_call_correlation_status,
  evidence.connected_at,
  evidence.connected_at,
  evidence.ended_at,
  evidence.ended_at,
  evidence.channels_received_at,
  evidence.ended_received_at
FROM centrex_call_pickup_evidence AS evidence
ON CONFLICT (endpoint_id, provider_call_id) DO NOTHING;--> statement-breakpoint

UPDATE telephony_call_legs AS source_leg
SET
  state = 'ended'::telephony_call_leg_state,
  ended_at = GREATEST(source_leg.started_at, evidence.connected_at),
  provider_end_cause = 'CALL_PICKED_UP',
  last_event_at = GREATEST(source_leg.last_event_at, evidence.connected_at),
  updated_at = GREATEST(source_leg.updated_at, evidence.channels_received_at)
FROM centrex_call_pickup_evidence AS evidence
WHERE source_leg.id = evidence.source_leg_id;--> statement-breakpoint

INSERT INTO telephony_call_provider_identifiers (
  id, root_id, leg_id, endpoint_id, provider, role, provider_value,
  first_observed_at, last_observed_at, created_at
)
SELECT
  gen_random_uuid(), evidence.root_id, evidence.target_leg_id,
  evidence.target_endpoint_id, 'centrex', 'root', evidence.provider_root_id,
  evidence.connected_at, evidence.ended_at, evidence.channels_received_at
FROM centrex_call_pickup_evidence AS evidence
INNER JOIN telephony_call_legs AS target_leg
  ON target_leg.id = evidence.target_leg_id
ON CONFLICT (endpoint_id, role, provider_value) DO NOTHING;--> statement-breakpoint

INSERT INTO telephony_call_provider_identifiers (
  id, root_id, leg_id, endpoint_id, provider, role, provider_value,
  first_observed_at, last_observed_at, created_at
)
SELECT
  gen_random_uuid(), evidence.root_id, evidence.target_leg_id,
  evidence.target_endpoint_id, 'centrex', 'channel', evidence.provider_channel_id,
  evidence.connected_at, evidence.ended_at, evidence.channels_received_at
FROM centrex_call_pickup_evidence AS evidence
INNER JOIN telephony_call_legs AS target_leg
  ON target_leg.id = evidence.target_leg_id
ON CONFLICT (endpoint_id, role, provider_value) DO NOTHING;--> statement-breakpoint

UPDATE telephony_call_observations AS observation
SET
  root_id = evidence.root_id,
  leg_id = evidence.target_leg_id,
  correlation_status = 'confirmed'::telephony_call_correlation_status
FROM centrex_call_pickup_evidence AS evidence
INNER JOIN telephony_call_legs AS target_leg
  ON target_leg.id = evidence.target_leg_id
WHERE observation.id IN (
  evidence.channels_observation_id,
  evidence.ended_observation_id
);--> statement-breakpoint

INSERT INTO telephony_call_relations (
  id, root_id, from_leg_id, to_leg_id, relation_type, correlation_status,
  correlation_key, evidence, occurred_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  evidence.root_id,
  evidence.source_leg_id,
  evidence.target_leg_id,
  'call_picked_up'::telephony_call_relation_type,
  'confirmed'::telephony_call_correlation_status,
  'pickup:' || evidence.root_id::text || ':' || evidence.target_endpoint_id::text,
  jsonb_build_object(
    'sameProviderRoot', true,
    'providerRootToAdjacentChannel', true,
    'sourceAndTargetEndpointsDiffer', true,
    'targetEndObserved', true,
    'noTransferAttempt', true,
    'recoveredByMigration', '0052'
  ),
  evidence.connected_at,
  evidence.channels_received_at,
  evidence.ended_received_at
FROM centrex_call_pickup_evidence AS evidence
INNER JOIN telephony_call_legs AS target_leg
  ON target_leg.id = evidence.target_leg_id
ON CONFLICT (correlation_key) DO NOTHING;--> statement-breakpoint

UPDATE telephony_call_roots AS root
SET
  state = 'ended'::telephony_call_root_state,
  correlation_status = 'confirmed'::telephony_call_correlation_status,
  current_endpoint_id = evidence.target_endpoint_id,
  final_endpoint_id = evidence.target_endpoint_id,
  final_staff_user_id = evidence.staff_user_id,
  connected_at = CASE
    WHEN root.connected_at IS NULL THEN evidence.connected_at
    ELSE LEAST(root.connected_at, evidence.connected_at)
  END,
  ended_at = GREATEST(root.started_at, evidence.ended_at),
  last_event_at = GREATEST(root.last_event_at, evidence.ended_at),
  updated_at = GREATEST(root.updated_at, evidence.ended_received_at)
FROM centrex_call_pickup_evidence AS evidence
INNER JOIN telephony_call_legs AS target_leg
  ON target_leg.id = evidence.target_leg_id
WHERE root.id = evidence.root_id;--> statement-breakpoint

-- attended transfer의 A/B 상담 leg는 서로 다른 endpoint에 복제되지만 같은 provider
-- root/channel을 가진다. 한쪽의 exact 종료를 다른 쪽 terminal state에도 동기화한다.
CREATE TEMP TABLE centrex_mirrored_consultation_end_evidence ON COMMIT DROP AS
SELECT DISTINCT ON (active_leg.id)
  active_leg.id AS active_leg_id,
  ended_leg.ended_at,
  ended_leg.provider_end_cause,
  ended_leg.last_event_at,
  ended_leg.updated_at
FROM telephony_call_legs AS active_leg
INNER JOIN telephony_call_legs AS ended_leg
  ON ended_leg.root_id = active_leg.root_id
  AND ended_leg.id <> active_leg.id
  AND ended_leg.kind = 'consultation'
  AND ended_leg.state = 'ended'
  AND ended_leg.provider_call_id = active_leg.provider_call_id
  AND ended_leg.provider_channel_id IS NOT DISTINCT FROM active_leg.provider_channel_id
WHERE active_leg.kind = 'consultation'
  AND active_leg.state IN ('ringing', 'connected')
  AND ended_leg.ended_at IS NOT NULL
  AND ended_leg.provider_end_cause IS NOT NULL
ORDER BY active_leg.id, ended_leg.ended_at, ended_leg.id;--> statement-breakpoint

UPDATE telephony_call_legs AS active_leg
SET
  state = 'ended'::telephony_call_leg_state,
  ended_at = GREATEST(active_leg.started_at, evidence.ended_at),
  provider_end_cause = evidence.provider_end_cause,
  last_event_at = GREATEST(active_leg.last_event_at, evidence.last_event_at),
  updated_at = GREATEST(active_leg.updated_at, evidence.updated_at)
FROM centrex_mirrored_consultation_end_evidence AS evidence
WHERE active_leg.id = evidence.active_leg_id;--> statement-breakpoint

-- 모든 관측 leg가 종료된 확인필요 root는 전화 상태 자체는 종료로 전환한다. 최종 고객
-- 연결자는 추정하지 않고 correlation/final actor는 그대로 두어 ERP의 직원 확인을 요구한다.
WITH terminal_roots AS (
  SELECT
    leg.root_id,
    max(leg.ended_at) AS ended_at,
    max(leg.updated_at) AS updated_at
  FROM telephony_call_legs AS leg
  GROUP BY leg.root_id
  HAVING bool_and(leg.state = 'ended')
    AND max(leg.ended_at) IS NOT NULL
)
UPDATE telephony_call_roots AS root
SET
  state = 'ended'::telephony_call_root_state,
  correlation_status = 'needs_confirmation'::telephony_call_correlation_status,
  ended_at = terminal.ended_at,
  last_event_at = GREATEST(root.last_event_at, terminal.ended_at),
  updated_at = GREATEST(root.updated_at, terminal.updated_at)
FROM terminal_roots AS terminal
WHERE root.scope = 'external'
  AND root.state <> 'ended'
  AND (
    root.state IN ('needs_confirmation', 'transferring')
    OR root.correlation_status = 'needs_confirmation'
  )
  AND terminal.root_id = root.id;
