import Link from "next/link";
import { notFound } from "next/navigation";

import { getPhoneDeskCall } from "../../../lib/gateway";
import { requireStaff } from "../../../lib/session";
import { PhoneAftercareForm } from "../../_components/phone-aftercare-form";
import { StaffBar } from "../../_components/staff-bar";

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (/^\d{10}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatDate(value: string | null) {
  if (!value) return "확인되지 않음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
    hourCycle: "h23",
  }).format(new Date(value));
}

function durationLabel(seconds: number | null) {
  if (seconds === null) return "연결되지 않음";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}분 ${remainder}초` : `${remainder}초`;
}

export default async function PhoneDeskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  let detail;
  try {
    detail = await getPhoneDeskCall(id);
  } catch {
    notFound();
  }
  const call = detail.call;
  const customerName = call.clickToCall?.consultation?.displayName ??
    call.clickToCall?.directoryClient?.displayName ??
    (call.customerMatch?.source === "consultation"
      ? call.customerMatch.consultation.displayName
      : call.customerMatch?.source === "legal_friends"
        ? call.customerMatch.clientName
        : "발신자 정보 없음");

  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell phone-desk-detail-shell">
        <header className="erp-header phone-desk-detail-header">
          <div>
            <p className="eyebrow">TELEPHONE DESK</p>
            <h1>{formatPhone(call.remotePhone)}</h1>
            <p>{customerName} · 통화 원장과 후처리를 한 화면에서 관리합니다.</p>
          </div>
          <Link className="secondary-button phone-desk-back-link" href="/phone-desk">
            전화데스크 목록
          </Link>
        </header>

        <section className="phone-desk-detail-summary">
          <div>
            <span>구분</span>
            <strong>{call.direction === "inbound" ? "수신전화" : call.source === "click_to_call" ? "ERP 발신" : "센트릭스 직접 발신"}</strong>
          </div>
          <div>
            <span>통화 상태</span>
            <strong>{call.state === "ended" ? "통화 종료" : call.state === "connected" ? "통화 중" : "처리 중"}</strong>
          </div>
          <div>
            <span>통화 시간</span>
            <strong>{durationLabel(call.durationSeconds)}</strong>
          </div>
          <div>
            <span>시작 일시</span>
            <strong>{formatDate(call.occurredAt)}</strong>
          </div>
          <div>
            <span>회선</span>
            <strong>{call.endpoint.label} · 내선 {call.endpoint.extension}</strong>
          </div>
          <div>
            <span>회선 담당</span>
            <strong>{call.endpointOwners.map((owner) => owner.displayName).join(" · ") || "미지정"}</strong>
          </div>
        </section>

        {call.state === "ended" ? (
          <section className="phone-desk-aftercare-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">AFTERCARE</p>
                <h2>통화 후처리</h2>
              </div>
              {call.aftercare ? (
                <span className="count-badge">저장됨 · 수정 가능</span>
              ) : (
                <span className="count-badge attention">입력 필요</span>
              )}
            </div>
            <PhoneAftercareForm detail={detail} returnTo="/phone-desk" />
          </section>
        ) : (
          <p className="info-banner">통화가 종료되면 후처리 입력이 열립니다.</p>
        )}
      </main>
    </>
  );
}
