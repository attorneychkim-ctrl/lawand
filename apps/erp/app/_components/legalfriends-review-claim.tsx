"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { ConsultationDetail } from "../../lib/gateway";

type Match = ConsultationDetail["legalFriendsMatches"][number];
type HandlingMode = "existing_case" | "new_matter" | "shared_contact";

function caseTypeLabel(caseType: number) {
  if (caseType === 1) return "개인회생";
  if (caseType === 2) return "파산면책";
  return "기타 사건";
}

function caseLabel(match: Match) {
  return [
    match.clientName,
    caseTypeLabel(match.caseType),
    match.caseNumber ?? match.caseName ?? `Case ID ${match.caseIdx}`,
    match.staffNames.length > 0
      ? `담당 ${match.staffNames.join(" · ")}`
      : "담당 미확인",
  ].join(" · ");
}

export function LegalFriendsReviewClaim({
  consultationId,
  matches,
}: {
  consultationId: string;
  matches: Match[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<HandlingMode>("existing_case");
  const [selectedCaseKey, setSelectedCaseKey] = useState(
    matches[0] ? `${matches[0].clientIdx}:${matches[0].caseIdx}` : "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selectedMatch = useMemo(
    () =>
      matches.find(
        (match) =>
          `${match.clientIdx}:${match.caseIdx}` === selectedCaseKey,
      ),
    [matches, selectedCaseKey],
  );

  async function claim() {
    setError("");
    if (mode === "existing_case" && !selectedMatch) {
      setError("문의와 연결할 기존 사건을 선택해 주세요.");
      return;
    }
    const description =
      mode === "existing_case"
        ? "기존 사건 문의로 연결하고 리걸프렌즈 신건은 만들지 않습니다."
        : mode === "new_matter"
          ? "기존 고객의 새 사건으로 리걸프렌즈 신건 등록을 진행합니다."
          : "연락처를 함께 쓰는 다른 사람의 새 상담으로 리걸프렌즈 신건 등록을 진행합니다.";
    if (!window.confirm(`${description}\n이 상담을 내가 맡을까요?`)) return;

    setPending(true);
    try {
      const legalFriendsHandling =
        mode === "existing_case" && selectedMatch
          ? {
              mode,
              clientIdx: selectedMatch.clientIdx,
              caseIdx: selectedMatch.caseIdx,
            }
          : { mode };
      const response = await fetch(
        `/api/consultations/${consultationId}/claim`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ legalFriendsHandling }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(body?.message ?? "상담을 배정하지 못했습니다.");
      }
      router.refresh();
    } catch (claimError) {
      setError(
        claimError instanceof Error
          ? claimError.message
          : "상담을 배정하지 못했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="legalfriends-review-title"
      className="erp-panel legalfriends-review-card"
    >
      <div>
        <p className="section-kicker">LEGALFRIENDS MATCH</p>
        <h2 id="legalfriends-review-title">기존 고객 처리 확인</h2>
        <p>
          같은 연락처가 리걸프렌즈에 있습니다. 이번 문의의 성격을 선택한
          뒤 담당자를 지정해 주세요.
        </p>
      </div>

      <fieldset className="legalfriends-review-options">
        <legend>처리 방법</legend>
        <label>
          <input
            checked={mode === "existing_case"}
            name="legalfriends-handling"
            onChange={() => setMode("existing_case")}
            type="radio"
          />
          <span>
            <strong>기존 사건 문의</strong>
            <small>선택한 사건에 연결하고 리걸프렌즈 신건은 만들지 않음</small>
          </span>
        </label>
        <label>
          <input
            checked={mode === "new_matter"}
            name="legalfriends-handling"
            onChange={() => setMode("new_matter")}
            type="radio"
          />
          <span>
            <strong>기존 고객의 새 사건</strong>
            <small>현재 상담을 새 사건으로 등록</small>
          </span>
        </label>
        <label>
          <input
            checked={mode === "shared_contact"}
            name="legalfriends-handling"
            onChange={() => setMode("shared_contact")}
            type="radio"
          />
          <span>
            <strong>연락처를 함께 쓰는 다른 사람</strong>
            <small>명의가 다른 신규 고객 상담으로 등록</small>
          </span>
        </label>
      </fieldset>

      {mode === "existing_case" ? (
        <label className="legalfriends-case-select">
          <span>연결할 사건</span>
          <select
            onChange={(event) => setSelectedCaseKey(event.target.value)}
            value={selectedCaseKey}
          >
            {matches.map((match) => (
              <option
                key={`${match.clientIdx}:${match.caseIdx}`}
                value={`${match.clientIdx}:${match.caseIdx}`}
              >
                {caseLabel(match)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="legalfriends-review-action">
        <button
          className="claim-button"
          disabled={pending}
          onClick={() => void claim()}
          type="button"
        >
          {pending ? "배정 중…" : "선택 후 상담하기"}
        </button>
        {error ? (
          <p className="claim-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
