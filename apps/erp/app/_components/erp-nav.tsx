"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { subscribeReviewRealtime } from "./review-realtime";

function NavIcon({ kind }: { kind: "consultations" | "clients" | "reviews" | "phone" | "messages" | "staff" }) {
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
  const [reviewDutyCount, setReviewDutyCount] = useState(0);
  const consultationActive = pathname === "/" || pathname.startsWith("/consultations/");

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
