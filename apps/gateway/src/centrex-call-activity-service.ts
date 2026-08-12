import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";

import {
  createEventId,
  createTelephonyCallId,
  type CentrexBridgeCallObservation,
} from "@lawand/core";
import {
  staffTelephonyBindings,
  telephonyCallLegs,
  telephonyCallObservations,
  telephonyCallProviderIdentifiers,
  telephonyCallRelations,
  telephonyCallRoots,
  telephonyEndpoints,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";
import {
  areCentrexProviderIdsRelated,
  normalizeCentrexProviderReference,
} from "./centrex-provider-id.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type ActivityFailureCode =
  | "endpoint_not_found"
  | "endpoint_inactive"
  | "bridge_identity_mismatch"
  | "agent_extension_mismatch"
  | "event_replay_conflict"
  | "nonce_replay_conflict";

type ActivityFailure = (code: ActivityFailureCode, message: string) => never;

type RootRow = typeof telephonyCallRoots.$inferSelect;
type LegRow = typeof telephonyCallLegs.$inferSelect;

export type CentrexRootResolution =
  | "confirmed_external"
  | "pending_blind_transfer"
  | "confirmed_consultation"
  | "standalone_internal"
  | "needs_confirmation";

/**
 * 실측된 provider 근거만으로 root 귀속을 정한다. 시간 근접과 종료 cause는
 * 상관 근거에 포함하지 않는다.
 */
export function resolveCentrexRingingRoot(input: {
  partyKind: "external" | "internal" | "unknown";
  hasExactExternalRoot: boolean;
  hasContextExternalRoot: boolean;
  incomingLineMatchesEndpoint: boolean;
}): CentrexRootResolution {
  if (input.partyKind === "external") {
    if (input.hasExactExternalRoot) return "pending_blind_transfer";
    return input.incomingLineMatchesEndpoint
      ? "confirmed_external"
      : "needs_confirmation";
  }
  if (input.partyKind === "internal") {
    return input.hasContextExternalRoot
      ? "confirmed_consultation"
      : "standalone_internal";
  }
  return "needs_confirmation";
}

export function resolveCentrexRootAfterLegEnd(input: {
  scope: "external" | "internal";
  endedKind: "customer" | "consultation" | "internal";
  endedWasConnected: boolean;
  hasActiveCustomerLeg: boolean;
  hasActiveConsultationLeg: boolean;
  hasAnyActiveLeg: boolean;
}): "connected" | "transferring" | "needs_confirmation" | "ended" {
  if (input.scope === "internal") {
    return input.hasAnyActiveLeg ? "connected" : "ended";
  }
  if (input.endedKind === "customer") {
    if (input.hasActiveCustomerLeg) return "connected";
    if (input.hasActiveConsultationLeg) return "needs_confirmation";
    return "ended";
  }
  if (!input.endedWasConnected && input.hasActiveCustomerLeg) {
    return "connected";
  }
  if (input.hasActiveCustomerLeg) return "transferring";
  return input.hasAnyActiveLeg ? "needs_confirmation" : "needs_confirmation";
}

function maskedParty(value: string) {
  return `***${value.slice(-Math.min(4, value.length))}`;
}

function latest(left: Date, right: Date) {
  return left >= right ? left : right;
}

function earliest(left: Date, right: Date) {
  return left <= right ? left : right;
}

function channelKinds(event: CentrexBridgeCallObservation) {
  if (event.eventType === "call.channels") {
    return {
      channelKind: event.channel1Kind,
      relatedChannelKind: event.channel2Kind,
    };
  }
  return {
    channelKind: event.channelKind,
    relatedChannelKind: event.relatedChannelKind,
  };
}

export function createCentrexCallActivityService(options: {
  db: Database;
  protection: DataProtection;
  fail: ActivityFailure;
  now?: () => Date;
}) {
  const { db, protection, fail, now = () => new Date() } = options;

  async function endpointForEvent(
    tx: Transaction,
    event: CentrexBridgeCallObservation,
  ) {
    const [endpoint] = await tx
      .select({
        id: telephonyEndpoints.id,
        lineNumber: telephonyEndpoints.lineNumber,
        extension: telephonyEndpoints.extension,
        isActive: telephonyEndpoints.isActive,
      })
      .from(telephonyEndpoints)
      .where(eq(telephonyEndpoints.id, event.endpointId))
      .limit(1);
    if (!endpoint) {
      return fail("endpoint_not_found", "등록된 전화 회선을 찾을 수 없습니다.");
    }
    if (!endpoint.isActive) {
      fail("endpoint_inactive", "비활성 전화 회선의 이벤트입니다.");
    }
    if (endpoint.extension !== event.agentExtension) {
      fail(
        "agent_extension_mismatch",
        "관측된 내선과 endpoint의 내선이 일치하지 않습니다.",
      );
    }
    const owners = await tx
      .select({ staffUserId: staffTelephonyBindings.staffUserId })
      .from(staffTelephonyBindings)
      .where(
        and(
          eq(staffTelephonyBindings.endpointId, endpoint.id),
          eq(staffTelephonyBindings.isActive, true),
        ),
      );
    return {
      ...endpoint,
      // 공유 회선의 실제 통화자는 provider 이벤트만으로 특정하지 않는다.
      staffUserId: owners.length === 1 ? owners[0]!.staffUserId : null,
    };
  }

  async function rootByProviderValue(
    tx: Transaction,
    providerValue: string,
    endpointId?: string,
    activeOnly = false,
  ): Promise<{ root: RootRow; leg: LegRow } | null> {
    const [row] = await tx
      .select({ root: telephonyCallRoots, leg: telephonyCallLegs })
      .from(telephonyCallProviderIdentifiers)
      .innerJoin(
        telephonyCallRoots,
        eq(telephonyCallRoots.id, telephonyCallProviderIdentifiers.rootId),
      )
      .innerJoin(
        telephonyCallLegs,
        eq(telephonyCallLegs.id, telephonyCallProviderIdentifiers.legId),
      )
      .where(
        and(
          eq(telephonyCallProviderIdentifiers.provider, "centrex"),
          eq(telephonyCallProviderIdentifiers.role, "root"),
          eq(telephonyCallProviderIdentifiers.providerValue, providerValue),
          ...(activeOnly ? [ne(telephonyCallRoots.state, "ended")] : []),
          ...(endpointId
            ? [eq(telephonyCallProviderIdentifiers.endpointId, endpointId)]
            : []),
        ),
      )
      .limit(1)
      .for("update");
    return row ?? null;
  }

  async function legByAnyProviderValue(
    tx: Transaction,
    endpointId: string,
    providerValues: string[],
  ): Promise<{ root: RootRow; leg: LegRow } | null> {
    const normalizedValues = [
      ...new Set(
        providerValues.flatMap((value) => {
          const normalized = normalizeCentrexProviderReference(value);
          return normalized ? [normalized] : [];
        }),
      ),
    ];
    if (normalizedValues.length === 0) return null;

    const exactRows = await tx
      .select({
        root: telephonyCallRoots,
        leg: telephonyCallLegs,
        providerValue: telephonyCallProviderIdentifiers.providerValue,
      })
      .from(telephonyCallProviderIdentifiers)
      .innerJoin(
        telephonyCallRoots,
        eq(telephonyCallRoots.id, telephonyCallProviderIdentifiers.rootId),
      )
      .innerJoin(
        telephonyCallLegs,
        eq(telephonyCallLegs.id, telephonyCallProviderIdentifiers.legId),
      )
      .where(
        and(
          eq(telephonyCallProviderIdentifiers.endpointId, endpointId),
          eq(telephonyCallProviderIdentifiers.provider, "centrex"),
          inArray(
            telephonyCallProviderIdentifiers.providerValue,
            normalizedValues,
          ),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${telephonyCallProviderIdentifiers.providerValue} = ${normalizedValues[0]} THEN 0 ELSE 1 END`,
      )
      .for("update");

    function uniqueMatch(
      rows: Array<{ root: RootRow; leg: LegRow }>,
    ): { root: RootRow; leg: LegRow } | null | "ambiguous" {
      const matches = new Map<string, { root: RootRow; leg: LegRow }>();
      for (const row of rows) {
        matches.set(`${row.root.id}:${row.leg.id}`, row);
      }
      if (matches.size === 0) return null;
      if (matches.size > 1) return "ambiguous";
      return matches.values().next().value ?? null;
    }

    const activeExact = uniqueMatch(
      exactRows.filter(
        (row) => row.root.state !== "ended" && row.leg.state !== "ended",
      ),
    );
    if (activeExact === "ambiguous") return null;
    if (activeExact) return activeExact;

    const anyExact = uniqueMatch(exactRows);
    if (anyExact === "ambiguous") return null;
    if (anyExact) return anyExact;

    const siblingRows = await tx
      .select({
        root: telephonyCallRoots,
        leg: telephonyCallLegs,
        providerValue: telephonyCallProviderIdentifiers.providerValue,
      })
      .from(telephonyCallProviderIdentifiers)
      .innerJoin(
        telephonyCallRoots,
        eq(telephonyCallRoots.id, telephonyCallProviderIdentifiers.rootId),
      )
      .innerJoin(
        telephonyCallLegs,
        eq(telephonyCallLegs.id, telephonyCallProviderIdentifiers.legId),
      )
      .where(
        and(
          eq(telephonyCallProviderIdentifiers.endpointId, endpointId),
          eq(telephonyCallProviderIdentifiers.provider, "centrex"),
          ne(telephonyCallRoots.state, "ended"),
          ne(telephonyCallLegs.state, "ended"),
        ),
      )
      .for("update");
    const related = uniqueMatch(
      siblingRows.filter((row) =>
        normalizedValues.some((value) =>
          areCentrexProviderIdsRelated(row.providerValue, value),
        ),
      ),
    );
    return related === "ambiguous" ? null : related;
  }

  async function recordIdentifier(
    tx: Transaction,
    input: {
      rootId: string;
      legId: string;
      endpointId: string;
      role: "root" | "channel" | "source";
      providerValue: string;
      occurredAt: Date;
    },
  ) {
    await tx
      .insert(telephonyCallProviderIdentifiers)
      .values({
        id: createEventId(),
        rootId: input.rootId,
        legId: input.legId,
        endpointId: input.endpointId,
        provider: "centrex",
        role: input.role,
        providerValue: input.providerValue,
        firstObservedAt: input.occurredAt,
        lastObservedAt: input.occurredAt,
        createdAt: input.occurredAt,
      })
      .onConflictDoUpdate({
        target: [
          telephonyCallProviderIdentifiers.endpointId,
          telephonyCallProviderIdentifiers.role,
          telephonyCallProviderIdentifiers.providerValue,
        ],
        set: {
          firstObservedAt: sql`least(${telephonyCallProviderIdentifiers.firstObservedAt}, ${input.occurredAt})`,
          lastObservedAt: sql`greatest(${telephonyCallProviderIdentifiers.lastObservedAt}, ${input.occurredAt})`,
        },
      });
  }

  async function mergeInternalRoot(
    tx: Transaction,
    internalRootId: string,
    externalRootId: string,
    receivedAt: Date,
  ) {
    if (internalRootId === externalRootId) return;
    await tx
      .update(telephonyCallLegs)
      .set({ rootId: externalRootId, kind: "consultation", updatedAt: receivedAt })
      .where(eq(telephonyCallLegs.rootId, internalRootId));
    await tx
      .update(telephonyCallProviderIdentifiers)
      .set({ rootId: externalRootId })
      .where(eq(telephonyCallProviderIdentifiers.rootId, internalRootId));
    await tx
      .update(telephonyCallObservations)
      .set({ rootId: externalRootId })
      .where(eq(telephonyCallObservations.rootId, internalRootId));
    await tx
      .delete(telephonyCallRoots)
      .where(eq(telephonyCallRoots.id, internalRootId));
  }

  async function createRootAndLeg(
    tx: Transaction,
    input: {
      event: Extract<CentrexBridgeCallObservation, { eventType: "call.ringing" }>;
      endpoint: Awaited<ReturnType<typeof endpointForEvent>>;
      scope: "external" | "internal";
      kind: "customer" | "consultation" | "internal";
      rootState: "ringing" | "transferring" | "needs_confirmation";
      correlationStatus: "confirmed" | "pending" | "needs_confirmation";
      root?: RootRow;
      occurredAt: Date;
      receivedAt: Date;
    },
  ) {
    let root = input.root;
    if (!root) {
      const rootId = createTelephonyCallId();
      const external = input.scope === "external";
      const encryptedPhone = external
        ? protection.encrypt(
            input.event.remotePartyNumber,
            `telephony_inbound_calls/${rootId}/remote_phone`,
          )
        : null;
      [root] = await tx
        .insert(telephonyCallRoots)
        .values({
          id: rootId,
          provider: "centrex",
          scope: input.scope,
          direction: external ? input.event.direction : null,
          state: input.rootState,
          correlationStatus: input.correlationStatus,
          originalEndpointId: input.event.endpointId,
          currentEndpointId: input.event.endpointId,
          remotePhoneCiphertext: encryptedPhone?.ciphertext ?? null,
          remotePhoneNonce: encryptedPhone?.nonce ?? null,
          remotePhoneKeyVersion: encryptedPhone?.keyVersion ?? null,
          remotePhoneFingerprint: external
            ? protection.fingerprint(input.event.remotePartyNumber)
            : null,
          remotePhoneMasked: external
            ? maskedParty(input.event.remotePartyNumber)
            : null,
          originalLineLast4: external
            ? input.event.incomingLineNumber?.slice(-4) ??
              input.endpoint.lineNumber.slice(-4)
            : null,
          startedAt: input.occurredAt,
          lastEventAt: input.occurredAt,
          createdAt: input.receivedAt,
          updatedAt: input.receivedAt,
        })
        .returning();
    }
    if (!root) throw new Error("centrex_call_root_insert_failed");

    const [existing] = await tx
      .select()
      .from(telephonyCallLegs)
      .where(
        and(
          eq(telephonyCallLegs.endpointId, input.event.endpointId),
          eq(telephonyCallLegs.providerCallId, input.event.providerCallId),
        ),
      )
      .limit(1)
      .for("update");
    if (existing) return { root, leg: existing };

    const legId = createTelephonyCallId();
    const [leg] = await tx
      .insert(telephonyCallLegs)
      .values({
        id: legId,
        rootId: root.id,
        endpointId: input.event.endpointId,
        staffUserId: input.endpoint.staffUserId,
        bridgeId: input.event.bridgeId,
        kind: input.kind,
        direction: input.event.direction,
        state: "ringing",
        remotePartyKind: input.event.remotePartyKind,
        remoteExtension:
          input.event.remotePartyKind === "external"
            ? null
            : input.event.remotePartyNumber,
        providerCallId: input.event.providerCallId,
        correlationStatus: input.correlationStatus,
        startedAt: input.occurredAt,
        lastEventAt: input.occurredAt,
        createdAt: input.receivedAt,
        updatedAt: input.receivedAt,
      })
      .returning();
    if (!leg) throw new Error("centrex_call_leg_insert_failed");
    await recordIdentifier(tx, {
      rootId: root.id,
      legId: leg.id,
      endpointId: leg.endpointId,
      role: "root",
      providerValue: leg.providerCallId,
      occurredAt: input.occurredAt,
    });
    return { root, leg };
  }

  async function handleRinging(
    tx: Transaction,
    event: Extract<CentrexBridgeCallObservation, { eventType: "call.ringing" }>,
    endpoint: Awaited<ReturnType<typeof endpointForEvent>>,
    occurredAt: Date,
    receivedAt: Date,
  ) {
    const endpointRoot = await rootByProviderValue(
      tx,
      event.providerCallId,
      event.endpointId,
    );
    if (endpointRoot) return endpointRoot;

    const sharedRoot = await rootByProviderValue(
      tx,
      event.providerCallId,
      undefined,
      true,
    );
    if (
      !sharedRoot &&
      event.remotePartyKind === "external" &&
      event.direction === "inbound" &&
      event.incomingLineNumber === endpoint.lineNumber
    ) {
      const phoneFingerprint = protection.fingerprint(event.remotePartyNumber);
      const [callbackCandidate] = await tx
        .select({ root: telephonyCallRoots, leg: telephonyCallLegs })
        .from(telephonyCallRoots)
        .innerJoin(
          telephonyCallLegs,
          eq(telephonyCallLegs.rootId, telephonyCallRoots.id),
        )
        .where(
          and(
            eq(telephonyCallRoots.scope, "external"),
            eq(telephonyCallRoots.direction, "inbound"),
            eq(telephonyCallRoots.currentEndpointId, event.endpointId),
            eq(telephonyCallRoots.state, "ringing"),
            eq(telephonyCallRoots.remotePhoneFingerprint, phoneFingerprint),
            eq(
              telephonyCallRoots.originalLineLast4,
              event.incomingLineNumber.slice(-4),
            ),
            eq(telephonyCallLegs.kind, "customer"),
            eq(telephonyCallLegs.state, "ringing"),
            gte(
              telephonyCallRoots.startedAt,
              new Date(occurredAt.getTime() - 30_000),
            ),
            lte(
              telephonyCallRoots.startedAt,
              new Date(occurredAt.getTime() + 5_000),
            ),
          ),
        )
        .orderBy(desc(telephonyCallRoots.startedAt))
        .limit(1)
        .for("update");
      if (callbackCandidate) {
        const [leg] = await tx
          .update(telephonyCallLegs)
          .set({
            bridgeId: event.bridgeId,
            providerCallId: event.providerCallId,
            startedAt: earliest(callbackCandidate.leg.startedAt, occurredAt),
            lastEventAt: latest(callbackCandidate.leg.lastEventAt, occurredAt),
            updatedAt: receivedAt,
          })
          .where(eq(telephonyCallLegs.id, callbackCandidate.leg.id))
          .returning();
        if (leg) {
          await recordIdentifier(tx, {
            rootId: callbackCandidate.root.id,
            legId: leg.id,
            endpointId: leg.endpointId,
            role: "root",
            providerValue: event.providerCallId,
            occurredAt,
          });
          await tx
            .update(telephonyCallRoots)
            .set({
              startedAt: earliest(callbackCandidate.root.startedAt, occurredAt),
              lastEventAt: latest(callbackCandidate.root.lastEventAt, occurredAt),
              updatedAt: receivedAt,
            })
            .where(eq(telephonyCallRoots.id, callbackCandidate.root.id));
          return { root: callbackCandidate.root, leg };
        }
      }
    }
    const contextRoot = event.contextProviderCallId
      ? await rootByProviderValue(
          tx,
          event.contextProviderCallId,
          event.endpointId,
          true,
        )
      : null;
    const exactExternalRoot =
      event.remotePartyKind === "external" &&
      sharedRoot?.root.scope === "external" &&
      sharedRoot.root.originalLineLast4 ===
        event.incomingLineNumber?.slice(-4) &&
      sharedRoot.root.remotePhoneFingerprint?.equals(
        protection.fingerprint(event.remotePartyNumber),
      )
        ? sharedRoot
        : null;
    const resolution = resolveCentrexRingingRoot({
      partyKind: event.remotePartyKind,
      hasExactExternalRoot: Boolean(exactExternalRoot),
      hasContextExternalRoot: contextRoot?.root.scope === "external",
      incomingLineMatchesEndpoint:
        event.direction !== "inbound" ||
        event.incomingLineNumber === endpoint.lineNumber,
    });

    if (
      resolution === "confirmed_consultation" &&
      contextRoot?.root.scope === "external"
    ) {
      if (sharedRoot?.root.scope === "internal") {
        await mergeInternalRoot(
          tx,
          sharedRoot.root.id,
          contextRoot.root.id,
          receivedAt,
        );
      }
      const result = await createRootAndLeg(tx, {
        event,
        endpoint,
        scope: "external",
        kind: "consultation",
        rootState: "transferring",
        correlationStatus: "confirmed",
        root: contextRoot.root,
        occurredAt,
        receivedAt,
      });
      await tx
        .update(telephonyCallRoots)
        .set({
          state: "transferring",
          lastEventAt: latest(contextRoot.root.lastEventAt, occurredAt),
          updatedAt: receivedAt,
        })
        .where(eq(telephonyCallRoots.id, contextRoot.root.id));
      await tx
        .insert(telephonyCallRelations)
        .values({
          id: createEventId(),
          rootId: contextRoot.root.id,
          fromLegId: contextRoot.leg.id,
          toLegId: result.leg.id,
          relationType: "transfer_attempted",
          correlationStatus: "confirmed",
          correlationKey: `consultation:${contextRoot.root.id}:${event.providerCallId}`,
          evidence: {
            bridgeContext: true,
            sharedInternalProviderRoot: Boolean(sharedRoot),
          },
          occurredAt,
          createdAt: receivedAt,
          updatedAt: receivedAt,
        })
        .onConflictDoNothing();
      return result;
    }

    if (resolution === "pending_blind_transfer" && exactExternalRoot) {
      const result = await createRootAndLeg(tx, {
        event,
        endpoint,
        scope: "external",
        kind: "customer",
        rootState: "transferring",
        correlationStatus: "pending",
        root: exactExternalRoot.root,
        occurredAt,
        receivedAt,
      });
      await tx
        .update(telephonyCallRoots)
        .set({
          state: "transferring",
          correlationStatus: "pending",
          lastEventAt: latest(exactExternalRoot.root.lastEventAt, occurredAt),
          updatedAt: receivedAt,
        })
        .where(eq(telephonyCallRoots.id, exactExternalRoot.root.id));
      await tx
        .insert(telephonyCallRelations)
        .values({
          id: createEventId(),
          rootId: exactExternalRoot.root.id,
          fromLegId: exactExternalRoot.leg.id,
          toLegId: result.leg.id,
          relationType: "transfer_attempted",
          correlationStatus: "pending",
          correlationKey: `blind:${exactExternalRoot.root.id}:${event.endpointId}`,
          evidence: {
            sameProviderRoot: true,
            sameCustomerFingerprint: true,
            sameOriginalLine: true,
            targetAgentMatchesEndpoint: true,
          },
          occurredAt,
          createdAt: receivedAt,
          updatedAt: receivedAt,
        })
        .onConflictDoNothing();
      return result;
    }

    if (event.remotePartyKind === "internal" && sharedRoot) {
      const result = await createRootAndLeg(tx, {
        event,
        endpoint,
        scope: sharedRoot.root.scope,
        kind:
          sharedRoot.root.scope === "external" ? "consultation" : "internal",
        rootState:
          sharedRoot.root.scope === "external" ? "transferring" : "ringing",
        correlationStatus: "confirmed",
        root: sharedRoot.root,
        occurredAt,
        receivedAt,
      });
      if (
        sharedRoot.root.scope === "external" &&
        event.direction === "inbound"
      ) {
        // A가 만든 상담 시도의 실제 수신 leg(B)가 관측되면 알림·복귀 대상을
        // 발신 A leg가 아니라 B leg로 교체한다.
        await tx
          .update(telephonyCallRelations)
          .set({
            toLegId: result.leg.id,
            evidence: {
              bridgeContext: true,
              bilateralInternalProviderRoot: true,
              targetAgentMatchesEndpoint: true,
            },
            updatedAt: receivedAt,
          })
          .where(
            and(
              eq(telephonyCallRelations.rootId, sharedRoot.root.id),
              eq(telephonyCallRelations.relationType, "transfer_attempted"),
              eq(
                telephonyCallRelations.correlationKey,
                `consultation:${sharedRoot.root.id}:${event.providerCallId}`,
              ),
            ),
          );
      }
      return result;
    }

    const external = event.remotePartyKind === "external";
    return createRootAndLeg(tx, {
      event,
      endpoint,
      scope: external ? "external" : "internal",
      kind: external ? "customer" : "internal",
      rootState:
        resolution === "needs_confirmation" ? "needs_confirmation" : "ringing",
      correlationStatus:
        resolution === "needs_confirmation" ? "needs_confirmation" : "confirmed",
      occurredAt,
      receivedAt,
    });
  }

  async function handleChannels(
    tx: Transaction,
    event: Extract<CentrexBridgeCallObservation, { eventType: "call.channels" }>,
    occurredAt: Date,
    receivedAt: Date,
  ) {
    const found = await legByAnyProviderValue(tx, event.endpointId, [
      event.providerCallId,
      event.relatedProviderCallId,
    ]);
    if (!found) return null;
    const connectedAt = found.leg.connectedAt
      ? earliest(found.leg.connectedAt, occurredAt)
      : occurredAt;
    const [leg] = await tx
      .update(telephonyCallLegs)
      .set({
        state: "connected",
        providerChannelId: event.relatedProviderCallId,
        correlationStatus:
          found.leg.kind === "customer" &&
          found.leg.correlationStatus === "pending"
            ? "confirmed"
            : found.leg.correlationStatus,
        connectedAt,
        lastEventAt: latest(found.leg.lastEventAt, occurredAt),
        updatedAt: receivedAt,
      })
      .where(eq(telephonyCallLegs.id, found.leg.id))
      .returning();
    if (!leg) return null;
    await recordIdentifier(tx, {
      rootId: found.root.id,
      legId: leg.id,
      endpointId: leg.endpointId,
      role: "channel",
      providerValue: event.relatedProviderCallId,
      occurredAt,
    });

    const transferConfirmed =
      leg.kind === "customer" && found.leg.correlationStatus === "pending";
    await tx
      .update(telephonyCallRoots)
      .set({
        state: leg.kind === "consultation" ? "transferring" : "connected",
        correlationStatus: transferConfirmed
          ? "confirmed"
          : found.root.correlationStatus,
        currentEndpointId: transferConfirmed
          ? leg.endpointId
          : found.root.currentEndpointId,
        connectedAt: found.root.connectedAt
          ? earliest(found.root.connectedAt, connectedAt)
          : connectedAt,
        lastEventAt: latest(found.root.lastEventAt, occurredAt),
        updatedAt: receivedAt,
      })
      .where(eq(telephonyCallRoots.id, found.root.id));
    if (transferConfirmed) {
      await tx
        .update(telephonyCallRelations)
        .set({
          relationType: "transfer_completed",
          correlationStatus: "confirmed",
          evidence: {
            sameProviderRoot: true,
            sameCustomerFingerprint: true,
            sameOriginalLine: true,
            targetAgentMatchesEndpoint: true,
            providerRootToAdjacentChannel: true,
          },
          updatedAt: receivedAt,
        })
        .where(
          and(
            eq(telephonyCallRelations.rootId, found.root.id),
            eq(telephonyCallRelations.toLegId, leg.id),
            eq(telephonyCallRelations.relationType, "transfer_attempted"),
          ),
        );
    }
    return { root: found.root, leg };
  }

  async function handleEnded(
    tx: Transaction,
    event: Extract<CentrexBridgeCallObservation, { eventType: "call.ended" }>,
    occurredAt: Date,
    receivedAt: Date,
  ) {
    const sourceProviderCallId = normalizeCentrexProviderReference(
      event.sourceProviderCallId,
    );
    const found = await legByAnyProviderValue(tx, event.endpointId, [
      event.providerCallId,
      ...(sourceProviderCallId ? [sourceProviderCallId] : []),
    ]);
    if (!found) return null;
    const endedWasConnected = found.leg.state === "connected";
    if (sourceProviderCallId) {
      await recordIdentifier(tx, {
        rootId: found.root.id,
        legId: found.leg.id,
        endpointId: found.leg.endpointId,
        role: "source",
        providerValue: sourceProviderCallId,
        occurredAt,
      });
    }
    const endedAt = latest(found.leg.startedAt, occurredAt);
    const [leg] = await tx
      .update(telephonyCallLegs)
      .set({
        state: "ended",
        endedAt,
        providerEndCause: event.providerEndCause,
        lastEventAt: latest(found.leg.lastEventAt, occurredAt),
        updatedAt: receivedAt,
      })
      .where(eq(telephonyCallLegs.id, found.leg.id))
      .returning();
    if (!leg) return null;

    const activeLegs = await tx
      .select({
        kind: telephonyCallLegs.kind,
        state: telephonyCallLegs.state,
      })
      .from(telephonyCallLegs)
      .where(
        and(
          eq(telephonyCallLegs.rootId, found.root.id),
          ne(telephonyCallLegs.id, leg.id),
          inArray(telephonyCallLegs.state, ["ringing", "connected"]),
        ),
      );
    const resolvedState = resolveCentrexRootAfterLegEnd({
      scope: found.root.scope,
      endedKind: leg.kind,
      endedWasConnected,
      hasActiveCustomerLeg: activeLegs.some((item) => item.kind === "customer"),
      hasActiveConsultationLeg: activeLegs.some(
        (item) => item.kind === "consultation",
      ),
      hasAnyActiveLeg: activeLegs.length > 0,
    });
    const nextState =
      resolvedState === "connected" &&
      found.root.state === "transferring" &&
      activeLegs.some(
        (item) => item.kind === "customer" && item.state === "ringing",
      ) &&
      !activeLegs.some(
        (item) => item.kind === "customer" && item.state === "connected",
      )
        ? "transferring"
        : resolvedState;
    const ended = nextState === "ended";
    const needsConfirmation = nextState === "needs_confirmation";
    await tx
      .update(telephonyCallRoots)
      .set({
        state: nextState,
        correlationStatus: needsConfirmation
          ? "needs_confirmation"
          : found.root.correlationStatus,
        finalEndpointId: ended ? leg.endpointId : found.root.finalEndpointId,
        finalStaffUserId: ended
          ? leg.staffUserId
          : found.root.finalStaffUserId,
        endedAt: ended ? latest(found.root.startedAt, occurredAt) : null,
        lastEventAt: latest(found.root.lastEventAt, occurredAt),
        updatedAt: receivedAt,
      })
      .where(eq(telephonyCallRoots.id, found.root.id));

    if (leg.kind === "consultation" && !endedWasConnected) {
      await tx
        .update(telephonyCallRelations)
        .set({
          relationType: "transfer_returned",
          correlationStatus: "confirmed",
          evidence: {
            consultationNeverConnected: true,
            existingCustomerLegStillActive: activeLegs.some(
              (item) => item.kind === "customer",
            ),
          },
          updatedAt: receivedAt,
        })
        .where(
          and(
            eq(telephonyCallRelations.rootId, found.root.id),
            eq(telephonyCallRelations.toLegId, leg.id),
            eq(telephonyCallRelations.relationType, "transfer_attempted"),
          ),
        );
    } else if (needsConfirmation) {
      await tx
        .insert(telephonyCallRelations)
        .values({
          id: createEventId(),
          rootId: found.root.id,
          fromLegId: leg.id,
          relationType: "transfer_unresolved",
          correlationStatus: "needs_confirmation",
          correlationKey: `unresolved:${found.root.id}:${leg.id}`,
          evidence: {
            finalCustomerLegNotObserved: true,
            inferenceByCauseOrTimeForbidden: true,
          },
          occurredAt,
          createdAt: receivedAt,
          updatedAt: receivedAt,
        })
        .onConflictDoNothing();
    }
    return { root: found.root, leg };
  }

  async function syncLegacyCall(
    tx: Transaction,
    input: {
      endpointId: string;
      providerCallId: string;
      callRootId: string | null;
      callLegId: string | null;
      state: "ringing" | "connected" | "ended";
      ringingAt: Date;
      connectedAt: Date | null;
      endedAt: Date | null;
      providerEndCause: string | null;
      lastEventAt: Date;
      receivedAt: Date;
    },
  ) {
    if (!input.callRootId || !input.callLegId) return;

    const [linked] = await tx
      .select({ root: telephonyCallRoots, leg: telephonyCallLegs })
      .from(telephonyCallRoots)
      .innerJoin(
        telephonyCallLegs,
        and(
          eq(telephonyCallLegs.id, input.callLegId),
          eq(telephonyCallLegs.rootId, telephonyCallRoots.id),
        ),
      )
      .where(
        and(
          eq(telephonyCallRoots.id, input.callRootId),
          eq(telephonyCallLegs.endpointId, input.endpointId),
          eq(telephonyCallLegs.providerCallId, input.providerCallId),
        ),
      )
      .limit(1)
      .for("update");
    if (!linked || linked.root.state === "ended") return;

    if (input.state === "connected" && linked.leg.state === "ringing") {
      const connectedAt = input.connectedAt ?? input.lastEventAt;
      await tx
        .update(telephonyCallLegs)
        .set({
          state: "connected",
          connectedAt: latest(linked.leg.startedAt, connectedAt),
          lastEventAt: latest(linked.leg.lastEventAt, input.lastEventAt),
          updatedAt: input.receivedAt,
        })
        .where(eq(telephonyCallLegs.id, linked.leg.id));
      await tx
        .update(telephonyCallRoots)
        .set({
          state:
            linked.root.state === "ringing" ? "connected" : linked.root.state,
          connectedAt: linked.root.connectedAt
            ? earliest(linked.root.connectedAt, connectedAt)
            : latest(linked.root.startedAt, connectedAt),
          lastEventAt: latest(linked.root.lastEventAt, input.lastEventAt),
          updatedAt: input.receivedAt,
        })
        .where(eq(telephonyCallRoots.id, linked.root.id));
      return;
    }

    if (input.state !== "ended" || linked.leg.state === "ended") return;

    const endedAt = latest(
      linked.leg.startedAt,
      input.endedAt ?? input.lastEventAt,
    );
    const endedWasConnected = linked.leg.state === "connected";
    const [endedLeg] = await tx
      .update(telephonyCallLegs)
      .set({
        state: "ended",
        connectedAt: linked.leg.connectedAt ?? input.connectedAt,
        endedAt,
        providerEndCause: input.providerEndCause ?? "legacy_unknown",
        lastEventAt: latest(linked.leg.lastEventAt, input.lastEventAt),
        updatedAt: input.receivedAt,
      })
      .where(eq(telephonyCallLegs.id, linked.leg.id))
      .returning();
    if (!endedLeg) return;

    const activeLegs = await tx
      .select({
        kind: telephonyCallLegs.kind,
        state: telephonyCallLegs.state,
      })
      .from(telephonyCallLegs)
      .where(
        and(
          eq(telephonyCallLegs.rootId, linked.root.id),
          ne(telephonyCallLegs.id, endedLeg.id),
          inArray(telephonyCallLegs.state, ["ringing", "connected"]),
        ),
      );
    const nextState = resolveCentrexRootAfterLegEnd({
      scope: linked.root.scope,
      endedKind: endedLeg.kind,
      endedWasConnected,
      hasActiveCustomerLeg: activeLegs.some((leg) => leg.kind === "customer"),
      hasActiveConsultationLeg: activeLegs.some(
        (leg) => leg.kind === "consultation",
      ),
      hasAnyActiveLeg: activeLegs.length > 0,
    });
    const ended = nextState === "ended";
    await tx
      .update(telephonyCallRoots)
      .set({
        state: nextState,
        correlationStatus:
          nextState === "needs_confirmation"
            ? "needs_confirmation"
            : linked.root.correlationStatus,
        finalEndpointId: ended
          ? endedLeg.endpointId
          : linked.root.finalEndpointId,
        finalStaffUserId: ended
          ? endedLeg.staffUserId
          : linked.root.finalStaffUserId,
        endedAt: ended ? latest(linked.root.startedAt, endedAt) : null,
        lastEventAt: latest(linked.root.lastEventAt, input.lastEventAt),
        updatedAt: input.receivedAt,
      })
      .where(eq(telephonyCallRoots.id, linked.root.id));
  }

  async function ingest(
    event: CentrexBridgeCallObservation,
    authentication: {
      bridgeId: string;
      endpointId: string;
      authenticationNonceHash: Buffer;
    },
  ) {
    if (
      event.bridgeId !== authentication.bridgeId ||
      event.endpointId !== authentication.endpointId
    ) {
      fail(
        "bridge_identity_mismatch",
        "서명된 bridge와 이벤트 대상 회선이 일치하지 않습니다.",
      );
    }
    const eventFingerprint = protection.fingerprint(event);
    const occurredAt = new Date(event.occurredAt);
    const receivedAt = now();
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(protection.fingerprint({ providerCallId: event.providerCallId }))} as bigint))`,
      );
      const [existing] = await tx
        .select({
          eventFingerprint: telephonyCallObservations.eventFingerprint,
          rootId: telephonyCallObservations.rootId,
          legId: telephonyCallObservations.legId,
          observationType: telephonyCallObservations.observationType,
          direction: telephonyCallObservations.direction,
          correlationStatus: telephonyCallObservations.correlationStatus,
        })
        .from(telephonyCallObservations)
        .where(eq(telephonyCallObservations.id, event.eventId))
        .limit(1);
      if (existing) {
        if (!existing.eventFingerprint.equals(eventFingerprint)) {
          fail(
            "event_replay_conflict",
            "같은 이벤트 ID의 내용이 기존 원장과 다릅니다.",
          );
        }
        return {
          callId: existing.rootId ?? event.eventId,
          rootId: existing.rootId,
          legId: existing.legId,
          state:
            existing.observationType === "ringing"
              ? ("ringing" as const)
              : existing.observationType === "channels"
                ? ("connected" as const)
                : ("ended" as const),
          direction: existing.direction ?? ("inbound" as const),
          correlationStatus: existing.correlationStatus,
          replayed: true,
        };
      }
      const [nonce] = await tx
        .select({ id: telephonyCallObservations.id })
        .from(telephonyCallObservations)
        .where(
          and(
            eq(telephonyCallObservations.bridgeId, event.bridgeId),
            eq(
              telephonyCallObservations.authenticationNonceHash,
              authentication.authenticationNonceHash,
            ),
          ),
        )
        .limit(1);
      if (nonce) {
        fail("nonce_replay_conflict", "이미 사용한 인증 nonce입니다.");
      }
      const endpoint = await endpointForEvent(tx, event);
      const linked =
        event.eventType === "call.ringing"
          ? await handleRinging(tx, event, endpoint, occurredAt, receivedAt)
          : event.eventType === "call.channels"
            ? await handleChannels(tx, event, occurredAt, receivedAt)
            : await handleEnded(tx, event, occurredAt, receivedAt);
      const kinds = channelKinds(event);
      const remoteParty =
        event.eventType === "call.ringing" ? event.remotePartyNumber : null;
      await tx.insert(telephonyCallObservations).values({
        id: event.eventId,
        endpointId: event.endpointId,
        bridgeId: event.bridgeId,
        rootId: linked?.root.id ?? null,
        legId: linked?.leg.id ?? null,
        observationType:
          event.eventType === "call.ringing"
            ? "ringing"
            : event.eventType === "call.channels"
              ? "channels"
              : "ended",
        direction: event.eventType === "call.ringing" ? event.direction : null,
        partyKind:
          event.eventType === "call.ringing" ? event.remotePartyKind : null,
        providerCallId: event.providerCallId,
        relatedProviderCallId:
          event.eventType === "call.channels"
            ? event.relatedProviderCallId
            : null,
        sourceProviderCallId:
          event.eventType === "call.ended"
            ? normalizeCentrexProviderReference(event.sourceProviderCallId)
            : null,
        contextProviderCallId:
          event.eventType === "call.ringing"
            ? event.contextProviderCallId ?? null
            : null,
        remotePartyFingerprint: remoteParty
          ? protection.fingerprint(remoteParty)
          : null,
        remotePartyMasked: remoteParty ? maskedParty(remoteParty) : null,
        incomingLineLast4:
          event.eventType === "call.ringing"
            ? event.incomingLineNumber?.slice(-4) ?? null
            : null,
        agentExtension: event.agentExtension,
        channelKind: kinds.channelKind,
        relatedChannelKind: kinds.relatedChannelKind,
        providerEndCause:
          event.eventType === "call.ended" ? event.providerEndCause : null,
        correlationStatus:
          linked?.leg.correlationStatus ?? "needs_confirmation",
        eventFingerprint,
        authenticationNonceHash: authentication.authenticationNonceHash,
        occurredAt,
        receivedAt,
        createdAt: receivedAt,
      });
      return {
        callId: linked?.root.id ?? event.eventId,
        rootId: linked?.root.id ?? null,
        legId: linked?.leg.id ?? null,
        state:
          event.eventType === "call.ringing"
            ? ("ringing" as const)
            : event.eventType === "call.channels"
              ? ("connected" as const)
              : ("ended" as const),
        direction:
          event.eventType === "call.ringing"
            ? event.direction
            : ("inbound" as const),
        correlationStatus:
          linked?.leg.correlationStatus ?? "needs_confirmation",
        replayed: false,
      };
    });
  }

  return { ingest, syncLegacyCall };
}

export type CentrexCallActivityService = ReturnType<
  typeof createCentrexCallActivityService
>;
