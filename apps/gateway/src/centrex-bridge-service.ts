import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import {
  createEventId,
  createTelephonyCallId,
  type CentrexBridgeEvent,
} from "@lawand/core";
import {
  telephonyCallObservationLinks,
  telephonyCallLegs,
  telephonyCallProviderIdentifiers,
  telephonyCalls,
  telephonyEndpoints,
  telephonyInboundCalls,
  telephonyInboundEvents,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";
import { createCentrexCallActivityService } from "./centrex-call-activity-service.js";
import {
  CENTREX_SUPERSEDED_END_CAUSE,
  endOtherActiveCentrexCalls,
  lockCentrexEndpointActiveCalls,
} from "./centrex-active-call.js";
import {
  CENTREX_INBOUND_HISTORY_BRIDGE_ID,
  CENTREX_RING_CALLBACK_BRIDGE_ID,
  centrexInboundCorrelationLock,
} from "./centrex-inbound-observer.js";
import {
  CENTREX_OBSERVATION_LINK_EARLY_TOLERANCE_MS,
  CENTREX_OBSERVATION_LINK_WINDOW_MS,
  chooseCentrexObservationLinkCandidate,
} from "./centrex-observation-link.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const CENTREX_SYNTHETIC_INBOUND_BRIDGE_IDS = [
  CENTREX_RING_CALLBACK_BRIDGE_ID,
  CENTREX_INBOUND_HISTORY_BRIDGE_ID,
] as const;
const CENTREX_BRIDGE_RING_RECONCILIATION_WINDOW_MS = 5_000;

export function selectCentrexSyntheticInboundCall<
  T extends {
    bridgeId: string;
    ringingAt: Date;
    endedAt: Date | null;
  },
>(eventOccurredAt: Date, candidates: readonly T[]): T | null {
  const matches = candidates.filter(
    (candidate) =>
      CENTREX_SYNTHETIC_INBOUND_BRIDGE_IDS.includes(
        candidate.bridgeId as (typeof CENTREX_SYNTHETIC_INBOUND_BRIDGE_IDS)[number],
      ) &&
      Math.abs(
        candidate.ringingAt.getTime() - eventOccurredAt.getTime(),
      ) <= CENTREX_BRIDGE_RING_RECONCILIATION_WINDOW_MS &&
      (candidate.endedAt === null || candidate.endedAt >= eventOccurredAt),
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

export class CentrexBridgeIngressError extends Error {
  constructor(
    readonly code:
      | "bridge_identity_mismatch"
      | "endpoint_not_found"
      | "endpoint_inactive"
      | "incoming_line_mismatch"
      | "agent_extension_mismatch"
      | "orphan_event"
      | "event_replay_conflict"
      | "nonce_replay_conflict"
      | "provider_call_conflict",
    message: string,
  ) {
    super(message);
  }
}

function maskedPhone(phone: string): string {
  return `***${phone.slice(-4)}`;
}

function eventDirection(event: CentrexBridgeEvent): "inbound" | "outbound" {
  return event.eventType.startsWith("inbound.") ? "inbound" : "outbound";
}

export function createCentrexBridgeIngressService(options: {
  db: Database;
  protection: DataProtection;
  now?: () => Date;
}) {
  const { db, protection, now = () => new Date() } = options;
  const callActivity = createCentrexCallActivityService({
    db,
    protection,
    now,
    fail(code, message) {
      throw new CentrexBridgeIngressError(code, message);
    },
  });

  async function linkOutboundObservation(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    call: {
      id: string;
      endpointId: string;
      callLegId: string | null;
      remotePhoneFingerprint: Buffer;
      ringingAt: Date;
    },
    linkedAt: Date,
  ) {
    const candidates = await tx
      .select({
        id: telephonyCalls.id,
        staffUserId: telephonyCalls.staffUserId,
        requestedAt: telephonyCalls.requestedAt,
      })
      .from(telephonyCalls)
      .leftJoin(
        telephonyCallObservationLinks,
        eq(
          telephonyCallObservationLinks.telephonyCallId,
          telephonyCalls.id,
        ),
      )
      .where(
        and(
          eq(telephonyCalls.provider, "centrex"),
          eq(telephonyCalls.direction, "outbound"),
          eq(telephonyCalls.endpointId, call.endpointId),
          eq(
            telephonyCalls.remotePhoneFingerprint,
            call.remotePhoneFingerprint,
          ),
          inArray(telephonyCalls.commandStatus, [
            "dispatching",
            "succeeded",
            "unknown",
          ]),
          isNull(telephonyCallObservationLinks.telephonyCallId),
          gte(
            telephonyCalls.requestedAt,
            new Date(
              call.ringingAt.getTime() - CENTREX_OBSERVATION_LINK_WINDOW_MS,
            ),
          ),
          lte(
            telephonyCalls.requestedAt,
            new Date(
              call.ringingAt.getTime() +
                CENTREX_OBSERVATION_LINK_EARLY_TOLERANCE_MS,
            ),
          ),
        ),
      );
    const candidate = chooseCentrexObservationLinkCandidate(
      call.ringingAt,
      candidates,
    );
    if (!candidate) return null;
    const selectedCandidate = candidates.find(
      (item) => item.id === candidate.id,
    );
    if (!selectedCandidate) return null;

    const [link] = await tx
      .insert(telephonyCallObservationLinks)
      .values({
        observedCallId: call.id,
        telephonyCallId: candidate.id,
        matchMethod: "endpoint_phone_time_v1",
        timeDeltaMs: candidate.timeDeltaMs,
        linkedAt,
        createdAt: linkedAt,
      })
      .onConflictDoNothing()
      .returning();
    if (link && call.callLegId) {
      await tx
        .update(telephonyCallLegs)
        .set({
          staffUserId: selectedCandidate.staffUserId,
          updatedAt: linkedAt,
        })
        .where(eq(telephonyCallLegs.id, call.callLegId));
    }
    return link ?? null;
  }

  async function ingest(
    event: CentrexBridgeEvent,
    authentication: {
      bridgeId: string;
      endpointId: string;
      authenticationNonceHash: Buffer;
    },
  ) {
    if (event.schemaVersion === 2) {
      return callActivity.ingest(event, authentication);
    }
    if (
      event.bridgeId !== authentication.bridgeId ||
      event.endpointId !== authentication.endpointId
    ) {
      throw new CentrexBridgeIngressError(
        "bridge_identity_mismatch",
        "서명된 bridge와 이벤트 대상 회선이 일치하지 않습니다.",
      );
    }

    const eventFingerprint = protection.fingerprint(event);
    const direction = eventDirection(event);
    const callLock = protection.fingerprint({
      endpointId: event.endpointId,
      providerCallId: event.providerCallId,
    });
    const occurredAt = new Date(event.occurredAt);
    const receivedAt = now();

    return db.transaction(async (tx) => {
      const ringing =
        event.eventType === "inbound.ringing" ||
        event.eventType === "outbound.ringing";
      if (ringing) {
        await lockCentrexEndpointActiveCalls(
          tx,
          protection,
          event.endpointId,
        );
      }
      const correlationLock =
        event.eventType === "inbound.ringing"
          ? centrexInboundCorrelationLock(
              protection,
              event.endpointId,
              event.callerNumber,
            )
          : callLock;
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(correlationLock)} as bigint))`,
      );

      const [existingEvent] = await tx
        .select({
          callId: telephonyInboundEvents.inboundCallId,
          eventFingerprint: telephonyInboundEvents.eventFingerprint,
        })
        .from(telephonyInboundEvents)
        .where(eq(telephonyInboundEvents.id, event.eventId))
        .limit(1);
      if (existingEvent) {
        if (!existingEvent.eventFingerprint.equals(eventFingerprint)) {
          throw new CentrexBridgeIngressError(
            "event_replay_conflict",
            "같은 이벤트 ID의 내용이 기존 원장과 다릅니다.",
          );
        }
        const [call] = await tx
          .select({
            direction: telephonyInboundCalls.direction,
            state: telephonyInboundCalls.state,
          })
          .from(telephonyInboundCalls)
          .where(eq(telephonyInboundCalls.id, existingEvent.callId))
          .limit(1);
        return {
          callId: existingEvent.callId,
          state: call?.state ?? "ended",
          direction: call?.direction ?? direction,
          replayed: true,
        };
      }

      const [nonceEvent] = await tx
        .select({ id: telephonyInboundEvents.id })
        .from(telephonyInboundEvents)
        .where(
          and(
            eq(telephonyInboundEvents.bridgeId, event.bridgeId),
            eq(
              telephonyInboundEvents.authenticationNonceHash,
              authentication.authenticationNonceHash,
            ),
          ),
        )
        .limit(1);
      if (nonceEvent) {
        throw new CentrexBridgeIngressError(
          "nonce_replay_conflict",
          "이미 사용한 인증 nonce입니다.",
        );
      }

      const [endpoint] = await tx
        .select({
          id: telephonyEndpoints.id,
          lineNumber: telephonyEndpoints.lineNumber,
          isActive: telephonyEndpoints.isActive,
        })
        .from(telephonyEndpoints)
        .where(eq(telephonyEndpoints.id, event.endpointId))
        .limit(1);
      if (!endpoint) {
        throw new CentrexBridgeIngressError(
          "endpoint_not_found",
          "등록된 전화 회선을 찾을 수 없습니다.",
        );
      }
      if (!endpoint.isActive) {
        throw new CentrexBridgeIngressError(
          "endpoint_inactive",
          "비활성 전화 회선의 이벤트입니다.",
        );
      }

      let [call] = await tx
        .select()
        .from(telephonyInboundCalls)
        .where(
          and(
            eq(telephonyInboundCalls.endpointId, event.endpointId),
            eq(
              telephonyInboundCalls.providerCallId,
              event.providerCallId,
            ),
          ),
        )
        .limit(1)
        .for("update");

      if (
        event.eventType === "inbound.ringing" ||
        event.eventType === "outbound.ringing"
      ) {
        if (
          event.eventType === "inbound.ringing" &&
          event.incomingLineNumber !== endpoint.lineNumber
        ) {
          throw new CentrexBridgeIngressError(
            "incoming_line_mismatch",
            "수신 이벤트의 회선 번호가 등록된 endpoint와 다릅니다.",
          );
        }
        const remotePhone =
          event.eventType === "inbound.ringing"
            ? event.callerNumber
            : event.calledNumber;
        const lineNumber =
          event.eventType === "inbound.ringing"
            ? event.incomingLineNumber
            : endpoint.lineNumber;
        const phoneFingerprint = protection.fingerprint(remotePhone);
        if (!call && event.eventType === "inbound.ringing") {
          const syntheticCandidates = await tx
            .select()
            .from(telephonyInboundCalls)
            .where(
              and(
                eq(telephonyInboundCalls.endpointId, event.endpointId),
                eq(telephonyInboundCalls.direction, "inbound"),
                inArray(
                  telephonyInboundCalls.bridgeId,
                  [...CENTREX_SYNTHETIC_INBOUND_BRIDGE_IDS],
                ),
                eq(
                  telephonyInboundCalls.remotePhoneFingerprint,
                  phoneFingerprint,
                ),
                gte(
                  telephonyInboundCalls.ringingAt,
                  new Date(
                    occurredAt.getTime() -
                      CENTREX_BRIDGE_RING_RECONCILIATION_WINDOW_MS,
                  ),
                ),
                lte(
                  telephonyInboundCalls.ringingAt,
                  new Date(
                    occurredAt.getTime() +
                      CENTREX_BRIDGE_RING_RECONCILIATION_WINDOW_MS,
                  ),
                ),
              ),
            )
            .orderBy(sql`${telephonyInboundCalls.ringingAt} DESC`)
            .limit(3)
            .for("update");
          const syntheticCall = selectCentrexSyntheticInboundCall(
            occurredAt,
            syntheticCandidates,
          );
          if (syntheticCall) {
            const [mergedCall] = await tx
              .update(telephonyInboundCalls)
              .set({
                bridgeId: event.bridgeId,
                providerCallId: event.providerCallId,
                ringingAt:
                  syntheticCall.ringingAt < occurredAt
                    ? syntheticCall.ringingAt
                    : occurredAt,
                lastEventAt:
                  syntheticCall.lastEventAt > occurredAt
                    ? syntheticCall.lastEventAt
                    : occurredAt,
                updatedAt: receivedAt,
              })
              .where(eq(telephonyInboundCalls.id, syntheticCall.id))
              .returning();
            call = mergedCall;
          }
        }
        if (call?.state !== "ended") {
          await endOtherActiveCentrexCalls(tx, protection, {
            endpointId: event.endpointId,
            ...(call ? { currentCallId: call.id } : {}),
            occurredAt,
            receivedAt,
            triggeringEventId: event.eventId,
          });
        }
        if (!call) {
          const callId = createTelephonyCallId();
          const encryptedPhone = protection.encrypt(
            remotePhone,
            `telephony_inbound_calls/${callId}/remote_phone`,
          );
          [call] = await tx
            .insert(telephonyInboundCalls)
            .values({
              id: callId,
              provider: "centrex",
              direction,
              endpointId: event.endpointId,
              bridgeId: event.bridgeId,
              providerCallId: event.providerCallId,
              remotePhoneCiphertext: encryptedPhone.ciphertext,
              remotePhoneNonce: encryptedPhone.nonce,
              remotePhoneKeyVersion: encryptedPhone.keyVersion,
              remotePhoneFingerprint: phoneFingerprint,
              remotePhoneMasked: maskedPhone(remotePhone),
              incomingLineLast4: lineNumber.slice(-4),
              state: "ringing",
              ringingAt: occurredAt,
              lastEventAt: occurredAt,
              createdAt: receivedAt,
              updatedAt: receivedAt,
            })
            .returning();
        } else if (
          call.bridgeId !== event.bridgeId ||
          call.direction !== direction ||
          call.incomingLineLast4 !== lineNumber.slice(-4) ||
          !call.remotePhoneFingerprint.equals(phoneFingerprint)
        ) {
          throw new CentrexBridgeIngressError(
            "provider_call_conflict",
            "provider 통화 ID가 다른 통화 정보에 이미 연결돼 있습니다.",
          );
        }
      } else if (!call) {
        throw new CentrexBridgeIngressError(
          "orphan_event",
          "통화 시작 이벤트가 없는 후속 이벤트입니다.",
        );
      }

      if (call && call.direction !== direction) {
        throw new CentrexBridgeIngressError(
          "provider_call_conflict",
          "provider 통화 ID의 수신·발신 방향이 기존 원장과 다릅니다.",
        );
      }

      if (!call) {
        throw new CentrexBridgeIngressError(
          "orphan_event",
          "센트릭스 통화 원장을 만들지 못했습니다.",
        );
      }

      let persistedCall = call;

      if (
        (event.eventType === "inbound.connected" ||
          event.eventType === "outbound.connected") &&
        persistedCall.state === "ringing"
      ) {
        const [updatedCall] = await tx
          .update(telephonyInboundCalls)
          .set({
            state: "connected",
            connectedAt: occurredAt,
            lastEventAt: occurredAt,
            updatedAt: receivedAt,
          })
          .where(eq(telephonyInboundCalls.id, persistedCall.id))
          .returning();
        if (updatedCall) persistedCall = updatedCall;
      } else if (
        (event.eventType === "inbound.ended" ||
          event.eventType === "outbound.ended") &&
        (persistedCall.state !== "ended" ||
          persistedCall.providerEndCause === CENTREX_SUPERSEDED_END_CAUSE)
      ) {
        const endedAt =
          occurredAt >= persistedCall.ringingAt
            ? occurredAt
            : persistedCall.ringingAt;
        const lastEventAt =
          persistedCall.lastEventAt >= occurredAt
            ? persistedCall.lastEventAt
            : occurredAt;
        const [updatedCall] = await tx
          .update(telephonyInboundCalls)
          .set({
            state: "ended",
            endedAt,
            providerEndCause: event.providerEndCause,
            lastEventAt,
            updatedAt: receivedAt,
          })
          .where(eq(telephonyInboundCalls.id, persistedCall.id))
          .returning();
        if (updatedCall) persistedCall = updatedCall;
      }

      const [activityLeg] = await tx
        .select({
          id: telephonyCallLegs.id,
          rootId: telephonyCallLegs.rootId,
        })
        .from(telephonyCallLegs)
        .where(
          and(
            eq(telephonyCallLegs.endpointId, event.endpointId),
            eq(telephonyCallLegs.providerCallId, event.providerCallId),
          ),
        )
        .limit(1);
      if (
        activityLeg &&
        (persistedCall.callRootId !== activityLeg.rootId ||
          persistedCall.callLegId !== activityLeg.id)
      ) {
        const [linkedCall] = await tx
          .update(telephonyInboundCalls)
          .set({
            callRootId: activityLeg.rootId,
            callLegId: activityLeg.id,
            updatedAt: receivedAt,
          })
          .where(eq(telephonyInboundCalls.id, persistedCall.id))
          .returning();
        if (linkedCall) persistedCall = linkedCall;
      }

      if (
        ringing &&
        persistedCall.callRootId &&
        persistedCall.callLegId
      ) {
        await tx
          .insert(telephonyCallProviderIdentifiers)
          .values({
            id: createEventId(),
            rootId: persistedCall.callRootId,
            legId: persistedCall.callLegId,
            endpointId: persistedCall.endpointId,
            provider: "centrex",
            role: "root",
            providerValue: event.providerCallId,
            firstObservedAt: occurredAt,
            lastObservedAt: occurredAt,
            createdAt: receivedAt,
          })
          .onConflictDoNothing();
      }

      await callActivity.syncLegacyCall(tx, {
        endpointId: persistedCall.endpointId,
        providerCallId: persistedCall.providerCallId,
        callRootId: persistedCall.callRootId,
        callLegId: persistedCall.callLegId,
        state: persistedCall.state,
        ringingAt: persistedCall.ringingAt,
        connectedAt: persistedCall.connectedAt,
        endedAt: persistedCall.endedAt,
        providerEndCause: persistedCall.providerEndCause,
        lastEventAt: persistedCall.lastEventAt,
        receivedAt,
      });

      await tx.insert(telephonyInboundEvents).values({
        id: event.eventId,
        inboundCallId: persistedCall.id,
        endpointId: event.endpointId,
        bridgeId: event.bridgeId,
        direction,
        eventType: event.eventType,
        providerCallId: event.providerCallId,
        providerChannelId:
          event.eventType === "inbound.connected" ||
          event.eventType === "outbound.connected"
            ? (event.providerChannelId ?? null)
            : null,
        providerEndCause:
          event.eventType === "inbound.ended" ||
          event.eventType === "outbound.ended"
            ? event.providerEndCause
            : null,
        eventFingerprint,
        authenticationNonceHash: authentication.authenticationNonceHash,
        occurredAt,
        receivedAt,
        createdAt: receivedAt,
      });

      if (persistedCall.direction === "outbound") {
        await linkOutboundObservation(tx, persistedCall, receivedAt);
      }

      return {
        callId: persistedCall.id,
        direction: persistedCall.direction,
        state: persistedCall.state,
        replayed: false,
      };
    });
  }

  return { ingest };
}

export type CentrexBridgeIngressService = ReturnType<
  typeof createCentrexBridgeIngressService
>;
