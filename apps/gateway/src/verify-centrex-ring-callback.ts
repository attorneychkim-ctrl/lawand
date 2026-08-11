import assert from "node:assert/strict";

import { and, count, eq } from "drizzle-orm";

import {
  createDatabaseClient,
  staffTelephonyBindings,
  telephonyEndpoints,
  telephonyInboundCalls,
  telephonyInboundEvents,
} from "@lawand/db";

import type { CentrexClient } from "./centrex.js";
import { createCentrexBridgeIngressService } from "./centrex-bridge-service.js";
import type { CentrexCredentialVault } from "./centrex-credential-vault.js";
import {
  createCentrexInboundObserver,
} from "./centrex-inbound-observer.js";
import { readGatewayConfig } from "./config.js";
import { createDataProtection } from "./crypto.js";

const config = readGatewayConfig();
const database = createDatabaseClient(config.databaseUrl);
const protection = createDataProtection(config);
const fixedNow = new Date("2099-01-01T00:00:00.470Z");
let createdCallId: string | null = null;

try {
  const [endpoint] = await database.db
    .select({
      id: telephonyEndpoints.id,
      lineNumber: telephonyEndpoints.lineNumber,
      extension: telephonyEndpoints.extension,
      apiLoginId: telephonyEndpoints.apiLoginId,
    })
    .from(telephonyEndpoints)
    .innerJoin(
      staffTelephonyBindings,
      and(
        eq(staffTelephonyBindings.endpointId, telephonyEndpoints.id),
        eq(staffTelephonyBindings.isActive, true),
      ),
    )
    .where(eq(telephonyEndpoints.isActive, true))
    .limit(1);
  assert.ok(endpoint, "활성 직원 센트릭스 회선이 필요합니다.");

  const [beforeCalls, beforeEvents] = await Promise.all([
    database.db.select({ value: count() }).from(telephonyInboundCalls),
    database.db.select({ value: count() }).from(telephonyInboundEvents),
  ]);
  const centrexClient = {
    setRingCallback: async () => ({
      httpStatus: 200,
      providerCode: "0000" as const,
    }),
    getInboundCallHistory: async (input: { apiLoginId: string }) => ({
      httpStatus: 200,
      providerCode: "0000" as const,
      records: input.apiLoginId === endpoint.apiLoginId
        ? [
            {
              number: "1",
              time: "2099-01-01 09:00:00",
              source: "01000009999",
              destination: endpoint.lineNumber,
              durationSeconds: 8,
              status: "ANSWERED" as const,
              channel: "SIP/provider",
              destinationChannel: `SIP/${endpoint.extension}`,
              endTime: "2099-01-01 09:00:08",
              applicationData: `SIP/${endpoint.extension}`,
            },
          ]
        : [],
    }),
  } as unknown as CentrexClient;
  const credentialVault = {
    get: async () => "a".repeat(128),
  } as unknown as CentrexCredentialVault;
  const observer = createCentrexInboundObserver({
    db: database.db,
    protection,
    centrexClient,
    credentialVault,
    callbackToken: "local_callback_verification_token_1234",
    callbackHost: "127.0.0.1",
    callbackPort: 80,
    pollIntervalMs: 60_000,
    now: () => fixedNow,
  });
  const params = new URLSearchParams({
    sender: "01000009999",
    receiver: endpoint.lineNumber,
    kind: "1",
    inner_num: endpoint.extension,
    message: "",
  });
  const created = await observer.ingest(params);
  createdCallId = created.callId;
  const replayed = await observer.ingest(params);
  assert.equal(created.replayed, false);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.callId, created.callId);

  const bridgeIngress = createCentrexBridgeIngressService({
    db: database.db,
    protection,
    now: () => new Date(fixedNow.getTime() + 1_000),
  });
  const bridged = await bridgeIngress.ingest(
    {
      schemaVersion: 1,
      eventId: "01980000-0000-7000-8000-000000009991",
      bridgeId: "local-verification-bridge",
      endpointId: endpoint.id,
      eventType: "inbound.ringing",
      occurredAt: new Date(fixedNow.getTime() + 1_000).toISOString(),
      providerCallId: "verification.9991",
      callerNumber: "01000009999",
      incomingLineNumber: endpoint.lineNumber,
    },
    {
      bridgeId: "local-verification-bridge",
      endpointId: endpoint.id,
      authenticationNonceHash: Buffer.alloc(32, 9),
    },
  );
  assert.equal(bridged.callId, created.callId);

  await observer.runCycle();
  await observer.runCycle();

  const [persisted] = await database.db
    .select({
      state: telephonyInboundCalls.state,
      bridgeId: telephonyInboundCalls.bridgeId,
      maskedPhone: telephonyInboundCalls.remotePhoneMasked,
      ringingAt: telephonyInboundCalls.ringingAt,
      connectedAt: telephonyInboundCalls.connectedAt,
      endedAt: telephonyInboundCalls.endedAt,
      eventCount: count(telephonyInboundEvents.id),
    })
    .from(telephonyInboundCalls)
    .innerJoin(
      telephonyInboundEvents,
      eq(telephonyInboundEvents.inboundCallId, telephonyInboundCalls.id),
    )
    .where(eq(telephonyInboundCalls.id, created.callId))
    .groupBy(
      telephonyInboundCalls.state,
      telephonyInboundCalls.bridgeId,
      telephonyInboundCalls.remotePhoneMasked,
      telephonyInboundCalls.ringingAt,
      telephonyInboundCalls.connectedAt,
      telephonyInboundCalls.endedAt,
    );
  assert.deepEqual(persisted, {
    state: "ended",
    bridgeId: "local-verification-bridge",
    maskedPhone: "***9999",
    ringingAt: new Date("2099-01-01T00:00:00.000Z"),
    connectedAt: fixedNow,
    endedAt: new Date("2099-01-01T00:00:08.000Z"),
    eventCount: 4,
  });

  await database.db.transaction(async (tx) => {
    await tx
      .delete(telephonyInboundEvents)
      .where(eq(telephonyInboundEvents.inboundCallId, created.callId));
    await tx
      .delete(telephonyInboundCalls)
      .where(eq(telephonyInboundCalls.id, created.callId));
  });
  createdCallId = null;

  const [afterCalls, afterEvents] = await Promise.all([
    database.db.select({ value: count() }).from(telephonyInboundCalls),
    database.db.select({ value: count() }).from(telephonyInboundEvents),
  ]);
  assert.equal(afterCalls[0]?.value, beforeCalls[0]?.value);
  assert.equal(afterEvents[0]?.value, beforeEvents[0]?.value);
  console.log(
    JSON.stringify({
      status: "ok",
      callbackCreated: true,
      callbackReplayDeduplicated: true,
      bridgeDuplicateMerged: true,
      subsecondHistoryNormalized: true,
      inboundHistoryReconciled: true,
      temporaryRowsRemaining: 0,
    }),
  );
} finally {
  if (createdCallId) {
    await database.db.transaction(async (tx) => {
      await tx
        .delete(telephonyInboundEvents)
        .where(eq(telephonyInboundEvents.inboundCallId, createdCallId!));
      await tx
        .delete(telephonyInboundCalls)
        .where(eq(telephonyInboundCalls.id, createdCallId!));
    });
  }
  await database.pool.end();
}
