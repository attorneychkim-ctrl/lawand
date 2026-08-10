import type { ReactNode } from "react";

import {
  ArrowIcon,
  ConsultationSection,
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "./site-chrome";

const siteUrl = "https://lawandfirm.com";

export type CategoryHubLink = {
  href: string;
  label: string;
  title: string;
  body: string;
};

type CategoryHubProps = {
  pagePath: string;
  breadcrumb: string;
  eyebrow: string;
  title: ReactNode;
  lead: string;
  answerTitle: string;
  answerBody: string;
  pagesTitle: ReactNode;
  pagesDescription: string;
  pages: CategoryHubLink[];
  startEyebrow: string;
  startTitle: ReactNode;
  startDescription: string;
  startPoints: Array<{
    title: string;
    body: string;
  }>;
  relatedTitle: string;
  relatedLinks: CategoryHubLink[];
  consultationTitle: ReactNode;
  consultationBody: string;
  source?: {
    href: string;
    organization: string;
    label: string;
  };
};

export function CategoryHub({
  pagePath,
  breadcrumb,
  eyebrow,
  title,
  lead,
  answerTitle,
  answerBody,
  pagesTitle,
  pagesDescription,
  pages,
  startEyebrow,
  startTitle,
  startDescription,
  startPoints,
  relatedTitle,
  relatedLinks,
  consultationTitle,
  consultationBody,
  source,
}: CategoryHubProps) {
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
        name: breadcrumb,
        item: `${siteUrl}${pagePath}`,
      },
    ],
  };

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: breadcrumb,
    url: `${siteUrl}${pagePath}`,
    inLanguage: "ko-KR",
    isPartOf: {
      "@type": "WebSite",
      name: "법무법인 로앤",
      url: siteUrl,
    },
    hasPart: pages.map((page) => ({
      "@type": "WebPage",
      name: page.title,
      url: `${siteUrl}${page.href}`,
    })),
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      <SiteHeader />

      <main id="main-content">
        <section className="hub-hero">
          <div className="hub-hero-orbit" aria-hidden="true" />
          <div className="shell">
            <nav className="breadcrumb" aria-label="현재 위치">
              <a href="/bank">회생·파산</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{breadcrumb}</span>
            </nav>

            <div className="hub-hero-grid">
              <div className="hub-hero-copy">
                <p className="eyebrow">{eyebrow}</p>
                <h1>{title}</h1>
                <p>{lead}</p>
                <div className="hero-actions">
                  <a className="button button-primary" href="#hub-pages">
                    안내 순서 보기
                    <ArrowIcon />
                  </a>
                  <a className="button button-secondary" href="/bank/compare">
                    두 제도 비교하기
                  </a>
                </div>
              </div>

              <aside className="hub-index" aria-label={`${breadcrumb} 페이지 목록`}>
                <p>이 카테고리에서 볼 내용</p>
                <ol>
                  {pages.map((page, index) => (
                    <li key={page.href}>
                      <a href={page.href}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{page.label}</strong>
                        <ArrowIcon />
                      </a>
                    </li>
                  ))}
                </ol>
              </aside>
            </div>
          </div>
        </section>

        <section className="eligibility-answer-band" aria-label={answerTitle}>
          <div className="shell">
            <strong>{answerTitle}</strong>
            <p>{answerBody}</p>
          </div>
        </section>

        <section className="section hub-pages-section" id="hub-pages">
          <div className="shell">
            <div className="section-heading heading-row">
              <div>
                <p className="eyebrow">카테고리 안내</p>
                <h2>{pagesTitle}</h2>
              </div>
              <p>{pagesDescription}</p>
            </div>

            <div className="hub-page-grid">
              {pages.map((page, index) => (
                <article key={page.href}>
                  <div>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <small>{page.label}</small>
                  </div>
                  <h3>{page.title}</h3>
                  <p>{page.body}</p>
                  <a href={page.href}>
                    {page.label} 안내 보기
                    <ArrowIcon />
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section self-check-section">
          <div className="shell">
            <div className="self-check-heading">
              <div className="section-heading">
                <p className="eyebrow">{startEyebrow}</p>
                <h2>{startTitle}</h2>
              </div>
              <p>{startDescription}</p>
            </div>

            <ol className="self-check-grid">
              {startPoints.map((point, index) => (
                <li key={point.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{point.title}</h3>
                    <p>{point.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {source ? (
          <section className="hub-source" aria-label="공식 안내">
            <div className="shell">
              <p>
                <span>{source.organization}</span>
                이 페이지의 제도 설명은 공식 공개자료를 기준으로 정리했습니다. 구체적인
                법률 근거와 예외는 각 상세 안내에서 확인할 수 있습니다.
              </p>
              <a href={source.href} target="_blank" rel="noreferrer">
                {source.label}
                <b aria-hidden="true">↗</b>
              </a>
            </div>
          </section>
        ) : null}

        <section className="related-section" aria-labelledby="related-title">
          <div className="shell">
            <div className="related-heading">
              <p className="eyebrow">함께 볼 카테고리</p>
              <h2 id="related-title">{relatedTitle}</h2>
            </div>
            <div className="related-links">
              {relatedLinks.map((link) => (
                <a href={link.href} key={link.href}>
                  <span>{link.label}</span>
                  {link.title}
                  <ArrowIcon />
                </a>
              ))}
            </div>
          </div>
        </section>

        <ConsultationSection title={consultationTitle} body={consultationBody} />
      </main>

      <SiteFooter />
      <MobileActions />

      {[breadcrumbJsonLd, collectionJsonLd].map((data, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}
    </>
  );
}
