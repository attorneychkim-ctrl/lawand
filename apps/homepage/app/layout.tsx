import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AnalyticsManager } from "./_components/analytics-manager";
import { JourneyTracker } from "./_components/journey-tracker";
import "./globals.css";

const siteUrl = "https://lawandfirm.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  formatDetection: {
    address: false,
    date: false,
    email: false,
    telephone: false,
  },
  title: {
    default: "법무법인 로앤",
    template: "%s | 법무법인 로앤",
  },
  description:
    "개인회생과 개인파산을 알아보는 분이 자신의 조건과 확인할 쟁점을 차분히 이해할 수 있도록 돕습니다.",
  applicationName: "법무법인 로앤",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "법무법인 로앤",
    title: "법무법인 로앤",
    description:
      "복잡한 채무 상황을 이해하고 다음 행동을 정리할 수 있는 개인회생·개인파산 안내.",
    url: siteUrl,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f4ed",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <AnalyticsManager />
        <JourneyTracker />
        {children}
      </body>
    </html>
  );
}
