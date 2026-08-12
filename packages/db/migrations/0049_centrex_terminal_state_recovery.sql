-- U+ CHANNEL_OUT의 SRCUNIQUEID=NONE은 실제 provider 식별자가 아니라 sentinel이다.
-- 원본 관측 행에는 null로 정규화하고, 상관 인덱스로 잘못 승격된 sentinel을 제거한다.
CREATE TEMP TABLE centrex_sentinel_source_observations ON COMMIT DROP AS
SELECT id
FROM telephony_call_observations
WHERE upper(source_provider_call_id) IN ('0', 'NIL', 'NONE', 'NULL', 'UNKNOWN');--> statement-breakpoint

UPDATE telephony_call_observations
SET source_provider_call_id = NULL
WHERE id IN (SELECT id FROM centrex_sentinel_source_observations);--> statement-breakpoint

DELETE FROM telephony_call_provider_identifiers
WHERE upper(provider_value) IN ('0', 'NIL', 'NONE', 'NULL', 'UNKNOWN');--> statement-breakpoint

-- sentinel만으로 직전 통화에 붙었던 종료 관측은 먼저 연결을 해제한다. 실제 종료 ID 또는
-- source ID가 현재 leg의 root/channel/source 식별자와 exact/sibling 관계인 연결은 보존한다.
UPDATE telephony_call_observations AS observation
SET
  root_id = NULL,
  leg_id = NULL,
  correlation_status = 'needs_confirmation'::telephony_call_correlation_status
WHERE observation.observation_type = 'ended'
  AND observation.id IN (SELECT id FROM centrex_sentinel_source_observations)
  AND observation.root_id IS NOT NULL
  AND observation.leg_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM telephony_call_provider_identifiers AS identifier
    WHERE identifier.endpoint_id = observation.endpoint_id
      AND identifier.root_id = observation.root_id
      AND identifier.leg_id = observation.leg_id
      AND (
        identifier.provider_value = observation.provider_call_id
        OR identifier.provider_value = observation.source_provider_call_id
        OR CASE
          WHEN identifier.provider_value ~ '^[0-9]+\.[0-9]+$'
            AND observation.provider_call_id ~ '^[0-9]+\.[0-9]+$'
            AND split_part(identifier.provider_value, '.', 1) =
              split_part(observation.provider_call_id, '.', 1)
          THEN abs(
            split_part(identifier.provider_value, '.', 2)::numeric -
            split_part(observation.provider_call_id, '.', 2)::numeric
          ) = 1
          ELSE false
        END
        OR CASE
          WHEN observation.source_provider_call_id IS NOT NULL
            AND identifier.provider_value ~ '^[0-9]+\.[0-9]+$'
            AND observation.source_provider_call_id ~ '^[0-9]+\.[0-9]+$'
            AND split_part(identifier.provider_value, '.', 1) =
              split_part(observation.source_provider_call_id, '.', 1)
          THEN abs(
            split_part(identifier.provider_value, '.', 2)::numeric -
            split_part(observation.source_provider_call_id, '.', 2)::numeric
          ) = 1
          ELSE false
        END
      )
  );--> statement-breakpoint

-- 동일 endpoint에서 exact 또는 인접 sequence로 이어지는 종료 관측이 유일한 활성 leg에만
-- 대응할 때 terminal evidence로 확정한다. 시간 근접이나 HCAUSE 값만으로는 연결하지 않는다.
CREATE TEMP TABLE centrex_terminal_sibling_evidence ON COMMIT DROP AS
WITH raw_matches AS (
  SELECT DISTINCT
    observation.id AS observation_id,
    observation.root_id AS previous_root_id,
    observation.leg_id AS previous_leg_id,
    observation.endpoint_id,
    observation.provider_call_id,
    observation.provider_end_cause,
    observation.occurred_at,
    observation.received_at,
    identifier.root_id,
    identifier.leg_id
  FROM telephony_call_observations AS observation
  INNER JOIN telephony_call_provider_identifiers AS identifier
    ON identifier.endpoint_id = observation.endpoint_id
  INNER JOIN telephony_call_roots AS root
    ON root.id = identifier.root_id
  INNER JOIN telephony_call_legs AS leg
    ON leg.id = identifier.leg_id
    AND leg.root_id = root.id
  WHERE observation.observation_type = 'ended'
    AND observation.provider_end_cause IS NOT NULL
    AND root.state <> 'ended'
    AND leg.state <> 'ended'
    AND observation.occurred_at >= leg.started_at
    AND observation.occurred_at <= leg.started_at + interval '12 hours'
    AND (
      identifier.provider_value = observation.provider_call_id
      OR identifier.provider_value = observation.source_provider_call_id
      OR CASE
        WHEN identifier.provider_value ~ '^[0-9]+\.[0-9]+$'
          AND observation.provider_call_id ~ '^[0-9]+\.[0-9]+$'
          AND split_part(identifier.provider_value, '.', 1) =
            split_part(observation.provider_call_id, '.', 1)
        THEN abs(
          split_part(identifier.provider_value, '.', 2)::numeric -
          split_part(observation.provider_call_id, '.', 2)::numeric
        ) = 1
        ELSE false
      END
      OR CASE
        WHEN observation.source_provider_call_id IS NOT NULL
          AND identifier.provider_value ~ '^[0-9]+\.[0-9]+$'
          AND observation.source_provider_call_id ~ '^[0-9]+\.[0-9]+$'
          AND split_part(identifier.provider_value, '.', 1) =
            split_part(observation.source_provider_call_id, '.', 1)
        THEN abs(
          split_part(identifier.provider_value, '.', 2)::numeric -
          split_part(observation.source_provider_call_id, '.', 2)::numeric
        ) = 1
        ELSE false
      END
    )
), counted_matches AS (
  SELECT
    raw_matches.*,
    count(*) OVER (PARTITION BY observation_id) AS observation_match_count,
    count(*) OVER (PARTITION BY leg_id) AS leg_match_count
  FROM raw_matches
)
SELECT *
FROM counted_matches
WHERE observation_match_count = 1
  AND leg_match_count = 1;--> statement-breakpoint

UPDATE telephony_call_observations AS observation
SET
  root_id = evidence.root_id,
  leg_id = evidence.leg_id,
  correlation_status = 'confirmed'::telephony_call_correlation_status
FROM centrex_terminal_sibling_evidence AS evidence
WHERE observation.id = evidence.observation_id;--> statement-breakpoint

UPDATE telephony_call_legs AS leg
SET
  state = 'ended'::telephony_call_leg_state,
  ended_at = GREATEST(leg.started_at, evidence.occurred_at),
  provider_end_cause = evidence.provider_end_cause,
  last_event_at = GREATEST(leg.last_event_at, evidence.occurred_at),
  updated_at = GREATEST(leg.updated_at, evidence.received_at)
FROM centrex_terminal_sibling_evidence AS evidence
WHERE leg.id = evidence.leg_id
  AND leg.root_id = evidence.root_id
  AND leg.state <> 'ended';--> statement-breakpoint

-- 병행 v1 원장은 실제 root/leg와 동일 ID로 연결되어 있으므로 그 terminal state와 시각을
-- 안전망으로 동기화한다. 호전환 root는 다른 활성 leg가 있으면 아래 최종화 대상이 아니다.
UPDATE telephony_call_legs AS leg
SET
  state = call.state::text::telephony_call_leg_state,
  started_at = LEAST(leg.started_at, call.ringing_at),
  connected_at = call.connected_at,
  ended_at = call.ended_at,
  provider_end_cause = CASE
    WHEN call.state = 'ended' THEN COALESCE(call.provider_end_cause, 'legacy_unknown')
    ELSE NULL
  END,
  last_event_at = call.last_event_at,
  updated_at = GREATEST(leg.updated_at, call.updated_at)
FROM telephony_inbound_calls AS call
WHERE call.call_root_id = leg.root_id
  AND call.call_leg_id = leg.id
  AND call.endpoint_id = leg.endpoint_id
  AND call.provider_call_id = leg.provider_call_id
  AND (
    call.state = 'ended'
    OR (call.state = 'connected' AND leg.state = 'ringing')
    OR (call.state = 'ringing' AND leg.state = 'ringing')
  );--> statement-breakpoint

-- 종료 증거가 전혀 없는 ringing은 bridge와 UI가 이미 사용하는 3분 최대 수명으로 명시적
-- timeout 처리한다. connected/transfer leg나 relation이 있는 root에는 적용하지 않는다.
CREATE TEMP TABLE centrex_timed_out_ringing_roots ON COMMIT DROP AS
SELECT
  root.id AS root_id,
  GREATEST(root.started_at, root.last_event_at + interval '3 minutes') AS ended_at
FROM telephony_call_roots AS root
WHERE root.state = 'ringing'
  AND root.last_event_at <= now() - interval '3 minutes'
  AND NOT EXISTS (
    SELECT 1
    FROM telephony_call_legs AS leg
    WHERE leg.root_id = root.id
      AND leg.state <> 'ringing'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM telephony_call_relations AS relation
    WHERE relation.root_id = root.id
  );--> statement-breakpoint

UPDATE telephony_call_legs AS leg
SET
  state = 'ended'::telephony_call_leg_state,
  ended_at = GREATEST(leg.started_at, timed_out.ended_at),
  provider_end_cause = 'BRIDGE_RING_TIMEOUT',
  last_event_at = GREATEST(leg.last_event_at, timed_out.ended_at),
  updated_at = GREATEST(leg.updated_at, timed_out.ended_at)
FROM centrex_timed_out_ringing_roots AS timed_out
WHERE leg.root_id = timed_out.root_id
  AND leg.state = 'ringing';--> statement-breakpoint

-- sibling/v1/timeout으로 모든 leg가 종료된 root만 최종화한다. 하나라도 활성 leg가 있으면
-- 고객 호전환 상태를 보존한다.
WITH ended_roots AS (
  SELECT
    root.id AS root_id,
    max(leg.ended_at) AS ended_at,
    max(leg.last_event_at) AS last_event_at,
    (array_agg(
      leg.endpoint_id
      ORDER BY (leg.kind = 'customer') DESC, leg.ended_at DESC, leg.id
    ))[1] AS final_endpoint_id,
    (array_agg(
      leg.staff_user_id
      ORDER BY (leg.kind = 'customer') DESC, leg.ended_at DESC, leg.id
    ) FILTER (WHERE leg.staff_user_id IS NOT NULL))[1] AS final_staff_user_id
  FROM telephony_call_roots AS root
  INNER JOIN telephony_call_legs AS leg ON leg.root_id = root.id
  WHERE root.state <> 'ended'
  GROUP BY root.id
  HAVING bool_and(leg.state = 'ended')
)
UPDATE telephony_call_roots AS root
SET
  state = 'ended'::telephony_call_root_state,
  final_endpoint_id = ended.final_endpoint_id,
  final_staff_user_id = ended.final_staff_user_id,
  ended_at = GREATEST(root.started_at, ended.ended_at),
  last_event_at = GREATEST(root.started_at, ended.last_event_at),
  updated_at = GREATEST(root.updated_at, ended.last_event_at)
FROM ended_roots AS ended
WHERE root.id = ended.root_id;--> statement-breakpoint

DROP TABLE centrex_terminal_sibling_evidence;--> statement-breakpoint
DROP TABLE centrex_timed_out_ringing_roots;--> statement-breakpoint
DROP TABLE centrex_sentinel_source_observations;--> statement-breakpoint

ALTER TABLE "telephony_call_observations" ADD CONSTRAINT "telephony_call_observations_source_not_sentinel" CHECK ("telephony_call_observations"."source_provider_call_id" IS NULL OR upper("telephony_call_observations"."source_provider_call_id") NOT IN ('0', 'NIL', 'NONE', 'NULL', 'UNKNOWN'));--> statement-breakpoint
ALTER TABLE "telephony_call_provider_identifiers" ADD CONSTRAINT "telephony_call_provider_identifiers_not_sentinel" CHECK (upper("telephony_call_provider_identifiers"."provider_value") NOT IN ('0', 'NIL', 'NONE', 'NULL', 'UNKNOWN'));
