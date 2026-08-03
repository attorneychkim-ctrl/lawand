# 로앤 통합 플랫폼

법무법인 로앤의 공개 홈페이지, ERP, gateway와 공용 도메인 패키지를 함께 관리하는
pnpm/Turborepo 모노레포다. 첫 구현 범위는 개인회생·개인파산 홈페이지와 상담 접수의
첫 수직 흐름이다.

## 현재 구현

- `apps/homepage`: Next.js 16 App Router 기반 공개 홈페이지
- `apps/erp`: Next.js 16 기반 상담 목록·상세 운영 화면, 로컬 포트 3021
- `apps/gateway`: 암호화 상담 접수·조회 API와 outbox 원장, 로컬 포트 3022
- `packages/core`: 상담 ID·중복 판정·귀속 입력·이벤트 Zod 계약
- `packages/db`: PostgreSQL Drizzle 스키마와 버전 관리형 마이그레이션
- `/`: 현재 `/bank`로 이동
- `/bank`: 개인회생·개인파산 모바일 우선 홈페이지 초안
- `/bank/compare`: 개인회생·개인파산 비교 검색 랜딩페이지
- `/bank/personal-rehabilitation`: 개인회생 카테고리 허브
- `/bank/personal-rehabilitation/eligibility`: 개인회생 신청자격 검색 랜딩페이지
- `/bank/personal-rehabilitation/process`: 개인회생 절차·기간 검색 랜딩페이지
- `/bank/personal-rehabilitation/documents`: 개인회생 필요서류 검색 랜딩페이지
- `/bank/personal-rehabilitation/repayment`: 개인회생 변제금 검색 랜딩페이지
- `/bank/personal-bankruptcy`: 개인파산·면책 카테고리 허브
- `/bank/personal-bankruptcy/eligibility`: 개인파산 신청자격 검색 랜딩페이지
- `/bank/personal-bankruptcy/process`: 개인파산 절차·기간 검색 랜딩페이지
- `/bank/personal-bankruptcy/documents`: 개인파산 필요서류 검색 랜딩페이지
- `/bank/situations`: 채무 상황별 안내 카테고리 허브
- `/bank/situations/collection-and-seizure`: 독촉·압류 대응 검색 랜딩페이지
- `/bank/situations/investment-debt`: 주식·코인 채무 검색 랜딩페이지
- `/bank/situations/self-employed`: 자영업자 개인회생 검색 랜딩페이지
- `/bank/consultation`: 빠른 상담 요청·상세 상황 정리·실제 접수 완료와 카카오
  `채팅 확인 대기` ERP 접수 후 1:1 채팅 진입
- `robots.txt`, `sitemap.xml`, WebSite/LegalService JSON-LD

상담 요청은 홈페이지의 same-origin API를 거쳐 gateway의 단일 PostgreSQL 트랜잭션으로
저장되고 실제 접수번호가 발급된다. 이름·전화·상담 내용은 AES-256-GCM으로 암호화하고,
중복 비교는 서버 비밀키 HMAC 지문을 사용한다. 신규 상담·익명→실명 보강·7일 내 중복
의심 이벤트는 같은 트랜잭션의 outbox에 남는다. gateway의 상담 쓰기 API는 홈페이지
서버의 접수 전용 키를 요구하며, IP 원문을 저장하지 않는 전화·네트워크 rate limit은 같은
접수키의 정상 재시도를 별도로 허용한다.

내부 방문 경로는 브라우저 `sessionStorage`에 최대 20개까지 보관한다. 모든 상담 제출에
최초 랜딩·내부 이동·CTA와 허용 목록의 광고 식별자를 요청에 귀속하며, 이름·전화·
자유서술은 분석 정보와 이벤트에 넣지 않는다. 리걸프렌즈 요청에는 재시도·실패 원장과
ERP 상태 표시를 연결했다. 신건 등록 뒤 `case_idx`를 보존하고 최초 담당자를 지정하는
워커는 2026-07-31 사용자 승인으로 로컬 개발 gateway에서 활성화했다. 외부 멱등성 계약은
아직 확인되지 않았으므로 응답 유실·timeout은 자동 재시도하지 않고 ERP의 확인 필요
원장으로 남긴다. 상담이 최초 생성되면
접수 알림톡을, 담당자가 배정되면 담당자 배정 알림톡을 Solapi 승인 템플릿으로 발송한다.
문자 대체발송은 사용하지 않으며 Solapi 발송 식별자와 시도 원장을 ERP에서 확인한다.
Slack과 AdPilot 외부 송신은 아직 연결하지 않았다. ERP에는 초대 전용 직원 인증·역할과
PII 조회 감사, 본인 상담 배정, 관리자용 직원 리걸프렌즈 ID 관리를 연결했다. 상세 기준은
[`docs/CONSULTATION_INTAKE_V1.md`](docs/CONSULTATION_INTAKE_V1.md)를 따른다.
홈페이지 카카오 CTA는 전화번호 없는 대기 상담을 먼저 만들고 채팅방으로 이동한다.
직원이 실제 채팅 표시명을 확인해 확정한 뒤에만 담당자를 배정할 수 있으며, 이 경로는
알림톡과 리걸프렌즈 외부 실행을 만들지 않는다. 상세 운영 기준은
[`docs/KAKAO_HOMEPAGE_ENTRY_V1.md`](docs/KAKAO_HOMEPAGE_ENTRY_V1.md)를 따른다.
네이버 예약 확정 메일은 gateway의 IMAP 워커가 영업시간 5분, 그 외 30분 간격으로
감지해 전화번호 없는 상담으로 등록한다. 첫 가동 시 기존 메일은 건너뛰고 예약번호로
중복을 막으며, ERP에서 예약 상세 링크와 상담 시각을 확인한다. 전체 연락처 보강 전에는
리걸프렌즈와 알림톡을 실행하지 않는다. 설정과 운영 기준은
[`docs/NAVER_BOOKING_IMAP_V1.md`](docs/NAVER_BOOKING_IMAP_V1.md)를 따른다.

## 처음 만드는 방법

요구 버전은 Node.js 22 이상과 pnpm 11.17.0이다.

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install
pnpm dev
```

시스템 디렉터리에 Corepack shim을 만들 권한이 없는 환경에서는 다음처럼 실행한다.

```bash
corepack pnpm install
corepack enable --install-directory ./node_modules/.bin pnpm
corepack pnpm dev
```

브라우저에서 `http://localhost:3020/bank`를 연다. 전체 `pnpm dev`는 다음 포트를
동시에 사용한다.

| 앱 | 로컬 주소 | 역할 |
|---|---|---|
| homepage | `http://localhost:3020` | 공개 홈페이지·상담 폼 |
| ERP | `http://localhost:3021` | 내부 상담 운영 화면 |
| gateway | `http://localhost:3022/health` | API·장수명 워커 |

`apps/homepage`의 개발·프로덕션 포트는 **3020으로 고정**한다. 같은 개발 머신에서
`adpilot`(3000)·`ai-agents-mono/web-console`(3010)이 함께 떠 있어, 포트를 비워두면
Next가 빈 포트로 자동으로 밀려 매번 주소가 달라진다.

원격(SSH)에서 개발 중이라면 해당 포트를 포워딩한다.

```bash
ssh -L 3020:localhost:3020 <계정>@<개발머신>
```

## 검증

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

PostgreSQL 마이그레이션은 RDS나 전용 로컬 데이터베이스의 연결 문자열을 명시해 실행한다.
비밀번호가 포함된 연결 문자열은 저장소에 커밋하지 않는다.

```bash
DATABASE_URL='postgresql://<user>:<password>@<host>:5432/<database>' \
  corepack pnpm --filter @lawand/db migrate
```

스키마와 마이그레이션 메타데이터의 일치 여부는 DB 접속 없이 확인할 수 있다.

```bash
corepack pnpm --filter @lawand/db schema:check
corepack pnpm --filter @lawand/gateway alimtalk:verify
```

네이버 예약 메일 수집을 활성화하려면 네이버 메일의 IMAP 사용을 허용하고, 2단계 인증
계정은 애플리케이션 비밀번호를 발급한다. 계정·비밀번호는 Git 제외 환경파일이나 운영
비밀 저장소에만 두고 `LAWAND_NAVER_BOOKING_IMAP_ENABLED=true`로 전환한다.

### 로컬 개발 DB와 DBeaver

로컬 PostgreSQL 16에 영구 개발 DB와 최소권한 계정을 만들고 마이그레이션까지 적용한다.
명령을 다시 실행해도 기존 로컬 비밀번호를 유지하고 미적용 마이그레이션만 적용한다.

```bash
corepack pnpm db:local:setup
```

생성되는 역할은 다음과 같다.

| 역할 | 용도 | 권한 |
|---|---|---|
| `lawand_migrator` | Drizzle 마이그레이션 | `lawand_dev` 소유, 스키마 변경 |
| `lawand_app` | gateway 런타임 | public 테이블 SELECT/INSERT/UPDATE/DELETE |
| `lawand_viewer` | DBeaver 확인 | public 테이블 SELECT, 기본 읽기 전용 |

비밀번호와 연결 문자열은 Git에서 제외되고 파일 권한이 600인
`.env.development.local`에 생성된다. 채팅·문서·커밋에 비밀번호를 복사하지 않는다.
같은 명령이 gateway의 암호화·HMAC 키와 ERP 내부 API 키·홈페이지 접수 전용 키를 생성하고 각 앱의 Git 제외
`.env.local`에도 필요한 값만 나눠 쓴다.

DBeaver에는 다음처럼 등록한다.

```text
Host: 127.0.0.1
Port: 5432
Database: lawand_dev
Username: lawand_viewer
Password: .env.dbeaver.local의 PASSWORD
SSL: 로컬 개발에서는 disable
```

Windows DBeaver에서는 IPv6 `localhost`보다 `127.0.0.1`을 사용한다. 로컬 개발 계정과
비밀번호는 향후 RDS에 재사용하지 않는다.

Lighthouse는 홈페이지 앱의 개발 의존성으로 고정되어 있다. 프로덕션 서버를 띄운 뒤
다음처럼 모바일 기본 설정으로 측정한다.

```bash
corepack pnpm --filter @lawand/homepage lighthouse http://localhost:3020/bank \
  --only-categories=performance,accessibility,best-practices,seo
```

현재 WSL에서 Chrome 실행 후 DevTools 연결이 거절되면 WSL용 Playwright Chrome과
리눅스 임시 프로필을 명시한다.

```bash
TEMP=/tmp \
CHROME_PATH=/home/bmh31207/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
corepack pnpm --filter @lawand/homepage lighthouse http://localhost:3020/bank \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless --no-sandbox --disable-dev-shm-usage --user-data-dir=/tmp/lawand-lighthouse-profile"
```

공개 법률 문구, 고객후기, 사례, 사무소·운영시간은 배포 전 책임 변호사와 운영 담당자의
검수를 통과해야 한다. 현재 페이지의 후기는 기존 `lawandfirm.com/bank`에 공개된 원문
중 일부를 초기 UI 검증용으로 이관한 것이다.
