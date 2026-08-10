import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const credentialsPath = resolve(projectRoot, ".env.development.local");
const dbeaverCredentialsPath = resolve(projectRoot, ".env.dbeaver.local");
const localErpBaseUrl =
  "http://desktopkchai.tail977311.ts.net:3021";

const database = {
  host: "127.0.0.1",
  port: "5432",
  name: "lawand_dev",
  migratorUser: "lawand_migrator",
  appUser: "lawand_app",
  viewerUser: "lawand_viewer",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    if (result.stdout) {
      process.stderr.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    throw new Error(`${command} 실행에 실패했습니다.`);
  }

  return result.stdout?.trim() ?? "";
}

function parseEnv(contents) {
  const values = new Map();

  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    values.set(line.slice(0, separator), line.slice(separator + 1));
  }

  return values;
}

function createPassword() {
  return randomBytes(24).toString("base64url");
}

function createSecret() {
  return randomBytes(32).toString("base64");
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function databaseUrl(user, password) {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${database.host}:${database.port}/${database.name}`;
}

const existingValues = existsSync(credentialsPath)
  ? parseEnv(readFileSync(credentialsPath, "utf8"))
  : new Map();

const passwords = {
  migrator:
    existingValues.get("LAWAND_MIGRATOR_PASSWORD") ?? createPassword(),
  app: existingValues.get("LAWAND_APP_PASSWORD") ?? createPassword(),
  viewer: existingValues.get("LAWAND_VIEWER_PASSWORD") ?? createPassword(),
};
const applicationSecrets = {
  encryptionKey:
    existingValues.get("LAWAND_DATA_ENCRYPTION_KEY_V1") ?? createSecret(),
  hmacKey: existingValues.get("LAWAND_DATA_HMAC_KEY_V1") ?? createSecret(),
  internalApiKey:
    existingValues.get("LAWAND_INTERNAL_API_KEY") ?? createPassword(),
  publicIntakeApiKey:
    existingValues.get("LAWAND_PUBLIC_INTAKE_API_KEY") ?? createPassword(),
  legalFriendsApiToken:
    existingValues.get("LAWAND_LEGALFRIENDS_API_TOKEN") ?? "",
  kakaoChatbotBotId:
    existingValues.get("LAWAND_KAKAO_CHATBOT_BOT_ID") ?? "",
  kakaoChatbotSkillSecret:
    existingValues.get("LAWAND_KAKAO_CHATBOT_SKILL_SECRET") ?? "",
};
const outboxWorkerEnabled =
  existingValues.get("LAWAND_OUTBOX_WORKER_ENABLED") ?? "false";

const migrationDatabaseUrl = databaseUrl(
  database.migratorUser,
  passwords.migrator,
);
const appDatabaseUrl = databaseUrl(database.appUser, passwords.app);
const viewerDatabaseUrl = databaseUrl(database.viewerUser, passwords.viewer);

const credentialContents = [
  "# 로컬 개발 전용. 커밋 금지.",
  `LAWAND_DB_HOST=${database.host}`,
  `LAWAND_DB_PORT=${database.port}`,
  `LAWAND_DB_NAME=${database.name}`,
  `LAWAND_MIGRATOR_USERNAME=${database.migratorUser}`,
  `LAWAND_MIGRATOR_PASSWORD=${passwords.migrator}`,
  `LAWAND_APP_USERNAME=${database.appUser}`,
  `LAWAND_APP_PASSWORD=${passwords.app}`,
  `LAWAND_VIEWER_USERNAME=${database.viewerUser}`,
  `LAWAND_VIEWER_PASSWORD=${passwords.viewer}`,
  `LAWAND_MIGRATION_DATABASE_URL=${migrationDatabaseUrl}`,
  `LAWAND_APP_DATABASE_URL=${appDatabaseUrl}`,
  `LAWAND_VIEWER_DATABASE_URL=${viewerDatabaseUrl}`,
  "LAWAND_DATA_KEY_VERSION=v1",
  `LAWAND_DATA_ENCRYPTION_KEY_V1=${applicationSecrets.encryptionKey}`,
  `LAWAND_DATA_HMAC_KEY_V1=${applicationSecrets.hmacKey}`,
  `LAWAND_INTERNAL_API_KEY=${applicationSecrets.internalApiKey}`,
  `LAWAND_PUBLIC_INTAKE_API_KEY=${applicationSecrets.publicIntakeApiKey}`,
  `LAWAND_OUTBOX_WORKER_ENABLED=${outboxWorkerEnabled}`,
  `LAWAND_LEGALFRIENDS_API_TOKEN=${applicationSecrets.legalFriendsApiToken}`,
  `LAWAND_KAKAO_CHATBOT_BOT_ID=${applicationSecrets.kakaoChatbotBotId}`,
  `LAWAND_KAKAO_CHATBOT_SKILL_SECRET=${applicationSecrets.kakaoChatbotSkillSecret}`,
  "",
].join("\n");

writeFileSync(credentialsPath, credentialContents, {
  encoding: "utf8",
  mode: 0o600,
});
chmodSync(credentialsPath, 0o600);

const dbeaverCredentialContents = [
  "# DBeaver 로컬 개발 DB 읽기 전용 접속정보. 커밋 금지.",
  `HOST=${database.host}`,
  `PORT=${database.port}`,
  `DATABASE=${database.name}`,
  `USERNAME=${database.viewerUser}`,
  `PASSWORD=${passwords.viewer}`,
  "SSL_MODE=disable",
  "",
].join("\n");

writeFileSync(dbeaverCredentialsPath, dbeaverCredentialContents, {
  encoding: "utf8",
  mode: 0o600,
});
chmodSync(dbeaverCredentialsPath, 0o600);

const applicationEnvFiles = [
  {
    path: resolve(projectRoot, "apps/gateway/.env.local"),
    contents: [
      "# 로컬 gateway 전용. 커밋 금지.",
      `LAWAND_APP_DATABASE_URL=${appDatabaseUrl}`,
      "LAWAND_DATA_KEY_VERSION=v1",
      `LAWAND_DATA_ENCRYPTION_KEY_V1=${applicationSecrets.encryptionKey}`,
      `LAWAND_DATA_HMAC_KEY_V1=${applicationSecrets.hmacKey}`,
      `LAWAND_INTERNAL_API_KEY=${applicationSecrets.internalApiKey}`,
      `LAWAND_PUBLIC_INTAKE_API_KEY=${applicationSecrets.publicIntakeApiKey}`,
      `LAWAND_ERP_BASE_URL=${localErpBaseUrl}`,
      `LAWAND_OUTBOX_WORKER_ENABLED=${outboxWorkerEnabled}`,
      `LAWAND_LEGALFRIENDS_API_TOKEN=${applicationSecrets.legalFriendsApiToken}`,
      `LAWAND_KAKAO_CHATBOT_BOT_ID=${applicationSecrets.kakaoChatbotBotId}`,
      `LAWAND_KAKAO_CHATBOT_SKILL_SECRET=${applicationSecrets.kakaoChatbotSkillSecret}`,
      "",
    ].join("\n"),
  },
  {
    path: resolve(projectRoot, "apps/erp/.env.local"),
    contents: [
      "# 로컬 ERP 서버 전용. 커밋 금지.",
      "LAWAND_GATEWAY_URL=http://127.0.0.1:3022",
      `LAWAND_INTERNAL_API_KEY=${applicationSecrets.internalApiKey}`,
      `LAWAND_ERP_BASE_URL=${localErpBaseUrl}`,
      "",
    ].join("\n"),
  },
  {
    path: resolve(projectRoot, "apps/homepage/.env.local"),
    contents: [
      "# 로컬 홈페이지 서버 전용. 커밋 금지.",
      `LAWAND_APP_DATABASE_URL=${appDatabaseUrl}`,
      "LAWAND_GATEWAY_URL=http://127.0.0.1:3022",
      `LAWAND_PUBLIC_INTAKE_API_KEY=${applicationSecrets.publicIntakeApiKey}`,
      "LAWAND_TRUSTED_PROXY_HOPS=0",
      "",
    ].join("\n"),
  },
];

for (const envFile of applicationEnvFiles) {
  writeFileSync(envFile.path, envFile.contents, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(envFile.path, 0o600);
}

const roleSql = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${database.migratorUser}') THEN
    CREATE ROLE ${database.migratorUser} LOGIN PASSWORD ${sqlLiteral(passwords.migrator)};
  ELSE
    ALTER ROLE ${database.migratorUser} PASSWORD ${sqlLiteral(passwords.migrator)};
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${database.appUser}') THEN
    CREATE ROLE ${database.appUser} LOGIN PASSWORD ${sqlLiteral(passwords.app)};
  ELSE
    ALTER ROLE ${database.appUser} PASSWORD ${sqlLiteral(passwords.app)};
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${database.viewerUser}') THEN
    CREATE ROLE ${database.viewerUser} LOGIN PASSWORD ${sqlLiteral(passwords.viewer)};
  ELSE
    ALTER ROLE ${database.viewerUser} PASSWORD ${sqlLiteral(passwords.viewer)};
  END IF;
END
$roles$;

ALTER ROLE ${database.migratorUser} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE ${database.appUser} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE ${database.viewerUser} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
`;

run(
  "sudo",
  [
    "-n",
    "-u",
    "postgres",
    "psql",
    "--quiet",
    "--set=ON_ERROR_STOP=1",
    "--dbname=postgres",
  ],
  { input: roleSql },
);

const existingDatabaseOwner = run("sudo", [
  "-n",
  "-u",
  "postgres",
  "psql",
  "--tuples-only",
  "--no-align",
  "--dbname=postgres",
  "--command",
  `SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '${database.name}'`,
]);

if (!existingDatabaseOwner) {
  run("sudo", [
    "-n",
    "-u",
    "postgres",
    "createdb",
    `--owner=${database.migratorUser}`,
    "--encoding=UTF8",
    "--template=template0",
    database.name,
  ]);
} else if (existingDatabaseOwner !== database.migratorUser) {
  throw new Error(
    `${database.name}의 소유자가 ${existingDatabaseOwner}입니다. 자동 변경하지 않습니다.`,
  );
}

const databaseAccessSql = `
REVOKE CONNECT ON DATABASE ${database.name} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${database.name}
  TO ${database.migratorUser}, ${database.appUser}, ${database.viewerUser};
ALTER DATABASE ${database.name} SET timezone TO 'Asia/Seoul';
`;

run(
  "sudo",
  [
    "-n",
    "-u",
    "postgres",
    "psql",
    "--quiet",
    "--set=ON_ERROR_STOP=1",
    "--dbname=postgres",
  ],
  { input: databaseAccessSql },
);

run(
  "corepack",
  ["pnpm", "--filter", "@lawand/db", "migrate"],
  {
    env: {
      ...process.env,
      DATABASE_URL: migrationDatabaseUrl,
    },
    stdio: "inherit",
  },
);

const permissionSql = `
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ${database.appUser}, ${database.viewerUser};

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO ${database.appUser};
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO ${database.appUser};
GRANT SELECT
  ON ALL TABLES IN SCHEMA public TO ${database.viewerUser};

-- 센트릭스 인증값은 암호화돼 있어도 일반 조회 계정에는 노출하지 않는다.
REVOKE ALL ON TABLE telephony_endpoint_credentials
  FROM PUBLIC, ${database.viewerUser};

-- 공개 사례는 생성·검수 전용 경로만 변경하고 홈페이지·gateway 런타임은 조회만 한다.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public_case_studies FROM ${database.appUser};
GRANT SELECT ON TABLE public_case_studies TO ${database.appUser};

ALTER DEFAULT PRIVILEGES FOR ROLE ${database.migratorUser} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${database.appUser};
ALTER DEFAULT PRIVILEGES FOR ROLE ${database.migratorUser} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${database.appUser};
ALTER DEFAULT PRIVILEGES FOR ROLE ${database.migratorUser} IN SCHEMA public
  GRANT SELECT ON TABLES TO ${database.viewerUser};

ALTER ROLE ${database.viewerUser} IN DATABASE ${database.name}
  SET default_transaction_read_only TO on;
`;

run(
  "sudo",
  [
    "-n",
    "-u",
    "postgres",
    "psql",
    "--quiet",
    "--set=ON_ERROR_STOP=1",
    `--dbname=${database.name}`,
  ],
  { input: permissionSql },
);

console.log(`로컬 개발 DB ${database.name} 준비 완료`);
console.log(`접속정보 파일: ${credentialsPath}`);
console.log(`DBeaver 읽기 전용 접속정보: ${dbeaverCredentialsPath}`);
