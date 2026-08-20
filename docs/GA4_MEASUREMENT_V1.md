# GA4·AdPilot 광고 성과 측정 계약 v1

> 계약 ID: `lawand-ga4-measurement-v1`
> 확정일: 2026-08-19
> 상태: GA4 운영 속성·웹 스트림·운영 ID와 무팝업 hotfix 배포·24시간 수신 검증 완료
> 현재 외부 상태: 로앤 GA4 운영 웹 스트림은 활성화했고 네이버 광고 계정은 아직 연결하지 않음
> AdPilot 상대 기준: `docs/integrations/lawand-ga4-measurement-v1.md` v1.1.0,
> 커밋 `b2ef82111b5f63e9d279f716c77e3a58154d9e5f`

이 문서는 로앤 홈페이지의 GA4 측정과 AdPilot 성과 분석이 같은 의미를 사용하도록 정한
인터페이스 계약이다. 실제 계정 연결 전에도 구현할 수 있는 데이터 경계와 이벤트 의미를
먼저 고정한다. 네이버 광고 계정을 연결한 뒤 실제 파라미터가 이 계약과 다르면 운영 URL을
우선 바로잡고, 범용 계약을 바꿔야 할 때만 양쪽 저장소에서 계약 버전을 함께 올린다.

## 1. 목적과 범위

v1의 목적은 다음 세 가지다.

1. Next.js 홈페이지 이용 경로를 GA4에서 측정하되 전송 항목을 정제한다.
2. 홈페이지가 실제로 새 상담을 만든 경우만 GA4 권장 이벤트 `generate_lead`로 측정한다.
3. AdPilot이 GA4의 관측 리드를 캠페인·키워드 단위로 읽되, ERP의 전체 운영 리드와
   혼동하지 않게 한다.

v1은 현재 Next.js 홈페이지의 모든 공개 페이지와 실제 광고에 사용하는 최종 랜딩 URL을
대상으로 한다. 운영 Caddy가 기존 Cafe24로 보내는 레거시 URL은 같은 루트 레이아웃을
공유하지 않으므로, 전수 목록을 만든 뒤 전역 템플릿에 같은 측정 계약을 적용하거나
Next.js 페이지로 이전하기 전까지 범위에서 제외한다.

구현 후보에서 루트 분석 컴포넌트가 적용되는 공개 페이지 전수는 다음과 같다.

- `/`, `/about`, `/people`, `/privacy`, `/terms`
- `/bank`, `/bank/compare`, `/bank/consultation`, `/bank/guides/costs`
- `/bank/personal-rehabilitation`과 하위 `eligibility`, `process`, `documents`, `repayment`
- `/bank/personal-bankruptcy`와 하위 `eligibility`, `process`, `documents`
- `/bank/situations`와 하위 `collection-and-seizure`, `investment-debt`, `self-employed`
- `/bank/cases`, `/bank/cases/[slug]`, `/bank/reviews`, `/bank/reviews/write`,
  `/bank/self-diagnosis`

Next.js redirect가 이 목록의 최종 URL로 보내는 기존 `/bank/...`·루트 구주소도 최종 페이지에서
측정한다. 운영 Caddy의 `@lawand_new` 경계인 `/`, `/bank*`, `/about*`, `/people*`,
`/privacy*`, `/terms*` 밖에서 Cafe24 fallback으로 전달되는 모든 URL은 v1 미적용 집합이다.
외부 네이버 계정 연결 뒤 활성 광고 랜딩 전수를 읽어 이 미적용 집합이 0건인지 별도
확인하며, 남아 있으면 광고를 시작하기 전에 Next.js 최종 `200` URL로 바꾼다.

다음은 v1 범위가 아니다.

- 맞춤형 광고, 리마케팅, 잠재고객 목록, Google Signals, User-ID
- Google Ads 연결, 향상된 전환, 사용자 제공 데이터
- 전화 링크 클릭이나 카카오 채널 진입을 실제 리드로 집계하는 것
- GA4 값만으로 자동 입찰·예산·광고 문구를 바꾸는 것
- ERP에 GA4 전용 대시보드를 만드는 것

## 2. 지표의 원장과 책임 경계

| 데이터 | 기준 원장 | 의미 |
|---|---|---|
| 광고비·노출·클릭 | 네이버 광고, 이후 AdPilot 동기화 | 광고 플랫폼이 확정한 매체 성과 |
| 방문 광고 귀속 | 홈페이지 `JourneyTracker` → gateway | 모든 상담 요청에 붙는 최소 운영 귀속 |
| 전체 상담·중복·배정·계약·입금 | gateway·ERP | 실제 운영 성과의 단일 기준 |
| 페이지뷰·`generate_lead` | GA4 | GA4가 관측한 방문·리드 |
| GA4 키워드 성과 | AdPilot | GA4 관측치 안에서의 기여·미기여 분석 |

브라우저에서 GA4가 차단된 방문도 홈페이지가 이미 수집하는 허용 목록의 가명 광고 귀속은 상담 요청과
함께 gateway에 저장한다. 이 값은 상담 처리와 캠페인 운영을 위한 기존 first-party
귀속이며 GA4 전송과 별개로 관리한다. 목적·항목·보유기간·거부 방법은 실제 처리와
일치하도록 개인정보처리방침에서 고지하고 출시 전 책임 변호사·개인정보 담당자가 검토한다.

AdPilot 화면에서 GA4가 반환한 합계는 `GA4 관측 리드`로 부른다. 이를 `전체 리드`나 ERP의
전체 상담 건수로 표시하지 않는다. 전체 유효상담·계약·매출 최적화는 후속 ERP/gateway
성과 연동이 완료된 뒤 시작한다.

## 3. 태그 로딩과 Google 기능 설정

홈페이지는 별도 동의 배너나 분석 설정 UI를 표시하지 않는다. 유효한 운영 Measurement ID를
same-origin 설정 API에서 받은 뒤 GA 스크립트를 자동으로 불러온다. SSR되는 Client
Component의 최초 출력은 브라우저 저장소나 현재 시각에 의존하지 않는 결정적 `null`이어야
한다.

| 저장 유형 | 적용값 | 조건 |
|---|---|---|
| `analytics_storage` | `granted` | 유효한 운영 Measurement ID가 있을 때 자동 활성화 |
| `ad_storage` | `denied` | 항상 거부 |
| `ad_user_data` | `denied` | 항상 거부 |
| `ad_personalization` | `denied` | 항상 거부 |

분석 선택값은 브라우저 저장소에 보존하지 않는다. 개인정보처리방침에는 처리위탁·국외 이전
항목과 브라우저의 쿠키·사이트 데이터 차단 또는 삭제 방법을 고지한다. 생성하는 `_ga` 계열
쿠키는 `cookie_update=false`와 14개월 만료를 함께 적용해
최초 생성 시점부터 14개월을 넘겨 갱신하지 않는다.

GA4 운영 속성은 법무법인 로앤이 소유한다. 시간대는 `Asia/Seoul`, 통화는 `KRW`로 둔다.
운영과 개발 측정은 분리하고, AdPilot은 운영 웹 스트림만 선택한다. GA 관리 화면과 태그는
다음을 함께 적용한다.

- 태그 `config`의 `send_page_view`는 `false`
- 향상된 측정 전체를 비활성화해 스크롤·외부 링크·사이트 검색·동영상·파일 다운로드·
  폼 상호작용·브라우저 히스토리 페이지 변경을 자동 수집하지 않음
- 계정 데이터 공유 네 항목을 모두 비활성화
- Google Signals·사용자 제공 데이터·광고 개인화 신호·광고 관심그룹 기능은 비활성화
- 세부 위치·기기 데이터 수집은 전 지역에서 비활성화
- 보고 ID는 기기 기반으로 설정
- 이벤트·사용자 데이터 보유기간은 14개월, 새 활동 시 보유기간 재설정은 끔
- 이메일 주소 가림을 켜고 금지 URL 쿼리 키를 데이터 가림 목록에 등록
- Google Ads·Firebase·BigQuery 등 제품, User-ID, 잠재고객·리마케팅 공유는 연결하지 않음

2026년 8월 19일 공식 문서 기준 계약 주체는 Google LLC이며, Google은 자신 또는
재수탁자가 시설을 운영하는 국가에서 데이터를 처리할 수 있다. 개인정보처리방침 후보는
현재 Google Analytics 재수탁자 소재지와 Google 데이터센터 국가를 합친 국가 목록,
이전 항목·시기·방법·목적·14개월 보유·거부 효과를 고지한다. Google 약관상 시스템 삭제는
요청 또는 계약 종료 뒤 최대 180일이 걸릴 수 있고, GA 표준 집계 보고서는 이용자·이벤트
보유 설정의 적용 대상이 아님도 함께 알린다. 실제 활성화 전 책임 변호사·개인정보
보호책임자가 이 고지와 Google 약관 수락을 승인하고, 국가 목록이 달라지면 먼저 고지와
동의 버전을 갱신한다.

계정 생성과 운영 검증의 정확한 값·증거·중단 절차는
[`GA4_OPERATIONS_ACTIVATION_V1.md`](GA4_OPERATIONS_ACTIVATION_V1.md)를 따른다.

홈페이지 서버는 공개값인 Measurement ID만 런타임 환경변수
`LAWAND_GA4_MEASUREMENT_ID`로 받는다. 내부 same-origin `/api/analytics-config`는 매 요청에
`G-` 형식을 다시 검증해 유효한 ID 또는 `null`만 브라우저에 반환하고 캐시하지 않는다.
값이 없거나 검증에 실패하면 분석 기능 전체를 비활성화한다. OAuth 토큰, GA 속성 ID,
AdPilot 자격증명은 홈페이지에 두지 않는다. ID를 이미지 빌드 입력으로 만들지 않아 같은
커밋의 불변 ECR 이미지가 환경별 값에 따라 달라지지 않게 하며, 운영 홈페이지 secret과
컨테이너 환경에서만 설정한다.

## 4. 페이지뷰와 URL 정제 계약

루트 분석 컴포넌트가 `usePathname`·`useSearchParams`를 구독하고, `Suspense` 안에서 최초
페이지와 client navigation마다 수동 `page_view`를 한 번 보낸다. GA 관리 화면의 자동
히스토리 측정과 수동 전송을 동시에 켜지 않는다.

GA에 보내는 `page_location`은 로앤 정식 origin, 허용된 공개 pathname, 아래 허용 필드만
새로 조립한다. 원래 `window.location.href`를 그대로 보내지 않는다. 공개 경로 허용 목록에
없는 임의 pathname은 `/_not-found`로, `/bank/cases/[slug]`는
`/bank/cases/_detail`로 일반화해 URL 경로에 섞인 자유 입력·식별자가 GA에 전달되지 않게
한다. 같은 정규화를 first-party 방문 여정과 상담 CTA 경로에도 적용한다.

| 파라미터 | 허용값 |
|---|---|
| `utm_source` | AdPilot이 관리하는 100자 이하 출처 slug |
| `utm_medium` | 100자 이하 매체 slug |
| `utm_campaign` | 200자 이하의 통제된 캠페인 slug |
| `utm_content` | 200자 이하의 통제된 소재 slug |
| `utm_term` | `^nkw-[a-z0-9-]{1,124}$` 내부 키워드 키일 때만 |
| `n_keyword_id` | `^nkw-[a-z0-9-]{1,124}$` 내부 키워드 키일 때만 |

`n_query`, 실제 검색어, 임의 쿼리, fragment는 항상 버린다. `page_referrer`도 query와
fragment를 제거하며 외부 referrer는 최소 origin 정보만 사용한다. 이후 이벤트가 기본으로
참조하는 전역 페이지 위치도 같은 정제값으로 갱신한다.

태그를 처음 구성할 때도 정제한 현재 위치와 referrer를 먼저 넣어 `send_page_view=false`
초기화 과정이 브라우저의 원본 URL을 기본값으로 잡지 않게 한다.

현재 운영 귀속의 허용 목록은 GA URL 허용 목록보다 넓다. `adpilot_click_id`, `nclid`,
campaign/ad group/creative ID 같은 불투명 식별자는 gateway 귀속에 보존할 수 있지만, v1의
GA `page_location`에는 AdPilot의 Data API 분석에 실제 필요한 것으로 확인된 값만 추가한다.
실제 네이버 계정 연결 후 자동 추적값을 캡처해 형식과 길이를 검증하기 전에는 허용 목록을
추측해 넓히지 않는다.

GA에는 이름, 전화번호, 접수번호, `consultation_id`, `request_id`, `journey_session_id`,
idempotency key, IP 원문, 거주지역, 자유서술, 채무·재산·소득·진단 답변을 보내지 않는다.
해시나 암호화값으로 바꿔 보내는 것도 금지한다.

## 5. 이벤트 계약

애플리케이션이 직접 보내는 이벤트는 아래 `page_view`와 `generate_lead`뿐이다. GA4는
Analytics가 활성화된 방문에서 `first_visit`, `session_start`, `user_engagement` 같은 기본
이벤트를 자동 생성할 수 있다. 이는 페이지·세션 통계를 구성하는 수반 처리로 고지하되,
향상된 측정은 전체 비활성화해 스크롤·검색·폼 등 추가 상호작용 이벤트로 범위를 넓히지
않는다. 기본 이벤트가 참조하는 페이지 위치도 애플리케이션의 정제값을 사용한다.

### `page_view`

- 운영 Measurement ID 확인 후 최초 페이지에서 한 번
- Next.js client navigation으로 URL이 바뀔 때 한 번
- 같은 URL의 effect 재실행이나 React 개발 모드 재호출로 중복 전송하지 않음
- 정제한 `page_location`, 정제한 `page_referrer`, 현재 `page_title`만 사용

### `generate_lead`

다음 두 경로가 실제 상담 생성 API의 성공 응답을 확인했을 때만 후보가 된다.

1. `/bank/consultation`의 직접 상담 요청
2. `/bank/self-diagnosis`의 상담 접수를 포함한 자가진단 제출

다음 조건을 모두 만족해야 한다.

- HTTP 성공과 유효한 `publicReceiptCode` 확인
- `dedupeOutcome`이 `new` 또는 `suspected_duplicate`
- 같은 논리 제출을 위한 브라우저 세션 성공 마커가 없음

`exact_duplicate`, `identity_enrichment`, `repeat_unassigned`, `repeat_assigned`는 전환으로
보내지 않는다. `replayed=true`만으로 제외하지 않는다. 최초 응답을 브라우저가 받지 못한 뒤
같은 idempotency key로 재시도한 성공일 수 있으므로, 같은 키의 로컬 성공 마커가 있을 때만
건너뛴다. 자가진단 idempotency key는 한 논리 제출과 네트워크 재시도 동안 안정적으로
유지하고 새 진단을 시작할 때만 교체한다.

Measurement ID가 없거나 브라우저에서 GA가 차단된 시점의 성공 제출도 로컬 성공 마커는
먼저 남기고 GA에는 보내지 않으며 과거 성공을 소급 전송하지 않는다.

성공 마커를 만드는 식별자는 GA로 보내지 않는다. 이벤트에는 `value`, 예상 수임료,
접수번호, 상담 종류, 진단 답변 같은 사용자·사건 정보도 넣지 않는다. v1은 애플리케이션이
논리 제출당 한 번 호출하도록 보장하지만 브라우저 종료·차단·네트워크 실패를 넘어 GA 수신의
전역 exactly-once를 약속하지 않는다.

전화 링크 클릭은 통화 연결이 아니고 카카오 채널 이동은 실제 채팅 성립이 아니므로
`generate_lead`로 보내지 않는다. 후속 단계에서 PBX·카카오 확인·ERP 운영 결과를 근거로
별도 성과 계약을 만든다.

## 6. AdPilot 계약

AdPilot은 고객 소유 GA4 속성을 `analytics.readonly`로 읽고 운영 property·web stream과
`generate_lead`를 프로젝트 목표에 연결한다. 네이버 광고 계정을 연결하지 않아도 이 문서와
홈페이지 구현은 진행할 수 있다. 실제 광고 연결 후에는 다음을 검증한다.

1. 활성 캠페인의 랜딩이 redirect URL이 아니라 최종 `200` Next.js URL인지 확인
2. 자동 추적 또는 URL 템플릿이 보내는 실제 파라미터 이름·값·길이 캡처
3. 키워드 키가 `nkw-...` 계약을 만족하고 GA의 `sessionManualTerm` 또는 정제된
   `landingPagePlusQueryString`에서 복원되는지 확인
4. 태그 없는 합성 방문은 미기여, 태그 방문은 해당 키워드 기여로 분리되는지 확인

실제 값이 다르면 로앤 전용 분기를 AdPilot에 하드코딩하지 않는다. 캠페인 URL 계약을
고치거나, 다른 고객에게도 유효한 범용 파서 변경으로 검토하고 테스트를 추가한다.

`generate_lead`는 전화·카카오 실제 성과가 빠진 동안 보조 목표로 사용한다. GA4 관측 리드의
CPA/ROAS는 탐색 지표이며 자동 최적화 입력으로 쓰지 않는다. gateway/ERP의 유효상담·계약·
입금 결과를 PII 없이 연결하고 일정 기간 누락률·안정성·표본을 확인한 뒤 주 목표와 자동
피드백 사용 여부를 별도로 승인한다.

AdPilot v1.1.0은 **최적화 역할**과 **현재 열어 보는 보고 목표**를 범용 UI에서 분리했다.
활성·GA4 매핑 목표라면 primary, supporting, diagnostic과 관계없이 URL `goal` 선택으로
상세 키워드 표를 볼 수 있고, 열람 선택이 역할 변경이나 자동 최적화 승인을 뜻하지 않는다고
표시한다. 따라서 로앤 `generate_lead`는 supporting 상태를 유지한 채 상세 분석할 수 있다.
`GA4 전체`처럼 ERP 전수로 오해할 문구는 `GA4 관측`으로 바꾸고 측정 화면의 특정 고객명
하드코딩도 제거했다.

키워드 파서는 유효한 `sessionManualTerm`과 랜딩의 `n_keyword_id` 또는 `utm_term`을 독립
검증한다. 둘이 같거나 한쪽만 유효하면 해당 `nkw-...`에 귀속하고, 둘 다 유효하지만 다르면
한쪽을 임의 선택하지 않는다. 그 이벤트 수는 미귀속에 포함하면서 `conflictingEvents`로
별도 진단하며 전체에 중복 가산하지 않는다. 실제 계정 연결 뒤에는 충돌 빈도와 미귀속 포함
여부를 확인하고, 충돌이 있으면 캠페인 URL 계약을 수정한다.

## 7. 출시 게이트

구현 브랜치는 다음을 모두 통과해야 한다.

- 동의 배너·분석 설정 UI가 어느 공개 페이지에도 없음
- 최초 로드 1회, client navigation 1회씩만 `page_view` 전송
- `n_keyword_id=nkw-e2e-test&n_query=민감검색어` 합성 URL에서 키워드 키만 전송
- 사례 상세 slug는 `/bank/cases/_detail`, 임의·404 경로는 `/_not-found`로 일반화
- 검증·네트워크 실패와 비대상 중복 판정은 `generate_lead` 0회
- 직접 상담 신규 성공과 자가진단 신규 성공은 논리 제출당 각각 1회
- GA 네트워크 payload에 금지 데이터가 없음
- 모든 Next.js 공개 페이지와 활성 광고 랜딩의 측정 가능 여부 확인
- Cafe24 레거시 미적용 URL 목록과 후속 처리 결정 기록
- 홈페이지 typecheck·lint·test·production build와 모바일 Chrome hydration 검증
- AdPilot에서 운영 스트림·목표·키워드 기여 검증
- 개인정보처리방침 초안의 책임 변호사·개인정보 담당자 검토

현재 구현은 로컬 정제·중복 테스트와 전체 5패키지 typecheck·lint·test·production build를
통과했고 운영 Measurement ID와 같은 이미지의 runtime 설정 API로 활성화됐다. 무팝업
hotfix 뒤 최초·내부 이동·모바일 `page_view`가 각각 한 번 전송되고 민감 query·fragment·
연락처·검색어가 제거되는 것을 확인했다. 2026-08-20 실시간·일반 보고서 수신과 기존 운영
`generate_lead` 감지, 주요 이벤트 표시도 확인했다. AdPilot 운영 OAuth·목표·키워드 귀속과
네이버 광고 연결은 아직 성공으로 선언하지 않으며, 책임 변호사·개인정보 보호책임자의 고지·
설정 정기 대조는 운영 게이트로 계속 유지한다.

운영 상담 폼 canary는 실제 상담 원장을 변경하므로 메인 통합·배포 세션의 별도 승인을
받아야 한다. 구현 worktree는 main 병합, 운영 GA 설정, 운영 배포, 실제 광고 클릭·상담 생성,
자동 캠페인 변경을 수행하지 않는다.

## 8. 변경 관리

이 계약의 의미를 바꾸는 변경은 계약 ID를 `v2` 이상으로 올리고 다음을 같은 변경 단위로
대조한다.

- 로앤 `PROJECT_PLAN.md`와 이 문서
- 홈페이지 전송·정제·자동 로딩 구현과 테스트
- 개인정보처리방침과 실제 GA 관리 설정
- AdPilot의 goal mapping·파서·지표 명칭·테스트

단순 Measurement ID, property ID, stream ID 같은 환경별 값은 계약 버전을 올리지 않지만
Git에 비밀값으로 저장하지 않고 운영 원장에 변경 시각과 검증 결과를 남긴다.

## 9. 공식 기준 자료

- Google Analytics의 `page_location` 기본값과 구성 매개변수:
  <https://developers.google.com/analytics/devguides/collection/ga4/reference/config>
- client navigation과 향상된 측정 페이지뷰 동작:
  <https://developers.google.com/analytics/devguides/collection/ga4/views?hl=ko>
- Google basic consent와 동의 유형의 기본·업데이트 설정:
  <https://developers.google.com/tag-platform/security/guides/consent>
- Google Analytics가 사용하는 `_ga` 계열 first-party 쿠키:
  <https://support.google.com/analytics/answer/11397207?hl=ko>
- GA4 자동 수집 기본 이벤트와 향상된 측정 이벤트 구분:
  <https://support.google.com/analytics/answer/9234069?hl=ko>
- GA4 이용자·이벤트 데이터 보유 설정:
  <https://support.google.com/analytics/answer/7667196?hl=ko>
- GA4 데이터 가림:
  <https://support.google.com/analytics/answer/13544947?hl=ko>
- GA4 지역별 데이터 수집과 IP 처리:
  <https://support.google.com/analytics/answer/11598602?hl=ko>
- GA4 세부 위치·기기 데이터 수집:
  <https://support.google.com/analytics/answer/12002752?hl=ko>
- Google Analytics 서비스 약관(대한민국):
  <https://marketingplatform.google.com/about/analytics/terms/kr/>
- Google Ads 데이터 처리 약관:
  <https://business.safety.google/adsprocessorterms/>
- Google Analytics 재수탁자와 Google 데이터센터 위치:
  <https://business.safety.google/adssubprocessors/>,
  <https://datacenters.google/locations/>
- Google 파트너 사이트 데이터 처리 안내:
  <https://policies.google.com/technologies/partner-sites>
- 네이버 검색광고 API의 `nkw-a001-...` 키워드 ID 예시:
  <https://naver.github.io/searchad-apidoc/release/2025/12/03/release-note/>
- 개인정보보호위원회 개인정보 처리방침 작성지침:
  <https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&nttId=12018>
