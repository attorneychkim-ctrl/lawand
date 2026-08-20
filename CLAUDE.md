# CLAUDE.md — 로앤 통합 플랫폼

**언어 지침(최우선): 사용자에게 보여주는 모든 응답·설명·요약·질문은 예외 없이 한국어로
작성한다.** 코드/커밋 메시지/식별자처럼 원래 영어가 관례인 항목, 그리고 사용자가 붙여넣은
영어 원문을 그대로 인용하는 경우는 예외다.

이 저장소에서 작업을 시작하기 전에 **`PROJECT_PLAN.md`를 먼저 읽어라.** 현재 저장소 구조·
아키텍처·운영 기준선·활성 오픈 이슈의 단일 소스다. 이어서
**`docs/handoffs/CURRENT.md`**와 **`AGENTS.md`**를 읽고, 현재 작업 분야에 연결된 `docs/*.md`만
추가로 읽는다. 과거 원문은 회귀·사고·배포 이력 조사가 필요할 때만 `docs/handoffs/`와
`docs/archive/`에서 찾는다.

이 파일은 Claude Code가 자동으로 읽는 짧은 안내판이다. `PROJECT_PLAN.md`, `AGENTS.md`,
`docs/handoffs/CURRENT.md`의 내용을 여기에 복제하지 않는다.

이 세션에서 의미 있는 작업(신규 기능·패키지·DB 스키마·외부 연동·배포·운영 진단·문서
기준선 변경)을 마쳤으면 **`docs/handoffs/YYYY-MM.md` 맨 아래에 한 항목을 append**하고,
다음 세션의 현재 상태가 바뀌었으면 `docs/handoffs/CURRENT.md`를 갱신한다. 설계 결정이
바뀌었을 때만 `PROJECT_PLAN.md`를 함께 수정한다. 후보·배포 연대기를 `AGENTS.md`나
`PROJECT_PLAN.md`에 다시 누적하지 않는다.
