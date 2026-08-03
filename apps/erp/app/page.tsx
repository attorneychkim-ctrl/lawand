import Link from "next/link";

import {
  getConsultations,
  type ConsultationListItem,
} from "../lib/gateway";
import { requireStaff } from "../lib/session";
import { ClaimConsultationButton } from "./_components/claim-consultation-button";
import { StaffBar } from "./_components/staff-bar";

const stateLabels: Record<string, string> = {
  requested: "신규 접수",
  assigned: "담당 배정",
  contacted: "연락 완료",
  completed: "상담 완료",
  engaged: "계약",
  closed: "종결",
};

const dedupeLabels: Record<ConsultationListItem["dedupeOutcome"], string> = {
  new: "신규",
  exact_duplicate: "동일 내용 재접수",
  identity_enrichment: "익명→실명 보강",
  suspected_duplicate: "7일 내 중복 의심",
};

const residenceRegionLabels: Record<string, string> = {
  seoul: "서울",
  busan: "부산",
  daegu: "대구",
  incheon: "인천",
  gwangju: "광주",
  daejeon: "대전",
  ulsan: "울산",
  sejong: "세종",
  gyeonggi: "경기",
  gangwon: "강원",
  chungbuk: "충북",
  chungnam: "충남",
  jeonbuk: "전북",
  jeonnam: "전남",
  gyeongbuk: "경북",
  gyeongnam: "경남",
  jeju: "제주",
  overseas_or_other: "해외·기타",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatPhone(value: string) {
  return value.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
}

export default async function ErpHome() {
  const staff = await requireStaff();
  let consultations: ConsultationListItem[] = [];
  let loadError = "";
  try {
    consultations = await getConsultations();
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
          <p className="eyebrow">LAWAND ERP · 상담 원장</p>
          <h1>상담 요청</h1>
          <p>
            홈페이지·카카오 채널·네이버 예약의 요청과 처리 상태를 확인합니다.
          </p>
        </div>
        <div className="header-metric">
          <span>현재 목록</span>
          <strong>{consultations.length}</strong>
        </div>
      </header>

      <section className="erp-panel" aria-labelledby="consultation-list-title">
        <div className="panel-heading">
          <div>
            <h2 id="consultation-list-title">최근 접수</h2>
            <p>최신 요청 시각 순 · 최대 50건</p>
          </div>
          <span className="local-badge">LOCAL 3021</span>
        </div>

        {loadError ? (
          <p className="error-banner" role="alert">
            {loadError}
          </p>
        ) : null}

        {!loadError && consultations.length === 0 ? (
          <div className="empty-state">
            <strong>아직 접수된 상담이 없습니다.</strong>
            <p>
              홈페이지·카카오 채널·네이버 예약에서 요청하면 바로 나타납니다.
            </p>
          </div>
        ) : null}

        {consultations.length > 0 ? (
          <div className="consultation-list">
            {consultations.map((consultation) => (
              <article
                className="consultation-row"
                key={consultation.id}
              >
                <Link
                  className="consultation-row-link"
                  href={`/consultations/${consultation.id}`}
                >
                  <div className="row-primary">
                    <span className="state-badge">
                      {stateLabels[consultation.state] ?? consultation.state}
                    </span>
                    <strong>{consultation.displayName}</strong>
                    <span>
                      {consultation.phone
                        ? formatPhone(consultation.phone)
                        : "010-0000-0000 · 미수집"}
                    </span>
                    {consultation.contactChannel === "kakao_channel" ? (
                      <span className="assignee-label">카카오 채널</span>
                    ) : null}
                    {consultation.contactChannel === "naver_booking" ? (
                      <span className="assignee-label">네이버 예약</span>
                    ) : null}
                    {consultation.kakaoEntry ? (
                      <span
                        className={`kakao-entry-status is-${consultation.kakaoEntry.status}`}
                      >
                        {consultation.kakaoEntry.status === "pending"
                          ? "채팅 확인 대기"
                          : consultation.kakaoEntry.status === "confirmed"
                            ? "채팅 확인"
                            : "미진입·무효"}
                      </span>
                    ) : null}
                    {consultation.naverBooking ? (
                      <span
                        className={`kakao-entry-status is-${consultation.naverBooking.status}`}
                      >
                        {consultation.naverBooking.status === "details_pending"
                          ? "상세 확인 필요"
                          : consultation.naverBooking.status === "ready"
                            ? "상세정보 반영"
                            : "예약 취소"}
                      </span>
                    ) : null}
                    {consultation.assigneeDisplayName ? (
                      <span className="assignee-label">
                        담당 {consultation.assigneeDisplayName}
                      </span>
                    ) : null}
                  </div>
                  <div className="row-secondary">
                    <span>{consultation.publicReceiptCode}</span>
                    <span>
                      {consultation.mode === "detailed" ? "상세" : "빠른"} 요청
                    </span>
                    <span>
                      {consultation.residenceRegion
                        ? (residenceRegionLabels[
                            consultation.residenceRegion
                          ] ?? consultation.residenceRegion)
                        : "지역 미기록"}
                    </span>
                    <span
                      className={
                        consultation.dedupeOutcome === "suspected_duplicate"
                          ? "dedupe warning"
                          : "dedupe"
                      }
                    >
                      {dedupeLabels[consultation.dedupeOutcome]}
                    </span>
                    {consultation.requestCount > 1 ? (
                      <span>요청 {consultation.requestCount}회</span>
                    ) : null}
                    {consultation.kakaoEntry?.clickCount &&
                    consultation.kakaoEntry.clickCount > 1 ? (
                      <span>
                        카카오 버튼 {consultation.kakaoEntry.clickCount}회
                      </span>
                    ) : null}
                    {consultation.naverBooking ? (
                      <span>
                        예약 {formatDate(consultation.naverBooking.scheduledAt)}
                      </span>
                    ) : null}
                    <time dateTime={consultation.lastRequestedAt}>
                      {formatDate(consultation.lastRequestedAt)}
                    </time>
                  </div>
                </Link>
                {consultation.state === "requested" &&
                consultation.kakaoEntry?.status !== "pending" ? (
                  <ClaimConsultationButton
                    compact
                    consultationId={consultation.id}
                  />
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <p className="security-note">
        직원 계정과 역할에 따라 접근하며 상담 목록·상세 조회는 감사 기록에 남습니다.
        현재 환경은 로컬 개발용입니다.
      </p>
      </main>
    </>
  );
}
