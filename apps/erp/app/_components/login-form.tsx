"use client";

import { useActionState } from "react";

import {
  loginAction,
  type AuthActionState,
} from "../auth-actions";

const initialState: AuthActionState = { error: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="auth-form">
      <label>
        <span>이메일</span>
        <input
          autoComplete="username"
          inputMode="email"
          name="email"
          required
          type="email"
        />
      </label>
      <label>
        <span>비밀번호</span>
        <input
          autoComplete="current-password"
          name="password"
          required
          type="password"
        />
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
