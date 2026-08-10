import type { Metadata } from "next";

import { CategoryHub } from "../_components/category-hub";

const pagePath = "/bank/situations";

export const metadata: Metadata = {
  title: "채무 상황별 안내, 지금 문제에서 시작하세요",
  description:
    "독촉·압류, 주식·코인 채무, 자영업자 개인회생처럼 현재 겪고 있는 문제에서 출발해 확인해야 할 문서·자금 흐름·소득자료를 찾으세요.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "채무 상황별 안내, 지금 문제에서 시작하세요 | 법무법인 로앤",
    description:
      "제도를 먼저 고르기 어렵다면 현재 받은 문서, 채무 원인과 소득 형태에서 시작하세요.",
    url: `https://lawandfirm.com${pagePath}`,
    type: "website",
  },
};

const pages = [
  {
    href: "/bank/situations/collection-and-seizure",
    label: "긴급 문제",
    title: "독촉·지급명령·압류가 진행 중이라면",
    body: "연락의 종류, 법원 문서와 송달일, 사건번호, 압류된 채권·재산을 구분하고 현재 확인해야 할 기한부터 찾습니다.",
  },
  {
    href: "/bank/situations/investment-debt",
    label: "채무 원인",
    title: "주식·가상자산 투자 채무가 있다면",
    body: "대출 실행부터 증권·거래소 입금, 매매·출금과 남은 자산까지 실제 자금 흐름을 개인회생·파산의 다른 심사에 맞춰 봅니다.",
  },
  {
    href: "/bank/situations/self-employed",
    label: "직업·소득",
    title: "자영업 매출과 비용이 변동한다면",
    body: "전체 매출, 실제 필요한 영업비용, 사업재산과 앞으로 영업소득이 이어질 가능성을 자료로 확인합니다.",
  },
];

export default function SituationsHubPage() {
  return (
    <CategoryHub
      pagePath={pagePath}
      breadcrumb="채무 상황별 안내"
      eyebrow="현재 문제에서 시작하기"
      title={
        <>
          제도를 고르기 전에
          <br />
          <span>지금 상황부터 구분하세요.</span>
        </>
      }
      lead="어떤 절차가 맞는지 바로 정하기 어렵다면 현재 받은 문서, 채무가 생긴 과정과 소득 형태에서 시작하세요. 상황별 안내는 결론이 아니라 확인할 사실과 자료를 찾는 입구입니다."
      answerTitle="상황별 안내를 이용하는 방법"
      answerBody="가장 급하거나 설명하기 어려운 문제 하나를 먼저 선택하세요. 각 페이지에서 사실과 자료를 정리한 뒤 개인회생·개인파산의 자격과 절차 페이지로 이어서 확인할 수 있습니다."
      pagesTitle={
        <>
          현재 문제에 가까운
          <br />
          입구를 선택하세요
        </>
      }
      pagesDescription="긴급 문제, 채무가 생긴 원인, 직업과 소득이라는 세 가지 기준으로 나눴습니다. 여러 상황에 걸쳐 있다면 지금 가장 급한 쪽부터 확인하세요."
      pages={pages}
      startEyebrow="정리 원칙"
      startTitle={
        <>
          결론보다 먼저
          <br />
          사실을 같은 순서로 맞춥니다
        </>
      }
      startDescription="어떤 상황이든 날짜·금액·상대방과 현재 상태를 객관적인 자료에 맞춰 정리하면 다음 제도 안내로 연결하기 쉬워집니다."
      startPoints={[
        {
          title: "문서와 날짜",
          body: "받은 기관, 문서명, 송달·연락 날짜와 대응기한이 표시되어 있는지 확인합니다.",
        },
        {
          title: "자금의 흐름",
          body: "대출 실행, 사용처, 큰 송금·출금과 현재 남은 재산을 같은 기간으로 연결합니다.",
        },
        {
          title: "현재 소득과 생활",
          body: "급여·사업·연금 등 앞으로 이어질 소득과 가구·주거·의료 등 필수지출을 정리합니다.",
        },
      ]}
      relatedTitle="제도 전체 구조와 차이도 확인하세요"
      relatedLinks={[
        {
          href: "/bank/personal-rehabilitation",
          label: "개인회생",
          title: "자격·절차·서류·변제금을 한 흐름으로",
          body: "",
        },
        {
          href: "/bank/personal-bankruptcy",
          label: "개인파산·면책",
          title: "파산선고와 면책을 나누어 확인하기",
          body: "",
        },
        {
          href: "/bank/compare",
          label: "제도 비교",
          title: "소득·재산·변제 재원으로 나란히 비교하기",
          body: "",
        },
      ]}
      consultationTitle={
        <>
          상황을 어느 페이지에
          <br />
          넣어야 할지 모르겠다면.
        </>
      }
      consultationBody="현재 가장 급한 문제, 소득의 형태와 대략적인 채무·재산부터 말씀해 주세요. 상담 초기에는 주민등록번호·계좌번호나 원본 서류를 보내지 않아도 됩니다."
    />
  );
}
