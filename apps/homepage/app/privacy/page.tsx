import type { Metadata } from "next";

import {
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "../bank/_components/site-chrome";
import {
  LAWAND_LEGAL_IDENTITY,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_EFFECTIVE_DATE_LABEL,
} from "@/lib/legal-identity";

const pagePath = "/privacy";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description:
    "법무법인 로앤 홈페이지의 상담 요청, 자가진단, 공개 사례, 고객후기와 외부 상담 채널 관련 개인정보 처리 기준을 안내합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "개인정보처리방침 | 법무법인 로앤",
    description:
      "법무법인 로앤이 어떤 개인정보를 왜 처리하고 언제 파기하는지 확인할 수 있습니다.",
    type: "website",
    url: `https://lawandfirm.com${pagePath}`,
  },
};

const sectionLinks = [
  ["summary", "한눈에 보기"],
  ["purpose", "처리 목적·항목·기간"],
  ["collection", "수집 방법"],
  ["provision", "제3자 제공·처리위탁"],
  ["overseas", "GA 분석·국외 이전"],
  ["destruction", "파기"],
  ["rights", "정보주체의 권리"],
  ["security", "안전성 확보 조치"],
  ["automatic", "저장소·분석·자동화"],
  ["officer", "보호책임자·권리구제"],
  ["changes", "방침 변경"],
] as const;

export default function PrivacyPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <SiteHeader />

      <main id="main-content" className="legal-page">
        <header className="legal-hero">
          <div className="shell">
            <nav className="breadcrumb" aria-label="현재 위치">
              <a href="/bank">회생·파산 홈</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">개인정보처리방침</span>
            </nav>
            <p className="eyebrow">PRIVACY POLICY</p>
            <h1>개인정보처리방침</h1>
            <p>
              {LAWAND_LEGAL_IDENTITY.legalName}은 필요한 정보만 수집하고,
              상담·후기 원문과 연락처를 보호하며, 처리 과정과 권리행사 방법을
              투명하게 공개합니다.
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
                <dt>개인정보처리자</dt>
                <dd>{LAWAND_LEGAL_IDENTITY.legalName}</dd>
              </div>
              <div>
                <dt>개인정보 보호책임자</dt>
                <dd>김충환 대표변호사</dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="shell legal-layout">
          <aside className="legal-toc">
            <strong>목차</strong>
            <nav aria-label="개인정보처리방침 목차">
              {sectionLinks.map(([id, label], index) => (
                <a href={`#${id}`} key={id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="legal-document">
            <section id="summary">
              <p className="legal-section-number">01</p>
              <h2>한눈에 보기</h2>
              <div className="privacy-summary-grid">
                <article>
                  <span>수집 최소화</span>
                  <strong>첫 상담에서는 주민등록번호·계좌번호·원본 서류를 받지 않습니다.</strong>
                  <p>
                    빠른 상담은 이름이나 상세 상황을 남기지 않아도 신청할 수
                    있습니다.
                  </p>
                </article>
                <article>
                  <span>기본 보유기간</span>
                  <strong>상담 요청과 후기 검수 기록은 접수일부터 1년간 보관합니다.</strong>
                  <p>
                    목적 달성 또는 적법한 삭제 요청이 있으면 더 일찍 파기할 수
                    있습니다.
                  </p>
                </article>
                <article>
                  <span>보호 방식</span>
                  <strong>연락처와 비공개 원문은 암호화하고 접근 기록을 남깁니다.</strong>
                  <p>
                    광고·여정 데이터에는 이름, 전화번호와 상담 원문을 넣지
                    않습니다.
                  </p>
                </article>
              </div>
              <p className="legal-callout">
                이 방침은 공개 홈페이지 이용과 계약 전 상담·후기 접수, 비식별
                공개 사례의 제공에 적용됩니다. 위임계약 체결 뒤 사건 수행에 필요한
                개인정보는 계약 내용과 관계 법령에 따른 별도 기준으로 처리하며,
                공개 사례로 재이용할 때에는 공개 근거와 고객 불이익 여부를 별도로
                확인합니다.
              </p>
            </section>

            <section id="purpose">
              <p className="legal-section-number">02</p>
              <h2>개인정보의 처리 목적·항목·보유기간</h2>
              <p>
                로앤은 아래 목적에 필요한 범위에서 개인정보를 처리합니다. 처리
                목적이 달라지는 경우 관계 법령에 따라 별도 동의를 받거나 필요한
                조치를 합니다.
              </p>
              <div className="legal-table-wrap">
                <table>
                  <caption>서비스별 개인정보 처리 내역</caption>
                  <thead>
                    <tr>
                      <th scope="col">구분</th>
                      <th scope="col">처리 목적</th>
                      <th scope="col">처리 항목</th>
                      <th scope="col">보유기간</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">홈페이지 상담 요청</th>
                      <td>
                        요청 접수, 연락 일정 조율, 상담 준비·응대, 관할·지역
                        특성의 1차 확인, 담당 배정, 중복 요청 확인
                      </td>
                      <td>
                        <strong>필수:</strong> 거주 시·도, 휴대전화 번호,
                        연락 희망 시점
                        <br />
                        <strong>선택:</strong> 이름·호칭, 도움 분야, 현재
                        단계, 소득 형태, 채무·재산 범위, 과거 면책 이력,
                        상담 내용
                        <br />
                        <strong>기록:</strong> 접수번호, 동의 버전·시각,
                        접수·상태·담당 이력
                      </td>
                      <td>상담 요청일부터 1년</td>
                    </tr>
                    <tr>
                      <th scope="row">개인회생·파산 자가진단</th>
                      <td>
                        로앤 수행 사건과의 조건 비교, 월 변제금·예상 지출·
                        추가생계비·총변제금·변제율·변제기간·주요 절차일
                        참고범위 제공, 상담 준비와 후속 연락
                      </td>
                      <td>
                        <strong>필수:</strong> 이름, 휴대전화 번호, 현재 거주
                        시·도, 거주지역으로 안내·선택한 관할법원, 월소득,
                        소득·거주·혼인 형태, 미성년 자녀 수,
                        담보·무담보 채무, 청산가치, 우선권채권 여부
                        <br />
                        <strong>자동 산출:</strong> 비교 적용 부양가족 수,
                        기준 생계비, 가용소득 참고액, 최소 필요 총변제액,
                        회생 또는 파산 검토 방향과 유사사건 수, 고객에게 표시한
                        비식별 유사사례 카드 5건의 순서·비교값·주요 절차일
                      </td>
                      <td>자가진단 접수일부터 1년</td>
                    </tr>
                    <tr>
                      <th scope="row">홈페이지 카카오톡 상담 진입</th>
                      <td>
                        고객 입력 이름과 거주지역으로 카카오 채팅 확인, 상담
                        접수와 담당 배정, 반복 제출의 중복 방지, 미진입 처리
                      </td>
                      <td>
                        <strong>필수:</strong> 고객이 입력한 이름 또는 카카오톡
                        표시명, 광역 거주지역
                        <br />
                        <strong>선택:</strong> 휴대전화 번호
                        <br />
                        브라우저 세션의 가명 접수키, 진입 위치, 최초·최근 클릭
                        시각과 횟수, 내부 접수명·접수번호, 직원의 채팅 확인·담당
                        배정 기록
                        <br />
                        <em>
                          입력 이름은 채팅을 찾는 단서이며 카카오가 보증한
                          식별자가 아닙니다. 휴대전화 번호는 고객이 선택해 입력한
                          경우에만 받으며, 카카오 사용자 ID와 메시지 원문은 받지
                          않습니다.
                        </em>
                      </td>
                      <td>
                        상담 요청일부터 1년. 미진입·무효로 확인되면 운영 기록을
                        제외한 불필요한 정보는 지체 없이 파기
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">네이버 예약 접수</th>
                      <td>
                        예약 확정 확인, 상담 일정 준비, 동일 예약의 중복 접수
                        방지
                      </td>
                      <td>
                        예약번호, 마스킹된 이름, 예약 상품·일시·인원·옵션,
                        고객 요청사항, 예약 상세 주소, 메일 수신·처리 식별정보
                        <br />
                        <em>
                          예약 메일만으로 전체 이름과 전화번호를 자동
                          수집하지 않습니다.
                        </em>
                      </td>
                      <td>예약 접수일부터 1년</td>
                    </tr>
                    <tr>
                      <th scope="row">비식별 공개 사례 초안·검수</th>
                      <td>
                        실제 개인회생·파산 절차와 변제금 산정 구조의 설명,
                        개인정보·희소 조합·법률광고 표현 검수, 공개·철회 대응
                      </td>
                      <td>
                        <strong>비공개 원천:</strong> 기존 사건의 소득·채무·재산·
                        가족·거주·절차 정보, 필요한 범위의 직원 메모와 의뢰인
                        진술 정보
                        <br />
                        <strong>공개 후보:</strong> 이름·전화·사건번호·직장명·주소와
                        달력 날짜를 제거하고 금액을 일반화한 상황·쟁점·계산·절차·결과,
                        신청서 접수 기준 실제 경과일, 익명화 버전과 검수 상태
                      </td>
                      <td>
                        공개 근거 확인과 검수 전 초안은 비공개. 승인된 사례는 철회
                        또는 공개 목적 종료 시까지
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">고객후기 접수·검수</th>
                      <td>
                        작성자 확인, 중복 접수 방지, 개인정보·광고 표현 검수,
                        공개·수정·철회 대응
                      </td>
                      <td>
                        휴대전화 번호, 공개 이름, 분야, 작성 당시 단계, 경험
                        키워드, 후기 원문, 접수번호, 동의 버전·시각, 검수 상태
                      </td>
                      <td>
                        검수 기록은 접수일부터 1년. 공개된 후기는 철회 또는
                        공개 목적 종료 시까지
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">기존 공개 고객후기</th>
                      <td>
                        기존 공개 후기의 이전·열람, 검색·분류, 개인정보 검수와
                        삭제·정정 대응
                      </td>
                      <td>
                        공개 이름, 제목·원문, 작성·수정일, 분야·작성 단계·경험
                        키워드, 기존 콘텐츠 식별자와 공개·검수 상태
                      </td>
                      <td>철회 또는 공개 목적 종료 시까지</td>
                    </tr>
                    <tr>
                      <th scope="row">방문 여정·광고 귀속</th>
                      <td>
                        상담 화면 개선, 요청 경로 확인, 지역·캠페인 단위의
                        비식별 운영 분석
                      </td>
                      <td>
                        가명 세션키, 허용 목록으로 일반화한 최초·내부 방문
                        경로(최대 20개), 유입
                        도메인, 상담 버튼 위치, 허용 목록의 UTM·광고
                        캠페인·그룹·키워드·소재 식별자, 발생 시각
                        <br />
                        <em>
                          전체 URL 쿼리, 실제 검색어 원문, 이름, 전화번호와
                          상담·후기 원문은 넣지 않습니다.
                        </em>
                      </td>
                      <td>연결된 상담 요청일부터 1년</td>
                    </tr>
                    <tr>
                      <th scope="row">동의 기반 홈페이지 이용 분석</th>
                      <td>
                        공개 페이지 이용 흐름과 실제 웹 상담 접수 성과 측정,
                        홈페이지·캠페인 개선
                      </td>
                      <td>
                        Google Analytics가 생성하는 first-party 이용자·세션
                        식별값, 접속 시각, 국가·광역 지역과 브라우저·기기 범주,
                        허용 목록으로 일반화한 페이지 경로·유입 origin·페이지
                        제목, 통제된 UTM·키워드 ID, 실제 상담 접수 성공 이벤트,
                        방문·세션 측정에 수반되는 `first_visit`·`session_start`·
                        `user_engagement` 기본 이벤트
                        <br />
                        <em>
                          분석에 명시적으로 동의한 경우에만 처리합니다. 이름,
                          전화번호, 상담·진단 내용, 접수번호, 실제 검색어와 전체
                          URL 쿼리는 보내지 않습니다. 네트워크 통신 과정에서 IP
                          주소가 처리될 수 있으나 이벤트 항목이나 로앤 분석
                          원장에 IP 원문을 넣지 않습니다.
                        </em>
                      </td>
                      <td>
                        GA 이용자·이벤트 단위 데이터 14개월(새 활동 시 기간
                        초기화 안 함). `_ga` 계열 쿠키는 최초 생성부터 최대
                        14개월. 표준 집계 보고서는 이 14개월 설정의 적용 대상이
                        아니며 분석 목적 종료 또는 속성 삭제 시 종료 절차에 따라
                        처리
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">보안·장애 대응 기록</th>
                      <td>
                        부정 이용 방지, 접수 안정성 확보, 오류 조사와 보안사고
                        대응
                      </td>
                      <td>
                        접속 시각, 요청 경로, 브라우저 정보, 처리 결과·오류
                        코드. 인프라 보안 로그에는 IP 주소가 일시적으로 생성될
                        수 있으나 상담·분석 DB에는 IP 원문을 저장하지 않음
                      </td>
                      <td>최대 3개월</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                법령에 따라 보존할 의무가 있거나 분쟁·수사 절차가 진행되는
                경우에는 해당 목적에 필요한 최소 항목을 별도로 분리해 법정 또는
                필요한 기간 동안 보관할 수 있습니다.
              </p>
            </section>

            <section id="collection">
              <p className="legal-section-number">03</p>
              <h2>개인정보의 수집 방법</h2>
              <ul>
                <li>
                  정보주체가 홈페이지 상담·자가진단·후기 양식에 직접 입력하는
                  방법
                </li>
                <li>
                  정보주체가 홈페이지의 카카오톡 상담 버튼을 눌러 채팅 진입을
                  요청하고, 이후 채널에서 먼저 메시지를 보내는 방법
                </li>
                <li>
                  정보주체가 네이버 예약을 신청해 로앤의 예약 확정 메일함으로
                  예약정보가 전달되는 방법
                </li>
                <li>
                  홈페이지·ERP 이용 과정에서 접수 상태, 보안·오류 기록이
                  자동으로 생성되는 방법
                </li>
                <li>
                  이용자가 분석을 허용한 뒤 Google Analytics가 정제된 페이지
                  방문과 웹 상담 접수 이벤트를 자동으로 생성하는 방법
                </li>
                <li>
                  기존 로앤 홈페이지에서 이미 공개된 고객후기를 개인정보 검수
                  후 새 홈페이지로 이전하는 방법
                </li>
              </ul>
              <p className="legal-callout">
                자유서술에는 주민등록번호, 계좌번호, 건강정보·범죄경력 등
                민감정보, 원본 서류와 제3자의 개인정보를 입력하지 마세요. 상담
                중 추가 자료가 필요하면 담당자가 안전한 제출 방법을 별도로
                안내합니다.
              </p>
            </section>

            <section id="provision">
              <p className="legal-section-number">04</p>
              <h2>개인정보의 제3자 제공과 처리위탁</h2>
              <h3>제3자 제공</h3>
              <p>
                로앤은 정보주체의 개인정보를 위 처리 목적 범위에서 이용하며,
                원칙적으로 제3자에게 제공하지 않습니다. 다만 정보주체가 별도로
                동의한 경우, 법률에 특별한 규정이 있는 경우, 생명·신체의 급박한
                위험을 해소하기 위해 필요한 경우 등 관계 법령이 허용하는
                범위에서는 제공할 수 있습니다.
              </p>
              <h3>개인정보 처리위탁</h3>
              <p>
                로앤은 서비스 운영에 필요한 일부 업무를 아래와 같이 위탁합니다.
                위탁계약에는 목적 외 처리 금지, 안전성 확보 조치, 재위탁 관리,
                감독과 책임에 관한 사항을 반영합니다.
              </p>
              <div className="legal-table-wrap">
                <table>
                  <caption>개인정보 처리 수탁자와 위탁업무</caption>
                  <thead>
                    <tr>
                      <th scope="col">수탁자</th>
                      <th scope="col">위탁업무</th>
                      <th scope="col">관련 항목</th>
                      <th scope="col">보유·이용기간</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Amazon Web Services(AWS)</th>
                      <td>홈페이지·ERP·API와 데이터베이스 인프라 운영</td>
                      <td>서비스에서 처리하는 개인정보와 보안 로그</td>
                      <td>위탁계약 종료 또는 처리 목적 달성 시까지</td>
                    </tr>
                    <tr>
                      <th scope="row">주식회사 누리고(SOLAPI)</th>
                      <td>상담 접수·담당 배정 카카오 알림톡 발송</td>
                      <td>
                        수신 휴대전화 번호, 접수번호·접수시각·연락예정·담당자명
                      </td>
                      <td>메시지 발송 및 관계 법령상 보관기간까지</td>
                    </tr>
                    <tr>
                      <th scope="row">주식회사 리걸플로(리걸프렌즈)</th>
                      <td>
                        담당자 배정 후 상담·사건 관리 시스템 등록과 사건 진행
                        지원
                      </td>
                      <td>
                        이름, 휴대전화 번호, 거주지역, 상담 메모, 사건 유형,
                        담당자·사건 식별정보
                      </td>
                      <td>위탁계약과 사건업무상 보유기간 종료 시까지</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                알림톡은 고객의 요청 접수와 담당 배정 안내에만 사용하며 광고성
                메시지로 사용하지 않습니다. 카카오톡 상담과 네이버 예약은
                정보주체가 각 서비스에서 직접 이용하는 별도 채널이며, 각
                서비스의 개인정보처리방침도 함께 적용됩니다.
              </p>
              <p>
                현재 이 홈페이지의 상담·후기 접수 개인정보를 별도의 광고
                플랫폼이나 생성형 AI 서비스에 제공하지 않습니다. Google
                Analytics 처리위탁·국외 이전은 다음 절에서 별도로
                안내합니다.
              </p>
            </section>

            <section id="overseas">
              <p className="legal-section-number">05</p>
              <h2>Google Analytics 처리위탁과 개인정보 국외 이전</h2>
              <p>
                로앤은 홈페이지와 캠페인의 이용 현황을 통계적으로 분석하기
                위해 아래 분석정보를 Google Analytics에 처리위탁하고 국외로
                이전합니다.
              </p>
              <div className="legal-table-wrap">
                <table>
                  <caption>Google Analytics 개인정보 국외 이전 내역</caption>
                  <thead>
                    <tr>
                      <th scope="col">구분</th>
                      <th scope="col">내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">이전받는 자·수탁자</th>
                      <td>
                        Google LLC
                        <br />
                        1600 Amphitheatre Parkway, Mountain View, CA 94043,
                        USA
                        <br />
                        <a
                          href="https://policies.google.com/privacy"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Google 개인정보 문의·정책
                        </a>
                        {" · "}
                        <a
                          href="https://support.google.com/policies/troubleshooter/9009584"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Google 데이터 보호 문의
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">이전 국가</th>
                      <td>
                        미국, 아르헨티나, 호주, 벨기에, 브라질, 캐나다, 칠레,
                        콜롬비아, 크로아티아, 체코, 덴마크, 핀란드, 프랑스, 독일,
                        인도, 아일랜드, 이스라엘, 이탈리아, 일본, 케냐, 말레이시아,
                        멕시코, 네덜란드, 노르웨이, 페루, 필리핀, 폴란드, 포르투갈,
                        싱가포르, 스페인, 스웨덴, 스위스, 대만, 튀르키예,
                        아랍에미리트, 영국, 우루과이
                        <br />
                        <em>
                          2026년 8월 19일 기준 Google 처리시설과 Google Analytics
                          재수탁자 소재지를 합친 목록입니다. Google은 계약상
                          Google 또는 재수탁자가 시설을 운영하는 국가에서 처리할
                          수 있습니다.
                        </em>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">이전 항목</th>
                      <td>
                        first-party 이용자·세션 식별값, 접속 시각, 국가·광역
                        지역과 브라우저·기기 범주, 정제한 페이지 경로·유입
                        origin·페이지 제목, 통제된 UTM·키워드 ID, 실제 웹 상담
                        접수 성공 이벤트
                        <br />
                        <em>
                          이름, 전화번호, 상담·진단 내용, 접수번호, 실제 검색어와
                          임의 URL 쿼리는 이전하지 않습니다. IP 주소는 전송
                          과정에서 최적 수집센터와 대략적 지역을 정하는 데
                          사용된 뒤 GA 서버에 기록되기 전에 폐기된다고 Google이
                          안내합니다.
                        </em>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">이전 시기·방법</th>
                      <td>
                        페이지 방문 또는 실제 웹 상담 접수 성공 이벤트가 발생할
                        때 암호화된 HTTPS 네트워크 통신으로 이전
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">이용 목적</th>
                      <td>
                        공개 페이지 이용 흐름과 웹 상담 접수 성과의 통계 분석,
                        홈페이지·캠페인 개선
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">보유·이용기간</th>
                      <td>
                        이용자·이벤트 단위 데이터 14개월. 새 활동이 있어도 사용자
                        데이터의 보유기간을 다시 시작하지 않도록 설정합니다.
                        `_ga` 계열 쿠키도 최초 생성부터 최대 14개월로 제한합니다.
                        표준 집계 보고서는 이 보유 설정의 적용 대상이 아니며,
                        분석 목적 종료 또는 속성 삭제 시 Google 계약의 종료·삭제
                        절차에 따라 처리합니다. Google의 처리 약관상 삭제 요청이나
                        계약 종료 뒤 시스템 삭제에는 최대 180일이 걸릴 수 있습니다.
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">거부 방법·효과</th>
                      <td>
                        브라우저의 쿠키·사이트 데이터 차단 또는 삭제 기능을
                        사용할 수 있습니다. 브라우저에서 이를 차단해도 홈페이지
                        열람과 상담 요청에는 영향이 없습니다. 이미 수집된 서버
                        데이터에 관한 권리행사는 아래 개인정보 보호책임자에게
                        요청할 수 있습니다.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="legal-callout">
                로앤은 Google 계정의 데이터 공유 선택을 모두 끄고, Google
                Signals·사용자 제공 데이터·광고 개인화·광고 잠재고객 기능을
                사용하지 않습니다. 세부 위치·기기 데이터 수집도 전 지역에서
                끄며, Google의 재수탁자 또는 처리 국가 변경 통지를 받으면 실제
                설정과 이 방침을 대조하고 필요한 경우 다시 동의를 받습니다.
              </p>
              <ul className="legal-resource-list">
                <li>
                  <a
                    href="https://policies.google.com/technologies/partner-sites"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google이 파트너 사이트 정보를 처리하는 방법
                  </a>
                </li>
                <li>
                  <a
                    href="https://business.safety.google/adsprocessorterms/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Ads 데이터 처리 약관
                  </a>
                </li>
                <li>
                  <a
                    href="https://business.safety.google/adssubprocessors/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Analytics 재수탁자 목록
                  </a>
                </li>
                <li>
                  <a
                    href="https://datacenters.google/locations/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google 데이터센터 위치
                  </a>
                </li>
              </ul>
            </section>

            <section id="destruction">
              <p className="legal-section-number">06</p>
              <h2>개인정보의 파기 절차와 방법</h2>
              <ol>
                <li>
                  보유기간 경과, 목적 달성 또는 적법한 삭제 요청 등 파기 사유가
                  발생한 정보를 확인합니다.
                </li>
                <li>
                  다른 법령상 보존 의무가 있는 정보는 일반 운영정보와 분리해
                  해당 기간에만 보관합니다.
                </li>
                <li>
                  전자 파일은 복구·재생하기 어렵도록 안전하게 삭제하고, 종이
                  문서는 분쇄 또는 소각합니다.
                </li>
                <li>
                  공개 후기를 철회하면 홈페이지 공개를 중단하고 검색 캐시 등
                  통제하기 어려운 외부 복제본의 삭제 요청도 가능한 범위에서
                  진행합니다.
                </li>
              </ol>
            </section>

            <section id="rights">
              <p className="legal-section-number">07</p>
              <h2>정보주체와 법정대리인의 권리·행사방법</h2>
              <p>
                정보주체는 본인 개인정보의 열람, 정정·삭제, 처리정지와 동의
                철회를 요청할 수 있습니다. 법정대리인이나 적법하게 위임받은
                대리인을 통해서도 행사할 수 있습니다.
              </p>
              <ul>
                <li>
                  대표전화{" "}
                  <a href={LAWAND_LEGAL_IDENTITY.mainTelephoneHref}>
                    {LAWAND_LEGAL_IDENTITY.mainTelephone}
                  </a>
                  , 전자우편{" "}
                  <a href={`mailto:${LAWAND_LEGAL_IDENTITY.privacyEmail}`}>
                    {LAWAND_LEGAL_IDENTITY.privacyEmail}
                  </a>
                  로 요청할 수 있습니다.
                </li>
                <li>
                  로앤은 요청자가 본인 또는 적법한 대리인인지 확인한 뒤 지체
                  없이 조치하고 결과를 안내합니다.
                </li>
                <li>
                  다른 법령에서 수집·보존을 요구하거나 타인의 권리·이익을
                  침해할 우려가 있는 경우에는 관계 법령에 따라 일부 요청이
                  제한될 수 있으며 그 사유를 안내합니다.
                </li>
                <li>
                  후기 수정·철회 요청 시 공개 접수번호를 함께 알려주면 확인이
                  빨라집니다. 접수번호만으로 개인정보를 조회할 수는 없습니다.
                </li>
              </ul>
            </section>

            <section id="security">
              <p className="legal-section-number">08</p>
              <h2>개인정보의 안전성 확보 조치</h2>
              <ul>
                <li>
                  상담 연락처·이름·지역·원문과 비공개 후기 원문을 인증 암호화해
                  저장하고 전송 구간을 보호합니다.
                </li>
                <li>
                  전화번호와 중복 판정값은 서버 비밀키를 이용한 지문으로
                  비교하며 평문을 분석 이벤트에 복제하지 않습니다.
                </li>
                <li>
                  직원 계정은 초대 전용 인증과 역할별 접근권한을 사용하고 상담
                  상세정보 열람 이력을 남깁니다.
                </li>
                <li>
                  접수 API에 요청 크기 제한, 멱등 처리, 속도 제한과 부정 이용
                  방지 조치를 적용합니다.
                </li>
                <li>
                  암호키와 운영 비밀값을 소스코드·데이터베이스와 분리하고,
                  개인정보가 오류 로그에 기록되지 않도록 관리합니다.
                </li>
              </ul>
            </section>

            <section id="automatic">
              <p className="legal-section-number">09</p>
              <h2>브라우저 저장소·이용 분석과 자동화된 처리</h2>
              <h3>브라우저 저장소</h3>
              <p>
                홈페이지는 같은 탭 안에서 상담 요청의 중복을 줄이고 방문
                순서를 연결하기 위해 세션 저장소를 사용합니다. 가명 세션키,
                내부 방문 경로와 상담 버튼 위치만 저장하며 브라우저 탭을 닫으면
                삭제됩니다. 이름, 전화번호와 자유서술은 브라우저 저장소에
                저장하지 않습니다.
              </p>
              <p>
                분석 허용·거부 선택과 동의 버전은 같은 브라우저의 first-party
                로컬 저장소에 보관해 다음 방문에도 선택을 적용합니다. 이 선택값은
                상담 내용이나 광고 프로필을 담지 않습니다.
              </p>
              <p>
                브라우저 설정에서 사이트 데이터 저장을 거부하거나 삭제할 수
                있지만, 이 경우 중복 요청 방지나 유입 경로 연결이 정확하지 않을
                수 있습니다.
              </p>
              <h3>서비스 개선 분석</h3>
              <p>
                운영 Measurement ID가 설정된 경우에도 첫 화면과 동의 전에는
                Google Analytics 스크립트를 내려받거나 Google에 데이터를 보내지
                않습니다. 이용자가 분석을 허용한 뒤에만 `_ga`·`_ga_&lt;측정
                ID&gt;` first-party 쿠키를 사용해 정제된 페이지뷰와 실제 웹 상담
                접수 성공을 측정합니다. 방문·세션 통계를 만들기 위해 GA가
                자동 생성하는 `first_visit`·`session_start`·`user_engagement`
                이벤트도 함께 처리됩니다. 쿠키 갱신을 끄고 최초 생성부터 최대
                14개월로 제한하며 브라우저 정책에 따라 더 짧아질 수 있습니다.
              </p>
              <ul>
                <li>
                  `analytics_storage`만 활성화하며 `ad_storage`, `ad_user_data`,
                  `ad_personalization`은 항상 거부합니다.
                </li>
                <li>
                  Google Signals, 맞춤형 광고, 리마케팅, 잠재고객 목록,
                  User-ID, 사용자 제공 데이터와 광고 관심그룹 기능을 사용하지
                  않습니다.
                </li>
                <li>
                  향상된 측정은 전체 비활성화해 스크롤, 외부 링크, 사이트 검색,
                  동영상, 파일 다운로드, 폼 상호작용과 브라우저 히스토리 변경을
                  자동 수집하지 않습니다.
                </li>
                <li>
                  세부 위치·기기 데이터는 전 지역에서 비활성화하고, 스트림의
                  이메일 주소 가림과 금지 URL 쿼리 가림을 추가 안전장치로
                  사용합니다.
                </li>
                <li>
                  페이지 주소는 정식 도메인·허용된 공개 경로와 통제된 캠페인
                  키만 새로 조립합니다. 사례 상세 식별자는 공통 상세 경로로,
                  알 수 없는 경로는 찾을 수 없음 경로로 일반화하고 실제 검색어와
                  임의 쿼리를 제거합니다.
                </li>
              </ul>
              <h3>자동화된 처리</h3>
              <p>
                로앤은 중복 접수 분류, 담당자 배정 후 외부 시스템 등록과 알림
                발송, 자가진단 입력조건과 과거 로앤 사건의 유사도 계산을
                자동화할 수 있습니다. 자가진단은 직접 식별정보와 사건번호를
                제외한 비교 원장을 사용하며, 비교사건의 신청서 접수·금지·개시·
                인가·파산선고·면책허가 날짜를 절차 순서로 표시할 수 있습니다. 고객에게
                표시한 비식별 유사사례 카드 스냅샷은 상담 준비를 위해 암호화된 ERP
                상담 원장에서도 확인할 수 있습니다.
                이러한 자동화는 법률 판단, 사건 수임 여부 또는
                재판 결과를 자동 결정하지 않습니다. 담당 직원과 변호사가
                상담·계약·법률 판단과 중요한 고객 안내를 확인하고 책임집니다.
              </p>
            </section>

            <section id="officer">
              <p className="legal-section-number">10</p>
              <h2>개인정보 보호책임자와 권리구제</h2>
              <dl className="legal-contact-card">
                <div>
                  <dt>개인정보 보호책임자</dt>
                  <dd>김충환 대표변호사</dd>
                </div>
                <div>
                  <dt>개인정보 열람청구·고충처리 창구</dt>
                  <dd>{LAWAND_LEGAL_IDENTITY.legalName}</dd>
                </div>
                <div>
                  <dt>전화</dt>
                  <dd>
                    <a href={LAWAND_LEGAL_IDENTITY.mainTelephoneHref}>
                      {LAWAND_LEGAL_IDENTITY.mainTelephone}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>전자우편</dt>
                  <dd>
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
              <p>
                개인정보 침해에 대한 추가 상담이나 분쟁조정이 필요한 경우 아래
                기관에 문의할 수 있습니다.
              </p>
              <ul className="legal-resource-list">
                <li>
                  <a
                    href="https://www.kopico.go.kr"
                    target="_blank"
                    rel="noreferrer"
                  >
                    개인정보분쟁조정위원회
                  </a>{" "}
                  · 1833-6972
                </li>
                <li>
                  <a
                    href="https://privacy.kisa.or.kr"
                    target="_blank"
                    rel="noreferrer"
                  >
                    개인정보침해 신고센터
                  </a>{" "}
                  · 국번 없이 118
                </li>
                <li>
                  <a
                    href="https://www.spo.go.kr"
                    target="_blank"
                    rel="noreferrer"
                  >
                    대검찰청
                  </a>{" "}
                  · 국번 없이 1301
                </li>
                <li>
                  <a
                    href="https://ecrm.police.go.kr"
                    target="_blank"
                    rel="noreferrer"
                  >
                    경찰청
                  </a>{" "}
                  · 국번 없이 182
                </li>
              </ul>
            </section>

            <section id="changes">
              <p className="legal-section-number">11</p>
              <h2>개인정보처리방침의 변경</h2>
              <p>
                이 방침은 {PRIVACY_POLICY_EFFECTIVE_DATE_LABEL}부터
                시행합니다. 처리 목적, 항목, 위탁사 또는 권리행사 방법이
                변경되면 시행 전에 홈페이지에서 변경 내용과 시행일을
                알리겠습니다. 정보주체의 권리에 중요한 변경은 필요한 경우 별도
                안내합니다.
              </p>
              <div className="legal-source-note">
                <strong>작성 기준</strong>
                <p>
                  개인정보 보호법과 개인정보보호위원회의 개인정보 처리방침
                  작성지침을 기준으로, 현재 구현된 로앤 홈페이지·ERP 흐름을
                  대조해 작성했습니다.
                </p>
                <div>
                  <a
                    href="https://www.law.go.kr/법령/개인정보보호법"
                    target="_blank"
                    rel="noreferrer"
                  >
                    개인정보 보호법 확인
                  </a>
                  <a
                    href="https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=G010030000&nttId=12018"
                    target="_blank"
                    rel="noreferrer"
                  >
                    개인정보보호위원회 작성지침 확인
                  </a>
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
