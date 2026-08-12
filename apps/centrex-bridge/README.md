# Lawand Centrex Bridge

LG U+ 고급형 센트릭스 A타입의 32비트 OpenAPI OCX를 상시 호스팅하는 Windows 전용
프로그램이다. 진단 HTA를 운영에 재사용하지 않고 다음 조건을 코드와 설치 절차로 고정한다.

- x86 프로세스, STA 주 스레드, WinForms `AxHost`, Windows 메시지 루프
- 한 Windows 서버 안에서 회선별 x86 프로세스 하나를 실행하고, 로그인 결과의 내선·회선
  끝자리를 검증
- 인스턴스별 설정·로그·DPAPI 큐·mutex·작업 스케줄러 격리
- 최대 50개 논리 슬롯을 미리 준비하되 배정된 슬롯과 유휴 warm pool 5개만 상시 실행
- 센트릭스 네트워크 오류·health check 기반 지수 backoff 재연결
- 재접속·명시적 연결 해제·프로세스 종료 전에 메모리의 활성 수신·발신을 각각
  `ended` 보정 이벤트로 내구 큐에 넣은 뒤 상태를 비움
- 비밀번호는 Windows 자격 증명 관리자에만 저장
- 발신번호는 로컬 로그와 트레이 알림에서 끝 4자리만 표시
- 수신과 센트릭스 직접 발신 이벤트는 현재 Windows 사용자 DPAPI로 암호화한 디스크 큐에 먼저 저장하고,
  gateway 성공 응답 뒤에만 삭제
- gateway가 영구 거부한 400/404/409/422 이벤트는 1분 동안 재시도한 뒤 DPAPI 암호문
  dead-letter로 격리해 후속 정상 이벤트의 전달을 막지 않음
- HTTPS 서버 인증과 요청별 HMAC-SHA256·5분 시각창·난수 nonce로 gateway에 전달
- Windows 공용 proxy를 우회한 고정 gateway 직접 연결과 TLS 1.2 사용
- 무응답 수신은 3분 안에서 같은 provider ID 또는 같은 prefix의 인접 sequence만 같은
  통화로 판정하고, 연결된 통화는 `CHANNELLIST`의 양쪽 channel ID를 종료까지 추적
- `RINGEVENT(ISDIAL=1)`은 상대 `CALLERID`를 직접 발신으로 기록하고 수신과 분리된
  `outbound.ringing → outbound.connected → outbound.ended` 계약으로 전달
- 기존 외부 수·발신 v1 계약은 유지하고, 4자리 내선과 호전환도 v2 관측 계약으로
  `RINGEVENT`·`CHANNELLIST`·`CHANNELOUT`의 root/adjacent/source 문맥을 gateway에 전달
- 내선·호전환 canary용 진단 로그는 전화번호 원문이나 raw OCX payload 대신 상대 종류
  (`internal/external`)와 채널 종류(`sip/pjsip/local/local_xfer`)만 기록
- gateway의 전화 받기 명령을 0.75초 간격의 서명된 polling으로 가져오며 전화번호는
  명령 payload에 포함하지 않음
- `Answer()`는 현재 활성 수신 unique ID가 명령의 provider ID와 맞을 때만 호출하고,
  실행 결과를 같은 HMAC 경로로 멱등 보고
- 직원관리의 회선 저장 명령을 같은 서명 polling으로 받아 자격증명 관리자와 endpoint
  설정을 원자적으로 교체하고, 실제 OCX 로그인 회선·내선이 일치해야 성공으로 보고
- 신규 직원은 온라인 유휴 슬롯을 gateway가 원자적으로 하나만 점유한다. 전체 070 로그인
  ID가 OCX에서 `NotFound(-1)`일 때만 내선 PBX ID로 한 번 재시도하고, 어느 경로든 반환된
  전체 회선·내선이 모두 일치해야 연결을 확정
- 회선 교체 중 활성 통화가 있거나 로그인·본인 확인·제한 시간 검증이 실패하면 이전
  자격증명과 endpoint 설정으로 자동 복구. 신규 배정 실패 슬롯은 다시 유휴 풀로 반환
- 로그인된 전용 Windows 사용자 세션에서 작업 스케줄러로 자동 시작·실패 재시작
- SYSTEM health monitor가 배정 bridge heartbeat·로그인 실패·DPAPI 큐·감독기·warm pool을
  1분마다 점검하고 CloudWatch `Lawand/CentrexBridge`에 비식별 metric 발행

현재 단계에서는 센트릭스 연결, 수신·직접 발신 이벤트 호스팅, gateway 전송과 ERP의
명시적 `전화 받기` 명령을 활성화한다. 브리지에는 자동 받기 UI가 없으며 ERP에서 회선
소유자가 누른 현재 수신 한 건만 처리한다. OpenAPI가 직접 발신의 단말 종류를 별도로
제공하지 않으므로 ERP 클릭투콜 원장과 연결되지 않은 발신은 `센트릭스 직접 발신`으로
관리한다. 실물 전화기와 U+ 비즈콜 앱의 표시 구분은 비즈콜 실제 canary 뒤 확정한다.
gateway는 bridge와 U+ callback 양쪽의 새 ring을 endpoint advisory lock으로 직렬화하고,
같은 회선에 남아 있는 다른 `ringing/connected` 원장을 `SUPERSEDED_BY_NEW_CALL`로 종료한다.
따라서 재접속 보정 이벤트가 유실되더라도 ERP에는 회선당 활성 통화가 하나만 남는다.
실제 무응답 canary에서 `RINGEVENT`와 `CHANNELOUT`의 provider ID가 인접 sequence의
서로 다른 leg로 전달되는 것을 확인해 위 제한 규칙을 적용했다.
실제 받기 canary에서는 최초 수신 ID와 전화기 쪽 연결 channel ID의 prefix·sequence가
서로 달랐다. 따라서 연결 시 두 channel ID를 모두 보존하고 어느 쪽 `CHANNELOUT`이 와도
최초 수신 통화의 `ended`로 전달한다. 연결된 통화에는 무응답용 3분 제한을 적용하지 않는다.

## 빌드

Windows Server 2022의 .NET Framework 4.8 x86 C# compiler만으로 빌드할 수 있다.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\build.ps1 -Configuration Release
```

실행 파일과 self-test는 `artifacts\Release`에 생성된다. 운영 배포본은 조직의 코드 서명
인증서 thumbprint를 넘겨 Authenticode 서명과 timestamp를 적용한다.

```powershell
.\build.ps1 -Configuration Release `
  -CodeSigningCertificateThumbprint '<certificate-thumbprint>'
```

서명 없는 빌드는 통제된 canary에서만 설치 스크립트의 `-AllowUnsignedBridge`로 허용한다.

## 설정과 자격 증명

`config/bridge.example.json`을 복사해 환경별 설정을 만든다. 실제 센트릭스 ID와 비밀번호는
JSON에 넣지 않는다. 다중 인스턴스 설정은
`C:\ProgramData\Lawand\CentrexBridge\instances\<bridge-id>\bridge.json`에 따로 둔다.
`expectedExtension`은 내선 전체 또는 검증할 suffix, `expectedLineLast4`는 회선 끝 네 자리다.
`gatewayUrl`은 HTTPS의 정확한 `/v1/centrex-bridge/events` 경로만 허용하며,
`gatewayCredentialTarget`에는 센트릭스 로그인과 별개의 bridge HMAC secret을 보관한다.

설치 후 브리지를 실행할 동일한 Windows 사용자로 자격 증명 입력창을 한 번 연다.

```powershell
& 'C:\Program Files (x86)\Lawand\CentrexBridge\Lawand.CentrexBridge.exe' `
  --config 'C:\ProgramData\Lawand\CentrexBridge\instances\<bridge-id>\bridge.json' `
  --provision-credential
```

비밀번호는 Windows Credential Manager generic credential로 저장되고 로그·설정·명령행에
남지 않는다.

gateway secret도 같은 Windows 사용자 자격 증명 관리자에 별도 저장한다. AWS EC2 canary는
인스턴스 역할이 bridge registry secret을 읽을 수 있을 때 아래의 일회성 가져오기를 사용할
수 있다. registry는 bridge ID별 endpoint ID와 HMAC secret만 가지며 센트릭스 ID·비밀번호를
포함하지 않는다. 실행 파일이 AWS CLI 표준출력을 프로세스 메모리에서만 읽어 검증하고
자격 증명 관리자에 저장하며 secret 원문을 인수·로그·파일에 남기지 않는다. 풀 설치가
끝나면 Windows 역할의 임시 registry·아티팩트 읽기 권한을 제거한다.

```powershell
& 'C:\Program Files (x86)\Lawand\CentrexBridge\Lawand.CentrexBridge.exe' `
  --config 'C:\ProgramData\Lawand\CentrexBridge\instances\<bridge-id>\bridge.json' `
  --provision-gateway-from-aws-secret `
  'lawand/prod/centrex-bridge/registry-v1'
```

일반 Windows 환경에서는 `--provision-gateway-credential` 입력창으로 bridge ID와
base64 32바이트 secret을 직접 안전하게 저장할 수 있다.

## 실행 모델

OCX는 서비스의 session 0에서 단순 COM 객체로 생성하면 정상 초기화되지 않았다. 설치
스크립트는 `Run only when user is logged on`에 해당하는 interactive logon task를 만든다.
전용 저권한 사용자가 로그인한 세션을 유지해야 하며, RDP 창은 로그아웃하지 않고
연결만 끊는다. 현재는 보안 검토 없는 무인 자동 로그온을 도입하지 않으며 운영 서버에는
`AutoAdminLogon`이 없고 평문 암호를 저장하지 않는다. 따라서 재부팅 뒤 SYSTEM health
monitor와 오프라인 경보는 자동으로 살아나지만, bridge와 pool supervisor는 관리자가 RDP로
로그인해야 시작한다. 2026-08-10 실제 재부팅 canary는 로그인 전 배정 오프라인·감독기 이상·
warm 부족 경보의 `ALARM` 전환과 Administrator RDP 로그인 뒤 배정 6개+warm 5개 자동 복구,
전체 경보 `OK` 복귀를 확인했다. 로그인 뒤에는 RDP 창을 로그아웃하지 않고 연결만 끊는다.

트레이 아이콘을 더블클릭하면 연결 상태와 비식별 로그를 확인할 수 있다. 창의 X는
프로그램을 종료하지 않고 다시 트레이로 숨긴다. 종료는 트레이 메뉴에서 명시적으로 한다.
풀 슬롯은 트레이 아이콘을 표시하지 않는다.

OCX 한 인스턴스는 로그인 한 개만 안정적으로 관측하므로 회선별 프로세스는 유지하되,
직원별 Windows 서버를 만들지는 않는다. `Lawand Centrex Bridge Pool Supervisor`가 매분
설정을 읽어 배정된 모든 슬롯을 실행하고 유휴 슬롯은 기본 5개까지만 warm 상태로 유지한다.
직원 저장으로 warm 슬롯 하나가 배정되면 다음 주기에 정지된 슬롯 하나를 새 유휴 슬롯으로
시작한다. 따라서 평소 프로세스 수는 `별도 기존 회선 + 배정된 풀 회선 + 유휴 5개`다.

## 설치

공식 `LGUBaseOpenApi.ocx`를 CAB에서 추출한 뒤 관리자 PowerShell에서 실행한다.
설치기는 OCX가 x86이고 BMLINK Authenticode 서명이 유효한지 확인하고, 브리지 실행 파일의
x86 여부와 서명을 확인한 뒤 WOW64 OCX 등록과 로그인 트리거를 구성한다.

```powershell
.\install.ps1 `
  -BridgeExecutable '.\artifacts\Release\Lawand.CentrexBridge.exe' `
  -ConfigurationPath '.\bridge.json' `
  -OcxPath '.\LGUBaseOpenApi.ocx' `
  -RunAsUser 'SERVER\centrex-bridge'
```

한 서버에 논리 슬롯 풀을 설치할 때는 같은 interactive Windows 사용자로 관리자
PowerShell에서 아래처럼 실행한다. `InstallOffset`·`InstallLimit`은 중단된 설치를 이어갈
때만 사용한다.

```powershell
.\install-pool.ps1 `
  -BridgeExecutable '.\artifacts\Release\Lawand.CentrexBridge.exe' `
  -OcxPath '.\LGUBaseOpenApi.ocx' `
  -GatewayUrl 'https://gateway.example.com/v1/centrex-bridge/events' `
  -RegistrySecretId 'lawand/prod/centrex-bridge/registry-v1' `
  -MaximumSlots 50 `
  -WarmIdleSlots 5 `
  -RunAsUser 'SERVER\centrex-bridge'
```

진단 로그는 각 인스턴스의 `instances\<bridge-id>\logs`에 날짜별로 저장하고 기본 14일 뒤
삭제한다. gateway 대기 이벤트는 같은 인스턴스의 `gateway-queue`에 현재 사용자 DPAPI
암호문으로만 저장하고 기본 7일 뒤 만료한다. 영구 거부 이벤트는
`gateway-dead-letter`에 같은 암호문으로 격리한다. raw OCX 이벤트, 비밀번호, 발신번호 원문,
gateway 응답 본문은 기록하지 않는다. 운영자가 원인 조사 후 보존해야 하는 암호문은
`gateway-dead-letter-archive`로 이동하며 평문으로 풀어 저장하지 않는다.

bridge v0.7.2의 상대·채널 종류 로그로 내선과 호전환의 실측 관계를 확정했다. v0.8.0
은 같은 비식별 필드를 v2 관측 이벤트로 전달한다. 기존 외부 수·발신 v1은
병행해 호환성을 유지하고, 정상 무조건 호전환의 원수신 회선 불일치는 v2 전용 엄격한
상관 경계에서만 수용한다. 통화 후 호전환의 최종 고객 leg처럼 증거가 부족한 관계는
`호전환 확인 필요`로 남기며 `local_xfer`나 종료 cause만으로 완료를 추정하지 않는다.

v0.8.1 출시 후보는 v2 `call.ringing`에서 `callerNumber` 유무와 관계없이
`incomingLineNumber`를 독립 직렬화한다. v2는 caller 원문을 보내지 않으므로 두 필드를 같은
조건문으로 묶으면 gateway 필수 수신 회선이 누락돼 HTTP 400과 영구 dead-letter가 생긴다.
C# self-test와 core schema test가 inbound v2의 수신 회선 존재와 caller 원문 부재를 양쪽에서
고정한다. 결함이 들어간 과거 dead-letter는 필드가 이미 소실돼 그대로 재처리하지 않는다.
병행 v1 원장을 migration `0048_centrex_v2_ringing_recovery.sql`로 승격한 뒤 암호문 hash를
검증해 archive한다.

## 운영 점검과 부하시험

`install-pool.ps1`은 supervisor와 함께 `Lawand Centrex Bridge Health Monitor` SYSTEM 작업을
부팅·1분 주기로 등록한다. 최신 비식별 상태는
`C:\ProgramData\Lawand\CentrexBridge\pool-health.json`에서 확인한다. 기본 CloudWatch
metric은 `AssignedOffline`, `LoginFailures`, `DpapiQueueDepth`, `SupervisorHealthy`,
`RunningBridges`, `WarmIdleRunning`이며, v0.8.1부터 실제 재시도 대기분 `QueueDepth`와 영구
거부분 `DeadLetterDepth`도 별도로 발행한다. `DpapiQueueDepth`는 두 값의 합인 기존 경보
호환 metric이다. 운영 경보는 두 세부 metric을 분리해 원인과 조치를 구분하고 합계 경보는
전환 기간 동안만 호환용으로 유지한다.

실부하 canary는 supervisor를 잠시 비활성화하고 10개 10분, 25개 10분, 50개 30분을 5초
간격으로 측정한다. 여유 메모리가 768MB 아래로 떨어지거나 목표 프로세스 수가 60초 동안
유지되지 않으면 즉시 중단하며, 성공·실패와 무관하게 마지막에는 배정 슬롯 전부와 warm
5개를 복구하고 supervisor를 다시 활성화한다.

```powershell
& 'C:\Program Files (x86)\Lawand\CentrexBridge\bridge-load-canary.ps1'
```

운영 t3.medium에서 실제 수·발신이 섞인 2026-08-10 canary는 전 구간 프로세스 유실 없이
통과했다. 50개 구간의 최소 여유 메모리는 939.47MB, 최대 working set은 1347.29MB였으므로
50개에 근접한 실제 배정 전에는 t3.large 상향을 우선 검토한다.
