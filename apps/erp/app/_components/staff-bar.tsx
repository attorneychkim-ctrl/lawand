import Link from "next/link";

import type { StaffPrincipal } from "../../lib/staff-auth";
import { logoutAction } from "../auth-actions";
import { ErpNav } from "./erp-nav";
import { InboundCallIndicator } from "./inbound-call-indicator";
import { ThemeToggle } from "./theme-toggle";

export function StaffBar({ staff }: { staff: StaffPrincipal }) {
  return (
    <header className="app-header">
      <div className="staff-bar">
        <div className="staff-bar-leading">
          <Link aria-label="로앤 ERP 상담 홈" className="staff-brand" href="/">
            <span className="staff-brand-mark">LAW<span>&amp;</span></span>
            <span className="staff-brand-product">ERP</span>
          </Link>
          <ErpNav showStaff={staff.roles.includes("admin")} />
        </div>
        <div className="staff-actions">
          <ThemeToggle />
          <div className="staff-identity">
            <span aria-hidden="true" className="staff-avatar">
              {staff.displayName.slice(0, 1)}
            </span>
            <span className="staff-identity-copy">
              <strong>{staff.displayName}</strong>
              <small>
                {staff.primaryMembership.region.name} · {staff.primaryMembership.department}
              </small>
            </span>
          </div>
          <form action={logoutAction}>
            <button className="text-button" type="submit">
              로그아웃
            </button>
          </form>
        </div>
      </div>
      <InboundCallIndicator staffUserId={staff.id} />
    </header>
  );
}
