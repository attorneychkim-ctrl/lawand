"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavIcon({ kind }: { kind: "consultations" | "clients" | "phone" | "messages" | "staff" }) {
  return kind === "consultations" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7.5 6.5h9M7.5 10.5h9M7.5 14.5h5" />
      <path d="M5.5 3.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-8l-4.5 3v-3h-.5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
    </svg>
  ) : kind === "clients" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5v-2A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5v2M15.5 5.5h5M18 3v5M16 11.5h4.5M16 15h4.5" />
    </svg>
  ) : kind === "phone" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7.8 3.8 10 8.5 7.5 10a14.3 14.3 0 0 0 6.5 6.5l1.5-2.5 4.7 2.2v3a1.8 1.8 0 0 1-1.8 1.8A15.4 15.4 0 0 1 3 5.6a1.8 1.8 0 0 1 1.8-1.8h3Z" />
    </svg>
  ) : kind === "messages" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M7 9h10M7 13h7" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5v-2a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5v2M16 6.5h4M18 4.5v4M16.5 13.5a4.5 4.5 0 0 1 4 4.5v1.5" />
    </svg>
  );
}

export function ErpNav({ showStaff }: { showStaff: boolean }) {
  const pathname = usePathname();
  const consultationActive = pathname === "/" || pathname.startsWith("/consultations/");

  return (
    <nav aria-label="ERP 주요 메뉴" className="staff-primary-nav">
      <Link
        aria-current={consultationActive ? "page" : undefined}
        className={consultationActive ? "is-active" : undefined}
        href="/"
      >
        <NavIcon kind="consultations" />
        <span>상담</span>
      </Link>
      <Link
        aria-current={pathname.startsWith("/clients") ? "page" : undefined}
        className={pathname.startsWith("/clients") ? "is-active" : undefined}
        href="/clients"
      >
        <NavIcon kind="clients" />
        <span>고객 찾기</span>
      </Link>
      <Link
        aria-current={pathname.startsWith("/phone-desk") ? "page" : undefined}
        className={pathname.startsWith("/phone-desk") ? "is-active" : undefined}
        href="/phone-desk"
      >
        <NavIcon kind="phone" />
        <span>전화</span>
      </Link>
      <Link
        aria-current={pathname.startsWith("/message-templates") ? "page" : undefined}
        className={pathname.startsWith("/message-templates") ? "is-active" : undefined}
        href="/message-templates"
      >
        <NavIcon kind="messages" />
        <span>문자</span>
      </Link>
      {showStaff ? (
        <Link
          aria-current={pathname.startsWith("/staff") ? "page" : undefined}
          className={pathname.startsWith("/staff") ? "is-active" : undefined}
          href="/staff"
        >
          <NavIcon kind="staff" />
          <span>직원 관리</span>
        </Link>
      ) : null}
    </nav>
  );
}
