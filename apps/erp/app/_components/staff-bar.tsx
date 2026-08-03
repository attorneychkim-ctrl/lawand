import Link from "next/link";

import type { StaffPrincipal } from "../../lib/staff-auth";
import { logoutAction } from "../auth-actions";

export function StaffBar({ staff }: { staff: StaffPrincipal }) {
  return (
    <nav aria-label="직원 메뉴" className="staff-bar">
      <Link className="staff-brand" href="/">
        LAWAND ERP
      </Link>
      <div className="staff-actions">
        {staff.roles.includes("admin") ? (
          <Link href="/staff">직원 초대</Link>
        ) : null}
        <span>
          <strong>{staff.displayName}</strong>
          {` · ${staff.primaryMembership.organization.name} ${staff.primaryMembership.region.name}`}
        </span>
        <form action={logoutAction}>
          <button className="text-button" type="submit">
            로그아웃
          </button>
        </form>
      </div>
    </nav>
  );
}
