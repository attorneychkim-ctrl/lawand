"use client";

import { useMemo, useState } from "react";

import type { ListPageSize } from "../../lib/gateway";

export type ListDateFilter =
  | { kind: "all" }
  | { kind: "day"; date: string }
  | { kind: "range"; startDate: string; endDate: string };

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function shortDateLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function listDateQuery(
  filter: ListDateFilter,
): Record<string, string> {
  if (filter.kind === "all") return {};
  const startDate = filter.kind === "day" ? filter.date : filter.startDate;
  const endDate = filter.kind === "day" ? filter.date : filter.endDate;
  return {
    from: `${startDate}T00:00:00+09:00`,
    to: `${shiftDateKey(endDate, 1)}T00:00:00+09:00`,
  };
}

export function ListDateControls({
  todayKey,
  value,
  disabled = false,
  onChange,
}: {
  todayKey: string;
  value: ListDateFilter;
  disabled?: boolean;
  onChange: (value: ListDateFilter) => void;
}) {
  const recentDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => shiftDateKey(todayKey, -index)),
    [todayKey],
  );
  const [customStart, setCustomStart] = useState(todayKey);
  const [customEnd, setCustomEnd] = useState("");
  const appliedEnd = customEnd || customStart;
  const customInvalid = !customStart || appliedEnd < customStart;

  return (
    <div className="list-date-controls">
      <div className="list-date-quick" role="group" aria-label="최근 일자 선택">
        <span>조회일</span>
        <button
          aria-pressed={value.kind === "all"}
          className={value.kind === "all" ? "is-active" : undefined}
          disabled={disabled}
          onClick={() => onChange({ kind: "all" })}
          type="button"
        >
          전체 기간
        </button>
        {recentDates.map((date, index) => {
          const active = value.kind === "day" && value.date === date;
          return (
            <button
              aria-pressed={active}
              className={active ? "is-active" : undefined}
              disabled={disabled}
              key={date}
              onClick={() => onChange({ kind: "day", date })}
              type="button"
            >
              {index === 0
                ? "오늘"
                : index === 1
                  ? "어제"
                  : shortDateLabel(date)}
            </button>
          );
        })}
      </div>
      <div className="list-date-custom">
        <label>
          <span>시작일</span>
          <input
            disabled={disabled}
            max={todayKey}
            onChange={(event) => setCustomStart(event.target.value)}
            type="date"
            value={customStart}
          />
        </label>
        <span aria-hidden="true">–</span>
        <label>
          <span>종료일(선택)</span>
          <input
            disabled={disabled}
            max={todayKey}
            min={customStart}
            onChange={(event) => setCustomEnd(event.target.value)}
            type="date"
            value={customEnd}
          />
        </label>
        <button
          disabled={disabled || customInvalid}
          onClick={() =>
            onChange({
              kind: "range",
              startDate: customStart,
              endDate: appliedEnd,
            })
          }
          type="button"
        >
          기간 적용
        </button>
      </div>
    </div>
  );
}

function visiblePages(page: number, pageCount: number) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const pages = new Set([1, pageCount]);
  for (let candidate = page - 2; candidate <= page + 2; candidate += 1) {
    if (candidate > 1 && candidate < pageCount) pages.add(candidate);
  }
  return [...pages].sort((left, right) => left - right);
}

export function ListPagination({
  page,
  pageSize,
  pageCount,
  total,
  disabled = false,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: ListPageSize;
  pageCount: number;
  total: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: ListPageSize) => void;
}) {
  const pages = visiblePages(page, pageCount);
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <nav className="list-pagination" aria-label="목록 페이지 이동">
      <p>
        총 <strong>{total}</strong>건 · {firstItem}–{lastItem}건 표시
      </p>
      <div className="list-pagination-pages">
        <button
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          이전
        </button>
        {pages.map((item, index) => (
          <span key={item} className="list-page-slot">
            {index > 0 && item - pages[index - 1]! > 1 ? (
              <i aria-hidden="true">…</i>
            ) : null}
            <button
              aria-current={item === page ? "page" : undefined}
              className={item === page ? "is-active" : undefined}
              disabled={disabled}
              onClick={() => onPageChange(item)}
              type="button"
            >
              {item}
            </button>
          </span>
        ))}
        <button
          disabled={disabled || page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          다음
        </button>
      </div>
      <label className="list-page-size">
        <span>페이지당</span>
        <select
          disabled={disabled}
          onChange={(event) =>
            onPageSizeChange(Number(event.target.value) as ListPageSize)
          }
          value={pageSize}
        >
          <option value={20}>20건</option>
          <option value={50}>50건</option>
          <option value={100}>100건</option>
        </select>
      </label>
    </nav>
  );
}
