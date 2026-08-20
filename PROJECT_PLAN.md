# 로앤 통합 플랫폼 — 현재 설계·운영 기준선 (v2.0)

> 갱신일: 2026-08-20
>
> 이 문서는 **현재 상태만** 설명한다. 후보·통합·배포 연대기는 누적하지 않는다. 최신
> 인수인계는 [`docs/handoffs/CURRENT.md`](docs/handoffs/CURRENT.md), 구조 개편 이후의 작업
> 이력은 `docs/handoffs/YYYY-MM.md`, 압축 전 전체 원문은
> [`docs/archive/context-pre-compact/README.md`](docs/archive/context-pre-compact/README.md)에
> 있다.

## 0. 목표와 현재 단계

로앤 홈페이지, 내부 업무 시스템 `LAW& OS`, gateway, 리걸플로·리걸프렌즈 연동을 하나의
이벤트 기반 플랫폼으로 묶어 고객의 탐색·상담·배정·통화·후속 업무·사건 인계를 가능한 한
자동으로 연결한다. 자동화는 누락과 반복 작업을 줄이기 위한 수단이며 법률 판단, 고객 발송,
공개 콘텐츠와 중요한 외부 변경의 책임은 사람에게 남긴다.

현재는 초기 스캐폴딩 단계가 아니다. 홈페이지·ERP·gateway, 비공개 PostgreSQL RDS,
센트릭스 Windows bridge, 정식 도메인과 CI/ECR 배포 경로가 운영 중이다. 제품의 중심은 다음과
같다.

1. 홈페이지는 계약 전 정보 탐색·신뢰 형성·상담 전환을 담당한다.
2. `LAW& OS`는 상담·고객·전화·문자·후기·외부 실행의 내부 업무 원장이다.
3. gateway는 장수명 연결, DB 트랜잭션, 암호화, outbox와 외부 워커를 담당한다.
4. 계약 이후 고객의 사건 정보·할 일·서류·상태 확인은 리걸프렌즈가 담당한다.
5. 공개 AI·자가진단·사례 발행은 별도 승인 게이트를 통과한 범위만 제공한다.

## 1. 현재 운영 기준선

| 항목 | 현재 기준 |
| --- | --- |
| Git `main` | 최근 컨텍스트 통합 `38fc1dc6476ea7108ee5846e45d23618741a47fa`; 실제 HEAD는 `git rev-parse origin/main`으로 확인 |
| 최신 통합 코드 | `f8bd74d04ac240fe6c9ed02759b795b069140559` |
| 최신 운영 릴리스 | `20260820T034100Z-three-worktrees-v1` |
| 운영 DB | PostgreSQL, migration 72개 (`0000..0071`) |
| 최신 migration | `0071_consultation_schedule_follow_up.sql` |
| 공개 홈페이지 | `lawandfirm.com`, AWS 홈페이지 앱 운영 |
| 내부 제품명 | `LAW& OS` |
| Linux 배포 | GitHub Actions → private ECR ARM64 → EC2 immutable digest pull |

최신 릴리스는 gateway·ERP에 내선 발신 직원 상세와 홈페이지 예약 상담의 담당자 재통화
업무·정시 브라우저 알림을 반영했다. 홈페이지는 직전 GA4 무팝업 측정 digest를 유지했다.
ERP의 개인 웹훅 설정은 관리자 전용 비활성 미리보기이며 DB·API·실제 전송은 없다. 최신
health·digest·snapshot·migration 해시와 검증 결과는
[`docs/handoffs/CURRENT.md`](docs/handoffs/CURRENT.md)를 따른다.

컨텍스트 문서 구조 개편은 `38fc1dc6476ea7108ee5846e45d23618741a47fa`로 `main`과 CI에
반영됐다. 애플리케이션 코드·DB·운영 설정은 바뀌지 않아 ECR에 게시된 같은 SHA의 이미지를
EC2에 전환하지 않았고 위 운영 릴리스와 런타임 기준선은 그대로다.

## 2. 저장소와 런타임 경계

현재 실제 구조는 다음과 같다.

```text
lawand/
├── apps/
│   ├── homepage/         # 공개 홈페이지, SEO, 상담·후기 접점
│   ├── erp/              # LAW& OS, 직원 인증·업무 화면
│   ├── gateway/          # Node 장수명 서버, API·SSE·worker·외부 연동
│   ├── centrex-bridge/   # Windows x86/.NET Framework 센트릭스 ActiveX bridge
│   └── desktop-notifier/ # 직원 Windows PC의 개인 업무 알림 client
├── packages/
│   ├── core/             # 공유 도메인 계약·검증·이벤트 타입
│   └── db/               # Drizzle schema·migration·DB client
├── docs/                 # 분야별 상세 계약·운영 절차·인수인계
├── infra/                # AWS·Docker 운영 구성
└── scripts/              # 동기화·생성·검증·운영 보조 명령
```

모노레포는 같은 상담·사건·고객·통화 계약을 앱마다 복제하지 않기 위한 선택이다. 현재 없는
`packages/ai`, `packages/integrations`, `packages/ui`를 계획상 존재하는 것처럼 가정하지 않는다.
공유 경계가 실제로 반복될 때 별도 패키지로 추출한다.

기술 기준은 Next.js 16(App Router), React 19, TypeScript, Tailwind 4, shadcn/ui,
TanStack Query, pnpm workspaces, Turborepo다. 장수명 연결과 외부 실행은 Next.js 프로세스가
아니라 gateway가 소유한다.

## 3. 플랫폼 핵심 결정

### 3-1. 이벤트와 DB가 업무 상태의 기준이다

- 상담·배정·전화·문자·후기·외부 실행은 명시적인 도메인 이벤트로 표현한다.
- 업무 변경과 outbox INSERT는 같은 PostgreSQL 트랜잭션에서 확정한다.
- 외부 API는 commit 뒤 worker가 실행하며 요청·시도·결과·불명확 상태를 별도 원장에 남긴다.
- 응답 유실이나 제공자 결과가 불명확한 명령은 자동 성공으로 꾸미거나 무조건 재시도하지 않는다.
- 이벤트와 `LISTEN/NOTIFY`·SSE에는 원문 전화번호·이름·상담 내용 등 PII를 넣지 않는다.
- 브라우저는 비식별 변경 신호를 받은 뒤 인증된 same-origin API로 최신 snapshot을 다시 읽는다.

현재 단일 gateway의 fan-out에는 PostgreSQL `LISTEN/NOTIFY`를 사용한다. Redis/BullMQ는 다중
gateway나 독립 큐 부하가 실제로 필요해질 때 도입한다.

### 3-2. 개인정보는 수집 경계부터 분리·암호화한다

- 전화번호·상담 intake·후기 원문·외부 대상 snapshot은 AES-256-GCM 인증 암호화한다.
- 검색·중복 판정에는 정규화 값의 HMAC 지문을 사용한다.
- 로그·outbox·SSE·CloudWatch metric에는 개인정보 원문을 넣지 않는다.
- 브라우저가 이미 서버에 있는 전화번호를 다시 보내지 않도록 상담·고객·사건 ID를 전달하고
  gateway가 권한과 현재 원장을 재검증한다.
- `PUBLIC`, 앱 runtime, 조회자, migration 역할의 DB 권한을 분리하고 비공개 `CB` 원천을
  홈페이지나 브라우저에 직접 노출하지 않는다.
- 데이터 보관·철회·감사 경계는 기능 구현과 함께 개인정보처리방침에 반영한다.

### 3-3. 외부 시스템은 내부 원장 뒤에 둔다

리걸프렌즈, SOLAPI, 센트릭스, 기프티쇼, 네이버 IMAP은 앱 화면에서 직접 호출하지 않는다.
gateway의 검증된 adapter/worker 경계가 호출하고 내부 요청·시도·결과 원장을 먼저 남긴다.
외부 시스템의 식별자와 현재 상태를 내부 업무 상태와 구분해 보존한다.

기존 시스템을 전환하는 동안에는 strangler 방식으로 유지한다. 구 ERP MariaDB와 새
PostgreSQL 미러가 같은 데이터처럼 보이더라도 동기화 주기·소유권이 다르므로 자동으로 같은
최신성 계약을 가정하지 않는다.

### 3-4. 추정보다 제공자 증거와 사람의 확정을 우선한다

전화 root/leg, 호전환, 문자 회신, 기존 고객 연결처럼 오연결 위험이 큰 경계는 시간 근접이나
이름 유사도만으로 확정하지 않는다. 정확한 provider ID, 회선, 전화 HMAC, 사건 ID와 상태를
대조하고 근거가 부족하면 `확인 필요`로 남긴다. 실제 문맥을 아는 직원의 명시적 확정은 감사
원장과 함께 별도 경로로 제공한다.

## 4. 제품·도메인 기준선

### 4-1. 홈페이지

첫 제품 범위는 개인회생·개인파산·면책이다. 검색 의도별 안내, 비교·절차·서류·비용·상황
페이지, 후기, 승인된 사례, 자가진단, 상담 요청과 카카오 보조 접점을 제공한다. 계약 후 고객
포털을 홈페이지에 중복 구현하지 않는다.

상세 정보구조와 콘텐츠 기준은 다음 문서가 단일 계약이다.

- [`docs/HOMEPAGE_BLUEPRINT_V1.md`](docs/HOMEPAGE_BLUEPRINT_V1.md)
- [`docs/SEO_CONTENT_MIGRATION_V1.md`](docs/SEO_CONTENT_MIGRATION_V1.md)
- [`docs/CONSULTATION_INTAKE_V1.md`](docs/CONSULTATION_INTAKE_V1.md)
- [`docs/KAKAO_HOMEPAGE_ENTRY_V1.md`](docs/KAKAO_HOMEPAGE_ENTRY_V1.md)

SSR되는 첫 렌더는 결정적이어야 하며 WebKit 자동 링크 변환 방지 metadata와 루트 `<html>`의
정확한 hydration 예외를 유지한다. 주요 화면 전환은 새 DOM commit 뒤 스크롤·포커스를 옮기고
검증 실패나 과거 목록 열람 중 갱신은 위치를 보존한다. 구체적인 필수 규칙은 `AGENTS.md`를
따른다.

### 4-2. 상담 접수·묶음·배정

- `consultation`은 대표 업무 흐름, `consultation_request`는 실제 제출 이력이다.
- 같은 정규화 전화번호의 마지막 요청이 7일 이내이고 상담이 미종결이면 채널·입력 이름과
  관계없이 같은 상담으로 묶는다. 이름 차이는 차단이 아니라 가족·공용 번호 확인 신호다.
- 전화 없는 카카오·네이버 접수는 자동으로 묶지 않고 접수번호와 사람의 확인을 사용한다.
- 공개 경계의 고객명이 markup·제어문자를 포함하면 상담 자체를 버리지 않고 원문을 저장하지
  않은 채 `고객명 확인 필요`로 격리한다. 전화번호·상담 내용·접수 원장은 계속 처리하고,
  리걸프렌즈와 문자에는 익명 표시명·중립 호칭을 사용한다.
- 요청별 암호화 intake와 광고 귀속은 합치지 않고 그대로 보존한다.
- 최초 배정은 ERP의 `상담하기`에서 실행 직원을 담당자로 정하며, 같은 트랜잭션에서 업무
  이벤트와 리걸프렌즈·알림톡 실행 요청을 만든다.
- 홈페이지 예약 상담의 최신 30분 구간은 담당 배정과 함께 열린 재통화 업무 하나를 만들며
  과거 건을 소급 생성하지 않는다.

공개 상담 POST는 홈페이지 same-origin 서버를 거친다. 홈페이지와 gateway 사이의 전용 키,
전화 HMAC·가명 네트워크 기준 rate limit, UUID 멱등성을 사용하고 IP 원문을 저장하지 않는다.

### 4-3. ERP 인증과 권한

ERP는 공개 가입 없이 관리자 초대만 허용한다. 계정·프로필·조직 멤버십·세션·감사 원장을
분리하고 HttpOnly·SameSite=Strict 서버 세션을 사용한다. 비밀번호는 12자 이상 복잡도 정책과
scrypt 단방향 해시를 적용하고 변경 시 기존 세션을 모두 폐기한다. 상담 PII 조회와 중요한
업무 변경은 직원 ID 기준으로 감사한다.

역할은 관리자·정규직·아르바이트·별산·민원업체를 현재 기준으로 사용한다. 본인은 프로필과
자기 업무 연동을 수정할 수 있지만 역할을 승격할 수 없다. 세부 계약은
[`docs/ERP_AUTH_V1.md`](docs/ERP_AUTH_V1.md)를 따른다.

### 4-4. 리걸프렌즈 연동과 비공개 미러

상담 접수만으로 리걸프렌즈 사건을 만들지 않는다. 직원이 상담을 확인·배정한 뒤 신건 등록
또는 기존 사건 문의를 명시적으로 선택한다. 신건은 `createForLawnV2`에 담당자의 숫자형
`member_idx`를 보내고 성공한 사건 식별자를 내부 연결 원장에 보존한다. 담당자 변경·무효
처리는 `changeManager` 외부 성공 뒤에만 ERP 상태를 확정한다.

현재 `existing_case`로 선택한 기존 사건 문의는 directory source와 처리 결정만 저장하고
`legalfriends_case_links`를 만들지 않는다. 그 결과 ERP 변경 버튼과 gateway 명령이 모두
신규 등록 사건만 담당자 변경 대상으로 인정하는 활성 결함이 있다. 기존 사건의 검증된
`case_idx`를 동일한 변경 경계에 포함하되 화면과 gateway 권한·외부 성공 후 확정을 함께
보강해야 한다.

`Office_idx=56`의 고객·사건·담당자 최소 필드는 비공개 PostgreSQL `CB` schema로 매일 03:30
일관 snapshot 동기화한다. staging 검증과 원자 교체가 성공해야 현재 미러를 바꾸며 실패하면
기존 데이터를 유지한다. `lawand_app`은 `CB` 테이블을 직접 읽지 않고 최소
security-definer 함수만 실행한다. 상세 절차는
[`docs/LEGALFRIENDS_PHONE_DIRECTORY_CRON_HANDOFF.md`](docs/LEGALFRIENDS_PHONE_DIRECTORY_CRON_HANDOFF.md)에
있다.

연결된 ERP 상담의 표시명은 정확한 `legalfriends_case_links.case_idx`의 현재 고객명을
우선하되 최초 접수 이름 원장을 수정하지 않는다. 미러 조회 실패나 지연 시 기존 ERP 이름으로
돌아간다. 구 ERP 5분 sync와 새 PostgreSQL 일일 sync는 별도 경로다.

### 4-5. 전화·실시간 업무

센트릭스 수신·발신 관측은 Windows x86/.NET Framework bridge가 ActiveX 이벤트를 받아
DPAPI 내구 큐와 HTTPS/HMAC 인증으로 gateway에 보낸다. bridge는 interactive desktop이
필요하며 평문 자동 로그온을 사용하지 않는다. 직원·endpoint·bridge는 검증된 회선·내선과
`userinfo` 일치가 있어야 연결한다.

통화는 customer root와 개별 leg를 분리한다. 일반 내선, 외부 수·발신, 당겨받기, 호전환은
provider 근거를 보존하고 마지막 고객 leg가 끝날 때 root를 종료한다. 통화 후 호전환의
B/customer final leg처럼 결정적 증거가 없는 경우 최종 통화자를 추측하지 않는다. 전화데스크는
검색형 과거 원장과 열린 재통화 업무 큐를 분리해 누적 조회가 실시간 알림 경로를 막지 않게 한다.
전역 전화 배지는 현재 직원의 열린 재통화 업무와 실제 관련자로 해석된 호전환 `확인 필요`를
합산하며, 관련자를 전혀 찾지 못한 건만 활성 관리자에게 안전망으로 표시한다.

전화·브라우저 Notification·후처리의 상세 기준은 다음 문서를 따른다.

- [`docs/CENTREX_CALL_ACTIVITY_V2.md`](docs/CENTREX_CALL_ACTIVITY_V2.md)
- [`docs/CENTREX_CLICK_TO_CALL_V1.md`](docs/CENTREX_CLICK_TO_CALL_V1.md)
- [`docs/CENTREX_INBOUND_CANARY.md`](docs/CENTREX_INBOUND_CANARY.md)
- [`docs/TELEPHONY_REALTIME_LATENCY.md`](docs/TELEPHONY_REALTIME_LATENCY.md)

### 4-6. 문자·알림톡

센트릭스 SMS/LMS는 직원 개인 전화 회선 대신 활성·인증된 대표 endpoint
`070-4607-0588`을 사용한다. 실제 실행 직원은 별도로 보존하고 발송 당시 표시 발신번호와
회신 mailbox endpoint를 snapshot한다. 수신 문자는 같은 mailbox·상대번호·수신시각 이전의
최신 성공/불명확 발송만 연결한다. 과거 snapshot이 없거나 다른 mailbox면 번호만으로
추측하지 않는다.

SOLAPI JPG MMS는 등록 대표번호 `02-555-7455` 경계를 유지한다. 상담 접수·담당 배정 알림톡은
승인 템플릿만 사용하고 문자 대체 발송을 끈다. 개인정보는 발송 직전에만 복호화하고 outbox와
로그에는 넣지 않는다. 상담완료 후처리는 템플릿 문자와 후기 요청 문자를 독립적으로 선택해
같은 저장 요청에서 실행할 수 있고, 공통 `{{고객명}}` 치환은 유니코드 앞 세 글자만 사용한다.
상세 계약은 다음 문서를 따른다.

- [`docs/CENTREX_MESSAGING_V1.md`](docs/CENTREX_MESSAGING_V1.md)
- [`docs/SOLAPI_ALIMTALK_V1.md`](docs/SOLAPI_ALIMTALK_V1.md)

### 4-7. 후기·기프티쇼

기존 후기는 원본 UID·원문·시각·해시를 보존하되 삭제·PII 검수 상태에 따라 공개를 제한한다.
신규 후기는 별점 없이 분야·작성 단계·경험 키워드·원문을 받고 휴대전화와 원문을 암호화한
검수 대기 원장에 저장한다. 공개 이름은 `김○○ 고객` 형태로 gateway·공개 승격·조회 경계에서
반복 검증한다.

ERP는 후기 원문 열람 감사, 리걸프렌즈 고객·사건 연결, 공개 제한 사유, 공식 답글과 직원별
후기 요청 템플릿을 관리한다. 전용 링크 토큰은 URL fragment와 same-origin POST 검증을 사용해
서버 URL 로그에 남기지 않는다. 기프티쇼 발송은 한 후기당 활성 한 건, 멱등 거래 ID, 발송 직전
상품 재검증, 암호화 수신번호와 감사 원장을 사용한다. 외부 과금 canary는 사용자 승인 아래
별도로 수행한다.

### 4-8. 자가진단·공개 사례·AI

자가진단 v1은 LLM 법률상담이 아니라 고정 입력·제약·가중 거리로 비식별 읽기 모델의 과거
사건을 비교한다. 금액은 원 단위로 받고 10만원 미만 양수는 만원 단위 누락 가능성을 고객이
명시적으로 확인한다. 고객에게 표시한 사례 snapshot은 상담 intake에 암호화해 보존한다.

공개 사례 생성은 원천 메모·진술 원문을 모델에 보내지 않고 코드가 먼저 만든 안전한 범주형
snapshot만 사용한다. 생성 결과는 항상 preview·검수 대기로 시작하고 개인정보·법률 승인과
공개일이 모두 있어야 공개할 수 있다. 과거 사건 이용 근거·희소 조합 재식별 위험·철회 범위와
책임 변호사 문구 심사가 끝나기 전에는 공개 범위를 확대하지 않는다.

상세 계약:

- [`docs/SELF_DIAGNOSIS_V1.md`](docs/SELF_DIAGNOSIS_V1.md)
- [`docs/PUBLIC_CASE_STUDIES_V1.md`](docs/PUBLIC_CASE_STUDIES_V1.md)

OpenAI Realtime STT와 상담 중 제안은 향후 내부 PoC다. 녹취 동의·보관·접근 감사·사람 검토와
실패 처리 경계를 확정하기 전에는 운영 기능으로 간주하지 않는다.

### 4-9. 분석·광고 귀속

first-party 방문 여정과 광고 귀속은 상담 요청별 내부 pathname·허용 광고 식별자만 저장하며
이름·전화·상담 내용과 분리한다. 이 원장이 상담·계약·매출의 기준이며 GA4가 대체하지 않는다.

현재 유효한 runtime Measurement ID가 있으면 별도 팝업 없이 GA4를 자동 로드한다. 정제된
수동 `page_view`와 실제 상담 생성 `generate_lead`만 보내고 민감 query·fragment·연락처·
검색어·상담/진단 값은 보내지 않는다. `analytics_storage`는 측정에 허용하되
`ad_storage`·`ad_user_data`·`ad_personalization`, 향상된 측정, Google Signals, 사용자 제공
데이터와 광고 개인화는 끈다. 개인정보처리방침에는 Google LLC 처리위탁·국외 이전과 브라우저
쿠키 차단·삭제 방법을 유지한다.

GA4의 `generate_lead` 주요 이벤트는 `GA4 관측 리드` 보조 지표다. primary 자동 최적화나
광고 입찰 입력으로 승격하지 않는다. Google Ads·네이버 광고·AdPilot 연결은 별도 승인과
읽기 전용 검증 뒤 진행한다.

- [`docs/GA4_MEASUREMENT_V1.md`](docs/GA4_MEASUREMENT_V1.md)
- [`docs/GA4_OPERATIONS_ACTIVATION_V1.md`](docs/GA4_OPERATIONS_ACTIVATION_V1.md)

### 4-10. 개인 PC 알림

ERP `/desktop-notifications`는 로그인 직원 본인의 Windows 기기를 5분짜리 일회용 코드로
연결하고 상담·전화·문자·후기 알림 9종의 개인 설정을 관리한다. gateway는 기존 업무 원장의
안정적인 이벤트 ID와 대상 판정을 재사용해 직원별 알림을 만들고 payload 전체를 AES-256-GCM으로
암호화한다. 기기 bearer token은 hash만 서버에 저장하고 Windows Credential Manager에만 원문을
보관한다. 재연결 시 최근 원장을 짧게 재생하되 직원·원본 이벤트 unique 경계로 중복을 막고,
만료 pairing·알림은 최소 권한 SECURITY DEFINER 함수로 정리한다.

Windows client는 outbound HTTPS polling만 사용하고 잠금 화면에서는 고객 내용을 숨기며,
deep link는 설정된 ERP same-origin만 연다. 관리 메뉴와 설정 화면은 아직 관리자 전용이다.
조직 Authenticode 서명 전의 ZIP은 운영 다운로드로 제공하지 않고, macOS client와 일반 직원
공개는 서명·배포 채널과 acceptance가 끝난 뒤 별도 승인한다. 외부 URL 웹훅 후보는 폐기됐다.

## 5. 인프라·배포·데이터 보관

### 5-1. AWS 운영 토폴로지

홈페이지·ERP·gateway는 서울 리전의 앱별 EC2로 분리한다. PostgreSQL RDS는 private subnet,
암호화·자동 백업·삭제 방지·TLS `verify-full`·역할별 최소권한을 사용한다. EC2는 SSM으로
관리하고 각 앱의 로컬 디스크나 포트에 다른 앱이 의존하지 않는다. 현재 RDS 기준 클래스는
실제 동시 조회 CPU 포화 뒤 상향한 `db.t4g.xlarge`다.

Route 53 정식 도메인과 HTTPS가 운영 중이며 DNS·EIP·rollback의 상세 원장은
[`docs/PRODUCTION_DEPLOYMENT_V1.md`](docs/PRODUCTION_DEPLOYMENT_V1.md)가 단일 기준이다.

### 5-2. 불변 이미지 배포

표준 경로는 다음 순서다.

1. 완료 작업 브랜치와 migration·영향 앱을 `main`에서 통합한다.
2. GitHub Actions가 test·typecheck·lint·production build를 검증한다.
3. 같은 `main` SHA로 앱별 `linux/arm64` 이미지를 private ECR에 게시한다.
4. migration이 있으면 암호화 snapshot 뒤 같은 gateway digest로 먼저 적용한다.
5. EC2는 tag가 아니라 `repository@sha256:digest`를 pull해 같은 릴리스 ID로 전환한다.
6. 내부·외부 health 성공 뒤에만 current+rollback 이미지 2개와 source release 2개를 남기고
   BuildKit cache 4 GiB hard cap을 검증한다.

GitHub OIDC는 immutable owner/repository 숫자 ID가 포함된 정확한 `main` subject만 신뢰한다.
장기 AWS access key, wildcard subject, 운영 EC2 source build는 표준 경로에 허용하지 않는다.

### 5-3. 로컬·비공개 데이터

WSL PostgreSQL 16의 `lawand_dev`를 지속 개발 DB로 사용한다. `lawand_migrator`는 schema와
migration, `lawand_app`은 public runtime table, `lawand_viewer`는 로컬 조회를 담당한다.
로컬 `lawand_viewer`의 `CB` 편의 권한은 운영 정책으로 승격하지 않는다. 운영 비밀과 연결
문자열은 Secrets Manager와 권한 600 환경파일 경계에만 두며 Git·로그·명령행에 출력하지 않는다.

### 5-4. 녹취 보관 방향

녹취 원본은 사무실 NAS, 재해 복구 사본은 암호화된 클라우드 저장소를 목표로 한다. gateway는
전송 성공 전 임시 원본을 삭제하지 않고 DB에는 파일 대신 상담/사건 ID·경로·SHA-256·시각·길이·
접근 이력을 기록한다. NAS를 인터넷에 공개하지 않는다. WireGuard 경로, 보존 기간, snapshot과
Glacier 정책은 아직 활성 설계 과제다.

## 6. 활성 우선순위와 미해결 결정

완료 체크리스트를 이 문서에 누적하지 않는다. 아래는 실제로 살아 있는 결정만 묶은 것이며
세션별 실행 상태는 [`docs/handoffs/CURRENT.md`](docs/handoffs/CURRENT.md)에서 갱신한다.

### 공개·법률·개인정보

- 홈페이지 핵심 콘텐츠·운영정보와 기존 주요 URL의 유지/단일 301 목록을 최종 검수한다.
- 공개 실무진의 재직·소속팀·담당 단계·사진 사용 동의와 즉시 갱신 원장을 확정한다.
- 자가진단·공개 사례의 이용 근거·희소 조합 일반화·공개/철회·책임 변호사 심사를 완료한다.
- 개인정보 처리위탁·자동 파기와 실제 운영 원장을 정기 대조한다.

### 인증·외부 연동

- ERP 이메일 비밀번호 재설정, 계정 비활성화 UI, MFA/SSO와 외부 rate limit을 설계한다.
- 리걸프렌즈 API의 외부 멱등성·응답 유실 확인 절차를 문서화한다.
- `existing_case` 상담의 검증된 기존 사건 연결도 ERP·gateway 담당자 변경 경로에서 같은
  원장과 외부 성공 후 확정 계약으로 처리한다.
- 연결 사건 고객명의 5분 이내 갱신이 필요하면 일일 전체 snapshot을 무작정 단축하지 않고
  연결 사건명 경량 sync 또는 검증된 timer 변경을 설계한다.
- Solapi 키의 허용 범위를 운영 gateway EIP로 제한하고 최종 발송 결과·실패 알림을 연결한다.
- 상담 담당자 변경 고객 알림톡은 승인 템플릿·대상·시점이 정해진 뒤 별도 이벤트로 추가한다.
- 개인 PC 알림은 조직 Authenticode 서명·정식 artifact 배포와 일반 직원 권한 공개 전까지
  관리자 전용으로 둔다.

### 운영 acceptance

- 센트릭스 일반 내선·무조건/통화 후 호전환·실패 복귀 canary를 다시 수행한다.
- 통화 후 호전환 B/customer final leg는 추가 provider 증거가 없으면 `확인 필요`로 유지한다.
- Windows bridge 조직용 Authenticode 인증서를 발급·배포한다.
- Windows 개인 PC 알림 client도 조직 Authenticode 서명·timestamp와 정식 다운로드 채널을
  마련한 뒤 통제 PC에서 설치·업데이트·제거 acceptance를 수행한다.
- 실제 배정 수가 50개에 가까워지기 전에 Windows 서버 메모리 여유와 인스턴스 상향을 검토한다.
- 통제 JPG MMS 단말 수신, mailbox별 문자 회신, 50건 cursor 경계를 검증한다.
- 네이버 예약 신규 확정 메일과 카카오 홈페이지 접수→직원 확인 흐름을 승인된 canary로 확인한다.
- 과다 상담 접수 구조화 로그를 CloudWatch 경보에 연결하고 필요할 때 단계형 CAPTCHA를 검토한다.

### 다음 제품 후보

- 실시간 전화 담당자 근무현황과 회선 통화 중 여부를 전화데스크에 결합한다.
- 대표전화 근무/휴무·담당자 조건 라우팅은 실제 운영 정책을 먼저 확정한다.
- OpenAI Realtime STT 내부 PoC는 녹취·동의·보관·사람 검토 계약과 함께 시작한다.
- GA4/AdPilot 읽기 전용 관측과 네이버 광고 연결은 별도 승인 게이트 뒤 진행한다.

## 7. 문서 단일 진실원천

| 정보 | 기준 문서 |
| --- | --- |
| 현재 전체 설계·운영 기준선 | `PROJECT_PLAN.md` |
| 다음 세션 상태·활성 우선순위 | `docs/handoffs/CURRENT.md` |
| 작업·통합·배포 상세 이력 | `docs/handoffs/YYYY-MM.md` |
| 압축 전 역사 원문 | `docs/archive/context-pre-compact/` |
| 운영 배포·DNS·rollback | `docs/PRODUCTION_DEPLOYMENT_V1.md` |
| 분야별 세부 계약 | 이 문서 각 절의 `docs/*.md` 링크 |

문서 갱신 규칙은 다음과 같다.

1. 설계나 운영 기준이 바뀌면 이 문서를 제자리에서 수정한다.
2. 진행 중·차단·승인 대기는 `CURRENT.md`에 반영한다.
3. 의미 있는 작업 결과는 월별 원장 맨 아래에 한 번만 append한다.
4. 후보·배포 연대기와 완료 체크리스트를 이 문서나 `AGENTS.md`에 다시 누적하지 않는다.
5. `pnpm docs:context:check`로 기본 컨텍스트 문서의 크기와 역할 경계를 검증한다.
