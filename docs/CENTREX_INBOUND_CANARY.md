# 센트릭스 수신전화 OpenAPI canary

## 결론

LG U+ 고급형 센트릭스 A타입의 32비트 OpenAPI OCX `1.0.1.21`은 64비트 Windows Server
2022의 WOW64 환경에서 동작한다. 실제 수신 한 건에서 아래 순서를 확인했다.

```text
RINGEVENT(ISDIAL=0)
  -> Answer()
  -> CHANNELLIST
  -> CHANNELOUT
```

`Answer()`를 호출하면 PC로 음성이 스트리밍되는 것이 아니라 실제 센트릭스 전화기가
자동으로 스피커폰을 열고 통화한다. 사용자가 휴대전화와 물리 전화기 사이의 양방향
통화를 직접 확인했다.

## 검증 환경

- 임시 EC2: Windows Server 2022 x64, `t3.medium`
- OCX: LG U+ 제공 `LGUBaseOpenApi.ocx` `1.0.1.21`, 32비트
- 등록: `C:\Windows\SysWOW64\regsvr32.exe`
- host: x86 `mshta.exe`에 ActiveX control을 올린 진단 HTA
- 연결: 센트릭스 OpenAPI 장수명 연결, 외부로 나가는 TCP만 사용
- 관리: EC2 SSM 전용 역할, RDP는 작업자 공인 IP `/32`만 허용

공식 ZIP은 로컬과 서버의 SHA-256이 일치했다. CAB와 OCX의 Authenticode 서명자는
`BMLINK`이고 서명 상태는 `Valid`였다. Microsoft Defender 실시간 보호가 켜진 상태에서
canary 디렉터리 사용자 지정 검사를 실행했고 관련 위협은 0건이었다.

## 진단 host

[`scripts/centrex-inbound-canary.hta`](../scripts/centrex-inbound-canary.hta)는 운영 앱이
아니라 다음 사실만 확인하는 일회성 도구다.

- 로그인 성공 이벤트
- `RINGEVENT` 수신
- 다음 ring 한 번만 `Answer()` 호출
- 연결·종료 이벤트 수신
- 비밀번호 미보관
- 발신번호는 끝 4자리만 로그에 기록

자동 받기 체크는 첫 `RINGEVENT` 직후 해제된다. 운영에서 상시 자동 받기로 사용하면 안
된다.

## 실제 결과

canary 로그에는 한 통화에서 다음 이벤트가 같은 provider unique ID 계열로 남았다.

1. `RINGEVENT`: `ISDIAL=0`, 수신 회선 일치, 발신번호 마스킹
2. `ANSWER_REQUEST`: `SOURCE=armed-ring`
3. `CHANNELLIST`: 양쪽 channel unique ID 확보
4. `CHANNELOUT`: 종료 unique ID 확보

발신번호 원문, 센트릭스 비밀번호, Windows 관리자 비밀번호는 저장하지 않았다.

## 상시 Windows bridge 1단계

진단 HTA와 별도로 [`apps/centrex-bridge`](../apps/centrex-bridge/README.md)에 .NET Framework
4.8 기반 전용 실행 파일을 구현했다. x86 WinForms STA의 `AxHost`와 메시지 루프에서 OCX를
호스팅하고 다음 안전 경계를 적용한다.

- 같은 회선의 단일 프로세스와 재접속 backoff
- 로그인 결과의 내선 suffix·회선 끝 4자리 검증
- 센트릭스 자격 증명은 동일 Windows 사용자의 자격 증명 관리자에만 보관
- 발신번호·회선은 로컬 로그에서 끝 4자리만 기록
- interactive logon 작업 스케줄러로 시작하고 실패 시 재시작
- 자동 받기 UI와 자동 `Answer()` 없음

서명 없는 canary 빌드를 EC2에 올린 뒤 기존 HTA를 종료하고 상시 작업을 시작했다. 실제
로그에서 x86·STA host 초기화, 센트릭스 로그인 성공, 통제된 약 10초 수신의
`RING_EVENT(ISDIAL=0)`, 발신자가 끊은 뒤 `CHANNEL_OUT(HCAUSE=16)`을 확인했다. 프로세스와
작업은 검증 뒤에도 실행 상태다. 배포 파일의 SHA-256은 로컬 빌드와 서버에서 일치했고,
아이디·비밀번호 원문은 파일·DB·SSM·Git·로그에 넣지 않았다.

원격 `Answer()`는 아직 연결하지 않았다. 운영 전에는 브리지 코드 서명, 전용 저권한
Windows 사용자, 재부팅 뒤 interactive session 무인 복구 방식을 확정해야 한다.

## bridge→gateway 2단계 실제 결과

- bridge 이벤트 계약은 `inbound.ringing`, `inbound.connected`, `inbound.ended` 세 가지다.
  raw OCX 문자열은 전송하지 않고 provider call ID와 필요한 최소 필드만 보낸다.
- Windows는 JSON을 현재 사용자 DPAPI로 암호화한 뒤 디스크 큐에 먼저 기록한다. gateway가
  200/201을 반환하기 전에는 삭제하지 않고 같은 event ID로 순차 재전송한다.
- HTTPS 서버 인증과 bridge별 HMAC-SHA256을 사용한다. gateway는 5분 시각창·난수 nonce·
  본문 hash·bridge→endpoint 고정을 검증한다. bridge secret은 Secrets Manager와 Windows
  Credential Manager에만 있고 설정·SSM 명령·DB·Git·로그에는 없다.
- gateway는 발신번호를 즉시 AES-GCM 암호화하고 기존 상담과 같은 HMAC 지문을 만든다.
  `telephony_inbound_calls`와 `telephony_inbound_events`는 상담 연결 전부터 독립 원장을
  유지하며 event ID·provider call ID·nonce 충돌을 막는다.
- 운영 배포 전 스냅샷 `lawand-prod-pre-centrex-inbound-20260806`을 만들었다. gateway 릴리스는
  `20260806T005200Z-centrex-inbound-step2`, 아티팩트 SHA-256은
  `c982cf302a4fc1eb8880c13d0c235e9a9b4279f3f9984e2252a1d1ede19262f7`이다.

사용자가 휴대전화로 새 전화를 걸어 약 10초 울린 뒤 받지 않고 끊었다. 실제 provider
시각 기준 통화는 12.896초였고 `RINGEVENT(ISDIAL=0)` 뒤 연결 이벤트 없이
`CHANNELOUT(HCAUSE=16)`이 왔다. 운영 DB에는 수신 통화 1건과
`inbound.ringing → inbound.ended` 이벤트 2건이 남았으며 상태는 `ended`,
`connected_at`은 `NULL`이다. 발신번호 암호문 27바이트·nonce 12바이트·지문 32바이트를
확인했고, gateway 안에서만 복호화해 번호 형식·마스킹·HMAC 재계산 일치 여부를 검사한
세 결과가 모두 참이었다. 전화번호 원문은 출력하지 않았다.

첫 실전 전송에서 두 결함을 발견해 bridge v0.2.1로 고쳤다.

1. .NET Framework `HttpClient`의 Windows 기본 proxy 경로에서 전송이 실패했다. gateway
   주소는 proxy를 사용하지 않고 직접 연결하며 TLS 1.2를 명시하도록 바꿨다.
2. 센트릭스가 같은 수신의 `RINGEVENT`와 `CHANNELOUT`을 같은 prefix·인접 sequence의
   sibling leg ID로 보냈다. 활성 ring이 3분 안일 때만 정확히 같은 ID 또는 같은 prefix의
   sequence 차이 1을 같은 통화로 인정한다.

보존된 ringing DPAPI 큐는 보강본 시작 직후 201로 전달됐다. 누락된 ended는 이미 보존된
원본 `CHANNELOUT` 시각과 원인으로 이벤트를 다시 만들고 HMAC 인증 gateway 경로로만
복구했으며 DB를 직접 수정하지 않았다. 같은 ended 이벤트를 한 번 더 재전송한 검증은
약 3.6초 안에 200으로 끝났고 DB 이벤트는 2건 그대로여서 멱등성도 확인됐다. 최종 Windows
x86 bridge는 파일 버전 `0.2.1.0`, SHA-256
`df3e7d6a20cd9c4e01c32a4b74cd172305eb6507e1601ce526bbb728b33a43d4`이며 비공개 S3의
동일 checksum·AES256 암호화를 확인했다. 작업 스케줄러와 프로세스는 각각 하나,
gateway 큐는 0건, gateway 최근 오류는 0건이고 health는 정상이다. 다음 실제 전화는 ERP
수신 표시를 구현할 때 sibling leg 자동 종료까지 함께 재확인한다. 이 단계에서도 자동
받기는 하지 않는다.

## ERP 전역 수신 표시 3단계

migration `0027_telephony_inbound_sse_notifications.sql`은 수신 이벤트 INSERT가 commit된
뒤 `lawand_telephony_inbound_events`로 event ID·inbound call ID·이벤트 종류·발생시각만
알린다. 전화번호·provider call ID·암호문·nonce·지문은 알림에 넣지 않는다. gateway는
별도 PostgreSQL `LISTEN` 연결에서 이를 받아 인증된 직원 SSE로 전달하고, ERP 브라우저는
내부 키를 노출하지 않는 same-origin 프록시를 구독한다.

연결 직후와 source 재연결에는 `telephony.inbound.sync`를 보내고 ERP가 권한 있는
스냅샷을 다시 읽는다. 스냅샷은 울림 3분, 연결 12시간, 종료 후 20초 범위의 통화만
전체 번호·내선·활성 회선 담당자와 함께 반환한다. 전체 번호는 로그인된 ERP의 same-origin
조회에서만 복호화하고 DB 암호화·검색 지문·마스킹 보조 컬럼은 유지하며, 실시간 SSE와
서버 로그에는 넣지 않는다. 따라서 페이지를 새로 열거나 SSE가
잠시 끊겨도 현재 울리는 전화를 복구하며, 누락된 종료 이벤트로 오래된 울림이 무기한
남는 것도 막는다. UI는 모든 인증된 직원 화면의 상단에 `수신전화`, `통화 중`, `통화 종료`
상태를 표시하고 로그인 직원이 회선 담당자이면 `내 전화`, 아니면 담당자 이름을 표시한다.

운영 배포 전 암호화 스냅샷
`lawand-prod-pre-centrex-inbound-ui-20260806`을 available 상태까지 확인했다. gateway·ERP
릴리스는 `20260806T020118Z-centrex-inbound-step3`, private S3 아티팩트 SHA-256은
`a5fa84d59a150c4db8d83d0412e7a87457e6f2e1915c920d4707454fec572ef5`이며 서버 측 AES256을
확인했다. 임시 수신 통화와 이벤트를 같은 트랜잭션에서 삭제한 뒤 commit하는 canary로
DB trigger→gateway SSE의 `sync → changed`를 받았다. 이어 ERP same-origin 스냅샷·SSE가
각각 200이고 개인정보 필드가 없음을 확인했다. 임시 통화·이벤트는 0건, 임시 직원 세션과
canary 스크립트도 삭제했다.

gateway와 ERP 컨테이너는 각각 재시작 0회·health 정상이고 최근 error journal과
CloudWatch ALARM은 없다. Windows bridge 작업은 실행 중, 프로세스 1개, DPAPI 큐 0건이다.

후속 실제 전화에서 사용자가 ERP의 `수신전화 → 통화 종료` 표시를 확인했다. 운영 최신
원장은 약 13.6초 울린 뒤 연결 이벤트 없이 `inbound.ringing → inbound.ended(HCAUSE=16)`
두 이벤트로 자연 종료됐고, 로그 최종 기록 시각과 종료 시각도 일치했다. 전화번호 암호화·
복호화·지문 재계산은 모두 일치했다. 이어 릴리스
`20260806T022927Z-centrex-inbound-full-number`로 인증 스냅샷을 전체 번호 표시로 전환하고
동시 수신은 통화 ID별 모든 행을 반환하도록 제한을 제거했다. 로컬 실제 DB 검증은 서로
다른 두 통화를 한 스냅샷에서 복호화·반환했고, 운영의 과거 실제 원장 복호화와 ERP
same-origin 프록시 200도 번호를 출력하지 않고 확인했다. 이 단계에서도 `Answer()`는
연결하지 않았다.

## ERP 받기 후 종료 leg 보강

회선 소유자로 로그인한 사용자가 ERP `전화 받기`를 눌러 물리 전화기 스피커폰과 양방향
통화를 확인했다. 운영 원장은 `inbound.ringing → inbound.connected`까지 기록됐지만,
종료 뒤에도 ERP가 `통화 중`을 유지했다. Windows 안전 로그에는 `CHANNELOUT(HCAUSE=16)`이
정상 도착해 있었으므로 gateway·SSE 문제가 아니라 bridge의 channel ID 연결 문제였다.

이 통화에서 최초 `RINGEVENT` ID와 `CHANNELLIST`의 전화기 쪽 ID는 prefix와 sequence가
모두 달랐고, `CHANNELOUT`은 전화기 쪽 ID로 왔다. bridge v0.3.0은 최초 수신 ID와 동일하거나
인접한 ID만 종료로 인정해 정상 종료 이벤트를 버렸다. v0.3.1은 다음처럼 보강했다.

- `CHANNELLIST`가 최초 수신 ID와 연결된 이벤트인지 먼저 확인한다.
- 확인된 양쪽 channel ID를 모두 활성 통화에 보존한다.
- 이후 어느 channel ID의 `CHANNELOUT`이 와도 최초 provider call ID의 `inbound.ended`로
  전달한다.
- 3분 제한은 무응답 수신에만 적용하고 이미 연결된 통화는 실제 통화 시간과 무관하게
  종료 이벤트를 받는다.

Windows Server에서 x86 빌드와 8개 self-test를 통과한 v0.3.1.0을 배포했다. SHA-256은
`b1127e1e573e7cfe937e9ec7c86026c8ec6f98c9d5b97763f4f346d8fcf9de0a`이며 작업 스케줄러,
프로세스 1개, 센트릭스 재로그인, DPAPI 큐 0건을 확인했다. 이미 누락된 종료는 원본
`CHANNELOUT` 시각과 원인 16으로 새 이벤트를 만들고 bridge와 같은 HMAC 인증 gateway
경로에 전달했다. 운영 원장은 `ringing → connected → ended` 3건과 실제 종료 시각을
보존하며 DB를 직접 수정하지 않았다.

## 센트릭스 직접 발신 canary와 원장 계약

실물 센트릭스 전화기 내선 4591에서 통제된 휴대전화로 직접 발신해 OpenAPI 원장을
확인했다. `RINGEVENT(ISDIAL=1)`의 `CALLERID`에는 상대 전화번호, `AGENT`에는 내선이
들어왔고 `INEXTEN`은 비어 있었다. 약 8.6초 뒤 `CHANNELLIST`가 왔으며 약 16.4초 통화 후
최초 provider ID의 `CHANNELOUT(HCAUSE=16)`으로 종료됐다. 따라서 직접 발신은 수신과 같은
channel leg 추적만 공유하고 다음 별도 이벤트 계약을 사용한다.

- `outbound.ringing`: provider call ID와 상대 전화번호
- `outbound.connected`: 연결 channel ID
- `outbound.ended`: provider call ID와 종료 원인

전화번호 원문은 Windows 안전 로그에서 끝 네 자리만 보이고, gateway 전송 전 DPAPI 큐에
암호화된다. gateway는 기존 수신 원장의 호환 테이블을 센트릭스 관측 통화 원장으로
확장해 `direction`으로 수신·발신을 분리하고, 전체 상대 번호를 AES-GCM 암호화·HMAC
검색 지문으로 저장한다. 발신 이벤트는 수신 전용 PostgreSQL 알림과 ERP 상단 수신 바에는
전달하지 않는다.

ERP 클릭투콜도 같은 OpenAPI 발신으로 관측될 수 있으므로 전화데스크에서는 회선·상대
번호 지문·시각을 기준으로 기존 `telephony_calls` 명령 원장과 연결해 한 건만 표시한다.
연결되지 않은 관측 발신은 실물 전화기 또는 U+ 비즈콜 앱의 `센트릭스 직접 발신`이다.
OpenAPI 문서에는 단말 종류 필드가 없으므로 비즈콜 앱은 직원 회선 등록 후 실제 발신
canary에서 실시간 이벤트 수신 여부와 추가 식별 필드를 확인한다.

## 통합 전화데스크와 클릭투콜 관측 연결

발신 명령과 센트릭스 관측 통화는 감사·장애 분석 책임이 다르므로 원본 행을 합치거나
덮어쓰지 않는다. `telephony_call_observation_links`가 아래 조건을 모두 만족한 경우에만
한 번씩 연결하고, 전화데스크 읽기 모델이 두 원장을 한 행으로 접는다.

- 같은 검증 endpoint
- 같은 방향 `outbound`
- 복호화 없이 비교하는 같은 상대번호 HMAC 지문
- 클릭투콜 요청 시각 기준 관측 시작이 -5초~+120초
- 아직 연결되지 않은 명령 중 시각 차가 가장 작은 후보
- `dispatching`, `succeeded`, `unknown` 명령만 후보이며 `queued`, `failed`는 제외

연결되지 않은 관측 발신은 `센트릭스 직접 발신`으로 남는다. 현재 OpenAPI 이벤트만으로
실물 전화기와 U+ 비즈콜 앱을 신뢰성 있게 나눌 수 없으므로 단말 종류는 추정하지 않는다.
연결된 원장도 DB에는 각각 보존되고 연결 시각·방법·시각 차를 별도 기록한다.
마이그레이션 전에 이미 존재한 원장의 일괄 backfill은 한 명령이나 관측이 잘못 선점되지
않도록 양쪽 상호 최근접인 조합만 연결한다.

통합 전화데스크는 수신·ERP 클릭투콜·센트릭스 직접 발신을 시간순으로 반환하고, 권한 있는
snapshot에서만 전체 상대번호와 고객·사건·담당자 해석을 제공한다. 실시간 갱신은 별도
PostgreSQL 채널 `lawand_telephony_desk_events`의 정확히 네 필드
`eventType/entityId/direction/occurredAt`만 gateway 인증 SSE로 전달한다. 전화번호·고객명·
담당자명은 NOTIFY나 SSE payload에 넣지 않는다. ERP는 same-origin 프록시를 구독하고
이벤트가 올 때 snapshot을 다시 읽으며 주기적 polling은 하지 않는다.

ERP 전역 직원 바는 수신 종료뿐 아니라 로그인 직원 소유 회선에서 새로 종료된
`centrex_direct`도 같은 전화데스크 SSE로 감지해 공용 후처리 창을 연다. 컴포넌트가
마운트되기 전의 과거 종료 통화는 기준선으로만 기록해 로그인 직후 오래된 미처리 창이
쏟아지지 않게 하고, 동시에 끝난 여러 통화는 순서대로 처리한다. 클릭투콜·수신 자동 창과
같은 session key를 사용해 같은 통화의 중복 창을 막는다.

## 회선 프로비저닝 network error 순서 역전 보강

직원관리의 원클릭 회선 교체에서 bridge v0.5.0은 새 로그인 직전 발생한
`NetworkError`를 `centrex_network_error`로 먼저 확정했다. Windows 안전 로그에서는
그 직후 목표 회선의 `LOGIN_RESULT(STATUS=1)`이 도착했다. 이 network error는 회선 교체를
위해 의도적으로 호출한 `DisconnectServer()`의 비동기 결과였으므로 새 자격증명 오류가
아니었다.

bridge v0.5.1은 프로비저닝 중 network error를 안전 로그에 deferred 신호로 기록하고
재접속만 예약한다. 성공·실패는 목표 회선·내선을 포함한 실제 `LoginResult` 또는 제한시간으로
확정한다. 일반 운전 중 network error의 기존 재접속 동작은 유지한다. Windows x86 self-test
11개를 통과한 v0.5.1.0의 SHA-256은
`D0A730F1FE60A7983663EE1C521494302F6A5F2C5BA4BE728D26525226821C5A`이며, 배포 뒤 작업
Running·프로세스 1개·응답 프로세스 1개·DPAPI 큐 0건이다.

## U+ 비즈콜·망 수신 보완 계약

비즈콜 앱으로만 오는 전화는 Windows의 32비트 OCX를 지나지 않으므로 기존 bridge 이벤트를
기다려서는 ERP가 알 수 없다. 실제 운영 누락 시각을 U+ REST `getinboundcall`로 대사해
종료 상태가 남는 것을 확인했고, 공식 `setringcallback`과 함께 다음 이중 경로를 출시
후보로 구성했다.

- ring 시점: U+가 gateway의 긴 비밀 `.html` 경로를 호출하면 즉시 `inbound.ringing`을 만든다.
- 종료 시점: gateway가 활성 직원 회선별 `getinboundcall`을 15초 간격으로 읽어
  `ANSWERED/NO ANSWER/CANCEL/BUSY/FAILED`와 종료 시각·통화시간을 확정한다.
- 콜백 누락: 이력에만 있는 통화도 독립 원장과 전화데스크에 보강한다.
- 중복 방지: 같은 endpoint·발신번호·짧은 시각창을 PostgreSQL advisory lock으로 직렬화해
  U+ 콜백과 Windows bridge ring을 한 통화에 병합한다.

U+ 콜백 규격이 HTTPS를 지원하지 않아 gateway EIP의 80번 포트는 정확히
`/v1/centrex-ring/*.html`만 애플리케이션으로 전달하고 다른 경로는 기존처럼 HTTPS로
redirect한다. 실제 수신 경로는 256비트 난수 토큰을 포함하고 다음 경계를 함께 적용한다.

- 허용 query 필드와 중복 필드 거부
- `kind=1`, 전체 수신 회선, 내선의 활성 endpoint 정확 일치
- 발신번호 즉시 AES-GCM 암호화와 HMAC 검색 지문화
- callback URL·전화번호를 로그·DB 평문·NOTIFY·SSE에 기록하지 않음
- provider 이력으로 ring/종료 상태를 사후 대사

ERP는 callback·history 원장을 `U+ 앱/망 수신`으로 표시한다. 물리 Windows bridge가 확인된
ring에만 `전화 받기`를 제공하며, 비즈콜 앱 수신은 앱 또는 연결된 단말에서 받도록 안내한다.
U+ REST `clickdial`은 실제 시험에서 물리 전화기만 울리고 비즈콜 앱은 울리지 않았다. 공식
공개 규격에 앱 deep link나 원격 발신 API가 없어 ERP 클릭투콜은 현재 물리 전화기 전용이고,
비즈콜 발신은 앱에서 직접 회사 070 번호로 수행한다.

운영 배포 전 암호화 RDS 스냅샷 `lawand-prod-pre-centrex-bizcall-20260807`을 available까지
확인했고 gateway·ERP 릴리스 `20260807T034220Z-centrex-bizcall`을 배포했다. gateway 시작
시 4535 endpoint의 callback 등록이 성공하고 U+ 이력 전용 통화 4건을 보강했다. 같은 날
기존 Windows bridge 통화 1건은 그대로 한 행이며 같은 발신번호·분 단위 중복은 0건이다.
인증된 전화데스크 API는 `U+ 앱/망 수신` 4건을 반환했고 검증용 5분 직원 세션은 삭제 후
0건이다.

이후 실제 비즈콜 앱 수신을 반복 canary한 결과는 다음과 같다.

- 통화 중 `setringcallback` 요청은 gateway에 0건이었다.
- 같은 시간 U+ `channelstatus`는 계속 `4004/NO CHANNEL`이었다.
- 종료 뒤에만 `getinboundcall`의 `CANCEL`, `NO_ANSWER`, `ANSWERED` 행이 생성됐다.
- U+ `getringcallback`에 저장된 회선·callback EIP·비밀 경로·포트·종류 `1`은 모두
  gateway 설정과 정확히 일치했다.

초기 Caddy는 callback Host가 gateway EIP일 때만 비밀 경로를 전달해, 임의 Host 또는
HTTP/1.0 Host 없음 요청을 308로 전환하는 호환성 결함도 있었다. listener를 `:80`으로
교정해 세 Host 형태가 모두 애플리케이션 검증 경로에 도달하고 일반 경로만 301을 유지하게
했다. 그러나 교정 뒤 실제 `ANSWERED` 통화도 callback 없이 종료 54초 뒤 이력으로만
생성됐다. 따라서 U+ REST callback과 `channelstatus`는 AI비즈콜 앱 leg를 노출하지 않는다.

현재 서버 연동은 비즈콜 종료 이력과 전화데스크 기록에는 사용할 수 있지만, 벨이 울리는
동안의 ERP 실시간 표시는 만들 수 없다. 다음 실시간 원천은 휴대폰이 Android이면 알림/통화
이벤트를 최소권한으로 gateway에 보내는 모바일 bridge, iPhone이면 U+ 기업용 webhook 또는
사무실 전화 동시착신 제공 여부 확인이다. 모바일 원천을 확정하기 전에는 종료 이력을
`ringing`처럼 앞당겨 추정하지 않는다.

2026-08-06 운영 RDS 스냅샷 `lawand-prod-pre-phone-desk-20260806` 뒤 migration `0032`와
gateway·ERP 릴리스 `20260806T072225Z-phone-desk`를 배포했다. 인증 canary에서 페이지·목록
API 200과 SSE sync를 확인했고 임시 세션은 삭제했다. 운영 기존 수신 6건이 통합 목록에
표시되며 클릭투콜·직접 발신·연결은 아직 0건이다. 실제 발신 canary는 사용자가 사무실에
복귀한 뒤 수행한다.

## 운영 bridge의 필수 조건

일반 x86 COM 인스턴스 생성 자체는 성공했지만 ActiveX control site가 없는 session 0에서
`IsConnected()`가 `E_UNEXPECTED`를 반환했다. x86 MSHTA ActiveX host에서는
`OCX_READY=1`과 실제 로그인이 성공했다. 운영 bridge는 다음 조건을 만족해야 한다.

- 32비트 x86 프로세스
- STA thread
- ActiveX control host와 Windows 메시지 루프
- 회선별 단일 로그인과 재접속 backoff
- provider unique ID 기반 이벤트 멱등성
- gateway 상호 인증과 TLS
- 비밀번호·발신번호 원문 로컬 로그 금지
- `Answer()`는 권한 있는 ERP 사용자의 명시적 동작으로만 실행
- 이미 종료됐거나 다른 회선인 ring, 중복 클릭을 거부

bridge는 `RINGEVENT`, `CHANNELLIST`, `CHANNELOUT`을 gateway에 전달한다. gateway는
발신번호를 서버 경계에서만 정규화하고 상담데스크 우선, 리걸프렌즈 동기화 원천 차선으로
고객을 해석한다. ERP 실시간 알림에는 전화 이벤트 ID와 마스킹 표기만 싣고, 권한 있는
상세 API가 고객·담당자 정보를 반환한다.

## 임시 자원 정리

canary를 더 사용하지 않을 때 아래 자원을 순서대로 정리한다.

1. Windows canary 인스턴스 중지 후 필요 없으면 종료
2. RDP security group ingress 제거
3. 임시 private S3 object와 bucket 삭제
4. SSM IAM role·instance profile 분리 후 삭제
5. EC2 key pair 삭제 및 Git 밖의 로컬 private key 폐기

인스턴스를 종료하기 전에는 canary 로그에서 필요한 비식별 증거만 보존하고 자격증명이나
발신번호 원문이 없는지 다시 확인한다.

## 내선·호전환 후속 canary

기존 문서는 외부 수신과 직접 발신의 검증 기록이다. 내선 통화, 무조건·통화 후 호전환,
실패·복귀 시나리오와 이를 바탕으로 한 통합 상단 카드·브라우저 알림 제품 계약은
[`CENTREX_CALL_ACTIVITY_V2.md`](./CENTREX_CALL_ACTIVITY_V2.md)를 따른다. bridge v0.7.2의
비식별 상대·채널 종류 로그를 통제 배포한 뒤 두 내선의 실제 이벤트 관계를 먼저 확인하며,
그 전에는 `xfercontext` 채널만 보고 호전환 완료나 고객 보류를 추정하지 않는다.
