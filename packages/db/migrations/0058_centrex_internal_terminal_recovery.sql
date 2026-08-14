-- 일반 내선은 양쪽 endpoint에 같은 provider call root로 leg가 하나씩 생긴다. 한쪽의
-- exact CHANNELOUT만 도착해 terminal cause가 기록된 경우, 같은 internal root/provider의
-- 반대 leg에도 그 종료 근거를 복제한다. 시간 경과만으로는 후보를 만들지 않으므로 상대
-- leg나 종료 cause가 전혀 없는 내선 원장은 변경하지 않는다.
CREATE TEMP TABLE centrex_internal_terminal_evidence ON COMMIT DROP AS
SELECT DISTINCT ON (active_leg.id)
  active_leg.id AS active_leg_id,
  active_leg.root_id,
  ended_leg.endpoint_id AS ending_endpoint_id,
  ended_leg.staff_user_id AS ending_staff_user_id,
  ended_leg.ended_at,
  ended_leg.provider_end_cause,
  ended_leg.last_event_at,
  ended_leg.updated_at
FROM telephony_call_legs AS active_leg
INNER JOIN telephony_call_roots AS root
  ON root.id = active_leg.root_id
  AND root.scope = 'internal'
INNER JOIN telephony_call_legs AS ended_leg
  ON ended_leg.root_id = active_leg.root_id
  AND ended_leg.id <> active_leg.id
  AND ended_leg.kind = 'internal'
  AND ended_leg.state = 'ended'
  AND ended_leg.provider_call_id = active_leg.provider_call_id
WHERE active_leg.kind = 'internal'
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
FROM centrex_internal_terminal_evidence AS evidence
WHERE active_leg.id = evidence.active_leg_id;--> statement-breakpoint

-- 모든 leg가 종료된 root만 닫는다. 최종 통화자는 실제 종료가 관측된 leg를 사용하고,
-- 복제 종료를 만든 반대 leg나 단순 시간 순서로 추정하지 않는다.
WITH terminal_roots AS (
  SELECT
    leg.root_id,
    max(leg.ended_at) AS ended_at,
    max(leg.last_event_at) AS last_event_at,
    max(leg.updated_at) AS updated_at
  FROM telephony_call_legs AS leg
  INNER JOIN centrex_internal_terminal_evidence AS evidence
    ON evidence.root_id = leg.root_id
  GROUP BY leg.root_id
  HAVING bool_and(leg.state = 'ended')
    AND max(leg.ended_at) IS NOT NULL
), final_evidence AS (
  SELECT DISTINCT ON (evidence.root_id)
    evidence.root_id,
    evidence.ending_endpoint_id,
    evidence.ending_staff_user_id
  FROM centrex_internal_terminal_evidence AS evidence
  ORDER BY evidence.root_id, evidence.ended_at DESC, evidence.active_leg_id
)
UPDATE telephony_call_roots AS root
SET
  state = 'ended'::telephony_call_root_state,
  final_endpoint_id = final_evidence.ending_endpoint_id,
  final_staff_user_id = final_evidence.ending_staff_user_id,
  ended_at = GREATEST(root.started_at, terminal.ended_at),
  last_event_at = GREATEST(root.last_event_at, terminal.last_event_at),
  updated_at = GREATEST(root.updated_at, terminal.updated_at)
FROM terminal_roots AS terminal
INNER JOIN final_evidence
  ON final_evidence.root_id = terminal.root_id
WHERE root.id = terminal.root_id
  AND root.scope = 'internal'
  AND root.state <> 'ended';
