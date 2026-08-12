"use client";

import { useActionState } from "react";

import {
  confirmKakaoHomepageEntryAction,
  invalidateKakaoHomepageEntryAction,
  type KakaoEntryActionState,
} from "../consultation-actions";

const initialState: KakaoEntryActionState = { error: "" };

function formatDate(value: string | null) {
  if (!value) return "기록 없음";
  const date = new Date(value);
  const koreaTime = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
  const year = koreaTime.getUTCFullYear();
  const month = String(koreaTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(koreaTime.getUTCDate()).padStart(2, "0");
  const hour = String(koreaTime.getUTCHours()).padStart(2, "0");
  const minute = String(koreaTime.getUTCMinutes()).padStart(2, "0");
  return `${year}.${month}.${day}. ${hour}:${minute}`;
}

export function KakaoEntryPanel({
  consultationId,
  displayName,
  entry,
  nameProvided,
}: {
  consultationId: string;
  displayName: string;
  nameProvided: boolean;
  entry: {
    status: "pending" | "confirmed" | "invalid";
    clickCount: number;
    firstClickedAt: string;
    lastClickedAt: string;
    confirmedAt: string | null;
    invalidatedAt: string | null;
  };
}) {
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmKakaoHomepageEntryAction.bind(null, consultationId),
    initialState,
  );
  const [invalidateState, invalidateAction, invalidatePending] =
    useActionState(
      invalidateKakaoHomepageEntryAction.bind(null, consultationId),
      initialState,
    );

  return (
    <section
      className={`kakao-entry-panel is-${entry.status}`}
      aria-labelledby="kakao-entry-title"
    >
      <div className="kakao-entry-heading">
        <div>
          <p className="eyebrow">KAKAO ENTRY</p>
          <h2 id="kakao-entry-title">
            {entry.status === "pending"
              ? nameProvided
                ? "카카오 상담 접수"
                : "카카오 채팅 확인 대기"
              : entry.status === "confirmed"
                ? "카카오 채팅 확인"
                : "미진입·무효"}
          </h2>
        </div>
        <span className={`kakao-entry-status is-${entry.status}`}>
          {entry.status === "pending"
            ? nameProvided
              ? "이름 입력 완료"
              : "확인 필요"
            : entry.status === "confirmed"
              ? "확인 완료"
              : "무효 처리"}
        </span>
      </div>

      <p className="kakao-entry-description">
        {entry.status === "pending"
          ? nameProvided
            ? `고객이 “${displayName}” 이름으로 접수했습니다. 채널 관리자센터에서 같은 이름의 새 메시지를 확인한 뒤 상담하기를 누르면 채팅 확인과 담당 배정이 함께 처리됩니다.`
            : "홈페이지 카카오톡 버튼은 눌렀지만 이름과 실제 메시지 전송 여부는 확인되지 않은 기존 접수입니다. 채널 관리자센터에서 표시명을 확인해 반영해 주세요."
          : entry.status === "confirmed"
            ? `직원이 카카오 채팅을 확인했습니다. 확인 시각 ${formatDate(entry.confirmedAt)}`
            : `메시지를 남기지 않은 진입으로 처리했습니다. 처리 시각 ${formatDate(entry.invalidatedAt)}`}
      </p>

      <dl className="kakao-entry-meta">
        <div>
          <dt>최초 진입</dt>
          <dd>{formatDate(entry.firstClickedAt)}</dd>
        </div>
        <div>
          <dt>최근 진입</dt>
          <dd>{formatDate(entry.lastClickedAt)}</dd>
        </div>
        <div>
          <dt>버튼 클릭</dt>
          <dd>{entry.clickCount}회</dd>
        </div>
      </dl>

      {entry.status !== "invalid" ? (
        <form action={confirmAction} className="kakao-confirm-form">
          <label htmlFor="kakao-display-name">
            고객 이름 또는 카카오톡 표시명 수정
          </label>
          <div>
            <input
              id="kakao-display-name"
              defaultValue={
                nameProvided || entry.status === "confirmed"
                  ? displayName
                  : ""
              }
              maxLength={40}
              name="displayName"
              placeholder="예: 김민수"
              required
            />
            <button disabled={confirmPending} type="submit">
              {confirmPending
                ? "반영 중…"
                : entry.status === "pending"
                  ? nameProvided
                    ? "채팅 확인·이름 수정"
                    : "채팅 확인·이름 반영"
                  : "표시명 수정"}
            </button>
          </div>
          <small>
            오탈자나 실제 채팅방 표시명이 다른 경우에만 수정해 주세요. ERP에는
            접수번호를 조합한 `_플친` 식별자로 암호화해 저장합니다.
          </small>
          {confirmState.error ? (
            <p className="form-error" role="alert">
              {confirmState.error}
            </p>
          ) : null}
        </form>
      ) : null}

      {entry.status === "pending" ? (
        <form
          action={invalidateAction}
          className="kakao-invalidate-form"
          onSubmit={(event) => {
            if (
              !window.confirm(
                "채널 관리자센터에 고객 메시지가 없는지 확인했나요?\n확인하면 이 진입을 미진입·무효 처리합니다.",
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <button disabled={invalidatePending} type="submit">
            {invalidatePending ? "처리 중…" : "메시지 없음·무효 처리"}
          </button>
          {invalidateState.error ? (
            <p className="form-error" role="alert">
              {invalidateState.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
