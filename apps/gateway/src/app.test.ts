import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createGatewayServer } from "./app.js";
import type { StaffAuthService, StaffPrincipal } from "./auth.js";
import type { ConsultationService } from "./service.js";
import type { ReviewSubmissionService } from "./review-service.js";

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

test("홈페이지 카카오 진입은 접수 전용 키와 별도 익명 한도를 거쳐 저장한다", async (context) => {
  let received:
    | {
        source: "homepage_kakao";
        idempotencyKey: string;
      }
    | undefined;
  let protectionChecked = false;
  const service = {
    submitKakaoHomepageEntry: async (input: {
      source: "homepage_kakao";
      idempotencyKey: string;
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
  assert.equal(
    received?.idempotencyKey,
    "01984c7d-8500-7000-8000-000000000001",
  );
  assert.equal(
    ((await accepted.json()) as { status: string }).status,
    "pending",
  );
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
        privacyNoticeVersion: "2026-07-28.1",
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

test("관리자는 직원의 리걸프렌즈 아이디를 연결한다", async (context) => {
  const staffUserId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4";
  const actor = {
    id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b1",
    email: "admin@lawand.test",
    displayName: "로앤 관리자",
    primaryMembership: {
      id: "019fa6a4-6834-7782-aa0b-4e71ffb8a2b2",
      organization: { key: "lawand", name: "법무법인 로앤" },
      region: { key: "seoul", name: "서울" },
      department: "관리팀",
      jobTitle: "관리자",
      role: "admin",
      isPrimary: true,
    },
    memberships: [],
    roles: ["admin"],
  } satisfies StaffPrincipal;
  let received:
    | {
        staffUserId: string;
        legalFriendsId: string | null;
        legalFriendsMemberIdx: number | null;
      }
    | undefined;
  const authService = {
    authorize: async () => actor,
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

test("상담하기는 인증된 직원을 본인 담당 배정 서비스에 전달한다", async (context) => {
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
    | { consultationId: string; actor: StaffPrincipal }
    | undefined;
  const authService = {
    authorize: async () => actor,
  } as unknown as StaffAuthService;
  const service = {
    assignToSelf: async (
      receivedConsultationId: string,
      receivedActor: StaffPrincipal,
    ) => {
      received = {
        consultationId: receivedConsultationId,
        actor: receivedActor,
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
        "x-lawand-internal-key": "test-internal-key",
        "x-lawand-staff-session": "s".repeat(43),
      },
    },
  );

  assert.equal(response.status, 201);
  assert.equal(received?.consultationId, consultationId);
  assert.equal(received?.actor.id, actor.id);
});
