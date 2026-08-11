import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  consultationRequests,
  createDatabaseClient,
  telephonyCallLegs,
  telephonyCallObservationLinks,
  telephonyCallObservations,
  telephonyCallProviderIdentifiers,
  telephonyCallRelations,
  telephonyCallRoots,
  telephonyCalls,
  telephonyEndpoints,
  telephonyInboundCalls,
  telephonyInboundEvents,
} from "@lawand/db";

import { createCentrexBridgeIngressService } from "./centrex-bridge-service.js";
import { createDataProtection } from "./crypto.js";
import {
  createPostgresTelephonyDeskEventSource,
  type TelephonyDeskEventMessage,
} from "./telephony-desk-events.js";
import {
  createPostgresTelephonyInboundEventSource,
  type TelephonyInboundEventMessage,
} from "./telephony-inbound-events.js";
import { createTelephonyService } from "./telephony-service.js";

const databaseUrl = process.env.LAWAND_APP_DATABASE_URL;
const encryptionKey = process.env.LAWAND_DATA_ENCRYPTION_KEY_V1;
const hmacKey = process.env.LAWAND_DATA_HMAC_KEY_V1;
const keyVersion = process.env.LAWAND_DATA_KEY_VERSION;
if (!databaseUrl || !encryptionKey || !hmacKey || !keyVersion) {
  throw new Error("gateway 로컬 환경변수가 필요합니다.");
}

const database = createDatabaseClient(databaseUrl);
const protection = createDataProtection({ encryptionKey, hmacKey, keyVersion });
const service = createCentrexBridgeIngressService({
  db: database.db,
  protection,
});
const baseTime = Date.now();
const telephonyService = createTelephonyService({
  db: database.db,
  protection,
  dispatchEnabled: false,
  now: () => new Date(baseTime + 2_500),
});
const realtimeMessages: TelephonyInboundEventMessage[] = [];
const deskRealtimeMessages: TelephonyDeskEventMessage[] = [];
const realtimeErrors: unknown[] = [];
const realtime = createPostgresTelephonyInboundEventSource({
  pool: database.pool,
  onError: (error) => realtimeErrors.push(error),
});
const unsubscribeRealtime = realtime.subscribe((message) =>
  realtimeMessages.push(message),
);
const deskRealtime = createPostgresTelephonyDeskEventSource({
  pool: database.pool,
  onError: (error) => realtimeErrors.push(error),
});
const unsubscribeDeskRealtime = deskRealtime.subscribe((message) =>
  deskRealtimeMessages.push(message),
);
let realtimeStarted = false;
let deskRealtimeStarted = false;
let linkedObservedCallId: string | null = null;

const endpointId = randomUUID();
const bridgeId = `verify-${randomBytes(5).toString("hex")}`;
const providerCallId = `verify.${Date.now()}`;
const concurrentProviderCallId = `${providerCallId}.concurrent`;
const outboundProviderCallId = `${providerCallId}.outbound`;
const phone = "01012345678";
const concurrentPhone = "0212345678";
const calledPhone = "01098765432";
const line = `070${String(Date.now()).slice(-8)}`;
const ringEventId = randomUUID();

try {
  await database.db.insert(telephonyEndpoints).values({
    id: endpointId,
    provider: "centrex",
    endpointType: "personal",
    label: "bridge ingress verify",
    lineNumber: line,
    extension: "4591",
    apiLoginId: line,
    credentialKey: bridgeId,
    isActive: true,
  });
  await realtime.start();
  realtimeStarted = true;
  await deskRealtime.start();
  deskRealtimeStarted = true;

  const ring = await service.ingest(
    {
      schemaVersion: 1,
      eventId: ringEventId,
      bridgeId,
      endpointId,
      eventType: "inbound.ringing",
      occurredAt: new Date(baseTime).toISOString(),
      providerCallId,
      callerNumber: phone,
      incomingLineNumber: line,
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );
  assert.equal(ring.state, "ringing");
  assert.equal(ring.replayed, false);

  const replay = await service.ingest(
    {
      schemaVersion: 1,
      eventId: ringEventId,
      bridgeId,
      endpointId,
      eventType: "inbound.ringing",
      occurredAt: new Date(baseTime).toISOString(),
      providerCallId,
      callerNumber: phone,
      incomingLineNumber: line,
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );
  assert.equal(replay.callId, ring.callId);
  assert.equal(replay.replayed, true);

  await service.ingest(
    {
      schemaVersion: 1,
      eventId: randomUUID(),
      bridgeId,
      endpointId,
      eventType: "inbound.connected",
      occurredAt: new Date(baseTime + 1_000).toISOString(),
      providerCallId,
      providerChannelId: `${providerCallId}.channel`,
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );
  const concurrentRing = await service.ingest(
    {
      schemaVersion: 1,
      eventId: randomUUID(),
      bridgeId,
      endpointId,
      eventType: "inbound.ringing",
      occurredAt: new Date(baseTime + 500).toISOString(),
      providerCallId: concurrentProviderCallId,
      callerNumber: concurrentPhone,
      incomingLineNumber: line,
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );
  const activeAfterConcurrentRing = await database.db
    .select({
      id: telephonyInboundCalls.id,
    })
    .from(telephonyInboundCalls)
    .where(
      and(
        eq(telephonyInboundCalls.endpointId, endpointId),
        isNull(telephonyInboundCalls.endedAt),
      ),
    );
  assert.deepEqual(activeAfterConcurrentRing, [{ id: concurrentRing.callId }]);
  const [supersededInboundCall] = await database.db
    .select({
      state: telephonyInboundCalls.state,
      providerEndCause: telephonyInboundCalls.providerEndCause,
    })
    .from(telephonyInboundCalls)
    .where(eq(telephonyInboundCalls.id, ring.callId));
  assert.deepEqual(supersededInboundCall, {
    state: "ended",
    providerEndCause: "SUPERSEDED_BY_NEW_CALL",
  });
  await service.ingest(
    {
      schemaVersion: 1,
      eventId: randomUUID(),
      bridgeId,
      endpointId,
      eventType: "inbound.ended",
      occurredAt: new Date(baseTime + 2_000).toISOString(),
      providerCallId,
      providerEndCause: "16",
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );

  const [storedCall] = await database.db
    .select()
    .from(telephonyInboundCalls)
    .where(eq(telephonyInboundCalls.id, ring.callId));
  assert.ok(storedCall);
  assert.equal(storedCall.state, "ended");
  assert.equal(storedCall.providerEndCause, "16");
  assert.equal(storedCall.remotePhoneMasked, "***5678");
  assert.equal(storedCall.remotePhoneFingerprint.equals(protection.fingerprint(phone)), true);
  assert.equal(storedCall.remotePhoneCiphertext.includes(Buffer.from(phone)), false);

  const events = await database.db
    .select({ id: telephonyInboundEvents.id })
    .from(telephonyInboundEvents)
    .where(eq(telephonyInboundEvents.inboundCallId, ring.callId));
  assert.equal(events.length, 4);

  const outboundRing = await service.ingest(
    {
      schemaVersion: 1,
      eventId: randomUUID(),
      bridgeId,
      endpointId,
      eventType: "outbound.ringing",
      occurredAt: new Date(baseTime + 3_000).toISOString(),
      providerCallId: outboundProviderCallId,
      calledNumber: calledPhone,
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );
  const activeAfterOutboundRing = await database.db
    .select({ id: telephonyInboundCalls.id })
    .from(telephonyInboundCalls)
    .where(
      and(
        eq(telephonyInboundCalls.endpointId, endpointId),
        isNull(telephonyInboundCalls.endedAt),
      ),
    );
  assert.deepEqual(activeAfterOutboundRing, [{ id: outboundRing.callId }]);
  const [supersededConcurrentCall] = await database.db
    .select({
      state: telephonyInboundCalls.state,
      providerEndCause: telephonyInboundCalls.providerEndCause,
    })
    .from(telephonyInboundCalls)
    .where(eq(telephonyInboundCalls.id, concurrentRing.callId));
  assert.deepEqual(supersededConcurrentCall, {
    state: "ended",
    providerEndCause: "SUPERSEDED_BY_NEW_CALL",
  });
  await service.ingest(
    {
      schemaVersion: 1,
      eventId: randomUUID(),
      bridgeId,
      endpointId,
      eventType: "outbound.connected",
      occurredAt: new Date(baseTime + 4_000).toISOString(),
      providerCallId: outboundProviderCallId,
      providerChannelId: `${outboundProviderCallId}.channel`,
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );
  await service.ingest(
    {
      schemaVersion: 1,
      eventId: randomUUID(),
      bridgeId,
      endpointId,
      eventType: "outbound.ended",
      occurredAt: new Date(baseTime + 5_000).toISOString(),
      providerCallId: outboundProviderCallId,
      providerEndCause: "16",
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );
  const [storedOutboundCall] = await database.db
    .select()
    .from(telephonyInboundCalls)
    .where(eq(telephonyInboundCalls.id, outboundRing.callId));
  assert.ok(storedOutboundCall);
  assert.equal(storedOutboundCall.direction, "outbound");
  assert.equal(storedOutboundCall.state, "ended");
  assert.equal(storedOutboundCall.remotePhoneMasked, "***5432");
  assert.equal(
    storedOutboundCall.remotePhoneFingerprint.equals(
      protection.fingerprint(calledPhone),
    ),
    true,
  );

  const outboundEvents = await database.db
    .select({ id: telephonyInboundEvents.id })
    .from(telephonyInboundEvents)
    .where(eq(telephonyInboundEvents.inboundCallId, outboundRing.callId));
  assert.equal(outboundEvents.length, 3);

  const activityProviderCallId = `${providerCallId}.activity`;
  const activityRing = await service.ingest(
    {
      schemaVersion: 2,
      eventId: randomUUID(),
      bridgeId,
      endpointId,
      eventType: "call.ringing",
      occurredAt: new Date(baseTime + 7_000).toISOString(),
      providerCallId: activityProviderCallId,
      agentExtension: "4591",
      direction: "inbound",
      remotePartyKind: "external",
      remotePartyNumber: phone,
      incomingLineNumber: line,
      channelKind: "sip",
      relatedChannelKind: "sip",
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );
  await service.ingest(
    {
      schemaVersion: 2,
      eventId: randomUUID(),
      bridgeId,
      endpointId,
      eventType: "call.channels",
      occurredAt: new Date(baseTime + 8_000).toISOString(),
      providerCallId: activityProviderCallId,
      relatedProviderCallId: `${activityProviderCallId}.channel`,
      agentExtension: "4591",
      party1Kind: "external",
      party2Kind: "internal",
      party1Number: phone,
      party2Number: "4591",
      channel1Kind: "sip",
      channel2Kind: "sip",
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );
  await service.ingest(
    {
      schemaVersion: 2,
      eventId: randomUUID(),
      bridgeId,
      endpointId,
      eventType: "call.ended",
      occurredAt: new Date(baseTime + 9_000).toISOString(),
      providerCallId: `${activityProviderCallId}.channel`,
      sourceProviderCallId: activityProviderCallId,
      agentExtension: "4591",
      providerEndCause: "16",
      channelKind: "sip",
      relatedChannelKind: "sip",
    },
    {
      bridgeId,
      endpointId,
      authenticationNonceHash: randomBytes(32),
    },
  );
  const [activityRoot] = await database.db
    .select({
      state: telephonyCallRoots.state,
      endedAt: telephonyCallRoots.endedAt,
    })
    .from(telephonyCallRoots)
    .where(eq(telephonyCallRoots.id, activityRing.callId));
  assert.equal(activityRoot?.state, "ended");
  assert.ok(activityRoot?.endedAt);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(realtimeErrors.length, 0);
  const deskChanges = deskRealtimeMessages.filter(
    (message) => message.kind === "changed",
  );
  assert.ok(deskChanges.length >= 6);
  assert.equal(
    deskChanges.every(
      (message) =>
        message.kind === "changed" &&
        !Object.hasOwn(message.notification, "remotePhone"),
    ),
    true,
  );
  const realtimeChanges = realtimeMessages.filter(
    (message) => message.kind === "changed",
  );
  assert.ok(realtimeChanges.length >= 4);
  assert.equal(
    realtimeChanges.every(
      (message) =>
        message.kind === "changed" &&
        message.notification.eventType.startsWith("inbound."),
    ),
    true,
  );

  const snapshot = await telephonyService.getInboundCallSnapshot();
  const verifiedItems = snapshot.items.filter(
    (item) => item.endpointId === endpointId,
  );
  assert.equal(verifiedItems.length, 2);
  assert.deepEqual(
    new Set(verifiedItems.map((item) => item.id)),
    new Set([ring.callId, concurrentRing.callId]),
  );
  assert.deepEqual(
    new Set(verifiedItems.map((item) => item.remotePhone)),
    new Set([phone, concurrentPhone]),
  );
  const phoneDesk = await telephonyService.getPhoneDeskCalls(100);
  const verifiedDeskItems = phoneDesk.items.filter(
    (item) => item.endpoint.id === endpointId,
  );
  assert.equal(verifiedDeskItems.length, 3);
  assert.equal(
    verifiedDeskItems.find((item) => item.id === outboundRing.callId)?.source,
    "centrex_direct",
  );
  assert.equal(
    verifiedDeskItems.filter((item) => item.source === "inbound").length,
    2,
  );

  const [clickCandidate] = await database.db
    .select({
      id: telephonyCalls.id,
      endpointId: telephonyCalls.endpointId,
      requestedAt: telephonyCalls.requestedAt,
      requestId: consultationRequests.id,
      phoneCiphertext: consultationRequests.phoneCiphertext,
      phoneNonce: consultationRequests.phoneNonce,
      phoneKeyVersion: consultationRequests.phoneKeyVersion,
    })
    .from(telephonyCalls)
    .innerJoin(
      consultationRequests,
      eq(consultationRequests.id, telephonyCalls.consultationRequestId),
    )
    .leftJoin(
      telephonyCallObservationLinks,
      eq(telephonyCallObservationLinks.telephonyCallId, telephonyCalls.id),
    )
    .where(
      and(
        eq(telephonyCalls.commandStatus, "succeeded"),
        isNull(telephonyCallObservationLinks.observedCallId),
      ),
    )
    .orderBy(desc(telephonyCalls.requestedAt))
    .limit(1);
  if (
    clickCandidate?.phoneCiphertext &&
    clickCandidate.phoneNonce &&
    clickCandidate.phoneKeyVersion
  ) {
    const candidatePhone = protection.decrypt(
      {
        ciphertext: clickCandidate.phoneCiphertext,
        nonce: clickCandidate.phoneNonce,
        keyVersion: clickCandidate.phoneKeyVersion,
      },
      `consultation_requests.phone:${clickCandidate.requestId}`,
    );
    const linkedObservation = await service.ingest(
      {
        schemaVersion: 1,
        eventId: randomUUID(),
        bridgeId,
        endpointId: clickCandidate.endpointId,
        eventType: "outbound.ringing",
        occurredAt: new Date(
          clickCandidate.requestedAt.getTime() + 10_000,
        ).toISOString(),
        providerCallId: `${providerCallId}.linked`,
        calledNumber: candidatePhone,
      },
      {
        bridgeId,
        endpointId: clickCandidate.endpointId,
        authenticationNonceHash: randomBytes(32),
      },
    );
    linkedObservedCallId = linkedObservation.callId;
    const [storedLink] = await database.db
      .select()
      .from(telephonyCallObservationLinks)
      .where(
        eq(
          telephonyCallObservationLinks.observedCallId,
          linkedObservation.callId,
        ),
      );
    assert.ok(storedLink);
    assert.equal(storedLink.telephonyCallId, clickCandidate.id);
    assert.equal(storedLink.timeDeltaMs, 10_000);
    const linkedPhoneDesk = await telephonyService.getPhoneDeskCalls(100);
    const collapsed = linkedPhoneDesk.items.find(
      (item) => item.observedCallId === linkedObservation.callId,
    );
    assert.equal(collapsed?.source, "click_to_call");
    assert.equal(collapsed?.clickToCall?.id, clickCandidate.id);
    assert.equal(collapsed?.clickToCall?.observationLink?.timeDeltaMs, 10_000);
    assert.equal(
      linkedPhoneDesk.items.filter(
        (item) => item.clickToCall?.id === clickCandidate.id,
      ).length,
      1,
    );
  }
  console.log("Centrex bridge ingress verification passed.");
} finally {
  unsubscribeRealtime();
  unsubscribeDeskRealtime();
  if (realtimeStarted) await realtime.stop();
  if (deskRealtimeStarted) await deskRealtime.stop();
  if (linkedObservedCallId) {
    await database.db
      .delete(telephonyCallObservationLinks)
      .where(
        eq(
          telephonyCallObservationLinks.observedCallId,
          linkedObservedCallId,
        ),
      );
    await database.db
      .delete(telephonyInboundEvents)
      .where(eq(telephonyInboundEvents.inboundCallId, linkedObservedCallId));
    await database.db
      .delete(telephonyInboundCalls)
      .where(eq(telephonyInboundCalls.id, linkedObservedCallId));
  }
  await database.db
    .delete(telephonyInboundEvents)
    .where(eq(telephonyInboundEvents.endpointId, endpointId));
  await database.db
    .delete(telephonyInboundCalls)
    .where(eq(telephonyInboundCalls.endpointId, endpointId));
  const rootRows = await database.db
    .select({ id: telephonyCallRoots.id })
    .from(telephonyCallRoots)
    .where(eq(telephonyCallRoots.originalEndpointId, endpointId));
  const rootIds = rootRows.map((row) => row.id);
  if (rootIds.length) {
    await database.db
      .delete(telephonyCallObservations)
      .where(inArray(telephonyCallObservations.rootId, rootIds));
    await database.db
      .delete(telephonyCallRelations)
      .where(inArray(telephonyCallRelations.rootId, rootIds));
    await database.db
      .delete(telephonyCallProviderIdentifiers)
      .where(inArray(telephonyCallProviderIdentifiers.rootId, rootIds));
    await database.db
      .delete(telephonyCallLegs)
      .where(inArray(telephonyCallLegs.rootId, rootIds));
    await database.db
      .delete(telephonyCallRoots)
      .where(inArray(telephonyCallRoots.id, rootIds));
  }
  await database.db
    .delete(telephonyEndpoints)
    .where(eq(telephonyEndpoints.id, endpointId));
  await database.pool.end();
}
