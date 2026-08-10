# 센트릭스 문자·개인 템플릿 v1

## 운영 상태

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
  `20260810T135657Z-profile-message-templates-v1`로 운영 배포했다. 운영에는 기본 템플릿 0건,
  직원 개인 템플릿 7건이 있으며 과거 발송 snapshot과 역할별 권한 경계도 유지된다.

## 범위

- 전화번호가 수집되고 현재 로그인 직원이 담당자인 상담에서만 문자를 보낸다.
- 텍스트 전용은 LG U+ 센트릭스 `smssend`로 SMS/LMS를 발송한다.
- JPG 이미지가 붙은 개인 템플릿은 SOLAPI 스토리지와 MMS를 사용한다.
- 템플릿은 `owner_user_id`가 반드시 있는 개인 설정이며 만든 직원만 조회·수정·사용·삭제한다.
- 템플릿을 삭제해도 과거 발송의 본문·템플릿명·이미지 스냅샷은 보존하고 현재 템플릿 참조만 해제한다.
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
- `POST /messages/v4/send-many/detail`에 등록 발신번호·수신번호·본문·`imageId`를 보낸다.
- 템플릿 원장에는 SOLAPI 파일 ID·미리보기 URL·파일명·크기·해상도만 저장하고 Base64 원문은 저장하지 않는다.
- API 접수 성공은 단말 최종 수신 성공과 다르다. 최종 결과 웹훅/조회 소비자는 별도 후속 과제다.

## ERP 동작

- 전역 `문자` 메뉴에서 직원이 자신의 템플릿을 생성·수정·삭제한다.
- 허용 변수는 `{{고객명}}`, `{{담당자명}}`, `{{접수번호}}`이며 상담 발송창에서 실제 값으로 치환한다.
- 작성 중인 본문과 이미지를 휴대전화 모양 미리보기에서 즉시 확인한다.
- 상담 상세의 `문자 보내기`는 로그인 직원의 개인 템플릿을 모두 보여 주며 별도 활성화 체크는 없다.
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
- SOLAPI MMS 등록 발신번호 설정은 완료했고 실제 JPG canary가 남았다. API 접수 뒤 최종
  단말 결과를 자동 수집하는 웹훅/조회 소비자도 후속 범위다.
