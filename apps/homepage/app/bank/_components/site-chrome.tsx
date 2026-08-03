import { Fragment, type ReactNode } from "react";
import Image from "next/image";

import { KakaoConsultationEntry } from "@/app/_components/kakao-consultation-entry";
import {
  ADVERTISING_RESPONSIBLE_LAWYER_LABEL,
  LAWAND_LEGAL_IDENTITY,
} from "@/lib/legal-identity";

const officeAddresses = [
  {
    city: "서울",
    address: "서울특별시 강남구 논현로87길 25 HB타워 3층, 4층",
  },
  {
    city: "대전",
    address: "대전광역시 서구 둔산중로78번길 26 민석타워 14층",
  },
  {
    city: "부산",
    address: "부산광역시 연제구 법원로 38 로펌빌딩 401호",
  },
];

const navigationGroups = [
  {
    label: "개인회생",
    href: "/bank/personal-rehabilitation",
    description: "자격부터 변제 수행까지",
    links: [
      {
        href: "/bank/personal-rehabilitation/eligibility",
        label: "신청자격",
        description: "소득·채무·재산의 기본 조건",
      },
      {
        href: "/bank/personal-rehabilitation/process",
        label: "절차·기간",
        description: "신청부터 면책까지의 순서",
      },
      {
        href: "/bank/personal-rehabilitation/documents",
        label: "필요서류",
        description: "공통서류와 상황별 자료",
      },
      {
        href: "/bank/personal-rehabilitation/repayment",
        label: "변제금",
        description: "가용소득과 청산가치",
      },
      {
        href: "/bank/guides/costs",
        label: "비용 안내",
        description: "법원비용과 계약 확인사항",
      },
    ],
  },
  {
    label: "개인파산·면책",
    href: "/bank/personal-bankruptcy",
    description: "파산선고와 면책을 구분해서",
    links: [
      {
        href: "/bank/personal-bankruptcy/eligibility",
        label: "신청자격",
        description: "지급불능과 면책 심사",
      },
      {
        href: "/bank/personal-bankruptcy/process",
        label: "절차·기간",
        description: "관재인 조사부터 면책까지",
      },
      {
        href: "/bank/personal-bankruptcy/documents",
        label: "필요서류",
        description: "재산·채무·생활상황 자료",
      },
    ],
  },
  {
    label: "상황별 안내",
    href: "/bank/situations",
    description: "현재 문제와 채무 원인부터",
    links: [
      {
        href: "/bank/situations/collection-and-seizure",
        label: "독촉·압류 대응",
        description: "문서와 기한을 먼저 확인",
      },
      {
        href: "/bank/situations/investment-debt",
        label: "주식·코인 채무",
        description: "투자금과 자금 흐름 정리",
      },
      {
        href: "/bank/situations/self-employed",
        label: "자영업자 개인회생",
        description: "매출·영업비용·사업재산",
      },
    ],
  },
];

const evidenceLinks = [
  {
    href: "/bank/reviews",
    label: "고객후기",
    description: "분야·단계별로 찾는 고객의 원문",
  },
  {
    href: "/bank/reviews/write",
    label: "후기 남기기",
    description: "함께한 과정을 내 말로 기록하기",
  },
  {
    href: "/bank#cases",
    label: "사례로 이해하기",
    description: "결과보다 확인한 쟁점 중심",
  },
];

export function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7.1 3.8 9.7 8l-2.2 2a15.7 15.7 0 0 0 6.5 6.5l2-2.2 4.2 2.6-1.1 3.2c-.3.8-1.1 1.3-2 1.2C9.5 20.4 3.6 14.5 2.7 6.9c-.1-.9.4-1.7 1.2-2l3.2-1.1Z" />
    </svg>
  );
}

export function KakaoChatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 4C6.9 4 3 7.2 3 11.2c0 2.6 1.7 4.9 4.3 6.1l-1 3.1 3.8-2.2c.6.1 1.2.2 1.9.2 5.1 0 9-3.2 9-7.2S17.1 4 12 4Z" />
    </svg>
  );
}

export function Logo() {
  return (
    <Image
      alt="LAW& 법무법인 로앤"
      className="brand-logo"
      height={40}
      src="/images/brand/lawand-wordmark-signature.svg"
      width={254}
    />
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <a className="logo-link" href="/bank" aria-label="LAW& 법무법인 로앤 회생·파산 홈">
          <Logo />
        </a>

        <nav className="desktop-nav" aria-label="주요 메뉴">
          {navigationGroups.map((group, index) => (
            <Fragment key={group.label}>
              <details className="desktop-menu" name="desktop-primary-navigation">
                <summary>
                  {group.label}
                  <ChevronIcon />
                </summary>
                <div className="desktop-menu-panel">
                  <a className="desktop-menu-hub" href={group.href}>
                    <span>
                      <small>카테고리 전체</small>
                      <strong>{group.label} 한눈에 보기</strong>
                      <em>{group.description}</em>
                    </span>
                    <ArrowIcon />
                  </a>
                  <div className="desktop-menu-links">
                    {group.links.map((link) => (
                      <a href={link.href} key={link.href}>
                        <strong>{link.label}</strong>
                        <span>{link.description}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </details>
              {index === 1 ? (
                <a className="desktop-nav-link" href="/bank/compare">
                  제도 비교
                </a>
              ) : null}
            </Fragment>
          ))}

          <details className="desktop-menu" name="desktop-primary-navigation">
            <summary>
              후기·사례
              <ChevronIcon />
            </summary>
            <div className="desktop-menu-panel desktop-menu-panel-compact">
              <div className="desktop-menu-links">
                {evidenceLinks.map((link) => (
                  <a href={link.href} key={link.href}>
                    <strong>{link.label}</strong>
                    <span>{link.description}</span>
                  </a>
                ))}
              </div>
            </div>
          </details>

          <details className="desktop-menu" name="desktop-primary-navigation">
            <summary>
              로앤
              <ChevronIcon />
            </summary>
            <div className="desktop-menu-panel desktop-menu-panel-compact">
              <div className="desktop-menu-links">
                <a href="/about">
                  <strong>로앤 소개</strong>
                  <span>확인 가능한 기록과 일하는 원칙</span>
                </a>
                <a href="/people">
                  <strong>변호사·구성원</strong>
                  <span>담당 변호사와 사건 처리팀</span>
                </a>
              </div>
            </div>
          </details>
        </nav>

        <div className="header-actions">
          <KakaoConsultationEntry
            className="header-kakao"
            placement="header-kakao"
          >
            <KakaoChatIcon />
            카톡상담
          </KakaoConsultationEntry>
          <a
            className="header-cta"
            href="/bank/consultation"
            data-consultation-cta="header"
          >
            상담 요청
            <ArrowIcon />
          </a>
        </div>

        <details className="mobile-menu">
          <summary aria-label="메뉴 열기">
            <span />
            <span />
            <span />
          </summary>
          <nav aria-label="모바일 메뉴">
            <a className="mobile-menu-home" href="/bank">
              회생·파산 홈
              <ArrowIcon />
            </a>

            {navigationGroups.map((group, index) => (
              <Fragment key={group.label}>
                <details className="mobile-menu-group" name="mobile-primary-navigation">
                  <summary>
                    {group.label}
                    <ChevronIcon />
                  </summary>
                  <div>
                    <a className="mobile-menu-hub" href={group.href}>
                      <strong>{group.label} 한눈에 보기</strong>
                      <span>{group.description}</span>
                    </a>
                    {group.links.map((link) => (
                      <a href={link.href} key={link.href}>
                        <strong>{link.label}</strong>
                        <span>{link.description}</span>
                      </a>
                    ))}
                  </div>
                </details>
                {index === 1 ? (
                  <a className="mobile-menu-direct" href="/bank/compare">
                    <span>
                      <strong>개인회생·개인파산 비교</strong>
                      <small>두 제도의 차이를 같은 기준으로</small>
                    </span>
                    <ArrowIcon />
                  </a>
                ) : null}
              </Fragment>
            ))}

            <details className="mobile-menu-group" name="mobile-primary-navigation">
              <summary>
                후기·사례
                <ChevronIcon />
              </summary>
              <div>
                {evidenceLinks.map((link) => (
                  <a href={link.href} key={link.href}>
                    <strong>{link.label}</strong>
                    <span>{link.description}</span>
                  </a>
                ))}
              </div>
            </details>

            <div className="mobile-menu-secondary">
              <a href="/about">로앤 소개</a>
              <a href="/people">변호사·구성원</a>
              <KakaoConsultationEntry
                placement="mobile-menu-kakao"
              >
                카톡상담
              </KakaoConsultationEntry>
              <a href="/bank/consultation" data-consultation-cta="mobile-menu">
                상담 요청
              </a>
            </div>
          </nav>
        </details>
      </div>
    </header>
  );
}

export function ConsultationSection({
  title = (
    <>
      아직 어떤 절차인지
      <br />
      정하지 않아도 괜찮습니다.
    </>
  ),
  body = "지금 알고 있는 것부터 말씀해 주시면 됩니다. 상담을 요청하는 단계에서는 주민등록번호나 계좌번호, 원본 서류를 받지 않습니다.",
}: {
  title?: ReactNode;
  body?: string;
}) {
  return (
    <section className="consultation-section" id="consultation">
      <div className="shell consultation-grid">
        <div>
          <p className="eyebrow">상담 요청</p>
          <h2>{title}</h2>
        </div>
        <div className="consultation-copy">
          <p>{body}</p>
          <div className="consultation-actions">
            <a className="button button-inverse" href="tel:16708480">
              <PhoneIcon />
              1670-8480
            </a>
            <a
              className="button button-outline-light"
              href="/bank/consultation"
              data-consultation-cta="page-consultation-section"
            >
              상담 요청 남기기
              <ArrowIcon />
            </a>
            <KakaoConsultationEntry
              className="button button-kakao"
              placement="page-consultation-section-kakao"
            >
              <KakaoChatIcon />
              카톡상담
            </KakaoConsultationEntry>
          </div>
          <span>평일 오전 8시–오후 7시 · 주말 및 공휴일 휴무</span>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-top">
          <Logo />
          <div className="footer-links">
            <a href="/privacy">개인정보처리방침</a>
            <a href="/terms">이용약관</a>
            <a href="/people">변호사·구성원</a>
            <a href="/about#automation">AI·자동화 원칙</a>
          </div>
        </div>
        <div className="office-grid">
          {officeAddresses.map((office) => (
            <address key={office.city}>
              <strong>{office.city} 사무소</strong>
              <span>{office.address}</span>
            </address>
          ))}
        </div>
        <div className="footer-bottom">
          <p>
            {LAWAND_LEGAL_IDENTITY.legalName} · 대표변호사{" "}
            {LAWAND_LEGAL_IDENTITY.representativeLawyer} · 사업자등록번호{" "}
            {LAWAND_LEGAL_IDENTITY.primaryBusinessRegistrationNumber}
            <br />
            광고책임변호사 {ADVERTISING_RESPONSIBLE_LAWYER_LABEL}
          </p>
          <p>© {new Date().getFullYear()} LAW&amp;. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export function MobileActions() {
  return (
    <nav className="mobile-actions" aria-label="빠른 상담">
      <a href="tel:16708480">
        <PhoneIcon />
        전화 상담
      </a>
      <KakaoConsultationEntry
        placement="mobile-fixed-bar-kakao"
      >
        <KakaoChatIcon />
        카톡상담
      </KakaoConsultationEntry>
      <a href="/bank/consultation" data-consultation-cta="mobile-fixed-bar">
        상담 요청
        <ArrowIcon />
      </a>
    </nav>
  );
}
