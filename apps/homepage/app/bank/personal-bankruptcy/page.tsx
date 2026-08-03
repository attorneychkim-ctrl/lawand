import type { Metadata } from "next";

import { CategoryHub } from "../_components/category-hub";

const pagePath = "/bank/personal-bankruptcy";

export const metadata: Metadata = {
  title: "개인파산·면책 안내, 자격·절차·서류 한눈에",
  description:
    "개인파산 신청자격과 파산·면책 절차, 필요서류를 확인 순서대로 모았습니다. 파산선고와 면책의 차이부터 살펴보세요.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인파산·면책 안내, 자격·절차·서류 한눈에 | 법무법인 로앤",
    description:
      "지급불능, 재산 정리와 별도의 면책 심사를 한 흐름으로 확인하세요.",
    url: `https://lawandfirm.com${pagePath}`,
    type: "website",
  },
};

const pages = [
  {
    href: "/bank/personal-bankruptcy/eligibility",
    label: "신청자격",
    title: "현재 지급불능 상태를 확인하는 기준",
    body: "소득 유무 하나가 아니라 현재 재산·신용·장래 소득과 생활에 필요한 비용을 종합해 변제 가능성을 살펴봅니다.",
  },
  {
    href: "/bank/personal-bankruptcy/process",
    label: "절차·기간",
    title: "파산절차와 면책절차의 다른 역할",
    body: "파산선고, 관재인 조사와 재산 정리, 절차의 종결·폐지, 별도의 면책 심사가 어떤 순서로 이어지는지 구분합니다.",
  },
  {
    href: "/bank/personal-bankruptcy/documents",
    label: "필요서류",
    title: "채무·재산·생활상황을 설명하는 자료",
    body: "표준 작성서류와 소득·사업·계좌·보험·부동산·차량, 최근 거래에 관한 상황별 자료를 확인합니다.",
  },
];

export default function PersonalBankruptcyHubPage() {
  return (
    <CategoryHub
      pagePath={pagePath}
      breadcrumb="개인파산·면책"
      eyebrow="개인파산·면책 한눈에 보기"
      title={
        <>
          파산선고와 면책을
          <br />
          <span>나누어 확인하세요.</span>
        </>
      }
      lead="개인파산은 재산을 정리하는 파산절차와 남은 채무의 책임을 심사하는 면책절차로 나뉩니다. 신청자격·절차·서류를 같은 사실관계에서 이어서 봐야 합니다."
      answerTitle="개인파산·면책을 처음 알아본다면"
      answerBody="현재 소득과 재산으로 채무를 일반적·계속적으로 변제하기 어려운 상태인지부터 확인하세요. 파산선고만으로 면책되는 것은 아니며, 면책 여부는 별도의 법원 심사를 거칩니다."
      pagesTitle={
        <>
          세 가지 질문에서
          <br />
          필요한 내용을 찾습니다
        </>
      }
      pagesDescription="신청자격을 확인한 뒤 파산과 면책의 절차를 구분하고, 그 판단에 필요한 서류를 같은 기준일로 정리합니다."
      pages={pages}
      startEyebrow="어디서 시작할까"
      startTitle={
        <>
          현재 궁금한 단계부터
          <br />
          확인하면 됩니다
        </>
      }
      startDescription="개인파산과 면책은 같은 말이 아닙니다. 현재 상태, 법원의 절차, 제출자료 중 가장 궁금한 부분부터 확인하세요."
      startPoints={[
        {
          title: "신청요건이 궁금하다면",
          body: "지급불능과 소득·재산, 개인회생으로 변제할 가능성을 신청자격 페이지에서 확인합니다.",
        },
        {
          title: "파산선고 뒤가 궁금하다면",
          body: "관재인 조사와 환가·배당, 종결·폐지와 별도의 면책 심사를 절차 페이지에서 봅니다.",
        },
        {
          title: "무엇을 준비할지 궁금하다면",
          body: "표준 작성서류와 최근 거래·재산·생활상황 자료를 필요서류 페이지에서 확인합니다.",
        },
      ]}
      relatedTitle="다른 제도와 현재 상황도 함께 보세요"
      relatedLinks={[
        {
          href: "/bank/compare",
          label: "제도 비교",
          title: "개인회생과 개인파산은 무엇이 다를까",
          body: "",
        },
        {
          href: "/bank/situations/investment-debt",
          label: "주식·코인 채무",
          title: "투자 거래는 면책 심사에서 어떻게 볼까",
          body: "",
        },
        {
          href: "/bank/situations/collection-and-seizure",
          label: "독촉·압류 대응",
          title: "신청 전 받은 문서와 기한은 무엇일까",
          body: "",
        },
      ]}
      consultationTitle={
        <>
          파산과 면책의 차이부터
          <br />
          정리하고 싶다면.
        </>
      }
      consultationBody="현재 소득활동과 생활상황, 대략적인 채무·재산과 최근 처분부터 말씀해 주세요. 상담 초기에는 주민등록번호·계좌번호나 원본 서류를 보내지 않아도 됩니다."
      source={{
        href: "https://slb.scourt.go.kr/rel/guide/personal_b/index.jsp",
        organization: "서울회생법원",
        label: "개인파산·면책 제도 안내",
      }}
    />
  );
}
