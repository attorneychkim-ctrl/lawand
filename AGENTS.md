# AGENTS.md — 로앤 통합 플랫폼 (Codex/Claude 공용 온보딩)

**언어 지침(최우선): 사용자에게 보여주는 모든 응답·설명·요약은 무조건 한국어.**
코드/커밋 메시지/식별자, 사용자가 붙여넣은 영어 원문 인용은 예외.

## 시작 전 필수
1. **`PROJECT_PLAN.md`를 먼저 읽어라** — 저장소 구조·아키텍처·설계 결정·오픈 이슈의 단일 소스.
2. 아래 **"작업 인수인계 로그"**를 확인 — 다른 에이전트/세션의 최근 작업 이력(append-only).

## 프로젝트 한 줄 요약
로앤 홈페이지 + 새 ERP + 리걸플로/리걸프렌즈를 하나의 **이벤트 기반 플랫폼**으로 묶어,
고객 전 생애주기를 **최대한 사람 손이 안 타는 자동화**로 흐르게 한다. (상세: `PROJECT_PLAN.md`)

## 현재 상태
- **홈페이지·ERP·gateway AWS 운영 배포와 Route 53 정식 도메인 전환 완료, DNS 전파·안정화 중.**
- 스택 전제: Next.js 16(App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui ·
  TanStack Query, **모노레포(pnpm workspaces + Turborepo)**.
- 이 WSL 환경: node **v22.22.2**, pnpm **11.17.0**(Corepack + 로컬 shim).

## 작업 규칙
- 이 저장소의 워크트리·터미널 관리자는 **HERDR**다. Orca 관리로 가정하거나 Orca 상태를
  인수인계 원장으로 사용하지 않는다. HERDR 세션에서는 `HERDR_ENV=1`을 확인하고
  `herdr worktree list`로 관리 워크트리를 확인한다.
- `main`이 아닌 워크트리 브랜치에서는 구현·검증 뒤 해당 브랜치 커밋과 원격 브랜치
  푸시까지만 수행한다. `main` 머지·`main` 푸시와 실서비스 배포·운영 데이터 변경은
  메인 세션에서만 수행하며, 사용자가 해당 브랜치 세션에 별도로 명시하지 않는 한
  워크트리 브랜치 세션이 선행하지 않는다.
- 여러 워크트리의 완료 작업은 메인 세션에서 승인된 브랜치를 모두 병합한 뒤, 현재
  `main` HEAD를 단일 배포 소스로 삼아 한 번의 통합 릴리스로 배포한다. 배포 전 포함된
  커밋·migration·영향 앱을 대조하고, 서로 맞물린 migration과 gateway·ERP 등은 같은
  릴리스 ID로 함께 적용한다. 이미 별도 긴급 배포된 작업이나 이번 배포에서 제외할 작업은
  인수인계 로그에 명시해 중복·누락 배포를 막으며, `main` 푸시만으로 배포 완료로 간주하지
  않는다.
- 메인 통합 배포 직전에는 HERDR 워크트리 목록과 `origin/worktree/*` 원격 브랜치를 모두
  열거하고, 각 HEAD가 `main`의 ancestor인지 확인한다. 미반영 브랜치는 `병합/명시적 제외/
  진행 중` 중 하나로 기록하기 전에는 아티팩트 생성과 운영 배포를 시작하지 않는다.
- 의미 있는 작업(스캐폴딩, 신규 패키지/앱, DB 스키마, 외부 연동, 배포 등)을 마치면
  아래 **인수인계 로그에 형식 맞춰 새 항목을 append**할 것 — 다음 세션/다른 에이전트가
  이어받는 유일한 경로다.
- 설계 결정이 바뀌면 `PROJECT_PLAN.md`도 함께 갱신(문서가 authoritative source).

### 홈페이지 hydration 예방 규칙 (필수)
- SSR되는 Client Component의 **첫 렌더는 서버와 브라우저에서 완전히 결정적**이어야 한다.
  렌더 본문이나 SSR되는 state 초깃값에 `Date.now()`, `new Date()`, `Math.random()`,
  `window`/`document`, storage, media query, 브라우저 locale 의존값을 직접 쓰지 않는다.
  필요하면 고정 초깃값 또는 서버 snapshot을 렌더하고 mount 뒤 effect에서 갱신한다.
- 태그 중첩과 interactive content 중첩을 유효하게 유지한다. 특히 `button` 안의
  `button`/`a`, `a` 안의 interactive 요소, 문맥에 맞지 않는 block 요소를 만들지 않는다.
- iOS Chrome을 포함한 WebKit의 자동 링크 변환을 막기 위해 루트 metadata
  `formatDetection`의 `telephone`, `date`, `email`, `address` 네 항목을 모두
  `false`로 유지한다. 일부만 빼면 전 페이지 공통 푸터의 연도·운영시간·전화·주소가
  hydration 전에 다른 DOM으로 바뀔 수 있다.
- 현재 시간·브라우저 API처럼 자체 렌더를 결정적으로 만들 수 없는 상호작용 UI만
  `"use client"` loader와 `next/dynamic({ ssr: false })`로 분리한다. 서버 fallback은
  버튼·입력 없이 안정적으로 렌더한다.
- `suppressHydrationWarning`을 페이지 루트나 큰 wrapper에 관성적으로 붙이지 않는다.
  실제 서버/클라이언트 불일치를 숨길 수 있으므로 제3자 속성 주입을 확인한 정확한 leaf
  요소에만 최후 수단으로 사용한다.
- 현재 루트 `<html>`의 `suppressHydrationWarning`은 iPhone Chrome이 hydration 전에
  그 요소에 직접 삽입하는 `__gcrremoteframetoken`을 실제 오류 diff로 확인한 예외다.
  React의 한 단계 제한 덕분에 `body` 이하 불일치는 숨지 않는다. 이 속성을 제거하거나
  범위를 더 넓히지 않는다.
- 브라우저 내부 속성을 지우는 pre-hydration DOM 스크립트나 console 오류 필터를
  우회책으로 넣지 않는다. 공식 metadata 대응과 결정적 렌더를 먼저 적용하고, 경고의
  실제 diff와 component stack을 확인해 정확한 요소를 수정한다.
- 새 상호작용 페이지는 typecheck·lint·build뿐 아니라 모바일 Chrome 실기기 새로고침에서
  console hydration 경고가 없는지 확인한다. client-only 경계를 쓴 경우에는 초기 HTML
  fallback에 의도치 않은 `input`·`select`·`textarea`·`button`이 남지 않았는지도 확인한다.

---

## 작업 인수인계 로그 (append-only, 최신이 위)

### 2026-08-12 — 내선 원장·당겨받기 canonical 통화·호전환 종료 확인 UX 후보
- 운영 원장과 비식별 bridge 관측을 읽기 전용으로 대조했다. 4591→1208 일반 내선은 v2
  root/leg와 정확한 종료가 이미 있었지만 전화데스크가 legacy 수·발신 행만 읽어 목록·상세·
  후처리에 없었다. 4425 수신을 1208이 당겨받은 건은 같은 root의 U+ 연결 176초와 bridge
  `BRIDGE_RING_TIMEOUT` 190초가 별도 행으로 보인 것으로, 1208의 exact provider root→channel
  관측과 종료가 있는 당겨받기였다. 4591 수신 후 1208 통화 후 호전환은 같은 consultation
  provider root/channel의 한쪽만 종료돼 root가 `needs_confirmation`으로 남았고 최종 고객
  leg의 수동 증거가 없어 마지막 통화자를 자동 확정할 수 없었다. 운영 데이터 쓰기·프로세스
  변경은 하지 않았다.
- 전화데스크를 call root 기준 canonical read model로 확장해 일반 내선을 한 원장으로 표시하고
  `직접 발신`과 `진행 중` 사이에 `내선` 필터를 추가했다. 내선은 참여자·내선번호·통화시간을
  표시하고 참여 직원이 `내선 통화 완료/내부 확인 필요/내선 미연결` 후처리와 내부 확인 업무를
  저장할 수 있지만 고객 상담에는 연결하지 않는다. 같은 external root의 U+ 연결 이력과 bridge
  timeout도 연결 근거가 강한 한 행으로 접고 `당겨받기` 배지를 표시한다.
- 실시간 gateway는 호전환 관계가 없는 활성 외부 수신 root와 다른 endpoint의 exact
  `CHANNEL_LIST`만 `call_picked_up`으로 확정한다. 원수신 leg를 `CALL_PICKED_UP`으로 끝내고
  target leg로 현재·최종 통화자를 이동하며 늦은 원수신 timeout이 이를 덮어쓰지 않는다.
  통화 후 호전환의 mirrored consultation leg는 exact 종료를 동기화하고, 모든 관측 leg가
  끝났지만 final actor만 불명확하면 root 통화 상태는 `ended`, correlation은
  `needs_confirmation`으로 분리한다. 상단 ghost 카드는 닫히고 상세에서 실제 직원을 선택하면
  `staff_resolved` 관계·감사 로그를 남긴 뒤 그 직원의 후처리가 열린다.
- enum migration `0051`과 exact-evidence 복구 migration `0052`를 분리했다. 운영형 임시 DB에
  당겨받기와 호전환 fixture를 넣어 pickup 한 root/관계, mirrored 3개 leg 종료,
  terminal-but-unresolved root를 확인했고 migration 재실행도 멱등 통과한 뒤 임시 DB를 삭제했다.
  전체 5패키지 typecheck·lint·production build, core 68개·gateway 117개 테스트, DB schema
  check와 `git diff --check`를 통과했다. `PROJECT_PLAN.md`는 v1.21이다. 이 워크트리에서는
  main 병합·운영 migration·gateway/ERP 배포·운영 원장 변경을 수행하지 않았으며 운영 반영은
  `0051`·`0052`·gateway·ERP를 같은 통합 릴리스로 배포한 뒤 세 실통화 회귀 canary로 확인한다.

### 2026-08-12 — 나머지 워크트리 main 통합·0049/0050·v0.8.3 전체 운영 배포
- `HERDR_ENV=1`에서 main과 HERDR worktree 5개, 원격 `origin/worktree/*` 19개를 전수
  대조했다. 미반영이던 `brave-cloud-9c88`의 Cafe24 구 DNS 안전 문서는 merge commit
  `60eab28`, `rapid-meadow-adae`의 카카오 이름 필수·기존고객 배지 UX는 `7f5db3b`,
  `clear-river-b502`의 고객찾기 신건·소개 상담과 migration `0050`은 `ae46b5b`로 main에
  병합·push했다. 배포 직전 여섯 작업 트리가 모두 깨끗하고 원격 worktree 19개 HEAD가 전부
  main ancestor임을 확인했으며 단일 배포 소스는 `ae46b5b`다.
- 전체 5패키지 typecheck·lint·production build, core 66개·gateway 115개 테스트, DB schema
  check, 운영형 migration `0042..0050`, 홈페이지 production smoke, Windows .NET Framework
  x86 build·self-test 20개와 `git diff --check`를 통과했다. 통합 릴리스
  `20260812T063358Z-integrated-worktrees-v1`의 private S3 AES256 앱 아티팩트 SHA-256은
  `89c6ae1a3b7990cdecd68542bdc056deef4895f81d1669a86502b8fe9f09a0d8`, bridge ZIP은
  `067c3c6e352786e990f9da0501fb83c4da4e83cc0d2a304bb91371f38c94e814`, bridge source는
  `b16ed3aa5fffb4307916cc32ec6ca147b6f528ae44ae14f10f7556f061e43e97`다.
- 변경 전 암호화 RDS 스냅샷 `lawand-prod-pre-integrated-worktrees-20260812t063358z`을
  available로 확보하고 migration `0049`·`0050`을 적용했다. 운영 migration 원장은 51개이며
  두 최신 Git 해시는 각각 `b93be64017ca65fd3ada73b13305b54d10594a4d1effa76882761f279bb42048`,
  `b6517be1d7db367d8ca2a52f846f25adcdbf341d19669d21648385867429f151`로 일치한다.
  sentinel 관측·식별자는 0이고 `consultation_directory_sources`와 전화 디렉터리
  `living_place`가 존재한다. 배포 전 활성 root/leg 11건과 수신 1건이 있었지만 사용자가
  통화 중 배포를 명시 승인해 차단 게이트로 쓰지 않았다. `0049`는 증거 있는 ghost만 정리했고,
  최종 smoke의 connected root/leg 4건은 provider 종료 증거 없이 강제 종료하지 않았다.
- 홈페이지·ERP·gateway를 같은 릴리스로 전환했다. 이미지 ID는 gateway
  `sha256:f07039e09c415d682d302f98aba2d00f3d16e9af615e65562e2258c95774ea2c`, ERP
  `sha256:d8bc3cdb7411a8c2337e587c91445678d3f176d3cf2ac2296b30307030f4d071`, 홈페이지
  `sha256:3ae64d91507583adf074ed1fd3da71da3d3f1e07e8165a112eb3beac5b81b04b`다. 세 앱과
  Caddy는 active·running, systemd/Docker restart 0이며 정식 DNS·EIP 고정·`sslip.io` HTTPS
  smoke가 모두 정상이다. gateway 실시간 source 3개와 리걸프렌즈·알림톡·네이버·클릭투콜·
  문자·수신 관측 worker 6개가 모두 시작됐고 최근 error journal과 CloudWatch ALARM은 0이다.
- Windows bridge는 v0.8.3.0, SHA-256
  `69116FD2D12BB50829130F9C56FA5CF9E05E8EA47330042F27E0466145D8BCAA`로 교체했다. 직전
  v0.8.2.0 파일은 릴리스 ID가 붙은 rollback 파일로 보존했다. 최종 설치 51·배정 19·실행 24·
  warm 5, assigned offline·로그인 실패·queue·dead-letter 0, supervisor 정상이다. 후보는
  조직용 인증서가 없어 여전히 unsigned다.
- 별도 `ai-agents` 저장소의 전화 디렉터리 잡에 `living_place` 원천·검증 digest를 추가해
  커밋 `962c03f`로 push하고 운영 exact 두 파일만 백업·교체했다. dry-run 뒤 실제 동기화와
  verify/access canary를 통과해 사건 61,188·고객 61,188·담당자 69, 지역 null 0, 관계 누락·
  타 사무소·전화 정규화 위반 0이며 timer는 enabled·active다. 실제 상담·카카오 채팅·외부 사건·
  고객 알림 canary는 만들지 않았다. `PROJECT_PLAN.md`는 v1.20이다.

### 2026-08-12 — calm-valley ERP 상담 알림 UX 긴급 단독 운영 배포
- `HERDR_ENV=1`에서 main과 HERDR worktree 5개, 원격 `origin/worktree/*` 18개를 전수
  대조했다. `worktree/calm-valley-fbf9`의 `b69c037`·`6550ebc`만 merge commit
  `7b86517`로 main에 병합하고 `origin/main`까지 push했다. 원격 16개 HEAD는 병합 뒤 main
  ancestor다. `brave-cloud-9c88`의 Cafe24 문서 작업과 `rapid-meadow-adae`의 카카오 상담
  UX는 사용자 요청에 따라 명시적으로 제외했고, `clear-river-b502`의 커밋 전 고객찾기·
  migration `0050` 작업은 진행 중으로 제외했다.
- 영향 범위인 ERP typecheck·lint·production build와 `git diff --check`를 다시 통과했다.
  릴리스 `20260812T061230Z-erp-consultation-alerts-v1`의 private S3 AES256 아티팩트 SHA-256은
  `38f23964e2c0ab04707110a84592e341792e0d5e8d02ecd74ee2b7cc49f4463b`이고, 운영 ERP 이미지
  ID는 `sha256:9b10dbf77512b7def49f7a7e42a5c1b161c5a63aae4a3a146903aa5b6024ac1a`다.
- 이번 긴급 배포는 ERP와 해당 EC2의 Caddy만 전환했다. main에 먼저 들어 있던 v0.8.3·
  migration `0049`·gateway·Windows bridge는 명시적으로 운영 반영하지 않았다. gateway는
  기존 릴리스 `20260812T015203Z-centrex-ringing-recovery-v1`, 이미지
  `sha256:e0ca5390fea42144569080a8d3950c7d13ea09c27244074ae53966c7e1d90a9e`로 active·restart 0,
  health 정상이다. 운영 DB migration과 Windows 프로세스·통화 원장은 건드리지 않았다.
- ERP·Caddy는 active·restart 0이고 정식 도메인 DNS/EIP 고정 HTTPS·`sslip.io` 로그인은
  모두 200, 루트는 로그인으로 307이다. 운영 Next bundle에서 `알림 켜기`와
  `최근 1건만 보기`를 확인했고 최근 error priority journal과 CloudWatch ALARM은 0이다.
  실제 상담·알림·통화 canary나 임시 직원 세션은 만들지 않았다. 직전 ERP rollback 태그는
  `20260812T015203Z-centrex-ringing-recovery-v1`, 이미지 ID는
  `sha256:59cbac811381880c5706d057400d3aa8208c0be0568516372ad34b03619fdbf7`다.

### 2026-08-12 — ERP 통화 최근 1건 접기·상담 지역 강조·전 직원 등록 알림 후보
- ERP 상단 통화 활동은 수신·발신·내선과 legacy 카드를 합친 뒤 `lastEventAt`이 가장 최근인
  한 건만 기본 표시한다. 두 건 이상이면 총 건수와 `모두 펼치기/최근 1건만 보기` 버튼으로
  전체 카드를 열고 닫는다. 기존 받기·후처리·호전환 상태와 실시간 연결 표시는 그대로
  유지하며 DB·gateway·센트릭스 원장은 바꾸지 않았다.
- 상담 작업 큐의 거주 시·도를 고객명 바로 옆의 위치 아이콘·고대비 배지로 옮겼다. 지역이
  없는 과거·외부 채널 데이터도 `지역 미기록` 경고 배지로 숨지 않게 했다.
- 모든 ERP 직원 역할이 전역 직원 바에서 기존 개인정보 없는 `consultation.requested` SSE를
  구독한다. 새 상담이 들어오면 현재 보이는 ERP 탭에 9초 토스트를 띄우고, 사용자가 상단
  `알림 켜기`로 권한을 허용한 브라우저에는 시스템 Notification을 함께 보낸다. 두 알림은
  상담 ID의 상세 화면으로 이동하며, 브라우저 Notification은 기존 8초 탭 leader lease와
  event ID 저장으로 한 브라우저의 중복을 막는다. SSE·Notification 본문에는 고객 이름·
  전화번호·지역을 싣지 않았다. 브라우저가 닫힌 상태의 Web Push는 이번 범위가 아니다.
- 전체 5패키지 typecheck·lint·production build, core 65개·gateway 114개 테스트와
  상담 SSE 계약 단독 테스트 2개, `git diff --check`를 통과했다. 구현 커밋 `b69c037`은
  `worktree/calm-valley-fbf9`에 있다. `PROJECT_PLAN.md`는 v1.19다. 운영 배포·DB 변경은
  수행하지 않았으며, 이 워크트리에서는 원격 브랜치 push까지만 수행한다.
### 2026-08-12 — 고객찾기 신건·소개 상담 등록 출시 후보
- ERP `/clients`의 각 리걸프렌즈 고객 카드에 `신건상담에 등록`을 추가했다. 선택 고객의
  이름·휴대전화·광역 거주지·사건 유형을 기본값으로 채우고 등록 전 모두 수정할 수 있다.
  `소개건`을 체크하면 수정된 값은 소개받은 새 고객으로, 선택한 기존 고객은 소개자로
  구분한다. 전화번호가 없거나 휴대전화 형식이 아닌 기존 고객도 등록 창은 열리며 올바른
  010 번호로 수정해야 저장된다.
- migration `0050_secret_grey_gargoyle.sql`은 `consultation_directory_sources`를 추가해
  소개자/기존 고객 관계와 기존 고객명·전화·사건·기존 담당 snapshot을 AES-GCM 암호문으로
  보존한다. 정확한 `client_idx·case_idx`는 security-definer 함수에서 삭제 사건 제외 조건으로
  다시 검증한다. 전화 디렉터리 미러·동기화·논리 digest에는 원천 `living_place`를 추가했지만
  gateway가 광역 시·도로만 정규화해 브라우저와 상담 출처 snapshot에 상세 주소를 남기지 않는다.
- 상담 상세는 `소개 상담` 또는 `기존 고객의 새 상담`을 표시하고 소개자/기존 고객, 기존
  담당자·사건 상태·사건번호·법원·Case ID·등록/갱신일과 리걸프렌즈 확인 링크를 제공한다.
  수임료·계약 범위·기존 상담 메모는 Case ID로 리걸프렌즈에서 확인하도록 안내하며 복사 버튼도
  제공한다. 생성 단계에서는 외부 사건이나 알림을 만들지 않고, 기존 `상담하기`를 실행한 뒤에만
  본인 배정·리걸프렌즈 신건 등록·담당 배정 알림톡이 진행된다.
- 로컬 스키마 복제본에 `0042..0050`을 migration별 단일 트랜잭션으로 적용하고 합성 고객·사건·
  담당자 fixture로 검색 1건·정확 출처 해석 1건을 확인한 뒤 임시 DB를 삭제했다. core 66개·
  gateway 115개 테스트, 전체 5패키지 typecheck·lint·production build, DB schema check,
  동기화 스크립트 syntax/ESLint와 `git diff --check`를 통과했다. 구현 커밋 `c5d5682`은
  `worktree/clear-river-b502`에 있다. `PROJECT_PLAN.md`는 v1.19다.
- 이 워크트리에서는 main 병합·운영 migration·전화 디렉터리 재동기화·gateway/ERP 배포·실제
  상담/리걸프렌즈 등록을 수행하지 않았다. 운영 반영은 `0050`, 크론 잡의 갱신된 동기화 스크립트와
  `living_place` 재동기화, gateway·ERP를 같은 릴리스로 묶는다. 소개자 1건과 기존 고객 본인 신건
  1건의 생성·상세 문맥만 먼저 확인하고 실제 `상담하기` 외부 canary는 별도 승인으로 분리한다.

### 2026-08-12 — 센트릭스 ghost 카드·08:19 terminal state 근본 수정 후보
- 상단 바가 실제 통화 2건보다 `발신통화중` 2건·`발신중`·`수신중` 4건을 표시한 시점의 운영
  원장과 비식별 Windows 이벤트를 읽기 전용으로 대조했다. U+ `CHANNELOUT`의
  `SRCUNIQUEID=NONE`을 provider ID로 저장해 여러 endpoint의 종료가 이전 통화에 붙은 결함,
  병행 v1 종료가 동일 root/leg의 v2 상태를 닫지 않는 결함, v2 내선이 bridge 재접속/3분
  미연결 보정에서 빠진 결함, snapshot이 모든 비종료 root를 12시간 노출한 결함이 겹쳤다.
  08:19 내부 root는 root `.3081116`·channel `.3081117`·종료 `.3081118`의 정확한 provider
  sequence 증거가 있어 HCAUSE나 시간 추정 없이 종료할 수 있다. 운영 변경·DB 쓰기·프로세스
  재시작은 하지 않았다.
- bridge v0.8.3은 `0/NIL/NONE/NULL/UNKNOWN` sentinel을 식별자에서 폐기하고 모든 v2
  ring/channel을 추적해 미연결 3분 timeout·재접속·명시적 해제·프로세스 종료 때 정확한
  `call.ended` 보정 이벤트를 내구 큐에 남긴다. gateway는 active exact를 우선하고 동일
  endpoint·prefix·인접 sequence가 유일한 active leg에만 종료를 연결한다. 동일 root/leg의
  v1 connected/ended를 v2에 동기화하되 다른 customer leg가 살아 있는 호전환 root는 닫지
  않는다. snapshot은 ringing 3분 범위를 별도 적용한다.
- migration `0049_centrex_terminal_state_recovery.sql`은 sentinel 관측·식별자를 정규화하고
  sentinel로 이전 통화에 잘못 붙은 종료를 분리한 뒤 유일한 provider 종료, 동일 root/leg v1
  terminal state, relation 없는 3분 초과 ringing만 복구한다. 14:30~14:44 KST 운영 읽기
  dry-run은 sentinel 관측 64건·식별자 7건, 잘못 연결 11건, 유일 종료 증거 4건, v1 종료
  3건, 순수 timeout 1건을 선별했고 실제 active/호전환과 모호 후보를 제외했다. 운영형 로컬
  fixture에서 08:19·외부 오연결·v1 동기화·timeout·호전환 보존·모호 후보 비병합과 새 DB
  constraint를 통과한 뒤 임시 DB를 삭제했다.
- 전체 5패키지 typecheck·lint·production build, core 65개·gateway 114개 테스트, DB schema
  check와 `git diff --check`를 통과했다. Windows Server 2022 .NET Framework x86 Release
  compile·self-test 20개도 통과했고 unsigned v0.8.3.0 후보 SHA-256은
  `448750CFC014CAA7266CC30368DD708871C723D8EE9D7B7A0C88E89EA62D6791`이다. 구현 커밋
  `716e528`은 `origin/worktree/rapid-harbor-5a66`에 push했다. `PROJECT_PLAN.md`는 v1.18이다.
  이 세션의 사용자 범위는 main 반영까지이며 운영 migration·gateway 배포·bridge 교체는
  수행하지 않는다. 다음 운영 반영은 v0.8.3·0049·gateway를 한 릴리스로 묶고 무통화 게이트와
  예상 8건만 종결·sentinel 0·ghost 0·실제 active/호전환 보존을 재검증한다.
### 2026-08-12 — Cafe24 구 DNS ERP/API 명시 레코드 추가·인증서 경고 차단
- 일부 로컬 resolver가 `erp.lawandfirm.com`을 Cafe24 구 wildcard 경유 apex
  `222.239.248.41`로 보내고, 그 origin의 SAN 없는 사설 인증서 때문에 Chrome
  `ERR_CERT_AUTHORITY_INVALID`가 발생하는 것을 재확인했다. 새 ERP EIP `3.34.72.9`는
  `erp.lawandfirm.com` Let's Encrypt 인증서와 `/login` 200이 정상이고, gateway EIP
  `3.36.255.226`도 `api.lawandfirm.com` 인증서와 `/health` 200이 정상이다.
- 사용자의 명시적 요청으로 보존 중인 Cafe24 구 zone에 ERP A `3.34.72.9`와 API A
  `3.36.255.226`을 추가했다. Cafe24 관리 화면의 저장 성공과 A 레코드 표를 대조했고,
  Cafe24 네임서버 4곳이 두 레코드를 모두 TTL 1,800초로 반환하는 것을 확인했다. 기존
  apex·`revivetouch`·wildcard CNAME·Daum MX·SPF, Cafe24 호스팅·SSL과 Route 53 zone은
  변경하지 않았다.
- 이 조치는 NS 전환 전 응답을 캐시한 resolver의 안전망이며 잔여 캐시가 끝날 때까지
  명시 레코드를 유지한다. 소스·앱·DB·AWS 운영 구성 변경이나 재배포는 없었다.
  `PROJECT_PLAN.md`는 v1.18이다.
### 2026-08-12 — 카카오 이름 필수 강화·기존고객 배지·무효 액션 정렬 출시 후보
- 카카오 상담 모달의 이름/표시명을 명시적 필수값으로 표시하고, 빈 값뿐 아니라 공백만 있는
  값도 확인 버튼·client submit·홈페이지 POST·gateway schema 네 경계에서 거부한다. 조작된
  빈/공백 POST는 400이며 카카오 303 이동도 하지 않는다. 로컬 production 서버 smoke에서
  빈 값 400·공백 400·유효 이름의 gateway 장애 fail-open 303을 확인했고, 정적 초기 HTML의
  모달 이름 input·제출 button은 계속 0개라 hydration 결정성을 보존했다.
- 전화번호가 있는 상담은 현재 목록 페이지의 번호를 묶어 기존 security-definer
  `resolve_inbound_phone_directory`로 완전일치 조회한다. 고객찾기와 동일하게 리걸프렌즈
  고객-사건 조인과 삭제 사건 제외를 적용하며, 일치하면 상담 목록과 상세 헤더에
  `기존고객` 배지를 표시한다. 전화번호 원문은 새 응답·로그에 추가하지 않고 boolean만
  반환하며, 선택적 배지 조회가 실패해도 상담 작업 큐 자체는 유지하고 비식별 오류만 남긴다.
  로컬 비공개 원장을 전화번호 출력 없이 읽기 전용으로 조회해 완전일치 true 경로를 확인했다.
- 플친 pending의 `무효 처리`는 표시명 수정 패널 아래에서 제거하고 다른 상담 액션과 같은
  상세 우측 상단으로 옮겼다. 기존 확인창·감사 원장·`invalid`/상담 `closed` 트랜잭션은
  그대로 재사용하며, 리걸프렌즈 무효 버튼과 공통 스타일을 사용한다. DB migration은 없다.
  core 66개·gateway 112개 테스트, gateway·homepage·ERP typecheck/lint/production build와
  `git diff --check`를 통과했다. `PROJECT_PLAN.md`는 v1.19다. 이 워크트리에서는 main 병합·
  운영 배포·운영 데이터 변경을 수행하지 않았다.

### 2026-08-12 — 홈페이지 카카오 표시명 선입력·ERP 즉시 상담하기 출시 후보
- 홈페이지의 모든 카카오 상담 CTA를 직접 외부 이동하는 방식에서 client-only 모달로
  바꿨다. 고객이 `이름 또는 카카오톡 표시명`을 필수로 입력하고 확인할 때만 same-origin
  POST가 접수를 만든 뒤 기존 카카오 1:1 채팅 URL을 새 탭으로 연다. 입력값은 공백 정규화,
  1~40자·제어문자 거부를 적용했고 요청 원문과 `<표시명>_<접수번호 8자리>_플친` 이름을
  각각 AES-256-GCM으로 저장한다. 전화번호·카카오 사용자 ID·메시지 원문은 계속 수집하지
  않으며 개인정보처리방침과 이용약관도 새 흐름에 맞춰 갱신했다.
- 새 접수는 카카오 링크만으로 실제 메시지 도착을 증명할 수 없어 `pending`을 유지하지만,
  ERP 목록에 복호화한 입력 이름과 `카톡 이름 입력` 배지를 즉시 표시한다. 상담원이 같은
  이름의 채팅을 확인하고 `상담하기`를 누르면 gateway가 채팅 확인과 본인 담당 배정을 같은
  트랜잭션으로 처리하고 `consultation.kakao_chat.confirmed`·`consultation.assigned`를 함께
  남긴다. 배포 전의 이름 없는 pending은 기존처럼 표시명 확인 전 배정을 차단하며, 오탈자
  수정·미진입 무효 처리, 전화번호 NULL, 알림톡·리걸프렌즈 외부 실행 차단 계약은 보존했다.
- DB migration 없이 기존 암호화 이름·요청·카카오 entry 필드를 재사용했다. core 66개와
  gateway 112개 전체 테스트, gateway HTTP 37개 테스트, core·db·gateway·homepage·ERP의
  대상 typecheck/lint/build를 통과했다. 최종 홈페이지 정적 HTML에는 모달의 이름 input·
  제출 button이 0개임을 확인해 SSR 첫 렌더의 hydration 결정성을 지켰다. `PROJECT_PLAN.md`는
  v1.18이다. 이 워크트리에서는 main 병합·운영 배포·운영 데이터 변경을 수행하지 않았다.

### 2026-08-12 — 센트릭스 지연 수신 복구 v0.8.2·0048·gateway/ERP 운영 통합 배포
- `HERDR_ENV=1`에서 main과 HERDR worktree 2개, 원격 `origin/worktree/*` 14개를 전수
  대조했다. 모든 원격 HEAD가 main ancestor이고 세 작업 트리가 깨끗해 추가 병합 없이
  `main`/`origin/main` `66847b7`을 배포 소스로 사용했다. `git pull --ff-only`와 main push는
  이미 최신이었다. 전체 5개 패키지 typecheck·lint, core 65개·gateway 112개 테스트, DB
  schema check, 패키지별 production build, Windows x86 self-test 19개와 `git diff --check`를
  통과했다. Turbo 일괄 build는 코드 실행 전 spawn 오류가 나 같은 5개 패키지 직접 build로
  대체 검증했다.
- 통합 릴리스 `20260812T015203Z-centrex-ringing-recovery-v1`을 운영 반영했다. 배포 전 암호화
  RDS 스냅샷 `lawand-prod-pre-centrex-ringing-recovery-20260812t015203z`은 available이다.
  private S3 AES256 앱 아티팩트 SHA-256은
  `0ccf54921dd00e809096baf4fd76c07d0bec8060e850854d420cbf09f671a95d`, bridge ZIP은
  `1c00ec8e08d903e253b7d8246c37936ec1eba607dd552e938ba556bb2c4db16e`, bridge source는
  `c8e1c1e191a78e150d7cbd40c69adcbf2a959ca6db06c63161edc5aa9fc74d7f`다. gateway 이미지
  ID는 `sha256:e0ca5390fea42144569080a8d3950c7d13ea09c27244074ae53966c7e1d90a9e`, ERP는
  `sha256:59cbac811381880c5706d057400d3aa8208c0be0568516372ad34b03619fdbf7`다. 홈페이지는
  코드 영향이 없어 기존 릴리스를 유지했다.
- migration `0048_centrex_v2_ringing_recovery.sql`을 적용해 운영 migration 49개와 최신
  Git 해시 `bd6681300b1fc6500c58af9983cecb2ff147d5cd4fd45c9d595500e6151ce6b8`을 확인했다.
  미연결 v1 통화 17건은 0건, root/leg는 346쌍→363쌍, provider 식별자는 513→536건으로
  복구됐다. 엄격히 일치한 중복 통화 1쌍과 동일 후처리 1건만 합쳐 후처리 42→41건이 됐고,
  재통화 11건·source 위반 0을 보존했다. 업무 통화가 배포 중 자연 유입·종료돼 최종 smoke
  시점의 통화 수는 늘었지만 미연결과 source 위반은 계속 0이다.
- Windows bridge를 v0.8.2.0, SHA-256
  `EF0891CDFF9344CB5CFA07D309DD795A4C10B6111D1B31B8C27DD6C957A9B8F8`로 전환했다.
  이전 v0.8.0.0 `312764133521E634EDAAF0820F4F44F953E41EEE34CD50BBF96B94F3BF0CA46B`는
  rollback 파일로 보존했다. 최종 설치 51·배정 19·실행 24·warm 5, 오프라인·로그인 실패·
  queue 0, supervisor 정상이다. v0.8.0 암호화 dead-letter 32건은 복호화·재처리·삭제 없이
  15개 bridge별 `gateway-dead-letter-archive/20260812T015203Z-centrex-ringing-recovery-v1`로
  옮기고 파일 SHA-256 manifest 15개·항목 32개·보존 파일 32개를 재검증했다. 활성
  dead-letter·합계는 0이다. `QueueDepth`·`DeadLetterDepth` 분리 경보를 추가했고 기존 합계
  경보를 포함한 센트릭스 7개가 모두 OK다. 후보 exe는 조직용 인증서가 없어 여전히 unsigned다.
- gateway 첫 전환은 개별 `canary-4591` secret과 이미 이를 포함한 `registry-v1`의 중복을
  재시작 전에 감지해 중단됐다. 실행 컨테이너는 유지됐고 `registry-v1`만 단일 소스로 넘겨
  51개 bridge key와 정식 ERP URL을 정상 적용했다. 향후 풀 배포에서도 두 secret을 함께
  넘기지 않는다. gateway·ERP 예상 이미지/running/restart 0, `lawand-caddy`, 정식 호스트
  EIP 고정 HTTPS, gateway 실시간 source·worker 9종, 최근 error journal 0을 확인했다. 임시 5분 세션으로
  인증·통화 snapshot·전화데스크 첫 페이지 20건/총 366건·ERP 전화데스크 200을 검증하고
  세션을 0건으로 삭제했다. 실제 통화·문자·외부 사건 canary는 만들지 않았다.
- 전환 게이트는 활성 관측과 받기/발신/문자 명령·telephony outbox가 3회 연속 0일 때만
  열었다. 08:19 KST부터 남은 내부 connected root 1건은 실제 활성 관측이 없는 기존 orphan이라
  provider 종료 증거 없이 추정 종료하지 않았다. 별도 읽기 대조 뒤 안전한 종결 또는 명시적
  orphan 상태 모델을 정한다. `PROJECT_PLAN.md`는 v1.17이다.

### 2026-08-12 — 4591 지연 수신·종료 선행·중복 13초 원장 근본 수정 후보
- 운영 Windows 비식별 로그와 DB 시각을 읽기 전용으로 대조했다. 4591은 10:12:06 KST에
  실제 ring을 즉시 관측·큐잉했지만 v0.8.0의 필수 `incomingLineNumber` 누락 v2 이벤트가
  HTTP 400으로 FIFO 선두에서 1분간 재시도됐다. 이 때문에 정상 v1 ring은 68초 뒤,
  v2/v1 종료는 그 뒤 순서대로 전달됐다. 브라우저 렌더나 SSE 자체가 느린 것이 아니라
  영구 오류 한 건이 후속 정상 이벤트를 막는 head-of-line blocking이었다. 당시 pool은
  설치 51·배정 19·실행 24·warm 5, 오프라인·로그인 실패·재시도 queue 0, dead-letter 16,
  supervisor 정상이었다. 운영 변경·프로세스 재시작·dead-letter 이동은 하지 않았다.
- U+ 종료 이력은 실제 종료 약 16초 뒤 root/leg가 있는 종료 원장을 먼저 만들었고, 늦은 v1
  ring은 이미 종료된 `uplus-inbound-history`를 기존 30초/`ringing` 전용 상관이 찾지 못해
  별도 13초 legacy 원장과 같은 상담·결과의 후처리를 하나 더 만들었다. 같은 기간 후보
  6쌍을 개인정보 없이 대조했지만 시작·종료가 모두 엄격히 맞는 쌍은 이 건뿐이라 나머지는
  추정 병합하지 않는다.
- bridge v0.8.2는 이벤트 단위 400/404/409/422를 재시도하면서도 같은 큐의 후속 파일을 계속
  보내고, 401/429/5xx·네트워크 장애에서만 배치를 멈춘다. gateway는 동일 endpoint·고객
  지문·시작 5초 안의 유일한 U+ callback/history를 종료 상태여도 재사용하고 실제 provider
  식별자를 root에 보존한다. 수신 이벤트가 15초 넘게 늦거나 근거가 없으면 ERP가 지연 안내를
  표시하고 무효일 수 있는 `전화 받기` 버튼을 숨긴다.
- 보강한 custom migration `0048_centrex_v2_ringing_recovery.sql`은 동일 회선·지문·시작 2초·
  종료 3초 안의 유일한 종료 쌍만 합치며, 양쪽 후처리는 결과·상담·확정자가 같고 메모·재통화가
  없을 때만 하나로 접는다. 운영형 로컬 fixture에서 통화 1건, 원본 이벤트 4건, 동일 후처리
  1건, synthetic/실제 provider 식별자 2개와 root/leg를 보존했고 migration 2회 적용도
  멱등 통과했다. core 65개·gateway 112개 테스트, 전체 5패키지 typecheck·lint·production
  build, DB schema check와 `git diff --check`를 통과했다. Windows .NET Framework x86
  self-test 19개도 통과했고 v0.8.2.0 unsigned 후보 exe SHA-256은
  `FDEBCABDF8C0EB20A422BA796CCA9CF7BE152B4EF305A50E9A5B569F60EA5A0B`다.
- `PROJECT_PLAN.md`는 v1.16이다. 이 워크트리에서는 아직 운영 migration·gateway/ERP 배포·
  bridge 교체·운영 중복 원장 변경을 수행하지 않았다. 복구 릴리스는 v0.8.2와 0048,
  gateway·ERP를 함께 배포하고 정확한 중복 1쌍·중복 후처리 1건만 정리한 뒤 queue/dead-letter
  분리 경보와 통제 수신 순서를 확인해야 한다.

### 2026-08-12 — lawandfirm.com Route 53 무중단 전환·정식 HTTPS 발급
- `HERDR_ENV=1`에서 main·HERDR worktree·로컬/원격 `worktree/*`를 전수 대조해 당시 모든
  원격 worktree HEAD가 main ancestor이고 작업 트리가 깨끗함을 확인했다. 정식 ERP/API
  Caddy 호스트와 ERP 공개 URL을 코드에 반영한 `645e8f0`을 worktree 브랜치에 push하고,
  main에는 merge commit `77f2402`로 병합·push했다. 전체 5패키지 lint, 대상 스크립트
  syntax/ESLint와 `git diff --check`를 통과했다.
- Cafe24 DNS에는 apex A `222.239.248.41`, `revivetouch` A, `*` CNAME→apex, Daum MX 2개와
  SPF만 있고 TXT·SRV는 비어 있음을 UI와 공개 resolver로 대조했다. apex는 구 호스팅의
  대표 도메인이라 연결 삭제 전에는 수정할 수 없고 삭제하면 구 SSL도 제거되는 계약을
  확인했다. 캐시 이용자의 인증서 오류를 피하기 위해 계획된 Route 53으로 전환했다.
  public hosted zone `Z04111031FDIY4A1O715I`에 기존 레코드를 모두 보존하고 apex·www는
  homepage `15.165.23.84`, ERP `3.34.72.9`, API `3.36.255.226`을 추가했다. Cafe24 본인
  인증 뒤 AWS 네임서버 4개 변경 신청이 정상 접수됐고, Google·Cloudflare에서 새 NS와
  Google의 새 A 응답을 확인했다. Cloudflare의 구 A 캐시는 예상대로 남아 전파 중 구
  홈페이지를 정상 제공한다.
- 세 EC2의 기존 Caddyfile을
  `Caddyfile.pre-domain-cutover-20260812T004900Z`로 보존하고, 검증된 정식 호스트 설정을
  연결 중단 없는 `caddy reload`로 적용했다. 앱·Caddy restart count는 0이며 임시
  `sslip.io` 접속점도 계속 200이다. Let's Encrypt 인증서는 apex·www·ERP·API 각각 정상
  발급됐다. 새 EIP 고정 smoke에서 apex→`/bank` 최종 200, www→apex, ERP `/login`, API
  `/health`, robots·sitemap·신규 페이지와 구 `/divorce`·`/insurance`·`/realty` HTTPS
  fallback이 모두 200이고, 구 EIP 고정 apex·www도 200이라 전파 구간의 양쪽이 살아 있다.
- Secrets Manager의 gateway·ERP `LAWAND_ERP_BASE_URL`만
  `https://erp.lawandfirm.com`으로 바꿨고 그 외 JSON 해시는 직전 버전과 일치한다. 당시
  업무 통화가 계속 1~4건이라 gateway·ERP 앱 재시작은 하지 않았다. 정식 ERP 로그인
  페이지 자체는 200이며, 다음 안전 작업은 활성 root/leg·수신 통화·수발신 실행 명령이
  연속 0일 때 두 앱만 재시작하고 새 환경값·인증 로그인·재시작 0/health를 대조하는 것이다.
- 도메인 작업과 별개로 `lawand-centrex-dpapi-queue`가 이미 08:20 KST부터 ALARM이었음을
  발견했다. queue는 계속 0이나 dead-letter는 10:05 KST 12건에서 10:14 KST 16건으로
  증가했으며 여러 slot의 v2
  `call.ringing`만 gateway 400 뒤 격리됐고 뒤따른 기존 수신 이벤트는 201로 전달됐다.
  최초 격리는 도메인 Caddy 전환 전인 08:19 KST라 DNS 원인이 아니다. Windows pool은
  배정 19+warm 5, 실행 24, offline·login failure 0, supervisor 정상이다. 암호문은 삭제·
  재처리하지 않고 보존했다. 별도 결함으로 400 원인을 수정·검증한 뒤 통제된 재처리 여부를
  결정해야 하며, 이 ALARM을 도메인 안정화 성공으로 오인해 임의로 지우지 않는다.
- 1차 rollback은 NS를 다시 흔드는 대신 Route 53 apex A를 구 `222.239.248.41`로 바꾸고
  www CNAME을 유지하는 것이다. ERP/API도 필요하면 명시 A를 제거해 보존된 wildcard→apex로
  돌린다. Cafe24 호스팅·DNS·SSL은 삭제하지 않았고 세 Caddy 원본과 Secrets Manager 직전
  버전도 보존했다. 다음은 DNS 전파 관찰, 무통화 앱 재시작, 정식 ERP 인증 smoke다. 실제
  상담/알림톡 canary와 Solapi IP 제한은 별도 승인·운영 게이트로 남긴다.

### 2026-08-12 — 센트릭스 DPAPI 경보 원인 제거·bridge v0.8.1 복구 출시 후보
- CloudWatch·Windows SSM·운영 DB를 개인정보 없이 읽기 전용으로 대조했다. 08:20 KST
  전환된 `lawand-centrex-dpapi-queue`는 실제 재시도 queue 0이 아니라 영구 거부
  dead-letter 8건 때문에 발생했다. pool은 설치 51, 배정 19, 실행 24, warm 5,
  assigned offline·로그인 실패 0, supervisor 정상이었다. dead-letter는 모두 HTTP 400의
  `call.ringing`이며 외부 6건·내선 2건이었다. 같은 구간의 병행 v1 수신 8건은 모두 종료
  상태로 보존됐고 그중 4건은 새 call root/leg 연결이 없었다. 운영 변경·재시작·복호화·
  dead-letter 이동은 하지 않았다.
- 원인은 bridge v0.8.0 `GatewayEventPayload.ToJson()`이 `incomingLineNumber`를
  `callerNumber != null` 조건 안에서만 직렬화한 것이었다. caller 원문을 의도적으로 보내지
  않는 v2 관측은 수신 필수 필드까지 빠져 gateway core schema에서 400이 됐다. v0.8.1은
  수신 회선을 독립 직렬화하고 C# self-test에 inbound external v2의 회선 존재·caller 원문
  부재를, core schema test에 회선 필수 계약의 성공·실패를 함께 고정했다. health monitor는
  `QueueDepth`와 `DeadLetterDepth`를 별도 CloudWatch metric으로 추가하고 기존 합계
  `DpapiQueueDepth`를 호환 유지한다.
- custom migration `0048_centrex_v2_ringing_recovery.sql`은 v1 원장의 동일 UUID와 기존
  AES-GCM AAD를 유지해 누락 external root/customer leg/root·channel 식별자를 만들고,
  이미 v2 leg가 있으면 재사용하며 후처리 원천을 root로 승격한다. 0041 기준 개발 스키마
  복제본에 `0042..0047`을 적용한 뒤 완전 누락·기존 v2 leg·후처리 fixture로 `0048`을 두 번
  실행해 중복 0과 제약 통과를 확인하고 임시 DB를 삭제했다. 필수 필드가 이미 빠진 과거
  dead-letter는 재처리하지 않고 운영 배포에서 migration 대조 후 hash 보존 archive로 옮긴다.
- Windows .NET Framework x86 Release compile과 self-test 19개를 통과했고 unsigned 후보
  exe SHA-256은 `5A0964D9A896EC3CAC317888FD36001EFE0E25C9CEF34C382E8A8E84610239E9`이다.
  core 65개·gateway 108개 테스트, 전체 5패키지 typecheck·lint·production build, Drizzle
  schema check, health monitor PowerShell parse와 `git diff --check`를 통과했다. 이번 세션은
  사용자의 명시적 승인에 따라 main 커밋·push까지만 수행하며 운영 bridge 교체, 운영 DB
  migration, dead-letter 이동과 경보 재구성은 수행하지 않는다. `PROJECT_PLAN.md`는 v1.15다.
### 2026-08-11 — main 누적 브랜치 통합·통화 활동 v2/페이지네이션/문자 UX 운영 배포
- `HERDR_ENV=1`에서 main과 HERDR worktree 4개, 로컬 worktree, 원격
  `origin/worktree/*` 12개를 전수 대조했다. 통화 활동 v2 브랜치는 이미 main에 포함돼 있었고,
  `quiet-harbor-6e25`의 상담·전화데스크 서버 페이지네이션/재통화 담당자 필터를 merge commit
  `2ef4e02`, `quiet-harbor-a725`의 U+ 불투명 `SRC` 격리·문자 전체번호/MMS 이미지 UX를
  `c7eb92c`로 병합했다. migration 번호 충돌은 통화 root/leg `0045_safe_zarek.sql`,
  페이지네이션 인덱스 `0046_small_cargill.sql`, 문자 이미지 snapshot
  `0047_wandering_maximus.sql` 순으로 재생성했다. 최종 모든 원격 worktree HEAD는 main
  ancestor이며 배포 소스는 `main`/`origin/main` `b5f8beb`이다.
- 최초 운영 migration은 기존 후처리 35건 중 관측 통화와 클릭 명령을 함께 참조한 2건이 새
  정확히 한 source 제약에 걸려 트랜잭션 전체가 롤백됐다. 기존 운영 앱과 DB는 그대로였고,
  관측 원장을 동일 UUID의 call root로 승격하면서 두 legacy 참조를 원자적으로 해제하되 기존
  observation link를 보존하도록 `b5f8beb`에서 보정했다. 실제 double-source fixture를 넣은
  임시 DB에서 `0042..0047`을 다시 적용해 root/leg·후처리 제약을 검증하고 임시 DB를 삭제했다.
  전체 5패키지 typecheck·lint·production build, core 64개·gateway 108개 테스트, Drizzle
  schema check, Windows .NET Framework x86 self-test 19개와 `git diff --check`를 통과했다.
- 암호화 RDS 스냅샷 `lawand-prod-pre-integrated-call-messaging-20260811t102618z`을 available로
  확보하고 통합 릴리스 `20260811T104143Z-integrated-call-messaging-v2`를 배포했다. private
  S3 AES256 아티팩트 SHA-256은
  `21a4d992a51a5fe7c0ce8e957d44c3250cedde9d4723f9fb446a1d0001417d11`, gateway 이미지 ID는
  `sha256:10df1494e899cbd6709f107027de25e7884ecca289a441bbd371ddc29e44d5e2`, ERP는
  `sha256:c3047d33f51c98888fafc6759bbd29f95347d2c1f570c00789584eca4625d445`다. 운영 migration
  원장은 `0047`까지 48개이고 최근 `0042..0047` 해시는 Git과 모두 일치한다. 기존 수·발신
  295건은 root/leg 295쌍·연결 누락 0, 후처리 35건·재통화 10건 보존, source 위반 0이며
  기존 MMS 52건 중 안전한 40건만 이미지 URL을 보강했고 비-MMS 오보강은 0이다.
- Windows 공용 bridge는 연속 활성 통화·root/leg·실행 명령·회선 중복 0과 배정 19+warm 5,
  queue/dead-letter 0을 확인하고 v0.8.0.0으로 전환했다. 첫 시도는 supervisor가
  `lawand-slot-*`만 관리하고 별도 `canary-4591` task를 시작하지 않는 기존 계약 때문에
  23/24에서 시간초과했으나 v0.7.2 24개로 자동 원복·health 정상화를 확인했다. 두 번째는 해당
  task를 명시적으로 시작해 24개 모두 v0.8.0.0, 로그인/heartbeat 최신, 오프라인·로그인 실패·
  DPAPI queue·dead-letter 0으로 복구했다. v0.8 exe SHA-256은
  `312764133521E634EDAAF0820F4F44F953E41EEE34CD50BBF96B94F3BF0CA46B`, rollback v0.7.2는
  `C4453BC29FC3AA541EF2C18CA2E479E7E44CF487BFAF14E6C817B4CA308A7012`이며 임시 S3 읽기
  IAM 정책은 제거했다. 조직용 Authenticode 서명은 여전히 별도 과제다.
- 최종 gateway·ERP·각 Caddy active, 컨테이너 재시작·error journal 0, 외부 health/login
  200, CloudWatch 전체 ALARM 0이고 센트릭스 5종도 모두 OK다. 인증 smoke에서 상담 7건과
  전화데스크 첫 페이지 20건의 page 계약, 통화 활동 빈 snapshot, 문자 82건·mailbox 7개,
  ERP 상담·전화데스크·문자 화면 200과 오류 배너 0을 확인하고 임시 세션을 삭제했다. 실제
  전화·문자는 새로 만들지 않았다. 다음은 일반 내선·무조건/통화 후 호전환·실패 복귀 네
  실통화 acceptance와 승인된 대표 회선의 Case_idx 통제 회신 canary다. `PROJECT_PLAN.md`는
  v1.14다.

### 2026-08-11 — 통합 통화 활동 root/leg·호전환·전 직원 카드/담당자 알림 출시 후보
- migration `0045_safe_zarek.sql`에 고객 통화 root, 개별 customer/consultation/internal
  leg, provider root/channel/source 식별자, transfer relation과 원본 v2 관측 원장을 추가했다.
  기존 수·발신 원장은 같은 UUID의 external root로 승격하고 기존 AES-GCM AAD를 유지한다.
  후처리는 기존 관측/클릭 통화 또는 새 root 중 정확히 하나만 참조하며 root당 한 번만
  저장한다. provider 식별자·회선·시각 원장은 향후 녹취 메타데이터 매핑 키로 보존한다.
- bridge v0.8.0 후보는 외부 수·발신 v1을 그대로 병행하면서 내선·호전환의
  `RINGEVENT`·`CHANNELLIST`·`CHANNELOUT`을 v2 관측으로 전달한다. 종료는 실제
  `UNIQUEID`를 `SRCUNIQUEID`보다 우선한다. gateway는 동일 외부 root·고객 지문·원수신
  회선·대상 agent·root→adjacent 채널을 모두 만족하는 무조건 호전환만 확정하고, A/B
  consultation attempt와 미연결 복귀를 같은 외부 root에 연결한다. 통화 후 호전환 final
  customer leg 증거가 없으면 cause·시간으로 추정하지 않고 `호전환 확인 필요`로 남긴다.
- U+ callback/history와 bridge 원장을 같은 root/leg로 합쳤다. 중간 A/customer 또는 상담
  leg 종료 뒤 활성 customer leg가 있으면 root를 닫지 않고, 마지막 customer leg가 끝날
  때만 최종 endpoint/직원을 확정한다. 공유 회선은 provider 근거만으로 실제 통화자를 알 수
  없으므로 임의로 한 명을 선택하지 않는다. 클릭투콜은 정확한 요청 직원을 leg에 보강한다.
- ERP 상단은 외부 수신·직접발신·클릭투콜을 전 직원에게 한 카드로 표시하고 일반 내선은
  참여 endpoint 담당자에게만 표시한다. 호전환 진행·완료·복귀·확인 필요와 최종 통화자
  1회 후처리를 연결했다. 리걸프렌즈 `Member_idx`·`sub_member_idx`·`sub_member2_idx`는
  `staff_external_accounts.external_member_idx`로 정확히 매칭하며 이름은 표시용이다.
  고객/회선 담당자 합집합, 미해석 시 활성 직원 전체에 9초 토스트와 명시적 브라우저
  Notification을 보내고 8초 multi-tab leader lease와 통화 ID로 중복을 막는다. NOTIFY/SSE는
  PII 없는 ID만 보내며 인증 snapshot이 전체 번호·고객·사건·담당자·회선을 제공한다.
- 임시 `lawand_dev` 복제 DB에 전체 migration을 적용해 실제 v1 호환과 v2
  `ringing→channels→ended` ingress를 수직 검증하고 DB를 삭제했다. core 64개·gateway
  104개 테스트, 전체 5개 패키지 typecheck·lint·production build, Drizzle schema check,
  Windows .NET Framework x86 Release compile·bridge self-test 19개와 `git diff --check`를
  통과했다. 운영 DB migration·운영 데이터 변경·실서비스 배포·실통화 canary는 수행하지
  않았다. `PROJECT_PLAN.md`는 v1.13이다.

### 2026-08-11 — 센트릭스 실통화 fixture 수집 완료·root/leg 구현 계약 확정
- bridge v0.7.2의 4591·1208 통제 canary에서 일반 내선·무조건/통화 후 호전환·실패 복귀
  네 fixture 수집을 완료했다. 일반 내선은 양쪽 공통 root·adjacent ID로 참여자를 결정적으로
  연결하며 참여자에게만 표시한다. 통화 후 호전환 성공은 A/B 상담 leg까지는 연결되지만 B의
  마지막 customer leg에 외부 root·고객 지문이 없어 passive event만으로 결정적으로 연결할
  수 없다. 이 시나리오는 미해결이며 cause 또는 시간 근접으로 추정하지 않는다.
- 무조건 호전환 성공에서는 최초 외부 root와 고객 지문이 B에 다시 나타났고
  `line=4591`·`agent=1208`, B `CHANNEL_LIST`의 외부 root→B final leg 관계가 모두 확인돼
  결정적 상관이 가능했다. 현재 `incoming_line_mismatch` 보호가 이를 정상 호전환으로 인식하지
  못해 ringing 409와 후속 orphan 409 두 건, 총 3건을 1208 dead-letter로 보냈고 A 원장은
  B 최종 종료보다 33.259초 먼저 닫혔다. 보호를 전체 완화하지 말고 동일 외부 root·고객 지문·
  원수신 회선·B agent·`CHANNEL_LIST` 연결을 모두 검증하는 transfer 전용 경계를 구현한다.
- 해당 암호화 원본 3건은 hash 확인 뒤
  `C:\ProgramData\Lawand\CentrexBridge\instances\lawand-slot-001\gateway-dead-letter-archive\20260811T081527Z-blind-transfer-1208`
  에 보존했고 재처리 없이 active dead-letter에서만 정확히 3건을 격리했다. 보존 3건·active
  queue/dead-letter 0이며 관련 CloudWatch DPAPI 경보도 OK로 복귀했다.
- 실패·복귀에서는 외부 root/channel이 connected로 유지된 상태에서 양쪽에 같은 internal
  consultation root로 A→B ring이 왔고 B `CHANNEL_LIST`는 없었다. 종료 cause 207/16은
  관측값일 뿐 의미를 일반화하지 않는다. 취소 중 외부 channel은 종료되지 않았고 12.10초 뒤
  기존 외부 channel만 최종 종료됐으며 gateway 오류·DLQ는 0이었다. 명시적 return provider
  event가 없으므로 bridge가 활성 외부 root 안의 consultation attempt/returned correlation
  event를 만들어야 UI가 `호전환 시도 중`·`복귀`를 표시할 수 있다.
- 구현 계약은 customer call root와 call legs 분리, transfer correlation evidence 보존,
  마지막 customer leg 종료만 root 종료로 인정, A leg 종료로 root 종료 금지, 최종 고객
  통화자에게만 1회 후처리, 일반 내선 참여자 전용 알림과 호전환 대상의 우선 `전달된 고객
  전화` 알림이다. 증거가 부족하면 `호전환 확인 필요`로 남긴다. 최종 4591·1208 active 0,
  target queue/dead-letter 0, CloudWatch ALARM 0이며 다른 업무 통화는 건드리지 않았다.
- 이번 세션은 실통화 수집 결과를 문서화만 했고 구현·migration·배포·운영 데이터 변경은
  수행하지 않았다. `docs/CENTREX_CALL_ACTIVITY_V2.md`를 상세 fixture와 acceptance 기준으로,
  `PROJECT_PLAN.md` v1.12를 authoritative 상태로 갱신했다.

### 2026-08-11 — bridge v0.7.2 운영 배포·일반 내선/통화 후 호전환 실측
- `PROJECT_PLAN.md` v1.10과 최신 인수인계를 다시 읽고 HERDR 관리 main·
  `quiet-field-0995`·`quiet-harbor-6e25`·`quiet-harbor-a725`, 로컬/원격
  `worktree/*`를 전수 분류했다. 이번 bridge-only canary에는
  `origin/worktree/quiet-field-0995`의 `f4c6d8f`만 merge commit `52cf3f8`로 main에
  병합·push했다. ERP 후속 UI인 `quiet-harbor-6e25`와 migration·문자 작업 중인
  `quiet-harbor-a725`는 명시적으로 제외했으며 다른 ancestor 브랜치는 추가 병합하지 않았다.
- main 소스로 Windows .NET Framework x86 Release build와 self-test 18개를 다시 통과했다.
  source ZIP SHA-256은
  `B9003C8AB04FD14A7700F5F47976584B79A73560F64130632388D425E48E7218`, v0.7.2.0 exe는
  `C4453BC29FC3AA541EF2C18CA2E479E7E44CF487BFAF14E6C817B4CA308A7012`다. 조직용
  Authenticode 인증서 전의 통제 canary 예외라 exe는 unsigned이며, private S3 AES256
  경로의 정확한 artifact read 임시 권한은 build 뒤 즉시 제거했다.
- 업무 통화가 생길 때마다 전환을 중단했다. 최종 수신·발신·통화/받기/프로비저닝 명령·
  회선 중복 0을 16:45:06·16:45:17 KST에 연속 확인한 뒤 공용 실행 파일을 v0.7.2로
  교체했다. 첫 시도는 CIM process path가 null인 검증 스크립트 오류로 자동 v0.7.1 원복됐고,
  실제 공용 파일·24개 프로세스·로그인을 모두 확인한 뒤 `MainModule` 검증으로만 고쳐
  재시도했다. 최종 배정 19+warm 5, 프로세스 24개가 모두 v0.7.2이고 오프라인·로그인 실패·
  DPAPI queue·dead-letter 0, supervisor 정상이다. v0.7.1 rollback SHA-256
  `0EF80F01F74EE631FFF02E626A4681127A7F344430AF6D307DA34DACB30101D8`도 별도 보존했다.
  side-by-side는 task 정의·supervisor/monitor 계약과 원복 가능성만 검토했고 적용하지 않았다.
- 4591(`canary-4591`)과 1208(`lawand-slot-001`)은 v0.7.2 로그인 성공, heartbeat 최신,
  queue/dead-letter 0과 비식별 로그 관측 준비를 확인했다. 실제 전화는 사용자가 준비 완료
  신호 뒤 직접 수행했고 에이전트는 통화·task·프로세스·원장에 개입하지 않았다. 일반 내선은
  양쪽 `RING_EVENT`가 같은 root ID, `CHANNEL_LIST`가 같은 adjacent channel ID 쌍을 보냈고
  masked suffix도 서로의 내선과 일치했다. 양쪽 모두 `internal/sip`으로 분류됐으며 4자리
  내부 leg는 기존처럼 gateway 전송 전 거부되어 운영 원장을 만들지 않았다.
- 외부→4591 수신은 `external/sip`과 외부 root·adjacent channel로 ringing/connected 원장을
  만들었다. 4591→1208 상담 leg는 양쪽에서 별도 공통 internal ID 쌍으로 관측됐지만 외부 ID
  group과 연결되지 않았고 `local_xfer`도 없었다. 4591의 외부 connected channel 종료가
  16:53:34.379 KST에 현재 `inbound.ended`를 발생시켰고, 1208의 실제 마지막
  `CHANNEL_OUT`은 19.13초 뒤인 16:53:53.509 KST였다. 1208 최종 이벤트에는 상담 channel
  ID와 sentinel source만 있고 외부 root·masked suffix가 없어 B/고객 최종 leg를 결정적으로
  연결할 수 없다. 즉 현재 원장은 A leg에서 조기 종료되며 A leg 종료와 고객 root 최종 종료를
  구분하지 못한다.
- 최종 두 target 활성 통화·실행 명령·DPAPI queue·dead-letter는 0, assignment connected와
  heartbeat는 정상이고 CloudWatch 5종 경보는 모두 OK다. 최종 시점의 전체 활성 2건은 다른
  업무 회선 통화라 건드리지 않았다. gateway·ERP·Caddy는 active/외부 200·컨테이너 재시작
  0을 유지했다. gateway/ERP 배포, DB migration·운영 데이터 보정은 수행하지 않았다.
  다음은 이번 일반 내선·통화 후 호전환을 fixture로 고정하고, 무조건 호전환·실패 복귀
  canary 뒤 명시적 transfer correlation 또는 `호전환 확인 필요` 상태를 설계하는 것이다.
  `PROJECT_PLAN.md`는 v1.11이다.

### 2026-08-11 — 통합 통화 활동 v2 기준선·내선/호전환 canary 준비
- 외부 수신·센트릭스 직접 발신·ERP 클릭투콜을 로그인 직원 전체의 상단 카드에 표시하고,
  일반 내선은 참여자에게만 표시하되 수신자에게 토스트·브라우저 알림을 보내는 제품 정책을
  확정했다. 외부 수신 알림은 고객 담당자와 회선 담당자 전원, 정확한 담당자가 없으면 활성
  직원 전체가 대상이다. 리걸프렌즈 담당자는 이름 비교가 아니라 사건의 `Member_idx`·
  `sub_member_idx`를 `staff_external_accounts.external_member_idx`와 연결한다. 승인된 내부
  브라우저 알림에는 전체 번호·고객·상담/사건·담당자·회선·전달자를 최대한 제공한다.
- 호전환은 하나의 외부 고객 통화 root 아래 A/고객, A/B 상담, B/고객 leg를 연결한다. A leg
  종료는 전체 종료로 보지 않고 마지막 고객 leg 종료 때만 통화를 끝내며, 후처리는 최종 고객
  통화자에게 한 번만 연다. 일반 내선·무조건/통화 후 호전환·실패 복귀의 통제 canary와
  구현 순서를 `docs/CENTREX_CALL_ACTIVITY_V2.md`에 고정했고 `PROJECT_PLAN.md`는 v1.10이다.
- bridge v0.7.2 후보는 기존 gateway payload·내부 4자리 leg 거부·통화 상태 처리를 바꾸지
  않고 `RINGEVENT`·`CHANNELLIST`·`CHANNELOUT` 로그에 비식별 상대 종류와 채널 종류만
  추가한다. 로컬 Windows .NET Framework x86 빌드와 self-test 18개, `git diff --check`를
  통과했다. 임시 unsigned 빌드 산출물은 삭제했다. 운영 배포·실제 통화·DB migration·운영
  데이터 변경은 수행하지 않았다. 다음 단계는 온라인인 두 내선과 통제 외부 발신자를 정해
  v0.7.2를 통제 배포한 뒤 실제 양쪽 이벤트 상관키를 확인하는 것이다.
### 2026-08-11 — ERP 상담·전화 목록 서버 페이지네이션·날짜/현황 필터 출시 후보
- 상담데스크의 최신 50건, 전화데스크의 최신 100건 고정 상한을 제거하고 gateway가
  `total`·현재 페이지·페이지 수·20/50/100 페이지 크기를 함께 반환하게 했다. 상담은
  `last_requested_at`, 통화는 화면의 실제 발생시각인 관측 `ringing_at` 또는 독립 클릭투콜
  `requested_at`을 최신순으로 조회한다. 서로 다른 관측/클릭 원장은 각각 필요한 상위 구간을
  읽어 합친 뒤 정확한 전역 offset을 적용하고, 데이터 감소로 범위를 벗어난 페이지는 마지막
  유효 페이지로 보정한다.
- migration `0045_flaky_roulette.sql`에 상담 `last_requested_at`, 독립 클릭투콜
  `requested_at`, 관측 통화 `ringing_at` 최신순·날짜 범위용 단독 btree 인덱스를 추가했다.
  실행 중인 개발 DB 세션은 끊지 않고, 개발 DB의 스키마만 복원한 데이터 없는 임시 DB에서
  migrator 권한으로 migration을 적용해 신규 인덱스 3개를 확인한 뒤 임시 DB를 삭제했다.
- 두 화면에 전체 기간, 한국시간 오늘·어제·직전 5일의 7개 일자 버튼과 과거 특정일/기간
  입력을 추가했다. 종료일은 포함되며 API에는 다음 날 00:00을 exclusive upper bound로
  전달한다. 기본 페이지 크기는 20건이고 50·100건으로 바꿀 수 있으며 이전/다음과 번호
  페이지 이동을 제공한다. SSR 첫 렌더의 오늘 기준값은 서버 prop이고 브라우저 현재 시각을
  렌더 초깃값에 사용하지 않는다.
- 전화 현황의 전체·수신·ERP 발신·직접 발신·진행 중 카드를 실제 서버 필터 버튼으로 바꾸고,
  상담 현황에는 전체 카드를 추가해 전체·배정 대기·내 담당·확인 필요·오늘 접수 카드를 같은
  방식으로 연결했다. 카드 수치는 현재 페이지가 아니라 선택 날짜 범위 전체의 서버 집계다.
  SSE 재조회는 현재 페이지·크기·현황 필터·날짜를 유지한다. 재통화 업무 큐는 이력 조회와
  독립적으로 전체 열린 업무를 유지하며 기존 로그인 직원 기본 담당자 필터도 보존한다.
- 로컬 개발 DB에서 빈 미래 기간의 페이지 보정과 실제 상담/통화 합계·구분별 합계·필터 행
  일치를 개인정보 출력 없이 수직 검증했다. gateway 99개 테스트, gateway·ERP typecheck·
  ESLint·production build, `git diff --check`를 통과했다. 로컬 영구·운영 DB migration 적용,
  운영 데이터 변경과 실서비스 배포는 수행하지 않았다. `PROJECT_PLAN.md`는 v1.11이다.

### 2026-08-11 — ERP 전화데스크 재통화 담당자 필터 출시 후보
- 재통화 업무 큐의 기본 필터를 서버 세션의 로그인 직원으로 고정하고 `내 업무 · 직원명`으로
  표시한다. 미완료 업무가 있는 다른 담당자와 `전체 담당자`를 같은 select에서 선택할 수
  있으며, 선택한 범위의 미완료 건수와 범위별 빈 상태 문구를 함께 갱신한다.
- 기존 전화데스크 snapshot의 재통화 담당자 ID·이름을 사용하므로 API·DB·권한 계약은
  바꾸지 않았다. SSE로 snapshot이 갱신돼도 현재 선택을 유지하고, 선택한 담당자의 마지막
  업무를 완료한 뒤에도 해당 담당자의 빈 큐를 확인할 수 있다. 로그인 직원 prop과 서버
  snapshot만으로 첫 렌더를 구성해 hydration 결정성도 유지한다. 모바일에서는 담당자
  select와 건수 배지가 한 행 너비에 맞게 줄어든다. `PROJECT_PLAN.md`는 v1.10이다.
- ERP typecheck·ESLint, core 선행 빌드와 ERP production build, `git diff --check`를 통과했다.
  운영 데이터 변경과 실서비스 배포는 수행하지 않았다.

### 2026-08-11 — ERP 상담 상세 액션 정렬·버튼 노출 조건 운영 대조
- 상담 상세의 센트릭스 상태 문구가 전화 컨트롤 높이만 늘려 문자·전화·무효 처리 버튼의
  수직 중심이 어긋나던 문제를 수정했다. 액션 묶음은 상단 정렬하고 전화·리걸프렌즈 무효
  버튼을 문자 버튼과 같은 46px 높이로 맞췄으며, 상태 문구는 전화 버튼 아래에 그대로 둔다.
- 사용자가 지정한 운영 상담 세 건을 개인정보를 출력하지 않는 읽기 전용 진단으로 대조했다.
  문자·전화는 최신 요청에 전화번호가 있고 로그인 직원이 현재 담당자일 때만, 리걸프렌즈
  무효 처리는 사건 연결이 존재하면서 현재 담당자 또는 관리자일 때만 보인다. 담당자가
  관리자 본인이어도 사건 연결이 없는 종결 상담에는 무효 버튼이 없고, 다른 직원 담당이며
  사건 연결도 없는 배정 상담에는 세 액션이 모두 없다. 운영 데이터 변경과 배포는 하지 않았다.
- ERP typecheck·ESLint, core 선행 빌드와 ERP production build, `git diff --check`를 통과했다.
### 2026-08-11 — 통합 문자 화면 전체 번호·MMS 이미지·대화 전환 UX 출시 후보
- 인증·역할 검사를 통과한 `/messages` 목록과 선택 헤더는 고객 전화번호를 별표 없이 전체
  하이픈 형식으로 표시한다. DB AES-GCM, outbox·로그 비식별과 기존 15분 단위 조회 감사는
  유지하며 U+ 비표준 `SRC`는 원문 대신 `발신번호 확인 필요`로만 표시한다.
- 말풍선 최대 폭을 데스크톱 360px·모바일 340px 이하로 제한하고 본문을 약 15px로 키워
  휴대전화처럼 약 18~23자에서 줄바꿈되게 했다. 파일명 배지 대신 실제 JPG를 lazy-load하며
  provider URL 오류 때만 `첨부 이미지를 표시할 수 없습니다`를 보여준다.
- migration `0045_fat_ronan.sql`은 `telephony_messages.image_url_snapshot`을 추가한다. 신규
  MMS는 파일 ID·원본명과 함께 발송 시점 SOLAPI URL을 보존하고, 기존 MMS는 현재 템플릿의
  파일 ID가 발송 snapshot과 정확히 같은 경우에만 URL을 backfill한다. 템플릿 수정·삭제로
  과거 문자에 다른 이미지가 표시되지 않으며 이미지 Base64는 저장하지 않는다.
- 선택된 고객을 다시 클릭하면 `threadLoading`만 켜지고 key effect가 재실행되지 않아 다음
  15초 polling까지 로딩이 지속되던 원인을 고쳤다. 같은 행 재클릭은 현재 대화를 유지하고,
  요청 sequence로 빠른 고객 전환 중 늦게 끝난 이전 응답도 최신 선택을 덮어쓰지 못한다.
- `lawand_dev`를 별도 임시 DB로 dump/restore한 뒤 migration `0045` 적용과 nullable text
  컬럼·비 MMS URL 0건을 확인하고 임시 DB·dump를 삭제했다. 로컬에는 MMS 원장이 0건이라
  실제 URL backfill 대상 검증은 운영 반영 전 snapshot에서 다시 집계한다. root Turbo의
  5개 패키지 typecheck·lint·production build, core 62개·gateway 99개 테스트, Drizzle
  schema check와 `git diff --check`를 통과했다. 운영 migration·배포·운영 데이터 변경은
  수행하지 않았다. 메인 통합 시 `0045`와 gateway·ERP를 같은 릴리스로 배포하고 MMS 이미지,
  전체 번호, 재클릭·빠른 전환을 인증 canary로 확인한다. `PROJECT_PLAN.md`는 v1.11이다.

### 2026-08-11 — 대표 문자 수신함 U+ 비표준 SRC 격리 출시 후보
- 사용자가 운영 gateway의 TTY 전용 `centrex:link-representative`로 대표 계정 7개를 모두
  `userinfo` 검증 연결했다. ERP에서는 5개가 정상 동기화됐지만 `051-502-1919`와
  `02-555-7455`가 `확인 필요`로 남았다. 개인정보 없이 운영 응답 구조를 대조한 결과 두
  계정 모두 HTTP 200·`SVC_RT=0000`이며 인증 실패가 아니었다.
- `051-502-1919`의 과거 3건 중 1건, `02-555-7455`의 총 46건 중 첫 페이지 10건의 4건에서
  U+ `SRC`가 일반 국내 전화번호가 아니라 `숫자 1자리 + w + 숫자 6자리` 문자열이었다.
  기존 파서는 이 한 기록만 격리하지 않고 페이지 전체를 `invalid_response`로 실패시켜
  정상 번호 기록까지 수집하지 못했다. 응답 원문·전화번호·본문은 출력하거나 문서화하지 않았다.
- gateway 출시 후보는 비표준 `SRC`를 불투명 provider 식별자로 AES-GCM 암호화하고 일반
  전화번호와 다른 HMAC namespace를 사용한다. 이 기록은 직전 발신 상담·Case_idx 자동
  매칭에서 제외하며 ERP에는 `발신번호 확인 필요`만 표시한다. 같은 페이지의 정상 전화번호
  메시지는 계속 수집한다. DB migration·운영 데이터 직접 수정은 없으며 gateway만 배포하면
  다음 polling에서 두 mailbox 오류가 자동 해제되고 backfill을 재개한다.
- 관련 센트릭스 파서·source identity·표시 단위 테스트 16개, 전체 core 62개·gateway
  99개 테스트와 5개 패키지 root typecheck·lint·production build, scripts lint, Drizzle
  schema check와 `git diff --check`를 통과했다. 운영 배포·수신 원장 생성·통제 회신은 이
  워크트리에서 수행하지 않았다. `PROJECT_PLAN.md`는 v1.10이다.

### 2026-08-11 — 통합 배포 지연 검증·외부 센트릭스 로그인 충돌 확인
- 릴리스 `20260811T035307Z-centrex-message-inbox-v1`의 지연 검증에서도 gateway·ERP 외부
  HTTPS는 200이고 두 앱과 Caddy는 active, 배포 이미지 ID 일치, systemd·컨테이너 재시작
  0, error priority journal 0을 유지했다. 실제 통화와 통화/받기/문자 명령, outbox는
  건드리지 않았다.
- 배포 직후에는 0이던 Windows `LoginFailures`가 업무 중 2개, 이후 1개로 올라가
  `lawand-centrex-login-failures` 경보가 ALARM으로 전환됐다. 최종 실패 대상은
  `lawand-slot-017` 하나이며 설치 51, 배정 18, 실행 23, warm 5, assigned offline 0,
  DPAPI queue·dead-letter 0, supervisor 정상이다. 해당 슬롯 로그는 성공 로그인 뒤
  `STATUS=-1(NotFound)`와 자동 backoff 재로그인이 반복됐고 배정 원장은 계속
  `connected`·heartbeat 최신이다.
- 사용자는 해당 직원이 다른 곳에서 같은 센트릭스 계정으로 계속 로그인하는 상황일 가능성이
  높다고 알려왔다. Windows·Caddy는 이번 릴리스에서 재시작하지 않았고 다른 슬롯은 정상이므로
  배포 회귀가 아니라 외부 중복 로그인에 따른 세션 충돌로 추정한다. 운영 통화 보호를 위해
  슬롯 재시작·강제 종료·재배정이나 DB 보정은 하지 않았다. 다른 기기 로그인을 종료하면
  bridge의 다음 `STATUS=1`과 CloudWatch의 연속 정상 datapoint로 자동 해제되는지 확인한다.

### 2026-08-11 — HERDR 전수 통합·대표 문자 수신함 운영 배포·Turbo 공용 shim 복구
- `git fetch --prune`·`git pull --ff-only origin main` 뒤 HERDR 관리 워크트리 3개와 로컬
  `worktree/*` 15개, `origin/worktree/*` 9개를 전수 대조했다. 모든 HEAD가 `main`의
  ancestor였고 대표 문자 수신함 `177572f`, U+ 이력 보정 `290a5a1`, 리걸프렌즈 무효 처리
  `d7fbdf7`은 merge `80f96bb`에 이미 함께 들어 있어 추가 merge commit은 만들지 않았다.
  최종 배포 소스는 README 환경 수정까지 포함한 `main`/`origin/main` `22ec16a`다.
- WSL `PATH`에는 `~/.local/bin`이 있지만 `pnpm`이 없고 메인에만 우연히
  `node_modules/.bin/pnpm`이 있어 HERDR 워크트리의 root Turbo 검증이 실패하던 원인을
  확인했다. Corepack `pnpm@11.17.0` shim을 사용자 공용 `~/.local/bin`에 설치하고 README도
  같은 기준으로 바꿨다. 현재 세 HERDR 워크트리 모두 `pnpm` 11.17.0과 Turbo 5개 패키지를
  인식한다. root Turbo typecheck·lint·test·production build, core 62개·gateway 97개
  테스트, Drizzle schema check와 `git diff --check`를 통과했다.
- 통합 릴리스 `20260811T035307Z-centrex-message-inbox-v1`을 gateway·ERP에 배포했다. private
  S3 AES256 아티팩트 SHA-256은
  `9787c5c93fd5c8cf87374c4be13374671e2f521d04f816ed83ccf825f4b13ec3`, gateway 이미지 ID는
  `sha256:9e8f0826d7ec5c8fa33abd03fde258d5e6a3878dda2763e6d9ce9ef148caa4a2`, ERP 이미지 ID는
  `sha256:683b11925237096d300db694cd34267071877ea2dc4350951a2d39ea37838ea7`이다. 암호화 스냅샷
  `lawand-prod-pre-centrex-message-inbox-20260811t035307z`을 available까지 확인하고 migration
  `0044_sturdy_preak.sql`을 적용했다. 운영 migration은 45개이고 최신 해시
  `a3a1a052348fb1c7c7ee770529673fe8fcc945d751d47d9f7c1064220dd1f0e2`가 Git과 일치한다.
- 신규 수신·mailbox 상태 테이블, `lawand_app` CRUD·viewer SELECT 전용·PUBLIC 조회 차단,
  대표 endpoint 7개·활성/인증/binding 0을 확인했다. 현재 secret에는 대표 계정 비밀번호가
  없으므로 추정하거나 복사하지 않았다. 각 계정은 현재 비밀번호를 TTY 전용
  `centrex:link-representative`에 넣어 U+ `userinfo` 회선·내선 일치를 통과시킨 뒤에만
  활성화한다. 따라서 worker와 `/messages`는 운영 배포됐지만 실제 대표 수신 polling·과거
  backfill·통제 회신 Case_idx canary는 이 계정 연결 뒤 남아 있다.
- 업무 통화가 계속 이어져 0건 대기가 무기한 지연되는 상황에서 물리 통화 경로가 아닌
  gateway만 무손실 전환했다. 통화·받기·문자 명령, 통신 outbox, 회선별 활성 중복이 모두
  0인 명령 내부 gate를 통과했고 Windows DPAPI 큐를 안전망으로 유지했다. Caddy·Windows
  bridge는 재시작하지 않았다. 새 gateway는 시작 2초 뒤 기존 U+ 수신 `ringing` 고착 2건을
  제공자 이력으로 `failedCount=0` 복구했고, 실제 통화 중인 회선은 그대로 보존했다.
- 인증 ERP `/messages`, `/message-templates`→`/messages`, `/clients`, `/phone-desk`, `/profile`
  모두 200이며 새 문자 API는 기존 대화 12개와 비활성 대표 mailbox 7개를 반환했다. 임시
  세션은 0건으로 정리했다. 최종 gateway·ERP·각 Caddy active, systemd·컨테이너 재시작 0,
  error journal 0, 외부 health/login 200, CloudWatch ALARM 0이다. Windows는 설치 51,
  배정 18+warm 5, 실행 프로세스 23, 오프라인·로그인 실패·DPAPI 큐·dead-letter 0,
  supervisor 정상이다. 최종 읽기 시 실제 업무 통화 수신 1·발신 1이 진행 중이나 회선 중복과
  실행 명령은 0이다. 기존 SOLAPI MMS 실패 4건과 일반 업무 pending outbox 9건은 재시도·
  보정하지 않았다. 실제 문자 발송은 이번 배포에서 만들지 않았다. `PROJECT_PLAN.md`는
  v1.08이다.

### 2026-08-11 — 대표 문자 수신함·Case_idx 통합 문자 화면 출시 후보
- 직원 개인 회선·binding·Windows bridge와 분리된 `representative` 센트릭스 endpoint
  7개 메타데이터를 migration `0044_sturdy_preak.sql`에 비활성 상태로 추가했다. 원번호가
  없는 070 회선 하나도 포함하며 현재 클릭투콜 발신 회선과 U+ 대표전화 순차착신 설정은
  바꾸지 않는다. 비밀번호 원문·SHA-512·암호문은 코드·migration·문서에 넣지 않았고,
  배포 뒤 TTY 전용 명령에서 `userinfo` 회선·내선 일치를 검증한 계정만 암호화 인증 원장과
  활성 상태로 연결한다.
- gateway에 공식 `getrecvsmslist` 수신 API와 대표 계정별 직렬 polling worker를 추가했다.
  최신 첫 페이지와 과거 backfill을 번갈아 읽어 신규 회신이 과거 동기화에 굶지 않게 하고,
  실패 계정도 전체 회전에서 다른 계정을 막지 않는다. 번호·본문은 AES-GCM, 중복·상대번호는
  HMAC 지문으로 저장하며 로그에는 endpoint ID·건수·오류 코드만 남긴다.
- 같은 상대번호의 수신은 수신시각 이전 최신 성공·전달 불명확 발신 원장을 찾아 그 발신의 상담 또는
  리걸프렌즈 `Case_idx`를 상속한다. 동일 휴대전화번호를 공유하는 여러 고객도 최근 발신
  맥락별로 분리되며 선행 발신이 없으면 고객을 추측하지 않고 `연결 확인 필요`로 보존한다.
  기존 센트릭스 SMS/LMS와 SOLAPI MMS 발신은 그대로 유지한다.
- ERP `문자` 메뉴를 `/messages` 통합 수·발신 화면으로 바꾸고 Case_idx별 시간순 말풍선,
  고객 검색, 대표 수신함 연결·동기화 상태, 15초 대화·30초 목록 자동 보정을 추가했다. 기존
  `/message-templates`는 새 화면으로 이동하며 개인 템플릿 생성·수정·삭제와 JPG 미리보기는
  모달에서 재사용한다. 첫 SSR은 서버 props와 고정 state만 사용하고 portal은 사용자 클릭
  뒤에만 연다.
- 로컬 개발 DB 복제 임시 DB에 migration `0044`를 적용해 대표 endpoint 7·활성/인증/binding
  0, 앱 CRUD·viewer SELECT 전용·PUBLIC 권한 0을 확인하고 임시 DB를 삭제했다. core 62개·
  gateway 94개 테스트, 5개 패키지 typecheck·lint·production build, scripts lint, Drizzle
  schema check와 `git diff --check`를 통과했다. root Turbo는 이 워크트리에서 package manager
  binary 경로를 찾지 못해 같은 범위를 패키지별로 검증했다. 모바일 Chrome 실기기와 실제
  대표계정 인증·수신 canary는 남아 있다. 운영 migration·운영 데이터 변경·배포는 수행하지
  않았고 대표전화 조건 라우팅도 후속 범위다. `PROJECT_PLAN.md`는 v1.07이다.
### 2026-08-11 — U+ 수신 이력 시간 정밀도·전화데스크 고착 수정 출시 후보
- 운영에서 U+ 수신 콜백은 밀리초 `ringing_at`, 종료 `getinboundcall`은 초 단위 시작 시각을
  반환해 같은 초의 provider 시작이 콜백보다 0.47초 앞섰다. `ANSWERED` 연결 시각을 그대로
  쓰면서 DB의 `connected_at >= ringing_at` 제약에 걸렸고, 해당 회선 보정 루프가 약 18초마다
  `unexpected_error`로 실패해 실제 종료 통화가 `ringing`에 남고 뒤 이력도 처리되지 않았다.
- gateway는 provider·콜백 중 이른 값을 호출 시작으로 정규화하고, bridge가 이미 관측한
  연결 시각 또는 두 시작 중 늦은 값을 연결 시각으로 보존한다. 종료 시각도 시간 순서를
  만족시키며, 한 이력의 실패는 개인정보 없는 provider 상태·DB 제약 분류로 기록한 뒤 같은
  회선의 다음 이력을 계속 처리한다. 기존 bridge 연결 시각을 U+ 이력이 덮어쓰지 않는다.
- ERP의 `U+ 앱/망 수신`은 `호출 중/통화 시간 확인 중` 대신 `수신 상태 확인 중/U+ 종료 이력
  확인 중`으로 표시한다. mount 뒤 2분을 넘긴 건은 경고색 `이력 반영 지연/U+ 종료 이력 자동
  재확인 중`으로 바꾸며 첫 SSR은 현재 시각에 의존하지 않는다.
- core 62개·gateway 91개 테스트, 관련 core/db/gateway/ERP typecheck·lint, Drizzle schema
  check, gateway·ERP production build, 실제 장애와 같은 470ms 정밀도 차이를 사용한 로컬 DB
  콜백→bridge 병합→ANSWERED 종료 이력 수직 검증과 임시 원장 0건 정리를 통과했다. DB
  migration·운영 원장 보정·실서비스 배포는 수행하지 않았다. 운영 반영 시 gateway·ERP를
  같은 릴리스로 배포하고 기존 영향 통화는 U+ 이력 기반 이벤트 재처리로 복구한다.
  `PROJECT_PLAN.md`는 v1.06이다.
### 2026-08-11 — ERP 상담 문자 배지·리걸프렌즈 무효 처리 출시 후보
- 상담 상세 `고객 문자 발송 내역`의 grid 행이 긴 본문·오류로 높아질 때 오른쪽 상태 배지가
  행 전체 높이로 늘어나던 문제를 고쳤다. 행의 교차축 정렬을 시작점으로 고정해 `발송 완료`
  등 상태 배지는 내용 높이와 무관하게 pill 크기를 유지한다.
- 전화 접수의 리걸프렌즈 사건 연결이 만들어진 뒤 현재 상담 담당자 또는 관리자만 상세 상단의
  `무효 처리`를 요청할 수 있다. 개인정보 없는 전용 outbox 이벤트에 고정 무효 계정
  `member_id=lawandfirm_s999`·`TblMember_idx=1824`와 사건 연결 참조·요청 직원을 남기고,
  기존 리걸프렌즈 직렬 워커가 저장된 `case_idx` 헤더로 `changeManager`를 호출한다. 성공한
  뒤에만 사건 연결 담당자를 갱신하고 상담·배정·외부 실행 원장은 삭제하지 않는다.
- 중복 클릭은 같은 pending 이벤트를 재사용하고, 처리 중에는 상세를 제한적으로 자동 갱신한다.
  성공 뒤에는 `리걸프렌즈 무효`·`무효 처리됨`, 실패 시에는 외부 연동 실행 원장과 재요청
  버튼을 표시한다. core 62개·gateway 88개 테스트, 관련 core/gateway/ERP typecheck·lint,
  gateway·ERP production build, 모의 외부 클라이언트와 로컬 DB를 사용한 사건 등록→무효
  담당자 변경 통합 검증, `git diff --check`를 통과했다. DB migration·실제 리걸프렌즈
  담당자 변경·운영 배포는 수행하지 않았다. `PROJECT_PLAN.md`는 v1.05다.

### 2026-08-11 — SOLAPI strict MMS 제목 누락 긴급 수정·gateway 운영 배포
- 고객 찾기 통합 배포 뒤 직원이 실제 요청한 JPG MMS 네 건이 서로 다른 이미지 두 개에서도
  모두 SOLAPI HTTP 200 안의 `1010(필수 입력 값 미입력)`으로 등록 거절됐다. 발신·수신번호,
  본문, 이미지 ID는 실제 SOLAPI 원장에 모두 있었고, `strict: true`인 그룹이 검사하는 MMS
  `subject`만 요청에 없었다. 오류 네 건은 고객정보를 출력하지 않고 상태·필드 존재 여부만
  조회했으며 감사 원장과 dead outbox에 그대로 보존하고 재시도하지 않았다.
- `SolapiMmsMessage`에 40바이트 이하 고정 제목 `법무법인 로앤 안내`를 추가했다. 실패 요청과
  같은 발신·수신·본문·이미지를 발송하지 않는 strict 임시 그룹에 제목만 더해 `2000 정상
  접수`를 확인한 뒤 그룹을 `DELETED`로 삭제했다. gateway 87개 테스트·typecheck·lint·
  production build와 `git diff --check`를 통과했고 수정 커밋 `352ff00`을 main에 푸시했다.
- gateway 전용 릴리스 `20260811T001012Z-solapi-mms-subject-v1`을 배포했다. private S3
  AES256 아티팩트 SHA-256은
  `370c29644ce0b04aa724cfc32835fafca2071c74a8e30cf906aed98492c0cb94`, 이미지 ID는
  `sha256:6bdf549bc28c9263481390bf9bbe77e5089de7ff6915304fb3dd223c4cbe3a6c`다. 전환 직전 활성
  통화·통화 명령·문자 명령·문자 pending outbox가 연속 두 번과 명령 내부 gate에서 모두
  0이었고 gateway만 재시작했다. ERP·Caddy·Windows bridge는 재시작하지 않았다.
- 최종 gateway·ERP·Caddy active, 컨테이너 재시작 0, gateway error journal 0, 외부
  health/login 200, CloudWatch ALARM 0이다. EBS와 OS 파일시스템은 ERP·gateway·Windows
  모두 100GB이며 여유는 약 76GB·63GB·79.31GB다. Windows bridge 프로세스 16개도 유지된다.
  수정 뒤 실제 MMS 발송은 새로 만들지 않았으므로 명함 JPG 단말 수신 canary는 남아 있다.
  `PROJECT_PLAN.md`는 v1.04다.

### 2026-08-11 — HERDR 전수 통합·고객 찾기 문자 운영 배포·EC2 100GB 반영
- HERDR 작업트리 `calm-stone-97b1`, `silver-cloud-fa0f`와 모든 로컬 `worktree/*`,
  `origin/worktree/*`를 갱신·대조했다. 모든 HEAD가 `main`의 ancestor였고
  `git pull --ff-only origin main`과 `git push origin main`도 최신이라 추가 merge commit은
  만들지 않았다. 배포 소스는 `main`/`origin/main`이 일치한 `b6c6afc`다.
- 전체 5개 패키지 typecheck·lint·production build, core 61개·gateway 87개 테스트,
  Drizzle schema check와 `git diff --check`를 통과했다. 추적 파일 전용 private S3 AES256
  아티팩트 SHA-256은
  `021b7c4787b2fd9738d0b452c98801c9e8c352febe53c48f4147c5e9a5823383`이고 릴리스는
  `20260810T231946Z-client-directory-messaging-v1`이다.
- 암호화 RDS 스냅샷
  `lawand-prod-pre-client-directory-messaging-20260810t231946z`을 `available`까지 확인한 뒤
  migration `0043_famous_rafael_vega.sql`과 gateway·ERP를 같은 릴리스로 배포했다. 운영
  migration은 44개이고 최신 해시
  `03ec720269d34ad1693c7849bf3267a364b3b93a0163b090b8b35591a326737c`가 Git과 일치한다.
  신규 대상 테이블, `target_source NOT NULL`, 기존 상담 문자 2건 보존, 앱 CRUD·viewer
  SELECT 전용·PUBLIC 권한 0을 확인했다. gateway 이미지 ID는
  `sha256:781b4420ef8f78113631268a53a392435270be46c920acef3d11c47d56beb2f0`, ERP는
  `sha256:b7175abae52e6ce80e1768d48383b7107eca80d7462e45576b504d5bec3add67`이다.
- 사용자가 EBS를 100GiB로 늘렸지만 ERP 30GiB·gateway 40GiB·Windows C: 30GiB에 OS
  파티션이 남아 있음을 확인했다. 실행 컨테이너와 bridge를 중단하지 않고 ERP·gateway의
  루트 파티션/XFS와 Windows C:를 각각 100GiB로 온라인 확장했다. ERP 빌드 전에는 실행
  이미지가 아닌 미사용 Docker build cache만 정리했다. 최종 여유는 ERP 약 76GB, gateway
  약 64GB, Windows 약 79.31GB이고 Windows volume health는 `Healthy`다.
- gateway 전환 직전 업무 통화 1건이 감지돼 자동 중단했고 서비스 파일·컨테이너를 바꾸지
  않았다. 자연 종료 후 연속 두 번 0건과 명령 내부 gate를 다시 확인해 전환했으며 통화를
  강제 종료하거나 원장을 보정하지 않았다. Windows bridge는 재시작하지 않았고 v0.7.1.0
  프로세스 16, 설치 51·배정/연결 11·warm 5, 오프라인·로그인 실패·DPAPI 큐·dead-letter 0,
  감독기·health task 정상이다.
- 인증 ERP `/clients`, `/profile`, `/message-templates`, `/phone-desk`는 모두 200이고 고객
  찾기의 문자·전화 및 개인 템플릿 marker를 렌더했으며 임시 세션은 0건으로 삭제했다. smoke
  test는 발송하지 않았지만 배포 직후 직원이 실제 사용한 고객 찾기 LMS 1건이 Centrex
  `succeeded`, outbox `published`로 완료돼 신규 수직 흐름도 확인됐다. 최종 활성 수·발신,
  회선 중복, 통화·문자 명령, 문자 pending/dead/실패는 0이고 일반 업무 pending outbox 9건은
  변경하지 않았다. gateway·ERP·Caddy active, systemd·컨테이너 재시작 0, error journal 0,
  외부 health/login 200, CloudWatch ALARM 0이다. 실제 JPG MMS canary는 별도다.
  `PROJECT_PLAN.md`는 v1.03이다.

### 2026-08-11 — ERP 고객 찾기 문자·전화 동등 흐름 출시 후보
- `/clients` 검색 결과에 기존 센트릭스 클릭투콜과 함께 상담 상세의 문자 작성창을 재사용해
  개인 템플릿·직접 입력·SMS/LMS·JPG MMS를 보낼 수 있게 했다. `{{고객명}}`과
  `{{담당자명}}`은 검색 결과와 로그인 직원을, `{{접수번호}}`는 리걸프렌즈 사건번호를
  사용하며 사건번호가 없으면 `미등록`으로 치환한다. 발신 가능한 번호가 없으면 문자와
  전화를 모두 막는다.
- 브라우저와 outbox에는 전화번호·본문을 넣지 않는다. 고객·사건 ID만 받은 gateway가 기존
  삭제 사건 제외 security-definer 함수로 대상을 다시 확인하고, migration
  `0043_famous_rafael_vega.sql`의 `telephony_message_directory_targets`에 고객명·전화번호를
  AES-GCM 스냅샷으로 보존한다. 문자 원장은 상담/리걸프렌즈 대상을 명시하며 기존 상담 문자,
  직원 개인 템플릿 소유권, 회선·MMS 설정, 직렬 worker 계약을 유지한다.
- 전화데스크는 통화 사실·후처리 원장으로 유지했다. 고객 대상이 명시되지 않은 직접 수·발신
  행에서 원시 상대번호로 새 문자를 보내면 오발송 위험과 감사 맥락이 커지므로 이번 범위에는
  추가하지 않았다. 후속 필요가 확인되면 상담 또는 리걸프렌즈 고객으로 해석된 상세에서만
  같은 대상 재검증 경계를 재사용한다.
- core 61개·gateway 87개 테스트, 전체 5개 패키지 typecheck·lint·production build,
  Drizzle schema check와 `git diff --check`를 통과했다. `lawand_dev` 복제 임시 DB에서
  migration 43개 적용, 기존 문자 대상 보존 제약, `lawand_app` CRUD·viewer SELECT 전용·
  PUBLIC 권한 0을 확인하고 임시 DB를 삭제했다. 실제 로컬·운영 DB migration, 문자 발송,
  운영 배포는 수행하지 않았다. `PROJECT_PLAN.md`는 v1.02다.

### 2026-08-11 — ERP 내 정보 입력 스타일·전화 내선 중복 표시 수정
- 우측 상단 직원 이름에서 진입하는 `/profile` 기본 정보의 소속·지역 `select`와 부서·직책
  `input`에 ERP의 다른 입력 UI와 같은 테두리·배경·텍스트·hover/focus ring을 적용했다.
- 전화데스크 목록의 직원 이름 아래에는 endpoint 라벨에 이미 포함된 내선을 다시 붙이지 않고
  `내선 {번호}` 한 번만 표시한다. 같은 중복 표현이 있던 전화데스크 상세의 회선 정보와 상담
  상세의 센트릭스 발신 원장도 동일하게 정리했다.
- ERP typecheck·ESLint, core 선행 빌드와 ERP production build, `git diff --check`를 통과했다.
  DB migration과 실서비스 배포·운영 데이터 변경은 없다.

### 2026-08-10 — HERDR 전수 통합·내 정보/개인 문자 템플릿 운영 배포
- `herdr worktree list`, 모든 로컬 `worktree/*`와 `origin/worktree/*`를 갱신·대조했다. 현재
  HERDR 작업트리 `clear-field-5d52`, `clear-harbor-c5e2`, `rapid-field-d8d6`를 포함한 모든
  작업 브랜치 HEAD가 `main`의 ancestor였고 `git pull --ff-only origin main`도 이미 최신이라
  추가 merge commit은 만들지 않았다. 배포 소스는 `main`/`origin/main`이 일치한
  `adf6f51`이다.
- 전체 5개 패키지 typecheck·lint·production build, core 61개·gateway 87개 테스트,
  Drizzle schema check와 `git diff --check`를 다시 통과했다. 활성 수·발신 통화, 통화·문자
  실행 명령, 문자 outbox와 회선별 활성 중복이 모두 0인 것을 두 번 확인하고 Windows bridge는
  재시작하지 않았다.
- 암호화 RDS 스냅샷
  `lawand-prod-pre-profile-message-templates-20260810t135657z`을 available까지 확인한 뒤
  migration `0042_bright_midnight.sql`, gateway와 ERP를 릴리스
  `20260810T135657Z-profile-message-templates-v1`로 운영 배포했다. private S3 AES256
  아티팩트 SHA-256은
  `e573a078437bd7a0b69d8d83c7f03ecccbfc7bfb77c37af02eea65b14af39d53`이고 gateway 이미지
  ID는 `sha256:41ee1ea5ff2bec02ca858085ef630b7a0492e5b3c2d3f87775f5f3470aba5e8a`, ERP 이미지
  ID는 `sha256:ee0af07f59132c2c225669e2627dfc6dc6f8e7f48377a5a4a6a430cce4f052ed`다.
- 운영 migration은 43개이며 `0042` 해시가 Git과 일치한다. 기본 템플릿은 0건,
  기존 직원 개인 템플릿 7건은 보존됐고 소유자 `NOT NULL`, `is_active` 제거, 과거 발송 FK
  `ON DELETE SET NULL`, `lawand_app` CRUD·viewer SELECT 전용·PUBLIC 권한 0을 확인했다.
  인증 ERP `/profile`, `/message-templates`, `/staff`는 모두 200이고 내 정보·비밀번호 변경·
  업무 연결·개인 문자 화면을 렌더했다. 임시 세션은 0건으로 정리했다.
- 최종 gateway·ERP·각 Caddy는 active, systemd·컨테이너 재시작 0, 릴리스 뒤 error journal
  0, 내외부 health/login 200, CloudWatch ALARM 0이다. 문자 queued/dispatching·실패·pending/
  dead outbox는 0이며 기존 일반 업무 pending outbox 8건은 변경하지 않았다. Windows는
  v0.7.1.0 프로세스 16, 배정 11·연결 11·warm 5, 오프라인·로그인 실패·DPAPI 큐·dead-letter
  0이고 감독기·health task도 정상이다. SOLAPI MMS 발신번호 설정은 유지됐지만 통제 수신자와
  이미지가 새로 확정되지 않아 실제 JPG MMS는 보내지 않았다. `PROJECT_PLAN.md`는 v1.01이다.

### 2026-08-10 — SOLAPI MMS 등록 발신번호 운영 설정
- 운영·로컬 gateway의 SOLAPI API 키 지문이 같은 계정임을 확인하고, 공식 활성 발신번호
  목록에서 유일한 `010-****-1382`를 확인했다. 센트릭스 SMS가 표시하는 `02-555-7455`는
  SOLAPI 계정에 등록된 번호가 아니므로 MMS에는 사용하지 않았다.
- `LAWAND_SOLAPI_MMS_SENDER`를 운영 Secrets Manager와 현재 gateway 권한 600 환경파일에
  추가했다. 향후 비밀값 재구성에서도 기존 운영값을 보존하도록
  `configure-production-secrets.mjs`에도 로컬 설정 우선·기존 secret 차선 계약을 추가했다.
- 변경 전 활성 통화·queued/dispatching 문자·pending 문자 outbox는 모두 0건이었다. 아직
  운영에 미배포된 migration `0042`와 gateway·ERP 코드는 섞지 않고 기존 customer-messaging
  gateway 이미지 그대로 재시작했다. gateway·Caddy active, 내부·외부 health `ok`, 컨테이너
  재시작·error journal 0을 확인했다.
- HERDR 워크트리와 모든 `origin/worktree/*`를 다시 대조했고 각 HEAD는 현재 `main`의
  ancestor다. 실제 명함 JPG MMS는 통제 수신자와 발송 내용을 이번 설정 변경에서 새로
  확정하지 않아 보내지 않았으며, ERP에서 다음 통제 발송 1건의 제공자 접수와 단말 수신을
  확인한다. `PROJECT_PLAN.md`는 v1.00이다.

### 2026-08-10 — ERP 문자 템플릿 개인 전용·실삭제 출시 후보
- 기본 제공 템플릿과 `상담 화면에서 이 템플릿 사용` 체크를 제거했다. 템플릿은 이제
  `owner_user_id`가 반드시 있는 직원 개인 설정이며, 만든 직원의 모든 템플릿이 상담 상세
  발송창에 표시된다. 전역 `문자` 화면에는 확인창을 거치는 실제 삭제 버튼과 빈 목록 안내를
  추가했고, 다른 직원 템플릿의 조회·수정·사용·삭제 차단은 gateway에서 계속 강제한다.
- migration `0042_bright_midnight.sql`은 기존 기본 템플릿 3건과 `is_active` 컬럼·인덱스를
  제거한다. 삭제된 템플릿을 사용한 과거 발송은 `telephony_messages.template_id`만
  `ON DELETE SET NULL`로 해제하며 템플릿명·암호화 본문·이미지 스냅샷과 감사 원장은
  보존한다. 발송과 삭제가 경합하지 않도록 발송 트랜잭션은 템플릿에 key-share lock을 잡는다.
- 현재 `lawand_dev`를 복제한 임시 DB에서 `lawand_migrator` 역할로 migration을 적용해
  기본 템플릿 0건, 소유자 `NOT NULL`, `is_active` 0개, FK 삭제 동작 `SET NULL`, 완화된
  스냅샷 제약을 확인한 뒤 임시 DB를 삭제했다. 실제 로컬·운영 DB migration과 운영 배포는
  수행하지 않았다.
- 최신 `main`의 직원 셀프서비스 프로필 작업과 통합한 전체 5개 패키지 typecheck·lint·
  production build, core 61개·gateway 87개 테스트,
  Drizzle schema check와 `git diff --check`를 통과했다. 운영 반영 시에는 암호화 RDS 스냅샷
  뒤 migration `0042`와 gateway·ERP를 같은 릴리스로 배포한다. `PROJECT_PLAN.md`는 v0.99이다.

### 2026-08-10 — ERP 내 정보·본인 업무 연동·최소 초대 main 반영
- ERP 우측 상단의 직원 이름·소속 영역을 `/profile` 내 정보 진입점으로 바꿨다. 이름과
  로그인 이메일은 고정하고, 소속·지역·부서·직책은 본인과 관리자가 수정한다. 역할·권한은
  자기 승격을 막기 위해 관리자만 변경하며, 일반 직원이 폼의 대상 ID를 바꿔도 ERP 서버와
  gateway가 모두 본인 ID만 허용한다. 관리자는 기존 `/staff` 직원 카드에서 같은 기본 정보와
  역할을 수정할 수 있다.
- 센트릭스 회선·내선·현재 비밀번호 검증, endpoint·Windows bridge 자동 배정과 실패 슬롯
  재배정, 리걸프렌즈 ID·`member_idx` 연결을 내 정보에서도 직접 수행한다. 기존 U+ 실제 일치
  검증, 비밀번호 원문 비저장, 리걸프렌즈 중복 차단과 감사 원장은 그대로 재사용한다.
- 비밀번호 변경은 현재 비밀번호를 scrypt로 다시 확인하고 가입과 같은 12자·4종류 강도를
  요구하며, 성공 시 모든 기존 서버 세션을 폐기하고 새 비밀번호로 다시 로그인하게 한다.
  현재 저장소에는 이메일 발송 인프라가 없어 이메일 인증을 가장한 수동 링크는 만들지
  않았다. 분실 계정 이메일 재설정은 발송 채널·만료·재사용 방지 원장과 함께 후속 구현한다.
- 관리자 초대 화면과 bootstrap CLI는 이메일·이름만 필수로 받는다. 가입 시 법무법인 로앤·
  서울·부서/직책 미입력·정규직 기본 멤버십을 만들고 나머지는 가입 뒤 완성한다. 기존 상세
  초대 원장과 가입 계약은 호환되며 DB migration은 없다.
- core 61개·gateway 87개 테스트, 전체 5개 패키지 typecheck·ESLint·production build,
  Drizzle schema check와 `git diff --check`를 통과했다. 사용자 요청에 따라 기능 브랜치를
  `main`에 반영해 `origin/main`에 푸시했다. 실서비스 배포와 운영 데이터 변경은 하지 않았고,
  운영 반영 시 migration 없이 gateway·ERP를 같은 통합 릴리스로 배포한다. `PROJECT_PLAN.md`는
  v0.98이다.

### 2026-08-10 — HERDR 전수 대조·고객 문자 v1 통합 운영 배포
- HERDR가 이 저장소의 워크트리·터미널 관리자임을 재확인하고 HERDR 목록과 모든
  `origin/worktree/*`를 대조했다. `clear-cloud-e8ca`, `rapid-forest-579e`,
  `rapid-forest-aa5e`, `silver-stone-87f7`의 HEAD가 모두 현재 `main` ancestor다. 누락됐던
  `rapid-forest-aa5e` 기능 커밋 `1235772`는 고객 찾기 migration `0040`을 보존하면서 문자
  migration을 `0041_late_talon.sql`로 재생성해 merge commit `f15611e`로 통합·푸시했다.
- 전체 5개 패키지 typecheck·lint·production build, core 59개·gateway 84개 테스트,
  Drizzle schema check와 `git diff --check`를 통과했다. 운영 스냅샷
  `lawand-prod-pre-customer-messaging-20260810t090235z`을 available까지 확인하고 migration
  `0041`과 gateway·ERP를 같은 릴리스 `20260810T090235Z-customer-messaging-v1`로 배포했다.
  private S3 AES256 아티팩트 SHA-256은
  `a63e291ff57ec819df258347d7ecf084371aa6824c01dbd401f850df77cb19ec`이다. gateway 이미지
  ID는 `sha256:0d54f035cc5576f13bdde9b72e7e7a0c079d85deaa7c8996cfc890849ff9deb2`, ERP 이미지
  ID는 `sha256:cba22b9b1a3bc1b744954fdd3fee1608f5fe618372553a027ea44ead86973da2`다.
- 운영 migration은 42개다. 문자 원장·개인 템플릿과 기본 템플릿 3개, `lawand_app` CRUD,
  viewer 읽기, `PUBLIC` 권한 0을 확인했다. 인증 ERP `/message-templates`와 canary 상담 상세는
  각각 200으로 `내 문자 템플릿`·`문자 보내기`·`발송 완료`를 렌더했고 임시 직원 세션은
  0건으로 정리했다.
- 사용자가 지정한 통제 수신자에게 정상 담당자 API→개인정보 없는 outbox→센트릭스 워커의
  실제 SMS 한 건을 발송했다. API 201, SMS 42바이트, 제공자 코드 `0000`, outbox published,
  1회 delivery HTTP 200·succeeded를 확인했다. 통제 상담은 발송 감사 원장을 보존한 채
  `closed` 처리했고 전화번호·본문은 로그나 문서에 남기지 않았다. 단말 최종 수신은 수신자
  확인 영역이다.
- `LAWAND_SOLAPI_MMS_SENDER`는 아직 운영 설정에 없어 이미지 MMS만 의도적으로 비활성이다.
  등록 발신번호를 확정한 뒤 명함 JPG MMS 한 건을 별도 canary한다. 최종 gateway·ERP·Caddy는
  active, 컨테이너 재시작·error journal·CloudWatch ALARM 0, 외부 health/login 200이다.
  Windows는 배정 11·warm 5·v0.7.1.0 프로세스 16, 오프라인·로그인 실패·DPAPI 큐·dead-letter
  0이고 감독기·health task 결과도 0이다. `PROJECT_PLAN.md`는 v0.97이다.

### 2026-08-10 — 워크트리 관리자 HERDR 확정·누락 방지 게이트
- 사용자가 이 저장소의 워크트리 관리자는 Orca가 아니라 **HERDR**라고 확정했다. 이후
  Orca 상태를 이 저장소의 작업 원장으로 사용하지 않는다. 메인 통합 전 HERDR 목록과
  모든 `origin/worktree/*` HEAD의 `main` 포함 여부를 함께 대조하는 규칙을 작업 규칙에
  추가했다.
- 전수 대조 결과 `clear-cloud-e8ca`, `rapid-forest-579e`, `silver-stone-87f7`은 `main`에
  포함됐고 문자 기능 `rapid-forest-aa5e`만 누락된 것을 확인했다. 이 브랜치는 현재 메인에
  통합 중이며, 고객 찾기용 운영 migration `0040`과 충돌하므로 문자 migration은 `0041`로
  재생성한 뒤 검증·배포한다.

### 2026-08-10 — ERP 고객 찾기·migration 0040 통합 운영 배포
- 기존 메인 고객 찾기 커밋 `5bb3087`, silver-stone 병합 결과와 메인 통합 배포 지침
  `c464dae`를 현재 `main` HEAD 단일 아티팩트로 묶었다. 암호화 RDS 스냅샷
  `lawand-prod-pre-client-directory-20260810t082342z`을 `available`까지 확인한 뒤 migration
  `0040_wandering_lenny_balinger.sql`, gateway와 ERP를 같은 릴리스
  `20260810T082342Z-client-directory-v1`로 운영 배포했다. 홈페이지는 영향이 없어 재배포하지
  않았다.
- private S3 AES256 아티팩트 SHA-256은
  `b234c43f376b331c2527cd4f6b26f092e9491d1ed1f2440f076f7b0d3948c978`이다. gateway 이미지
  ID는 `sha256:60a791d7e6b70af332e99a3cb3da548f81bd3623077d5269cd5aa1fb03906546`, ERP 이미지
  ID는 `sha256:1a8217d9d0a51c8e7a67c6ed05ba657ef85860ef23d9aee21a841e4592420966`이다.
- 운영 migration은 `0040`까지 41개다. 신규 대상 원장·enum·함수와 `lawand_app` 권한,
  `PUBLIC` 함수 실행 0, `CB` 직접 조회 차단, 삭제 사건 발신 대상 제외를 확인했다. 인증된
  ERP `/clients` 200·`고객 찾기` 렌더, 한 글자 검색 400·감사 미생성까지 no-call canary로
  검증하고 임시 직원 세션은 0건으로 정리했다. 실제 고객 찾기 발신·대상 원장·알림톡 발송과
  알림톡/리걸프렌즈 외부 실행 대기는 모두 0건이다.
- 배포 시 실제 장시간 업무 통화가 계속되어 Windows bridge와 전화기 세션은 재시작하거나
  강제 종료하지 않았다. gateway 교체 뒤 Windows는 배정 11·warm 5·실행 16, 오프라인·로그인
  실패·DPAPI 큐·dead-letter 0, 감독기 정상이다. 천왕겸 통화 종료 뒤 최종 읽기 시점에도 다른
  실제 업무 통화 수신 1·발신 1이 있었지만 회선별 활성 중복은 0이다. gateway·ERP·Caddy
  active, systemd·컨테이너 재시작 0, error journal 0, 내외부 health 200, CloudWatch 경보는
  모두 `OK`다. 통화 원장이나 기존 운영 데이터를 수동 보정하지 않았다. `PROJECT_PLAN.md`는
  v0.95다.

### 2026-08-10 — 센트릭스 문자·직원 개인 템플릿·JPG MMS 로컬 출시 후보
- migration `0040_late_talon.sql`로 직원 개인 `message_templates`와 암호화 본문 기반
  `telephony_messages` 원장을 추가했다. 소유자 없는 기본 템플릿 3개는 전 직원 읽기 전용이고,
  개인 템플릿은 `owner_user_id`의 직원만 조회·수정·사용한다. 템플릿 이름도 직원별로만
  중복을 막으며 생성·수정·발송은 모두 기존 직원 세션과 상담 역할 경계를 거친다.
- 전화번호가 수집된 현재 담당 상담에서 텍스트 전용 문자는 U+ 센트릭스 `smssend`로
  SMS 80바이트/LMS 720바이트를 발송한다. 개인정보 없는 `telephony.message.requested`
  outbox와 AES-GCM 본문 원장을 같은 트랜잭션으로 만들고 기존 단일 워커가 클릭투콜과
  번갈아 직렬 처리한다. 고객 번호·본문은 이벤트·로그에 넣지 않고 발송 직전에만 복호화한다.
- 템플릿에는 JPG 명함 이미지를 붙일 수 있다. 브라우저와 gateway가 200KB·1500×1440px
  제한을 확인하고 SOLAPI `/storage/v1/files`에 한 번 업로드한 뒤 파일 ID·미리보기 URL·
  크기·해상도만 저장한다. 이미지 템플릿 발송은 SOLAPI MMS로 자동 분기하며 새 운영 설정
  `LAWAND_SOLAPI_MMS_SENDER`에는 같은 계정에 사전 등록된 국내 발신번호가 필요하다.
- ERP 전역 `문자` 메뉴에서 내 템플릿 생성·수정·비활성화, 기본 템플릿 복사, 허용 변수
  `{{고객명}}`·`{{담당자명}}`·`{{접수번호}}`, JPG 첨부와 실시간 휴대전화 미리보기를
  제공한다. 상담 상세에는 `문자 보내기` 작성창·발송 전 확인·상태 polling과 실제 본문·
  이미지 여부·담당자·결과 원장을 추가했다. 첫 SSR은 고정 상태이고 dialog는 사용자 클릭
  뒤 body portal로 열려 hydration 비결정값을 만들지 않는다.
- core 57개·gateway 83개 테스트, 5개 패키지 개별 typecheck, core/db/gateway/ERP build,
  gateway/ERP lint, Drizzle schema check와 `git diff --check`를 통과했다. 모노레포 root turbo는
  이 워크트리 PATH에 `pnpm` shim이 없어 실행하지 못했지만 같은 범위를 패키지별로 검증했다.
  로컬·운영 DB migration, 실제 SMS/MMS 발송, `main` 병합과 운영 배포는 하지 않았다.
  운영은 암호화 스냅샷 → migration 0040 → 기존 SOLAPI 키와 등록 발신번호 설정 → gateway/ERP
  동시 배포 → 통제 SMS/LMS·명함 MMS 각 1건 순서다. 상세는 `docs/CENTREX_MESSAGING_V1.md`,
  `PROJECT_PLAN.md`는 v0.94다.

### 2026-08-10 — silver-stone 메인 병합·기배포 상태 검증
- 원격 `worktree/silver-stone-87f7`의 기능·운영 문서 커밋을 기존 고객 찾기 커밋이 있는
  `main`에 병합해 `3d41396`으로 만들고 `origin/main`에 푸시했다. 최신 인수인계 로그 충돌은
  재접속 보정 항목을 위에, 고객 찾기 항목을 아래에 두어 둘 다 보존했다. 병합 상태에서 전체
  typecheck·lint·production build, core 57개·gateway 79개 테스트, Drizzle schema check와
  `git diff --check`를 통과했다.
- 브랜치 세션이 gateway 릴리스 `20260810T073937Z-centrex-active-call-v1`과 Windows bridge
  v0.7.1.0을 이미 운영에 배포했으므로 main에서는 재배포하지 않았다. 기존 김지안 수신 ghost
  보정과 slot 007·013 dead-letter 6건 아카이브도 다시 실행하지 않았다. gateway 실행 이미지
  ID `sha256:585b6878b719dbe70093212fe5822606f9a38f3027247f662375507d9cc4abe9`, bridge
  SHA-256 `0EF80F01F74EE631FFF02E626A4681127A7F344430AF6D307DA34DACB30101D8`을 운영에서
  읽기 전용으로 재확인했다.
- 운영은 gateway·Caddy active, 양쪽 systemd·컨테이너 재시작 0, 릴리스 이후 error journal 0,
  내부·외부 health 200이다. Windows 상태는 설치 51, 배정 11, 실행 16, warm 5, 오프라인·
  로그인 실패·활성 큐·dead-letter 0, 감독기 정상이고 16개 프로세스가 모두 v0.7.1.0이다.
  최근 10분 CloudWatch 원시 지표도 같은 값이며 5종 경보는 모두 `OK`다. 검증 중 실제 업무
  통화가 새로 진행되어 활성 통화 수는 인수인계 시점의 0이 아닌 동적 값이었지만, 회선별 활성
  중복은 0을 유지했다. 통화를 강제 종료하거나 운영 원장을 보정하지 않았다.
- 현재 main의 고객 찾기 커밋 `5bb3087`과 migration 0040은 이 작업에서 운영 배포하지 않았다.
  따라서 다음 main 배포에서는 고객 찾기 운영 migration·gateway·ERP 배포 범위를 별도
  승인·검증하고, 이번 기배포 확인과 혼동하지 않는다.

### 2026-08-10 — 브리지 재접속 종료 보정·회선당 활성 통화 단일화 운영 배포
- 김지안 회선에서 수신 `connected`와 직접 발신이 동시에 활성로 보인 원인을 운영 원장과
  Windows 로그로 대사했다. 다른 장소의 중복 센트릭스 로그인 때문에 slot 013이
  `LOGIN_RESULT=-1`·`NETWORK_ERROR` 뒤 재접속했고, v0.7.0이 로그인 성공 때 메모리의 기존
  수신 상태를 종료 이벤트 없이 비워 DB에 ghost가 남았다. 뒤 직접 발신은 정상 종료됐지만
  수신 한 건만 계속 활성로 남은 상태였다.
- Windows bridge v0.7.1은 네트워크 재접속·수동 해제·회선 재설정·본인확인 실패·프로세스
  종료 전에 현재 활성 수신·발신별 `ended` 보정 이벤트를 DPAPI 내구 큐에 넣고 나서 상태를
  비운다. 로그인 성공 시 남은 상태와 3분 지난 수신 ring도 보정한다. 외부 번호 계약에
  맞지 않는 4자리 내부 leg는 payload 검증 전에 활성 상태를 만들지 않게 해 뒤따르는
  `connected/ended` 고아 큐도 차단했다. x86 self-test 16개를 통과한 v0.7.1.0 실행 파일
  SHA-256은 `0EF80F01F74EE631FFF02E626A4681127A7F344430AF6D307DA34DACB30101D8`이며
  조직용 인증서가 없어 기존과 같이 `NotSigned`다.
- gateway는 bridge와 U+ callback의 모든 새 ring을 endpoint advisory lock으로 직렬화하고,
  같은 회선의 다른 `ringing/connected` 원장을 `SUPERSEDED_BY_NEW_CALL` 합성 종료 이벤트와
  함께 닫는다. 뒤 실제 종료가 도착하면 provider cause로 보강한다. migration 없이 릴리스
  `20260810T073937Z-centrex-active-call-v1`을 배포했다. private S3 AES256 아티팩트 SHA-256은
  `8e89a0cfe418cdb2dde1acdb381ee9f454e27eb46e9914f9179d3b1b3f0c70a3`, gateway 이미지 ID는
  `sha256:585b6878b719dbe70093212fe5822606f9a38f3027247f662375507d9cc4abe9`다.
- 기존 수신 ghost는 확인된 재접속 시각 `2026-08-10T07:15:14.401Z`로
  `BRIDGE_RECONNECT_RECOVERY` 종료 이벤트를 남겨 복구했다. 배포 전 409 고아 암호문 6건은
  삭제하지 않고 slot 007·013의 `gateway-dead-letter-archive`로 옮겼다. 최종 상태는 배정
  11+warm 5, 프로세스 16개 전부 v0.7.1.0, 오프라인·로그인 실패·활성 큐·dead-letter 0,
  감독기 정상, CloudWatch 5종 경보 `OK`이고 회선별 활성 중복 0건이다.
- 전체 typecheck·lint·production build, core 55개·gateway 78개 테스트, gateway 로컬 DB
  ingress 통합 검증과 `git diff --check`를 통과했다. 운영 gateway·Caddy active, 컨테이너
  재시작 0, 외부 health 200이다. `PROJECT_PLAN.md`는 v0.94다.

### 2026-08-10 — ERP 리걸프렌즈 고객 찾기·센트릭스 클릭투콜 구현
- ERP 전역 내비게이션에 `/clients` 고객 찾기를 추가했다. 고객명 또는 전화번호로
  `CB.TblCSClient`를 검색하고 `Case_idx = CB.TblCase.idx`를 반드시 조인해
  `COALESCE(del_flag, 0) <> 1`인 사건만 표시한다. 결과에는 고객 연락처와 사건 유형·상태·
  사건번호·법원·담당자·등록/수정일을 제공하며, 전화 가능한 결과는 기존 센트릭스
  클릭투콜과 통화 종료 후 공용 후처리·재통화 흐름을 그대로 사용한다.
- `lawand_app`과 브라우저에는 `CB` 직접 조회 권한을 열지 않았다. 검색은 길이·건수 제한이
  있는 security-definer 함수만 실행하고, 감사로그에는 검색어 원문 대신 종류·길이·결과
  건수만 남긴다. 전화 걸기는 브라우저가 전화번호를 보내지 않고 고객·사건 ID만 보내며,
  gateway가 같은 조인과 삭제 조건으로 대상을 다시 확인한 뒤 이름·번호를 AES-GCM으로
  별도 보존한다. outbox 이벤트·SSE·로그에는 전화번호 원문을 넣지 않는다. 기존 수신전화의
  리걸프렌즈 차선 조회에도 삭제 사건 제외 조건을 적용했다.
- migration `0040_wandering_lenny_balinger.sql`을 로컬 `lawand_dev`에 적용했다. 삭제 사건
  4,994건이 있는 상태에서 검색 결과의 삭제 사건 0건, 삭제 사건 식별자의 직접 발신 대상
  해석 0건, `lawand_app`의 두 함수 실행 가능·`CB.TblCSClient` 직접 SELECT 차단을 확인했다.
  운영 RDS와 앱에는 아직 배포하지 않았다.
- 전체 5개 패키지 typecheck·ESLint·production build, core 57개·gateway 79개 테스트,
  Drizzle schema check와 `git diff --check`를 통과했다. `PROJECT_PLAN.md`는 v0.94다.

### 2026-08-10 — 홈페이지 출시 후보 EIP 배포·정식 도메인 안전 전환 준비
- 기존 217개 워크트리 변경을 `d069eb6`으로 보존하고 뒤처진 `origin/main`을 병합한 뒤,
  실제 `/bank/self-diagnosis`에 단계 전환 스크롤·포커스 어텐션 UX를 적용했다. 운영 DB
  URL은 출력하지 않고 프로세스 환경에만 주입해 전체 typecheck·lint·production build,
  core 55개·gateway 78개 테스트, Drizzle schema check를 통과했다. 673px 실제 Chrome에서
  검증 실패 위치 유지와 다음·이전 단계 제목 이동도 확인했다.
- 첫 홈페이지 이미지에서 빌드 시 DB secret이 없어 `/bank`의 빈 사례·후기가 정적 캐시된
  문제를 발견했다. 비밀값을 build arg로 넣지 않고 `/bank`만 요청 시점 동적 렌더로 바꿨다.
  최종 릴리스 `20260810T064408Z-homepage-cutover-ready-v3`, private S3 AES256 아티팩트
  SHA-256 `0b159371d9c5fe021a4d81a1511f0d3d85dc05d83ababfe7f15a03496ba0ef3e`,
  실행 이미지 ID `sha256:31e844e160ae428262017993bb455cd652126e059b35479c0cd4e017040c3465`를
  홈페이지 EC2에 배포했다. 첫 화면 승인 사례 2개·후기 3개, 상담·자가진단·사례·후기·
  robots·sitemap 200, 앱/Caddy active, 재시작·error journal 0이다.
- 공개 검색과 기존 사이트 내비게이션에서 확인한 핵심 WordPress 회생·파산 URL을 가장
  가까운 새 canonical로 한 번만 영구 이동하게 했다. 정식 Caddy는 새 경로만 AWS 앱으로,
  아직 이관하지 않은 이혼·보험·부동산과 기타 legacy 경로는 기존 `222.239.248.41` HTTPS
  origin으로 임시 전달한다. 운영 Caddy 버전에서 config validation을 통과했다.
- 운영 migration 40개 중 39개 해시는 현재 Git과 일치한다. 역사적 0028 한 개만 적용 당시
  해시가 다르지만 0037이 함수 계약을 대체했고 현재 schema·권한 검사는 정상이다. 원장을
  고치거나 0028을 재실행하지 않는다. 후기 3,403·자가진단 1,759·공개 사례 54(발행 승인
  51, preview 3), RDS available·암호화·PITR·삭제방지와 최신 수동 스냅샷을 확인했다.
- DNS 기준점은 Cafe24 NS, apex A `222.239.248.41`, `www` apex CNAME, TTL 1,800초, AAAA 없음,
  Daum MX 유지다. DNS는 아직 변경하지 않았다. 책임 변호사의 자가진단 최종 출시 승인과
  Cafe24 DNS 접속이 다음 게이트다. Windows `lawand-slot-007` 4533은 다른 센트릭스 로그인과
  충돌해 heartbeat는 정상이나 재로그인이 실패 중이고 해당 CloudWatch 경보 한 건이 남아
  있다. 기존 중복 로그인을 종료한 뒤 자동 회복과 경보 `OK`를 확인한다. `PROJECT_PLAN.md`는
  v0.93이다.

### 2026-08-10 — 실제 자가진단 단계 전환 어텐션 UX 검증 완료
- `/bank/self-diagnosis`의 `다음 조건`·`이전`, 결과 제출 완료와 `다시 진단하기`가 새 DOM이
  렌더된 뒤 현재 질문 카드 또는 결과 영역을 고정 헤더 아래로 이동하고 새 제목에 포커스를
  주도록 상담 폼의 공통 `moveAttention` 흐름을 적용했다. 제출 완료 전의 문서 최상단
  `window.scrollTo`는 제거했고, 각 단계 제목은 같은 `aria-labelledby` 계약을 유지한다.
- 입력 검증에 실패하면 어텐션 요청을 만들지 않아 사용자가 보던 오류와 입력 위치를 그대로
  유지한다. `prefers-reduced-motion`은 공통 유틸에서 계속 존중하며 데스크톱·모바일의
  고정 헤더 여백에 맞춰 자가진단 카드와 결과 영역의 `scroll-margin-top`을 지정했다.
- 673px 실제 Chrome에서 빈 값 검증은 현재 카드 하단을 유지하고, 유효한 다음·이전 전환은
  각각 2단계·1단계 제목이 보이는 카드 상단으로 이동하는 것을 확인했다. 운영 DB URL은
  출력하지 않고 Secrets Manager에서 프로세스 환경으로만 주입해 전체 5개 패키지
  typecheck·lint·production build, core 55개·gateway 78개 테스트, Drizzle schema check와
  `git diff --check`를 통과했다.

### 2026-08-10 — 단계형 상담·선택 흐름 스크롤 어텐션 정리
- 상담 요청의 빠른·상세 모드에서 시작 방식 선택, `다음`·`이전`, 제출 완료·새 요청으로
  화면이 바뀐 뒤 새 DOM이 렌더된 시점에 질문 카드 또는 완료 영역을 고정 헤더 아래로
  이동하도록 수정했다. 상태 변경 전에 실행되던 문서 최상단 `scrollTo`를 제거해 이전
  스크롤 위치와 레이아웃 교체가 경쟁하지 않게 했으며, 새 질문 제목에 포커스를 옮겨
  키보드와 스크린리더도 현재 단계를 바로 인지하게 했다.
- 현재 별도 공개 자가진단 라우트는 아직 없으므로, 같은 `다음 질문` 상호작용을 쓰는
  소개 페이지의 선택형 질문·답변 흐름에도 공통 어텐션 유틸을 적용했다. 답을 고르면
  새 답변 제목으로, 다음을 누르면 다음 질문 제목 또는 최종 결과 제목으로 스크롤과
  포커스가 함께 이동하며 `prefers-reduced-motion` 설정을 존중한다.
- 홈페이지 typecheck·ESLint·프로덕션 빌드와 `git diff --check`를 통과했다. 390×844
  헤드리스 Chrome에서 빠른 상담·상세 상황의 시작 및 다음 단계가 모두 질문 제목에
  포커스되고 고정 헤더 아래 화면 안에 표시되는지 확인했으며 콘솔·hydration 오류는
  없었다.

### 2026-08-10 — 홈페이지 공개 문구 프로덕션 정비
- 정식 도메인 연결을 앞두고 `apps/homepage`의 고객 대면 문구 전량을 점검했다. 도메인·
  canonical·sitemap·robots는 이미 `lawandfirm.com` 기준이라 변경하지 않았다.
- 시제품 잔재를 제거했다. 상담 폼의 `prototype-notice`·`prototype-submit-note` 클래스를
  `intake-notice`·`consultation-submit-note`로 바꾸고 `완료하면 실제 상담 요청으로
  접수되며` 같은 시험 대비 표현을 정리했다. 접수 완료 화면의 `complete-journey`
  블록(내부 방문 경로 개수와 CTA pathname 노출)은 개발 검증용이라 화면과 CSS에서 함께
  삭제했다. 여정·귀속 수집 고지는 제출 전 `review-context-note`와 `/privacy`에 남아 있다.
- 미구현 기능을 예고하던 `지연 안내를 보내는 흐름으로 연결할 예정입니다`와 `/about`의
  `구조를 만들고 있습니다`를 현재 운영 사실에 맞는 문장으로 교체했다.
- 하드코딩된 근거 숫자를 동적 집계로 바꿨다. `/about` 대화형 답변의 `3,359건`은 표현으로
  일반화했고, 후기 시작 시점 `2016년 10월`은 `evidence.firstReviewDate` 기반
  `formatMonthLabel`로 렌더한다.
- 내부 용어가 공개 문구로 새어 나온 곳을 고쳤다. `/bank/situations`의 URL 설계 설명,
  카테고리 허브의 `이 허브`, `/about`·`/privacy`·투자채무 페이지의 `원장`을 고객 언어로
  바꿨다. `/people`의 `오피스`→`사무소`, `본문으로 건너뛰기`→`본문으로 바로가기`,
  우종현 변호사 취급분야 `개인 파산·회생`→`개인회생·파산`으로 표기를 통일했다.
- 구현과 어긋나던 안내 두 곳을 사실에 맞췄다. 후기 허브의 `편집 사실을 표시합니다`는
  표시 UI가 없어 문구를 조정했고, `/bank` 히어로의 `변호사가 검토한 정보`는
  `PROJECT_PLAN` 2-13(검토 사실 없는 콘텐츠를 검토 완료로 표시하지 않는다)에 맞춰
  `법령·법원 자료에 근거한 정보`로 바꿨다.
- `/bank` 홈에 하드코딩돼 있던 고객후기 3건을 공개 원장의 최신 3건으로 바꿨다.
  `lib/reviews.ts`에 `getRecentReviews`와 공유 헬퍼(`reviewAreaLabel`·
  `reviewStageLabel`·`formatReviewDate`·`toPublicReview`)를 추가하고 `/bank/reviews`의
  중복 구현을 걷어냈다. 홈은 `revalidate = 300`으로 5분 ISR을 쓰고, 조회가 실패하면
  구조화 로그만 남긴 뒤 후기 섹션을 감춘다(첫 화면과 상담 경로는 계속 열림).
  원문 길이 편차로 카드 높이가 어긋나지 않게 `.review-card blockquote`에 9줄
  `line-clamp`를 넣었고 전문은 `/bank/reviews`에서 볼 수 있다.
- `/about` 히어로의 `현재 공개 고객후기`·`후기 작성일 범위`는 원래부터
  `getReviewEvidence()` 집계라 하드코딩이 아니었다. 같은 페이지에서 고정값이던 곳은
  대화형 답변의 `3,359건`과 본문의 `2016년 10월`뿐이며 위에 적은 대로 처리했다.
- 워크트리에 `node_modules`가 없어 `typecheck`·ESLint·빌드는 실행하지 못했다. 배포 전
  설치된 환경에서 세 가지를 다시 확인해야 한다. 특히 홈이 서버 컴포넌트로 바뀌었으므로
  `LAWAND_APP_DATABASE_URL` 없이 빌드하면 `/bank` 프리렌더가 실패한다.
- 남은 확인 사항: ① `사례로 이해하기`의 카드 2건이 승인된 공개 사례인지
  (`PROJECT_PLAN` 2-12의 공개 사례 파이프라인 전이라면 문구 조정 또는 삭제 필요.
  2026-08-10 사용자 지시로 이번 작업에서는 보류) ② 운영 배포 시
  `LAWAND_GATEWAY_URL`·`LAWAND_PUBLIC_INTAKE_API_KEY`·`LAWAND_TRUSTED_PROXY_HOPS`·
  `LAWAND_APP_DATABASE_URL` 설정.

### 2026-08-10 — 평문 자동 로그온 없는 Windows 실제 재부팅 canary 완료
- 재부팅 직전 진행 중 수신·발신·받기·프로비저닝 0건, 배정 6+warm 5, 프로세스 11, 오프라인·
  로그인 실패·DPAPI 큐 0을 확인하고 13:49 KST Windows를 재부팅했다. 38초 뒤 SSM이
  복구됐고 SYSTEM `Lawand Centrex Bridge Health Monitor`는 boot trigger로 정상 실행됐다.
  Administrator 로그인 전에는 예상대로 bridge 프로세스 0, 배정 오프라인 6, warm 0,
  감독기 비정상이었으며 CloudWatch 배정 오프라인·감독기 이상·warm 부족 세 경보가 실제
  `ALARM`으로 전환됐다.
- 사용자가 14:10 KST `Administrator`로 RDP 로그인하자 별도 수동 작업 없이 logon trigger의
  supervisor가 성공했고 배정 6개+warm 5개, 총 11개 프로세스가 복구됐다. 최종 health는
  설치 51, 배정 6, 실행 11, warm 5, 배정 오프라인·로그인 실패·활성 큐·dead-letter 0,
  감독기 정상이고 CloudWatch 5종 경보가 모두 `OK`로 돌아왔다. 한 회선은 복구 약 2분 뒤
  일시 `NotFound(-1)`을 반환했지만 기존 지수 backoff가 47초 뒤 같은 회선으로 정상 로그인해
  2회 연속 로그인 실패 경보에는 걸리지 않았다. 진행 중 통화·명령·프로비저닝은 최종 0,
  gateway·Caddy 컨테이너와 외부 health/login도 정상이다.
- `AutoAdminLogon`과 평문 암호는 끝까지 도입하지 않았다. 운영 한계는 재부팅마다 관리자가
  RDP 로그인해야 OCX interactive session이 생긴다는 점이며, 이후 RDP는 로그아웃하지 않고
  연결만 끊는다. 코드 서명은 조직용 Authenticode 인증서가 없어 별도 잔여 작업이다.
  `PROJECT_PLAN.md`는 v0.92다.

### 2026-08-10 — Windows 다중 bridge 운영 안정화·10→25→50 실부하 canary 완료
- 배정 직원 6명과 실제 업무 수·발신이 섞이는 상태에서 Windows bridge v0.7.0.0을 배포했다.
  감독기는 배정 슬롯 전부와 유휴 warm 5개를 정확히 유지하고, 작업 스케줄러의 프로세스
  강제 종료 canary는 유휴 슬롯을 38초 안에 새 PID로 복구했다. SYSTEM health monitor는
  heartbeat·로그인 실패·DPAPI 큐·감독기·warm pool을 1분마다 비식별 CloudWatch metric으로
  발행한다. 최종 상태는 설치 51, 배정 6, 실행 11, warm 5, 배정 오프라인·로그인 실패·큐·
  dead-letter 0, 감독기 정상이다.
- 실제 통화 중 orphan `inbound.connected/ended`가 gateway 409로 계속 재시도되어 뒤 정상
  발신 이벤트까지 막는 현상을 발견했다. v0.7.0은 400/404/409/422를 1분 재시도한 뒤 현재
  사용자 DPAPI 암호문 dead-letter로 격리해 후속 이벤트를 계속 보낸다. 조사한 암호문 3건은
  삭제하지 않고 인스턴스별 `gateway-dead-letter-archive`에 보존했고 최종 활성 큐와
  dead-letter는 0건이다. Windows x86 self-test 16개가 통과했고 실행 파일 SHA-256은
  `E3D4FCB197F8AF36726B7C60F5473D6129214DB4C06715C078F04D1505A5EE30`이다.
- t3.medium에서 10개 600초·25개 600초·50개 1800초를 5초 간격 측정했다. CPU p95는
  59%/61%/58%, 최대 76%/100%/100%, 최소 여유 메모리 1411.63/1185.99/939.47MB였고
  프로세스 유실은 없었다. 50개 최대 working set 1347.29MB·private memory 1208.95MB로
  768MB 중단선 대비 여유가 171.47MB뿐이므로 실제 배정 50개 근처에서는 t3.large 상향을
  우선 검토한다. 결과 CSV는 Windows
  `C:\ProgramData\Lawand\CentrexBridge\load-canary\bridge-load-20260810T024019Z.csv`다.
- migration `0039_chemical_captain_flint.sql`과 gateway·ERP 릴리스
  `20260810T012042Z-centrex-stability-v1`을 암호화 스냅샷
  `lawand-prod-pre-centrex-stability-20260810` 뒤 배포했다. 직원관리는
  `정상/연결 중/연결 실패/브리지 오프라인`을 구분하고, 관리자는 온라인 유휴 슬롯으로
  원자 재배정한 뒤 기존 슬롯을 reset·격리할 수 있다. 실제 활성 직원 재배정은 현재 비밀번호
  재입력이 필요하고 통화를 끊을 수 있어 단위·route 검증까지만 수행했다. core 55개·gateway
  78개 테스트, typecheck·lint·schema check와 ERP/gateway production build가 통과했다.
- CloudWatch 경보 5종(배정 오프라인·로그인 실패·DPAPI 적체·감독기 이상·warm 부족)을 만들고
  실제 DPAPI 적체의 ALARM→OK 전환을 확인했다. 현재 SNS topic/subscription이 없어 사람 통지는
  수신처를 정한 뒤 연결해야 한다. Windows 역할에는 metric 발행 최소권한만 남기고 임시
  artifact 정책을 제거했다. gateway·ERP·Caddy active, 컨테이너 재시작 0, 외부 health/login
  200이다.
- bridge와 감독기는 OCX 때문에 Administrator interactive logon 작업이고 SYSTEM health만
  부팅 시 자동 복구된다. `AutoAdminLogon`은 없고 평문 자동 로그온을 도입하지 않았다.
  따라서 실제 재부팅 canary는 관리자가 즉시 RDP 로그인 가능한 시간에 수행해 로그인 전
  오프라인 ALARM과 로그인 뒤 배정 6+warm 5 복구를 확인해야 한다. 운영 exe는 아직
  `NotSigned`이며 빌드·설치의 서명 강제는 구현됐지만 조직용 Authenticode 인증서 발급이
  별도 남았다. `PROJECT_PLAN.md`는 v0.91이다.

### 2026-08-07 — 다음 세션 우선 작업 확정: 센트릭스 운영 안정화·1208 실제 통화 검증
- 사용자는 이번 세션을 종료하고 다음 세션의 최우선 작업을 **단일 Windows 다중 bridge 풀의
  운영 안정화**로 확정했다. 구현 전 `PROJECT_PLAN.md` v0.90과 바로 아래 다중 bridge 풀
  완료 로그를 다시 읽고 현재 운영 원장을 먼저 재확인한다. 이번 메모 작성에서는 코드·DB·AWS
  런타임을 변경하지 않았다.
- 다음 세션 1순위 범위는 Windows 재부팅 뒤 감독기·배정 슬롯·유휴 warm 슬롯 자동 복구,
  프로세스 비정상 종료 자동 재시작, 10→25→50개 단계별 프로세스 CPU·메모리 실부하 canary,
  heartbeat 단절·로그인 실패·DPAPI 큐 적체 경보, 직원관리의 `정상/연결 중/연결 실패/브리지
  오프라인` 상태 구분, bridge 코드 서명 검토와 관리자용 유휴 슬롯 복구/재배정 흐름이다.
  OCX가 interactive desktop을 요구하므로 재부팅 무인 복구는 보안이 약한 평문 자동 로그온을
  임의 도입하지 말고 현재 작업 스케줄러·로그온 세션 제약을 실제 재부팅 canary로 먼저 확정한다.
- 안정화 뒤 1208 회선에서 실제 ERP 클릭투콜, 휴대전화 수신→ERP 실시간 표시→명시적 받기,
  통화 종료 반영, 실물 전화기 직접 발신→전화데스크 기록→공용 후처리 모달을 각각 한 번씩
  검증한다. 현재 1208은 U+ REST·OCX 로그인·endpoint/binding·ERP 연결 상태까지만 검증됐고
  실제 전화는 만들지 않았다. 실제 발신/수신은 사용자가 통제할 수 있는 시간에 함께 수행한다.
- 그다음 제품 우선순위는 전화데스크·수신 카드에 담당자의 근무현황과 회선 실시간 상태를 합쳐
  `근무 중·통화 가능/근무 중·통화 중/자리 비움/퇴근/센트릭스 연결 끊김`을 표시하는 것이다.
  이후 재통화 큐에 오늘 예정·지연·내 업무·담당자 필터, 예정 알림, 원클릭 발신, 통화 종료 시
  업무 완료/재예약, 반복 부재 시도 횟수를 연결한다.

### 2026-08-07 — 단일 Windows 센트릭스 다중 bridge 풀·신규 직원 자동 배정 운영 완료
- 직원별 서버를 만들지 않고 기존 `lawand-centrex-canary` 한 대에서 회선별 x86 OCX
  프로세스를 격리하는 풀을 구현했다. migration `0038_mute_wild_pack.sql`은 직원 없는
  `idle` bridge 배정과 소유권 제약을 추가한다. 암호화 스냅샷
  `lawand-prod-pre-centrex-bridge-pool-20260807` 뒤 운영 RDS에 적용했고, Secrets Manager
  registry에는 기존 검증 bridge 1개와 `lawand-slot-001..050`의 placeholder endpoint·서로
  다른 HMAC secret만 저장했다. 센트릭스 ID·비밀번호는 registry에 없다.
- gateway는 직원 저장 시 U+ `userinfo` 검증 뒤 최근 heartbeat가 있는 idle 슬롯을 advisory
  lock으로 하나만 점유하고 암호화 단기 명령을 보낸다. 신규 배정의 DB 저장·로그인 실패 시
  current/pending endpoint가 없는 같은 슬롯만 다시 idle로 반환해 `failed` 고착을 막았다.
  Windows v0.6.2는 설정·로그·DPAPI 큐·mutex·작업을 인스턴스별로 격리하고 감독기가 배정된
  슬롯 전부 + idle warm 5개만 실행한다. 전체 풀 작업 50개는 설치됐지만 현재 Running은
  배정 1 + idle 5개이고 기존 4591을 합친 프로세스는 7개다.
- 사용자가 제공한 1208 현재 비밀번호는 파일·DB·명령행·로그에 남기지 않고 echo를 끈
  대화형 stdin으로 운영 직원 저장 API에 한 번씩 전달했다. REST 검증은 처음부터 통과했지만
  OCX가 전체 070 ID에 `-1(NotFound)`을 반환해 `-2(PasswdErr)`와 구분했고, 비동기 disconnect
  뒤 내선 PBX ID로 한 번만 재시도하는 fallback과 1초 지연을 보강했다. 최종 canary는
  `LOGIN_RESULT STATUS=1`, 회선·내선 1208, endpoint·주 binding, 직원 API
  `connected/bridgeOnline/credentialConfigured=true`까지 성공했고 실제 발신은 만들지 않았다.
  대화에 노출된 비밀번호는 교체해야 한다.
- gateway·ERP 릴리스 `20260807T090502Z-centrex-bridge-pool-v2`를 운영 배포했다. private S3
  AES256 앱 아티팩트 SHA-256은
  `b052f48d33601acef9f7be7ba6b490fbcb58a9d1a9285df668c47a07f1b776b4`다. Windows v0.6.2.0
  x86 실행 파일 SHA-256은
  `9A055AE97909290C2B7BE0A943C5C9D11D4111BBD3E526253A224634540BA8CB`, AES256 ZIP SHA-256은
  `FBB7A2FC43945799F5DED99CF16B9D061EE005C7FCA4D7EDC2439139C0CEE836`이고 self-test 13개를
  통과했다. gateway 76개 테스트·typecheck·lint, ERP 운영 build도 통과했다.
- 최종 원장은 총 51, 연결 2, idle 49, 온라인 idle 5, 소유권 이상 0이며 DPAPI 큐와 임시
  직원 세션은 0건이다. gateway·ERP·Caddy active, 이미지 재시작 0, 외부 health/login 정상,
  error journal·CloudWatch ALARM·진행 중 통화/받기/클릭투콜 명령은 0건이다. 설치용 Windows
  IAM inline policy와 성공한 일회성 bootstrap task를 제거했다. 7개 프로세스 working set은
  약 169.3MB였고, 50개 회선을 모두 실제 배정하기 전 메모리 실부하 canary 후 필요하면 단일
  Windows EC2 사양을 높인다. `PROJECT_PLAN.md`는 v0.90이다.

### 2026-08-07 — 전화데스크 후처리 UX·상담/사건 문맥 운영 보강
- 후처리 모달이 sticky `backdrop-filter` 헤더의 fixed containing block 안에서 열려 상단이
  잘리던 원인을 확인했다. 모달을 `document.body` portal로 옮기고 열릴 때 내부 스크롤을
  0으로 초기화하며 body scroll 잠금·Escape/배경 닫기를 적용했다. 673px 실제 로컬 Chrome에서
  제목·전화번호와 열 가지 결과의 첫 행부터 보이는 것을 확인했다. 결과·선택지와 각 영역의
  간격도 소폭 넓혔다.
- 기존 상담 연결 카드에 등록일·최근 요청일·현재 담당자를 추가했다. 상담데스크가 먼저
  일치하더라도 비공개 리걸프렌즈 전화 디렉터리를 별도로 조회해 최근 사건 최대 8건의 유형·
  상태·종결/폐지·주/부 담당·법원·등록일·갱신일을 상세와 모달에 표시한다. migration
  `0037_phone_desk_directory_context.sql`은 기존 security-definer 함수 반환만 확장하며
  `lawand_app`은 함수 실행만, `PUBLIC`은 실행 불가이고 `CB` 직접 권한은 없다.
- 재통화 일시의 native datetime 입력을 홈페이지 상담 요청과 같은 평일 날짜 카드 5개·다른
  날짜·08:00~18:30 시작의 30분 시간 카드로 교체했다. 기본 재통화 결과를 고르면 일정 영역이
  아래로 펼쳐지고 기존 담당자를 기본 선택한다. 전화데스크 상세의 목록 링크 버튼 스타일을
  복구했으며 상세에서 후처리 저장·수정하면 `/phone-desk`로 바로 이동한다.
- core 54개·gateway 75개 테스트, gateway/ERP typecheck·lint·production build, DB schema
  check와 `git diff --check`가 통과했다. 로컬 실제 상담·리걸프렌즈 양쪽 일치 데이터와 합성
  종료 통화로 모달·확장 정보·일정 UI를 확인하고 합성 통화·이벤트를 0건으로 정리했다.
- 운영 변경 전 진행 중 통화·클릭투콜·받기·회선전환은 0건이었다. 암호화 스냅샷
  `lawand-prod-pre-phone-aftercare-ux-20260807` 뒤 migration과 gateway·ERP 릴리스
  `20260807T072916Z-phone-aftercare-ux`를 배포했다. private S3 AES256 아티팩트 SHA-256은
  `f22baba6b09d28d090bf294c3cdb9c078791f238e5d8193c3a46905473a78d19`다.
- 인증 운영 canary는 전화데스크 28건 중 실제 상담·리걸프렌즈 양쪽 일치 건의 목록·상세·
  페이지를 모두 200으로 읽고 상담 날짜·담당자, 사건 8건의 법원·등록/갱신일, 상세 목록 버튼과
  후처리 렌더를 확인했다. 임시 세션 잔존 0건, gateway·ERP·Caddy active, 컨테이너 재시작·
  error journal·CloudWatch ALARM·진행 중 전화 명령 0건, 활성 bridge heartbeat 정상이다.
  `PROJECT_PLAN.md`는 v0.89다.

### 2026-08-07 — 전화 디렉터리 일일 동기화를 크론 전용 EC2로 이관·운영 시작
- `Office_idx=56` 전화 디렉터리 동기화를 크론 전용 EC2(`/opt/ai-agents`, 잡 `jobs/lf_phone_directory`)에서
  매일 03:30 Asia/Seoul systemd timer(`lawand-phone-directory-sync.timer`, `Persistent=true`, 랜덤 지연
  180초) → oneshot service → 그 서버의 cronctl 래퍼 경유로 돌린다. 구현 기준은
  `scripts/import-legalfriends-phone-directory.mjs`와 `scripts/verify-legalfriends-phone-directory.sql`이고
  복제 필드·필터·consistent snapshot 방식은 넓히지 않았다.
- 대상 DB URL은 Secrets Manager `lawand/prod/database`의 `migrationDatabaseUrl`만 프로세스 메모리로 읽어
  자식 프로세스 env로 넘기고, 자식 출력은 URL·엔드포인트·비밀번호 패턴을 살균한 뒤에만 기록한다. 원본
  MySQL은 ERP 서버 SSH(개인키 mode 400) 경유로 원격 `.env` 자격증명을 써서 읽어 크론 서버에 원본 DB
  비밀번호를 두지 않는다.
- 교체 게이트: 원본↔staging 행 수·키 범위·최종 수정시각·null 수·행별 digest 일치, 사건-고객 누락 0,
  타 사무소 0, `phone_search` 정규화 불일치 0, 이전 성공(=현재 운영 테이블) 대비 급격한 행 감소(기본
  10%) 차단. 교체 후 같은 트랜잭션에서 소유자 `lawand_migrator`, `PUBLIC`·`lawand_app` 권한 0,
  `lawand_viewer` SELECT 전용, gateway `resolve_inbound_phone_directory(text)` security-definer +
  `lawand_app` EXECUTE 유지를 단정하고 어긋나면 롤백한다. 삭제된 담당자 참조 1건은 미해결로 보존한다.
- 실측 검증: dry-run 통과 → 실패 canary 전후 운영 `CB` 세 테이블 논리 요약 digest 완전 동일 → 실교체
  성공(61,024/61,024/69행, 7.9초, TLS1.3) → 검증 SQL과 행 수·키 범위·최종 수정시각 대조 일치 → 접근 경계
  canary(`lawand_app` 세 테이블 SELECT SQLSTATE 42501 차단·gateway 실행 가능, `lawand_viewer` 읽기 전용)
  → systemd service 수동 1회 성공 → 실패 통지 실발송 확인 → timer enable(다음 실행 2026-08-08 03:30 KST).
- 주의(다음 세션): `pg`는 connectionString의 `sslmode` 파싱값이 명시 `ssl` 옵션을 **덮어써** CA가
  무시된다(RDS 루트 CA는 Node 기본 신뢰저장소에 없어 `SELF_SIGNED_CERT_IN_CHAIN`으로 죽는다) → URL을
  분해해 개별 필드 + `ssl.ca`로 넘겨야 `verify-full`이 실제로 걸린다. 또
  `pg_get_function_identity_arguments()`는 인자명(`requested_phone text`)까지 포함하므로 gateway 함수
  조회는 `pronargs`+`proargtypes[0]` 기준으로 해야 한다. `CB` 스키마에는 다른 동기화 산출물
  (`TblCBCase`·`TblCaseMemo`·`TblMoClientStatement`)이 공존하므로 권한·DDL은 세 테이블만 대상으로 한다.
- 남은 것: 크론 EC2 인스턴스 역할에 CloudWatch 쓰기 권한이 없어(Secrets Manager GetSecretValue만 허용)
  구조화 로그·metric·경보는 코드·설정만 준비됐다. 크론 EC2의 `jobs/lf_phone_directory/IAM_POLICY.md`
  최소권한 정책을 역할에 부착한 뒤 `run_sync.py setup-cloudwatch --email ...` 1회로 활성화한다.

### 2026-08-07 — 브리지 회선전환 오류 수정·전화데스크 후처리/재통화 큐 운영 배포
- 직원관리 회선 저장의 `centrex_network_error`를 Windows 안전 로그로 대사했다. 새 회선
  로그인 성공 `LOGIN_RESULT` 직전에 회선 교체용 `DisconnectServer()`의 비동기
  `NetworkError`가 도착했고, bridge v0.5.0이 이를 새 로그인 실패로 먼저 확정·rollback한
  것이 원인이었다. v0.5.1은 프로비저닝 중 network error를 비결정 재접속 신호로만 처리하고
  실제 `LoginResult`/timeout만 최종 판정한다. Windows x86 build와 self-test 11개를 통과한
  v0.5.1.0(SHA-256
  `D0A730F1FE60A7983663EE1C521494302F6A5F2C5BA4BE728D26525226821C5A`)을 canary 서버에
  배포했다. 작업 Running, 프로세스·응답 프로세스 각 1개, 현재 회선 로그인 성공, DPAPI
  큐 0건이다. 소스 아티팩트 SHA-256은
  `40324ee44e77d9a3a4619a4566b428024d2181688b167fe408c06d826e463688`이다. 사용자가
  직원관리에서 다음 회선 저장을 실행하면 실제 회선 전환 canary를 다시 확인한다.
- migration `0036_phone_desk_aftercare.sql`로 통화 사실과 분리된
  `telephony_call_aftercare`, `telephony_follow_up_tasks`를 추가했다. 결과는 상담완료·
  재상담필요·부재 및 무응답·통화중·담당자 연결 요청·거절·법원 등 관공서·채권자 등·
  잘못 걸린 전화·기타 열 가지다. 기타 설명·메모는 AES-GCM 암호화하고 후처리·재통화
  `NOTIFY`는 식별자·방향·시각만 보낸다. 미완료 재통화는 후처리당 하나이며 미래 30분 단위
  일시와 활성 담당자가 필수다. 재상담필요·부재·통화중·담당자 연결 요청·거절은 UI 기본
  체크지만 해제할 수 있고 기존 담당자를 기본값, 복수 담당자를 선택지로 제공한다.
- ERP `/phone-desk/[id]` 상세, 목록의 미완료 재통화 큐와 완료 동작, 기존 같은 전화 HMAC
  상담 연결, 리걸프렌즈 고객명/담당자 기반 신건 생성, 전화데스크 단독 저장을 구현했다.
  신건은 `staff_recorded_phone_interaction` 처리 근거를 쓰고 명시적 동의 시각을 꾸미지
  않으며 전화 HMAC이 다른 상담 연결을 거부한다. 수신 바와 클릭투콜은 통화 종료 후 같은
  공용 후처리 화면을 열고 기존 상담목록·상세도 최신 후처리 결과를 조회한다.
- core 54개·gateway 75개 테스트, gateway/ERP typecheck·lint·production build, DB schema
  check와 `git diff --check`가 통과했다. 로컬 실제 DB에서 기존 통화 후처리·재통화 생성/
  완료와 미확인 수신→신건상담 생성 두 수직 canary를 수행하고 임시행을 모두 정리했다.
- 배포 전 진행 중 통화·클릭투콜·받기·회선전환은 0건이었다. 암호화 스냅샷
  `lawand-prod-pre-phone-aftercare-20260807` 뒤 migration을 적용하고 두 신규 테이블·결과
  enum 10개·처리 근거·`lawand_app` CRUD 권한을 확인했다. gateway·ERP 릴리스
  `20260807T055854Z-phone-aftercare`의 private S3 AES256 아티팩트 SHA-256은
  `c3008c1ee3b1dd0f69a14df23bd58705b8ce84148c05b8e504ce03669cdd1778`이다.
- 운영 합성 직접발신 canary는 후처리 저장 200·상세 200·재통화 완료 200을 반환했고 통화·
  후처리·업무·감사·임시 세션 잔존은 모두 0건이다. ERP same-origin 페이지·목록·상세·SSE도
  모두 200과 `telephony.desk.sync`를 확인했으며 임시 세션은 0건이다. gateway·ERP·Caddy
  active, 컨테이너 재시작·배포 뒤 error journal·CloudWatch ALARM 0, RDS·스냅샷 available,
  진행 중 전화 명령 0건이다. 크론 전용 EC2의 리걸프렌즈 일일 동기화는 이 작업에 포함하지
  않았고 `docs/LEGALFRIENDS_PHONE_DIRECTORY_CRON_HANDOFF.md`에 별도 실행 지시를 남겼다.
  `PROJECT_PLAN.md`는 v0.88이다.
- 최종 범위 대조에서 수신과 ERP 클릭투콜은 자동 후처리되지만 실물 전화기·비즈콜 앱의
  `centrex_direct` 종료는 상세 수동 진입만 가능했던 누락을 발견해 전역 직원 바에 전화데스크
  SSE observer를 추가했다. 페이지 진입 전 과거 종료는 기준선으로만 처리하고 로그인 직원
  소유 회선의 새 직접발신 종료·미처리 건만 자동으로 열며, 동시 종료는 큐잉하고 공용
  session key로 중복 창을 막는다. ERP lint·typecheck·build 뒤 최종 릴리스
  `20260807T063043Z-phone-aftercare-direct`를 배포했다. private S3 AES256 아티팩트 SHA-256은
  `92576babd191066cb5b15692e6d2551ef9c5888797433800660647bdc80e6f03`이다. 실행 bundle의
  observer 포함, 페이지·목록·SSE 200, `telephony.desk.sync`, 임시 세션 0, 컨테이너 재시작·
  최종 error journal 0을 확인했다.

### 2026-08-07 — 비즈콜 현재 제품 범위 확정
- 사용자 결정으로 비즈콜 앱의 실시간 벨 표시, ERP 받기와 ERP 원격 발신은 현재 범위에서
  제외했다. 비즈콜 앱에서 직접 한 발신과 앱으로 받은 수신이 종료 뒤 통합 전화데스크에
  기록되는 것을 완료 기준으로 삼는다. Android 알림 브리지, U+ 기업 webhook과 동시착신은
  실제 업무 필요가 다시 생길 때만 검토한다.
- 다음 주요 제품 작업은 전화데스크 상세를 중심으로 통화 결과·메모, 재통화 일시·담당자
  작업 큐, 기존 상담 연결과 신건상담 전환을 하나의 흐름으로 만드는 것이다. 통화 사실의
  원장은 전화데스크에 한 번만 두고 상담데스크는 같은 통화·향후 녹취를 연결 조회한다.
  `PROJECT_PLAN.md`는 v0.87이다.

### 2026-08-07 — 비즈콜 실시간 callback 한계 확정·HTTP Host 호환 교정
- 운영 실제 비즈콜 앱 통화 여러 건은 벨·통화 중 U+ `setringcallback` 요청이 0건이고
  `channelstatus`도 계속 `4004/NO CHANNEL`이었으며, 종료 뒤에만 `getinboundcall`의
  `CANCEL/NO_ANSWER/ANSWERED`가 생성됐다. U+ `getringcallback`에 저장된 4535 회선,
  gateway EIP, 비밀 경로, 80 포트, ring 종류 1은 모두 실제 설정과 정확히 일치해 등록
  오류를 배제했다. 따라서 공개 REST callback·채널 조회는 AI비즈콜 앱 leg를 관측하지 않는다.
- 별도로 기존 Caddy의 `http://EIP` site가 IP Host에서만 비밀 callback 경로를 전달하고
  임의 Host·HTTP/1.0 Host 없음에는 308을 반환하는 구형 클라이언트 호환 결함을 발견했다.
  운영 Caddy listener를 `:80`으로 바꿔 정확한 `/v1/centrex-ring/*.html`만 Host와 무관하게
  gateway에 전달하고 일반 HTTP는 계속 HTTPS 301로 보낸다. IP Host·임의 Host·Host 없음이
  모두 앱의 필드 검증 400까지 도달하며 gateway·Caddy 컨테이너 재시작은 0이다. 같은 변경을
  `infra/aws/instance-deploy.sh`에도 반영해 다음 배포에서 유지한다.
- Host 교정 후 실제 `ANSWERED` canary도 callback 없이 종료 54초 뒤 이력으로만 생성돼
  서버 REST만으로 비즈콜 벨 시점을 얻을 수 없음을 최종 확인했다. 종료 이력·고객 해석·
  전화데스크 기록은 정상 유지한다. 즉시 ERP 표시는 Android라면 알림/통화 이벤트를 HMAC
  gateway로 보내는 최소권한 모바일 bridge, iPhone이면 U+ 기업 webhook 또는 사무실 전화
  동시착신 제공 여부 확인이 다음 분기다. `PROJECT_PLAN.md`는 v0.86이다.

### 2026-08-07 — U+ 비즈콜·망 수신 통합 운영 배포
- 재택 비즈콜 앱 수신은 휴대전화에서 울리지만 Windows OCX 이벤트가 없어 ERP에 없던 원인을
  확정했다. 운영 실제 누락 시각은 U+ `getinboundcall`에 `FAILED`·`CANCEL`로 존재했고 기존
  `getringcallback`은 미설정이었다. 공식 `setringcallback`의 HTTP-only 제약에 맞춰 gateway
  EIP 80번은 긴 비밀 `.html` 경로만 reverse proxy하고 나머지는 기존 HTTPS redirect를
  유지한다. callback은 필드·전체 회선·내선을 검증한 뒤 발신번호를 즉시 AES-GCM 암호화·
  HMAC 지문화하며 URL·로그·SSE에 원문을 남기지 않는다.
- callback ring과 Windows bridge ring은 endpoint·발신번호 advisory lock과 짧은 시각창으로
  한 통화에 병합한다. 활성 직원 회선을 15초마다 U+ `getinboundcall`로 대사해 종료 상태를
  확정하고 callback 누락 통화도 기존 암호화 원장에 보강한다. ERP는 `U+ 앱/망 수신` 배지를
  표시하고 물리 bridge가 없는 통화에는 `전화 받기`를 노출하지 않는다. U+ `clickdial`은
  실제 시험에서 비즈콜 앱을 울리지 않았고 공개 앱 deep link·원격 발신 API가 없어 ERP
  클릭투콜은 물리 전화기 전용, 비즈콜 발신은 앱 직접 발신으로 확정했다.
- gateway 73개 테스트·typecheck와 ERP/gateway lint·build, DB schema check, 로컬 실제 DB
  callback replay·bridge 병합·이력 종료 보정·임시행 0 검증을 통과했다. 암호화 스냅샷
  `lawand-prod-pre-centrex-bizcall-20260807` 뒤 릴리스
  `20260807T034220Z-centrex-bizcall`을 gateway·ERP에 배포했다. private S3 AES256 아티팩트
  SHA-256은 `7df317a47e0a4f144e0bfeb1a86c0ce6de6813a0d516a541ef25acefabebda7e`다.
- 운영 시작 시 4535 callback 등록과 누락 이력 4건 보강이 성공했다. 기존 물리 bridge 통화
  1건은 중복 없이 유지됐고 같은 발신번호·분 단위 중복은 0건이다. 인증된 전화데스크는
  `U+ 앱/망 수신` 4건을 반환했고 임시 세션 잔존은 0건이다. 일반 HTTP 301·잘못된 callback
  404·비밀 경로 불완전 요청 400, gateway·ERP·Caddy active, 컨테이너 재시작·error journal·
  CloudWatch ALARM 0, Windows 작업 Running·프로세스 1개다. 다음 실제 비즈콜 앱 수신으로
  즉시 ERP 표시와 종료 후 15초 이내 전환을 최종 canary한다. `PROJECT_PLAN.md`는 v0.85다.

### 2026-08-07 — 직원별 센트릭스 원클릭 통합 연결 운영 배포
- 사용자 결정에 따라 `직원 1명 = 활성 Windows bridge 1개`를 확정했다. 회선 변경은 새
  bridge를 추가 점유하지 않고 같은 bridge 슬롯을 재설정한다. migration
  `0035_natural_greymalkin.sql`의 `staff_telephony_bridge_assignments`는 직원·bridge 각각
  활성 1개를 강제하고 현재·대기 endpoint, 프로비저닝 명령·만료, heartbeat와 실제 로그인
  결과를 보존한다. 운영 secret의 기존 bridge에는 현재 직원 ID만 추가했고 HMAC secret과
  endpoint는 바꾸지 않았다.
- 직원관리 `회선 테스트 및 저장`은 U+ `userinfo` 정확 일치와 클릭투콜 SHA-512 암호문
  저장 뒤 기존 bridge에 단기 `provision` 명령을 보낸다. raw 비밀번호는 DB·로그·감사
  원장·Secrets Manager에 저장하지 않고, bridge HMAC secret에서 파생한 AES-256-CBC·
  HMAC-SHA256 envelope로 전달한다. bridge v0.5.0은 활성 통화가 없을 때 Windows 자격증명과
  endpoint 설정을 교체하고 실제 OCX 로그인 회선·내선이 일치해야 성공으로 보고한다.
  거부·불일치·네트워크 오류·시간초과에는 Windows 설정과 ERP 프로필·binding을 모두 이전
  값으로 보상한다. heartbeat가 온라인이어도 실제 로그인 전에는 `브리지 설정 대기`, 성공
  뒤에만 `전체 전화 연결 완료`로 표시한다.
- 로컬 migration·schema check, 전체 typecheck·lint, core 53개·gateway 70개 테스트,
  ERP/gateway build, Windows x86 self-test 10개를 통과했다. 암호화 운영 스냅샷
  `lawand-prod-pre-centrex-oneclick-20260807` 뒤 migration을 적용하고 ERP 릴리스
  `20260807T022953Z-centrex-oneclick`, gateway 최종 릴리스
  `20260807T023907Z-centrex-oneclick-status`, Windows bridge v0.5.0.0을 배포했다. 최종
  S3 SHA-256은 `61d34cc11ee7d5499dff9ee57605526fc2ee0eb4f98dd913d07d728a01f5d302`,
  Windows exe는 `226ebc46aa380a1385e75ea40faa5923a6b4470880f9a2b6b0c94e30f2fb4339`다.
- 운영 비식별 canary는 4591을 `bridge_pending`, bridge 설정·heartbeat 온라인,
  `state=assigned`로 반환했고 임시 세션 잔존은 0건이다. gateway·ERP·Caddy active,
  컨테이너 재시작·error journal·CloudWatch ALARM 0, Windows 작업 Running·프로세스 1·큐
  0건이다. 현재 bridge Windows 자격증명이 변경 전 값이라 OCX Connect는 실패 중이다.
  사용자가 직원관리에서 현재 4591 비밀번호를 다시 입력해 저장하면 원클릭 실제 로그인과
  수신·받기 canary를 최종 확인한다. `PROJECT_PLAN.md`는 v0.84다.

### 2026-08-07 — 직원별 센트릭스 비밀번호 검증·운영 배포
- 직원관리의 센트릭스 입력을 전체 회선번호·내선번호·비밀번호 한 세트로 확장했다. 저장 시
  회선번호를 U+ 로그인 ID로 사용해 `userinfo`를 호출하고 반환 회선·내선의 정확 일치가
  확인될 때만 endpoint와 주 회선 binding을 생성·교체한다. 실패하면 기존 프로필·배정을
  변경하지 않는다. 비밀번호 원문은 요청 메모리에서만 쓰고 즉시 SHA-512로 변환한다.
- `telephony_endpoint_credentials`에는 SHA-512만 endpoint ID AAD의 AES-256-GCM 암호문으로
  저장한다. `lawand_app`만 CRUD 가능하고 viewer·PUBLIC 조회는 차단했으며 기존 Secrets
  Manager 자격증명은 DB 값이 없는 endpoint의 읽기 fallback이다. 입력은 저장 후 비우고
  다시 표시하지 않는다. 직원관리 필터·회선·내선·비밀번호 CSS도 673px 운영 Chrome에서
  정상 폭·다크 테마로 확인했다.
- 암호화 스냅샷 `lawand-prod-pre-centrex-credentials-20260807` 뒤 migration 0033·0034와
  gateway·ERP 릴리스 `20260807T011028Z-centrex-staff-credentials`를 배포했다. private S3
  아티팩트 SHA-256은 `6102a8e8b7049be7c0820651cb94333db31486a64a52efe612c51075f68b4477`이다.
  core 53개·gateway 68개 테스트와 typecheck/lint/build/schema check를 통과했고 컨테이너
  재시작·error journal·CloudWatch ALARM·진행 중 전화 명령은 0건이다. 운영 화면은 직원
  지정 4535와 기존 실제 endpoint 4591을 `배정 불일치`로 표시한다. 사용자가 4535의 현재
  비밀번호로 저장해 `userinfo`·클릭투콜을 canary하고, 수신·받기·직접 관측용 4535 Windows
  bridge는 별도로 등록해야 한다.

### 2026-08-07 — 직원관리 입력·필터 CSS 충돌 수정
- 직원관리 신규 필드가 높이만 지정되고 ERP 공통 폼의 배경·테두리·글자색 규칙에는 포함되지
  않아, 다크 테마에서 브라우저 네이티브 회색 입력창이 노출되는 문제를 수정했다. 직원검색,
  지역·전화 연결 select, 센트릭스 전체 회선번호·내선번호와 리걸프렌즈 입력에 동일한 너비,
  surface 배경, 테두리, placeholder, hover·focus 스타일을 명시했다.
- Orca computer-use로 실제 673px Chrome에서 필터 세 개와 회선·내선 입력을 스크롤해 수정
  전후를 비교했으며 일관된 다크 테마 렌더를 확인했다. ERP typecheck·lint·production build와
  `git diff --check`가 통과했다. 개발서버는 사용자 확인을 위해 계속 실행 중이고 운영에는
  아직 배포하지 않았다.

### 2026-08-07 — 직원관리 회선·내선·검증 endpoint 자동배정 로컬 출시 후보
- 직원관리 페이지를 활성 직원 지표, 이름·이메일·회선·리걸프렌즈 ID 검색, 지역·전화 연결
  필터, 직원별 계정·조직·센트릭스·리걸프렌즈 상태 카드와 접이식 초대 양식을 갖춘 운영형
  화면으로 개편했다. 센트릭스 전체 회선번호와 내선번호는 초대·직원 수정에서 별도 입력하되
  항상 한 쌍으로 저장·해제하고 core와 DB 제약에서 형식을 이중 검증한다. Orca computer-use로
  실제 로그인된 로컬 ERP를 673px·1936px Chrome에서 확인하고 검색 0건·복원 동작을 검증했다.
- 직원 프로필은 지정 소유자 원장, endpoint·binding은 검증된 물리 전화 제어 권한이라는
  분리를 유지했다. 저장한 회선·내선이 `userinfo` 성공 이력이 있는 활성 Centrex endpoint와
  정확히 일치할 때만 주 회선 binding을 자동 생성·교체한다. 일치 endpoint가 없으면 지정값은
  보존하되 기존 활성 binding을 해제해 잘못된 전화기가 열리지 않으며, 두 값을 비우면 배정도
  해제한다. UI는 endpoint와 gateway bridge 설정·배정 상태를 구분해 보여주고, heartbeat가
  없는 현재는 프로세스 실시간 온라인으로 표현하지 않는다. 자격증명·bridge secret은 직원
  프로필이나 브라우저에 합치지 않는다.
- migration `0033_icy_starfox.sql`은 기존 회선의 내선을 활성 endpoint 정확 일치 또는
  마지막 4자리로 한 번 백필하고 회선·내선 동시 설정 제약을 추가했다. 로컬 migration과
  exact-match 자동배정·unknown-line 기존 binding 해제 canary를 통과했고 임시 원장은 모두
  정리했다. core 52개·gateway 67개 테스트, 네 패키지 typecheck·lint, DB schema check,
  gateway·ERP production build와 `git diff --check`가 통과했다. 실제 전화 명령은 만들지
  않았고 운영에는 아직 배포하지 않았다. 다음은 운영 스냅샷·migration·릴리스 후 신규 4535
  endpoint와 Windows bridge를 등록하고 직원관리에서 배정 상태를 확인하는 작업이다.

### 2026-08-06 — 운영 센트릭스 클릭투콜 워커 활성화
- 사용자의 명시적 승인으로 현재 센트릭스 자격증명을 대화형 프로세스 메모리에서만 받아
  `userinfo`를 재호출했고 실제 070 회선과 내선 4591이 모두 일치했다. 비밀번호 원문은
  파일·DB·Git·AWS에 저장하지 않고 SHA-512 값만 운영 gateway Secrets Manager의
  `office-main-4591` 키에 저장했으며 `LAWAND_CENTREX_WORKER_ENABLED=true`로 바꿨다.
- 활성화 직전 두 차례 확인에서 클릭투콜 명령·대기 이벤트·진행 중 명령은 모두 0건이었다.
  기존 릴리스 `20260806T072225Z-phone-desk`로 gateway 환경을 다시 만들고 재기동했으며,
  워커 시작 로그와 운영 컨테이너의 `userinfo` HTTP 200·회선/내선 일치를 확인했다. 작업
  전후 통화 명령·대기 이벤트·전송 시도는 계속 0건이라 실제 전화는 걸리지 않았다.
- gateway·Caddy active, 재시작 0회, 내부·외부 health 200, 최근 error journal과
  CloudWatch ALARM 0건이다. 실제 운영 ERP 클릭투콜과 OpenAPI 관측 발신 중복 연결 canary는
  사용자가 사무실에 복귀한 뒤 수행한다. 센트릭스 비밀번호를 변경하면 다음 발신 전에
  운영 secret의 SHA-512도 갱신하고 `userinfo`를 다시 검증해야 한다. `PROJECT_PLAN.md`는
  v0.81이다.

### 2026-08-06 — 통합 전화데스크·클릭투콜 관측 연결 운영 배포
- 암호화 수동 스냅샷 `lawand-prod-pre-phone-desk-20260806`을 available까지 확인하고 운영
  RDS에 migration `0032_brown_ronan.sql`을 적용했다. 연결 테이블·제약 5개·개인정보 없는
  전화데스크 알림 trigger 3개·migration hash와 `lawand_app` SELECT/INSERT 권한이
  정상이다. 배포 전 관측 발신·클릭투콜 명령은 모두 0건이라 backfill 변경은 없었다.
- private S3 AES256 아티팩트 SHA-256
  `02a0d8f40fd50c5b7531d7bc53f57d98051959b1ebb19764ea409504f01018c5`의 gateway·ERP
  릴리스 `20260806T072225Z-phone-desk`를 배포했다. 인증 없는 gateway 목록·SSE는 401,
  ERP `/phone-desk`는 로그인 307이며, 5분 임시 세션 canary에서 페이지·목록 API 200과
  SSE `telephony.desk.sync`를 확인한 뒤 세션을 삭제해 잔존 0건을 확인했다.
- 운영 기존 수신 6건이 전체 번호·고객·담당자·회선·통화시간과 함께 표시된다. 673px 실제
  운영 Chrome에서 실시간 연결과 ERP 발신 필터 빈 상태를 확인했다. console 403 세 건은
  모두 설치된 Monica 확장 프로그램 `background.js` 요청이고 hydration·앱 오류는 없다.
  gateway·ERP·Caddy 재시작, error journal, CloudWatch ALARM은 모두 0이며 bridge v0.4.0.0은
  작업 Running·프로세스 1개·큐 0건이다. 운영 gateway secret에는 클릭투콜 활성 플래그와
  REST 자격증명이 없어 워커는 비활성이다. 실물 발신은 사용자가 사무실에 복귀한 뒤,
  클릭투콜은 노출된 비밀번호 교체·secret 연결 뒤, U+ 비즈콜은 직원 회선 등록 뒤
  canary한다. `PROJECT_PLAN.md`는 v0.80이다.

### 2026-08-06 — 통합 전화데스크·클릭투콜 관측 중복 연결 로컬 출시 후보
- 센트릭스 관측 수신·ERP 클릭투콜·센트릭스 직접 발신을 한 목록에서 관리하는 ERP
  `/phone-desk`를 구현했다. 전체 전화번호, 고객·사건·담당자 해석, 회선·내선, 상태·호출/
  통화 시간과 상담 상세 이동을 표시하고 전체·수신·ERP 발신·직접 발신 필터와 검색을
  제공한다. PostgreSQL 별도 알림 → gateway 인증 SSE → ERP same-origin 프록시로 변경
  시에만 snapshot을 다시 읽으며 주기적 polling은 사용하지 않는다.
- migration `0032_brown_ronan.sql`에 `telephony_call_observation_links`를 추가했다.
  발신 명령과 관측 원장은 분리 보존하고 같은 endpoint·상대번호 HMAC 지문, 요청 대비
  -5초~+120초 시각창의 최소 시각차 후보만 1:1 연결한다. 기존 원장 backfill은 양쪽 상호
  최근접 조건도 적용한다. 연결된 ERP 클릭투콜은 목록에서 한 행으로 접고 미연결 관측
  발신은 단말을 추정하지 않고 `센트릭스 직접 발신`으로 둔다.
  실시간 `lawand_telephony_desk_events` payload는 eventType·entityId·direction·occurredAt
  네 필드만 허용해 전화번호와 고객 정보를 싣지 않는다.
- DB schema check, db·gateway·ERP typecheck, gateway·ERP ESLint·프로덕션 빌드, core
  50개·gateway 67개 테스트가 통과했다. 로컬 실제 DB에서 수신 2건·직접 발신 1건과 기존
  성공 클릭투콜 명령에 임시 관측 발신을 연결한 단일 행을 검증했고 임시 event·call·link는
  모두 0건으로 정리했다. 실제 전화는 걸지 않았고 운영 RDS·gateway·ERP에는 아직 배포하지
  않았다. 사용자가 사무실로 복귀한 뒤 클릭투콜·실물 발신 canary, 직원 초대 뒤 U+ 비즈콜
  canary를 수행한다. `PROJECT_PLAN.md`는 v0.79다.

### 2026-08-06 — 센트릭스 직접 발신 관측 원장·운영 배포
- 실물 전화기 내선 4591의 통제 발신에서 `RINGEVENT(ISDIAL=1) → CHANNELLIST →
  CHANNELOUT(HCAUSE=16)`을 확인했다. `CALLERID`는 상대 번호, `AGENT`는 내선,
  `INEXTEN`은 빈 값이었고 약 8.6초 호출 뒤 연결·약 16.4초 통화 뒤 종료됐다. 공식 문서와
  실제 값은 일치했으며 기존 bridge는 안전 로그만 남기고 발신을 gateway로 보내지 않았다.
- bridge v0.4.0은 직접 발신을 `outbound.ringing/connected/ended` 최소 계약으로 DPAPI 큐와
  HMAC gateway 경로에 전달한다. 수신·발신 활성 channel ID를 따로 추적해 ERP 받기 동작과
  수신 종료 보강을 유지한다. Windows x86 build와 self-test 9개가 통과했고 SHA-256
  `50c6c3b3cc92f73be936162c6ede379a41758f1bb611ea0af1f09b5e83d807a0`인 v0.4.0.0을
  배포했다. 작업 스케줄러 Running, 프로세스 1개, 로그인 성공, DPAPI 큐 0건이다.
- migration `0031_groovy_stellaris.sql`은 호환 테이블 `telephony_inbound_calls/events`에
  `direction`을 추가하고 발신 이벤트 3종을 허용한다. 기존 행은 전부 inbound이며 상대
  번호는 방향과 무관하게 AES-GCM 암호화·HMAC 지문으로 저장한다. 발신 이벤트는 수신 전용
  DB 알림에서 조기 반환하고 gateway snapshot도 inbound만 조회하므로 ERP 상단 수신 바에
  섞이지 않는다. 로컬 실제 DB에서 수신 알림·발신 비알림과 발신 3단계 원장·정리를 검증했다.
- 운영 스냅샷 `lawand-prod-pre-centrex-outbound-20260806` 뒤 gateway 릴리스
  `20260806T054920Z-centrex-observed-outbound`를 배포했다. private S3 아티팩트 SHA-256은
  `0699b7e6176354670f8c04c6317f249e6cbbb563ebbb6e621284c5671756f935`이고 AES256이다.
  gateway·Caddy active, 외부 health 200, 컨테이너 재시작·최근 error journal·CloudWatch
  ALARM은 0건이다. core 50개·gateway 61개 테스트, 관련 typecheck/lint/build와 DB schema
  check가 통과했다. post-deploy 실물 발신 canary와 직원 초대·회선 등록 뒤 U+ 비즈콜 앱
  발신 canary가 남아 있다. 전화데스크는 관측 발신을 ERP 클릭투콜 명령에 연결해 중복을
  제거하고 미연결 발신을 `센트릭스 직접 발신`으로 관리한다. `PROJECT_PLAN.md`는 v0.78이다.

### 2026-08-06 — ERP 받기 통화 종료 channel leg 보강·운영 복구
- 실제 운영 받기 통화는 `ringing → connected`까지 정상이고 물리 전화기 스피커폰 양방향
  통화도 성공했지만 종료 뒤 ERP가 `통화 중`을 유지했다. gateway 원장에는 ended가 없었고
  Windows 안전 로그에는 `CHANNELOUT(HCAUSE=16)`이 정상 도착해 있어 bridge ID 매칭 결함으로
  범위를 좁혔다. 최초 수신 ID와 전화기 쪽 연결 channel ID의 prefix·sequence가 모두 달라
  기존 최초 ID·인접 sequence 비교가 종료를 버린 것이 원인이었다.
- bridge가 `CHANNELLIST`의 양쪽 ID를 활성 통화에 모두 보존하고 어느 쪽 `CHANNELOUT`도
  최초 수신 통화의 ended로 처리하도록 고쳤다. 3분 제한은 무응답 수신에만 적용하고 이미
  연결된 통화에는 적용하지 않아 장시간 통화도 종료된다. 실제 관측 ID 쌍 회귀 검사를
  추가했으며 Windows x86 빌드와 self-test 8개를 통과했다.
- Windows bridge v0.3.1.0(SHA-256 `b1127e1e573e7cfe937e9ec7c86026c8ec6f98c9d5b97763f4f346d8fcf9de0a`)
  을 canary 서버에 배포했다. 작업 스케줄러 Running, 프로세스 1개, 센트릭스 로그인 성공,
  DPAPI 큐 0건이다. 이미 누락된 종료는 원본 `CHANNELOUT` 시각·원인 16으로 bridge와 같은
  HMAC gateway 경로에서 복구해 운영 원장을 `ringing → connected → ended` 3건으로 완결했고
  DB는 직접 수정하지 않았다. 다음 실제 받기 통화로 자동 ended·ERP `통화 종료` 전환을
  최종 재확인하면 된다. `PROJECT_PLAN.md`를 v0.77로 갱신했다.

### 2026-08-06 — 직원관리 센트릭스 전체 회선번호 운영 배포
- 직원 초대에 `센트릭스 전체 회선번호`를 선택 입력으로 추가했다. `07046074591` 같은
  전체 11자리를 저장하며 하이픈 입력은 숫자로 정규화하고 내선 4자리·010 번호·길이 오류는
  core와 DB 제약에서 거부한다. 초대 조회에서 지정값을 확인하고 가입 완료 시
  `staff_profiles.centrex_line_number`로 전달한다. 기존 직원은 직원관리에서 수정·해제할 수
  있으며 감사 원장에는 설정 여부와 마지막 4자리만 남긴다.
- 이 필드는 직원 원장의 지정 전체 번호이고 `staff_telephony_bindings`와 분리했다. 이번
  작업은 자동 매핑이나 전화 제어 권한을 변경하지 않는다. migration
  `0030_outgoing_garia.sql`은 기존 활성 주 회선 binding의 전체 번호를 프로필에 한 번
  백필하며, 운영에서 김충환 프로필과 활성 endpoint가 정확히 일치하는 1건을 확인했다.
- 암호화 스냅샷 `lawand-prod-pre-staff-centrex-line-20260806` 뒤 gateway·ERP 릴리스
  `20260806T045120Z-staff-centrex-line`을 배포했다. private S3 아티팩트는 AES256,
  SHA-256은 `ad25594371681d4eb4c22ee89ad045222b93b54b9a78ae6da915276063786742`다.
  core 49개·gateway 61개 테스트, 두 앱 typecheck/lint/build, DB schema check와 로컬·운영
  migration을 통과했다. ERP·gateway 재시작 0회, 외부 HTTPS 200, error journal·CloudWatch
  ALARM·answer 명령 0건이다. 673px 실제 운영 Chrome에서 초대 필드와 기존 직원 전체 번호
  렌더를 확인했고 저장 버튼은 누르지 않았다. 다음은 지정 번호↔검증 endpoint 관리자 승인
  매핑 UI다.

### 2026-08-06 — 운영 직원–센트릭스 4591 회선 매핑 복구
- 고객명은 표시되지만 `전화 받기`가 없는 실제 수신을 진단했다. 운영 활성 세션은 김충환
  직원으로 정상이었고 수신 endpoint도 대표전화 내선 4591로 정상이나,
  `staff_telephony_bindings`가 0건이라 ERP의 `isOwner` 판정이 false였다. 최신 통화도
  `active_owners=NULL`인 채 ringing 후 ended로 남아 버튼 미표시 원인을 확정했다.
- 정확히 하나인 활성 김충환 직원과 정확히 하나인 활성 Centrex 내선 4591을 검증하고,
  다른 활성 소유자가 없을 때만 단일 트랜잭션으로 주 회선·활성 매핑을 만들었다. 결과는
  `primary=true`, `active=true`이고 `telephony.centrex_endpoint.linked` 감사 원장에
  `production_answer_mapping_completion` 사유를 남겼다. 자격증명·전체 전화번호는
  조회하거나 변경하지 않았다. 다음 실제 수신부터 같은 직원 ID의 ERP 세션에만
  `전화 받기`가 표시된다. 장기적으로 직원 관리 화면에 회선 배정 UI가 필요하다.

### 2026-08-06 — 수신 고객 매칭 확인·ERP 전화 받기 운영 배포
- 고객명 미표시 제보 시각의 실제 운영 수신을 PII 원문 없이 대사했다. 암호화 번호·검색
  지문은 정상이고 상담데스크 우선 일치로 `김충환3_테스트`가 반환됐다. 배포 뒤 시각으로
  같은 snapshot을 재현해 `matchSource=consultation`을 확인했으므로 서버 매칭 결함이
  아니라 고객 해석 배포 전부터 열려 있던 ERP 탭의 이전 JavaScript bundle이 원인이다.
  새 ERP 배포 뒤 기존 탭은 한 번 강력 새로고침해야 한다.
- migration `0029_powerful_captain_stacy.sql`로 `telephony_inbound_commands`와
  queued/dispatching/succeeded/failed/expired 상태 원장을 추가했다. 회선 담당 직원만
  ringing 통화의 20초 유효 `answer` 명령을 만들며 통화별 활성 명령은 하나다. bridge의
  GET poll·POST result는 method·정확한 path·body hash까지 HMAC 서명하고 5분 시각창,
  in-memory nonce 재사용 방지, 고정 bridge/endpoint 연결을 검증한다. 결과와 직원·시각은
  감사 원장에 남는다.
- Windows bridge v0.3.0.0은 750ms signed pull, UI STA에서 OCX `Answer()` 실행, 결과
  재전송 시 명령 비재실행을 구현했다. 운영 RDS 스냅샷
  `lawand-prod-pre-centrex-answer-20260806` 뒤 migration을 적용하고 gateway·ERP 릴리스
  `20260806T035011Z-centrex-answer`와 Windows 실행 파일을 배포했다. ERP·gateway·Caddy·
  bridge task/process, 내부/외부 HTTPS와 health, 서명 없는 poll 401, error journal 0건,
  CloudWatch ALARM 0건, 운영 answer 명령 0건을 확인했다. core 47개·gateway 60개 테스트,
  두 앱 typecheck/lint/build, DB schema check, Windows x86 self-test/build가 통과했다.
  실제 수신 중 ERP 버튼→물리 전화기 스피커폰 연결 canary만 사용자 통화로 확인하면 된다.

### 2026-08-06 — 수신전화 고객 해석 gateway·ERP 운영 배포 완료
- 운영 RDS의 암호화 스냅샷 `lawand-prod-pre-inbound-directory-20260806`이 available인
  상태에서 migration `0028_inbound_phone_directory_resolver.sql`을 적용했다. 함수는
  security-definer이고 `lawand_app`은 실행만 가능하며 `CB.TblCSClient` 직접 SELECT는
  계속 불가하다.
- gateway와 ERP를 릴리스 `20260806T031115Z-inbound-directory`로 배포했다. private S3
  아티팩트는 AES256, SHA-256은
  `08e0364be3f5a1b1ad3d40d15b7114ea52ca7d997a576aead1ba30bfb02f2107`이다. gateway health와
  ERP 외부 HTTPS 로그인 200, ERP·Caddy active, ERP 컨테이너 재시작 0회, 최근 error
  journal 0건, CloudWatch ALARM 0건을 확인했다.
- 이제 신규 수신에서 ERP 상담데스크 우선·리걸프렌즈 차선·미확인 세 분기를 실제 화면으로
  검증할 수 있다. 실제 고객 정보 표시 canary와 `Answer()` 버튼 연결은 아직 남아 있다.

### 2026-08-06 — 수신전화 상담데스크 우선·리걸프렌즈 차선 해석 및 canary 고정 IP
- `lawand-centrex-canary`(`i-057d0e55cf9b4de92`)에 탄력적 IP `15.165.2.138`을
  할당·연결했다. 기존 ENI·RDP 보안 그룹은 바꾸지 않았고 Windows SSM은 `Online`을
  확인했다. bridge canary는 재시작 뒤에도 바뀌지 않는 주소를 갖는다.
- 수신 snapshot은 복호화한 번호의 HMAC으로 ERP 상담데스크를 먼저 조회하고, 일치가 없을
  때에만 비공개 `CB`의 고객·사건·담당자를 찾도록 구현했다. `0028`은
  `public.resolve_inbound_phone_directory(text)` security-definer 함수를 만들며,
  `lawand_app`에는 함수 실행만 주고 `CB.TblCSClient` 직접 SELECT는 계속 차단한다.
  함수는 고객명, 사건유형·진행상태·종결 여부와 주/부 담당자 이름만 최대 8건 반환하며
  전화·사건번호·내부 ID·다른 비공개 필드는 반환하지 않는다.
- ERP 수신 바는 상담데스크 일치 시 상세로 가는 링크와 고객·상태·담당자를, 리걸프렌즈
  일치 시 고객·사건·담당자를, 미일치 시 `발신자 정보 없음`을 표시한다. gateway·ERP
  typecheck/lint/build, gateway 57개 테스트, 로컬 migration·함수 권한 검증을 통과했다.
  운영 RDS 반영 전 암호화 스냅샷 `lawand-prod-pre-inbound-directory-20260806`을 생성했고,
  운영 migration·gateway/ERP 릴리스와 실제 수신 canary가 다음 단계다.

### 2026-08-06 — 수신전화 리걸프렌즈 고객·사건·담당자 로컬·운영 동기화
- 리걸프렌즈 전체 SaaS 데이터가 아니라 로앤 사무소 `Office_idx=56`만 선별했다.
  MySQL `CONTENT.TblCase`와 연결된 `CONTENT.TblCSClient`, 같은 사무소
  `ACCOUNT.TblMember`를 하나의 repeatable-read consistent snapshot으로 읽어 로컬
  PostgreSQL 비공개 `CB.TblCase`·`CB.TblCSClient`·`CB.TblMember`에 원자적으로 적재했다.
  고객·사건 각 60,947건, 담당자 69건이며 사건-고객 누락·타 사무소 행·전화 검색값 오류는
  0건이다. 원본에서 이미 삭제된 담당자 참조 1건은 오연결하지 않고 미해결로 보존했다.
- 전화 조회에 필요한 최소필드만 복제했다. 고객은 이름·전화·검색값과 연결키, 사건은
  유형·상태·주/부 담당자와 표시 필드, 담당자는 식별자·이름·직책만 보존한다. 회원
  비밀번호·생년월일·개인 이메일/전화, 사건 계좌 발급기관·계좌번호와 다른 사무소 데이터는
  대상에 없다. `scripts/import-legalfriends-phone-directory.mjs`와 pnpm 명령,
  비식별 논리 해시 검증 SQL, 운영 단일 트랜잭션 복원 스크립트를 추가했다.
- 운영 이관 전 암호화 RDS 스냅샷 `lawand-prod-pre-phone-directory-20260806`을 만들고,
  SHA-256 `740fe491d3ee4f8fee57ad59960727d4ad1fd17ecedd908bae13f5fdbc4cb72a`인 AES256
  비공개 S3 덤프를 gateway SSM 경로에서 복원했다. 로컬·운영의 세 테이블 행별 논리 해시가
  모두 일치한다. 운영 소유자는 `lawand_migrator`, `lawand_viewer`는 SELECT 전용이며
  `lawand_app`·`PUBLIC`은 접근할 수 없다. 임시 평문 덤프는 로컬·서버에서 삭제했다.
  gateway health와 ERP 로그인은 정상, RDS `available`, CloudWatch ALARM은 0건이다.
  `PROJECT_PLAN.md`를 v0.71로 갱신했다. 다음은 상담데스크 우선·이 비공개 원천 차선의
  고객 조회 API와 전화데스크 상세 연결이며, 일일 자동 실행 스케줄은 아직 구성하지 않았다.

### 2026-08-06 — 센트릭스 실제 ERP 표시 확인·전체 번호·복수 수신 운영 배포
- 사용자가 운영 ERP에서 실제 신규 수신과 종료 표시를 확인했다. 최신 원장은 약 13.6초
  울린 뒤 연결 이벤트 없이 `inbound.ringing → inbound.ended(HCAUSE=16)` 두 이벤트로
  자연 종료됐고 Windows 작업은 실행 중, 프로세스 1개·DPAPI 큐 0건이다. 서버 내부에서만
  복호화해 전화번호 형식·암호문·nonce·검색 지문 일치를 확인했으며 원문은 출력하지 않았다.
- 사용자 운영 기준에 따라 인증된 ERP 스냅샷은 전체 발신번호를 반환하도록 바꿨다. DB의
  AES-GCM 암호화·HMAC 검색 지문·마스킹 보조값은 유지하고 `NOTIFY`·SSE·로그에는 번호를
  넣지 않는다. 스냅샷의 20행 제한을 제거하고 UI가 통화 ID별 카드를 모두 렌더해 동시에
  울리는 여러 통화를 빠짐없이 표시한다. 시각적 강조 보강은 사용자 UI 피드백 뒤 진행한다.
- gateway 57개 테스트와 typecheck·lint·build, ERP typecheck·lint·프로덕션 빌드, 서로
  다른 두 수신의 실제 로컬 DB 스냅샷 복호화 검증을 통과했다. 릴리스
  `20260806T022927Z-centrex-inbound-full-number`를 gateway·ERP에 배포했고 아티팩트
  SHA-256은 `88ad7830b60688e854bb44ef00542212acf4155ab57c8a96a62526bf34290732`, S3는
  AES256이다. 운영 과거 원장 전체 번호 계약과 ERP same-origin 프록시 200을 번호 출력 없이
  확인했으며 두 컨테이너는 재시작 0·오류 0·health 정상, CloudWatch ALARM은 0건이다.
  `PROJECT_PLAN.md`를 v0.70으로 갱신했다. 다음은 상담데스크 우선 고객 해석·리걸프렌즈
  동기화 원천 차선과 전화데스크 상세 연결이며, `Answer()` 명령은 아직 연결하지 않았다.

### 2026-08-06 — 센트릭스 ERP 전역 수신전화 표시 3단계 운영 배포
- migration `0027_telephony_inbound_sse_notifications.sql`로 수신 이벤트 commit 뒤
  event ID·call ID·상태·시각만 PostgreSQL `NOTIFY`하도록 했다. gateway는 전용
  `LISTEN` 연결과 인증 SSE를 제공하고 ERP는 same-origin 프록시·재연결 스냅샷으로
  현재 울림을 복구한다. 브라우저에는 마스킹 번호·내선·회선 담당자만 보내며 모든 인증
  화면 상단에 `수신전화/통화 중/통화 종료`와 `내 전화/담당자 전화`를 표시한다.
- 로컬 실제 trigger canary와 gateway 57개 테스트, 관련 typecheck·lint·gateway/ERP
  프로덕션 빌드, DB schema check·`git diff --check`를 통과했다. 운영 암호화 스냅샷
  `lawand-prod-pre-centrex-inbound-ui-20260806` 뒤 릴리스
  `20260806T020118Z-centrex-inbound-step3`을 gateway·ERP에 배포했다. private S3 아티팩트
  SHA-256은 `a5fa84d59a150c4db8d83d0412e7a87457e6f2e1915c920d4707454fec572ef5`이며 AES256이다.
- 운영 비식별 canary에서 DB trigger→gateway `sync → changed`, ERP same-origin 스냅샷·SSE
  200, PII 필드 0건과 임시 통화·이벤트 잔존 0건을 확인하고 임시 세션·스크립트를 제거했다.
  gateway·ERP는 재시작 0·오류 0·health 정상, Windows bridge는 작업 실행·프로세스 1·큐
  0건이다. 다음은 사용자가 ERP를 연 상태에서 실제 전화를 걸어 상단 표시와 bridge v0.2.1의
  자연 `ended`를 확인하는 canary이며, 고객 해석과 `Answer()`는 아직 연결하지 않았다.

### 2026-08-06 — 센트릭스 실제 수신 end-to-end 원장 canary 완료
- 사용자가 새 수신전화를 약 10초 울린 뒤 받지 않고 끊었다. provider 시각 기준 12.896초였고
  `RINGEVENT(ISDIAL=0) → CHANNELOUT(HCAUSE=16)`이 연결 이벤트 없이 수신됐다. 운영 원장은
  통화 1건을 `ended`, 이벤트 2건을 `inbound.ringing → inbound.ended`로 보존한다. 암호문·
  nonce·지문 길이와 gateway 내부 복호화 번호 형식·마스킹·HMAC 재계산이 모두 일치했고
  전화번호 원문은 출력하지 않았다.
- 첫 전송에서 .NET Framework 기본 proxy 경로의 `HttpRequestException`과 센트릭스가 종료를
  같은 prefix·sequence +1인 sibling leg ID로 주는 현상을 발견했다. bridge v0.2.1은 gateway
  고정 주소에 proxy 없이 TLS 1.2로 직접 연결하고, 활성 ring 3분 안에서 같은 ID 또는 같은
  prefix의 인접 sequence만 같은 통화로 인정한다. 보존된 DPAPI ringing 큐는 201로 전달했고,
  누락 ended는 원본 로그 시각·원인으로 HMAC gateway 경로에서만 복구했다. 같은 이벤트 replay는
  약 3.6초 안에 200·큐 0건으로 끝나 DB 이벤트가 2건 그대로임을 확인했다.
- Windows x86 7개 self-test와 실제 빌드·로그인 재시작을 통과했다. 최종 파일 버전은
  `0.2.1.0`, SHA-256은
  `df3e7d6a20cd9c4e01c32a4b74cd172305eb6507e1601ce526bbb728b33a43d4`이며 비공개 S3
  checksum과 AES256 암호화를 확인했다. 임시 S3 쓰기 IAM은 즉시 제거했다. gateway는
  재시작 0·최근 오류 0·health 정상이고 `PROJECT_PLAN.md`를 v0.68로 갱신했다. 다음은 ERP
  전역 수신 표시와 상담데스크 우선 고객 해석이며, 그 실제 전화에서 자동 ended도 재확인한다.

### 2026-08-06 — 센트릭스 bridge→gateway 실시간 수신 2단계 배포
- Windows bridge에 `inbound.ringing/connected/ended` 최소 이벤트 계약, 현재 사용자 DPAPI
  암호화 디스크 큐, HTTPS/HMAC-SHA256 서명, 순차 재시도와 성공 후 삭제를 추가했다.
  gateway는 5분 시각창·nonce·본문 hash·bridge→endpoint 고정을 검증하고 발신번호를 즉시
  AES-GCM 암호화·기존 상담과 같은 HMAC 지문화한다. raw OCX·전화 원문·응답 본문은
  로그·DB·SSE에 넣지 않는다.
- migration `0026_familiar_charles_xavier.sql`로 상담 연결 전 독립 원장
  `telephony_inbound_calls/events`를 추가했다. event ID·provider call ID·nonce 중복과
  payload 충돌을 막고 ringing→connected→ended를 보존한다. 로컬 migration과 실제 DB
  수직 검증, 전체 typecheck·lint, core 46개·gateway 53개 테스트, DB schema check,
  Windows x86 6개 self-test를 통과했다.
- 운영 RDS 스냅샷 `lawand-prod-pre-centrex-inbound-20260806` 뒤 gateway 릴리스
  `20260806T005200Z-centrex-inbound-step2`와 Windows bridge SHA-256
  `e3910f2f7fd03d79ac499862d0719c6231b8b1f16a15c04717687e8805101fd7`을 배포했다.
  bridge secret은 전용 Secrets Manager와 Windows Credential Manager에만 저장했고,
  일회성 Windows secret 읽기 IAM·임시 task·임시 endpoint bootstrap secret은 제거하거나
  7일 복구 삭제로 전환했다. gateway health·기존 worker·Windows 로그인은 정상이며
  운영 수신 원장은 아직 0건이다. 사용자의 새 전화 한 건으로 실제 end-to-end 전송 확인이
  남아 있고 `PROJECT_PLAN.md`를 v0.67로 갱신했다.

### 2026-08-06 — 센트릭스 상시 Windows bridge 1단계 실제 수신 검증
- 진단 HTA를 운영에 재사용하지 않는 `apps/centrex-bridge`를 추가했다. .NET Framework
  4.8 x86 WinForms STA `AxHost`·메시지 루프에서 공식 OCX를 호스팅하고, 회선별 단일
  프로세스·내선/회선 suffix 검증·재접속 backoff·14일 마스킹 로그·작업 스케줄러 재시작을
  적용했다. 자동 받기 UI는 없고 `Answer()`는 아직 외부에 연결하지 않았다.
- 센트릭스 아이디·비밀번호는 사용자가 EC2의 동일 Windows 사용자 자격 증명 관리자에
  직접 저장했다. 설정·명령행·파일·DB·SSM·Git·로그에는 원문을 넣지 않았다. 공식 OCX의
  BMLINK 서명과 x86 PE를 강제하고 브리지 서명을 검사하는 설치기를 추가했으며, 현재
  실행 파일은 명시적으로 허용한 서명 없는 canary라 운영 배포 전 코드 서명이 필요하다.
- 최신 빌드의 x86 여부와 5개 self-test, 설치 스크립트 parser, 로컬/비공개 S3/서버
  SHA-256 일치를 확인했다. SSM으로 기존 HTA를 종료하고 interactive 작업을 시작해
  `HOST_READY → LOGIN_RESULT STATUS=1 → RING_EVENT(ISDIAL=0) →
  CHANNEL_OUT(HCAUSE=16)`을 실제 약 10초 수신에서 확인했다. 발신번호·회선은 끝 4자리만
  기록됐고 작업과 프로세스는 계속 실행 중이다. gateway 인증 이벤트 전송이 다음 단계며
  `PROJECT_PLAN.md`를 v0.66으로 갱신했다.

### 2026-08-06 — 센트릭스 수신 RINGEVENT·Answer 실제 canary
- 임시 EC2 `lawand-centrex-canary`(`i-057d0e55cf9b4de92`, Windows Server 2022 x64,
  `t3.medium`)에 공식 32비트 OCX `1.0.1.21`을 WOW64로 등록했다. CAB·OCX의 BMLINK
  Authenticode가 유효하고 로컬/서버 SHA-256이 일치했으며 최신 Defender 사용자 지정
  검사에서 위협 0건이었다. SSM 전용 역할·instance profile을 연결했고 RDP ingress는
  작업자 공인 IP `/32` 하나뿐이다.
- 비밀번호를 저장하지 않는 진단 host `scripts/centrex-inbound-canary.hta`를 추가했다.
  x86 MSHTA ActiveX host에서 `LOGINRESULT STATUS=1`을 확인하고, 사용자 통제 휴대전화
  수신 한 건에서 `RINGEVENT(ISDIAL=0) → ANSWER_REQUEST(armed-ring) → CHANNELLIST →
  CHANNELOUT` 순서를 확보했다. 사용자가 실제 센트릭스 전화기의 스피커폰 자동 열림과
  양방향 통화를 확인했다. 발신번호 로그는 끝 4자리만 남고 1회 자동 받기는 실행 직후
  자동 해제됐다.
- 일반 x86 COM은 생성됐지만 ActiveX control site가 없는 session 0에서 `IsConnected()`가
  `E_UNEXPECTED`였고, x86 MSHTA host에서는 `OCX_READY=1`이었다. 따라서 운영 구현은
  HTA·서비스 COM 직접 생성이 아니라 32비트 STA·ActiveX host·메시지 루프를 갖춘 서명
  bridge 실행 파일로 진행한다. `Answer()`는 PC 오디오가 아니라 물리 전화기를 제어하며
  운영 자동 받기는 사용하지 않고 ERP의 명시적 사용자 동작으로 제한한다.
- 임시 private S3 bucket `lawand-centrex-canary-319465435474-20260805`, SSM IAM
  role/profile `lawand-centrex-canary-ssm-20260805`, RDP SG와 key pair가 남아 있다.
  인스턴스와 RDP/HTA 세션도 현재 실행 중이며 다음 bridge 작업을 이어가거나 완료 뒤
  중지·자원 정리해야 한다. 센트릭스·Windows 비밀번호와 private key는 Git·DB·SSM·문서에
  저장하지 않았다. `PROJECT_PLAN.md`를 v0.65로 갱신했다.

### 2026-08-05 — ERP 부재·재상담 필요 목록 작업 큐
- 통화 종료 선택지에 `재상담 필요`를 추가하고 migration
  `0025_thick_krista_starr.sql`로 로컬 `telephony_call_disposition` enum을 확장했다.
  기존 결과와 마찬가지로 확정 직원·시각·변경 감사 원장을 사용하며 운영 DB에는 아직
  적용하지 않았다.
- gateway 상담 목록이 상담별 최신 확정 통화 결과를 함께 반환한다. 최신 결과가
  `no_answer`이면 `부재`, `callback_required`이면 `재상담 필요` 배지를 표시하고 두 상태를
  기존 `확인 필요` 지표·필터와 검색에 포함했다. 더 최신 통화 결과를 확정하면 최신값을
  기준으로 배지와 작업 큐가 자연스럽게 해소된다.
- 관련 typecheck·ESLint, core 45개·gateway 50개 테스트, gateway·ERP 프로덕션 빌드,
  DB schema check와 `git diff --check`를 통과했다. 673px 폭 실제 Chrome에서 목록 API의
  최신 통화 결과 계약, 좁은 목록 렌더와 SSE 재연결을 확인했고 기존 확정 결과는 변경하지
  않았다. 로컬 ERP `3021`과 gateway `3022`는 계속 실행 중이며 `PROJECT_PLAN.md`를
  v0.64로 갱신했다.

### 2026-08-05 — 센트릭스 통화 종료 자동 팝업·결과 원장
- A타입 `callhistory` 발신 이력을 ERP 클릭투콜 원장과 요청 시각·마스킹 수신번호로 대사하는
  gateway 워커를 추가했다. provider 상태·시작/종료·전체·연결·호출 시간을 보존하고, 같은
  회선의 한 이력이 두 통화에 연결되지 않도록 고유 제약을 적용했다. migration
  `0024_bored_viper.sql`은 로컬 DB에만 적용했으며 운영에는 배포하지 않았다.
- 사용자 통제 실제 발신 5건을 모두 복원했다. 고객 통화는 `OK` 22초/연결 16초, 무응답 뒤
  음성사서함은 `OK` 56초/10초, 거절 뒤 음성사서함은 `OK` 17초/8초였고, 수신 전 발신
  취소와 상대 통화 중은 모두 `FAIL` 0초/0초였다. 따라서 연결·시간만 자동 판정하고 ERP
  자동 팝업에서 담당자가 고객 상담·음성사서함·무응답·거절·통화 중·발신 취소 중 실제
  결과를 확정하도록 했다. 선택값·직원·시각과 변경은 통화·감사 원장에 남는다.
- core 45개·gateway 50개 테스트, 관련 전체 typecheck·ESLint·gateway/ERP 프로덕션 빌드,
  DB schema check와 실제 5건 대사를 통과했다. 673px 폭 실제 Chrome에서 최신 미연결 통화의
  팝업과 6개 선택지, 원장 시간을 확인했고 결과는 사용자가 시험할 수 있게 미확정으로
  남겼다. 로컬 ERP `3021`, 자격증명을 파일에 저장하지 않은 gateway `3022`가 실행 중이다.
  `PROJECT_PLAN.md`를 v0.63으로 갱신했다.

### 2026-08-05 — 센트릭스 정정 계정 검증·로컬 직원 주 회선 연결
- 사용자가 정정한 API 로그인으로 A타입 `userinfo`를 다시 호출해 요청한 실제 070
  회선과 내선 4591이 모두 일치함을 확인했다. 검증이 성공한 뒤에만 로컬 활성 직원의
  개인 주 회선으로 `telephony_endpoints` 1건과 `staff_telephony_bindings` 1건을
  생성했고 `telephony.centrex_endpoint.linked` 감사 기록을 남겼다.
- 비밀번호 원문과 SHA-512 값은 대화형 프로세스 메모리에서만 사용하고 파일·환경파일·
  DB·Git에는 저장하지 않았다. 클릭투콜 워커는 계속 비활성이며 `telephony_calls`는
  0건이라 실제 발신은 없었다. 운영 RDS migration·Secrets Manager 비밀 맵·본인 소유
  수신 번호 canary·워커 활성화가 남아 있다. `PROJECT_PLAN.md`를 v0.62로 갱신했다.

### 2026-08-05 — 센트릭스 A타입 ERP 클릭투콜 로컬 출시 후보
- ERP 상담 상세에 현재 담당 직원만 사용할 수 있는 `센트릭스로 전화` 버튼과 최근 발신
  원장을 추가했다. 버튼은 고객 번호를 브라우저에서 공급받지 않고 상담 ID만 gateway에
  전달하며, gateway가 최신 암호화 접수에서 번호를 복호화한다. 30초 중복 방지와 확인
  대화상자, 처리 상태 polling을 적용했고 실제 통화 테스트에서는 버튼을 누르지 않았다.
- 센트릭스 A타입 `clickdial` POST 클라이언트와 직렬 worker, 계정별 SHA-512 자격증명
  참조, 직원-회선 연결, 발신 원장·outbox·감사 기록을 구현했다. 타임아웃처럼 발신 여부를
  단정할 수 없는 경우 `확인 필요`로 끝내며 자동 재발신하지 않는다. `userinfo`가 실제
  회선과 내선을 모두 검증해야 연결 원장을 쓰는 `centrex:link` 명령도 추가했다. worker는
  기본 비활성이며 자격증명·고객번호는 이벤트나 로그에 넣지 않는다.
- 제공받은 로그인은 `userinfo` 인증에는 성공했지만 희망 회선·내선과 다른 회선을
  반환했다. 따라서 비밀번호를 저장하거나 회선 연결·실제 발신·AWS 배포를 하지 않았고,
  로컬 `telephony_endpoints`·`staff_telephony_bindings`·`telephony_calls`는 모두 0건이다.
  희망 회선에 대응하는 정확한 API 로그인 확인과 채팅에 노출된 비밀번호 교체, 통제된
  수신 번호 canary가 운영 활성화의 남은 게이트다.
- migration `0023_serious_black_queen.sql`을 로컬에 적용하고 schema check와
  `git diff --check`를 통과했다. 전체 5개 패키지 typecheck·ESLint·프로덕션 빌드,
  core 44개·gateway 45개 테스트가 통과했다. 390×844 Chrome에서 버튼 렌더와 새로고침
  hydration 경고 부재를 확인했으며, 콘솔의 403 세 건은 설치된 확장 프로그램
  `content.js`에서 발생한 것으로 페이지 코드 오류가 아니다. 설계·활성화 순서는
  `docs/CENTREX_CLICK_TO_CALL_V1.md`, authoritative 상태는 `PROJECT_PLAN.md` v0.61에
  기록했다.

### 2026-08-05 — 사례 생성 크론 AWS 권한·비공개 RDS 경로 구성
- `ai-agent-prod-01`의 기본 VPC와 `lawand-prod` VPC 사이에 peering
  `pcx-00d7e8bcf0be7a446`을 만들고 양방향 DNS와 route를 활성화했다. 운영 RDS는 계속
  public access가 없으며 DB SG 5432에는 크론 서버 사설 IP `172.31.2.38/32` 하나만
  추가했다. 서버에서 RDS hostname이 사설 IP로 해석되고 TCP 5432 연결이 성공했다.
- `hub-cloudwatch-role`에 추가한 사례 생성 런타임 권한은
  `lawand/prod/database`·`lawand/prod/gateway` 두 secret의 `GetSecretValue`,
  `/lawand/prod/case-generator` 로그 쓰기, `Lawand/CaseGenerator` metric 쓰기로
  제한했다. 로그 보존은 90일이며
  `lawand-case-generator-run-failure` alarm은 `OK`다. 수신 채널은 아직 연결하지 않았다.
- 운영 서버에서 비식별 `inspect`가 0.513초, DB INSERT 없는 Luna/high `dry-run`이
  59.632초에 성공했다. published canary는 생성하지 않았고 systemd service와 timer는
  계속 `inactive`, timer는 `disabled`다. 구성 스크립트가 실제 CloudFormation 논리 이름
  `PrivateDatabaseSubnetA/B` 대신 `DatabaseSubnetA/B`를 참조하는 결함은 후속 수정이
  필요하지만, 실제 AWS 구성과 런타임 권한 검증에는 영향이 없다.

### 2026-08-05 — 운영 ERP 상담 SSE 실시간 갱신·배포
- 상담 outbox가 커밋될 때 개인정보 없는 이벤트 식별자만 PostgreSQL
  `LISTEN/NOTIFY`로 알리는 migration `0022_consultation_sse_notifications.sql`을
  추가했다. gateway는 전용 연결로 이를 수신해 인증된 직원에게 SSE로 전달하고,
  heartbeat·재연결·재연결 뒤 동기화를 지원한다. ERP는 내부 키를 브라우저에 노출하지
  않는 same-origin 프록시를 구독하며 이벤트가 올 때만 목록을 다시 읽어 주기적 폴링을
  사용하지 않는다.
- 전체 5개 패키지 typecheck·ESLint·프로덕션 빌드, core 43개·gateway 40개 테스트,
  로컬 DB trigger와 ERP 프록시 통합 검증을 통과했다. `PROJECT_PLAN.md`를 v0.59로,
  상담 접수·운영 배포 문서를 실제 SSE 계약과 복구 동작으로 갱신했다.
- 운영 RDS 스냅샷 `lawand-prod-pre-sse-20260805`를 만든 뒤 ERP·gateway를 릴리스
  `20260805T013748Z-84e87082-sse`로 배포했다. 운영 ERP 프록시에서 임시 세션과
  트랜잭션 내 canary 이벤트로 `consultation.sync`·`consultation.changed`를 모두
  수신했고 상담·outbox는 0건을 유지해 실제 알림톡·리걸프렌즈 실행은 없었다. Chrome에서
  `실시간 연결됨`을 확인했으며 두 서비스의 실패 unit·당일 error journal·CloudWatch
  ALARM은 없다.

### 2026-08-05 — 운영 RDS 비공개 CB 원천 이관·권한 단순화
- 운영 사례 생성 크론의 선행 작업으로 로컬 PostgreSQL `lawand_dev`의 비공개
  `CB.TblCBCase`, `CB.TblCaseMemo`, `CB.TblMoClientStatement`를 서울 리전 운영 RDS
  `lawand`의 동일한 `CB` 스키마로 이관했다. 이관 전 암호화 수동 스냅샷
  `lawand-prod-pre-cb-import-20260805`를 만들고, SHA-256을 확인한 압축 덤프를 gateway
  EC2의 SSM 경로로 내려받아 단일 트랜잭션으로 복원했다.
- 운영 행 수는 `TblCBCase` 9,598건, `TblCaseMemo` 202,772건,
  `TblMoClientStatement` 9,402건이다. 세 테이블의 키 범위·최종 수정시각과 행 순서 기반
  논리 해시가 로컬과 운영에서 모두 일치했고, 테이블 3개·인덱스 11개가
  `lawand_migrator` 소유임을 확인했다. 기존 `public_case_studies` preview 3건과 public
  원장은 변경되지 않았다.
- 권한은 전용 동기화·생성 역할을 추가하지 않고 기존 역할로 단순화했다.
  `lawand_migrator`가 CB 생성·동기화와 사례 초안 저장을 담당하고,
  `lawand_viewer`는 기본 읽기 전용 상태로 CB를 조회한다. `lawand_app`과 `PUBLIC`에는
  CB 스키마·테이블 권한이 없으며 앱의 `public_case_studies` SELECT는 유지했다.
  재배포 기준을 `infra/aws/configure-database.sh`에 반영하고 `PROJECT_PLAN.md` v0.58,
  공개 사례·운영 배포 문서를 실제 상태로 갱신했다.

### 2026-08-04 — AWS 운영 인프라·3앱 최초 배포 v1
- 서울 리전 `lawand-prod` CloudFormation 스택으로 전용 VPC와 2AZ 공개 앱 서브넷·비공개
  DB 서브넷을 만들었다. homepage `t4g.small`·30GB, ERP `t4g.small`·30GB, gateway
  `t4g.medium`·40GB EC2를 Amazon Linux 2023 ARM64로 각각 구성하고 암호화 gp3,
  종료 방지, Docker·SSM·4GB swap을 적용했다. CloudFormation 스택 자체의 종료 방지도
  활성화했다. SSH는 열지 않았고 세 EIP는 홈페이지
  `15.165.23.84`, ERP `3.34.72.9`, gateway `3.36.255.226`이다.
- PostgreSQL 16.14 `db.t4g.small` RDS를 public access 없이 private subnet에 배치했다.
  30GB→100GB 자동확장 gp3, 암호화, 7일 자동백업·시점복구, Performance Insights,
  삭제 방지를 적용했다. migration·app·viewer 역할을 분리하고 앱의 공개 사례 쓰기를
  차단했으며 viewer 기본 읽기 전용을 확인했다. RDS 공식 CA를 이미지에 넣고 모든 Node
  연결을 `sslmode=verify-full`로 바꿨다. 초기화용 마스터 시크릿 임시 권한은 완료 즉시
  제거해 평상시 EC2 역할이 읽지 못한다.
- 로컬 DB에서 후기 3,403건, 자가진단 읽기 모델 1,759건, preview 사례 3건, 활성 직원
  1명과 필요한 참조 원장만 선별 이관했다. 상담·outbox·알림톡·리걸프렌즈 연결은 모두
  0건이며 비공개 `CB` 원천 세 테이블은 운영 RDS·아티팩트에서 제외했다. 앱은 공개 사례
  SELECT만 가능하고 INSERT는 불가하며, viewer `read_only=on`과 후기 3,403건을 확인했다.
- 세 앱을 릴리스 `20260804T085006Z-84e8708`로 Docker 배포하고 systemd·Caddy 자동
  기동을 구성했다. EIP HTTP는 동일 경로의 Let’s Encrypt `sslip.io` 임시 HTTPS로 301
  전환되고 세 HTTPS 접속점은 모두 200이다. 실제 Chrome에서 홈페이지·ERP 로그인·
  자가진단 반응형 화면을 검수했다. 런타임을 빌드 산출물 직접 실행으로 바꿔 재시작 후
  홈페이지·ERP 약 1초, gateway 약 2초에 복구됐고 실패 unit·최근 error journal은 0건이다. 리걸프렌즈·알림톡·
  네이버 IMAP 세 worker와 CloudWatch 기본 경보 `OK`를 확인했다.
- `lawandfirm.com`과 `www`는 기존 `222.239.248.41`을 계속 바라보며 DNS를 변경하지
  않았다. 정식 전환 전 Solapi 허용 IP를 gateway EIP 하나로 제한하고, ERP/API
  서브도메인 확정, RDS Multi-AZ·복원 훈련, 경보 수신 채널과 운영 canary가 필요하다.
  preview 사례는 계속 운영 미노출이다. 실제 구성·임시 URL·도메인 cutover/rollback은
  `docs/PRODUCTION_DEPLOYMENT_V1.md`, 설계 기준은 `PROJECT_PLAN.md` v0.57에 기록했다.

### 2026-08-04 — ERP 모바일 유사사례 절차일 한 줄 정리
- 상담 상세의 자가진단 유사사례 카드가 720px 이하에서 절차일을 2열·2행으로 강제하던
  예외를 제거했다. 신청서 접수·금지결정·개시결정·인가결정이 모바일에서도 하나의
  연결선 위에 4열로 유지되며, 단계명과 실제 날짜에는 줄바꿈 방지와 작은 화면용
  타이포그래피·패딩을 적용했다.
- 실제 629px Chrome 상세 화면에서 네 단계와 날짜가 한 줄에 표시되는 것을 확인했다.
  ERP typecheck·ESLint·프로덕션 빌드와 `git diff --check`를 통과했다.

### 2026-08-04 — ERP 상담 데스크·상세 프로덕션 UI v1
- 상담 목록을 배정 대기·내 담당·확인 필요·오늘 접수 지표, 이름·전화·접수번호 검색,
  다섯 가지 작업 큐 필터가 있는 상담 데스크로 재구성했다. gateway 목록 응답에
  `assigneeUserId`를 추가해 표시명 비교가 아니라 로그인 직원 ID로 `내 담당`을 판정한다.
- 상담 상세 첫 화면에 고객 전화·출처·상담 유형·지역·연락 희망·중복 판정과 다음 행동,
  담당자·알림톡·리걸프렌즈 실행 상태를 배치했다. 전화 걸기와 번호 복사를 제공하고,
  요청별 입력·고객에게 실제 표시한 자가진단 유사사건 5건·실제 절차일·외부 실행 시도
  원장을 순차적으로 확인하도록 정보 위계를 다시 잡았다. 기존 상담 배정·카카오 확인·
  네이버 상세 링크·감사 기록 동작은 유지했다.
- ERP 전역에 로컬 선호를 기억하는 라이트·다크 테마를 추가하고 첫 페인트 전에 테마를
  적용해 깜빡임을 막았다. 720px 이하에서는 목록을 카드로, 상세를 한 열로 전환하며
  미배정 상담의 `상담하기`를 safe-area 대응 하단 고정 동작으로 제공한다. 480px 이하
  헤더는 브랜드·탐색·테마·로그아웃만 남겨 우선순위를 보장한다.
- ERP typecheck·ESLint·프로덕션 빌드와 gateway typecheck·ESLint·37개 테스트를
  통과했다. 실제 Chrome에서 993px 라이트·다크 목록과 629px 좁은 목록·상세를 검수했고,
  390px 반응형 렌더에서 아이콘 중심 헤더·한 열 전환을 확인했다. 테스트 상담의
  `상담하기`는 누르지 않아 외부 알림톡이나 리걸프렌즈 사건을 만들지 않았다.

### 2026-08-04 — 상담 접수·담당 배정 외부 워커 동시 활성화
- 전화번호가 있는 홈페이지 상담은 최초 접수 트랜잭션에서 ERP 상담과 접수 알림톡을
  만들고, 직원이 ERP `상담하기`를 눌러 본인 배정할 때 담당자 배정 알림톡과
  리걸프렌즈 `createForLawnV2` 신건 등록을 함께 요청하는 기존 계약을 재확인했다.
  카카오 홈페이지 진입과 네이버 예약의 무전화 상담은 이 외부 실행에서 계속 제외한다.
- 새 Solapi 자격증명을 Git 제외·권한 600인 `apps/gateway/.env.local`에만 연결하고
  알림톡 워커를 활성화했다. 자격증명 값과 이메일 인증번호는 문서·Git·DB에 남기지
  않았고 전달용 임시 파일도 즉시 제거했다. 사용자 지시에 따라 배포 전에는 새 키의
  허용 범위를 `0.0.0.0/0`으로 두며, gateway EC2와 EIP 확정 후 운영 secret을 분리하고
  해당 EIP만 허용하는 후속 게이트를 `PROJECT_PLAN.md` v0.54에 남겼다.
- gateway를 재기동해 리걸프렌즈·알림톡·네이버 IMAP 워커 시작 로그와 health HTTP 200을
  확인했다. 외부 실행 대기열·시도 이력은 모두 0건이라 소급 발송이나 사건 생성은 없었다.
  활성 ERP 직원 1명은 리걸프렌즈 숫자형 `member_idx`까지 매핑되어 있다. core 43개와
  gateway 37개, 총 80개 테스트가 통과했다.

### 2026-08-04 — 파산·면책 사례 목록·상세 전용 구성
- `/bank/cases`의 파산·면책 카드를 개인회생 수치표와 분리했다. 월 변제금·변제기간 대신
  총채무와 `지급능력 → 재산 확인 → 면책심사` 흐름, 소득 상태·청산가치·실제
  면책허가 경과일을 표시한다. `/bank` 추천 사례 카드도 소득 상태·청산가치·면책허가
  기준으로 같은 구분을 유지한다.
- 파산·면책 상세는 변제금 배분 그래프와 변제율을 제거하고 현재·장래 지급능력,
  총채무·재산 및 최근 처분 확인, 파산선고와 별도 면책심사 순서로 재구성했다. 실제
  파산선고 접수 후 26일·면책허가 303일을 절차에 표시하고, 면책불허가 사유와
  비면책채권을 구분해 설명한다.
- 파산 상세의 공식 근거를 채무자회생법 제305조·제564조·제566조와 대한민국 법원의
  파산·면책 동시신청 안내로 분리했다. 390px 모바일 전체 화면과 1440px 목록·상세를
  시각 검수해 파산 전용 카드·분석·3단계 절차와 가로 넘침이 없음을 확인했다.
  홈페이지 typecheck·ESLint를 통과했고 `PROJECT_PLAN.md`를 v0.53으로 갱신했다.

### 2026-08-04 — Luna medium 파산·면책 세 번째 사례
- `personal_bankruptcy` 후보는 신청서 접수뿐 아니라 파산선고와 면책허가가 모두 원천
  `progress_history`에 있는 경우로 제한했다. `gpt-5.6-luna`·`medium`으로 생성한
  `소득 활동이 없고 생활비 부족으로 채무가 늘어난 기혼자의 파산·면책 사례`는 최소
  집단 7건을 통과했고, 총 무담보채무 약 5,700만원·임차 거주·소득 없음의 비식별
  조건을 사용한다. 실제 경과일은 파산선고 접수 후 26일, 면책허가 303일이다.
- 사례 프롬프트·상세 화면을 분야별로 분리했다. 개인회생에서만 명목 총변제액과
  현재가치 비교를 설명하고, 파산·면책에서는 청산가치를 재산 처분·배당 관점으로
  설명한다. 새 파산 사례는 파산선고와 면책허가가 다른 단계이고 비면책채권은 별도라는
  점을 명시한다. 제목·본문의 직접 식별 패턴은 0건이다.
- 홈페이지 typecheck·ESLint, 생성 스크립트 문법·ESLint, `PROJECT_PLAN.md` v0.52와
  공개 사례 운영 문서·README 갱신을 마쳤다. 사례는 여전히 로컬 `preview/pending`이며
  운영에는 노출되지 않는다.

### 2026-08-04 — 추가생계비·현재가치 중심 Luna medium 두 번째 사례
- `--require-additional-living-cost` 옵션을 추가해 추가생계비 금액이 0보다 큰
  `Office_idx=56` 개인회생 후보만 고르고, 그 안에서는 금액이 큰 후보부터 검토하게 했다.
  새 사례 `생활비와 주거비 부담으로 채무가 늘어난 근로자의 개인회생 사례`는 주거비
  추가생계비 약 10만원이 기록상 별도 반영된 다른 원천 사건이며, 최소 집단 5건을
  통과했다. `gpt-5.6-luna`·`medium`으로 생성해 `preview/pending`으로 저장했다.
- 프롬프트와 저장 전 검증을 강화했다. 추가생계비가 있는 사례는 핵심 쟁점·계산 설명에
  `추가생계비`가 반드시 있어야 하고, 지출만으로 자동 인정되는 것이 아니라 필요성·
  계속성·증빙을 심사한다는 문구를 포함해야 한다. 청산가치 설명에는 월 변제금×횟수의
  명목 합계가 아니라 인가 시점 현재가치로 비교한다는 설명이 없으면 저장하지 않는다.
  상세 계산 카드도 추가생계비 항목과 심사 기준을 별도 강조한다.
- 새 사례의 실제 절차 경과일은 금지명령 접수 후 1일, 개시결정 307일, 변제계획 인가
  432일이다. `README.md`, `docs/PUBLIC_CASE_STUDIES_V1.md`, `PROJECT_PLAN.md` v0.51에
  후보 옵션과 검증 기준을 갱신했다.

### 2026-08-04 — 첫 공개 사례 Terra medium 재작성
- 사용자 요청으로 같은 안전 스냅샷·프롬프트 버전·JSON Schema를 유지한 채 첫
  개인회생 preview를 Codex CLI `gpt-5.6-terra`, `medium`으로 다시 생성했다. 결과는
  `public_case_studies`의 같은 행을 `--replace`로 갱신했고, 현재 제목은
  `주거비 부담과 생활비 부족이 겹친 급여소득자의 개인회생 사례`다. 상태는 계속
  `preview`, 개인정보·법률 검수 `pending`이며 공개 0건이다.
- 생성 스크립트에 `--model`과 `--reasoning-effort` 옵션을 추가했다. 기본값은 기존
  `gpt-5.6-luna`·`xhigh`를 유지하며, 실제 사용한 모델·추론 강도는 각 사례 행에
  기록한다. Terra 결과도 직접 식별 패턴 검사 0을 확인했다. `README.md`,
  `docs/PUBLIC_CASE_STUDIES_V1.md`, `PROJECT_PLAN.md` v0.50에 비교 명령을 남겼다.

### 2026-08-04 — 공개 사례 자가진단 연결키·실제 절차 경과일
- 사용자 요청으로 `public_case_studies.source_case_idx` 내부 연결 컬럼을 migration
  `0021_unusual_sheva_callister.sql`로 추가하고, 기존 개인회생 preview에도 값을
  저장했다. 홈페이지의 사례 조회 SQL과 응답에는 이 값을 선택하지 않으며, 이후
  자가진단의 유사사례 5건과 서버에서 같은 원천 사건을 연결할 때만 사용한다.
- 공개 사례 절차는 넓은 기간 구간 대신 원천 `progress_history`의 실제 날짜 차이로
  계산한 `접수 후 N일`을 표시한다. 첫 사례는 신청서 접수일, 금지명령 접수 후 14일,
  개시결정 113일, 변제계획 인가 229일이다. 달력 날짜 자체는 계속 저장·표시하지
  않는다. 사례 생성기는 이후 모든 신규 preview에 `source_case_idx`와 `elapsedDays`를
  함께 저장한다.
- 개인정보처리방침·이용약관·공개 사례 운영 문서·README와 `PROJECT_PLAN.md` v0.49를
  실제 경과일과 내부 연결키 기준으로 고쳤다. 정식 공개 전에는 여전히 개인정보·법률
  검수 및 공개 근거 확인이 필요하다.

### 2026-08-04 — 실제 사건 기반 `사례로 이해하기` 첫 preview
- 비공개 `CB.TblCBCase`·`CB.TblCaseMemo`·`CB.TblMoClientStatement`를 `Case_idx`로
  조인해 `Office_idx=56` 사건을 한 건씩 공개 후보로 만드는
  `scripts/generate-public-case-study.mjs`를 추가했다. 이름·전화·사건번호·주소·직장명·
  학교·금융기관·정확한 날짜를 코드에서 먼저 제거하고 월 금액은 10만원, 총액은
  100만원 단위로 반올림한다. 메모·진술 원문은 Codex에 보내지 않고 필요한 넓은 사실
  범주만 사용하며, 같은 공개 조합이 최소 5건인 후보만 허용한다. 메모나 진술서가 없는
  사건도 제외하지 않고 자료가 있으면 후보 점수에 반영한다.
- Codex CLI 구독 모델 `gpt-5.6-luna`, 추론 강도 `xhigh`로 `주거비 부담과 소득 변동을
  함께 확인한 개인회생 사례` 한 건을 생성했다. 현재 최소 집단은 6건이고 DB에는
  `preview`, 개인정보·법률 검수 `pending`, 공개 0건으로 저장했다. 새 slug는 이미 사용한
  원천을 건너뛰고 다음 후보를 고르며, 같은 slug와 공개·철회 사례는 모델 호출 전에
  차단한다. 기본 초안 재검사와 다음 미사용 후보의 안전한 스냅샷 검사가 모두 통과했다.
- migration `0020_parallel_champions.sql`로 `public_case_studies`와 분야·공개·검수 enum을
  추가했다. 원본 `Case_idx` 대신 HMAC 지문과 안전 스냅샷 해시, 익명화·프롬프트·모델
  버전, 본문·재무·절차·태그를 보존한다. 최소 집단 5건과 개인정보·법률 이중 승인,
  공개 근거·승인일·공개일이 없는 `published` 전환을 DB 제약으로 막는다. 실제 미승인
  공개 전환은 check violation `23514`로 거부됐고 `lawand_app`은 이 원장을 SELECT만 하며
  세 `CB` 원천은 모두 권한 오류 `42501`로 차단됨을 확인했다.
- `/bank/cases` 목록과 `/bank/cases/[slug]` 상세를 추가하고 기존 `/bank`와 전역
  `사례로 이해하기` 메뉴에 연결했다. 상세에는 출발 상황·핵심 쟁점·월 소득 배분·명목
  총변제액과 청산가치 현재가치 원칙·자녀/인정 가구원 차이·실제 절차 구간·달라질 점을
  쉬운 문장으로 구성했다. 개발 환경만 preview 배너와 `noindex, nofollow`로 노출하고
  운영 빌드에서는 목록 제외, 상세 404, sitemap·Article JSON-LD 제외를 확인했다.
- 공개 본문 직접 식별 패턴 0, 홈페이지 프로덕션 빌드, 전체 5개 패키지 typecheck·ESLint,
  DB schema check와 `git diff --check`가 통과했다. 1440px 시각 검수와 390px 모바일
  `scrollWidth=clientWidth=390`, console 오류 0을 확인했다. 개인정보처리방침·이용약관의
  공개 사례 기준과 시행일, `README.md`, `docs/PUBLIC_CASE_STUDIES_V1.md`,
  `PROJECT_PLAN.md` v0.48을 갱신했다. 운영 발행·EC2 크론은 공개 재이용 근거와 철회
  범위, 개인정보 검수, 책임 변호사 승인, ERP 발행 감사 흐름을 만든 뒤 진행한다.

### 2026-08-04 — 리걸프렌즈 TblMoClientStatement 원천 복제
- 리걸프렌즈 RDS `CONTENT.TblMoClientStatement`의 구조를 확인했다. `idx` 기본키와
  `Case_idx`·`phone` 인덱스를 포함한 18개 컬럼이며, 전화·주소·채무 사유·상담 희망 등
  개인정보 가능 원문이 포함될 수 있어 기존 `CB` 원천 테이블과 같은 비공개 경계를
  적용했다.
- 로컬 PostgreSQL `lawand_dev`의 `CB.TblMoClientStatement`를 추가하고 2026-08-04
  12:10:24 스냅샷 기준 9,402행을 적재했다. `idx` 범위 1~9,402, `Case_idx` 범위
  344~203,067·고유 9,401건, JSON·텍스트 문자 수·NULL 수·두 부분 해시·최종 수정시각이
  원본 스트림과 대상에서 일치함을 확인했다. 임시 동기화 테이블은 0건이다.
- `scripts/import-legalfriends-client-statement.mjs`와 `legalfriends:client-statement`
  명령을 추가했다. bigint 식별자는 문자열로 받아 정밀도를 보존하고, `--replace`는 새
  임시 테이블에 먼저 적재·검증한 뒤 원자적으로 교체한다. `PUBLIC`·`lawand_app`에는
  테이블 권한을 주지 않고 로컬 `lawand_viewer`만 확인 권한을 유지한다.
- 스크립트 `node --check`·ESLint, `git diff --check`, 대상 18개 컬럼·3개 인덱스·역할
  권한과 대상 행 수를 확인했다. `PROJECT_PLAN.md`를 v0.47로 갱신했다.

### 2026-08-04 — 리걸프렌즈 TblCaseMemo 원천 복제
- 리걸프렌즈 RDS `CONTENT.TblCaseMemo`의 구조를 확인했다. `Case_idx` 유일키,
  `update_dt`, `memo` `TEXT` 3개 컬럼이며, 원천 메모는 사건 내용·개인정보가 포함될 수
  있어 기존 `CB.TblCBCase`와 같은 비공개 원천 보관 경계를 적용했다.
- 로컬 PostgreSQL `lawand_dev`의 `CB.TblCaseMemo`를 추가하고 RDS를 단일 스트림으로
  읽어 2026-08-04 11:44:44 스냅샷 기준 202,772행을 적재했다. 행 수·키 범위·NULL 수·
  메모 문자 수·두 부분 해시·최종 수정시각이 스트림과 대상에서 모두 일치했으며, 현재
  `CB` 스키마에는 `TblCBCase`와 `TblCaseMemo` 두 원천 테이블이 있다.
- `scripts/import-legalfriends-casememo.mjs`와 `legalfriends:case-memo` 명령을 추가했다.
  `--replace`는 새 임시 테이블에 먼저 적재·검증한 뒤 기존 대상과 원자적으로 교체하고,
  실패하면 기존 대상을 보존한다. RDS가 계속 갱신되므로 최신 스냅샷을 다시 반영할 때
  같은 명령을 사용한다. `PUBLIC`·`lawand_app`에는 테이블 권한을 주지 않고 로컬
  `lawand_viewer`에만 확인 권한을 부여했다.
- 스크립트 `node --check`·ESLint, `git diff --check`와 대상 DDL·인덱스·권한·임시 테이블
  부재를 확인했다. `PROJECT_PLAN.md`를 v0.45로 갱신했다.

---

### 2026-08-04 — ERP 상담요청 테스트 원장 초기화
- 사용자 요청으로 로컬 `lawand_dev`의 테스트 상담 7건과 상담요청 7건을 단일
  트랜잭션에서 초기화했다. 연결된 상태이력 7건, 알림톡 원장 7건, 발송 시도 7건,
  outbox 20건과 배정·귀속·카카오·네이버·리걸프렌즈 연결 하위 원장도 함께 삭제해
  관련 테이블을 모두 0건으로 확인했다.
- 여정 세션 5건·이벤트 59건, 네이버 IMAP 메일함 기준점 1건, 직원 계정과 후기
  원장은 보존했다. 이번 범위는 로컬 테스트 DB에만 적용했으며 운영 DB에는 실행하지
  않았다. `PROJECT_PLAN.md`를 v0.46으로 갱신했다.

---

### 2026-08-04 — 자가진단 히어로 타이포그래피 통일
- 자가진단 상단 `나의 상황과 유사한 사례 5건 찾아보기` 제목이 다른 안내 페이지보다
  컸던 문제를 수정했다. 데스크톱은 일반 히어로와 같은 `clamp(46px, 5vw, 68px)`,
  모바일은 공통 `clamp(38px, 10.6vw, 50px)`와 440px 이하 38px 기준으로 맞추고
  굵기·자간·행높이도 비교 페이지·자격/절차 페이지와 통일했다.
- 홈페이지 typecheck·ESLint·프로덕션 빌드와 자가진단 페이지 HTTP 200, `git diff --check`를
  확인했다. `PROJECT_PLAN.md`를 v0.44로 갱신했다.

---

### 2026-08-04 — 자가진단 유사사례 ERP 보관·상세 표시
- 자가진단 결과 화면에 고객에게 실제 표시한 유사사례 5건의 순서·유사도·비교값·주요
  절차일을 비식별 카드 스냅샷으로 만들어 기존 AES-GCM 상담 intake에 함께 저장했다.
  고객 응답과 ERP가 같은 만원 단위 반올림 결과를 보도록 저장 시점에 동일한 정규화를
  적용했으며, 원본 사건 ID·사건번호·이름·전화번호는 저장하지 않는다. 이전 원장과의
  읽기 호환을 위해 카드 필드는 선택적으로 읽고 신규 자가진단에서는 5건을 보장한다.
- ERP 고객 상세의 자가진단 요청마다 `의뢰인이 본 유사사례` 전용 카드 영역을 추가했다.
  개인회생·파산 구분, 월 변제금·변제기간, 법원·소득·채무·청산가치·가족 조건,
  변제계획·절차일을 고객 표시 순서대로 확인할 수 있고, 카드가 없는 이전 접수는
  별도 안내한다. 모바일에서는 카드가 1열로 전환된다.
- `selfDiagnosisMatchSchema`와 intake·ERP 표시 흐름의 단위 검증을 추가하고 core·gateway·
  ERP typecheck를 통과했다. 개인정보처리방침, `docs/SELF_DIAGNOSIS_V1.md`,
  `docs/CONSULTATION_INTAKE_V1.md`, `PROJECT_PLAN.md` v0.43에 상담 준비 목적과
  비식별 스냅샷 범위를 반영했다.

---

### 2026-08-04 — 자가진단 미성년 자녀 수 버튼 선택 UX
- 자가진단 가족·거주 단계의 미성년 자녀 수 숫자 입력 필드를 `0명`, `1명`, `2명`,
  `3명`, `4명`, `5명`, `6명 이상` 버튼 선택으로 변경했다. `6명 이상`은 기존 숫자형
  입력 계약의 기준값 `6`으로 전송하며, 선택 상태와 키보드 포커스 접근성을 함께 제공한다.
- 결과의 부양가족 조정 안내에서도 `6명 이상을`으로 표시해 선택 의미가 숫자 6명으로
  오해되지 않도록 했다. 홈페이지 typecheck·ESLint·프로덕션 빌드와 자가진단 페이지
  HTTP 200, `git diff --check`를 확인했다.

---

### 2026-08-03 — 자가진단 변제계획 시각화·전역 3 CTA 타이포그래피 통일
- 전역의 `자가진단·카톡상담·상담요청` 표기를 띄어쓰기 없는 형태로 통일하고 세 CTA의
  Pretendard 글꼴·크기·굵기·행높이를 동일하게 맞췄다. 헤더, 모바일 메뉴, 상담 섹션,
  모바일 고정바에서 말풍선·화살표 아이콘을 제거했다. 993px에서는 세 버튼 모두 12px·
  750, 390px에서는 14px·800이며 각 버튼 안 SVG가 0개임을 실제 Chrome으로 확인했다.
- 자가진단 히어로를 `나의 상황과 유사한 사례 5건 찾아보기`로 바꾸고 검색 설명도 월
  변제금·예상 지출·추가생계비·총변제금·변제율·주요 절차일을 반영하도록 고쳤다.
- migration `0019_cultured_toro.sql`을 로컬에 적용하고 읽기 모델을 `office-56-v3`로
  재구축했다. 원천 `estimated_spend`, `living_cost_type`, `living_cost_cost`를 추가했고
  1,759건(회생 1,342·파산면책 417)을 유지했다. 회생 1,342건 모두 예상 지출이 있고
  370건에는 0원 초과 추가생계비가 있다. 추가생계비 코드는 사용자 제공 명칭으로
  변환하며 0은 `추가 인정 없음`으로 표시한다.
- 회생 사례 카드에 월소득을 예상 지출과 월 변제금으로 나눈 배분 막대, 총변제금·변제율,
  예상 지출금액과 추가생계비 유형·금액을 추가했다. 각 접수·결정일 오른쪽에는 신청서
  접수일부터의 실제 날짜 차이를 `접수일로부터 +N일`로 표시하며 모바일에서는 다음 줄로
  안전하게 배치한다. 목 응답과 실제 v3 읽기 모델에서 새 필드 다섯 건 반환을 확인했다.
- `PROJECT_PLAN.md`를 v0.41로 올리고 개인정보처리방침과 자가진단 계약 문서의 필드·
  재식별 출시 게이트를 갱신했다. 전체 5개 패키지 typecheck·ESLint·프로덕션 빌드,
  core 42개·gateway 37개 테스트와 `git diff --check`가 통과했다. 390·993px에서 결과
  카드, CTA, 가로 넘침 0, console 오류 0을 확인했다.

### 2026-08-03 — 자가진단 가족 입력·유사도·실제 절차일 v2
- 조세 등 우선권채권 `없음/있음` 선택지에 포인터·hover·focus 상태를 추가하고, 밋밋했던
  `다음 조건`을 전역 녹색 CTA와 화살표가 있는 실제 버튼으로 정리했다. 고객에게 별도
  부양가족 수를 단정해 입력받지 않고 미성년 자녀 수만 받으며, 이를 생계비 비교의 최초
  값으로 사용한다. 390·993px Chrome에서 포인터, 버튼 배경·형태, 입력 제거, 가로 넘침
  0과 console 오류 0을 확인했다.
- 유사사건 선택은 미성년 자녀 수가 같은 후보를 우선 고정하고, 월소득 정확 일치 또는
  5%·10만원 이내 후보가 다섯 건 이상이면 그 집단만 비교하도록 계층화했다. 그 뒤에도
  월소득 가중치를 가장 크게 적용하며 희소 입력에서만 조건을 단계적으로 완화한다.
  결과 카드의 `자녀·부양`은 `미성년 자녀 수`와 `인정된 부양가족 수(본인 포함)`로
  분리했다. 같은 소득·자녀 사건 우선 선택 단위검사를 추가했다.
- 진행기간 숫자 배지를 신청서 접수·금지·개시·인가 또는 파산선고·면책허가의 실제
  `YYYY-MM-DD` 절차 목록으로 바꿨다. migration `0018_condemned_cerebro.sql`을 로컬에
  적용하고 읽기 모델을 `office-56-v2`로 재구축했다. 실제 신청서 접수일과 필수 결정일이
  있는 1,759건(회생 1,342·파산면책 417)이 적재됐고 필수 날짜 누락은 0건이다.
- 실제 날짜는 직접 식별자가 없어도 희소 조합의 재식별 단서가 될 수 있어 개인정보처리
  방침, `docs/SELF_DIAGNOSIS_V1.md`, `PROJECT_PLAN.md` v0.40의 출시 게이트를 강화했다.
  전체 5개 패키지 typecheck·ESLint·프로덕션 빌드, core 42개·gateway 37개 테스트와
  `git diff --check`가 통과했다. 목 응답을 사용한 결과 화면에서 두 가족 필드와 실제
  날짜 `<time>` 네 개, 데스크톱·모바일 가로 넘침 0을 확인했으며 3020·3021·3022 서버는
  계속 실행 중이다.

### 2026-08-03 — 홈페이지 헤더 재정리·거주지역 기반 자가진단 관할 안내
- 데스크톱 헤더의 개인파산 메뉴명을 줄이고 로고·메뉴·CTA 간격과 글자 크기 전환 구간을
  재조정했다. 메뉴와 자가진단·카톡상담·상담 요청 CTA에는 줄바꿈 방지를 적용했으며,
  801·820·880·993·1100·1101·1280·1281·1440px에서 헤더와 문서 가로 넘침이 0임을
  확인했다. 800px 이하는 기존 모바일 메뉴와 하단 CTA 세 개를 유지한다.
- 자가진단 첫 질문을 `예상 관할법원`에서 상담 요청과 같은 `현재 거주 중인 지역`으로
  바꿨다. 국내 17개 시·도에서 단일 법원은 자동 표시하고 경기·강원 및 법률상 추가
  관할이 있는 충북·울산·경남·전북·제주는 근거 설명이 붙은 법원 선택을 표시한다.
  채무자회생법 제3조와 각 법원 공식 관할 페이지를 기준으로 했으며 실제 관할은 근무지·
  영업소·재산 소재·관련 사건에 따라 달라질 수 있다는 한계를 함께 안내한다.
- 클라이언트 표시만 바꾸지 않고 core 입력 계약과 gateway에서 거주지역·법원 조합을
  재검증하며 ERP 암호화 자가진단 기록에도 현재 거주지역을 한글로 표시한다. core 41개
  테스트, 홈페이지·gateway·ERP·core typecheck와 ESLint, 993px 실제 Chrome 및 390px
  헤드리스 Chrome 화면에서 단일·복수 관할 전환, 가로 넘침 0, console 오류 0을
  확인했다. `PROJECT_PLAN.md`를 v0.39로 갱신했다.

### 2026-08-03 — 로앤 사건 5건 자가진단·ERP 접수 v1 로컬 구현
- `/bank/self-diagnosis`에 법원·월소득·소득형태, 담보/무담보 채무·청산가치·우선권채권,
  혼인·미성년 자녀·부양가족·거주형태와 연락정보를 받는 4단계 화면을 추가했다. 완료
  시 로앤 유사사건 5건의 만원 단위 월 변제금·변제개월과 신청 후 금지·개시·인가 또는
  파산선고·면책허가 경과일을 보여주고, 입력·서버 판정은 기존 암호화 intake로 ERP 상담에
  등록한다. 전역 데스크톱과 모바일 고정바는 `자가진단·카톡상담·상담 요청` 세 행동을
  함께 제공한다.
- `CB.TblCBCase`를 런타임에서 직접 조회하지 않도록 `Office_idx=56`만 읽는
  `self_diagnosis_case_profiles`와 재구축 스크립트를 만들었다. 이름·전화·사건번호·원본
  사건 ID·원본 날짜를 SELECT/저장하지 않고 진행일은 경과일로 변환한다. 현재
  1,764건(개인회생 1,342·개인파산면책 422)이며 `lawand_app`은 이 읽기 모델만 조회한다.
- 회생 후보는 우선권채권 일치, 1~60개월, 변제율 3% 이상, 총변제금의 원천 청산가치와
  고객 최소 필요 총변제액 충족을 제한조건으로 둔다. 2026년 기준 중위소득 60%로
  가용소득을 참고하고 필요하면 부양가족 축소 시나리오를 계산하며, 1인 참고 생계비
  이하 또는 60개월 제약 미충족 때만 파산·면책 사례로 분기한다. 회생 사례 부족만으로
  파산을 표시하지 않는다. 소득·거주·혼인 코드는 사용자 제공 한글 명칭으로 중앙화했고,
  정의 오류 가능성이 있는 `debt_reasons`와 미사용 `living_cost_type`은 제외했다.
- 코어 4개 자가진단 단위검사와 gateway API 검사를 추가했다. 실제 읽기 모델의 일반
  회생·우선권채권 회생·저소득 파산 시나리오가 각각 정확히 5건, 올바른 `case_type`,
  원본 식별자 없이 반환되는 것을 확인했다. 법원·소득·소득형태·혼인·자녀·우선권·
  채무·청산가치를 조합한 대표 입력 2,160개도 모두 회생 유사사건 5건을 구성했다.
  390·993·1440 Chrome에서 입력 화면과 세 CTA를 검수했다. 이 구현은 로컬 출시
  후보이며, 과거 사건 이용 근거·희소 조합 재식별 위험·공개 문구의 책임 변호사 심사
  전에는 운영 배포하지 않는다. 상세 기준은
  `docs/SELF_DIAGNOSIS_V1.md`, 설계 기준은 `PROJECT_PLAN.md` v0.38이다.

### 2026-08-03 — 로컬 DBeaver 계정에 `CB` 전체 권한 부여
- 사용자 요청으로 로컬 `lawand_dev`의 `lawand_viewer`에 `CB` 스키마 `USAGE/CREATE`,
  현재 모든 테이블·시퀀스·함수의 전체 권한과 `lawand_migrator`가 앞으로 만드는
  객체의 기본 전체 권한을 부여했다. 이 DB에서 해당 계정의 강제 읽기 전용 설정도
  해제했다.
- DBeaver와 같은 `lawand_viewer` 연결로 `default_transaction_read_only=off`, 스키마
  전체 권한과 `CB.TblCBCase`의 SELECT·INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER
  권한이 모두 적용된 것을 확인했다. `PUBLIC`과 홈페이지 앱 역할에는 권한을 추가하지
  않았으며 운영 환경에는 이 로컬 편의 예외를 적용하지 않는다. `PROJECT_PLAN.md`를
  v0.37로 갱신했다.

### 2026-08-03 — 리걸프렌즈 성공사례 원천을 `lawand_dev`로 이관
- 사용자 요청으로 로컬 MySQL `CB.TblCBCase`의 35개 컬럼·9,598행을 로컬 PostgreSQL
  `lawand_dev`의 별도 `CB.TblCBCase`에 복제했다. 원본의 기본키·`Case_idx` 고유키와
  5개 검색 인덱스를 유지했으며, 대상에 없는 `ACCOUNT.TblOffice`·`CONTENT.TblCase`
  참조 외래키는 만들지 않았다. 원본 MySQL 복제본과 Git 밖 권한 제한 압축 백업은
  검증·복구 기준으로 보존했다.
- 재사용 가능한 `scripts/import-legalfriends-cbcase.mjs`를 추가했다. 기존 대상 행이
  하나라도 있으면 중단하도록 하고, MySQL 원본을 스트리밍해 임시 PII 파일 없이
  PostgreSQL에 적재한다. 이관 후 원본·대상의 행 수(9,598), `idx` 범위(1~371,498),
  최종 수정시각(2026-07-31 06:06:02), 컬럼 35개와 인덱스 7개를 대조했다.
- 원천에는 이름·전화·사건번호가 있으므로 PostgreSQL `CB` 스키마와 테이블에서
  `PUBLIC`, 홈페이지 앱 역할, 일반 조회 역할의 `SELECT` 권한을 제거했다. 홈페이지
  자가진단에는 별도 비식별 분석·승인 읽기 모델만 연결한다. `PROJECT_PLAN.md`를
  v0.36으로 갱신했고, 이관 스크립트 문법 검사와 `git diff --check`를 통과했다.

### 2026-08-03 — 한글 워드마크 곡선·여백 재설계
- 사용자 피드백에 따라 네모난 자소 프레임이 강했던 한글 워드마크를 다시 설계했다.
  바른고딕·명조·휴머니스트 고딕을 같은 비율로 비교한 뒤, 원형 자소와 모서리가 더
  자연스럽고 홈페이지의 모던한 본문 서체와도 이어지는 휴머니스트 고딕 윤곽을 선택했다.
- 한글 획을 한 단계 가볍게 하고 글자 사이 여백을 넓혀 영문 세리프와 경쟁하지 않으면서
  하나의 워드마크로 읽히게 했다. 반복 글자 윤곽은 SVG `defs/use`로 재사용해 고정된
  이미지 형태와 작은 자산 크기를 함께 유지했다.
- `PROJECT_PLAN.md`를 v0.35로 갱신했다. 1440px·390px Chrome에서 헤더 균형과 가독성을
  확인하고 사용하지 않는 시안 SVG는 제거했다. 홈페이지 typecheck·ESLint·프로덕션
  빌드와 `git diff --check`, 최종 SVG HTTP 200 검사를 통과했다.

### 2026-08-03 — 로앤 통합 SVG 워드마크 제작·전역 적용
- 헤더의 개별 텍스트였던 `LAW&`와 `법무법인 로앤`을 하나의 고정 SVG 워드마크로
  제작했다. 영문은 편집적인 세리프, 한글은 각진 산세리프 윤곽으로 구성하고 앰퍼샌드와
  분할선의 짧은 절개만 로앤 그린으로 처리해 기존 인상을 유지하면서 로고성을 높였다.
- 글꼴이 없는 기기에서도 형태가 바뀌지 않도록 모든 글자를 SVG 패스로 변환했다.
  Next Image로 헤더·모바일·푸터에 같은 자산을 적용하고 푸터에서는 단색 반전형으로
  표시한다. 1440px·390px Chrome 캡처에서 헤더 높이·메뉴 균형·가로 넘침을 확인했다.
- `PROJECT_PLAN.md`를 v0.34로 갱신했다. 홈페이지 typecheck·ESLint·프로덕션 빌드와
  `git diff --check`, SVG HTTP 200 검사를 통과했다.

### 2026-08-03 — 헤더 브랜드 위계·카톡상담 CTA 정리
- 전역 헤더의 `LAW&`와 `법무법인 로앤`을 같은 크기·무게의 브랜드 표기로 정리하고,
  440px 이하에서 한글 법인명을 숨기던 규칙을 제거해 모바일에도 두 표기가 함께 보이게
  했다.
- 홈페이지의 카카오 채팅 진입 CTA 문구를 `카톡상담`으로 통일했다. 카카오 노란색 채움을
  제거하고 로앤의 녹색·아이보리 계열 아웃라인/보조 버튼으로 변경해 주 CTA인 `상담 요청`
  과 역할은 구분하되 타사 시그니처 색에 의존하지 않게 했다.
- 홈페이지 TypeScript 검사와 ESLint를 통과했고, 1440px·390px 로컬 Chrome 캡처로 헤더
  브랜드와 고정 상담 바의 표기·가로 넘침을 확인했다.

### 2026-08-03 — 원본 사진 기반 구성원 페이지 재구성
- 사용자가 제공한 NAS `/hernamkwan/photo/사진`을 WebDAV `PROPFIND`·`GET`으로 직접
  확인하고 원본 56개를 읽기 전용으로 받아 홈페이지 공개 자산으로 정리했다. 변호사
  PC 원본 4개와 현재 재직 실무 구성원 사진 46개를 사용했으며, ERP `members`의
  `id·name·position·task·affiliation·status`를 읽기 전용 조회해 서울 21명·대전
  12명·부산 13명으로 대조했다. 휴직·퇴사 사진과 사용하지 않는 모바일 변형본은
  공개 자산에서 제외했다. NAS 비밀번호·DB 자격증명은 출력·문서·저장소에 남기지
  않았다.
- `/people`을 사람 중심의 편집형 히어로, 변호사 사진·공식 자격 정보, 사무소별·팀별
  실무 구성원 디렉터리, 사건 처리 책임 구조로 재구성했다. 원본의 흰 배경이 카드와
  튀지 않도록 따뜻한 중성색 사진 무대와 `mix-blend-mode: multiply`를 적용하고, 1440px
  데스크톱과 390px 모바일에서 사진 크롭·카드 밀도·고정 상담바·가로 넘침을 확인했다.
- 변호사·실무진 이미지 경로를 로컬 공개 자산으로 전환하고 구성원 JSON-LD에도 공개
  범위의 역할·사진만 반영했다. 개인정보·내부 계정·개인 연락처는 페이지에 넣지
  않았으며, 실무진 공개 원장과 사진 사용 동의의 즉시 갱신 절차는 별도 오픈 이슈로
  유지했다. `PROJECT_PLAN.md`를 v0.32로 갱신했다.
- 홈페이지 typecheck·ESLint·프로덕션 빌드·`git diff --check`와 로컬 HTTP 200 및
  페이지가 참조하는 구성원 이미지 요청 검사를 통과했다. 모바일·데스크톱 헤드리스
  Chrome 스크린샷과 Orca 브라우저 화면 검수에서 hydration 경고·이미지 깨짐·가로
  넘침은 확인되지 않았다.

### 2026-08-03 — 구성원 공개 역할·팀 범위 정리
- `/people`의 실무 구성원 공개 범위를 법률컨설팅팀·사건관리팀으로 한정해 지원팀·개발팀
  영역과 구성원을 페이지·구성원 JSON-LD에서 제외했다. 현재 공개 대상은 서울 18명,
  대전 12명, 부산 13명, 총 43명이다.
- ERP의 직책 표기는 노출하지 않고 법률컨설팅팀은 `컨설턴트`, 사건관리팀은 `매니저`로
  표시한다. 구성원 ID를 시드로 8개 특징어 중 2~4개를 고르는 결정적 태그를 추가해
  새로고침·SSR에서도 같은 조합이 유지되도록 했다.
- 로앤 홈페이지 typecheck·ESLint·프로덕션 빌드·`git diff --check`와 로컬 `/people`
  HTTP 200, 지원팀·개발팀 미노출, 구성원 카드·태그 렌더 검사를 통과했다.
  `PROJECT_PLAN.md`를 v0.33으로 갱신했다.

### 2026-07-31 — 변호사·구성원 책임 구조 페이지 구현
- `/people`을 추가해 김충환·허남관·우종현·박혜성 변호사의 서울·부산·대전 소속,
  직위, 등록번호, 학력·자격을 한 페이지에서 확인하게 했다. 2026-07-31 대한변호사협회
  공개 프로필을 기준으로 등록 전문분야와 일반 취급 분야를 구분하고 각 공식 프로필로
  연결했다. 개인회생·개인파산의 법률 판단 담당은 김충환 대표변호사로 명시했다.
- 법률컨설팅팀의 최초 상담·정보 정리·서류 발급 및 부채증명서 지원, 사건관리팀의 자료
  취합·신청서와 보정서 초안 준비, 법률컨설팅팀·담당변호사·의뢰인의 제출 전 확인을
  실제 업무 순서로 설명했다. 비변호사 실무진이 변호사의 지휘 아래 준비 업무를
  수행하는 경계와 담당변호사의 법률 검토 책임도 별도 카드로 구분했다.
- 실무진 실명·사진은 현재 재직·소속팀·담당 단계와 본인의 공개 동의를 확인한 사람부터
  개인 연락처 없이 추가하는 원칙을 적용했다. 명단 확정 전에는 오래될 수 있는 가상
  조직도를 만들지 않고 법률컨설팅팀·사건관리팀 역할만 공개한다.
- 사용자가 제공한 사무실 이미지는 잘못 생성된 표기가 없는 회의·응대 공간만 잘라
  `공간 연출 이미지`라고 직접 표시했다. 실제 방문 판단은 `/about#offices`의 서울·
  대전·부산 주소와 공식 연락처를 우선하도록 연결했다. 전역 메뉴·모바일 메뉴·푸터·
  sitemap에서 페이지를 연결하고 기존 `/about_intromem*`은 영구 리다이렉트한다.
- 1440 데스크톱과 390 모바일 전체 페이지에서 카드·처리 단계·연출 이미지·CTA를
  시각 검수했으며 가로 넘침이 없었다. 홈페이지 typecheck·ESLint·프로덕션 빌드,
  `git diff --check`, HTTP·리다이렉트·접근성·SEO 검사를 통과했다.

### 2026-07-31 — 개인회생 비용 검색 랜딩·법원비용 계산표 구현
- `/bank/guides/costs`를 `개인회생 비용`, `개인회생 변호사 비용`, `개인회생
  법원비용` 검색 의도의 canonical 랜딩으로 추가했다. 총액 하나를 광고하지 않고
  변호사 보수, 신청 인지대, 송달료, 사건별 실비·예납금과 매달 내는 변제금을 분리했다.
- 대한민국 법원·국가법령정보센터의 공식 안내를 확인해 2026-07-31 현재 전자제출
  인지액 27,000원과 2026-07-01 시행 e-Post 1회 송달료 5,640원을 표시했다. 송달료
  `5,640원 × (10 + 채권자 수 × 8)`을 채권자 1·5·10·20명 예시로 계산하되,
  변호사 보수·외부회생위원 예납금·서류 실비가 제외된 법원 기본비용임을 바로 밝혔다.
- 로앤의 승인된 실제 보수표가 없으므로 업계 평균가·최저가·분납 기간을 임의로 만들지
  않았다. 대신 부가가치세, 법원비용 분리, 채무증명서, 보정 대응, 개시·인가·면책 범위,
  중도 정산, 분납 일정과 추가비용 사전 승인 여부를 견적·계약 확인표로 제공한다.
- 개인회생 전역 메뉴와 카테고리 허브, sitemap에서 비용 페이지를 연결하고 Article·
  FAQ·Breadcrumb 구조화 데이터를 넣었다. 모바일에서는 가로 스크롤 표 대신 채권자
  수별 비용 카드로 변환된다.
- 홈페이지 typecheck·ESLint·프로덕션 빌드와 `git diff --check`가 통과했다. 로컬
  HTTP 200, 390·1440 Chrome 시각 검수, iOS format-detection 네 항목을 확인했고
  Lighthouse 접근성 1.00·SEO 1.00을 기록했다. `PROJECT_PLAN.md`를 v0.30으로 갱신했다.

### 2026-07-31 — 개인정보처리방침·이용약관·광고책임변호사 출시 고지
- `/privacy`와 `/terms`를 정적 공개 페이지로 추가하고 전역 푸터, sitemap, 상담 동의
  상세와 후기 동의 상세에서 연결했다. 개인정보처리방침은 상담·후기·홈페이지 카카오
  진입·네이버 예약·가명 여정·보안 로그의 목적·항목·보유기간, 파기·권리행사·보안·
  자동화 경계와 AWS·SOLAPI·리걸프렌즈 처리위탁을 현재 구현 기준으로 공개한다.
- 법무법인 로앤 대표변호사·광고책임변호사를 김충환 변호사(변호사등록번호 15977)로
  확정했다. 식별정보를 `apps/homepage/lib/legal-identity.ts`에 중앙화하고 전역 푸터와
  11개 법률 콘텐츠의 임시 책임자 문구를 교체했다. 광고책임자 지정만으로 개별 글의
  법률 검토가 완료된 것처럼 표시하지 않도록 메타 항목 이름도 `광고책임변호사`로
  구분했다.
- 개인정보 보호법·개인정보보호위원회 작성지침, 대한변협 광고책임변호사 기준과
  SOLAPI·리걸프렌즈의 공식 운영사 정보를 교차 확인했다. 공개 문서에는 API 키·토큰·
  내부 사건 식별자 등 비밀값을 포함하지 않았다.
- 홈페이지 typecheck·ESLint·프로덕션 빌드가 통과했다. `/privacy`, `/terms`는
  390×844와 1440×1000에서 HTTP 200, 가로 넘침 0, 콘솔·hydration 오류 0이며 푸터의 두
  문서 링크와 iOS format-detection 네 항목 유지도 확인했다. `PROJECT_PLAN.md`를
  v0.29로 갱신했다.

### 2026-07-31 — 리걸프렌즈 성공사례 원천 9,598행 로컬 복제·무결성 검증
- 사용자 요청으로 EC2 SSH 터널을 통해 리걸프렌즈 MySQL을 읽기 전용으로 조회하고
  `CB.TblCBCase`의 35개 컬럼·9,598행을 로컬 MySQL의 동일한 `CB.TblCBCase`로 복제했다.
  원본은 이름·전화·사건번호 인덱스를 포함하므로 일반 개발 DB와 섞지 않고, Git 밖의
  `/home/bmh31207/private/lawand/legalfriends/2026-07-31`에 권한 600 압축 백업 하나만
  남겼다. 검증 임시 파일과 SSH 터널은 작업 후 제거했다.
- 최초 논리 덤프는 5.23초, 로컬 적재는 0.82초였다. 원격 MySQL 8.0.45와 로컬 8.0.46
  사이에서 `FLOAT` 9개 중 금액형 5개의 인접 표현값 차이를 발견해, 원격 값을
  `DECIMAL(65,20)` 스냅샷으로 다시 읽어 9,527행을 보정했다. 원본 `update_dt`는
  유지했고 보정 뒤 금액 정규화 불일치는 0건이었다.
- 최종 확인값은 행 9,598·컬럼 35·인덱스 7·InnoDB·`utf8mb4_0900_ai_ci`, 테이블 검사
  `OK`다. 기본 필드·JSON·날짜와 정규화 숫자 이중 해시가 원격과 일치한다. 추출 시작부터
  최종 검증 백업까지 총 8분 7초가 걸렸고 최종 압축본은 891,775바이트다.
- 이 복제본은 공개 데이터가 아니다. 홈페이지·자가진단이 직접 조회하지 않고, 후속
  비공개 정제 원장에서 직접 식별자 제거·희소조합 재식별 위험 검사·금액형
  `DECIMAL/BIGINT` 변환을 거친다. 공개 사례와 자가진단은 변호사 승인·동의·철회가
  분리된 읽기 모델만 사용하도록 `PROJECT_PLAN.md`를 v0.28로 갱신했다.

### 2026-07-31 — 상담 테스트 원장 초기화·리걸프렌즈 로컬 워커 재활성화
- 사용자 요청으로 로컬 ERP의 상담 4건과 연결된 요청 4건, 배정 2건, 상태이력 6건,
  귀속 3건, 카카오 홈페이지 진입 2건, 네이버 예약 1건, outbox 10건·시도 2건,
  알림톡 발송 원장 2건을 단일 트랜잭션으로 삭제했다. 리걸프렌즈 사건 연결은 0건이었다.
- 직원 계정·후기·직원 감사로그와 네이버 IMAP mailbox 체크포인트 1건은 보존했다.
  삭제 후 상담·요청·배정·상태·외부 실행 원장이 모두 0건임을 확인했다.
- Git 제외 로컬 환경의 `LAWAND_OUTBOX_WORKER_ENABLED`를 `true`로 전환하고 gateway를
  재기동했다. health HTTP 200과 리걸프렌즈·알림톡·네이버 IMAP 세 워커의 시작 로그를
  확인했다. 외부 멱등성 계약은 아직 미확인이므로 timeout·응답 유실은 기존처럼 자동
  재시도하지 않고 ERP 확인 필요 원장에 남긴다. `PROJECT_PLAN.md`를 v0.27로 갱신했다.

### 2026-07-31 — 네이버 브라우저 자동화 전면 철회·IMAP 전용 복구
- 사용자 결정으로 네이버 예약 상세의 브라우저 자동화 PoC를 전부 철회했다. Playwright,
  브라우저 세션 점검·상세수집·CAPTCHA/2단계 재인증 CLI, 텔레그램 알림 어댑터와 관련
  설정·스크립트·테스트를 제거했다. 로컬 전용 Chrome 프로필도 영구 삭제했고 웹 로그인
  비밀번호와 텔레그램 비밀값은 Git 제외 환경파일에서 제거했다. IMAP 애플리케이션
  비밀번호만 메일 폴링을 위해 유지한다.
- migration `0016_naver_browser_session.sql`을 로컬 DB에서 역적용하고 migration 원장과
  스키마에서 브라우저 세션 테이블, 상세 재시도 필드와 연락처 보강 제약을 제거했다.
  기존 IMAP 예약 1건과 mailbox 체크포인트 1건은 보존했으며 최신 적용 migration은 다시
  `0015`다.
- 네이버 예약은 공식 IMAP 확정 메일만으로 전화번호 없는 상담을 만든다. 마스킹 이름,
  예약시각·상품·요청사항과 상세 링크를 ERP에 표시하고 전화는 실제 `NULL`, 화면에서는
  `010-0000-0000 · 미수집`으로 표시한다. 자동 상세수집을 기다리며 목록에서 숨기던
  동작도 제거했다. 이 경로에는 리걸프렌즈 등록과 알림톡 실행을 만들지 않는다.
- DB schema check, 전체 5개 패키지 typecheck·ESLint·프로덕션 빌드,
  core 36개·gateway 36개 테스트와 `git diff --check`가 통과했다. IMAP 전용 gateway를
  재기동해 health HTTP 200, 시작 직후 메일함 폴링 성공과 오류 없음, 보존한 예약 1건이
  전화 `NULL`인 채 ERP 목록에 노출되는 것을 확인했다.

### 2026-07-31 — 네이버 예약 브라우저 세션 점검·상세 보강 대기열
- migration `0016_naver_browser_session.sql`을 로컬 DB에 적용했다. 예약별 상세수집
  시도·다음 시도·PII 없는 오류 코드와 브라우저 세션의 인증·재인증 필요·점검 실패,
  마지막 확인·알림 시각을 원장으로 보존한다. 메일 단계의 마스킹 이름·전화 미수집
  상담은 일반 ERP 목록에서 숨기고 전체 이름·전화번호 암호화가 끝난 `ready` 예약만
  노출한다.
- 전용 persistent Chrome 프로필은 권한 `0700`과 Git 제외를 강제한다. gateway 시작
  시와 이후 24시간마다 세션을 읽기 전용으로 확인하며 자동 로그인이나 2단계 인증을
  발생시키지 않는다. 세션 만료 예약은 삭제하지 않고 15분 뒤 재시도하며, 재인증
  알림은 최대 24시간에 한 번만 보낸다. 운영자가 휴대폰을 확인할 수 있을 때
  `naver-browser:reauth`를 실행하면 보이는 Chrome에서 자격증명을 입력하고 2단계 인증
  완료 뒤 모든 대기 예약을 즉시 재시도 대상으로 되돌린다.
- 텔레그램 발송 어댑터와 봇 토큰·채팅 ID 설정 검증을 추가했다. 자격증명이 없으면
  같은 비식별 메시지를 구조화 로그에 남기며 예약번호·이름·전화·상세 URL은 알림에
  포함하지 않는다. 향후 별도 AI agent 크론 서버로 옮길 수 있도록 브라우저·알림
  경계를 분리했다.
- 합성 DB 통합 검증에서 미완성 예약 ERP 숨김 → 인증 만료 → 알림 1회 → 재시도 →
  전체 이름·전화 암호화 → ERP 노출 → 같은 보강 멱등 처리를 확인했다. 외부 outbox는
  `consultation.requested`만 있고 리걸프렌즈·알림톡은 생성되지 않았다. 검증 데이터는
  전부 삭제해 기존 실제 대기 예약 1건만 보존했다.
- 로컬 브라우저 워커를 활성화해 실제 저장 링크가 로그인 화면으로 전환되는 것을
  확인했다. 세션 원장은 `reauth_required`, 알림 시각 기록, 대기 예약 시도 1회·
  `reauth_required`, ERP 목록 미노출이며 gateway health는 HTTP 200이다. 일반 웹
  로그인 비밀번호는 Git 제외 환경파일에만 저장했고 출력·문서·DB에는 남기지 않았다.
  다음 단계는 텔레그램 자격증명 연결, 사용자가 휴대폰을 볼 수 있을 때 재인증 CLI,
  실제 상세 DOM의 이름·전화 파싱 canary다.

### 2026-07-31 — 네이버 IMAP 애플리케이션 비밀번호 인증·워커 활성화
- 네이버 2단계 인증에서 발급한 애플리케이션 비밀번호로 `imap.naver.com:993` TLS
  로그인과 `네이버예약` 폴더의 읽기 전용 접근을 확인했다. 비밀값은 Git 제외
  `apps/gateway/.env.naver.local`에만 저장하고 출력·문서·DB에는 남기지 않았다.
- 워커를 켜기 전에 최초 체크포인트를 수동 생성했다. 당시 폴더의 마지막 UID만 저장해
  기존 메일은 상담으로 만들지 않았으며 확인값은 체크포인트 1건, 네이버 예약 접수
  0건, 오류 없음이다.
- `LAWAND_NAVER_BOOKING_IMAP_ENABLED=true`로 전환하고 gateway 개발 서버를 다시
  띄웠다. health HTTP 200, `lawand naver booking imap worker started`, 최초 활성
  폴링 성공시각과 오류 없음 상태를 확인했다. 다음 검증은 이 기준점 이후 새 예약을
  만들어 5분 안에 ERP 상담이 생성되는 실제 canary다.

### 2026-07-31 — 네이버 예약 확정 메일의 ERP 상담 자동 접수 기반
- 네이버 예약 공개 조회 API 대신 공식 IMAP 메일함을 gateway 장수명 워커가 폴링하는
  구조를 구현했다. 평일 08:00~19:00에는 5분, 나머지 시간과 주말에는 30분 간격이며
  읽음 상태를 바꾸지 않는다. 첫 활성화 시 `UIDNEXT - 1`을 체크포인트로 저장해 기존
  1,096통을 소급 접수하지 않고 이후 도착분만 처리한다.
- 발신자와 예약 확정 제목을 검증한 뒤 예약 상세 URL에서 `business_id`와 예약번호를
  추출한다. `business_id + booking_number` 고유키와 advisory lock으로 같은 예약 메일
  재수집·워커 재시작에도 상담을 한 건만 만든다. 마스킹 이름·상품·예약 시각·인원·옵션·
  요청사항은 기존 데이터 보호기로 암호화하고 전화번호는 `NULL`로 둔다.
- migration `0015_naver_booking_imap.sql`을 로컬 DB에 적용했다. `naver_booking`
  접수 채널, `customer_initiated_booking` 처리 근거, 예약 상세/체크포인트 원장을
  추가했다. ERP 목록·상세에는 네이버 예약 배지, 예약시각, 상세 확인 상태와 로그인된
  스마트플레이스용 상세 링크를 표시한다. 연락처 보강 전에는 담당 배정을 해도
  리걸프렌즈·알림톡 outbox를 만들지 않는다.
- 합성 MIME 파서·발신자/제목 필터·한국시간 5분/30분 경계 테스트를 추가했다. 실제
  로컬 DB에서 신규 생성→같은 예약 재처리 멱등→전화 NULL→상세 상태를 검증한 뒤
  테스트 상담을 정리해 예약 원장 0건을 확인했다.
- 전달받은 일반 로그인 자격증명은 IMAP 인증에서 거절됐다. 비밀값은 Git 제외 로컬
  환경파일에만 두었고 워커는 비활성이다. 네이버 메일 IMAP 사용 허용 여부와 2단계
  인증용 애플리케이션 비밀번호를 확인한 뒤 최초 canary를 진행해야 한다.

### 2026-07-30 — 홈페이지 카카오 진입 대기·확정·무효 수직 흐름
- 운영 채널 챗봇에서 고객 자유 메시지가 자동 읽음 처리되고 상담원 채팅 목록에는
  정상 노출되지 않는 것을 실제 확인해 챗봇 연결을 해제하고 기존 채팅방 리스트 메뉴로
  복구했다. `PROJECT_PLAN.md`를 v0.23으로 교정하고 챗봇 문서는 종료된 실험 기록으로
  전환했다.
- 홈페이지의 카카오 CTA 5곳을 same-origin form POST로 교체했다. 클릭하면
  `POST /api/kakao-entry`가 gateway에 전화번호 없는 ERP 상담을 먼저 만든 뒤 기존
  `https://pf.kakao.com/_AeGxoxl/chat`으로 303 이동한다. gateway 실패 시에도 채팅
  이동은 막지 않는다. 같은 탭의 30분 이내 반복 클릭은 UUID 멱등키를 재사용해 상담은
  한 건만 만들고 클릭 수와 최근 클릭 시각만 갱신한다.
- migration `0014_kakao_homepage_entry.sql`을 로컬 DB에 적용했다. 접수 source는
  `homepage_kakao`, 처리 근거는 `customer_initiated_channel_entry`, 실제 전화번호는
  `NULL`이다. `kakao_homepage_entries`가 `pending/confirmed/invalid`, 최초·최근 클릭과
  클릭 수, 처리 직원을 보존한다.
- ERP 목록·상세에 `채팅 확인 대기`, `채팅 확인`, `미진입·무효`를 표시한다. 직원이
  카카오 채널의 표시명을 입력하면 이름을 `표시명_<접수번호 8자리>_플친`으로 암호화
  저장하며 오입력은 감사로그와 함께 수정할 수 있다. 대기 중에는 담당자 배정을
  차단하고 메시지가 없는 클릭 이탈은 상담을 `closed`로 무효 처리한다.
- 이 무전화 경로는 생성 시 `consultation.requested`, 확인 뒤 배정 시
  `consultation.assigned`만 남긴다. 접수·배정 알림톡과 리걸프렌즈 신건 outbox는 만들지
  않는다. 실제 DB 통합 검증에서 중복 클릭 1건 유지·클릭 수 2, 대기 배정 차단, 표시명
  확정과 암호문 저장, 배정 외부 실행 0건, 무효 종결을 확인한 뒤 검증 데이터를 모두
  정리했다.
- 실행 중인 홈페이지의 실제 form POST도 두 번 호출해 모두 카카오 URL 303, DB
  `pending` 1건·클릭 수 2·전화 NULL을 확인한 뒤 상담·상태·outbox를 삭제해
  `kakao_homepage_entries=0`으로 정리했다. core 35개·gateway 33개 테스트, 전체 5개
  패키지 typecheck·ESLint·프로덕션 빌드, DB schema check와 실제 홈페이지·ERP·gateway
  HTTP 확인이 통과했다.

### 2026-07-30 — 카카오 상담 행동 우선 메뉴 v1.2 운영 배포
- 실제 카카오톡 화면에서 챗봇 리스트 메뉴가 하단 시트로 열리고 핵심 행동인
  `상담 요청하기`가 맨 아래에 묻혀 있음을 확인했다. 기존 블록은 삭제하지 않고 메뉴
  연결만 재구성해 `상담 요청하기`, `상담원 연결`, `운영시간 및 상담안내`,
  `주소 및 연락처 안내`, `나의 사건 진행 검색`, `개인회생 재신청`,
  `채권 추심 대처 방법`, `개인회생 개시결정 기간` 순으로 정리했다.
- 전체 배포 v1.2(`상담 메뉴 우선순위 정리`)를 2026-07-30 16:33 KST에 완료했다.
  배포 히스토리에서 `New v1.2`, 전체 배포, 배포 계정과 시각을 확인했고 봇테스트에서도
  8개 항목의 표시 순서가 정확히 일치했다.
- 하단 시트의 `상담 연결` 제목은 봇 리스트 설정 화면에 수정 입력란이 없는 카카오
  시스템 영역이다. 챗봇 리스트 메뉴 연결을 유지한 채 임의 변경하지 않았다.

### 2026-07-30 — 기존 카카오 메뉴 챗봇 이전·상담원 연결 v1.1 운영 배포
- `법무법인 로앤` 채널의 기존 리스트 메뉴를 OFF로 전환하고 커스텀 메뉴도 OFF인 것을
  확인했다. 1:1 채팅과 평일 08시~19시 상담 운영시간은 유지한 채 챗봇
  `법무법인 로앤 상담`의 운영 채널로 연결했다.
- 기존 메뉴 7개를 `운영시간 및 상담안내`, `주소 및 연락처 안내`,
  `나의 사건 진행 검색`, `개인회생 재신청 가능한가요`, `채권 추심 대처 방법`,
  `개인회생 개시결정 예상 기간`, 기존 `상담 요청하기` 일반 블록으로 옮겼다. 기존
  사무소 연락처와 법원·안내 링크를 보존하고 운영시간 안내는 현재 08시~19시로
  교정했다.
- `상담원 연결` 블록을 새로 만들고, 평일 상담 가능시간 안내와 카카오의
  `상담 연결` 플러그인 버튼을 붙였다. 챗봇 리스트 메뉴는 이 블록을 포함한 8개
  항목으로 구성했다.
- 전체 배포 v1.1(`기존 채팅방 메뉴 이전 및 상담원 연결`)을 2026-07-30 14:59 KST에
  완료했다. 봇테스트에서 8개 리스트 메뉴와 `상담원 연결` 응답·버튼이 모두 표시되는
  것을 확인했다. 브라우저에는 연결된 개인 카카오톡 계정이 없어 웹 채팅방 종단
  클릭은 생략했으며, 로컬 gateway `3022`와 Tailscale Funnel `8443`의 `/health`는
  모두 `status: ok`였다. Funnel은 계속 개발 PC 가용성에 의존한다.

### 2026-07-30 — 카카오 채널 무전화 상담 접수·챗봇 v1.0 배포
- 카카오 SkillPayload 계약과 `POST /v1/kakao/consultations`를 추가했다. 전용 인증
  헤더와 허용 봇 ID를 검증하고, `plusfriendUserKey`·`botUserKey`·`user.id` 순으로
  선택한 사용자 키는 HMAC으로만 저장한다. 같은 봇·사용자의 첫 버튼 또는 첫 자유
  메시지만 상담을 만들고 후속 호출은 최초 접수번호를 재사용한다. 고객 발화 원문과
  카카오 사용자 키 평문은 저장하지 않는다.
- migration `0013_kakao_channel_intake.sql`을 로컬 DB에 적용했다. 카카오 상담의
  전화번호는 `NULL`, 내부 이름은 `카카오_<접수번호 8자리>_플친`이며 ERP에서만
  `010-0000-0000 · 미수집`으로 표시한다. 고객이 먼저 채널 메시지를 보낸 사실을
  `customer_initiated_channel_message` 근거로 구분한다.
- 카카오 상담 생성에는 `consultation.requested`만, 담당 배정에는
  `consultation.assigned`만 남긴다. 실제 전화번호를 받기 전 접수·담당 배정 알림톡과
  리걸프렌즈 신건 등록은 모두 생성하지 않는다. core 31개·gateway 30개 테스트,
  관련 typecheck와 schema check, 실제 HTTP·DB 통합 검증이 통과했고 검증 데이터는
  카카오 상담 0건으로 정리했다.
- 카카오 관리자센터에 `카카오 상담 접수` 스킬, `상담 요청하기` 일반 블록,
  동일 스킬을 쓰는 폴백블록, 웰컴블록 안내와 버튼을 구성했다. 고객용 웰컴 문구에서는
  최초 행동·내부 접수 같은 구현 규칙을 빼고 버튼 또는 메시지로 상담할 수 있다는
  안내만 남겼다. 전체 배포 v1.0(`카카오 상담 접수 및 폴백 연결`)을 2026-07-30
  12:37 KST에 완료했다.
- 관리자센터의 스킬 단독 전송 canary는 정상 접수 응답을 반환했다. 봇테스트 발화는
  운영 채널 미연결 상태에서 스킬 호출을 만들지 않았고 스킬 오류도 0건이었다. 기존
  `법무법인 로앤` 채널이 `사용중 / 채팅방 메뉴 사용중`으로 비활성화돼 운영 채널로
  선택할 수 없음을 확인했다. 카카오 공식 제약상 채팅방 커스텀 메뉴·리스트 메뉴·
  자동응답은 챗봇과 동시 사용이 불가하므로 기존 메뉴 전환 승인과 OFF가 필요하다.
- 관리자센터 canary endpoint는 개발 PC의 Tailscale Funnel
  `https://desktopkchai.tail977311.ts.net:8443`에서 로컬 gateway `3022`로 연결된다.
  공개 HTTPS와 인증은 검증했지만 PC·프로세스 가용성에 의존하므로 운영 상시 연결 전
  독립 gateway 서버·도메인·health check로 교체해야 한다. 상세 기준은
  `docs/KAKAO_CHATBOT_CONSULTATION_V1.md`, 설계 기준은 `PROJECT_PLAN.md` v0.20이다.

### 2026-07-30 — 로컬 상담요청 테스트 데이터 전량 초기화
- 사용자가 현재까지 누적된 상담요청이 모두 테스트 데이터라고 확인해 로컬 개발 DB의
  상담 8건을 한 트랜잭션으로 삭제했다. 상담 요청 8건, 귀속 8건, 상태이력 12건,
  담당 배정 4건과 연결된 방문 세션 6건·이벤트 37건도 함께 정리했다.
- 상담 관련 outbox 24건과 전송시도 9건, Solapi 알림톡 전송원장 2건,
  리걸프렌즈 사건 연결원장 3건, 상담 배정·PII 조회 직원 감사로그 10건을 삭제했다.
  삭제 후 각 상담 도메인 원장과 상담 관련 outbox·감사로그가 모두 0건임을 확인했다.
- 고객후기·직원 계정·조직 등 상담과 무관한 데이터는 건드리지 않았다. 이미 실제
  발송된 알림톡과 리걸프렌즈에 생성된 외부 사건은 로컬 DB 삭제 대상이 아니므로
  각 외부 서비스에는 그대로 남아 있다.

### 2026-07-30 — Solapi 상담 접수·담당 배정 알림톡 실제 수신 완료
- Solapi API에서 법무법인 로앤 채널의 실제 `pfId`, 두 템플릿의 `APPROVED` 상태,
  부가정보형 `EX`, 버튼 0개와 접수번호·접수시각·연락예정·담당자명 변수 계약을 직접
  확인했다. 공개 카카오 채널 URL의 슬러그는 API 식별자가 아니며 Solapi 채널 ID를
  사용한다.
- 새 상담이 최초 생성될 때 상담 접수 알림톡 outbox를 같은 트랜잭션에 추가한다. 정상
  멱등 재시도·동일내용 중복·익명→실명 보강에는 중복 알림을 만들지 않는다. 기존 담당
  배정 알림톡과 함께 독립 Solapi 워커가 전화번호를 발송 직전에만 복호화하고 승인
  변수로 변환한다. 빠른 연락은 `가능한 빠른 시간`, 예약 연락과 접수시각은
  `Asia/Seoul` 기준으로 표시한다.
- `POST /messages/v4/send-many/detail`에 ATA를 보내며 `disableSms=true`로 문자
  대체발송을 끈다. 등록하지 않은 임의 `agent.appId`는 Solapi 등록 거절을 일으켜
  제거했다. HMAC-SHA256 인증, 429·5xx 재시도, 응답 유실 시 중복 방지 중단,
  HTTP 200 안의 개별 `statusCode=2000`·group/message ID 검증을 구현했다.
- migration `0012_solapi_alimtalk_delivery.sql`을 로컬 DB에 적용했다.
  `alimtalk_deliveries`에는 전화·본문 없이 outbox/상담/요청 참조, 템플릿 용도와 Solapi
  그룹·메시지 ID·상태만 저장한다. ERP 상담 상세는 상담 접수/담당 배정 알림을 분리해
  상태·시도 이력·메시지 ID를 보여준다. 리걸프렌즈와 알림톡 워커 활성화 설정도 분리했다.
- 테스트 상담 `LA-260730-GRMVUCM2`로 접수·담당 배정 알림톡을 각 1건 발송했고 Solapi
  조회에서 모두 `COMPLETE/4000/수신 완료`를 확인했다. 최초 잘못된 요청의
  `provider_rejected` 이력은 1차 실패로 보존하고 실제 성공을
  `manual-live-reconciliation` 2차 시도로 기록해 두 outbox를 `published`로 정합화했다.
  연결 전에 생성된 과거 배정 알림 3건은 오래된 안내의 소급 발송을 막고 사유와 함께
  `dead` 처리했다.
- 로컬 알림톡 워커는 활성, 리걸프렌즈 워커는 비활성으로 gateway를 재시작했다.
  core 27개·gateway 29개 테스트, 전체 typecheck·ESLint·프로덕션 빌드, DB schema check,
  mock DB 워커 통합검증, `git diff --check`가 통과했다. API 키·시크릿은 권한 600의
  Git 제외 환경파일에만 저장했지만 시크릿이 대화에 노출됐으므로 운영 전 재발급이
  필요하다. Solapi `2000` 이후 최종 상태 자동 갱신은 웹훅 또는 조회 소비자 후속 과제다.

### 2026-07-30 — 리걸프렌즈 `case_type` 기본값 중심 분류로 변경
- 리걸프렌즈 V2 신건의 `case_type`을 빠른 상담과 상세 상담 모두 기본 `1`로 보내도록
  변경했다. 상세 상담의 `어떤 도움이 가장 필요하신가요?`에서 화면의 실제 선택값
  `개인파산·면책`을 고른 경우만 `2`, `기타`를 고른 경우만 `3`으로 보낸다.
- 두 제도 비교, 독촉·법원 문서·압류 대응, 아직 잘 모르겠어요와 topic이 없는 빠른 상담은
  모두 `1`이다. payload 단위 테스트로 기본값과 두 예외를 고정했으며
  `PROJECT_PLAN.md`를 v0.18로 올리고 연동·상담 문서를 같은 기준으로 맞췄다.

### 2026-07-30 — 리걸프렌즈 V2 최초 담당자·사건 ID 실제 검증 완료
- 신건 등록 endpoint를
  `POST /api/bankruptcy/case/createForLawnV2`로 바꾸고 기존 payload의 담당자 필드를
  로그인 ID `member_id`가 아닌 숫자형 `member_idx`로 교체했다. 성공 응답의 사건 ID는
  기존처럼 `case_idx`, `case_id`, camel/Pascal 변형과 숫자형 `data`를 허용한다.
- 직원 외부계정에 로그인 ID와 숫자형 member idx를 분리 저장한다. migration
  `0011_legalfriends_v2_member_idx.sql`을 로컬 DB에 적용하고 김충환 매핑을
  `lawandfirm_s / 138`로 보강했다. ERP 직원 초대·직원 관리 화면도 두 값을 함께
  입력·변경·해제하며 어느 한쪽만 입력하거나 활성 직원·초대 사이에 값이 중복되면
  거부한다.
- V2가 신건 생성 시 최초 담당자를 배정하므로 새 사건의 `manager_assigned_at`을 생성
  성공 시각으로 함께 기록하고 직후 `changeManager`는 호출하지 않는다. 기존
  `member_id` 기반 `changeManager`는 저장한 `case_idx`로 추후 담당자가 실제 변경될
  때만 사용한다.
- 홈페이지 same-origin API로 `김충환2_테스트`·`010-4908-1382` 빠른 상담을 실제 접수해
  `LA-260730-GRMVUCM2`를 받았다. ERP에서 김충환 본인 배정 뒤 대기 중인 해당 outbox
  한 건만 실행했다. HTTP 200·업무 `code=0`으로 사건 `202130`이 생성됐고 내부 원장은
  1회 시도 `published/succeeded`, 사건 연결과 담당자 배정 완료로 일치했다.
- 리걸프렌즈 사건 목록에서 사건 202130의 최초 담당자가
  `김충환(lawandfirm_s, member_idx=138)`임을 확인했다. 별도 담당자 변경 호출은
  없었다. V2의 사건 ID 반환과 최초 담당자 반영은 실제 확인됐으며 남은 상시 워커
  활성화 차단점은 외부 멱등성 계약이다. 워커 기본값은 계속 비활성이다.
- `PROJECT_PLAN.md`를 v0.17로 올리고 연동·상담·ERP 인증 문서를 V2 계약에 맞췄다.
  core 26개·gateway 23개 테스트, 전체 5개 패키지 typecheck 포함 프로덕션 빌드와
  ESLint, DB schema check, outbox 로컬 통합 검증, `git diff --check`가 통과했다.

### 2026-07-30 — 리걸프렌즈 최초 담당자·사건 식별자 변경 API canary
- 신건 등록 body에 ERP 배정 직원의 활성 리걸프렌즈 로그인 ID를 `member_id`로 처음부터
  포함했다. 성공 응답 사건 식별자는 `case_idx`, `case_id`, camel/Pascal 변형과 숫자형
  `data`를 모두 허용한다. 생성 뒤 식별자를 `legalfriends_case_links`에 보존하고,
  추후 담당자 변경에는 기존 `changeManager`를 계속 사용할 수 있다.
- 홈페이지 same-origin API로 `김충환2_테스트`·`010-4908-1382` 빠른 상담을 실제 접수해
  `LA-260730-YLFWP9S9`를 받았다. 과거 같은 전화 접수 때문에 `7일 내 중복 의심`으로
  정상 분리됐고, ERP의 기존 김충환 세션으로 본인 배정한 뒤 해당 outbox 한 건만
  단건 실행했다.
- 신건 등록은 HTTP 200·업무 `code=0`으로 외부 사건 `202108`을 실제 생성했지만, 당시
  응답에서 기존 파서가 사건 식별자를 찾지 못해 첫 시도는
  `invalid_success_response/dead`로 중단됐다. 리걸프렌즈 사건 목록 API에서 생성 사건의
  `case_id=202108`을 확인해 내부 원장에 복구했다.
- 등록 요청에 `member_id=lawandfirm_s`를 보냈는데도 최초 담당자는
  `신건자동등록(lawandfirm_s200)`이었다. `changeManager`로 사건 202108을 김충환에게
  변경한 뒤 목록에서 `김충환(lawandfirm_s)`을 확인했다. 첫 실패와
  `manual-live-reconciliation` 성공을 실행 원장에 보존해 outbox를 `published`, 총
  2회로 정합화했다.
- 최초 담당자 반영이 실제 서버에서 확인되지 않았으므로 워커는 신건에 `member_id`를
  계속 보내면서 `changeManager`를 안전 확인으로 유지한다. 외부 멱등성과 최초 담당자
  반영 계약이 확정되기 전까지 상시 워커도 계속 비활성이다. `PROJECT_PLAN.md`를
  v0.16으로 올리고 연동 문서 두 곳을 실제 결과에 맞췄다.
- core 26개·gateway 23개 테스트, 전체 5개 패키지 typecheck·ESLint·프로덕션 빌드,
  DB 워커 통합 검증과 `git diff --check`가 통과했다.

### 2026-07-30 — iPhone Chrome 실제 diff 기반 `<html>` hydration 예외 적용
- 사용자가 제공한 전체 React diff에서 서버에는 없고 iPhone Chrome 클라이언트의 문서
  루트 `<html>`에만 `__gcrremoteframetoken`이 추가되는 것을 확인했다. 애플리케이션의
  날짜·난수·locale·태그 중첩 문제가 아니라 브라우저가 hydration 전에 넣는 외부
  속성으로 원인이 확정됐다.
- Next.js 공식 문서의 Solution 3에 따라 정확한 `<html>`에만
  `suppressHydrationWarning`을 적용했다. 이 옵션은 한 단계만 작동하므로 `body`와 페이지
  내부의 실제 hydration 불일치는 계속 경고한다. DOM 속성 삭제 스크립트나 console
  필터는 사용하지 않는다.
- 직전 추정에서 사용한 `__gchrome_remoteframetoken`은 실제 속성명이 아니었다. 이번
  diff에서 확인한 정확한 이름은 `__gcrremoteframetoken`이며, 속성명을 추정해 제거하는
  방식 대신 React가 제공하는 해당 요소 단위 예외로 교정했다. `PROJECT_PLAN.md`를
  v0.15로 올리고 공용 작업 규칙에 이 확인된 예외의 범위와 이유를 기록했다.
- headless Chrome의 `Page.addScriptToEvaluateOnNewDocument`로 React 실행 전에
  `<html __gcrremoteframetoken="cdp-reproduction-token">`을 실제 주입해 `/bank`를
  열었다. 로드 후 속성이 존재하는 상태에서도 console error 0건, hydration error 0건을
  확인했다. 홈페이지 typecheck·ESLint·프로덕션 빌드와 `git diff --check`도 통과했다.

### 2026-07-30 — Next.js 공식 iOS hydration 대응의 누락된 `date=no` 교정
- Next.js 공식 hydration 문서를 다시 확인했다. iOS가 전화번호·날짜·이메일·주소를
  React 실행 전에 링크로 바꿀 수 있으므로 네 가지 format detection을 모두 꺼야 하지만,
  루트 metadata에는 `telephone/address/email`만 있고 `date`가 빠져 있었다.
- 모든 페이지 푸터에 현재 연도와 운영시간이 있어 `/about`에 한정되지 않고 전 페이지
  경고가 발생할 수 있는 구조였다. `formatDetection.date=false`를 추가해 서버 HTML의
  meta를 `telephone=no, date=no, address=no, email=no`로 완성했다.
- 효과가 없었던 `__gchrome_uniqueid`·`__gchrome_remoteframetoken` 제거용
  `beforeInteractive` DOM 스크립트는 삭제했다. 페이지 전체 경고 억제나 console 필터도
  쓰지 않고 실제 React 불일치는 계속 드러나게 했다. `PROJECT_PLAN.md`를 v0.14로
  교정하고 공용 작업 지침에도 네 가지 iOS 자동 감지 차단을 필수로 고정했다.
- 홈페이지 typecheck·ESLint·프로덕션 빌드와 `git diff --check`가 통과했다. iPhone
  Chrome 사용자 에이전트로 `/bank`, `/about`, `/bank/reviews`가 모두 HTTP 200이며,
  세 초기 HTML 모두 `telephone=no, date=no, address=no, email=no`를 반환하고 실패한
  전역 DOM guard가 0건인 것을 확인했다. 아이폰이 실제 접근하는 Tailnet HTTPS
  `/bank`도 같은 완전한 format-detection meta와 HTTP 200을 반환한다.

### 2026-07-30 — 전 페이지 모바일 Chrome hydration 전역 방어로 교정
- 사용자가 `/about`뿐 아니라 모든 페이지에서 같은 경고가 난다고 확인해 소개 대화만
  client-only로 바꾼 직전 조치는 원인 범위를 잘못 잡은 것으로 판단했다. 해당 loader와
  로딩 CSS를 제거해 대화형 소개의 서버 렌더링을 복원했다.
- 모든 페이지가 공유하는 루트 레이아웃에 `beforeInteractive` guard를 추가했다. 모바일
  Chrome·Chrome 기반 도구가 React hydration 전에 일반 DOM과 폼에 삽입하는
  `__gchrome_uniqueid`, `__gchrome_remoteframetoken` 두 속성만 초기 문서에서 제거하고,
  초기 로드 1초 뒤 감시를 끝낸다.
- 페이지 전체 `suppressHydrationWarning`이나 console 필터는 사용하지 않는다. 알려진
  외부 속성만 중앙에서 복구하므로 실제 날짜·난수·브라우저 분기·잘못된 태그 중첩으로
  생기는 hydration 오류는 계속 드러난다. `PROJECT_PLAN.md`를 v0.13으로 올리고 공용
  작업 규칙도 같은 기준으로 교정했다.
- 홈페이지 typecheck·ESLint·프로덕션 빌드와 `git diff --check`가 통과했다. 개발
  `/about`은 HTTP 200이고 초기 HTML에 전역 guard와 제거 대상 두 속성이 포함되며,
  소개 질문 4개도 다시 서버 렌더링되는 것을 확인했다.

### 2026-07-30 — 모바일 Chrome 로앤 소개 hydration 경계 보정·예방 규칙 고정
- `/about` 대화형 질문은 정적 데이터와 고정 state로 렌더되어 애플리케이션 자체의
  서버/클라이언트 분기는 없었다. 다만 다수의 선택 버튼을 SSR하면 모바일 Chrome이
  hydration 전에 DOM 속성을 삽입할 때 React 초기 속성과 충돌할 수 있어, 상담·후기
  작성 화면과 같은 client-only loader 경계로 분리했다.
- 서버 HTML에는 검색 가치가 없는 질문 버튼 대신 비대화형 로딩 안내만 남긴다. 소개
  hero, 공개 후기 근거, 업무 원칙, 사무소 정보 등 검색·초기 표시가 중요한 콘텐츠는
  계속 서버 렌더링한다. 페이지 전체 `suppressHydrationWarning`은 사용하지 않았다.
- `AGENTS.md` 작업 규칙과 `PROJECT_PLAN.md` v0.12에 결정적 첫 렌더, 유효한 태그 중첩,
  모바일 브라우저 속성 주입 대응, client-only 적용 기준, 실기기 검수 항목을 고정했다.
- 홈페이지 typecheck·ESLint·프로덕션 빌드와 `git diff --check`가 통과했다. 실행 중인
  개발 서버의 `/about`은 HTTP 200이며 초기 HTML에서 로딩 안내 1건, 질문 선택 UI와
  `data-about-question` 0건을 확인했다.

### 2026-07-29 — 로앤 소개 대화의 답변 주목도·구체성 보정
- `/about`의 선택 즉시 다음 질문으로 자동 스크롤하던 동작을 제거했다. 이제 선택하면
  다음 카드가 아니라 해당 로앤 답변이 화면 중심으로 들어오고, 사용자가
  `답을 읽었어요 · 다음 질문`을 눌러야 다음 문항으로 이동한다. 마지막 문항도 같은
  명시적 버튼으로 맞춤 기준 결과를 확인한다.
- 16개 선택지의 답변을 전부 다시 썼다. 상담·계약 전 확인할 자료와 질문, 결과를
  장담할 수 없는 이유, 최근 대출·재산 처분·누락 채권 같은 변수, 접수·담당 배정·
  리걸프렌즈의 역할, 자동화와 사람 판단의 경계를 구체적으로 설명한다. 각 답변에는
  사용자가 바로 점검할 `먼저 확인해 보세요` 항목을 붙였다.
- 답변을 짙은 녹색의 독립 패널과 큰 제목, 본문·확인 행동·다음 버튼 위계로 재설계했다.
  선택 완료 카드도 별도 테두리와 그림자로 구분하고 모바일에서는 확인 행동과 다음
  버튼을 한 열로 배치했다. 모션 감소 설정에서는 답변 진입 애니메이션을 제거한다.
- 993×1012 실제 Chrome에서 첫 선택이 답변 패널로 이동한 뒤 멈추고, 명시적 다음
  버튼을 누른 경우에만 두 번째 질문이 화면 중심으로 오는 것을 확인했다. 홈페이지
  typecheck·ESLint·프로덕션 빌드와 `git diff --check`가 통과했다.

### 2026-07-29 — 검증 가능한 데이터 기반 대화형 로앤 소개 구현
- 독립 `/about`을 만들고 전역 데스크톱·모바일 메뉴, 홈의 기존 로앤 원칙 섹션,
  푸터 AI·자동화 원칙과 sitemap에서 연결했다. 첫 화면은 큰 성과 주장 대신
  `신뢰는 큰말보다, 확인 가능한 과정에서 시작됩니다`를 중심으로 현재 공개 후기 수,
  후기 작성일 범위와 서울·대전·부산 세 사무소를 근거 원장처럼 보여준다.
- 방문 목적, 궁금한 업무 방식, 변호사 선택 기준, 최초 인지 경로의 네 질문을 스크롤하며
  하나씩 답하는 인터랙션을 구현했다. 선택 즉시 로앤의 관련 답이 나오고 네 문항을
  마치면 사용자가 중요하게 본 기준으로 로앤을 한 문장으로 정리한다. 선택값은 React
  브라우저 상태에서만 쓰며 서버·DB·분석 이벤트로 전송하지 않는다고 화면에 명시했다.
- 공개 후기 근거 데이터는 `customer_reviews`에서 매 요청마다 집계한다. 검증 시점 값은
  공개 3,359건, 작성일 2016-10-18~2026-07-29, 작성 당시 상담 1,150건·개시/절차 진행
  1,865건·면책 후 290건·기타 54건, 상위 경험 키워드 친절 2,011건·빠름 1,100건·
  꼼꼼 678건·세심 677건이다. 삭제·개인정보 검수 대기 후기는 집계에서 제외한다.
- 공식 기존 홈페이지에서 대표변호사 김충환, 법인등록번호, 서울·대전·부산 주소·전화·
  사업자번호를 교차 확인했다. 산출 기준을 현재 검증할 수 없는 기존 누적 자문·
  사건해결 숫자는 의도적으로 사용하지 않았다. 실제 촬영 자산이 없어 스톡 인물·재연
  사진도 넣지 않았다.
- 390×844와 1440×1000에서 네 문항 전체 선택→맞춤 결론을 확인했다. 두 화면 모두
  가로 넘침 0, 콘솔 오류 0, 답변 중 POST 0건이었다. 로컬·Tailnet `/about` HTTP 200,
  홈페이지 typecheck·ESLint·프로덕션 빌드와 `git diff --check`가 통과했다.

### 2026-07-29 — 신규 고객후기 작성·암호화 검수 대기 수직 흐름
- `/bank/reviews/write`에 별점 없는 후기 작성 화면을 추가했다. 분야, 작성 당시 단계,
  경험 키워드 1~3개, 공개 이름, 후기 원문과 확인용 휴대전화를 받으며 데스크톱에는 공개
  미리보기, 모바일에는 미리보기를 폼보다 먼저 보여준다. 개인정보 수집과 후기 공개
  동의를 분리하고 제출 직후 자동 공개되지 않는다는 완료 상태와 `RV-` 접수번호를
  안내한다. 후기 허브와 전역 후기·사례 메뉴에서도 작성 페이지로 진입한다.
- core strict 계약과 migration `0010_customer_review_submissions.sql`을 추가해 로컬
  DB에 적용했다. 휴대전화와 후기 원문은 AES-256-GCM으로 각각 암호화하고 전화·payload
  HMAC만 중복 판정에 쓴다. 동의 버전·시각, 개인정보 탐지표시, 검수 상태와 1년 보관
  만료시각을 별도 `customer_review_submissions` 원장에 보존한다.
- 홈페이지 same-origin `/api/reviews`가 전용 키와 IP 비저장형 회전 client key로
  gateway `/v1/review-submissions`에 전달한다. 기존 공개접수 전화·네트워크 rate limit,
  UUID 멱등키와 10분 동일내용 재생을 사용하고 honeypot을 함께 둔다. 정상 사용자의
  재전송은 같은 접수번호 200을 반환하며 신규 row를 만들지 않는다.
- 실제 HTTP 제출은 201, 같은 키 재시도는 200을 반환했다. DB에서 `pending_review`,
  암호문·nonce, 키워드 2개, 1년 보관 순서와 평문 누출 0건을 확인한 뒤 테스트 row를
  삭제해 0건을 확인했다. core 26개·gateway 21개 테스트, schema check, 관련 typecheck·
  ESLint·홈페이지 프로덕션 빌드가 통과했다. 390×844와 1440×1000에서 가로 넘침과
  콘솔 오류가 없었다.
- 신규 후기는 자동 공개되지 않는다. 다음 구현은 ERP 후기 검수함에서 복호화 조회 감사를
  남기고 개인정보 가림, 공개·반려·철회와 공개 원장 승격을 처리하는 흐름이다.

### 2026-07-29 — 홈페이지 Turbopack 모노레포 루트 오류 복구
- 홈페이지 dev 서버가 간헐적으로 프로젝트 루트를 `apps/homepage/app`으로 잘못 추론해
  그 위치에서 `next/package.json`을 찾지 못하고 브라우저에 unexpected Turbopack
  runtime overlay를 표시했다. `next.config.ts`의 `turbopack.root`를 저장소 루트로
  명시해 자동 추론에 의존하지 않게 했다.
- 기존 3020 개발 서버를 정상 종료하고 Next 16.2.11 장수명 세션으로 재기동했다.
  홈페이지 typecheck와 프로덕션 빌드가 통과했고, 로컬과 Tailnet의 `/bank/reviews`가
  모두 HTTP 200, 후기 3,359건 렌더링, Turbopack 오류 문구 0건임을 확인했다.

### 2026-07-29 — Cafe24 고객후기 3,403건 이관·신규 후기 허브 구현
- Cafe24 MariaDB를 읽기 전용으로 조사해 `wp_kboard_board_content`의 `board_id=22`,
  `thumbnail_file=회생파산` 원천 3,403건을 확인했다. migration
  `0009_customer_reviews.sql`로 이관 배치와 후기 원장을 만들고 로컬 PostgreSQL에
  전량 이관했다. 공개 3,359건, 개인정보 패턴 검수 대기 1건, 삭제 상태 공개 제외
  43건이며 개인회생 3,154건·파산면책 205건이다.
- 이관기는 MariaDB 10.1 호환 Base64 행 스트림을 사용하고 추가정보 중 `main_id`별
  최신 행의 평가 키워드만 결합한다. 비밀번호·전화번호·성별·나이·유입경로는 조회·저장하지
  않는다. 콘텐츠의 전화·이메일·주민번호·사건번호·계좌·상세주소 패턴은 검수 대기로
  보내며, 재이관 시 원본 해시가 같으면 사람의 검수 결정을 보존한다. 전달받은 Cafe24
  접속 비밀값은 저장소·환경파일에 저장하지 않았다.
- `/bank/reviews`는 별점·베스트 후기 나열 대신 분야, 작성 당시 단계, 친절·꼼꼼·신뢰 등
  경험 키워드로 3,359건의 공개 원문을 탐색한다. 긴 후기는 네이티브 펼침, 필터 조합은
  `noindex, follow`, canonical은 단일 허브로 고정했다. 전역 메뉴·홈 후기 CTA·사이트맵을
  연결하고 기존 `/bank/successioncase_epilogue`를 영구 리다이렉트한다.
- DB/homepage typecheck·ESLint·프로덕션 빌드와 실제 기본/필터 HTTP 200, legacy 308,
  Lighthouse 접근성 1.00·SEO 1.00을 확인했다. 개별 legacy UID의 검색성과 기반 상세
  유지·301 맵, 검수 대기 1건의 관리자 승인 UI, 후기 삭제·정정 운영 화면은 후속 과제다.

### 2026-07-29 — 카카오톡 채널 1:1 채팅 독립 CTA 연결
- 카카오 공식 채널 JavaScript 문서를 확인했다. 채팅 기능은 1:1 채팅방 연결 페이지를
  열지만 실제 채팅방 진입 성공 여부를 반환하지 않는다. 현재는 별도 SDK·JavaScript 키가
  필요 없는 직접 채팅 URL `https://pf.kakao.com/_AeGxoxl/chat`을 중앙 상수로 관리한다.
- 카카오톡을 빠른 상담·상세 상황 남기기의 세 번째 폼 모드로 넣지 않았다. ERP 접수와
  다른 외부 채널이므로 데스크톱 헤더에서 상담 요청 옆 보조 CTA, 상담 섹션, 모바일
  메뉴와 `전화·카카오톡·상담 요청` 고정바, 상담 시작 화면의 두 접수 카드 아래 독립
  1:1 채팅 카드로 연결했다.
- 외부 링크는 새 창과 `noopener noreferrer`를 사용한다. 카카오 URL 최종 HTTP 200,
  homepage typecheck·ESLint·프로덕션 빌드를 통과했다. 1440×1000 홈, 390×844 홈과
  상담 시작 화면에서 가로 넘침 0, 프로덕션 콘솔 오류 0을 확인했다.

### 2026-07-29 — 실제 사건 201936 담당자 변경·ERP 원장 복구 완료
- 리걸프렌즈 DB에서 확인받은 테스트 신건 `Case_idx=201936`으로
  `POST /api/bankruptcy/case/changeManager`만 호출했다. `case_idx: 201936` header와
  `{ "member_id": "lawandfirm_s" }` JSON body에 HTTP 200,
  `{"code":0,"msg":"성공(0)","data":{}}`가 반환돼 실제 담당자 변경이 완료됐다.
- 로앤 상담 `LA-260729-WYJMW7X2`의 `legalfriends_case_links`에 사건번호와 담당자
  변경 완료 시각을 기록했다. 최초 `cast_type` 오류 시도는 `dead` 감사 이력으로 보존하고
  `manual-live-reconciliation` 성공 시도를 추가해 outbox를 `published`, 총 2회로
  정합화했다. 원장 확인값은 사건번호 201936, 담당자 `lawandfirm_s`, 변경 `assigned`,
  시도 `dead,succeeded`다.
- 실제 응답 계약에 맞춰 신건 등록과 담당자 변경 모두 HTTP 2xx뿐 아니라 JSON `code=0`을
  성공 조건으로 강제했다. 워커는 계속 비활성이다. 남은 유일한 자동화 차단점은
  `createForLawn` 성공 응답 `data`에 `case_idx`가 없다는 점이다.

### 2026-07-29 — 리걸프렌즈 사건 타입 필드 교정·신건 등록 성공
- 실제 응답을 직접 확인해 최초 명세의 `cast_type`이 오타임을 확인했다. JSON body를
  `case_type=1`로 바꾸자 `{"code":0,"msg":"성공(0)","data":{}}`가 반환됐고
  리걸프렌즈 신건이 생성됐다. JSON과 form 방식에서 `cast_type=1`은 모두
  `code=1033` 사건 타입 오류였다.
- 어댑터 payload와 테스트를 `case_type`으로 교정하고, HTTP 200 안에서도 `code != 0`인
  리걸프렌즈 업무 오류를 `invalid_request`로 판정하도록 보완했다. 성공 응답의 `data`는
  비어 있어 여전히 `case_idx`를 얻을 수 없으므로 자동 담당자 변경은 아직 활성화할 수
  없다.
- 생성된 테스트 신건의 `TblCSClient.Case_idx`를 확인받으면 기존 외부 신건을 중복 생성하지
  않고 사건 연결 원장에 기록한 뒤 `changeManager`만 실제 검증할 수 있다. 워커는 계속
  비활성 상태다.

### 2026-07-29 — 리걸프렌즈 실제 신건 등록 canary 결과: 사건 타입 검증 실패
- 사용자 승인 아래 홈페이지 정상 접수 → 관리자 본인 배정 → outbox 워커의 실제
  `createForLawn` 호출을 실행했다. HTTP status는 200이지만 실제 body는
  `{"code":1033,"msg":"사건 타입이 올바르지 않습니다(1033)","data":{}}`였고 리걸프렌즈
  UI에도 신건이 생성되지 않았다. JSON과 form-urlencoded 요청 모두 같은 결과여서
  `cast_type=1`의 실제 허용 조건 또는 명세 불일치 확인이 필요하다.
- 현재 어댑터는 2xx를 우선 성공으로 보고 `case_idx`를 찾다가
  `invalid_success_response`으로 남겼다. 리걸프렌즈의 `code` 성공·실패 규칙을 계약에
  반영해 HTTP 200 안의 업무 오류를 먼저 판별하도록 보완해야 한다. 담당자 변경 API는
  호출되지 않았다.
- 테스트 직후 `LAWAND_OUTBOX_WORKER_ENABLED=false`로 되돌리고 gateway를 재시작해 실제
  외부 송신을 다시 차단했다. 제공 토큰은 사용자 승인으로 로컬 Git 제외 환경파일에만
  저장했으며 출력·문서·Git에는 남기지 않았다.

### 2026-07-29 — 리걸프렌즈 신건 등록→담당자 변경 두 단계 연동
- 리걸프렌즈 담당자 변경 endpoint를
  `POST /api/bankruptcy/case/changeManager`로 확정했다. 신건 등록에는
  `cast_type/name/phone/living_place/memo`만 보내고, 성공 응답의 `case_idx`를
  `legalfriends_case_links`에 먼저 보존한 뒤 `case_idx` header와
  `{ "member_id": "직원 리걸프렌즈 로그인 ID" }` JSON body로 담당자를 변경한다.
- 담당자 변경만 429로 실패한 mock 통합 검증에서 첫 실행은 사건 연결 원장을 남기고
  재시도했으며, 두 번째 실행은 신건 등록을 건너뛰고 담당자 변경만 호출했다. 최종 호출
  횟수는 신건 1회·담당자 변경 2회였고 outbox가 완료된 뒤 검증 상담·시도·사건 연결을
  모두 정리해 0건을 확인했다.
- ERP 관리자 초대 폼에 선택형 리걸프렌즈 ID를 추가하고 가입 시 직원 외부계정으로
  연결한다. `/staff`의 직원별 관리 화면에서도 연결·변경·해제할 수 있으며 활성 직원과
  유효한 초대 사이의 ID 중복을 막고 변경 감사로그를 남긴다. 유일한 현 관리자 계정에는
  전달받은 `lawandfirm_s`를 로컬 DB에 연결했고 직원 1명·활성 매핑 1건·해당 관리자
  매핑 1건을 확인했다.
- migration `0008_legalfriends_two_step_assignment.sql`을 로컬 DB에 적용했다. 신건 성공
  응답의 정확한 `case_idx` 위치·자료형과 외부 멱등성은 아직 확인이 필요하고, 대화에
  노출된 기존 토큰도 교체해야 하므로 운영 워커는 계속 기본 비활성이다. 실제 외부 API는
  호출하지 않았다.
- core 23개·gateway 19개 테스트, 전체 5개 패키지 typecheck·ESLint·프로덕션 빌드,
  DB schema check와 `git diff --check`가 통과했다. 홈페이지 상담·ERP 로그인·gateway
  health 개발 경로도 각각 HTTP 200을 확인했다.

### 2026-07-29 — 리걸프렌즈 outbox 실행 원장·담당자 매핑 게이트
- `outbox_events`에 선점 임대 필드를, `outbox_delivery_attempts`에 시도별
  시작·성공·재시도 예정·확인 필요 이력을 추가했다. 워커는 `FOR UPDATE SKIP LOCKED`로
  한 행만 선점하고 최대 5회 지수형 재시도와 `Retry-After`를 적용한다. 응답 유실·timeout·
  lease 만료처럼 외부 생성 여부가 모호한 실패는 중복 등록을 피하려고 자동 재시도하지
  않는다. migration `0006_outbox_delivery_worker.sql`을 로컬 DB에 적용했다.
- 전달받은 리걸프렌즈 endpoint의 `cast_type/name/phone/living_place/memo` 변환기를
  구현했다. 회생 1, 파산·면책 2, 나머지 3이며 전화는 하이픈 포함, 지역은 API의 정식
  시·도 명칭으로 보낸다. 허용 목록에 없는 `해외·기타`는 임의 변환 없이 확인 필요로
  남기고, 요청·응답 body와 PII는 로그·실행 원장에 저장하지 않는다.
- 실제 담당자가 아닌 `신건자동등록` 담당자로 생성되는 문제를 막기 위해
  `staff_external_accounts`와 migration `0007_staff_external_accounts.sql`을 추가했다.
  워커 활성화에는 토큰뿐 아니라 확정된 담당자 파라미터 이름과 배정 직원의 활성
  리걸프렌즈 계정 매핑이 모두 필요하다. 담당자 값 형식·직원 외부 ID·멱등성 지원을
  리걸프렌즈 담당자에게 확인하기 전에는 실제 POST가 실행되지 않는다.
- ERP 상담 상세에 워커 대기·처리 중·재시도 예정·완료·확인 필요 상태, 총 시도 횟수,
  PII 없는 오류와 시도 원장을 표시한다. 네트워크 429 → 90초 재시도 → 201 성공을 mock
  client와 실제 로컬 DB로 검증했고 검증 상담·outbox·시도 이력을 모두 삭제해 0건을
  확인했다. 제공된 운영 토큰은 저장하지 않았고 대화에 노출됐으므로 실제 연결 전에
  재발급해야 한다.
- core 22개·gateway 18개 테스트, 전체 5개 패키지 typecheck·ESLint·프로덕션 빌드,
  DB schema check와 `git diff --check`가 통과했다. 홈페이지·ERP·gateway 개발 경로도
  각각 HTTP 200을 확인했다.

### 2026-07-29 — 정상 재시도 보존형 공개 상담 접수 방어
- 브라우저는 홈페이지 same-origin API만 호출하고 gateway의 상담 쓰기 endpoint는
  홈페이지 서버 접수 전용 키 없이는 `401`로 거부하도록 경계를 닫았다. 홈페이지는 JSON·64KB
  상한을 먼저 검사하고 gateway의 strict 계약과 body 상한도 그대로 유지한다.
- 클라이언트 주소는 날짜별 HMAC 가명 키로 바꿔 gateway에 전달한다. IP 원문은 DB나
  gateway 구조화 경고에 저장하지 않는다. 운영 reverse proxy hop 수는
  `LAWAND_TRUSTED_PROXY_HOPS`로 명시한다.
- 새 접수키에 대해 전화번호별 6회/30분·12회/24시간, 네트워크별 60회/10분·300회/24시간을
  적용했다. 공유망 오탐을 줄이려고 네트워크 한도는 높게 두었고, 같은 idempotency key의
  응답 유실·모바일 재시도는 전화·네트워크 횟수를 추가 소비하지 않은 채 30회/10분까지
  허용한다.
- 초과 시 `429`와 `Retry-After`를 반환한다. 제한 차원·재시도 시간만 담은 비식별 구조화
  경고는 차원별 5분에 한 번만 기록한다. 현재 한도는 단일 gateway 프로세스 메모리
  기준이며 다중 인스턴스 전환 전에 Redis 공유 카운터와 CloudWatch 경보 연결이 필요하다.
- gateway 테스트 13개, gateway·homepage typecheck/ESLint와 두 앱 프로덕션 빌드가
  통과했다. 실제 실행 중인 홈페이지 경유 잘못된 요청은 400, 내부 키 없는 gateway 직접
  요청은 401임을 확인했다. DB 스키마 변경이나 테스트 PII 저장은 없다.

### 2026-07-28 — ERP `상담하기` 본인 배정·외부 실행 요청 outbox 구현
- ERP 목록과 상세에 `상담하기` 버튼을 추가했다. 클릭 시 확인을 거쳐 현재 로그인 직원을
  본인 담당자로 배정한다. 상담 row 잠금과 상담별 unique 배정으로 동시 선점 경쟁을 막고,
  같은 직원의 재시도는 기존 결과를 반환하며 다른 직원의 후속 요청은 충돌로 안내한다.
- `consultation_assignments`와 migration `0005_consultation_self_assignment.sql`을 추가해
  담당 직원·주 멤버십·배정자·시각을 보존하고 로컬 DB에 적용했다. 배정과
  `requested→assigned` 상태이력, 직원 감사로그는 같은 트랜잭션에 저장한다.
- 같은 트랜잭션에서 `consultation.assigned`,
  `legalfriends.consultation.registration.requested`,
  `alimtalk.consultation.assignment_notification.requested`를 독립 outbox row로 만든다.
  외부 실행 payload에는 PII를 넣지 않고 assignment/intake 참조만 두었으며 실제 API 호출
  워커는 아직 연결하지 않았다.
- 임시 상담·세션으로 접수 201 → 최초 배정 201 → 같은 직원 재시도 200, 배정 1건·외부
  실행 포함 outbox 3건·상태이력 1건·감사 1건을 실제 DB에서 확인했다. 검증 데이터는
  모두 정리했다. 리걸프렌즈 협의안은 `docs/LEGALFRIENDS_CONSULTATION_API_REQUEST_V1.md`에
  정리했다.

### 2026-07-28 — ERP 초대 비밀번호 규칙·Tailnet 개발 접속 보정
- 초대 가입 비밀번호를 12자 이상, 영문 대문자·소문자·숫자·특수문자 각각 하나 이상으로
  gateway 계약에서 강제했다. 초대 화면은 입력 중 다섯 조건과 비밀번호 확인 일치 여부를
  즉시 표시하며, 모두 충족되기 전에는 계정 만들기 버튼을 활성화하지 않는다.
- ERP Next 개발 서버에 Tailnet 호스트를 허용 출처로 등록해 외부 개발기기에서 서버 액션
  완료 뒤의 화면 전환이 안정적으로 동작하도록 했다. core 계약 테스트 20개, core/ERP
  typecheck, ERP lint와 `git diff --check`를 통과했다.

### 2026-07-28 — 직원 소속·지역·회사 지정 프로필·역할 모델 확정
- 직원 소속은 `법무법인 로앤(lawand)`·`리걸플로(legalflow)`, 지역은
  `서울(seoul)`·`대전(daejeon)`·`부산(busan)` 기준 테이블로 분리했다. 계정과
  `staff_memberships`를 1:N으로 연결해 향후 여러 소속·지역 겸임을 지원하고, 초대 가입은
  첫 주 멤버십 하나를 만든다.
- 역할·권한 그룹을 `관리자(admin)`, `정규직(full_time)`, `아르바이트(part_time)`,
  `별산(separate_accounting)`, `민원업체(civil_complaint_vendor)`로 교체했다. 현재는
  전 역할이 상담 조회, 관리자만 직원 초대를 할 수 있고 추후 역할 프리셋+소속·지역·담당
  범위로 모듈 단위 보기·처리·관리 권한을 좁힌다.
- 관리자 초대 화면에서 이메일·이름·소속·지역·부서·직책·역할을 회사가 모두 지정한다.
  가입 화면은 이를 읽기 전용으로 보여주고 비밀번호만 받는다. gateway는 가입 요청에서
  직원정보 필드를 거부하고 초대 DB 원장을 다시 읽어 프로필·멤버십을 생성한다.
- `0004_staff_organization_membership.sql`을 로컬 DB에 적용했다. 구 계약의 미수락
  관리자 초대 1건은 새 필수 필드가 없어 의도적으로 삭제했고 실제 직원 계정은 없었다.
  소속 2개·지역 3개 seed와 새 테이블을 확인했다.
- 가짜 `리걸플로/부산/운영팀/테스트 담당자/관리자` 초대로 읽기 전용 표시 200, 가입 201,
  인증 ERP 200, 초대 재사용 410과 DB 멤버십 일치를 검증한 뒤 테스트 계정·초대·
  멤버십·세션·감사만 정리해 모두 0건을 확인했다.

### 2026-07-28 — ERP 초대 전용 직원 인증·PII 조회 감사 v1
- 공개 회원가입 없이 최초 관리자 CLI 또는 로그인한 `admin`의 ERP `/staff` 화면에서
  만든 72시간·1회용 초대만 가입할 수 있게 했다. `/login`, `/invitations/[token]`,
  직원 표시 이름·부서·직책 입력과 로그아웃을 구현했다.
- migration `0003_staff_authentication.sql`로 계정, 프로필, 역할, 초대, 세션, 감사로그
  6개 테이블과 `admin/manager/consultant/viewer` 역할을 추가해 로컬 `lawand_dev`에
  적용했다. 비밀번호는 scrypt 단방향 해시, 초대·세션 토큰은 SHA-256 지문만 저장한다.
- 로그인 5회 실패 시 15분 잠금, 직원 세션 12시간, HttpOnly·SameSite=Strict 쿠키를
  적용했다. 상담 목록·상세 gateway는 내부 API 키와 유효한 직원 세션을 모두 요구하고,
  목록 조회와 상세 PII 조회를 직원 ID 기반 감사로그에 남긴다. 관리자만 직원 초대를
  만들 수 있다.
- 가짜 관리자 초대로 초대 확인 200 → 가입 201 → 세션·로그아웃·재로그인·상담 조회·
  인증 ERP 렌더링 200 → 사용한 초대 재조회 410을 실제 DB에서 검증했다. 감사로그 5건을
  확인한 뒤 해당 테스트 계정·초대·세션·역할·프로필·감사만 삭제해 0건을 확인했다.
- core 18개, gateway 7개 테스트와 전체 typecheck·ESLint·5개 패키지 프로덕션 빌드,
  `git diff --check`가 통과했다. 외부 배포 전 비밀번호 재설정·계정 비활성화 UI,
  MFA/SSO, reverse proxy rate limit, 운영 HTTPS·비밀관리 검증은 남아 있다.

### 2026-07-28 — 리걸프렌즈 등록을 ERP `상담하기` 명령으로 전환
- 홈페이지 상담 접수 직후 또는 ERP 목록 유입만으로 리걸프렌즈에 데이터를 자동 등록하지
  않기로 했다. 직원이 ERP에서 상담을 확인하고 `상담하기`를 누를 때 담당자를 배정하며,
  그 확정 명령에서만 리걸프렌즈 상담 등록 요청 outbox 이벤트를 만든다.
- 외부 리걸프렌즈 호출은 DB commit 뒤 워커가 재시도하고, 같은 상담의 중복 등록·실패는
  ERP 원장에서 추적한다. 이 기능은 ERP 직원 인증·담당 배정 권한·PII 감사로그가 구현된
  뒤 활성화한다. 계약 이후의 고객 초대·사건 인계는 기존처럼 별도 상태 전환으로 유지한다.

### 2026-07-28 — 상담 거주 시·도 수집·ERP 연결
- 빠른·상세 상담 공통 연락 단계에 현재 거주 시·도를 필수로 추가했다. 서울·부산 등
  17개 시·도와 해외·기타만 strict 계약으로 받고 정확한 주소는 받지 않는다.
- 사용자 안내에는 거주지역이 관할 법원과 지역별 업무 처리 특성의 1차 확인, 담당 상담
  배정과 지역별 상담·캠페인 운영 분석에 쓰인다고 명시했다. 시·도 하나로 관할이
  확정되지는 않는다는 경계도 함께 표시했다.
- 상담 필수 동의 고지를 `2026-07-28.1`로 올리고 필수 수집 항목과 목적에 거주 시·도,
  담당 배정, 지역별 운영 분석을 반영했다. 정확한 주소·이름·상세 내용 없이도 빠른
  상담을 이용할 수 있고 광고성 정보 전송에는 쓰지 않는다는 안내를 유지했다.
- 거주 시·도는 별도 평문 DB 컬럼이나 attribution/outbox에 복제하지 않고 기존
  `consultation_requests.intake_*` AES-256-GCM 암호문 안에 저장한다. ERP gateway만
  복호화해 목록과 요청 상세에 표시하며, 이전 접수는 `지역 미기록`으로 호환한다.
- 향후 캠페인 분석은 권한 있는 내부 집계기가 request별 암호화 intake와 attribution을
  결합해 시·도×캠페인·키워드·랜딩 집계만 만들고 이름·전화·상담 원문은 분석 결과에
  넣지 않는 기준을 `PROJECT_PLAN.md`와 상담 계약 문서에 반영했다.
- core 계약 테스트 15개·gateway 테스트 4개, 전체 typecheck·ESLint·5개 패키지
  프로덕션 빌드가 통과했다. 실제 홈페이지 POST HTTP 201과 ERP 목록·상세의 대전 표시,
  고지 버전·광고 식별자를 확인하고 테스트 상담·요청·여정·귀속·outbox만 정리했다.
  DB 스키마는 기존 암호화 intake envelope를 그대로 사용하므로 새 마이그레이션이
  필요하지 않다.

### 2026-07-27 — 광고 유입 분석 자동 연결 전환
- 사용자 결정에 따라 상담 화면의 `방문 경로·광고 유입 정보 분석` 선택 동의 체크박스와
  분석 고지 UI를 제거했다. 모든 실제 상담 제출은 이제 가명 세션 ID, 최초 랜딩, 내부
  이동 최대 20개, CTA, referrer host와 strict 허용 목록의 AdPilot/platform click ID,
  UTM, campaign/ad group/keyword/creative 값을 자동으로 귀속한다.
- 이름·전화·자유서술·전체 URL 쿼리는 기존처럼 분석 데이터·이벤트에 넣지 않는다.
  `packages/core` 계약에서 attribution을 필수로 바꾸고, gateway는 요청·여정·귀속을
  하나의 트랜잭션으로 항상 저장한다.
- 마이그레이션 `0002_remove_attribution_consent.sql`을 로컬 `lawand_dev`에 적용했다.
  이제 `consultation_requests`의 분석 동의 버전·시각, `journey_sessions`의 분석 고지
  버전과 관련 DB 제약은 없다. 기존 `0001`은 이미 적용된 개발 DB의 이력을 보존한다.
- 분석 처리의 목적·항목·보유기간·처리 근거는 향후 전체 개인정보처리방침에 반영하고,
  공개 배포 전 책임 변호사·개인정보 담당자 검토가 필요하다.

### 2026-07-27 — 홈페이지 POST → 암호화 원장/outbox → ERP 목록·상세 수직 흐름
- `/bank/consultation`의 모의 제출을 실제 same-origin `/api/consultations` 제출로
  교체했다. 브라우저가 UUID idempotency key를 유지해 네트워크 재시도 시 같은 응답을
  받고, gateway가 발급한 `LA-YYMMDD-XXXXXXXX` 접수번호를 완료 화면에 표시한다.
- 상담 필수 동의는 v2(`2026-07-27.2`)로 갱신했다. 방문 경로·광고 유입 분석은 별도의
  선택 동의 v1로 분리해 거부해도 상담이 접수된다. 동의한 제출만 가명 세션 ID, 최초
  랜딩, 내부 이동 최대 20개, CTA, referrer host와 허용 목록의 AdPilot/platform click,
  UTM, campaign/ad group/keyword/creative 값을 저장한다. 이름·전화·자유서술은 분석
  정보와 이벤트에 넣지 않는다.
- gateway에 strict Zod 입력, 64KB body 제한, 전화 정규화, AES-256-GCM 인증 암호화,
  HMAC-SHA-256 전화·payload 지문, 전화 지문 advisory lock과 단일 PostgreSQL
  트랜잭션을 구현했다. 상담·요청·여정·귀속·초기 상태·outbox 중 하나라도 실패하면
  전체 rollback한다. GCM 인증 태그는 암호문 끝 16바이트에 붙이고 AAD로 테이블·필드·
  레코드 ID를 묶어 다른 레코드 컨텍스트에서 복호화되지 않게 했다.
- 신규, 동일 idempotency replay, 10분 동일 내용, 같은 세션 익명→실명 보강, 7일 내
  중복 의심을 영구 개발 DB에서 통합 검증했다. 결과는 각각 새 상담, row 없음,
  기존 상담 request 추가, 기존 상담 이름 보강, 새 상담+비교 후보였고 outbox 건수도
  `1/0/0/1/2` 규칙과 일치했다. 테스트용 4개 key의 상담·요청·여정·outbox만 트랜잭션으로
  정리해 개발 DB에 테스트 PII를 남기지 않았다.
- 마이그레이션 `0001_attribution_consent_and_landing_seed.sql`로 요청의 분석 동의
  버전·시각 필드와 현재 16개 랜딩의 stable page key/version v1을 추가했다. 로컬 DB의
  Drizzle 마이그레이션 2건, active 랜딩 16건을 확인했다.
- `apps/erp`는 서버 전용 내부 API 키로 gateway를 호출하며 최근 상담 50건 목록과 상세
  요청 이력을 표시한다. 상세에는 복호화된 연락·상담 내용, 중복 판정/비교 접수번호,
  랜딩 page key/version, CTA와 광고 식별자가 나온다. 브라우저에는 DB 비밀번호·암호화
  키·내부 API 키가 전달되지 않는다. 직원 인증·권한·PII 조회 감사 전에는 외부 배포하지
  않는다는 경계를 화면과 문서에 남겼다.
- `db:local:setup`이 기존 비밀번호를 유지하면서 암호화·HMAC·내부 API 키를 처음 한 번
  생성하고 gateway/ERP/homepage의 Git 제외 `.env.local`을 권한 600으로 쓴다. 비밀값은
  로그·문서·응답에 노출하지 않았다.
- 전체 typecheck·ESLint, core 14개·gateway 4개 테스트, 5개 패키지 프로덕션 빌드,
  홈페이지 프록시 HTTP 201/멱등 재시도 200, ERP 목록·상세 HTTP 200이 통과했다.
  gateway 3022와 ERP 3021 개발 서버를 유지했고 기존 홈페이지 3020도 계속 실행 중이다.
- Tailnet HTTPS의 same-origin POST도 선택 분석 동의 없이 HTTP 201로 접수되고
  attribution row를 만들지 않음을 확인한 뒤 해당 테스트 key만 정리했다. Windows
  computer-use는 기존 Chrome 창의 포커스를 허용하지 않아 자동 클릭 검수는 중단했으므로,
  실기기 화면에서의 마지막 제출 UX 확인은 사용자가 이어서 확인한다.
- 다음 출시 게이트는 실제 AdPilot 파라미터 별칭 확정, 상담/분석 고지와 전체
  개인정보처리방침 승인, ERP 직원 인증·역할 권한·PII 조회 감사로그, 공개 POST
  rate limit·봇 방어다. 이후에만 리걸프렌즈·Slack·AdPilot outbox 소비자를 연결한다.

### 2026-07-27 — 영구 로컬 개발 DB·최소권한 계정·초기 마이그레이션 적용
- WSL PostgreSQL 16의 `127.0.0.1:5432`에 지속 사용할 `lawand_dev` DB를 만들고
  `lawand_migrator`, `lawand_app`, `lawand_viewer` 세 LOGIN 역할을 생성했다. 세 역할은
  모두 superuser·createdb·createrole·replication 권한이 없다.
- `lawand_migrator`는 DB 소유와 Drizzle 마이그레이션, `lawand_app`은 public 테이블
  SELECT/INSERT/UPDATE/DELETE, `lawand_viewer`는 public 테이블 SELECT만 담당한다.
  viewer는 DB 접속 시 `default_transaction_read_only=on`이 적용되므로 DBeaver 확인 중
  실수로 데이터를 변경할 수 없다.
- `packages/db/migrations/0000_consultation_intake_v1.sql`을 영구 DB에 적용했다.
  public 스키마의 상담·요청·상태이력·랜딩·여정·귀속·outbox 8개 테이블과 Drizzle
  마이그레이션 이력 1건을 확인했다. 현재 업무 데이터는 0건이다.
- `scripts/setup-local-db.mjs`와 루트 `db:local:setup` 명령을 추가했다. 최초 실행은
  암호학적 난수 비밀번호와 역할·DB를 생성하고, 재실행은 Git 제외 파일의 같은 비밀번호를
  유지하면서 미적용 마이그레이션과 권한을 다시 맞춘다.
- 비밀번호·연결 문자열은 저장소 루트 `.env.development.local`에 보관하고, DBeaver에는
  viewer 정보만 담은 `.env.dbeaver.local`을 제공한다. 두 파일 모두 권한 600과
  `.gitignore` 적용을 확인했으며 비밀번호는 도구 출력이나 문서·인수인계 로그에 남기지
  않았다.
- Windows에서 `127.0.0.1:5432` TCP 연결이 가능함을 확인했다. DBeaver는 DB
  `lawand_dev`, 사용자 `lawand_viewer`, `.env.dbeaver.local`의 `PASSWORD`,
  SSL disable로 등록한다. IPv6 localhost 연결 경고를 피하기 위해 host는
  `127.0.0.1`을 사용한다.
- 다음 작업은 `LAWAND_APP_DATABASE_URL`을 gateway 실행 환경에 주입하고, 개인정보
  고지를 보정한 뒤 홈페이지 POST → 암호화·중복 판정·DB/outbox 트랜잭션 → ERP
  목록·상세의 3+4 수직 흐름을 구현하는 것이다.

### 2026-07-27 — 상담 접수·광고 귀속·이벤트 기반 v1 구현
- 모노레포 계획에 있던 `apps/erp`, `apps/gateway`, `packages/core`, `packages/db`를 실제로
  생성했다. ERP는 Next.js 16으로 로컬 3021, gateway는 장수명 Node 서버로 로컬 3022를
  사용한다. gateway `/health`와 ERP 첫 정적 화면을 프로덕션 빌드로 잠깐 실행해 둘 다
  HTTP 200을 확인했으며, 확인용 프로세스는 종료하고 기존 홈페이지 3020만 유지했다.
- `packages/core`에 애플리케이션 생성 UUIDv7 상담·요청·이벤트 ID와 한국 날짜 기준
  `LA-YYMMDD-XXXXXXXX` 표시용 접수번호를 구현했다. 표시용 접수번호는 인증값으로 쓰지
  않는다. 광고 귀속 입력은 내부 pathname, referrer host, AdPilot/platform click ID,
  UTM, campaign/ad group/keyword/creative ID와 입찰 키워드·매칭 유형만 strict Zod
  계약으로 허용한다.
- 중복 판정 순서를 코드로 고정했다. 같은 idempotency key는 기존 응답만 재생하고,
  같은 전화 HMAC와 payload HMAC의 10분 이내 이중 제출은 기존 상담에 요청 이력만 붙인다.
  같은 세션의 30분 이내 익명→실명 제출은 기존 상담을 보강해
  `consultation.request.updated`를 만들며, 같은 전화번호의 7일 이내 다른 제출은 자동
  병합하지 않고 새 상담과 `consultation.duplicate_suspected`를 만든다. 종결 상담은
  항상 새 상담으로 시작한다.
- `consultation.requested`, `consultation.request.updated`,
  `consultation.duplicate_suspected` v1 이벤트를 정의했다. 새 상담일 때만
  `consultation.requested`가 발생하며, 이벤트에는 전화·이름·상담 원문을 넣지 않고
  `intakeRef`와 `attributionRef`만 넣는다. strict 계약이 전화번호 같은 추가 필드를
  거부하는 테스트를 포함했다.
- PostgreSQL/Drizzle 초기 마이그레이션에 `consultations`, `consultation_requests`,
  `consultation_status_history`, `marketing_landing_pages`, `journey_sessions`,
  `journey_events`, `consultation_attributions`, `outbox_events` 8개 테이블을 만들었다.
  이름·전화·상담 원문은 AES-GCM 암호문·nonce·key version을, 비교값은 HMAC 지문을
  저장하는 경계다. 요청과 귀속의 상담 ID 일치, 암호 nonce·지문 길이, 연락 구간,
  outbox envelope를 DB 제약으로도 검사한다.
- 내용이 같은 광고 랜딩은 URL을 복제하지 않고 AdPilot click ID와 광고그룹·키워드 ID로
  구분한다. 페이지 내용이 실제로 달라지는 경우만 안정적 page key/version을 만들고,
  상담 제출 시점의 랜딩 버전·광고 출처·내부 이동·CTA를 request별 스냅샷으로 남긴다.
  중복 상담을 하나로 묶어도 각 제출의 광고 접점은 보존한다.
- 같은 전화번호의 동시 제출이 각각 신규 상담으로 판정되는 경쟁을 막도록 실제 POST
  트랜잭션에서 전화 HMAC 기반 PostgreSQL transaction advisory lock을 먼저 잡는 기준을
  확정했다. 외부 API·Slack·AdPilot 호출은 트랜잭션 밖의 outbox 워커가 담당한다.
- 기존 `sessionStorage` 전용 여정 기준은 실제 제출 시 가명 귀속정보를 DB에 저장하는
  방향으로 변경했다. 현재 홈페이지는 여전히 서버 전송을 하지 않는다. 실제 POST 연결
  전 분석·광고 귀속 목적, 항목, 보유기간과 거부/설정 방법을 사용자 고지·개인정보처리
  방침에 반영하고 책임 변호사·개인정보 담당자가 검토해야 한다.
- 상세 기준은 `docs/CONSULTATION_INTAKE_V1.md`, authoritative 상태는
  `PROJECT_PLAN.md` v0.5에 반영했다. Drizzle 스키마 check, 전체 typecheck·ESLint,
  core 계약 테스트 10개, gateway 테스트, core/db/gateway 빌드와 ERP Next 프로덕션
  빌드가 통과했다. 초기 SQL을 임시 PostgreSQL DB에 실제 적용해 8개 테이블과 48개
  제약·외래키 생성을 확인한 뒤 검증 DB를 제거했다.
- 다음 작업은 AdPilot의 실제 파라미터 이름을 확정하고, 개인정보 고지를 보정한 뒤
  홈페이지 상담 폼 POST → gateway 암호화·중복 판정·단일 DB/outbox 트랜잭션 → ERP
  상담 목록·상세까지 연결하는 3+4 수직 흐름이다. 리걸프렌즈·Slack·AdPilot 송신은
  아직 범위 밖이다.

### 2026-07-27 — iOS Chrome 상담 폼 hydration 경계 분리
- iOS Chrome·Edge가 폼 요소에 `__gchrome_uniqueid`를 hydration 전에 삽입하는 알려진
  동작이 개발 중 Fast Refresh나 복원 탭에서 다시 경고를 만들 수 있어 상담 폼 전체를
  `ssr: false` 동적 컴포넌트로 분리했다.
- `/bank/consultation`의 metadata, 공용 헤더·푸터는 기존처럼 서버 렌더링하고 검색
  색인이 필요 없는 상호작용 폼만 클라이언트에서 로드한다. 로딩 중에는 간단한 상태
  문구를 제공한다.
- 폼이 서버 HTML에 더 이상 포함되지 않으므로 개별 `input`·`select`·`textarea`의
  `suppressHydrationWarning`은 모두 제거했다. 이후 다른 실제 hydration 문제가 생기면
  다시 콘솔에서 드러난다.
- Tailnet HTTPS의 초기 HTML에 `input`·`select`·`textarea`가 0개임을 확인했다. iPhone
  Chrome 사용자 에이전트와 390×844 터치 뷰포트에서 빠른 상담, 개인정보 아코디언,
  동의와 3/3 검토 단계까지 진행했으며 콘솔 경고·오류와 가로 넘침이 없었다.
- `typecheck`, ESLint와 `git diff --check`가 통과했다.

### 2026-07-27 — 상담 개인정보 고지 모바일 아코디언 보정
- 연락처 단계의 긴 개인정보 고지를 기본 접힘 상태의 아코디언으로 바꿨다.
- 체크박스 옆에는 수집 목적, 필수 항목과 요청일로부터 1년 보관을 항상 보이는 한 줄
  요약으로 유지했다. 개인정보처리자, 선택 항목, 보존 예외, 거부 영향과 입력 주의는
  `수집·이용 내용 자세히 보기`를 눌러 확인한다.
- 네이티브 `details`·`summary`를 사용해 자바스크립트 없이 키보드와 보조기기에서도
  열고 닫을 수 있게 했다.

### 2026-07-27 — 상담 요청 개인정보 수집·이용 기준 확정
- `/bank/consultation` 연락처 단계에 개인정보처리자, 수집·이용 목적, 필수·선택
  수집 항목, 보유기간과 동의 거부 영향을 항상 보이는 형태로 반영했다. 개인정보처리자는
  법무법인 로앤이며 상담 요청 접수, 연락 일정 조율, 상담 준비·응대, 상담 이력과 중복
  요청 확인에만 이용하고 광고성 정보 전송에는 이용하지 않는다.
- 필수 항목은 휴대전화 번호와 연락 희망 시점, 선택 항목은 이름·호칭과 사용자가 상세
  경로에서 남기는 도움 분야·현재 단계·소득·채무·재산·면책 이력·자유서술로 구분했다.
  선택정보 없이도 빠른 상담 요청을 이용할 수 있다는 거부 영향을 함께 안내한다.
- 보유기간은 상담 요청일로부터 1년으로 정했다. 기간 경과 또는 목적 달성 후 지체 없이
  파기하고, 다른 법령에 보존 의무가 있는 정보만 해당 기간 동안 분리 보관한다. 위임계약
  체결 뒤 사건정보에는 별도 처리 기준을 적용한다.
- 주민등록번호·계좌번호·건강정보·범죄경력 등 민감정보와 제3자 개인정보를 입력하지
  않도록 경계를 추가했다. 방문 경로와 CTA 위치는 브라우저 `sessionStorage`에만 두고
  상담 접수정보에는 포함하지 않기로 했다.
- 첫 고지 버전은 `2026-07-27`로 고정했다. 실제 `consultation.requested` 이벤트에는
  이 고지 버전과 동의 시각을 함께 기록해야 한다.
- 전체 사이트 개인정보처리방침은 개인정보 보호책임자·권리행사 연락처, 배포 인프라와
  처리위탁사가 확정된 뒤 출시 전에 별도로 공개한다. 다음 순서는 상담 ID와 중복 접수
  기준 설계다.

### 2026-07-27 — iPhone 상담 페이지 hydration 경고 보정
- Tailscale HTTPS로 연 상담 페이지에서 iPhone이 표시한 hydration 속성 불일치 경고를
  보정했다. 루트 metadata의 `formatDetection`에서 전화번호·주소·이메일 자동 감지를
  꺼서 iOS가 React hydration 전에 서버 HTML에 감지 속성이나 링크를 삽입하지 않게 했다.
- Safari에서는 사라졌지만 iOS Chrome에서 남은 경고는 Chrome/Edge가 폼 컨트롤에
  `__gchrome_uniqueid`를 hydration 전에 삽입하는 확인된 브라우저 이슈에 대응했다.
  페이지 전체가 아니라 상담 폼의 `input`·`select`·`textarea`에만
  `suppressHydrationWarning`을 적용해 이 외의 실제 hydration 불일치는 계속 드러나게 했다.
- 시작 방식 선택 카드의 `button` 안에 있던 문단 요소를 설명용 `span`으로 교체해
  버튼의 HTML 콘텐츠 모델에 맞는 구조로 정리했다.
- Tailnet 주소에서 iPhone Safari 사용자 에이전트, 390×844 터치 뷰포트로 첫 카드를
  눌러 `1 / 3` 단계 전환을 확인했다. 콘솔 경고·오류는 없었고 `typecheck`와 ESLint도
  통과했다.

### 2026-07-27 — Tailscale 실기기 상담 폼 상호작용 보정
- Tailscale Serve의 내부 HTTPS 도메인에서 Next.js 개발 리소스가 출처 검사에 막혀
  상담 요청 화면의 클라이언트 상호작용이 동작하지 않을 수 있는 문제를 보정했다.
  `apps/homepage/next.config.ts`의 `allowedDevOrigins`에
  `desktopkchai.tail977311.ts.net`을 추가했다.
- 홈페이지 개발 서버를 3020 포트에서 재시작했고, Tailnet 도메인을 Origin으로 보낸
  개발 리소스 요청이 HTTP 200으로 허용되는 것을 확인했다. `typecheck`와 ESLint도
  통과했다.

### 2026-07-27 — 모바일 실기기 검수용 Tailscale Serve 연결
- 개발 환경 `desktopkchai`를 `legalflow.co.kr` Tailnet에 연결하고, 로컬 홈페이지
  개발 서버 `127.0.0.1:3020`을 Tailnet 내부 전용 HTTPS 프록시로 등록했다.
- 같은 Tailnet에 로그인한 기기에서
  `https://desktopkchai.tail977311.ts.net/bank`로 접속할 수 있다. 외부 공개용
  Tailscale Funnel은 사용하지 않았다.
- 등록 직후 해당 HTTPS 경로의 HTTP 200 응답을 확인했다. 개발 서버가 내려가면 주소는
  남아도 백엔드 응답은 실패한다. 중단이 필요하면 `sudo tailscale serve --https=443 off`를
  실행한다.

### 2026-07-27 — 상담 요청 UX 검토용 v1 구현
- `/bank/consultation`에 실제 저장·전송 없는 화면 검토용 상담 요청 흐름을 구현했다.
  첫 화면에서 `연락만 먼저 받고 싶어요`(약 30초)와 `상황을 미리 남기고 싶어요`
  (약 2~3분)를 선택하며, 빠른 경로는 연락 시간·연락처·확인만 거친다.
- 상세 경로는 한 화면에 한 질문씩 도움 분야, 연체 전 납부 위험부터 독촉·법원 문서·
  압류·집행까지의 현재 단계, 소득, 담보 없는 채무·담보부 채무 범위, 담보를 뺀
  순재산 범위, 과거 면책과 선택 자유서술을 받는다. 모든 핵심 선택 질문에 모름 또는
  해당 없음 경로를 두고 재산 하나로 개인회생 가능 여부를 단정하지 않았다.
- 연락 시점은 `가능한 빨리`와 `시간 선택`으로 나눴다. 시간 선택은 한국 시각 기준
  최소 30분 뒤부터 평일 08:00~19:00 사이의 30분 연락 구간을 동적으로 표시하며
  마지막 시작 구간은 18:30이다. 정각 예약이 아니라 선택한 구간 안에 연락하는
  방식이다. 빠른 연락은 운영시간 내 통상 10분을 안내하되 현재는 실제 SLA나 문자를
  실행하지 않는다.
- 이름·호칭은 선택이고 미입력 시 향후 `익명-YYMMDD-HHmm-난수` 표시 이름을 서버에서
  만들도록 설계했다. 휴대전화는 SMS 인증 없이 010 형식만 확인하며 제출 전·완료 화면에서
  전체 번호를 재확인한다. 개인정보 확정 고지는 실제 연동 전 남은 과제다.
- 최초 진입부터 상담 요청까지 내부 방문 경로를 브라우저 `sessionStorage`에 최대
  20개까지 순서대로 임시 보관한다. 연속 중복은 합치고 CTA를 누른 페이지·위치를 함께
  기록하며 쿼리 문자열·자유 입력·연락처는 여정 데이터에서 제외했다.
- 공용 헤더·모바일 메뉴·하단 고정 바·상담 섹션과 홈의 주요 CTA를 전용 상담 페이지로
  연결했다. 상담 페이지는 `noindex, nofollow`이며 sitemap에는 넣지 않았다.
- 390×844 모바일에서 빠른 3단계와 상세 10단계를 완료 화면까지 검증했고, 1440×1000
  첫 화면도 시각 검수했다. 두 뷰포트에 가로 넘침이 없고 `typecheck`와 ESLint가
  통과했다. 프로덕션 빌드도 생성됐다.
- 다음 단계는 UX 피드백 반영 후 개인정보 고지·보유기간, 상담 ID와 중복 기준,
  `consultation.requested` 계약, DB·outbox, ERP 담당자 배정 기준, 첫 연락 지연
  문자와 실제 SMS 채널을 함께 결정하는 것이다.

### 2026-07-26 — 회생·파산 비교 메뉴 위계 보정
- `/bank/compare`를 `후기·사례` 드롭다운에서 분리해 개인회생·개인파산 다음의 독립
  1차 메뉴로 옮겼다. 비교 페이지는 사회적 증거가 아니라 두 제도 사이의 선택을 돕는
  핵심 탐색 페이지라는 정보구조 원칙을 반영했다.
- 데스크톱에는 `제도 비교` 직접 링크, 모바일에는 설명이 포함된
  `개인회생·개인파산 비교` 직접 링크를 두었다. `후기·사례`에는 고객후기와
  사례로 이해하기만 남겼다.
- `PROJECT_PLAN.md`와 `docs/HOMEPAGE_BLUEPRINT_V1.md`에 같은 메뉴 위계를 반영했다.

### 2026-07-26 — 카테고리 허브와 그룹형 전역 메뉴 1차 개편
- `/bank/personal-rehabilitation`, `/bank/personal-bankruptcy`, `/bank/situations`
  카테고리 허브 3개를 구현했다. 개인회생은 신청자격·절차·필요서류·변제금,
  개인파산·면책은 신청자격·절차·필요서류, 상황별 안내는 독촉·압류·주식·코인 채무·
  자영업자 개인회생을 한곳에서 찾을 수 있게 구성했다.
- 기존 상세 canonical URL은 하나도 옮기지 않았다. 상세페이지의 시각적 breadcrumb와
  `BreadcrumbList` JSON-LD가 신규 허브를 실제 상위 페이지로 가리키도록 수정했다.
  홈의 개인회생·개인파산 제도 카드도 신청자격 상세가 아니라 각 허브로 연결했다.
- 전역 메뉴 데이터를 `site-chrome.tsx` 한곳에서 관리하도록 바꾸었다. 데스크톱은
  개인회생·개인파산·면책·상황별 안내·후기/사례를 한 단계만 펼치는 드롭다운으로,
  모바일은 카테고리별 아코디언으로 구현했다. 후기·사례 전용 허브는 실제 데이터가
  준비되기 전까지 만들지 않고 홈 섹션과 제도 비교 페이지로 연결한다.
- URL 깊이는 대부분 `/bank/카테고리/상세페이지`까지만 사용한다. 상황별 안내의
  긴급 문제·채무 원인·직업/소득 분류는 URL 디렉터리를 추가하지 않고 허브의 표시로
  관리하며, 개별 사례·법률용어처럼 고유 문서 컬렉션만 더 깊은 URL을 허용하는 기준을
  `docs/HOMEPAGE_BLUEPRINT_V1.md`와 SEO 이전 문서에 반영했다.
- 허브 공용 컴포넌트는 `CollectionPage`와 `BreadcrumbList` JSON-LD, self-canonical,
  카테고리 카드·시작점·교차 카테고리·상담 흐름을 제공한다. 개인회생·개인파산 허브는
  서울회생법원 공식 안내를 연결하고 상세 법률 근거와 예외는 기존 상세페이지에서
  확인하도록 범위를 구분했다.
- sitemap·README·PROJECT_PLAN을 갱신했다. 새 허브 3개와 메뉴에 노출된 내부 경로
  15개의 HTTP 200 응답을 확인했고, 프로덕션 빌드에서 전체 21개 정적 페이지가
  생성됐다.
- 390×844 모바일과 1440×1000 데스크톱에서 허브 3개 모두 가로 넘침과 빈 링크가 없고
  H1은 하나다. 모바일 메뉴는 화면 안에서 열리며, 데스크톱 메뉴는 키보드 Tab·Enter로
  열고 첫 허브 링크로 이동할 수 있음을 확인했다.
- 개인회생 허브 모바일 Lighthouse는 Performance 99, Accessibility 100,
  Best Practices 100, SEO 100(FCP 0.8s, LCP 2.1s, TBT 40ms, CLS 0)이고,
  `/bank` 홈은 메뉴 변경 후 99/100/100/100을 유지했다. `typecheck`, ESLint,
  Next 프로덕션 빌드와 `git diff --check`도 통과했다.
- 다음 우선순위는 상담 요청 폼과 `consultation.requested` 이벤트의 첫 수직
  흐름이다. 후기·사례 허브는 데이터 이관·승인 파이프라인 준비 후 구현한다.

### 2026-07-26 — 자영업자 개인회생 상황 랜딩페이지 구현
- `/bank/situations/self-employed`에 모바일 우선 검색 랜딩페이지를 구현했다.
  자영업자의 매출액을 곧바로 개인회생 소득이나 변제금으로 보지 않고, 계속적·반복적인
  영업소득 가능성, 전체 매출에서 필요한 영업비용을 구분한 순소득, 사업재산과
  변제계획 수행 가능성을 네 가지 판단 축으로 구성했다.
- 채무자회생법 제579조·제589조·제614조와 대한민국 법원 개인회생 안내를 기준으로
  영업소득자의 법적 의미, 가용소득에서 공제되는 영업의 경영·보존·계속에 필요한 비용,
  신청 첨부자료와 변제계획 인가요건을 설명했다. 자영업자라는 직업명이나 사업자등록증
  하나로 신청 가능 여부가 정해지는 것처럼 안내하지 않았다.
- 서울회생법원 회생위원 직무편람 제5판을 반영해 세무·회계자료, 카드·현금·플랫폼
  정산과 사업계좌, 실제 영업비용을 같은 기간으로 대조하도록 했다. 최근 1년의
  영업소득을 기초로 보는 서울 실무를 전국 법원의 고정 제출기간으로 일반화하지 않았고,
  업종별 경비율이나 매출의 일정 비율로 순소득·변제금을 단정하지 않았다.
- 사업 유지·신규 개업·폐업·가족 공동운영을 나누고 임차보증금, 시설·비품·차량,
  재고, 외상매출금과 프랜차이즈 보증금 등 사업재산을 확인하도록 했다. 사업채무,
  국세·지방세·사회보험료 체납과 최근 처분도 준비자료에 포함했다.
- 현금매출 누락, 비용 임의 작성과 사업재산 이전을 하지 않도록 안내하고, 상담 초기에는
  계좌 원본이나 직원·고객의 개인정보를 보내지 않도록 보호 문구를 넣었다.
- 공용 모바일 메뉴와 개인회생 신청자격·변제금·필요서류 페이지에서 신규 페이지를
  연결하고 sitemap·README·프로젝트 상태·SEO 이전 문서를 갱신했다.
- 390×844 모바일 전체 화면과 1440×1000 데스크톱을 시각 검수했고 두 뷰포트 모두
  가로 넘침이 없다. 모바일 Lighthouse는 Performance 100, Accessibility 100,
  Best Practices 100, SEO 100(FCP 1.0s, LCP 1.7s, TBT 50ms, CLS 0)이다.
  `typecheck`, ESLint, Next 프로덕션 빌드도 통과했다.
- 출시 전 책임 변호사의 법률·광고 카피 검토는 유지한다. 다음 우선순위는 상담 요청
  폼과 `consultation.requested` 이벤트의 첫 수직 흐름이다.

### 2026-07-26 — 주식·코인 채무 상황 랜딩페이지 구현
- `/bank/situations/investment-debt`에 모바일 우선 검색 랜딩페이지를 구현했다.
  투자 채무라는 원인만으로 회생·파산 가능 여부를 단정하지 않고 현재 소득·전체 채무,
  대출 실행부터 증권·거래소 입금, 매매·출금과 현재 잔고까지의 자금 흐름을 네 가지
  판단 축으로 구성했다.
- 개인회생은 채무자회생법 제579조·제589조·제614조를 기준으로 계속적인 소득 가능성,
  채무 한도, 가용소득·청산가치와 변제계획 수행 가능성을 설명했다. 투자 채무도 원인만으로
  신청대상에서 제외되지는 않지만 일반 개시·인가요건을 충족해야 한다는 경계를 유지했다.
- 서울회생법원 회생위원 직무편람 제5판과 실무준칙 제408호를 반영해 주식·가상자산
  투자 손실금은 청산가치 산정에서 원칙적으로 고려하지 않는 기준을 안내했다. 실제 남은
  자산·매도대금은 별도 재산이고 재산 은닉은 예외이며, 서울회생법원 기준을 전국 법원의
  동일한 자동 감면 결과로 일반화하지 않았다.
- 개인파산은 채무자회생법 제564조를 기준으로 투기 목적의 거래가 과다하고 재산을
  현저히 감소시키거나 과대한 채무를 부담하게 한 경우 면책불허가 사유가 될 수 있음을
  설명했다. 거래 사실만으로 자동 불허되지 않으며 법원이 여러 사정을 고려하는
  재량면책도 별도 심사라는 점을 구분했다.
- 대출·증권·국내외 거래소·개인지갑·디파이·매도 후 사용처와 투자사기 자료를
  준비 항목으로 나누고, 계정 삭제·거래내역 훼손·재산 이전을 하지 않도록 안내했다.
  시드 문구·개인키·비밀번호·API 비밀키는 상담 과정에서도 보내지 않는 개인정보
  보호 문구를 넣었다.
- 공용 모바일 메뉴, 개인회생·개인파산 신청자격 페이지에서 신규 페이지를 연결하고
  sitemap·README·프로젝트 상태·SEO 이전 문서를 갱신했다.
- 390×844 모바일 전체 화면과 1440×1000 데스크톱을 시각 검수했고 두 뷰포트 모두
  가로 넘침이 없다. 모바일 Lighthouse는 Performance 100, Accessibility 100,
  Best Practices 100, SEO 100(FCP 1.0s, LCP 1.7s, TBT 40ms, CLS 0)이다.
  `typecheck`, ESLint, Next 프로덕션 빌드와 `git diff --check`도 통과했다.
- 출시 전 책임 변호사의 법률·광고 카피 검토는 유지한다. 다음 검색상황 랜딩 후보는
  자영업자 개인회생이다.

### 2026-07-26 — 독촉·압류 대응 상황 랜딩페이지 구현
- `/bank/situations/collection-and-seizure`에 모바일 우선 검색 랜딩페이지를
  구현했다. 전화·문자 독촉, 지급명령, 소장·이행권고·조정 문서, 가압류,
  통장·급여 압류와 부동산 경매·체납처분을 서로 다른 단계로 나누었다.
- 민사소송법 제468조부터 제472조에 따라 지급명령 송달일부터 2주 이내의
  이의신청 기준을 설명하되, 이를 다른 법원 문서의 공통기한처럼 적용하지 않았다.
  발신기관·문서명·송달일·사건번호·대상 채권과 재산을 먼저 확인하는 즉시
  체크리스트를 구성했다.
- 채권추심법 제8조의3·제9조, 개인채무자보호법 제16조부터 제19조를 기준으로
  관계인 연락, 폭행·협박과 반복·야간 연락, 개인금융채권의 7일 7회 제한,
  연락 유예와 유형 제한 요청을 안내했다. 개인채무자보호법의 적용 범위와 법원의
  적법한 송달·집행은 일반 추심 연락과 구분했다.
- 2026년 2월 시행 민사집행법 제246조의2와 시행령을 반영해 한 사람당 하나의
  생계비계좌와 250만원 기준을 안내하되, 기존 일반계좌 압류가 자동 해제되는
  것처럼 쓰지 않았다. 급여·연금 등 압류금지채권도 실제 결정문과 입금 출처를
  확인하도록 했다.
- 채무자회생법 제593조·제600조·제348조를 기준으로 개인회생·파산 신청 접수만으로
  모든 독촉·압류가 자동 정지되지 않으며, 중지·금지명령·개시결정·파산선고의
  주문과 대상 채권·재산을 각각 확인해야 한다는 경계를 반영했다.
- `/bank` 긴급 상황 카드, 공용 모바일 메뉴와 개인회생·개인파산 절차 페이지에서
  신규 페이지를 연결하고 sitemap·README·프로젝트 상태·SEO 이전 문서를 갱신했다.
- 390×844 모바일 전체 화면과 1440×1000 데스크톱을 시각 검수했고 두 뷰포트 모두
  가로 넘침이 없다. 모바일 Lighthouse는 Performance 99, Accessibility 100,
  Best Practices 100, SEO 100(FCP 0.9s, LCP 2.2s, TBT 40ms, CLS 0)이다.
  `typecheck`, ESLint, Next 프로덕션 빌드와 `git diff --check`도 통과했다.
- 출시 전 책임 변호사의 법률·광고 카피 검토는 유지한다. 다음 검색상황 랜딩
  후보는 주식·코인 채무 또는 자영업자 개인회생이다.

### 2026-07-26 — 개인파산 필요서류 랜딩페이지 구현
- `/bank/personal-bankruptcy/documents`에 모바일 우선 검색 랜딩페이지를 구현했다.
  파산 및 면책 신청서, 진술서, 채권자목록, 재산목록, 현재의 생활상황, 수입 및
  지출에 관한 목록을 여섯 표준 작성서류로 설명했다.
- 현행 채무자회생법 제302조, 채무자 회생 및 파산에 관한 규칙 제72조와
  `개인파산 및 면책신청사건의 처리에 관한 예규` 제1조의2를 기준으로 작성했다.
  예규의 표준 자료제출목록 외에도 관할 법원이 자료 일부를 면제하거나 법원별 목록과
  사건별 추가자료를 요구할 수 있다는 범위를 반영했다.
- 신분·가족·주거, 급여·연금·공적급여, 사업·프리랜서·폐업, 계좌·보험·증권·
  가상자산, 부동산·차량·보증금, 채무·세금·소송, 최근 처분·송금·일부 변제,
  과거 채무조정·도산절차를 상황별 소명자료로 나누었다.
- 신청서와 동시에 법정 첨부서류를 내지 못하면 사유를 소명하고 지체 없이 제출해야
  한다는 기준, 접수 후 보정과 파산관재인의 추가 자료 요구가 이어질 수 있다는 점을
  FAQ와 준비 순서에 반영했다. 모든 서류에 같은 발급기간·원본 기준을 적용하지 않았고,
  주민등록번호·계좌·가족정보의 안전한 전송 주의도 넣었다.
- 개인파산 신청자격·절차 페이지와 공용 모바일 메뉴에서 신규 페이지로 연결하고
  sitemap·README·프로젝트 상태·SEO 이전 문서를 갱신했다.
- 390×844 모바일 전체 화면과 1440×1000 데스크톱을 시각 검수했고 두 뷰포트 모두
  가로 넘침이 없다. 모바일 Lighthouse는 Performance 99, Accessibility 100,
  Best Practices 100, SEO 100(FCP 0.9s, LCP 2.2s, TBT 40ms, CLS 0)이다.
  `typecheck`, ESLint, Next 프로덕션 빌드와 `git diff --check`도 통과했다.
- 출시 전 책임 변호사의 법률·광고 카피 검토는 유지한다. 다음 검색 랜딩 후보는
  독촉·압류 상황 페이지다.

### 2026-07-26 — 개인파산 절차·기간 랜딩페이지 구현
- `/bank/personal-bankruptcy/process`에 모바일 우선 검색 랜딩페이지를 구현했다.
  파산·면책 신청, 접수 후 심사·보정·예납, 파산선고와 관재인 선임, 재산·채무 조사,
  환가·배당 후 종결 또는 재산 부족 등에 따른 폐지, 면책심사와 결정 확정까지를
  일곱 단계로 설명했다.
- 현행 채무자회생법 제305조·제312조·제556조·제564조부터 제566조와 서울회생법원
  개인파산·면책 안내를 기준으로 작성했다. 개인이 파산을 신청하면 반대 의사표시가
  없는 한 면책도 함께 신청한 것으로 보는 기준, 파산선고와 함께하는 관재인 선임,
  면책결정은 확정된 뒤 효력이 생기는 점을 반영했다.
- 파산선고는 재산 정리의 시작이고 파산절차 종결·폐지는 그 재산 정리의 종료이며,
  남은 채무 책임은 별도 면책결정에서 판단한다는 차이를 독립 섹션으로 구성했다.
  신청만으로 독촉·압류가 모두 자동 중지되거나 환가할 재산이 없다는 이유만으로
  바로 면책되는 것처럼 안내하지 않았다.
- 고정 완료기간을 제시하지 않고 보정·예납, 최근 거래 조사, 환가할 재산과
  권리관계, 채권자 이의·면책 쟁점을 기간 변수로 설명했다. 법원·관재인 문서의
  제출기한과 기일, 연락처 변경과 새로 발견한 채권·재산을 확인하는 체크리스트와
  FAQ를 넣었다.
- 개인파산 신청자격 페이지와 공용 모바일 메뉴에서 신규 페이지로 연결하고
  sitemap·README·프로젝트 상태·SEO 이전 문서를 갱신했다.
- 390×844 모바일 전체 화면과 1440×1000 데스크톱을 시각 검수했고 두 뷰포트 모두
  가로 넘침이 없다. 모바일 Lighthouse는 Performance 100, Accessibility 100,
  Best Practices 100, SEO 100(FCP 1.0s, LCP 1.7s, TBT 40ms, CLS 0)이다.
  `typecheck`, ESLint, Next 프로덕션 빌드와 `git diff --check`도 통과했다.
- 출시 전 책임 변호사의 법률·광고 카피 검토는 유지한다. 다음 검색 랜딩 구현
  우선순위는 개인파산 필요서류 페이지다.

### 2026-07-26 — 개인회생 변제금 랜딩페이지 구현
- `/bank/personal-rehabilitation/repayment`에 모바일 우선 검색 랜딩페이지를
  구현했다. 채무액의 고정 비율이나 단순 계산값을 제시하지 않고 예상 소득, 법정
  공제, 법원이 정하는 생계비, 필요한 영업비용으로 구성되는 가용소득을 출발점으로
  설명했다.
- 현행 채무자회생법 제579조·제611조·제614조와 서울회생법원 개인회생 안내를
  기준으로 청산가치 보장, 변제기간 원칙 3년·특별한 사정이 있으면 5년 이내,
  계획의 공정·형평성과 수행 가능성을 함께 반영했다. 채권자 또는 회생위원이 이의를
  진술한 경우 변제기간 동안의 가용소득 전부 제공이 추가 인가요건이 된다는 범위도
  구분했다.
- 급여·상여 변동, 사업·프리랜서 소득, 실제 부양관계, 주거비·의료비, 재산과
  세금·담보채무 등 상황별 변수를 설명하고 소득 → 공제·생계비 → 재산·채권 →
  기간 전체의 수행 가능성 순서로 예상액을 검토하도록 구성했다. 온라인 예상값이
  법원이 인가한 변제금이 아니라는 안내와 FAQ를 넣었다.
- 개인회생 신청자격·절차·필요서류 페이지와 공용 모바일 메뉴에서 신규 페이지로
  연결하고 sitemap·README·프로젝트 상태·SEO 이전 문서를 갱신했다. 결정형
  변제금 계산기는 책임 변호사의 광고 규정 검토 전까지 공개하지 않는다.
- 390×844 모바일 전체 화면과 1440×1000 데스크톱을 시각 검수했고 두 뷰포트 모두
  가로 넘침이 없다. 모바일 Lighthouse는 Performance 99, Accessibility 100,
  Best Practices 100, SEO 100(FCP 0.9s, LCP 2.2s, TBT 40ms, CLS 0)이다.
  `typecheck`, ESLint, Next 프로덕션 빌드와 `git diff --check`도 통과했다.
- 출시 전 책임 변호사의 법률·광고 카피 검토는 유지한다. 다음 검색 랜딩 구현
  우선순위는 개인파산 절차 페이지이며, 그다음은 개인파산 필요서류 페이지다.

### 2026-07-26 — 개인회생 필요서류 랜딩페이지 구현
- `/bank/personal-rehabilitation/documents`에 모바일 우선 검색 랜딩페이지를
  구현했다. 신청서·진술서, 채권자목록, 재산목록, 소득 및 지출 목록, 소득 증빙,
  변제계획안을 여섯 축으로 설명하고 상황별 증빙, 준비·보정 순서와 FAQ를 연결했다.
- 현행 채무자회생법 제589조, 대한민국 법원 개인회생 안내와 서울회생법원 최신
  민원서식을 기준으로 기본 첨부서류를 확인했다. 실제 증빙은 소득 형태·재산·가족·
  과거 절차와 관할 법원에 따라 달라질 수 있어 모든 신청자에게 같은 고정 목록이
  적용되는 것처럼 쓰지 않았다.
- 급여·사업·프리랜서 소득, 가족·주거, 부동산·차량·보증금, 예금·보험·퇴직금,
  세금·보증·과거 절차 자료를 상황별로 구분했다. 변제계획안의 원칙상 신청일부터
  14일 이내 제출 기준, 개시 전 채권자목록 수정 가능성과 보정기한 확인도 FAQ에
  반영했다.
- 주민등록번호·계좌번호·가족정보가 든 원본을 상담 초기에 일반 이메일·메신저로
  보내지 않도록 개인정보 안내를 넣었다. 개인회생 신청자격·절차 페이지와 공용
  모바일 메뉴에서 신규 페이지로 연결하고 sitemap·README·프로젝트 상태·SEO 이전
  문서를 갱신했다.
- 390×844 모바일 전체 화면과 1440×1000 데스크톱을 시각 검수했고 두 뷰포트 모두
  가로 넘침이 없다. 모바일 Lighthouse는 Performance 99, Accessibility 100,
  Best Practices 100, SEO 100(FCP 0.9s, LCP 2.2s, TBT 40ms, CLS 0)이다.
  `typecheck`, ESLint, Next 프로덕션 빌드도 통과했다.
- 출시 전 책임 변호사의 법률·광고 카피 검토는 유지한다. 다음 검색 랜딩 구현
  우선순위는 `/bank/personal-rehabilitation/repayment` 개인회생 변제금이며,
  그다음은 개인파산 절차 페이지다.

### 2026-07-26 — 개인파산 신청자격 랜딩페이지 구현
- `/bank/personal-bankruptcy/eligibility`에 모바일 우선 검색 랜딩페이지를 구현했다.
  지급불능, 소득·가용소득, 재산과 최근 처분, 별도의 면책 심사를 네 가지 판단 축으로
  구성하고 파산신청·파산선고·면책심사·면책확정의 차이, 상담 전 체크리스트와 FAQ를
  한 흐름으로 연결했다.
- 현행 채무자회생법, 서울회생법원 개인파산 안내, 대법원 2008마1904·1905 결정을
  기준으로 지급불능을 채무를 일반적·계속적으로 변제할 수 없는 객관적 상태로
  설명했다. 소득 유무나 단순 부채초과로 자동 판단하지 않고 재산·신용·장래 소득·
  생계비·조세와 가용소득을 종합해 본다는 기준을 반영했다.
- 개인파산에는 개인회생과 같은 채무 총액 한도가 없지만 금액만으로 자격이 정해지지
  않는다고 안내했다. 파산선고만으로 면책되지 않으며 면책불허가 사유와 조세·벌금·
  일부 손해배상·양육비 등 비면책채권을 별도로 확인해야 한다는 경계를 유지했다.
  과거 개인파산 면책 확정일부터 7년, 개인회생 면책 확정일부터 5년 기준도 FAQ에
  반영했다.
- `/bank`의 개인파산 검색의도 카드·비교 카드, 공용 데스크톱·모바일 메뉴,
  `/bank/compare`의 개인파산 관련 링크를 신규 페이지로 연결하고 sitemap·README·
  프로젝트 상태·SEO 이전 문서를 갱신했다.
- 390×844 모바일 전체 화면과 1440×1000 데스크톱을 시각 검수했고 두 뷰포트 모두
  가로 넘침이 없다. 모바일 Lighthouse는 Performance 99, Accessibility 100,
  Best Practices 100, SEO 100(FCP 0.8s, LCP 2.1s, TBT 60ms, CLS 0)이다.
  `typecheck`, ESLint, Next 프로덕션 빌드도 통과했다.
- 출시 전 책임 변호사의 법률·광고 카피 검토는 유지한다. 다음 검색 랜딩 구현
  우선순위는 `/bank/personal-rehabilitation/documents` 개인회생 필요서류다.

### 2026-07-26 — 개인회생 절차·기간 랜딩페이지 구현
- `/bank/personal-rehabilitation/process`에 모바일 우선 검색 랜딩페이지를 구현했다.
  신청 준비·법원 심사·개시결정·채권 확인과 집회·인가·변제 수행·면책의 7단계,
  기간이 달라지는 요인, 개시·인가·면책의 차이, 진행 중 체크리스트와 FAQ를 한
  흐름으로 구성했다.
- 현행 채무자회생법과 서울회생법원 안내를 기준으로 변제계획안의 신청일부터 14일
  이내 제출, 개시 여부의 원칙상 1개월 이내 결정, 변제기간 원칙 3년·특별한 사정이
  있으면 5년 이내라는 기준을 반영했다. 법정 기한과 실제 소요기간은 구분했고
  보정·송달·채권 이의 등에 따라 진행 시점이 달라질 수 있음을 명시했다.
- 신청만으로 독촉·압류가 모두 자동 중단되거나 개시결정으로 면책되는 것처럼 쓰지
  않았다. 인가 전에도 변제계획안의 변제개시일부터 적립이 필요할 수 있다는
  서울회생법원 안내와 변제 완료 뒤 별도 면책결정 확인이 필요하다는 점을 담았다.
- `/bank`의 긴급 절차 검색의도 카드, 개인회생 신청자격의 관련 문서, 모바일 메뉴를
  신규 페이지로 연결하고 sitemap·README·프로젝트 상태·SEO 이전 문서를 갱신했다.
- 390×844 모바일 전체 화면과 1440×1000 데스크톱을 시각 검수했고 두 뷰포트 모두
  가로 넘침이 없다. 모바일 Lighthouse는 Performance 99, Accessibility 100,
  Best Practices 100, SEO 100(FCP 0.9s, LCP 2.2s, TBT 40ms, CLS 0)이다.
  `typecheck`, ESLint, Next 프로덕션 빌드도 통과했다.
- 출시 전 책임 변호사의 법률·광고 카피 검토는 유지한다. 다음 검색 랜딩 구현
  우선순위는 `/bank/personal-bankruptcy/eligibility` 개인파산 신청자격, 그다음
  `/bank/personal-rehabilitation/documents` 개인회생 필요서류다.

### 2026-07-26 — 개인회생·개인파산 비교 랜딩페이지 구현
- `/bank/compare`에 모바일 우선 검색 랜딩페이지를 구현했다. 첫 화면의 직접 답변,
  신청 상태·변제 재원·소득·재산·채무 한도·면책의 6개 비교축, 예외 상황, 상담 전
  정리 순서, FAQ와 공식 근거를 한 흐름으로 구성했다.
- “소득이 있으면 회생, 없으면 파산”처럼 자동 분류하지 않았다. 대법원
  2008마1904·1905 결정과 서울회생법원 안내를 기준으로 소득이 있더라도 생계비 등을
  뺀 가용소득과 변제 가능성을 구체적으로 봐야 한다는 점을 반영했다.
- 개인회생은 장래 소득을 주된 변제 재원으로 삼고 청산가치를 보장하는 구조,
  개인파산은 파산재단을 환가·배당한 뒤 별도로 면책을 심사하는 구조로 구분했다.
  감면율·결과 보장·자동 추천은 넣지 않았고 출시 전 책임 변호사 검토를 유지했다.
- `/bank` 검색의도 카드, 공용 헤더·모바일 메뉴, 개인회생 신청자격 관련 문서에서
  기존 비교 앵커를 신규 페이지로 연결하고 sitemap·README·프로젝트 상태 문서를
  갱신했다.
- 390×844 모바일 전체 화면과 주요 섹션, 1440×1000 데스크톱을 시각 검수했다. 모바일
  Lighthouse는 Performance 99, Accessibility 100, Best Practices 100, SEO 100
  (FCP 0.9s, LCP 2.2s, TBT 40ms, CLS 0)이다. `typecheck`, ESLint, Next 프로덕션
  빌드도 통과했다.
- 다음 검색 랜딩 구현 우선순위는 `/bank/personal-rehabilitation/process` 개인회생
  절차·기간, 그다음 `/bank/personal-bankruptcy/eligibility` 개인파산 신청자격이다.

### 2026-07-26 — Lighthouse 로컬 도구 고정과 신규 페이지 성능 측정
- `@lawand/homepage` 개발 의존성에 Lighthouse 13.4.1을 정확한 버전으로 추가하고
  `pnpm lighthouse` 실행 스크립트를 만들었다. 설치 내용은 `pnpm-lock.yaml`에 고정했다.
- 프로덕션 빌드를 별도 포트로 실행한 뒤 모바일 기본 설정으로 `/bank`와
  `/bank/personal-rehabilitation/eligibility`를 측정했다. `/bank`는 Performance 100,
  Accessibility 100, Best Practices 100, SEO 100(FCP 0.8s, LCP 1.6s, TBT 60ms,
  CLS 0), 신청자격 페이지는 99/100/100/100(FCP 0.8s, LCP 2.0s, TBT 40ms,
  CLS 0)이다.
- 현재 WSL에서는 기본 Chrome 실행 시 DevTools 연결이 거절될 수 있다. Linux용
  Playwright Chrome을 `CHROME_PATH`로 지정하고 `TEMP=/tmp`와 리눅스
  `--user-data-dir`를 주면 정상 측정된다. 재현 명령은 루트 `README.md`에 기록했다.

### 2026-07-26 — 개인회생 신청자격 랜딩페이지 구현
- `/bank/personal-rehabilitation/eligibility`에 모바일 우선 검색 랜딩페이지를
  구현했다. 첫 화면의 직접 답변, 신청 전 네 가지 기본 요건, 소득·가용소득·청산가치
  설명, 상담 전 체크리스트, FAQ, 공식 근거와 검토 정보를 한 흐름으로 구성했다.
- 2026-07-26 현행 `채무자 회생 및 파산에 관한 법률`, 서울회생법원·대한민국 법원
  안내를 기준으로 변제 곤란 상태 또는 그 우려, 계속·반복할 소득, 담보부 15억 원·
  그 밖의 채무 10억 원 이하, 면책확정일부터 5년 요건을 교차 확인했다.
- 자동 가능성 판정이나 결과 암시는 넣지 않았다. 직업 형태·재산 보유·연체 전 여부·
  주식·코인·도박 채무는 하나만으로 결론 내리지 않도록 FAQ에서 적용 쟁점을 설명했다.
- 헤더·상담 CTA·푸터·모바일 고정 상담 바를
  `app/bank/_components/site-chrome.tsx`로 공용화하고 `/bank`의 첫 개인회생 링크를 새
  랜딩으로 연결했다. sitemap, canonical, Open Graph, Article·FAQ·Breadcrumb JSON-LD도
  반영했다.
- `typecheck`, ESLint, Next 프로덕션 빌드가 모두 통과했다. 390×844 모바일,
  1440×1000 데스크톱과 장문 전체 화면을 Chrome으로 시각 검수했고 기존 `/bank` 첫
  화면도 회귀 확인했다. 이 환경에는 Lighthouse가 없어 점수는 측정하지 않았다.
- 출시 전 책임 변호사의 법률·광고 카피 검토와 기존
  `/bank/revival_qualificationtoapplyrevival/`의 검색 성과 확인 후 유지 또는 단일 301
  결정이 필요하다. 다음 구현 우선순위는 상담 요청 폼과 `consultation.requested`
  이벤트의 첫 수직 흐름이다.

### 2026-07-26 — `/bank` 카피 전면 정비와 용어 통일
- `/bank` 전 섹션의 한국어 카피를 자연스러운 문장으로 다시 썼다. `~조건부터` 반복과
  `차분히` 중복을 없애고, 검색의도 카드는 사용자가 실제로 검색하는 질문형
  (`개인회생이 맞을까`, `두 제도는 뭐가 다를까`)으로 바꿨다.
- 법률용어 명사구(`앞으로 얻을 수입의 계속성`, `현재의 지급불능 상태`)를 사용자가
  스스로 묻는 문장으로 풀었다. 제도 설명 본문의 법적 정확성과 결과의 주체(법원이
  판단한다)는 유지했고, 사례·후기의 면책 고지 문구는 그대로 뒀다.
- 헤드라인을 `빚의 크기보다, 지금의 조건부터 봅니다.`에서
  **`채무 금액보다, 지금의 조건이 먼저입니다.`**로 변경했다(사용자 승인).
- **용어를 `채무`·`소득`으로 통일**했다. 본문 카피에서 `빚`·`수입`을 쓰지 않는다.
  고객후기 원문은 예외로 표현을 고치지 않는다.
- 보조 CTA는 `사람에게 상담 요청` → `바로 상담 요청하기`. "AI가 아니라 사람"이라는
  의도는 `about` 섹션의 `사람이 책임지는 판단`이 담당한다.
- 대한변협 광고 규칙 금지어(`무조건`·`즉시 해결`·`성공`·`최대 탕감` 등)와 결과 암시
  표현은 넣지 않았다. 출시 전 책임 변호사 카피 심사는 그대로 남아 있다.
- `docs/HOMEPAGE_BLUEPRINT_V1.md` 8-3에 확정 헤드라인·버튼 문구와 용어 규칙을 반영했다.
- `typecheck`, ESLint, Next 프로덕션 빌드가 모두 통과했다. 시각 검수와 Lighthouse는
  이번 변경에서 다시 측정하지 않았다(텍스트 변경이나 일부 헤딩 길이가 바뀌었으므로
  다음 세션에서 모바일 줄바꿈을 한 번 확인할 것).
- 다음 작업은 상담 요청 폼과 `consultation.requested` 이벤트의 첫 수직 흐름이다.
  (`packages/core` 이벤트 카탈로그 + `packages/db` 스키마 + `/bank/consultation`)

### 2026-07-25 — `/bank` 색상 위계 보정
- 시각 정체성을 아이보리·잉크 중심으로 확정하고 그린은 버튼·링크·체크·상태표시 같은
  신호색으로 제한했다.
- 히어로의 그린 기운을 중립 아이보리·스톤 그라데이션으로 낮추고, 비교·후기·상담의
  넓은 짙은 면을 포레스트 그린에서 잉크·차콜로 변경했다.
- 디자인 토큰과 `docs/HOMEPAGE_BLUEPRINT_V1.md`, `PROJECT_PLAN.md`를 함께 갱신했다.
- 모바일 Lighthouse는 변경 후에도 Performance 99, Accessibility 100, Best Practices
  100, SEO 100(LCP 2.1s, CLS 0)을 유지했다.
- 다음 단계는 기존대로 개인회생 신청자격 검색 랜딩페이지 구현이다.

### 2026-07-25 — 모노레포·홈페이지 스캐폴딩과 `/bank` 첫 화면 구현
- pnpm 11.17.0 + Turborepo, Next.js 16.2.11, React 19.2.8, TypeScript 6.0.3,
  Tailwind CSS 4.3.3으로 `apps/homepage`를 스캐폴딩했다.
- `/bank`에 모바일 우선 헤더·히어로·검색의도 카드·회생/파산 비교·상담 전 확인 순서·
  공개 사례·기존 고객후기 샘플·로앤 원칙·상담 CTA·사무소 푸터를 구현했다.
- `/`는 `/bank`로 이동하며 `robots.txt`, `sitemap.xml`, canonical metadata,
  `WebSite`/`LegalService` JSON-LD를 추가했다. 자사 후기 별점 스키마는 넣지 않았다.
- 390×844 모바일과 1440×1000 데스크톱을 Chrome으로 시각 검수했다. `typecheck`,
  ESLint, Next 프로덕션 빌드가 모두 통과했다. 프로덕션 모바일 Lighthouse는
  Performance 99, Accessibility 100, Best Practices 100, SEO 100(LCP 2.1s, CLS 0)이다.
- 기존 홈페이지 본문은 복사하지 않고 공식 1차 자료를 기준으로 새로 작성한다. 전체 URL
  대응표는 선행 조건에서 제외하고 출시 전 검색 가치가 있는 핵심 URL만 최소 보호한다.
- 생성·실행 방법은 루트 `README.md`에 기록했다. 시스템 `/usr/bin` 쓰기 권한이 없는
  현재 WSL에서는 Corepack과 로컬 shim을 사용한다.
- 다음 구현 페이지는 `/bank/personal-rehabilitation/eligibility`이며, 그다음 상담 요청
  폼과 `consultation.requested` 이벤트를 연결한다.

### 2026-07-25 — 도메인·홈페이지 역할·SEO 콘텐츠 이전 방향 확정
- 정식 도메인은 기존 검색 자산이 있는 `lawandfirm.com` 유지로 확정했다.
- 홈페이지는 계약 전 정보 탐색·후기·사례·상담 전환에 집중한다. 홈페이지 회원가입과
  자체 고객 포털은 초기 범위에서 제외하고 계약 후 사건 공유는 리걸프렌즈가 담당한다.
- 기존 개인회생·파산 고객후기는 전량 이관한다. 현행 게시판은 관찰상 337페이지,
  약 3,361개이며 DB export를 원천으로 PII·삭제 상태·원문 해시를 검증해야 한다.
- 내부 사건 요약은 ERP 이벤트에서 후보를 만들고 익명화·개인정보 검수·책임 변호사
  승인 뒤 하나씩 지속 발행한다. AI 초안은 자동 게시하지 않는다.
- `docs/SEO_CONTENT_MIGRATION_V1.md`에 URL 인벤토리, 검색의도별 랜딩페이지 맵,
  고객후기 전량 이관, 공개 사례 발행 파이프라인을 정리했다.
- 다음 작업은 WordPress/KBoard·Search Console·네이버 데이터 접근 확보와 자동
  인벤토리 도구 작성이다. 접근 전에도 공개 URL 크롤러와 모노레포 스캐폴딩은 진행 가능하다.

### 2026-07-24 — 개인회생·파산 홈페이지 제품·UX 설계 v1
- 국내외 채무·법률·공공 서비스와 Google·네이버·AI 검색, 모바일 접근성·성능을 조사하고
  `docs/HOMEPAGE_BLUEPRINT_V1.md`에 고객 생애주기, 정보구조, 페이지별 UX, 모바일
  와이어프레임, 디자인 시스템, SEO, 개인정보, 측정·구축 순서를 정리했다.
- 홈페이지를 소개 페이지가 아닌 정보 탐색 → 익명 상황 정리 → 상담 → 사건 포털 →
  종결 후 관리의 프런트 도어로 정의했다. ERP를 상태 원장으로 두고 AdPilot에는
  가명 전환 데이터만 환류하는 경계를 세웠다.
- 대한변협 2025-06-30 개정 광고 규칙을 반영해 공개 LLM 상담은 v1에서 제외한다.
  결정형 상황 정리·계산 도구도 책임 변호사의 광고 규정 검토를 출시 게이트로 둔다.
- 현재 `lawandfirm.com/bank`의 URL·콘텐츠·자가진단·검색 자산을 보존·개선·301 이전한다.
  정식 도메인은 기존 도메인 유지안을 기본 권고로 하되 아직 미확정이다.
- GitHub origin은 `https://github.com/attorneychkim-ctrl/lawand.git`으로 연결되어 있으며
  기존 초기 커밋은 `origin/main`에 올라가 있다.
- 다음 작업은 설계 승인·정식 도메인/광고 심사 결정 → 기존 사이트 인벤토리 →
  `apps/homepage` 스캐폴딩과 `/bank` 공개 기반 구현 순서다.

### 2026-07-24 — Git 초기 기준선 생성
- 로컬 Git 저장소를 초기화하고, `PROJECT_PLAN.md`·`AGENTS.md`·`CLAUDE.md`를 첫 기준선 커밋으로 기록했다.
- GitHub 비공개 origin은 아직 생성/연결되지 않았다. 생성 후 `git remote add origin <repository-url>` 및 첫 push가 필요하다.

### 2026-07-24 — 초기 인프라·녹취 보관 방향 확정
- 홈페이지·ERP·gateway는 같은 AWS 계정/VPC 내 **각각 별도 EC2**로 배포한다. RDS PostgreSQL,
  ElastiCache Redis, S3는 관리형 서비스로 분리한다.
- 녹취 원본은 사무실 NAS에 보관한다. gateway는 WireGuard Site-to-Site VPN을 통해 비동기
  전송하며, 임시 EBS 재시도 영역·NAS 스냅샷·S3 Glacier 암호화 재해 복구 사본을 둔다.
- 상세 설계 결정은 `PROJECT_PLAN.md` 3절에 반영했다. 다음 작업은 VPC/도메인 준비와 로컬
  모노레포 스캐폴딩, `packages/core` 이벤트 카탈로그 v1이다.

### 2026-07-24 — 프로젝트 초기 시드
- `PROJECT_PLAN.md`(설계 초안 v0) 작성 + `CLAUDE.md`/`AGENTS.md` 시드 생성.
- 폴더: WSL `~/projects/lawand/` (기존 `adpilot`·`ai-agents-mono`·`law_firm_db`와 나란히).
- 다음 후보: ① 이 트리 스캐폴딩 스크립트 ② `packages/core` 이벤트 카탈로그 v1(이벤트
  목록 + 상담 상태머신) ③ `PROJECT_PLAN.md` 4번의 오픈 이슈 확정(배포 토폴로지·도메인·
  GitHub origin·pnpm 설치 등).
