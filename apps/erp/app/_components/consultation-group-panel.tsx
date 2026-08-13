"use client";

import { useActionState } from "react";

import type { ConsultationDetail } from "../../lib/gateway";
import {
  linkConsultationGroupAction,
  splitConsultationGroupAction,
  type ConsultationGroupActionState,
} from "../consultation-actions";

const initialState: ConsultationGroupActionState = { error: "" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function channelLabel(
  channel: "phone" | "kakao_channel" | "naver_booking",
) {
  if (channel === "kakao_channel") return "플친";
  if (channel === "naver_booking") return "네이버 예약";
  return "전화·홈페이지";
}

function SplitButton({
  canonicalConsultationId,
  consultationId,
}: {
  canonicalConsultationId: string;
  consultationId: string;
}) {
  const [state, action, pending] = useActionState(
    splitConsultationGroupAction.bind(
      null,
      consultationId,
      canonicalConsultationId,
    ),
    initialState,
  );
  return (
    <form
      action={action}
      className="consultation-group-split-form"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "이 접수를 현재 묶음에서 분리할까요?\n분리 이력은 감사 원장에 남고 목록에 별도 상담으로 다시 표시됩니다.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button disabled={pending} type="submit">
        {pending ? "분리 중…" : "별도 상담으로 분리"}
      </button>
      {state.error ? <small role="alert">{state.error}</small> : null}
    </form>
  );
}

export function ConsultationGroupPanel({
  consultationId,
  group,
  nameMismatch,
  requestCount,
}: {
  consultationId: string;
  group: ConsultationDetail["group"];
  nameMismatch: boolean;
  requestCount: number;
}) {
  const [state, action, pending] = useActionState(
    linkConsultationGroupAction.bind(null, consultationId),
    initialState,
  );

  return (
    <section
      aria-labelledby="consultation-group-title"
      className="detail-section consultation-group-panel"
    >
      <header className="detail-section-heading">
        <div>
          <p className="section-kicker">CONSULTATION GROUP</p>
          <h2 id="consultation-group-title">같은 고객의 상담 요청</h2>
          <p>
            목록에는 대표 상담 하나만 표시하고 접수 채널별 원장은 이곳에 모두
            보존합니다.
          </p>
        </div>
        <span className="count-badge">
          원장 {group?.memberCount ?? 1}건 · 요청 {requestCount}회
        </span>
      </header>

      {nameMismatch ? (
        <div className="inline-alert is-warning">
          <strong>입력 이름이 서로 다릅니다</strong>
          <span>
            같은 전화번호로 묶었지만 가족·공용 연락처인지 확인한 뒤 필요하면
            분리해 주세요.
          </span>
        </div>
      ) : null}

      {group ? (
        <ol className="consultation-group-members">
          {group.members.map((member) => (
            <li key={member.id}>
              <div className="consultation-group-member-main">
                <span>
                  <strong>{member.displayName}</strong>
                  {member.canonical ? <em>대표 상담</em> : null}
                </span>
                <small>
                  {channelLabel(member.contactChannel)} · 요청 {member.requestCount}회
                  · {formatDate(member.lastRequestedAt)}
                </small>
                <code>{member.publicReceiptCode}</code>
              </div>
              {group.members.length > 1 ? (
                <SplitButton
                  canonicalConsultationId={group.canonicalConsultationId}
                  consultationId={member.id}
                />
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="consultation-group-empty">
          아직 다른 접수와 묶이지 않은 상담입니다.
        </p>
      )}

      <form action={action} className="consultation-group-link-form">
        <label>
          <span>기존 상담에 연결</span>
          <input
            autoComplete="off"
            name="targetReceiptCode"
            pattern="LA-[0-9]{6}-[23456789A-HJ-NP-Z]{8}"
            placeholder="LA-260813-23456789"
            required
            type="text"
          />
        </label>
        <button disabled={pending} type="submit">
          {pending ? "연결 중…" : "접수번호로 묶기"}
        </button>
        {state.error ? <p role="alert">{state.error}</p> : null}
      </form>
      <p className="consultation-group-help">
        전화번호가 없는 플친 접수도 고객 확인 후 연결할 수 있습니다. 서로 다른
        전화번호나 리걸프렌즈 사건·담당자가 충돌하면 연결되지 않습니다.
      </p>
    </section>
  );
}
