"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import {
  invalidateLegalFriendsCaseAction,
  type LegalFriendsInvalidationActionState,
} from "../consultation-actions";

const initialState: LegalFriendsInvalidationActionState = { error: "" };

export function LegalFriendsInvalidationButton({
  consultationId,
  status,
}: {
  consultationId: string;
  status: "ready" | "pending" | "failed" | "invalidated";
}) {
  const router = useRouter();
  const [state, action, actionPending] = useActionState(
    invalidateLegalFriendsCaseAction.bind(null, consultationId),
    initialState,
  );
  const disabled =
    actionPending || status === "pending" || status === "invalidated";
  const label = actionPending
    ? "요청 중…"
    : status === "pending"
      ? "무효 처리 중…"
      : status === "invalidated"
        ? "무효 처리됨"
        : status === "failed"
          ? "무효 처리 재요청"
          : "무효 처리";

  useEffect(() => {
    if (status !== "pending") return;
    let refreshCount = 0;
    const timer = window.setInterval(() => {
      refreshCount += 1;
      router.refresh();
      if (refreshCount >= 24) window.clearInterval(timer);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [router, status]);

  return (
    <form
      action={action}
      className="consultation-invalidation-form"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "이 상담을 무효 처리할까요?\n확인하면 리걸프렌즈 사건 담당자가 ‘무효’로 변경됩니다. 상담·외부 연동 원장은 삭제되지 않습니다.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        className="consultation-invalidation-button"
        disabled={disabled}
        type="submit"
      >
        {label}
      </button>
      {state.error ? (
        <p className="consultation-invalidation-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
