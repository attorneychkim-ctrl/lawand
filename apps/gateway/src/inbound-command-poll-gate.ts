const DEFAULT_IDLE_POLL_INTERVAL_MS = 10_000;

export function createInboundCommandPollGate(options: {
  idlePollIntervalMs?: number;
  now?: () => number;
} = {}) {
  const idlePollIntervalMs =
    options.idlePollIntervalMs ?? DEFAULT_IDLE_POLL_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const hintedBridges = new Set<string>();
  const lastDatabaseChecks = new Map<string, number>();

  function hint(bridgeId: string) {
    hintedBridges.add(bridgeId);
  }

  function shouldCheckDatabase(bridgeId: string) {
    if (hintedBridges.has(bridgeId)) return true;
    const current = now();
    const lastCheckedAt = lastDatabaseChecks.get(bridgeId);
    if (
      lastCheckedAt !== undefined &&
      current - lastCheckedAt < idlePollIntervalMs
    ) {
      return false;
    }
    lastDatabaseChecks.set(bridgeId, current);
    return true;
  }

  function completeCheck(bridgeId: string, commandFound: boolean) {
    lastDatabaseChecks.set(bridgeId, now());
    if (commandFound) {
      hintedBridges.add(bridgeId);
    } else {
      hintedBridges.delete(bridgeId);
    }
  }

  function failCheck(bridgeId: string) {
    lastDatabaseChecks.delete(bridgeId);
  }

  return { hint, shouldCheckDatabase, completeCheck, failCheck };
}
