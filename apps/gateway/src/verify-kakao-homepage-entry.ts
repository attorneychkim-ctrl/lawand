import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { and, eq, inArray } from "drizzle-orm";

import {
  consultationAssignments,
  consultationAttributions,
  consultationRequests,
  consultationStatusHistory,
  consultations,
  createDatabaseClient,
  kakaoHomepageEntries,
  legalFriendsCaseLinks,
  outboxDeliveryAttempts,
  outboxEvents,
  staffAuditLogs,
  staffMemberships,
  staffOrganizations,
  staffProfiles,
  staffRegions,
  staffUsers,
} from "@lawand/db";

import type { StaffPrincipal } from "./auth.js";
import { readGatewayConfig } from "./config.js";
import { createDataProtection } from "./crypto.js";
import type { LegalFriendsCasePayload } from "./legalfriends.js";
import { createOutboxWorker } from "./outbox-worker.js";
import { createConsultationService } from "./service.js";

const localEnvPath = resolve(process.cwd(), ".env.local");
if (existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath);
}

const config = readGatewayConfig();
const database = createDatabaseClient(config.databaseUrl);
const protection = createDataProtection(config);
const service = createConsultationService({
  db: database.db,
  protection,
});
const consultationIds: string[] = [];

async function cleanup() {
  if (consultationIds.length === 0) return;
  await database.db.transaction(async (tx) => {
    const eventIds = (
      await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(inArray(outboxEvents.aggregateId, consultationIds))
    ).map((event) => event.id);
    if (eventIds.length > 0) {
      await tx
        .delete(outboxDeliveryAttempts)
        .where(inArray(outboxDeliveryAttempts.outboxEventId, eventIds));
    }
    await tx
      .delete(legalFriendsCaseLinks)
      .where(
        inArray(legalFriendsCaseLinks.consultationId, consultationIds),
      );
    await tx
      .delete(outboxEvents)
      .where(inArray(outboxEvents.aggregateId, consultationIds));
    await tx
      .delete(staffAuditLogs)
      .where(
        and(
          eq(staffAuditLogs.targetType, "consultation"),
          inArray(staffAuditLogs.targetId, consultationIds),
        ),
      );
    await tx
      .delete(consultationAssignments)
      .where(
        inArray(consultationAssignments.consultationId, consultationIds),
      );
    await tx
      .delete(consultationStatusHistory)
      .where(
        inArray(consultationStatusHistory.consultationId, consultationIds),
      );
    await tx
      .delete(consultationAttributions)
      .where(
        inArray(consultationAttributions.consultationId, consultationIds),
      );
    await tx
      .delete(kakaoHomepageEntries)
      .where(
        inArray(kakaoHomepageEntries.consultationId, consultationIds),
      );
    await tx
      .delete(consultationRequests)
      .where(inArray(consultationRequests.consultationId, consultationIds));
    await tx
      .delete(consultations)
      .where(inArray(consultations.id, consultationIds));
  });
}

async function verificationActor(): Promise<StaffPrincipal> {
  const [row] = await database.db
    .select({
      userId: staffUsers.id,
      email: staffUsers.email,
      displayName: staffProfiles.displayName,
      membershipId: staffMemberships.id,
      organizationKey: staffOrganizations.key,
      organizationName: staffOrganizations.name,
      regionKey: staffRegions.key,
      regionName: staffRegions.name,
      department: staffMemberships.department,
      jobTitle: staffMemberships.jobTitle,
      role: staffMemberships.role,
      isPrimary: staffMemberships.isPrimary,
    })
    .from(staffUsers)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffUsers.id))
    .innerJoin(
      staffMemberships,
      eq(staffMemberships.userId, staffUsers.id),
    )
    .innerJoin(
      staffOrganizations,
      eq(staffOrganizations.key, staffMemberships.organizationKey),
    )
    .innerJoin(staffRegions, eq(staffRegions.key, staffMemberships.regionKey))
    .where(
      and(
        eq(staffUsers.status, "active"),
        eq(staffMemberships.isPrimary, true),
      ),
    )
    .limit(1);
  assert.ok(row, "카카오 진입 검증에 사용할 활성 직원이 필요합니다.");
  const membership = {
    id: row.membershipId,
    organization: {
      key: row.organizationKey,
      name: row.organizationName,
    },
    region: {
      key: row.regionKey,
      name: row.regionName,
    },
    department: row.department,
    jobTitle: row.jobTitle,
    role: row.role,
    isPrimary: row.isPrimary,
  };
  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    primaryMembership: membership,
    memberships: [membership],
    roles: [row.role],
  };
}

async function consultationByReceipt(publicReceiptCode: string) {
  const [consultation] = await database.db
    .select()
    .from(consultations)
    .where(eq(consultations.publicReceiptCode, publicReceiptCode))
    .limit(1);
  assert.ok(consultation);
  consultationIds.push(consultation.id);
  return consultation;
}

try {
  const actor = await verificationActor();
  const createdCases: LegalFriendsCasePayload[] = [];
  const changedManagers: Array<{ caseIdx: string; memberId: string }> = [];
  let caseSequence = 0;
  const worker = createOutboxWorker({
    db: database.db,
    protection,
    workerId: `kakao-homepage-verification-${randomUUID()}`,
    now: () => new Date(Date.now() + 10_000),
    resolveLegalFriendsAssignee: async (assignmentId, consultationId) => {
      assert.ok(assignmentId);
      assert.ok(consultationId);
      return {
        externalAccountId: "verification-kakao-staff",
        memberIdx: 138,
      };
    },
    legalFriendsClient: {
      createCase: async (payload) => {
        createdCases.push(payload);
        caseSequence += 1;
        return {
          httpStatus: 201,
          caseIdx: `verification-kakao-case-${caseSequence}`,
        };
      },
      changeManager: async (caseIdx, memberId) => {
        changedManagers.push({ caseIdx, memberId });
        return { httpStatus: 200 };
      },
    },
  });
  const idempotencyKey = randomUUID();
  const first = await service.submitKakaoHomepageEntry({
    source: "homepage_kakao",
    idempotencyKey,
    displayName: "김민수",
    residenceRegion: "seoul",
  });
  assert.equal(first.status, "pending");
  assert.equal(first.replayed, false);

  const replay = await service.submitKakaoHomepageEntry({
    source: "homepage_kakao",
    idempotencyKey,
    displayName: "김민수",
    residenceRegion: "seoul",
  });
  assert.equal(replay.publicReceiptCode, first.publicReceiptCode);
  assert.equal(replay.status, "pending");
  assert.equal(replay.replayed, true);

  const consultation = await consultationByReceipt(first.publicReceiptCode);
  assert.equal(consultation.contactChannel, "kakao_channel");
  assert.equal(consultation.phoneFingerprint, null);
  assert.match(
    consultation.anonymousLabel,
    /^카카오_[23456789A-HJ-NP-Z]{8}_플친$/,
  );

  const [request] = await database.db
    .select()
    .from(consultationRequests)
    .where(eq(consultationRequests.consultationId, consultation.id));
  assert.ok(request);
  assert.equal(request.source, "homepage_kakao");
  assert.equal(request.contactChannel, "kakao_channel");
  assert.equal(request.phoneCiphertext, null);
  assert.equal(request.hasProvidedName, true);
  assert.ok(request.nameCiphertext);
  assert.ok(request.nameNonce);
  assert.equal(request.privacyBasis, "customer_initiated_channel_entry");
  assert.equal(request.consentAgreedAt, null);
  assert.equal(
    JSON.parse(
      protection.decrypt(
        {
          ciphertext: request.intakeCiphertext,
          nonce: request.intakeNonce,
          keyVersion: request.intakeKeyVersion,
        },
        `consultation_requests.intake:${request.id}`,
      ),
    ).residenceRegion,
    "seoul",
  );

  const [pendingEntry] = await database.db
    .select()
    .from(kakaoHomepageEntries)
    .where(eq(kakaoHomepageEntries.consultationId, consultation.id));
  assert.ok(pendingEntry);
  assert.equal(pendingEntry.status, "pending");
  assert.equal(pendingEntry.clickCount, 2);

  const pendingDetail = await service.detail(consultation.id);
  assert.ok(pendingDetail);
  assert.equal(pendingDetail.kakaoEntry?.status, "pending");
  assert.match(
    pendingDetail.displayName,
    /^김민수_[23456789A-HJ-NP-Z]{8}_플친$/,
  );
  assert.equal(pendingDetail.requests[0]?.name, "김민수");
  assert.equal(pendingDetail.requests[0]?.phone, null);

  const [encryptedConsultation] = await database.db
    .select({
      ciphertext: consultations.preferredNameCiphertext,
      nonce: consultations.preferredNameNonce,
    })
    .from(consultations)
    .where(eq(consultations.id, consultation.id));
  assert.ok(encryptedConsultation?.ciphertext);
  assert.ok(encryptedConsultation.nonce);
  assert.equal(
    encryptedConsultation.ciphertext.includes(Buffer.from("김민수")),
    false,
  );

  const assignment = await service.assignToSelf(consultation.id, actor);
  assert.deepEqual(assignment.queuedEventTypes, [
    "consultation.kakao_chat.confirmed",
    "consultation.assigned",
    "legalfriends.consultation.registration.requested",
  ]);

  const assignedDetail = await service.detail(consultation.id);
  assert.ok(assignedDetail);
  assert.equal(assignedDetail.kakaoEntry?.status, "confirmed");

  const confirmedEvents = await database.db
    .select({ eventType: outboxEvents.eventType })
    .from(outboxEvents)
    .where(eq(outboxEvents.aggregateId, consultation.id));
  assert.deepEqual(
    confirmedEvents.map((event) => event.eventType).sort(),
    [
      "consultation.assigned",
      "consultation.kakao_chat.confirmed",
      "consultation.requested",
      "legalfriends.consultation.registration.requested",
    ],
  );
  assert.equal(
    confirmedEvents.some((event) =>
      [
        "alimtalk.consultation.request_notification.requested",
        "alimtalk.consultation.assignment_notification.requested",
      ].includes(event.eventType),
    ),
    false,
  );

  const assignedInvalidation = await service.invalidateLegalFriendsCase(
    consultation.id,
    actor,
  );
  assert.equal(assignedInvalidation.state, "queued");
  assert.equal(await worker.runOnce(), true);
  const [assignedCaseLink] = await database.db
    .select()
    .from(legalFriendsCaseLinks)
    .where(eq(legalFriendsCaseLinks.consultationId, consultation.id));
  assert.equal(assignedCaseLink?.caseIdx, "verification-kakao-case-1");
  assert.equal(
    assignedCaseLink?.managerExternalAccountId,
    "verification-kakao-staff",
  );
  assert.deepEqual(createdCases[0], {
    case_type: 1,
    member_idx: 138,
    name: assignedDetail.displayName,
    phone: "010-0000-0000",
    living_place: "서울특별시",
    memo: "접수 방식: 빠른 상담\n남긴 내용: 카카오 채팅방에서 상담 내용을 확인",
  });

  assert.equal(await worker.runOnce(), true);
  assert.deepEqual(changedManagers, [
    {
      caseIdx: "verification-kakao-case-1",
      memberId: "lawandfirm_s999",
    },
  ]);
  const [invalidatedAssignedCaseLink] = await database.db
    .select()
    .from(legalFriendsCaseLinks)
    .where(eq(legalFriendsCaseLinks.consultationId, consultation.id));
  assert.equal(
    invalidatedAssignedCaseLink?.managerExternalAccountId,
    "lawandfirm_s999",
  );

  const invalidReceipt = await service.submitKakaoHomepageEntry({
    source: "homepage_kakao",
    idempotencyKey: randomUUID(),
    displayName: "이탈고객",
    residenceRegion: "gyeonggi",
  });
  const invalidConsultation = await consultationByReceipt(
    invalidReceipt.publicReceiptCode,
  );
  const invalidated = await service.invalidateKakaoHomepageEntry(
    invalidConsultation.id,
    actor,
  );
  assert.equal(invalidated.status, "invalid");
  const invalidDetail = await service.detail(invalidConsultation.id);
  assert.ok(invalidDetail);
  assert.equal(invalidDetail.state, "closed");
  assert.equal(invalidDetail.kakaoEntry?.status, "invalid");
  assert.equal(invalidDetail.assignment, null);
  const invalidEvents = await database.db
    .select({
      eventType: outboxEvents.eventType,
      payload: outboxEvents.payload,
    })
    .from(outboxEvents)
    .where(eq(outboxEvents.aggregateId, invalidConsultation.id));
  const invalidRegistration = invalidEvents.find(
    (event) =>
      event.eventType ===
      "legalfriends.consultation.registration.requested",
  );
  assert.ok(invalidRegistration);
  assert.deepEqual(
    "data" in invalidRegistration.payload
      ? invalidRegistration.payload.data
      : null,
    {
      consultationId: invalidConsultation.id,
      requestId: invalidDetail.requests[0]!.id,
      intakeRef:
        `consultation_requests/${invalidDetail.requests[0]!.id}`,
      registrationTarget: "invalid_manager",
      requestedByUserId: actor.id,
      targetManagerExternalAccountId: "lawandfirm_s999",
      targetManagerMemberIdx: 1824,
    },
  );
  assert.equal(await worker.runOnce(), true);
  const [directInvalidCaseLink] = await database.db
    .select()
    .from(legalFriendsCaseLinks)
    .where(
      eq(legalFriendsCaseLinks.consultationId, invalidConsultation.id),
    );
  assert.equal(directInvalidCaseLink?.caseIdx, "verification-kakao-case-2");
  assert.equal(
    directInvalidCaseLink?.managerExternalAccountId,
    "lawandfirm_s999",
  );
  assert.deepEqual(createdCases[1], {
    case_type: 1,
    member_idx: 1824,
    name: invalidDetail.displayName,
    phone: "010-0000-0000",
    living_place: "경기도",
    memo: "접수 방식: 빠른 상담\n남긴 내용: 카카오 채팅방에서 상담 내용을 확인",
  });

  console.log(
    "홈페이지 카카오 진입 검증 완료: 이름·거주지역 암호화·중복 클릭 1건 유지·가상번호/실제 광역지역 신건 등록·배정 후 무효 담당자 변경·배정 전 무효 담당자 신건 등록·알림톡 차단",
  );
} finally {
  await cleanup();
  await database.pool.end();
}
