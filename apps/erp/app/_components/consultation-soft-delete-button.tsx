"use client";

import { useActionState } from "react";

import {
  softDeleteStaffConsultationAction,
  type ConsultationSoftDeleteActionState,
} from "../consultation-actions";

const initialState: ConsultationSoftDeleteActionState = { error: "" };

export function ConsultationSoftDeleteButton({
  consultationId,
}: {
  consultationId: string;
}) {
  const [state, action, pending] = useActionState(
    softDeleteStaffConsultationAction.bind(null, consultationId),
    initialState,
  );

  return (
    <form
      action={action}
      className="consultation-invalidation-form"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "이 신규등록 상담을 삭제할까요?\n원장은 보존되며 상담은 종결되고 고객정보는 상담 화면에서 블러 처리됩니다. 이미 발송·등록된 외부 연동은 취소되지 않습니다.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        className="consultation-soft-delete-button"
        disabled={pending}
        type="submit"
      >
        {pending ? "삭제 중…" : "삭제"}
      </button>
      {state.error ? (
        <p className="consultation-invalidation-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
