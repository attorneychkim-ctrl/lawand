import { createHmac } from "node:crypto";

const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MAX_TRACKED_KEYS = 10_000;
const LIMITED_ALERT_COOLDOWN_MS = 5 * MINUTE_MS;

export const DESKTOP_PAIRING_LIMITS = {
  pairingCode: { limit: 5, windowMs: 5 * MINUTE_MS },
  networkBurst: { limit: 12, windowMs: 10 * MINUTE_MS },
  networkDaily: { limit: 60, windowMs: DAY_MS },
} as const;

type RateLimit = { limit: number; windowMs: number };
type DesktopPairingLimits = {
  pairingCode: RateLimit;
  networkBurst: RateLimit;
  networkDaily: RateLimit;
};

export type DesktopPairingLimitDimension = "pairing_code" | "network";
export type DesktopPairingProtectionDecision =
  | { allowed: true }
  | {
      allowed: false;
      dimension: DesktopPairingLimitDimension;
      retryAfterSeconds: number;
    };

export type DesktopPairingProtection = {
  check(input: {
    pairingCode: string;
    networkAddress: string | null;
  }): DesktopPairingProtectionDecision;
};

class SlidingWindowCounter {
  private readonly entries = new Map<string, number[]>();

  consume(key: string, limit: RateLimit, now: number): number | null {
    const cutoff = now - limit.windowMs;
    const recent = (this.entries.get(key) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (recent.length >= limit.limit) {
      this.touch(key, recent);
      return Math.max(
        1,
        Math.ceil((recent[0]! + limit.windowMs - now) / 1_000),
      );
    }
    recent.push(now);
    this.touch(key, recent);
    return null;
  }

  private touch(key: string, timestamps: number[]) {
    this.entries.delete(key);
    this.entries.set(key, timestamps);
    if (this.entries.size <= MAX_TRACKED_KEYS) return;
    const oldestKey = this.entries.keys().next().value;
    if (typeof oldestKey === "string") this.entries.delete(oldestKey);
  }
}

function fingerprint(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret)
    .update(`${purpose}\0${value}`)
    .digest("base64url");
}

export function createDesktopPairingProtection(options: {
  hmacKey: string;
  now?: () => number;
  limits?: Partial<DesktopPairingLimits>;
  onLimited?: (event: {
    dimension: DesktopPairingLimitDimension;
    retryAfterSeconds: number;
  }) => void;
}): DesktopPairingProtection {
  const now = options.now ?? Date.now;
  const limits: DesktopPairingLimits = {
    ...DESKTOP_PAIRING_LIMITS,
    ...options.limits,
  };
  const pairingCodeCounter = new SlidingWindowCounter();
  const networkBurstCounter = new SlidingWindowCounter();
  const networkDailyCounter = new SlidingWindowCounter();
  const lastLimitedAlertAt = new Map<DesktopPairingLimitDimension, number>();

  function limited(
    dimension: DesktopPairingLimitDimension,
    retryAfterSeconds: number,
  ): DesktopPairingProtectionDecision {
    const checkedAt = now();
    const alertedAt = lastLimitedAlertAt.get(dimension);
    if (
      alertedAt === undefined ||
      checkedAt - alertedAt >= LIMITED_ALERT_COOLDOWN_MS
    ) {
      lastLimitedAlertAt.set(dimension, checkedAt);
      options.onLimited?.({ dimension, retryAfterSeconds });
    }
    return { allowed: false, dimension, retryAfterSeconds };
  }

  return {
    check(input) {
      const checkedAt = now();
      const pairingCodeKey = fingerprint(
        options.hmacKey,
        "desktop-pairing-code-rate-v1",
        input.pairingCode,
      );
      const pairingCodeRetry = pairingCodeCounter.consume(
        pairingCodeKey,
        limits.pairingCode,
        checkedAt,
      );
      if (pairingCodeRetry !== null) {
        return limited("pairing_code", pairingCodeRetry);
      }

      if (input.networkAddress) {
        const networkKey = fingerprint(
          options.hmacKey,
          "desktop-pairing-network-rate-v1",
          input.networkAddress,
        );
        const burstRetry = networkBurstCounter.consume(
          networkKey,
          limits.networkBurst,
          checkedAt,
        );
        if (burstRetry !== null) return limited("network", burstRetry);
        const dailyRetry = networkDailyCounter.consume(
          networkKey,
          limits.networkDaily,
          checkedAt,
        );
        if (dailyRetry !== null) return limited("network", dailyRetry);
      }
      return { allowed: true };
    },
  };
}
