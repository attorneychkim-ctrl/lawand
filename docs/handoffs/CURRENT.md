# 현재 인수인계 — 2026-08-21

이 문서는 다음 세션이 바로 이어갈 **현재 상태만** 유지한다. 완료 작업의 세부 이력은 월별
원장과 `docs/archive/`에서 찾고, 여기에 배포 연대기를 누적하지 않는다.

## 운영 기준선

- 최신 Linux 운영 애플리케이션 소스는
  `34fc13d1e1a42126613749cfc295baea4b9885c3`이다. main에 통합된 최신 애플리케이션 commit
  `b95621a6506fad02f8d825e3462d221415782e27`은 Windows 개인 알림 설치 스크립트의 PowerShell
  5.1 인코딩 보정만 추가했으며 Linux 운영 앱에는 전환하지 않았다. 실제 원격 HEAD는
  `git rev-parse origin/main`으로 확인한다.
- 최신 운영 릴리스는 `20260820T094820Z-six-worktrees-v1`이며 홈페이지·ERP·gateway를 같은
  릴리스 ID와 immutable digest로 전환했다.
  - homepage `sha256:26c2969026cd618d44bbfb0d97462e0da8d98092155b10fb87c4f6993d1e7a16`
  - ERP `sha256:527c57b3007e4e381a746961bd1fbd721e633e02bf4ae69d998a0d0f0ed70c74`
  - gateway `sha256:c2ca002dca9462459323a0030418ff13552abbe66087bff779748fa5f1e8a99d`
- 운영 DB migration은 74개(`0000..0073`)다. 최신 두 해시는
  `dca900abf3b0298920774d2548e82059663c411c1a99490838fc34a647982f0d`·
  `0448f39922e61c360cd0417a867c194be0812d6c60254da04b06ee47675b3c36`이며 암호화 snapshot
  `lawand-prod-pre-six-worktrees-20260820t094820z` 뒤 적용·재실행 no-op을 확인했다.
- 정식·EIP 세 앱 endpoint는 각각 3회 연속 200, 앱·Caddy active, restart·error journal 0,
  env 600이다. request/LISTEN waiting은 네 표본 모두 `0/20`·`0/5`, CloudWatch는
  OK 14·ALARM 0·INSUFFICIENT_DATA 0이다.
- 최신 main Actions `32432686543`은 전체 소스 검증과 세 ARM64 이미지 게시에 성공했다. 경로
  필터로 새 이미지가 생성됐지만 EC2에는 적용하지 않았고, 운영 릴리스의 Actions
  `32354715262`·`32354715274`와 기존 digest·scan 기준은 그대로다.

## 현재 제품 상태

- 홈페이지·ERP·gateway와 Route 53 정식 도메인은 운영 중이다.
- 내선 발신 직원 상세, 홈페이지 예약 상담의 담당자 재통화 업무·정시 브라우저 알림은
  운영 반영됐다.
- 기존 개인 웹훅 미리보기는 관리자 전용 개인 Windows PC 알림으로 교체해 운영 반영했다.
  5분 pairing·개인별 9개 설정·실제 내부 이벤트 생산자는 활성 코드지만, unsigned client는
  운영 artifact로 제공하지 않으며 일반 직원에게 아직 공개하지 않는다. 통제 사용자 1인
  canary의 unsigned client 설치는 PowerShell 5.1 한글 바로가기 인코딩 보정 뒤 완료했고,
  pairing 이후 실제 알림 acceptance는 남아 있다. `LegalFlow/web_hook`에는 OS balloon을
  상담·문자·후기·고객전화·내선·호전환별 자체 우측 상단 카드로 교체하고 잠금·10분 부재·
  화면 초과분을 한 장으로 묶는 후속 후보가 있다. 브라우저 알림 자체는 유지하되 ERP 상단의
  앱 전용 허용·차단 버튼은 제거하고 브라우저 사이트 권한만 개인 선택 기준으로 삼았다. 이
  후보는 아직 main·운영 설치본에는 반영하지 않았다.
- GA4 운영 Measurement ID·무팝업 측정과 `generate_lead` 주요 이벤트 표시는 활성화됐다.
  Google Ads·네이버 광고 연결, 광고 개인화, 자동 입찰은 시작하지 않았다.
- 공용 센트릭스 SMS/LMS는 `070-4607-0588` 발신·mailbox snapshot 기준으로 운영 반영됐다.
  SOLAPI JPG MMS는 `02-555-7455` 발신 경계를 유지한다.
- 운영 배포는 GitHub Actions의 ARM64 ECR 이미지와 immutable digest만 표준 경로로 사용한다.

## 활성 우선순위·승인 대기

1. 홈페이지 공개 콘텐츠·운영정보, 개인정보 처리위탁·파기, 실무진 공개 동의를 최종 검수한다.
2. 자가진단·공개 사례의 과거 사건 이용 근거, 희소 조합 일반화, 공개·철회 정책과 책임
   변호사 문구 심사를 완료하기 전에는 자동 공개 범위를 넓히지 않는다.
3. ERP 인증의 이메일 재설정·비활성화 UI·MFA/SSO·외부 rate limit을 설계한다.
4. `existing_case`로 연결한 기존 사건 문의도 ERP 변경 버튼과 gateway `changeManager`
   명령에서 처리하도록 기존 `case_idx` 연결 원장·외부 성공 후 확정 경계를 보강한다.
5. 리걸프렌즈 외부 멱등성·응답 유실 운영 절차와 연결 사건 고객명 5분 이내 동기화 경로를
   확정한다. 현재 PostgreSQL `CB` 미러는 일일 동기화다.
6. SOLAPI IP 허용 범위·최종 발송 결과 소비자와 실패 알림, 통제 JPG MMS 수신을 검증한다.
7. 센트릭스 일반 내선·무조건/통화 후 호전환·실패 복귀 acceptance를 재수행한다. 제공자
   근거가 없는 B/customer final leg는 계속 `확인 필요`로 두고 추정하지 않는다.
8. Windows bridge 조직용 Authenticode 인증서를 도입하고 실제 배정 증가 전 메모리 여유를
   재확인한다.
9. 네이버 예약 기준점 이후 실제 신규 메일 접수 canary와 카카오 운영자 확인 흐름을 별도
   승인 아래 수행한다.
10. 개인 PC 알림 client는 자체 카드 후보를 main에 통합한 뒤 통제 사용자 1인의 실제 상담·
    문자·전화·내선·호전환, 잠금·부재 요약과 정확한 ERP 이동 acceptance를 마친다. 그 다음 조직
    Authenticode 서명·timestamp와 정식 artifact 채널을 마련한 뒤 일반 직원에게 공개한다.
11. OpenAI Realtime STT는 내부 PoC·보관/동의·사람 검토 경계를 확정한 뒤 시작한다.

## 세션 운영 메모

- 현재 작업 관리 기준은 **Orca이며 HERDR가 아니다**. Orca 앱 `1.4.185`와 runtime은
  ready/reachable이며, `main`과 완료 상태 `web_hook` 워크트리를 대조했다.
- `web_hook`의 후속 PowerShell 인코딩 hotfix를 `main`에 통합·푸시했고 모든 원격 작업 HEAD는
  현재 main ancestor다. Linux 운영 코드·migration 변화가 없어 새 ECR 이미지는 게시만 하고
  EC2 전환·snapshot·DB 작업은 하지 않았다.
- 같은 `web_hook` 워크트리의 후속 자체 PC 알림 카드 구현·검증은 완료됐다. 구현 commit
  `48b234552bb279635e8020b2189ab3f731a1643f`을 원격 `LegalFlow/web_hook`에 푸시하고 Orca를
  `completed`로 전환했으며, 아직 main 병합·운영 배포 대상으로 반영하지 않았다.
- 로컬 `lawand-prod` AWS 세션은 2026-08-21 확인 시 만료 상태다. 다음 AWS 작업 전
  `aws login --profile lawand-prod`가 필요하다.
- 다음 작업 전에 `PROJECT_PLAN.md`, 이 문서, 해당 분야의 상세 문서만 읽는다.
