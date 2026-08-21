# LAW& OS Windows Desktop Notifier

ERP 브라우저를 열어두지 않아도 로그인한 직원 개인의 업무 알림을 Windows 화면 우측 상단의
LAW& OS 업무 카드로 표시하는 개인 알림 클라이언트다. 중앙 Windows 서버의 센트릭스 OCX host와 별도 앱이며,
직원 PC에서 외부 인바운드 포트를 열거나 웹훅 서버로 동작하지 않는다.

## 현재 범위

- ERP가 발급한 5분짜리 1회용 코드로 현재 Windows PC 연결
- 기기별 bearer token을 Windows 자격 증명 관리자에만 저장
- Gateway에 5초 간격의 HTTPS outbound polling
- 전달 ID 로컬 최근 원장과 Gateway ACK로 중복 표시 억제
- 상담·문자·후기·고객전화·내선·호전환을 색·크기·필드가 다른 자체 업무 카드로 구분
- 동시에 최대 3장을 표시하고 초과 알림은 한 장의 집계 카드로 묶음
- 일반 업무 카드는 25~30초 뒤 닫고, 실시간 전화 카드는 직접 닫거나 서버 만료 시각(최대 2분)에 정리
- 카드 버튼 클릭 시 해당 전달 건의 same-origin ERP 상세 화면으로 이동
- 공식 Windows session lock과 10분 키보드·마우스 부재를 감지해 고객 카드 표시를 멈추고,
  복귀 시 놓친 종류별 건수를 요약 카드 한 장으로 표시
- 트레이에서 상태 확인, ERP 설정 열기, 서버·로컬 기기 연결 해제, 명시적 종료
- 단일 `Setup.exe`로 사용자별 설치, 바탕화면·시작 메뉴 바로가기와 현재 사용자 자동 시작 등록
- Windows `설정 → 앱 → 설치된 앱`에서 일반 프로그램처럼 제거
- 개인 설정에 따른 상담·외부 수신전화·내선/호전환/복귀·문자·후기 자동 알림
- Gateway 재연결 시 durable 업무 원장의 단기 재생과 전달 ID 기반 중복 방지

알림 payload는 서버 DB에서 직원별 AES-GCM 암호문으로만 보관되고, Windows 앱은 표시 뒤
고객명·전화번호·본문을 파일이나 로그에 남기지 않는다. 공개 연결 API는 일회용 코드와
네트워크의 HMAC 지문 기준 반복 시도를 제한한다. 조직용 Authenticode 서명·정식 배포와
macOS 클라이언트는 후속 단계다.

## Windows 빌드

Windows 10/11의 .NET Framework 4.8 x64 compiler만 사용하며 NuGet 설치가 필요 없다.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\build.ps1 -Configuration Release
```

로컬 WSL 개발 서버를 검증할 때는 Windows에서 접근할 loopback 주소를 기본값으로 넣는다.

```powershell
.\build.ps1 -Configuration Debug `
  -DefaultGatewayBaseUrl 'http://localhost:3022' `
  -DefaultErpBaseUrl 'http://localhost:3021'
```

실행 파일 self-test 뒤 `artifacts\<Configuration>`에 직원에게 바로 전달할 단일
`Lawand.DesktopNotifier-v0.1.0-Setup.exe`와 보관용 ZIP을 만든다. Setup 안에는 본 프로그램,
제거 프로그램, ERP·Gateway 운영 기본값이 들어 있다. 운영 후보는 조직 코드 서명 인증서로
세 실행 파일 모두에 Authenticode 서명과 timestamp를 적용한다.

Debug 빌드는 실제 연결 없이 여섯 카드와 부재중 요약을 확인할 수 있는 개발용
`Lawand.DesktopNotifier.PopupPreview.exe`도 만든다. 인자는 `consultation`, `message`,
`review`, `phone`, `internal`, `transfer`, `summary`, `test` 중 하나다.

`install.ps1`과 `uninstall.ps1`은 이전 개발 빌드를 복구할 때만 쓰는 호환용 파일이며 직원용
패키지에는 포함하지 않는다.

```powershell
.\build.ps1 -Configuration Release `
  -CodeSigningCertificateThumbprint '<certificate-thumbprint>'
```

## 직원 PC 설치와 연결

ERP에서 받은 `Lawand.DesktopNotifier-Setup.exe`를 더블클릭하고 `설치`를 누른다. 관리자 권한이나
PowerShell 명령은 필요 없다. 기본값으로 바탕화면 바로가기, Windows 로그인 자동 실행, 설치 후
즉시 실행이 선택된다. 기존 버전 위에 다시 설치해도 연결 코드와 개인 설정은 유지된다. 서명 전
개발 빌드는 법무법인 로앤의 통제된 테스트 PC에서만 사용한다.

1. ERP `관리 → PC 알림 설정`에서 `이 컴퓨터 연결`을 누른다.
2. 5분짜리 코드를 복사해 Windows 연결 창에 붙여넣는다.
3. ERP에서 연결 기기와 최근 접속을 확인하고 `테스트 알림 보내기`를 누른다.
4. 우측 상단 업무 카드의 열기 버튼을 눌렀을 때 같은 ERP origin의 설정 화면이 열리는지 확인한다.

Gateway·ERP 주소는 HTTPS만 허용하고 로컬 개발에서는 `localhost` HTTP만 예외다. 서버가
전달한 이동 URL도 설정된 ERP와 scheme·host·port가 모두 같을 때만 연다.

## 로컬 보관과 제거

- 기기 token: Windows Credential Manager의
  `Lawand/DesktopNotifier/v1/<gateway-authority>` generic credential
- 비밀이 아닌 설정·최근 전달 ID 최대 100개:
  `%LOCALAPPDATA%\Lawand\DesktopNotifier\settings.json`
- 고객명·전화번호·본문은 파일이나 로그에 저장하지 않는다.

연결 해제는 트레이 메뉴 또는 ERP 기기 목록에서 실행한다. 프로그램 제거는 Windows
`설정 → 앱 → 설치된 앱 → LAW& OS 알림 → 제거`에서 하며, 제거 프로그램이 자동 시작,
바탕화면·시작 메뉴 바로가기, 로컬 설정과 해당 Gateway 자격 증명을 정리한다. 서버의 기기
목록은 ERP에서 별도로 연결 해제할 수 있다.
