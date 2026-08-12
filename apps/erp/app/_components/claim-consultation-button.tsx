"use client";

import { useActionState } from "react";

import {
  assignConsultationToMeAction,
  type ConsultationAssignmentActionState,
} from "../consultation-actions";

const initialState: ConsultationAssignmentActionState = { error: "" };

export function ClaimConsultationButton({
  consultationId,
  compact = false,
}: {
  consultationId: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(
    assignConsultationToMeAction.bind(null, consultationId),
    initialState,
  );

  return (
    <form
      action={action}
      className={compact ? "claim-form compact" : "claim-form"}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "이 상담을 내가 맡을까요?\n확인하면 담당자로 지정되며, 전화·카카오 상담은 리걸프렌즈 신건 등록이 함께 준비됩니다.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        className={compact ? "claim-button compact" : "claim-button"}
        disabled={pending}
        type="submit"
      >
        {pending ? "배정 중…" : "상담하기"}
      </button>
      {state.error ? (
        <p className="claim-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
