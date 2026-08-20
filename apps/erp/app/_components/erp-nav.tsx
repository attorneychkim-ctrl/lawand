"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { subscribeReviewRealtime } from "./review-realtime";
import { subscribeMessageRealtime } from "./message-realtime";

function NavIcon({ kind }: { kind: "consultations" | "clients" | "reviews" | "phone" | "phonebook" | "messages" | "staff" | "desktop" | "more" | "manage" }) {
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
  ) : kind === "reviews" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M7.5 9h9M7.5 13h6M17 19l1.2 1.2L21 17.4" />
    </svg>
  ) : kind === "phone" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7.8 3.8 10 8.5 7.5 10a14.3 14.3 0 0 0 6.5 6.5l1.5-2.5 4.7 2.2v3a1.8 1.8 0 0 1-1.8 1.8A15.4 15.4 0 0 1 3 5.6a1.8 1.8 0 0 1 1.8-1.8h3Z" />
    </svg>
  ) : kind === "phonebook" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 3.5h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
      <path d="M8 8h8M8 12h8M8 16h5M4 7h2M4 12h2M4 17h2" />
    </svg>
  ) : kind === "messages" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M7 9h10M7 13h7" />
    </svg>
  ) : kind === "staff" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5v-2a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5v2M16 6.5h4M18 4.5v4M16.5 13.5a4.5 4.5 0 0 1 4 4.5v1.5" />
    </svg>
  ) : kind === "desktop" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="13" rx="2" width="18" x="3" y="4" />
      <path d="M8 21h8M12 17v4M16.5 7.5a2.5 2.5 0 0 1 2.5 2.5v1.5l1 1.5h-7l1-1.5V10a2.5 2.5 0 0 1 2.5-2.5Z" />
    </svg>
  ) : kind === "manage" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 13.5v-3l-2.1-.7a7 7 0 0 0-.6-1.4l1-2-2.1-2.1-2 1a7 7 0 0 0-1.4-.6L11 2.5H8l-.7 2.2a7 7 0 0 0-1.4.6l-2-1-2.1 2.1 1 2a7 7 0 0 0-.6 1.4L0 10.5v3l2.2.7a7 7 0 0 0 .6 1.4l-1 2 2.1 2.1 2-1a7 7 0 0 0 1.4.6l.7 2.2h3l.7-2.2a7 7 0 0 0 1.4-.6l2 1 2.1-2.1-1-2a7 7 0 0 0 .6-1.4Z" transform="translate(1.5 0) scale(.9)" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </svg>
  );
}

function NavDisclosure({
  active,
  children,
  icon,
  label,
  pathname,
}: {
  active: boolean;
  children: React.ReactNode;
  icon: "more" | "manage";
  label: string;
  pathname: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const closeFromOutside = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
        detailsRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, []);

  return (
    <details className={`staff-nav-disclosure${active ? " is-active" : ""}`} ref={detailsRef}>
      <summary aria-current={active ? "page" : undefined}>
        <NavIcon kind={icon} />
        <span>{label}</span>
        <svg aria-hidden="true" className="staff-nav-chevron" viewBox="0 0 12 12">
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </summary>
      <div className="staff-nav-menu">{children}</div>
    </details>
  );
}

export function ErpNav({ showStaff }: { showStaff: boolean }) {
  const pathname = usePathname();
  const [reviewDutyCount, setReviewDutyCount] = useState(0);
  const [messageDutyCount, setMessageDutyCount] = useState(0);
  const consultationActive = pathname === "/" || pathname.startsWith("/consultations/");
  const phonebookActive = pathname.startsWith("/phonebook");
  const staffActive = pathname.startsWith("/staff");
  const desktopNotificationsActive = pathname.startsWith("/desktop-notifications");
  const manageActive = staffActive || desktopNotificationsActive;

  const refreshReviewDutyCount = useCallback(async () => {
    try {
      const response = await fetch("/api/reviews/duty-count", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as {
        count?: unknown;
      } | null;
      if (response.ok && typeof body?.count === "number") {
        setReviewDutyCount(body.count);
      }
    } catch {
      // 배지는 다음 실시간 이벤트나 화면 이동 때 다시 동기화한다.
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshReviewDutyCount();
    });
    return subscribeReviewRealtime((message) => {
      if (message.kind === "sync" || message.kind === "changed") {
        void refreshReviewDutyCount();
      }
    });
  }, [refreshReviewDutyCount]);

  const refreshMessageDutyCount = useCallback(async () => {
    try {
      const response = await fetch("/api/messages/duty-count", { cache: "no-store" });
      const body = await response.json() as { count?: unknown };
      if (response.ok && typeof body.count === "number") setMessageDutyCount(body.count);
    } catch { /* 다음 실시간 이벤트나 화면 이동 때 다시 동기화한다. */ }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void refreshMessageDutyCount(); });
    const unsubscribe = subscribeMessageRealtime((message) => {
      if (message.kind === "sync" || message.kind === "changed") void refreshMessageDutyCount();
    });
    const refresh = () => { void refreshMessageDutyCount(); };
    window.addEventListener("lawand:message-read", refresh);
    return () => { unsubscribe(); window.removeEventListener("lawand:message-read", refresh); };
  }, [pathname, refreshMessageDutyCount]);

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
        aria-current={pathname.startsWith("/reviews") ? "page" : undefined}
        className={pathname.startsWith("/reviews") ? "is-active" : undefined}
        href="/reviews"
      >
        <NavIcon kind="reviews" />
        <span>후기</span>
        {reviewDutyCount > 0 ? (
          <span
            aria-label={`내 담당 답글 필요 ${reviewDutyCount}건`}
            className="nav-count-badge"
          >
            {reviewDutyCount > 99 ? "99+" : reviewDutyCount}
          </span>
        ) : null}
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
        aria-current={pathname.startsWith("/messages") ? "page" : undefined}
        className={pathname.startsWith("/messages") ? "is-active" : undefined}
        href="/messages"
      >
        <NavIcon kind="messages" />
        <span>문자</span>
        {messageDutyCount > 0 ? <span aria-label={`읽지 않은 문자 ${messageDutyCount}건`} className="nav-count-badge">
          {messageDutyCount > 99 ? "99+" : messageDutyCount}
        </span> : null}
      </Link>
      <NavDisclosure active={phonebookActive} icon="more" label="더보기" pathname={pathname}>
        <Link aria-current={phonebookActive ? "page" : undefined} className={phonebookActive ? "is-active" : undefined} href="/phonebook">
          <NavIcon kind="phonebook" />
          <span>전화번호부</span>
        </Link>
      </NavDisclosure>
      {showStaff ? (
        <NavDisclosure active={manageActive} icon="manage" label="관리" pathname={pathname}>
          <Link
            aria-current={desktopNotificationsActive ? "page" : undefined}
            className={desktopNotificationsActive ? "is-active" : undefined}
            href="/desktop-notifications"
          >
            <NavIcon kind="desktop" />
            <span>PC 알림 설정</span>
          </Link>
          <Link aria-current={staffActive ? "page" : undefined} className={staffActive ? "is-active" : undefined} href="/staff">
            <NavIcon kind="staff" />
            <span>직원 관리</span>
          </Link>
        </NavDisclosure>
      ) : null}
    </nav>
  );
}
