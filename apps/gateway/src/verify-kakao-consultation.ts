import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { and, eq, inArray } from "drizzle-orm";

import {
  consultationAssignments,
  consultationRequests,
  consultationStatusHistory,
  consultations,
  kakaoConsultationContacts,
  outboxEvents,
  staffAuditLogs,
  staffMemberships,
  staffOrganizations,
  staffProfiles,
  staffRegions,
  staffUsers,
} from "@lawand/db";
import { createDatabaseClient } from "@lawand/db";

import type { StaffPrincipal } from "./auth.js";
import { createGatewayServer } from "./app.js";
import { readGatewayConfig } from "./config.js";
import { createDataProtection } from "./crypto.js";
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
assert.ok(config.kakaoSkill, "카카오 챗봇 로컬 설정이 필요합니다.");
const server = createGatewayServer({
  service,
  kakaoSkill: config.kakaoSkill,
});

let consultationId: string | null = null;

async function cleanup() {
  if (!consultationId) return;
  await database.db.transaction(async (tx) => {
    await tx
      .delete(outboxEvents)
      .where(eq(outboxEvents.aggregateId, consultationId!));
    await tx
      .delete(staffAuditLogs)
      .where(
        and(
          eq(staffAuditLogs.targetType, "consultation"),
          eq(staffAuditLogs.targetId, consultationId!),
        ),
      );
    await tx
      .delete(consultationAssignments)
      .where(eq(consultationAssignments.consultationId, consultationId!));
    await tx
      .delete(consultationStatusHistory)
      .where(eq(consultationStatusHistory.consultationId, consultationId!));
    await tx
      .delete(kakaoConsultationContacts)
      .where(eq(kakaoConsultationContacts.consultationId, consultationId!));
    await tx
      .delete(consultationRequests)
      .where(eq(consultationRequests.consultationId, consultationId!));
    await tx
      .delete(consultations)
      .where(eq(consultations.id, consultationId!));
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
    .innerJoin(
      staffRegions,
      eq(staffRegions.key, staffMemberships.regionKey),
    )
    .where(
      and(
        eq(staffUsers.status, "active"),
        eq(staffMemberships.isPrimary, true),
      ),
    )
    .limit(1);
  assert.ok(row, "담당 배정을 검증할 활성 직원이 필요합니다.");
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

try {
  const userKey = `verification-${randomUUID()}`;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint =
    `http://127.0.0.1:${address.port}/v1/kakao/consultations`;
  const requestBody = JSON.stringify({
    bot: {
      id: config.kakaoSkill.botId,
      name: "법무법인 로앤 상담",
    },
    userRequest: {
      utterance: "검증용 상담 요청",
      user: {
        id: userKey,
        properties: {
          plusfriendUserKey: userKey,
        },
      },
    },
  });
  const requestHeaders = {
    "content-type": "application/json",
    "x-lawand-kakao-skill-key": config.kakaoSkill.secret,
  };
  const firstResponse = await fetch(endpoint, {
    method: "POST",
    headers: requestHeaders,
    body: requestBody,
  });
  assert.equal(firstResponse.status, 200);
  const firstBody = (await firstResponse.json()) as {
    template: { outputs: Array<{ simpleText: { text: string } }> };
  };
  const firstText =
    firstBody.template.outputs[0]?.simpleText.text ?? "";
  assert.match(firstText, /정상적으로 접수되었습니다/);
  const publicReceiptCode =
    firstText.match(/LA-\d{6}-[23456789A-HJ-NP-Z]{8}/)?.[0];
  assert.ok(publicReceiptCode);

  const replayResponse = await fetch(endpoint, {
    method: "POST",
    headers: requestHeaders,
    body: requestBody,
  });
  assert.equal(replayResponse.status, 200);
  const replayBody = (await replayResponse.json()) as {
    template: { outputs: Array<{ simpleText: { text: string } }> };
  };
  assert.match(
    replayBody.template.outputs[0]?.simpleText.text ?? "",
    /이미 접수된 상담입니다/,
  );

  const [consultation] = await database.db
    .select()
    .from(consultations)
    .where(eq(consultations.publicReceiptCode, publicReceiptCode))
    .limit(1);
  assert.ok(consultation);
  consultationId = consultation.id;
  assert.equal(consultation.contactChannel, "kakao_channel");
  assert.equal(consultation.phoneFingerprint, null);
  assert.match(consultation.anonymousLabel, /^카카오_[23456789A-HJ-NP-Z]{8}_플친$/);

  const requests = await database.db
    .select()
    .from(consultationRequests)
    .where(eq(consultationRequests.consultationId, consultation.id));
  assert.equal(requests.length, 1);
  const request = requests[0]!;
  assert.equal(request.source, "kakao_channel");
  assert.equal(request.contactChannel, "kakao_channel");
  assert.equal(request.phoneCiphertext, null);
  assert.equal(request.consentAgreedAt, null);
  assert.equal(request.privacyBasis, "customer_initiated_channel_message");

  const actor = await verificationActor();
  const assignment = await service.assignToSelf(consultation.id, actor);
  assert.deepEqual(assignment.queuedEventTypes, ["consultation.assigned"]);

  const events = await database.db
    .select({ eventType: outboxEvents.eventType })
    .from(outboxEvents)
    .where(eq(outboxEvents.aggregateId, consultation.id));
  assert.deepEqual(
    events.map((event) => event.eventType).sort(),
    ["consultation.assigned", "consultation.requested"],
  );
  assert.equal(
    events.some((event) =>
      [
        "legalfriends.consultation.registration.requested",
        "alimtalk.consultation.request_notification.requested",
        "alimtalk.consultation.assignment_notification.requested",
      ].includes(event.eventType),
    ),
    false,
  );

  const contactRows = await database.db
    .select()
    .from(kakaoConsultationContacts)
    .where(
      inArray(kakaoConsultationContacts.consultationId, [
        consultation.id,
      ]),
    );
  assert.equal(contactRows.length, 1);
  console.log(
    "카카오 상담 검증 완료: 1회 접수·동일 사용자 재사용·전화번호 미저장·외부 연동 차단",
  );
} finally {
  server.close();
  await cleanup();
  await database.pool.end();
}
