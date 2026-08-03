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
const pagePath = "/bank/situations/collection-and-seizure";
const reviewedDate = "2026-07-26";

export const metadata: Metadata = {
  title: "독촉·압류 대응, 받은 문서와 기한부터 확인하세요",
  description:
    "추심 연락, 지급명령, 소장, 가압류, 통장·급여 압류는 대응이 다릅니다. 문서별 먼저 확인할 사항과 개인회생·파산 신청 전후의 중지·금지 효력을 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "독촉·압류 대응, 받은 문서와 기한부터 확인하세요 | 법무법인 로앤",
    description:
      "독촉과 압류를 한 묶음으로 보지 말고 발신자, 문서 이름, 송달일, 대상 재산부터 구분해 대응하세요.",
    url: `${siteUrl}${pagePath}`,
    type: "article",
  },
};

const responseStages = [
  {
    number: "01",
    label: "연락",
    title: "전화·문자·우편 독촉",
    body: "채권자나 추심회사의 변제 요구는 법원의 압류명령과 다릅니다. 발신자의 소속·성명·연락처, 현재 채권자, 원래 계약과 채권양도 여부, 원금·이자·비용의 계산 근거를 먼저 확인합니다.",
    point: "통화 일시와 발신번호, 문자·우편 원본을 보관하고 확인되지 않은 계좌로 바로 송금하지 않습니다.",
  },
  {
    number: "02",
    label: "명령",
    title: "법원 지급명령",
    body: "지급명령은 채무자를 미리 심문하지 않고 발령될 수 있습니다. 청구 내용에 다툼이 있다면 송달받은 날부터 2주 이내에 이의신청을 할 수 있고, 적법한 이의가 있으면 그 범위에서 지급명령의 효력이 없어져 통상 소송으로 이어집니다.",
    point: "2주는 모든 문서의 공통 기한이 아닙니다. 지급명령 정본의 실제 송달일과 법원 안내를 기준으로 봅니다.",
  },
  {
    number: "03",
    label: "재판",
    title: "소장·이행권고·조정 문서",
    body: "법원 문서의 제목에 따라 답변·이의 방법과 기한이 달라집니다. 사건번호, 원고·채권자, 청구금액과 원인, 송달일, 문서에 적힌 제출기한을 확인하고 이미 한 변제나 소멸시효 등 다툴 근거를 정리합니다.",
    point: "채무조정을 검토 중이어도 재판 문서를 방치하지 말고 해당 문서의 절차에 맞춰 대응합니다.",
  },
  {
    number: "04",
    label: "보전",
    title: "가압류 결정",
    body: "가압류는 장래 강제집행을 위해 재산을 임시로 묶는 보전절차입니다. 확정판결에 따른 최종 회수와는 구분되지만 계좌·보증금·부동산의 사용이나 처분이 제한될 수 있습니다.",
    point: "결정 법원과 사건번호, 청구채권, 가압류 대상, 제3채무자와 이의·취소 절차를 확인합니다.",
  },
  {
    number: "05",
    label: "계좌",
    title: "채권압류 및 추심명령",
    body: "예금 압류는 법원의 명령이 은행 같은 제3채무자에게 송달되어 계좌 사용이 제한되는 절차입니다. 압류명령과 추심명령은 실제 지급 단계와 구분되므로 법원·은행에 송달 및 처리 상태를 확인해야 합니다.",
    point: "압류된 계좌의 입금 출처가 급여·연금·복지급여인지, 압류금지 범위나 생계비계좌와 관련된 쟁점이 있는지 살핍니다.",
  },
  {
    number: "06",
    label: "급여",
    title: "급여채권 압류",
    body: "급여 압류는 회사가 제3채무자가 되어 법원 명령의 범위에 따라 지급을 제한합니다. 민사집행법은 급여채권 중 일정 범위를 압류하지 못하도록 하지만 실제 보호 범위는 급여액과 법정 기준에 따라 달라집니다.",
    point: "회사에 송달된 결정문과 계산 내역을 확인하고 급여 전액이 언제나 압류되는 것처럼 단정하지 않습니다.",
  },
  {
    number: "07",
    label: "경매",
    title: "부동산 경매·체납처분",
    body: "담보권 실행 경매, 판결 등에 기한 강제경매, 세금 체납처분은 근거와 중지 효력이 서로 다릅니다. 개시결정, 매각기일, 배당요구 종기와 체납기관 문서를 나누어 확인합니다.",
    point: "일반 금융채무의 집행과 조세 체납처분을 같은 절차로 보지 말고 문서별 기한을 따로 관리합니다.",
  },
];

const immediateChecks = [
  {
    title: "발신자와 문서 이름 확인",
    body: "채권자·추심회사·법원·세무기관 중 어디에서 왔는지 확인합니다. 문자 속 번호만 믿지 말고 문서에 적힌 기관의 공식 연락처와 사건번호를 대조합니다.",
  },
  {
    title: "송달일과 제출기한 기록",
    body: "본인이나 동거 가족이 문서를 받은 날, 전자소송에서 확인한 날과 문서에 적힌 기한을 기록합니다. 봉투와 송달 안내도 함께 보관합니다.",
  },
  {
    title: "대상 채권과 재산 특정",
    body: "어느 채권자가 얼마를 청구하는지, 계좌·급여·보증금·부동산 중 무엇이 제한되었는지, 은행·회사 같은 제3채무자가 누구인지 확인합니다.",
  },
  {
    title: "증거와 자금 흐름 보존",
    body: "계약서·입금내역·변제 영수증·통화기록과 법원 문서를 모읍니다. 집행을 피하려고 재산을 임의 이전하거나 거래 흐름을 숨기지 말고 사실관계를 그대로 남깁니다.",
  },
];

const protectionPoints = [
  {
    title: "폭행·협박과 반복·야간 연락",
    body: "채권추심자는 폭행·협박이나 위계·위력을 사용할 수 없습니다. 정당한 사유 없이 반복하거나 야간에 연락해 공포심·불안감을 유발하고 생활의 평온을 심하게 해치는 행위도 금지됩니다.",
  },
  {
    title: "가족·직장 등 관계인 연락",
    body: "채권추심법은 채무자의 소재나 연락처를 문의하는 제한된 경우 외에는 관계인에게 채무 관련 연락을 하는 것을 제한하고, 채무 내용이나 신용 사실을 알리지 못하도록 정합니다. 적법한 법원 송달·집행과는 구분해야 합니다.",
  },
  {
    title: "개인금융채권 추심연락 제한",
    body: "개인채무자보호법이 적용되는 개인금융채권은 각 채권별로 7일에 7회를 넘는 추심연락이 제한됩니다. 특정 시간대나 수단의 연락을 제한해 달라고 요청할 수 있고, 재난·사고 등 법정 사유가 확인되면 연락 유예가 적용될 수 있습니다.",
  },
  {
    title: "압류금지채권과 생계비계좌",
    body: "민사집행법은 급여·연금·일부 예금 등 일정 채권의 압류를 제한합니다. 2026년 2월부터는 한 사람당 하나의 생계비계좌를 개설해 월 입금액과 잔액을 각각 250만원 범위에서 관리할 수 있지만, 기존 일반계좌 압류가 자동 해제되는 제도는 아닙니다.",
  },
];

const procedureEffects = [
  {
    title: "개인회생을 신청한 때",
    body: "신청서 접수만으로 모든 독촉·압류가 자동 정지되지는 않습니다. 법원은 필요하다고 인정하면 개시결정 전까지 특정 강제집행·가압류·추심행위 등의 중지 또는 금지를 명할 수 있으므로 실제 결정의 주문과 대상을 확인해야 합니다.",
  },
  {
    title: "개인회생 개시결정이 난 때",
    body: "개시결정 후에는 법이 정한 절차와 행위가 중지·금지되지만, 강제집행·변제 요구 등에 관한 효력은 채권자목록에 기재된 채권이라는 범위가 붙습니다. 담보권 실행, 조세, 새로 발견한 채권도 별도로 살펴야 합니다.",
  },
  {
    title: "개인파산을 신청한 때",
    body: "파산신청 접수만으로 모든 집행이 일괄 중단되는 것은 아닙니다. 파산선고 후에는 파산채권에 기해 파산재단에 속하는 재산에 한 강제집행·가압류·가처분이 파산재단에 대해 효력을 잃지만, 재산·채권의 성격과 체납처분 등 예외를 구분해야 합니다.",
  },
  {
    title: "중지·금지 뒤에도 문서가 온 때",
    body: "중지·금지명령과 개시결정은 소송행위, 채권목록 밖의 채권, 담보권·조세 등 모든 상황을 같은 방식으로 처리하지 않습니다. 새 문서를 무시하지 말고 기존 결정의 사건번호·주문·채권자와 대조해야 합니다.",
  },
];

const faqs = [
  {
    question: "독촉 전화가 오면 곧바로 통장이 압류되나요?",
    answer:
      "독촉 연락 자체가 법원의 압류명령은 아닙니다. 다만 채권자가 판결, 확정된 지급명령 등 집행권원을 이미 확보했거나 보전처분을 신청했다면 별도의 법원 절차가 진행될 수 있습니다. 현재 채권자와 법원 사건이 있는지를 확인해야 합니다.",
  },
  {
    question: "지급명령은 언제까지 이의신청해야 하나요?",
    answer:
      "민사소송법상 지급명령을 송달받은 날부터 2주 이내입니다. 이 기간은 불변기간이며, 적법한 이의가 있으면 그 범위에서 지급명령의 효력이 없어지고 통상 소송으로 이어집니다. 이의신청이 곧 채무가 없다는 결론을 뜻하지는 않습니다.",
  },
  {
    question: "통장이 묶이면 잔액이 바로 채권자에게 넘어가나요?",
    answer:
      "계좌 사용 제한과 실제 추심·지급은 구분해서 확인해야 합니다. 압류 및 추심명령의 송달 상태, 은행의 처리, 추심 여부에 따라 단계가 다를 수 있습니다. 압류금지채권이나 생계 유지 필요와 관련된 신청이 가능한지도 사건 기록과 입금 출처를 바탕으로 살펴야 합니다.",
  },
  {
    question: "급여는 전액 압류될 수 있나요?",
    answer:
      "민사집행법은 급여·연금·봉급·상여금 등 급여채권의 일정 범위를 압류하지 못하도록 정합니다. 다만 보호 범위는 급여액과 대통령령 기준, 다른 압류금지 항목에 따라 달라질 수 있으므로 회사에 송달된 명령과 실제 계산을 확인해야 합니다.",
  },
  {
    question: "개인회생을 접수하면 독촉과 압류가 바로 멈추나요?",
    answer:
      "접수 사실만으로 일괄 정지되는 것은 아닙니다. 개시결정 전에는 법원이 중지·금지명령을 내렸는지와 그 주문·대상을 확인해야 하고, 개시결정 후에도 채권자목록 기재 여부, 담보권·조세와 소송행위 등 적용 범위를 구분해야 합니다.",
  },
  {
    question: "추심업체가 가족이나 직장에 채무를 알려도 되나요?",
    answer:
      "채권추심법은 관계인 연락과 채무·신용정보 공개를 엄격히 제한합니다. 다만 급여 압류에서 회사가 제3채무자로 법원 명령을 송달받는 것처럼 적법한 송달·집행 과정은 일반 추심 연락과 다릅니다. 누가 어떤 내용과 근거로 알렸는지 기록을 남겨 구분해야 합니다.",
  },
  {
    question: "문서가 여러 개라면 무엇부터 대응해야 하나요?",
    answer:
      "먼저 법원·세무기관 문서의 송달일과 불복·제출기한을 확인하고, 이미 계좌·급여·보증금 사용이 제한된 절차를 파악합니다. 그다음 채권과 금액이 같은 사건인지 대조하고 일반 추심 연락의 위법 여부와 전체 채무조정 방안을 나누어 정리합니다.",
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
      name: "독촉·압류 대응",
      item: `${siteUrl}${pagePath}`,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "독촉·압류 대응, 받은 문서와 기한부터 확인하세요",
  description:
    "추심 연락부터 지급명령, 가압류, 통장·급여 압류까지 단계별 확인사항과 개인회생·파산의 중지·금지 효력을 공식 자료를 바탕으로 설명합니다.",
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

export default function CollectionAndSeizurePage() {
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
              <span aria-current="page">독촉·압류 대응</span>
            </nav>

            <div className="eligibility-hero-grid">
              <div className="eligibility-hero-copy">
                <p className="eyebrow">독촉·압류 대응</p>
                <h1>
                  다급할수록
                  <br />
                  <span>문서 이름과 기한부터 봅니다.</span>
                </h1>
                <p className="eligibility-lead">
                  추심 전화, 지급명령, 가압류와 통장·급여 압류는 서로 다른 단계입니다.
                  누가 보냈는지, 언제 송달됐는지, 어떤 채권과 재산을 대상으로 하는지
                  구분해야 지금 필요한 대응을 찾을 수 있습니다.
                </p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#response-stages">
                    문서별 대응 보기
                    <ArrowIcon />
                  </a>
                  <a className="button button-secondary" href="#immediate-checks">
                    지금 확인할 것
                  </a>
                </div>
                <p className="eligibility-date">
                  <span>기준일</span>
                  <time dateTime={reviewedDate}>2026년 7월 26일</time>
                  <span aria-hidden="true">·</span>
                  현행 법령 기준
                </p>
              </div>

              <aside className="eligibility-summary" aria-label="독촉·압류 대응 핵심 요약">
                <p>네 가지부터 적어보세요</p>
                <ol>
                  <li>
                    <a href="#response-stages">
                      <span>01</span>
                      <strong>문서 이름</strong>
                      <small>독촉·명령·소송·집행 구분</small>
                    </a>
                  </li>
                  <li>
                    <a href="#immediate-checks">
                      <span>02</span>
                      <strong>송달일과 기한</strong>
                      <small>받은 날과 제출일 기록</small>
                    </a>
                  </li>
                  <li>
                    <a href="#immediate-checks">
                      <span>03</span>
                      <strong>채권과 대상 재산</strong>
                      <small>금액·계좌·급여·보증금</small>
                    </a>
                  </li>
                  <li>
                    <a href="#procedure-effects">
                      <span>04</span>
                      <strong>법원 결정 유무</strong>
                      <small>접수와 중지·개시는 다름</small>
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
              “2주 이내 이의”는 지급명령에 관한 기준입니다. 소장·가압류·압류 및
              추심명령·경매 문서에는 서로 다른 절차가 적용되므로, 인터넷의 하나의
              기한을 모든 문서에 적용하지 말고 실제 결정문과 송달기록을 확인하세요.
            </p>
          </div>
        </section>

        <section className="section eligibility-requirements" id="response-stages">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">문서별 대응</p>
                <h2>
                  독촉에서 집행까지
                  <br />
                  단계가 달라집니다
                </h2>
              </div>
              <p>
                같은 채권에 관한 문서라도 법적 효력과 대응 방법은 제목과 발신기관에
                따라 달라집니다.
              </p>
            </div>

            <div className="qualification-list">
              {responseStages.map((stage) => (
                <article key={stage.number}>
                  <div className="qualification-index">
                    <span>{stage.number}</span>
                    <small>{stage.label}</small>
                  </div>
                  <div className="qualification-copy">
                    <h3>{stage.title}</h3>
                    <p>{stage.body}</p>
                    <div>
                      <CheckIcon />
                      {stage.point}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section self-check-section" id="immediate-checks">
          <div className="shell">
            <div className="self-check-heading">
              <div className="section-heading">
                <p className="eyebrow">오늘 바로 확인할 것</p>
                <h2>
                  대응보다 먼저
                  <br />
                  사실관계를 고정하세요
                </h2>
              </div>
              <p>
                문서와 송달기록을 확보하면 기한을 놓치거나 서로 다른 채권을 한 사건으로
                오해하는 일을 줄일 수 있습니다.
              </p>
            </div>

            <ol className="self-check-grid">
              {immediateChecks.map((check, index) => (
                <li key={check.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{check.title}</h3>
                    <p>{check.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="privacy-note">
              <span aria-hidden="true">i</span>
              <p>
                상담을 위해 법원 문서 전체를 일반 메신저나 이메일로 먼저 보내지 마세요.
                사건번호·주민등록번호·계좌번호·주소와 가족정보를 가리고, 문서 제목·발신
                법원·송달일·채권자·대상 재산부터 안전한 방법으로 확인하세요.
              </p>
            </div>
          </div>
        </section>

        <section className="section income-section" id="protection-rules">
          <div className="shell income-grid">
            <div className="section-heading">
              <p className="eyebrow light-eyebrow">추심·압류의 보호 규칙</p>
              <h2>
                변제를 요구할 때도
                <br />
                지켜야 할 선이 있습니다
              </h2>
              <p>
                일반 추심의 위법 여부와 법원이 발령한 집행의 효력을 섞지 않고 각각
                확인해야 합니다.
              </p>
            </div>

            <div className="income-points">
              {protectionPoints.map((point) => (
                <article key={point.title}>
                  <span>보호 기준</span>
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section eligibility-requirements" id="procedure-effects">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">개인회생·파산과 집행</p>
                <h2>
                  신청, 법원 명령, 개시는
                  <br />
                  같은 효력이 아닙니다
                </h2>
              </div>
              <p>
                절차 이름만 듣고 독촉이나 압류가 멈췄다고 단정하지 말고 실제 결정문과
                적용 대상 채권을 대조합니다.
              </p>
            </div>

            <div className="qualification-list">
              {procedureEffects.map((effect, index) => (
                <article key={effect.title}>
                  <div className="qualification-index">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <small>효력</small>
                  </div>
                  <div className="qualification-copy">
                    <h3>{effect.title}</h3>
                    <p>{effect.body}</p>
                  </div>
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
                같은 채권이라도
                <br />
                대응 시점은 다릅니다
              </h2>
              <p>
                일반 추심, 재판과 강제집행, 회생·파산의 효과를 나누어 설명합니다.
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
                문서의 효력은
                <br />
                현행 법령으로 확인합니다
              </h2>
            </div>
            <div className="evidence-content">
              <ul>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/민사소송법/제470조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    민사소송법 제468조부터 제472조 지급명령과 이의
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/민사집행법/제246조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    민사집행법 제223조·제246조 압류명령과 압류금지채권
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/민사집행법/제246조의2"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    민사집행법 제246조의2 생계비계좌
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채권의공정한추심에관한법률/제9조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채권추심법 제8조의3·제9조 관계인 연락과 불법추심
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/개인금융채권의관리및개인금융채무자의보호에관한법률/제16조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    개인채무자보호법 제16조부터 제18조 추심연락 제한
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제593조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채무자회생법 제593조 개인회생 중지·금지명령
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제600조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채무자회생법 제600조 개인회생 개시결정의 효력
                    <b aria-hidden="true">↗</b>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.law.go.kr/법령/채무자회생및파산에관한법률/제348조"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>국가법령정보센터</span>
                    채무자회생법 제348조 파산선고와 강제집행
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
                이 글은 일반적인 제도 안내이며 개별 문서에 대한 확정 대응이나 집행
                정지를 보장하지 않습니다. 문서 종류, 송달 상태, 채권·재산의 성격과
                법원 결정에 따라 기한과 대응 방법이 달라질 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">다음으로 읽을 내용</p>
              <h2 id="related-title">전체 채무를 다룰 절차도 함께 살펴보세요</h2>
            </div>
            <div className="related-links">
              <a href="/bank/personal-rehabilitation/process">
                <span>개인회생 절차</span>
                중지·금지명령부터 개시와 인가까지
                <ArrowIcon />
              </a>
              <a href="/bank/personal-bankruptcy/process">
                <span>개인파산 절차</span>
                파산선고와 면책은 어떻게 이어질까
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
              받은 문서의 이름과
              <br />
              날짜부터 확인해 보세요.
            </>
          }
          body="발신기관, 문서 제목, 송달일, 사건번호와 제한된 계좌·급여·보증금이 있는지부터 말씀해 주세요. 상담 초기에는 주민등록번호·계좌번호가 보이는 원본을 보내지 않아도 됩니다."
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
