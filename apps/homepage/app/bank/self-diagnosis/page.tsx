import type { Metadata } from "next";

import {
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "../_components/site-chrome";
import { SelfDiagnosisFormLoader } from "./self-diagnosis-form-loader";

const pagePath = "/bank/self-diagnosis";

export const metadata: Metadata = {
  title: "개인회생·파산 자가진단",
  description:
    "나의 상황과 유사한 로앤 사례 다섯 건을 찾아 월 변제금·예상 지출·추가생계비·변제율과 주요 절차일을 비교합니다.",
  alternates: { canonical: pagePath },
  openGraph: {
    title: "개인회생·파산 자가진단 | 법무법인 로앤",
    description:
      "나의 상황과 유사한 로앤 사례 다섯 건의 변제계획과 실제 절차일을 비교합니다.",
    url: `https://lawandfirm.com${pagePath}`,
    type: "website",
  },
};

export default function SelfDiagnosisPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <SiteHeader />
      <main id="main-content" className="diagnosis-page">
        <section className="diagnosis-hero">
          <div className="shell diagnosis-hero-grid">
            <div>
              <p className="eyebrow">LAWAND CASE MATCH</p>
              <h1>
                나의 상황과 유사한
                <br />
                사례 5건 찾아보기
              </h1>
            </div>
            <div className="diagnosis-hero-copy">
              <p>
                로앤이 진행한 사건만 비교합니다. 소득과 가족관계, 관할법원,
                채무와 청산가치를 함께 보고 월 변제금·변제개월·주요 절차일을
                확인합니다.
              </p>
              <div>
                <span>비교 원천</span>
                <strong>로앤 사건 1,759건</strong>
              </div>
            </div>
          </div>
        </section>
        <SelfDiagnosisFormLoader />
      </main>
      <SiteFooter />
      <MobileActions />
    </>
  );
}
