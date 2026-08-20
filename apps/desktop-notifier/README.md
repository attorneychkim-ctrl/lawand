# LAW& OS Windows Desktop Notifier

ERP 브라우저를 열어두지 않아도 로그인한 직원 개인의 업무 알림을 Windows 우측 알림
영역에 표시하는 1차 클라이언트다. 중앙 Windows 서버의 센트릭스 OCX host와 별도 앱이며,
직원 PC에서 외부 인바운드 포트를 열거나 웹훅 서버로 동작하지 않는다.

## 1차 범위

- ERP가 발급한 5분짜리 1회용 코드로 현재 Windows PC 연결
- 기기별 bearer token을 Windows 자격 증명 관리자에만 저장
- Gateway에 5초 간격의 HTTPS outbound polling
- 전달 ID 로컬 최근 원장과 Gateway ACK로 중복 표시 억제
- Windows `NotifyIcon` 기반 우측 알림과 클릭 시 same-origin ERP 상세 이동
- Windows session lock 중에는 payload를 보유하되 화면에는 고객 내용을 숨김
- 트레이에서 상태 확인, ERP 설정 열기, 서버·로컬 기기 연결 해제, 명시적 종료
- 현재 사용자 로그인 시 HKCU 자동 시작

이번 버전은 ERP의 `테스트 알림`만 실제로 받는다. 상담·전화·문자·후기 이벤트 자동 연결과
개인별 선택 저장, 조직용 Authenticode 서명·정식 배포는 후속 단계다.

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

실행 파일 self-test 뒤 `artifacts\<Configuration>`에 exe와
`Lawand.DesktopNotifier-v0.1.0-win-x64.zip`을 만든다. 운영 후보는 조직 코드 서명
인증서로 Authenticode 서명과 timestamp를 적용한다.

```powershell
.\build.ps1 -Configuration Release `
  -CodeSigningCertificateThumbprint '<certificate-thumbprint>'
```

## 개발용 설치와 연결

ZIP을 푼 일반 사용자 PowerShell에서 실행한다. 서명 전 개발 빌드는 통제된 PC에서만
명시적으로 허용한다.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1 -AllowUnsigned
```

1. ERP `관리 → PC 알림 설정`에서 `이 컴퓨터 연결`을 누른다.
2. 5분짜리 코드를 복사해 Windows 연결 창에 붙여넣는다.
3. ERP에서 연결 기기와 최근 접속을 확인하고 `테스트 알림 보내기`를 누른다.
4. 우측 알림을 클릭했을 때 같은 ERP origin의 설정 화면이 열리는지 확인한다.

Gateway·ERP 주소는 HTTPS만 허용하고 로컬 개발에서는 `localhost` HTTP만 예외다. 서버가
전달한 이동 URL도 설정된 ERP와 scheme·host·port가 모두 같을 때만 연다.

## 로컬 보관과 제거

- 기기 token: Windows Credential Manager의
  `Lawand/DesktopNotifier/v1/<gateway-authority>` generic credential
- 비밀이 아닌 설정·최근 전달 ID 최대 100개:
  `%LOCALAPPDATA%\Lawand\DesktopNotifier\settings.json`
- 고객명·전화번호·본문은 파일이나 로그에 저장하지 않는다.

연결 해제는 트레이 메뉴 또는 ERP 기기 목록에서 실행한다. 제거 전 트레이에서 연결 해제를
권장하며, `uninstall.ps1`도 자동 시작·shortcut·설정·해당 Gateway 자격 증명을 정리한다.
