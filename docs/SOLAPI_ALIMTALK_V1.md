# Solapi 상담 알림톡 연동 v1

> 기준일: 2026-07-30
> 범위: 홈페이지 상담 접수와 ERP 담당자 배정 알림톡
> 제외: 광고성 메시지, 친구톡, 문자 대체발송, 최종 결과 웹훅

## 1. 승인 리소스

Solapi 계정의 채널 목록과 템플릿 목록 API에서 다음 값을 직접 확인했다.

| 용도 | 값 |
|---|---|
| 카카오 채널 | 법무법인 로앤 |
| 검색용 ID | `법무법인로앤` |
| 채널 `pfId` | `KA01PF260728050856631NH7pRhuvNxg` |
| 상담 접수 템플릿 | `KA01TP260728052511334jn4XJFaqVJv` |
| 담당 배정 템플릿 | `KA01TP260728052954781y9MVee55Fzv` |

두 템플릿 모두 `APPROVED`, 부가정보형 `EX`, 버튼 없음이다. 공개 채널 URL의
`_AeGxoxl`은 검색·접속용 슬러그이고 API 발송 식별자가 아니다.

### 상담 접수

```text
[법무법인 로앤]

상담 요청을 남겨주셔서 감사합니다.
정상적으로 접수되었습니다.

접수 번호: #{접수번호}
접수 시각: #{접수시각}
연락 예정: #{연락예정}

연락 예정에 맞추어 담당자가 연락드리겠습니다.(콜)
```

부가정보는 `상담 운영 시간 : 평일 08시 ~ 19시`다.

### 담당 배정

```text
[법무법인 로앤]

담당자가 배정되었습니다.

접수 번호: #{접수번호}
담당자: #{담당자명}
연락 예정: #{연락예정}

연락 예정에 맞추어 담당자가 연락드리겠습니다. (콜)
감사합니다.
```

부가정보는 `상담가능시간 : 평일 08시 ~ 19시`다.

## 2. 이벤트와 발송 시점

- 새 `consultation`이 최초 생성될 때
  `alimtalk.consultation.request_notification.requested`를 상담 저장과 같은
  트랜잭션에서 만든다.
- ERP `상담하기`로 담당자가 최초 배정될 때
  `alimtalk.consultation.assignment_notification.requested`를 배정 저장과 같은
  트랜잭션에서 만든다.
- idempotency key 재시도, 동일내용 중복, 익명→실명 보강에는 상담 접수 알림톡을
  추가하지 않는다.
- outbox payload에는 전화번호·이름·메시지 본문이 없고 상담·요청·배정 참조만 있다.

## 3. 변수 변환

| 변수 | 값 |
|---|---|
| `#{접수번호}` | `consultations.public_receipt_code` |
| `#{접수시각}` | 접수 시각을 `Asia/Seoul`의 `YYYY년 M월 D일 HH:mm`로 표시 |
| `#{담당자명}` | 배정 직원의 `staff_profiles.display_name` |
| `#{연락예정}` 빠른 연락 | `가능한 빠른 시간` |
| `#{연락예정}` 예약 연락 | `Asia/Seoul`의 `YYYY년 M월 D일 HH:mm~HH:mm` |

승인 본문·부가정보·버튼을 애플리케이션이 다시 만들지 않는다. 발송 시에는 승인된
템플릿 ID와 위 변수만 전달한다.

## 4. Solapi 요청

`POST https://api.solapi.com/messages/v4/send-many/detail`에 ATA 한 건을 보낸다.
수신번호는 숫자만 사용하고 `kakaoOptions.disableSms=true`로 문자 대체발송을 끈다.
등록하지 않은 `agent.appId`는 보내지 않는다.
PII가 아닌 outbox event ID는 `customFields.lawandEventId`로 함께 보내 응답 유실 시
Solapi 발송내역과 내부 원장을 대조할 수 있게 한다.

HMAC-SHA256 인증은 매 요청마다 현재 ISO 8601 시각과 새 salt를 만들고,
`HMAC(apiSecret, date + salt)` 서명을 Authorization header에 넣는다.

환경변수 이름은 다음과 같다. 값은 Git 제외 환경파일 또는 운영 비밀 저장소에만 둔다.

```text
LAWAND_ALIMTALK_WORKER_ENABLED
LAWAND_SOLAPI_API_KEY
LAWAND_SOLAPI_API_SECRET
LAWAND_SOLAPI_PF_ID
LAWAND_SOLAPI_REQUEST_TEMPLATE_ID
LAWAND_SOLAPI_ASSIGNMENT_TEMPLATE_ID
```

리걸프렌즈 워커의 활성화 설정과 분리되어 있으므로 알림톡만 독립적으로 켤 수 있다.

## 5. 성공·실패·PII 원장

- HTTP 2xx만으로 성공 처리하지 않는다. `failedMessageList`가 비어 있고
  `messageList[0].statusCode=2000`, `groupId`, `messageId`가 모두 있어야 한다.
- 성공 시 `alimtalk_deliveries`에 outbox·상담·요청 참조, 템플릿 용도,
  Solapi 그룹·메시지 ID와 상태코드만 저장한다.
- 전화번호, 치환된 변수, 메시지 본문, API 응답 원문은 발송 원장·시도 원장·구조화
  로그에 저장하지 않는다.
- 429와 명시적인 5xx 응답은 최대 5회 지수형 재시도한다.
- timeout·연결 종료처럼 외부 접수 여부가 모호한 오류는 중복 알림 방지를 위해 자동
  재시도하지 않고 확인 필요로 남긴다.
- Solapi의 `2000`은 발송 등록 성공이다. 최종 수신 성공·실패는 비동기이므로 운영에서는
  웹훅 또는 메시지 조회 소비자가 `4000` 등 최종 상태를 갱신해야 한다.

## 6. 실제 canary

2026-07-30 테스트 상담 `LA-260730-GRMVUCM2`로 상담 접수와 담당자 배정 알림톡을
각각 한 건 발송했다. Solapi 발송내역에서 두 건 모두 `COMPLETE`, 상태코드 `4000`,
사유 `수신 완료`를 확인했다. 첫 요청에서 등록하지 않은 `agent.appId`를 보내 발생한
거절 이력은 삭제하지 않고 1차 실패로 보존했으며, 교정한 최소 요청의 실제 성공은 2차
시도로 정합화했다.

연결 전에 만들어진 과거 담당 배정 알림톡 3건은 오래된 안내가 뒤늦게 발송되지 않도록
소급 발송 제외 사유와 함께 종료했다.
