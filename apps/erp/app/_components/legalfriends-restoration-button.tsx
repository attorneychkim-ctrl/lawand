"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import {
  restoreInvalidatedLegalFriendsCaseAction,
  type LegalFriendsInvalidationActionState,
} from "../consultation-actions";

const initialState: LegalFriendsInvalidationActionState = { error: "" };

export function LegalFriendsRestorationButton({
  consultationId,
  pending,
}: {
  consultationId: string;
  pending: boolean;
}) {
  const router = useRouter();
  const [state, action, actionPending] = useActionState(
    restoreInvalidatedLegalFriendsCaseAction.bind(null, consultationId),
    initialState,
  );

  useEffect(() => {
    if (!pending) return;
    let refreshCount = 0;
    const timer = window.setInterval(() => {
      refreshCount += 1;
      router.refresh();
      if (refreshCount >= 24) window.clearInterval(timer);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [pending, router]);

  return (
    <form
      action={action}
      className="consultation-invalidation-form"
      onSubmit={(event) => {
        if (!window.confirm("이 상담을 다시 상담 가능한 상태로 되돌릴까요?\n리걸프렌즈와 ERP 담당자가 현재 로그인한 직원으로 변경됩니다.")) {
          event.preventDefault();
        }
      }}
    >
      <button
        className="consultation-restoration-button"
        disabled={actionPending || pending}
        type="submit"
      >
        {actionPending ? "요청 중…" : pending ? "되돌리는 중…" : "상담으로 되돌리기"}
      </button>
      {state.error ? <p className="consultation-invalidation-error" role="alert">{state.error}</p> : null}
    </form>
  );
}
