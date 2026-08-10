#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = existsSync("/workspace/apps/gateway/dist/config.js")
  ? "/workspace"
  : resolve(fileURLToPath(new URL("..", import.meta.url)));
const gatewayModule = async (name) =>
  import(
    pathToFileURL(resolve(projectRoot, `apps/gateway/dist/${name}.js`)).href
  );
const { createDatabaseClient } = await import(
  pathToFileURL(resolve(projectRoot, "packages/db/dist/index.js")).href
);
const { createCentrexCredentialVault } = await gatewayModule(
  "centrex-credential-vault",
);
const { readGatewayConfig } = await gatewayModule("config");
const { createDataProtection } = await gatewayModule("crypto");

const extension = process.argv[2] ?? "";
if (!/^[0-9]{2,10}$/.test(extension)) {
  throw new Error("검증할 센트릭스 내선번호가 필요합니다.");
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
    `select id, api_login_id, credential_key, line_number
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

  const request = async (operation) => {
    const response = await fetch(
      `https://centrex.uplus.co.kr/RestApi/${operation}`,
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
        signal: AbortSignal.timeout(20_000),
      },
    );
    const text = await response.text();
    if (text.length > 128 * 1024) throw new Error("응답이 너무 큽니다.");
    return { httpStatus: response.status, body: JSON.parse(text) };
  };

  const [callbackResponse, phoneResponse, channelResponse] = await Promise.all([
    request("getringcallback"),
    request("phonestatus"),
    request("channelstatus"),
  ]);
  const callback = callbackResponse.body?.DATAS?.CALLBACK;
  const callbackParts = typeof callback === "string" ? callback.split("^") : [];
  const configuredPath = callbackParts[3] ?? "";
  const expectedPath = config.centrexRingCallback
    ? `/v1/centrex-ring/${config.centrexRingCallback.token}.html`
    : "";
  const summarizeStatus = (response) => {
    const status = response.body?.DATAS?.STATUS;
    const serialized =
      typeof status === "string" ? status : JSON.stringify(status ?? null);
    return {
      httpStatus: response.httpStatus,
      providerCode: response.body?.SVC_RT ?? null,
      statusType: Array.isArray(status) ? "array" : typeof status,
      statusLength: serialized.length,
      statusFingerprint: createHash("sha256")
        .update(serialized)
        .digest("hex")
        .slice(0, 16),
    };
  };
  console.log(
    JSON.stringify({
      extension,
      lineLast4: String(endpoint.line_number).slice(-4),
      callback: {
        httpStatus: callbackResponse.httpStatus,
        providerCode: callbackResponse.body?.SVC_RT ?? null,
        status: callbackResponse.body?.DATAS?.STATUS ?? null,
        partCount: callbackParts.length,
        lineMatches: callbackParts[1] === endpoint.line_number,
        hostMatches:
          callbackParts[2] === config.centrexRingCallback?.host,
        pathMatches: configuredPath === expectedPath,
        configuredPathLength: configuredPath.length,
        portMatches:
          callbackParts[4] === String(config.centrexRingCallback?.port),
        kind: callbackParts[5] ?? null,
      },
      phone: summarizeStatus(phoneResponse),
      channel: summarizeStatus(channelResponse),
    }),
  );
} finally {
  await database.pool.end();
}
