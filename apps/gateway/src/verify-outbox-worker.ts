import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { eq } from "drizzle-orm";

import {
  createEventId,
  LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
  LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
} from "@lawand/core";
import {
  consultationRequests,
  consultations,
  createDatabaseClient,
  legalFriendsCaseLinks,
  outboxDeliveryAttempts,
  outboxEvents,
} from "@lawand/db";

import { createDataProtection } from "./crypto.js";
import type { LegalFriendsCasePayload } from "./legalfriends.js";
import { createOutboxWorker } from "./outbox-worker.js";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

const database = createDatabaseClient(required("LAWAND_APP_DATABASE_URL"));
const protection = createDataProtection({
  encryptionKey: required("LAWAND_DATA_ENCRYPTION_KEY_V1"),
  hmacKey: required("LAWAND_DATA_HMAC_KEY_V1"),
  keyVersion: required("LAWAND_DATA_KEY_VERSION"),
});

const consultationId = createEventId();
const requestId = createEventId();
const eventId = createEventId();
const invalidationEventId = createEventId();
const assignmentId = createEventId();
const idempotencyKey = createEventId();
const initialTime = new Date("2026-07-29T12:00:00.000Z");
const currentTime = initialTime;
let createCalls = 0;
let changeCalls = 0;
let deliveredPayload: LegalFriendsCasePayload | undefined;
let deliveredManagerChange:
  | { caseIdx: string; memberId: string }
  | undefined;

const phone = "01000000000";
const intake = {
  residenceRegion: "daejeon",
  topic: "개인파산·면책",
  urgencies: ["연체가 시작됐어요"],
  incomes: ["급여소득"],
};
const phoneEncrypted = protection.encrypt(
  phone,
  `consultation_requests.phone:${requestId}`,
);
const intakeEncrypted = protection.encrypt(
  JSON.stringify(intake),
  `consultation_requests.intake:${requestId}`,
);
const payload = {
  eventId,
  eventType: "legalfriends.consultation.registration.requested" as const,
  eventVersion: 1 as const,
  occurredAt: initialTime.toISOString(),
  producer: "lawand.gateway" as const,
  correlationId: consultationId,
  data: {
    consultationId,
    requestId,
    assignmentId,
    assignmentRef: `consultation_assignments/${assignmentId}` as const,
    intakeRef: `consultation_requests/${requestId}` as const,
  },
};

try {
  await database.db.insert(consultations).values({
    id: consultationId,
    publicReceiptCode: "LA-260729-VERIFY01",
    state: "assigned",
    phoneFingerprint: protection.fingerprint(phone),
    anonymousLabel: "익명-검증",
    firstRequestedAt: initialTime,
    lastRequestedAt: initialTime,
    createdAt: initialTime,
    updatedAt: initialTime,
  });
  await database.db.insert(consultationRequests).values({
    id: requestId,
    consultationId,
    source: "homepage",
    idempotencyKey,
    mode: "quick",
    phoneFingerprint: protection.fingerprint(phone),
    phoneCiphertext: phoneEncrypted.ciphertext,
    phoneNonce: phoneEncrypted.nonce,
    phoneKeyVersion: phoneEncrypted.keyVersion,
    hasProvidedName: false,
    intakeCiphertext: intakeEncrypted.ciphertext,
    intakeNonce: intakeEncrypted.nonce,
    intakeKeyVersion: intakeEncrypted.keyVersion,
    payloadFingerprint: protection.fingerprint({ phone, intake }),
    contactPreference: "as_soon_as_possible",
    privacyNoticeVersion: "verification-only",
    consentAgreedAt: initialTime,
    dedupeOutcome: "new",
    submittedAt: initialTime,
    createdAt: initialTime,
  });
  await database.db.insert(outboxEvents).values({
    id: eventId,
    aggregateType: "consultation",
    aggregateId: consultationId,
    eventType: payload.eventType,
    eventVersion: payload.eventVersion,
    correlationId: consultationId,
    payload,
    status: "pending",
    availableAt: initialTime,
    occurredAt: initialTime,
    createdAt: initialTime,
  });

  const worker = createOutboxWorker({
    db: database.db,
    protection,
    workerId: "local-verification-worker",
    now: () => currentTime,
    resolveLegalFriendsAssignee: async () =>
      ({
        externalAccountId: "verification-legalfriends-staff",
        memberIdx: 138,
      }),
    legalFriendsClient: {
      createCase: async (casePayload) => {
        createCalls += 1;
        deliveredPayload = casePayload;
        return { httpStatus: 201, caseIdx: "verification-case-111" };
      },
      changeManager: async (caseIdx, memberId) => {
        changeCalls += 1;
        deliveredManagerChange = { caseIdx, memberId };
        return { httpStatus: 200 };
      },
    },
  });

  assert.equal(await worker.runOnce(), true);
  const [published] = await database.db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.id, eventId));
  assert.equal(published?.status, "published");
  assert.equal(published?.attempts, 1);
  const [createdLink] = await database.db
    .select()
    .from(legalFriendsCaseLinks)
    .where(eq(legalFriendsCaseLinks.consultationId, consultationId));
  assert.equal(createdLink?.caseIdx, "verification-case-111");
  assert.equal(
    createdLink?.managerAssignedAt?.toISOString(),
    initialTime.toISOString(),
  );
  const attempts = await database.db
    .select()
    .from(outboxDeliveryAttempts)
    .where(eq(outboxDeliveryAttempts.outboxEventId, eventId));
  assert.equal(createCalls, 1);
  assert.equal(changeCalls, 0);
  assert.deepEqual(attempts.map((attempt) => attempt.status), ["succeeded"]);
  assert.equal(deliveredPayload?.case_type, 2);
  assert.equal(deliveredPayload?.member_idx, 138);
  assert.equal(deliveredPayload?.phone, "010-0000-0000");
  assert.equal(deliveredPayload?.living_place, "대전광역시");

  const invalidationPayload = {
    eventId: invalidationEventId,
    eventType:
      "legalfriends.consultation.invalidation.requested" as const,
    eventVersion: 1 as const,
    occurredAt: currentTime.toISOString(),
    producer: "lawand.gateway" as const,
    correlationId: consultationId,
    causationId: eventId,
    data: {
      consultationId,
      caseLinkRef: `legalfriends_case_links/${consultationId}` as const,
      requestedByUserId: createEventId(),
      targetManagerExternalAccountId:
        LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
      targetManagerMemberIdx:
        LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
    },
  };
  await database.db.insert(outboxEvents).values({
    id: invalidationEventId,
    aggregateType: "consultation",
    aggregateId: consultationId,
    eventType: invalidationPayload.eventType,
    eventVersion: invalidationPayload.eventVersion,
    correlationId: consultationId,
    causationId: eventId,
    payload: invalidationPayload,
    status: "pending",
    availableAt: currentTime,
    occurredAt: currentTime,
    createdAt: currentTime,
  });
  assert.equal(await worker.runOnce(), true);
  const [invalidatedLink] = await database.db
    .select()
    .from(legalFriendsCaseLinks)
    .where(eq(legalFriendsCaseLinks.consultationId, consultationId));
  const [publishedInvalidation] = await database.db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.id, invalidationEventId));
  assert.equal(publishedInvalidation?.status, "published");
  assert.equal(
    invalidatedLink?.managerExternalAccountId,
    LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
  );
  assert.equal(changeCalls, 1);
  assert.deepEqual(deliveredManagerChange, {
    caseIdx: "verification-case-111",
    memberId: LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
  });
  console.log("outbox 워커 로컬 통합 검증 완료");
} finally {
  await database.db
    .delete(legalFriendsCaseLinks)
    .where(eq(legalFriendsCaseLinks.consultationId, consultationId));
  await database.db
    .delete(outboxDeliveryAttempts)
    .where(eq(outboxDeliveryAttempts.outboxEventId, invalidationEventId));
  await database.db
    .delete(outboxDeliveryAttempts)
    .where(eq(outboxDeliveryAttempts.outboxEventId, eventId));
  await database.db
    .delete(outboxEvents)
    .where(eq(outboxEvents.id, invalidationEventId));
  await database.db.delete(outboxEvents).where(eq(outboxEvents.id, eventId));
  await database.db
    .delete(consultationRequests)
    .where(eq(consultationRequests.id, requestId));
  await database.db
    .delete(consultations)
    .where(eq(consultations.id, consultationId));
  await database.pool.end();
}
