# 컨텍스트 압축 전 원문 보존

2026-08-20 컨텍스트 문서 구조 개편 직전의 원문을 수정 없이 보존한다. 이 디렉터리는
일상 작업에서 읽는 시작 문서가 아니며, 과거 설계·배포·장애·후보 상태를 조사할 때만 연다.

| 원문 | 보존 파일 | SHA-256 |
| --- | --- | --- |
| `AGENTS.md` 5,928줄 | `AGENTS_LEGACY_THROUGH_2026-08-20.md` | `f016affdbc35157bb9ae7d5716f91aedfaed03c414a0830d53fc2ed64bde6488` |
| `PROJECT_PLAN.md` v1.70 2,950줄 | `PROJECT_PLAN_V1.70.md` | `6e1babda44fa56d9526fdd4636931e009d4fe52a9927f51d0e2fa02fda12e068` |

검증:

```bash
sha256sum \
  docs/archive/context-pre-compact/AGENTS_LEGACY_THROUGH_2026-08-20.md \
  docs/archive/context-pre-compact/PROJECT_PLAN_V1.70.md
```

새 문서 체계는 다음 역할을 갖는다.

- `AGENTS.md`: 변하지 않는 작업·안전 규칙
- `PROJECT_PLAN.md`: 현재 아키텍처·운영 기준선·활성 우선순위
- `docs/handoffs/CURRENT.md`: 다음 세션에 필요한 현재 상태
- `docs/handoffs/YYYY-MM.md`: 구조 개편 이후의 append-only 월별 작업 원장

두 원문은 Git 이동으로 보존했으므로 위 해시는 구조 개편 전 파일의 해시와 동일하다.
