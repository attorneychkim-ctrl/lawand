import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const environmentPath = resolve(projectRoot, ".env.development.local");
const sourceOfficeIdx = 56;
const targetSchema = "CB";
const batchSize = 500;

const sourceSshHost =
  process.env.LAWAND_LEGALFRIENDS_SSH_HOST ?? "ec2-user@43.200.156.135";
const sourceSshKey =
  process.env.LAWAND_LEGALFRIENDS_SSH_KEY ??
  resolve(projectRoot, "../../newLawAndERP.pem");
const sourceEnvironmentPath =
  process.env.LAWAND_LEGALFRIENDS_REMOTE_ENV ??
  "/var/www/html/lawandERP/.env";

const tableDefinitions = {
  TblMember: {
    columns: [
      "idx",
      "type",
      "member_id",
      "name",
      "position",
      "Office_idx",
      "create_dt",
      "update_dt",
    ],
    integerColumns: new Set(["idx", "type", "Office_idx"]),
    nullableColumns: new Set(["position"]),
    timestampColumns: new Set(["create_dt", "update_dt"]),
    createTable(tableReference, constraintSuffix) {
      return `
        CREATE TABLE ${tableReference} (
          ${quoteIdentifier("idx")} integer NOT NULL,
          ${quoteIdentifier("type")} smallint NOT NULL,
          ${quoteIdentifier("member_id")} varchar(16) NOT NULL,
          ${quoteIdentifier("name")} varchar(32) NOT NULL,
          ${quoteIdentifier("position")} varchar(32),
          ${quoteIdentifier("Office_idx")} integer NOT NULL,
          ${quoteIdentifier("create_dt")} timestamp NOT NULL,
          ${quoteIdentifier("update_dt")} timestamp NOT NULL,
          CONSTRAINT ${quoteIdentifier(`TblMember${constraintSuffix}_pkey`)}
            PRIMARY KEY (${quoteIdentifier("idx")}),
          CONSTRAINT ${quoteIdentifier(`TblMember${constraintSuffix}_member_id_key`)}
            UNIQUE (${quoteIdentifier("member_id")})
        )
      `;
    },
    indexes: [
      { suffix: "office", columns: ["Office_idx"] },
      { suffix: "name", columns: ["name"] },
      { suffix: "update_dt", columns: ["update_dt"] },
    ],
  },
  TblCase: {
    columns: [
      "idx",
      "case_type",
      "case_category",
      "case_state",
      "max_state",
      "is_close",
      "is_repeal",
      "Office_idx",
      "Member_idx",
      "sub_member_idx",
      "sub_member2_idx",
      "Court_idx",
      "court_name",
      "case_number",
      "case_name",
      "del_flag",
      "create_dt",
      "update_dt",
    ],
    integerColumns: new Set([
      "idx",
      "case_type",
      "case_category",
      "case_state",
      "max_state",
      "is_close",
      "is_repeal",
      "Office_idx",
      "Member_idx",
      "sub_member_idx",
      "sub_member2_idx",
      "Court_idx",
      "del_flag",
    ]),
    nullableColumns: new Set([
      "is_close",
      "is_repeal",
      "sub_member_idx",
      "sub_member2_idx",
      "court_name",
      "case_number",
      "case_name",
      "del_flag",
    ]),
    timestampColumns: new Set(["create_dt", "update_dt"]),
    createTable(tableReference, constraintSuffix) {
      return `
        CREATE TABLE ${tableReference} (
          ${quoteIdentifier("idx")} integer NOT NULL,
          ${quoteIdentifier("case_type")} smallint NOT NULL,
          ${quoteIdentifier("case_category")} smallint NOT NULL,
          ${quoteIdentifier("case_state")} smallint NOT NULL,
          ${quoteIdentifier("max_state")} smallint NOT NULL,
          ${quoteIdentifier("is_close")} smallint,
          ${quoteIdentifier("is_repeal")} smallint,
          ${quoteIdentifier("Office_idx")} integer NOT NULL,
          ${quoteIdentifier("Member_idx")} integer NOT NULL,
          ${quoteIdentifier("sub_member_idx")} integer,
          ${quoteIdentifier("sub_member2_idx")} integer,
          ${quoteIdentifier("Court_idx")} integer NOT NULL,
          ${quoteIdentifier("court_name")} varchar(16),
          ${quoteIdentifier("case_number")} varchar(20),
          ${quoteIdentifier("case_name")} varchar(64),
          ${quoteIdentifier("del_flag")} smallint,
          ${quoteIdentifier("create_dt")} timestamp NOT NULL,
          ${quoteIdentifier("update_dt")} timestamp NOT NULL,
          CONSTRAINT ${quoteIdentifier(`TblCase${constraintSuffix}_pkey`)}
            PRIMARY KEY (${quoteIdentifier("idx")})
        )
      `;
    },
    indexes: [
      { suffix: "member", columns: ["Member_idx"] },
      { suffix: "sub_member", columns: ["sub_member_idx"] },
      { suffix: "sub_member2", columns: ["sub_member2_idx"] },
      { suffix: "type_state", columns: ["case_type", "case_state"] },
      { suffix: "update_dt", columns: ["update_dt"] },
    ],
  },
  TblCSClient: {
    columns: [
      "idx",
      "Case_idx",
      "name",
      "phone",
      "living_place",
      "name_search",
      "phone_search",
      "create_dt",
      "update_dt",
    ],
    integerColumns: new Set(["idx", "Case_idx"]),
    nullableColumns: new Set([
      "name",
      "phone",
      "living_place",
      "name_search",
      "phone_search",
    ]),
    timestampColumns: new Set(["create_dt", "update_dt"]),
    createTable(tableReference, constraintSuffix) {
      return `
        CREATE TABLE ${tableReference} (
          ${quoteIdentifier("idx")} integer NOT NULL,
          ${quoteIdentifier("Case_idx")} integer NOT NULL,
          ${quoteIdentifier("name")} varchar(64),
          ${quoteIdentifier("phone")} varchar(20),
          ${quoteIdentifier("living_place")} varchar(20),
          ${quoteIdentifier("name_search")} varchar(200),
          ${quoteIdentifier("phone_search")} varchar(50),
          ${quoteIdentifier("create_dt")} timestamp NOT NULL,
          ${quoteIdentifier("update_dt")} timestamp NOT NULL,
          CONSTRAINT ${quoteIdentifier(`TblCSClient${constraintSuffix}_pkey`)}
            PRIMARY KEY (${quoteIdentifier("idx")}),
          CONSTRAINT ${quoteIdentifier(`TblCSClient${constraintSuffix}_Case_idx_key`)}
            UNIQUE (${quoteIdentifier("Case_idx")})
        )
      `;
    },
    indexes: [
      { suffix: "phone_search", columns: ["phone_search"] },
      { suffix: "name_search", columns: ["name_search"] },
      { suffix: "update_dt", columns: ["update_dt"] },
    ],
  },
};

const tableOrder = ["TblMember", "TblCase", "TblCSClient"];

const sourceStreamQuery = `
  SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
  START TRANSACTION WITH CONSISTENT SNAPSHOT;
  SELECT JSON_OBJECT(
    '__table', '__meta',
    'snapshot_at', DATE_FORMAT(UTC_TIMESTAMP(6), '%Y-%m-%dT%H:%i:%s.%fZ'),
    'office_idx', ${sourceOfficeIdx}
  );
  SELECT JSON_OBJECT(
    '__table', 'TblMember',
    'idx', idx,
    'type', type,
    'member_id', member_id,
    'name', name,
    'position', position,
    'Office_idx', Office_idx,
    'create_dt', create_dt,
    'update_dt', update_dt
  )
  FROM ACCOUNT.TblMember
  WHERE Office_idx = ${sourceOfficeIdx}
  ORDER BY idx;
  SELECT JSON_OBJECT(
    '__table', 'TblCase',
    'idx', idx,
    'case_type', case_type,
    'case_category', case_category,
    'case_state', case_state,
    'max_state', max_state,
    'is_close', is_close,
    'is_repeal', is_repeal,
    'Office_idx', Office_idx,
    'Member_idx', Member_idx,
    'sub_member_idx', sub_member_idx,
    'sub_member2_idx', sub_member2_idx,
    'Court_idx', Court_idx,
    'court_name', court_name,
    'case_number', case_number,
    'case_name', case_name,
    'del_flag', del_flag,
    'create_dt', create_dt,
    'update_dt', update_dt
  )
  FROM CONTENT.TblCase
  WHERE Office_idx = ${sourceOfficeIdx}
  ORDER BY idx;
  SELECT JSON_OBJECT(
    '__table', 'TblCSClient',
    'idx', client.idx,
    'Case_idx', client.Case_idx,
    'name', client.name,
    'phone', client.phone,
    'living_place', client.living_place,
    'name_search', client.name_search,
    'phone_search', client.phone_search,
    'create_dt', client.create_dt,
    'update_dt', client.update_dt
  )
  FROM CONTENT.TblCSClient AS client
  INNER JOIN CONTENT.TblCase AS case_record
    ON case_record.idx = client.Case_idx
  WHERE case_record.Office_idx = ${sourceOfficeIdx}
  ORDER BY client.idx;
  COMMIT;
`;

function readEnvironment() {
  if (!existsSync(environmentPath)) {
    throw new Error(".env.development.local 파일이 필요합니다.");
  }

  const values = new Map();
  for (const line of readFileSync(environmentPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0 && !line.startsWith("#")) {
      values.set(line.slice(0, separator), line.slice(separator + 1));
    }
  }
  return values;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableReference(tableName, staging = false) {
  return `${quoteIdentifier(targetSchema)}.${quoteIdentifier(
    staging ? `${tableName}__sync` : tableName,
  )}`;
}

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function createRemoteMysqlCommand(query) {
  const remoteEnvironment = shellQuote(sourceEnvironmentPath);
  const queryArgument = shellQuote(query);

  return [
    "set -eu",
    `env_file=${remoteEnvironment}`,
    `rds_host=$(awk -F= '/^RDS_DB_HOST=/{print substr($0,index($0,"=")+1)}' "$env_file")`,
    `rds_port=$(awk -F= '/^RDS_DB_PORT=/{print substr($0,index($0,"=")+1)}' "$env_file")`,
    `rds_user=$(awk -F= '/^RDS_DB_USERNAME=/{print substr($0,index($0,"=")+1)}' "$env_file")`,
    `MYSQL_PWD=$(awk -F= '/^RDS_DB_PASSWORD=/{print substr($0,index($0,"=")+1)}' "$env_file")`,
    "export MYSQL_PWD",
    `exec mysql --protocol=tcp --connect-timeout=15 --host="$rds_host" --port="$rds_port" --user="$rds_user" --default-character-set=utf8mb4 --batch --raw --quick --binary-mode --skip-column-names -e ${queryArgument}`,
  ].join("; ");
}

function createSourceProcess() {
  if (!existsSync(sourceSshKey)) {
    throw new Error(
      `SSH 키를 찾을 수 없습니다: ${sourceSshKey}. LAWAND_LEGALFRIENDS_SSH_KEY를 지정하세요.`,
    );
  }

  return spawn(
    "ssh",
    [
      "-T",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=15",
      "-i",
      sourceSshKey,
      sourceSshHost,
      createRemoteMysqlCommand(sourceStreamQuery),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

function createSummary(definition) {
  return {
    rowCount: 0n,
    minIdx: null,
    maxIdx: null,
    maxUpdateDt: null,
    nullCounts: Object.fromEntries(
      [...definition.nullableColumns].map((column) => [column, 0n]),
    ),
    digestA: 0n,
    digestB: 0n,
  };
}

function canonicalValue(value) {
  if (value === null) return "<NULL>";
  return value;
}

function addToSummary(summary, definition, record) {
  summary.rowCount += 1n;
  summary.minIdx = summary.minIdx === null ? record.idx : Math.min(summary.minIdx, record.idx);
  summary.maxIdx = summary.maxIdx === null ? record.idx : Math.max(summary.maxIdx, record.idx);
  if (summary.maxUpdateDt === null || record.update_dt > summary.maxUpdateDt) {
    summary.maxUpdateDt = record.update_dt;
  }
  for (const column of definition.nullableColumns) {
    if (record[column] === null) summary.nullCounts[column] += 1n;
  }

  const canonicalRecord = JSON.stringify(
    definition.columns.map((column) => canonicalValue(record[column])),
  );
  const digest = createHash("sha256").update(canonicalRecord, "utf8").digest("hex");
  summary.digestA ^= BigInt(`0x${digest.slice(0, 15)}`);
  summary.digestB ^= BigInt(`0x${digest.slice(15, 30)}`);
}

function finalizeSummary(summary) {
  return {
    rowCount: summary.rowCount.toString(),
    minIdx: String(summary.minIdx ?? -1),
    maxIdx: String(summary.maxIdx ?? -1),
    maxUpdateDt: summary.maxUpdateDt ?? "<NULL>",
    nullCounts: Object.fromEntries(
      Object.entries(summary.nullCounts).map(([column, count]) => [
        column,
        count.toString(),
      ]),
    ),
    digestA: summary.digestA.toString(),
    digestB: summary.digestB.toString(),
  };
}

function normalizeRecord(tableName, rawRecord) {
  const definition = tableDefinitions[tableName];
  const record = {};

  for (const column of definition.columns) {
    if (!(column in rawRecord)) {
      throw new Error(`${tableName}.${column}이 원본 행에 없습니다.`);
    }
    const value = rawRecord[column];
    if (value === null) {
      if (!definition.nullableColumns.has(column)) {
        throw new Error(`${tableName}.${column}이 NULL인 원본 행을 만났습니다.`);
      }
      record[column] = null;
      continue;
    }
    if (definition.integerColumns.has(column)) {
      if (!Number.isSafeInteger(value)) {
        throw new Error(`${tableName}.${column}이 안전한 정수가 아닙니다.`);
      }
      record[column] = value;
      continue;
    }
    if (definition.timestampColumns.has(column)) {
      if (typeof value !== "string") {
        throw new Error(`${tableName}.${column}이 날짜 문자열이 아닙니다.`);
      }
      record[column] = value.replace(/\.\d{1,6}$/, "");
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(`${tableName}.${column}이 문자열이 아닙니다.`);
    }
    record[column] = value;
  }

  if (record.Office_idx !== undefined && record.Office_idx !== sourceOfficeIdx) {
    throw new Error(`${tableName}에서 다른 사무소 행을 만났습니다.`);
  }
  if (tableName === "TblCSClient") {
    const normalizedPhone = record.phone?.replaceAll(/[^0-9]/g, "") ?? null;
    if (normalizedPhone !== record.phone_search) {
      throw new Error("TblCSClient 전화번호 검색값이 원본 전화번호와 일치하지 않습니다.");
    }
  }
  return record;
}

async function insertBatch(database, tableName, records) {
  if (records.length === 0) return;
  const definition = tableDefinitions[tableName];
  const values = [];
  const placeholders = records.map((record, rowIndex) => {
    const row = definition.columns.map((column, columnIndex) => {
      values.push(record[column]);
      return `$${rowIndex * definition.columns.length + columnIndex + 1}`;
    });
    return `(${row.join(", ")})`;
  });
  await database.query(
    `INSERT INTO ${tableReference(tableName, true)} (${definition.columns
      .map(quoteIdentifier)
      .join(", ")}) VALUES ${placeholders.join(", ")}`,
    values,
  );
}

async function createStagingTables(database) {
  for (const tableName of [...tableOrder].reverse()) {
    await database.query(`DROP TABLE IF EXISTS ${tableReference(tableName, true)}`);
  }
  for (const tableName of tableOrder) {
    const definition = tableDefinitions[tableName];
    await database.query(
      definition.createTable(tableReference(tableName, true), "__sync"),
    );
  }
}

async function createStagingIndexes(database) {
  for (const tableName of tableOrder) {
    const definition = tableDefinitions[tableName];
    for (const index of definition.indexes) {
      await database.query(
        `CREATE INDEX ${quoteIdentifier(
          `idx_${tableName}__sync_${index.suffix}`,
        )} ON ${tableReference(tableName, true)} (${index.columns
          .map(quoteIdentifier)
          .join(", ")})`,
      );
    }
  }
}

async function readTargetSummary(database, tableName) {
  const definition = tableDefinitions[tableName];
  const selectedColumns = definition.columns.map((column) =>
    definition.timestampColumns.has(column)
      ? `to_char(${quoteIdentifier(column)}, 'YYYY-MM-DD HH24:MI:SS') AS ${quoteIdentifier(column)}`
      : quoteIdentifier(column),
  );
  const result = await database.query(
    `SELECT ${selectedColumns.join(", ")} FROM ${tableReference(
      tableName,
      true,
    )} ORDER BY ${quoteIdentifier("idx")}`,
  );
  const summary = createSummary(definition);
  for (const row of result.rows) addToSummary(summary, definition, row);
  return finalizeSummary(summary);
}

function assertSummariesMatch(sourceSummaries, targetSummaries) {
  for (const tableName of tableOrder) {
    if (
      JSON.stringify(sourceSummaries[tableName]) !==
      JSON.stringify(targetSummaries[tableName])
    ) {
      throw new Error(`${tableName} 원본·대상 무결성 요약이 일치하지 않습니다.`);
    }
  }
}

async function verifyRelations(database) {
  const result = await database.query(`
    WITH member_refs AS (
      SELECT ${quoteIdentifier("Member_idx")} AS member_idx
      FROM ${tableReference("TblCase", true)}
      UNION
      SELECT ${quoteIdentifier("sub_member_idx")}
      FROM ${tableReference("TblCase", true)}
      WHERE ${quoteIdentifier("sub_member_idx")} IS NOT NULL
      UNION
      SELECT ${quoteIdentifier("sub_member2_idx")}
      FROM ${tableReference("TblCase", true)}
      WHERE ${quoteIdentifier("sub_member2_idx")} IS NOT NULL
    ), duplicate_phones AS (
      SELECT ${quoteIdentifier("phone_search")}, COUNT(*) AS duplicate_count
      FROM ${tableReference("TblCSClient", true)}
      WHERE ${quoteIdentifier("phone_search")} IS NOT NULL
        AND ${quoteIdentifier("phone_search")} <> ''
      GROUP BY ${quoteIdentifier("phone_search")}
      HAVING COUNT(*) > 1
    )
    SELECT
      (SELECT COUNT(*)::integer FROM ${tableReference("TblCase", true)}) AS cases,
      (SELECT COUNT(*)::integer FROM ${tableReference("TblCSClient", true)}) AS clients,
      (SELECT COUNT(*)::integer FROM ${tableReference("TblMember", true)}) AS members,
      (SELECT COUNT(*)::integer
       FROM ${tableReference("TblCase", true)} AS cases
       LEFT JOIN ${tableReference("TblCSClient", true)} AS clients
         ON clients.${quoteIdentifier("Case_idx")} = cases.${quoteIdentifier("idx")}
       WHERE clients.${quoteIdentifier("idx")} IS NULL) AS cases_without_client,
      (SELECT COUNT(*)::integer
       FROM ${tableReference("TblCSClient", true)} AS clients
       LEFT JOIN ${tableReference("TblCase", true)} AS cases
         ON cases.${quoteIdentifier("idx")} = clients.${quoteIdentifier("Case_idx")}
       WHERE cases.${quoteIdentifier("idx")} IS NULL) AS clients_without_case,
      (SELECT COUNT(*)::integer
       FROM member_refs
       LEFT JOIN ${tableReference("TblMember", true)} AS members
         ON members.${quoteIdentifier("idx")} = member_refs.member_idx
       WHERE members.${quoteIdentifier("idx")} IS NULL) AS unresolved_member_refs,
      (SELECT COUNT(*)::integer FROM duplicate_phones) AS duplicate_phone_groups,
      COALESCE((SELECT MAX(duplicate_count)::integer FROM duplicate_phones), 0)
        AS max_phone_group_size,
      (SELECT COUNT(*)::integer
       FROM ${tableReference("TblCSClient", true)}
       WHERE ${quoteIdentifier("phone_search")} IS DISTINCT FROM
         CASE
           WHEN ${quoteIdentifier("phone")} IS NULL THEN NULL
           ELSE regexp_replace(${quoteIdentifier("phone")}, '[^0-9]', '', 'g')
         END) AS invalid_phone_search,
      (SELECT COUNT(*)::integer
       FROM ${tableReference("TblCase", true)}
       WHERE ${quoteIdentifier("Office_idx")} <> ${sourceOfficeIdx}) AS foreign_office_cases,
      (SELECT COUNT(*)::integer
       FROM ${tableReference("TblMember", true)}
       WHERE ${quoteIdentifier("Office_idx")} <> ${sourceOfficeIdx}) AS foreign_office_members
  `);
  const summary = result.rows[0];
  if (
    summary.cases !== summary.clients ||
    summary.cases_without_client !== 0 ||
    summary.clients_without_case !== 0 ||
    summary.invalid_phone_search !== 0 ||
    summary.foreign_office_cases !== 0 ||
    summary.foreign_office_members !== 0
  ) {
    throw new Error(`테이블 관계 검증 실패: ${JSON.stringify(summary)}`);
  }
  return summary;
}

async function targetTablesExist(database) {
  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
    [targetSchema, tableOrder],
  );
  return result.rows[0].count > 0;
}

async function replaceTargetTables(database) {
  for (const tableName of [...tableOrder].reverse()) {
    await database.query(`DROP TABLE IF EXISTS ${tableReference(tableName)}`);
  }

  for (const tableName of tableOrder) {
    await database.query(
      `ALTER TABLE ${tableReference(tableName, true)} RENAME TO ${quoteIdentifier(
        tableName,
      )}`,
    );
    await database.query(
      `ALTER TABLE ${tableReference(tableName)} RENAME CONSTRAINT ${quoteIdentifier(
        `${tableName}__sync_pkey`,
      )} TO ${quoteIdentifier(`${tableName}_pkey`)}`,
    );
    if (tableName === "TblMember") {
      await database.query(
        `ALTER TABLE ${tableReference(tableName)} RENAME CONSTRAINT ${quoteIdentifier(
          "TblMember__sync_member_id_key",
        )} TO ${quoteIdentifier("TblMember_member_id_key")}`,
      );
    }
    if (tableName === "TblCSClient") {
      await database.query(
        `ALTER TABLE ${tableReference(tableName)} RENAME CONSTRAINT ${quoteIdentifier(
          "TblCSClient__sync_Case_idx_key",
        )} TO ${quoteIdentifier("TblCSClient_Case_idx_key")}`,
      );
    }
    for (const index of tableDefinitions[tableName].indexes) {
      await database.query(
        `ALTER INDEX ${quoteIdentifier(targetSchema)}.${quoteIdentifier(
          `idx_${tableName}__sync_${index.suffix}`,
        )} RENAME TO ${quoteIdentifier(`idx_${tableName}_${index.suffix}`)}`,
      );
    }
  }
}

async function applyPermissions(database) {
  await database.query(
    `REVOKE ALL ON SCHEMA ${quoteIdentifier(targetSchema)} FROM PUBLIC, ${quoteIdentifier(
      "lawand_app",
    )}`,
  );
  await database.query(
    `GRANT USAGE ON SCHEMA ${quoteIdentifier(targetSchema)} TO ${quoteIdentifier(
      "lawand_viewer",
    )}`,
  );
  for (const tableName of tableOrder) {
    await database.query(
      `REVOKE ALL ON TABLE ${tableReference(tableName)} FROM PUBLIC, ${quoteIdentifier(
        "lawand_app",
      )}`,
    );
    await database.query(
      `GRANT SELECT ON TABLE ${tableReference(tableName)} TO ${quoteIdentifier(
        "lawand_viewer",
      )}`,
    );
  }
}

async function main() {
  const replaceRequested = process.argv.includes("--replace");
  const databaseUrl = readEnvironment().get("LAWAND_MIGRATION_DATABASE_URL");
  if (!databaseUrl) throw new Error("LAWAND_MIGRATION_DATABASE_URL이 필요합니다.");

  const database = new pg.Client({ connectionString: databaseUrl });
  await database.connect();

  try {
    await database.query("BEGIN");
    await database.query(
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(targetSchema)}`,
    );
    if (!replaceRequested && (await targetTablesExist(database))) {
      throw new Error("대상 전화 디렉터리 테이블이 이미 있습니다. --replace를 지정하세요.");
    }
    await createStagingTables(database);

    const source = createSourceProcess();
    let sourceError = "";
    const sourceExit = new Promise((resolveExit, rejectExit) => {
      source.once("error", rejectExit);
      source.once("close", (code) => resolveExit(code));
    });
    source.stderr.setEncoding("utf8");
    source.stderr.on("data", (chunk) => {
      sourceError += chunk;
    });
    source.stdout.setEncoding("utf8");

    const sourceSummaryAccumulators = Object.fromEntries(
      tableOrder.map((tableName) => [
        tableName,
        createSummary(tableDefinitions[tableName]),
      ]),
    );
    const batches = Object.fromEntries(tableOrder.map((tableName) => [tableName, []]));
    let snapshotAt = null;
    let remainder = "";

    const processLine = async (line) => {
      if (!line) return;
      const rawRecord = JSON.parse(line);
      if (rawRecord.__table === "__meta") {
        if (
          snapshotAt !== null ||
          rawRecord.office_idx !== sourceOfficeIdx ||
          typeof rawRecord.snapshot_at !== "string"
        ) {
          throw new Error("원본 스냅샷 메타데이터가 올바르지 않습니다.");
        }
        snapshotAt = rawRecord.snapshot_at;
        return;
      }
      const tableName = rawRecord.__table;
      if (!tableOrder.includes(tableName)) {
        throw new Error("알 수 없는 원본 테이블 표식을 만났습니다.");
      }
      const record = normalizeRecord(tableName, rawRecord);
      addToSummary(
        sourceSummaryAccumulators[tableName],
        tableDefinitions[tableName],
        record,
      );
      batches[tableName].push(record);
      if (batches[tableName].length >= batchSize) {
        await insertBatch(database, tableName, batches[tableName]);
        batches[tableName] = [];
      }
    };

    for await (const chunk of source.stdout) {
      remainder += chunk;
      const lines = remainder.split("\n");
      remainder = lines.pop() ?? "";
      for (const line of lines) await processLine(line);
    }
    if (remainder.trim()) await processLine(remainder);
    for (const tableName of tableOrder) {
      await insertBatch(database, tableName, batches[tableName]);
    }

    const sourceExitCode = await sourceExit;
    if (sourceExitCode !== 0) {
      throw new Error(
        `리걸프렌즈 RDS 원본 읽기 실패: ${
          sourceError.trim() || `exit ${sourceExitCode}`
        }`,
      );
    }
    if (snapshotAt === null) {
      throw new Error("원본 스냅샷 시각을 받지 못했습니다.");
    }

    await createStagingIndexes(database);
    const sourceSummaries = Object.fromEntries(
      tableOrder.map((tableName) => [
        tableName,
        finalizeSummary(sourceSummaryAccumulators[tableName]),
      ]),
    );
    const targetSummaries = {};
    for (const tableName of tableOrder) {
      targetSummaries[tableName] = await readTargetSummary(database, tableName);
    }
    assertSummariesMatch(sourceSummaries, targetSummaries);
    const relations = await verifyRelations(database);

    await replaceTargetTables(database);
    await applyPermissions(database);
    await database.query("COMMIT");

    console.log(
      JSON.stringify({
        officeIdx: sourceOfficeIdx,
        snapshotAt,
        replace: replaceRequested,
        tables: targetSummaries,
        relations,
      }),
    );
  } catch (error) {
    await database.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await database.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
