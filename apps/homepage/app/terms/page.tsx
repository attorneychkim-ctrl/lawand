import type { Metadata } from "next";

import {
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "../bank/_components/site-chrome";
import {
  ADVERTISING_RESPONSIBLE_LAWYER_LABEL,
  LAWAND_LEGAL_IDENTITY,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_EFFECTIVE_DATE_LABEL,
} from "@/lib/legal-identity";

const pagePath = "/terms";

export const metadata: Metadata = {
  title: "홈페이지 이용약관",
  description:
    "법무법인 로앤 홈페이지의 정보 제공, 공개 사례, 상담 요청, 고객후기와 외부 상담 채널 이용 기준을 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "홈페이지 이용약관 | 법무법인 로앤",
    description:
      "법무법인 로앤 홈페이지에서 제공하는 정보와 상담 요청 서비스의 이용 기준입니다.",
    type: "website",
    url: `https://lawandfirm.com${pagePath}`,
  },
};

const sectionLinks = [
  ["purpose", "목적·적용범위"],
  ["service", "제공 서비스"],
  ["legal-information", "법률정보의 성격"],
  ["consultation", "상담 요청·계약"],
  ["user-duty", "이용자의 의무"],
  ["reviews", "고객후기"],
  ["copyright", "저작권"],
  ["external", "외부 서비스"],
  ["operation", "운영·책임"],
  ["law", "준거법·변경"],
] as const;

export default function TermsPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <SiteHeader />

      <main id="main-content" className="legal-page">
        <header className="legal-hero legal-hero-terms">
          <div className="shell">
            <nav className="breadcrumb" aria-label="현재 위치">
              <a href="/bank">회생·파산 홈</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">이용약관</span>
            </nav>
            <p className="eyebrow">TERMS OF USE</p>
            <h1>홈페이지 이용약관</h1>
            <p>
              홈페이지의 일반 정보, 상담 요청과 고객후기가 어떤 범위에서
              제공되는지 명확히 안내합니다. 온라인 접수만으로 위임계약이나
              구체적인 법률의견이 성립하는 것은 아닙니다.
            </p>
            <dl className="legal-hero-meta">
              <div>
                <dt>시행일</dt>
                <dd>
                  <time dateTime={PRIVACY_POLICY_EFFECTIVE_DATE}>
                    {PRIVACY_POLICY_EFFECTIVE_DATE_LABEL}
                  </time>
                </dd>
              </div>
              <div>
                <dt>운영자</dt>
                <dd>{LAWAND_LEGAL_IDENTITY.legalName}</dd>
              </div>
              <div>
                <dt>광고책임변호사</dt>
                <dd>{ADVERTISING_RESPONSIBLE_LAWYER_LABEL}</dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="shell legal-layout">
          <aside className="legal-toc">
            <strong>목차</strong>
            <nav aria-label="이용약관 목차">
              {sectionLinks.map(([id, label], index) => (
                <a href={`#${id}`} key={id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="legal-document">
            <section id="purpose">
              <p className="legal-section-number">01</p>
              <h2>목적과 적용범위</h2>
              <p>
                이 약관은 {LAWAND_LEGAL_IDENTITY.legalName}(이하
                “로앤”)이 운영하는 lawandfirm.com 홈페이지에서 제공하는 공개
                정보, 상담 요청, 고객후기와 외부 상담 채널 연결 서비스의 이용
                기준을 정합니다.
              </p>
              <p>
                특정 서비스 화면에서 별도의 안내나 동의를 제공하는 경우에는
                해당 내용이 이 약관과 함께 적용됩니다. 개인정보 처리에는 별도의{" "}
                <a href="/privacy">개인정보처리방침</a>이 적용됩니다.
              </p>
            </section>

            <section id="service">
              <p className="legal-section-number">02</p>
              <h2>홈페이지가 제공하는 서비스</h2>
              <ul>
                <li>개인회생·개인파산과 관련된 일반적인 제도·절차 정보</li>
                <li>홈페이지를 통한 빠른 상담 요청과 상세 상황 접수</li>
                <li>
                  입력조건과 과거 로앤 수행 사건을 비교하는 개인회생·파산
                  자가진단
                </li>
                <li>
                  실제 수행 사건을 비식별화하고 공개 근거·개인정보·법률 표현을
                  검수한 개인회생·파산 사례 설명
                </li>
                <li>카카오톡 상담 채널 진입과 네이버 예약 관련 안내</li>
                <li>개인정보 검수 후 공개된 고객후기의 열람과 신규 후기 접수</li>
                <li>법무법인 로앤의 업무 원칙, 사무소와 연락처 안내</li>
              </ul>
              <p>
                로앤은 서비스의 안정성·보안·운영상 필요에 따라 일부 기능을
                개선하거나 변경할 수 있습니다. 이용자의 권리에 중대한 영향을
                주는 변경은 가능한 범위에서 사전에 안내합니다.
              </p>
            </section>

            <section id="legal-information">
              <p className="legal-section-number">03</p>
              <h2>공개 법률정보의 성격</h2>
              <p>
                홈페이지의 글, 비교표, 질문과 사례 설명은 일반적인 이해를 돕기
                위한 정보입니다. 이용자의 전체 사실관계와 최신 자료를 검토한
                개별 법률의견이 아니며, 특정 절차의 가능성·기간·비용 또는 결과를
                보장하지 않습니다.
              </p>
              <p>
                법령·법원 실무와 제도는 변경될 수 있고 같은 표현의 사실도
                사건별로 법적 의미가 다를 수 있습니다. 제출기한, 강제집행,
                소멸시효처럼 즉시 대응이 필요한 문제는 홈페이지 정보만으로
                결론 내리지 말고 변호사 또는 관계 기관에 개별 확인해야 합니다.
              </p>
              <p>
                자가진단의 유사사건, 월 변제금과 절차 소요기간은 과거 사건을
                비교한 참고자료입니다. 부양가족 인정, 청산가치, 우선권채권,
                변제계획 인가나 면책 여부를 자동 판단하거나 같은 결과를
                보장하지 않습니다.
              </p>
              <p>
                공개 사례는 실제 수행 사건을 이해하기 쉽게 다시 쓴 자료입니다.
                이름·연락처·사건번호·직장명·주소와 달력 날짜를 제외하고 금액을
                일반화하며, 절차는 신청서 접수 기준 실제 경과일로 표시합니다. 공개
                근거와 재식별 위험, 법률·광고 표현을
                검수한 사례만 게시합니다. 비슷한 조건이라도 다른 사건의 결과를
                예측하거나 보장하지 않습니다.
              </p>
              <p className="legal-callout">
                각 주요 콘텐츠에는 공식 근거, 작성정보와 광고책임변호사를
                표시합니다. 광고책임변호사는{" "}
                {ADVERTISING_RESPONSIBLE_LAWYER_LABEL}입니다.
              </p>
            </section>

            <section id="consultation">
              <p className="legal-section-number">04</p>
              <h2>상담 요청과 위임계약</h2>
              <ol>
                <li>
                  홈페이지 상담 요청은 로앤이 연락하고 상담을 준비할 수 있도록
                  정보를 접수하는 절차입니다.
                </li>
                <li>
                  온라인 접수, 자동 접수번호 발급, 카카오톡 채팅 또는 담당자
                  배정만으로 변호사 선임·위임계약이 체결되거나 법률관계가
                  확정되지는 않습니다.
                </li>
                <li>
                  실제 업무 범위, 담당자, 보수와 별도 비용, 자료 제출, 계약
                  기간은 상담 뒤 서면 계약과 개별 안내로 확정합니다.
                </li>
                <li>
                  연락 예정 표시는 운영상 목표 시간입니다. 접수량, 공휴일,
                  통신 장애와 사건의 긴급도 등에 따라 달라질 수 있으며 법정
                  기한의 보장을 의미하지 않습니다.
                </li>
                <li>
                  이해충돌 확인이나 수임 가능 여부 검토 결과에 따라 상담 또는
                  위임계약이 제한될 수 있습니다.
                </li>
              </ol>
            </section>

            <section id="user-duty">
              <p className="legal-section-number">05</p>
              <h2>이용자의 의무</h2>
              <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
              <ul>
                <li>타인의 이름·연락처를 무단 사용하거나 허위 정보를 제출하는 행위</li>
                <li>
                  상담·후기 양식에 주민등록번호, 계좌번호, 원본 서류, 제3자의
                  개인정보나 불법 콘텐츠를 입력하는 행위
                </li>
                <li>
                  자동화 도구로 접수를 반복하거나 서비스·서버의 정상 운영을
                  방해하는 행위
                </li>
                <li>
                  홈페이지 콘텐츠를 법령에 반하는 광고, 오인 유도 또는 제3자의
                  권리 침해에 사용하는 행위
                </li>
                <li>
                  보안 취약점을 악용하거나 다른 이용자의 정보에 접근하려는 행위
                </li>
              </ul>
              <p>
                로앤은 부정 이용이나 보안 위협을 확인한 경우 해당 요청의 처리를
                제한하고 필요한 보호조치를 할 수 있습니다.
              </p>
            </section>

            <section id="reviews">
              <p className="legal-section-number">06</p>
              <h2>고객후기 작성과 공개</h2>
              <ul>
                <li>
                  후기는 작성자가 실제로 경험한 상담·사건 진행 과정에 관해
                  자신의 말로 작성해야 합니다.
                </li>
                <li>
                  제출 즉시 공개되지 않으며 실제 이용 여부, 개인정보, 제3자의
                  권리와 법률광고 표현을 확인한 뒤 공개 여부를 결정합니다.
                </li>
                <li>
                  개인정보 가림과 명백한 오탈자 교정 외에 좋은 표현을 임의로
                  덧붙이지 않습니다. 필요한 편집이 큰 경우 작성자 확인을 거칠
                  수 있습니다.
                </li>
                <li>
                  작성자는 공개 전후에 수정·철회를 요청할 수 있습니다. 다만
                  검색엔진 캐시 등 로앤이 직접 통제하지 못하는 복제본의 반영에는
                  시간이 걸릴 수 있습니다.
                </li>
                <li>
                  개별 후기는 작성자의 경험이며 다른 사건의 결과를 보장하거나
                  일반적인 성공 가능성을 뜻하지 않습니다.
                </li>
              </ul>
              <p>
                후기 원문의 권리는 작성자에게 있습니다. 작성자가 공개에 동의한
                범위에서만 로앤 홈페이지의 후기 제공·검색·분류를 위해 이용하며,
                별도의 광고 소재나 다른 목적으로 확대해 사용하려면 필요한
                동의를 다시 확인합니다.
              </p>
            </section>

            <section id="copyright">
              <p className="legal-section-number">07</p>
              <h2>홈페이지 콘텐츠와 저작권</h2>
              <p>
                별도 표시가 없는 홈페이지의 구성, 글, 도표, 디자인과 로고에
                관한 권리는 로앤 또는 정당한 권리자에게 있습니다. 이용자는
                개인적인 정보 확인을 위해 일반적인 범위에서 열람·인용할 수
                있습니다.
              </p>
              <p>
                출처를 왜곡하거나 콘텐츠 전체를 대량 복제해 영리 서비스,
                자동생성 콘텐츠, 광고 또는 데이터베이스로 재배포해서는 안
                됩니다. 법령상 허용되는 인용 범위를 넘어 이용하려면 사전에
                로앤의 동의를 받아야 합니다.
              </p>
            </section>

            <section id="external">
              <p className="legal-section-number">08</p>
              <h2>카카오톡·네이버 등 외부 서비스</h2>
              <p>
                홈페이지는 이용자의 편의를 위해 카카오톡 채널, 네이버 예약,
                법원·법령 등 외부 서비스로 연결할 수 있습니다. 외부 서비스의
                화면, 계정, 메시지 전달과 장애에는 각 운영자의 이용약관과
                개인정보처리방침이 적용됩니다.
              </p>
              <p>
                홈페이지 카카오톡 버튼에서 이름 또는 카카오톡 표시명과 광역
                거주지역을 입력하고 확인하면 두 정보로 로앤 ERP에 상담 접수가
                생성됩니다. 입력 이름은 상담원이 채팅을 찾기 위한 단서이며,
                로앤은 일반 채널
                링크만으로 실제 채팅방 진입이나 메시지 전송 성공을 확인할 수
                없습니다. 메시지를 남기지 않은 접수는 운영자가 미진입·무효로
                처리할 수 있습니다.
              </p>
            </section>

            <section id="operation">
              <p className="legal-section-number">09</p>
              <h2>서비스 운영과 책임 범위</h2>
              <p>
                로앤은 합리적인 보안·안정성 조치를 적용하고 정확한 정보를
                제공하기 위해 노력합니다. 다만 천재지변, 통신망·외부 서비스의
                장애, 긴급 점검처럼 합리적으로 통제하기 어려운 사유로 서비스가
                일시 중단될 수 있습니다.
              </p>
              <p>
                로앤의 고의 또는 과실로 이용자에게 손해가 발생한 경우 관계
                법령에 따라 책임을 부담합니다. 이 약관은 법령상 배제할 수 없는
                책임을 제한하거나 이용자의 정당한 권리를 포기시키는 의미로
                해석되지 않습니다.
              </p>
              <dl className="legal-contact-card">
                <div>
                  <dt>운영 법인</dt>
                  <dd>{LAWAND_LEGAL_IDENTITY.legalName}</dd>
                </div>
                <div>
                  <dt>대표변호사</dt>
                  <dd>{LAWAND_LEGAL_IDENTITY.representativeLawyer}</dd>
                </div>
                <div>
                  <dt>법인등록번호</dt>
                  <dd>{LAWAND_LEGAL_IDENTITY.corporationRegistrationNumber}</dd>
                </div>
                <div>
                  <dt>광고책임변호사</dt>
                  <dd>{ADVERTISING_RESPONSIBLE_LAWYER_LABEL}</dd>
                </div>
                <div>
                  <dt>대표 연락처</dt>
                  <dd>
                    <a href={LAWAND_LEGAL_IDENTITY.mainTelephoneHref}>
                      {LAWAND_LEGAL_IDENTITY.mainTelephone}
                    </a>
                    {" · "}
                    <a href={`mailto:${LAWAND_LEGAL_IDENTITY.privacyEmail}`}>
                      {LAWAND_LEGAL_IDENTITY.privacyEmail}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>주소</dt>
                  <dd>{LAWAND_LEGAL_IDENTITY.primaryAddress}</dd>
                </div>
              </dl>
            </section>

            <section id="law">
              <p className="legal-section-number">10</p>
              <h2>준거법, 분쟁 해결과 약관 변경</h2>
              <p>
                이 약관은 대한민국 법령을 따릅니다. 홈페이지 이용과 관련한
                분쟁은 당사자 간 협의를 통해 해결하도록 노력하며, 해결되지 않는
                경우 민사소송법 등 관계 법령에서 정한 관할법원에 따릅니다.
              </p>
              <p>
                로앤은 법령·서비스 변경을 반영하기 위해 약관을 개정할 수
                있습니다. 이용자에게 불리하거나 중요한 변경은 시행 전에
                홈페이지에 변경 내용과 시행일을 알립니다.
              </p>
              <div className="legal-source-note">
                <strong>시행 정보</strong>
                <p>
                  이 이용약관은 {PRIVACY_POLICY_EFFECTIVE_DATE_LABEL}부터
                  시행합니다.
                </p>
                <div>
                  <a href="/privacy">개인정보처리방침 보기</a>
                  <a href="/about#automation">AI·자동화 원칙 보기</a>
                </div>
              </div>
            </section>
          </article>
        </div>
      </main>

      <SiteFooter />
      <MobileActions />
    </>
  );
}
