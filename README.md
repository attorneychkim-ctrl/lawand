# 로앤 통합 플랫폼

법무법인 로앤의 공개 홈페이지, ERP, gateway와 공용 도메인 패키지를 함께 관리하는
pnpm/Turborepo 모노레포다. 첫 구현 범위는 개인회생·개인파산 홈페이지와 상담 접수의
첫 수직 흐름이다.

## 현재 구현

- `apps/homepage`: Next.js 16 App Router 기반 공개 홈페이지
- `apps/erp`: Next.js 16 기반 실시간 상담 목록·상세 운영 화면, 로컬 포트 3021
- `apps/gateway`: 암호화 상담 접수·조회 API, outbox·SSE 중계, 로컬 포트 3022
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
- `/bank/self-diagnosis`: 소득·가족·법원·채무·청산가치 조건으로 로앤 유사사건
  다섯 건을 비교하고 같은 입력을 ERP 상담으로 접수하는 자가진단
- `/bank/cases`: 비식별화·검수된 실제 수행 사건으로 변제금 산정과 절차를 설명하는
  `사례로 이해하기` 목록
- `/bank/cases/[slug]`: 사례별 출발 상황·쟁점·계산·절차·다른 사건과의 차이 상세
- `robots.txt`, `sitemap.xml`, WebSite/LegalService JSON-LD

상담 요청은 홈페이지의 same-origin API를 거쳐 gateway의 단일 PostgreSQL 트랜잭션으로
저장되고 실제 접수번호가 발급된다. 이름·전화·상담 내용은 AES-256-GCM으로 암호화하고,
중복 비교는 서버 비밀키 HMAC 지문을 사용한다. 신규 상담·익명→실명 보강·7일 내 중복
의심 이벤트는 같은 트랜잭션의 outbox에 남는다. gateway의 상담 쓰기 API는 홈페이지
서버의 접수 전용 키를 요구하며, IP 원문을 저장하지 않는 전화·네트워크 rate limit은 같은
접수키의 정상 재시도를 별도로 허용한다.

상담 outbox 커밋은 PostgreSQL `LISTEN/NOTIFY`를 거쳐 gateway의 인증된 SSE로 전달된다.
ERP 브라우저는 same-origin 프록시를 구독하고 이벤트가 올 때만 최신 목록을 다시 읽으므로
새로고침과 주기적 폴링 없이 신규 상담을 표시한다. 연결이 복구될 때 한 번 전체 목록을
동기화해 알림 유실 구간을 보정하며 실시간 payload에는 개인정보를 넣지 않는다.

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
현재 담당자가 상담 상세에서 실행하는 센트릭스 A타입 클릭투콜도 구현했다. 고객 번호는
outbox나 브라우저 명령에 넣지 않고 gateway 워커가 발신 직전에만 복호화하며, timeout이나
응답 유실은 중복 발신 방지를 위해 자동 재시도하지 않는다. 정정된 API 계정의 실제 회선·
내선 일치를 검증하고 로컬 실제 발신도 확인했다. 발신 후 `callhistory`를 대사해 연결 여부와
시간을 원장에 저장하고, 종료 시 ERP가 자동으로 여는 창에서 담당자가 상담·음성사서함·
무응답·거절·통화 중·발신 취소·재상담 필요를 확정한다. 최신 결과가 무응답 또는 재상담
필요이면 상담 목록의 `부재`·`재상담 필요` 배지와 `확인 필요` 작업 큐에 표시한다.
운영 활성화는 보류 상태이며 설정과 게이트는
[`docs/CENTREX_CLICK_TO_CALL_V1.md`](docs/CENTREX_CLICK_TO_CALL_V1.md)를 따른다.
수신전화용 Windows bridge는 32비트 STA ActiveX host를 interactive Windows 세션에서
상시 실행하고 자격 증명 관리자·회선 검증·재접속·마스킹 로그를 적용한다. 실제 수신은
DPAPI 큐와 HTTPS/HMAC을 거쳐 gateway 암호화 원장에 멱등 저장되고, DB commit 알림·인증
SSE·same-origin 스냅샷으로 ERP 모든 화면에 즉시 표시된다. 인증 화면은 전체 발신번호·
내선·회선 담당자와 상태를 통화별 카드로 표시하며, 동시 수신도 모두 유지한다. DB는
암호화하고 SSE·로그에는 번호를 넣지 않는다. 실제 무응답 전화의 시각 표시와 자연 종료를
확인했으며 명시적 받기는 다음 단계다. 세부 결과는
[`docs/CENTREX_INBOUND_CANARY.md`](docs/CENTREX_INBOUND_CANARY.md)를 따른다.
홈페이지 카카오 CTA는 전화번호 없는 대기 상담을 먼저 만들고 채팅방으로 이동한다.
직원이 실제 채팅 표시명을 확인해 확정한 뒤에만 담당자를 배정할 수 있으며, 이 경로는
알림톡과 리걸프렌즈 외부 실행을 만들지 않는다. 상세 운영 기준은
[`docs/KAKAO_HOMEPAGE_ENTRY_V1.md`](docs/KAKAO_HOMEPAGE_ENTRY_V1.md)를 따른다.
네이버 예약 확정 메일은 gateway의 IMAP 워커가 영업시간 5분, 그 외 30분 간격으로
감지해 전화번호 없는 상담으로 등록한다. 첫 가동 시 기존 메일은 건너뛰고 예약번호로
중복을 막으며, ERP에서 예약 상세 링크와 상담 시각을 확인한다. 전체 연락처 보강 전에는
리걸프렌즈와 알림톡을 실행하지 않는다. 설정과 운영 기준은
[`docs/NAVER_BOOKING_IMAP_V1.md`](docs/NAVER_BOOKING_IMAP_V1.md)를 따른다.
자가진단은 `Office_idx=56` 원천을 홈페이지에서 직접 읽지 않고 식별자와 원본 날짜를
제거한 별도 런타임 읽기 모델만 사용한다. 현재 구현·분기·출시 게이트는
[`docs/SELF_DIAGNOSIS_V1.md`](docs/SELF_DIAGNOSIS_V1.md)를 따른다.
공개 사례 생성은 세 비공개 `CB` 원천을 `Case_idx`로 조인한 뒤 코드에서 먼저
비식별화하고, Codex CLI에는 안전한 스냅샷만 전달한다. 생성·검수·발행 기준은
[`docs/PUBLIC_CASE_STUDIES_V1.md`](docs/PUBLIC_CASE_STUDIES_V1.md)를 따른다.
원천 `Case_idx`는 이후 자가진단 유사사례와 서버에서 연결하기 위해
`public_case_studies.source_case_idx`에만 저장하며, 홈페이지 응답에는 포함하지 않는다.
개인회생 사례는 변제금 산정과 인가 절차, 파산·면책 사례는 지급불능·재산 확인과
파산선고 후 별도 면책심사가 중심이 되도록 목록 카드와 상세 구성을 분야별로 나눈다.

## 처음 만드는 방법

요구 버전은 Node.js 22 이상과 pnpm 11.17.0이다.

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install
pnpm dev
```

시스템 디렉터리에 Corepack shim을 만들 권한이 없는 환경에서는 사용자 `PATH`에 한 번만
설치한다. `~/.local/bin`은 메인과 HERDR 작업트리가 함께 사용하므로 워크트리마다
`node_modules/.bin/pnpm`을 다시 만들 필요가 없다.

```bash
mkdir -p ~/.local/bin
corepack prepare pnpm@11.17.0 --activate
corepack enable --install-directory ~/.local/bin pnpm
pnpm --version
pnpm install
pnpm dev
```

사용자 `PATH`에 `~/.local/bin`을 추가할 수 없는 일회성 환경에서만 다음 명시형 명령을 쓴다.

```bash
corepack pnpm install
corepack pnpm dev
```

브라우저에서 `http://localhost:3020/bank`를 연다. 전체 `pnpm dev`는 다음 포트를
동시에 사용한다.

| 앱 | 로컬 주소 | 역할 |
|---|---|---|
| homepage | `http://localhost:3020` | 공개 홈페이지·상담 폼 |
| ERP | `http://localhost:3021` | 내부 상담 운영 화면 |
| gateway | `http://localhost:3022/health` | API·장수명 워커 |

## AWS 운영 배포

2026-08-04 서울 리전에 홈페이지·ERP·gateway 전용 EC2 세 대와 각 탄력적 IP,
비공개 PostgreSQL RDS, private 배포 S3 버킷을 `lawand-prod` CloudFormation 스택으로
구성했다. 정식 `lawandfirm.com` DNS는 기존 사이트와 광고를 보호하기 위해 아직
변경하지 않았다.

현재 임시 HTTPS 접속점은 다음과 같다.

| 앱 | 임시 HTTPS |
|---|---|
| 홈페이지 | `https://15-165-23-84.sslip.io/bank` |
| ERP | `https://3-34-72-9.sslip.io/login` |
| gateway | `https://3-36-255-226.sslip.io/health` |

탄력적 IP의 HTTP 요청은 같은 경로의 위 HTTPS 주소로 영구 전환한다. 임시 주소는
기술 검증용이며 광고·검색 노출·canonical 주소로 사용하지 않는다.

실제 인프라·데이터 이관 범위·재배포 순서·도메인 전환 및 rollback 체크리스트는
[`docs/PRODUCTION_DEPLOYMENT_V1.md`](docs/PRODUCTION_DEPLOYMENT_V1.md)를 따른다.
인프라 코드는 [`infra/aws/production.yml`](infra/aws/production.yml), 컨테이너 기준선은
[`infra/docker/Dockerfile`](infra/docker/Dockerfile)에 있다. 운영 비밀값은
Secrets Manager에만 저장하며 배포 명령이나 문서에 값을 복사하지 않는다.

센트릭스 수신 2단계는 별도 Windows bridge의 DPAPI 큐에서 운영 gateway의 HTTPS/HMAC
수집 경계까지 배포됐다. gateway는 수신번호를 즉시 암호화·지문화하고 독립 수신 통화·
이벤트 원장에 멱등 저장한다. 실제 약 12.9초 무응답 수신에서 `ringing → ended` 두 이벤트와
암호화·지문 무결성을 확인했고, Windows bridge v0.2.1의 직접 HTTPS 전송과 sibling leg
매칭 보강 뒤 멱등 replay도 200·큐 0건으로 끝났다. 수신 3단계는 운영 ERP 모든 직원
화면의 상단 수신 바까지 배포했다. DB commit 알림과 인증 SSE·same-origin 프록시로
전체 번호·내선·`내 전화/담당자 전화`를 표시하고, 연결·재연결 때 현재 수신 스냅샷을
다시 읽어 누락을 보정한다. 비식별 운영 canary에서 `sync → changed`와 ERP 프록시 200을,
후속 실제 무응답 전화에서 `수신전화 → 통화 종료` 표시와 약 13.6초 자연 종료를 확인했다.
동시 수신은 통화 ID별 모든 카드를 반환한다. 고객 해석과 명시적 받기 명령은 다음 단계다.

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

센트릭스 회선은 비밀 맵을 먼저 구성한 뒤 `userinfo` 일치 검증을 통과해야 직원 계정에
연결된다. 구체적인 명령과 운영 활성화 순서는
[`docs/CENTREX_CLICK_TO_CALL_V1.md`](docs/CENTREX_CLICK_TO_CALL_V1.md)에 있다.

로컬 `CB.TblCBCase` 중 로앤 사건만 비식별 자가진단 읽기 모델로 재구축하려면 다음
명령을 사용한다. 기존 모델을 교체하므로 원천과 대상 행 수를 먼저 확인한다.

```bash
corepack pnpm diagnosis:sync -- --replace
```

로컬 비공개 원천에서 개인회생 사례 초안 한 건을 만들려면 다음 명령을 사용한다.
이 명령은 직접 식별정보와 원문 메모를 Codex에 보내지 않고, `gpt-5.6-luna`의
`xhigh` 추론으로 생성한 결과를 `preview`로만 저장한다. `preview`는 개발 환경에서만
보이며 개인정보·법률 검수와 공개 근거 확인 전에는 운영에 노출되지 않는다.

```bash
corepack pnpm cases:generate
```

모델 호출 전에 전달될 비식별 스냅샷만 확인하거나, 아직 공개되지 않은 같은 초안을
다시 만들 때는 다음 옵션을 사용한다.

```bash
corepack pnpm cases:generate -- --inspect-safe-source
corepack pnpm cases:generate -- --replace
```

기본 모델은 `gpt-5.6-luna`·`xhigh`이며, 같은 프롬프트와 스키마로 다른 Codex 모델을
비교하려면 모델과 추론 강도를 명시한다.

```bash
corepack pnpm cases:generate -- --replace \
  --model=gpt-5.6-terra --reasoning-effort=medium
```

추가생계비가 실제로 기록된 사례만 우선 고르려면 다음 옵션을 함께 사용한다.

```bash
corepack pnpm cases:generate -- \
  --slug=personal-rehabilitation-additional-living-cost \
  --require-additional-living-cost \
  --model=gpt-5.6-luna --reasoning-effort=medium
```

파산선고와 면책허가가 모두 기록된 파산·면책 사례를 만들려면 분야와 slug를 지정한다.

```bash
corepack pnpm cases:generate -- \
  --slug=personal-bankruptcy-discharge \
  --practice-area=personal_bankruptcy \
  --model=gpt-5.6-luna --reasoning-effort=medium
```

리걸프렌즈 RDS의 원천 `CONTENT.TblCaseMemo`를 로컬 PostgreSQL `lawand_dev`의 비공개
`CB.TblCaseMemo`로 전체 복제·검증하려면 다음 명령을 사용한다. RDS 접속정보는 리걸프렌즈
EC2의 Git 제외 환경파일에서 읽고, SSH 키 경로는 기본값 대신 환경변수로 덮어쓸 수 있다.
`--replace`는 새 임시 테이블을 먼저 검증한 뒤 기존 대상과 원자적으로 교체한다.

```bash
LAWAND_LEGALFRIENDS_SSH_KEY=/path/to/newLawAndERP.pem \
  corepack pnpm legalfriends:case-memo -- --replace
```

이 테이블은 사건 메모 원천을 그대로 보관하므로 홈페이지·gateway 런타임에는 연결하지
않고, 로컬 `lawand_viewer`만 `CB` 스키마에서 확인할 수 있게 한다. 원본이 갱신된 뒤에는
같은 명령으로 새 스냅샷을 다시 만든다.

리걸프렌즈 RDS의 원천 `CONTENT.TblMoClientStatement`를 로컬 PostgreSQL `lawand_dev`의
비공개 `CB.TblMoClientStatement`로 전체 복제·검증하려면 다음 명령을 사용한다. 전화·주소·
채무상담 정보가 포함될 수 있으므로 홈페이지·gateway 런타임에는 연결하지 않는다.

```bash
LAWAND_LEGALFRIENDS_SSH_KEY=/path/to/newLawAndERP.pem \
  corepack pnpm legalfriends:client-statement -- --replace
```

`--replace`는 새 임시 테이블에서 원본과 전체 요약이 일치하는지 확인한 뒤 기존 대상을
원자적으로 교체한다. 원본 갱신 후 같은 명령으로 새 스냅샷을 반영할 수 있다.

수신전화 고객 확인용 리걸프렌즈 디렉터리를 로컬 PostgreSQL의 비공개 `CB` 스키마로
동기화하려면 다음 명령을 사용한다. `CONTENT.TblCase.Office_idx=56` 사건과 연결 고객,
같은 사무소 담당자만 하나의 consistent snapshot으로 읽으며 다른 사무소 데이터는 가져오지
않는다. 고객은 이름·전화 검색 필드, 사건은 유형·상태·담당자와 표시 필드, 담당자는
식별자·이름·직책만 보존한다. 회원 비밀번호·생년월일·개인 연락처와 사건 계좌정보는
복제하지 않는다.

```bash
LAWAND_LEGALFRIENDS_SSH_KEY=/path/to/newLawAndERP.pem \
  corepack pnpm legalfriends:phone-directory -- --replace
```

최초 적재에는 `--replace`를 생략할 수 있다. 스크립트는 세 임시 테이블의 행별 해시,
사건-고객 관계, 전화 검색 정규화와 사무소 경계를 모두 확인한 뒤 세 테이블을 한 번에
교체한다. 로컬·운영 PostgreSQL 복제본의 비식별 논리 요약은 다음 SQL로 대조한다.

크론 전용 EC2의 Secrets Manager·단일 실행 잠금·systemd timer·CloudWatch 경보 배치는
[`docs/LEGALFRIENDS_PHONE_DIRECTORY_CRON_HANDOFF.md`](docs/LEGALFRIENDS_PHONE_DIRECTORY_CRON_HANDOFF.md)를
따른다.

```bash
psql "$LAWAND_MIGRATION_DATABASE_URL" \
  -X -v ON_ERROR_STOP=1 -At \
  -f scripts/verify-legalfriends-phone-directory.sql
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
| `lawand_viewer` | DBeaver 확인 | public 테이블 SELECT, 로컬 `CB` 스키마 전체 권한 |

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
