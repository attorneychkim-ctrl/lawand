import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { eq, inArray } from "drizzle-orm";

import { createEventId } from "@lawand/core";
import {
  alimtalkDeliveries,
  consultationAssignments,
  consultationRequests,
  consultations,
  createDatabaseClient,
  outboxDeliveryAttempts,
  outboxEvents,
  staffMemberships,
  staffProfiles,
  staffUsers,
} from "@lawand/db";

import { createAlimtalkOutboxWorker } from "./alimtalk-outbox-worker.js";
import { createDataProtection } from "./crypto.js";
import type { SolapiAlimtalkMessage } from "./solapi.js";

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
const assignmentId = createEventId();
const requestEventId = createEventId();
const assignmentEventId = createEventId();
const staffUserId = createEventId();
const membershipId = createEventId();
const idempotencyKey = createEventId();
// 실제 개발 워커가 동시에 떠 있어도 검증용 row를 선점하지 못하도록 미래 시각을 쓴다.
const currentTime = new Date("2099-07-30T01:30:00.000Z");
const phone = "01012345678";
const deliveredMessages: SolapiAlimtalkMessage[] = [];

const phoneEncrypted = protection.encrypt(
  phone,
  `consultation_requests.phone:${requestId}`,
);
const intakeEncrypted = protection.encrypt(
  JSON.stringify({
    residenceRegion: "seoul",
    urgencies: [],
    incomes: [],
  }),
  `consultation_requests.intake:${requestId}`,
);
const requestPayload = {
  eventId: requestEventId,
  eventType:
    "alimtalk.consultation.request_notification.requested" as const,
  eventVersion: 1 as const,
  occurredAt: currentTime.toISOString(),
  producer: "lawand.gateway" as const,
  correlationId: consultationId,
  data: {
    consultationId,
    requestId,
    intakeRef: `consultation_requests/${requestId}` as const,
    templatePurpose: "consultation_requested" as const,
  },
};
const assignmentPayload = {
  eventId: assignmentEventId,
  eventType:
    "alimtalk.consultation.assignment_notification.requested" as const,
  eventVersion: 1 as const,
  occurredAt: currentTime.toISOString(),
  producer: "lawand.gateway" as const,
  correlationId: consultationId,
  data: {
    consultationId,
    requestId,
    assignmentId,
    assignmentRef:
      `consultation_assignments/${assignmentId}` as const,
    intakeRef: `consultation_requests/${requestId}` as const,
    templatePurpose: "consultation_assigned" as const,
  },
};

try {
  await database.db.insert(staffUsers).values({
    id: staffUserId,
    email: `alimtalk-${staffUserId}@lawand.test`,
    passwordHash: "verification-only",
    status: "active",
    failedLoginCount: 0,
    passwordChangedAt: currentTime,
    createdAt: currentTime,
    updatedAt: currentTime,
  });
  await database.db.insert(staffProfiles).values({
    userId: staffUserId,
    displayName: "알림톡 검증 담당자",
    createdAt: currentTime,
    updatedAt: currentTime,
  });
  await database.db.insert(staffMemberships).values({
    id: membershipId,
    userId: staffUserId,
    organizationKey: "lawand",
    regionKey: "seoul",
    department: "검증",
    jobTitle: "검증 담당자",
    role: "full_time",
    isPrimary: true,
    isActive: true,
    assignedAt: currentTime,
    assignedByUserId: staffUserId,
  });
  await database.db.insert(consultations).values({
    id: consultationId,
    publicReceiptCode: "LA-990730-ALIMTALK",
    state: "assigned",
    phoneFingerprint: protection.fingerprint(phone),
    anonymousLabel: "익명-알림톡검증",
    firstRequestedAt: currentTime,
    lastRequestedAt: currentTime,
    createdAt: currentTime,
    updatedAt: currentTime,
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
    payloadFingerprint: protection.fingerprint({ phone }),
    contactPreference: "as_soon_as_possible",
    privacyNoticeVersion: "verification-only",
    consentAgreedAt: currentTime,
    dedupeOutcome: "new",
    submittedAt: currentTime,
    createdAt: currentTime,
  });
  await database.db.insert(consultationAssignments).values({
    id: assignmentId,
    consultationId,
    assigneeUserId: staffUserId,
    assigneeMembershipId: membershipId,
    assignedByUserId: staffUserId,
    assignmentMethod: "self_claim",
    assignedAt: currentTime,
    createdAt: currentTime,
  });
  await database.db.insert(outboxEvents).values([
    {
      id: requestEventId,
      aggregateType: "consultation",
      aggregateId: consultationId,
      eventType: requestPayload.eventType,
      eventVersion: 1,
      correlationId: consultationId,
      payload: requestPayload,
      status: "pending",
      availableAt: currentTime,
      occurredAt: currentTime,
      createdAt: currentTime,
    },
    {
      id: assignmentEventId,
      aggregateType: "consultation",
      aggregateId: consultationId,
      eventType: assignmentPayload.eventType,
      eventVersion: 1,
      correlationId: consultationId,
      payload: assignmentPayload,
      status: "pending",
      availableAt: currentTime,
      occurredAt: currentTime,
      createdAt: currentTime,
    },
  ]);

  const worker = createAlimtalkOutboxWorker({
    db: database.db,
    protection,
    workerId: "local-alimtalk-verification-worker",
    now: () => currentTime,
    pfId: "KA01PF-verification",
    requestTemplateId: "KA01TP-request-verification",
    assignmentTemplateId: "KA01TP-assignment-verification",
    targetEventIds: [requestEventId, assignmentEventId],
    solapiClient: {
      sendAlimtalk: async (message) => {
        deliveredMessages.push(message);
        const sequence = deliveredMessages.length;
        return {
          httpStatus: 200,
          groupId: `G4V-verification-${sequence}`,
          messageId: `M4V-verification-${sequence}`,
          statusCode: "2000",
        };
      },
    },
  });

  assert.equal(await worker.runOnce(), true);
  assert.equal(await worker.runOnce(), true);
  assert.equal(await worker.runOnce(), false);

  const published = await database.db
    .select()
    .from(outboxEvents)
    .where(inArray(outboxEvents.id, [requestEventId, assignmentEventId]));
  assert.deepEqual(
    published.map((event) => event.status).sort(),
    ["published", "published"],
  );
  assert.deepEqual(
    published.map((event) => event.attempts).sort(),
    [1, 1],
  );

  const deliveries = await database.db
    .select()
    .from(alimtalkDeliveries)
    .where(
      inArray(alimtalkDeliveries.outboxEventId, [
        requestEventId,
        assignmentEventId,
      ]),
    );
  assert.equal(deliveries.length, 2);
  assert.deepEqual(
    deliveries.map((delivery) => delivery.templatePurpose).sort(),
    ["consultation_assigned", "consultation_requested"],
  );
  assert.deepEqual(deliveredMessages[0]?.kakaoOptions.variables, {
    "#{접수번호}": "LA-990730-ALIMTALK",
    "#{접수시각}": "2099년 7월 30일 10:30",
    "#{연락예정}": "가능한 빠른 시간",
  });
  assert.deepEqual(deliveredMessages[1]?.kakaoOptions.variables, {
    "#{접수번호}": "LA-990730-ALIMTALK",
    "#{담당자명}": "알림톡 검증 담당자",
    "#{연락예정}": "가능한 빠른 시간",
  });
  assert.equal(
    deliveredMessages.every(
      (message) => message.kakaoOptions.disableSms === true,
    ),
    true,
  );
  console.log("알림톡 outbox 워커 로컬 통합 검증 완료");
} finally {
  await database.db
    .delete(alimtalkDeliveries)
    .where(
      inArray(alimtalkDeliveries.outboxEventId, [
        requestEventId,
        assignmentEventId,
      ]),
    );
  await database.db
    .delete(outboxDeliveryAttempts)
    .where(
      inArray(outboxDeliveryAttempts.outboxEventId, [
        requestEventId,
        assignmentEventId,
      ]),
    );
  await database.db
    .delete(outboxEvents)
    .where(inArray(outboxEvents.id, [requestEventId, assignmentEventId]));
  await database.db
    .delete(consultationAssignments)
    .where(eq(consultationAssignments.id, assignmentId));
  await database.db
    .delete(consultationRequests)
    .where(eq(consultationRequests.id, requestId));
  await database.db
    .delete(consultations)
    .where(eq(consultations.id, consultationId));
  await database.db
    .delete(staffMemberships)
    .where(eq(staffMemberships.id, membershipId));
  await database.db
    .delete(staffProfiles)
    .where(eq(staffProfiles.userId, staffUserId));
  await database.db
    .delete(staffUsers)
    .where(eq(staffUsers.id, staffUserId));
  await database.pool.end();
}
