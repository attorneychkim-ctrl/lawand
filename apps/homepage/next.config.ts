import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tailscale Serve를 통한 실기기 개발 검수에서는 localhost가 아닌 내부 HTTPS
  // 도메인에서 Next 개발 리소스를 요청한다.
  allowedDevOrigins: [
    "127.0.0.1",
    "desktopkchai.tail977311.ts.net",
  ],
  poweredByHeader: false,
  reactStrictMode: true,
  // 기존 WordPress 핵심 URL은 끝 슬래시를 사용한다. Next의 자동 슬래시 제거가
  // 먼저 308을 만들지 않게 해 구주소가 새 canonical로 한 번만 이동하게 한다.
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      {
        hostname: "lawyerkch3.cdn3.cafe24.com",
        pathname: "/image/common/intromem_ver2021/**",
        protocol: "https",
      },
    ],
  },
  // pnpm workspace 안에서 Next가 앱의 `app` 디렉터리를 프로젝트 루트로
  // 잘못 추론하면 Turbopack이 next/package.json을 찾지 못한다.
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  async redirects() {
    return [
      // 기존 WordPress 후기 상세는 개별 공개 URL을 유지하지 않으므로 후기 원장으로
      // 한 번만 이동한다. 알 수 없는 쿼리는 목록 페이지에서 무시된다.
      {
        destination: "/bank/reviews",
        has: [{ key: "kboard_content_redirect", type: "query" }],
        permanent: true,
        source: "/bank",
      },
      {
        destination: "/bank/reviews",
        permanent: true,
        source: "/bank/successioncase_epilogue",
      },
      {
        destination: "/bank/cases",
        permanent: true,
        source: "/bank/successioncase_case",
      },
      {
        destination: "/bank/personal-rehabilitation",
        permanent: true,
        source: "/bank/revival_aboutrevival",
      },
      {
        destination: "/bank/personal-rehabilitation",
        permanent: true,
        source: "/bank/revival_advantagerevival",
      },
      {
        destination: "/bank/personal-rehabilitation/eligibility",
        permanent: true,
        source: "/bank/revival_qualificationtoapplyrevival",
      },
      {
        destination: "/bank/personal-rehabilitation/process",
        permanent: true,
        source: "/bank/revival_procedurerevival",
      },
      {
        destination: "/bank/personal-rehabilitation/documents",
        permanent: true,
        source: "/bank/revival_necessarydocumentsrevival",
      },
      {
        destination: "/bank/personal-rehabilitation/repayment",
        permanent: true,
        source: "/bank/revival_tendercalculate",
      },
      {
        destination: "/bank/personal-bankruptcy",
        permanent: true,
        source: "/bank/bank_aboutbank",
      },
      {
        destination: "/bank/personal-bankruptcy",
        permanent: true,
        source: "/bank/bank_advantagebank",
      },
      {
        destination: "/bank/personal-bankruptcy/eligibility",
        permanent: true,
        source: "/bank/bank_qualificationtoapplybank",
      },
      {
        destination: "/bank/personal-bankruptcy/process",
        permanent: true,
        source: "/bank/bank_procedurebank",
      },
      {
        destination: "/bank/personal-bankruptcy/documents",
        permanent: true,
        source: "/bank/bank_necessarydocumentsbank",
      },
      {
        destination: "/bank/situations/collection-and-seizure",
        permanent: true,
        source: "/bank/colact_answersthedebtcollection",
      },
      {
        destination: "/bank/situations/collection-and-seizure",
        permanent: true,
        source: "/bank/colact_illegalcollection",
      },
      ...[
        "/bank/customercenter_faq",
        "/bank/customercenter_formlibrary",
        "/bank/grevival_abouterevival",
        "/bank/grevival_aboutgrevival",
        "/bank/grevival_bepassedrequirement",
        "/bank/grevival_decisiononcommencementgrevival",
        "/bank/grevival_groundsfordismissal",
        "/bank/grevival_petitiongrevival",
        "/bank/grevival_proceduregrevival",
        "/bank/grevival_propertyvaluationnpublicbond",
        "/bank/grevival_provisionalseizureninjunction",
        "/bank/grevival_qualificationtoapplygrevival",
        "/bank/inheritedproperty_inheritedpropertybank",
        "/bank/necessarydocumentsinfo_necessarydocumentsdown",
        "/bank/necessarydocumentsinfo_procedureofissuance",
      ].map((source) => ({
        destination: "/bank",
        permanent: true,
        source,
      })),
      {
        destination: "/bank/consultation",
        permanent: true,
        source: "/bank/counsel_application",
      },
      {
        destination: "/bank/consultation",
        permanent: true,
        source: "/bank/counsel_board",
      },
      {
        destination: "/bank/cases",
        permanent: true,
        source: "/bank/customercenter_precedent",
      },
      {
        destination: "/about",
        permanent: true,
        source: "/about_introlawn",
      },
      {
        destination: "/people",
        permanent: true,
        source: "/about_intromem",
      },
      {
        destination: "/people",
        permanent: true,
        source: "/about_intromem_detail",
      },
      {
        destination: "/about",
        permanent: true,
        source: "/about_specificity",
      },
      {
        destination: "/about#offices",
        permanent: true,
        source: "/about_directions",
      },
      {
        destination: "/bank/consultation",
        permanent: true,
        source: "/about_counselnreserve",
      },
      {
        destination: "/about",
        permanent: true,
        source: "/bank/about_introlawn",
      },
      {
        destination: "/people",
        permanent: true,
        source: "/bank/about_intromem",
      },
      {
        destination: "/about",
        permanent: true,
        source: "/bank/about_specificity",
      },
      {
        destination: "/about#offices",
        permanent: true,
        source: "/bank/about_directions",
      },
      {
        destination: "/bank/consultation",
        permanent: true,
        source: "/bank/about_counselnreserve",
      },
    ];
  },
};

export default nextConfig;
