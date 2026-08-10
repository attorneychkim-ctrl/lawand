"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import type {
  PhoneDeskCallSnapshot,
  TelephonyInboundCall,
  TelephonyInboundCallSnapshot,
} from "../../lib/gateway";
import { PhoneAftercareDialog } from "./phone-aftercare-form";

type ConnectionState = "connecting" | "connected" | "disconnected";

const stateCopy: Record<
  TelephonyInboundCall["state"],
  { label: string; description: string }
> = {
  ringing: {
    label: "수신전화",
    description: "전화가 오고 있어요",
  },
  connected: {
    label: "통화 중",
    description: "전화가 연결됐어요",
  },
  ended: {
    label: "통화 종료",
    description: "수신전화가 종료됐어요",
  },
};

function ownerLabel(call: TelephonyInboundCall, staffUserId: string) {
  if (
    call.owners.some((owner) => owner.staffUserId === staffUserId)
  ) {
    return "내 전화";
  }
  if (call.owners.length === 0) return "담당 회선 미지정";
  return `${call.owners.map((owner) => owner.displayName).join(" · ")}님 전화`;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (/^02\d{7}$/.test(digits)) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  if (/^02\d{8}$/.test(digits)) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (/^\d{10}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function caseTypeLabel(caseType: number) {
  return caseType === 1 ? "개인회생" : caseType === 2 ? "파산면책" : "기타사건";
}

function caseStateLabel(caseType: number, caseState: number) {
  const states = caseType === 2
    ? new Map([[5, "상담대기"], [10, "상담완료"], [11, "재상담필요"], [15, "계약"], [20, "서류준비"], [21, "부채증명서 발급중"], [22, "부채증명서 발급완료"], [25, "신청서 작성 진행중"], [30, "신청서 제출"], [40, "보정기간"], [100, "파산선고"], [105, "의견청취기일"], [110, "재산환가 및 배당"], [115, "파산폐지"], [120, "면책결정"], [125, "면책불허가"]])
    : new Map([[5, "상담대기"], [10, "상담완료"], [11, "재상담필요"], [15, "계약"], [20, "서류준비"], [21, "부채증명서 발급중"], [22, "부채증명서 발급완료"], [25, "신청서 작성 진행중"], [30, "신청서 제출"], [35, "금지명령"], [40, "보정기간"], [45, "개시결정"], [50, "채권자 집회기일"], [55, "인가결정"]]);
  return states.get(caseState) ?? `진행 상태 ${caseState}`;
}

function CustomerMatch({ call }: { call: TelephonyInboundCall }) {
  if (!call.customerMatch) return <span className="inbound-customer unknown">발신자 정보 없음</span>;
  if (call.customerMatch.source === "consultation") {
    const { consultation } = call.customerMatch;
    return <Link className="inbound-customer" href={`/consultations/${consultation.id}`}>
      상담데스크 · {consultation.displayName} · {consultation.state}{consultation.assigneeDisplayName ? ` · 담당 ${consultation.assigneeDisplayName}` : ""}
    </Link>;
  }
  const match = call.customerMatch;
  const latestCase = match.cases[0];
  return <span className="inbound-customer">
    리걸프렌즈 · {match.clientName} · {caseTypeLabel(latestCase.caseType)} · {caseStateLabel(latestCase.caseType, latestCase.caseState)}{latestCase.staffNames.length ? ` · 담당 ${latestCase.staffNames.join("·")}` : ""}{match.cases.length > 1 ? ` 외 ${match.cases.length - 1}건` : ""}
  </span>;
}

export function InboundCallIndicator({
  staffUserId,
}: {
  staffUserId: string;
}) {
  const [calls, setCalls] = useState<TelephonyInboundCall[]>([]);
  const [connection, setConnection] =
    useState<ConnectionState>("connecting");
  const [answeringCallIds, setAnsweringCallIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>(
    {},
  );
  const [aftercareCallId, setAftercareCallId] = useState<string | null>(null);
  const [pendingAftercareCallIds, setPendingAftercareCallIds] = useState<
    string[]
  >([]);
  const requestSequence = useRef(0);
  const deskRequestSequence = useRef(0);
  const deskStartedAt = useRef(0);
  const seenDeskEndedCallIds = useRef<Set<string>>(new Set());

  const enqueueAftercareCalls = useCallback((callIds: string[]) => {
    setPendingAftercareCallIds((current) => {
      const next = [...current];
      let changed = false;
      for (const callId of callIds) {
        if (
          next.includes(callId) ||
          window.sessionStorage.getItem(`lawand:phone-aftercare:${callId}`)
        ) {
          continue;
        }
        next.push(callId);
        changed = true;
      }
      return changed ? next : current;
    });
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const response = await fetch("/api/telephony-inbound-calls", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("telephony_inbound_sync_failed");
    const snapshot = (await response.json()) as TelephonyInboundCallSnapshot;
    if (
      !Array.isArray(snapshot.items) ||
      typeof snapshot.snapshotAt !== "string" ||
      sequence !== requestSequence.current
    ) {
      if (sequence === requestSequence.current) {
        throw new Error("telephony_inbound_sync_invalid");
      }
      return;
    }
    setCalls(snapshot.items);
  }, []);

  const answerCall = useCallback(async (callId: string) => {
    setAnsweringCallIds((current) => new Set(current).add(callId));
    setAnswerErrors((current) => {
      const next = { ...current };
      delete next[callId];
      return next;
    });
    try {
      const response = await fetch(
        `/api/telephony-inbound-calls/${callId}/answer`,
        { method: "POST", headers: { accept: "application/json" } },
      );
      const body = (await response.json().catch(() => null)) as
        | (NonNullable<TelephonyInboundCall["answerCommand"]> & {
            message?: string;
          })
        | null;
      if (!response.ok || !body?.id) {
        throw new Error(body?.message ?? "전화 받기 요청에 실패했습니다.");
      }
      setCalls((current) => current.map((call) =>
        call.id === callId
          ? { ...call, answerCommand: body }
          : call,
      ));
    } catch (error) {
      setAnswerErrors((current) => ({
        ...current,
        [callId]: error instanceof Error
          ? error.message
          : "전화 받기 요청에 실패했습니다.",
      }));
    } finally {
      setAnsweringCallIds((current) => {
        const next = new Set(current);
        next.delete(callId);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    void refresh().catch(() => {
      if (!disposed) setConnection("disconnected");
    });

    const stream = new EventSource(
      "/api/telephony-inbound-calls/stream",
    );
    const handleChange = () => {
      void refresh().catch(() => {
        if (!disposed) setConnection("disconnected");
      });
    };
    stream.addEventListener("telephony.inbound.sync", handleChange);
    stream.addEventListener("telephony.inbound.changed", handleChange);
    stream.onopen = () => {
      if (!disposed) setConnection("connected");
    };
    stream.onerror = () => {
      if (!disposed) setConnection("disconnected");
    };

    return () => {
      disposed = true;
      requestSequence.current += 1;
      stream.removeEventListener("telephony.inbound.sync", handleChange);
      stream.removeEventListener("telephony.inbound.changed", handleChange);
      stream.close();
    };
  }, [refresh]);

  const refreshDirectOutboundAftercare = useCallback(async () => {
    const sequence = ++deskRequestSequence.current;
    const response = await fetch("/api/phone-desk/calls", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("telephony_desk_sync_failed");
    const snapshot = (await response.json()) as PhoneDeskCallSnapshot;
    if (
      !Array.isArray(snapshot.items) ||
      typeof snapshot.snapshotAt !== "string" ||
      sequence !== deskRequestSequence.current
    ) {
      if (sequence === deskRequestSequence.current) {
        throw new Error("telephony_desk_sync_invalid");
      }
      return;
    }

    const candidates: string[] = [];
    for (const call of snapshot.items) {
      if (call.state !== "ended") continue;
      const alreadySeen = seenDeskEndedCallIds.current.has(call.id);
      seenDeskEndedCallIds.current.add(call.id);
      if (
        alreadySeen ||
        call.source !== "centrex_direct" ||
        call.aftercare ||
        !call.endedAt ||
        new Date(call.endedAt).getTime() < deskStartedAt.current - 5_000 ||
        !call.endpointOwners.some(
          (owner) => owner.staffUserId === staffUserId,
        )
      ) {
        continue;
      }
      candidates.push(call.id);
    }
    enqueueAftercareCalls(candidates);
  }, [enqueueAftercareCalls, staffUserId]);

  useEffect(() => {
    deskStartedAt.current = Date.now();
    void refreshDirectOutboundAftercare().catch(() => undefined);
    const stream = new EventSource("/api/phone-desk/stream");
    const handleChange = () => {
      void refreshDirectOutboundAftercare().catch(() => undefined);
    };
    stream.addEventListener("telephony.desk.sync", handleChange);
    stream.addEventListener("telephony.desk.changed", handleChange);
    return () => {
      deskRequestSequence.current += 1;
      stream.removeEventListener("telephony.desk.sync", handleChange);
      stream.removeEventListener("telephony.desk.changed", handleChange);
      stream.close();
    };
  }, [refreshDirectOutboundAftercare]);

  useEffect(() => {
    if (!calls.some((call) => call.state === "ended")) return;
    const timer = window.setTimeout(() => {
      void refresh().catch(() => setConnection("disconnected"));
    }, 21_000);
    return () => window.clearTimeout(timer);
  }, [calls, refresh]);

  useEffect(() => {
    enqueueAftercareCalls(
      calls.filter(
        (call) =>
        call.state === "ended" &&
        call.owners.some((owner) => owner.staffUserId === staffUserId),
      ).map((call) => call.id),
    );
  }, [calls, enqueueAftercareCalls, staffUserId]);

  useEffect(() => {
    if (aftercareCallId || pendingAftercareCallIds.length === 0) return;
    const [nextCallId] = pendingAftercareCallIds;
    setPendingAftercareCallIds((current) => current.slice(1));
    const key = `lawand:phone-aftercare:${nextCallId}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "opened");
    setAftercareCallId(nextCallId);
  }, [aftercareCallId, pendingAftercareCallIds]);

  if (calls.length === 0 && !aftercareCallId) return null;

  return (
    <>
      {calls.length > 0 ? <section
        aria-label="현재 수신전화"
        aria-live="assertive"
        className="inbound-call-strip"
      >
        <div className="inbound-call-strip-inner">
        {calls.map((call) => {
          const copy = stateCopy[call.state];
          const isOwner = call.owners.some(
            (owner) => owner.staffUserId === staffUserId,
          );
          const isAnswering = answeringCallIds.has(call.id);
          const answerInProgress =
            call.answerCommand?.status === "queued" ||
            call.answerCommand?.status === "dispatching" ||
            call.answerCommand?.status === "succeeded";
          const canAnswer =
            call.state === "ringing" && isOwner && call.answerAvailable;
          const answerLabel = isAnswering ||
            call.answerCommand?.status === "queued" ||
            call.answerCommand?.status === "dispatching"
              ? "받는 중…"
              : call.answerCommand?.status === "succeeded"
                ? "연결 확인 중"
                : call.answerCommand?.status === "failed" ||
                    call.answerCommand?.status === "expired"
                  ? "다시 받기"
                  : "전화 받기";
          return (
            <article
              className={`inbound-call-card is-${call.state}`}
              key={call.id}
            >
              <span aria-hidden="true" className="inbound-call-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M7.8 3.8 10 8.5 7.5 10a14.3 14.3 0 0 0 6.5 6.5l1.5-2.5 4.7 2.2v3a1.8 1.8 0 0 1-1.8 1.8A15.4 15.4 0 0 1 3 5.6a1.8 1.8 0 0 1 1.8-1.8h3Z" />
                </svg>
              </span>
              <span className="inbound-call-copy">
                <span className="inbound-call-title">
                  <strong>{copy.label}</strong>
                  <span>{copy.description}</span>
                </span>
                <span className="inbound-call-meta">
                  <b>{formatPhone(call.remotePhone)}</b>
                  <span>내선 {call.extension}</span>
                  <span>{ownerLabel(call, staffUserId)}</span>
                </span>
                <CustomerMatch call={call} />
                {call.state === "ringing" && !call.answerAvailable ? (
                  <span className="inbound-customer">
                    U+ 앱/망으로 온 전화예요 · 비즈콜 앱이나 연결된 단말에서 받아 주세요
                  </span>
                ) : null}
              </span>
              <span className="inbound-call-actions">
                {canAnswer ? <button
                  className="inbound-answer-button"
                  disabled={isAnswering || answerInProgress}
                  onClick={() => void answerCall(call.id)}
                  type="button"
                >
                  {answerLabel}
                </button> : null}
                {call.state === "ended" ? (
                  <button
                    className="inbound-aftercare-button"
                    onClick={() => setAftercareCallId(call.id)}
                    type="button"
                  >
                    후처리 입력
                  </button>
                ) : null}
                <span
                  className={`inbound-call-realtime is-${connection}`}
                  title={
                    connection === "connected"
                      ? "실시간 연결됨"
                      : "실시간 연결 재시도 중"
                  }
                >
                  <span aria-hidden="true" />
                  {connection === "connected"
                    ? "실시간"
                    : "재연결 중"}
                </span>
                {answerErrors[call.id] ? <span className="inbound-answer-error">
                  {answerErrors[call.id]}
                </span> : call.answerCommand?.status === "failed" ||
                  call.answerCommand?.status === "expired" ? <span className="inbound-answer-error">
                    전화기에서 받지 못했습니다. 다시 시도해 주세요.
                  </span> : null}
              </span>
            </article>
          );
        })}
        </div>
      </section> : null}
      <PhoneAftercareDialog
        callId={aftercareCallId}
        onClose={() => setAftercareCallId(null)}
        onSaved={() => {
          if (aftercareCallId) {
            window.sessionStorage.setItem(
              `lawand:phone-aftercare-saved:${aftercareCallId}`,
              "saved",
            );
          }
          setAftercareCallId(null);
          void refresh();
        }}
        open={Boolean(aftercareCallId)}
      />
    </>
  );
}
