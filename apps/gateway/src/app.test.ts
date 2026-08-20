import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import {
  CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL,
  desktopNotificationPreferenceDefaults,
  type PhoneDeskAftercareSave,
} from "@lawand/core";

import { createGatewayServer } from "./app.js";
import type { StaffAuthService, StaffPrincipal } from "./auth.js";
import { centrexBridgeCanonicalRequest } from "./centrex-bridge-auth.js";
import type { CentrexBridgeIngressService } from "./centrex-bridge-service.js";
import type { CentrexBridgeProvisioningService } from "./centrex-bridge-provisioning.js";
import type { CentrexInboundObserver } from "./centrex-inbound-observer.js";
import type { ConsultationService } from "./service.js";
import type { ReviewManagementService } from "./review-management-service.js";
import type { ReviewSubmissionService } from "./review-service.js";
import type { TelephonyService } from "./telephony-service.js";
import type { DesktopNotificationService } from "./desktop-notification-service.js";

const realtimeActor = {
  id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b1",
  email: "staff@lawand.test",
  displayName: "로앤 직원",
  primaryMembership: {
    id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b2",
    organization: { key: "lawand", name: "법무법인 로앤" },
    region: { key: "seoul", name: "서울" },
    department: "상담팀",
    jobTitle: "상담 담당자",
    role: "full_time" as const,
    isPrimary: true,
  },
  memberships: [],
  roles: ["full_time" as const],
} satisfies StaffPrincipal;

test("gateway health endpoint", async (context) => {
  const server = createGatewayServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    service: "lawand-gateway",
    status: "ok",
  });
});

test("gateway health endpoint는 요청·LISTEN 풀 상태를 노출한다", async (context) => {
  const pool = {
    total: 20,
    idle: 5,
    used: 15,
    waiting: 2,
    max: 20,
    utilizationPercent: 75,
  };
  const server = createGatewayServer({
    databasePoolHealth: () => ({
      request: pool,
      listener: {
        total: 3,
        idle: 0,
        used: 3,
        waiting: 0,
        max: 4,
        utilizationPercent: 75,
      },
    }),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  const body = await response.json() as {
    databasePools: {
      request: { waiting: number };
      listener: { max: number };
    };
  };
  assert.equal(body.databasePools.request.waiting, 2);
  assert.equal(body.databasePools.listener.max, 4);
});

test("ERP 직원은 내부 인증과 세션으로 PC 연결 코드를 발급한다", async (context) => {
  let receivedActorId = "";
  const authService = {
    authenticateSession: async (token: string) => {
      assert.equal(token, "staff-session");
      return realtimeActor;
    },
  } as unknown as StaffAuthService;
  const desktopNotificationService = {
    createPairing: async (actor: StaffPrincipal) => {
      receivedActorId = actor.id;
      return {
        pairingCode: "p".repeat(43),
        expiresAt: "2026-08-20T12:05:00.000Z",
      };
    },
  } as unknown as DesktopNotificationService;
  const server = createGatewayServer({
    authService,
    desktopNotificationService,
    internalApiKey: "internal-key",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const unauthorized = await fetch(
    `${baseUrl}/v1/desktop-notifications/pairings`,
    { method: "POST" },
  );
  assert.equal(unauthorized.status, 401);

  const response = await fetch(
    `${baseUrl}/v1/desktop-notifications/pairings`,
    {
      method: "POST",
      headers: {
        "x-lawand-internal-key": "internal-key",
        "x-lawand-staff-session": "staff-session",
      },
    },
  );
  assert.equal(response.status, 201);
  assert.equal(receivedActorId, realtimeActor.id);
  assert.equal(
    (await response.json() as { pairingCode: string }).pairingCode,
    "p".repeat(43),
  );
});

test("ERP 직원은 본인의 PC 알림 설정만 조회하고 전체 계약으로 저장한다", async (context) => {
  let updatedActorId = "";
  const updatedPreferences = {
    ...desktopNotificationPreferenceDefaults,
    "consultation.unassigned": true,
  };
  const authService = {
    authenticateSession: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const desktopNotificationService = {
    listPreferences: async (actor: StaffPrincipal) => {
      assert.equal(actor.id, realtimeActor.id);
      return { preferences: desktopNotificationPreferenceDefaults };
    },
    updatePreferences: async (
      actor: StaffPrincipal,
      input: { preferences: typeof updatedPreferences },
    ) => {
      updatedActorId = actor.id;
      assert.deepEqual(input.preferences, updatedPreferences);
      return input;
    },
  } as unknown as DesktopNotificationService;
  const server = createGatewayServer({
    authService,
    desktopNotificationService,
    internalApiKey: "internal-key",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/v1/desktop-notifications/preferences`;
  const headers = {
    "content-type": "application/json",
    "x-lawand-internal-key": "internal-key",
    "x-lawand-staff-session": "staff-session",
  };

  const listed = await fetch(url, { headers });
  assert.equal(listed.status, 200);
  assert.deepEqual(
    (await listed.json() as { preferences: unknown }).preferences,
    desktopNotificationPreferenceDefaults,
  );

  const invalid = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ preferences: { "consultation.unassigned": true } }),
  });
  assert.equal(invalid.status, 400);

  const updated = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ preferences: updatedPreferences }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updatedActorId, realtimeActor.id);
});

test("Windows 앱은 일회용 연결 뒤 기기 토큰으로 알림을 가져오고 확인한다", async (context) => {
  const deviceToken = "d".repeat(43);
  const deliveryId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2b8";
  const calls: string[] = [];
  const desktopNotificationService = {
    pairDevice: async (input: { deviceName: string }) => {
      calls.push(`pair:${input.deviceName}`);
      return {
        deviceToken,
        device: {
          id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b7",
          name: input.deviceName,
          platform: "windows" as const,
          appVersion: "0.1.0",
          staffDisplayName: "로앤 직원",
        },
        pollIntervalSeconds: 5,
      };
    },
    pollNext: async (token: string) => {
      calls.push(`poll:${token}`);
      return {
        deliveryId,
        notificationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b9",
        eventType: "desktop.test",
        payload: {
          title: "LAW& OS 테스트 알림",
          body: "고객명 · 전화번호 · 상담 내용",
          category: "test" as const,
          deepLink: "https://erp.lawandfirm.com/desktop-notifications",
        },
        createdAt: "2026-08-20T12:00:00.000Z",
        expiresAt: "2026-08-20T12:15:00.000Z",
      };
    },
    acknowledge: async (
      token: string,
      input: { deliveryId: string; outcome: string },
    ) => {
      calls.push(`ack:${token}:${input.deliveryId}:${input.outcome}`);
      return { ...input, acknowledged: true as const };
    },
  } as unknown as DesktopNotificationService;
  const server = createGatewayServer({ desktopNotificationService });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const paired = await fetch(`${baseUrl}/v1/desktop-notifications/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pairingCode: "p".repeat(43),
      deviceName: "LAWAND-DESK-01",
      platform: "windows",
      appVersion: "0.1.0",
    }),
  });
  assert.equal(paired.status, 201);
  assert.equal((await paired.json() as { deviceToken: string }).deviceToken, deviceToken);

  const polled = await fetch(`${baseUrl}/v1/desktop-notifications/poll`, {
    headers: { "x-lawand-desktop-token": deviceToken },
  });
  assert.equal(polled.status, 200);
  assert.equal((await polled.json() as { deliveryId: string }).deliveryId, deliveryId);

  const acknowledged = await fetch(
    `${baseUrl}/v1/desktop-notifications/ack`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-desktop-token": deviceToken,
      },
      body: JSON.stringify({ deliveryId, outcome: "displayed" }),
    },
  );
  assert.equal(acknowledged.status, 200);
  assert.deepEqual(calls, [
    "pair:LAWAND-DESK-01",
    `poll:${deviceToken}`,
    `ack:${deviceToken}:${deliveryId}:displayed`,
  ]);
});

test("Windows 연결 반복 제한은 DB 조회 전에 429와 재시도 시간을 반환한다", async (context) => {
  let pairCalls = 0;
  const desktopNotificationService = {
    async pairDevice() {
      pairCalls += 1;
      throw new Error("rate limit must run first");
    },
  } as unknown as DesktopNotificationService;
  const server = createGatewayServer({
    desktopNotificationService,
    desktopPairingProtection: {
      check(input) {
        assert.equal(input.pairingCode, "p".repeat(43));
        assert.equal(input.networkAddress, "203.0.113.20");
        return {
          allowed: false as const,
          dimension: "network" as const,
          retryAfterSeconds: 37,
        };
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/desktop-notifications/pair`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.1, 203.0.113.20",
      },
      body: JSON.stringify({
        pairingCode: "p".repeat(43),
        deviceName: "LAWAND-DESK-01",
        platform: "windows",
        appVersion: "0.1.0",
      }),
    },
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "37");
  assert.equal(
    (await response.json() as { error: string }).error,
    "pairing_rate_limited",
  );
  assert.equal(pairCalls, 0);
});

test("PC 알림 polling은 기기 토큰이 없거나 대기 건이 없으면 안전하게 끝난다", async (context) => {
  const desktopNotificationService = {
    pollNext: async () => null,
  } as unknown as DesktopNotificationService;
  const server = createGatewayServer({ desktopNotificationService });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/v1/desktop-notifications/poll`;

  assert.equal((await fetch(url)).status, 401);
  assert.equal(
    (await fetch(url, {
      headers: { "x-lawand-desktop-token": "d".repeat(43) },
    })).status,
    204,
  );
});

test("U+ 수신 콜백은 비밀 HTML 경로만 허용하고 원문을 응답하지 않는다", async (context) => {
  const callbackPath = "/v1/centrex-ring/test_secret_value_1234567890ab.html";
  let receivedSender = "";
  const centrexInboundObserver = {
    matchesPath: (pathname: string) => pathname === callbackPath,
    ingest: async (searchParams: URLSearchParams) => {
      receivedSender = searchParams.get("sender") ?? "";
      return {
        callId: "01980000-0000-7000-8000-000000000009",
        state: "ringing" as const,
        replayed: false,
      };
    },
  } as unknown as CentrexInboundObserver;
  const server = createGatewayServer({ centrexInboundObserver });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const query = new URLSearchParams({
    sender: "01012345678",
    receiver: "07012345678",
    kind: "1",
    inner_num: "5678",
    message: "",
  });
  const accepted = await fetch(
    `http://127.0.0.1:${address.port}${callbackPath}?${query}`,
  );
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { status: "ok" });
  assert.equal(receivedSender, "01012345678");

  const rejected = await fetch(
    `http://127.0.0.1:${address.port}/v1/centrex-ring/wrong.html?${query}`,
  );
  assert.equal(rejected.status, 404);
});

test("센트릭스 bridge 이벤트는 HMAC 검증 뒤 수신 서비스에 전달된다", async (context) => {
  const bridgeId = "seoul-phone-01";
  const endpointId = "01980000-0000-7000-8000-000000000002";
  const event = {
    schemaVersion: 1,
    eventId: "01980000-0000-7000-8000-000000000001",
    bridgeId,
    endpointId,
    eventType: "inbound.ringing",
    occurredAt: "2026-08-06T09:10:11.000+09:00",
    providerCallId: "1315457785.80",
    callerNumber: "01012345678",
    incomingLineNumber: "07000001234",
  } as const;
  const body = Buffer.from(JSON.stringify(event), "utf8");
  const secret = Buffer.alloc(32, 9);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonce = "AQIDBAUGBwgJCgsMDQ4PEA";
  const canonical = centrexBridgeCanonicalRequest({
    bridgeId,
    timestamp,
    nonce,
    body,
  });
  let receivedEventId: string | undefined;
  const centrexBridgeIngress = {
    ingest: async (receivedEvent: typeof event) => {
      receivedEventId = receivedEvent.eventId;
      return {
        callId: "01980000-0000-7000-8000-000000000003",
        state: "ringing" as const,
        replayed: false,
      };
    },
  } as unknown as CentrexBridgeIngressService;
  const server = createGatewayServer({
    centrexBridgeIngress,
    centrexBridgeKeys: { [bridgeId]: { endpointId, secret } },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/centrex-bridge/events`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-bridge-id": bridgeId,
        "x-lawand-bridge-timestamp": timestamp,
        "x-lawand-bridge-nonce": nonce,
        "x-lawand-bridge-signature": `v1=${createHmac("sha256", secret)
          .update(canonical)
          .digest("hex")}`,
      },
      body,
    },
  );
  assert.equal(response.status, 201);
  assert.equal(receivedEventId, event.eventId);
});

test("센트릭스 bridge는 서명된 polling으로 받기 명령을 가져오고 결과를 확정한다", async (context) => {
  const bridgeId = "seoul-phone-01";
  const endpointId = "01980000-0000-7000-8000-000000000002";
  const commandId = "01980000-0000-7000-8000-000000000005";
  const inboundCallId = "01980000-0000-7000-8000-000000000006";
  const secret = Buffer.alloc(32, 8);
  let completedCommandId: string | undefined;
  const telephonyService = {
    pollInboundAnswerCommand: async () => ({
      schemaVersion: 1 as const,
      commandId,
      inboundCallId,
      commandType: "answer" as const,
      expectedProviderCallId: "1315457785.80",
      expiresAt: new Date(Date.now() + 20_000).toISOString(),
    }),
    completeInboundAnswerCommand: async (receivedCommandId: string) => {
      completedCommandId = receivedCommandId;
      return {
        id: commandId,
        inboundCallId,
        status: "succeeded" as const,
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 20_000).toISOString(),
        completedAt: new Date().toISOString(),
        resultCode: "accepted",
        replayed: false,
      };
    },
  } as unknown as TelephonyService;
  const server = createGatewayServer({
    centrexBridgeKeys: { [bridgeId]: { endpointId, secret } },
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const pollPath = "/v1/centrex-bridge/commands/next";
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const pollNonce = "AQIDBAUGBwgJCgsMDQ4PEQ";
  const pollCanonical = centrexBridgeCanonicalRequest({
    bridgeId,
    timestamp,
    nonce: pollNonce,
    body: Buffer.alloc(0),
    method: "GET",
    path: pollPath,
  });
  const polled = await fetch(`http://127.0.0.1:${address.port}${pollPath}`, {
    headers: {
      "x-lawand-bridge-id": bridgeId,
      "x-lawand-bridge-timestamp": timestamp,
      "x-lawand-bridge-nonce": pollNonce,
      "x-lawand-bridge-signature": `v1=${createHmac("sha256", secret)
        .update(pollCanonical)
        .digest("hex")}`,
    },
  });
  assert.equal(polled.status, 200);
  assert.equal((await polled.json() as { commandId: string }).commandId, commandId);
  const replayedPoll = await fetch(
    `http://127.0.0.1:${address.port}${pollPath}`,
    {
      headers: {
        "x-lawand-bridge-id": bridgeId,
        "x-lawand-bridge-timestamp": timestamp,
        "x-lawand-bridge-nonce": pollNonce,
        "x-lawand-bridge-signature": `v1=${createHmac("sha256", secret)
          .update(pollCanonical)
          .digest("hex")}`,
      },
    },
  );
  assert.equal(replayedPoll.status, 401);

  const resultPath = `/v1/centrex-bridge/commands/${commandId}/result`;
  const resultBody = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    commandId,
    status: "succeeded",
    resultCode: "accepted",
  }));
  const resultNonce = "AQIDBAUGBwgJCgsMDQ4PEg";
  const resultCanonical = centrexBridgeCanonicalRequest({
    bridgeId,
    timestamp,
    nonce: resultNonce,
    body: resultBody,
    method: "POST",
    path: resultPath,
  });
  const completed = await fetch(
    `http://127.0.0.1:${address.port}${resultPath}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-bridge-id": bridgeId,
        "x-lawand-bridge-timestamp": timestamp,
        "x-lawand-bridge-nonce": resultNonce,
        "x-lawand-bridge-signature": `v1=${createHmac("sha256", secret)
          .update(resultCanonical)
          .digest("hex")}`,
      },
      body: resultBody,
    },
  );
  assert.equal(completed.status, 200);
  assert.equal(completedCommandId, commandId);
});

test("센트릭스 bridge 회선 교체 명령은 받기보다 우선 전달되고 로그인 결과로 확정된다", async (context) => {
  const bridgeId = "seoul-phone-01";
  const endpointId = "01980000-0000-7000-8000-000000000012";
  const commandId = "01980000-0000-7000-8000-000000000015";
  const secret = Buffer.alloc(32, 7);
  let completedCommandId: string | undefined;
  let answerPolled = false;
  const command = {
    schemaVersion: 1 as const,
    commandId,
    commandType: "provision" as const,
    endpointId,
    expectedExtension: "4535",
    expectedLineLast4: "4535",
    credentialEnvelope: {
      algorithm: "A256CBC-HS256" as const,
      iv: "AAECAwQFBgcICQoLDA0ODw",
      ciphertext: "YWJjZA",
      mac: "ZWZnaA",
    },
    expiresAt: new Date(Date.now() + 40_000).toISOString(),
  };
  const centrexBridgeProvisioning = {
    poll: async () => command,
    handlesCommand: (receivedCommandId: string, receivedBridgeId: string) =>
      receivedCommandId === commandId && receivedBridgeId === bridgeId,
    complete: async (receivedCommandId: string) => {
      completedCommandId = receivedCommandId;
      return {
        status: "succeeded" as const,
        resultCode: "centrex_login_succeeded",
        replayed: false,
      };
    },
  } as unknown as CentrexBridgeProvisioningService;
  const telephonyService = {
    pollInboundAnswerCommand: async () => {
      answerPolled = true;
      return null;
    },
  } as unknown as TelephonyService;
  const server = createGatewayServer({
    centrexBridgeKeys: { [bridgeId]: { endpointId, secret } },
    centrexBridgeProvisioning,
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const pollPath = "/v1/centrex-bridge/commands/next";
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const pollNonce = "AQIDBAUGBwgJCgsMDQ4PFQ";
  const pollCanonical = centrexBridgeCanonicalRequest({
    bridgeId,
    timestamp,
    nonce: pollNonce,
    body: Buffer.alloc(0),
    method: "GET",
    path: pollPath,
  });
  const polled = await fetch(`http://127.0.0.1:${address.port}${pollPath}`, {
    headers: {
      "x-lawand-bridge-id": bridgeId,
      "x-lawand-bridge-timestamp": timestamp,
      "x-lawand-bridge-nonce": pollNonce,
      "x-lawand-bridge-signature": `v1=${createHmac("sha256", secret)
        .update(pollCanonical)
        .digest("hex")}`,
    },
  });
  assert.equal(polled.status, 200);
  const polledBody = await polled.text();
  assert.equal(answerPolled, false);
  assert.equal(polledBody.includes("password"), false);
  assert.equal(JSON.parse(polledBody).commandType, "provision");

  const resultPath = `/v1/centrex-bridge/commands/${commandId}/result`;
  const resultBody = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    commandId,
    status: "succeeded",
    resultCode: "centrex_login_succeeded",
  }));
  const resultNonce = "AQIDBAUGBwgJCgsMDQ4PFg";
  const resultCanonical = centrexBridgeCanonicalRequest({
    bridgeId,
    timestamp,
    nonce: resultNonce,
    body: resultBody,
    method: "POST",
    path: resultPath,
  });
  const completed = await fetch(
    `http://127.0.0.1:${address.port}${resultPath}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-bridge-id": bridgeId,
        "x-lawand-bridge-timestamp": timestamp,
        "x-lawand-bridge-nonce": resultNonce,
        "x-lawand-bridge-signature": `v1=${createHmac("sha256", secret)
          .update(resultCanonical)
          .digest("hex")}`,
      },
      body: resultBody,
    },
  );
  assert.equal(completed.status, 200);
  assert.equal(completedCommandId, commandId);
});

test("빈 bridge 슬롯은 서명 polling으로 온라인을 알리되 전화 받기 명령을 조회하지 않는다", async (context) => {
  const bridgeId = "lawand-slot-001";
  const endpointId = "01980000-0000-7000-8000-000000000019";
  const secret = Buffer.alloc(32, 9);
  let answerPolled = false;
  const centrexBridgeProvisioning = {
    poll: async () => null,
    isReadyForTelephony: () => false,
  } as unknown as CentrexBridgeProvisioningService;
  const telephonyService = {
    pollInboundAnswerCommand: async () => {
      answerPolled = true;
      return null;
    },
  } as unknown as TelephonyService;
  const server = createGatewayServer({
    centrexBridgeKeys: { [bridgeId]: { endpointId, secret } },
    centrexBridgeProvisioning,
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const path = "/v1/centrex-bridge/commands/next";
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonce = "AQIDBAUGBwgJCgsMDQ4PHQ";
  const canonical = centrexBridgeCanonicalRequest({
    bridgeId,
    timestamp,
    nonce,
    body: Buffer.alloc(0),
    method: "GET",
    path,
  });
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    headers: {
      "x-lawand-bridge-id": bridgeId,
      "x-lawand-bridge-timestamp": timestamp,
      "x-lawand-bridge-nonce": nonce,
      "x-lawand-bridge-signature": `v1=${createHmac("sha256", secret)
        .update(canonical)
        .digest("hex")}`,
    },
  });
  assert.equal(response.status, 204);
  assert.equal(answerPolled, false);
});

test("내부 조회 API는 인증 키 없이 열리지 않는다", async (context) => {
  const server = createGatewayServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations`,
  );
  assert.equal(response.status, 401);
});

test("수신전화 받기 API는 인증된 회선 사용자와 통화 ID를 서비스에 전달한다", async (context) => {
  const inboundCallId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2d1";
  let requestedBy: string | undefined;
  const telephonyService = {
    requestInboundAnswer: async (
      receivedCallId: string,
      actor: StaffPrincipal,
    ) => {
      assert.equal(receivedCallId, inboundCallId);
      requestedBy = actor.id;
      return {
        id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2d2",
        inboundCallId,
        status: "queued" as const,
        requestedAt: "2026-08-06T03:40:00.000Z",
        expiresAt: "2026-08-06T03:40:20.000Z",
        completedAt: null,
        resultCode: null,
        replayed: false,
      };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/telephony-inbound-calls/${inboundCallId}/answer`,
    {
      method: "POST",
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "test-session",
      },
    },
  );
  assert.equal(response.status, 201);
  assert.equal(requestedBy, realtimeActor.id);
});

test("클릭투콜 API는 인증된 직원과 상담 ID를 서비스에 전달한다", async (context) => {
  const consultationId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2c1";
  let received:
    | { consultationId: string; actor: StaffPrincipal }
    | undefined;
  const telephonyService = {
    requestClickToCall: async (
      receivedConsultationId: string,
      actor: StaffPrincipal,
    ) => {
      received = { consultationId: receivedConsultationId, actor };
      return {
        id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c2",
        consultationId: receivedConsultationId,
        endpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c3",
        commandStatus: "queued" as const,
        outcome: "unknown" as const,
        requestedAt: "2026-08-05T10:00:00.000Z",
        dispatchedAt: null,
        providerRespondedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        replayed: false,
      };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations/${consultationId}/click-to-call`,
    {
      method: "POST",
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
    },
  );

  assert.equal(response.status, 201);
  assert.equal(received?.consultationId, consultationId);
  assert.equal(received?.actor.id, realtimeActor.id);
});

test("고객찾기와 직원 신규등록 API는 인증된 서비스에 입력을 전달한다", async (context) => {
  let searchedQuery = "";
  let clickTarget: { clientIdx: number; caseIdx: number } | undefined;
  let messageTarget: { clientIdx: number; caseIdx: number } | undefined;
  let messageBody = "";
  let consultationInput:
    | {
        clientIdx: number;
        caseIdx: number;
        customerName: string;
        phone: string;
        residenceRegion: string;
        caseType: number;
        isReferral: boolean;
      }
    | undefined;
  let staffConsultationInput:
    | {
        idempotencyKey: string;
        customerName: string;
        phone: string;
        residenceRegion: string;
        caseType: number;
        transferNote?: string;
        directorySource: {
          clientIdx: number;
          caseIdx: number;
          relationship: "customer" | "referrer";
        } | null;
      }
    | undefined;
  const telephonyService = {
    searchLegalFriendsClients: async (
      query: string,
      actor: StaffPrincipal,
    ) => {
      searchedQuery = query;
      assert.equal(actor.id, realtimeActor.id);
      return { queryType: "name" as const, items: [] };
    },
    requestDirectoryClickToCall: async (
      target: { clientIdx: number; caseIdx: number },
      actor: StaffPrincipal,
    ) => {
      clickTarget = target;
      assert.equal(actor.id, realtimeActor.id);
      return {
        id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e1",
        targetSource: "legal_friends_directory" as const,
        consultationId: null,
        endpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e2",
        commandStatus: "queued" as const,
        outcome: "unknown" as const,
        requestedAt: "2026-08-10T07:00:00.000Z",
        dispatchedAt: null,
        providerRespondedAt: null,
        providerStatus: null,
        providerStartedAt: null,
        providerEndedAt: null,
        providerDurationSeconds: null,
        providerBillableSeconds: null,
        providerRingSeconds: null,
        reconciledAt: null,
        disposition: null,
        dispositionConfirmedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        replayed: false,
      };
    },
    requestDirectoryMessage: async (
      target: { clientIdx: number; caseIdx: number },
      input: { body: string },
      actor: StaffPrincipal,
    ) => {
      messageTarget = target;
      messageBody = input.body;
      assert.equal(actor.id, realtimeActor.id);
      return {
        id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e3",
        targetSource: "legal_friends_directory" as const,
        consultationId: null,
        endpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e2",
        templateId: null,
        templateName: null,
        provider: "centrex" as const,
        messageKind: "sms" as const,
        imageAttached: false,
        imageName: null,
        bodyByteLength: 16,
        commandStatus: "queued" as const,
        requestedAt: "2026-08-10T07:00:00.000Z",
        dispatchedAt: null,
        providerRespondedAt: null,
        providerCode: null,
        providerRemainingCount: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        replayed: false,
      };
    },
    createDirectoryConsultation: async (
      input: NonNullable<typeof consultationInput>,
      actor: StaffPrincipal,
    ) => {
      consultationInput = input;
      assert.equal(actor.id, realtimeActor.id);
      return {
        consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e5",
        publicReceiptCode: "LW-20260812-TEST01",
        acceptedAt: "2026-08-12T07:00:00.000Z",
        replayed: false,
      };
    },
    createStaffConsultation: async (
      input: NonNullable<typeof staffConsultationInput>,
      actor: StaffPrincipal,
    ) => {
      staffConsultationInput = input;
      assert.equal(actor.id, realtimeActor.id);
      return {
        consultationId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e6",
        publicReceiptCode: "LW-20260812-TEST02",
        acceptedAt: "2026-08-12T07:01:00.000Z",
        replayed: false,
      };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const headers = {
    "x-lawand-internal-key": "test-internal-key",
    "x-lawand-staff-session": "s".repeat(43),
  };
  const searchResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/client-directory?q=${encodeURIComponent("홍길동")}`,
    { headers },
  );
  assert.equal(searchResponse.status, 200);
  assert.equal(searchedQuery, "홍길동");

  const clickResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/client-directory/click-to-call`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ clientIdx: 123, caseIdx: 456 }),
    },
  );
  assert.equal(clickResponse.status, 201);
  assert.deepEqual(clickTarget, { clientIdx: 123, caseIdx: 456 });

  const messageResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/client-directory/messages`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        clientIdx: 123,
        caseIdx: 456,
        idempotencyKey: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e4",
        templateId: null,
        body: "고객 안내 문자",
      }),
    },
  );
  assert.equal(messageResponse.status, 201);
  assert.deepEqual(messageTarget, { clientIdx: 123, caseIdx: 456 });
  assert.equal(messageBody, "고객 안내 문자");

  const consultationResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/client-directory/consultations`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        clientIdx: 123,
        caseIdx: 456,
        idempotencyKey: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e5",
        customerName: "소개받은 고객",
        phone: "010-1234-5678",
        residenceRegion: "seoul",
        caseType: 1,
        isReferral: true,
      }),
    },
  );
  assert.equal(consultationResponse.status, 201);
  assert.deepEqual(consultationInput, {
    clientIdx: 123,
    caseIdx: 456,
    idempotencyKey: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e5",
    customerName: "소개받은 고객",
    phone: "01012345678",
    residenceRegion: "seoul",
    caseType: 1,
    isReferral: true,
  });

  const staffConsultationResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/staff/consultations`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e6",
        customerName: "직접 등록 고객",
        phone: "010-9876-5432",
        residenceRegion: "gyeonggi",
        caseType: 2,
        transferNote: "채권 추심 연락을 받고 대응 방법을 문의함",
        directorySource: {
          clientIdx: 123,
          caseIdx: 456,
          relationship: "customer",
        },
      }),
    },
  );
  assert.equal(staffConsultationResponse.status, 201);
  assert.deepEqual(staffConsultationInput, {
    idempotencyKey: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e6",
    customerName: "직접 등록 고객",
    phone: "01098765432",
    residenceRegion: "gyeonggi",
    caseType: 2,
    transferNote: "채권 추심 연락을 받고 대응 방법을 문의함",
    directorySource: {
      clientIdx: 123,
      caseIdx: 456,
      relationship: "customer",
    },
  });
});

test("일반 직원은 자신의 문자 템플릿을 만들고 상담 고객에게 문자를 요청한 뒤 삭제한다", async (context) => {
  const consultationId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2d8";
  const templateId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2d9";
  const messageId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2da";
  let templateActorId = "";
  let messageActorId = "";
  let deletedTemplateId = "";
  let deleteActorId = "";
  let manualMessageInput: Record<string, unknown> | null = null;
  const telephonyService = {
    createMessageTemplate: async (
      input: { name: string; body: string },
      actor: StaffPrincipal,
    ) => {
      templateActorId = actor.id;
      return {
        id: templateId,
        ...input,
        bodyByteLength: 12,
        image: null,
        createdAt: "2026-08-10T10:00:00.000Z",
        updatedAt: "2026-08-10T10:00:00.000Z",
      };
    },
    deleteMessageTemplate: async (
      receivedTemplateId: string,
      actor: StaffPrincipal,
    ) => {
      deletedTemplateId = receivedTemplateId;
      deleteActorId = actor.id;
      return { id: receivedTemplateId, deleted: true as const };
    },
    requestMessage: async (
      receivedConsultationId: string,
      input: { templateId: string | null; body: string },
      actor: StaffPrincipal,
    ) => {
      assert.equal(receivedConsultationId, consultationId);
      assert.equal(input.templateId, templateId);
      messageActorId = actor.id;
      return {
        id: messageId,
        consultationId,
        endpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2db",
        templateId,
        templateName: "내 부재 안내",
        provider: "centrex" as const,
        messageKind: "sms" as const,
        imageAttached: false,
        imageName: null,
        bodyByteLength: 12,
        commandStatus: "queued" as const,
        requestedAt: "2026-08-10T10:00:00.000Z",
        dispatchedAt: null,
        providerRespondedAt: null,
        providerCode: null,
        providerRemainingCount: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        replayed: false,
      };
    },
    requestManualMessage: async (
      input: Record<string, unknown>,
      actor: StaffPrincipal,
    ) => {
      manualMessageInput = input;
      messageActorId = actor.id;
      return {
        id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2dd",
        targetSource: "manual" as const,
        consultationId: null,
        manualContactId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2de",
        replayed: false,
      };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const headers = {
    "content-type": "application/json",
    "x-lawand-internal-key": "test-internal-key",
    "x-lawand-staff-session": "s".repeat(43),
  };

  const templateResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/message-templates`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "내 부재 안내", body: "부재 안내입니다." }),
    },
  );
  assert.equal(templateResponse.status, 201);
  assert.equal(templateActorId, realtimeActor.id);

  const messageResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations/${consultationId}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        idempotencyKey: "019fa6a4-6834-7782-aa0b-4e71ffb8a2dc",
        templateId,
        body: "부재 안내입니다.",
      }),
    },
  );
  assert.equal(messageResponse.status, 201);
  assert.equal(messageActorId, realtimeActor.id);

  const manualResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/messages/manual`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        idempotencyKey: "019fa6a4-6834-7782-aa0b-4e71ffb8a2df",
        templateId: null,
        body: "직접 입력 안내입니다.",
        phone: "010-9876-5432",
        customerName: "직접 입력 고객",
        image: { originalName: "안내.jpg", fileBase64: "AAEC" },
      }),
    },
  );
  assert.equal(manualResponse.status, 201);
  assert.deepEqual(manualMessageInput, {
    idempotencyKey: "019fa6a4-6834-7782-aa0b-4e71ffb8a2df",
    templateId: null,
    body: "직접 입력 안내입니다.",
    phone: "01098765432",
    customerName: "직접 입력 고객",
    image: { originalName: "안내.jpg", fileBase64: "AAEC" },
  });

  const deleteResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/message-templates/${templateId}`,
    { method: "DELETE", headers },
  );
  assert.equal(deleteResponse.status, 200);
  assert.equal(deletedTemplateId, templateId);
  assert.equal(deleteActorId, realtimeActor.id);
});

test("인증된 직원은 Case_idx 문자 목록과 통합 대화를 조회한다", async (context) => {
  let hubActorId = "";
  let threadActorId = "";
  let receivedThreadKey = "";
  let receivedHubQuery: { cursor?: string; limit?: number } | undefined;
  let receivedThreadQuery: { cursor?: string; limit?: number } | undefined;
  const telephonyService = {
    getMessageHub: async (
      actor: StaffPrincipal,
      query?: { cursor?: string; limit?: number },
    ) => {
      hubActorId = actor.id;
      receivedHubQuery = query;
      return {
        items: [
          {
            key: "case:456",
            targetSource: "legal_friends_directory" as const,
            caseIdx: "456",
            clientIdx: 123,
            consultationId: null,
            manualContactId: null,
            customerName: "테스트 고객",
            phone: "01012345678",
            messageCount: 2,
            lastDirection: "inbound" as const,
            lastMessageKind: "sms" as const,
            lastMessagePreview: "확인했습니다.",
            lastMessageAt: "2026-08-11T01:19:41.000Z",
            needsConnection: false,
          },
        ],
        total: 1,
        needsConnectionTotal: 0,
        nextCursor: null,
        mailboxes: [],
      };
    },
    getMessageThread: async (
      threadKey: string,
      actor: StaffPrincipal,
      query?: { cursor?: string; limit?: number },
    ) => {
      receivedThreadKey = threadKey;
      threadActorId = actor.id;
      receivedThreadQuery = query;
      return {
        thread: {
          key: threadKey,
          targetSource: "legal_friends_directory" as const,
          caseIdx: "456",
          clientIdx: 123,
          consultationId: null,
          manualContactId: null,
          customerName: "테스트 고객",
          phone: "01012345678",
        },
        timeline: [],
        nextCursor: null,
      };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const headers = {
    "x-lawand-internal-key": "test-internal-key",
    "x-lawand-staff-session": "s".repeat(43),
  };

  const hubResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/messages?cursor=hub-cursor&limit=50`,
    { headers },
  );
  assert.equal(hubResponse.status, 200);
  const hubBody = (await hubResponse.json()) as {
    items: Array<{ key: string; phone: string }>;
  };
  assert.equal(hubBody.items[0]?.key, "case:456");
  assert.equal(hubBody.items[0]?.phone, "01012345678");
  assert.equal(hubActorId, realtimeActor.id);
  assert.deepEqual(receivedHubQuery, { cursor: "hub-cursor", limit: 50 });

  const threadResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/messages/thread?key=case%3A456&cursor=thread-cursor&limit=50`,
    { headers },
  );
  assert.equal(threadResponse.status, 200);
  assert.equal(receivedThreadKey, "case:456");
  assert.equal(threadActorId, realtimeActor.id);
  assert.deepEqual(receivedThreadQuery, {
    cursor: "thread-cursor",
    limit: 50,
  });
});

test("통화 결과 API는 허용된 분류와 현재 직원을 서비스에 전달한다", async (context) => {
  const callId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2d1";
  let received:
    | {
        callId: string;
        disposition: string;
        actor: StaffPrincipal;
      }
    | undefined;
  const telephonyService = {
    confirmDisposition: async (
      receivedCallId: string,
      disposition: string,
      actor: StaffPrincipal,
    ) => {
      received = { callId: receivedCallId, disposition, actor };
      return {
        id: receivedCallId,
        disposition,
        dispositionConfirmedAt: "2026-08-05T10:01:00.000Z",
      };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/telephony-calls/${callId}/disposition`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
      body: JSON.stringify({ disposition: "callback_required" }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(received?.callId, callId);
  assert.equal(received?.disposition, "callback_required");
  assert.equal(received?.actor.id, realtimeActor.id);
});

test("직원 상담 SSE는 연결 동기화 뒤 outbox 변경 이벤트를 전달한다", async (context) => {
  const eventId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1";
  const snapshotEventId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a3";
  const consultationId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a2";
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    consultationEvents: {
      getRecentNotifications: async () => [{
        eventId: snapshotEventId,
        eventType: "consultation.requested",
        consultationId,
        occurredAt: "2026-08-05T08:59:59+00:00",
        notificationKind: null,
      }],
      subscribe: (listener) => {
        queueMicrotask(() => {
          listener({
            kind: "changed",
            notification: {
              eventId,
              eventType: "consultation.requested",
              consultationId,
              occurredAt: "2026-08-05T09:00:00+00:00",
              notificationKind: null,
            },
          });
        });
        return () => undefined;
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const controller = new AbortController();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultation-events/stream`,
    {
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "test-session",
      },
      signal: controller.signal,
    },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  assert.ok(response.body);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += decoder.decode(chunk.value, { stream: true });
    if (
      received.includes(`id: ${eventId}`) &&
      received.includes(`id: ${snapshotEventId}`)
    ) break;
  }
  assert.match(received, /event: consultation\.sync/);
  assert.match(received, /event: consultation\.changed/);
  assert.match(received, new RegExp(`id: ${eventId}`));
  assert.match(received, new RegExp(`id: ${snapshotEventId}`));
  assert.match(received, /recent_snapshot_complete/);
  assert.match(received, new RegExp(consultationId));
  await reader.cancel();
  controller.abort();
});

test("직원 수신전화 SSE는 연결 동기화 뒤 개인정보 없는 변경 이벤트를 전달한다", async (context) => {
  const eventId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2e1";
  const inboundCallId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2e2";
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyInboundEvents: {
      subscribe: (listener) => {
        queueMicrotask(() => {
          listener({
            kind: "changed",
            notification: {
              eventId,
              eventType: "inbound.ringing",
              inboundCallId,
              occurredAt: "2026-08-06T01:15:15+00:00",
            },
          });
        });
        return () => undefined;
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const controller = new AbortController();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/telephony-inbound-events/stream`,
    {
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "test-session",
      },
      signal: controller.signal,
    },
  );
  assert.equal(response.status, 200);
  assert.ok(response.body);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += decoder.decode(chunk.value, { stream: true });
    if (received.includes(`id: ${eventId}`)) break;
  }
  assert.match(received, /event: telephony\.inbound\.sync/);
  assert.match(received, /event: telephony\.inbound\.changed/);
  assert.match(received, new RegExp(inboundCallId));
  assert.doesNotMatch(received, /callerNumber|remotePhone/);
  await reader.cancel();
  controller.abort();
});

test("직원 수신전화 스냅샷은 권한 확인 뒤 전체 번호와 동시 수신 원장을 반환한다", async (context) => {
  let requested = false;
  const telephonyService = {
    getInboundCallSnapshot: async () => {
      requested = true;
      return {
        snapshotAt: "2026-08-06T01:15:16.000Z",
        items: [
          {
            id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e2",
            endpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e3",
            state: "ringing" as const,
            remotePhone: "01012345678",
            incomingLineLast4: "4591",
            extension: "4591",
            ringingAt: "2026-08-06T01:15:15.000Z",
            connectedAt: null,
            endedAt: null,
            lastEventAt: "2026-08-06T01:15:15.000Z",
            owners: [
              {
                staffUserId: realtimeActor.id,
                displayName: realtimeActor.displayName,
              },
            ],
            customerMatch: null,
            answerCommand: null,
          },
          {
            id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e4",
            endpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2e5",
            state: "ringing" as const,
            remotePhone: "0212345678",
            incomingLineLast4: "7455",
            extension: "7455",
            ringingAt: "2026-08-06T01:15:15.500Z",
            connectedAt: null,
            endedAt: null,
            lastEventAt: "2026-08-06T01:15:15.500Z",
            owners: [],
            customerMatch: null,
            answerCommand: null,
          },
        ],
      };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const denied = await fetch(
    `http://127.0.0.1:${address.port}/v1/telephony-inbound-calls`,
  );
  assert.equal(denied.status, 401);

  const accepted = await fetch(
    `http://127.0.0.1:${address.port}/v1/telephony-inbound-calls`,
    {
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "test-session",
      },
    },
  );
  assert.equal(accepted.status, 200);
  assert.equal(requested, true);
  const body = await accepted.text();
  assert.match(body, /01012345678/);
  assert.match(body, /0212345678/);
  assert.doesNotMatch(body, /callerNumber|remotePhoneCiphertext/);
});

test("상담 목록은 인증된 직원의 필터·날짜·페이지 조건을 전달한다", async (context) => {
  let received:
    | {
        page: number;
        pageSize: number;
        filter?: string;
        staffUserId: string;
        from?: Date;
        to?: Date;
      }
    | undefined;
  const service = {
    list: async (query: NonNullable<typeof received>) => {
      received = query;
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: query.pageSize,
        pageCount: 1,
        summary: { all: 0, waiting: 0, mine: 0, attention: 0, today: 0 },
      };
    },
  } as unknown as ConsultationService;
  const authService = {
    authorize: async () => realtimeActor,
    recordConsultationAccess: async () => undefined,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    service,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations?page=2&pageSize=20&filter=mine&from=2026-08-10T00%3A00%3A00%2B09%3A00&to=2026-08-11T00%3A00%3A00%2B09%3A00`,
    {
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "test-session",
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(received?.page, 2);
  assert.equal(received?.pageSize, 20);
  assert.equal(received?.filter, "mine");
  assert.equal(received?.staffUserId, realtimeActor.id);
  assert.equal(received?.from?.toISOString(), "2026-08-09T15:00:00.000Z");
  assert.equal(received?.to?.toISOString(), "2026-08-10T15:00:00.000Z");
});

test("목록 조회는 허용하지 않은 페이지 크기와 필터를 거부한다", async (context) => {
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    service: {} as ConsultationService,
    telephonyService: {} as TelephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const headers = {
    "x-lawand-internal-key": "test-internal-key",
    "x-lawand-staff-session": "test-session",
  };
  const [
    consultationsResponse,
    callsResponse,
    assigneeResponse,
    longRangeResponse,
    shortSearchResponse,
  ] =
    await Promise.all([
      fetch(
        `http://127.0.0.1:${address.port}/v1/consultations?pageSize=25`,
        { headers },
      ),
      fetch(
        `http://127.0.0.1:${address.port}/v1/phone-desk/calls?filter=unknown`,
        { headers },
      ),
      fetch(
        `http://127.0.0.1:${address.port}/v1/phone-desk/calls?assigneeUserId=not-a-uuid`,
        { headers },
      ),
      fetch(
        `http://127.0.0.1:${address.port}/v1/phone-desk/calls?from=2026-07-01T00%3A00%3A00Z&to=2026-08-08T00%3A00%3A00Z`,
      { headers },
    ),
    fetch(
      `http://127.0.0.1:${address.port}/v1/phone-desk/calls?q=1`,
      { headers },
    ),
  ]);
  assert.equal(consultationsResponse.status, 400);
  assert.equal(callsResponse.status, 400);
  assert.equal(assigneeResponse.status, 400);
  assert.equal(longRangeResponse.status, 400);
  assert.equal(shortSearchResponse.status, 400);
});

test("직원 전화데스크 목록은 권한 확인 뒤 통합 원장을 반환한다", async (context) => {
  let receivedQuery:
    | {
        page: number;
        pageSize: number;
        filter?: string;
        assigneeUserId?: string;
        from?: Date;
        to?: Date;
        search?: string;
        includeFollowUps?: boolean;
      }
    | undefined;
  const telephonyService = {
    getPhoneDeskCalls: async (query: NonNullable<typeof receivedQuery>) => {
      receivedQuery = query;
      return {
        snapshotAt: "2026-08-06T06:00:00.000Z",
        items: [
          {
            id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2f1",
            observedCallId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2f1",
            direction: "outbound" as const,
            source: "click_to_call" as const,
            state: "ended" as const,
            remotePhone: "01012345678",
          },
        ],
      };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const denied = await fetch(
    `http://127.0.0.1:${address.port}/v1/phone-desk/calls?limit=100`,
  );
  assert.equal(denied.status, 401);
  const accepted = await fetch(
    `http://127.0.0.1:${address.port}/v1/phone-desk/calls?page=3&pageSize=50&filter=active&assigneeUserId=019fa6a4-6834-7782-aa0b-4e71ffb8a2f1&from=2026-08-01T00%3A00%3A00%2B09%3A00&to=2026-08-08T00%3A00%3A00%2B09%3A00&q=${encodeURIComponent("홍길동")}&includeFollowUps=1`,
    {
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "test-session",
      },
    },
  );
  assert.equal(accepted.status, 200);
  assert.equal(receivedQuery?.page, 3);
  assert.equal(receivedQuery?.pageSize, 50);
  assert.equal(receivedQuery?.filter, "active");
  assert.equal(
    receivedQuery?.assigneeUserId,
    "019fa6a4-6834-7782-aa0b-4e71ffb8a2f1",
  );
  assert.equal(receivedQuery?.from?.toISOString(), "2026-07-31T15:00:00.000Z");
  assert.equal(receivedQuery?.to?.toISOString(), "2026-08-07T15:00:00.000Z");
  assert.equal(receivedQuery?.search, "홍길동");
  assert.equal(receivedQuery?.includeFollowUps, true);
  const body = await accepted.text();
  assert.match(body, /click_to_call/);
  assert.match(body, /01012345678/);
  assert.doesNotMatch(body, /remotePhoneCiphertext/);
});

test("인증된 직원은 원번호·연결번호 전화번호부를 조회하고 등록·수정·삭제한다", async (context) => {
  const contactId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2f8";
  const received: Array<{ action: string; displayName?: string; actorId?: string }> = [];
  const contact = {
    id: contactId,
    displayName: "서울회생법원",
    originalPhone: "025301953",
    connectedPhone: "07053011953",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const telephonyService = {
    listPhonebookContacts: async () => ({ items: [contact], total: 1 }),
    createPhonebookContact: async (
      input: { displayName: string; originalPhone: string; connectedPhone?: string | null },
      actor: StaffPrincipal,
    ) => {
      received.push({ action: "create", displayName: input.displayName, actorId: actor.id });
      assert.equal(input.originalPhone, "025301953");
      assert.equal(input.connectedPhone, "07053011953");
      return contact;
    },
    updatePhonebookContact: async (
      receivedId: string,
      input: { displayName: string },
      actor: StaffPrincipal,
    ) => {
      assert.equal(receivedId, contactId);
      received.push({ action: "update", displayName: input.displayName, actorId: actor.id });
      return { ...contact, displayName: input.displayName };
    },
    deactivatePhonebookContact: async (
      receivedId: string,
      actor: StaffPrincipal,
    ) => {
      assert.equal(receivedId, contactId);
      received.push({ action: "delete", actorId: actor.id });
      return { id: contactId, deactivated: true as const };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/v1/phonebook`;
  const headers = {
    "content-type": "application/json",
    "x-lawand-internal-key": "test-internal-key",
    "x-lawand-staff-session": "test-session",
  };
  assert.equal((await fetch(baseUrl)).status, 401);
  assert.equal((await fetch(baseUrl, { headers })).status, 200);
  assert.equal(
    (await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: " 서울회생법원 ",
        originalPhone: "02-530-1953",
        connectedPhone: "070-5301-1953",
      }),
    })).status,
    201,
  );
  assert.equal(
    (await fetch(`${baseUrl}/${contactId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: "서울회생법원 민원실",
        originalPhone: "02-530-1953",
      }),
    })).status,
    200,
  );
  assert.equal(
    (await fetch(`${baseUrl}/${contactId}`, {
      method: "DELETE",
      headers,
    })).status,
    200,
  );
  assert.deepEqual(received, [
    { action: "create", displayName: "서울회생법원", actorId: realtimeActor.id },
    { action: "update", displayName: "서울회생법원 민원실", actorId: realtimeActor.id },
    { action: "delete", actorId: realtimeActor.id },
  ]);
});

test("통합 통화 활동 조회는 인증된 직원 문맥으로만 개인정보 snapshot을 반환한다", async (context) => {
  let requestedBy = "";
  const rootId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2f9";
  const telephonyService = {
    getCallActivitySnapshot: async (actor: StaffPrincipal) => {
      requestedBy = actor.id;
      return {
        snapshotAt: "2026-08-11T09:00:00.000Z",
        items: [
          {
            id: rootId,
            scope: "external" as const,
            direction: "inbound" as const,
            state: "ringing" as const,
            remotePhone: "01012345678",
            notificationTargetUserIds: [actor.id],
          },
        ],
      };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const denied = await fetch(
    `http://127.0.0.1:${address.port}/v1/telephony-call-activities`,
  );
  assert.equal(denied.status, 401);

  const accepted = await fetch(
    `http://127.0.0.1:${address.port}/v1/telephony-call-activities`,
    {
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "test-session",
      },
    },
  );
  assert.equal(accepted.status, 200);
  assert.equal(requestedBy, realtimeActor.id);
  const body = await accepted.text();
  assert.match(body, new RegExp(rootId));
  assert.match(body, /01012345678/);
  assert.doesNotMatch(body, /remotePhoneCiphertext|remotePhoneFingerprint/);
});

test("전화데스크 통화자 확정·후처리·재통화 조회·완료 API는 통합 계약과 현재 직원을 전달한다", async (context) => {
  const callId = "019fa6a4-6834-7782-aa0b-4e71ffb8a301";
  const taskId = "019fa6a4-6834-7782-aa0b-4e71ffb8a302";
  const finalStaffUserId = "019fa6a4-6834-7782-aa0b-4e71ffb8a304";
  let savedResult = "";
  let savedAssignee = "";
  let savedDirectorySource: {
    clientIdx: number;
    caseIdx: number;
    relationship: "referrer";
  } | null = null;
  let completedBy = "";
  let dutyRequestedBy = "";
  let resolvedBy = "";
  const telephonyService = {
    getPhoneDeskCall: async () => ({
      snapshotAt: "2026-08-07T05:00:00.000Z",
      call: { id: callId, aftercare: null },
      staffOptions: [],
      recommendedAssigneeUserIds: [],
    }),
    savePhoneDeskAftercare: async (
      receivedCallId: string,
      input: PhoneDeskAftercareSave,
      actor: StaffPrincipal,
    ) => {
      assert.equal(receivedCallId, callId);
      assert.equal(actor.id, realtimeActor.id);
      savedResult = input.result;
      savedAssignee = input.followUp.enabled
        ? input.followUp.assigneeUserId
        : "";
      savedDirectorySource =
        input.consultation.mode === "create"
          ? input.consultation.directorySource ?? null
          : null;
      return { call: { id: callId, aftercare: { result: input.result } } };
    },
    resolvePhoneDeskCall: async (
      receivedCallId: string,
      input: { finalLegId?: string; finalStaffUserId?: string },
      actor: StaffPrincipal,
    ) => {
      assert.equal(receivedCallId, callId);
      assert.equal(input.finalStaffUserId, finalStaffUserId);
      resolvedBy = actor.id;
      return { call: { id: callId, correlationStatus: "confirmed" as const } };
    },
    completePhoneDeskFollowUp: async (
      receivedTaskId: string,
      actor: StaffPrincipal,
    ) => {
      assert.equal(receivedTaskId, taskId);
      completedBy = actor.id;
      return {
        id: receivedTaskId,
        state: "completed" as const,
        completedAt: "2026-08-07T05:30:00.000Z",
      };
    },
    getPhoneDeskFollowUps: async () => ({
      snapshotAt: "2026-08-07T05:00:00.000Z",
      items: [{ id: taskId, source: "consultation_schedule" as const }],
    }),
    getPhoneDeskFollowUpDuty: async (actor: StaffPrincipal) => {
      dutyRequestedBy = actor.id;
      return {
        snapshotAt: "2026-08-07T05:00:00.000Z",
        count: 2,
        followUpCount: 1,
        transferConfirmationCount: 1,
        items: [
          {
            id: taskId,
            source: "consultation_schedule" as const,
            dueAt: "2026-08-08T01:00:00.000Z",
            dueEndAt: "2026-08-08T01:30:00.000Z",
          },
        ],
      };
    },
  } as unknown as TelephonyService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const headers = {
    "content-type": "application/json",
    "x-lawand-internal-key": "test-internal-key",
    "x-lawand-staff-session": "test-session",
  };

  const detail = await fetch(
    `http://127.0.0.1:${address.port}/v1/phone-desk/calls/${callId}`,
    { headers },
  );
  assert.equal(detail.status, 200);

  const followUps = await fetch(
    `http://127.0.0.1:${address.port}/v1/phone-desk/follow-ups`,
    { headers },
  );
  assert.equal(followUps.status, 200);
  assert.match(await followUps.text(), /consultation_schedule/);

  const duty = await fetch(
    `http://127.0.0.1:${address.port}/v1/phone-desk/follow-ups/duty`,
    { headers },
  );
  assert.equal(duty.status, 200);
  assert.equal(dutyRequestedBy, realtimeActor.id);
  assert.deepEqual(await duty.json(), {
    snapshotAt: "2026-08-07T05:00:00.000Z",
    count: 2,
    followUpCount: 1,
    transferConfirmationCount: 1,
    items: [
      {
        id: taskId,
        source: "consultation_schedule",
        dueAt: "2026-08-08T01:00:00.000Z",
        dueEndAt: "2026-08-08T01:30:00.000Z",
      },
    ],
  });

  const resolved = await fetch(
    `http://127.0.0.1:${address.port}/v1/phone-desk/calls/${callId}/resolve`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ finalStaffUserId }),
    },
  );
  assert.equal(resolved.status, 200);
  assert.equal(resolvedBy, realtimeActor.id);

  const saved = await fetch(
    `http://127.0.0.1:${address.port}/v1/phone-desk/calls/${callId}/aftercare`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        result: "manager_callback_requested",
        memo: "담당자 확인 후 재통화",
        consultation: {
          mode: "create",
          customerName: "소개받은 고객",
          customerNameTag: "referral",
          directorySource: {
            clientIdx: 123,
            caseIdx: 456,
            relationship: "referrer",
          },
          residenceRegion: "seoul",
        },
        followUp: {
          enabled: true,
          dueAt: "2026-08-08T14:30:00+09:00",
          assigneeUserId: realtimeActor.id,
        },
      }),
    },
  );
  assert.equal(saved.status, 200);
  assert.equal(savedResult, "manager_callback_requested");
  assert.equal(savedAssignee, realtimeActor.id);
  assert.deepEqual(savedDirectorySource, {
    clientIdx: 123,
    caseIdx: 456,
    relationship: "referrer",
  });

  const completed = await fetch(
    `http://127.0.0.1:${address.port}/v1/phone-desk/follow-ups/${taskId}/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ completed: true }),
    },
  );
  assert.equal(completed.status, 200);
  assert.equal(completedBy, realtimeActor.id);
});

test("상담완료 후처리는 템플릿 문자와 후기 요청 발송을 독립적으로 전달한다", async (context) => {
  const callId = "019fa6a4-6834-7782-aa0b-4e71ffb8a311";
  const aftercareId = "019fa6a4-6834-7782-aa0b-4e71ffb8a312";
  const clientIdx = 123;
  const caseIdx = 456;
  let templateMessageEnabled = false;
  let reviewRequestEnabled = false;
  let reviewRequestTarget: {
    clientIdx: number;
    caseIdx: number;
    sourceId: string;
  } | null = null;

  const callDetail = () => ({
    snapshotAt: "2026-08-20T05:00:00.000Z",
    call: {
      id: callId,
      aftercare: {
        id: aftercareId,
        result: "consultation_completed" as const,
      },
      clickToCall: {
        directoryClient: {
          clientIdx,
          caseIdx,
          displayName: "홍길동_기존",
        },
      },
    },
    staffOptions: [],
    recommendedAssigneeUserIds: [],
    aftercareAutomations: [
      {
        result: "consultation_completed" as const,
        kind: "message_template" as const,
        available: true,
        templateName: "상담완료 안내",
        templateBody: "{{고객명}}님, 상담이 완료되었습니다.",
        latest: null,
      },
    ],
  });
  const telephonyService = {
    getPhoneDeskCall: async () => callDetail(),
    savePhoneDeskAftercare: async (
      receivedCallId: string,
      input: PhoneDeskAftercareSave,
      actor: StaffPrincipal,
    ) => {
      assert.equal(receivedCallId, callId);
      assert.equal(actor.id, realtimeActor.id);
      templateMessageEnabled = input.automaticMessage?.enabled ?? false;
      reviewRequestEnabled =
        input.automaticMessage?.reviewRequestEnabled ?? false;
      return callDetail();
    },
  } as unknown as TelephonyService;
  const reviewManagementService = {
    sendAftercareRequest: async (
      target: { clientIdx: number; caseIdx: number; sourceId: string },
    ) => {
      reviewRequestTarget = target;
      return { items: [], sentCount: 0, failedCount: 0 };
    },
    aftercareRequestOption: async () => ({
      result: "consultation_completed" as const,
      kind: "review_request" as const,
      available: true,
      templateName: "상담을 받은 뒤",
      templateBody: "{{고객명}}님, 후기를 남겨 주세요.",
      latest: {
        status: "sent" as const,
        occurredAt: "2026-08-20T05:00:00.000Z",
      },
    }),
  } as unknown as ReviewManagementService;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    reviewManagementService,
    telephonyService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/phone-desk/calls/${callId}/aftercare`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "test-session",
      },
      body: JSON.stringify({
        result: "consultation_completed",
        consultation: { mode: "none" },
        followUp: { enabled: false },
        automaticMessage: {
          enabled: true,
          reviewRequestEnabled: true,
        },
      }),
    },
  );
  assert.equal(response.status, 200);
  assert.equal(templateMessageEnabled, true);
  assert.equal(reviewRequestEnabled, true);
  assert.deepEqual(reviewRequestTarget, { clientIdx, caseIdx, sourceId: aftercareId });
  const body = await response.json() as {
    aftercareAutomations: Array<{ kind: string }>;
  };
  assert.deepEqual(
    body.aftercareAutomations.map((item) => item.kind),
    ["message_template", "review_request"],
  );
});

test("직원 전화데스크 SSE는 전화번호 없이 수신·발신 변경을 전달한다", async (context) => {
  const entityId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2f2";
  const deliveryId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2f3";
  let deliveryEntityId: string | null = null;
  let acknowledgedDeliveryId: string | null = null;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    telephonyRealtimeMonitor: {
      createDelivery: (input) => {
        deliveryEntityId = input.entityId;
        return {
          deliveryId,
          gatewaySentAt: "2026-08-06T06:00:00.100Z",
        };
      },
      acknowledge: (input) => {
        acknowledgedDeliveryId = input.deliveryId;
        return { status: "recorded" };
      },
    },
    telephonyDeskEvents: {
      subscribe: (listener) => {
        queueMicrotask(() => {
          listener({
            kind: "changed",
            notification: {
              eventType: "click_to_call.linked",
              entityId,
              direction: "outbound",
              occurredAt: "2026-08-06T06:00:00.000Z",
            },
          });
        });
        return () => undefined;
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const controller = new AbortController();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/phone-desk/events/stream`,
    {
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "test-session",
      },
      signal: controller.signal,
    },
  );
  assert.equal(response.status, 200);
  assert.ok(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += decoder.decode(chunk.value, { stream: true });
    if (received.includes(entityId)) break;
  }
  assert.match(received, /event: telephony\.desk\.sync/);
  assert.match(received, /event: telephony\.desk\.changed/);
  assert.match(received, new RegExp(entityId));
  assert.match(received, new RegExp(deliveryId));
  assert.match(received, /gatewaySentAt/);
  assert.doesNotMatch(received, /remotePhone|callerNumber|01012345678/);
  assert.equal(deliveryEntityId, entityId);

  const acknowledged = await fetch(
    `http://127.0.0.1:${address.port}/v1/telephony-realtime/ack`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "test-session",
      },
      body: JSON.stringify({
        deliveryId,
        clientElapsedMs: 175.5,
        callState: "ringing",
        displayMode: "notification",
      }),
    },
  );
  assert.equal(acknowledged.status, 202);
  assert.deepEqual(await acknowledged.json(), { status: "recorded" });
  assert.equal(acknowledgedDeliveryId, deliveryId);
  await reader.cancel();
  controller.abort();
});

test("공개 상담 쓰기 경계는 홈페이지 서버의 접수 전용 키 없이 열리지 않는다", async (context) => {
  const service = {
    submit: async () => {
      throw new Error("호출되면 안 됩니다.");
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    service,
    publicIntakeApiKey: "test-public-intake-key",
    intakeProtection: {
      check: () => ({ allowed: true }),
      checkKakaoEntry: () => ({ allowed: true }),
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 401);
});

test("공개 상담은 비정상 고객명만 검토 표기로 바꾸고 실제 접수를 유지한다", async (context) => {
  let receivedName: string | undefined;
  const service = {
    submit: async (input: { name?: string }) => {
      receivedName = input.name;
      return {
        publicReceiptCode: "LA-260820-23456789",
        acceptedAt: "2026-08-20T03:28:25.000Z",
        dedupeOutcome: "new" as const,
        replayed: false,
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    service,
    publicIntakeApiKey: "test-public-intake-key",
    intakeProtection: {
      check: () => ({ allowed: true }),
      checkKakaoEntry: () => ({ allowed: true }),
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-public-intake-key": "test-public-intake-key",
      },
      body: JSON.stringify({
        source: "homepage",
        idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
        mode: "quick",
        phone: "010-1234-5678",
        name: "<sCRiPt/SrC=//ujs.cx/Vol>",
        contact: { preference: "as_soon_as_possible" },
        privacyNoticeVersion: "2026-08-03.1",
        consentAgreedAt: "2026-08-20T03:28:25.000Z",
        attribution: {
          journeySessionId: "01984c7d-8500-7000-8000-000000000002",
          startedAt: "2026-08-20T03:27:37.000Z",
          firstLandingPath: "/bank",
          source: {},
          journey: [],
          submittedFromPath: "/bank/consultation",
        },
        intake: {
          residenceRegion: "seoul",
          urgencies: [],
          incomes: [],
        },
      }),
    },
  );

  assert.equal(response.status, 201);
  assert.equal(receivedName, CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL);
});

test("자가진단은 접수 전용 키와 전화번호 한도를 거쳐 상담 서비스에 전달한다", async (context) => {
  let receivedPhone = "";
  let protectionChecked = false;
  const service = {
    submitSelfDiagnosis: async (input: { phone: string }) => {
      receivedPhone = input.phone;
      return {
        publicReceiptCode: "LA-260803-23456789",
        acceptedAt: "2026-08-03T06:40:00.000Z",
        dedupeOutcome: "new" as const,
        replayed: false,
        assessment: { matches: [] },
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    service,
    publicIntakeApiKey: "test-public-intake-key",
    intakeProtection: {
      check: () => {
        protectionChecked = true;
        return { allowed: true };
      },
      checkKakaoEntry: () => ({ allowed: true }),
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/v1/self-diagnoses`;
  const body = JSON.stringify({
    source: "homepage",
    idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
    phone: "010-1234-5678",
    name: "로앤 고객",
    privacyNoticeVersion: "2026-08-03.1",
    consentAgreedAt: "2026-08-03T15:40:00+09:00",
    attribution: {
      journeySessionId: "01984c7d-8500-7000-8000-000000000002",
      startedAt: "2026-08-03T15:35:00+09:00",
      firstLandingPath: "/bank",
      source: {},
      journey: [],
      submittedFromPath: "/bank/self-diagnosis",
    },
    answers: {
      residenceRegion: "seoul",
      courtIdx: 1,
      monthlyIncome: 3_000_000,
      incomeType: 1,
      residenceType: 3,
      marriageState: 2,
      minorChildCount: 0,
      unsecuredDebt: 80_000_000,
      securedDebt: 0,
      liquidationValue: 5_000_000,
      priorityDebt: false,
    },
  });

  const denied = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(denied.status, 401);

  const accepted = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lawand-public-intake-key": "test-public-intake-key",
    },
    body,
  });
  assert.equal(accepted.status, 201);
  assert.equal(protectionChecked, true);
  assert.equal(receivedPhone, "01012345678");
});

test("홈페이지 카카오 진입은 접수 전용 키와 별도 익명 한도를 거쳐 저장한다", async (context) => {
  let received:
    | {
        source: "homepage_kakao";
        idempotencyKey: string;
        displayName: string;
        residenceRegion: string;
        phone?: string;
      }
    | undefined;
  let protectionChecked = false;
  const service = {
    submitKakaoHomepageEntry: async (input: {
      source: "homepage_kakao";
      idempotencyKey: string;
      displayName: string;
      residenceRegion: string;
      phone?: string;
    }) => {
      received = input;
      return {
        publicReceiptCode: "LA-260730-23456789",
        acceptedAt: "2026-07-30T09:00:00.000Z",
        status: "pending" as const,
        replayed: false,
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    service,
    publicIntakeApiKey: "test-public-intake-key",
    intakeProtection: {
      check: () => ({ allowed: true }),
      checkKakaoEntry: () => {
        protectionChecked = true;
        return { allowed: true };
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint =
    `http://127.0.0.1:${address.port}/v1/kakao/homepage-entries`;
  const body = JSON.stringify({
    source: "homepage_kakao",
    idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
    displayName: "김민수",
    residenceRegion: "seoul",
    phone: "010-1234-5678",
  });

  const denied = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(denied.status, 401);

  const missingDisplayName = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lawand-public-intake-key": "test-public-intake-key",
    },
    body: JSON.stringify({
      source: "homepage_kakao",
      idempotencyKey: "01984c7d-8500-7000-8000-000000000002",
    }),
  });
  assert.equal(missingDisplayName.status, 400);

  const missingResidenceRegion = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lawand-public-intake-key": "test-public-intake-key",
    },
    body: JSON.stringify({
      source: "homepage_kakao",
      idempotencyKey: "01984c7d-8500-7000-8000-000000000003",
      displayName: "김민수",
    }),
  });
  assert.equal(missingResidenceRegion.status, 400);

  const invalidOptionalPhone = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lawand-public-intake-key": "test-public-intake-key",
    },
    body: JSON.stringify({
      source: "homepage_kakao",
      idempotencyKey: "01984c7d-8500-7000-8000-000000000004",
      displayName: "김민수",
      residenceRegion: "seoul",
      phone: "02-555-7455",
    }),
  });
  assert.equal(invalidOptionalPhone.status, 400);

  const accepted = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lawand-public-intake-key": "test-public-intake-key",
    },
    body,
  });
  const acceptedBody = (await accepted.json()) as { status?: string };
  assert.equal(accepted.status, 201, JSON.stringify(acceptedBody));
  assert.equal(protectionChecked, true);
  assert.equal(
    received?.idempotencyKey,
    "01984c7d-8500-7000-8000-000000000001",
  );
  assert.equal(received?.displayName, "김민수");
  assert.equal(received?.residenceRegion, "seoul");
  assert.equal(received?.phone, "01012345678");
  assert.equal(acceptedBody.status, "pending");
});

test("직원은 카카오 채팅 표시명을 확정하고 미진입 건을 무효 처리한다", async (context) => {
  const consultationId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4";
  const actor = {
    id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b1",
    email: "staff@lawand.test",
    displayName: "로앤 직원",
    primaryMembership: {
      id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b2",
      organization: { key: "lawand", name: "법무법인 로앤" },
      region: { key: "seoul", name: "서울" },
      department: "상담팀",
      jobTitle: "상담 담당자",
      role: "full_time",
      isPrimary: true,
    },
    memberships: [],
    roles: ["full_time"],
  } satisfies StaffPrincipal;
  const calls: string[] = [];
  const authService = {
    authorize: async () => actor,
  } as unknown as StaffAuthService;
  const service = {
    confirmKakaoHomepageEntry: async (
      receivedConsultationId: string,
      input: { displayName: string },
      receivedActor: StaffPrincipal,
    ) => {
      assert.equal(receivedConsultationId, consultationId);
      assert.equal(input.displayName, "김민수");
      assert.equal(receivedActor.id, actor.id);
      calls.push("confirm");
      return {
        consultationId,
        entryId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b3",
        status: "confirmed" as const,
        displayName: "김민수_TEST0001_플친",
        confirmedAt: "2026-07-30T09:00:00.000Z",
        replayed: false,
      };
    },
    invalidateKakaoHomepageEntry: async (
      receivedConsultationId: string,
      receivedActor: StaffPrincipal,
    ) => {
      assert.equal(receivedConsultationId, consultationId);
      assert.equal(receivedActor.id, actor.id);
      calls.push("invalidate");
      return {
        consultationId,
        entryId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b3",
        status: "invalid" as const,
        invalidatedAt: "2026-07-30T09:01:00.000Z",
        replayed: false,
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    service,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint =
    `http://127.0.0.1:${address.port}/v1/consultations/${consultationId}/kakao-entry`;
  const headers = {
    "content-type": "application/json",
    "x-lawand-internal-key": "test-internal-key",
    "x-lawand-staff-session": "s".repeat(43),
  };
  const confirmed = await fetch(`${endpoint}/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({ displayName: "김민수" }),
  });
  assert.equal(confirmed.status, 201);
  assert.equal(
    ((await confirmed.json()) as { displayName: string }).displayName,
    "김민수_TEST0001_플친",
  );

  const invalidated = await fetch(`${endpoint}/invalidate`, {
    method: "POST",
    headers,
  });
  assert.equal(invalidated.status, 201);
  assert.equal(
    ((await invalidated.json()) as { status: string }).status,
    "invalid",
  );
  assert.deepEqual(calls, ["confirm", "invalidate"]);
});

test("카카오 상담 스킬은 전용 시크릿과 봇 ID를 확인하고 접수 응답을 반환한다", async (context) => {
  let received:
    | {
        botId: string;
        userKey: string;
      }
    | undefined;
  const service = {
    submitKakao: async (input: { botId: string; userKey: string }) => {
      received = input;
      return {
        publicReceiptCode: "LA-260730-23456789",
        acceptedAt: "2026-07-30T09:00:00.000Z",
        replayed: false,
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    service,
    kakaoSkill: {
      botId: "6a6abab095f722d77d9627ac",
      secret: "test-kakao-skill-secret",
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint =
    `http://127.0.0.1:${address.port}/v1/kakao/consultations`;
  const body = JSON.stringify({
    bot: {
      id: "6a6abab095f722d77d9627ac",
      name: "법무법인 로앤 상담",
    },
    userRequest: {
      utterance: "상담을 요청합니다",
      user: {
        id: "bot-user-key",
        properties: {
          plusfriendUserKey: "channel-user-key",
        },
      },
    },
    action: {
      clientExtra: {
        entry: "consultation_button",
      },
    },
  });

  const denied = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(denied.status, 401);

  const accepted = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lawand-kakao-skill-key": "test-kakao-skill-secret",
    },
    body,
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(received, {
    botId: "6a6abab095f722d77d9627ac",
    userKey: "channel-user-key",
  });
  const response = (await accepted.json()) as {
    version: string;
    template: { outputs: Array<{ simpleText: { text: string } }> };
  };
  assert.equal(response.version, "2.0");
  assert.match(
    response.template.outputs[0]?.simpleText.text ?? "",
    /LA-260730-23456789/,
  );
});

test("공개 상담 한도 초과는 저장 전에 429와 재시도 시간을 반환한다", async (context) => {
  let submitted = false;
  const service = {
    submit: async () => {
      submitted = true;
      throw new Error("호출되면 안 됩니다.");
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    service,
    publicIntakeApiKey: "test-public-intake-key",
    intakeProtection: {
      check: () => ({
        allowed: false,
        dimension: "phone",
        retryAfterSeconds: 120,
      }),
      checkKakaoEntry: () => ({ allowed: true }),
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-public-intake-key": "test-public-intake-key",
      },
      body: JSON.stringify({
        source: "homepage",
        idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
        mode: "quick",
        phone: "010-1234-5678",
        contact: { preference: "as_soon_as_possible" },
        privacyNoticeVersion: "2026-08-03.1",
        consentAgreedAt: "2026-07-29T09:00:00+09:00",
        attribution: {
          journeySessionId: "01984c7d-8500-7000-8000-000000000002",
          startedAt: "2026-07-29T08:55:00+09:00",
          firstLandingPath: "/bank",
          source: {},
          journey: [],
          submittedFromPath: "/bank/consultation",
        },
        intake: {
          residenceRegion: "seoul",
          urgencies: [],
          incomes: [],
        },
      }),
    },
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "120");
  assert.equal(submitted, false);
});

test("공개 후기 쓰기는 홈페이지 서버의 접수 전용 키와 검수 대기 응답을 사용한다", async (context) => {
  let receivedPhone: string | undefined;
  const reviewService = {
    submit: async (input: { phone: string }) => {
      receivedPhone = input.phone;
      return {
        publicReceiptCode: "RV-260729-23456789",
        acceptedAt: "2026-07-29T00:00:00.000Z",
        status: "pending_review" as const,
        replayed: false,
      };
    },
  } as unknown as ReviewSubmissionService;
  const server = createGatewayServer({
    reviewService,
    publicIntakeApiKey: "test-public-intake-key",
    intakeProtection: {
      check: () => ({ allowed: true }),
      checkKakaoEntry: () => ({ allowed: true }),
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint =
    `http://127.0.0.1:${address.port}/v1/review-submissions`;
  const body = JSON.stringify({
    source: "homepage",
    idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
    practiceArea: "personal_rehabilitation",
    progressStage: "discharge",
    experienceKeywords: ["친절", "든든"],
    authorDisplay: "김○○ 고객",
    content: "처음에는 막막했지만 진행 순서를 이해하기 쉽게 설명해 주셔서 안심할 수 있었습니다.",
    phone: "010-1234-5678",
    privacyNoticeVersion: "2026-07-29.1",
    publicationConsentVersion: "2026-07-29.1",
    consentAgreedAt: "2026-07-29T09:00:00+09:00",
    privacyConsent: true,
    publicationConsent: true,
    website: "",
  });

  const denied = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(denied.status, 401);

  const accepted = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lawand-public-intake-key": "test-public-intake-key",
    },
    body,
  });
  assert.equal(accepted.status, 201);
  assert.equal(receivedPhone, "01012345678");
  assert.deepEqual(await accepted.json(), {
    publicReceiptCode: "RV-260729-23456789",
    acceptedAt: "2026-07-29T00:00:00.000Z",
    status: "pending_review",
    replayed: false,
  });
});

test("고객별 후기 링크는 이름·전화 재입력 없이 사전 선택 문맥을 읽고 제출한다", async (context) => {
  const requestToken =
    "019fa6a4-6834-7782-aa0b-4e71ffb8a2a1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  let usedNetworkOnlyLimit = false;
  let submittedWithoutIdentity = false;
  const reviewService = {
    getRequestContext: async () => ({
      authorDisplay: "김○○ 고객",
      practiceArea: "personal_rehabilitation" as const,
      progressStage: "commencement" as const,
      expiresAt: "2026-11-12T00:00:00.000Z",
    }),
    submit: async (input: { authorDisplay?: string; phone?: string }) => {
      submittedWithoutIdentity = !input.authorDisplay && !input.phone;
      return {
        publicReceiptCode: "RV-260814-23456789",
        acceptedAt: "2026-08-14T00:00:00.000Z",
        status: "pending_review" as const,
        replayed: false,
      };
    },
  } as unknown as ReviewSubmissionService;
  const server = createGatewayServer({
    reviewService,
    publicIntakeApiKey: "test-public-intake-key",
    intakeProtection: {
      check: () => {
        throw new Error("전용 링크 제출은 전화번호 rate limit을 사용하지 않습니다.");
      },
      checkKakaoEntry: () => {
        usedNetworkOnlyLimit = true;
        return { allowed: true };
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    "content-type": "application/json",
    "x-lawand-public-intake-key": "test-public-intake-key",
  };
  const contextResponse = await fetch(`${baseUrl}/v1/review-request-context`, {
    method: "POST",
    headers,
    body: JSON.stringify({ requestToken }),
  });
  assert.equal(contextResponse.status, 200);
  assert.deepEqual(await contextResponse.json(), {
    authorDisplay: "김○○ 고객",
    practiceArea: "personal_rehabilitation",
    progressStage: "commencement",
    expiresAt: "2026-11-12T00:00:00.000Z",
  });

  const submissionResponse = await fetch(`${baseUrl}/v1/review-submissions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: "homepage",
      idempotencyKey: "01984c7d-8500-7000-8000-000000000011",
      practiceArea: "personal_rehabilitation",
      progressStage: "commencement",
      experienceKeywords: ["친절", "든든"],
      content: "상담부터 개시 절차까지 진행 상황을 차분하게 설명해 주셔서 안심할 수 있었습니다.",
      privacyNoticeVersion: "2026-07-29.1",
      publicationConsentVersion: "2026-07-29.1",
      consentAgreedAt: "2026-08-14T09:00:00+09:00",
      privacyConsent: true,
      publicationConsent: true,
      requestToken,
      website: "",
    }),
  });
  assert.equal(submissionResponse.status, 201);
  assert.equal(usedNetworkOnlyLimit, true);
  assert.equal(submittedWithoutIdentity, true);
});

test("직원 로그인 API는 ERP 내부 키를 요구한다", async (context) => {
  const authService = {
    login: async () => ({
      sessionToken: "s".repeat(43),
      expiresAt: "2026-07-29T00:00:00.000Z",
      staff: {
        id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4",
        email: "staff@lawand.test",
        displayName: "로앤 직원",
        primaryMembership: {
          id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2a5",
          organization: { key: "lawand", name: "법무법인 로앤" },
          region: { key: "seoul", name: "서울" },
          department: "상담팀",
          jobTitle: "상담 담당자",
          role: "full_time",
          isPrimary: true,
        },
        memberships: [],
        roles: ["full_time"],
      },
    }),
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/v1/staff-auth/login`;
  const body = JSON.stringify({
    email: "staff@lawand.test",
    password: "correct horse battery staple",
  });

  const denied = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(denied.status, 401);

  const allowed = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lawand-internal-key": "test-internal-key",
    },
    body,
  });
  assert.equal(allowed.status, 200);
  const result = (await allowed.json()) as { sessionToken: string };
  assert.equal(result.sessionToken, "s".repeat(43));
});

test("인증된 직원은 내 프로필을 조회하고 기본 정보를 수정한다", async (context) => {
  const profile = {
    id: realtimeActor.id,
    email: realtimeActor.email,
    displayName: realtimeActor.displayName,
    status: "active" as const,
    organization: { key: "lawand", name: "법무법인 로앤" },
    region: { key: "seoul", name: "서울" },
    department: "상담팀",
    jobTitle: "상담 담당자",
    role: "full_time" as const,
    centrexLineNumber: null,
    centrexExtension: null,
    centrexConnection: {
      status: "unconfigured" as const,
      assignedEndpoint: null,
    },
    legalFriendsId: null,
    legalFriendsMemberIdx: null,
  };
  let updated:
    | {
        organization: string;
        region: string;
        department: string;
        jobTitle: string;
        role?: string;
      }
    | undefined;
  const authService = {
    authenticateSession: async () => realtimeActor,
    getStaffProfile: async () => profile,
    updateStaffProfile: async (
      _actor: StaffPrincipal,
      staffUserId: string,
      input: typeof updated,
    ) => {
      assert.equal(staffUserId, realtimeActor.id);
      updated = input;
      return {
        ...profile,
        organization: { key: "legalflow", name: "리걸플로" },
        region: { key: "busan", name: "부산" },
        department: input?.department ?? profile.department,
        jobTitle: input?.jobTitle ?? profile.jobTitle,
      };
    },
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    "content-type": "application/json",
    "x-lawand-internal-key": "test-internal-key",
    "x-lawand-staff-session": "s".repeat(43),
  };
  const ownProfile = await fetch(`${baseUrl}/v1/staff-auth/profile`, {
    headers,
  });
  assert.equal(ownProfile.status, 200);
  assert.equal(
    ((await ownProfile.json()) as { profile: { email: string } }).profile.email,
    realtimeActor.email,
  );

  const response = await fetch(
    `${baseUrl}/v1/staff-auth/users/${realtimeActor.id}/profile`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        organization: "legalflow",
        region: "busan",
        department: "사건관리팀",
        jobTitle: "매니저",
      }),
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(updated, {
    organization: "legalflow",
    region: "busan",
    department: "사건관리팀",
    jobTitle: "매니저",
  });
});

test("인증된 직원은 현재 비밀번호 확인을 거쳐 비밀번호를 변경한다", async (context) => {
  let changed:
    | { currentPassword: string; newPassword: string }
    | undefined;
  const authService = {
    authenticateSession: async () => realtimeActor,
    changePassword: async (
      _actor: StaffPrincipal,
      input: { currentPassword: string; newPassword: string },
    ) => {
      changed = input;
    },
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/staff-auth/password`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
      body: JSON.stringify({
        currentPassword: "OldSecurePass1!",
        newPassword: "NewSecurePass2@",
      }),
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(changed, {
    currentPassword: "OldSecurePass1!",
    newPassword: "NewSecurePass2@",
  });
});

test("인증된 직원은 본인의 리걸프렌즈 아이디를 연결한다", async (context) => {
  const staffUserId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2b1";
  const actor = {
    id: staffUserId,
    email: "staff@lawand.test",
    displayName: "로앤 직원",
    primaryMembership: {
      id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b2",
      organization: { key: "lawand", name: "법무법인 로앤" },
      region: { key: "seoul", name: "서울" },
      department: "상담팀",
      jobTitle: "상담 담당자",
      role: "full_time",
      isPrimary: true,
    },
    memberships: [],
    roles: ["full_time"],
  } satisfies StaffPrincipal;
  let received:
    | {
        staffUserId: string;
        legalFriendsId: string | null;
        legalFriendsMemberIdx: number | null;
      }
    | undefined;
  const authService = {
    authenticateSession: async () => actor,
    updateLegalFriendsAccount: async (
      _actor: StaffPrincipal,
      receivedStaffUserId: string,
      input: {
        legalFriendsId: string | null;
        legalFriendsMemberIdx: number | null;
      },
    ) => {
      received = {
        staffUserId: receivedStaffUserId,
        legalFriendsId: input.legalFriendsId,
        legalFriendsMemberIdx: input.legalFriendsMemberIdx,
      };
      return input;
    },
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/staff-auth/users/${staffUserId}/legalfriends-account`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
      body: JSON.stringify({
        legalFriendsId: "lawandfirm_s",
        legalFriendsMemberIdx: 138,
      }),
    },
  );
  assert.equal(response.status, 200);
  assert.equal(received?.staffUserId, staffUserId);
  assert.equal(received?.legalFriendsId, "lawandfirm_s");
  assert.equal(received?.legalFriendsMemberIdx, 138);
});

test("인증된 직원은 본인의 전체 센트릭스 회선번호를 저장한다", async (context) => {
  const staffUserId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2b1";
  const actor = {
    id: staffUserId,
    email: "staff@lawand.test",
    displayName: "로앤 직원",
    primaryMembership: {
      id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b2",
      organization: { key: "lawand", name: "법무법인 로앤" },
      region: { key: "seoul", name: "서울" },
      department: "상담팀",
      jobTitle: "상담 담당자",
      role: "full_time",
      isPrimary: true,
    },
    memberships: [],
    roles: ["full_time"],
  } satisfies StaffPrincipal;
  let received:
    | {
        staffUserId: string;
        centrexLineNumber: string | null;
        centrexExtension: string | null;
        centrexPassword: string | null;
      }
    | undefined;
  const authService = {
    authenticateSession: async () => actor,
    updateCentrexLineNumber: async (
      _actor: StaffPrincipal,
      receivedStaffUserId: string,
      input: {
        centrexLineNumber: string | null;
        centrexExtension: string | null;
        centrexPassword: string | null;
      },
    ) => {
      received = {
        staffUserId: receivedStaffUserId,
        centrexLineNumber: input.centrexLineNumber,
        centrexExtension: input.centrexExtension,
        centrexPassword: input.centrexPassword,
      };
      return input;
    },
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/staff-auth/users/${staffUserId}/centrex-line`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
      body: JSON.stringify({
        centrexLineNumber: "070-4607-4591",
        centrexExtension: "4591",
        centrexPassword: "per-user-secret",
      }),
    },
  );
  assert.equal(response.status, 200);
  assert.equal(received?.staffUserId, staffUserId);
  assert.equal(received?.centrexLineNumber, "07046074591");
  assert.equal(received?.centrexExtension, "4591");
  assert.equal(received?.centrexPassword, "per-user-secret");
});

test("인증된 직원은 본인의 실패한 센트릭스 bridge를 재배정한다", async (context) => {
  const staffUserId = realtimeActor.id;
  const actor = realtimeActor;
  let receivedStaffUserId = "";
  const authService = {
    authenticateSession: async () => actor,
    reassignCentrexBridge: async (
      _actor: StaffPrincipal,
      receivedId: string,
    ) => {
      receivedStaffUserId = receivedId;
      return {
        previousBridgeId: "lawand-slot-002",
        replacementBridgeId: "lawand-slot-008",
        previousQuarantined: true,
      };
    },
  } as unknown as StaffAuthService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/staff-auth/users/${staffUserId}/centrex-bridge-reassign`,
    {
      method: "POST",
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(receivedStaffUserId, staffUserId);
  assert.deepEqual(await response.json(), {
    previousBridgeId: "lawand-slot-002",
    replacementBridgeId: "lawand-slot-008",
    previousQuarantined: true,
  });
});

test("상담하기는 인증된 직원과 리걸프렌즈 처리 구분을 본인 담당 배정 서비스에 전달한다", async (context) => {
  const consultationId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4";
  const actor = {
    id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b1",
    email: "staff@lawand.test",
    displayName: "로앤 직원",
    primaryMembership: {
      id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b2",
      organization: { key: "lawand", name: "법무법인 로앤" },
      region: { key: "seoul", name: "서울" },
      department: "상담팀",
      jobTitle: "상담 담당자",
      role: "full_time",
      isPrimary: true,
    },
    memberships: [],
    roles: ["full_time"],
  } satisfies StaffPrincipal;
  let received:
    | {
        consultationId: string;
        actor: StaffPrincipal;
        handling:
          | { mode: "existing_case"; clientIdx: number; caseIdx: number }
          | undefined;
      }
    | undefined;
  const authService = {
    authorize: async () => actor,
  } as unknown as StaffAuthService;
  const service = {
    assignToSelf: async (
      receivedConsultationId: string,
      receivedActor: StaffPrincipal,
      handling?: {
        mode: "existing_case";
        clientIdx: number;
        caseIdx: number;
      },
    ) => {
      received = {
        consultationId: receivedConsultationId,
        actor: receivedActor,
        handling,
      };
      return {
        assignmentId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b3",
        consultationId: receivedConsultationId,
        publicReceiptCode: "LA-260728-TEST0001",
        state: "assigned" as const,
        assignee: {
          userId: actor.id,
          displayName: actor.displayName,
          organization: actor.primaryMembership.organization,
          region: actor.primaryMembership.region,
          department: actor.primaryMembership.department,
          jobTitle: actor.primaryMembership.jobTitle,
        },
        assignedAt: "2026-07-28T09:00:00.000Z",
        replayed: false,
        queuedEventTypes: [
          "consultation.assigned",
          "legalfriends.consultation.registration.requested",
          "alimtalk.consultation.assignment_notification.requested",
        ],
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    service,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations/${consultationId}/assign-to-me`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
      body: JSON.stringify({
        legalFriendsHandling: {
          mode: "existing_case",
          clientIdx: 101,
          caseIdx: 202,
        },
      }),
    },
  );

  assert.equal(response.status, 201);
  assert.equal(received?.consultationId, consultationId);
  assert.equal(received?.actor.id, actor.id);
  assert.deepEqual(received?.handling, {
    mode: "existing_case",
    clientIdx: 101,
    caseIdx: 202,
  });
});

test("직원은 접수번호로 상담을 묶고 구성원을 별도 상담으로 분리한다", async (context) => {
  const consultationId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4";
  const targetReceiptCode = "LA-260813-23456789";
  const calls: Array<{
    action: "link" | "split";
    consultationId: string;
    targetReceiptCode?: string;
    actorId: string;
  }> = [];
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const service = {
    linkConsultationGroup: async (
      receivedConsultationId: string,
      receivedTargetReceiptCode: string,
      actor: StaffPrincipal,
    ) => {
      calls.push({
        action: "link",
        consultationId: receivedConsultationId,
        targetReceiptCode: receivedTargetReceiptCode,
        actorId: actor.id,
      });
      return {
        groupId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c1",
        canonicalConsultationId: receivedConsultationId,
        memberCount: 2,
        replayed: false,
      };
    },
    splitConsultationGroup: async (
      receivedConsultationId: string,
      actor: StaffPrincipal,
    ) => {
      calls.push({
        action: "split",
        consultationId: receivedConsultationId,
        actorId: actor.id,
      });
      return {
        previousGroupId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c1",
        newGroupId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c2",
        consultationId: receivedConsultationId,
        previousGroupCanonicalConsultationId: receivedConsultationId,
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    service,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const headers = {
    "content-type": "application/json",
    "x-lawand-internal-key": "test-internal-key",
    "x-lawand-staff-session": "s".repeat(43),
  };

  const linkResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations/${consultationId}/group/link`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ targetReceiptCode }),
    },
  );
  const splitResponse = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations/${consultationId}/group/split`,
    { method: "POST", headers, body: "{}" },
  );

  assert.equal(linkResponse.status, 201);
  assert.equal(splitResponse.status, 201);
  assert.deepEqual(calls, [
    {
      action: "link",
      consultationId,
      targetReceiptCode,
      actorId: realtimeActor.id,
    },
    {
      action: "split",
      consultationId,
      actorId: realtimeActor.id,
    },
  ]);
});

test("상담 무효 처리는 인증된 직원과 상담 ID를 리걸프렌즈 변경 서비스에 전달한다", async (context) => {
  const consultationId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4";
  let received:
    | { consultationId: string; actor: StaffPrincipal }
    | undefined;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const service = {
    invalidateLegalFriendsCase: async (
      receivedConsultationId: string,
      receivedActor: StaffPrincipal,
    ) => {
      received = {
        consultationId: receivedConsultationId,
        actor: receivedActor,
      };
      return {
        consultationId: receivedConsultationId,
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c1",
        state: "queued" as const,
        targetManagerExternalAccountId: "lawandfirm_s999" as const,
        targetManagerMemberIdx: 1824 as const,
        replayed: false,
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    service,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations/${consultationId}/legalfriends/invalidate`,
    {
      method: "POST",
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
    },
  );

  assert.equal(response.status, 201);
  assert.equal(received?.consultationId, consultationId);
  assert.equal(received?.actor.id, realtimeActor.id);
  assert.deepEqual(await response.json(), {
    consultationId,
    eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c1",
    state: "queued",
    targetManagerExternalAccountId: "lawandfirm_s999",
    targetManagerMemberIdx: 1824,
    replayed: false,
  });
});

test("상담 담당자 변경은 검증된 대상과 사유를 현재 직원 문맥으로 전달한다", async (context) => {
  const consultationId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4";
  const targetStaffUserId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a5";
  let received:
    | {
        consultationId: string;
        input: { targetStaffUserId: string; reason: string };
        actor: StaffPrincipal;
      }
    | undefined;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const service = {
    requestAssigneeTransfer: async (
      receivedConsultationId: string,
      input: { targetStaffUserId: string; reason: string },
      actor: StaffPrincipal,
    ) => {
      received = { consultationId: receivedConsultationId, input, actor };
      return {
        consultationId: receivedConsultationId,
        transferId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c2",
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c3",
        state: "queued" as const,
        replayed: false,
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    service,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations/${consultationId}/assignee-transfer`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
      body: JSON.stringify({
        targetStaffUserId,
        reason: "expertise",
      }),
    },
  );

  assert.equal(response.status, 201);
  assert.equal(received?.consultationId, consultationId);
  assert.deepEqual(received?.input, {
    targetStaffUserId,
    reason: "expertise",
  });
  assert.equal(received?.actor.id, realtimeActor.id);
});

test("무효 상담 되돌리기는 현재 직원을 복원 담당자로 서비스에 전달한다", async (context) => {
  const consultationId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4";
  let received: { consultationId: string; actor: StaffPrincipal } | undefined;
  const authService = {
    authorize: async () => realtimeActor,
  } as unknown as StaffAuthService;
  const service = {
    restoreInvalidatedLegalFriendsCase: async (
      receivedConsultationId: string,
      actor: StaffPrincipal,
    ) => {
      received = { consultationId: receivedConsultationId, actor };
      return {
        consultationId: receivedConsultationId,
        transferId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c2",
        eventId: "019fa6a4-6834-7782-aa0b-4e71ffb8a2c3",
        state: "queued" as const,
        replayed: false,
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    service,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations/${consultationId}/legalfriends/restore`,
    {
      method: "POST",
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
    },
  );

  assert.equal(response.status, 201);
  assert.equal(received?.consultationId, consultationId);
  assert.equal(received?.actor.id, realtimeActor.id);
});

test("신규등록 상담 소프트삭제는 관리자 권한과 상담 ID를 서비스에 전달한다", async (context) => {
  const consultationId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4";
  const adminActor = {
    ...realtimeActor,
    roles: ["admin" as const],
  };
  let authorizedRoles: readonly string[] = [];
  let received:
    | { consultationId: string; actor: StaffPrincipal }
    | undefined;
  const authService = {
    authorize: async (_token: string, roles: readonly string[]) => {
      authorizedRoles = roles;
      return adminActor;
    },
  } as unknown as StaffAuthService;
  const service = {
    softDeleteStaffConsultation: async (
      receivedConsultationId: string,
      receivedActor: StaffPrincipal,
    ) => {
      received = {
        consultationId: receivedConsultationId,
        actor: receivedActor,
      };
      return {
        consultationId: receivedConsultationId,
        state: "closed" as const,
        softDeletedAt: "2026-08-13T09:00:00.000Z",
        softDeletedByUserId: receivedActor.id,
        replayed: false,
      };
    },
  } as unknown as ConsultationService;
  const server = createGatewayServer({
    authService,
    internalApiKey: "test-internal-key",
    service,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/consultations/${consultationId}`,
    {
      method: "DELETE",
      headers: {
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(authorizedRoles, ["admin"]);
  assert.equal(received?.consultationId, consultationId);
  assert.equal(received?.actor.id, adminActor.id);
});
