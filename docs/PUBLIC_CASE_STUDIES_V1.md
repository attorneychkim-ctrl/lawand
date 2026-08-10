# 공개 사례 생성·검수 계약 V1

## 1. 목적과 현재 상태

`사례로 이해하기`는 개인회생·개인파산을 처음 알아보는 사람이 실제 사건의 출발 상황,
변제금 또는 면책 심사에서 확인한 요소와 절차의 흐름을 이해하도록 돕는 공개 정보다.
결과를 홍보하거나 같은 결과를 약속하는 성공사례 모음이 아니다.

현재 생성·검수 흐름은 피드백용 v1이다. 개인회생 초안 두 건과 파산·면책 초안 한 건을
`preview`로 저장해 개발 홈페이지에서만 보여준다. 세 비공개 원천은 운영 사례 생성
크론을 준비하기 위해 운영 RDS에도 이관했지만, 운영 공개와 자동 대량 생성은 아직
승인하지 않는다.

## 2. 비공개 원천과 조인

후보는 로컬 PostgreSQL `lawand_dev`와 운영 PostgreSQL `lawand`의 다음 비공개 원천을
`Case_idx`로 조인한다.

- `CB.TblCBCase`: 사건 종류, 소득·채무·재산·변제계획과 절차 기록
- `CB.TblCaseMemo`: 직원이 남긴 사건 메모
- `CB.TblMoClientStatement`: 의뢰인 진술, 경력·거주 등 보조 사실

`Office_idx=56` 사건만 사용한다. 세 테이블은 이름·전화·주소·사건번호와 자유서술을
포함할 수 있으므로 `PUBLIC`과 `lawand_app`이 읽지 못한다. 운영에서는 기존
`lawand_migrator`가 동기화·초안 생성을 담당하고 기본 읽기 전용인 `lawand_viewer`가
조회한다. 홈페이지 런타임은 이 원천을 직접 조회하지 않는다.

## 3. 생성 경계

생성 순서는 다음과 같다.

1. 완료 단계와 기본 숫자가 있는 후보를 찾는다. 메모나 진술서가 없다고 제외하지 않는다.
2. 소득·채무·청산가치 구간, 소득·거주·혼인 형태, 자녀 수와 인정 가구원 수가 같은
   후보가 최소 5건인지 확인한다.
3. 코드에서 직접 식별정보를 제거하고 금액·기간을 일반화한다.
4. 메모와 진술 원문은 모델에 전달하지 않고, 필요한 내용이 있는지를 넓은 사실 범주로만
   축약한다.
5. 안전한 JSON 스냅샷만 Codex CLI `gpt-5.6-luna`, `xhigh`에 표준입력으로 전달한다.
6. JSON Schema에 맞는 결과만 받아 누출 패턴을 다시 검사한 뒤 `preview`로 저장한다.

새 slug로 실행하면 이미 원장에 사용된 원천 사건은 자동으로 제외한다. 같은 slug가 있으면
모델을 호출하기 전에 중단하며, 아직 공개되지 않은 초안을 명시적으로 `--replace`한 경우에만
같은 원천으로 다시 생성한다.

Codex에는 저장소 규칙, 원천 DB 연결정보, 원본 `Case_idx`, 원문 메모와 진술을 제공하지
않는다. 임시 출력 디렉터리는 실행 후 삭제한다.

## 4. 비식별화 기준

- 이름, 전화, 이메일, 주민등록번호, 사건번호, 주소와 링크는 공개 후보에서 제외한다.
- 직장명과 학교명은 제외하고 가능한 경우 업종과 근속 구간만 쓴다.
- 금융기관과 관계인 이름은 제외한다.
- 월 소득·지출·변제금은 10만원 단위, 채무·재산·총변제액은 100만원 단위로 반올림한다.
- 달력 날짜는 저장·표시하지 않는다. 대신 신청서 접수일부터 각 절차까지 실제로 지난
  일수만 `접수 후 113일`처럼 표시한다.
- 메모의 문장과 특이한 서사는 그대로 옮기지 않는다.
- 공개 조합의 최소 집단 크기는 5건이다. 5건 이상이라는 사실만으로 안전하다고 단정하지
  않고 검수자가 희소 직업·가족·채무 사유의 결합을 다시 확인한다.

## 5. 공개 원장

`public_case_studies`는 원본 사건번호를 저장하지 않는다. 다만 자가진단의 유사사례 카드와
서버에서 연결하기 위한 내부 키 `source_case_idx`는 저장하며, 홈페이지 응답에는 선택하지
않는다. 원천 중복은 서버 비밀키로 만든 32바이트 HMAC 지문으로 막고, 공개 편집 스냅샷에는
별도 SHA-256 해시를 남긴다. 주요 필드는 다음과 같다.

- 공개 내용: `title`, `dek`, `content`, `financial_snapshot`, `timeline`, `tags`
- 출처 통제: `source_case_idx`, `source_case_fingerprint`, `source_snapshot_hash`,
  `cohort_size`
- 재현 정보: `anonymization_version`, `prompt_version`, `generation_model`,
  `generation_reasoning_effort`, `generated_at`
- 상태: `publication_status`, `privacy_review_status`, `legal_review_status`,
  `publication_basis`, 검수·공개·철회 시각

`published`는 개인정보와 법률 검수가 모두 `approved`이고, 공개 근거와 각 승인일·공개일이
있는 경우에만 DB 제약을 통과한다. 생성 스크립트는 `published`와 `withdrawn`을 수정하지
못한다. 홈페이지·gateway의 `lawand_app` 역할은 이 테이블의 `SELECT`만 보유하며 생성과
검수 상태 변경은 마이그레이션 역할 또는 향후 별도 발행 역할로 제한한다.

## 6. 법률 설명 기준

- 개인회생 가용소득은 단순히 `월 소득 - 공개된 지출`로 확정하지 않는다. 세금·사회보험,
  인정 생계비와 필요한 영업비용 등 사건별 공제를 확인한다.
- 청산가치 보장은 명목 총변제액과 재산액의 단순 비교로 충족을 단정하지 않는다. 인가
  시점으로 할인한 변제액의 현재가치와 파산 시 배당가치를 비교하는 구조를 설명한다.
- 미성년 자녀 수와 생계비 산정의 인정 가구원 수가 자동으로 일치한다고 쓰지 않는다.
- 신청만으로 추심이 자동 중단되거나, 인가만으로 즉시 면책된다고 쓰지 않는다.
- `성공`, `무조건`, `최대`, 탕감 보장, 성공률과 다른 사무소 대비 우월 표현을 쓰지 않는다.
- 로앤의 설명은 자료와 숫자의 일관성을 확인한다는 정도로 한 곳에만 담백하게 둔다.

## 7. 홈페이지 노출

- `/bank/cases`: 공개 사례 목록과 공개 원칙. 개인회생 카드는 월 변제금·변제기간,
  파산·면책 카드는 지급능력 → 재산 확인 → 면책심사의 별도 흐름을 표시한다.
- `/bank/cases/[slug]` 개인회생: 출발 상황 → 쟁점 → 변제금 배분 → 청산가치 원칙 →
  인가 절차 → 결과 → 달라질 점
- `/bank/cases/[slug]` 파산·면책: 출발 상황 → 지급불능 쟁점 → 채무·재산 구조 →
  파산선고와 별도 면책심사 → 면책 결과 → 달라질 점. 월 변제금·변제기간·변제율은
  핵심 수치로 노출하지 않는다.
- 개발 환경: `preview`와 `published`를 읽고 preview 배너와 `noindex, nofollow`를 표시
- 운영 환경: `published`만 읽고 preview 상세는 404 처리
- preview는 sitemap과 Article JSON-LD에 넣지 않는다.

## 8. 로컬 명령

```bash
# 모델에 전달될 비식별 스냅샷만 검사
corepack pnpm cases:generate -- --inspect-safe-source

# Luna xhigh로 개인회생 초안 생성
corepack pnpm cases:generate

# 아직 공개되지 않은 같은 초안 재생성
corepack pnpm cases:generate -- --replace

# 같은 입력·프롬프트로 Terra medium 결과 비교
corepack pnpm cases:generate -- --replace \
  --model=gpt-5.6-terra --reasoning-effort=medium

# 추가생계비가 기록된 다른 개인회생 사례 생성
corepack pnpm cases:generate -- \
  --slug=personal-rehabilitation-additional-living-cost \
  --require-additional-living-cost \
  --model=gpt-5.6-luna --reasoning-effort=medium

# 파산선고·면책허가가 모두 있는 파산·면책 사례 생성
corepack pnpm cases:generate -- \
  --slug=personal-bankruptcy-discharge \
  --practice-area=personal_bankruptcy \
  --model=gpt-5.6-luna --reasoning-effort=medium
```

개인파산·면책 후보는 `--practice-area=personal_bankruptcy`와 별도 slug를 함께 사용한다.
기본값은 `gpt-5.6-luna`·`xhigh`이며, 모델·추론 강도를 바꿔도 안전 스냅샷, 프롬프트
버전과 JSON Schema는 바뀌지 않는다. 생성 결과에는 실제 사용한 모델과 추론 강도를
함께 보존한다.

`--require-additional-living-cost`는 추가생계비 금액이 0보다 큰 개인회생 사건만 후보로
제한하고, 같은 조건 안에서는 금액이 큰 후보를 먼저 검토한다. 생성 검증은 추가생계비가
있는 사례의 핵심 쟁점·계산 설명에 `추가생계비`가, 청산가치 설명에 `현재가치`가 반드시
포함되게 한다.

파산·면책 후보는 신청서 접수뿐 아니라 파산선고와 면책허가가 모두 원천 진행기록에
있어야 한다. 파산·면책 사례의 재산·청산가치 설명은 파산절차에서의 처분·배당 관점으로
쓰며, 개인회생 변제계획의 현재가치 비교를 적용하지 않는다.

## 9. 운영 크론 전 출시 게이트

- 사건의 공개 재이용 근거와 필요한 동의, 철회 범위를 개인정보 담당자가 확정한다.
- 직접 식별정보뿐 아니라 희소 조합과 서술을 사람이 검수한다.
- 책임 변호사가 사실 요약, 가용소득·청산가치·부양가족·절차 설명과 광고 표현을 승인한다.
- 검수자, 승인 시각, 본문 버전과 변경 이력을 감사로그로 남긴다.
- 공개·철회 API와 ERP 화면을 구현하고 권한·이중 승인·캐시 제거를 검증한다.
- 크론은 동시 실행 잠금, 재시도, 실패 알림, 건수 제한과 비용 상한을 둔다.
- 원천 스냅샷 갱신과 생성은 분리하고, 공개된 사례를 자동 덮어쓰지 않는다.
