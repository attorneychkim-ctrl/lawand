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
      {
        destination: "/bank/reviews",
        permanent: true,
        source: "/bank/successioncase_epilogue",
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
    ];
  },
};

export default nextConfig;
