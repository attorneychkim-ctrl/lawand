# AWS 운영 배포 기준선 v2

기준 시각: 2026-08-12 KST
CloudFormation 스택: `lawand-prod`
리전: 서울(`ap-northeast-2`)
최초 배포 릴리스: `20260804T085006Z-84e8708`
현재 홈페이지 릴리스: `20260810T064408Z-homepage-cutover-ready-v3`
현재 ERP 릴리스: `20260811T104143Z-integrated-call-messaging-v2`
현재 gateway 릴리스: `20260811T104143Z-integrated-call-messaging-v2`
현재 Windows bridge: `v0.8.0.0`

배포 대기: bridge `v0.8.1.0` + migration `0048_centrex_v2_ringing_recovery.sql`.
이 후보는 v2 수신 관측의 `incomingLineNumber` 누락을 고치고 병행 v1 원장에서 빠진
external root/leg를 멱등 복구한다. main 반영만으로 운영 반영으로 간주하지 않는다.

이 문서는 정식 도메인 전환 이후를 포함한 실제 AWS 구성, 접속점, 데이터 이관 범위와
운영 체크리스트를 기록한다. 비밀번호·API 키·AWS 계정 ID·RDS 마스터 시크릿 ARN은
기록하지 않는다.

## 현재 접속점

| 앱 | 정식 HTTPS | 임시 HTTPS / 관리 접속점 | 인스턴스 |
|---|---|---|---|
| 홈페이지 | `https://lawandfirm.com` | `https://15-165-23-84.sslip.io/bank` | `t4g.small`, 30GB gp3 |
| ERP | `https://erp.lawandfirm.com/login` | `https://3-34-72-9.sslip.io/login` | `t4g.small`, 100GB gp3 |
| gateway | `https://api.lawandfirm.com/health` | `https://3-36-255-226.sslip.io/health` | `t4g.medium`, 100GB gp3 |
| Centrex bridge canary | 해당 없음 | `15.165.2.138`(SSM·제한된 RDP 전용) | Windows Server 2022 x64, `t3.medium`, 100GB gp3 |

정식 HTTPS를 운영 접속점으로 사용한다. 기존 EIP·`sslip.io` 주소는 rollback과 운영
진단을 위해 당분간 유지하되 검색 노출, 광고, canonical 주소로 사용하지 않는다. ERP의
운영 세션 쿠키는 `Secure`이므로 실제 로그인 검증과 사용은 반드시 HTTPS 주소로 한다.

2026-08-12 Cafe24 대표 도메인 연결 삭제 없이 Route 53 public hosted zone
`Z04111031FDIY4A1O715I`으로 권한 네임서버 변경을 접수했다. 새 zone은 apex A
`15.165.23.84`, `www` CNAME→apex, ERP A `3.34.72.9`, API A `3.36.255.226`과 기존
`revivetouch` A, wildcard CNAME, Daum MX 2개, SPF TXT를 보존한다. apex·www·ERP·API의
레코드 TTL은 300초이고 메일·legacy TTL은 1,800초다. Cafe24 구 zone과 호스팅·SSL은
삭제하지 않았다. 공개 resolver에 따라 잠시 구 A 또는 새 A가 보이지만 양쪽 HTTPS가
모두 정상이다.

## 실제 AWS 구성

```text
인터넷
  ├─ EIP 15.165.23.84 ─ homepage EC2 ─┐
  ├─ EIP 3.34.72.9   ─ ERP EC2 ───────┼─ private RDS PostgreSQL
  │                      └─ same-origin 상담 SSE 프록시
  └─ EIP 3.36.255.226 ─ gateway EC2 ──┘
                         ├─ 상담 SSE LISTEN/NOTIFY
                         ├─ 리걸프렌즈 outbox worker
                         ├─ 알림톡 outbox worker
                         └─ 네이버 예약 IMAP worker
```

- VPC는 `10.42.0.0/16`이다. 앱은 두 가용영역의 공개 서브넷
  `10.42.0.0/24`, `10.42.1.0/24`에 나눴다.
- RDS 서브넷은 `10.42.10.0/24`, `10.42.11.0/24`이며 인터넷 경로가 없다.
- 앱 서버는 Amazon Linux 2023 ARM64, Docker, 4GB swap, systemd 자동 기동을 사용한다.
- SSH 인바운드는 열지 않았다. 서버 관리는 AWS Systems Manager Session Manager와
  Run Command만 사용한다.
- 공개 인바운드는 각 edge의 80/443뿐이다. gateway의 원본 3022 포트는 홈페이지·ERP
  보안 그룹에서만 접근할 수 있고 인터넷 직접 접속은 차단된다.
- PostgreSQL 5432는 세 앱 보안 그룹에서만 접근할 수 있다. RDS는 public access가
  꺼져 있다.
- EC2 EBS, RDS 저장소와 배포 S3 객체는 암호화했다. 세 EC2에는 API 종료 방지를,
  RDS에는 삭제 방지를, `lawand-prod` CloudFormation 스택에는 종료 방지를 적용했다.
- 배포 S3 버킷은 전체 public access 차단, 버전 관리, TLS 강제, `artifacts/` 30일
  만료 정책을 사용한다. 홈페이지 사용자 파일 저장소로 사용하지 않는다.
- 기본 CloudWatch 경보는 세 EC2 상태, RDS CPU, RDS 여유 저장공간을 감시한다.
  SNS·PagerDuty·텔레그램 같은 실제 통지 대상은 아직 연결하지 않았다. 2026-08-10
  최종 확인에서 센트릭스 5종을 포함한 CloudWatch 경보는 모두 `OK`였다. 2026-08-12
  도메인 전환 점검에서는 전환 전부터 시작된 v2 `call.ringing` 400 dead-letter 때문에
  `lawand-centrex-dpapi-queue` 하나가 `ALARM`이다. queue는 0이고 암호문은 보존했으며 DNS
  원인으로 보거나 임의 삭제하지 않는다.

## RDS 기준선

- PostgreSQL `16.14`, `db.t4g.small`, 단일 AZ
- gp3 30GB, 최대 100GB 자동 확장
- 저장소 암호화, Performance Insights 7일, PostgreSQL 로그 내보내기
- 자동 백업 7일, 시점 복구 활성화, 삭제 방지 활성화
- Node 런타임은 AWS RDS 공식 CA 번들을 포함하고 `sslmode=verify-full`로 인증서와
  호스트 이름을 검증한다.
- `lawand_migrator`, `lawand_app`, `lawand_viewer`를 분리했다. migrator는 public
  마이그레이션과 비공개 `CB` 원천의 생성·동기화를 담당한다. 앱 역할은 공개 사례
  원장을 SELECT만 할 수 있고 `CB`에는 접근하지 않는다. viewer는 기본 트랜잭션
  읽기 전용이며 public과 `CB`를 조회한다.
- RDS 관리형 마스터 시크릿은 평상시 EC2 역할에서 읽을 수 없다. 최초 스키마 구성 때만
  해당 시크릿 하나에 임시 권한을 부여했고 완료 직후 제거했다.
- migration `0022_consultation_sse_notifications.sql`은 상담 outbox INSERT가 커밋될 때
  개인정보 없이 이벤트 ID·유형·상담 ID·발생시각만 PostgreSQL 채널로 알린다. gateway의
  전용 연결만 이 채널을 `LISTEN`하며 RDS를 인터넷에 노출하지 않는다.
- 2026-08-11 기준 migration `0047`까지 48개가 모두 적용됐고 최근 `0042..0047` 파일 해시는
  현재 Git과 일치한다.
  역사적으로 운영에 적용된 `0028_inbound_phone_directory_resolver.sql` 한 개만 현재 파일과
  해시가 다르다. 후속 `0037_phone_desk_directory_context.sql`이 같은 함수 계약을 대체했고
  현재 스키마·권한 검증은 통과한다. 이 예외를 이유로 migration 원장을 수정하거나 0028을
  재실행하지 않는다.

단일 AZ는 초기 비용·운영 복잡도를 낮춘 선택이다. 광고 트래픽을 본격 전환하기 전
Multi-AZ 전환, 수동 스냅샷, 실제 복원 훈련과 경보 통지 연결을 완료한다.

## 운영 DB에 이관한 범위

| 데이터 | 운영 행 수 | 비고 |
|---|---:|---|
| `customer_reviews` | 3,403 | 공개 3,359, 검수 대기 1, 비공개 43 |
| `self_diagnosis_case_profiles` | 1,759 | 회생 1,342, 파산·면책 417 |
| `public_case_studies` | 54 | 개인정보·법률 승인 완료 발행 51, `preview/pending` 3 |
| `staff_users` | 변동 | 2026-08-10 직원 초대·전화 배정 진행 중; ERP 원장을 실시간 기준으로 사용 |
| `CB.TblCBCase` | 9,598 | 공개 사례·자가진단 원천; 운영 앱 직접 조회 금지 |
| `CB.TblCaseMemo` | 202,772 | 사건 메모 원천; 개인정보 가능 원문 포함 |
| `CB.TblMoClientStatement` | 9,402 | 진술·주소·채무상담 원천; 개인정보 가능 원문 포함 |
| `CB.TblCSClient` | 60,947 | 로앤 사무소 고객 이름·전화 검색 최소필드; 운영 앱 직접 조회 금지 |
| `CB.TblCase` | 60,947 | 로앤 사무소 사건 유형·상태·주/부 담당자와 표시 필드 |
| `CB.TblMember` | 69 | 로앤 사무소 담당자 식별자·이름·직책; 비밀번호·개인 연락처 제외 |
| 상담·outbox·알림톡·리걸프렌즈 연결 원장 | 0 | 개발 테스트 데이터 미이관 |

네이버 IMAP mailbox checkpoint 한 건과 후기 import batch는 필요한 참조 원장으로 함께
이관했다. 2026-08-05에는 운영 사례 생성 크론의 원천으로 쓰기 위해 로컬에서 검증한
`CB.TblCBCase`, `CB.TblCaseMemo`, `CB.TblMoClientStatement`도 운영 RDS의 비공개
`CB` 스키마에 추가 이관했다. 이관 전 수동 스냅샷
`lawand-prod-pre-cb-import-20260805`를 만들고, 압축 덤프 SHA-256과 복원 뒤 각 테이블의
행 수·키 범위·최종 수정시각·행 순서 기반 논리 해시가 로컬과 운영에서 일치함을
확인했다. 세 테이블은 `lawand_migrator`가 관리하고 `lawand_viewer`가 읽으며,
`PUBLIC`과 `lawand_app`은 스키마 사용 권한과 테이블 권한이 없다.

2026-08-06에는 수신전화 고객 해석의 리걸프렌즈 차선 원천으로 로앤 사무소
`Office_idx=56`만 선별한 `CB.TblCSClient`, `CB.TblCase`, `CB.TblMember`를 추가 이관했다.
원본 MySQL의 한 consistent snapshot으로 로컬 임시 테이블을 적재·검증한 뒤, 운영 이관 전
암호화 수동 스냅샷 `lawand-prod-pre-phone-directory-20260806`을 만들었다. 비공개 S3
덤프 SHA-256은 `740fe491d3ee4f8fee57ad59960727d4ad1fd17ecedd908bae13f5fdbc4cb72a`이며
AES256 암호화 상태다. 운영 복원은 단일 트랜잭션으로 끝났고 세 테이블의 행 수·키 범위·
최종 수정시각·행별 논리 해시가 로컬과 일치한다. 사건-고객 누락·타 사무소 행·잘못된
전화 검색값은 0건이다. 원본에서 이미 삭제된 담당자 참조 1건은 다른 담당자로 추정하지
않고 미해결 참조로 유지한다. 세 테이블은 `lawand_migrator` 소유,
`lawand_viewer` SELECT 전용이며 `lawand_app`과 `PUBLIC`은 접근할 수 없다.

`public_case_studies` 중 51건은 개인정보·법률 승인 시각과 감사 조건을 갖춰 발행됐고,
나머지 세 건은 `preview/pending` 상태라 목록·상세·sitemap에서 제외한다. 자가진단은 임시
호스트에서 기술 검증을 완료했지만, 과거 사건 이용 근거·희소 조합 재식별 위험·공개 결과
문구에 대한 책임 변호사의 최종 출시 승인을 별도 기록한 뒤 정식 도메인을 전환한다.

## 배포와 재배포

인프라 단일 진실원천은 [`infra/aws/production.yml`](../infra/aws/production.yml)이다.
애플리케이션 이미지는 [`infra/docker/Dockerfile`](../infra/docker/Dockerfile)로 각
EC2에서 ARM64 네이티브 빌드한다. 서버 배포는
[`infra/aws/instance-deploy.sh`](../infra/aws/instance-deploy.sh), 최초 DB 구성은
[`infra/aws/configure-database.sh`](../infra/aws/configure-database.sh)를 사용한다.

운영 시크릿은 다음 네 경계로 분리한다.

- `lawand/prod/database`
- `lawand/prod/gateway`
- `lawand/prod/homepage`
- `lawand/prod/erp`

값은 Secrets Manager와 서버의 권한 600 환경파일에만 둔다. 배포 로그·문서·Git에는
복사하지 않는다. 일반적인 갱신 순서는 아래와 같다.

1. 전체 typecheck·lint·test·build와 migration 검사를 통과한다.
2. Git 추적 파일과 의도한 미추적 소스만 tar로 묶어 private artifact bucket에 올린다.
3. gateway 이미지를 먼저 빌드하고 필요한 DB migration을 적용한다.
4. gateway를 재기동해 health와 세 worker 시작을 확인한다.
5. 홈페이지·ERP를 병렬 배포한다.
6. 내부 health, EIP HTTP의 HTTPS 전환, 외부 HTTPS, 실제 브라우저와 systemd 재기동을
   확인한다.

systemd 앱 단위와 Caddy edge 단위는 부팅 시 자동 시작한다. 최종 검증에서 홈페이지·ERP는
재기동 후 약 1초, gateway는 약 2초 안에 health를 회복했고 실패한 systemd unit과
최근 error priority journal은 없었다.

## 통화 활동 v2·서버 페이지네이션·문자 후속 UX 통합 배포

2026-08-11 HERDR worktree 4개와 원격 `origin/worktree/*` 12개를 전수 대조해 모든 HEAD가
main ancestor임을 확인하고, `main`/`origin/main` `b5f8beb`을 단일 배포 소스로 사용했다.
상담·전화데스크 페이지네이션 브랜치는 `2ef4e02`, U+ 불투명 `SRC`·문자 UX 브랜치는
`c7eb92c`로 병합했다. 통화 활동 root/leg를 `0045_safe_zarek.sql`, 페이지네이션 인덱스를
`0046_small_cargill.sql`, 문자 이미지 URL snapshot을 `0047_wandering_maximus.sql`로
순서화했다.

- 최초 `0045` 적용은 기존 후처리 2건이 관측 통화와 클릭 명령을 함께 참조해 새 source
  제약과 충돌했고 transaction 전체가 롤백됐다. 기존 앱·DB는 변경되지 않았다. 관측 원장을
  동일 UUID call root로 승격하고 기존 observation link를 보존하는 `b5f8beb` 보정 뒤 실제
  double-source fixture가 있는 임시 DB에서 `0042..0047` 전체를 재검증했다.
- 암호화 수동 스냅샷 `lawand-prod-pre-integrated-call-messaging-20260811t102618z`을
  `available`로 확보하고 릴리스 `20260811T104143Z-integrated-call-messaging-v2`를 gateway와
  ERP에 배포했다. private S3 AES256 아티팩트 SHA-256은
  `21a4d992a51a5fe7c0ce8e957d44c3250cedde9d4723f9fb446a1d0001417d11`이다. gateway 이미지
  ID는 `sha256:10df1494e899cbd6709f107027de25e7884ecca289a441bbd371ddc29e44d5e2`, ERP는
  `sha256:c3047d33f51c98888fafc6759bbd29f95347d2c1f570c00789584eca4625d445`다.
- migration 뒤 수·발신 295건은 call root/leg 295쌍, 연결 누락 0이다. 후처리 35건과 재통화
  10건을 모두 보존했고 source 위반 0이다. 기존 MMS 52건 중 발송 snapshot과 현재 템플릿
  파일이 같은 40건만 이미지 URL을 보강했으며 비-MMS 오보강은 0이다. 페이지네이션 인덱스
  세 개와 신규 통화 테이블의 앱 CRUD·viewer SELECT·PUBLIC 0 권한도 확인했다.
- Windows bridge는 활성 통화·root/leg·받기/발신/프로비저닝/문자 명령·회선 중복 0을 연속
  확인한 뒤 공용 실행 파일을 v0.8.0.0으로 교체했다. 첫 시도는 supervisor 범위 밖의 기존
  `canary-4591` task가 자동 시작되지 않아 23/24에서 v0.7.2로 자동 원복했고, 원복 뒤 24개·
  health 정상화를 확인했다. 재시도에서는 해당 task만 명시적으로 시작해 배정 19+warm 5,
  프로세스 24개 모두 v0.8.0.0, 오프라인·로그인 실패·DPAPI queue·dead-letter 0을 확인했다.
  v0.8 SHA-256은 `312764133521E634EDAAF0820F4F44F953E41EEE34CD50BBF96B94F3BF0CA46B`,
  rollback v0.7.2는 `C4453BC29FC3AA541EF2C18CA2E479E7E44CF487BFAF14E6C817B4CA308A7012`다.
  staging에만 허용한 임시 S3 읽기 IAM 정책은 제거했다.
- 인증 smoke는 상담·전화데스크의 page 1/20 계약, 빈 통화 활동 snapshot, 문자 82건과
  대표 mailbox 7개, ERP 상담·전화데스크·문자 화면을 모두 200으로 확인했다. mailbox 7개는
  최근 동기화·오류 0이고 임시 세션은 삭제했다. gateway·ERP·각 Caddy active, 컨테이너
  재시작·error journal 0, 외부 health/login 200, CloudWatch 전체 ALARM 0이며 센트릭스
  5종도 모두 OK다. 이번 배포에서는 실제 전화나 문자를 새로 만들지 않았다.

## 대표 문자 수신함·U+ 수신 이력 보정 통합 배포

2026-08-11 HERDR 워크트리와 모든 로컬·원격 `worktree/*` HEAD가 `main`에 포함된 것을
확인하고 릴리스 `20260811T035307Z-centrex-message-inbox-v1`을 gateway·ERP에 배포했다.
배포 소스는 `main`/`origin/main` `22ec16a`다.

- root Turbo 5개 패키지 typecheck·lint·production build, core 62개·gateway 97개 테스트,
  Drizzle schema check와 `git diff --check`를 통과했다. HERDR 워크트리마다 달랐던 `pnpm`
  실행 경로는 Corepack 11.17.0 사용자 공용 `~/.local/bin` shim으로 통일했다.
- private S3 AES256 아티팩트 SHA-256은
  `9787c5c93fd5c8cf87374c4be13374671e2f521d04f816ed83ccf825f4b13ec3`이다. gateway 이미지
  ID는 `sha256:9e8f0826d7ec5c8fa33abd03fde258d5e6a3878dda2763e6d9ce9ef148caa4a2`, ERP 이미지 ID는
  `sha256:683b11925237096d300db694cd34267071877ea2dc4350951a2d39ea37838ea7`이다.
- 암호화 수동 스냅샷 `lawand-prod-pre-centrex-message-inbox-20260811t035307z`을 available까지
  확인하고 migration `0044_sturdy_preak.sql`을 적용했다. 운영 migration은 45개이고 최신
  해시 `a3a1a052348fb1c7c7ee770529673fe8fcc945d751d47d9f7c1064220dd1f0e2`가 Git과 일치한다.
  신규 수신·mailbox 상태 테이블, 앱 CRUD·viewer SELECT 전용·PUBLIC 조회 차단과 대표
  endpoint 7개·활성/인증/binding 0을 확인했다.
- gateway와 ERP 새 이미지는 운영 전 별도 내부 포트에서 워커를 끈 채 health를 통과했다.
  업무 통화가 계속 이어져 통화 자체가 아니라 실행 중 통화·받기·문자 명령과 통신 outbox,
  회선 중복을 0으로 확인한 뒤 gateway만 짧게 전환했다. Windows bridge의 DPAPI 큐를
  안전망으로 유지하고 Caddy·Windows는 재시작하지 않았다. 새 gateway는 시작 2초 뒤 기존
  U+ `ringing` 고착 2건을 제공자 이력으로 실패 없이 복구했고 실제 연결 통화는 보존했다.
- 인증 ERP `/messages`, `/message-templates`→`/messages`, `/clients`, `/phone-desk`,
  `/profile`은 모두 200이다. 문자 API는 기존 대화 12개와 비활성 대표 mailbox 7개를
  반환했고 임시 세션은 0건으로 삭제했다. 대표 계정 비밀번호는 현재 secret에 없으므로
  TTY `userinfo` 검증 연결과 실제 수신 backfill·통제 회신 canary는 별도다.
- 배포 직후 gateway·ERP·각 Caddy active, systemd·컨테이너 재시작 0, error journal 0,
  외부 health/login 200, CloudWatch ALARM 0이었다. Windows도 설치 51, 배정 18+warm 5,
  실행 23, 오프라인·로그인 실패·DPAPI 큐·dead-letter 0, supervisor 정상이었다. 실제 업무
  통화가 이어지는 동안 회선 중복과 실행 명령은 0이었고 기존 SOLAPI MMS 실패 4건과 일반
  업무 pending outbox 9건은 변경하거나 재시도하지 않았다.
- 지연 검증에서는 서비스·이미지·재시작·외부 HTTPS가 계속 정상인 가운데
  `lawand-slot-017` 한 개가 성공 로그인 뒤 `STATUS=-1(NotFound)` 재접속을 반복해
  `lawand-centrex-login-failures` 하나만 ALARM으로 바뀌었다. 배정 18+warm 5와 실행 23,
  assigned offline 0, DPAPI 큐·dead-letter 0, supervisor와 DB heartbeat는 정상이다.
  사용자가 같은 직원의 다른 장소 로그인 가능성이 높다고 알려와 외부 중복 로그인 충돌로 추정하고,
  실제 통화를 보호하기 위해 슬롯 강제 종료·재배정·DB 보정은 하지 않았다. 외부 로그인이
  끝나면 자동 `STATUS=1` 복구와 경보 해제를 확인한다.

## ERP 고객 문자·개인 템플릿 운영 배포

2026-08-10 HERDR 관리 워크트리와 모든 `origin/worktree/*`를 대조해 누락된 문자 기능
브랜치를 `main`에 통합했다. 고객 찾기 migration `0040`은 그대로 두고 문자 migration을
`0041_late_talon.sql`로 재생성했으며, 릴리스
`20260810T090235Z-customer-messaging-v1`로 gateway와 ERP를 함께 운영 배포했다.

- 배포 전 암호화 수동 스냅샷
  `lawand-prod-pre-customer-messaging-20260810t090235z`을 available까지 확인했다. private
  S3 AES256 아티팩트 SHA-256은
  `a63e291ff57ec819df258347d7ecf084371aa6824c01dbd401f850df77cb19ec`이다.
- gateway 이미지 ID는
  `sha256:0d54f035cc5576f13bdde9b72e7e7a0c079d85deaa7c8996cfc890849ff9deb2`, ERP 이미지
  ID는 `sha256:cba22b9b1a3bc1b744954fdd3fee1608f5fe618372553a027ea44ead86973da2`다.
- 운영 migration 원장은 42개다. `message_templates`·`telephony_messages`, 기본 템플릿
  3개, `lawand_app` CRUD, viewer 읽기 전용, `PUBLIC` 권한 0을 확인했다. 인증 ERP의
  `/message-templates`와 통제 상담 상세는 각각 200으로 템플릿 화면·`문자 보내기`·발송 완료
  원장을 렌더했고 임시 직원 세션은 0건으로 정리했다.
- 사용자 지정 통제 수신자에게 정상 담당자 API→outbox→센트릭스 worker로 실제 SMS 한 건을
  발송했다. API 201, 42바이트 SMS, 제공자 코드 `0000`, outbox published, 1회 delivery
  HTTP 200·succeeded를 확인했다. 통제 상담은 실제 발송 감사 원장을 보존한 채 `closed`
  처리했으며 전화번호·본문은 로그와 문서에 남기지 않았다.
- 2026-08-10 SOLAPI 활성 발신번호 목록에서 운영 계정의 `010-****-1382`를 확인하고
  `LAWAND_SOLAPI_MMS_SENDER`로 Secrets Manager와 실행 중 gateway에 적용했다. 기존 gateway
  이미지 그대로 재시작해 내부·외부 health와 worker 대기열을 확인했으며 명함 JPG MMS 실제
  수신 canary만 남았다.
- 최종 gateway·ERP·각 Caddy는 active, 컨테이너 재시작·릴리스 뒤 error journal 0,
  외부 health/login 200이고 CloudWatch ALARM은 없다. Windows bridge는 배정 11·warm 5,
  v0.7.1.0 프로세스 16개, 오프라인·로그인 실패·DPAPI 큐·dead-letter 0이며 감독기와
  health task 결과도 0이다. 활성 통화와 회선별 활성 중복은 최종 읽기 시점에 모두 0이다.

후속 개인 템플릿 단순화와 ERP 내 정보 기능은 같은 날 릴리스
`20260810T135657Z-profile-message-templates-v1`로 gateway·ERP에 함께 배포했다.

- `main`/`origin/main` `adf6f51`과 모든 HERDR·`origin/worktree/*` HEAD의 포함을 확인했다.
  전체 typecheck·lint·build, core 61개·gateway 87개 테스트와 migration 검사를 통과했다.
- 암호화 스냅샷 `lawand-prod-pre-profile-message-templates-20260810t135657z`, private S3
  AES256 아티팩트 SHA-256
  `e573a078437bd7a0b69d8d83c7f03ecccbfc7bfb77c37af02eea65b14af39d53`을 확보했다. gateway
  이미지 ID는 `sha256:41ee1ea5ff2bec02ca858085ef630b7a0492e5b3c2d3f87775f5f3470aba5e8a`, ERP 이미지
  ID는 `sha256:ee0af07f59132c2c225669e2627dfc6dc6f8e7f48377a5a4a6a430cce4f052ed`다.
- migration `0042_bright_midnight.sql` 적용 뒤 운영 원장은 43개이고 Git 해시와 일치한다.
  기본 템플릿 0·개인 템플릿 7, 소유자 `NOT NULL`, `is_active` 제거, 발송 FK `SET NULL`,
  `lawand_app` CRUD·viewer 읽기 전용·PUBLIC 권한 0을 확인했다.
- 인증 ERP `/profile`, `/message-templates`, `/staff`는 200이고 임시 세션은 0건이다.
  최종 활성 통화·회선 중복·통화/문자 명령·문자 pending/dead/실패는 모두 0이다. gateway·
  ERP·Caddy active, 재시작·error journal·CloudWatch ALARM 0, 외부 health/login 200이다.
  Windows bridge는 재시작하지 않았고 v0.7.1.0 프로세스 16, 배정/연결 11, warm 5,
  오프라인·로그인 실패·DPAPI 큐·dead-letter 0을 유지한다. 실제 JPG MMS canary는 별도다.

후속 고객 찾기 문자와 ERP 프로필 입력·전화 내선 표시 수정은 릴리스
`20260810T231946Z-client-directory-messaging-v1`로 gateway·ERP에 함께 배포했다.

- 배포 소스는 `main`/`origin/main` `b6c6afc`이며 HERDR 작업트리와 모든 로컬·원격
  `worktree/*` HEAD가 main ancestor다. 전체 typecheck·lint·build, core 61개·gateway
  87개 테스트, schema check와 `git diff --check`를 통과했다.
- 암호화 스냅샷 `lawand-prod-pre-client-directory-messaging-20260810t231946z`, private S3
  AES256 아티팩트 SHA-256
  `021b7c4787b2fd9738d0b452c98801c9e8c352febe53c48f4147c5e9a5823383`을 확보했다. gateway
  이미지 ID는 `sha256:781b4420ef8f78113631268a53a392435270be46c920acef3d11c47d56beb2f0`,
  ERP는 `sha256:b7175abae52e6ce80e1768d48383b7107eca80d7462e45576b504d5bec3add67`이다.
- migration `0043_famous_rafael_vega.sql` 적용 뒤 운영 원장은 44개이고 최신 해시는
  `03ec720269d34ad1693c7849bf3267a364b3b93a0163b090b8b35591a326737c`로 Git과 일치한다.
  기존 상담 문자 2건, 신규 대상 원장, `target_source NOT NULL`, 앱 CRUD·viewer SELECT
  전용·PUBLIC 권한 0을 확인했다.
- gateway 전환 직전 업무 통화 1건을 감지해 아무 상태도 바꾸지 않고 중단했으며 자연 종료와
  연속 0건 확인 뒤 다시 전환했다. Windows bridge는 재시작하거나 원장을 보정하지 않았다.
  인증 ERP `/clients`, `/profile`, `/message-templates`, `/phone-desk`는 모두 200이고 임시
  세션은 0건이다. smoke는 발송하지 않았지만 직후 직원이 요청한 고객 찾기 LMS 1건이
  Centrex `succeeded`·outbox `published`로 완료됐다.
- 사용자가 EBS를 100GiB로 증설한 뒤 OS 파티션이 기존 ERP 30GiB·gateway 40GiB·Windows
  C: 30GiB에 머문 것을 확인해 서비스 중단 없이 세 파일시스템을 100GiB로 확장했다. 최종
  여유는 ERP 약 76GB, gateway 약 64GB, Windows 약 79.31GB다.
- 최종 gateway·ERP·Caddy active, systemd·컨테이너 재시작 0, error journal 0, 외부
  health/login 200, CloudWatch ALARM 0이다. 활성 수·발신·회선 중복·통화/문자 명령·문자
  pending/dead/실패는 0이고 일반 업무 pending outbox 9건은 변경하지 않았다. Windows는
  v0.7.1.0 프로세스 16, 설치 51·배정/연결 11·warm 5, 오프라인·로그인 실패·DPAPI 큐·
  dead-letter 0이며 감독기·health task 결과도 0이다.

고객 찾기 릴리스 뒤 실제 직원 JPG MMS 네 건이 SOLAPI 등록 단계에서 공통
`1010(필수 입력 값 미입력)`으로 실패했다. 발신·수신번호, 본문, 이미지 ID는 정상이고
`strict: true`의 MMS 제목 검사에 필요한 `subject`만 누락된 원인이었다. 동일 실패 요청에
40바이트 이하 고정 제목을 추가한 비발송 임시 그룹은 `2000` 정상 접수됐고 즉시 삭제됐다.

- 수정 커밋은 `352ff00`, gateway 전용 릴리스는
  `20260811T001012Z-solapi-mms-subject-v1`이다. private S3 AES256 아티팩트 SHA-256은
  `370c29644ce0b04aa724cfc32835fafca2071c74a8e30cf906aed98492c0cb94`, gateway 이미지
  ID는 `sha256:6bdf549bc28c9263481390bf9bbe77e5089de7ff6915304fb3dd223c4cbe3a6c`다.
- gateway 87개 테스트·typecheck·lint·production build와 `git diff --check`를 통과했다.
  전환 직전 활성 통화·통화 명령·문자 명령·문자 pending outbox가 연속 두 번과 명령 내부
  gate에서 모두 0임을 확인했다. gateway만 재시작했고 ERP·Caddy·Windows bridge는
  재시작하지 않았다.
- 수정 전 실패 네 건은 감사 원장과 dead outbox에 보존했으며 재시도·보정하지 않았다.
  최종 gateway·ERP·Caddy active, 컨테이너 재시작 0, gateway error journal 0, 외부
  health/login 200, CloudWatch ALARM 0이다. 실제 JPG 단말 수신 canary는 별도다.

## ERP 리걸프렌즈 고객 찾기 운영 배포

2026-08-10 메인 누적 작업을 릴리스 `20260810T082342Z-client-directory-v1`로 묶어
migration `0040_wandering_lenny_balinger.sql`, gateway, ERP를 함께 운영 배포했다.
홈페이지에는 영향이 없어 재배포하지 않았다.

- 배포 전 암호화 수동 스냅샷 `lawand-prod-pre-client-directory-20260810t082342z`을
  `available`까지 확인했다. private S3 AES256 아티팩트 SHA-256은
  `b234c43f376b331c2527cd4f6b26f092e9491d1ed1f2440f076f7b0d3948c978`이다.
- gateway 이미지 ID는
  `sha256:60a791d7e6b70af332e99a3cb3da548f81bd3623077d5269cd5aa1fb03906546`,
  ERP 이미지 ID는
  `sha256:1a8217d9d0a51c8e7a67c6ed05ba657ef85860ef23d9aee21a841e4592420966`이다.
- migration 적용 뒤 `lawand_app`의 고객 검색·발신 대상 함수 실행과 신규 대상 원장 접근,
  `PUBLIC` 함수 실행 차단, `CB` 직접 조회 차단, 삭제 사건 발신 대상 제외를 확인했다.
  인증된 ERP `/clients`는 200과 `고객 찾기`를 렌더했고, 한 글자 검색은 400으로 거부되며
  검색 감사도 만들지 않았다. 임시 직원 세션은 삭제해 잔존 0건이다.
- 실제 고객 찾기 발신은 실행하지 않았다. 배포 뒤 고객 찾기 발신·대상 원장과 알림톡
  발송은 각각 0건이며 알림톡·리걸프렌즈 외부 실행 대기도 0건이다. 이 기능은 문자나
  알림톡을 보내지 않고 센트릭스 전화 걸기만 명시적 사용자 동작으로 요청한다.
- 긴 업무 통화가 진행 중이어서 Windows bridge나 전화기 세션은 재시작하지 않고 gateway만
  교체했다. bridge의 DPAPI 큐·dead-letter는 0, 배정 11·warm 5·실행 16, 오프라인·로그인
  실패 0, 감독기 정상이고 회선별 활성 통화 중복도 0이다. 최종 확인 시 새 업무 통화가
  계속 유입돼 활성 통화 수는 동적 값이었으며 통화를 강제 종료하거나 원장을 보정하지 않았다.
- gateway·ERP·Caddy는 active, systemd·컨테이너 재시작 0, 릴리스 뒤 error journal 0,
  내부·외부 health 200이다. 센트릭스 5종과 나머지 CloudWatch 경보도 모두 `OK`다.

## ERP 상담 실시간 갱신

2026-08-05 릴리스 `20260805T013748Z-84e87082-sse`로 ERP 상담 데스크의 SSE 실시간
갱신을 운영 배포했다.

- gateway는 PostgreSQL `LISTEN/NOTIFY`를 받아 인증된 직원 세션에만 SSE 이벤트를
  전달한다. 20초 heartbeat와 3초 재연결 지시를 사용하고, 재연결 뒤에는 동기화 이벤트로
  중단 구간의 누락을 보정한다.
- ERP 브라우저는 내부 키나 gateway 세션을 직접 받지 않고 ERP의 same-origin 서버
  프록시만 구독한다. 이벤트가 도착했을 때만 상담 목록을 다시 조회하며 주기적 폴링은
  사용하지 않는다.
- 배포 전 암호화 수동 스냅샷 `lawand-prod-pre-sse-20260805`를 만들었다. 배포 아티팩트는
  private S3의 `artifacts/releases/20260805T013748Z-84e87082-sse.tar.gz`이며 SHA-256은
  `8d3250998355d1ff6e20c0442a38cbf5c34f931dd2b07cbc4076c2e2a2ea9ccb`다.
- 운영 ERP 프록시에서 임시 직원 세션과 단일 트랜잭션 outbox 이벤트로 canary를 수행해
  `consultation.sync`와 `consultation.changed`를 모두 수신했다. 트랜잭션 안에서 canary
  행을 제거하고 임시 세션도 삭제해 상담·outbox는 각각 0건을 유지했으며 알림톡이나
  리걸프렌즈 실행은 만들지 않았다.
- 실제 Chrome의 운영 ERP에서 `실시간 연결됨` 상태를 확인했다. ERP·gateway의 systemd와
  Caddy는 active이고 당일 error priority journal, 실패 unit, CloudWatch ALARM은 없다.

## ERP 센트릭스 전역 수신 표시

2026-08-06 릴리스 `20260806T020118Z-centrex-inbound-step3`으로 Windows bridge의 수신
원장을 ERP 모든 인증 화면의 상단 수신 바까지 연결했다.

- `telephony_inbound_events` commit 트리거는 전화번호가 없는 event ID·call ID·상태·시각만
  PostgreSQL `NOTIFY`로 보낸다. gateway 전용 `LISTEN` 연결과 인증 SSE를 거쳐 ERP의
  same-origin 프록시에 전달한다.
- ERP는 연결·재연결마다 권한 있는 스냅샷을 읽고 이후 이벤트가 올 때만 다시 읽는다.
  2026-08-06 후속 릴리스 `20260806T022927Z-centrex-inbound-full-number`부터 인증된
  브라우저에는 복호화한 전체 번호·내선·활성 회선 담당자를 전달한다. 같은 시각 여러
  통화가 오면 조회 개수를 임의로 자르지 않고 통화 ID별 카드로 모두 표시한다. DB의
  AES-GCM 암호화·HMAC 검색 지문은 유지하며 `NOTIFY`·SSE·로그에는 번호를 넣지 않는다.
- DB 변경 전 암호화 스냅샷 `lawand-prod-pre-centrex-inbound-ui-20260806`을 available까지
  확인했다. private 배포 아티팩트 SHA-256은
  `a5fa84d59a150c4db8d83d0412e7a87457e6f2e1915c920d4707454fec572ef5`이고 S3 AES256을
  확인했다.
- 같은 트랜잭션에서 임시 통화·이벤트를 삭제한 비식별 canary로 trigger→gateway의
  `telephony.inbound.sync`와 `telephony.inbound.changed`를 받았다. ERP 프록시의 스냅샷·
  SSE는 각각 200, PII 필드는 0건이었고 임시 통화·이벤트·세션·스크립트는 남지 않았다.
- 첫 3단계 배포 뒤 실제 신규 수신을 사용자가 ERP에서 확인했다. 최신 건은 약 13.6초 동안
  울린 뒤 연결 없이 `ringing → ended(HCAUSE=16)`로 종료됐고, Windows bridge 작업과
  프로세스는 각각 하나·미전송 큐는 0건이었다. 후속 전체 번호 릴리스 아티팩트 SHA-256은
  `88ad7830b60688e854bb44ef00542212acf4155ab57c8a96a62526bf34290732`이고 S3 AES256을
  확인했다. gateway·ERP 컨테이너는 재시작 0회, systemd·HTTPS·gateway health가 정상이며
  error journal과 CloudWatch ALARM은 없다.
- 고객 해석 릴리스 `20260806T031115Z-inbound-directory`는 수신번호를 ERP 상담데스크에서
  먼저 찾고, 없으면 로앤 사무소로 제한한 `CB.TblCSClient`·`TblCase`·`TblMember`를
  최소권한 함수로 조회한다. 상담데스크 일치 시 상세 링크와 고객·상태·담당자, 리걸프렌즈
  일치 시 고객·사건유형·진행상태·담당자, 미일치 시 `발신자 정보 없음`을 표시한다.
  적용 전 암호화 스냅샷 `lawand-prod-pre-inbound-directory-20260806`을 만들었다. private
  S3 아티팩트는 AES256이며 SHA-256은
  `08e0364be3f5a1b1ad3d40d15b7114ea52ca7d997a576aead1ba30bfb02f2107`이다.
  gateway·ERP 모두 같은 릴리스이며 ERP 컨테이너 재시작 0회, 최근 error journal과
  CloudWatch ALARM 0건, 외부 HTTPS 로그인 200을 확인했다.
- 고객명 미표시 제보 시각의 실제 수신 원장을 배포 뒤 snapshot으로 다시 해석해
  상담데스크 우선 일치와 고객명 `김충환3_테스트` 반환을 확인했다. 번호 암호화·HMAC
  검색 지문과 복호화 재계산도 일치했으므로, 원인은 고객 해석 릴리스 전부터 열려 있던
  ERP 탭의 이전 JavaScript bundle이다. 새 배포 뒤 기존 브라우저 탭은 한 번 강력
  새로고침한다.
- 릴리스 `20260806T035011Z-centrex-answer`는 회선 담당 직원에게 `ringing` 통화의
  `전화 받기`를 제공한다. gateway가 20초 유효한 통화별 단일 명령을
  `telephony_inbound_commands`에 기록하고, Windows bridge v0.3.0.0이 750ms signed GET
  poll로 가져가 WinForms STA에서 OCX `Answer()`를 실행한 뒤 signed POST로 결과를
  반환한다. method·정확한 path·body hash, 5분 시각창, nonce 재사용 방지와 고정
  bridge/endpoint 연결을 검증하며 자동 수신·PC 음성 스트리밍은 하지 않는다.
- 적용 전 암호화 스냅샷 `lawand-prod-pre-centrex-answer-20260806`을 available까지
  확인했다. 전체 private S3 아티팩트 SHA-256은
  `2ec80f95d53988e1ccc8bb05e5f345927986e2105fbb68ce45d65e99d1afc654`, Windows bridge
  실행 파일 SHA-256은
  `c4c5d7f00cae091224ab041ddc1066d95e8453581affb4458d92545c6111caf2`다. gateway·ERP와
  Caddy는 새 이미지로 재시작 0회, bridge task는 `Running`·프로세스 1개이고 외부 ERP
  로그인·gateway health는 200이다. error journal·CloudWatch ALARM·운영 answer 명령은
  모두 0건이다. 실제 수신 중 ERP 버튼으로 물리 전화기 스피커폰이 연결되는 마지막
  운영 canary는 사용자 통화로 수행한다.
- 첫 실제 재시험에서는 고객명까지 정상 표시됐지만 운영
  `staff_telephony_bindings`가 0건이라 `전화 받기`의 회선 소유자 조건을 만족하지 못했다.
  활성 직원 김충환과 활성 대표전화 내선 4591이 각각 정확히 한 건이고 다른 소유자가
  없음을 확인한 뒤 주 회선·활성 매핑을 단일 트랜잭션으로 생성했다. 결과는
  `primary=true`, `active=true`이며 `telephony.centrex_endpoint.linked` 감사 기록을
  남겼다. 이후 같은 직원 ID로 로그인한 ERP 세션에만 해당 회선의 받기 버튼을 표시한다.

## 직원 센트릭스 전체 회선번호

2026-08-06 릴리스 `20260806T045120Z-staff-centrex-line`으로 직원 초대·가입·관리에서
전체 070 센트릭스 회선번호를 보존한다.

- 초대 생성 시 전체 번호를 선택적으로 지정하고 초대 대상자가 확인한 뒤 가입하면
  `staff_profiles.centrex_line_number`로 전달한다. 하이픈은 제거해 숫자 11자리로 저장하며
  070 형식은 core와 DB check constraint가 함께 검증한다. 내선은 뒤 4자리로 계산할 뿐
  별도 저장하지 않는다.
- 기존 직원은 관리자 화면에서 전체 번호를 수정하거나 비울 수 있다. 감사 로그에는 전체
  번호를 복제하지 않고 설정 여부와 마지막 4자리만 남긴다. 이 지정 번호는 기존
  `staff_telephony_bindings`와 분리되어 이번 릴리스만으로 자동 전화 권한을 만들지 않는다.
- migration `0030_outgoing_garia.sql`은 기존 활성 주 회선 binding이 있는 직원의 전체
  번호를 한 번 백필했다. 적용 전 암호화 스냅샷
  `lawand-prod-pre-staff-centrex-line-20260806`을 available까지 확인했다. 운영 컬럼 2개,
  프로필–binding 일치 1건, 받기 명령 0건을 검증했다.
- private S3 아티팩트는 AES256이며 SHA-256은
  `ad25594371681d4eb4c22ee89ad045222b93b54b9a78ae6da915276063786742`다. ERP·gateway
  컨테이너 재시작 0회, 양쪽 외부 HTTPS 200, error journal과 CloudWatch ALARM 0건이다.
  673px 실제 운영 Chrome 직원관리에서 초대 입력과 기존 직원 전체 번호 렌더를 확인했으며
  저장·초대 생성은 수행하지 않았다.

## 직원별 센트릭스 회선·내선·비밀번호 검증

2026-08-07 릴리스 `20260807T011028Z-centrex-staff-credentials`로 직원관리에서 전체
회선번호·내선번호·현재 비밀번호를 한 번에 검증하고 실제 전화 제어 endpoint에 배정한다.

- 저장 요청은 U+ `userinfo`에 전체 회선번호를 로그인 ID로 전달한다. 반환된 전체
  회선번호와 내선번호가 입력값과 정확히 일치할 때만 직원 프로필, endpoint, 주 회선
  binding을 단일 트랜잭션으로 갱신한다. 검증 실패 시 기존 배정은 유지한다.
- 비밀번호 원문은 ERP·gateway의 로그·감사 원장·DB·Secrets Manager에 저장하거나 다시
  표시하지 않는다. gateway 요청 메모리에서 즉시 SHA-512로 변환하고, 그 값만 endpoint
  ID를 AAD로 한 AES-256-GCM 암호문으로 `telephony_endpoint_credentials`에 저장한다.
  `lawand_app`만 필요한 CRUD 권한을 가지며 `lawand_viewer`와 `PUBLIC`의 SELECT는 명시적으로
  차단했다. 기존 Secrets Manager 자격증명 맵은 DB 값이 없는 endpoint의 읽기 fallback이다.
- 운영 RDS 변경 전 암호화 스냅샷
  `lawand-prod-pre-centrex-credentials-20260807`을 available까지 확인하고 migration
  `0033_icy_starfox.sql`과 `0034_smooth_pandemic.sql`을 적용했다. 배포 직후 인증 행은
  0건이며 사용자가 직원관리에서 검증·저장하면 생성된다.
- private S3 아티팩트는 AES256이며 SHA-256은
  `6102a8e8b7049be7c0820651cb94333db31486a64a52efe612c51075f68b4477`이다. gateway·ERP·
  Caddy는 active, 양쪽 컨테이너 재시작 0회, 외부 health·로그인 200, error journal과
  CloudWatch ALARM 0건이다. 배포 전후 진행 중 관측 통화·받기 명령·클릭투콜 명령과
  전송 대기는 모두 0건이었다.
- 673px 실제 운영 Chrome에서 필터와 전체 회선번호·내선번호·비밀번호 입력, 검증 버튼의
  일관된 다크 테마와 정상 폭을 확인했다. 현재 직원 지정값 07046074535·내선 4535와 기존
  검증 endpoint 07046074591·내선 4591의 차이는 `배정 불일치`로 표시된다. 비밀번호를 대신
  입력하거나 저장하지 않았으므로 4535 `userinfo`와 실제 발신 canary는 사용자 작업으로
  남아 있다. 4535의 수신·받기·직접 발신 관측에는 별도의 Windows bridge 등록도 필요하다.

## 직원 센트릭스 원클릭 통합 연결

2026-08-07부터 직원 한 명은 활성 Windows bridge 하나만 점유하고, 회선을 바꿀 때 같은
bridge 슬롯을 재설정한다. 직원관리의 `회선 테스트 및 저장` 한 번이 클릭투콜과
수신 감지·전화 받기를 함께 연결한다.

- migration `0035_natural_greymalkin.sql`은
  `staff_telephony_bridge_assignments`를 추가한다. 직원·bridge 각각 활성 배정은 하나뿐이고
  현재·대기 endpoint, 프로비저닝 명령·만료, heartbeat와 실제 로그인 결과를 기록한다.
- 저장은 먼저 U+ `userinfo`로 전체 회선·내선을 정확히 검증하고 클릭투콜용 SHA-512만
  기존 AES-GCM 경계에 저장한다. raw 비밀번호는 DB·로그·감사 원장·Secrets Manager에
  저장하지 않는다. gateway는 기존 bridge HMAC secret에서 파생한 AES-256-CBC·HMAC-SHA256
  키로 단기 자격증명 명령을 암호화해 현재 bridge에 전달한다.
- Windows bridge v0.5.0은 활성 수신·발신 통화가 없을 때만 Windows 자격 증명 관리자와
  endpoint 설정을 원자적으로 교체한다. 실제 OCX 로그인 결과의 회선·내선이 입력과
  일치해야 성공을 보고하며 거부·불일치·네트워크 오류·시간초과 시 이전 자격증명과
  endpoint로 자동 복구한다. gateway도 직원 프로필과 주 회선 binding을 이전값으로
  보상한다.
- bridge의 서명 polling이 15초 간격으로 DB heartbeat를 갱신한다. 프로세스 온라인과
  센트릭스 로그인 성공을 분리해, 배정·heartbeat만 있는 상태는 `브리지 설정 대기`,
  실제 로그인 성공 뒤에만 `전체 전화 연결 완료`로 표시한다.
- 운영 변경 전 암호화 스냅샷
  `lawand-prod-pre-centrex-oneclick-20260807`을 available까지 확인했다. ERP 릴리스는
  `20260807T022953Z-centrex-oneclick`, gateway 최종 릴리스는
  `20260807T023907Z-centrex-oneclick-status`다. private S3 최종 gateway 아티팩트는
  AES256이고 SHA-256은
  `61d34cc11ee7d5499dff9ee57605526fc2ee0eb4f98dd913d07d728a01f5d302`다.
- Windows x86 v0.5.0.0은 self-test 10개를 통과했고 SHA-256은
  `226ebc46aa380a1385e75ea40faa5923a6b4470880f9a2b6b0c94e30f2fb4339`다. 기존 v0.4.0.0은
  서버에 복구용으로 보존했다. 작업 스케줄러 Running, 프로세스 1개, DPAPI 큐 0건이며
  gateway heartbeat가 정상이다.
- 배포 후 임시 5분 직원 세션 canary에서 직원 4591은 `bridge_pending`, bridge 설정·온라인
  true, 상태 `assigned`로 반환됐고 임시 세션은 0건으로 정리했다. gateway·ERP·Caddy는
  active, 컨테이너 재시작·최근 error journal·CloudWatch ALARM은 모두 0이다. 현재 Windows
  자격증명은 변경 전 값이라 OCX `Connect`가 거부되는 상태다. 관리자가 직원관리에서 현재
  4591 비밀번호를 한 번 다시 입력해 저장한 뒤 실제 로그인·수신·받기 canary를 완료한다.
- 회선 전환 중 `DisconnectServer()`가 뒤늦게 내보내는 `NetworkError`를 새 로그인 실패로
  오판해 `centrex_network_error`를 반환한 결함은 bridge v0.5.1에서 고쳤다. 프로비저닝 중
  network error는 재접속 신호로만 사용하고 실제 `LoginResult` 또는 제한시간만 최종 판정한다.
  Windows x86 self-test 11개를 통과한 v0.5.1.0의 SHA-256은
  `D0A730F1FE60A7983663EE1C521494302F6A5F2C5BA4BE728D26525226821C5A`다. 작업 스케줄러
  Running, 프로세스·응답 프로세스 각 1개, DPAPI 큐 0건과 현재 회선 로그인 성공을 확인했다.

## 단일 Windows 서버 센트릭스 다중 bridge 풀

직원별 EC2를 만들지 않는다. 2026-08-07부터 한 interactive Windows 세션에서 회선마다
x86 OCX 프로세스 하나를 격리해 실행하고, 배정된 회선과 제한된 유휴 풀만 상시 유지한다.

- migration `0038_mute_wild_pack.sql`은 `staff_telephony_bridge_assignments.staff_user_id`를
  nullable로 바꾸고 `idle` 상태를 추가한다. 활성 행은 직원이 없을 때만 `idle`이고 현재·
  대기 endpoint가 없어야 하며, 직원이 있는 행은 `idle`일 수 없다는 DB 제약을 함께 둔다.
  적용 전 암호화 스냅샷은 `lawand-prod-pre-centrex-bridge-pool-20260807`이고 available이다.
- Secrets Manager `lawand/prod/centrex-bridge/registry-v1`에는 기존 검증 bridge 1개와
  `lawand-slot-001..050`의 bridge ID·placeholder endpoint·각기 다른 32바이트 HMAC secret만
  저장한다. 센트릭스 로그인 ID·비밀번호는 registry에 없다. gateway 시작 시 총 51개 행을
  seed하고 중복 bridge·endpoint·직원 배정을 거부한다.
- 직원관리 `회선 테스트 및 저장`은 U+ `userinfo` 일치 검증 뒤 최근 45초 안에 heartbeat가
  있는 유휴 슬롯을 advisory lock 아래 하나만 점유한다. 비밀번호 원문은 요청·프로세스
  메모리와 40초 암호화 bridge 명령에만 존재하고 Windows Credential Manager에 저장된다.
  신규 배정 뒤 DB 저장 또는 OCX 로그인이 실패하면 현재·대기 endpoint가 없는 같은 슬롯만
  조건부로 `idle`에 반환한다.
- Windows v0.6.2는 설정·로그·DPAPI 큐·mutex·작업 스케줄러를 bridge ID별 디렉터리로
  격리한다. 전체 50개 작업 정의는 미리 만들지만 `Lawand Centrex Bridge Pool Supervisor`가
  매분 배정 슬롯 전부와 유휴 5개만 실행한다. 새 직원이 warm 슬롯을 점유하면 다음 주기에
  정지 슬롯 하나가 새 warm 슬롯으로 시작한다. 전체 50개 프로세스를 미리 띄우지 않는다.
- 실제 1208 회선 canary는 REST 검증 → `lawand-slot-001` 자동 점유 → Windows 자격증명 저장 →
  OCX `LOGIN_RESULT(STATUS=1, 내선·회선 1208)` → endpoint·주 binding → 직원 목록 API
  `connected/bridgeOnline/credentialConfigured=true`까지 통과했다. 임시 직원 세션은 0건으로
  정리했고 실제 발신은 만들지 않았다. 비밀번호는 파일·DB·명령행·로그에 남기지 않았으며
  대화에 노출된 값은 canary 후 교체한다.
- OCX 문서의 `-1(NotFound)`와 `-2(PasswdErr)`를 구분한다. 프로비저닝 중 전체 070 ID가
  `-1`인 경우에만 비동기 disconnect가 끝난 뒤 내선 PBX ID로 한 번 재시도하고, 성공 응답의
  전체 회선·내선이 기대값과 모두 같아야 확정한다. 다른 실패·두 번째 실패는 자동 재시도하지
  않고 이전 자격증명 또는 빈 슬롯으로 복구한다.
- 운영 gateway·ERP 릴리스는 `20260807T090502Z-centrex-bridge-pool-v2`다. private S3 AES256
  앱 아티팩트 SHA-256은
  `b052f48d33601acef9f7be7ba6b490fbcb58a9d1a9285df668c47a07f1b776b4`다. Windows v0.6.2.0
  x86 실행 파일 SHA-256은
  `9A055AE97909290C2B7BE0A943C5C9D11D4111BBD3E526253A224634540BA8CB`, AES256 ZIP SHA-256은
  `FBB7A2FC43945799F5DED99CF16B9D061EE005C7FCA4D7EDC2439139C0CEE836`이고 self-test 13개를
  통과했다. 서명 없는 실행 파일은 현재 통제된 canary 예외이며 정식 운영 전 코드 서명이
  계속 필요하다.
- 최종 상태는 DB 배정 행 51개, 직원 배정·연결 2개, idle 49개, 온라인 idle 5개, 소유권
  이상 0건이다. Windows에는 풀 작업 50개 중 6개가 Running이고 기존 4591을 포함한 실제
  프로세스는 7개, working set 합계 약 169.3MB, DPAPI 큐 0건이다. gateway·ERP·Caddy는
  active, 이미지 재시작 0, 외부 health/login 200, 인증 없는 직원 페이지 307, 최근 error
  journal·CloudWatch ALARM·진행 중 통화/받기/클릭투콜 명령은 모두 0건이다.
- 설치용 Windows IAM inline policy와 성공한 일회성 bootstrap task는 즉시 제거했다. 상시
  감독기·기존 회선·50개 슬롯 task만 남는다. 현재 warm 5개 운용은 충분하지만 50개 회선을
  실제로 모두 배정하기 전에는 Windows 메모리 실부하 canary를 수행하고 필요하면 단일 EC2
  사양을 높인다.

## U+ 비즈콜·망 수신 콜백과 이력 보정

- gateway EIP의 HTTP 80번은 U+ 공식 `setringcallback`이 요구하는 정확한 비밀
  `/v1/centrex-ring/*.html` 경로만 gateway로 전달한다. 다른 HTTP 요청은 기존 HTTPS
  redirect를 유지한다. 비밀 경로의 256비트 토큰은 Secrets Manager에만 저장하고 출력·
  문서·로그에 남기지 않는다.
- callback은 허용 필드, 외부 발신번호 형식, 활성 직원 endpoint의 전체 회선·내선 정확
  일치를 확인한다. 발신번호는 즉시 기존 통화 원장과 같은 AES-GCM 암호화·HMAC 지문으로
  저장하고 개인정보 없는 DB 알림만 발생시킨다.
- 같은 endpoint·발신번호의 U+ callback과 Windows bridge ring은 advisory lock과 짧은
  시각창으로 한 통화에 병합한다. 물리 bridge를 확인한 ring에만 ERP `전화 받기`를 허용한다.
- gateway는 활성 직원 회선을 15초마다 U+ `getinboundcall`로 대사해 callback 통화의 종료
  상태를 확정하고 callback이 빠진 비즈콜 통화도 전화데스크에 추가한다. 새 테이블이나
  migration 없이 기존 암호화 통화·이벤트 원장을 사용한다.
- 운영 배포 뒤 callback 등록 여부, 누락된 비즈콜 이력의 보강 건수, 기존 물리 통화 중복 0,
  gateway·ERP·Caddy·CloudWatch 상태를 개인정보 없이 확인한다. 실제 비즈콜 앱 ring은
  사용자가 4535 회선으로 다음 한 통을 걸어 최종 canary한다.
- 암호화 RDS 스냅샷 `lawand-prod-pre-centrex-bizcall-20260807`을 available까지 확인했다.
  gateway·ERP 릴리스는 `20260807T034220Z-centrex-bizcall`이고 private S3 AES256 아티팩트
  SHA-256은 `7df317a47e0a4f144e0bfeb1a86c0ce6de6813a0d516a541ef25acefabebda7e`다.
- gateway 시작 로그는 4535 endpoint의 callback 등록 성공과 이력 4건 보강을 기록했다.
  같은 날 4535 원장은 U+ 이력 전용 4건과 기존 Windows bridge 1건이며 같은 발신번호·분
  단위 중복은 0건이다. 인증된 전화데스크 API는 200과 `U+ 앱/망 수신` 4건을 반환했고
  임시 직원 세션은 삭제 후 0건이다.
- gateway HTTP 일반 경로는 301, 알 수 없는 callback 경로는 404, 실제 비밀 경로의 필드
  없는 요청은 400이다. 비밀 경로와 전화번호는 검증 출력에 남기지 않았다. gateway·ERP·
  Caddy active, 컨테이너 재시작·최근 error journal·CloudWatch ALARM 0이며 Windows bridge
  작업은 Running·프로세스 1개다.
- 실제 비즈콜 앱 수신 canary에서는 통화 중 callback이 0건이고 U+ `channelstatus`도
  `4004/NO CHANNEL`을 유지했으며 종료 뒤에만 이력이 생겼다. U+ `getringcallback`의 회선·
  EIP·비밀 경로·포트·ring 종류는 gateway 값과 정확히 일치해 등록 오류를 배제했다.
- 구형 callback 클라이언트가 임의 Host 또는 HTTP/1.0 Host 없음으로 요청하면 기존 Caddy가
  308을 반환하는 별도 호환성 결함을 발견했다. gateway HTTP site를 특정 EIP host에서
  `:80` listener로 바꿔 비밀 callback path만 Host와 무관하게 전달하고 일반 경로는 301을
  유지했다. IP Host·임의 Host·Host 없음의 불완전 callback 요청이 모두 앱의 400까지
  도달하고 gateway·Caddy 재시작 0을 확인했다.
- Caddy 교정 후 실제 `ANSWERED` canary도 callback 없이 종료 54초 뒤 이력으로 생성됐다.
  따라서 서버 REST 경로는 비즈콜 종료 원장 전용으로 유지한다. 실시간 ring은 Android
  모바일 bridge 또는 U+ 기업 webhook/동시착신처럼 앱 leg를 노출하는 별도 원천이 필요하다.

## 센트릭스 직접 발신 관측 원장

- 운영 RDS 암호화 스냅샷 `lawand-prod-pre-centrex-outbound-20260806`을 available까지
  확인한 뒤 migration `0031_groovy_stellaris.sql`을 적용했다. 기존 수신 행은 모두
  `direction=inbound`로 보존하고 `outbound.ringing/connected/ended` 3개 이벤트를 추가했다.
- 발신 상대 번호는 수신 번호와 같은 AES-GCM 암호화·HMAC 지문 경계를 사용한다. DB의
  수신 실시간 알림 함수는 outbound 행에서 즉시 반환하고 gateway 수신 snapshot도 inbound
  조건을 명시하므로 발신이 ERP 상단 수신 바로 섞이지 않는다.
- gateway private S3 아티팩트 SHA-256은
  `0699b7e6176354670f8c04c6317f249e6cbbb563ebbb6e621284c5671756f935`이고 AES256이다.
  배포 뒤 gateway·Caddy active, 내부·외부 health 정상, 컨테이너 재시작과 최근 error
  journal·CloudWatch ALARM은 0건이다.
- Windows bridge v0.4.0.0은 SHA-256
  `50c6c3b3cc92f73be936162c6ede379a41758f1bb611ea0af1f09b5e83d807a0`의 x86 빌드다.
  기존 v0.3.1.0을 복구용으로 백업한 뒤 교체했고 작업 스케줄러 Running, 프로세스 1개,
  센트릭스 로그인 성공, DPAPI 큐 0건이다. post-deploy 실물 발신 canary와 U+ 비즈콜 앱
  canary는 아직 남아 있다.

## 통합 전화데스크와 클릭투콜 관측 연결

- 운영 RDS 암호화 스냅샷 `lawand-prod-pre-phone-desk-20260806`을 available까지 확인한 뒤
  migration `0032_brown_ronan.sql`을 적용했다. 발신 명령과 관측 원장을 분리 보존하는
  `telephony_call_observation_links`, 제약 5개, 개인정보 없는 전화데스크 알림 trigger
  3개와 migration hash를 확인했다. `lawand_app`에는 필요한 SELECT·INSERT 권한이 있고,
  배포 전 기존 관측 발신·클릭투콜 명령·연결은 모두 0건이라 backfill 변경은 없었다.
- gateway와 ERP는 같은 릴리스 `20260806T072225Z-phone-desk`다. private S3 아티팩트는
  AES256이며 SHA-256은 `02a0d8f40fd50c5b7531d7bc53f57d98051959b1ebb19764ea409504f01018c5`다.
  gateway의 인증 없는 목록·SSE는 각각 401, ERP의 인증 없는 `/phone-desk`는 로그인으로
  307 전환한다. 5분 임시 직원 세션 canary에서는 페이지·목록 API가 200이고 SSE
  `telephony.desk.sync`를 수신했으며 임시 세션을 삭제해 잔존 0건을 확인했다.
- 운영 목록은 기존 수신 6건을 전체 전화번호·고객·담당자·회선·통화시간과 함께 반환한다.
  현재 ERP 클릭투콜과 직접 발신은 0건이다. 673px 실제 운영 Chrome에서 목록과 실시간
  연결, ERP 발신 필터의 빈 상태를 확인했다. console의 403 세 건은 모두 설치된 Monica
  확장 프로그램 `background.js`의 템플릿 API 요청이고 ERP·gateway·hydration 오류는 없다.
- gateway·ERP·Caddy는 active·재시작 0회이고 최근 error journal과 CloudWatch ALARM은
  0건이다. Windows bridge v0.4.0.0도 작업 Running·프로세스 1개·DPAPI 큐 0건을 유지한다.
  이후 현재 자격증명의 `userinfo` 회선·내선 일치를 재검증하고 비밀번호 원문 없이
  SHA-512만 `lawand/prod/gateway`의 `office-main-4591` 자격증명 키에 저장했다.
  `LAWAND_CENTREX_WORKER_ENABLED=true`로 같은 gateway 릴리스를 재기동했으며 워커 시작
  로그, 운영 컨테이너 `userinfo` HTTP 200, 내부·외부 health, 재시작 0회, error journal·
  CloudWatch ALARM 0건을 다시 확인했다. 활성화 전후 클릭투콜 명령·대기 이벤트·전송
  시도는 모두 0건이라 실제 발신은 없었다. 사용자가 사무실에 복귀하면 ERP 클릭투콜과
  전화데스크 중복 제거를 통제 canary로 확인한다. 센트릭스 비밀번호 변경 시 다음 발신
  전에 운영 secret의 SHA-512도 갱신하며, 직원 회선 등록 뒤 U+ 비즈콜 앱 canary도 별도로
  수행한다.

## 전화데스크 후처리·재통화 업무 큐

- migration `0036_phone_desk_aftercare.sql`은 사람의 통화 결과 원장
  `telephony_call_aftercare`와 담당 재통화 원장 `telephony_follow_up_tasks`를 추가한다.
  결과는 상담완료·재상담필요·부재 및 무응답·통화중·담당자 연결 요청·거절·법원 등
  관공서·채권자 등·잘못 걸린 전화·기타 열 가지다. 기타 설명과 메모는 AES-256-GCM으로
  암호화하고 전화번호·메모 원문은 `NOTIFY`·SSE payload에 넣지 않는다.
- 재상담필요·부재 및 무응답·통화중·담당자 연결 요청·거절은 ERP에서 재통화 업무가 기본
  선택된다. 사용자는 이를 해제할 수 있고, 활성화하면 미래의 30분 단위 일시와 활성 직원
  담당자를 반드시 저장한다. 기존 고객 담당자는 기본값으로 제시하고 복수 담당자는 직접
  선택한다. 미완료 업무는 한 후처리당 하나만 허용하며 완료·취소 시각과 직원을 보존한다.
- `/phone-desk/[id]`는 통화·회선·고객·담당자·통화시간과 후처리를 함께 표시한다. 전화 HMAC이
  같은 기존 상담만 연결할 수 있고, 리걸프렌즈 일치 또는 미확인 고객은 이름·담당자를 선택해
  신건상담으로 만들거나 전화데스크에만 저장할 수 있다. 신건은
  `staff_recorded_phone_interaction` 근거를 사용하며 고객의 명시적 동의 시각을 꾸미지 않는다.
  수신 표시와 ERP 클릭투콜은 통화 종료 뒤 같은 공용 후처리 UI를 연다.
- 배포 전 진행 중 관측 통화·클릭투콜·받기·회선전환 명령은 모두 0건이었다. 암호화 RDS
  스냅샷 `lawand-prod-pre-phone-aftercare-20260807`을 available까지 확인한 뒤 migration을
  적용했고 두 신규 테이블·결과 enum 10개·개인정보 근거·`lawand_app` CRUD 권한을 검증했다.
- DB migration과 gateway의 기준 릴리스는 `20260807T055854Z-phone-aftercare`다. 이
  private S3 AES256 아티팩트 SHA-256은
  `c3008c1ee3b1dd0f69a14df23bd58705b8ce84148c05b8e504ce03669cdd1778`이다.
  운영 합성 직접발신 canary는 후처리 저장·상세·재통화 완료를 각각 200으로 반환했고 관련
  통화·후처리·업무·감사·세션 잔존은 0건이다. ERP same-origin 전화데스크 페이지·목록·상세·
  SSE도 모두 200이며 `telephony.desk.sync`를 수신했고 임시 세션은 0건으로 정리했다.
- 배포 뒤 gateway·ERP·Caddy는 active, 컨테이너 재시작 0회, error priority journal과
  CloudWatch ALARM 0건이다. RDS와 배포 전 스냅샷은 모두 available·encrypted이며 Windows
  bridge v0.5.1.0도 작업 Running·프로세스 1개·DPAPI 큐 0건이다.
- 후속 범위 대조에서 실물 전화기·비즈콜 앱의 새 `centrex_direct` 종료도 자동 후처리해야
  함을 확인했다. 전역 직원 바가 전화데스크 SSE를 추가 구독하되 페이지 진입 전 과거 종료는
  기준선으로만 처리하고, 로그인 직원 소유 회선의 새 직접발신 종료·미처리 건만 공용 후처리
  큐에 넣는다. 동시 종료는 순서대로 열고 기존 session key로 다른 자동 창과 중복되지 않는다.
  최종 ERP 릴리스는 `20260807T063043Z-phone-aftercare-direct`, private S3 AES256 아티팩트
  SHA-256은 `92576babd191066cb5b15692e6d2551ef9c5888797433800660647bdc80e6f03`이다.
  실행 client bundle의 observer 포함, ERP 페이지·목록·SSE 200과 sync, 임시 세션 0건,
  컨테이너 재시작·최종 error journal 0을 확인했다.
- 후속 UX 릴리스 `20260807T072916Z-phone-aftercare-ux`는 후처리 모달을 루트 portal에서
  열고 내부 스크롤을 맨 위로 초기화해 첫 결과부터 보이게 한다. 기존 상담 카드에는 등록일·
  최근 요청일·담당자를, 별도 리걸프렌즈 카드에는 최근 사건의 유형·상태·담당·법원·등록일·
  갱신일을 표시한다. 상담 우선 매칭 뒤에도 비공개 디렉터리를 별도로 조회하되 앱은
  `CB` 테이블이 아니라 migration `0037_phone_desk_directory_context.sql`의 좁은
  security-definer 함수만 실행한다. 재통화 일시는 평일 날짜 카드·다른 날짜와 30분 시간
  카드로 선택하고, 상세 저장 뒤에는 목록으로 이동한다. 상세 상단 목록 링크의 공용 버튼
  스타일도 복구했다.
- 변경 전 암호화 수동 스냅샷 `lawand-prod-pre-phone-aftercare-ux-20260807`은
  `available`이다. private S3 AES256 아티팩트 SHA-256은
  `f22baba6b09d28d090bf294c3cdb9c078791f238e5d8193c3a46905473a78d19`다. 운영 함수 계약·
  `lawand_app` 실행/`PUBLIC` 차단, 실제 상담·리걸프렌즈 양쪽 일치 상세의 등록일·담당자와
  사건 8건 확장 필드, ERP 목록·상세 200을 확인했다. 임시 세션 잔존은 0건이고 gateway·
  ERP·Caddy active, 컨테이너 재시작·error journal·CloudWatch ALARM·진행 중 전화 명령은
  모두 0이며 활성 bridge heartbeat도 정상이다.

## 2026-08-10 홈페이지 정식 도메인 출시 후보

- 운영 main을 원격과 병합하고 실제 자가진단 단계의 스크롤·포커스 어텐션 UX를 반영했다.
  전체 typecheck·lint·build, core 55개·gateway 78개 테스트와 schema check를 통과했다.
- 빌드 이미지에 DB 비밀값을 넣지 않기 위해 `/bank`의 공개 사례·후기 조회를 요청 시점
  동적 렌더로 바꿨다. 현재 릴리스의 첫 화면은 승인 사례 2개와 최신 후기 3개를 표시하며
  빈 빌드 결과를 캐시하지 않는다.
- 현재 릴리스 `20260810T064408Z-homepage-cutover-ready-v3`의 private S3 AES256 아티팩트
  SHA-256은 `0b159371d9c5fe021a4d81a1511f0d3d85dc05d83ababfe7f15a03496ba0ef3e`,
  실행 이미지 ID는 `sha256:31e844e160ae428262017993bb455cd652126e059b35479c0cd4e017040c3465`다.
  앱·Caddy는 active, 컨테이너 재시작과 최근 error journal은 0이다.
- 검색에 확인되는 기존 WordPress 회생·파산 핵심 URL은 끝 슬래시 유무와 관계없이 가장
  가까운 새 문서로 한 번만 영구 이동한다. 임시 HTTPS에서 구주소→새 URL 1회→200을
  확인했다.
- 정식 Caddy 구성은 `/bank`, `/about`, `/people`, 약관·API·새 정적 자산만 새 홈페이지로
  보내고 아직 이관하지 않은 `/divorce`, `/insurance`, `/realty`와 기타 legacy 경로는
  기존 `222.239.248.41` HTTPS origin으로 전달한다. 실제 운영 Caddy 버전의 config
  validation을 통과했다. 기존 서버 종료 전까지 이 fallback을 유지한다.
- rollback은 NS를 다시 바꾸지 않고 Route 53 apex A를 `222.239.248.41`로 되돌리는 것을
  1차 기준으로 한다. `www` CNAME은 그대로 두며 ERP/API도 필요하면 명시 A를 제거해
  wildcard→apex로 돌린다. 세 서버의 전환 전 Caddyfile은
  `Caddyfile.pre-domain-cutover-20260812T004900Z`에 있고 Cafe24 구 zone·호스팅·SSL과
  직전 홈페이지 이미지도 보존했다.

## 도메인 전환 체크리스트

도메인 이름과 대상은 아래 값으로 확정·적용했다.

| 레코드 | 대상 |
|---|---|
| `lawandfirm.com`, `www.lawandfirm.com` | 홈페이지 EIP `15.165.23.84` |
| `erp.lawandfirm.com` | ERP EIP `3.34.72.9` |
| `api.lawandfirm.com` | gateway EIP `3.36.255.226` |

1. 기존 핵심 URL·robots·sitemap과 legacy fallback 목록을 확정했다.
2. 기존 레코드를 기록하고 새 Route 53 레코드 TTL을 300초로 설정했다.
3. Caddy 정식 호스트를 무중단 reload하고 Secrets Manager의 ERP 공개 URL만 갱신했다.
   업무 통화가 연속 0일 때 gateway·ERP 프로세스를 재시작해 새 환경값을 읽힌다.
4. Solapi API 키의 IP 허용 범위를 `0.0.0.0/0`에서 gateway EIP
   `3.36.255.226` 하나로 제한한다.
5. Route 53 레코드·Cafe24 NS 변경을 적용하고 apex·www·ERP·API의 Let’s Encrypt 인증서
   발급을 확인했다.
6. 홈페이지 주요 URL·legacy fallback, ERP HTTPS 로그인 페이지와 gateway health를
   직접 EIP 고정·공개 DNS 양쪽에서 확인했다. 인증 로그인·모바일 실기기 확인은 안정화
   단계에서 이어간다.
7. 실제 운영자가 보는 상태에서 상담 한 건만 canary로 접수해 ERP 등록과 접수 알림톡을
   확인한다. 담당 배정 canary는 리걸프렌즈 실제 사건 생성과 담당 배정 알림톡을 함께
   실행한다는 점을 알고 승인 후 진행한다.
8. 광고 랜딩·분석·Search Console과 resolver별 전파를 확인하고 이상 시 Route 53 apex A를
   기존 IP로 되돌린다.
9. 안정화 뒤에도 EIP HTTP의 HTTPS 전환을 유지하고 ERP 인터넷 공개 범위를 재검토한다.

## 아직 연결하지 않은 범위

- DNS 전파 완료 뒤 gateway·ERP 정식 URL 환경값 재시작과 인증 로그인·모바일 smoke
- ElastiCache Redis: 현재 DB outbox만으로 충분해 실제 큐·실시간 부하가 생길 때 추가
- 사무실 NAS VPN, 녹취 전송, S3 Glacier 재해 복구 사본
- 센트릭스 실시간 STT·요약·대응 멘트
- CloudWatch 경보의 실제 통지 채널과 중앙 로그 보존
- RDS Multi-AZ·복원 훈련
- 운영 상담/알림톡/리걸프렌즈 canary

## 보안 후속조치

- AWS root 계정은 MFA가 활성화돼 있고 root access key는 없다. 반복 운영은 root 대신
  별도 관리자 역할이나 IAM Identity Center 세션으로 전환한다.
- 채팅에 노출된 텔레그램 봇 토큰은 이번 배포에 사용하거나 저장하지 않았다. 해당 토큰은
  폐기·재발급한 뒤 알림 채널을 연결할 때 새 값만 Secrets Manager에 저장한다.
- 정식 전환 전 Solapi 허용 IP, ERP 인터넷 공개 범위, RDS Multi-AZ, 백업 복원과 알림
  수신자를 출시 게이트로 다시 확인한다.
