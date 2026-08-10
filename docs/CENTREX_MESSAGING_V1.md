# 센트릭스 문자·개인 템플릿 v1

## 범위

- 전화번호가 수집되고 현재 로그인 직원이 담당자인 상담에서만 문자를 보낸다.
- 텍스트 전용은 LG U+ 센트릭스 `smssend`로 SMS/LMS를 발송한다.
- JPG 이미지가 붙은 개인 템플릿은 SOLAPI 스토리지와 MMS를 사용한다.
- 템플릿은 `owner_user_id` 기준 개인 설정이다. `owner_user_id IS NULL`인 기본 템플릿만 전 직원이 읽을 수 있고 수정할 수 없다.
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

- 전역 `문자` 메뉴에서 직원이 자신의 템플릿을 생성·수정·비활성화한다.
- 허용 변수는 `{{고객명}}`, `{{담당자명}}`, `{{접수번호}}`이며 상담 발송창에서 실제 값으로 치환한다.
- 작성 중인 본문과 이미지를 휴대전화 모양 미리보기에서 즉시 확인한다.
- 상담 상세의 `문자 보내기`는 기본 템플릿과 로그인 직원의 활성 개인 템플릿만 보여 준다.
- 발송 전 고객명과 SMS/LMS/MMS 종류를 명시한 확인창을 거친다.
- 상담 상세 원장에는 담당자·템플릿·실제 본문·이미지 첨부 여부·요청/제공자 결과를 표시한다.

## 운영 반영 순서

1. 운영 RDS 암호화 스냅샷을 만든다.
2. migration `0040_late_talon.sql`을 적용한다.
3. gateway에 기존 `LAWAND_SOLAPI_API_KEY`, `LAWAND_SOLAPI_API_SECRET`과 새 `LAWAND_SOLAPI_MMS_SENDER`를 설정한다. 발신번호는 같은 SOLAPI 계정에 사전 등록된 국내 번호여야 한다.
4. `LAWAND_CENTREX_WORKER_ENABLED=true`인 단일 gateway 워커와 ERP를 함께 배포한다.
5. 텍스트 전용 통제 번호 1건과 200KB 이하 JPG 명함 MMS 1건을 순서대로 발송해 제공자 접수와 실제 단말 수신을 확인한다.
6. 발송 전후 대기 outbox, 실패 원장, 센트릭스 잔여 건수와 SOLAPI 내역을 확인한다.

## 현재 검증 경계

- 단위·route 테스트, typecheck, lint, Drizzle schema check, gateway/ERP production build를 통과한다.
- 이 브랜치에서는 운영 DB 변경, 실제 고객 발송, `main` 병합과 운영 배포를 수행하지 않는다.
