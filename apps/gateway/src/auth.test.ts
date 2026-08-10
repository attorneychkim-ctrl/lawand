import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageStaff,
  hashStaffPassword,
  resolveStaffCentrexConnectionStatus,
  type StaffPrincipal,
  verifyStaffPassword,
} from "./auth.js";

const staffPrincipal = {
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

test("일반 직원은 본인 정보만, 관리자는 다른 직원 정보도 관리한다", () => {
  const otherStaffId = "019fa6a4-6834-7782-aa0b-4e71ffb8a2a4";
  assert.equal(canManageStaff(staffPrincipal, staffPrincipal.id), true);
  assert.equal(canManageStaff(staffPrincipal, otherStaffId), false);
  assert.equal(
    canManageStaff(
      {
        ...staffPrincipal,
        primaryMembership: {
          ...staffPrincipal.primaryMembership,
          role: "admin",
        },
        roles: ["admin"],
      },
      otherStaffId,
    ),
    true,
  );
});

test("직원 비밀번호는 scrypt 해시로 검증된다", async () => {
  const encoded = await hashStaffPassword("correct horse battery staple");

  assert.match(encoded, /^scrypt\$/);
  assert.equal(
    await verifyStaffPassword("correct horse battery staple", encoded),
    true,
  );
  assert.equal(await verifyStaffPassword("wrong password", encoded), false);
  assert.equal(encoded.includes("correct horse battery staple"), false);
});

test("알 수 없는 비밀번호 해시 형식은 거부한다", async () => {
  assert.equal(await verifyStaffPassword("password", "plain$password"), false);
});

test("직원 센트릭스 상태는 정상·연결 중·실패·오프라인을 구분한다", () => {
  const base = {
    centrexLineNumber: "07046074591",
    centrexExtension: "4591",
    requestedEndpointExists: true,
    assignedEndpointExists: true,
    assignedEndpointMatches: true,
    credentialConfigured: true,
    bridgeExists: true,
    bridgeMatches: true,
    bridgeOnline: true,
    bridgeState: "connected",
    legacyBridgeConfigured: false,
  } as const;

  assert.equal(resolveStaffCentrexConnectionStatus(base), "connected");
  assert.equal(
    resolveStaffCentrexConnectionStatus({
      ...base,
      bridgeState: "provisioning",
    }),
    "bridge_provisioning",
  );
  assert.equal(
    resolveStaffCentrexConnectionStatus({
      ...base,
      bridgeState: "failed",
    }),
    "bridge_failed",
  );
  assert.equal(
    resolveStaffCentrexConnectionStatus({
      ...base,
      bridgeOnline: false,
      bridgeState: "failed",
    }),
    "bridge_offline",
  );
});
