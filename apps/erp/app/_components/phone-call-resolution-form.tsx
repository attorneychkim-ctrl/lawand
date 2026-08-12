"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { PhoneDeskCall } from "../../lib/gateway";

export function PhoneCallResolutionForm({ call }: { call: PhoneDeskCall }) {
  const router = useRouter();
  const candidates = useMemo(() => {
    const byStaffAndEndpoint = new Map<string, (typeof call.participants)[number]>();
    for (const participant of call.participants) {
      if (!participant.staffUserId || participant.state !== "ended") continue;
      byStaffAndEndpoint.set(
        `${participant.staffUserId}:${participant.endpointId}`,
        participant,
      );
    }
    return [...byStaffAndEndpoint.values()];
  }, [call]);
  const [finalLegId, setFinalLegId] = useState(candidates[0]?.legId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function resolve() {
    if (!finalLegId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/phone-desk/calls/${call.id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ finalLegId }),
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
          전화기에서는 통화 종료가 확인됐지만 호전환 뒤 고객과 마지막으로 연결된 직원을
          자동으로 단정할 근거가 없습니다. 실제 통화자를 선택하면 그 직원의 후처리 화면이
          바로 열립니다.
        </p>
      </div>
      {candidates.length ? (
        <div className="phone-call-resolution-options">
          {candidates.map((candidate) => (
            <label key={`${candidate.staffUserId}:${candidate.endpointId}`}>
              <input
                checked={finalLegId === candidate.legId}
                name="final-participant"
                onChange={() => setFinalLegId(candidate.legId)}
                type="radio"
              />
              <span>
                <strong>{candidate.displayName ?? "직원 이름 확인 필요"}</strong>
                <small>내선 {candidate.extension}</small>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="error-banner">
          선택 가능한 직원 연결 정보가 없습니다. 전화 담당자에게 원장 확인을 요청해 주세요.
        </p>
      )}
      {error ? <p className="phone-aftercare-error" role="alert">{error}</p> : null}
      <button
        className="primary-button"
        disabled={!finalLegId || saving}
        onClick={resolve}
        type="button"
      >
        {saving ? "확정 중…" : "이 직원을 최종 통화자로 확정"}
      </button>
    </section>
  );
}
