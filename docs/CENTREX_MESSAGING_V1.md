# 센트릭스 문자 수·발신함·개인 템플릿

## v2 운영 배포 — 대표번호 수신함과 통합 문자 화면

- 2026-08-11 migration `0044_sturdy_preak.sql` 출시 후보는 직원 개인 회선과 별개인
  `representative` endpoint 7개를 비활성 메타데이터로 등록한다. 직원 binding이나 Windows
  bridge를 만들지 않으므로 현재 개인 전화, 대표전화 순차착신과 클릭투콜 발신 회선을
  변경하지 않는다.
- 대표 수신함은 `042-484-0488`, 원번호 없는 `070-4607-0588`, `051-505-1909`,
  `051-502-1919`, `042-485-0488`, `02-555-7455`, `02-555-7465`다. 각 070 회선과 내선은
  migration에 보존하지만 비밀번호 원문·SHA-512·암호문은 Git과 migration에 넣지 않는다.
- 배포 뒤 `centrex:link-representative --line-number <070번호>`를 TTY에서 실행해 현재
  비밀번호를 화면에 표시하지 않고 입력한다. U+ `userinfo`가 070 회선과 내선을 정확히
  반환한 계정만 AES-GCM 인증 원장을 만들고 endpoint를 활성화한다.
- gateway는 공식 `getrecvsmslist`를 계정당 직렬 조회한다. 최신 첫 페이지와 과거 페이지
  backfill을 번갈아 읽고 수신 원문·고객 번호를 로그에 남기지 않는다. 수신 번호·본문은
  AES-GCM, 매칭·중복 판정 값은 HMAC 지문으로 저장한다.
- U+가 `SRC`를 일반 국내 전화번호가 아닌 문자열로 반환하는 기록도 페이지 전체를 막지
  않는다. 이 값은 불투명 provider 식별자로 암호화하고 일반 전화번호와 다른 HMAC namespace에
  두며 고객·사건 자동 매칭에서는 제외한다. ERP에는 원문을 노출하지 않고
  `발신번호 확인 필요`로 표시한다.
- 같은 휴대전화번호의 회신은 수신시각 이전에 발송 성공 또는 전달 여부 불명확 상태인 가장 최근
  `telephony_messages`를 찾아 그 발신 건의 상담 또는 리걸프렌즈 `Case_idx`를 상속한다.
  따라서 같은 번호를 쓰는 고객이 여럿이어도 발신 맥락별로 대화가 갈린다. 선행 발신이 없는
  수신은 고객을 추측하지 않고 `연결 확인 필요`로 보존한다.
- ERP `/messages`는 Case_idx별 센트릭스 SMS/LMS 수·발신과 SOLAPI MMS 발신을 한 시간축에
  표시한다. 기존 `/message-templates`는 `/messages`로 이동하고, 개인 템플릿은 통합 화면의
  모달에서 생성·수정·삭제한다. 대표 수신함의 연결·활성·동기화 오류 상태도 같은 화면에서
  확인한다.
- 인증된 직원용 대화 목록과 선택 헤더에는 고객 전화번호를 마스킹 없이 하이픈 형식으로
  표시한다. DB 암호화, outbox·로그 비식별과 조회 감사는 유지하고 비표준 U+ `SRC`는
  계속 `발신번호 확인 필요`로만 표시한다.
- migration `0045_fat_ronan.sql`은 발송 당시 SOLAPI 이미지 URL snapshot을 추가하고,
  기존 MMS는 현재 템플릿의 파일 ID가 발송 snapshot과 같은 경우에만 URL을 보강한다.
  문자 대화는 파일명 대신 실제 JPG를 표시하며 URL을 불러오지 못하는 경우에만 오류 안내를
  남긴다. 말풍선은 휴대전화 수준의 본문 크기와 줄 너비로 제한한다.
- 이미 선택된 대화를 다시 클릭하면 현재 화면을 유지한다. 대화 전환 요청에는 순서를 두어
  늦게 완료된 이전 고객 응답이 최신 선택을 덮어쓰거나 장시간 loading으로 남지 않게 한다.
- 이 출시 후보는 현재 발신번호 선택 정책을 변경하지 않는다. 대표전화 착신 대상·순서 변경과
  근무/휴무 조건 라우팅은 별도 후속 범위다.
- migration `0044`와 실서비스 배포, 대표 계정 7개의 TTY 연결은 완료했다. 비표준 `SRC`
  격리 gateway 수정과 `0045`·문자 화면 후속, 실제 수신 backfill·통제 회신 canary는 운영
  반영 전이다.

## 운영 상태

- 2026-08-11 migration `0044_sturdy_preak.sql`과 gateway·ERP 릴리스
  `20260811T035307Z-centrex-message-inbox-v1`을 운영 배포했다. 운영 migration은 45개이며
  최신 해시가 Git과 일치한다. 신규 수신·mailbox 상태 테이블의 앱 CRUD·viewer SELECT·
  PUBLIC 차단과 대표 endpoint 7개·활성/인증/binding 0을 확인했다.
- 인증 ERP `/messages`와 `/message-templates` 이동은 200이고 문자 API는 기존 대화 12개와
  대표 mailbox 7개를 반환했다. 이후 사용자가 `centrex:link-representative` TTY에서 7개를
  모두 `userinfo` 검증 연결했고 5개는 정상 동기화됐다. `051-502-1919`와 `02-555-7455`는
  HTTP 200·`SVC_RT=0000`에도 과거 첫 페이지의 `SRC` 각각 1건·4건이
  `숫자 1자리 + w + 숫자 6자리` 형태라 기존 전체 전화번호 검증에서 페이지 전체가
  `invalid_response`가 됐다. 비밀번호·계정 연결 문제는 아니다.
- 출시 후보는 이 특수 식별자를 암호화·별도 HMAC namespace·자동 매칭 제외로 보존하고
  ERP에는 `발신번호 확인 필요`로 표시한다. DB migration과 운영 데이터 직접 보정 없이
  gateway 배포 뒤 기존 worker polling만으로 두 수신함 오류 해제와 backfill을 재개한다.
- 지연 검증의 `lawand-centrex-login-failures` ALARM은 대표 mailbox가 아니라 직원용
  Windows `lawand-slot-017`의 외부 중복 로그인 충돌로 추정한다. 당시 대표 endpoint 7개는
  아직 비활성·인증 0이었으며, 이후 대표 계정 연결 뒤 확인된 mailbox 특수 `SRC` 오류와는
  서로 독립된 현상이다.
- 2026-08-10 migration `0041_late_talon.sql`과 gateway·ERP 릴리스
  `20260810T090235Z-customer-messaging-v1`을 운영 배포했다.
- 인증 ERP의 전역 템플릿 화면과 상담 상세 `문자 보내기`·발송 완료 원장을 확인했다.
- 사용자 지정 통제 수신자에게 정상 담당자 API와 outbox를 거쳐 SMS 한 건을 실제 발송했다.
  API 201, 42바이트 SMS, 센트릭스 코드 `0000`, outbox published, 1회 delivery HTTP 200을
  확인했다. 전화번호와 본문은 운영 로그·문서에 기록하지 않았다.
- SOLAPI 활성 발신번호 목록에서 운영 계정의 등록 번호 `010-****-1382`를 확인하고
  `LAWAND_SOLAPI_MMS_SENDER`로 Secrets Manager와 실행 중 gateway에 적용했다. 따라서
  이미지 MMS 발송 경계는 활성화됐고, 명함 JPG 실제 수신 canary만 별도로 남아 있다.
- 기본 템플릿·활성화 체크 제거와 개인 템플릿 삭제를 위한 migration
  `0042_bright_midnight.sql` 및 gateway·ERP 변경을 릴리스
  `20260810T135657Z-profile-message-templates-v1`로 운영 배포했다. 배포 직후 기본 템플릿 0건,
  직원 개인 템플릿 7건이었으며 과거 발송 snapshot과 역할별 권한 경계도 유지된다.
- 고객 찾기 검색 결과의 문자 작성 흐름과 암호화 대상 snapshot을 migration
  `0043_famous_rafael_vega.sql`, gateway·ERP 릴리스
  `20260810T231946Z-client-directory-messaging-v1`로 운영 배포했다. 브라우저와 outbox는
  고객·사건 ID만 전달하고 gateway가 삭제 사건·전화번호를 다시 검증한다. 배포 smoke는
  발송 없이 수행했으며, 직후 직원이 실제 요청한 고객 찾기 LMS 1건은 Centrex
  `succeeded`·outbox `published`로 완료됐다.
- 이후 직원이 실제 요청한 JPG MMS 네 건은 SOLAPI HTTP 200 응답 안에서 모두
  `1010(필수 입력 값 미입력)`으로 등록 거절됐다. 요청에는 발신·수신번호, 본문과 이미지
  ID가 있었지만 `strict: true`의 MMS 제목 검사에 필요한 `subject`가 없었다. 고정 제목을
  추가한 동일 요청을 비발송 임시 그룹으로 검증해 `2000`을 확인하고 그룹을 삭제했으며,
  gateway 릴리스 `20260811T001012Z-solapi-mms-subject-v1`로 수정했다. 실패 네 건은 자동
  재발송하지 않고 감사 원장과 dead outbox에 보존한다.

## 범위

- 전화번호가 수집되고 현재 로그인 직원이 담당자인 상담에서만 문자를 보낸다.
- 텍스트 전용은 LG U+ 센트릭스 `smssend`로 SMS/LMS를 발송한다.
- JPG 이미지가 붙은 개인 템플릿은 SOLAPI 스토리지와 MMS를 사용한다.
- 템플릿은 `owner_user_id`가 반드시 있는 개인 설정이며 만든 직원만 조회·수정·사용·삭제한다.
- 템플릿을 삭제해도 과거 발송의 본문·템플릿명·이미지 스냅샷은 보존하고 현재 템플릿 참조만 해제한다.
- 문자 화면의 전체 고객 번호와 이미지 URL은 인증된 직원 조회에만 반환하고 조회 감사를 유지한다.
- 고객 전화번호와 실제 메시지 본문은 outbox·로그에 넣지 않는다. 전화번호는 기존 상담 암호문에서, 본문은 `telephony_messages` AES-GCM 암호문에서 발송 직전에만 복호화한다.

## 제공자 계약

### 센트릭스 SMS/LMS

- `POST https://centrex.uplus.co.kr/RestApi/smssend`
- SMS 80바이트 이하, LMS 720바이트 이하
- v1은 고객 한 명만 받는 명시적 담당자 발송이다.
- 응답 `SVC_RT=0000`만 성공으로 기록하고 잔여 건수도 원장에 보존한다.
- 응답 유실은 중복 발송 방지를 위해 자동 재시도하지 않는다.

### SOLAPI MMS

- `POST /storage/v1/files`에 Base64와 `type=MMS`로 이미지를 템플릿 저장 시 한 번 업로드한다.
- JPG, 200KB 이하, 최대 1500×1440px만 허용한다.
- `POST /messages/v4/send-many/detail`에 등록 발신번호·수신번호·본문·`imageId`와 40바이트
  이하 고정 제목 `법무법인 로앤 안내`를 보낸다. `strict: true`에서 제목을 생략하지 않는다.
- 템플릿 원장에는 SOLAPI 파일 ID·미리보기 URL·파일명·크기·해상도만 저장하고 Base64 원문은 저장하지 않는다.
- API 접수 성공은 단말 최종 수신 성공과 다르다. 최종 결과 웹훅/조회 소비자는 별도 후속 과제다.

## ERP 동작

- 전역 `문자` 메뉴에서 직원이 자신의 템플릿을 생성·수정·삭제한다.
- 허용 변수는 `{{고객명}}`, `{{담당자명}}`, `{{접수번호}}`이며 상담 발송창에서 실제 값으로 치환한다.
- 작성 중인 본문과 이미지를 휴대전화 모양 미리보기에서 즉시 확인한다.
- 상담 상세의 `문자 보내기`는 로그인 직원의 개인 템플릿을 모두 보여 주며 별도 활성화 체크는 없다.
- 고객 찾기 결과도 같은 작성창을 사용하되 리걸프렌즈 고객·사건 ID를 gateway에서 재검증하고,
  발신 가능한 전화번호가 없는 결과에는 문자와 전화를 모두 노출하지 않는다.
- 발송 전 고객명과 SMS/LMS/MMS 종류를 명시한 확인창을 거친다.
- 상담 상세 원장에는 담당자·템플릿·실제 본문·이미지 첨부 여부·요청/제공자 결과를 표시한다.

## 운영 반영 순서

1. 운영 RDS 암호화 스냅샷을 만든다.
2. migration `0041_late_talon.sql`을 적용한다. 고객 찾기용 운영 migration `0040`과 번호를
   공유하지 않는다.
3. gateway에 기존 `LAWAND_SOLAPI_API_KEY`, `LAWAND_SOLAPI_API_SECRET`과 새 `LAWAND_SOLAPI_MMS_SENDER`를 설정한다. 발신번호는 같은 SOLAPI 계정에 사전 등록된 국내 번호여야 한다.
4. `LAWAND_CENTREX_WORKER_ENABLED=true`인 단일 gateway 워커와 ERP를 함께 배포한다.
5. 텍스트 전용 통제 번호 1건과 200KB 이하 JPG 명함 MMS 1건을 순서대로 발송해 제공자 접수와 실제 단말 수신을 확인한다.
6. 발송 전후 대기 outbox, 실패 원장, 센트릭스 잔여 건수와 SOLAPI 내역을 확인한다.

개인 템플릿 단순화 릴리스는 운영 RDS 암호화 스냅샷 뒤
`0042_bright_midnight.sql` → gateway·ERP 동시 배포 순서로 반영했다. migration은 기본
템플릿 세 건과 `is_active`를 제거하며, 참조 중인 발송 이력은 `template_id`만 비우고
템플릿명·본문·이미지 스냅샷을 유지한다.

## 현재 검증 경계

- 전체 단위·route 테스트, typecheck, lint, Drizzle schema check, gateway/ERP production
  build와 운영 스키마·권한 검증을 통과했다.
- 고객 찾기 `0040`을 보존하고 문자 스키마를 `0041`로 재생성·적용했다. 센트릭스 SMS의
  제공자 접수까지 검증했으며 단말 최종 수신은 수신자 확인 영역이다.
- `0042` 적용 뒤 운영 migration 43개와 Git 해시 일치, 기본 템플릿 0·개인 템플릿 7,
  소유자 `NOT NULL`, `is_active` 제거, FK `SET NULL`, 앱/조회자/PUBLIC 권한을 확인했다.
  인증 ERP 문자 화면은 200이고 문자 대기·실패·dead 원장은 모두 0이다.
- `0043` 적용 뒤 운영 migration 44개와 최신 Git 해시 일치, 기존 상담 문자 2건 보존,
  `telephony_message_directory_targets`, `target_source NOT NULL`, 앱 CRUD·viewer SELECT 전용·
  PUBLIC 권한 0을 확인했다. 인증 `/clients`는 문자·전화 및 개인 템플릿 UI를 렌더한다.
- SOLAPI MMS 등록 발신번호와 strict 제목 수정은 완료했다. 동일 요청의 비발송 그룹 검증은
  `2000`이지만 실제 JPG 단말 수신 canary는 남았다. 수정 전 `1010` 실패 네 건은 dead 원장에
  보존했다. API 접수 뒤 최종 단말 결과를 자동 수집하는 웹훅/조회 소비자도 후속 범위다.
