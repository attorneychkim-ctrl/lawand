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
            "이 상담을 내가 맡을까요?\n확인하면 담당자로 지정되며, 연락정보가 갖춰진 접수만 필요한 외부 연동이 준비됩니다.",
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
