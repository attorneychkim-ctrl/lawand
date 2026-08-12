const CENTREX_PROVIDER_ID_SENTINELS = new Set([
  "0",
  "NIL",
  "NONE",
  "NULL",
  "UNKNOWN",
]);

export function normalizeCentrexProviderReference(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim() ?? "";
  if (
    normalized.length === 0 ||
    CENTREX_PROVIDER_ID_SENTINELS.has(normalized.toUpperCase())
  ) {
    return null;
  }
  return normalized;
}

export function areCentrexProviderIdsRelated(
  left: string,
  right: string,
): boolean {
  if (left === right) return true;

  const leftSeparator = left.lastIndexOf(".");
  const rightSeparator = right.lastIndexOf(".");
  if (
    leftSeparator <= 0 ||
    rightSeparator <= 0 ||
    left.slice(0, leftSeparator) !== right.slice(0, rightSeparator)
  ) {
    return false;
  }

  const leftSequence = left.slice(leftSeparator + 1);
  const rightSequence = right.slice(rightSeparator + 1);
  if (!/^\d+$/.test(leftSequence) || !/^\d+$/.test(rightSequence)) {
    return false;
  }

  const difference = BigInt(leftSequence) - BigInt(rightSequence);
  return difference === 1n || difference === -1n;
}
