#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const projectRoot = resolve(scriptDirectory, "../..");
const profile = process.env.AWS_PROFILE ?? "lawand-prod";
const region = process.env.AWS_REGION ?? "ap-northeast-2";
const stackName = process.env.LAWAND_STACK_NAME ?? "lawand-prod";

function runAws(args, { allowFailure = false } = {}) {
  const result = spawnSync(
    "aws",
    ["--profile", profile, "--region", region, ...args],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.status !== 0 && !allowFailure) {
    throw new Error(result.stderr.trim() || `aws ${args[0]} 실행 실패`);
  }

  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
  };
}

function parseEnv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function secretValue() {
  return randomBytes(32).toString("base64url");
}

function temporaryHost(ip) {
  return `${ip.replaceAll(".", "-")}.sslip.io`;
}

const stack = JSON.parse(
  runAws([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stackName,
    "--query",
    "Stacks[0]",
    "--output",
    "json",
  ]).stdout,
);

if (stack.StackStatus !== "CREATE_COMPLETE" && stack.StackStatus !== "UPDATE_COMPLETE") {
  throw new Error(`CloudFormation 스택이 완료되지 않았습니다: ${stack.StackStatus}`);
}

const outputs = Object.fromEntries(
  stack.Outputs.map(({ OutputKey, OutputValue }) => [OutputKey, OutputValue]),
);
const requiredOutputs = [
  "ArtifactBucketName",
  "DatabaseEndpoint",
  "DatabaseMasterSecretArn",
  "ErpElasticIp",
  "ErpInstanceId",
  "GatewayElasticIp",
  "GatewayInstanceId",
  "GatewayPrivateIp",
  "HomepageElasticIp",
  "HomepageInstanceId",
];

for (const key of requiredOutputs) {
  if (!outputs[key]) throw new Error(`CloudFormation 출력값이 없습니다: ${key}`);
}

const gatewayLocal = parseEnv(resolve(projectRoot, "apps/gateway/.env.local"));
const naverLocal = parseEnv(
  resolve(projectRoot, "apps/gateway/.env.naver.local"),
);

function readExistingSecret(secretId) {
  const result = runAws(
    [
      "secretsmanager",
      "get-secret-value",
      "--secret-id",
      secretId,
      "--query",
      "SecretString",
      "--output",
      "text",
    ],
    { allowFailure: true },
  );
  return result.ok ? JSON.parse(result.stdout) : {};
}

const databaseSecretId = "lawand/prod/database";
const existingDatabase = readExistingSecret(databaseSecretId);
const databaseValues = {
  migratorUsername: "lawand_migrator",
  migratorPassword: existingDatabase.migratorPassword ?? secretValue(),
  appUsername: "lawand_app",
  appPassword: existingDatabase.appPassword ?? secretValue(),
  viewerUsername: "lawand_viewer",
  viewerPassword: existingDatabase.viewerPassword ?? secretValue(),
};

const databaseUrl = (username, password) =>
  `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${outputs.DatabaseEndpoint}:5432/lawand?sslmode=verify-full`;

const databaseSecret = {
  ...databaseValues,
  migrationDatabaseUrl: databaseUrl(
    databaseValues.migratorUsername,
    databaseValues.migratorPassword,
  ),
  appDatabaseUrl: databaseUrl(
    databaseValues.appUsername,
    databaseValues.appPassword,
  ),
  viewerDatabaseUrl: databaseUrl(
    databaseValues.viewerUsername,
    databaseValues.viewerPassword,
  ),
};

const existingGateway = readExistingSecret("lawand/prod/gateway");
const shared = {
  encryptionKey:
    existingGateway.LAWAND_DATA_ENCRYPTION_KEY_V1 ??
    randomBytes(32).toString("base64"),
  hmacKey:
    existingGateway.LAWAND_DATA_HMAC_KEY_V1 ??
    randomBytes(32).toString("base64"),
  internalApiKey:
    existingGateway.LAWAND_INTERNAL_API_KEY ?? secretValue(),
  publicIntakeApiKey:
    existingGateway.LAWAND_PUBLIC_INTAKE_API_KEY ?? secretValue(),
};

const gatewayUrl = `http://${outputs.GatewayPrivateIp}:3022`;
const erpBaseUrl = "https://erp.lawandfirm.com";
const solapiMmsSender = "025557455";
const centrexMessageSenderLine = "07046070588";

const gatewaySecret = {
  ...existingGateway,
  AWS_REGION: region,
  LAWAND_APP_DATABASE_URL: databaseSecret.appDatabaseUrl,
  LAWAND_DB_REQUEST_POOL_MAX:
    existingGateway.LAWAND_DB_REQUEST_POOL_MAX ?? "20",
  LAWAND_DB_LISTENER_POOL_MAX:
    existingGateway.LAWAND_DB_LISTENER_POOL_MAX ?? "4",
  LAWAND_CLOUDWATCH_METRICS_ENABLED:
    existingGateway.LAWAND_CLOUDWATCH_METRICS_ENABLED ?? "true",
  LAWAND_DATA_KEY_VERSION: "v1",
  LAWAND_DATA_ENCRYPTION_KEY_V1: shared.encryptionKey,
  LAWAND_DATA_HMAC_KEY_V1: shared.hmacKey,
  LAWAND_INTERNAL_API_KEY: shared.internalApiKey,
  LAWAND_PUBLIC_INTAKE_API_KEY: shared.publicIntakeApiKey,
  LAWAND_ERP_BASE_URL: erpBaseUrl,
  LAWAND_OUTBOX_WORKER_ENABLED:
    gatewayLocal.LAWAND_OUTBOX_WORKER_ENABLED ?? "true",
  LAWAND_LEGALFRIENDS_API_TOKEN:
    gatewayLocal.LAWAND_LEGALFRIENDS_API_TOKEN ?? "",
  LAWAND_ALIMTALK_WORKER_ENABLED:
    gatewayLocal.LAWAND_ALIMTALK_WORKER_ENABLED ?? "true",
  LAWAND_SOLAPI_API_KEY: gatewayLocal.LAWAND_SOLAPI_API_KEY ?? "",
  LAWAND_SOLAPI_API_SECRET: gatewayLocal.LAWAND_SOLAPI_API_SECRET ?? "",
  LAWAND_SOLAPI_MMS_SENDER: solapiMmsSender,
  LAWAND_CENTREX_MESSAGE_SENDER_LINE: centrexMessageSenderLine,
  LAWAND_SOLAPI_PF_ID: gatewayLocal.LAWAND_SOLAPI_PF_ID ?? "",
  LAWAND_SOLAPI_REQUEST_TEMPLATE_ID:
    gatewayLocal.LAWAND_SOLAPI_REQUEST_TEMPLATE_ID ?? "",
  LAWAND_SOLAPI_ASSIGNMENT_TEMPLATE_ID:
    gatewayLocal.LAWAND_SOLAPI_ASSIGNMENT_TEMPLATE_ID ?? "",
  LAWAND_KAKAO_CHATBOT_BOT_ID:
    gatewayLocal.LAWAND_KAKAO_CHATBOT_BOT_ID ?? "",
  LAWAND_KAKAO_CHATBOT_SKILL_SECRET:
    gatewayLocal.LAWAND_KAKAO_CHATBOT_SKILL_SECRET ?? "",
  LAWAND_NAVER_BOOKING_IMAP_ENABLED:
    naverLocal.LAWAND_NAVER_BOOKING_IMAP_ENABLED ?? "false",
  LAWAND_NAVER_BOOKING_IMAP_USER:
    naverLocal.LAWAND_NAVER_BOOKING_IMAP_USER ?? "",
  LAWAND_NAVER_BOOKING_IMAP_APP_PASSWORD:
    naverLocal.LAWAND_NAVER_BOOKING_IMAP_APP_PASSWORD ?? "",
  LAWAND_NAVER_BOOKING_IMAP_MAILBOX:
    naverLocal.LAWAND_NAVER_BOOKING_IMAP_MAILBOX ?? "네이버예약",
  LAWAND_CENTREX_RING_CALLBACK_ENABLED:
    existingGateway.LAWAND_CENTREX_RING_CALLBACK_ENABLED ?? "false",
  LAWAND_CENTREX_RING_CALLBACK_TOKEN:
    existingGateway.LAWAND_CENTREX_RING_CALLBACK_TOKEN ??
    randomBytes(32).toString("base64url"),
  LAWAND_CENTREX_RING_CALLBACK_HOST: outputs.GatewayElasticIp,
  LAWAND_CENTREX_RING_CALLBACK_PORT: "80",
  LAWAND_CENTREX_INBOUND_HISTORY_POLL_SECONDS:
    existingGateway.LAWAND_CENTREX_INBOUND_HISTORY_POLL_SECONDS ?? "15",
};

const existingHomepage = readExistingSecret("lawand/prod/homepage");
const homepageGa4MeasurementIdRaw =
  process.env.LAWAND_GA4_MEASUREMENT_ID ??
  existingHomepage.LAWAND_GA4_MEASUREMENT_ID;
const homepageGa4MeasurementId = homepageGa4MeasurementIdRaw
  ?.trim()
  .toUpperCase();
if (
  homepageGa4MeasurementId &&
  !/^G-[A-Z0-9]{6,20}$/.test(homepageGa4MeasurementId)
) {
  throw new Error(
    "LAWAND_GA4_MEASUREMENT_ID는 유효한 G- 형식이어야 합니다.",
  );
}
const homepageSecret = {
  LAWAND_APP_DATABASE_URL: databaseSecret.appDatabaseUrl,
  LAWAND_GATEWAY_URL: gatewayUrl,
  LAWAND_PUBLIC_INTAKE_API_KEY: shared.publicIntakeApiKey,
  LAWAND_TRUSTED_PROXY_HOPS: "1",
  ...(homepageGa4MeasurementId
    ? {
        LAWAND_GA4_MEASUREMENT_ID: homepageGa4MeasurementId,
      }
    : {}),
};

const erpSecret = {
  LAWAND_GATEWAY_URL: gatewayUrl,
  LAWAND_INTERNAL_API_KEY: shared.internalApiKey,
  LAWAND_ERP_BASE_URL: erpBaseUrl,
};

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "lawand-production-secrets-"),
);
chmodSync(temporaryDirectory, 0o700);

function upsertSecret(secretId, description, value) {
  const path = join(
    temporaryDirectory,
    `${secretId.replaceAll("/", "-")}.json`,
  );
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  chmodSync(path, 0o600);

  const exists = runAws(
    ["secretsmanager", "describe-secret", "--secret-id", secretId],
    { allowFailure: true },
  ).ok;

  if (exists) {
    runAws([
      "secretsmanager",
      "put-secret-value",
      "--secret-id",
      secretId,
      "--secret-string",
      `file://${path}`,
    ]);
  } else {
    runAws([
      "secretsmanager",
      "create-secret",
      "--name",
      secretId,
      "--description",
      description,
      "--secret-string",
      `file://${path}`,
      "--tags",
      "Key=Project,Value=lawand",
      "Key=Environment,Value=production",
    ]);
  }
}

try {
  upsertSecret(databaseSecretId, "Lawand production PostgreSQL roles", databaseSecret);
  upsertSecret("lawand/prod/gateway", "Lawand production gateway runtime", gatewaySecret);
  upsertSecret("lawand/prod/homepage", "Lawand production homepage runtime", homepageSecret);
  upsertSecret("lawand/prod/erp", "Lawand production ERP runtime", erpSecret);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

const metadata = {
  artifactBucket: outputs.ArtifactBucketName,
  databaseEndpoint: outputs.DatabaseEndpoint,
  databaseMasterSecretArn: outputs.DatabaseMasterSecretArn,
  databaseSecretId,
  homepage: {
    instanceId: outputs.HomepageInstanceId,
    elasticIp: outputs.HomepageElasticIp,
    temporaryHttpsUrl: `https://${temporaryHost(outputs.HomepageElasticIp)}`,
  },
  erp: {
    instanceId: outputs.ErpInstanceId,
    elasticIp: outputs.ErpElasticIp,
    publicHttpsUrl: erpBaseUrl,
    temporaryHttpsUrl: `https://${temporaryHost(outputs.ErpElasticIp)}`,
  },
  gateway: {
    instanceId: outputs.GatewayInstanceId,
    elasticIp: outputs.GatewayElasticIp,
    privateIp: outputs.GatewayPrivateIp,
    temporaryHttpsUrl: `https://${temporaryHost(outputs.GatewayElasticIp)}`,
  },
};

const metadataPath = "/tmp/lawand-production-deployment.json";
writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
chmodSync(metadataPath, 0o600);

console.log("운영 비밀값 4개를 Secrets Manager에 구성했습니다.");
console.log(`비민감 배포 메타데이터: ${metadataPath}`);
