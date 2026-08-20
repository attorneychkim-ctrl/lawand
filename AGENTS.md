# AGENTS.md — 로앤 통합 플랫폼 (Codex/Claude 공용 온보딩)

**언어 지침(최우선): 사용자에게 보여주는 모든 응답·설명·요약은 무조건 한국어.**
코드/커밋 메시지/식별자, 사용자가 붙여넣은 영어 원문 인용은 예외.

## 시작 전 필수

1. **`PROJECT_PLAN.md`를 먼저 읽어라.** 현재 저장소 구조·아키텍처·운영 기준선·활성
   오픈 이슈의 단일 소스다.
2. **`docs/handoffs/CURRENT.md`를 읽어라.** 최근 운영 기준선과 진행 중·차단·다음 작업만
   담는 짧은 인수인계다.
3. 작업 분야에 연결된 `docs/*.md`만 추가로 읽는다. 과거 원문은 회귀·사고·배포 이력
   조사가 필요할 때만 `docs/handoffs/`와 `docs/archive/`에서 찾는다.

## 프로젝트 한 줄 요약

로앤 홈페이지 + 새 ERP + 리걸플로/리걸프렌즈를 하나의 **이벤트 기반 플랫폼**으로 묶어,
고객 전 생애주기를 **최대한 사람 손이 안 타는 자동화**로 흐르게 한다.

## 현재 기준선

- 홈페이지·ERP·gateway AWS 운영 배포와 Route 53 정식 도메인 전환이 완료됐다.
- 최신 운영 DB 원장은 migration `0071`까지 총 72개다. 최신 배포·검증값은
  `docs/handoffs/CURRENT.md`에서 확인한다.
- 스택: Next.js 16(App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui ·
  TanStack Query · pnpm workspaces · Turborepo.
- 이 WSL 기준: Node.js `22.22.2`, pnpm `11.17.0`(Corepack + 로컬 shim).

## 작업 규칙

- 이 저장소의 현재 워크트리·터미널 관리 기준은 **Orca이며 HERDR가 아니다**. Linux/WSL
  셸에서는 bare `orca` 대신 `orca-ide status --json`과
  `orca-ide worktree current --json`으로 런타임·현재 워크트리를 확인하고, 저장소 전체는
  `orca-ide worktree list --repo "path:$(git rev-parse --show-toplevel)" --json`으로 대조한다.
  Orca 상태를 작업·인수인계의 단일 기준으로 사용한다. Orca가 없거나 런타임이 중단돼 있으면
  그 사실을 기록하고 Git worktree·원격 브랜치를 읽기 전용으로 대조한다.
- `main`이 아닌 워크트리 브랜치에서는 구현·검증 뒤 해당 브랜치 커밋과 원격 브랜치
  푸시까지만 수행한다. `main` 머지·`main` 푸시와 실서비스 배포·운영 데이터 변경은
  메인 세션에서만 수행하며, 사용자가 해당 브랜치 세션에 별도로 명시하지 않는 한
  워크트리 브랜치 세션이 선행하지 않는다.
- 여러 워크트리의 완료 작업은 메인 세션에서 승인된 브랜치를 모두 병합한 뒤, 현재
  `main` HEAD를 단일 배포 소스로 삼아 한 번의 통합 릴리스로 배포한다. 배포 전 포함된
  커밋·migration·영향 앱을 대조하고, 서로 맞물린 migration과 gateway·ERP 등은 같은
  릴리스 ID로 함께 적용한다. 이미 별도 긴급 배포된 작업이나 이번 배포에서 제외할 작업은
  월별 인수인계 원장에 명시해 중복·누락 배포를 막으며, `main` 푸시만으로 배포 완료로
  간주하지 않는다.
- Linux 운영 앱의 표준 배포는 **GitHub Actions가 검증된 `main` commit으로 `linux/arm64`
  이미지를 빌드해 앱별 private ECR에 올리고, EC2는 tag가 아닌
  `repository@sha256:digest`를 pull해 실행하는 방식**이다. 운영 EC2에서 소스를 내려받아
  `docker build`하지 않는다. GitHub OIDC 역할은 immutable owner/repository 숫자 ID가
  포함된 정확한 `main` subject만 신뢰하고 wildcard나 장기 AWS access key를 두지 않는다.
  migration이 있으면 같은 gateway digest를 먼저 pull해 snapshot 뒤 적용하고 gateway와
  영향 앱을 같은 릴리스 ID로 전환한다. ECR tag는 추적값일 뿐 배포 입력이 아니다.
- S3 소스 아티팩트와 EC2 네이티브 빌드는 CI/ECR 장애 때 메인 세션이 명시적으로 선택하는
  긴급 fallback으로만 유지한다. 어느 방식이든 새 앱과 외부 health가 모두 성공한 뒤 현재
  이미지와 rollback 이미지 2개만 보존하고 BuildKit cache를 4 GiB 이하로 prune하며,
  `/opt/lawand/releases`는 최신 2개만 남긴다. soft limit 뒤에도 회수 가능 cache가 4 GiB를
  넘으면 남은 cache를 비워 hard cap을 검증한다. 정리 전후 cache·가용/회수 바이트·현재/
  rollback 이미지 ID를 `/var/log/lawand/deployments.log`와 월별 인수인계에 기록한다.
  health 실패 전에는 정리하지 않는다.
- 메인 통합 배포 직전에는 Orca의 저장소 워크트리 목록과 `origin/worktree/*`·작업용 원격
  브랜치를 모두 열거하고 각 HEAD가 `main`의 ancestor인지 확인한다. 미반영 브랜치는
  `병합/명시적 제외/진행 중` 중 하나로 기록하기 전에는 아티팩트 생성과 운영 배포를
  시작하지 않는다.

## 문서·인수인계 규칙

- `PROJECT_PLAN.md`는 **현재 상태만** 보존한다. 설계 결정·운영 기준선·활성 우선순위가
  바뀌면 기존 내용을 제자리에서 갱신하고 후보·배포 연대기를 누적하지 않는다.
- `docs/handoffs/CURRENT.md`는 다음 세션이 바로 이어갈 현재 상태다. 완료된 작업은 제거하거나
  운영 기준선으로 승격하고, 진행 중·차단·승인 대기만 남긴다.
- 의미 있는 작업(신규 기능·패키지·DB 스키마·외부 연동·배포·운영 진단·문서 기준선 변경)을
  마치면 `docs/handoffs/YYYY-MM.md` **맨 아래에** 한 항목을 시간순으로 append한다.
  과거 항목을 고치거나 최신 항목을 위에 prepend하지 않는다.
- 같은 작업의 상세 이력을 `AGENTS.md`와 `PROJECT_PLAN.md`에 복제하지 않는다. rollback에
  필요한 commit·migration·digest·검증·외부 변경은 월별 원장과 해당 운영 문서에 둔다.
- 컨텍스트 문서 크기는 `pnpm docs:context:check`로 검증한다. 제한을 넘기면 내용을 지우기
  전에 archive 또는 분야별 문서로 옮기고 링크를 남긴다.
- 압축 전 전체 원문과 SHA-256은
  `docs/archive/context-pre-compact/README.md`에서 확인한다.

### 홈페이지 hydration 예방 규칙 (필수)

- SSR되는 Client Component의 **첫 렌더는 서버와 브라우저에서 완전히 결정적**이어야 한다.
  렌더 본문이나 SSR되는 state 초깃값에 `Date.now()`, `new Date()`, `Math.random()`,
  `window`/`document`, storage, media query, 브라우저 locale 의존값을 직접 쓰지 않는다.
  필요하면 고정 초깃값 또는 서버 snapshot을 렌더하고 mount 뒤 effect에서 갱신한다.
- 태그와 interactive content 중첩을 유효하게 유지한다. 특히 `button` 안의 `button`/`a`,
  `a` 안의 interactive 요소, 문맥에 맞지 않는 block 요소를 만들지 않는다.
- iOS Chrome을 포함한 WebKit 자동 링크 변환을 막기 위해 루트 metadata
  `formatDetection`의 `telephone`, `date`, `email`, `address`를 모두 `false`로 유지한다.
- 현재 시간·브라우저 API처럼 자체 렌더를 결정적으로 만들 수 없는 상호작용 UI만
  `"use client"` loader와 `next/dynamic({ ssr: false })`로 분리한다. 서버 fallback은
  버튼·입력 없이 안정적으로 렌더한다.
- `suppressHydrationWarning`을 페이지 루트나 큰 wrapper에 관성적으로 붙이지 않는다.
  제3자 속성 주입을 확인한 정확한 leaf 요소에만 최후 수단으로 사용한다.
- 루트 `<html>`의 `suppressHydrationWarning`은 iPhone Chrome이 hydration 전에 직접 넣는
  `__gcrremoteframetoken`을 실제 오류 diff로 확인한 예외다. 제거하거나 범위를 넓히지 않는다.
  React의 한 단계 제한으로 `body` 이하 불일치는 계속 드러나야 한다.
- 브라우저 내부 속성을 지우는 pre-hydration DOM 스크립트나 console 오류 필터를 넣지 않는다.
  공식 metadata 대응과 결정적 렌더를 먼저 적용하고 실제 diff와 component stack을 고친다.
- 새 상호작용 페이지는 typecheck·lint·build와 모바일 Chrome 실기기 새로고침에서 hydration
  경고가 없는지 확인한다. client-only 경계의 초기 HTML fallback에 의도치 않은
  `input`·`select`·`textarea`·`button`이 남지 않았는지도 확인한다.

### 홈페이지·ERP 화면 전환 어텐션 규칙 (필수)

- 같은 라우트에서 단계·탭·폼 완료·검색 결과처럼 주요 콘텐츠가 교체되거나 새 페이지에서
  업무 문맥이 시작되면 이전 스크롤 위치에 남기지 않는다. 기본은 최상단이며, 완료 메시지·
  새 단계 제목·오류 요약·선택 상세처럼 명확한 다음 문맥이 있으면 그 컨테이너를 고정 헤더
  아래로 스크롤하고 문맥 제목에 프로그램적으로 포커스한다.
- 상태 변경 전에 `window.scrollTo`를 호출하지 않는다. 새 DOM commit 뒤 effect와
  `requestAnimationFrame`에서 이동하며, 홈페이지는 공통 `moveAttention`을 우선 재사용하고
  `prefers-reduced-motion`을 존중한다. 제목은 `tabIndex={-1}`과 적절한
  `aria-labelledby`를 사용한다.
- 입력 검증 실패나 과거 문자·목록 열람 중 polling처럼 위치 보존이 중요한 갱신은 강제
  이동하지 않는다. 모바일 폼 텍스트 입력은 계산 글자 크기 16px 이상을 유지하고, 전환
  검증에는 스크롤 위치·활성 요소·가로 스크롤·hydration 경고를 포함한다.
