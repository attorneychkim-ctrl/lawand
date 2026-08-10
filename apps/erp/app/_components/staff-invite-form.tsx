"use client";

import { useActionState } from "react";

import {
  createInvitationAction,
  type InvitationActionState,
} from "../auth-actions";

const initialState: InvitationActionState = {
  error: "",
  invitationUrl: "",
  expiresAt: "",
};

export function StaffInviteForm() {
  const [state, action, pending] = useActionState(
    createInvitationAction,
    initialState,
  );

  return (
    <form action={action} className="auth-form invite-form">
      <label>
        <span>초대할 직원 이메일</span>
        <input inputMode="email" name="email" required type="email" />
      </label>
      <label>
        <span>이름</span>
        <input autoComplete="off" maxLength={50} minLength={2} name="name" required />
      </label>
      <p className="invite-form-note">
        초대받은 직원은 가입 후 내 정보에서 소속·지역·부서·직책과 센트릭스·
        리걸프렌즈 연결을 직접 입력할 수 있습니다. 역할·권한은 관리자가 직원
        관리에서 변경합니다.
      </p>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.invitationUrl ? (
        <div className="invitation-result" role="status">
          <strong>초대 링크가 생성되었습니다.</strong>
          <p>
            이 링크는 한 번만 표시되며 72시간 동안 유효합니다. 초대할 직원에게
            안전한 방법으로 전달해 주세요.
          </p>
          <input
            aria-label="생성된 초대 링크"
            readOnly
            value={state.invitationUrl}
          />
        </div>
      ) : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "초대 생성 중…" : "초대 링크 만들기"}
      </button>
    </form>
  );
}
