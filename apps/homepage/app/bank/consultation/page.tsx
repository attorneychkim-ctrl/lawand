import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "../_components/site-chrome";
import { ConsultationFormLoader } from "./consultation-form-loader";

const pagePath = "/bank/consultation";

export const metadata: Metadata = {
  title: "상담 요청",
  description:
    "연락만 빠르게 요청하거나 개인회생·개인파산 상담에 필요한 상황을 미리 정리해 법무법인 로앤에 상담을 요청할 수 있습니다.",
  alternates: {
    canonical: pagePath,
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "상담 요청 | 법무법인 로앤",
    description:
      "연락받을 시간을 고르고, 원한다면 상담 전에 현재 상황을 미리 정리할 수 있습니다.",
    url: `https://lawandfirm.com${pagePath}`,
    type: "website",
  },
};

export default function ConsultationPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <SiteHeader />
      <main id="main-content" className="consultation-page">
        <ConsultationFormLoader />
      </main>
      <SiteFooter />
    </>
  );
}
