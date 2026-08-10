import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function requiredArgument(index, label) {
  const value = process.argv[index]?.trim();
  if (!value) throw new Error(`${label} 인수가 필요합니다.`);
  return value;
}

function runAws(arguments_, options = {}) {
  const result = spawnSync("aws", arguments_, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `AWS CLI 실행에 실패했습니다: ${result.stderr?.trim() || "unknown"}`,
    );
  }
  return result.stdout.trim();
}

async function runAwsWithSecretPipe(arguments_, secretValue) {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "lawand-centrex-registry-"),
  );
  const pipePath = join(temporaryDirectory, "secret.pipe");
  try {
    const fifo = spawnSync("mkfifo", ["--mode=600", pipePath], {
      encoding: "utf8",
    });
    if (fifo.status !== 0) {
      throw new Error(`비밀값 FIFO 생성에 실패했습니다: ${fifo.stderr.trim()}`);
    }
    const child = spawn(
      "aws",
      [...arguments_, "--secret-string", `file://${pipePath}`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const exit = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code));
    });
    await writeFile(pipePath, secretValue, { encoding: "utf8" });
    const code = await exit;
    if (code !== 0) {
      throw new Error(
        `AWS CLI 실행에 실패했습니다: ${stderr.trim() || "unknown"}`,
      );
    }
    return stdout.trim();
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const sourceSecretId = requiredArgument(2, "기존 bridge secret ID");
const registrySecretName = requiredArgument(3, "registry secret 이름");
const slotCount = Number(requiredArgument(4, "slot 수"));
const slotPrefix = process.argv[5]?.trim() || "lawand-slot-";
const region = process.env.AWS_REGION?.trim() || "ap-northeast-2";

if (!/^lawand\/[A-Za-z0-9/_-]{3,180}$/.test(sourceSecretId)) {
  throw new Error("기존 bridge secret ID 형식이 올바르지 않습니다.");
}
if (!/^lawand\/[A-Za-z0-9/_-]{3,180}$/.test(registrySecretName)) {
  throw new Error("registry secret 이름 형식이 올바르지 않습니다.");
}
if (!Number.isInteger(slotCount) || slotCount < 1 || slotCount > 200) {
  throw new Error("slot 수는 1부터 200 사이 정수여야 합니다.");
}
if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,60}$/.test(slotPrefix)) {
  throw new Error("slot prefix 형식이 올바르지 않습니다.");
}

const sourceRaw = runAws([
  "secretsmanager",
  "get-secret-value",
  "--region",
  region,
  "--secret-id",
  sourceSecretId,
  "--query",
  "SecretString",
  "--output",
  "text",
]);
const source = JSON.parse(sourceRaw);
if (
  typeof source.bridgeId !== "string" ||
  typeof source.endpointId !== "string" ||
  typeof source.secret !== "string"
) {
  throw new Error("기존 bridge secret 계약이 올바르지 않습니다.");
}

const bridges = {
  [source.bridgeId]: {
    endpointId: source.endpointId,
    secret: source.secret,
    ...(typeof source.staffUserId === "string"
      ? { staffUserId: source.staffUserId }
      : {}),
  },
};
for (let index = 1; index <= slotCount; index += 1) {
  const bridgeId = `${slotPrefix}${String(index).padStart(3, "0")}`;
  if (bridges[bridgeId]) {
    throw new Error(`중복 bridge ID입니다: ${bridgeId}`);
  }
  bridges[bridgeId] = {
    endpointId: randomUUID(),
    secret: randomBytes(32).toString("base64url"),
  };
}

const registryJson = JSON.stringify({ schemaVersion: 1, bridges });
try {
  const created = await runAwsWithSecretPipe(
    [
      "secretsmanager",
      "create-secret",
      "--region",
      region,
      "--name",
      registrySecretName,
      "--description",
      "Lawand Centrex multi-instance bridge HMAC registry",
      "--tags",
      "Key=Project,Value=lawand",
      "Key=Purpose,Value=centrex-bridge-pool",
      "--output",
      "json",
    ],
    registryJson,
  );
  const result = JSON.parse(created);
  console.log(
    JSON.stringify({
      status: "created",
      name: result.Name,
      versionId: result.VersionId,
      bridgeCount: Object.keys(bridges).length,
      idleSlotCount: slotCount,
    }),
  );
} finally {
  source.secret = "";
  for (const value of Object.values(bridges)) value.secret = "";
}
