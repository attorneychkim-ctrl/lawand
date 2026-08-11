import {
  getConsultations,
  type ConsultationListSnapshot,
} from "../lib/gateway";
import { requireStaff } from "../lib/session";
import { ConsultationWorkspace } from "./_components/consultation-workspace";
import { StaffBar } from "./_components/staff-bar";

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

export default async function ErpHome() {
  const staff = await requireStaff();
  let snapshot: ConsultationListSnapshot = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    pageCount: 1,
    summary: { all: 0, waiting: 0, mine: 0, attention: 0, today: 0 },
  };
  let loadError = "";
  try {
    snapshot = await getConsultations();
  } catch {
    loadError =
      "게이트웨이에 연결하지 못했습니다. 로컬 3022 서버 상태를 확인해 주세요.";
  }

  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell">
        <header className="erp-header">
          <div>
            <p className="eyebrow">CONSULTATION DESK</p>
            <h1>상담 데스크</h1>
            <p>
              새 요청을 확인하고 담당 배정부터 외부 연동까지 한 흐름으로 처리합니다.
            </p>
          </div>
          <p className="header-context">
            최신 요청순 <strong>날짜·페이지별 조회</strong>
          </p>
        </header>

        {loadError ? (
          <p className="error-banner" role="alert">
            {loadError}
          </p>
        ) : null}

        {!loadError ? (
          <ConsultationWorkspace
            initialSnapshot={snapshot}
            key={snapshot.items
              .map(
                (item) =>
                  `${item.id}:${item.lastRequestedAt}:${item.state}:${item.assigneeUserId ?? ""}`,
              )
              .join("|")}
            todayKey={koreanTodayKey()}
          />
        ) : null}

        <p className="security-note">
          상담 목록과 개인정보 상세 조회는 직원 계정 기준으로 감사 기록에 남습니다.
        </p>
      </main>
    </>
  );
}
