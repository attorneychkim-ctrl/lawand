"use client";

import { useActionState } from "react";

import {
  type LegalFriendsAccountActionState,
  updateLegalFriendsAccountAction,
} from "../auth-actions";

const initialState: LegalFriendsAccountActionState = {
  error: "",
  saved: false,
};

export function LegalFriendsAccountForm({
  staffUserId,
  legalFriendsId,
  legalFriendsMemberIdx,
}: {
  staffUserId: string;
  legalFriendsId: string | null;
  legalFriendsMemberIdx: number | null;
}) {
  const [state, action, pending] = useActionState(
    updateLegalFriendsAccountAction,
    initialState,
  );

  return (
    <form action={action} className="external-account-form">
      <input name="staffUserId" type="hidden" value={staffUserId} />
      <label>
        <span>리걸프렌즈 아이디</span>
        <input
          autoCapitalize="none"
          autoComplete="off"
          defaultValue={legalFriendsId ?? ""}
          maxLength={100}
          name="legalFriendsId"
          placeholder="예: lawandfirm_s"
          spellCheck={false}
        />
      </label>
      <label>
        <span>리걸프렌즈 member_idx</span>
        <input
          autoComplete="off"
          defaultValue={legalFriendsMemberIdx ?? ""}
          inputMode="numeric"
          min={1}
          name="legalFriendsMemberIdx"
          placeholder="예: 138"
          step={1}
          type="number"
        />
      </label>
      <button className="secondary-button" disabled={pending} type="submit">
        {pending ? "저장 중…" : "연결 저장"}
      </button>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="form-success" role="status">
          리걸프렌즈 계정 연결을 저장했습니다.
        </p>
      ) : null}
    </form>
  );
}
