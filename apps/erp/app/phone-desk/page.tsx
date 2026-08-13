import type { PhoneDeskCallSnapshot } from "../../lib/gateway";
import { requireStaff } from "../../lib/session";
import { PhoneDeskWorkspace } from "../_components/phone-desk-workspace";
import { StaffBar } from "../_components/staff-bar";

const emptySnapshot: PhoneDeskCallSnapshot = {
  snapshotAt: "1970-01-01T00:00:00.000Z",
  items: [],
  assigneeOptions: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
  summary: {
    all: 0,
    inbound: 0,
    clickToCall: 0,
    centrexDirect: 0,
    internal: 0,
    active: 0,
  },
  followUps: [],
};

function koreanTodayKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function PhoneDeskPage() {
  const staff = await requireStaff();

  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell phone-desk-shell">
        <header className="erp-header">
          <div>
            <p className="eyebrow">TELEPHONE DESK</p>
            <h1>전화데스크</h1>
            <p>
              필요한 전화만 고객명·전화번호와 기간으로 찾아 확인합니다.
            </p>
          </div>
          <p className="header-context">
            최초 진입 <strong>통화 원장 조회 없음</strong>
          </p>
        </header>

        <PhoneDeskWorkspace
          currentStaff={{
            staffUserId: staff.id,
            displayName: staff.displayName,
          }}
          initialSnapshot={emptySnapshot}
          todayKey={koreanTodayKey()}
        />

        <p className="security-note">
          전체 전화번호와 고객 연결 정보는 인증된 직원 화면에서만 조회됩니다.
        </p>
      </main>
    </>
  );
}
