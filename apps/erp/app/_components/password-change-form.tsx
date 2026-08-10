"use client";

import { useActionState, useMemo, useState } from "react";

import {
  type AuthActionState,
  changePasswordAction,
} from "../auth-actions";

const initialState: AuthActionState = { error: "" };

export function PasswordChangeForm() {
  const [state, action, pending] = useActionState(
    changePasswordAction,
    initialState,
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const requirements = useMemo(
    () => [
      { label: "12자 이상", met: newPassword.length >= 12 },
      { label: "영문 대문자", met: /[A-Z]/.test(newPassword) },
      { label: "영문 소문자", met: /[a-z]/.test(newPassword) },
      { label: "숫자", met: /[0-9]/.test(newPassword) },
      { label: "특수문자", met: /[^A-Za-z0-9]/.test(newPassword) },
    ],
    [newPassword],
  );
  const validPassword = requirements.every((requirement) => requirement.met);
  const passwordsMatch = confirmation.length > 0 && confirmation === newPassword;

  return (
    <form action={action} className="auth-form password-change-form">
      <label>
        <span>현재 비밀번호</span>
        <input
          autoComplete="current-password"
          maxLength={128}
          name="currentPassword"
          required
          type="password"
        />
      </label>
      <label>
        <span>새 비밀번호</span>
        <input
          autoComplete="new-password"
          maxLength={128}
          minLength={12}
          name="newPassword"
          onChange={(event) => setNewPassword(event.target.value)}
          required
          type="password"
        />
      </label>
      <ul aria-label="새 비밀번호 조건" className="password-requirements">
        {requirements.map((requirement) => (
          <li className={requirement.met ? "met" : ""} key={requirement.label}>
            <span aria-hidden="true">{requirement.met ? "✓" : "○"}</span>
            {requirement.label}
          </li>
        ))}
      </ul>
      <label>
        <span>새 비밀번호 확인</span>
        <input
          autoComplete="new-password"
          maxLength={128}
          minLength={12}
          name="newPasswordConfirmation"
          onChange={(event) => setConfirmation(event.target.value)}
          required
          type="password"
        />
        {confirmation ? (
          <small className={passwordsMatch ? "requirement-met" : "requirement-unmet"}>
            {passwordsMatch ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다."}
          </small>
        ) : null}
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        className="secondary-button"
        disabled={pending || !validPassword || !passwordsMatch}
        type="submit"
      >
        {pending ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
