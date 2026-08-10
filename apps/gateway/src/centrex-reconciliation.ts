import type { CentrexCallHistoryRecord } from "./centrex.js";

export type CentrexInferredOutcome =
  | "unknown"
  | "answered"
  | "no_answer"
  | "busy"
  | "failed"
  | "cancelled";

export type CentrexReconciliationMatch = {
  record: CentrexCallHistoryRecord;
  startedAt: Date;
  endedAt: Date;
  outcome: CentrexInferredOutcome;
};

export function parseCentrexHistoryTime(value: string): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
      value.trim(),
    );
  if (!match) return null;
  const date = new Date(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function centrexDestinationMatches(
  providerDestination: string,
  destination: string,
): boolean {
  const provider = providerDestination.replace(/[^0-9*]/g, "");
  const expected = destination.replace(/\D/g, "");
  if (!provider || provider.length !== expected.length) return false;
  return [...provider].every(
    (character, index) => character === "*" || character === expected[index],
  );
}

export function inferCentrexOutcome(
  record: CentrexCallHistoryRecord,
): CentrexInferredOutcome {
  const status = record.status.replace(/[ _]/g, "-").toUpperCase();
  if (["OK", "ANSWERED", "ANSWER"].includes(status)) return "answered";
  if (["NO-ANS", "NO-ANSWER", "NOANSWER"].includes(status)) {
    return "no_answer";
  }
  if (status === "BUSY") return "busy";
  if (["CANCEL", "CANCELLED", "CANCELED"].includes(status)) {
    return "cancelled";
  }
  if (["FAIL", "FAILED"].includes(status)) return "failed";
  return "unknown";
}

function isSettled(
  record: CentrexCallHistoryRecord,
  startedAt: Date,
  endedAt: Date,
  currentTime: Date,
): boolean {
  const outcome = inferCentrexOutcome(record);
  const elapsedAfterEnd = currentTime.getTime() - endedAt.getTime();
  if (elapsedAfterEnd < 3_000) return false;
  if (
    ["failed", "cancelled", "busy", "no_answer"].includes(outcome) &&
    record.durationSeconds === 0 &&
    currentTime.getTime() - startedAt.getTime() < 8_000
  ) {
    return false;
  }
  return true;
}

export function matchCentrexCallHistory(options: {
  records: CentrexCallHistoryRecord[];
  destination: string;
  requestedAt: Date;
  currentTime: Date;
  usedStartedAt: ReadonlySet<string>;
}): CentrexReconciliationMatch | null {
  const earliest = options.requestedAt.getTime() - 5_000;
  const latest = options.requestedAt.getTime() + 120_000;
  const matches = options.records
    .flatMap((record) => {
      const startedAt = parseCentrexHistoryTime(record.time);
      if (!startedAt) return [];
      const startedTime = startedAt.getTime();
      if (
        startedTime < earliest ||
        startedTime > latest ||
        options.usedStartedAt.has(startedAt.toISOString()) ||
        !centrexDestinationMatches(record.destination, options.destination)
      ) {
        return [];
      }
      const endedAt = new Date(
        startedTime + record.durationSeconds * 1_000,
      );
      if (!isSettled(record, startedAt, endedAt, options.currentTime)) {
        return [];
      }
      return [
        {
          record,
          startedAt,
          endedAt,
          outcome: inferCentrexOutcome(record),
        },
      ];
    })
    .sort(
      (left, right) =>
        Math.abs(left.startedAt.getTime() - options.requestedAt.getTime()) -
        Math.abs(right.startedAt.getTime() - options.requestedAt.getTime()),
    );
  return matches[0] ?? null;
}
