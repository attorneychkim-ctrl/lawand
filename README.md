# 로앤 통합 플랫폼

법무법인 로앤의 공개 홈페이지, ERP, gateway와 공용 도메인 패키지를 함께 관리하는
pnpm/Turborepo 모노레포다. 첫 구현 범위는 개인회생·개인파산 홈페이지다.

## 현재 구현

- `apps/homepage`: Next.js 16 App Router 기반 공개 홈페이지
- `/`: 현재 `/bank`로 이동
- `/bank`: 개인회생·개인파산 모바일 우선 홈페이지 초안
- `robots.txt`, `sitemap.xml`, WebSite/LegalService JSON-LD

## 처음 만드는 방법

요구 버전은 Node.js 22 이상과 pnpm 11.17.0이다.

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install
pnpm dev
```

시스템 디렉터리에 Corepack shim을 만들 권한이 없는 환경에서는 다음처럼 실행한다.

```bash
corepack pnpm install
corepack enable --install-directory ./node_modules/.bin pnpm
corepack pnpm dev
```

브라우저에서 `http://localhost:3020/bank`를 연다.

`apps/homepage`의 개발·프로덕션 포트는 **3020으로 고정**한다. 같은 개발 머신에서
`adpilot`(3000)·`ai-agents-mono/web-console`(3010)이 함께 떠 있어, 포트를 비워두면
Next가 빈 포트로 자동으로 밀려 매번 주소가 달라진다.

원격(SSH)에서 개발 중이라면 해당 포트를 포워딩한다.

```bash
ssh -L 3020:localhost:3020 <계정>@<개발머신>
```

## 검증

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

공개 법률 문구, 고객후기, 사례, 사무소·운영시간은 배포 전 책임 변호사와 운영 담당자의
검수를 통과해야 한다. 현재 페이지의 후기는 기존 `lawandfirm.com/bank`에 공개된 원문
중 일부를 초기 UI 검증용으로 이관한 것이다.
