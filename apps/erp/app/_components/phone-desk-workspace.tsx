"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ListPageSize,
  PhoneDeskCall,
  PhoneDeskCallResult,
  PhoneDeskCallSnapshot,
  PhoneDeskListFilter,
} from "../../lib/gateway";
import {
  ListPagination,
} from "./list-navigation";
import { ClickToCallButton } from "./click-to-call-button";
import { MessageComposeButton } from "./message-compose-button";
import { subscribePhoneDeskRealtime } from "./phone-desk-realtime";

type SourceFilter = PhoneDeskListFilter;
type FollowUpAssignee = { staffUserId: string; displayName: string };
type CallAssignee = { staffUserId: string; displayName: string };
type SearchCriteria = {
  query: string;
  filter: SourceFilter;
  assigneeUserId: string;
  startDate: string;
  endDate: string;
};

const UPLUS_HISTORY_DELAY_MS = 2 * 60 * 1_000;
const allFollowUpAssignees: FollowUpAssignee = {
  staffUserId: "all",
  displayName: "전체 담당자",
};
const allCallAssignees: CallAssignee = {
  staffUserId: "all",
  displayName: "전체 담당자",
};

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
  internal: { label: "내선", description: "사내 내선 통화" },
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
  internal_completed: "내선 통화 완료",
  internal_follow_up: "내부 확인 필요",
  internal_no_answer: "내선 미연결",
  other: "기타",
};

const filters: Array<{ key: SourceFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "inbound", label: "수신" },
  { key: "click_to_call", label: "ERP 발신" },
  { key: "centrex_direct", label: "직접 발신" },
  { key: "internal", label: "내선" },
  { key: "active", label: "진행 중" },
];

function formatPhone(phone: string | null) {
  if (!phone) return "";
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

function internalCallTitle(call: PhoneDeskCall) {
  const extensions = [...new Set(call.participants.map((item) => item.extension))];
  return extensions.length > 1
    ? `내선 ${extensions.join(" ↔ ")}`
    : `내선 ${extensions[0] ?? call.endpoint.extension}`;
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

function formatFollowUpWindow(start: string, end: string | null) {
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(start));
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return end
    ? `${date} ${time.format(new Date(start))}~${time.format(new Date(end))}`
    : `${date} ${time.format(new Date(start))}`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}분 ${remainder}초` : `${remainder}초`;
}

function isUplusHistoryDelayed(
  call: PhoneDeskCall,
  currentTime: number | null,
) {
  return call.state === "ringing" &&
    call.receptionMode === "uplus_network" &&
    currentTime !== null &&
    currentTime - new Date(call.ringingAt ?? call.occurredAt).getTime() >=
      UPLUS_HISTORY_DELAY_MS;
}

function callStateLabel(call: PhoneDeskCall, currentTime: number | null) {
  if (
    call.state === "ended" &&
    call.correlationStatus === "needs_confirmation"
  ) {
    return "통화자 확인 필요";
  }
  if (call.state === "ringing" && call.receptionMode === "uplus_network") {
    return isUplusHistoryDelayed(call, currentTime)
      ? "이력 반영 지연"
      : "수신 상태 확인 중";
  }
  return stateCopy[call.state];
}

function caseTypeLabel(caseType: number) {
  return caseType === 1
    ? "개인회생"
    : caseType === 2
      ? "파산면책"
      : "기타사건";
}

function callAssignees(call: PhoneDeskCall): CallAssignee[] {
  if (call.scope === "internal") {
    const seen = new Set<string>();
    return call.participants.flatMap((participant) => {
      if (
        !participant.staffUserId ||
        !participant.displayName ||
        seen.has(participant.staffUserId)
      ) {
        return [];
      }
      seen.add(participant.staffUserId);
      return [
        {
          staffUserId: participant.staffUserId,
          displayName: participant.displayName,
        },
      ];
    });
  }
  if (call.clickToCall) return [call.clickToCall.requestedBy];
  return call.endpointOwners;
}

function CustomerSummary({ call }: { call: PhoneDeskCall }) {
  if (call.scope === "internal") {
    const participants = call.participants.map((item) =>
      `${item.displayName ?? "직원 미연결"} ${item.extension}`,
    );
    return (
      <span className="phone-desk-customer">
        <strong>{participants.join(" ↔ ") || "내선 참여자 확인 중"}</strong>
        <span>고객 전화번호가 없는 사내 통화</span>
      </span>
    );
  }
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
  if (call.customerMatch.source === "staff") {
    return (
      <span className="phone-desk-customer">
        <strong>
          {call.customerMatch.staffMembers
            .map((member) => member.displayName)
            .join(" · ")}
        </strong>
        <span>
          직원 회선 · {call.customerMatch.staffMembers
            .map((member) => `내선 ${member.extension}`)
            .join(" · ")}
        </span>
      </span>
    );
  }
  if (call.customerMatch.source === "phonebook") {
    return (
      <Link className="phone-desk-customer-link" href="/phonebook">
        <strong>{call.customerMatch.contact.displayName}</strong>
        <span>전화번호부 · 저장된 발신자</span>
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

function CallTiming({
  call,
  currentTime,
}: {
  call: PhoneDeskCall;
  currentTime: number | null;
}) {
  if (
    call.state === "ended" &&
    call.correlationStatus === "needs_confirmation"
  ) {
    return <span>상세에서 최종 통화자를 선택해 주세요</span>;
  }
  if (call.state === "pending") return <span>센트릭스 응답 대기</span>;
  if (call.state === "failed") return <span>발신 명령 실패</span>;
  if (call.state === "unknown") return <span>전화기 상태 확인 필요</span>;
  if (call.state === "ringing" && call.receptionMode === "uplus_network") {
    return (
      <span>
        {isUplusHistoryDelayed(call, currentTime)
          ? "U+ 종료 이력 자동 재확인 중"
          : "U+ 종료 이력 확인 중"}
      </span>
    );
  }
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
  currentStaff,
  initialSnapshot,
  todayKey,
}: {
  currentStaff: { staffUserId: string; displayName: string };
  initialSnapshot: PhoneDeskCallSnapshot;
  todayKey: string;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [pageSize, setPageSize] = useState<ListPageSize>(
    initialSnapshot.pageSize,
  );
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(todayKey);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(true);
  const [followUpError, setFollowUpError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [followUpAssigneeFilter, setFollowUpAssigneeFilter] = useState(
    currentStaff,
  );
  const [callAssigneeFilter, setCallAssigneeFilter] = useState<CallAssignee>(
    allCallAssignees,
  );
  const [query, setQuery] = useState("");
  const [appliedCriteria, setAppliedCriteria] = useState<SearchCriteria | null>(
    null,
  );
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const requestSequence = useRef(0);
  const followUpRequestSequence = useRef(0);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  const refreshFollowUps = useCallback(async () => {
    const sequence = ++followUpRequestSequence.current;
    setFollowUpLoading(true);
    setFollowUpError("");
    try {
      const response = await fetch("/api/phone-desk/follow-ups", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("follow_up_sync_failed");
      const value = (await response.json()) as {
        items?: PhoneDeskCallSnapshot["followUps"];
      };
      if (!Array.isArray(value.items)) {
        throw new Error("follow_up_sync_invalid");
      }
      if (sequence !== followUpRequestSequence.current) return;
      const items = value.items;
      setSnapshot((current) => ({ ...current, followUps: items }));
    } catch {
      if (sequence === followUpRequestSequence.current) {
        setFollowUpError("재통화 업무를 불러오지 못했습니다.");
      }
    } finally {
      if (sequence === followUpRequestSequence.current) {
        setFollowUpLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refreshFollowUps());
    return subscribePhoneDeskRealtime((message) => {
      if (
        message.kind === "sync" ||
        message.payload.eventType === "follow_up.changed"
      ) {
        void refreshFollowUps();
      }
    });
  }, [refreshFollowUps]);

  const refresh = useCallback(async (
    criteria: SearchCriteria,
    nextPage: number,
    nextPageSize: ListPageSize,
  ) => {
    await Promise.resolve();
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(nextPageSize),
        filter: criteria.filter,
        from: `${criteria.startDate}T00:00:00+09:00`,
        to: `${criteria.endDate}T23:59:59.999+09:00`,
      });
      if (criteria.query) params.set("q", criteria.query);
      if (criteria.assigneeUserId !== "all") {
        params.set("assigneeUserId", criteria.assigneeUserId);
      }
      const response = await fetch(`/api/phone-desk/calls?${params}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("phone_desk_sync_failed");
      const next = (await response.json()) as PhoneDeskCallSnapshot;
      if (
        !Array.isArray(next.items) ||
        typeof next.snapshotAt !== "string" ||
        typeof next.total !== "number" ||
        sequence !== requestSequence.current
      ) {
        if (sequence === requestSequence.current) {
          throw new Error("phone_desk_sync_invalid");
        }
        return;
      }
      setSnapshot((current) => ({
        ...next,
        followUps: current.followUps,
      }));
      setPageSize(next.pageSize);
      setAppliedCriteria(criteria);
      setHasSearched(true);
    } catch (error) {
      setLoadError(
        error instanceof Error && error.message === "phone_desk_sync_failed"
          ? "전화 내역을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요."
          : "검색 조건을 확인해 주세요.",
      );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  const submitSearch = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    const isPhoneQuery = Boolean(normalizedQuery) &&
      /^[0-9() +.-]+$/.test(normalizedQuery);
    const phoneDigits = normalizedQuery.replace(/[^0-9]/g, "");
    const compactName = normalizedQuery.replace(/\s/g, "");
    if (
      normalizedQuery &&
      ((isPhoneQuery && (phoneDigits.length < 4 || phoneDigits.length > 15)) ||
        (!isPhoneQuery && (compactName.length < 2 || compactName.length > 30)))
    ) {
      setLoadError(
        isPhoneQuery
          ? "전화번호는 숫자 4자리 이상 입력해 주세요."
          : "고객명은 두 글자 이상 입력해 주세요.",
      );
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      setLoadError("조회 기간을 확인해 주세요.");
      return;
    }
    const maximumEnd = new Date(`${startDate}T00:00:00Z`);
    maximumEnd.setUTCDate(maximumEnd.getUTCDate() + 31);
    if (new Date(`${endDate}T00:00:00Z`) >= maximumEnd) {
      setLoadError("한 번에 최대 31일까지만 조회할 수 있습니다.");
      return;
    }
    setCallAssigneeFilter(allCallAssignees);
    void refresh(
      {
        query: normalizedQuery,
        filter,
        assigneeUserId: "all",
        startDate,
        endDate,
      },
      1,
      pageSize,
    );
  }, [endDate, filter, pageSize, query, refresh, startDate]);

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
      await refreshFollowUps();
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
  }, [refreshFollowUps]);

  const visibleItems = useMemo(() => {
    return snapshot.items.filter((call) => {
      if (
        callAssigneeFilter.staffUserId !== "all" &&
        !callAssignees(call).some(
          (assignee) =>
            assignee.staffUserId === callAssigneeFilter.staffUserId,
        )
      ) {
        return false;
      }
      return true;
    });
  }, [callAssigneeFilter.staffUserId, snapshot.items]);

  const callAssigneeOptions = useMemo(() => {
    const assignees = [...snapshot.assigneeOptions];
    const seen = new Set(assignees.map((assignee) => assignee.staffUserId));
    if (
      callAssigneeFilter.staffUserId !== "all" &&
      !seen.has(callAssigneeFilter.staffUserId)
    ) {
      assignees.push(callAssigneeFilter);
    }
    return assignees;
  }, [callAssigneeFilter, snapshot.assigneeOptions]);

  const followUpAssignees = useMemo(() => {
    const assignees = [currentStaff];
    const seen = new Set([currentStaff.staffUserId]);
    for (const task of snapshot.followUps) {
      if (seen.has(task.assignee.staffUserId)) continue;
      seen.add(task.assignee.staffUserId);
      assignees.push(task.assignee);
    }
    if (
      followUpAssigneeFilter.staffUserId !== "all" &&
      !seen.has(followUpAssigneeFilter.staffUserId)
    ) {
      assignees.push(followUpAssigneeFilter);
    }
    return assignees;
  }, [currentStaff, followUpAssigneeFilter, snapshot.followUps]);

  const visibleFollowUps = useMemo(
    () =>
      followUpAssigneeFilter.staffUserId === "all"
        ? snapshot.followUps
        : snapshot.followUps.filter(
            (task) =>
              task.assignee.staffUserId ===
              followUpAssigneeFilter.staffUserId,
          ),
    [followUpAssigneeFilter, snapshot.followUps],
  );

  return (
    <section className="phone-desk-workspace">
      <form className="phone-desk-query" onSubmit={submitSearch}>
        <div className="phone-desk-query-heading">
          <div>
            <p className="eyebrow">CALL SEARCH</p>
            <h2>전화 내역 찾기</h2>
          </div>
          <span>검색하기 전에는 과거 전화 원장을 읽지 않습니다.</span>
        </div>
        <label className="phone-desk-search">
          <span className="sr-only">리걸프렌즈 고객명 또는 전화번호 검색</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            autoComplete="off"
            maxLength={30}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="리걸프렌즈 고객명 또는 전화번호"
            type="search"
            value={query}
          />
        </label>
        <div className="phone-desk-query-dates">
          <label>
            <span>시작일</span>
            <input
              max={todayKey}
              onChange={(event) => setStartDate(event.target.value)}
              type="date"
              value={startDate}
            />
          </label>
          <label>
            <span>종료일</span>
            <input
              max={todayKey}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
              type="date"
              value={endDate}
            />
          </label>
        </div>
        <div className="phone-desk-filters" role="group" aria-label="통화 구분">
          {filters.filter((item) => item.key !== "active").map((item) => (
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
        <button className="primary-button phone-desk-query-submit" disabled={loading} type="submit">
          {loading ? "찾는 중…" : "전화 내역 검색"}
        </button>
      </form>

      {loadError ? <p className="error-banner" role="alert">{loadError}</p> : null}

      <section className="phone-follow-up-queue" aria-label="재통화 업무 큐">
        <div className="phone-follow-up-heading">
          <div>
            <p className="eyebrow">FOLLOW-UP QUEUE</p>
            <h2>재통화 업무</h2>
          </div>
          <div className="phone-follow-up-controls">
            <label className="phone-follow-up-assignee-filter">
              <span>담당자</span>
              <select
                onChange={(event) => {
                  const staffUserId = event.target.value;
                  setFollowUpAssigneeFilter(
                    staffUserId === "all"
                      ? allFollowUpAssignees
                      : followUpAssignees.find(
                          (assignee) =>
                            assignee.staffUserId === staffUserId,
                        ) ?? currentStaff,
                  );
                }}
                value={followUpAssigneeFilter.staffUserId}
              >
                <option value="all">전체 담당자</option>
                {followUpAssignees.map((assignee) => (
                  <option
                    key={assignee.staffUserId}
                    value={assignee.staffUserId}
                  >
                    {assignee.staffUserId === currentStaff.staffUserId
                      ? `내 업무 · ${assignee.displayName}`
                      : assignee.displayName}
                  </option>
                ))}
              </select>
            </label>
            <span className="count-badge">
              {followUpLoading ? "동기화 중" : `미완료 ${visibleFollowUps.length}건`}
            </span>
          </div>
        </div>
        {followUpError ? (
          <p className="error-banner" role="alert">{followUpError}</p>
        ) : null}
        {visibleFollowUps.length === 0 ? (
          <p className="phone-follow-up-empty">
            {snapshot.followUps.length === 0
              ? "예정된 재통화 업무가 없습니다."
              : followUpAssigneeFilter.staffUserId === currentStaff.staffUserId
                ? "내게 배정된 재통화 업무가 없습니다."
                : "선택한 담당자의 재통화 업무가 없습니다."}
          </p>
        ) : (
          <div className="phone-follow-up-list">
            {visibleFollowUps.map((task) => {
              const overdue =
                currentTime !== null &&
                new Date(task.dueEndAt ?? task.dueAt).getTime() < currentTime;
              return (
                <article className={overdue ? "is-overdue" : undefined} key={task.id}>
                  <div className="phone-follow-up-summary">
                    <div className="phone-follow-up-customer">
                      <strong>{task.customerName}</strong>
                      <span>{formatPhone(task.remotePhone) || "전화번호 확인 필요"}</span>
                    </div>
                    <div className="phone-follow-up-schedule">
                      <span className="phone-follow-up-result">
                        {task.source === "consultation_schedule"
                          ? "홈페이지 상담 예약"
                          : task.result
                            ? resultCopy[task.result]
                            : "재통화"}
                      </span>
                      <strong>{formatFollowUpWindow(task.dueAt, task.dueEndAt)}</strong>
                      <span>{overdue ? "기한 지남" : "재통화 예정"} · 담당 {task.assignee.displayName}</span>
                    </div>
                  </div>
                  <div className="phone-follow-up-actions">
                    {task.callId ? (
                      <Link href={`/phone-desk/${task.callId}`}>통화 상세</Link>
                    ) : null}
                    {task.consultationId ? (
                      <Link href={`/consultations/${task.consultationId}`}>상담 상세</Link>
                    ) : null}
                    {task.contactTarget?.source === "consultation" ? (
                      <>
                        <MessageComposeButton
                          consultationId={task.contactTarget.consultationId}
                          customerName={task.customerName}
                          receiptCode={task.contactTarget.receiptCode}
                          staffName={currentStaff.displayName}
                        />
                        <ClickToCallButton
                          consultationId={task.contactTarget.consultationId}
                          idleLabel="센트릭스 전화하기"
                          staffName={currentStaff.displayName}
                        />
                      </>
                    ) : task.contactTarget?.source === "legal_friends_directory" ? (
                      <>
                        <MessageComposeButton
                          customerName={task.customerName}
                          directoryTarget={{
                            clientIdx: task.contactTarget.clientIdx,
                            caseIdx: task.contactTarget.caseIdx,
                          }}
                          receiptCode={task.contactTarget.receiptCode}
                          staffName={currentStaff.displayName}
                        />
                        <ClickToCallButton
                          directoryTarget={{
                            clientIdx: task.contactTarget.clientIdx,
                            caseIdx: task.contactTarget.caseIdx,
                            clientName: task.customerName,
                          }}
                          idleLabel="센트릭스 전화하기"
                          staffName={currentStaff.displayName}
                        />
                      </>
                    ) : (
                      <>
                        <button disabled type="button">문자 보내기</button>
                        <button disabled type="button">센트릭스 전화하기</button>
                      </>
                    )}
                    <button
                      className="phone-follow-up-complete"
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
      {hasSearched ? <>
      <div className="phone-desk-panel">
        <div className="phone-desk-toolbar">
          <div className="phone-desk-result-copy">
            <strong>검색 결과</strong>
            <span>
              {appliedCriteria?.query ||
                `${appliedCriteria?.startDate} ~ ${appliedCriteria?.endDate}`} · {snapshot.total}건
            </span>
          </div>
          <label className="phone-desk-assignee-filter">
            <span>담당자</span>
            <select
              onChange={(event) => {
                const staffUserId = event.target.value;
                const nextAssignee =
                  staffUserId === "all"
                    ? allCallAssignees
                    : callAssigneeOptions.find(
                        (assignee) =>
                          assignee.staffUserId === staffUserId,
                      ) ?? allCallAssignees;
                setCallAssigneeFilter(nextAssignee);
                if (appliedCriteria) {
                  void refresh(
                    {
                      ...appliedCriteria,
                      assigneeUserId: nextAssignee.staffUserId,
                    },
                    1,
                    pageSize,
                  );
                }
              }}
              value={callAssigneeFilter.staffUserId}
            >
              <option value="all">전체 담당자</option>
              {callAssigneeOptions.map((assignee) => (
                <option
                  key={assignee.staffUserId}
                  value={assignee.staffUserId}
                >
                  {assignee.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="phone-desk-list">
          {visibleItems.length === 0 ? (
            <p className="phone-desk-empty">
              조건에 맞는 전화 원장이 없습니다.
            </p>
          ) : visibleItems.map((call) => {
            const source = sourceCopy[call.source];
            const historyDelayed = isUplusHistoryDelayed(call, currentTime);
            const staffLabel = call.clickToCall
              ? call.clickToCall.requestedBy.displayName
              : call.scope === "internal"
                ? call.participants
                    .map((item) => item.displayName)
                    .filter(Boolean)
                    .join(" · ") || "내선 담당 미지정"
              : call.endpointOwners.map((owner) => owner.displayName).join(" · ") ||
                (call.endpoint.endpointType === "representative"
                  ? "대표번호 공용 회선"
                  : "회선 담당 미지정");
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
                    <strong>
                      {call.scope === "internal"
                        ? internalCallTitle(call)
                        : formatPhone(call.remotePhone)}
                    </strong>
                    <span>{source.description}</span>
                    {call.receptionMode === "uplus_network" ? (
                      <span className="phone-desk-linked">U+ 앱/망 수신</span>
                    ) : null}
                    {call.clickToCall?.observationLink ? (
                      <span className="phone-desk-linked">관측 연결됨</span>
                    ) : null}
                    {call.relationType === "call_picked_up" ? (
                      <span className="phone-desk-linked">당겨받기</span>
                    ) : null}
                    {call.aftercare ? (
                      <span className={`phone-desk-result is-${call.aftercare.result}`}>
                        {resultCopy[call.aftercare.result]}
                      </span>
                    ) : call.state === "ended" ? (
                      <span className="phone-desk-result is-needed">
                        {call.correlationStatus === "needs_confirmation"
                          ? "통화자 확인 필요"
                          : "후처리 필요"}
                      </span>
                    ) : null}
                  </div>
                  <CustomerSummary call={call} />
                </div>
                <div className="phone-desk-assignment">
                  <strong>{staffLabel}</strong>
                  <span>내선 {call.endpoint.extension}</span>
                </div>
                <div className="phone-desk-status">
                  <span className={`is-${historyDelayed ? "unknown" : call.state}`}>
                    {callStateLabel(call, currentTime)}
                  </span>
                  <CallTiming call={call} currentTime={currentTime} />
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
        <ListPagination
          disabled={loading}
          onPageChange={(value) => {
            if (appliedCriteria) void refresh(appliedCriteria, value, pageSize);
          }}
          onPageSizeChange={(value) => {
            if (appliedCriteria) void refresh(appliedCriteria, 1, value);
          }}
          page={snapshot.page}
          pageCount={snapshot.pageCount}
          pageSize={snapshot.pageSize}
          total={snapshot.total}
        />
      </div>
      </> : (
        <section className="phone-desk-search-intro">
          <strong>확인할 때만 검색하세요</strong>
          <p>평소에는 현재 통화 상태만 위에 표시하며, 과거 원장은 검색 버튼을 누를 때만 조회합니다.</p>
        </section>
      )}
    </section>
  );
}
