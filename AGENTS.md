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
- **설계 논의 단계 — 스캐폴딩 전.**
- 스택 전제: Next.js 16(App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui ·
  TanStack Query, **모노레포(pnpm workspaces + Turborepo)**.
- 이 WSL 환경: node **v22.22.2**, **pnpm 미설치**(스캐폴딩 시 설치 필요).

## 작업 규칙
- 의미 있는 작업(스캐폴딩, 신규 패키지/앱, DB 스키마, 외부 연동, 배포 등)을 마치면
  아래 **인수인계 로그에 형식 맞춰 새 항목을 append**할 것 — 다음 세션/다른 에이전트가
  이어받는 유일한 경로다.
- 설계 결정이 바뀌면 `PROJECT_PLAN.md`도 함께 갱신(문서가 authoritative source).

---

## 작업 인수인계 로그 (append-only, 최신이 위)

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
