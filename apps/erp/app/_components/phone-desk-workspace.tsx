"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  PhoneDeskCall,
  PhoneDeskCallResult,
  PhoneDeskCallSnapshot,
} from "../../lib/gateway";

type SourceFilter = "all" | PhoneDeskCall["source"];
type ConnectionState = "connecting" | "connected" | "disconnected";

const sourceCopy: Record<
  PhoneDeskCall["source"],
  { label: string; description: string }
> = {
  inbound: { label: "수신", description: "고객 수신전화" },
  click_to_call: { label: "ERP 발신", description: "클릭투콜" },
  centrex_direct: {
    label: "직접 발신",
    description: "센트릭스 직접 발신",
  },
};

const stateCopy: Record<PhoneDeskCall["state"], string> = {
  pending: "발신 준비 중",
  ringing: "호출 중",
  connected: "통화 중",
  ended: "통화 종료",
  failed: "발신 실패",
  unknown: "확인 필요",
};

const resultCopy: Record<PhoneDeskCallResult, string> = {
  consultation_completed: "상담완료",
  reconsultation_required: "재상담필요",
  no_answer: "부재 및 무응답",
  busy: "통화중",
  manager_callback_requested: "담당자 연결 요청",
  rejected: "거절",
  public_institution: "법원 등 관공서",
  creditor: "채권자 등",
  wrong_number: "잘못 걸린 전화",
  other: "기타",
};

const filters: Array<{ key: SourceFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "inbound", label: "수신" },
  { key: "click_to_call", label: "ERP 발신" },
  { key: "centrex_direct", label: "직접 발신" },
];

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}분 ${remainder}초` : `${remainder}초`;
}

function caseTypeLabel(caseType: number) {
  return caseType === 1
    ? "개인회생"
    : caseType === 2
      ? "파산면책"
      : "기타사건";
}

function customerSearchText(call: PhoneDeskCall) {
  const clickTarget = call.clickToCall?.consultation?.displayName ??
    call.clickToCall?.directoryClient?.displayName ?? "";
  const match = call.customerMatch;
  if (!match) return clickTarget;
  if (match.source === "consultation") {
    return `${clickTarget} ${match.consultation.displayName} ${match.consultation.publicReceiptCode} ${match.consultation.assigneeDisplayName ?? ""}`;
  }
  return `${clickTarget} ${match.clientName} ${match.cases.flatMap((item) => item.staffNames).join(" ")}`;
}

function CustomerSummary({ call }: { call: PhoneDeskCall }) {
  if (call.clickToCall?.consultation) {
    const consultation = call.clickToCall.consultation;
    return (
      <Link
        className="phone-desk-customer-link"
        href={`/consultations/${consultation.id}`}
      >
        <strong>{consultation.displayName}</strong>
        <span>
          상담데스크 · {consultation.publicReceiptCode} · 담당 {call.clickToCall.requestedBy.displayName}
        </span>
      </Link>
    );
  }
  if (call.clickToCall?.directoryClient) {
    return (
      <span className="phone-desk-customer">
        <strong>{call.clickToCall.directoryClient.displayName}</strong>
        <span>
          리걸프렌즈 고객찾기 · 담당 {call.clickToCall.requestedBy.displayName}
        </span>
      </span>
    );
  }
  if (!call.customerMatch) {
    return (
      <span className="phone-desk-customer unknown">
        <strong>발신자 정보 없음</strong>
        <span>전화번호만 확인됨</span>
      </span>
    );
  }
  if (call.customerMatch.source === "consultation") {
    const consultation = call.customerMatch.consultation;
    return (
      <Link
        className="phone-desk-customer-link"
        href={`/consultations/${consultation.id}`}
      >
        <strong>{consultation.displayName}</strong>
        <span>
          상담데스크 · {consultation.publicReceiptCode}
          {consultation.assigneeDisplayName
            ? ` · 담당 ${consultation.assigneeDisplayName}`
            : " · 담당 미배정"}
        </span>
      </Link>
    );
  }
  const latestCase = call.customerMatch.cases[0];
  return (
    <span className="phone-desk-customer">
      <strong>{call.customerMatch.clientName}</strong>
      <span>
        리걸프렌즈 · {latestCase ? caseTypeLabel(latestCase.caseType) : "사건 정보 없음"}
        {latestCase?.staffNames.length
          ? ` · 담당 ${latestCase.staffNames.join("·")}`
          : ""}
        {call.customerMatch.cases.length > 1
          ? ` 외 ${call.customerMatch.cases.length - 1}건`
          : ""}
      </span>
    </span>
  );
}

function CallTiming({ call }: { call: PhoneDeskCall }) {
  if (call.state === "pending") return <span>센트릭스 응답 대기</span>;
  if (call.state === "failed") return <span>발신 명령 실패</span>;
  if (call.state === "unknown") return <span>전화기 상태 확인 필요</span>;
  if (call.state === "connected" && call.durationSeconds === null) {
    return <span>현재 통화 중</span>;
  }
  if (call.durationSeconds !== null) {
    return <span>통화 {formatDuration(call.durationSeconds)}</span>;
  }
  if (call.ringSeconds !== null) {
    return <span>연결 없음 · {formatDuration(call.ringSeconds)} 울림</span>;
  }
  return <span>통화 시간 확인 중</span>;
}

export function PhoneDeskWorkspace({
  initialSnapshot,
}: {
  initialSnapshot: PhoneDeskCallSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [connection, setConnection] =
    useState<ConnectionState>("connecting");
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const requestSequence = useRef(0);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const response = await fetch("/api/phone-desk/calls", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("phone_desk_sync_failed");
    const next = (await response.json()) as PhoneDeskCallSnapshot;
    if (
      !Array.isArray(next.items) ||
      typeof next.snapshotAt !== "string" ||
      sequence !== requestSequence.current
    ) {
      if (sequence === requestSequence.current) {
        throw new Error("phone_desk_sync_invalid");
      }
      return;
    }
    setSnapshot(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    const stream = new EventSource("/api/phone-desk/stream");
    const handleChange = () => {
      void refresh().catch(() => {
        if (!disposed) setConnection("disconnected");
      });
    };
    stream.addEventListener("telephony.desk.sync", handleChange);
    stream.addEventListener("telephony.desk.changed", handleChange);
    stream.onopen = () => {
      if (!disposed) setConnection("connected");
    };
    stream.onerror = () => {
      if (!disposed) setConnection("disconnected");
    };
    return () => {
      disposed = true;
      requestSequence.current += 1;
      stream.removeEventListener("telephony.desk.sync", handleChange);
      stream.removeEventListener("telephony.desk.changed", handleChange);
      stream.close();
    };
  }, [refresh]);

  const completeFollowUp = useCallback(async (taskId: string) => {
    setCompletingTaskIds((current) => new Set(current).add(taskId));
    try {
      const response = await fetch(
        `/api/phone-desk/follow-ups/${taskId}/complete`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.message ?? "재통화 업무를 완료하지 못했습니다.");
      }
      await refresh();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "재통화 업무를 완료하지 못했습니다.",
      );
    } finally {
      setCompletingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }, [refresh]);

  const metrics = useMemo(() => ({
    total: snapshot.items.length,
    inbound: snapshot.items.filter((item) => item.source === "inbound").length,
    click: snapshot.items.filter((item) => item.source === "click_to_call").length,
    direct: snapshot.items.filter((item) => item.source === "centrex_direct").length,
    active: snapshot.items.filter((item) =>
      ["pending", "ringing", "connected"].includes(item.state),
    ).length,
  }), [snapshot.items]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.replace(/\s/g, "").toLowerCase();
    return snapshot.items.filter((call) => {
      if (filter !== "all" && call.source !== filter) return false;
      if (!normalizedQuery) return true;
      const staffNames = [
        ...call.endpointOwners.map((owner) => owner.displayName),
        call.clickToCall?.requestedBy.displayName ?? "",
      ].join(" ");
      const haystack = `${call.remotePhone} ${formatPhone(call.remotePhone)} ${customerSearchText(call)} ${staffNames} ${call.endpoint.extension}`
        .replace(/\s/g, "")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [filter, query, snapshot.items]);

  return (
    <section className="phone-desk-workspace">
      <div className="phone-desk-metrics" aria-label="전화 원장 요약">
        <div><span>전체</span><strong>{metrics.total}</strong></div>
        <div><span>수신</span><strong>{metrics.inbound}</strong></div>
        <div><span>ERP 발신</span><strong>{metrics.click}</strong></div>
        <div><span>직접 발신</span><strong>{metrics.direct}</strong></div>
        <div className={metrics.active ? "is-active" : undefined}>
          <span>진행 중</span><strong>{metrics.active}</strong>
        </div>
      </div>

      <section className="phone-follow-up-queue" aria-label="재통화 업무 큐">
        <div className="phone-follow-up-heading">
          <div>
            <p className="eyebrow">FOLLOW-UP QUEUE</p>
            <h2>재통화 업무</h2>
          </div>
          <span className="count-badge">미완료 {snapshot.followUps.length}건</span>
        </div>
        {snapshot.followUps.length === 0 ? (
          <p className="phone-follow-up-empty">예정된 재통화 업무가 없습니다.</p>
        ) : (
          <div className="phone-follow-up-list">
            {snapshot.followUps.map((task) => {
              const overdue =
                currentTime !== null &&
                new Date(task.dueAt).getTime() < currentTime;
              return (
                <article className={overdue ? "is-overdue" : undefined} key={task.id}>
                  <div>
                    <span className="phone-follow-up-result">{resultCopy[task.result]}</span>
                    <strong>{formatDateTime(task.dueAt)}</strong>
                    <span>{overdue ? "기한 지남" : "재통화 예정"} · 담당 {task.assignee.displayName}</span>
                  </div>
                  <div className="phone-follow-up-actions">
                    <Link href={`/phone-desk/${task.callId}`}>통화 상세</Link>
                    {task.consultationId ? (
                      <Link href={`/consultations/${task.consultationId}`}>상담 상세</Link>
                    ) : null}
                    <button
                      disabled={completingTaskIds.has(task.id)}
                      onClick={() => void completeFollowUp(task.id)}
                      type="button"
                    >
                      {completingTaskIds.has(task.id) ? "완료 중…" : "업무 완료"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="phone-desk-panel">
        <div className="phone-desk-toolbar">
          <label className="phone-desk-search">
            <span className="sr-only">전화번호, 고객명 또는 담당자 검색</span>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="전화번호, 고객명, 담당자 검색"
              type="search"
              value={query}
            />
          </label>
          <div className="phone-desk-filters" role="group" aria-label="통화 구분">
            {filters.map((item) => (
              <button
                aria-pressed={filter === item.key}
                className={filter === item.key ? "is-active" : undefined}
                key={item.key}
                onClick={() => setFilter(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className={`phone-desk-realtime is-${connection}`}>
            <i aria-hidden="true" />
            {connection === "connected" ? "실시간 연결됨" : "재연결 중"}
          </span>
        </div>

        <div className="phone-desk-list">
          {visibleItems.length === 0 ? (
            <p className="phone-desk-empty">
              조건에 맞는 전화 원장이 없습니다.
            </p>
          ) : visibleItems.map((call) => {
            const source = sourceCopy[call.source];
            const staffLabel = call.clickToCall
              ? call.clickToCall.requestedBy.displayName
              : call.endpointOwners.map((owner) => owner.displayName).join(" · ") ||
                "회선 담당 미지정";
            return (
              <article className="phone-desk-row" key={call.id}>
                <div className={`phone-desk-direction is-${call.source}`}>
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M7.8 3.8 10 8.5 7.5 10a14.3 14.3 0 0 0 6.5 6.5l1.5-2.5 4.7 2.2v3a1.8 1.8 0 0 1-1.8 1.8A15.4 15.4 0 0 1 3 5.6a1.8 1.8 0 0 1 1.8-1.8h3Z" />
                    {call.direction === "inbound"
                      ? <path d="m14.5 3.5-4 4M10.5 3.5v4h4" />
                      : <path d="m10.5 7.5 4-4M10.5 3.5h4v4" />}
                  </svg>
                </div>
                <div className="phone-desk-main">
                  <div className="phone-desk-row-heading">
                    <span className={`phone-desk-source is-${call.source}`}>
                      {source.label}
                    </span>
                    <strong>{formatPhone(call.remotePhone)}</strong>
                    <span>{source.description}</span>
                    {call.receptionMode === "uplus_network" ? (
                      <span className="phone-desk-linked">U+ 앱/망 수신</span>
                    ) : null}
                    {call.clickToCall?.observationLink ? (
                      <span className="phone-desk-linked">관측 연결됨</span>
                    ) : null}
                    {call.aftercare ? (
                      <span className={`phone-desk-result is-${call.aftercare.result}`}>
                        {resultCopy[call.aftercare.result]}
                      </span>
                    ) : call.state === "ended" ? (
                      <span className="phone-desk-result is-needed">후처리 필요</span>
                    ) : null}
                  </div>
                  <CustomerSummary call={call} />
                </div>
                <div className="phone-desk-assignment">
                  <strong>{staffLabel}</strong>
                  <span>내선 {call.endpoint.extension}</span>
                </div>
                <div className="phone-desk-status">
                  <span className={`is-${call.state}`}>{stateCopy[call.state]}</span>
                  <CallTiming call={call} />
                </div>
                <time dateTime={call.occurredAt}>
                  {formatDateTime(call.occurredAt)}
                </time>
                <Link className="phone-desk-detail-link" href={`/phone-desk/${call.id}`}>
                  상세·후처리
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
