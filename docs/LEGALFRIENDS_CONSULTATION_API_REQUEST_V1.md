# 리걸프렌즈 상담 등록 API 연동 기준 v1

## 목적과 활성화 경계

로앤 홈페이지 접수만으로 리걸프렌즈에 등록하지 않는다. ERP 직원이 `상담하기`를 눌러
담당자가 확정된 뒤 gateway outbox 워커가 등록한다.

신건 등록 API V2에는 ERP 배정 직원의 숫자형 리걸프렌즈 `member_idx`를 보낸다.
성공 응답의 사건 식별자는 `case_idx`·`case_id` 또는 숫자형 `data`를 허용해 ERP
원장에 보존한다. V2 실제 canary에서 최초 담당자 반영을 확인했으므로 신건 생성 직후
담당자 변경 API를 중복 호출하지 않는다. 로그인 ID인 `member_id`는 추후 담당자가
바뀔 때 기존 `changeManager`에 사용한다.
운영 안전성 기준은 다음 두 조건이다.

1. 로앤 직원별 리걸프렌즈 로그인 ID와 `member_idx` 확보 및
   `staff_external_accounts` 매핑
2. 같은 신건 등록 요청을 안전하게 재시도할 수 있는 멱등성 동작 확인

gateway 코드의 fallback은 `LAWAND_OUTBOX_WORKER_ENABLED=false`다. 2026-07-31에는
사용자 승인으로 로컬 개발 환경만 `true`로 전환했다. 외부 멱등성 계약은 여전히
미확인 상태이므로 응답 유실·timeout은 자동 재시도하지 않고 확인 필요 원장으로 남긴다.
운영 배포 전에는 이 계약과 수동 정합화 절차를 다시 확인해야 한다. 활성화할 때는 새
토큰과 `LAWAND_LEGALFRIENDS_API_TOKEN`을 비밀관리 환경변수로 넣어야 하며 비밀값은
문서·로그·Git에 넣지 않는다.

### 실제 canary 결과

2026-07-29에 사용자 승인 아래 실제 신건 등록을 호출했다. HTTP status는 `200`이지만
response body는 다음 업무 오류였고 리걸프렌즈 UI에도 신건이 생성되지 않았다.

```json
{
  "code": 1033,
  "msg": "사건 타입이 올바르지 않습니다(1033)",
  "data": {}
}
```

JSON과 `application/x-www-form-urlencoded` 요청 모두 `cast_type=1`에 같은 결과를
반환했다. 이후 필드명을 `case_type=1`로 교정한 JSON 요청은 다음 성공 응답을 반환했고
실제 신건이 생성됐다.

```json
{
  "code": 0,
  "msg": "성공(0)",
  "data": {}
}
```

따라서 HTTP 2xx만으로 성공을 판단하지 않고 `code=0`을 성공으로, 그 밖의 code를 업무
오류로 판정한다. 다만 성공 `data`가 비어 있어 `case_idx`는 여전히 얻을 수 없다.
담당자 변경은 호출하지 않았고 canary 직후 워커를 다시 비활성화했다.

신건의 `TblCSClient.Case_idx=201936`을 별도로 확인받은 뒤에는 해당 신건을 다시 만들지
않고 `changeManager`만 호출했다. `case_idx: 201936` header와
`{ "member_id": "lawandfirm_s" }` JSON body에 HTTP 200,
`{"code":0,"msg":"성공(0)","data":{}}`가 반환됐다. 로앤 ERP 원장에도 사건번호와
담당자 변경 완료를 수동 복구 시도로 기록했다.

### 2026-07-30 변경 API canary

홈페이지 same-origin 접수 → ERP 김충환 본인 배정 → 단건 outbox 실행으로
`김충환2_테스트` 상담을 실제 전송했다. 신건 body에는 `member_id=lawandfirm_s`를
포함했고 HTTP 200과 `code=0`을 받았으나, 당시 파서는 응답에서 기존 `case_idx` 별칭을
찾지 못해 확인 필요로 중단했다.

리걸프렌즈 사건 목록을 이름으로 다시 조회해 생성 사건의 `case_id=202108`을 확인했다.
이 값은 내부 `case_idx` 연결 원장에 보존했다. 어댑터는 이후 `case_idx`, `case_id`,
camel/Pascal 변형과 숫자형 `data`를 모두 사건 식별자로 허용한다.

사건 목록의 최초 담당자는 `신건자동등록(lawandfirm_s200)`이었다. 즉, 실제 요청의
`member_id`는 최초 담당자에 반영되지 않았다. 기존 `changeManager`에 사건 202108과
`member_id=lawandfirm_s`를 보내 HTTP 200·`code=0`을 받은 뒤, 목록에서
`김충환(lawandfirm_s)`으로 바뀐 것을 확인했다. 첫 확인 실패와 수동 정합화 성공을 ERP
실행 원장에 모두 남겼다. 당시 워커는 신건 body에 `member_id`를 계속 보내고
`changeManager` 안전 확인을 유지했다. 이 동작은 아래 V2 canary 뒤 교체됐다.

### 2026-07-30 V2 canary

제공자가 신건 등록 endpoint를 `createForLawnV2`로 바꾸고 기존 body에 숫자형
`member_idx`를 추가했다. 리걸프렌즈 사건 목록에서 김충환 계정은 로그인 ID
`lawandfirm_s`, `member_idx=138`로 확인했다.

홈페이지 same-origin API로 `김충환2_테스트`·`010-4908-1382` 빠른 상담을 접수해
`LA-260730-GRMVUCM2`를 받았다. ERP에서 김충환 본인 배정 후 해당 outbox 한 건만
실행했다. V2는 HTTP 200·업무 `code=0`과 사건 ID `202130`을 반환했고 내부 원장은
첫 시도에 `published/succeeded`가 됐다.

리걸프렌즈 사건 목록에서 사건 202130의 최초 담당자가
`김충환(lawandfirm_s, member_idx=138)`임을 확인했다. 별도 `changeManager` 호출은
없었다. 이 결과로 V2의 사건 식별자 반환과 최초 담당자 반영은 확인됐고, 남은 상시
V2의 생성·최초 담당자 반영은 확인됐다. 외부 멱등성 계약과 응답 유실 건의 수동 정합화
절차는 운영 안전성 확인 항목으로 남아 있다.

## 현재 확인된 명세

- endpoint:
  `POST https://www.legalfriends.co.kr/api/bankruptcy/case/createForLawnV2`
- 서버 인증용 JWT가 제공됐으나 문서와 저장소에는 기록하지 않는다.
- 현재 확인된 body:

| 필드 | 변환 |
|---|---|
| `case_type` | 기본 `1`, 개인파산·면책 선택 시 `2`, 기타 선택 시 `3` |
| `member_idx` | 배정 직원의 숫자형 리걸프렌즈 member_idx |
| `name` | 상담 선호 이름, 없으면 로앤 익명 표시명 |
| `phone` | `010-1234-5678` 하이픈 포함 |
| `living_place` | 아래 정식 시·도 명칭 |
| `memo` | 상담 방식과 입력 답변을 줄 단위로 정리 |

`case_type`은 빠른 상담과 상세 상담 모두 기본값 `1`로 보낸다. 상세 상담의
`어떤 도움이 가장 필요하신가요?`에서 `개인파산·면책`을 선택한 경우만 `2`,
`기타`를 선택한 경우만 `3`으로 보낸다. 두 제도 비교, 독촉·법원 문서·압류 대응,
아직 모름은 기본값 `1`이다.

거주지는 다음 값만 전송한다.

```text
서울특별시, 인천광역시, 대전광역시, 대구광역시, 울산광역시, 광주광역시,
부산광역시, 세종특별자치시, 제주특별자치도, 강원도, 경기도, 충청북도,
충청남도, 경상북도, 경상남도, 전라북도, 전라남도
```

홈페이지가 허용하는 `해외·기타`는 위 목록에 없으므로 임의 국내 지역으로 바꾸지 않는다.
이 경우 워커는 `unsupported_residence_region` 확인 필요 상태로 남긴다.

## 2026-07-29 확정된 담당자 변경 명세

- endpoint:
  `POST https://www.legalfriends.co.kr/api/bankruptcy/case/changeManager`
- headers:
  - `Authorization: {server-credential}`
  - `case_idx: {신건 등록 응답의 case_idx}`
  - `Content-Type: application/json`
- body:

```json
{
  "member_id": "직원의 리걸프렌즈 로그인 ID"
}
```

직원 리걸프렌즈 로그인 ID와 `member_idx`는 관리자가 ERP 직원 초대 시 함께 입력하거나
`/staff`에서 함께 연결·변경·해제한다. 배정 직원에게 두 값이 모두 있는 활성 매핑이
없으면 신건을 만들기 전에 확인 필요로 중단한다.

## 리걸프렌즈 담당자에게 추가로 확인할 사항

1. 비활성·퇴사·잘못된 `member_idx`·`member_id`와 잘못된 `case_idx`의 HTTP 상태·오류 코드
2. 두 API의 JWT 만료·갱신 방식
3. 신건 body 필수 여부·최대 길이와 `memo` 개행 허용 여부
4. `Idempotency-Key` 지원 또는 로앤 event ID/consultation ID unique 처리 가능 여부
5. 400·401·403·404·409·422·429·5xx의 의미, `Retry-After`, timeout·호출량 제한
6. 개인정보 암호화, 접근감사, 보유·삭제와 운영 로그 마스킹 기준

## 요청과 재시도 기준

현재 어댑터는 신건 등록 때 첫 요청만 실행한다. 담당자 값은 ERP 배정 직원의 활성 외부
계정 매핑에서만 읽는다. 두 번째 담당자 변경 요청은 동일 사건의 담당 직원이 나중에
바뀐 경우에만 실행한다.

```http
POST /api/bankruptcy/case/createForLawnV2
Authorization: {server-credential}
Idempotency-Key: {lawand-outbox-event-id}
X-Correlation-ID: {lawand-consultation-id}
Content-Type: application/json
```

```json
{
  "case_type": 1,
  "member_idx": 138,
  "name": "홍길동",
  "phone": "010-1234-5678",
  "living_place": "서울특별시",
  "memo": "접수 방식: 상세 상담\n도움 분야: 개인회생\n..."
}
```

신건 성공 응답에서 사건 식별자를 얻으면 최초 담당자 배정 완료 시각과 함께 내부
`legalfriends_case_links` 원장에 저장한다.

```http
POST /api/bankruptcy/case/changeManager
Authorization: {server-credential}
case_idx: {created-case-id}
Idempotency-Key: {lawand-outbox-event-id}:change-manager
X-Correlation-ID: {lawand-consultation-id}
Content-Type: application/json
```

```json
{
  "member_id": "{직원 리걸프렌즈 로그인 ID}"
}
```

PII는 외부 실행 요청 outbox payload에 넣지 않는다. 워커가 실행 시점에
`consultation_requests` 암호문을 복호화해 전송하고 요청·응답 body를 로그나 실행 원장에
저장하지 않는다. 광고 귀속값은 상담 수행에 필요하지 않으므로 전송하지 않는다.

추후 담당자 변경만 실패한 경우에는 보존한 사건 ID로 담당자 변경만 재시도하며 신건을
다시 만들지 않는다. 명시적인 429·일시 오류는 최대 5회 재시도한다.
연결 중단·timeout처럼 신건 생성 여부를 확정할 수 없는 실패는 중복 생성을 피하기 위해
자동 재시도하지 않고 ERP에 확인 필요로 남긴다. 멱등성 지원이 확인되면 이 보수적 정책을
완화할 수 있다.
