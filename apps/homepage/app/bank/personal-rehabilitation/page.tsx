import type { Metadata } from "next";

import { CategoryHub } from "../_components/category-hub";

const pagePath = "/bank/personal-rehabilitation";

export const metadata: Metadata = {
  title: "개인회생 안내, 자격·절차·서류·변제금·비용",
  description:
    "개인회생 신청자격부터 절차와 기간, 필요서류, 변제금과 비용까지 확인 순서대로 모았습니다. 각 주제의 공식 근거와 예외는 상세페이지에서 확인하세요.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인회생 안내, 자격·절차·서류·변제금 한눈에 | 법무법인 로앤",
    description:
      "개인회생을 검토할 때 확인해야 할 조건과 준비 순서를 한곳에서 살펴보세요.",
    url: `https://lawandfirm.com${pagePath}`,
    type: "website",
  },
};

const pages = [
  {
    href: "/bank/personal-rehabilitation/eligibility",
    label: "신청자격",
    title: "개인회생을 검토할 수 있는 조건",
    body: "앞으로 이어질 소득, 전체 채무와 재산, 현재 변제하기 어려운 상태와 과거 면책 이력을 함께 확인합니다.",
  },
  {
    href: "/bank/personal-rehabilitation/process",
    label: "절차·기간",
    title: "신청부터 면책까지 이어지는 순서",
    body: "신청 준비, 법원 심사와 보정, 개시·인가, 변제 수행과 면책이 각각 무엇을 뜻하는지 구분합니다.",
  },
  {
    href: "/bank/personal-rehabilitation/documents",
    label: "필요서류",
    title: "신청서와 소명자료를 맞추는 방법",
    body: "채권자·재산·소득과 지출 자료가 서로 일치하도록 공통서류와 상황별 추가자료를 준비합니다.",
  },
  {
    href: "/bank/personal-rehabilitation/repayment",
    label: "변제금",
    title: "월 변제금에 영향을 주는 기준",
    body: "예상 소득, 법정 공제와 생계비, 필요한 영업비용, 재산의 청산가치와 수행 가능성을 함께 살펴봅니다.",
  },
  {
    href: "/bank/guides/costs",
    label: "비용 안내",
    title: "법원비용과 변호사 보수를 구분하는 방법",
    body: "현재 인지대·송달료 계산식과 사건별 실비, 견적과 위임계약서에서 확인할 포함 범위를 나눠 봅니다.",
  },
];

export default function PersonalRehabilitationHubPage() {
  return (
    <CategoryHub
      pagePath={pagePath}
      breadcrumb="개인회생"
      eyebrow="개인회생 한눈에 보기"
      title={
        <>
          자격부터 면책까지
          <br />
          <span>한 흐름으로 확인하세요.</span>
        </>
      }
      lead="개인회생은 한 가지 조건만 확인하고 끝나는 절차가 아닙니다. 신청자격, 제출자료, 변제금과 법원 절차가 같은 사실관계를 바탕으로 이어져야 합니다."
      answerTitle="개인회생을 처음 알아본다면"
      answerBody="앞으로 계속되거나 반복될 소득이 있는지부터 확인하고, 전체 채무·재산과 생활에 필요한 비용을 함께 정리하세요. 신청 가능 여부와 실제 변제계획은 법원이 제출자료를 바탕으로 판단합니다."
      pagesTitle={
        <>
          다섯 가지 질문을
          <br />
          순서대로 확인합니다
        </>
      }
      pagesDescription="처음에는 신청자격을 보고, 실제 준비 단계에서는 절차·서류·변제금·비용 페이지를 오가며 같은 내용을 맞추는 것이 좋습니다."
      pages={pages}
      startEyebrow="어디서 시작할까"
      startTitle={
        <>
          지금 궁금한 질문에서
          <br />
          바로 시작하세요
        </>
      }
      startDescription="모든 페이지를 처음부터 읽지 않아도 됩니다. 현재 가장 불확실한 지점에서 시작한 뒤 관련 내용을 이어서 확인하세요."
      startPoints={[
        {
          title: "신청할 수 있는지 궁금하다면",
          body: "소득·채무·재산과 현재 변제상태를 신청자격 페이지에서 먼저 확인합니다.",
        },
        {
          title: "매달 얼마를 내는지 궁금하다면",
          body: "고정 비율이 아니라 가용소득·생계비·청산가치가 연결되는 구조를 봅니다.",
        },
        {
          title: "법원에 무엇을 내는지 궁금하다면",
          body: "필요서류와 절차 페이지에서 제출자료가 언제, 어떻게 쓰이는지 확인합니다.",
        },
        {
          title: "신청비용이 궁금하다면",
          body: "변호사 보수와 법원비용을 나누고 채권자 수별 송달료와 계약 포함 범위를 확인합니다.",
        },
      ]}
      relatedTitle="상황과 제도 차이도 함께 확인하세요"
      relatedLinks={[
        {
          href: "/bank/compare",
          label: "제도 비교",
          title: "개인회생과 개인파산은 무엇이 다를까",
          body: "",
        },
        {
          href: "/bank/situations/self-employed",
          label: "자영업자 개인회생",
          title: "매출과 실제 영업소득은 어떻게 볼까",
          body: "",
        },
        {
          href: "/bank/situations/collection-and-seizure",
          label: "독촉·압류 대응",
          title: "받은 문서와 기한은 무엇부터 볼까",
          body: "",
        },
      ]}
      consultationTitle={
        <>
          어디서 시작할지
          <br />
          아직 정하기 어렵다면.
        </>
      }
      consultationBody="현재 소득의 형태와 대략적인 채무·재산, 가장 급한 문제부터 말씀해 주세요. 상담 초기에는 주민등록번호·계좌번호나 원본 서류를 보내지 않아도 됩니다."
      source={{
        href: "https://slb.scourt.go.kr/rel/guide/personal_r/index.jsp",
        organization: "서울회생법원",
        label: "개인회생 제도 안내",
      }}
    />
  );
}
