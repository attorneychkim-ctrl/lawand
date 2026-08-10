import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { and, eq, or } from "drizzle-orm";

import { createEventId } from "@lawand/core";
import {
  createDatabaseClient,
  staffAuditLogs,
  staffProfiles,
  staffTelephonyBindings,
  staffUsers,
  telephonyEndpoints,
} from "@lawand/db";

import { createCentrexClient } from "./centrex.js";

const localEnvPath = resolve(process.cwd(), ".env.local");
if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value || value.startsWith("--")) {
    throw new Error(`--${name} 값이 필요합니다.`);
  }
  return value;
}

function digits(name: string, pattern: RegExp): string {
  const value = argument(name).replace(/\D/g, "");
  if (!pattern.test(value)) throw new Error(`--${name} 형식이 올바르지 않습니다.`);
  return value;
}

function credentials(): Readonly<Record<string, string>> {
  const raw = process.env.LAWAND_CENTREX_CREDENTIALS_JSON;
  if (!raw) throw new Error("LAWAND_CENTREX_CREDENTIALS_JSON이 필요합니다.");
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LAWAND_CENTREX_CREDENTIALS_JSON 형식이 올바르지 않습니다.");
  }
  return value as Record<string, string>;
}

const databaseUrl = process.env.LAWAND_APP_DATABASE_URL;
if (!databaseUrl) throw new Error("LAWAND_APP_DATABASE_URL이 필요합니다.");

const staffEmail = argument("staff-email").toLowerCase();
const label = argument("label");
const lineNumber = digits("line-number", /^070[0-9]{8}$/);
const extension = digits("extension", /^[0-9]{2,10}$/);
const apiLoginId = digits("api-login-id", /^[0-9]{8,50}$/);
const credentialKey = argument("credential-key");
if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(credentialKey)) {
  throw new Error("--credential-key 형식이 올바르지 않습니다.");
}
const passwordSha512 = credentials()[credentialKey];
if (!passwordSha512 || !/^[0-9a-fA-F]{128}$/.test(passwordSha512)) {
  throw new Error("선택한 센트릭스 SHA-512 자격증명을 찾지 못했습니다.");
}

const centrex = createCentrexClient();
const verified = await centrex.getUserInfo({ apiLoginId, passwordSha512 });
if (
  verified.lineNumber !== lineNumber ||
  verified.extension !== extension
) {
  throw new Error(
    `센트릭스 계정 검증 결과가 요청 회선과 다릅니다. 확인 결과 ${verified.lineNumber} / 내선 ${verified.extension}`,
  );
}

const database = createDatabaseClient(databaseUrl);
try {
  const linked = await database.db.transaction(async (tx) => {
    const [staff] = await tx
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(
        and(
          eq(staffUsers.email, staffEmail),
          eq(staffUsers.status, "active"),
        ),
      )
      .limit(1);
    if (!staff) throw new Error("활성 직원 계정을 찾지 못했습니다.");

    const existingEndpoints = await tx
      .select({ id: telephonyEndpoints.id })
      .from(telephonyEndpoints)
      .where(
        and(
          eq(telephonyEndpoints.provider, "centrex"),
          or(
            eq(telephonyEndpoints.lineNumber, lineNumber),
            eq(telephonyEndpoints.apiLoginId, apiLoginId),
          ),
        ),
      );
    if (existingEndpoints.length > 1) {
      throw new Error("회선 번호와 API 로그인 ID가 서로 다른 기존 회선에 연결되어 있습니다.");
    }
    const now = new Date();
    const endpointId = existingEndpoints[0]?.id ?? createEventId();
    if (existingEndpoints[0]) {
      await tx
        .update(telephonyEndpoints)
        .set({
          label,
          lineNumber,
          extension,
          apiLoginId,
          credentialKey,
          isActive: true,
          lastAuthSucceededAt: now,
          lastAuthFailedAt: null,
          updatedAt: now,
        })
        .where(eq(telephonyEndpoints.id, endpointId));
    } else {
      await tx.insert(telephonyEndpoints).values({
        id: endpointId,
        provider: "centrex",
        endpointType: "personal",
        label,
        lineNumber,
        extension,
        apiLoginId,
        credentialKey,
        isActive: true,
        lastAuthSucceededAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    await tx
      .update(staffProfiles)
      .set({
        centrexLineNumber: lineNumber,
        centrexExtension: extension,
        updatedAt: now,
      })
      .where(eq(staffProfiles.userId, staff.id));

    await tx
      .update(staffTelephonyBindings)
      .set({ isPrimary: false, updatedAt: now })
      .where(
        and(
          eq(staffTelephonyBindings.staffUserId, staff.id),
          eq(staffTelephonyBindings.isActive, true),
          eq(staffTelephonyBindings.isPrimary, true),
        ),
      );
    const [binding] = await tx
      .select({ id: staffTelephonyBindings.id })
      .from(staffTelephonyBindings)
      .where(
        and(
          eq(staffTelephonyBindings.staffUserId, staff.id),
          eq(staffTelephonyBindings.endpointId, endpointId),
        ),
      )
      .limit(1);
    if (binding) {
      await tx
        .update(staffTelephonyBindings)
        .set({
          isPrimary: true,
          isActive: true,
          assignedAt: now,
          assignedByUserId: staff.id,
          updatedAt: now,
        })
        .where(eq(staffTelephonyBindings.id, binding.id));
    } else {
      await tx.insert(staffTelephonyBindings).values({
        id: createEventId(),
        staffUserId: staff.id,
        endpointId,
        isPrimary: true,
        isActive: true,
        assignedAt: now,
        assignedByUserId: staff.id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await tx.insert(staffAuditLogs).values({
      id: createEventId(),
      actorUserId: staff.id,
      action: "telephony.centrex_endpoint.linked",
      targetType: "telephony_endpoint",
      targetId: endpointId,
      metadata: {
        provider: "centrex",
        lineLast4: lineNumber.slice(-4),
        extension,
        credentialKey,
        source: "userinfo_verified_link_command",
      },
      occurredAt: now,
      createdAt: now,
    });
    return { endpointId, staffUserId: staff.id };
  });
  console.log(
    JSON.stringify({
      status: "linked",
      ...linked,
      lineNumber,
      extension,
    }),
  );
} finally {
  await database.pool.end();
}
