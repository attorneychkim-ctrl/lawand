import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import {
  createDatabaseClient,
  staffTelephonyBridgeAssignments,
  staffUsers,
} from "@lawand/db";

import { createCentrexBridgeProvisioningService } from "./centrex-bridge-provisioning.js";

const connectionString = process.env.LAWAND_APP_DATABASE_URL;
if (!connectionString) {
  throw new Error("LAWAND_APP_DATABASE_URL 환경변수가 필요합니다.");
}

const database = createDatabaseClient(connectionString);
const prefix = `verify-pool-${randomBytes(5).toString("hex")}`;
const bridgeIds = [`${prefix}-01`, `${prefix}-02`];
const keys = Object.fromEntries(
  bridgeIds.map((bridgeId) => [
    bridgeId,
    { endpointId: randomUUID(), secret: randomBytes(32) },
  ]),
);
const service = createCentrexBridgeProvisioningService({
  db: database.db,
  keys,
  onlineSlotWindowMs: 60_000,
});

try {
  const [staff] = await database.db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(eq(staffUsers.status, "active"))
    .limit(1);
  assert.ok(staff, "활성 로컬 직원 한 명이 필요합니다.");

  await service.start();
  for (const bridgeId of bridgeIds) {
    const command = await service.poll({
      bridgeId,
      endpointId: keys[bridgeId]!.endpointId,
      authenticationNonceHash: randomBytes(32),
    });
    assert.equal(command, null);
    assert.equal(service.isReadyForTelephony(bridgeId), false);
  }

  const [first, second] = await Promise.all([
    service.ensureAssignmentForStaff(staff.id, staff.id),
    service.ensureAssignmentForStaff(staff.id, staff.id),
  ]);
  assert.equal(first.assignment.bridgeId, second.assignment.bridgeId);
  assert.equal(
    Number(first.newlyAssigned) + Number(second.newlyAssigned),
    1,
  );

  const assignments = await database.db
    .select({
      bridgeId: staffTelephonyBridgeAssignments.bridgeId,
      staffUserId: staffTelephonyBridgeAssignments.staffUserId,
      state: staffTelephonyBridgeAssignments.state,
    })
    .from(staffTelephonyBridgeAssignments)
    .where(
      and(
        eq(staffTelephonyBridgeAssignments.isActive, true),
        inArray(staffTelephonyBridgeAssignments.bridgeId, bridgeIds),
      ),
    );
  assert.equal(assignments.length, 2);
  assert.equal(
    assignments.filter(({ staffUserId }) => staffUserId === staff.id).length,
    1,
  );
  assert.equal(
    assignments.filter(({ state }) => state === "idle").length,
    1,
  );

  const released = await service.releaseNewAssignment({
    staffUserId: staff.id,
    bridgeId: first.assignment.bridgeId,
  });
  assert.equal(released, true);
  console.log(
    JSON.stringify({
      status: "ok",
      slots: assignments.length,
      claimed: 1,
      duplicateClaims: 0,
    }),
  );
} finally {
  service.stop();
  await database.db
    .delete(staffTelephonyBridgeAssignments)
    .where(inArray(staffTelephonyBridgeAssignments.bridgeId, bridgeIds));
  await database.pool.end();
}
