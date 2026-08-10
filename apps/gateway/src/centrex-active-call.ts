import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { createEventId } from "@lawand/core";
import {
  telephonyInboundCalls,
  telephonyInboundEvents,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const CENTREX_ACTIVE_CALL_SINGLETON_BRIDGE_ID =
  "centrex-active-call-singleton";
export const CENTREX_SUPERSEDED_END_CAUSE = "SUPERSEDED_BY_NEW_CALL";

export function centrexEndpointActiveCallLock(
  protection: DataProtection,
  endpointId: string,
): Buffer {
  return protection.fingerprint({
    source: "centrex_endpoint_active_call",
    endpointId,
  });
}

export async function lockCentrexEndpointActiveCalls(
  tx: Transaction,
  protection: DataProtection,
  endpointId: string,
): Promise<void> {
  const lock = centrexEndpointActiveCallLock(protection, endpointId);
  await tx.execute(
    sql`select pg_advisory_xact_lock(cast(${protection.advisoryLockKey(lock)} as bigint))`,
  );
}

export async function endOtherActiveCentrexCalls(
  tx: Transaction,
  protection: DataProtection,
  input: {
    endpointId: string;
    currentCallId?: string;
    occurredAt: Date;
    receivedAt: Date;
    triggeringEventId: string;
  },
): Promise<string[]> {
  const activeCalls = await tx
    .select({
      id: telephonyInboundCalls.id,
      direction: telephonyInboundCalls.direction,
      providerCallId: telephonyInboundCalls.providerCallId,
      ringingAt: telephonyInboundCalls.ringingAt,
      lastEventAt: telephonyInboundCalls.lastEventAt,
    })
    .from(telephonyInboundCalls)
    .where(
      and(
        eq(telephonyInboundCalls.endpointId, input.endpointId),
        inArray(telephonyInboundCalls.state, ["ringing", "connected"]),
        input.currentCallId
          ? ne(telephonyInboundCalls.id, input.currentCallId)
          : undefined,
      ),
    )
    .for("update");

  for (const call of activeCalls) {
    const endedAt = new Date(
      Math.max(
        input.occurredAt.getTime(),
        call.ringingAt.getTime(),
        call.lastEventAt.getTime(),
      ),
    );
    await tx
      .update(telephonyInboundCalls)
      .set({
        state: "ended",
        endedAt,
        providerEndCause: CENTREX_SUPERSEDED_END_CAUSE,
        lastEventAt: endedAt,
        updatedAt: input.receivedAt,
      })
      .where(eq(telephonyInboundCalls.id, call.id));

    const eventId = createEventId();
    const eventIdentity = {
      source: CENTREX_ACTIVE_CALL_SINGLETON_BRIDGE_ID,
      eventId,
      triggeringEventId: input.triggeringEventId,
      inboundCallId: call.id,
      endpointId: input.endpointId,
      providerCallId: call.providerCallId,
      occurredAt: endedAt.toISOString(),
    };
    await tx.insert(telephonyInboundEvents).values({
      id: eventId,
      inboundCallId: call.id,
      endpointId: input.endpointId,
      bridgeId: CENTREX_ACTIVE_CALL_SINGLETON_BRIDGE_ID,
      direction: call.direction,
      eventType:
        call.direction === "outbound"
          ? "outbound.ended"
          : "inbound.ended",
      providerCallId: call.providerCallId,
      providerEndCause: CENTREX_SUPERSEDED_END_CAUSE,
      eventFingerprint: protection.fingerprint({
        ...eventIdentity,
        purpose: "event_fingerprint",
      }),
      authenticationNonceHash: protection.fingerprint({
        ...eventIdentity,
        purpose: "synthetic_nonce",
      }),
      occurredAt: endedAt,
      receivedAt: input.receivedAt,
      createdAt: input.receivedAt,
    });
  }

  return activeCalls.map((call) => call.id);
}
