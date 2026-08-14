"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  PhoneDeskCall,
  PhoneDeskStaffOption,
} from "../../lib/gateway";

export function PhoneCallResolutionForm({
  call,
  staffOptions,
}: {
  call: PhoneDeskCall;
  staffOptions: PhoneDeskStaffOption[];
}) {
  const router = useRouter();
  const observedStaffUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const participant of call.participants) {
      if (participant.staffUserId) ids.add(participant.staffUserId);
    }
    return ids;
  }, [call]);
  const [finalStaffUserId, setFinalStaffUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function resolve() {
    if (!finalStaffUserId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/phone-desk/calls/${call.id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ finalStaffUserId }),
      });
      const body = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.message ?? "최종 통화자를 저장하지 못했습니다.");
      }
      router.refresh();
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "최종 통화자를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="phone-call-resolution" aria-labelledby="call-resolution-heading">
      <div>
        <p className="eyebrow">FINAL PARTICIPANT</p>
        <h2 id="call-resolution-heading">마지막으로 통화한 직원을 확인해 주세요</h2>
        <p>
          고객 통화의 마지막 연결 근거가 끊겨 자동으로 담당자를 단정할 수 없습니다.
          실제로 통화한 직원을 선택하면 남아 있는 확인 필요 원장을 종료하고 후처리 입력을
          바로 엽니다.
        </p>
      </div>
      {staffOptions.length ? (
        <label className="phone-call-resolution-select">
          <span>실제 통화자</span>
          <select
            onChange={(event) => setFinalStaffUserId(event.target.value)}
            value={finalStaffUserId}
          >
            <option value="">담당자 선택</option>
            {staffOptions.map((staff) => (
              <option key={staff.staffUserId} value={staff.staffUserId}>
                {observedStaffUserIds.has(staff.staffUserId)
                  ? "통화 원장 참여 · "
                  : ""}
                {staff.displayName} · {staff.department} · {staff.jobTitle}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="error-banner">
          선택 가능한 활성 직원 정보가 없습니다. 관리자에게 직원 계정 상태를 확인해 주세요.
        </p>
      )}
      {error ? <p className="phone-aftercare-error" role="alert">{error}</p> : null}
      <button
        className="primary-button"
        disabled={!finalStaffUserId || saving}
        onClick={resolve}
        type="button"
      >
        {saving ? "확정 중…" : "이 직원을 최종 통화자로 확정"}
      </button>
    </section>
  );
}
