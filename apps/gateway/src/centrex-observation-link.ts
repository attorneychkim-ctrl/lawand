export const CENTREX_OBSERVATION_LINK_EARLY_TOLERANCE_MS = 5_000;
export const CENTREX_OBSERVATION_LINK_WINDOW_MS = 120_000;

export type CentrexObservationLinkCandidate = {
  id: string;
  requestedAt: Date;
};

export function chooseCentrexObservationLinkCandidate(
  observedRingingAt: Date,
  candidates: CentrexObservationLinkCandidate[],
): (CentrexObservationLinkCandidate & { timeDeltaMs: number }) | null {
  const matches = candidates
    .map((candidate) => ({
      ...candidate,
      timeDeltaMs:
        observedRingingAt.getTime() - candidate.requestedAt.getTime(),
    }))
    .filter(
      (candidate) =>
        candidate.timeDeltaMs >=
          -CENTREX_OBSERVATION_LINK_EARLY_TOLERANCE_MS &&
        candidate.timeDeltaMs <= CENTREX_OBSERVATION_LINK_WINDOW_MS,
    )
    .sort(
      (left, right) =>
        Math.abs(left.timeDeltaMs) - Math.abs(right.timeDeltaMs) ||
        right.requestedAt.getTime() - left.requestedAt.getTime() ||
        left.id.localeCompare(right.id),
    );
  return matches[0] ?? null;
}
