import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "로앤 ERP",
  description: "법무법인 로앤 내부 상담 운영 화면",
  robots: {
    index: false,
    follow: false,
  },
  formatDetection: {
    telephone: false,
    date: false,
    email: false,
    address: false,
  },
};

const themeScript = `
  (function () {
    try {
      var stored = window.localStorage.getItem("lawand-erp-theme");
      var theme = stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      document.documentElement.dataset.theme = theme;
    } catch (error) {
      document.documentElement.dataset.theme = "light";
    }
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
