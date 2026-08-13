"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  requestConsultationAssigneeTransferAction,
  type ConsultationAssigneeTransferActionState,
} from "../consultation-actions";

type AssignmentOption = {
  userId: string;
  displayName: string;
  organizationName: string;
  department: string;
  jobTitle: string;
};

type AssignmentTransfer = {
  id: string;
  targetAssigneeUserId: string;
  targetAssigneeDisplayName: string;
  status: "pending" | "succeeded" | "failed" | "needs_confirmation";
  lastError: string | null;
};

const initialState: ConsultationAssigneeTransferActionState = {
  error: "",
  eventId: "",
};

const reasons = [
  ["workload_balance", "업무 분배"],
  ["absence", "부재"],
  ["expertise", "전문 분야"],
  ["manager_adjustment", "관리자 조정"],
  ["other", "기타"],
] as const;

export function ConsultationAssigneeTransfer({
  consultationId,
  currentAssigneeUserId,
  currentAssigneeDisplayName,
  options,
  latestTransfer,
  canChange,
}: {
  consultationId: string;
  currentAssigneeUserId: string;
  currentAssigneeDisplayName: string;
  options: AssignmentOption[];
  latestTransfer: AssignmentTransfer | null;
  canChange: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [targetStaffUserId, setTargetStaffUserId] = useState("");
  const [reason, setReason] = useState("");
  const [state, action, actionPending] = useActionState(
    requestConsultationAssigneeTransferAction.bind(null, consultationId),
    initialState,
  );

  const eligibleOptions = useMemo(
    () => options.filter((option) => option.userId !== currentAssigneeUserId),
    [currentAssigneeUserId, options],
  );
  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return eligibleOptions;
    return eligibleOptions.filter((option) =>
      [
        option.displayName,
        option.organizationName,
        option.department,
        option.jobTitle,
      ]
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(normalized),
    );
  }, [eligibleOptions, query]);
  const selectedOption = eligibleOptions.find(
    (option) => option.userId === targetStaffUserId,
  );
  const retryTargetId =
    latestTransfer?.status === "failed" ||
    latestTransfer?.status === "needs_confirmation"
      ? latestTransfer.targetAssigneeUserId
      : "";

  useEffect(() => {
    if (!state.eventId) return;
    router.refresh();
  }, [router, state.eventId]);

  useEffect(() => {
    if (latestTransfer?.status !== "pending") return;
    let refreshCount = 0;
    const timer = window.setInterval(() => {
      refreshCount += 1;
      router.refresh();
      if (refreshCount >= 24) window.clearInterval(timer);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [latestTransfer?.status, router]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !actionPending) setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionPending, open]);

  function openDialog() {
    setTargetStaffUserId(
      eligibleOptions.some((option) => option.userId === retryTargetId)
        ? retryTargetId
        : "",
    );
    setOpen(true);
  }

  return (
    <div className="assignee-transfer-control">
      {latestTransfer?.status === "pending" ? (
        <span className="assignee-transfer-state is-pending" role="status">
          {currentAssigneeDisplayName} → {latestTransfer.targetAssigneeDisplayName}
          <small>리걸프렌즈 동기화 중</small>
        </span>
      ) : null}
      {latestTransfer?.status === "failed" ||
      latestTransfer?.status === "needs_confirmation" ? (
        <span className="assignee-transfer-state is-error" role="alert">
          {latestTransfer.status === "needs_confirmation"
            ? "리걸프렌즈 확인 필요"
            : "담당자 변경 실패"}
          <small>{latestTransfer.lastError ?? "처리 결과를 확인해 주세요."}</small>
        </span>
      ) : null}
      {canChange && latestTransfer?.status !== "pending" ? (
        <button
          className="assignee-transfer-trigger"
          onClick={openDialog}
          type="button"
        >
          {latestTransfer?.status === "failed" ||
          latestTransfer?.status === "needs_confirmation"
            ? "다시 동기화"
            : "변경"}
        </button>
      ) : null}

      {open && !state.eventId ? (
        <div
          aria-labelledby="assignee-transfer-title"
          aria-modal="true"
          className="assignee-transfer-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionPending) {
              setOpen(false);
            }
          }}
          role="dialog"
        >
          <form action={action} className="assignee-transfer-dialog">
            <header>
              <div>
                <p className="section-kicker">ASSIGNEE TRANSFER</p>
                <h2 id="assignee-transfer-title">담당자 변경</h2>
                <p>
                  리걸프렌즈 변경이 성공한 뒤 ERP 담당자도 함께 확정됩니다.
                </p>
              </div>
              <button
                aria-label="담당자 변경 창 닫기"
                className="assignee-transfer-close"
                disabled={actionPending}
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>

            <div className="assignee-transfer-current">
              <span>현재 담당자</span>
              <strong>{currentAssigneeDisplayName}</strong>
            </div>

            <label className="assignee-transfer-search">
              <span>새 담당자 검색</span>
              <input
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름·부서·직책"
                type="search"
                value={query}
              />
            </label>

            <fieldset className="assignee-transfer-options">
              <legend>새 담당자</legend>
              {visibleOptions.length ? (
                visibleOptions.map((option) => (
                  <label
                    className={
                      targetStaffUserId === option.userId ? "is-selected" : ""
                    }
                    key={option.userId}
                  >
                    <input
                      checked={targetStaffUserId === option.userId}
                      name="targetStaffUserId"
                      onChange={() => setTargetStaffUserId(option.userId)}
                      type="radio"
                      value={option.userId}
                    />
                    <span>
                      <strong>{option.displayName}</strong>
                      <small>
                        {option.department} · {option.jobTitle}
                      </small>
                    </span>
                  </label>
                ))
              ) : (
                <p>조건에 맞는 변경 가능 직원이 없습니다.</p>
              )}
            </fieldset>

            <label className="assignee-transfer-reason">
              <span>변경 사유</span>
              <select
                name="reason"
                onChange={(event) => setReason(event.target.value)}
                required
                value={reason}
              >
                <option value="">사유 선택</option>
                {reasons.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div className="assignee-transfer-preview" aria-live="polite">
              <span>변경 결과</span>
              <strong>
                {currentAssigneeDisplayName} → {selectedOption?.displayName ?? "새 담당자"}
              </strong>
              <small>ERP 상담과 리걸프렌즈 사건에 함께 적용됩니다.</small>
            </div>

            {state.error ? (
              <p className="assignee-transfer-error" role="alert">
                {state.error}
              </p>
            ) : null}

            <footer>
              <button
                className="secondary-button"
                disabled={actionPending}
                onClick={() => setOpen(false)}
                type="button"
              >
                취소
              </button>
              <button
                className="primary-button"
                disabled={
                  actionPending || !targetStaffUserId || !reason
                }
                type="submit"
              >
                {actionPending
                  ? "변경 요청 중…"
                  : `${selectedOption?.displayName ?? "선택한 직원"} 담당자로 변경`}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
