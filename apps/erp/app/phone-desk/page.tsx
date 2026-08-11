import {
  getPhoneDeskCalls,
  type PhoneDeskCallSnapshot,
} from "../../lib/gateway";
import { requireStaff } from "../../lib/session";
import { PhoneDeskWorkspace } from "../_components/phone-desk-workspace";
import { StaffBar } from "../_components/staff-bar";

const emptySnapshot: PhoneDeskCallSnapshot = {
  snapshotAt: "1970-01-01T00:00:00.000Z",
  items: [],
  followUps: [],
};

export default async function PhoneDeskPage() {
  const staff = await requireStaff();
  let snapshot = emptySnapshot;
  let loadError = "";
  try {
    snapshot = await getPhoneDeskCalls();
  } catch {
    loadError = "전화 원장을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell phone-desk-shell">
        <header className="erp-header">
          <div>
            <p className="eyebrow">TELEPHONE DESK</p>
            <h1>전화데스크</h1>
            <p>
              고객 수신전화와 ERP·센트릭스 발신을 한 목록에서 확인합니다.
            </p>
          </div>
          <p className="header-context">
            최신 통화순 <strong>최대 100건</strong>
          </p>
        </header>

        {loadError ? (
          <p className="error-banner" role="alert">
            {loadError}
          </p>
        ) : (
          <PhoneDeskWorkspace
            currentStaff={{
              staffUserId: staff.id,
              displayName: staff.displayName,
            }}
            initialSnapshot={snapshot}
          />
        )}

        <p className="security-note">
          전체 전화번호와 고객 연결 정보는 인증된 직원 화면에서만 조회됩니다.
        </p>
      </main>
    </>
  );
}
