# 로앤 GA4 운영 활성화 실행서 v1

> 기준일: 2026-08-19
> 상태: Analytics 계정·속성·웹 스트림·운영 ID·무팝업 hotfix 배포와 24시간 수신 검증 완료
> 측정 계약: [`GA4_MEASUREMENT_V1.md`](GA4_MEASUREMENT_V1.md)
> 원칙: 맞춤형 광고를 사용하지 않고, 별도 동의 UI 없이 최소화·정제한 분석만 측정

이 문서는 로앤 GA4 운영 속성을 만들 때 누가 어디에서 무엇을 설정하고, 어떤 증거를
남긴 뒤 다음 세션으로 넘길지 정한 실행 체크리스트다. Google 화면의 명칭은 변경될 수
있으므로 실제 화면과 공식 도움말을 대조하되, 아래 데이터 경계를 임의로 넓히지 않는다.

## 1. 작업 위치와 책임

| 단계 | 작업 위치 | 담당 | 완료 산출물 |
|---|---|---|---|
| 코드·고지 후보 | 이 `GA4_insert` worktree | 홈페이지 세션 | 자동 로딩, 개인정보처리방침, 테스트·빌드, 브랜치 커밋 |
| 계정·속성·스트림 | 로앤 소유 Google Analytics 관리 화면 | 로앤 계정 관리자 + 홈페이지 세션 | 계정·속성·스트림 식별자와 설정 검증 기록 |
| 법적 승인 | 로앤 내부 | 김충환 개인정보 보호책임자·책임 변호사 | 국외이전 고지·Google 약관 수락 승인 |
| 운영 ID·배포 | `main` 통합·배포 세션 | 메인 세션 | 운영 secret 설정, digest 배포, 브라우저 검증 |
| 읽기 전용 연결 | AdPilot `ga4_advertisement_with_lawand_session` | AdPilot 세션 | GA4 OAuth·property/stream/goal 매핑, 키워드 기여 검증 |
| 네이버 광고 연결 | AdPilot 세션 | AdPilot 세션 + 광고 계정 관리자 | 활성 랜딩·추적 파라미터 전수 검증 |

이 worktree에서는 `main` 병합, 운영 secret 변경, 운영 배포, 실제 상담 생성과 광고 변경을
하지 않는다. GA 속성 생성은 코드 배포와 독립적이지만, 아래 사전 게이트와 소유 계정
로그인을 통과한 뒤에만 실행한다.

## 2. 생성 전 게이트

- [x] Google 로그인 계정이 개인 소유가 아니라 법무법인 로앤이 회수·승계할 수 있는
  `legalflow.co.kr` 조직 관리 계정인지 확인
- [ ] 로앤 구성원 관리자 2명 이상을 확보하고 다중 인증·복구 수단을 설정
- [x] Google Analytics 약관을 법무법인 로앤을 대리해 수락할 권한이 있는 사용자가 직접 확인·수락
- [ ] 개인정보처리방침의 Google LLC, 처리 국가, 항목, 시기·방법, 목적, 보유기간,
  거부 방법·효과를 개인정보 보호책임자가 승인
- [x] Google 재수탁자와 데이터센터 국가 목록을 활성화 당일 다시 대조하고, 현재 고지의
  `2026년 8월 19일 기준` 목록과 다르면 먼저 고지를 갱신
- [ ] 계정·속성·스트림 식별자와 설정 증거를 보관할 로앤 내부 운영 원장을 지정

Google 비밀번호, 일회용 인증번호, 복구 코드와 OAuth refresh token은 대화·Git·문서에
남기지 않는다. 로그인과 약관 수락은 사용자가 지원되는 브라우저에서 직접 수행한다.

## 3. 계정·속성·웹 스트림 생성값

### 3-1. Analytics 계정

| 항목 | 설정값 |
|---|---|
| 계정 이름 | `법무법인 로앤` |
| 소유 주체 | 법무법인 로앤 |
| 국가·약관 지역 | 대한민국 |
| 데이터 공유 설정 | 네 항목 모두 끔 |

`Google 제품 및 서비스`, `벤치마킹`, `기술 지원`, `계정 전문가`처럼 표시되는 계정 데이터
공유 선택은 모두 끈다. 화면 명칭이나 항목 수가 달라지면 각 선택의 설명을 캡처하고,
Google의 자체 목적 사용 또는 다른 고객과의 공유를 넓히는 선택은 활성화하지 않는다.

### 3-2. 운영 속성

| 항목 | 설정값 |
|---|---|
| 속성 이름 | `로앤 홈페이지 운영` |
| 보고 시간대 | `대한민국`, `Asia/Seoul` |
| 통화 | `KRW` |
| 업종 | `사법 및 정부 기관` |
| 조직 규모 | 생성 당일 실제 임직원 규모를 사용하고 운영 원장에 선택값 기록 |
| 비즈니스 목표 | `리드 생성`, `웹 및 앱 트래픽` |

업종·규모·비즈니스 목표는 사실과 다른 값을 추정해 입력하지 않는다. 이 항목들은 보고서
초기 구성을 바꿀 수 있지만 수집 범위를 넓힐 권한은 아니다.

### 3-3. 운영 웹 스트림

| 항목 | 설정값 |
|---|---|
| 플랫폼 | 웹 |
| 웹사이트 URL | `https://lawandfirm.com` |
| 스트림 이름 | `lawandfirm.com 운영` |
| 향상된 측정 | 생성 전에 전체 끔 |

개발·미리보기 host는 운영 스트림에 넣지 않는다. 개발 측정이 필요해지면 별도 속성 또는
별도 스트림과 별도 Measurement ID를 쓰며, AdPilot에는 운영 스트림만 연결한다.

## 4. 생성 직후 관리 설정

다음 값을 모두 확인하기 전에는 Measurement ID를 운영 홈페이지에 설정하지 않는다.

### 4-1. 수집 최소화

- [x] `데이터 스트림 → 웹 스트림 → 향상된 측정` 전체 끔
- [x] `데이터 수집 → Google Signals` 끔
- [x] `사용자 제공 데이터 수집`과 사용자 제공 데이터 기능 끔
- [x] `세부 위치 및 기기 데이터 수집`을 모든 지역에서 끔
- [x] 광고 개인 최적화·광고 개인화 허용 끔(허용 지역 `0/307`)
- [x] 보고 ID는 `기기 기반` 사용
- [x] Google Ads, Search Ads 360, Display & Video 360, Firebase, BigQuery 연결 없음
- [x] User-ID, 잠재고객 공유, 리마케팅, 예측 잠재고객을 만들지 않음

홈페이지 태그도 `allow_google_signals=false`, `allow_ad_personalization_signals=false`,
`allow_interest_groups=false`와 세 광고 동의 `denied`를 적용한다. 관리 화면과 태그 중 한쪽만
끄는 것으로 완료 처리하지 않는다.

### 4-2. 보유기간

- [x] 이벤트 데이터 보유기간 `14개월`
- [x] 새 활동 시 사용자 데이터 보유기간 재설정 `끔`
- [ ] 홈페이지 `_ga` 계열 쿠키 `cookie_update=false`, 최초 생성부터 최대 14개월

표준 집계 보고서는 이용자·이벤트 데이터 보유 설정의 적용 대상이 아니므로 이를
`14개월 뒤 모든 통계 자동 삭제`라고 표현하지 않는다. 분석 종료 시에는 속성 삭제와
Google 계약의 종료·삭제 절차를 별도로 수행한다.

### 4-3. 데이터 가림

- [x] 웹 스트림의 이메일 주소 가림 켬
- [x] 아래 금지 쿼리 키를 URL 쿼리 가림 목록에 등록
- [x] 테스트 화면에서 예시 이메일과 각 쿼리 값이 `(redacted)` 처리되는지 확인

최소 등록 후보:

```text
n_query
q
query
search
search_term
keyword
name
phone
telephone
mobile
email
message
memo
content
receipt
receiptCode
requestId
consultationId
```

애플리케이션은 이 값들을 GA URL에 넣지 않으며, 데이터 가림은 코드 결함이나 향후 URL
변경에 대비한 추가 안전장치다. `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
형식이 통제된 `utm_term`과 `n_keyword_id`는 측정 계약상 허용하므로 가림 목록에 넣지 않는다.

### 4-4. 접근권한과 변경 통제

- [ ] 로앤 내부 관리자 2명 이상, 개인 외부 계정의 상시 관리자 권한 없음
- [ ] AdPilot에는 후속 OAuth 연결 시 `analytics.readonly`만 승인
- [ ] 설정 변경 알림을 로앤 관리 메일에서 수신 가능하게 함
- [ ] 계정·속성·스트림 생성 시각, 실행자, 각 토글의 화면 증거를 내부 원장에 기록

## 5. 식별자 인수인계

생성 후 다음 네 값을 구분해 기록한다.

| 값 | 사용처 | Git 저장 |
|---|---|---|
| Analytics account ID | 소유·감사 원장 | 금지 |
| GA4 property ID | AdPilot Data API 연결 | 금지 |
| web stream ID | AdPilot 운영 스트림 확인 | 금지 |
| Measurement ID (`G-...`) | 홈페이지 `LAWAND_GA4_MEASUREMENT_ID` | 코드·문서에 고정하지 않음 |

Measurement ID 자체는 브라우저에 공개되는 값이지만, 배포 입력은 메인 세션이 운영
Secrets Manager의 홈페이지 환경에만 설정한다. property ID와 OAuth 자격증명을 홈페이지에
넣지 않는다. AdPilot OAuth 토큰은 AdPilot의 암호화된 자격증명 경계에만 둔다.

2026-08-19에 식별자 4개 생성과 화면 대조를 완료했다. 정확한 값은 이 Git 문서에 기록하지
않고 AdPilot `ga4_advertisement_with_lawand_session` Orca 터미널에 직접 인계했다. 메인
통합·배포 세션에는 운영 secret 반영 직전에 별도 보안 경로로 Measurement ID만 전달한다.

## 6. 배포 전후 검증

### 6-1. 배포 전

- [x] 이 브랜치의 homepage test·typecheck·lint·production build 성공
- [ ] 개인정보 보호책임자 승인과 GA 관리 설정 증거 완료
- [x] 메인 세션에서 무팝업 hotfix와 현재 `main`, 모든 완료 worktree 포함 여부 대조
- [x] 운영 Measurement ID를 secret에 설정하되 로그·커밋에 전체 값을 출력하지 않음
- [x] 무팝업 hotfix가 포함된 `main` commit의 홈페이지 ARM64 이미지를 digest로 배포

### 6-2. 브라우저 canary

새 프로필 또는 사이트 데이터를 지운 지원 브라우저에서 순서대로 확인한다.

1. 최초 진입: 동의 배너·분석 설정 UI 없이 Google 스크립트가 자동 로드되고 `_ga` 쿠키와
   최초 페이지의 수동 `page_view`가 생성되는지 확인한다.
2. 내부 이동: URL 변경당 수동 `page_view`가 1회이며 스크롤·클릭·폼 상호작용 등 향상된
   측정 이벤트가 생기지 않는지 확인한다.
3. 합성 URL: `n_keyword_id=nkw-e2e-test&n_query=민감검색어`에서 전자는 남고 후자와 임의
   query·fragment·사례 slug는 GA payload에서 제거되는지 확인한다.
4. 모바일 Chrome 실기기 새로고침: hydration 경고와 가로 스크롤 문제가 없는지 확인한다.

실제 상담 생성 canary는 운영 상담 원장을 변경하므로 메인 세션의 별도 승인을 받은 뒤
테스트 연락처·처리 계획을 정해 한 번만 실행한다. 승인 전에는 성공 응답을 흉내 내는 로컬
검증만 사용한다.

### 6-3. GA 수신 검증

- [x] 실시간에서 정제된 `page_view` 수신
- [ ] 승인된 상담 canary에서 `generate_lead` 한 번만 수신
- [x] 이름·전화번호·접수번호·실제 검색어·상담값·원본 URL이 이벤트에 없음
- [x] `generate_lead`를 GA key event로 표시하되 Google 광고 계정에는 연결하지 않음
- [x] 24시간 뒤 실시간·일반 보고서 결과 확인
- [ ] AdPilot에서는 목표 역할을 `supporting`으로 유지하고 `GA4 관측 리드`로 표시

## 7. AdPilot·네이버 광고 후속 순서

1. AdPilot에서 로앤 Google 계정의 읽기 전용 GA4 권한을 승인한다.
2. 위 property ID와 운영 web stream을 선택하고 `generate_lead` 목표를 매핑한다.
3. 네이버 광고 계정을 연결한 뒤 활성 캠페인의 최종 랜딩 URL을 전수 읽는다.
4. 모든 랜딩이 Next.js 최종 `200` 경로인지, 실제 키워드 값이 `nkw-...` 계약을 만족하는지
   확인한다.
5. 합성 클릭으로 기여·미기여·충돌 진단을 확인하고 최소 관측 기간 동안 누락률을 기록한다.
6. ERP 유효상담·계약·입금 연동과 품질 검증 전에는 자동 입찰·예산·카피 피드백을 켜지
   않는다.

## 8. 중단·복구

개인정보 고지 불일치, 금지 데이터 수신, 중복 전환 또는 설정 표류를 발견하면 다음 순서로
중단한다.

1. 운영 홈페이지 환경에서 `LAWAND_GA4_MEASUREMENT_ID`를 제거하고 홈페이지를 안전하게
   재시작해 새 스크립트 로드를 막는다.
2. 배포된 분석 관리자는 ID가 없거나 설정 API가 실패하면 분석을 비활성화하고 현재
   도메인에서 삭제 가능한 `_ga` 쿠키를 정리한다.
3. AdPilot GA4 동기화와 자동 피드백 입력을 비활성화한다.
4. 영향 기간·이벤트·설정 변경자를 확인하고 내부 사고·변경 원장에 기록한다.
5. 고지·코드·GA 설정을 함께 바로잡는다.

GA 속성 자체 삭제는 복구가 어려운 외부 변경이므로 원인 조사와 개인정보 보호책임자 승인
없이 실행하지 않는다.

## 9. 현재 실행 상태

- 홈페이지 자동 로딩·국외이전 고지 후보: 구현·로컬 검증 완료
- Google 공식 약관·처리 위치·보유 설정 대조: 완료
- Google 운영 계정 로그인·Analytics 약관 수락: 완료
- Analytics 계정 `법무법인 로앤`, 속성 `로앤 홈페이지 운영`, 운영 웹 스트림 생성: 완료
- 계정 공유 전체 끔과 최소수집·기기 기반 보고 ID·14개월 보유 설정: 완료
- 이메일·민감 쿼리 18개 가림 및 UTM/`n_keyword_id` 보존 테스트: 완료
- AdPilot 읽기 전용 연결·0건 상태·`generate_lead` 보조 목표 로컬 준비 검증: 완료
- 운영 Measurement ID 설정·무팝업 hotfix 배포·실시간/일반 보고서 수신: 완료
- AdPilot 운영 GA4·네이버 광고 연결: 미실행

2026-08-19 지원되는 Chrome에서 사용자가 `legalflow.co.kr` 조직 계정 선택과 약관 수락을
직접 수행했고, 홈페이지 세션이 3~5절의 생성·토글·가림 테스트를 완료했다. 표준
`page_view` 외 향상된 측정은 끈 상태다. 정확한 account/property/stream/Measurement ID는
Git에 남기지 않고 AdPilot 전용 Orca 세션에 전달했다. 운영 Measurement ID는 홈페이지
secret에 반영됐고 무팝업 hotfix의 `main` 병합·재배포와 실제 수신 검증을 완료했다.

로컬 후보는 전체 5패키지 typecheck·lint·test·production build를 통과했다. 가짜 형식의
Measurement ID를 쓴 로컬 프로덕션의 정제 페이지뷰와 console 오류 0을 확인했다. 기존
동의 UI 검증 결과는 자동 로딩 전환으로 폐기한다. 운영 canary에서 스크립트·쿠키·정제
페이지뷰와 민감 데이터 부재를 확인했고, 2026-08-20 실시간·일반 보고서 수신과 기존 운영
`generate_lead` 주요 이벤트 표시까지 확인했다. 실제 상담을 새로 만드는 canary는 수행하지
않았으며 AdPilot 운영 연결과 네이버 광고 연결은 별도 승인 게이트로 남긴다.

## 10. 공식 기준 자료

- Google Analytics 서비스 약관(대한민국):
  <https://marketingplatform.google.com/about/analytics/terms/kr/>
- Google Ads 데이터 처리 약관:
  <https://business.safety.google/adsprocessorterms/>
- Google Analytics 재수탁자 목록:
  <https://business.safety.google/adssubprocessors/>
- Google 데이터센터 위치:
  <https://datacenters.google/locations/>
- Google 파트너 사이트 데이터 처리 안내:
  <https://policies.google.com/technologies/partner-sites>
- Google Ads 데이터 보호 문의:
  <https://support.google.com/policies/troubleshooter/9009584>
- GA4 지역별 데이터 수집과 IP 처리:
  <https://support.google.com/analytics/answer/11598602>
- GA4 세부 위치·기기 데이터 수집:
  <https://support.google.com/analytics/answer/12002752>
- GA4 이용자·이벤트 데이터 보유:
  <https://support.google.com/analytics/answer/7667196>
- GA4 데이터 가림:
  <https://support.google.com/analytics/answer/13544947>
- 개인정보보호위원회 개인정보 처리방침 작성지침:
  <https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&nttId=12018>
- 개인정보 보호법 제28조의8:
  <https://www.law.go.kr/법령/개인정보보호법/제28조의8>
