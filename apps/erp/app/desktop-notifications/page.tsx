import type { Metadata } from "next";
import Link from "next/link";

import { StaffBar } from "../_components/staff-bar";
import { requireAdmin } from "../../lib/session";

export const metadata: Metadata = {
  title: "PC 알림 설정",
};

type NotificationGroupKind = "consultation" | "phone" | "message" | "review";

type NotificationPreferencePreview = {
  title: string;
  description: string;
  scope: string;
  recommended: boolean;
};

const notificationGroups: Array<{
  kind: NotificationGroupKind;
  title: string;
  description: string;
  items: NotificationPreferencePreview[];
}> = [
  {
    kind: "consultation",
    title: "상담",
    description: "신규 접수와 담당 상담의 중요한 변화를 구분합니다.",
    items: [
      {
        title: "새 상담 · 배정 전 재요청",
        description: "아직 담당자가 없는 새 접수와 반복 요청을 알립니다.",
        scope: "전체 직원 대상",
        recommended: false,
      },
      {
        title: "내 담당 상담 재요청",
        description: "이미 내가 맡은 고객이 상담을 다시 요청하면 알립니다.",
        scope: "현재 담당자",
        recommended: true,
      },
      {
        title: "새 담당자로 지정",
        description: "담당자 변경이 완료되어 상담이 나에게 넘어오면 알립니다.",
        scope: "새 담당자",
        recommended: true,
      },
    ],
  },
  {
    kind: "phone",
    title: "전화",
    description: "전사 대표전화와 나에게 직접 필요한 전화를 나눕니다.",
    items: [
      {
        title: "내 담당 고객 · 내 회선 수신",
        description: "내 고객이 전화하거나 내 센트릭스 회선이 울릴 때 알립니다.",
        scope: "담당자 · 회선 소유자",
        recommended: true,
      },
      {
        title: "내선 · 호전환 · 복귀",
        description: "내선 전화가 오거나 고객 전화가 나에게 전달·복귀하면 알립니다.",
        scope: "실제 수신 직원",
        recommended: true,
      },
      {
        title: "모든 대표번호 외부 수신",
        description: "담당 여부와 관계없이 회사 대표번호로 오는 전화를 모두 알립니다.",
        scope: "전체 직원 대상",
        recommended: false,
      },
    ],
  },
  {
    kind: "message",
    title: "문자",
    description: "고객 회신의 실제 업무 담당자를 기준으로 알립니다.",
    items: [
      {
        title: "고객의 새 회신",
        description: "내가 최근 문자를 보냈거나 내가 맡은 상담 고객이 회신하면 알립니다.",
        scope: "최근 발송자 · 상담 담당자",
        recommended: true,
      },
      {
        title: "연결되지 않은 수신문자",
        description: "상담이나 최근 발송자를 찾지 못한 대표번호 문자를 알립니다.",
        scope: "관리자",
        recommended: false,
      },
    ],
  },
  {
    kind: "review",
    title: "후기",
    description: "연결된 사건의 답글 담당자에게 필요한 후기만 알립니다.",
    items: [
      {
        title: "내 담당 고객의 새 후기",
        description: "내 사건에 연결된 후기가 등록되어 검수나 공식 답글이 필요하면 알립니다.",
        scope: "연결 사건 담당자",
        recommended: true,
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

function NotificationGroupIcon({ kind }: { kind: NotificationGroupKind }) {
  return kind === "consultation" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  ) : kind === "phone" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7.8 3.8 10 8.5 7.5 10a14.3 14.3 0 0 0 6.5 6.5l1.5-2.5 4.7 2.2v3a1.8 1.8 0 0 1-1.8 1.8A15.4 15.4 0 0 1 3 5.6a1.8 1.8 0 0 1 1.8-1.8h3Z" />
    </svg>
  ) : kind === "message" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M7.5 9h9M7.5 13h6" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="m9 11 2 2 4-4" />
    </svg>
  );
}

function PreviewSwitch({ enabled }: { enabled: boolean }) {
  return (
    <span
      aria-label={`권장 기본값 ${enabled ? "켜짐" : "꺼짐"}`}
      className={`desktop-alert-preview-switch ${enabled ? "is-on" : "is-off"}`}
      role="img"
    >
      <span aria-hidden="true" />
    </span>
  );
}

export default async function DesktopNotificationsPage() {
  const staff = await requireAdmin();

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
            <strong>관리자 화면 미리보기</strong>
            <p>
              지금은 PC 연결 흐름과 알림 내용을 검토하는 단계입니다. 프로그램 설치·기기 연결·실제 OS 알림은 아직 작동하지 않습니다.
            </p>
          </div>
          <span className="desktop-alert-stage-badge">기능 연결 전</span>
        </section>

        <div className="desktop-alert-overview-grid">
          <section aria-labelledby="desktop-device-title" className="erp-panel desktop-alert-connection-panel">
            <header className="desktop-alert-panel-heading">
              <div>
                <p className="section-kicker">MY COMPUTER</p>
                <h2 id="desktop-device-title">내 컴퓨터 연결</h2>
                <p>로그인한 ERP 계정과 업무용 PC를 한 번 연결합니다.</p>
              </div>
              <span className="desktop-alert-connection-status">
                <i aria-hidden="true" /> 연결 전
              </span>
            </header>

            <div className="desktop-alert-app-card">
              <span aria-hidden="true" className="desktop-alert-app-icon">
                <svg viewBox="0 0 24 24">
                  <rect height="13" rx="2" width="18" x="3" y="4" />
                  <path d="M8 21h8M12 17v4M16.5 7.5a2.5 2.5 0 0 1 2.5 2.5v1.5l1 1.5h-7l1-1.5V10a2.5 2.5 0 0 1 2.5-2.5Z" />
                </svg>
              </span>
              <div>
                <small>PC 알림 프로그램</small>
                <strong>LAW&amp; OS 알림</strong>
                <p>컴퓨터 로그인 시 자동으로 시작되어 새 업무를 확인합니다.</p>
              </div>
              <span className="desktop-alert-app-badge">준비 중</span>
            </div>

            <ol className="desktop-alert-setup-list">
              <li>
                <span>1</span>
                <div>
                  <strong>알림 프로그램 설치</strong>
                  <p>이 컴퓨터에 한 번만 설치하고 자동 시작을 허용합니다.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>현재 ERP 계정과 연결</strong>
                  <p>짧게 유효한 일회용 연결로 {staff.displayName}님의 PC임을 확인합니다.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>실제 알림 확인</strong>
                  <p>테스트 알림이 컴퓨터 우측 알림 영역에 뜨면 연결이 끝납니다.</p>
                </div>
              </li>
            </ol>

            <div className="desktop-alert-connection-actions">
              <p>연결된 컴퓨터는 이곳에서 이름·마지막 접속·알림 상태를 확인하고 해제할 수 있습니다.</p>
              <div>
                <button className="secondary-button" disabled type="button">
                  PC 알림 프로그램 받기
                </button>
                <button className="primary-button" disabled type="button">
                  이 컴퓨터 연결
                </button>
              </div>
            </div>
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

        <section aria-labelledby="desktop-preferences-title" className="desktop-alert-preferences-section">
          <header className="desktop-alert-section-heading">
            <div>
              <p className="section-kicker">NOTIFICATION SCOPE</p>
              <h2 id="desktop-preferences-title">받을 알림 선택</h2>
              <p>전사 알림과 나에게 직접 배정된 알림을 구분한 권장 기본값입니다.</p>
            </div>
            <div className="desktop-alert-legend" aria-label="권장 기본값 범례">
              <span><i className="is-on" /> 권장 켜짐</span>
              <span><i className="is-off" /> 권장 꺼짐</span>
            </div>
          </header>

          <div className="desktop-alert-group-grid">
            {notificationGroups.map((group) => (
              <article className={`erp-panel desktop-alert-group-card is-${group.kind}`} key={group.kind}>
                <header>
                  <span className="desktop-alert-group-icon">
                    <NotificationGroupIcon kind={group.kind} />
                  </span>
                  <div>
                    <h3>{group.title}</h3>
                    <p>{group.description}</p>
                  </div>
                </header>
                <div className="desktop-alert-preference-list">
                  {group.items.map((item) => (
                    <div className="desktop-alert-preference-row" key={item.title}>
                      <div>
                        <div className="desktop-alert-preference-title">
                          <strong>{item.title}</strong>
                          <span>{item.scope}</span>
                        </div>
                        <p>{item.description}</p>
                      </div>
                      <PreviewSwitch enabled={item.recommended} />
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="desktop-later-title" className="erp-panel desktop-alert-later-panel">
          <div>
            <p className="section-kicker">NEXT EVENTS</p>
            <h2 id="desktop-later-title">다음 단계에서 추가할 알림</h2>
            <p>발생 시각과 실제 수신 직원을 보장하는 이벤트부터 차례로 PC 알림에 연결합니다.</p>
          </div>
          <ul>
            {laterNotificationItems.map((item) => (
              <li key={item}><span>2차</span>{item}</li>
            ))}
          </ul>
        </section>

        <div className="desktop-alert-save-bar">
          <div>
            <strong>아직 PC에 알림을 보내지 않습니다</strong>
            <span>화면 검토가 끝난 뒤 개인별 기기 등록·암호화 전달 대기열·PC 알림 프로그램을 연결합니다.</span>
          </div>
          <button className="primary-button" disabled type="button">
            알림 설정 저장
          </button>
        </div>
      </main>
    </>
  );
}
