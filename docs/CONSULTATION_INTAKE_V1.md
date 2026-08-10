# 상담 접수·귀속·이벤트 계약 v1

> 상태: 2026-07-28 거주 시·도, 직원 인증과 ERP 본인 담당 배정·외부 실행 요청 구현
> 코드: `packages/core`, `packages/db`
> 범위: 홈페이지 실제 상담 접수부터 ERP 목록·상세·담당 배정, 리걸프렌즈·알림톡
> outbox와 Solapi 알림톡 실제 송신까지
> 제외: Slack·AdPilot 실제 송신, Solapi 최종 발송결과 웹훅

## 1. 설계 원칙

1. `consultation`은 운영자가 관리할 상담 묶음이고, `consultation_request`는 사용자가
   실제로 누른 제출 한 번이다.
2. 같은 전화번호를 공유하는 가족·별도 사건이 있을 수 있으므로 전화번호만으로 상담을
   자동 병합하지 않는다.
3. 모든 논리적 제출은 보존한다. 같은 `idempotency_key`의 네트워크 재시도만 새 제출로
   보지 않는다.
4. 최초 랜딩, 내부 이동, 상담 CTA와 제출 위치를 `request_id`에 귀속한다. 중복 요청을
   한 상담으로 묶더라도 각 요청의 광고·방문 경로는 잃지 않는다.
5. 이름·전화·상담 원문은 이벤트에 넣지 않는다. 암호화된 DB 레코드를 가리키는 참조만
   outbox에 기록한다.
6. 상담·요청·여정·귀속·상태이력·outbox는 한 PostgreSQL 트랜잭션으로 기록한다.
7. 정확한 주소 대신 거주 시·도만 받고, 시·도 하나로 관할이 확정되는 것처럼 안내하지
   않는다. 거주 시·도는 intake와 함께 암호화하며 이벤트·귀속 데이터에는 복제하지 않는다.

## 2. 식별자

| 식별자 | 형식 | 책임 |
|---|---|---|
| `consultation_id` | 애플리케이션 생성 UUIDv7 | 중복 요청을 묶는 내부 상담 ID |
| `request_id` | 애플리케이션 생성 UUIDv7 | 실제 논리적 제출 ID |
| `event_id` | 애플리케이션 생성 UUIDv7 | outbox와 소비자 멱등성 ID |
| `journey_session_id` | 브라우저 생성 UUID | 한 브라우저 탭의 방문 여정 |
| `idempotency_key` | 브라우저 생성 UUID | 제출 버튼 1회의 재시도 식별 |
| `public_receipt_code` | `LA-YYMMDD-XXXXXXXX` | 고객 표시용 접수번호 |

`public_receipt_code`는 조회 인증값이 아니다. 화면·문자에 표시할 수 있지만, 이 값만으로
상담정보를 조회하거나 수정할 수 없게 한다. 난수 충돌은 DB unique 제약에 걸리며 서버가
새 접수번호를 생성해 같은 트랜잭션을 다시 시도한다.

## 3. 데이터 모델

### 상담·접수

- `consultations`: 접수번호, 상태, 전화번호 HMAC 지문, 익명 표시명, 암호화된 선호 이름
- `consultation_requests`: 제출별 idempotency key, 암호화된 연락처·이름·거주 시·도·
  상담 원문, 자가진단 결과 카드 스냅샷, 연락 희망 구간, 동의 버전·시각, 중복 판정
- `consultation_status_history`: 상태 전환과 행위자 감사 기록
- `consultation_assignments`: 상담별 담당 직원·주 멤버십·배정자·배정 시각

전화번호는 숫자만 남긴 정규화 값을 애플리케이션에서 HMAC-SHA-256 처리해
`phone_fingerprint`로 비교한다. 단순 SHA 해시는 전화번호 공간이 작아 역추측하기 쉬우므로
사용하지 않는다. 원문은 AES-GCM 계열의 인증 암호화를 적용해 ciphertext·nonce·key version을
저장하고, 운영 키는 DB와 분리된 AWS KMS/Secrets Manager에서 관리한다.

`payload_fingerprint`도 정규화한 논리 입력을 서버 비밀키로 HMAC 처리한다. 이름·전화번호·
자유서술의 평문이나 복호화 가능한 값을 지문 원문과 함께 저장하지 않는다.

### 랜딩·여정·귀속

- `marketing_landing_pages`: URL을 복제하지 않고 운영하는 랜딩의 안정적 page key와 버전,
  검색 의도, 템플릿, 광고 문구 승인 ID
- `journey_sessions`: 최초 랜딩과 허용된 광고 귀속 필드
- `journey_events`: 최대 20개의 내부 page view와 상담 CTA 클릭 순서
- `consultation_attributions`: 요청 시점의 랜딩 버전·광고 출처·CTA·제출 위치 스냅샷

AdPilot이나 광고 플랫폼에서 받은 실제 파라미터 이름은 gateway 어댑터에서 다음 의미
필드로 매핑한다.

```text
adpilotClickId
platformClickId
utmSource / utmMedium / utmCampaign / utmTerm / utmContent
externalCampaignId / externalAdGroupId
externalKeywordId / externalCreativeId
matchedKeyword / matchType
```

그 밖의 쿼리 파라미터는 버린다. URL은 query·fragment를 제거한 내부 pathname만,
referrer는 host만 저장한다. `matchedKeyword`는 광고 계정에서 매칭된 입찰 키워드이며
사용자가 입력한 실제 검색어 원문으로 간주하지 않는다.

내용이 같은 광고그룹은 같은 랜딩 URL을 사용하고 click ID·campaign/ad group/keyword
값으로 측정한다. 실제 사용자 설명·FAQ·CTA가 달라지는 검색 의도만 별도 page key와
버전으로 만든다.

방문 귀속정보는 모든 상담 요청에 자동 연결한다. 분석 데이터에는 내부 pathname,
referrer host와 허용 목록의 광고 식별자만 넣으며, 전체 URL 쿼리·이름·전화·자유서술은
넣지 않는다. 분석 목적·항목·보유기간과 처리 근거는 전체 개인정보처리방침에 반영하고
출시 전 책임 변호사·개인정보 담당자가 검토해야 한다.

거주 시·도는 사용자가 제출한 상담 intake이므로 attribution row나 outbox 이벤트에
평문으로 복제하지 않는다. 향후 지역별 캠페인 성과는 권한 있는 내부 집계기가
`request_id` 기준으로 암호화 intake와 attribution을 결합해 시·도×캠페인·키워드·랜딩
단위로 산출한다. 집계 결과에는 이름·전화번호·상담 내용과 소수 개인을 식별할 수 있는
행을 포함하지 않는다.

### outbox

`outbox_events`는 상담 데이터와 같은 트랜잭션에서 생성한다. 워커는 `event_id`를 바꾸지
않고 재시도한다. 실행 워커는 `pending` 행 하나를 `FOR UPDATE SKIP LOCKED`로 선점하고
`locked_at/locked_by` 임대를 기록한다. 각 시도는 `outbox_delivery_attempts`에 시작,
성공, 재시도 예정 또는 확인 필요 상태와 PII 없는 오류 코드만 남긴다.

429·명시적인 일시 서버 오류는 최대 5회까지 30초→2분→10분→30분→1시간 간격으로
재시도하며 `Retry-After`가 더 길면 그 값을 따른다. 요청 성공 뒤 응답 유실, 워커 중단처럼
외부 생성 여부를 확정할 수 없는 실패는 중복 등록을 피하기 위해 자동 재시도하지 않는다.
ERP에서 `워커 대기/처리 중/재시도 예정/완료/확인 필요`와 시도 이력을 확인한다.

### ERP 실시간 상담 목록

`outbox_events`에 `consultation.*` 이벤트가 INSERT되고 트랜잭션이 커밋되면 PostgreSQL
트리거가 이벤트 ID·유형·상담 ID·발생시각만 `lawand_consultation_events` 채널로
`NOTIFY`한다. 이름·전화번호·상담 내용과 outbox 본문은 알림 payload에 넣지 않는다.
gateway는 전용 `LISTEN` 연결로 알림을 받아 인증된 직원 SSE에 전달하며 20초 heartbeat를
보낸다.

ERP 브라우저는 내부 API 키나 직원 세션 원문을 gateway 주소로 직접 보내지 않는다.
HttpOnly 직원 쿠키를 읽을 수 있는 ERP의 same-origin route가 gateway SSE를 프록시한다.
브라우저는 `consultation.changed`를 받을 때만 목록 API를 다시 읽으며 주기적 HTTP 폴링은
하지 않는다. 최초 연결과 자동 재연결에서는 `consultation.sync`를 받아 한 번 재조회하므로,
gateway·네트워크 중단 중 PostgreSQL `NOTIFY`가 유실돼도 현재 DB 상태로 복구한다.

리걸프렌즈 호출은 배정된 직원의 `staff_external_accounts(provider=legalfriends)` 활성
로그인 ID와 숫자형 `member_idx` 매핑이 모두 있어야 한다. 워커는
`createForLawnV2` 신건 등록 body에 `member_idx`를 보내고, 성공 응답의
`case_idx`·`case_id` 또는 숫자형 `data`를 최초 담당자 배정 완료 시각과 함께
`legalfriends_case_links`에 저장한다. 2026-07-30 V2 실제 canary에서 최초부터 지정
담당자로 생성되는 것을 확인했으므로 신건 직후 `changeManager`를 중복 호출하지 않는다.
추후 담당자가 바뀌면 보존한 사건 ID와 새 직원의 로그인 ID를 `member_id`로 보내
담당자 변경만 실행한다. 외부 API가 `Idempotency-Key`를 실제로 보장한다는 확인 전에는
`event_id` header 전송만으로 정확히 한 번 처리가 보장된다고 간주하지 않는다.

## 4. 중복 판정 순서

아래 순서를 먼저 만족한 규칙부터 적용한다.

| 순서 | 조건 | 처리 | 이벤트 |
|---|---|---|---|
| 1 | 같은 `source + idempotency_key` | 기존 응답 재생, 새 row 없음 | 없음 |
| 2 | 같은 전화 HMAC + 같은 payload HMAC, 10분 이내 | 기존 상담에 새 request 이력 부착, 기존 접수번호 반환 | 없음 |
| 3 | 같은 전화 HMAC + 같은 journey session, 30분 이내, 익명 → 실명 | 기존 상담에 request 부착, 선호 이름 갱신 | `consultation.request.updated` |
| 4 | 같은 전화 HMAC, 7일 이내 | 새 상담 생성 후 ERP 중복 의심 표시 | `consultation.requested`, `consultation.duplicate_suspected` |
| 5 | 일치 없음 또는 기존 상담 종결 | 새 상담 생성 | `consultation.requested` |

7일 기준은 자동 병합 기간이 아니라 운영자 확인 후보 기간이다. 운영 데이터에서 가족
공유번호·다른 사건·반복 제출 비율을 확인한 뒤 버전으로 조정한다. IP 주소, User-Agent,
기기 지문은 자동 병합 근거로 쓰지 않는다.

중복 접수에서도 각 `consultation_request`와 `consultation_attribution`을 남기므로 최초
익명 제출과 이후 실명 제출, 서로 다른 광고 접점이 모두 보존된다. AdPilot 성과 환류는
향후 `(consultation_id, conversion_stage)`를 유일하게 처리해 요청 횟수만큼 전환이
중복 집계되지 않게 한다.

## 5. 이벤트 계약

### `consultation.requested` v1

새 `consultation`이 만들어질 때만 1회 발생한다.

```json
{
  "eventId": "01984c7d-8500-7000-8000-000000000010",
  "eventType": "consultation.requested",
  "eventVersion": 1,
  "occurredAt": "2026-07-28T09:30:00.000Z",
  "producer": "lawand.gateway",
  "correlationId": "01984c7d-8500-7000-8000-000000000001",
  "data": {
    "consultationId": "01984c7d-8500-7000-8000-000000000001",
    "requestId": "01984c7d-8500-7000-8000-000000000002",
    "intakeRef": "consultation_requests/01984c7d-8500-7000-8000-000000000002",
    "attributionRef": "consultation_attributions/01984c7d-8500-7000-8000-000000000004",
    "mode": "quick",
    "privacyNoticeVersion": "2026-08-03.1",
    "consentAgreedAt": "2026-07-28T09:29:50.000Z",
    "dedupeOutcome": "new"
  }
}
```

같은 트랜잭션에서
`alimtalk.consultation.request_notification.requested`도 한 번 만든다. payload에는
전화번호나 메시지 본문 대신 `consultationId`, `requestId`,
`consultation_requests/...` 참조와 `templatePurpose=consultation_requested`만 둔다.
정상 멱등 재시도, 동일내용 중복, 익명→실명 보강에는 접수 알림 이벤트를 추가하지 않는다.

### `consultation.request.updated` v1

익명 접수 뒤 같은 세션에서 실명이나 추가정보를 남겨 기존 상담을 보강할 때 발생한다.
`updateReason`은 v1에서 `identity_enriched`만 허용한다. 다른 보강 시나리오는 실제 운영
사례를 확인한 뒤 계약 버전을 올려 추가한다.

### `consultation.duplicate_suspected` v1

같은 전화번호가 7일 안에 다시 들어왔지만 안전하게 자동 병합할 근거가 부족할 때 발생한다.
새 상담 ID와 비교 후보 상담 ID만 전달하며 전화번호는 전달하지 않는다.

Zod 계약은 모든 객체를 strict로 검증한다. 정의되지 않은 `phone`, `name`, `memo`,
채무·재산·소득 원문을 이벤트에 추가하면 검증 단계에서 실패한다.

### 담당 배정과 외부 실행 요청 v1

신규 상담에서 직원이 `상담하기`를 확인하면 상담 row를 잠근 뒤 한 번만 본인 담당으로
배정한다. 같은 직원의 재시도는 기존 배정 결과를 반환하고 outbox를 추가하지 않으며,
다른 직원의 동시·후속 요청은 이미 배정된 담당자를 안내하고 거부한다.

한 트랜잭션에서 다음 세 이벤트를 각각 저장한다.

- `consultation.assigned`: 담당 배정 업무 사실
- `legalfriends.consultation.registration.requested`: 리걸프렌즈 등록 실행 요청
- `alimtalk.consultation.assignment_notification.requested`: 담당 배정 알림톡 실행 요청

외부 실행 요청의 `causationId`는 `consultation.assigned`의 `eventId`다. payload에는
전화번호·이름·상담 원문을 넣지 않고 `consultationId`, `requestId`, `assignmentId`,
`consultation_assignments/...`, `consultation_requests/...` 참조만 넣는다. 향후 각
워커가 권한 있는 내부 조회로 필요한 최소정보를 읽고, outbox `eventId`를 외부 요청의
멱등성 키로 사용한다.

Solapi 알림톡 워커는 상담 전화번호를 발송 직전에만 복호화하고 승인 템플릿 변수로
변환한다. 문자 대체발송은 사용하지 않는다. HTTP 성공 안에서도 개별 메시지
`statusCode=2000`과 그룹·메시지 ID를 확인한 뒤 `alimtalk_deliveries`에 PII 없이
보존한다. 상세 템플릿·환경변수·재시도 계약은
[`SOLAPI_ALIMTALK_V1.md`](SOLAPI_ALIMTALK_V1.md)를 따른다.

리걸프렌즈 V2의 현재 등록 필드는 `case_type`, `member_idx`, `name`, `phone`,
`living_place`, `memo`다.
빠른 상담과 상세 상담 모두 `case_type=1`을 기본값으로 사용한다. 상세 상담의 도움 분야가
개인파산·면책이면 `2`, 기타이면 `3`으로 변환하며 비교·독촉 대응·미정은 기본값 `1`을
유지한다. 전화는 하이픈 포함 010 형식, 지역은 API가 지정한 정식 시·도 명칭으로 보낸다.
API 허용 목록에 없는 `해외·기타`는 임의 지역으로 바꾸지 않고 확인 필요로 남긴다.
V2 최초 등록의 담당자 반영은 실제 검증했다. 이후 ERP에서 담당자가 바뀌는 경우에만
`POST /api/bankruptcy/case/changeManager`를 호출하며 `Authorization`과 사건 ID header,
`{ "member_id": "직원 리걸프렌즈 로그인 ID" }` JSON body를 사용한다.

## 6. 한 번의 상담 제출 트랜잭션

```text
1. source + idempotency_key 조회
2. 전화 HMAC에서 도출한 PostgreSQL transaction advisory lock 획득
3. 전화·payload HMAC 후보 조회와 중복 판정
4. journey_session upsert + journey_events 저장
5. consultation 생성 또는 기존 consultation 보강
6. consultation_request 저장
7. consultation_attribution 스냅샷 저장
8. consultation_status_history 저장
9. 필요한 outbox_events 저장
10. COMMIT
```

단계 하나라도 실패하면 모두 rollback한다. 외부 API, Slack, AdPilot 호출은 이 트랜잭션
안에서 실행하지 않고 commit 뒤 outbox 워커가 담당한다.

전화 지문 단위 advisory lock은 같은 번호의 동시 제출 두 건이 모두 신규 상담으로 판정되는
경쟁을 막는다. 원문 전화번호나 복호화 가능한 값으로 lock key를 만들지 않고 HMAC 결과의
고정 비트를 사용한다. 다른 전화번호 접수끼리는 서로 기다리지 않는다.

### 6-1. 공개 접수 방어

- 브라우저는 homepage의 same-origin `/api/consultations`만 호출한다. gateway의
  `POST /v1/consultations`는 홈페이지 서버의 접수 전용 API 키가 없으면 `401`로 거부한다.
- homepage는 `application/json`과 64KB 이하 body만 전달한다. gateway도 같은 body
  상한과 strict Zod 계약을 다시 적용한다.
- 프록시가 확인한 클라이언트 주소는 홈페이지 서버에서 날짜별 HMAC 가명 키로 바꾸며,
  IP 원문은 gateway·DB·구조화 경고 로그에 전달하거나 저장하지 않는다.
- 새 idempotency key 기준 한도는 전화번호별 6회/30분·12회/24시간, 네트워크별
  60회/10분·300회/24시간이다. 공유 네트워크의 실제 이용자를 막지 않도록 네트워크
  한도는 높은 보조 한도로 둔다.
- 같은 idempotency key의 응답 유실·네트워크 재시도는 전화·네트워크 횟수를 추가로
  소비하지 않고 30회/10분까지 허용한다.
- 초과 응답은 `429 Too Many Requests`, `Retry-After`와 비식별 사용자 안내를 반환한다.
  gateway는 전화·IP·가명 키 없이 제한 차원과 재시도 시간만 구조화 경고로 남기며,
  같은 차원의 경고는 5분에 한 번으로 줄인다.
- 현재 카운터는 단일 gateway 프로세스 메모리 상태다. 재시작 시 초기화되며 다중
  인스턴스 배포 전 Redis의 원자적 공유 카운터로 교체한다. 운영 reverse proxy는
  `X-Forwarded-For`를 덮어쓰거나 append하고 실제 hop 수를
  `LAWAND_TRUSTED_PROXY_HOPS`에 설정해야 한다.
- CAPTCHA는 정상 이용자의 마찰을 피하기 위해 기본 적용하지 않는다. 실제 공격 데이터에서
  전화·네트워크 한도만으로 부족하다고 확인되면 의심 요청에만 단계적으로 적용한다.

## 7. 구현 상태와 다음 출시 게이트

- [x] 브라우저가 `idempotency_key`와 `journey_session_id`를 생성한다.
- [x] JourneyTracker가 최초 광고 파라미터를 strict 허용 목록으로 한 번만 포착한다.
- [x] gateway POST가 암호화·중복·여정·귀속·상태·outbox 단일 트랜잭션을 구현한다.
- [x] 같은 key 재시도, 동일 내용, 익명→실명, 7일 중복 의심을 개발 DB에서 통합 검증한다.
- [x] ERP 목록·상세에서 복호화 연락정보, 요청별 랜딩·CTA·광고값과 중복 근거를 본다.
- [x] 모든 상담 요청에 최소화한 분석 귀속을 자동 연결한다.
- [x] 빠른·상세 상담에 필수 거주 시·도를 받고 암호화 저장 후 ERP 목록·상세에 표시한다.
- [ ] 거주 시·도×캠페인·키워드·랜딩 내부 집계와 최소 집계 임계값을 구현한다.
- [ ] 실제 AdPilot 운영 파라미터 이름·최대 길이를 개발자 계약과 대조해 별칭을 확정한다.
- [ ] 책임 변호사·개인정보 담당자가 상담 고지 v2와 전체 처리방침을 승인한다.
- [x] ERP 초대 가입·로그인·서버 세션·기본 역할과 상담 목록·PII 상세 조회 감사 v1을 구현한다.
- [x] outbox 커밋 알림을 gateway SSE와 ERP same-origin 프록시로 전달하고, 이벤트·재연결
  시 목록을 동기화한다.
- [x] ERP `상담하기` 확인 후 본인 담당 배정, 상태이력·감사로그와 업무/리걸프렌즈/알림톡 outbox를 한 트랜잭션으로 만든다.
- [ ] 비밀번호 재설정·계정 비활성화 UI·MFA/SSO·외부 rate limit 등 인증 운영 게이트를 통과한 뒤 외부 환경에 배포한다.
- [x] 공개 POST에 IP 비저장형 전화·네트워크 rate limit, 정상 멱등 재시도 예외,
  gateway 직접 호출 차단과 구조화 경고 로그를 적용한다.
- [ ] 운영 배포 시 trusted proxy hop을 검증하고 구조화 제한 로그를 CloudWatch 경보에
  연결한다. 다중 gateway 전환 전에는 카운터를 Redis로 옮긴다.
- [ ] 외부 멱등성을 확인한 뒤 리걸프렌즈 소비자를 제한 활성화한다. V2 최초 담당자
  반영과 성공 응답 사건 ID는 실제 canary로 확인했다. 홈페이지 접수 자체는
  리걸프렌즈 등록을 만들지 않는다.
- [x] Solapi 소비자를 연결하고 상담 접수·담당 배정 실행 요청의 성공·실패·재시도를
  ERP에서 운영한다.
- [ ] Solapi 최종 발송결과 웹훅 또는 조회 소비자를 연결한다.
- [ ] Slack·AdPilot outbox 소비자를 연결한다.
