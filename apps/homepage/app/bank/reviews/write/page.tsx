import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "../../_components/site-chrome";
import { ReviewFormLoader } from "./review-form-loader";

const pagePath = "/bank/reviews/write";

export const metadata: Metadata = {
  title: "고객후기 남기기",
  description:
    "법무법인 로앤과 함께한 상담·개인회생·파산면책 과정의 경험을 개인정보 검수 후 공개 후기 형태로 남길 수 있습니다.",
  alternates: {
    canonical: pagePath,
  },
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    title: "고객후기 남기기 | 법무법인 로앤",
    description:
      "결과를 꾸미기보다 과정에서 실제로 느낀 경험을 들려주세요. 개인정보 확인 뒤 공개 여부를 검토합니다.",
    url: `https://lawandfirm.com${pagePath}`,
    type: "website",
  },
};

export default async function ReviewWritePage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const requestValue = (await searchParams).request;
  const requestToken =
    typeof requestValue === "string" && requestValue.length <= 100
      ? requestValue
      : undefined;
  return (
    <>
      <a className="skip-link" href="#main-content">
        후기 작성으로 바로가기
      </a>
      <SiteHeader />
      <main id="main-content" className="review-write-page">
        <ReviewFormLoader requestToken={requestToken} />
      </main>
      <SiteFooter />
    </>
  );
}
