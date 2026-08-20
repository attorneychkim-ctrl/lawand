import type { Metadata } from "next";
import Link from "next/link";

import { StaffBar } from "../_components/staff-bar";
import {
  getDesktopNotificationDevices,
  getDesktopNotificationPreferences,
} from "../../lib/gateway";
import { requireAdmin } from "../../lib/session";
import {
  DesktopNotificationConnection,
  type DesktopNotificationDevicePresentation,
} from "./desktop-notification-connection";
import {
  DesktopNotificationPreferences,
  type DesktopNotificationPreferenceGroup,
} from "./desktop-notification-preferences";

export const metadata: Metadata = {
  title: "PC 알림 설정",
};

const notificationGroups: DesktopNotificationPreferenceGroup[] = [
  {
    kind: "consultation",
    title: "상담",
    description: "신규 접수와 담당 상담의 중요한 변화를 구분합니다.",
    items: [
      {
        key: "consultation.unassigned",
        title: "새 상담 · 배정 전 재요청",
        description: "아직 담당자가 없는 새 접수와 반복 요청을 알립니다.",
        scope: "전체 직원 대상",
        available: true,
      },
      {
        key: "consultation.assigned_repeat",
        title: "내 담당 상담 재요청",
        description: "이미 내가 맡은 고객이 상담을 다시 요청하면 알립니다.",
        scope: "현재 담당자",
        available: true,
      },
      {
        key: "consultation.assignment",
        title: "새 담당자로 지정",
        description: "담당자 변경이 완료되어 상담이 나에게 넘어오면 알립니다.",
        scope: "새 담당자",
        available: true,
      },
    ],
  },
  {
    kind: "phone",
    title: "전화",
    description: "전사 대표전화와 나에게 직접 필요한 전화를 나눕니다.",
    items: [
      {
        key: "phone.targeted_inbound",
        title: "내 담당 고객 · 내 회선 수신",
        description: "내 고객이 전화하거나 내 센트릭스 회선이 울릴 때 알립니다.",
        scope: "담당자 · 회선 소유자",
        available: true,
      },
      {
        key: "phone.internal_transfer",
        title: "내선 · 호전환 · 복귀",
        description: "내선 전화가 오거나 고객 전화가 나에게 전달·복귀하면 알립니다.",
        scope: "실제 수신 직원",
        available: true,
      },
      {
        key: "phone.all_external",
        title: "모든 대표번호 외부 수신",
        description: "담당 여부와 관계없이 회사 대표번호로 오는 전화를 모두 알립니다.",
        scope: "전체 직원 대상",
        available: true,
      },
    ],
  },
  {
    kind: "message",
    title: "문자",
    description: "고객 회신의 실제 업무 담당자를 기준으로 알립니다.",
    items: [
      {
        key: "message.assigned_reply",
        title: "고객의 새 회신",
        description: "내가 최근 문자를 보냈거나 내가 맡은 상담 고객이 회신하면 알립니다.",
        scope: "최근 발송자 · 상담 담당자",
        available: true,
      },
      {
        key: "message.unmatched",
        title: "연결되지 않은 수신문자",
        description: "상담이나 최근 발송자를 찾지 못한 대표번호 문자를 알립니다.",
        scope: "관리자",
        available: true,
      },
    ],
  },
  {
    kind: "review",
    title: "후기",
    description: "연결된 사건의 답글 담당자에게 필요한 후기만 알립니다.",
    items: [
      {
        key: "review.assigned_new",
        title: "내 담당 고객의 새 후기",
        description: "내 사건에 연결된 후기가 등록되어 검수나 공식 답글이 필요하면 알립니다.",
        scope: "연결 사건 담당자",
        available: true,
      },
    ],
  },
];

const laterNotificationItems = [
  "재통화 일정 임박 · 기한 초과",
  "리걸프렌즈 · 알림톡 · 문자 발송 실패",
  "기프티콘 발송 결과 확인 필요",
  "센트릭스 회선 · 대표 수신함 연결 장애",
];

export default async function DesktopNotificationsPage() {
  const staff = await requireAdmin();
  const [devices, preferences] = await Promise.all([
    getDesktopNotificationDevices(),
    getDesktopNotificationPreferences(),
  ]);
  const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const devicePresentations: DesktopNotificationDevicePresentation[] =
    devices.map((device) => ({
      id: device.id,
      name: device.name,
      appVersion: device.appVersion,
      status: device.status,
      connectionState: device.connectionState,
      lastSeenLabel: device.lastSeenAt
        ? dateFormatter.format(new Date(device.lastSeenAt))
        : "아직 없음",
      lastDeliveredLabel: device.lastDeliveredAt
        ? dateFormatter.format(new Date(device.lastDeliveredAt))
        : "아직 없음",
    }));
  const downloadUrl =
    process.env.LAWAND_DESKTOP_NOTIFIER_DOWNLOAD_URL?.trim() ||
    (process.env.LAWAND_DESKTOP_NOTIFIER_ARTIFACT_PATH
      ? "/api/desktop-notifications/download"
      : null);

  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell desktop-alert-settings-shell">
        <Link className="back-link" href="/">
          ← 상담 목록
        </Link>

        <header className="detail-header desktop-alert-settings-header">
          <div>
            <p className="eyebrow">PERSONAL DESKTOP NOTIFICATIONS</p>
            <h1>PC 알림 설정</h1>
            <p>
              ERP를 열어두지 않아도 이 컴퓨터의 알림 센터에서 내 업무 알림을 받습니다.
            </p>
          </div>
          <div className="desktop-alert-owner-card">
            <span aria-hidden="true">{staff.displayName.slice(0, 1)}</span>
            <div>
              <small>현재 설정 대상</small>
              <strong>{staff.displayName}님의 개인 PC 알림</strong>
              <p>
                {staff.primaryMembership.region.name} · {staff.primaryMembership.department}
              </p>
            </div>
          </div>
        </header>

        <section aria-label="개발 상태" className="desktop-alert-development-banner">
          <span aria-hidden="true" className="desktop-alert-development-icon">
            <svg viewBox="0 0 24 24">
              <path d="M12 3.5 21 19H3L12 3.5Z" />
              <path d="M12 9v4.5M12 17h.01" />
            </svg>
          </span>
          <div>
            <strong>개인별 PC 알림 3차 연결</strong>
            <p>
              상담·외부 수신전화·고객 문자·담당 후기와 내선·호전환·복귀가 실제 수신 직원에게 자동 전달됩니다.
            </p>
          </div>
          <span className="desktop-alert-stage-badge">개발자 3차</span>
        </section>

        <div className="desktop-alert-overview-grid">
          <section aria-labelledby="desktop-device-title" className="erp-panel desktop-alert-connection-panel">
            <DesktopNotificationConnection
              devices={devicePresentations}
              downloadUrl={downloadUrl}
            />
          </section>

          <section aria-labelledby="desktop-preview-title" className="erp-panel desktop-alert-preview-panel">
            <header className="desktop-alert-panel-heading">
              <div>
                <p className="section-kicker">OS NOTIFICATION PREVIEW</p>
                <h2 id="desktop-preview-title">컴퓨터 알림 미리보기</h2>
                <p>업무 중 실제로 보게 될 고객정보와 내용의 예시입니다.</p>
              </div>
              <span className="desktop-alert-content-badge">실제 내용 포함</span>
            </header>

            <div className="desktop-alert-message-preview">
              <div className="desktop-alert-message-heading">
                <span aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M6.5 10a5.5 5.5 0 0 1 11 0v3.25l1.75 2.5H4.75l1.75-2.5V10Z" />
                    <path d="M9.75 19h4.5" />
                  </svg>
                </span>
                <div>
                  <small>LAW&amp; OS · 상담</small>
                  <strong>담당 상담 재요청 · 김로앤</strong>
                </div>
                <time dateTime="2026-08-20T12:00:00+09:00">방금 전</time>
              </div>
              <div className="desktop-alert-message-copy">
                <strong>010-0000-0000 · 서울 · 전화 상담</strong>
                <p>“개인회생 상담을 다시 받고 싶습니다. 오늘 오후에 통화 가능할까요?”</p>
              </div>
              <span className="desktop-alert-preview-link">클릭해서 ERP 상담 전체 내용 열기 →</span>
            </div>
            <small className="desktop-alert-preview-caption">
              위 고객명·전화번호·상담 내용은 화면 검토를 위한 예시입니다.
            </small>

            <ul className="desktop-alert-content-list">
              <li><span aria-hidden="true">✓</span> 고객명·전화번호·담당 문맥 표시</li>
              <li><span aria-hidden="true">✓</span> 문자·상담·후기 실제 내용 미리보기</li>
              <li><span aria-hidden="true">↗</span> 클릭하면 정확한 ERP 업무 화면으로 이동</li>
            </ul>

            <div className="desktop-alert-lock-policy">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect height="10" rx="2" width="14" x="5" y="10" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
              </span>
              <div>
                <small>권장 기본값</small>
                <strong>PC 사용 중 전체 내용 · 잠금 화면에서는 제목만</strong>
                <p>업무 중에는 필요한 내용을 바로 보고, 자리를 비웠을 때 고객정보가 노출되지 않게 합니다.</p>
              </div>
            </div>
          </section>
        </div>

        <DesktopNotificationPreferences
          groups={notificationGroups}
          preferences={preferences}
        />

        <section aria-labelledby="desktop-later-title" className="erp-panel desktop-alert-later-panel">
          <div>
            <p className="section-kicker">NEXT EVENTS</p>
            <h2 id="desktop-later-title">다음 단계에서 추가할 알림</h2>
            <p>발생 시각과 실제 수신 직원을 보장하는 이벤트부터 차례로 PC 알림에 연결합니다.</p>
          </div>
          <ul>
            {laterNotificationItems.map((item) => (
              <li key={item}><span>후속</span>{item}</li>
            ))}
          </ul>
        </section>

      </main>
    </>
  );
}
