"use client";

import { useActionState } from "react";

import type { StaffDirectoryItem } from "../../lib/staff-auth";
import {
  type StaffProfileActionState,
  updateStaffProfileAction,
} from "../auth-actions";

const initialState: StaffProfileActionState = {
  error: "",
  saved: false,
};

export function StaffProfileForm({
  profile,
  allowRoleEdit,
}: {
  profile: StaffDirectoryItem;
  allowRoleEdit: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateStaffProfileAction,
    initialState,
  );

  return (
    <form action={action} className="staff-profile-form">
      <input name="staffUserId" type="hidden" value={profile.id} />
      <div className="form-row">
        <label>
          <span>소속</span>
          <select defaultValue={profile.organization.key} name="organization">
            <option value="lawand">법무법인 로앤</option>
            <option value="legalflow">리걸플로</option>
          </select>
        </label>
        <label>
          <span>지역</span>
          <select defaultValue={profile.region.key} name="region">
            <option value="seoul">서울</option>
            <option value="daejeon">대전</option>
            <option value="busan">부산</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          <span>부서</span>
          <input
            defaultValue={profile.department}
            maxLength={100}
            name="department"
            required
          />
        </label>
        <label>
          <span>직책</span>
          <input
            defaultValue={profile.jobTitle}
            maxLength={100}
            name="jobTitle"
            required
          />
        </label>
      </div>
      {allowRoleEdit ? (
        <label>
          <span>역할·권한</span>
          <select defaultValue={profile.role} name="role">
            <option value="admin">관리자</option>
            <option value="full_time">정규직</option>
            <option value="part_time">아르바이트</option>
            <option value="separate_accounting">별산</option>
            <option value="civil_complaint_vendor">민원업체</option>
          </select>
          <small>역할과 권한은 관리자만 변경할 수 있습니다.</small>
        </label>
      ) : (
        <small className="profile-permission-note">
          역할과 권한 변경은 관리자에게 요청해 주세요.
        </small>
      )}
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="form-success" role="status">
          기본 정보를 저장했습니다.
        </p>
      ) : null}
      <button className="secondary-button" disabled={pending} type="submit">
        {pending ? "저장 중…" : "기본 정보 저장"}
      </button>
    </form>
  );
}
