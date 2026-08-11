import { timingSafeEqual } from "node:crypto";

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  notInArray,
  sql,
} from "drizzle-orm";

import { createEventId, createTelephonyCallId } from "@lawand/core";
import {
  staffTelephonyBindings,
  telephonyCallLegs,
  telephonyCallProviderIdentifiers,
  telephonyCallRoots,
  telephonyEndpoints,
  telephonyInboundCalls,
  telephonyInboundEvents,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type {
  CentrexClient,
  CentrexInboundCallHistoryRecord,
} from "./centrex.js";
import { CentrexDeliveryError } from "./centrex.js";
import type { CentrexCredentialVault } from "./centrex-credential-vault.js";
import {
  endOtherActiveCentrexCalls,
  lockCentrexEndpointActiveCalls,
} from "./centrex-active-call.js";
import type { DataProtection } from "./crypto.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const CENTREX_RING_CALLBACK_BRIDGE_ID = "uplus-ring-callback";
export const CENTREX_INBOUND_HISTORY_BRIDGE_ID = "uplus-inbound-history";
export const CENTREX_RING_CALLBACK_PREFIX = "/v1/centrex-ring/";

const CALLBACK_DEDUPLICATION_WINDOW_MS = 30_000;
const CALLBACK_ENDED_REPLAY_WINDOW_MS = 5_000;
const ANSWERED_CORRELATION_WINDOW_MS = 10 * 60 * 1_000;
const UNANSWERED_CORRELATION_WINDOW_MS = 15_000;
const HISTORY_LOOKBACK_MS = 24 * 60 * 60 * 1_000;
const REGISTRATION_RETRY_MS = 5 * 60 * 1_000;
const STALE_CALLBACK_MAX_AGE_MS = 6 * 60 * 60 * 1_000;
const STALE_BRIDGE_RINGING_MAX_AGE_MS = 5 * 60 * 1_000;
const CENTREX_OBSERVATION_TIMEOUT_BRIDGE_ID =
  "centrex-observation-timeout";

export function normalizeCentrexInboundHistoryTimeline(input: {
  currentRingingAt: Date;
  currentConnectedAt: Date | null;
  providerStartedAt: Date;
  providerEndedAt: Date;
  providerAnswered: boolean;
}) {
  const ringingAt = new Date(
    Math.min(
      input.currentRingingAt.getTime(),
      input.providerStartedAt.getTime(),
    ),
  );
  const connectedAt = input.currentConnectedAt ??
    (input.providerAnswered
      ? new Date(
          Math.max(
            input.currentRingingAt.getTime(),
            input.providerStartedAt.getTime(),
          ),
        )
      : null);
  const endedAt = new Date(
    Math.max(
      input.providerEndedAt.getTime(),
      connectedAt?.getTime() ?? ringingAt.getTime(),
    ),
  );
  return { ringingAt, connectedAt, endedAt };
}

export async function reconcileCentrexInboundHistoryBatch<T>(
  records: readonly T[],
  reconcile: (record: T) => Promise<boolean>,
  onFailure: (error: unknown, record: T) => void,
) {
  let reconciled = 0;
  let failed = 0;
  for (const record of records) {
    try {
      if (await reconcile(record)) reconciled += 1;
    } catch (error) {
      failed += 1;
      onFailure(error, record);
    }
  }
  return { reconciled, failed };
}

const CALLBACK_QUERY_KEYS = new Set([
  "sender",
  "receiver",
  "kind",
  "inner_num",
  "message",
]);

type Endpoint = {
  id: string;
  lineNumber: string;
  extension: string;
  apiLoginId: string;
  credentialKey: string;
};

export class CentrexRingCallbackError extends Error {
  constructor(
    readonly code:
      | "invalid_callback"
      | "endpoint_not_found"
      | "endpoint_mismatch",
    message: string,
  ) {
    super(message);
  }
}

function onlyValue(searchParams: URLSearchParams, key: string): string | null {
  const values = searchParams.getAll(key);
  return values.length === 1 ? (values[0] ?? null) : null;
}

function parseProviderDateTime(value: string): Date | null {
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

function normalizedPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return /^0[0-9]{8,10}$/.test(digits) ? digits : null;
}

function maskedPhone(phone: string): string {
  return `***${phone.slice(-4)}`;
}

function normalizedHistoryCause(
  status: CentrexInboundCallHistoryRecord["status"],
): string {
  return status.replaceAll(" ", "_");
}

function historyReconciliationErrorCode(error: unknown): string {
  if (error instanceof CentrexDeliveryError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "23514") return "database_check_violation";
    if (code === "23505") return "database_unique_violation";
  }
  return "unexpected_error";
}

function historyProviderCallId(
  protection: DataProtection,
  endpointId: string,
  record: CentrexInboundCallHistoryRecord,
): string {
  return `inhist:${protection
    .fingerprint({
      endpointId,
      time: record.time,
      source: record.source,
      destination: record.destination,
      durationSeconds: record.durationSeconds,
      status: record.status,
      endTime: record.endTime,
    })
    .toString("hex")
    .slice(0, 56)}`;
}

export function centrexInboundCorrelationLock(
  protection: DataProtection,
  endpointId: string,
  remotePhone: string,
): Buffer {
  return protection.fingerprint({
    source: "centrex_inbound_correlation",
    endpointId,
    remotePhone,
  });
}

function eventHashes(
  protection: DataProtection,
  input: Record<string, unknown>,
) {
  return {
    eventFingerprint: protection.fingerprint({
      source: "uplus_inbound_event",
      ...input,
    }),
    authenticationNonceHash: protection.fingerprint({
      source: "uplus_inbound_nonce",
      eventId: input.eventId,
      eventType: input.eventType,
    }),
  };
}

export function createCentrexInboundObserver(options: {
  db: Database;
  protection: DataProtection;
  centrexClient: CentrexClient;
  credentialVault: CentrexCredentialVault;
  callbackToken: string;
  callbackHost: string;
  callbackPort: number;
  pollIntervalMs: number;
  now?: () => Date;
}) {
  const {
    db,
    protection,
    centrexClient,
    credentialVault,
    callbackToken,
    callbackHost,
    callbackPort,
    pollIntervalMs,
    now = () => new Date(),
  } = options;
  const callbackPath = `${CENTREX_RING_CALLBACK_PREFIX}${callbackToken}.html`;
  const registeredEndpointIds = new Set<string>();
  const registrationRetryAt = new Map<string, number>();
  let stopped = true;
  let timer: NodeJS.Timeout | undefined;
  let currentRun: Promise<void> | undefined;

  async function persistObservedCallRoot(
    tx: Transaction,
    input: {
      callId: string;
      endpointId: string;
      bridgeId: string;
      providerCallId: string;
      phoneCiphertext: Buffer;
      phoneNonce: Buffer;
      phoneKeyVersion: string;
      phoneFingerprint: Buffer;
      phoneMasked: string;
      lineLast4: string;
      state: "ringing" | "connected" | "ended";
      ringingAt: Date;
      connectedAt: Date | null;
      endedAt: Date | null;
      providerEndCause: string | null;
      lastEventAt: Date;
      receivedAt: Date;
    },
  ) {
    const ownerRows = await tx
      .select({ staffUserId: staffTelephonyBindings.staffUserId })
      .from(staffTelephonyBindings)
      .where(
        and(
          eq(staffTelephonyBindings.endpointId, input.endpointId),
          eq(staffTelephonyBindings.isActive, true),
        ),
      )
      .limit(2);
    const staffUserId =
      ownerRows.length === 1 ? ownerRows[0]!.staffUserId : null;
    const [linkedCall] = await tx
      .select({
        rootId: telephonyInboundCalls.callRootId,
        legId: telephonyInboundCalls.callLegId,
      })
      .from(telephonyInboundCalls)
      .where(eq(telephonyInboundCalls.id, input.callId))
      .limit(1);
    const [identifierMatch] = !linkedCall?.rootId
      ? await tx
          .select({
            rootId: telephonyCallProviderIdentifiers.rootId,
            legId: telephonyCallProviderIdentifiers.legId,
          })
          .from(telephonyCallProviderIdentifiers)
          .where(
            and(
              eq(telephonyCallProviderIdentifiers.endpointId, input.endpointId),
              eq(telephonyCallProviderIdentifiers.provider, "centrex"),
              eq(
                telephonyCallProviderIdentifiers.providerValue,
                input.providerCallId,
              ),
            ),
          )
          .limit(1)
      : [];
    const [timeMatch] = !linkedCall?.rootId && !identifierMatch
      ? await tx
          .select({
            rootId: telephonyCallRoots.id,
            legId: telephonyCallLegs.id,
          })
          .from(telephonyCallRoots)
          .innerJoin(
            telephonyCallLegs,
            and(
              eq(telephonyCallLegs.rootId, telephonyCallRoots.id),
              eq(telephonyCallLegs.kind, "customer"),
              eq(telephonyCallLegs.endpointId, input.endpointId),
            ),
          )
          .where(
            and(
              eq(telephonyCallRoots.scope, "external"),
              eq(telephonyCallRoots.direction, "inbound"),
              eq(telephonyCallRoots.originalEndpointId, input.endpointId),
              eq(
                telephonyCallRoots.remotePhoneFingerprint,
                input.phoneFingerprint,
              ),
              gte(
                telephonyCallRoots.startedAt,
                new Date(input.ringingAt.getTime() - 30_000),
              ),
              lte(
                telephonyCallRoots.startedAt,
                new Date(input.ringingAt.getTime() + 5_000),
              ),
            ),
          )
          .orderBy(desc(telephonyCallRoots.startedAt))
          .limit(1)
          .for("update")
      : [];
    const rootId =
      linkedCall?.rootId ?? identifierMatch?.rootId ?? timeMatch?.rootId ?? input.callId;
    let legId = linkedCall?.legId ?? identifierMatch?.legId ?? timeMatch?.legId ?? null;

    let [root] = await tx
      .select()
      .from(telephonyCallRoots)
      .where(eq(telephonyCallRoots.id, rootId))
      .limit(1)
      .for("update");
    if (!root) {
      [root] = await tx
        .insert(telephonyCallRoots)
        .values({
          id: rootId,
          provider: "centrex",
          scope: "external",
          direction: "inbound",
          state: input.state,
          correlationStatus: "confirmed",
          originalEndpointId: input.endpointId,
          currentEndpointId: input.endpointId,
          finalEndpointId: input.state === "ended" ? input.endpointId : null,
          finalStaffUserId: input.state === "ended" ? staffUserId : null,
          remotePhoneCiphertext: input.phoneCiphertext,
          remotePhoneNonce: input.phoneNonce,
          remotePhoneKeyVersion: input.phoneKeyVersion,
          remotePhoneFingerprint: input.phoneFingerprint,
          remotePhoneMasked: input.phoneMasked,
          originalLineLast4: input.lineLast4,
          startedAt: input.ringingAt,
          connectedAt: input.connectedAt,
          endedAt: input.endedAt,
          lastEventAt: input.lastEventAt,
          createdAt: input.receivedAt,
          updatedAt: input.receivedAt,
        })
        .returning();
    }
    if (!root) throw new Error("centrex_observed_call_root_not_persisted");

    let [leg] = legId
      ? await tx
          .select()
          .from(telephonyCallLegs)
          .where(eq(telephonyCallLegs.id, legId))
          .limit(1)
          .for("update")
      : [];
    if (!leg) {
      [leg] = await tx
        .insert(telephonyCallLegs)
        .values({
          id: createTelephonyCallId(),
          rootId,
          endpointId: input.endpointId,
          staffUserId,
          bridgeId: input.bridgeId,
          kind: "customer",
          direction: "inbound",
          state: input.state,
          remotePartyKind: "external",
          providerCallId: input.providerCallId,
          providerEndCause:
            input.state === "ended"
              ? input.providerEndCause ?? "provider_history_unknown"
              : null,
          correlationStatus: "confirmed",
          startedAt: input.ringingAt,
          connectedAt: input.connectedAt,
          endedAt: input.endedAt,
          lastEventAt: input.lastEventAt,
          createdAt: input.receivedAt,
          updatedAt: input.receivedAt,
        })
        .onConflictDoNothing()
        .returning();
    }
    if (!leg) {
      [leg] = await tx
        .select()
        .from(telephonyCallLegs)
        .where(
          and(
            eq(telephonyCallLegs.endpointId, input.endpointId),
            eq(telephonyCallLegs.providerCallId, input.providerCallId),
          ),
        )
        .limit(1)
        .for("update");
    }
    if (!leg) throw new Error("centrex_observed_call_leg_not_persisted");
    legId = leg.id;

    if (input.state === "ended" && root.state !== "ended") {
      const endedAt = input.endedAt ?? input.lastEventAt;
      const [endedLeg] = await tx
        .update(telephonyCallLegs)
        .set({
          state: "ended",
          staffUserId: leg.staffUserId ?? staffUserId,
          providerEndCause:
            input.providerEndCause ?? "provider_history_unknown",
          startedAt:
            leg.startedAt <= input.ringingAt ? leg.startedAt : input.ringingAt,
          connectedAt: leg.connectedAt ?? input.connectedAt,
          endedAt: endedAt >= leg.startedAt ? endedAt : leg.startedAt,
          lastEventAt:
            leg.lastEventAt >= input.lastEventAt
              ? leg.lastEventAt
              : input.lastEventAt,
          updatedAt: input.receivedAt,
        })
        .where(eq(telephonyCallLegs.id, leg.id))
        .returning();
      if (endedLeg) leg = endedLeg;
      const activeLegs = await tx
        .select({
          kind: telephonyCallLegs.kind,
          state: telephonyCallLegs.state,
        })
        .from(telephonyCallLegs)
        .where(
          and(
            eq(telephonyCallLegs.rootId, rootId),
            sql`${telephonyCallLegs.id} <> ${leg.id}`,
            inArray(telephonyCallLegs.state, ["ringing", "connected"]),
          ),
        );
      const activeCustomers = activeLegs.filter(
        (item) => item.kind === "customer",
      );
      const nextState = activeCustomers.some(
        (item) => item.state === "connected",
      )
        ? "connected"
        : activeCustomers.length
          ? "transferring"
          : activeLegs.length
            ? "needs_confirmation"
            : "ended";
      const rootEnded = nextState === "ended";
      const normalizedEndedAt = endedAt >= root.startedAt ? endedAt : root.startedAt;
      await tx
        .update(telephonyCallRoots)
        .set({
          state: nextState,
          correlationStatus:
            nextState === "needs_confirmation"
              ? "needs_confirmation"
              : root.correlationStatus,
          finalEndpointId: rootEnded ? leg.endpointId : root.finalEndpointId,
          finalStaffUserId: rootEnded ? leg.staffUserId : root.finalStaffUserId,
          endedAt: rootEnded ? normalizedEndedAt : null,
          lastEventAt:
            root.lastEventAt >= input.lastEventAt
              ? root.lastEventAt
              : input.lastEventAt,
          updatedAt: input.receivedAt,
        })
        .where(eq(telephonyCallRoots.id, rootId));
    } else if (input.state !== "ended" && root.state !== "ended") {
      const nextLegState =
        input.state === "connected" || leg.state === "connected"
          ? "connected"
          : leg.state;
      await tx
        .update(telephonyCallLegs)
        .set({
          state: nextLegState,
          startedAt:
            leg.startedAt <= input.ringingAt ? leg.startedAt : input.ringingAt,
          connectedAt: leg.connectedAt ?? input.connectedAt,
          lastEventAt:
            leg.lastEventAt >= input.lastEventAt
              ? leg.lastEventAt
              : input.lastEventAt,
          updatedAt: input.receivedAt,
        })
        .where(eq(telephonyCallLegs.id, leg.id));
      await tx
        .update(telephonyCallRoots)
        .set({
          state:
            input.state === "connected" && root.state === "ringing"
              ? "connected"
              : root.state,
          startedAt:
            root.startedAt <= input.ringingAt ? root.startedAt : input.ringingAt,
          connectedAt: root.connectedAt ?? input.connectedAt,
          lastEventAt:
            root.lastEventAt >= input.lastEventAt
              ? root.lastEventAt
              : input.lastEventAt,
          updatedAt: input.receivedAt,
        })
        .where(eq(telephonyCallRoots.id, rootId));
    }
    await tx
      .insert(telephonyCallProviderIdentifiers)
      .values({
        id: createEventId(),
        rootId,
        legId,
        endpointId: input.endpointId,
        provider: "centrex",
        role: "root",
        providerValue: input.providerCallId,
        firstObservedAt: input.ringingAt,
        lastObservedAt: input.lastEventAt,
        createdAt: input.receivedAt,
      })
      .onConflictDoUpdate({
        target: [
          telephonyCallProviderIdentifiers.endpointId,
          telephonyCallProviderIdentifiers.role,
          telephonyCallProviderIdentifiers.providerValue,
        ],
        set: {
          firstObservedAt: sql`least(${telephonyCallProviderIdentifiers.firstObservedAt}, ${input.ringingAt})`,
          lastObservedAt: sql`greatest(${telephonyCallProviderIdentifiers.lastObservedAt}, ${input.lastEventAt})`,
        },
      });
    await tx
      .update(telephonyInboundCalls)
      .set({ callRootId: rootId, callLegId: legId })
      .where(eq(telephonyInboundCalls.id, input.callId));
  }

  function matchesPath(pathname: string): boolean {
    const actual = Buffer.from(pathname);
    const expected = Buffer.from(callbackPath);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async function activeEndpoints(): Promise<Endpoint[]> {
    return db
      .selectDistinct({
        id: telephonyEndpoints.id,
        lineNumber: telephonyEndpoints.lineNumber,
        extension: telephonyEndpoints.extension,
        apiLoginId: telephonyEndpoints.apiLoginId,
        credentialKey: telephonyEndpoints.credentialKey,
      })
      .from(telephonyEndpoints)
      .innerJoin(
        staffTelephonyBindings,
        and(
          eq(staffTelephonyBindings.endpointId, telephonyEndpoints.id),
          eq(staffTelephonyBindings.isActive, true),
        ),
      )
      .where(
        and(
          eq(telephonyEndpoints.provider, "centrex"),
          eq(telephonyEndpoints.isActive, true),
        ),
      );
  }

  async function ingest(searchParams: URLSearchParams) {
    for (const key of searchParams.keys()) {
      if (!CALLBACK_QUERY_KEYS.has(key)) {
        throw new CentrexRingCallbackError(
          "invalid_callback",
          "허용하지 않는 센트릭스 수신 알림 필드입니다.",
        );
      }
    }
    const sender = onlyValue(searchParams, "sender");
    const receiver = onlyValue(searchParams, "receiver");
    const kind = onlyValue(searchParams, "kind");
    const extension = onlyValue(searchParams, "inner_num");
    const message = onlyValue(searchParams, "message");
    if (
      !sender ||
      !receiver ||
      kind !== "1" ||
      !extension ||
      message === null ||
      message !== "" ||
      !/^0[0-9]{8,10}$/.test(sender) ||
      !/^070[0-9]{8}$/.test(receiver) ||
      !/^[0-9]{2,10}$/.test(extension)
    ) {
      throw new CentrexRingCallbackError(
        "invalid_callback",
        "센트릭스 수신 알림 형식이 올바르지 않습니다.",
      );
    }

    const [endpoint] = await db
      .select({
        id: telephonyEndpoints.id,
        lineNumber: telephonyEndpoints.lineNumber,
        extension: telephonyEndpoints.extension,
      })
      .from(telephonyEndpoints)
      .innerJoin(
        staffTelephonyBindings,
        and(
          eq(staffTelephonyBindings.endpointId, telephonyEndpoints.id),
          eq(staffTelephonyBindings.isActive, true),
        ),
      )
      .where(
        and(
          eq(telephonyEndpoints.provider, "centrex"),
          eq(telephonyEndpoints.lineNumber, receiver),
          eq(telephonyEndpoints.isActive, true),
        ),
      )
      .limit(1);
    if (!endpoint) {
      throw new CentrexRingCallbackError(
        "endpoint_not_found",
        "등록된 센트릭스 수신 회선을 찾을 수 없습니다.",
      );
    }
    if (
      endpoint.lineNumber !== receiver ||
      endpoint.extension !== extension
    ) {
      throw new CentrexRingCallbackError(
        "endpoint_mismatch",
        "센트릭스 수신 회선과 내선이 일치하지 않습니다.",
      );
    }

    const receivedAt = now();
    const phoneFingerprint = protection.fingerprint(sender);
    const lock = centrexInboundCorrelationLock(
      protection,
      endpoint.id,
      sender,
    );
    return db.transaction(async (tx) => {
      await lockCentrexEndpointActiveCalls(tx, protection, endpoint.id);
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(lock)} as bigint))`,
      );
      const candidates = await tx
        .select()
        .from(telephonyInboundCalls)
        .where(
          and(
            eq(telephonyInboundCalls.endpointId, endpoint.id),
            eq(telephonyInboundCalls.direction, "inbound"),
            eq(telephonyInboundCalls.remotePhoneFingerprint, phoneFingerprint),
            gte(
              telephonyInboundCalls.ringingAt,
              new Date(
                receivedAt.getTime() - CALLBACK_DEDUPLICATION_WINDOW_MS,
              ),
            ),
            lte(
              telephonyInboundCalls.ringingAt,
              new Date(receivedAt.getTime() + 2_000),
            ),
          ),
        )
        .orderBy(desc(telephonyInboundCalls.ringingAt))
        .limit(3)
        .for("update");
      const existing = candidates.find(
        (call) =>
          call.state !== "ended" ||
          (call.endedAt !== null &&
            call.endedAt.getTime() >=
              receivedAt.getTime() - CALLBACK_ENDED_REPLAY_WINDOW_MS),
      );
      if (existing) {
        return {
          callId: existing.id,
          state: existing.state,
          replayed: true,
        };
      }

      const callId = createTelephonyCallId();
      const eventId = createEventId();
      const providerCallId = `ringcb:${eventId.replaceAll("-", "")}`;
      await endOtherActiveCentrexCalls(tx, protection, {
        endpointId: endpoint.id,
        occurredAt: receivedAt,
        receivedAt,
        triggeringEventId: eventId,
      });
      const encryptedPhone = protection.encrypt(
        sender,
        `telephony_inbound_calls/${callId}/remote_phone`,
      );
      await tx.insert(telephonyInboundCalls).values({
        id: callId,
        provider: "centrex",
        direction: "inbound",
        endpointId: endpoint.id,
        bridgeId: CENTREX_RING_CALLBACK_BRIDGE_ID,
        providerCallId,
        remotePhoneCiphertext: encryptedPhone.ciphertext,
        remotePhoneNonce: encryptedPhone.nonce,
        remotePhoneKeyVersion: encryptedPhone.keyVersion,
        remotePhoneFingerprint: phoneFingerprint,
        remotePhoneMasked: maskedPhone(sender),
        incomingLineLast4: receiver.slice(-4),
        state: "ringing",
        ringingAt: receivedAt,
        lastEventAt: receivedAt,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      });
      await persistObservedCallRoot(tx, {
        callId,
        endpointId: endpoint.id,
        bridgeId: CENTREX_RING_CALLBACK_BRIDGE_ID,
        providerCallId,
        phoneCiphertext: encryptedPhone.ciphertext,
        phoneNonce: encryptedPhone.nonce,
        phoneKeyVersion: encryptedPhone.keyVersion,
        phoneFingerprint,
        phoneMasked: maskedPhone(sender),
        lineLast4: receiver.slice(-4),
        state: "ringing",
        ringingAt: receivedAt,
        connectedAt: null,
        endedAt: null,
        providerEndCause: null,
        lastEventAt: receivedAt,
        receivedAt,
      });
      const hashes = eventHashes(protection, {
        eventId,
        eventType: "inbound.ringing",
        endpointId: endpoint.id,
        providerCallId,
        receivedAt: receivedAt.toISOString(),
      });
      await tx.insert(telephonyInboundEvents).values({
        id: eventId,
        inboundCallId: callId,
        endpointId: endpoint.id,
        bridgeId: CENTREX_RING_CALLBACK_BRIDGE_ID,
        direction: "inbound",
        eventType: "inbound.ringing",
        providerCallId,
        eventFingerprint: hashes.eventFingerprint,
        authenticationNonceHash: hashes.authenticationNonceHash,
        occurredAt: receivedAt,
        receivedAt,
        createdAt: receivedAt,
      });
      return { callId, state: "ringing" as const, replayed: false };
    });
  }

  async function ensureRegistered(
    endpoint: Endpoint,
    passwordSha512: string,
    currentTime: Date,
  ) {
    if (registeredEndpointIds.has(endpoint.id)) return;
    if ((registrationRetryAt.get(endpoint.id) ?? 0) > currentTime.getTime()) {
      return;
    }
    try {
      await centrexClient.setRingCallback({
        apiLoginId: endpoint.apiLoginId,
        passwordSha512,
        callbackPath,
        callbackHost,
        callbackPort,
      });
      registeredEndpointIds.add(endpoint.id);
      registrationRetryAt.delete(endpoint.id);
      console.log(
        JSON.stringify({
          event: "centrex_ring_callback_registered",
          endpointId: endpoint.id,
          lineLast4: endpoint.lineNumber.slice(-4),
          occurredAt: currentTime.toISOString(),
        }),
      );
    } catch (error) {
      registrationRetryAt.set(
        endpoint.id,
        currentTime.getTime() + REGISTRATION_RETRY_MS,
      );
      console.warn(
        JSON.stringify({
          event: "centrex_ring_callback_registration_failed",
          endpointId: endpoint.id,
          errorCode:
            error instanceof CentrexDeliveryError
              ? error.code
              : "unexpected_error",
          occurredAt: currentTime.toISOString(),
        }),
      );
    }
  }

  async function persistHistoryEvent(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    input: {
      eventType:
        | "inbound.ringing"
        | "inbound.connected"
        | "inbound.ended"
        | "outbound.ended";
      inboundCallId: string;
      endpointId: string;
      providerCallId: string;
      occurredAt: Date;
      receivedAt: Date;
      providerEndCause?: string;
      direction?: "inbound" | "outbound";
      bridgeId?: string;
    },
  ) {
    const eventId = createEventId();
    const hashes = eventHashes(protection, {
      eventId,
      eventType: input.eventType,
      endpointId: input.endpointId,
      providerCallId: input.providerCallId,
      occurredAt: input.occurredAt.toISOString(),
    });
    await tx.insert(telephonyInboundEvents).values({
      id: eventId,
      inboundCallId: input.inboundCallId,
      endpointId: input.endpointId,
      bridgeId: input.bridgeId ?? CENTREX_INBOUND_HISTORY_BRIDGE_ID,
      direction: input.direction ?? "inbound",
      eventType: input.eventType,
      providerCallId: input.providerCallId,
      providerEndCause: input.providerEndCause ?? null,
      eventFingerprint: hashes.eventFingerprint,
      authenticationNonceHash: hashes.authenticationNonceHash,
      occurredAt: input.occurredAt,
      receivedAt: input.receivedAt,
      createdAt: input.receivedAt,
    });
  }

  async function reconcileRecord(
    endpoint: Endpoint,
    record: CentrexInboundCallHistoryRecord,
    currentTime: Date,
  ): Promise<boolean> {
    const remotePhone = normalizedPhone(record.source);
    const destination = record.destination.replace(/\D/g, "");
    const startedAt = parseProviderDateTime(record.time);
    const endedAt = parseProviderDateTime(record.endTime);
    if (
      !remotePhone ||
      !startedAt ||
      !endedAt ||
      endedAt < startedAt ||
      (destination !== endpoint.lineNumber &&
        destination !== endpoint.extension) ||
      endedAt.getTime() < currentTime.getTime() - HISTORY_LOOKBACK_MS
    ) {
      return false;
    }
    const answered = record.status === "ANSWERED";
    const providerEndCause = normalizedHistoryCause(record.status);
    const providerCallId = historyProviderCallId(
      protection,
      endpoint.id,
      record,
    );
    const phoneFingerprint = protection.fingerprint(remotePhone);
    const correlationWindow = answered
      ? ANSWERED_CORRELATION_WINDOW_MS
      : UNANSWERED_CORRELATION_WINDOW_MS;
    const lock = centrexInboundCorrelationLock(
      protection,
      endpoint.id,
      remotePhone,
    );

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(lock)} as bigint))`,
      );
      const candidates = await tx
        .select()
        .from(telephonyInboundCalls)
        .where(
          and(
            eq(telephonyInboundCalls.endpointId, endpoint.id),
            eq(telephonyInboundCalls.direction, "inbound"),
            eq(telephonyInboundCalls.remotePhoneFingerprint, phoneFingerprint),
            gte(
              telephonyInboundCalls.ringingAt,
              new Date(startedAt.getTime() - correlationWindow),
            ),
            lte(
              telephonyInboundCalls.ringingAt,
              new Date(startedAt.getTime() + UNANSWERED_CORRELATION_WINDOW_MS),
            ),
          ),
        )
        .orderBy(desc(telephonyInboundCalls.ringingAt))
        .limit(8)
        .for("update");
      const exactProvider = candidates.find(
        (call) => call.providerCallId === providerCallId,
      );
      const call = exactProvider ?? candidates.find((candidate) => {
        if (candidate.endedAt) {
          return (
            Math.abs(candidate.endedAt.getTime() - endedAt.getTime()) <= 3_000
          );
        }
        return candidate.state !== "ended";
      });

      if (call?.state === "ended") return false;

      if (call) {
        const timeline = normalizeCentrexInboundHistoryTimeline({
          currentRingingAt: call.ringingAt,
          currentConnectedAt: call.connectedAt,
          providerStartedAt: startedAt,
          providerEndedAt: endedAt,
          providerAnswered: answered,
        });
        if (timeline.connectedAt && call.state === "ringing") {
          await persistHistoryEvent(tx, {
            eventType: "inbound.connected",
            inboundCallId: call.id,
            endpointId: endpoint.id,
            providerCallId,
            occurredAt: timeline.connectedAt,
            receivedAt: currentTime,
          });
        }
        await tx
          .update(telephonyInboundCalls)
          .set({
            state: "ended",
            ringingAt: timeline.ringingAt,
            connectedAt: timeline.connectedAt,
            endedAt: timeline.endedAt,
            providerEndCause,
            lastEventAt: timeline.endedAt,
            updatedAt: currentTime,
          })
          .where(eq(telephonyInboundCalls.id, call.id));
        await persistObservedCallRoot(tx, {
          callId: call.id,
          endpointId: endpoint.id,
          bridgeId: call.bridgeId,
          providerCallId: call.providerCallId,
          phoneCiphertext: call.remotePhoneCiphertext,
          phoneNonce: call.remotePhoneNonce,
          phoneKeyVersion: call.remotePhoneKeyVersion,
          phoneFingerprint: call.remotePhoneFingerprint,
          phoneMasked: call.remotePhoneMasked,
          lineLast4: call.incomingLineLast4,
          state: "ended",
          ringingAt: timeline.ringingAt,
          connectedAt: timeline.connectedAt,
          endedAt: timeline.endedAt,
          providerEndCause,
          lastEventAt: timeline.endedAt,
          receivedAt: currentTime,
        });
        await persistHistoryEvent(tx, {
          eventType: "inbound.ended",
          inboundCallId: call.id,
          endpointId: endpoint.id,
          providerCallId,
          occurredAt: timeline.endedAt,
          receivedAt: currentTime,
          providerEndCause,
        });
        return true;
      }

      const callId = createTelephonyCallId();
      const timeline = normalizeCentrexInboundHistoryTimeline({
        currentRingingAt: startedAt,
        currentConnectedAt: null,
        providerStartedAt: startedAt,
        providerEndedAt: endedAt,
        providerAnswered: answered,
      });
      const encryptedPhone = protection.encrypt(
        remotePhone,
        `telephony_inbound_calls/${callId}/remote_phone`,
      );
      await tx.insert(telephonyInboundCalls).values({
        id: callId,
        provider: "centrex",
        direction: "inbound",
        endpointId: endpoint.id,
        bridgeId: CENTREX_INBOUND_HISTORY_BRIDGE_ID,
        providerCallId,
        remotePhoneCiphertext: encryptedPhone.ciphertext,
        remotePhoneNonce: encryptedPhone.nonce,
        remotePhoneKeyVersion: encryptedPhone.keyVersion,
        remotePhoneFingerprint: phoneFingerprint,
        remotePhoneMasked: maskedPhone(remotePhone),
        incomingLineLast4: endpoint.lineNumber.slice(-4),
        state: "ended",
        ringingAt: timeline.ringingAt,
        connectedAt: timeline.connectedAt,
        endedAt: timeline.endedAt,
        providerEndCause,
        lastEventAt: timeline.endedAt,
        createdAt: currentTime,
        updatedAt: currentTime,
      });
      await persistObservedCallRoot(tx, {
        callId,
        endpointId: endpoint.id,
        bridgeId: CENTREX_INBOUND_HISTORY_BRIDGE_ID,
        providerCallId,
        phoneCiphertext: encryptedPhone.ciphertext,
        phoneNonce: encryptedPhone.nonce,
        phoneKeyVersion: encryptedPhone.keyVersion,
        phoneFingerprint,
        phoneMasked: maskedPhone(remotePhone),
        lineLast4: endpoint.lineNumber.slice(-4),
        state: "ended",
        ringingAt: timeline.ringingAt,
        connectedAt: timeline.connectedAt,
        endedAt: timeline.endedAt,
        providerEndCause,
        lastEventAt: timeline.endedAt,
        receivedAt: currentTime,
      });
      await persistHistoryEvent(tx, {
        eventType: "inbound.ringing",
        inboundCallId: callId,
        endpointId: endpoint.id,
        providerCallId,
        occurredAt: timeline.ringingAt,
        receivedAt: currentTime,
      });
      if (timeline.connectedAt) {
        await persistHistoryEvent(tx, {
          eventType: "inbound.connected",
          inboundCallId: callId,
          endpointId: endpoint.id,
          providerCallId,
          occurredAt: timeline.connectedAt,
          receivedAt: currentTime,
        });
      }
      await persistHistoryEvent(tx, {
        eventType: "inbound.ended",
        inboundCallId: callId,
        endpointId: endpoint.id,
        providerCallId,
        occurredAt: timeline.endedAt,
        receivedAt: currentTime,
        providerEndCause,
      });
      return true;
    });
  }

  async function reconcileEndpoint(
    endpoint: Endpoint,
    passwordSha512: string,
    currentTime: Date,
  ) {
    try {
      const history = await centrexClient.getInboundCallHistory({
        apiLoginId: endpoint.apiLoginId,
        passwordSha512,
        page: 1,
        pageSize: 50,
      });
      const result = await reconcileCentrexInboundHistoryBatch(
        [...history.records].reverse(),
        (record) => reconcileRecord(endpoint, record, currentTime),
        (error, record) => {
          console.warn(
            JSON.stringify({
              event: "centrex_inbound_history_record_reconciliation_failed",
              endpointId: endpoint.id,
              providerStatus: record.status,
              errorCode: historyReconciliationErrorCode(error),
              occurredAt: currentTime.toISOString(),
            }),
          );
        },
      );
      if (result.reconciled > 0) {
        console.log(
          JSON.stringify({
            event: "centrex_inbound_history_reconciled",
            endpointId: endpoint.id,
            count: result.reconciled,
            failedCount: result.failed,
            occurredAt: currentTime.toISOString(),
          }),
        );
      }
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "centrex_inbound_history_reconciliation_failed",
          endpointId: endpoint.id,
          errorCode:
            error instanceof CentrexDeliveryError
              ? error.code
              : "unexpected_error",
          occurredAt: currentTime.toISOString(),
        }),
      );
    }
  }

  async function expireStaleCallbacks(currentTime: Date) {
    const stale = await db
      .select({ id: telephonyInboundCalls.id })
      .from(telephonyInboundCalls)
      .where(
        and(
          eq(telephonyInboundCalls.direction, "inbound"),
          eq(telephonyInboundCalls.state, "ringing"),
          inArray(telephonyInboundCalls.bridgeId, [
            CENTREX_RING_CALLBACK_BRIDGE_ID,
            CENTREX_INBOUND_HISTORY_BRIDGE_ID,
          ]),
          lte(
            telephonyInboundCalls.ringingAt,
            new Date(currentTime.getTime() - STALE_CALLBACK_MAX_AGE_MS),
          ),
        ),
      )
      .limit(100);
    for (const candidate of stale) {
      await db.transaction(async (tx) => {
        const [call] = await tx
          .select({
            id: telephonyInboundCalls.id,
            endpointId: telephonyInboundCalls.endpointId,
            providerCallId: telephonyInboundCalls.providerCallId,
          })
          .from(telephonyInboundCalls)
          .where(
            and(
              eq(telephonyInboundCalls.id, candidate.id),
              eq(telephonyInboundCalls.state, "ringing"),
            ),
          )
          .for("update")
          .limit(1);
        if (!call) return;
        await tx
          .update(telephonyInboundCalls)
          .set({
            state: "ended",
            endedAt: currentTime,
            providerEndCause: "HISTORY_TIMEOUT",
            lastEventAt: currentTime,
            updatedAt: currentTime,
          })
          .where(eq(telephonyInboundCalls.id, call.id));
        await persistHistoryEvent(tx, {
          eventType: "inbound.ended",
          inboundCallId: call.id,
          endpointId: call.endpointId,
          providerCallId: call.providerCallId,
          occurredAt: currentTime,
          receivedAt: currentTime,
          providerEndCause: "HISTORY_TIMEOUT",
        });
      });
    }
  }

  async function expireStaleBridgeRinging(currentTime: Date) {
    const stale = await db
      .select({ id: telephonyInboundCalls.id })
      .from(telephonyInboundCalls)
      .where(
        and(
          eq(telephonyInboundCalls.state, "ringing"),
          notInArray(telephonyInboundCalls.bridgeId, [
            CENTREX_RING_CALLBACK_BRIDGE_ID,
            CENTREX_INBOUND_HISTORY_BRIDGE_ID,
            CENTREX_OBSERVATION_TIMEOUT_BRIDGE_ID,
          ]),
          lte(
            telephonyInboundCalls.ringingAt,
            new Date(
              currentTime.getTime() - STALE_BRIDGE_RINGING_MAX_AGE_MS,
            ),
          ),
        ),
      )
      .limit(100);
    for (const candidate of stale) {
      await db.transaction(async (tx) => {
        const [call] = await tx
          .select({
            id: telephonyInboundCalls.id,
            endpointId: telephonyInboundCalls.endpointId,
            providerCallId: telephonyInboundCalls.providerCallId,
            direction: telephonyInboundCalls.direction,
          })
          .from(telephonyInboundCalls)
          .where(
            and(
              eq(telephonyInboundCalls.id, candidate.id),
              eq(telephonyInboundCalls.state, "ringing"),
            ),
          )
          .for("update")
          .limit(1);
        if (!call) return;
        await tx
          .update(telephonyInboundCalls)
          .set({
            state: "ended",
            endedAt: currentTime,
            providerEndCause: "OBSERVATION_TIMEOUT",
            lastEventAt: currentTime,
            updatedAt: currentTime,
          })
          .where(eq(telephonyInboundCalls.id, call.id));
        await persistHistoryEvent(tx, {
          eventType:
            call.direction === "outbound"
              ? "outbound.ended"
              : "inbound.ended",
          inboundCallId: call.id,
          endpointId: call.endpointId,
          providerCallId: call.providerCallId,
          occurredAt: currentTime,
          receivedAt: currentTime,
          providerEndCause: "OBSERVATION_TIMEOUT",
          direction: call.direction,
          bridgeId: CENTREX_OBSERVATION_TIMEOUT_BRIDGE_ID,
        });
      });
    }
  }

  async function runCycle() {
    const currentTime = now();
    const endpoints = await activeEndpoints();
    for (const endpoint of endpoints) {
      const passwordSha512 = await credentialVault.get({
        endpointId: endpoint.id,
        credentialKey: endpoint.credentialKey,
      });
      if (!passwordSha512) continue;
      await ensureRegistered(endpoint, passwordSha512, currentTime);
      await reconcileEndpoint(endpoint, passwordSha512, currentTime);
    }
    await expireStaleCallbacks(currentTime);
    await expireStaleBridgeRinging(currentTime);
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      currentRun = runCycle()
        .catch((error) =>
          console.error("centrex inbound observer loop failed", error),
        )
        .finally(() => {
          currentRun = undefined;
          schedule();
        });
    }, pollIntervalMs);
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    currentRun = runCycle()
      .catch((error) =>
        console.error("centrex inbound observer initial run failed", error),
      )
      .finally(() => {
        currentRun = undefined;
        schedule();
      });
  }

  async function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    await currentRun;
  }

  return { callbackPath, ingest, matchesPath, runCycle, start, stop };
}

export type CentrexInboundObserver = ReturnType<
  typeof createCentrexInboundObserver
>;
