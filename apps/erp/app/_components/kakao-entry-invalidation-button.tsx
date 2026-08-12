"use client";

import { useActionState } from "react";

import {
  invalidateKakaoHomepageEntryAction,
  type KakaoEntryActionState,
} from "../consultation-actions";

const initialState: KakaoEntryActionState = { error: "" };

export function KakaoEntryInvalidationButton({
  consultationId,
}: {
  consultationId: string;
}) {
  const [state, action, pending] = useActionState(
    invalidateKakaoHomepageEntryAction.bind(null, consultationId),
    initialState,
  );

  return (
    <form
      action={action}
      className="consultation-invalidation-form"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "채널 관리자센터에 고객 메시지가 없는지 확인했나요?\n확인하면 리걸프렌즈에 무효 담당자로 신건 등록하고 이 카카오 상담을 종결합니다.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        className="consultation-invalidation-button"
        disabled={pending}
        type="submit"
      >
        {pending ? "무효 등록 중…" : "무효 처리"}
      </button>
      {state.error ? (
        <p className="consultation-invalidation-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
