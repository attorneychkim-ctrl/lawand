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
- **홈페이지 구현 시작 — `/bank` 모바일 우선 초안 완료.**
- 스택 전제: Next.js 16(App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui ·
  TanStack Query, **모노레포(pnpm workspaces + Turborepo)**.
- 이 WSL 환경: node **v22.22.2**, pnpm **11.17.0**(Corepack + 로컬 shim).

## 작업 규칙
- 의미 있는 작업(스캐폴딩, 신규 패키지/앱, DB 스키마, 외부 연동, 배포 등)을 마치면
  아래 **인수인계 로그에 형식 맞춰 새 항목을 append**할 것 — 다음 세션/다른 에이전트가
  이어받는 유일한 경로다.
- 설계 결정이 바뀌면 `PROJECT_PLAN.md`도 함께 갱신(문서가 authoritative source).

---

## 작업 인수인계 로그 (append-only, 최신이 위)

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
