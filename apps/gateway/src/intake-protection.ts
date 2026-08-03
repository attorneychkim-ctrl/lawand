import { createHmac } from "node:crypto";

const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MAX_TRACKED_KEYS = 50_000;
const LIMITED_ALERT_COOLDOWN_MS = 5 * MINUTE_MS;

export const PUBLIC_INTAKE_LIMITS = {
  idempotentReplay: { limit: 30, windowMs: 10 * MINUTE_MS },
  phoneBurst: { limit: 6, windowMs: 30 * MINUTE_MS },
  phoneDaily: { limit: 12, windowMs: DAY_MS },
  networkBurst: { limit: 60, windowMs: 10 * MINUTE_MS },
  networkDaily: { limit: 300, windowMs: DAY_MS },
} as const;

export type PublicIntakeLimitDimension =
  | "idempotent_replay"
  | "phone"
  | "network";

export type PublicIntakeProtectionDecision =
  | { allowed: true }
  | {
      allowed: false;
      dimension: PublicIntakeLimitDimension;
      retryAfterSeconds: number;
    };

export type PublicIntakeProtection = {
  check(input: {
    clientKey: string | null;
    idempotencyKey: string;
    phone: string;
  }): PublicIntakeProtectionDecision;
  checkKakaoEntry(input: {
    clientKey: string | null;
    idempotencyKey: string;
  }): PublicIntakeProtectionDecision;
};

type RateLimit = {
  limit: number;
  windowMs: number;
};

type IntakeProtectionLimits = {
  idempotentReplay: RateLimit;
  phoneBurst: RateLimit;
  phoneDaily: RateLimit;
  networkBurst: RateLimit;
  networkDaily: RateLimit;
};

class SlidingWindowCounter {
  private readonly entries = new Map<string, number[]>();

  constructor(private readonly maxTrackedKeys: number) {}

  consume(key: string, limit: RateLimit, now: number): number | null {
    const cutoff = now - limit.windowMs;
    const recent = (this.entries.get(key) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );

    if (recent.length >= limit.limit) {
      this.touch(key, recent);
      return Math.max(1, Math.ceil((recent[0]! + limit.windowMs - now) / 1_000));
    }

    recent.push(now);
    this.touch(key, recent);
    return null;
  }

  private touch(key: string, timestamps: number[]) {
    this.entries.delete(key);
    this.entries.set(key, timestamps);
    if (this.entries.size <= this.maxTrackedKeys) return;

    const oldestKey = this.entries.keys().next().value;
    if (typeof oldestKey === "string") {
      this.entries.delete(oldestKey);
    }
  }
}

function fingerprint(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret)
    .update(`${purpose}\0${value}`)
    .digest("base64url");
}

function validClientKey(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function createPublicIntakeProtection(options: {
  hmacKey: string;
  now?: () => number;
  limits?: Partial<IntakeProtectionLimits>;
  onLimited?: (event: {
    dimension: PublicIntakeLimitDimension;
    retryAfterSeconds: number;
  }) => void;
}): PublicIntakeProtection {
  const now = options.now ?? Date.now;
  const limits: IntakeProtectionLimits = {
    ...PUBLIC_INTAKE_LIMITS,
    ...options.limits,
  };
  const replayCounter = new SlidingWindowCounter(MAX_TRACKED_KEYS);
  const phoneBurstCounter = new SlidingWindowCounter(MAX_TRACKED_KEYS);
  const phoneDailyCounter = new SlidingWindowCounter(MAX_TRACKED_KEYS);
  const networkBurstCounter = new SlidingWindowCounter(MAX_TRACKED_KEYS);
  const networkDailyCounter = new SlidingWindowCounter(MAX_TRACKED_KEYS);
  const seenIdempotencyKeys = new Map<string, number>();
  const lastLimitedAlertAt = new Map<PublicIntakeLimitDimension, number>();

  function limited(
    dimension: PublicIntakeLimitDimension,
    retryAfterSeconds: number,
  ): PublicIntakeProtectionDecision {
    const alertedAt = lastLimitedAlertAt.get(dimension);
    const checkedAt = now();
    if (
      alertedAt === undefined ||
      checkedAt - alertedAt >= LIMITED_ALERT_COOLDOWN_MS
    ) {
      lastLimitedAlertAt.set(dimension, checkedAt);
      options.onLimited?.({ dimension, retryAfterSeconds });
    }
    return { allowed: false, dimension, retryAfterSeconds };
  }

  function idempotencyReplayDecision(
    idempotencyFingerprint: string,
    checkedAt: number,
  ): PublicIntakeProtectionDecision | null {
    const seenUntil = seenIdempotencyKeys.get(idempotencyFingerprint);
    if (seenUntil !== undefined && seenUntil > checkedAt) {
      const retryAfter = replayCounter.consume(
        idempotencyFingerprint,
        limits.idempotentReplay,
        checkedAt,
      );
      return retryAfter === null
        ? { allowed: true }
        : limited("idempotent_replay", retryAfter);
    }
    if (seenUntil !== undefined) {
      seenIdempotencyKeys.delete(idempotencyFingerprint);
    }
    return null;
  }

  function networkDecision(
    clientKey: string | null,
    checkedAt: number,
  ): PublicIntakeProtectionDecision | null {
    if (!validClientKey(clientKey)) return null;
    const networkBurstRetry = networkBurstCounter.consume(
      clientKey,
      limits.networkBurst,
      checkedAt,
    );
    if (networkBurstRetry !== null) {
      return limited("network", networkBurstRetry);
    }
    const networkDailyRetry = networkDailyCounter.consume(
      clientKey,
      limits.networkDaily,
      checkedAt,
    );
    return networkDailyRetry === null
      ? null
      : limited("network", networkDailyRetry);
  }

  function rememberIdempotency(
    idempotencyFingerprint: string,
    checkedAt: number,
  ) {
    seenIdempotencyKeys.delete(idempotencyFingerprint);
    seenIdempotencyKeys.set(
      idempotencyFingerprint,
      checkedAt + limits.phoneDaily.windowMs,
    );
    if (seenIdempotencyKeys.size > MAX_TRACKED_KEYS) {
      const oldestKey = seenIdempotencyKeys.keys().next().value;
      if (typeof oldestKey === "string") {
        seenIdempotencyKeys.delete(oldestKey);
      }
    }
  }

  return {
    check(input) {
      const checkedAt = now();
      const idempotencyFingerprint = fingerprint(
        options.hmacKey,
        "public-intake-idempotency-v1",
        input.idempotencyKey,
      );
      const replayDecision = idempotencyReplayDecision(
        idempotencyFingerprint,
        checkedAt,
      );
      if (replayDecision) return replayDecision;

      const phoneFingerprint = fingerprint(
        options.hmacKey,
        "public-intake-phone-rate-v1",
        input.phone,
      );
      const phoneBurstRetry = phoneBurstCounter.consume(
        phoneFingerprint,
        limits.phoneBurst,
        checkedAt,
      );
      if (phoneBurstRetry !== null) {
        return limited("phone", phoneBurstRetry);
      }

      const phoneDailyRetry = phoneDailyCounter.consume(
        phoneFingerprint,
        limits.phoneDaily,
        checkedAt,
      );
      if (phoneDailyRetry !== null) {
        return limited("phone", phoneDailyRetry);
      }

      const networkLimit = networkDecision(input.clientKey, checkedAt);
      if (networkLimit) return networkLimit;

      rememberIdempotency(idempotencyFingerprint, checkedAt);
      return { allowed: true };
    },
    checkKakaoEntry(input) {
      const checkedAt = now();
      const idempotencyFingerprint = fingerprint(
        options.hmacKey,
        "public-intake-idempotency-v1",
        input.idempotencyKey,
      );
      const replayDecision = idempotencyReplayDecision(
        idempotencyFingerprint,
        checkedAt,
      );
      if (replayDecision) return replayDecision;

      const networkLimit = networkDecision(input.clientKey, checkedAt);
      if (networkLimit) return networkLimit;

      rememberIdempotency(idempotencyFingerprint, checkedAt);
      return { allowed: true };
    },
  };
}
