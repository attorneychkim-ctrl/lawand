import type { Metadata } from "next";
import Link from "next/link";

import { StaffBar } from "../_components/staff-bar";
import { requireAdmin } from "../../lib/session";

export const metadata: Metadata = {
  title: "웹훅 알림 설정",
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
      className={`webhook-preview-switch ${enabled ? "is-on" : "is-off"}`}
      role="img"
    >
      <span aria-hidden="true" />
    </span>
  );
}

export default async function WebhookNotificationsPage() {
  const staff = await requireAdmin();

  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell webhook-settings-shell">
        <Link className="back-link" href="/">
          ← 상담 목록
        </Link>

        <header className="detail-header webhook-settings-header">
          <div>
            <p className="eyebrow">PERSONAL WEBHOOK NOTIFICATIONS</p>
            <h1>웹훅 알림 설정</h1>
            <p>
              브라우저와 관계없이 내 업무 알림을 받을 연결과 알림 범위를 설정합니다.
            </p>
          </div>
          <div className="webhook-owner-card">
            <span aria-hidden="true">{staff.displayName.slice(0, 1)}</span>
            <div>
              <small>현재 설정 대상</small>
              <strong>{staff.displayName}님의 개인 알림</strong>
              <p>
                {staff.primaryMembership.region.name} · {staff.primaryMembership.department}
              </p>
            </div>
          </div>
        </header>

        <section aria-label="개발 상태" className="webhook-development-banner">
          <span aria-hidden="true" className="webhook-development-icon">
            <svg viewBox="0 0 24 24">
              <path d="M12 3.5 21 19H3L12 3.5Z" />
              <path d="M12 9v4.5M12 17h.01" />
            </svg>
          </span>
          <div>
            <strong>관리자 화면 미리보기</strong>
            <p>
              지금은 UI·알림 범위를 검토하는 단계입니다. 아래 입력값은 저장되지 않고 웹훅도 전송되지 않습니다.
            </p>
          </div>
          <span className="webhook-stage-badge">기능 연결 전</span>
        </section>

        <div className="webhook-overview-grid">
          <section aria-labelledby="webhook-connection-title" className="erp-panel webhook-connection-panel">
            <header className="webhook-panel-heading">
              <div>
                <p className="section-kicker">MY CONNECTION</p>
                <h2 id="webhook-connection-title">내 웹훅 연결</h2>
                <p>로그인 계정마다 한 개의 개인 연결을 등록하는 첫 화면입니다.</p>
              </div>
              <span className="webhook-connection-status">
                <i aria-hidden="true" /> 연결 전
              </span>
            </header>

            <div className="webhook-connection-fields">
              <label className="webhook-field" htmlFor="webhook-connection-name">
                <span>연결 이름</span>
                <input
                  disabled
                  id="webhook-connection-name"
                  placeholder="예: 내 업무 알림"
                  type="text"
                />
              </label>
              <label className="webhook-field" htmlFor="webhook-endpoint-url">
                <span>웹훅 URL</span>
                <input
                  disabled
                  id="webhook-endpoint-url"
                  inputMode="url"
                  placeholder="https://hooks.example.com/…"
                  type="url"
                />
                <small>저장 뒤에는 전체 주소를 다시 표시하지 않고 안전하게 가립니다.</small>
              </label>
              <label className="webhook-field" htmlFor="webhook-payload-format">
                <span>전송 형식</span>
                <select defaultValue="generic_json" disabled id="webhook-payload-format">
                  <option value="generic_json">일반 JSON 웹훅</option>
                </select>
              </label>
            </div>

            <div className="webhook-connection-actions">
              <p>HTTPS 주소 검증과 테스트 전송은 웹훅 기능을 연결할 때 활성화됩니다.</p>
              <button className="secondary-button" disabled type="button">
                테스트 알림 보내기
              </button>
            </div>
          </section>

          <section aria-labelledby="webhook-preview-title" className="erp-panel webhook-payload-panel">
            <header className="webhook-panel-heading">
              <div>
                <p className="section-kicker">SAFE PREVIEW</p>
                <h2 id="webhook-preview-title">보안형 알림 미리보기</h2>
                <p>업무를 식별할 최소 정보와 ERP 이동 링크만 보내는 기본안입니다.</p>
              </div>
              <span className="webhook-privacy-badge">개인정보 최소화</span>
            </header>

            <div className="webhook-message-preview">
              <div className="webhook-message-heading">
                <span aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M6.5 10a5.5 5.5 0 0 1 11 0v3.25l1.75 2.5H4.75l1.75-2.5V10Z" />
                    <path d="M9.75 19h4.5" />
                  </svg>
                </span>
                <div>
                  <small>상담 · 나에게만</small>
                  <strong>담당 상담 재요청</strong>
                </div>
                <time dateTime="2026-08-20T12:00:00+09:00">방금 전</time>
              </div>
              <p>서울 · 전화 상담 · 상담 상세에서 새 요청을 확인해 주세요.</p>
              <span className="webhook-preview-link">ERP에서 상담 확인 →</span>
            </div>

            <ul className="webhook-privacy-list">
              <li><span aria-hidden="true">✓</span> 이벤트 종류·발생 시각·ERP 링크</li>
              <li><span aria-hidden="true">—</span> 전화번호·문자 본문·상담 원문 제외</li>
              <li><span aria-hidden="true">—</span> 권한 없는 고객 정보 제외</li>
            </ul>
          </section>
        </div>

        <section aria-labelledby="webhook-preferences-title" className="webhook-preferences-section">
          <header className="webhook-section-heading">
            <div>
              <p className="section-kicker">NOTIFICATION SCOPE</p>
              <h2 id="webhook-preferences-title">받을 알림 선택</h2>
              <p>전사 알림과 나에게 직접 배정된 알림을 구분한 권장 기본값입니다.</p>
            </div>
            <div className="webhook-legend" aria-label="권장 기본값 범례">
              <span><i className="is-on" /> 권장 켜짐</span>
              <span><i className="is-off" /> 권장 꺼짐</span>
            </div>
          </header>

          <div className="webhook-group-grid">
            {notificationGroups.map((group) => (
              <article className={`erp-panel webhook-group-card is-${group.kind}`} key={group.kind}>
                <header>
                  <span className="webhook-group-icon">
                    <NotificationGroupIcon kind={group.kind} />
                  </span>
                  <div>
                    <h3>{group.title}</h3>
                    <p>{group.description}</p>
                  </div>
                </header>
                <div className="webhook-preference-list">
                  {group.items.map((item) => (
                    <div className="webhook-preference-row" key={item.title}>
                      <div>
                        <div className="webhook-preference-title">
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

        <section aria-labelledby="webhook-later-title" className="erp-panel webhook-later-panel">
          <div>
            <p className="section-kicker">NEXT EVENTS</p>
            <h2 id="webhook-later-title">다음 단계에서 추가할 알림</h2>
            <p>발생 시각을 보장하는 개인별 이벤트를 먼저 만든 뒤 선택 항목으로 활성화합니다.</p>
          </div>
          <ul>
            {laterNotificationItems.map((item) => (
              <li key={item}><span>2차</span>{item}</li>
            ))}
          </ul>
        </section>

        <div className="webhook-save-bar">
          <div>
            <strong>아직 저장되지 않습니다</strong>
            <span>화면 검토가 끝난 뒤 개인별 설정 원장과 실제 전송 기능을 연결합니다.</span>
          </div>
          <button className="primary-button" disabled type="button">
            변경 내용 저장
          </button>
        </div>
      </main>
    </>
  );
}
