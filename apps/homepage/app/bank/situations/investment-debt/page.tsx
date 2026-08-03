import type { Metadata } from "next";

import { ADVERTISING_RESPONSIBLE_LAWYER_LABEL } from "@/lib/legal-identity";

import {
  ArrowIcon,
  CheckIcon,
  ConsultationSection,
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "../../_components/site-chrome";

const siteUrl = "https://lawandfirm.com";
const pagePath = "/bank/situations/investment-debt";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "주식·코인 채무, 개인회생·파산에서 무엇을 볼까",
  description:
    "주식·가상자산 투자로 생긴 채무도 원인만으로 개인회생·파산 가능 여부가 정해지지 않습니다. 소득·재산, 투자금 흐름, 청산가치와 면책 심사 쟁점을 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "주식·코인 채무, 개인회생·파산에서 무엇을 볼까 | 법무법인 로앤",
    description:
      "투자 손실의 이름보다 현재 지급능력, 남은 재산과 자금 흐름을 먼저 확인하세요.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const reviewAxes = [
  {
    number: "01",
    label: "현재",
    title: "소득과 전체 채무",
    body: "투자 채무만 떼어 보지 않고 급여·사업·연금 등 앞으로 이어질 소득, 생활비, 담보·무담보 채무와 세금, 연체 상태를 함께 확인합니다. 개인회생은 정기적이고 확실한 소득 가능성과 법정 채무 한도, 변제계획의 수행 가능성이 필요합니다.",
    point: "대출별 실행일·금액·잔액과 월 소득·필수지출을 같은 기준일로 정리합니다.",
  },
  {
    number: "02",
    label: "유입",
    title: "차입과 투자금의 연결",
    body: "대출금이 어느 계좌로 들어와 어떤 증권사·가상자산사업자에 입금됐는지 연결합니다. 신용대출, 카드대출, 지인 차용, 담보대출의 실행 시점과 투자 시점이 가까우면 각 자금의 사용처를 구분해 설명할 자료가 중요합니다.",
    point: "대출 실행계좌 → 투자계좌 입금 → 매수·매도 순서가 보이도록 정리합니다.",
  },
  {
    number: "03",
    label: "거래",
    title: "매매·출금과 남은 자산",
    body: "국내외 주식, 현물·선물·마진 거래, 거래소 잔고, 개인지갑과 스테이킹 자산을 빠짐없이 확인합니다. 이미 매도하거나 출금했다면 대금이 생활비·채무 변제·다른 투자·제3자 송금 중 어디에 사용됐는지도 살펴야 합니다.",
    point: "손실액만 적지 말고 거래내역, 현재 잔고와 출금 후 사용처까지 이어 붙입니다.",
  },
  {
    number: "04",
    label: "절차",
    title: "개인회생과 개인파산의 다른 심사",
    body: "개인회생은 장래 소득으로 변제하는 구조와 청산가치 보장, 변제계획 인가요건을 봅니다. 개인파산은 현재 지급불능과 재산 환가를 심사한 뒤, 과다한 투기적 거래 등 면책불허가 사유가 있는지를 별도로 판단합니다.",
    point: "같은 투자내역도 회생의 청산가치 심사와 파산의 면책 심사에서 의미가 다를 수 있습니다.",
  },
];

const procedureDifferences = [
  {
    title: "개인회생에서 보는 것",
    body: "주식·가상자산 투자로 채무가 늘었다는 사정만으로 개인회생 신청대상에서 제외되지는 않습니다. 다만 계속적·반복적인 소득 가능성, 법정 채무 한도, 가용소득, 보유 재산과 변제계획의 공정성·수행 가능성 등 일반 인가요건을 충족해야 합니다.",
  },
  {
    title: "서울회생법원 투자손실 준칙",
    body: "서울회생법원 실무준칙 제408호는 주식·가상자산 투자 손실금을 청산가치 산정에서 원칙적으로 고려하지 않도록 합니다. 실제로 남은 주식·가상자산이나 매도대금은 별도 재산이고, 투자 실패를 가장한 재산 은닉으로 인정되면 예외가 됩니다.",
  },
  {
    title: "다른 법원과 개별 보정",
    body: "실무준칙 제408호는 서울회생법원의 업무 기준입니다. 이를 전국 법원의 동일한 산정 결과나 변제금 감면 약속으로 일반화할 수 없습니다. 관할 법원의 기준, 회생위원 조사와 사건별 보정 요구를 실제 기록에서 확인해야 합니다.",
  },
  {
    title: "개인파산의 면책 심사",
    body: "투기 목적의 주식·가상자산 거래가 과다하고 그 결과 재산을 현저히 줄이거나 과대한 채무를 부담했다면 면책불허가 사유가 될 수 있습니다. 거래 사실만으로 자동 불허되는 것은 아니며, 법원은 행위의 정도와 결과를 살핍니다.",
  },
  {
    title: "재량면책 가능성",
    body: "면책불허가 사유가 있더라도 법원은 파산에 이른 경위와 그 밖의 사정을 고려해 상당하다고 인정하면 면책을 허가할 수 있습니다. 이는 자동 적용되는 예외가 아니므로 거래 경위, 시기, 이후 변제 노력과 조사 협조 등을 구체적으로 확인해야 합니다.",
  },
];

const evidenceGroups = [
  {
    title: "대출·카드·지인 차용",
    body: "채권자, 실행일, 최초 금액, 현재 잔액, 입금계좌와 사용처를 정리합니다. 대환이나 추가대출이 있다면 앞선 채무와 연결합니다.",
  },
  {
    title: "국내외 증권계좌",
    body: "계좌별 잔고증명, 전체 거래내역, 입출금내역과 보유 종목을 준비합니다. 해외주식·선물·미수·신용거래도 빠뜨리지 않습니다.",
  },
  {
    title: "가상자산 거래소",
    body: "가입한 국내외 거래소별 전체 체결·입출금 내역, 현재 잔고와 연결 은행계좌를 확인합니다. 폐쇄하거나 이용을 중단한 계정도 조회 가능 여부를 살핍니다.",
  },
  {
    title: "개인지갑·디파이",
    body: "본인이 관리하는 지갑 주소, 전송내역, 스테이킹·예치·브리지·NFT 등 남은 자산을 확인합니다. 자산이 없어도 거래소에서 외부지갑으로 나간 흐름을 설명해야 할 수 있습니다.",
  },
  {
    title: "매도·출금 후 사용처",
    body: "생활비, 채무 변제, 가족·지인 송금, 현금 인출, 다른 투자로 이어진 내역을 계좌 기록과 함께 정리합니다. 일부 채권자에게만 변제한 거래도 숨기지 않습니다.",
  },
  {
    title: "사기 피해·분쟁 자료",
    body: "리딩방·투자사기 피해가 섞였다면 신고·고소 접수자료, 상대방과의 대화, 송금내역과 반환받을 권리의 진행 상태를 모읍니다. 피해 주장과 남은 재산·채권 목록이 서로 맞아야 합니다.",
  },
];

const firstActions = [
  {
    title: "모든 계정 목록 만들기",
    body: "은행·증권사·거래소·개인지갑을 현재 잔고가 없더라도 빠짐없이 적습니다. 가족 명의 계정을 이용한 적이 있다면 소유관계와 거래 경위를 구분합니다.",
  },
  {
    title: "같은 기간으로 내역 받기",
    body: "대출 실행내역, 은행 입출금, 증권·거래소 거래를 서로 대조할 수 있는 기간으로 내려받습니다. 관할 법원이나 사건에 따라 요구기간은 달라질 수 있습니다.",
  },
  {
    title: "큰 금액의 흐름에 메모하기",
    body: "대출 유입, 거래소 입금, 매도·출금, 현금 인출과 제3자 송금에 날짜·금액·상대방·사용처를 적습니다. 추측으로 채우지 말고 확인되지 않는 부분은 그대로 표시합니다.",
  },
  {
    title: "현재 소득·재산과 연결하기",
    body: "투자 손실만 계산하지 말고 지금의 월 소득, 생활비, 부양관계, 보증금·차량·보험·퇴직금과 전체 채무를 함께 정리합니다. 절차 선택은 현재의 변제 가능성에서 시작합니다.",
  },
];

const cautionPoints = [
  {
    title: "계정을 삭제하거나 내역을 지우지 않기",
    body: "거래소 탈퇴나 앱 삭제가 거래 사실을 없애지는 않습니다. 오히려 전체 거래내역을 확보하기 어려워질 수 있으므로 자료를 먼저 보존합니다.",
  },
  {
    title: "남은 자산을 옮기거나 숨기지 않기",
    body: "신청을 앞두고 주식·가상자산을 가족 계정이나 새 지갑으로 이전하면 재산 은닉·허위 진술 등 중대한 쟁점이 될 수 있습니다. 현재 상태와 거래 경위를 사실대로 확인합니다.",
  },
  {
    title: "손실액을 추정치로 단정하지 않기",
    body: "총 입금액에서 현재 잔고만 뺀 값은 중간 출금, 수수료, 다른 자산 전환과 실현손익을 반영하지 못할 수 있습니다. 원장과 계좌 흐름을 바탕으로 계산합니다.",
  },
  {
    title: "회복 목적으로 추가 차입하지 않기",
    body: "손실을 만회하려는 새 대출·고위험 거래는 채무와 소명 범위를 더 키울 수 있습니다. 절차를 검토하는 동안에도 새 거래와 자금 이동은 기록으로 남습니다.",
  },
];

const faqs = [
  {
    question: "주식·코인으로 생긴 채무도 개인회생을 신청할 수 있나요?",
    answer:
      "채무 원인이 투자라는 이유 하나만으로 개인회생 신청대상에서 제외되지는 않습니다. 다만 장래 계속적·반복적으로 얻을 소득, 담보 15억원·무담보 10억원 이하의 채무 한도, 지급불능 또는 그 염려, 변제계획의 수행 가능성 등 일반 요건을 충족해야 합니다.",
  },
  {
    question: "서울회생법원에서는 투자한 원금을 전부 빼주나요?",
    answer:
      "그렇지 않습니다. 실무준칙 제408호는 투자로 실제 잃은 금액을 청산가치 산정에서 원칙적으로 고려하지 않는다는 기준입니다. 현재 보유한 주식·가상자산과 매도·출금 후 남은 재산은 별도로 반영되고, 재산 은닉이 인정되면 예외가 됩니다. 자동 감면이나 변제금 0원을 뜻하지 않습니다.",
  },
  {
    question: "서울이 아닌 법원에서도 같은 기준이 적용되나요?",
    answer:
      "서울회생법원 실무준칙을 전국 법원의 동일한 업무 기준으로 단정할 수 없습니다. 법률상 인가요건은 공통이지만 투자손실 확인 방식, 요구자료와 보정 내용은 관할 법원과 개별 사건에 따라 달라질 수 있습니다.",
  },
  {
    question: "개인파산은 투자 채무가 있으면 면책이 불가능한가요?",
    answer:
      "투기 목적의 주식·가상자산 거래가 과다하고 이로 인해 재산을 현저히 줄이거나 과대한 채무를 부담했다면 면책불허가 사유가 될 수 있습니다. 그러나 투자 거래가 있었다는 사실만으로 곧바로 불허되는 것은 아니며, 법은 파산 경위와 여러 사정을 고려한 재량면책도 정하고 있습니다.",
  },
  {
    question: "거래소 계정을 이미 탈퇴했으면 어떻게 하나요?",
    answer:
      "연결 은행계좌의 입출금내역, 거래소 고객센터의 거래자료 발급 가능 여부, 이메일·문자와 세금 신고자료 등을 확인합니다. 자료가 없다고 임의로 금액을 만들지 말고 확인한 범위와 확보하지 못한 이유를 구분해 정리합니다.",
  },
  {
    question: "가족 계좌나 지갑으로 보낸 거래도 밝혀야 하나요?",
    answer:
      "자금이나 자산의 실제 소유관계와 사용처를 확인할 수 있도록 거래 경위를 설명해야 합니다. 단순 생활비 송금인지, 보관·투자·증여 또는 반환인지에 따라 의미가 달라질 수 있으므로 상대방, 날짜, 금액과 근거자료를 숨김없이 정리합니다.",
  },
  {
    question: "투자사기를 당한 금액도 일반 투자손실과 같나요?",
    answer:
      "사기 피해라면 형사 신고나 민사상 반환청구, 피해금 회수 가능성 등 별도 쟁점이 생길 수 있습니다. 송금 사실만으로 회수 불가능이 확정되는 것은 아니므로 사건 진행자료와 상대방에 대한 권리도 재산·채권 목록에서 함께 검토해야 합니다.",
  },
];

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "회생·파산",
      item: `${siteUrl}/bank`,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "채무 상황별 안내",
      item: `${siteUrl}/bank/situations`,
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "주식·코인 채무",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "주식·코인 채무, 개인회생·파산에서 무엇을 볼까",
  description:
    "주식·가상자산 투자 채무의 개인회생 청산가치와 개인파산 면책 심사, 자금 흐름과 준비자료를 공식 자료를 바탕으로 설명합니다.",
  inLanguage: "ko-KR",
  mainEntityOfPage: `${siteUrl}${pagePath}`,
  datePublished: reviewedDate,
  dateModified: reviewedDate,
  author: {
    "@type": "Organization",
    name: "법무법인 로앤",
    url: siteUrl,
  },
  publisher: {
    "@type": "Organization",
    name: "법무법인 로앤",
    url: siteUrl,
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function InvestmentDebtPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      <SiteHeader />

      <main id="main-content">
        <section className="eligibility-hero">
          <div className="eligibility-hero-orbit" aria-hidden="true" />
          <div className="shell">
            <nav className="breadcrumb" aria-label="현재 위치">
              <a href="/bank">회생·파산</a>
              <span aria-hidden="true">/</span>
              <a href="/bank/situations">채무 상황별 안내</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">주식·코인 채무</span>
            </nav>

            <div className="eligibility-hero-grid">
              <div className="eligibility-hero-copy">
                <p className="eyebrow">주식·코인 채무</p>
                <h1>
                  손실의 이름보다
                  <br />
                  <span>자금의 흐름이 중요합니다.</span>
                </h1>
                <p className="eligibility-lead">
                  주식·가상자산 투자로 채무가 생겼다는 이유만으로 개인회생이나 파산의
                  결론이 정해지지는 않습니다. 현재 소득과 재산, 차입부터 투자·출금까지의
                  흐름, 남은 자산과 절차별 심사 기준을 함께 봐야 합니다.
                </p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#review-axes">
                    먼저 확인할 기준
                    <ArrowIcon />
                  </a>
                  <a className="button button-secondary" href="#evidence">
                    준비자료 보기
                  </a>
                </div>
                <p className="eligibility-date">
                  <span>기준일</span>
                  <time dateTime={reviewedDate}>2026년 7월 26일</time>
                  <span aria-hidden="true">·</span>
                  현행 법령·서울회생법원 실무준칙 기준
                </p>
              </div>

              <aside className="eligibility-summary" aria-label="주식·코인 채무 핵심 요약">
                <p>네 가지 흐름을 연결하세요</p>
                <ol>
                  <li>
                    <a href="#review-axes">
                      <span>01</span>
                      <strong>차입</strong>
                      <small>대출 실행일과 입금계좌</small>
                    </a>
                  </li>
                  <li>
                    <a href="#review-axes">
                      <span>02</span>
                      <strong>투자</strong>
                      <small>증권·거래소 전체 거래</small>
                    </a>
                  </li>
                  <li>
                    <a href="#evidence">
                      <span>03</span>
                      <strong>출금과 현재 잔고</strong>
                      <small>사용처·남은 자산 확인</small>
                    </a>
                  </li>
                  <li>
                    <a href="#procedure-differences">
                      <span>04</span>
                      <strong>절차별 심사</strong>
                      <small>회생 청산가치·파산 면책</small>
                    </a>
                  </li>
                </ol>
              </aside>
            </div>
          </div>
        </section>

        <section className="eligibility-answer-band" aria-label="먼저 알아둘 점">
          <div className="shell">
            <strong>먼저 알아둘 점</strong>
            <p>
              “코인 채무는 전부 감면된다”거나 “투자 채무는 파산이 불가능하다”는 식으로
              단정할 수 없습니다. 개인회생과 개인파산은 서로 다른 요건을 심사하며,
              법원은 투자라는 명칭보다 실제 거래와 현재의 변제 가능성을 확인합니다.
            </p>
          </div>
        </section>

        <section className="section eligibility-requirements" id="review-axes">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">판단의 출발점</p>
                <h2>
                  손실액 하나가 아니라
                  <br />
                  네 축을 함께 봅니다
                </h2>
              </div>
              <p>
                전체 채무와 현재 소득에서 시작해 차입, 거래, 출금과 남은 자산을 하나의
                시간순서로 연결합니다.
              </p>
            </div>

            <div className="qualification-list">
              {reviewAxes.map((axis) => (
                <article key={axis.number}>
                  <div className="qualification-index">
                    <span>{axis.number}</span>
                    <small>{axis.label}</small>
                  </div>
                  <div className="qualification-copy">
                    <h3>{axis.title}</h3>
                    <p>{axis.body}</p>
                    <div>
                      <CheckIcon />
                      {axis.point}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section income-section" id="procedure-differences">
          <div className="shell income-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">절차별 차이</p>
              <h2>
                회생의 청산가치와
                <br />
                파산의 면책은 다릅니다
              </h2>
              <p>
                투자 채무라는 같은 사실도 개인회생과 개인파산에서 확인하는 법적 쟁점이
                다릅니다.
              </p>
            </div>

            <div className="income-points">
              {procedureDifferences.map((difference) => (
                <article key={difference.title}>
                  <span>심사 기준</span>
                  <h3>{difference.title}</h3>
                  <p>{difference.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section eligibility-requirements" id="evidence">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">준비자료</p>
                <h2>
                  거래 원장과 계좌 흐름이
                  <br />
                  서로 맞아야 합니다
                </h2>
              </div>
              <p>
                화면 캡처 몇 장보다 기간 전체를 확인할 수 있는 원본 내역과 현재 잔고
                자료가 도움이 됩니다.
              </p>
            </div>

            <div className="qualification-list">
              {evidenceGroups.map((group, index) => (
                <article key={group.title}>
                  <div className="qualification-index">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <small>자료</small>
                  </div>
                  <div className="qualification-copy">
                    <h3>{group.title}</h3>
                    <p>{group.body}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="privacy-note">
              <span aria-hidden="true">i</span>
              <p>
                상담 과정에서도 가상자산 지갑의 시드 문구·개인키, 거래소 비밀번호나
                API 비밀키를 보내지 마세요. 지갑 주소와 거래내역만으로 확인을 시작하고,
                주민등록번호·계좌번호가 포함된 원본은 안전한 제출방법을 안내받은 뒤
                전달하세요.
              </p>
            </div>
          </div>
        </section>

        <section className="section self-check-section" id="first-actions">
          <div className="shell">
            <div className="self-check-heading">
              <div className="section-heading">
                <p className="eyebrow">준비 순서</p>
                <h2>
                  계산보다 먼저
                  <br />
                  누락을 줄이세요
                </h2>
              </div>
              <p>
                여러 계좌와 거래소를 오간 자금은 목록을 만든 뒤 같은 기간의 자료로
                대조하면 훨씬 정확하게 정리할 수 있습니다.
              </p>
            </div>

            <ol className="self-check-grid">
              {firstActions.map((action, index) => (
                <li key={action.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{action.title}</h3>
                    <p>{action.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section income-section" id="cautions">
          <div className="shell income-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">신청 전 주의</p>
              <h2>
                기록을 없애거나 자산을
                <br />
                옮겨서는 안 됩니다
              </h2>
              <p>
                현재 사실관계를 보존하는 것이 소명과 법원의 조사에 대응하는 첫 단계입니다.
              </p>
            </div>

            <div className="income-points">
              {cautionPoints.map((point) => (
                <article key={point.title}>
                  <span>주의사항</span>
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="shell faq-grid">
            <div className="section-heading">
              <p className="eyebrow">자주 묻는 질문</p>
              <h2>
                투자 채무라는 이유만으로
                <br />
                결론 내리지 않습니다
              </h2>
              <p>
                관할 법원, 현재 소득·재산과 실제 거래내역을 바탕으로 확인해야 할
                질문을 모았습니다.
              </p>
            </div>

            <div className="faq-list">
              {faqs.map((faq, index) => (
                <details key={faq.question}>
                  <summary>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {faq.question}
                    <i aria-hidden="true">+</i>
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section evidence-section" id="sources">
          <div className="shell evidence-grid">
            <div>
              <p className="eyebrow">공식 근거</p>
              <h2>
                법률과 법원의
                <br />
                공개 기준을 확인했습니다
              </h2>
            </div>
            <div className="evidence-content">
              <ul>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제579조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채무자회생법 제579조 개인회생 요건과 가용소득
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제589조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채무자회생법 제589조 신청서와 첨부서류
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제614조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채무자회생법 제614조 변제계획 인가요건과 청산가치
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제564조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채무자회생법 제564조 면책불허가 사유와 재량면책
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://slb.scourt.go.kr/rel/information/qna/member_manual.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>서울회생법원</span>
                    회생위원 직무편람 제5판·실무준칙 제408호 투자 손실금
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://dggodung.scourt.go.kr/rel/information/qna/bankruptcy_manual.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>대한민국 법원</span>
                    개인파산관재인 직무편람 제4판 면책불허가와 재량면책
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
              </ul>
              <dl className="article-meta">
                <div>
                  <dt>작성</dt>
                  <dd>법무법인 로앤 콘텐츠팀</dd>
                </div>
                <div>
                  <dt>광고책임변호사</dt>
                  <dd>{ADVERTISING_RESPONSIBLE_LAWYER_LABEL}</dd>
                </div>
                <div>
                  <dt>최초 작성·최근 검토</dt>
                  <dd>
                    <time dateTime={reviewedDate}>2026년 7월 26일</time>
                  </dd>
                </div>
              </dl>
              <p>
                이 글은 일반적인 제도 안내이며 개인회생 인가, 변제금 감면이나 개인파산
                면책을 보장하지 않습니다. 관할 법원, 거래 시기·규모·경위, 현재
                소득·재산과 제출자료에 따라 심사와 보정 내용이 달라질 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">현재 조건과 절차를 이어서 확인하세요</h2>
            </div>
            <div className="related-links">
              <a href="/bank/personal-rehabilitation/eligibility">
                <span>개인회생 신청자격</span>
                소득·채무·지급불능 상태는 어떻게 볼까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-rehabilitation/repayment">
                <span>개인회생 변제금</span>
                가용소득과 청산가치는 어떻게 반영될까
                <ArrowIcon />
              </a>
              <a href="/bank/personal-bankruptcy/eligibility">
                <span>개인파산 신청자격</span>
                지급불능과 별도 면책 심사는 무엇일까
                <ArrowIcon />
              </a>
              <a href="/bank/compare">
                <span>제도 비교</span>
                개인회생과 개인파산은 무엇이 다를까
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              투자 손실액보다
              <br />
              전체 흐름부터 확인하세요.
            </>
          }
          body="현재 소득과 전체 채무, 대출 실행 시점, 이용한 증권사·거래소와 남은 자산부터 말씀해 주세요. 상담 초기에는 지갑의 시드 문구·개인키나 계좌 원본을 보내지 않아도 됩니다."
        />
      </main>

      <SiteFooter />
      <MobileActions />

      {[breadcrumbJsonLd, articleJsonLd, faqJsonLd].map((data, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}
    </>
  );
}
