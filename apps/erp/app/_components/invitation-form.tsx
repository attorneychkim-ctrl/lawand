"use client";

import { useActionState, useMemo, useState } from "react";

import {
  acceptInvitationAction,
  type AuthActionState,
} from "../auth-actions";

const initialState: AuthActionState = { error: "" };

export function InvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    acceptInvitationAction,
    initialState,
  );
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const requirements = useMemo(
    () => [
      { label: "12자 이상", met: password.length >= 12 },
      { label: "영문 대문자", met: /[A-Z]/.test(password) },
      { label: "영문 소문자", met: /[a-z]/.test(password) },
      { label: "숫자", met: /[0-9]/.test(password) },
      { label: "특수문자", met: /[^A-Za-z0-9]/.test(password) },
    ],
    [password],
  );
  const validPassword = requirements.every((requirement) => requirement.met);
  const passwordsMatch =
    passwordConfirmation.length > 0 && password === passwordConfirmation;

  return (
    <form action={action} className="auth-form">
      <input name="token" type="hidden" value={token} />
      <label>
        <span>비밀번호</span>
        <input
          autoComplete="new-password"
          maxLength={128}
          minLength={12}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
        />
        <small>대문자·소문자·숫자·특수문자를 모두 포함해 주세요.</small>
      </label>
      <ul aria-label="비밀번호 조건" className="password-requirements">
        {requirements.map((requirement) => (
          <li className={requirement.met ? "met" : ""} key={requirement.label}>
            <span aria-hidden="true">{requirement.met ? "✓" : "○"}</span>
            {requirement.label}
          </li>
        ))}
      </ul>
      <label>
        <span>비밀번호 확인</span>
        <input
          autoComplete="new-password"
          maxLength={128}
          minLength={12}
          name="passwordConfirmation"
          onChange={(event) => setPasswordConfirmation(event.target.value)}
          required
          type="password"
        />
        {passwordConfirmation ? (
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
        className="primary-button"
        disabled={pending || !validPassword || !passwordsMatch}
        type="submit"
      >
        {pending ? "계정 생성 중…" : "직원 계정 만들기"}
      </button>
    </form>
  );
}
