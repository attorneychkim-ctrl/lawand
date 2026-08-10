# 리걸프렌즈 전화 디렉터리 일일 동기화 — 크론 EC2 인수인계

아래 작업은 전화데스크 애플리케이션 배포와 분리해 크론 전용 EC2에서 수행한다.
대상은 리걸프렌즈 전체 SaaS가 아니라 `Office_idx=56`인 로앤 사무소의 전화 조회용
최소 필드뿐이다.

## 목표

- 매일 03:30(Asia/Seoul)에 리걸프렌즈 MySQL의 동일한 consistent snapshot으로
  `CONTENT.TblCase`, 연결된 `CONTENT.TblCSClient`, 같은 사무소의
  `ACCOUNT.TblMember`를 읽는다.
- 운영 PostgreSQL의 비공개 `CB.TblCase`, `CB.TblCSClient`, `CB.TblMember`를 새
  staging 테이블에서 검증한 뒤 하나의 트랜잭션으로 교체한다.
- 실패하면 기존 운영 테이블을 그대로 유지하고 경보를 발생시킨다. 동기화 실패를
  이유로 빈 테이블이나 일부 데이터로 교체해서는 안 된다.

## 기준 소스와 실행 명령

- 먼저 저장소의 `PROJECT_PLAN.md`, `AGENTS.md`를 읽는다.
- 구현 기준은 `scripts/import-legalfriends-phone-directory.mjs`와
  `scripts/verify-legalfriends-phone-directory.sql`이다.
- 수동 검증 명령의 형태는 다음과 같다.

```bash
corepack pnpm legalfriends:phone-directory -- --replace
```

현재 import 스크립트는 로컬 개발 편의를 위해 `.env.development.local` fallback과
기본 SSH 경로를 갖는다. 운영 timer에서는 이를 그대로 쓰지 말고 다음을 반영한다.

1. 대상 DB URL은 `process.env.LAWAND_MIGRATION_DATABASE_URL`을 우선 읽고, 로컬에서만
   `.env.development.local`을 fallback으로 허용한다.
2. 크론 EC2의 제한된 IAM role로 Secrets Manager `lawand/prod/database`에서
   `migrationDatabaseUrl`만 프로세스 메모리에 읽는다. 평문 URL을 파일·systemd unit·
   로그·명령행·Git에 남기지 않는다.
3. 원본 MySQL 접근은 전용 네트워크/SSH 자격증명을 사용한다. 개인 키는 권한 600으로
   제한하고 출력하지 않는다. 가능하면 전용 읽기 전용 MySQL 계정과 보안그룹을 사용한다.
4. `flock` 또는 동등한 단일 실행 잠금을 적용해 두 동기화가 겹치지 않게 한다.

## 반드시 유지할 데이터·검증 경계

- 사건 필터는 반드시 `CONTENT.TblCase.Office_idx=56`이다.
- 고객은 위 사건과 `Case_idx`로 연결된 행만 가져온다.
- 담당자는 `ACCOUNT.TblMember.Office_idx=56`만 가져온다.
- 복제 필드는 현재 스크립트 정의보다 넓히지 않는다. 회원 비밀번호·생년월일·개인
  이메일/전화, 사건 계좌 발급기관·계좌번호 등은 대상이 아니다.
- 원본 MySQL은 `REPEATABLE READ`와 `START TRANSACTION WITH CONSISTENT SNAPSHOT`으로
  세 테이블을 한 시점에서 읽는다.
- 교체 전 다음을 모두 통과해야 한다.
  - 원본/PG staging 행 수·키 범위·최종 수정시각·행별 논리 digest 일치
  - 사건-고객 누락 0, 고객-사건 누락 0
  - 다른 사무소 사건·담당자 0
  - `phone_search = phone` 숫자 정규화 불일치 0
  - 삭제된 담당자 참조는 임의의 다른 담당자로 매핑하지 않고 미해결로 보존
- 이전 성공 건수와 비교해 급격한 감소가 있으면 자동 교체하지 말고 실패 처리한다.
  최초 기준은 2026-08-06의 사건·고객 각 60,947건, 담당자 69건이지만 실제 데이터는
  변하므로 이 숫자를 고정 성공 조건으로 사용하지 않는다.

## 권한·운영 방식

- 새 `CB` 테이블 소유자는 `lawand_migrator`다.
- `lawand_viewer`에는 SELECT만 부여한다.
- `PUBLIC`과 `lawand_app`에는 `CB` schema/table 직접 권한을 모두 회수한다.
- gateway는 `resolve_inbound_phone_directory(text)` security-definer 함수 실행만
  유지해야 한다. 동기화 뒤에도 `lawand_app`의 `CB` 직접 SELECT가 불가능한지 확인한다.
- 출력은 snapshot 시각, 행 수, 키 범위, digest, 관계 검증 수치처럼 비식별 요약만
  허용한다. 고객명·전화번호·사건번호·DB URL·SSH/DB 자격증명은 로그에 남기지 않는다.

## systemd/모니터링 완료 기준

- oneshot service와 timer를 만들고 `OnCalendar=*-*-* 03:30:00 Asia/Seoul`,
  `Persistent=true`, 짧은 randomized delay를 사용한다.
- 첫 실행은 수동으로 수행해 JSON 요약과 위 검증 SQL을 대조한 뒤 timer를 enable한다.
- 성공·실패·소요시간·세 테이블 행 수를 CloudWatch 구조화 로그/metric으로 보낸다.
- 연속 실패와 마지막 성공 시각 지연에 CloudWatch alarm을 만들고 실제 통지 경로를
  연결한다. 로그 보존기간을 명시한다.
- 실패 canary에서 기존 `CB` 세 테이블의 논리 요약이 바뀌지 않는지 확인한다.
- 성공 canary 뒤 gateway health와 인증된 전화데스크 고객 조회가 정상인지 확인한다.
- 작업을 마치면 `PROJECT_PLAN.md`의 일일 자동 동기화 상태와 `AGENTS.md` 최상단
  인수인계 로그를 갱신한다.

## 보고 형식

최종 보고에는 다음만 포함한다.

- 배포한 service/timer 이름과 다음 실행 시각(Asia/Seoul)
- 마지막 수동 실행의 비식별 테이블 요약과 검증 결과
- Secrets Manager/IAM/보안그룹의 최소권한 확인 결과
- 실패 시 기존 데이터 보존 canary, CloudWatch alarm 상태
- 변경 파일과 남은 운영 위험
