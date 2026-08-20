"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type {
  ConsultationListFilter,
  ConsultationListItem,
  ConsultationListSnapshot,
  ListPageSize,
} from "../../lib/gateway";
import { ClaimConsultationButton } from "./claim-consultation-button";
import { ConsultationCreateButton } from "./consultation-create-button";
import { subscribeConsultationRealtime } from "./consultation-realtime";
import {
  ListDateControls,
  ListPagination,
  listDateQuery,
  type ListDateFilter,
} from "./list-navigation";

type QueueFilter = ConsultationListFilter;
type RealtimeStatus = "connecting" | "connected" | "reconnecting";

const stateLabels: Record<string, string> = {
  requested: "신규 접수",
  assigned: "상담 진행",
  contacted: "연락 완료",
  completed: "상담 완료",
  engaged: "계약",
  closed: "종결",
};

function isInvalidConsultation(item: ConsultationListItem) {
  return item.kakaoEntry?.status === "invalid";
}

function stateLabel(item: ConsultationListItem) {
  if (isInvalidConsultation(item)) return "무효";
  return stateLabels[item.state] ?? item.state;
}

function ownerLabel(item: ConsultationListItem) {
  if (isInvalidConsultation(item)) return "무효";
  return item.assigneeDisplayName
    ? `담당 ${item.assigneeDisplayName}`
    : "담당자 미배정";
}

const dedupeLabels: Record<ConsultationListItem["dedupeOutcome"], string> = {
  new: "신규",
  exact_duplicate: "동일 내용 재접수",
  identity_enrichment: "고객정보 보강",
  repeat_unassigned: "배정 전 재요청",
  repeat_assigned: "담당 상담 재요청",
  suspected_duplicate: "7일 내 중복 의심",
};

const residenceRegionLabels: Record<string, string> = {
  seoul: "서울",
  busan: "부산",
  daegu: "대구",
  incheon: "인천",
  gwangju: "광주",
  daejeon: "대전",
  ulsan: "울산",
  sejong: "세종",
  gyeonggi: "경기",
  gangwon: "강원",
  chungbuk: "충북",
  chungnam: "충남",
  jeonbuk: "전북",
  jeonnam: "전남",
  gyeongbuk: "경북",
  gyeongnam: "경남",
  jeju: "제주",
  overseas_or_other: "해외·기타",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatContactWindow(start: string, end: string) {
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(start));
  const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${date} ${timeFormatter.format(new Date(start))}~${timeFormatter.format(new Date(end))}`;
}

function formatPhone(value: string) {
  return value.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
}

function modeLabel(item: ConsultationListItem) {
  if (item.contactChannel === "kakao_channel") return "카카오 채널";
  if (item.contactChannel === "naver_booking") return "네이버 예약";
  if (item.mode === "self_diagnosis") return "자가진단";
  return item.mode === "detailed" ? "상세 상담" : "빠른 상담";
}

function channelTone(item: ConsultationListItem) {
  if (item.contactChannel === "kakao_channel") return "kakao";
  if (item.contactChannel === "naver_booking") return "naver";
  if (item.mode === "self_diagnosis") return "diagnosis";
  return "phone";
}

function searchText(item: ConsultationListItem) {
  return [
    item.displayName,
    item.phone,
    item.publicReceiptCode,
    item.assigneeDisplayName,
    item.existingCustomer ? "기존고객" : null,
    ...(item.existingCustomerStaffNames ?? []),
    item.referrerStaffNames ? "소개건 소개자 담당" : null,
    ...(item.referrerStaffNames ?? []),
    isInvalidConsultation(item) ? "무효" : null,
    item.legalFriendsRegistered ? "리걸프렌즈 등록 완료" : null,
    residenceRegionLabels[item.residenceRegion ?? ""],
    modeLabel(item),
    item.contactWindowStart && item.contactWindowEnd
      ? formatContactWindow(item.contactWindowStart, item.contactWindowEnd)
      : null,
    item.latestTelephony?.disposition === "no_answer" ? "부재" : null,
    item.latestTelephony?.disposition === "callback_required"
      ? "재상담 필요"
      : null,
    item.latestTelephony?.aftercareResult === "no_answer" ? "부재 무응답" : null,
    item.latestTelephony?.aftercareResult === "reconsultation_required"
      ? "재상담 필요"
      : null,
    item.latestTelephony?.aftercareResult === "busy" ? "통화중" : null,
    item.latestTelephony?.aftercareResult === "manager_callback_requested"
      ? "담당자 연결 요청"
      : null,
    item.latestTelephony?.aftercareResult === "rejected" ? "거절" : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ko-KR")
    .replace(/\D(?=\d)|(?<=\d)\D/g, "");
}

function QueueIcon({ kind }: { kind: QueueFilter }) {
  if (kind === "all") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 5h16M4 12h16M4 19h16" />
      </svg>
    );
  }
  if (kind === "waiting") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 7v5l3 2" />
        <circle cx="12" cy="12" r="8.5" />
      </svg>
    );
  }
  if (kind === "mine") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20" />
      </svg>
    );
  }
  if (kind === "attention") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 3.25 21 19H3L12 3.25Z" />
        <path d="M12 9v4.5M12 17h.01" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="16" rx="2" width="17" x="3.5" y="4.5" />
      <path d="M8 2.5v4M16 2.5v4M3.5 9h17" />
    </svg>
  );
}

function ChannelIcon({ tone }: { tone: ReturnType<typeof channelTone> }) {
  if (tone === "kakao") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20.5 11c0 4-3.8 7.25-8.5 7.25a10 10 0 0 1-2.5-.32L5 20.5l1.1-4.1A6.8 6.8 0 0 1 3.5 11C3.5 7 7.3 3.75 12 3.75S20.5 7 20.5 11Z" />
      </svg>
    );
  }
  if (tone === "naver") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6 4.5h4l4 6v-6h4v15h-4l-4-6v6H6v-15Z" />
      </svg>
    );
  }
  if (tone === "diagnosis") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 3.5h14v17H5zM8 8h8M8 12h3M14 12h2M8 16h2M13 16h3" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8.2 4.25 10 8 8.1 9.8a14.5 14.5 0 0 0 6.1 6.1L16 14l3.75 1.8-.25 3.45c-8.1.95-15.7-6.65-14.75-14.75l3.45-.25Z" />
    </svg>
  );
}

function StatusBadges({ item }: { item: ConsultationListItem }) {
  const existingCustomerStaffNames = item.existingCustomerStaffNames ?? [];
  const referrerStaffNames = item.referrerStaffNames ?? null;
  return (
    <div className="consultation-flags">
      {item.groupMemberCount > 1 ? (
        <span className="flag-badge is-positive">
          상담 묶음 {item.groupMemberCount}건
        </span>
      ) : null}
      {item.groupMemberCount > 1 ? (
        <span className="flag-badge is-neutral">
          {[
            item.channelCounts.kakao_channel > 0
              ? `플친 ${item.channelCounts.kakao_channel}`
              : null,
            item.channelCounts.phone > 0
              ? `홈페이지·전화 ${item.channelCounts.phone}`
              : null,
            item.channelCounts.naver_booking > 0
              ? `네이버 ${item.channelCounts.naver_booking}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      ) : null}
      {item.nameMismatch ? (
        <span className="flag-badge is-attention">입력 이름 불일치</span>
      ) : null}
      {item.softDeletedAt ? (
        <span className="flag-badge is-danger">삭제됨</span>
      ) : null}
      {item.existingCustomer ? (
        <span className="flag-badge is-existing">
          기존고객
          {existingCustomerStaffNames.length > 0
            ? ` · 담당 ${existingCustomerStaffNames.join(" · ")}`
            : ""}
        </span>
      ) : null}
      {referrerStaffNames ? (
        <span className="flag-badge is-info">
          소개건 · 소개자 담당 {referrerStaffNames.join(" · ") || "미지정"}
        </span>
      ) : null}
      {item.legalFriendsRegistered ? (
        <span className="flag-badge is-positive">리걸프렌즈 등록 완료</span>
      ) : null}
      {item.requiresLegalFriendsReview ? (
        <span className="flag-badge is-attention">기존 사건 확인</span>
      ) : null}
      {item.latestTelephony?.disposition === "no_answer" ? (
        <span className="flag-badge is-attention">부재</span>
      ) : null}
      {item.latestTelephony?.disposition === "callback_required" ? (
        <span className="flag-badge is-attention">재상담 필요</span>
      ) : null}
      {item.latestTelephony?.aftercareResult === "no_answer" ? (
        <span className="flag-badge is-attention">부재 및 무응답</span>
      ) : null}
      {item.latestTelephony?.aftercareResult === "reconsultation_required" ? (
        <span className="flag-badge is-attention">재상담 필요</span>
      ) : null}
      {item.latestTelephony?.aftercareResult === "busy" ? (
        <span className="flag-badge is-attention">통화중</span>
      ) : null}
      {item.latestTelephony?.aftercareResult === "manager_callback_requested" ? (
        <span className="flag-badge is-attention">담당자 연결 요청</span>
      ) : null}
      {item.latestTelephony?.aftercareResult === "rejected" ? (
        <span className="flag-badge is-attention">거절</span>
      ) : null}
      {item.kakaoEntry?.status === "pending" ? (
        <span
          className={`flag-badge ${
            item.kakaoEntry.nameProvided ? "is-positive" : "is-attention"
          }`}
        >
          {item.kakaoEntry.nameProvided
            ? "카톡 이름 입력"
            : "채팅 확인 필요"}
        </span>
      ) : null}
      {item.kakaoEntry?.status === "confirmed" ? (
        <span className="flag-badge is-positive">채팅 확인</span>
      ) : null}
      {item.kakaoEntry?.status === "invalid" ? (
        <span className="flag-badge is-neutral">미진입·무효</span>
      ) : null}
      {item.naverBooking?.status === "details_pending" ? (
        <span className="flag-badge is-attention">예약 상세 확인</span>
      ) : null}
      {item.dedupeOutcome !== "new" ? (
        <span
          className={`flag-badge ${
            item.dedupeOutcome === "suspected_duplicate" ||
            item.dedupeOutcome === "repeat_assigned"
              ? "is-danger"
              : "is-neutral"
          }`}
        >
          {dedupeLabels[item.dedupeOutcome]}
        </span>
      ) : null}
      {item.requestCount > 1 ? (
        <span className="flag-badge is-neutral">요청 {item.requestCount}회</span>
      ) : null}
    </div>
  );
}

export function ConsultationWorkspace({
  initialSnapshot,
  todayKey,
}: {
  initialSnapshot: ConsultationListSnapshot;
  todayKey: string;
}) {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [page, setPage] = useState(initialSnapshot.page);
  const [pageSize, setPageSize] = useState<ListPageSize>(
    initialSnapshot.pageSize,
  );
  const [dateFilter, setDateFilter] = useState<ListDateFilter>({ kind: "all" });
  const [loading, setLoading] = useState(false);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>("connecting");

  useEffect(() => {
    let active = true;
    let refreshInFlight = false;
    let refreshQueued = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      filter,
      ...listDateQuery(dateFilter),
    });

    const synchronize = async () => {
      await Promise.resolve();
      if (!active) return;
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      setLoading(true);
      do {
        refreshQueued = false;
        try {
          const response = await fetch(`/api/consultations?${params}`, {
            cache: "no-store",
          });
          if (!response.ok) throw new Error("consultation_sync_failed");
          const body = (await response.json()) as ConsultationListSnapshot;
          if (
            !Array.isArray(body.items) ||
            typeof body.total !== "number" ||
            typeof body.page !== "number"
          ) {
            throw new Error("consultation_sync_invalid");
          }
          if (active) {
            if (retryTimer) {
              clearTimeout(retryTimer);
              retryTimer = null;
            }
            setSnapshot(body);
            if (body.page !== page) setPage(body.page);
            setRealtimeStatus("connected");
          }
        } catch {
          if (active) {
            setRealtimeStatus("reconnecting");
            if (!retryTimer) {
              retryTimer = setTimeout(() => {
                retryTimer = null;
                void synchronize();
              }, 3_000);
            }
          }
        }
      } while (active && refreshQueued);
      refreshInFlight = false;
      if (active) setLoading(false);
    };

    void synchronize();
    const unsubscribe = subscribeConsultationRealtime((message) => {
      if (!active) return;
      if (message.kind === "error") {
        setRealtimeStatus("reconnecting");
        return;
      }
      if (message.kind === "open") {
        setRealtimeStatus("connected");
        return;
      }
      void synchronize();
    });

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe();
    };
  }, [dateFilter, filter, page, pageSize]);

  const filtered = useMemo(() => {
    const normalizedQuery = query
      .trim()
      .toLocaleLowerCase("ko-KR")
      .replace(/\D(?=\d)|(?<=\d)\D/g, "");
    return snapshot.items.filter(
      (item) => !normalizedQuery || searchText(item).includes(normalizedQuery),
    );
  }, [query, snapshot.items]);

  const queueFilters: Array<{ key: QueueFilter; label: string; count: number }> = [
    { key: "all", label: "전체", count: snapshot.summary.all },
    { key: "waiting", label: "신규 대기", count: snapshot.summary.waiting },
    { key: "mine", label: "내 담당", count: snapshot.summary.mine },
    { key: "attention", label: "확인 필요", count: snapshot.summary.attention },
    { key: "today", label: "오늘 접수", count: snapshot.summary.today },
  ];

  return (
    <>
      <section aria-label="상담 현황" className="queue-metrics">
        {([
          ["all", "전체", snapshot.summary.all, "선택 기간의 모든 상담"],
          ["waiting", "배정 대기", snapshot.summary.waiting, "지금 확인할 신규 상담"],
          ["mine", "내 담당", snapshot.summary.mine, "현재 내가 맡은 상담"],
          ["attention", "확인 필요", snapshot.summary.attention, "부재·재상담·채널 확인 대상"],
          ["today", "오늘 접수", snapshot.summary.today, "오늘 들어온 요청"],
        ] as const).map(([key, label, value, description]) => (
          <button
            aria-pressed={filter === key}
            className={`queue-metric-card is-${key}`}
            key={key}
            onClick={() => {
              setFilter(key);
              setPage(1);
            }}
            type="button"
          >
            <span className="queue-metric-icon"><QueueIcon kind={key} /></span>
            <span className="queue-metric-copy">
              <small>{label}</small>
              <strong>{value}</strong>
              <span>{description}</span>
            </span>
          </button>
        ))}
      </section>

      <ListDateControls
        disabled={loading}
        onChange={(value) => {
          setDateFilter(value);
          setPage(1);
        }}
        todayKey={todayKey}
        value={dateFilter}
      />

      <section className="erp-panel queue-panel" aria-labelledby="consultation-list-title">
        <div className="queue-toolbar">
          <div className="queue-toolbar-heading">
            <div>
              <p className="section-kicker">WORK QUEUE</p>
              <h2 id="consultation-list-title">상담 작업 큐</h2>
            </div>
            <div className="queue-result-summary">
              <ConsultationCreateButton />
              <span
                aria-live="polite"
                className={`realtime-status is-${realtimeStatus}`}
              >
                <span aria-hidden="true" />
                {realtimeStatus === "connected"
                  ? "실시간 연결됨"
                  : realtimeStatus === "connecting"
                    ? "실시간 연결 중"
                    : "재연결 중"}
              </span>
              <span className="queue-result-count">
                {query ? `${filtered.length}건 검색` : `총 ${snapshot.total}건`}
              </span>
            </div>
          </div>
          <div className="queue-controls">
            <label className="queue-search">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
              </svg>
              <span className="sr-only">상담 검색</span>
              <input
                autoComplete="off"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="현재 페이지에서 이름, 전화번호, 접수번호 검색"
                type="search"
                value={query}
              />
            </label>
            <div aria-label="상담 목록 필터" className="queue-filter-tabs">
              {queueFilters.map((item) => (
                <button
                  aria-pressed={filter === item.key}
                  className={filter === item.key ? "is-active" : undefined}
                  key={item.key}
                  onClick={() => {
                    setFilter(item.key);
                    setPage(1);
                  }}
                  type="button"
                >
                  {item.label}
                  <span>{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 4.5h14v15H5zM8 8h8M8 12h5M8 16h3" />
              </svg>
            </span>
            <strong>
              {snapshot.total === 0
                ? "아직 접수된 상담이 없습니다"
                : "조건에 맞는 상담이 없습니다"}
            </strong>
            <p>
              {snapshot.total === 0
                ? "홈페이지·카카오 채널·네이버 예약의 새 요청이 이곳에 표시됩니다."
                : "검색어를 지우거나 다른 작업 큐를 선택해 보세요."}
            </p>
          </div>
        ) : (
          <ol className="consultation-list">
            {filtered.map((consultation) => {
              const tone = channelTone(consultation);
              const invalid = isInvalidConsultation(consultation);
              return (
                <li
                  className={`consultation-row${consultation.softDeletedAt ? " is-soft-deleted" : ""}${invalid ? " is-invalid" : ""}`}
                  key={consultation.id}
                >
                  <Link
                    aria-label={
                      consultation.softDeletedAt
                        ? "삭제된 상담 상세 보기"
                        : invalid
                          ? "무효 상담 상세 보기"
                          : `${consultation.displayName} 상담 상세 보기`
                    }
                    className="consultation-row-link"
                    href={`/consultations/${consultation.id}`}
                  >
                    <span className={`consultation-channel-icon is-${tone}`}>
                      <ChannelIcon tone={tone} />
                    </span>
                    <span className="consultation-row-main">
                      <span className="consultation-row-title">
                        <strong className="consultation-row-sensitive">
                          {consultation.displayName}
                        </strong>
                        <span
                          className={`consultation-region-badge${
                            consultation.residenceRegion ? "" : " is-missing"
                          }`}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24">
                            <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
                            <circle cx="12" cy="10" r="2" />
                          </svg>
                          {consultation.residenceRegion
                            ? residenceRegionLabels[consultation.residenceRegion]
                            : "지역 미기록"}
                        </span>
                        <span className={`state-badge is-${consultation.state}`}>
                          {stateLabel(consultation)}
                        </span>
                      </span>
                      <span className="consultation-row-contact consultation-row-sensitive">
                        {consultation.phone
                          ? formatPhone(consultation.phone)
                          : "전화번호 미수집"}
                        <span aria-hidden="true">·</span>
                        {modeLabel(consultation)}
                      </span>
                      {consultation.contactChannel === "phone" &&
                      consultation.contactPreference === "scheduled_window" &&
                      consultation.contactWindowStart &&
                      consultation.contactWindowEnd ? (
                        <span className="consultation-row-schedule">
                          <span>상담 요청 시각</span>
                          <strong>
                            {formatContactWindow(
                              consultation.contactWindowStart,
                              consultation.contactWindowEnd,
                            )}
                          </strong>
                        </span>
                      ) : null}
                      <StatusBadges item={consultation} />
                    </span>
                    <span className="consultation-row-owner">
                      <span>{ownerLabel(consultation)}</span>
                      <time dateTime={consultation.lastRequestedAt}>
                        {formatDate(consultation.lastRequestedAt)}
                      </time>
                      <small>{consultation.publicReceiptCode}</small>
                    </span>
                    <svg className="row-chevron" aria-hidden="true" viewBox="0 0 24 24">
                      <path d="m9 5 7 7-7 7" />
                    </svg>
                  </Link>
                  {consultation.state === "requested" &&
                  !consultation.softDeletedAt &&
                  !consultation.requiresLegalFriendsReview &&
                  (consultation.kakaoEntry?.status !== "pending" ||
                    consultation.kakaoEntry.nameProvided) ? (
                    <ClaimConsultationButton
                      compact
                      consultationId={consultation.id}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        <ListPagination
          disabled={loading}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
          page={snapshot.page}
          pageCount={snapshot.pageCount}
          pageSize={snapshot.pageSize}
          total={snapshot.total}
        />
      </section>
    </>
  );
}
