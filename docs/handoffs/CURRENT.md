# 현재 인수인계 — 2026-08-20

이 문서는 다음 세션이 바로 이어갈 **현재 상태만** 유지한다. 완료 작업의 세부 이력은 월별
원장과 `docs/archive/`에서 찾고, 여기에 배포 연대기를 누적하지 않는다.

## 운영 기준선

- Git `main`: `bfe1519af7b060907b3531965e7800d85957b312`.
- 최신 통합 코드 기준: `f8bd74d04ac240fe6c9ed02759b795b069140559`.
- 최신 운영 릴리스: `20260820T034100Z-three-worktrees-v1`.
  - gateway·ERP를 같은 릴리스 ID로 전환했다.
  - 홈페이지는 직전 GA4 무팝업 운영 digest를 유지한다.
- 운영 DB migration: 72개, 최신 `0071_consultation_schedule_follow_up.sql`.
  - 최신 해시: `a660aff7b7a39d5b9fde99a9fe3cb8b62d5459bc37fde1c89d78296e5bf080e9`.
  - 운영 적용 및 재실행 no-op을 확인했다.
- 최신 릴리스 검증 시 정식·EIP gateway health와 ERP 로그인은 3회 연속 200, 앱·Caddy
  active, restart 0, error journal 0이었다. 최종 request/LISTEN waiting은 `0/20`·`0/5`,
  CloudWatch는 OK 14·ALARM 0이었다.
- GitHub Actions 검증 run `32328367486`과 전체 5패키지 test·typecheck·lint·production
  build, DB schema check가 성공했다.

## 현재 제품 상태

- 홈페이지·ERP·gateway와 Route 53 정식 도메인은 운영 중이다.
- 내선 발신 직원 상세, 홈페이지 예약 상담의 담당자 재통화 업무·정시 브라우저 알림은
  운영 반영됐다.
- ERP 개인 웹훅 설정은 관리자 전용 **비활성 미리보기**다. 저장 API·DB·실제 웹훅 전송은
  없으며 일반 직원에게 공개하지 않는다.
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
4. 리걸프렌즈 외부 멱등성·응답 유실 운영 절차와 연결 사건 고객명 5분 이내 동기화 경로를
   확정한다. 현재 PostgreSQL `CB` 미러는 일일 동기화다.
5. SOLAPI IP 허용 범위·최종 발송 결과 소비자와 실패 알림, 통제 JPG MMS 수신을 검증한다.
6. 센트릭스 일반 내선·무조건/통화 후 호전환·실패 복귀 acceptance를 재수행한다. 제공자
   근거가 없는 B/customer final leg는 계속 `확인 필요`로 두고 추정하지 않는다.
7. Windows bridge 조직용 Authenticode 인증서를 도입하고 실제 배정 증가 전 메모리 여유를
   재확인한다.
8. 네이버 예약 기준점 이후 실제 신규 메일 접수 canary와 카카오 운영자 확인 흐름을 별도
   승인 아래 수행한다.
9. 개인 웹훅은 저장·비밀값 보호·재시도·서명·감사·SSRF 방어·이벤트 개인정보 최소화가
   완성되기 전까지 미리보기 상태를 유지한다.
10. OpenAI Realtime STT는 내부 PoC·보관/동의·사람 검토 경계를 확정한 뒤 시작한다.

## 세션 운영 메모

- 이 저장소의 관리자는 HERDR다. 이 문서 압축 세션에서는 `HERDR_ENV`가 비어 있고 HERDR
  서버가 실행 중이 아니어서 Git worktree와 원격 브랜치만 읽기 전용으로 대조했다.
- 작업 브랜치는 `LegalFlow/project_md_compact`다. 이 브랜치에서는 문서 구조 개편·검증·
  commit·push까지만 수행하고 main 병합이나 운영 배포를 하지 않는다.
- 다음 작업 전에 `PROJECT_PLAN.md`, 이 문서, 해당 분야의 상세 문서만 읽는다.
