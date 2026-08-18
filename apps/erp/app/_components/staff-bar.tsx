import Link from "next/link";

import type { StaffPrincipal } from "../../lib/staff-auth";
import { logoutAction } from "../auth-actions";
import { BrowserNotificationToggle } from "./browser-notification-toggle";
import { ErpNav } from "./erp-nav";
import { InboundCallIndicator } from "./inbound-call-indicator";
import { LawandOsBrand } from "./lawand-os-brand";
import { ReviewNotificationBridge } from "./review-notification-bridge";
import { MessageNotificationBridge } from "./message-notification-bridge";
import { ThemeToggle } from "./theme-toggle";

export function StaffBar({ staff }: { staff: StaffPrincipal }) {
  return (
    <header className="app-header">
      <div className="staff-bar">
        <div className="staff-bar-leading">
          <Link aria-label="LAW& OS 상담 홈" className="staff-brand" href="/">
            <LawandOsBrand />
          </Link>
          <ErpNav showStaff={staff.roles.includes("admin")} />
        </div>
        <div className="staff-actions">
          <BrowserNotificationToggle />
          <ThemeToggle />
          <Link
            aria-label="내 정보 열기"
            className="staff-identity"
            href="/profile"
          >
            <span aria-hidden="true" className="staff-avatar">
              {staff.displayName.slice(0, 1)}
            </span>
            <span className="staff-identity-copy">
              <strong>{staff.displayName}</strong>
              <small>
                {staff.primaryMembership.region.name} · {staff.primaryMembership.department}
              </small>
            </span>
          </Link>
          <form action={logoutAction}>
            <button className="text-button" type="submit">
              로그아웃
            </button>
          </form>
        </div>
      </div>
      <InboundCallIndicator
        staffDisplayName={staff.displayName}
        staffUserId={staff.id}
      />
      <ReviewNotificationBridge />
      <MessageNotificationBridge />
    </header>
  );
}
