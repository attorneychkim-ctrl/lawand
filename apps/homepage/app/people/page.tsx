import type { Metadata } from "next";
import Image from "next/image";

import {
  ArrowIcon,
  CheckIcon,
  ConsultationSection,
  MobileActions,
  SiteFooter,
  SiteHeader,
} from "@/app/bank/_components/site-chrome";
import {
  bankruptcyLawyer,
  getStaffTags,
  LAWYER_PROFILE_VERIFIED_DATE_LABEL,
  lawyers,
  staffMembers,
} from "@/lib/people";

const pagePath = "/people";

const officeOrder = ["서울", "대전", "부산"] as const;
const teamOrder = ["법률컨설팅팀", "사건관리팀"] as const;
const teamDescriptions = {
  법률컨설팅팀: "상담 · 정보 정리",
  사건관리팀: "서류 · 사건 관리",
} as const;

const teamPublicRoles = {
  법률컨설팅팀: "컨설턴트",
  사건관리팀: "매니저",
} as const;

const officeDescriptions = {
  서울: "상담과 사건관리의 기준을 함께 만들고 이어갑니다.",
  대전: "법률컨설팅팀과 사건관리팀이 지역 사건의 흐름을 이어갑니다.",
  부산: "상담·서류 준비와 부동산·등기 업무를 가까이에서 지원합니다.",
} as const;

const workStages = [
  {
    number: "01",
    owner: "법률컨설팅팀",
    title: "상담하고, 현재 정보를 정리합니다.",
    description:
      "최초 상담에서 채무·소득·재산과 생활 상황을 듣고 필요한 정보를 정리합니다. 가능한 진행 방향을 설명하고 서류 발급과 부채증명서 발급 의뢰를 돕습니다.",
    boundary:
      "상담 단계의 설명을 바탕으로 한 법률적 판단과 사건 방향은 담당 변호사가 검토합니다.",
  },
  {
    number: "02",
    owner: "사건관리팀",
    title: "자료가 모이면 신청서 준비를 이어받습니다.",
    description:
      "기본 서류와 부채증명서가 일정 수준 모이면 사건관리팀이 배정됩니다. 누락 자료를 확인하고 담당 변호사의 지휘 아래 신청서 초안을 준비합니다.",
    boundary:
      "자료를 단순히 모으는 데서 끝내지 않고, 신청서에 반영할 사실관계를 의뢰인과 다시 확인합니다.",
  },
  {
    number: "03",
    owner: "법률컨설팅팀 · 담당변호사 · 의뢰인",
    title: "한 번의 확인으로 바로 제출하지 않습니다.",
    description:
      "사건관리팀이 준비한 신청서는 법률컨설팅팀의 사실관계 확인, 담당 변호사의 법률 검토, 의뢰인의 최종 확인을 거친 뒤 제출합니다.",
    boundary:
      "의뢰인이 확인하지 않은 사실을 임의로 확정하거나 결과를 미리 단정하지 않습니다.",
  },
  {
    number: "04",
    owner: "사건관리팀 · 담당변호사",
    title: "접수 후 보정에도 같은 확인 절차를 적용합니다.",
    description:
      "법원에서 보정권고가 나오면 사건관리팀이 필요한 자료를 안내합니다. 자료가 모이면 담당자들과 변호사가 쟁점을 논의하고 보정서 초안을 준비합니다.",
    boundary:
      "보정서 역시 담당 변호사의 검토와 필요한 확인을 거쳐 법원에 제출합니다.",
  },
] as const;

export const metadata: Metadata = {
  title: "변호사·구성원 소개",
  description:
    "법무법인 로앤의 변호사와 서울·대전·부산에서 상담·사건 준비를 이어가는 구성원, 법률 판단과 제출 전 확인 과정을 소개합니다.",
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: "변호사·구성원 소개 | 법무법인 로앤",
    description:
      "누가 상담하고, 누가 준비하며, 누가 법률 판단과 제출을 책임지는지 구성원 사진과 역할로 안내합니다.",
    type: "website",
    url: `https://lawandfirm.com${pagePath}`,
  },
};

function VerificationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m8.6 3 3.4 2 3.4-2 1.9 3.5 3.7 1-.9 3.8 2.6 2.7-2.6 2.7.9 3.8-3.7 1-1.9 3.5-3.4-2-3.4 2-1.9-3.5-3.7-1 .9-3.8L1.3 14l2.6-2.7L3 7.5l3.7-1L8.6 3Z" />
      <path d="m8.2 14 2.3 2.3 5.5-5.7" />
    </svg>
  );
}

function LawyerFacts({
  lawyer,
}: {
  lawyer: (typeof lawyers)[number];
}) {
  return (
    <dl className="people-lawyer-facts">
      <div>
        <dt>변호사등록번호</dt>
        <dd>{lawyer.registrationNumber}</dd>
      </div>
      <div>
        <dt>자격</dt>
        <dd>{lawyer.qualification}</dd>
      </div>
      <div>
        <dt>학력</dt>
        <dd>{lawyer.education}</dd>
      </div>
    </dl>
  );
}

export default function PeoplePage() {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "LegalService",
    name: "법무법인 로앤",
    url: "https://lawandfirm.com",
    employee: [
      ...lawyers.map((lawyer) => ({
        "@type": "Person",
        name: lawyer.name,
        alternateName: lawyer.englishName,
        jobTitle: lawyer.role,
        image: `https://lawandfirm.com${lawyer.imageUrl}`,
        sameAs: lawyer.profileUrl,
        worksFor: {
          "@type": "LegalService",
          name: "법무법인 로앤",
        },
        knowsAbout: [
          ...lawyer.registeredSpecialties,
          ...lawyer.practiceAreas,
        ],
      })),
      ...staffMembers.map((member) => ({
        "@type": "Person",
        name: member.name,
        jobTitle: `${member.team} ${teamPublicRoles[member.team]}`,
        image: `https://lawandfirm.com${member.imageUrl}`,
        worksFor: {
          "@type": "LegalService",
          name: "법무법인 로앤",
        },
      })),
    ],
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "회생·파산",
        item: "https://lawandfirm.com/bank",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "구성원",
        item: "https://lawandfirm.com/people",
      },
    ],
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <SiteHeader />

      <main id="main-content" className="people-page">
        <section className="people-hero">
          <div className="people-hero-lines" aria-hidden="true" />
          <div className="shell people-hero-grid">
            <div className="people-hero-copy">
              <p className="eyebrow">LAWAND / PEOPLE</p>
              <h1>
                사건을 맡는
                <br />
                <span>사람</span>이 보이면
                <br />
                일하는 방식이 보입니다.
              </h1>
              <p className="people-hero-description">
                로앤은 변호사의 법률 판단과 두 실무팀의 준비 업무를 한 화면에
                숨기지 않습니다. 서울·대전·부산에서 상담, 자료 정리, 사건
                관리, 제출 전 확인을 이어가는 사람들을 소개합니다.
              </p>
              <div className="people-hero-actions">
                <a className="button button-primary" href="#bankruptcy-lawyer">
                  변호사 살펴보기
                  <ArrowIcon />
                </a>
                <a className="button button-secondary" href="#staff-directory">
                  실무 구성원 보기
                </a>
              </div>
            </div>

            <aside className="people-hero-visual" aria-label="로앤 변호사 사진">
              <span className="people-hero-visual-kicker">THE TEAM BEHIND THE CASE</span>
              <div className="people-hero-orbit people-hero-orbit-large" aria-hidden="true" />
              <div className="people-hero-orbit people-hero-orbit-small" aria-hidden="true" />
              <div className="people-hero-portrait people-hero-portrait-kim">
                <Image
                  alt={`${bankruptcyLawyer.name} ${bankruptcyLawyer.role}`}
                  height={bankruptcyLawyer.imageHeight}
                  priority
                  sizes="(max-width: 700px) 50vw, 240px"
                  src={bankruptcyLawyer.imageUrl}
                  width={bankruptcyLawyer.imageWidth}
                />
              </div>
              <div className="people-hero-portrait people-hero-portrait-heo">
                <Image
                  alt={`${lawyers[1].name} ${lawyers[1].role}`}
                  height={lawyers[1].imageHeight}
                  sizes="(max-width: 700px) 26vw, 130px"
                  src={lawyers[1].imageUrl}
                  width={lawyers[1].imageWidth}
                />
              </div>
              <div className="people-hero-portrait people-hero-portrait-woo">
                <Image
                  alt={`${lawyers[2].name} ${lawyers[2].role}`}
                  height={lawyers[2].imageHeight}
                  sizes="(max-width: 700px) 26vw, 130px"
                  src={lawyers[2].imageUrl}
                  width={lawyers[2].imageWidth}
                />
              </div>
              <div className="people-hero-portrait people-hero-portrait-park">
                <Image
                  alt={`${lawyers[3].name} ${lawyers[3].role}`}
                  height={lawyers[3].imageHeight}
                  sizes="(max-width: 700px) 26vw, 130px"
                  src={lawyers[3].imageUrl}
                  width={lawyers[3].imageWidth}
                />
              </div>
              <div className="people-hero-visual-caption">
                <strong>04</strong>
                <span>법률 판단을 맡는 변호사</span>
              </div>
              <div className="people-hero-visual-offices">
                <span>SEOUL</span>
                <span>DAEJEON</span>
                <span>BUSAN</span>
              </div>
            </aside>
          </div>
          <div className="shell people-hero-stats" aria-label="로앤 구성원 구성">
            <div>
              <strong>03</strong>
              <span>OFFICES</span>
              <p>서울 · 대전 · 부산</p>
            </div>
            <div>
              <strong>02</strong>
              <span>CASE TEAMS</span>
              <p>법률컨설팅 · 사건관리</p>
            </div>
            <div>
              <strong>01</strong>
              <span>SHARED STANDARD</span>
              <p>확인 후 다음 단계로</p>
            </div>
          </div>
        </section>

        <section className="people-principles" aria-labelledby="principles-title">
          <div className="shell">
            <div className="people-section-heading people-principles-heading">
              <div>
                <p className="eyebrow">ONE CASE, MANY CHECKS</p>
                <h2 id="principles-title">
                  사람이 나뉘어도
                  <br />
                  책임은 이어집니다.
                </h2>
              </div>
              <p>
                구성원 소개는 명단을 보여주는 데서 끝나지 않습니다. 누가 어떤
                단계에서 고객의 이야기를 다루고, 어디서 법률 판단이 들어가는지
                한눈에 알 수 있어야 합니다.
              </p>
            </div>
            <div className="people-principles-grid">
              <article>
                <span>01 / LEGAL JUDGMENT</span>
                <h3>법률 판단은 담당 변호사가 맡습니다.</h3>
                <p>
                  제도 적용 가능성, 신청서와 보정서의 쟁점, 제출 여부를 담당
                  변호사가 검토합니다.
                </p>
              </article>
              <article>
                <span>02 / CASE PREPARATION</span>
                <h3>준비 업무는 역할에 맞게 나눕니다.</h3>
                <p>
                  법률컨설팅팀과 사건관리팀이 상담·자료·서류의 흐름을 이어받아
                  다음 확인을 준비합니다.
                </p>
              </article>
              <article>
                <span>03 / FINAL CHECK</span>
                <h3>제출 전에는 의뢰인과 다시 확인합니다.</h3>
                <p>
                  사실관계와 제출 내용이 맞는지 변호사와 의뢰인이 함께 확인한 뒤
                  다음 단계로 넘어갑니다.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          className="people-lead-lawyer"
          id="bankruptcy-lawyer"
          aria-labelledby="bankruptcy-lawyer-title"
        >
          <div className="shell">
            <div className="people-section-heading">
              <div>
                <p className="eyebrow">BANKRUPTCY COUNSEL</p>
                <h2 id="bankruptcy-lawyer-title">
                  회생·파산의 법률 판단을
                  <br />
                  담당하는 변호사입니다.
                </h2>
              </div>
              <p>
                상담과 자료 준비는 여러 구성원이 함께하지만, 제도 적용 가능성,
                신청서와 보정서의 법률 쟁점 및 제출 여부는 담당 변호사가
                검토합니다.
              </p>
            </div>

            <article className="people-featured-profile">
              <div className="people-featured-photo">
                <span>SEOUL</span>
                <Image
                  alt={`${bankruptcyLawyer.name} ${bankruptcyLawyer.role}`}
                  height={bankruptcyLawyer.imageHeight}
                  priority
                  sizes="(max-width: 700px) 72vw, 360px"
                  src={bankruptcyLawyer.imageUrl}
                  width={bankruptcyLawyer.imageWidth}
                />
              </div>
              <div className="people-featured-copy">
                <div className="people-lawyer-heading">
                  <div>
                    <span>{bankruptcyLawyer.bankruptcyRole}</span>
                    <h3>
                      {bankruptcyLawyer.name}
                      <small>{bankruptcyLawyer.role}</small>
                    </h3>
                    <p>{bankruptcyLawyer.englishName}</p>
                  </div>
                  <span className="people-office-badge">
                    {bankruptcyLawyer.office} 사무소
                  </span>
                </div>

                <div className="people-specialty-row">
                  <VerificationIcon />
                  <div>
                    <span>대한변호사협회 등록 전문분야</span>
                    <strong>
                      {bankruptcyLawyer.registeredSpecialties.join(" · ")}
                    </strong>
                  </div>
                </div>

                <p className="people-lawyer-introduction">
                  {bankruptcyLawyer.introduction}
                </p>
                <LawyerFacts lawyer={bankruptcyLawyer} />

                <a
                  className="people-verification-link"
                  href={bankruptcyLawyer.profileUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  대한변협 공식 프로필에서 확인
                  <ArrowIcon />
                </a>
              </div>
            </article>
          </div>
        </section>

        <section className="people-lawyers" id="lawyers" aria-labelledby="lawyers-title">
          <div className="shell">
            <div className="people-section-heading">
              <div>
                <p className="eyebrow">LAWYERS BY OFFICE</p>
                <h2 id="lawyers-title">
                  세 지역의 변호사를
                  <br />
                  확인할 수 있습니다.
                </h2>
              </div>
              <p>
                전문분야는 대한변호사협회에 등록된 항목만 별도로 표시하고,
                일반 취급 분야와 구분합니다. 개인 연락처 대신 공식 사무소
                채널로 연락을 받습니다.
              </p>
            </div>

            <div className="people-lawyer-grid">
              {lawyers.slice(1).map((lawyer) => (
                <article className="people-lawyer-card" key={lawyer.name}>
                  <div className="people-lawyer-photo">
                    <Image
                      alt={`${lawyer.name} ${lawyer.role}`}
                      height={lawyer.imageHeight}
                      sizes="(max-width: 700px) 82vw, (max-width: 1100px) 42vw, 360px"
                      src={lawyer.imageUrl}
                      width={lawyer.imageWidth}
                    />
                    <span>{lawyer.office}</span>
                  </div>
                  <div className="people-lawyer-card-copy">
                    <header>
                      <div>
                        <h3>{lawyer.name}</h3>
                        <span>{lawyer.role}</span>
                      </div>
                      <small>{lawyer.englishName}</small>
                    </header>

                    {lawyer.registeredSpecialties.length > 0 ? (
                      <div className="people-card-specialty">
                        <VerificationIcon />
                        <span>
                          대한변협 등록{" "}
                          <strong>
                            {lawyer.registeredSpecialties.join(" · ")}
                          </strong>{" "}
                          전문
                        </span>
                      </div>
                    ) : (
                      <div className="people-card-specialty people-card-specialty-muted">
                        <span>대한변협 공개 프로필 취급 분야 기준</span>
                      </div>
                    )}

                    <p>{lawyer.introduction}</p>

                    {lawyer.publicCareer ? (
                      <ul className="people-public-career">
                        {lawyer.publicCareer.map((career) => (
                          <li key={career}>{career}</li>
                        ))}
                      </ul>
                    ) : null}

                    <LawyerFacts lawyer={lawyer} />
                    <div className="people-practice-areas">
                      <span>주요 취급 분야</span>
                      <ul>
                        {lawyer.practiceAreas.map((area) => (
                          <li key={area}>{area}</li>
                        ))}
                      </ul>
                    </div>
                    <a
                      className="people-verification-link"
                      href={lawyer.profileUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      대한변협 공식 프로필
                      <ArrowIcon />
                    </a>
                  </div>
                </article>
              ))}
            </div>

            <p className="people-verification-note">
              <VerificationIcon />
              변호사등록번호·자격·전문분야는{" "}
              <strong>{LAWYER_PROFILE_VERIFIED_DATE_LABEL}</strong> 대한변호사협회
              공개정보를 기준으로 확인했습니다. 공개 범위가 제한된 항목은 로앤의
              현행 소속 정보와 교차 확인했으며, 생년·개인 전화번호·개인 이메일은
              게시하지 않습니다.
            </p>
          </div>
        </section>

        <section className="people-staff" id="staff-directory" aria-labelledby="staff-title">
          <div className="shell">
            <div className="people-section-heading people-staff-heading">
              <div>
                <p className="eyebrow">THE PEOPLE AROUND THE LAWYERS</p>
                <h2 id="staff-title">
                  상담과 사건을
                  <br />
                  매일 이어가는 사람들입니다.
                </h2>
              </div>
              <p>
                현재 재직 정보와 제공된 원본 사진이 함께 확인되는 구성원만
                공개합니다. 개인 연락처 대신 각 사무소의 공식 채널을 통해
                연결되며, 업무의 경계는 변호사의 지휘와 검토 안에서 지켜집니다.
              </p>
            </div>

            <nav className="people-office-jump" aria-label="사무소 바로가기">
              {officeOrder.map((office) => (
                <a href={`#office-${office}`} key={office}>
                  <span>{office}</span>
                  <strong>{staffMembers.filter((member) => member.office === office).length}</strong>
                  <small>명</small>
                  <ArrowIcon />
                </a>
              ))}
            </nav>

            <div className="people-staff-list">
              {officeOrder.map((office, officeIndex) => {
                const officeMembers = staffMembers.filter(
                  (member) => member.office === office,
                );

                return (
                  <section className="people-office-team" id={`office-${office}`} key={office}>
                    <header className="people-office-team-heading">
                      <div>
                        <span>0{officeIndex + 1}</span>
                        <h3>{office} 오피스</h3>
                      </div>
              <p>{officeDescriptions[office]}</p>
                    </header>

                    {teamOrder.map((team) => {
                      const members = officeMembers.filter((member) => member.team === team);
                      if (members.length === 0) return null;

                      return (
                        <div className="people-staff-team" key={team}>
                          <div className="people-staff-team-heading">
                            <div>
                              <span>{team}</span>
                              <small>{teamDescriptions[team]}</small>
                            </div>
                            <strong>{members.length}명</strong>
                          </div>
                          <div className="people-staff-grid">
                            {members.map((member) => (
                              <article className="people-staff-card" key={member.id}>
                                <div className="people-staff-photo">
                                  <span aria-hidden="true" />
                                  <Image
                                    alt={`${member.name} ${teamPublicRoles[member.team]}`}
                                    height={member.imageHeight}
                                    loading="lazy"
                                    sizes="(max-width: 700px) 42vw, (max-width: 1100px) 22vw, 190px"
                                    src={member.imageUrl}
                                    width={member.imageWidth}
                                  />
                                </div>
                                <div className="people-staff-card-copy">
                                  <div>
                                    <h4>{member.name}</h4>
                                    <span>{teamPublicRoles[member.team]}</span>
                                  </div>
                                  <p>{teamDescriptions[member.team]}</p>
                                  <ul className="people-staff-tags" aria-label={`${member.name} 특징`}>
                                    {getStaffTags(member.id).map((tag) => (
                                      <li key={tag}>{tag}</li>
                                    ))}
                                  </ul>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </div>
        </section>

        <section
          className="people-workflow"
          id="how-we-work"
          aria-labelledby="workflow-title"
        >
          <div className="shell">
            <div className="people-workflow-intro">
              <p className="eyebrow">HOW THE TEAM WORKS</p>
              <h2 id="workflow-title">
                담당자는 바뀔 수 있어도,
                <br />
                확인 없이 다음 단계로
                <br />
                넘어가지는 않습니다.
              </h2>
              <p>
                상담부터 제출 이후까지 한 사람이 모든 일을 맡는 구조가 아닙니다.
                단계에 맞는 팀이 배정되고, 법률 판단과 제출 전에는 변호사와
                의뢰인의 확인이 이어집니다.
              </p>
            </div>

            <ol className="people-workflow-list">
              {workStages.map((stage) => (
                <li key={stage.number}>
                  <div className="people-workflow-number">{stage.number}</div>
                  <article>
                    <span>{stage.owner}</span>
                    <h3>{stage.title}</h3>
                    <p>{stage.description}</p>
                    <div>
                      <CheckIcon />
                      <p>{stage.boundary}</p>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="people-responsibility">
          <div className="shell people-responsibility-grid">
            <div>
              <p className="eyebrow">CLEAR RESPONSIBILITY</p>
              <h2>
                역할을 나눈다는 것은
                <br />
                책임을 흐리는 일이 아닙니다.
              </h2>
            </div>
            <div className="people-responsibility-cards">
              <article>
                <span>법률컨설팅팀</span>
                <h3>처음 들은 이야기를 사건 정보로 정리합니다.</h3>
                <p>
                  최초 상담, 정보 확인, 진행 방향 설명, 서류 발급 지원과
                  부채증명서 발급 의뢰를 담당합니다. 법률적 결론은 변호사가
                  검토합니다.
                </p>
              </article>
              <article>
                <span>사건관리팀</span>
                <h3>모인 자료를 제출 가능한 초안으로 준비합니다.</h3>
                <p>
                  변호사의 지휘 아래 신청서와 보정서 초안을 작성하고, 누락 자료와
                  사실관계를 의뢰인에게 안내·확인합니다.
                </p>
              </article>
              <article>
                <span>담당변호사</span>
                <h3>법률 판단과 제출 내용의 검토를 책임집니다.</h3>
                <p>
                  제도 적용, 사건의 쟁점, 신청서·보정서에 담길 내용과 법원 대응
                  방향을 검토합니다.
                </p>
              </article>
              <article>
                <span>의뢰인</span>
                <h3>본인의 사실과 제출 내용을 마지막으로 확인합니다.</h3>
                <p>
                  신청서에 적힌 채무·재산·소득과 생활 상황이 사실과 맞는지
                  확인하고, 추가 자료가 필요한 경우 함께 보완합니다.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="people-office-scenes" aria-labelledby="office-scenes-title">
          <div className="shell people-office-scenes-grid">
            <div className="people-office-scenes-copy">
              <p className="eyebrow">THREE OFFICES</p>
              <h2 id="office-scenes-title">
                온라인에서 시작해도,
                <br />
                실제 사무소와 공식 연락처로
                <br />
                이어집니다.
              </h2>
              <p>
                로앤은 서울·대전·부산 사무소를 운영합니다. 방문이 필요한 경우
                배정된 담당자와 일정을 확인한 뒤 안내받은 사무소로 오시면 됩니다.
              </p>
              <a className="people-verification-link" href="/about#offices">
                사무소 주소와 연락처 확인
                <ArrowIcon />
              </a>
            </div>
            <div className="people-office-image-grid">
              <figure>
                <div
                  aria-label="법무법인 사무소 회의 공간 연출 이미지"
                  className="people-office-image people-office-image-meeting"
                  role="img"
                />
                <figcaption>회의 공간</figcaption>
              </figure>
              <figure>
                <div
                  aria-label="법무법인 사무소 응대 공간 연출 이미지"
                  className="people-office-image people-office-image-lounge"
                  role="img"
                />
                <figcaption>응대 공간</figcaption>
              </figure>
              <p>
                공간 연출 이미지 · 실제 방문 장소는 사무소 안내의 주소를
                확인해 주세요.
              </p>
            </div>
          </div>
        </section>

        <section className="people-disclosure">
          <div className="shell people-disclosure-grid">
            <div>
              <span className="people-disclosure-number">01</span>
              <p>실무진 공개 원칙</p>
            </div>
            <div>
              <h2>
                실명과 사진은
                <br />
                현재 소속과 공개 범위가
                <br />
                확인된 구성원부터 공개합니다.
              </h2>
              <p>
                고객에게 실제로 연락하고 사건을 관리하는 실무진의 공개는 신뢰에
                도움이 됩니다. 다만 오래된 조직도나 퇴사자의 사진이 남지 않도록
                현재 재직 정보와 제공된 공개 원본을 대조해 표시합니다. 개인
                연락처와 내부 계정 정보는 게시하지 않고 공식 연락 채널을
                사용합니다.
              </p>
              <ul>
                <li>변호사와 비변호사 실무진의 역할을 명확히 구분</li>
                <li>성명·사진·소속팀·담당 단계까지만 공개</li>
                <li>부서 이동이나 퇴사 시 즉시 갱신할 수 있는 정보만 게시</li>
              </ul>
            </div>
          </div>
        </section>

        <ConsultationSection
          title={
            <>
              어떤 담당자가 필요한지
              <br />
              먼저 정하지 않아도 됩니다.
            </>
          }
          body="현재 상황을 알려주시면 법률컨설팅팀이 필요한 정보를 먼저 정리합니다. 상담 내용에 따른 법률 판단과 회생·파산 사건의 제출 내용은 담당 변호사가 검토합니다."
        />
      </main>

      <SiteFooter />
      <MobileActions />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
      />
    </>
  );
}
