#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = existsSync("/workspace/apps/gateway/dist/config.js")
  ? "/workspace"
  : resolve(fileURLToPath(new URL("..", import.meta.url)));
const load = (path) =>
  import(pathToFileURL(resolve(projectRoot, path)).href);
const { createDatabaseClient } = await load("packages/db/dist/index.js");
const { createCentrexCredentialVault } = await load(
  "apps/gateway/dist/centrex-credential-vault.js",
);
const { readGatewayConfig } = await load("apps/gateway/dist/config.js");
const { createDataProtection } = await load("apps/gateway/dist/crypto.js");

const extension = process.argv[2] ?? "";
const durationSeconds = Number(process.argv[3] ?? "120");
if (!/^[0-9]{2,10}$/.test(extension)) {
  throw new Error("검증할 센트릭스 내선번호가 필요합니다.");
}
if (
  !Number.isInteger(durationSeconds) ||
  durationSeconds < 10 ||
  durationSeconds > 300
) {
  throw new Error("검증 시간은 10~300초여야 합니다.");
}

const config = readGatewayConfig();
const database = createDatabaseClient(config.databaseUrl);
const protection = createDataProtection(config);
const vault = createCentrexCredentialVault({
  db: database.db,
  protection,
  fallbackCredentials: config.centrexCredentials ?? {},
});

try {
  const endpointResult = await database.pool.query(
    `select id, api_login_id, credential_key
       from telephony_endpoints
      where provider = 'centrex'
        and extension = $1
        and is_active = true
      order by updated_at desc
      limit 1`,
    [extension],
  );
  const endpoint = endpointResult.rows[0];
  if (!endpoint) throw new Error("활성 센트릭스 endpoint가 없습니다.");
  const passwordSha512 = await vault.get({
    endpointId: endpoint.id,
    credentialKey: endpoint.credential_key,
  });
  if (!passwordSha512) throw new Error("센트릭스 인증값이 없습니다.");

  let previousKey = "";
  const startedAt = Date.now();
  while (Date.now() - startedAt <= durationSeconds * 1_000) {
    const response = await fetch(
      "https://centrex.uplus.co.kr/RestApi/channelstatus",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          id: endpoint.api_login_id,
          pass: passwordSha512,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body = await response.json();
    const status = body?.DATAS?.STATUS;
    const serialized =
      typeof status === "string" ? status : JSON.stringify(status ?? null);
    const fingerprint = createHash("sha256")
      .update(serialized)
      .digest("hex")
      .slice(0, 16);
    const key = `${response.status}:${body?.SVC_RT}:${fingerprint}`;
    if (key !== previousKey) {
      previousKey = key;
      const digitRuns = serialized.match(/[0-9]+/g) ?? [];
      console.log(
        JSON.stringify({
          elapsedSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
          httpStatus: response.status,
          providerCode: body?.SVC_RT ?? null,
          statusType: Array.isArray(status) ? "array" : typeof status,
          statusLength: serialized.length,
          statusFingerprint: fingerprint,
          digitRuns: digitRuns.map((value) => ({
            length: value.length,
            last4: value.slice(-4),
          })),
          delimiterShape: serialized
            .replace(/[A-Za-z0-9가-힣]/g, "X")
            .slice(0, 400),
        }),
      );
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
} finally {
  await database.pool.end();
}
