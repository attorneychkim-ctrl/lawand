# 센트릭스 통합 통화 활동 v2

> 상태: 일반 내선·무조건/통화 후 호전환·실패 복귀 실통화 fixture 수집 완료,
> root/leg·transfer evidence 출시 후보 구현 완료, 통화 후 호전환 final leg 상관은 미해결
>
> 기준일: 2026-08-11
>
> 관련 문서: [`CENTREX_INBOUND_CANARY.md`](./CENTREX_INBOUND_CANARY.md)

## 1. 목표

페이지 상단의 전화 상태를 수신 전용 표시가 아니라 회사의 외부 수·발신을 일관되게 보여주는
`통화 활동 카드`로 확장한다. 동시에 전화가 실제로 필요한 직원에게는 화면 토스트와 브라우저
알림을 보내고, 호전환은 하나의 고객 통화 아래 여러 통화 leg로 보존한다.

이 문서는 제품 동작과 acceptance 기준을 고정한다. 센트릭스 OCX가 내선·호전환에서 보낸
실제 식별자 관계는 운영과 같은 두 내선의 통제 canary로 수집했다. 구현은 아래 fixture와
확정 계약을 먼저 테스트로 고정한 뒤 시작하며, 확인되지 않은 상태를 이벤트 이름·종료 cause·
시간 근접만으로 추정하지 않는다.

## 2. 확정된 표시 정책

### 외부 통화 상단 카드

외부 고객과 연결되는 아래 통화는 로그인한 모든 직원에게 동일한 상단 카드를 표시한다.
카드가 화면을 과도하게 가리지 않도록 접기·복수 통화 요약 UI를 별도로 제공하되, 직원별로
발신 카드를 숨기지는 않는다.

| 종류 | 상단 카드 상태 | 공개 범위 |
| --- | --- | --- |
| 센트릭스 수신 | `수신 중` → `수신 통화 중` → `수신 통화 종료` | 모든 직원 |
| 센트릭스 직접 발신 | `발신 중` → `발신 통화 중` → `발신 통화 종료` | 모든 직원 |
| ERP 클릭투콜 | `발신 준비 중` → `발신 중` → `발신 통화 중` → `발신 통화 종료` | 모든 직원 |

클릭투콜이 단말 호출·제공자 요청 단계에서 실패하면 `발신 실패`를 표시한다. 센트릭스 관측
발신과 클릭투콜 명령이 기존 연결 원장에서 한 통화로 해석되면 카드도 하나만 표시한다.
종료 카드는 일정 시간 뒤 자동으로 사라지되 전화데스크 원장에는 계속 남긴다.

### 일반 내선 통화

일반 내선끼리의 통화는 외부 고객 통화가 아니므로 전 직원 공용 카드에는 올리지 않는다.
발신자와 수신자에게만 `내선 발신 중/내선 수신 중/내선 통화 중/내선 통화 종료`를 표시하고,
내선 수신자에게 화면 토스트와 브라우저 알림을 보낸다.

다만 외부 고객 통화의 호전환 과정에서 생긴 내선 leg는 일반 내선 통화와 분리한다. 이 leg는
외부 고객 통화의 하위 상태로 연결하고 전 직원 공용 고객 통화 카드의 흐름을 유지한다.

## 3. 토스트·브라우저 알림 대상

상단 카드는 회사 전체의 통화 현황이고, 토스트·브라우저 알림은 즉시 대응해야 하는 직원을
깨우는 수단이다. 두 범위를 분리한다.

### 외부 수신

1. 전화번호로 해석된 상담 또는 리걸프렌즈 사건의 현재 담당자 전원에게 알린다.
2. 실제 수신 회선 담당자 전원에게도 알린다.
3. 고객 담당자와 회선 담당자의 합집합에서 중복을 제거한다.
4. 담당자를 한 명도 정확히 해석하지 못하면 활성 직원 전체에게 알린다.
5. 비활성·퇴사·로그인 불가 계정은 알림 대상에서 제외한다.

리걸프렌즈 담당자는 이름으로 연결하지 않는다. 리걸프렌즈 사건의 `Member_idx`와
`sub_member_idx`를 각각 `staff_external_accounts.external_member_idx`와 일치시켜 ERP
직원 ID를 찾는다. 이름은 화면에 보여주는 보조 정보이며, 동명이인·개명·표기 차이에 영향을
받는 권한 또는 알림 라우팅 키로 쓰지 않는다.

정확한 ID 매칭은 기술적으로 가능하다. ERP에는 직원별 리걸프렌즈 `member_idx` 연결이 이미
저장된다. 현재 수신 조회가 담당자 이름만 내리는 부분을 외부 원천의 `Member_idx`까지 보존해
내부 직원 ID로 해석하도록 확장해야 한다.

### 내선과 호전환

- 일반 내선 수신은 수신자에게 상단 개인 상태, 토스트, 브라우저 알림을 모두 보낸다.
- 외부 고객 전화를 전달받는 직원에게는 일반 내선 알림보다 우선하는 `전달된 고객 전화`
  토스트와 브라우저 알림을 보낸다.
- 호전환을 시작한 직원에게는 전달 진행·성공·실패 상태를 표시한다.
- 호전환이 실패해 원래 직원에게 돌아오면 그 직원에게 복귀 알림을 보낸다.

## 4. 알림에 포함할 정보

브라우저 알림 권한이 허용된 내부 ERP 사용자에게는 업무 판단에 필요한 고객정보를 최대한
제공한다.

- 고객명과 전체 전화번호
- 연결된 상담 접수번호 또는 리걸프렌즈 사건번호·사건 종류
- 현재 담당자 전원
- 수신 회선·내선
- 호전환이면 전달한 직원과 전달받는 직원

정보가 아직 해석되지 않았으면 억지로 채우지 않고 `고객 정보 확인 중`처럼 표시한다. 알림
클릭은 인증된 ERP의 해당 전화 상세 또는 연결된 상담 상세로 이동한다.

전화번호·고객정보는 PostgreSQL `NOTIFY`, SSE 이벤트 이름 또는 service-worker push payload에
직접 싣지 않는다. 개인정보 없는 변경 신호를 받은 뒤 인증된 same-origin snapshot에서
복호화·조회한다. 브라우저 알림 자체에는 사용자가 승인한 최종 snapshot 정보를 표시한다.

첫 구현은 ERP 탭이 하나 이상 열려 있을 때의 Notification API를 기준으로 한다. 명시적 권한
요청, 로그인 세션 확인, 여러 탭 중 한 탭만 알리는 leader 선정과 통화 이벤트 ID 기반 중복
방지를 포함한다. 브라우저가 완전히 종료된 상태까지 보장하는 Web Push는 service worker,
subscription 폐기와 잠금화면 운영 정책을 별도 검증한 뒤 다음 단계로 둔다.

## 5. 호전환의 통화 모델

호전환은 기존 행 하나의 주인을 바꾸는 업데이트가 아니다. 하나의 외부 고객 통화 root 아래
센트릭스가 관측한 여러 leg를 연결한다.

```text
외부 고객 통화 root
├─ 외부 고객 ↔ A leg
├─ A ↔ B 호전환 상담 leg(통화 후 호전환인 경우)
└─ 외부 고객 ↔ B leg
```

화면 흐름은 다음과 같다.

1. `수신 중 · A 회선`
2. `수신 통화 중 · A 연결`
3. `호전환 중 · A → B`
4. B에게 `전달된 고객 전화` 토스트·브라우저 알림
5. `수신 통화 중 · B 연결 · A에게서 전달`
6. A leg가 끝나도 고객 통화 root는 종료하지 않음
7. 고객과 B의 마지막 외부 leg가 끝났을 때 `수신 통화 종료`
8. 후처리 창은 최종적으로 고객과 통화한 B에게 한 번만 자동으로 열기

통화 후 호전환에서 A와 B가 먼저 대화하는 구간은 `호전환 상담 중`으로 분리한다. 고객이
보류 중인지는 제공자 이벤트로 확인된 경우에만 표시한다. 이벤트가 부족하면 `호전환 중`으로
남기며 `고객 보류 중`을 추정하지 않는다.

최종 통화자는 단순히 가장 늦게 종료된 내선 leg가 아니라 마지막으로 고객 외부 leg에 실제
연결된 직원이다. 이 근거가 없으면 후처리를 임의의 직원에게 자동으로 열지 않고 전화데스크에서
연결 확인이 필요한 상태로 남긴다.

## 6. 실제 이벤트 canary

### 필요한 통제 환경

- 현재 온라인이고 서로 다른 두 센트릭스 내선 A·B와 각각의 실물 전화기
- 통제 가능한 외부 발신 전화 한 대
- A·B 담당자의 시험 동의와 정확한 시험 시간
- 통화 시작 전 A·B 대상 endpoint의 활성 통화·실행 중 전화 명령·DPAPI 대기 큐가 없다는 확인

A·B 대상에 실제 업무 전화가 들어오거나 배정 endpoint 상태가 불안정하면 즉시 중단한다.
다른 회선의 업무 통화는 안전 게이트에서 제외하되 조회 외에는 개입하지 않는다. 회선 재배정,
센트릭스 재로그인, 자격증명 변경, 프로세스 재시작과 DB 보정은 canary에 포함하지 않는다.

### 시나리오

1. **일반 내선:** A가 B에게 발신, B 연결, 정상 종료
2. **무조건 호전환:** 외부 전화 → A 연결 → B로 바로 전달 → B 연결 → 고객/B 종료
3. **통화 후 호전환:** 외부 전화 → A 연결 → A/B 상담 → B에게 전달 → 고객/B 종료
4. **실패·복귀:** 외부 전화 → A 연결 → B 무응답 또는 취소 → A에게 고객 통화 유지/복귀
5. **회귀 확인:** 외부 수신, 센트릭스 직접 발신, ERP 클릭투콜의 기존 원장이 변하지 않음

한 번에 한 시나리오만 수행한다. 각 단계의 한국시간 시작·연결·전달·종료 시각을 기록하고
A와 B 양쪽 로그를 같은 시간창으로 읽는다.

### 수집 항목과 개인정보 경계

bridge v0.7.2는 gateway 전송 동작을 바꾸지 않고 아래 파생 정보만 진단 로그에 추가한다.

- `CALLER_KIND=internal|external|unknown`
- `CHANNEL_KIND`/`RECHANNEL_KIND=sip|pjsip|local|local_xfer|other|none`
- 기존처럼 마스킹한 상대번호와 provider unique ID

로그 위치는
`C:\ProgramData\Lawand\CentrexBridge\instances\<bridge-id>\logs\bridge-YYYYMMDD.log`다.
raw OCX payload, 전체 전화번호, 비밀번호·HMAC secret과 gateway 응답 본문은 수집하지 않는다.
gateway와 DB는 읽기 전용으로 provider ID, 방향, 상태, 시각과 연결 원장만 확인한다. 외부로
옮기는 결과 문서에는 실제 고객정보를 넣지 않는다.

### 반드시 답해야 할 질문

- 일반 내선에서 A와 B가 각각 받는 `RINGEVENT`, `CHANNELLIST`, `CHANNELOUT` 순서는 무엇인가?
- 양쪽 이벤트를 하나의 내선 통화로 연결할 안정적인 ID가 있는가?
- `Transfer()`와 `AtXfer()`에서 원래 고객 leg, A/B 상담 leg, 최종 고객/B leg를 연결할
  provider ID 또는 source ID가 있는가?
- `Local/...@xfercontext-...` 채널이 어느 단계에서 생기며 완료·취소·복귀를 구분하는가?
- A leg 종료와 고객 root 종료를 구분할 수 있는가?
- B에게 전달된 외부 고객번호와 원래 root의 연관성을 양쪽 endpoint에서 확인할 수 있는가?

식별자가 충분하지 않으면 시각 근접만으로 자동 병합하지 않는다. 그 경우 ERP가 시작한 명시적
호전환 command ID를 상관키로 추가하거나, 제공자가 확정 신호를 주지 않는 구간은 `호전환 확인
필요`로 보존하는 대안을 설계한다.

### 2026-08-11 운영 실측 결과

관측 시간창은 16:52:55~16:53:53 KST이며 A는 4591, B는 1208이다. 문서의 ID 표기는
실제 provider 값을 옮기지 않고 시간창 안에서만 부여한 비식별 label이다.

#### 일반 내선

일반 내선은 다음 순서였다.

1. A `RING_EVENT(ISDIAL=1, CALLER_KIND=internal, sip/sip)`와 B
   `RING_EVENT(ISDIAL=0, CALLER_KIND=internal, sip/sip)`가 같은 root label을 보냈다.
   양쪽 masked suffix는 각각 상대 내선과 일치했다.
2. 양쪽 `CHANNEL_LIST`가 같은 root와 바로 다음 provider sequence의 channel ID 쌍,
   `internal/internal`, `sip/sip`을 보냈다.
3. 양쪽 `CHANNEL_OUT`이 같은 channel ID와 sentinel source, `sip/sip`, 정상 종료 원인을
   보냈고 A에는 root 자체의 종료도 추가로 왔다.
4. 양쪽 4자리 leg는 각각 `invalid_outbound_number`·`invalid_inbound_number`로 기존 정책대로
   gateway 전송 전에 거부됐다. 운영 통화·이벤트 원장은 생성되지 않았다.

#### 통화 후 호전환 성공

통화 후 호전환은 다음 순서였다.

1. 외부→A는 `RING_EVENT(CALLER_KIND=external, sip/sip)` 뒤 외부 root와 adjacent channel의
   `CHANNEL_LIST(external/external, sip/sip)`가 왔고 gateway 원장도
   `inbound.ringing → inbound.connected`로 기록됐다. 외부 masked suffix는 A에서만
   일관되게 관측됐다.
2. A가 B와 상담을 시작하자 양쪽에 같은 새 internal root가 왔고, 양쪽 `CHANNEL_LIST`도
   같은 adjacent internal channel을 보냈다. 이 ID group은 외부 root/channel group과
   달랐으며 모든 채널 종류는 `sip`이었다. `local_xfer`는 한 번도 관측되지 않았다.
3. A에서 외부 connected channel의 `CHANNEL_OUT(HCAUSE=129)`이 발생하자 현재 bridge가
   `inbound.ended`를 전송했고 운영 원장이 16:53:34.379 KST에 종료됐다. 직후 외부 root의
   별도 `CHANNEL_OUT(HCAUSE=16)`은 이미 active call이 지워져 무시됐다.
4. B의 마지막 `CHANNEL_OUT(HCAUSE=16)`은 16:53:53.509 KST에 왔다. 그러나 이 이벤트에는
   A/B 상담 channel ID와 sentinel source만 있고 외부 root/channel ID나 외부 masked suffix가
   없었다. gateway로 보낼 active call도 없어 `no_active_call`로 무시됐다.

따라서 일반 내선 한 통화를 양쪽에서 연결하는 ID는 확인됐다. 반면 통화 후 호전환에서는
A/B 상담 leg까지는 연결할 수 있지만, 현재 OCX 로그와 payload만으로 B/고객 최종 leg를 원래
외부 root에 결정적으로 연결하거나 A leg 종료와 고객 root 최종 종료를 일반화해 구분할 수
없다. 이 canary에서는 두 종료 사이가 19.13초였고 운영 원장이 먼저 닫힌 것이 확인됐다.

이 결과는 A가 외부 통화 중 시작한 internal 상담 leg를 transfer candidate로 연결해야 함을
보여주지만, B/customer final leg를 외부 root에 연결할 결정적 passive evidence는 제공하지
않는다. 따라서 이 시나리오는 미해결 fixture로 보존하고 증거가 보강되기 전에는 중간 A 종료를
고객 root 종료로 확정하거나 최종 통화자를 B로 자동 지정하지 않는다.

#### 무조건 호전환 성공

1. A의 최초 외부 `RING_EVENT` root와 고객 지문이 B의 `RING_EVENT`에 그대로 다시 나타났다.
   B 이벤트는 원수신 회선 `line=4591`과 실제 수신 agent `1208`을 함께 보존했고, 외부 masked
   suffix도 A와 같았다.
2. B `CHANNEL_LIST`가 같은 외부 root와 B/customer final leg를 직접 연결했다. 최종 leg는
   별도 provider group이지만 이 명시적 adjacent 관계로 외부 root에 결정적으로 상관할 수
   있다. 관측 채널은 모두 `sip`이었고 `local_xfer`는 없었다.
3. A의 외부 connected leg가 먼저 종료되자 현재 운영 원장도 닫혔고, B/customer final leg는
   33.259초 뒤 종료됐다. 즉 현재 원장은 A leg 종료를 root 종료로 잘못 취급한다.
4. gateway의 `incoming_line_mismatch`는 endpoint의 배정 회선과 수신 회선이 다른 이벤트가
   다른 직원 통화에 섞이는 것을 막는 보호장치다. 이 fixture에서는 provider가 B endpoint에
   원수신 회선 4591과 agent 1208을 함께 보낸 정상 호전환이어서 ringing이 409로 오탐됐고,
   선행 원장이 없어진 후속 connected/ended도 orphan 409가 됐다. 정확히 3건이 1208 active
   dead-letter에 쌓였다.
5. 암호화 원본 3건은 hash를 확인해
   `C:\ProgramData\Lawand\CentrexBridge\instances\lawand-slot-001\gateway-dead-letter-archive\20260811T081527Z-blind-transfer-1208`
   에 보존하고 재처리 없이 active dead-letter에서만 격리했다. 보존 3건·active 0건이며
   queue/dead-letter와 CloudWatch DPAPI 경보는 정상으로 복귀했다.

보호 검사를 전체 완화하지 않는다. 무조건 호전환 전용 수용은 같은 외부 root, 같은 고객
지문, 원수신 회선, B agent, 그리고 외부 root와 B final leg를 잇는 `CHANNEL_LIST`를 모두
검증할 때만 허용한다. 하나라도 없으면 자동 병합하지 않고 `호전환 확인 필요`로 보존한다.

#### 실패·복귀

1. A의 외부 root와 adjacent channel은 `connected`로 유지된 채, A→B 상담 시 양쪽
   `RING_EVENT`에 같은 별도 internal consultation root가 나타났다. 모든 채널은 `sip`이었고
   `local_xfer`는 없었다.
2. B가 응답하지 않아 B `CHANNEL_LIST`는 없었다. 상담 종료에서 A는 consultation root를
   source로, B는 adjacent channel과 sentinel source를 보냈다. 이때 관측한 종료 cause
   207/16은 이 fixture의 값일 뿐 성공·실패 의미로 일반화하지 않는다.
3. 취소 과정에서 기존 외부 channel은 중간 종료 없이 계속 유지됐다. 명시적 return provider
   이벤트나 추가 `RING_EVENT`·`CHANNEL_LIST`는 없었고, 취소 후 12.10초 뒤 기존 외부
   channel이 최종 종료돼 gateway가 `inbound.ended`를 수용했다.
4. gateway 409와 queue/dead-letter는 모두 0이었다. 현재 bridge 로그만으로는 `활성 외부
   root + 연결되지 않은 internal consultation 시도 종료 + 외부 channel 유지`를 결합해
   실패·복귀를 판별할 수 있지만 gateway와 UI에는 이 내부 문맥이 전달되지 않는다.

따라서 bridge가 활성 외부 root 문맥에서 `consultation_attempt`와 `consultation_returned`
correlation 이벤트를 명시적으로 생성해야 제품이 `호전환 시도 중`과 `복귀`를 표시할 수 있다.

#### 전체 결론

| 시나리오 | 실측 결론 | 구현 상태 |
| --- | --- | --- |
| 일반 내선 | 공통 root·adjacent ID로 양쪽 참여자를 결정적으로 연결 | 참여자에게만 표시 |
| 무조건 호전환 성공 | B에 재노출된 외부 root와 `CHANNEL_LIST`로 B/customer final leg를 결정적으로 연결 | 엄격한 호전환 전용 수용 경계 필요 |
| 실패·복귀 | 활성 외부 root 안의 미연결 consultation 종료와 외부 channel 유지로 bridge-local 판별 가능 | 명시적 attempt/returned correlation 이벤트 필요 |
| 통화 후 호전환 성공 | A/B 상담 leg는 연결되지만 passive event만으로 B/customer final leg와 외부 root를 결정적으로 연결 불가 | 미해결, `호전환 확인 필요` 유지 |

종료 cause 하나나 시간 근접만으로 성공·실패·복귀·root 관계를 추정하지 않는다. 최종 운영
확인 시 4591·1208 active call과 실행 명령, target queue/dead-letter, 관련 CloudWatch
ALARM은 모두 0이었고 다른 업무 통화는 조회만 했으며 개입하지 않았다.

## 7. 확정 구현 계약

1. 한 고객 통화를 `customer call root`로 두고 A/customer, A/B consultation,
   B/customer를 각각 별도 call leg로 저장한다.
2. transfer correlation evidence에는 외부 root, 고객 지문, 원수신 회선, 전달 대상 agent,
   provider가 명시한 root/adjacent/source 관계와 bridge가 만든 consultation 상관 이벤트를
   보존한다. 증거가 부족하면 `호전환 확인 필요`이며 cause나 시간 근접으로 채우지 않는다.
3. customer call root는 마지막 customer leg가 종료될 때만 끝낸다. A leg 종료나 상담 leg
   종료로 root를 닫지 않는다.
4. 후처리는 마지막 customer leg에 실제 연결된 최종 고객 통화자에게 한 번만 자동으로 연다.
   최종 통화자를 확정할 증거가 없으면 누구에게도 임의로 열지 않는다.
5. 일반 내선은 발신자·수신자에게만 표시하고 수신자에게 개인 알림을 보낸다. 외부 고객
   호전환 대상은 일반 내선과 구분해 우선순위가 높은 `전달된 고객 전화` 알림을 받는다.
6. `incoming_line_mismatch` 보호는 유지한다. 무조건 호전환 fixture의 모든 증거를 만족하는
   전용 경계만 별도로 허용하고, 일부 필드 일치만으로 일반 수신 검사를 우회하지 않는다.

## 8. 구현 순서와 완료 기준

1. **완료:** v0.7.2 통제 배포와 일반 내선·무조건/통화 후 호전환·실패 복귀 비식별 증거 수집.
2. **완료:** root/leg 상관관계, 엄격한 무조건 호전환 수용 경계와 실패·복귀 correlation을
   정책 fixture와 로컬 수직 검증으로 고정한다.
3. **완료:** gateway에 외부 통화 root, leg, 참여자와 전환 관계를 멱등 저장한다.
4. **완료:** 현재 수신 snapshot을 통합 통화 활동 snapshot으로 확장하고 외부 수·발신
   공용 카드를 연결한다.
5. **완료:** 리걸프렌즈 `Member_idx`·`sub_member_idx` 기반 담당자 해석과 알림 대상
   snapshot을 구현한다.
6. **완료:** 토스트·Notification API와 탭 간 중복 방지를 구현한다.
7. **완료:** 결정적으로 확정된 최종 고객 통화자 한 명에게만 후처리를 자동으로 연다.
8. **남음:** 권한·개인정보·재접속·중복 이벤트 회귀 검증은 로컬에서 통과했다. 운영
   migration·bridge/gateway/ERP 통합 배포 뒤 네 실통화 시나리오 canary를 수행한다.

완료 조건은 외부 수·발신 공용 카드가 한 통화당 하나로 일관되게 보이고, 일반 내선은 참여자만
보며, 수신 담당자와 호전환 대상자가 정확히 한 번 알림을 받고, 중간 leg 종료가 고객 root를
끝내지 않으며, 최종 고객 통화자에게만 후처리가 열리는 것이다.

## 9. 출시 후보 구현 결과

- migration `0045_safe_zarek.sql`에 고객 통화 root, 개별 leg, provider root/channel/source
  식별자, transfer relation, 원본 관측 원장을 추가했다. 기존 수·발신 원장은 같은 UUID의
  external root로 승격하고 후처리는 기존 통화 또는 새 root 중 정확히 하나만 참조한다.
- bridge v0.8.0 후보는 외부 v1 이벤트를 유지하면서 내선·호전환까지 v2 관측을 함께 보낸다.
  종료 시 실제 `UNIQUEID`를 `SRCUNIQUEID`보다 우선하고, 정상 무조건 호전환은 동일 외부
  root·고객 지문·원수신 회선·대상 agent·`CHANNELLIST`를 모두 만족할 때만 확정한다.
- gateway는 U+ callback/history와 bridge 관측을 같은 root/leg에 합치며, 중간 고객 leg 또는
  상담 leg 종료가 다른 활성 고객 leg를 닫지 않는다. 통화 후 호전환 final leg가 보이지
  않으면 root와 후처리를 `호전환 확인 필요`로 보존한다. 공유 회선은 실제 통화자를 임의로
  한 명 선택하지 않는다.
- 인증 통화 활동 snapshot은 외부 수·발신을 전 직원에게, 일반 내선은 참여 endpoint
  담당자에게만 반환한다. 수신 알림은 정확한 리걸프렌즈 member index·상담 담당자와 회선
  담당자를 합치고 없으면 활성 직원 전체로 확장한다.
- ERP는 수신·직접발신·클릭투콜 공용 카드, 개인 내선 상태, 전달/복귀/확인 필요 상태,
  9초 토스트와 명시적 Notification 권한, 8초 multi-tab leader lease·통화 ID 중복 방지를
  적용했다. 개인정보 없는 NOTIFY/SSE 뒤 인증 same-origin snapshot에서 전체 번호와 고객·
  사건·담당자·회선 정보를 채운다.
- 임시 로컬 DB 복제본의 전체 migration과 실제 ingress 수직 검증, core 64개·gateway
  104개 테스트, 전체 typecheck·lint·production build, Drizzle schema check, Windows
  .NET Framework x86 Release compile·self-test 19개를 통과했다. 운영 migration·배포와
  실통화 canary는 수행하지 않았다.
