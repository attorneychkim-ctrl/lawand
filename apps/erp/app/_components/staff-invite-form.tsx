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
      <div className="form-row">
        <label>
          <span>소속</span>
          <select defaultValue="lawand" name="organization">
            <option value="lawand">법무법인 로앤</option>
            <option value="legalflow">리걸플로</option>
          </select>
        </label>
        <label>
          <span>지역</span>
          <select defaultValue="seoul" name="region">
            <option value="seoul">서울</option>
            <option value="daejeon">대전</option>
            <option value="busan">부산</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          <span>부서</span>
          <input maxLength={100} name="department" required />
        </label>
        <label>
          <span>직책</span>
          <input maxLength={100} name="jobTitle" required />
        </label>
      </div>
      <label>
        <span>역할·권한</span>
        <select defaultValue="full_time" name="role">
          <option value="admin">관리자</option>
          <option value="full_time">정규직</option>
          <option value="part_time">아르바이트</option>
          <option value="separate_accounting">별산</option>
          <option value="civil_complaint_vendor">민원업체</option>
        </select>
      </label>
      <div className="form-row">
        <label>
          <span>리걸프렌즈 아이디</span>
          <input
            autoCapitalize="none"
            autoComplete="off"
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
            inputMode="numeric"
            min={1}
            name="legalFriendsMemberIdx"
            placeholder="예: 138"
            step={1}
            type="number"
          />
        </label>
      </div>
      <small>
        상담 담당자로 배정될 직원만 아이디와 member_idx를 함께 입력합니다.
        가입 후 관리자 화면에서도 연결하거나 변경할 수 있습니다.
      </small>
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
