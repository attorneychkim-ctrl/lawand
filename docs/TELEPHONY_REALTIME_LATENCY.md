# 전화 실시간 E2E 지연 계측

## 목적

전화 이벤트가 provider에서 발생한 뒤 gateway와 ERP를 거쳐 직원에게 준비되기까지의
시간을 개인정보 없이 측정한다. 전화번호·고객명·직원 ID·회선 ID는 metric이나 구조화
로그에 넣지 않는다.

계측 대상은 다음 전화데스크 변경 이벤트다.

- `observed_call.changed`
- `click_to_call.changed`
- `click_to_call.linked`
- `call_activity.changed`

후처리·재통화 변경은 실시간 통화 지연 표본에서 제외한다.

## 측정 경계

gateway는 인증된 전화 SSE 연결마다 무작위 `deliveryId`와 `gatewaySentAt`만 payload에
추가한다. ERP 브라우저는 여러 탭 중 기존 알림 leader 탭에서만 snapshot을 갱신한다.
전화데스크의 실제 카드가 다음 paint를 기다렸거나 브라우저 Notification 표시 호출이
완료된 뒤, 아래 네 비식별 필드만 same-origin API로 돌려보낸다.

- `deliveryId`
- SSE 수신부터 준비까지의 `clientElapsedMs`
- `callState`
- `displayMode`: `phone_desk`, `notification`, `snapshot`

`deliveryId`는 권한 확인을 통과한 SSE에서만 발급되고 gateway 메모리에서 10분 뒤
만료되며 단계별 상태나 개인정보를 저장하지 않는다. ACK는 내부 API 키, ERP 세션 cookie의
존재와 아직 사용하지 않은 `deliveryId`를 함께 확인한다. ACK마다 세션 DB를 재조회하지 않아
전 직원 브라우저가 통화 한 건을 보고하더라도 DB query fan-out이 생기지 않는다.

gateway는 다음 네 원시 CloudWatch metric을 `Lawand/Gateway` namespace에 1분 단위로
묶어 전송한다. `Values` 원시 표본을 유지하므로 p50·p95 extended statistic을 계산할 수
있다.

| Metric | 의미 |
| --- | --- |
| `TelephonyEventToGatewaySseLatency` | 원천 `occurredAt`부터 gateway SSE write까지 |
| `TelephonyGatewaySseToBrowserReadyLatency` | gateway SSE write부터 ACK가 gateway에 돌아올 때까지 |
| `TelephonyEventToBrowserReadyLatency` | 원천 `occurredAt`부터 ACK가 gateway에 돌아올 때까지 |
| `TelephonyBrowserProcessingLatency` | 브라우저 SSE 수신부터 snapshot·화면/알림 준비까지의 monotonic 시간 |

두 server 기준 metric은 ACK의 돌아오는 네트워크 시간까지 포함하므로 실제 사용자 준비
시간의 보수적인 상한이다. 브라우저 내부 처리시간은 `performance.now()` 차이로 계산해
PC 시계 오차의 영향을 받지 않는다.

공통 dimension은 `Service`, `EventType`, `Direction`, `CallState`, `DisplayMode`다.
개별 event·통화·직원 식별자는 dimension이나 로그에 넣지 않는다.

## 최근 1~2시간 확인

gateway 로그 그룹에서 다음 CloudWatch Logs Insights query를 사용한다.

```text
fields @timestamp, eventType, direction, callState, displayMode,
  samples, eventToGatewayP50Ms, eventToGatewayP95Ms, eventToGatewayMaxMs,
  gatewayToBrowserP50Ms, gatewayToBrowserP95Ms, gatewayToBrowserMaxMs,
  eventToBrowserP50Ms, eventToBrowserP95Ms, eventToBrowserMaxMs,
  browserProcessingP50Ms, browserProcessingP95Ms, browserProcessingMaxMs,
  droppedSamples
| filter event = "telephony_realtime_latency_summary"
| sort @timestamp desc
| limit 200
```

2초 이상 걸린 원천 이벤트의 첫 표본은 별도 구조화 경고로 남는다.

```text
fields @timestamp, eventType, direction, callState, displayMode,
  eventToGatewayMs, gatewayToBrowserMs, eventToBrowserMs, browserProcessingMs
| filter event = "telephony_realtime_latency_slow"
| sort @timestamp desc
| limit 200
```

판단 기준은 다음과 같다.

- `eventToGatewayMs`만 크면 bridge 전달이나 U+ history 발견 구간을 먼저 본다.
- `gatewayToBrowserMs`가 크고 `browserProcessingMs`가 작으면 SSE proxy·네트워크·ACK
  반환 구간을 본다.
- `browserProcessingMs`가 크면 ERP snapshot query, React 반영 또는 첫 Notification
  service worker 준비 구간을 본다.
- `displayMode=snapshot`은 해당 leader 탭에서 전화 카드가 보이지 않고 Notification도
  표시되지 않았지만 최신 snapshot 준비까지는 완료됐다는 뜻이다.

## 운영 반영 확인

이 변경에는 DB migration이 없다. gateway와 ERP를 같은 릴리스로 배포한 뒤 실제 수신과
발신을 각각 한 건씩 관측한다.

1. 전화데스크가 보이는 탭과 알림 권한이 있는 다른 ERP 화면을 준비한다.
2. 수신·발신 이벤트가 전화 카드 또는 Notification으로 표시되는지 확인한다.
3. 1분 뒤 latency summary의 `samples`, p50, p95, max를 확인한다.
4. gateway DB pool waiting, SSE 연결, CloudWatch metric 발행 오류가 없는지 함께 본다.
5. 전화번호·고객명·직원/회선 식별자가 SSE trace, ACK, metric, 구조화 로그에 없는지
   재확인한다.
