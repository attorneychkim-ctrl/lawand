import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { and, eq } from "drizzle-orm";

import { createEventId } from "@lawand/core";
import {
  createDatabaseClient,
  staffAuditLogs,
  telephonyEndpointCredentials,
  telephonyEndpoints,
} from "@lawand/db";

import { createCentrexClient } from "./centrex.js";
import { encryptCentrexCredential } from "./centrex-credential-vault.js";
import { createDataProtection } from "./crypto.js";

const localEnvPath = resolve(process.cwd(), ".env.local");
if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

function lineArgument(): string {
  const index = process.argv.indexOf("--line-number");
  const value = index >= 0 ? process.argv[index + 1]?.replace(/\D/g, "") : "";
  if (!value || !/^070[0-9]{8}$/.test(value)) {
    throw new Error("--line-number에는 등록된 대표 070번호가 필요합니다.");
  }
  return value;
}

async function hiddenPasswordPrompt(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("비밀번호는 대화형 TTY에서만 안전하게 입력할 수 있습니다.");
  }
  process.stdout.write("현재 센트릭스 비밀번호: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolvePassword, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3) {
          cleanup();
          reject(new Error("입력이 취소되었습니다."));
          return;
        }
        if (byte === 13 || byte === 10) {
          cleanup();
          resolvePassword(value);
          return;
        }
        if (byte === 8 || byte === 127) {
          value = value.slice(0, -1);
          continue;
        }
        if (byte >= 32 && byte <= 126 && value.length < 200) {
          value += String.fromCharCode(byte);
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

const databaseUrl = requiredEnvironment("LAWAND_APP_DATABASE_URL");
const protection = createDataProtection({
  encryptionKey: requiredEnvironment("LAWAND_DATA_ENCRYPTION_KEY_V1"),
  hmacKey: requiredEnvironment("LAWAND_DATA_HMAC_KEY_V1"),
  keyVersion: requiredEnvironment("LAWAND_DATA_KEY_VERSION"),
});
const lineNumber = lineArgument();
const password = await hiddenPasswordPrompt();
if (!password) throw new Error("센트릭스 비밀번호가 비어 있습니다.");
const passwordSha512 = createHash("sha512")
  .update(password, "utf8")
  .digest("hex");

const database = createDatabaseClient(databaseUrl);
try {
  const [endpoint] = await database.db
    .select({
      id: telephonyEndpoints.id,
      extension: telephonyEndpoints.extension,
      apiLoginId: telephonyEndpoints.apiLoginId,
      credentialKey: telephonyEndpoints.credentialKey,
    })
    .from(telephonyEndpoints)
    .where(
      and(
        eq(telephonyEndpoints.provider, "centrex"),
        eq(telephonyEndpoints.endpointType, "representative"),
        eq(telephonyEndpoints.lineNumber, lineNumber),
      ),
    )
    .limit(1);
  if (!endpoint) {
    throw new Error("migration에 등록된 대표 문자함을 찾지 못했습니다.");
  }

  const verified = await createCentrexClient().getUserInfo({
    apiLoginId: endpoint.apiLoginId,
    passwordSha512,
  });
  if (
    verified.lineNumber !== lineNumber ||
    verified.extension !== endpoint.extension
  ) {
    throw new Error("센트릭스 확인 결과가 등록된 대표 회선·내선과 다릅니다.");
  }
  const encrypted = encryptCentrexCredential(
    protection,
    endpoint.id,
    passwordSha512,
  );
  const verifiedAt = new Date();
  await database.db.transaction(async (tx) => {
    await tx
      .update(telephonyEndpoints)
      .set({
        isActive: true,
        lastAuthSucceededAt: verifiedAt,
        lastAuthFailedAt: null,
        updatedAt: verifiedAt,
      })
      .where(eq(telephonyEndpoints.id, endpoint.id));
    await tx
      .insert(telephonyEndpointCredentials)
      .values({
        endpointId: endpoint.id,
        passwordSha512Ciphertext: encrypted.ciphertext,
        passwordSha512Nonce: encrypted.nonce,
        passwordSha512KeyVersion: encrypted.keyVersion,
        verifiedAt,
        verifiedByUserId: null,
        createdAt: verifiedAt,
        updatedAt: verifiedAt,
      })
      .onConflictDoUpdate({
        target: telephonyEndpointCredentials.endpointId,
        set: {
          passwordSha512Ciphertext: encrypted.ciphertext,
          passwordSha512Nonce: encrypted.nonce,
          passwordSha512KeyVersion: encrypted.keyVersion,
          verifiedAt,
          verifiedByUserId: null,
          updatedAt: verifiedAt,
        },
      });
    await tx.insert(staffAuditLogs).values({
      id: createEventId(),
      actorUserId: null,
      action: "telephony.representative_message_mailbox.linked",
      targetType: "telephony_endpoint",
      targetId: endpoint.id,
      metadata: {
        provider: "centrex",
        lineLast4: lineNumber.slice(-4),
        extension: endpoint.extension,
        source: "userinfo_verified_representative_link_command",
      },
      occurredAt: verifiedAt,
      createdAt: verifiedAt,
    });
  });
  console.log(
    JSON.stringify({
      status: "linked",
      endpointId: endpoint.id,
      lineLast4: lineNumber.slice(-4),
      extension: endpoint.extension,
    }),
  );
} finally {
  await database.pool.end();
}
