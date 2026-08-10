import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import pg from "pg";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const environmentPath = resolve(projectRoot, ".env.development.local");
const targetSchema = "CB";
const targetTable = "TblMoClientStatement";
const stagingTable = `${targetTable}__sync`;
const targetTableReference = '"CB"."TblMoClientStatement"';
const stagingTableReference = '"CB"."TblMoClientStatement__sync"';
const batchSize = 100;
const columns = [
  "idx",
  "Case_idx",
  "tel_company",
  "phone",
  "final_education",
  "career",
  "litigation_exp_flag",
  "litigation_exp",
  "residence_type",
  "residence_start_dt",
  "residence_detail",
  "is_addr_diff",
  "addr_diff_reason",
  "is_property_disposal",
  "property_disposal_reason",
  "debt_reason",
  "want",
  "update_dt",
];
const jsonColumns = new Set([
  "final_education",
  "career",
  "litigation_exp",
  "residence_detail",
]);
const integerColumns = new Set(["idx", "Case_idx"]);
const nullableColumns = new Set([
  "tel_company",
  "phone",
  "residence_type",
  "residence_start_dt",
  "litigation_exp_flag",
  "is_addr_diff",
  "addr_diff_reason",
  "is_property_disposal",
  "property_disposal_reason",
  "debt_reason",
  "want",
]);

const sourceSshHost =
  process.env.LAWAND_LEGALFRIENDS_SSH_HOST ?? "ec2-user@43.200.156.135";
const sourceSshKey =
  process.env.LAWAND_LEGALFRIENDS_SSH_KEY ??
  resolve(projectRoot, "../../newLawAndERP.pem");
const sourceEnvironmentPath =
  process.env.LAWAND_LEGALFRIENDS_REMOTE_ENV ?? "/var/www/html/lawandERP/.env";

const sourceStreamQuery = `
  SELECT JSON_OBJECT(
    'idx', CAST(idx AS CHAR),
    'Case_idx', CAST(Case_idx AS CHAR),
    'tel_company', tel_company,
    'phone', phone,
    'final_education', final_education,
    'career', career,
    'litigation_exp_flag', litigation_exp_flag,
    'litigation_exp', litigation_exp,
    'residence_type', residence_type,
    'residence_start_dt', residence_start_dt,
    'residence_detail', residence_detail,
    'is_addr_diff', is_addr_diff,
    'addr_diff_reason', addr_diff_reason,
    'is_property_disposal', is_property_disposal,
    'property_disposal_reason', property_disposal_reason,
    'debt_reason', debt_reason,
    'want', want,
    'update_dt', update_dt
  )
  FROM CONTENT.TblMoClientStatement
  ORDER BY idx;
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
    `rds_database=$(awk -F= '/^RDS_DB_DATABASE=/{print substr($0,index($0,"=")+1)}' "$env_file")`,
    `rds_user=$(awk -F= '/^RDS_DB_USERNAME=/{print substr($0,index($0,"=")+1)}' "$env_file")`,
    `rds_password=$(awk -F= '/^RDS_DB_PASSWORD=/{print substr($0,index($0,"=")+1)}' "$env_file")`,
    `exec mysql --protocol=tcp --connect-timeout=15 --host="$rds_host" --port="$rds_port" --user="$rds_user" --password="$rds_password" --database="$rds_database" --default-character-set=utf8mb4 --batch --raw --quick --binary-mode --skip-column-names -e ${queryArgument}`,
  ].join("; ");
}

function createSourceProcess(query) {
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
      createRemoteMysqlCommand(query),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalizeJson(value));
}

function createSummary() {
  return {
    rowCount: 0n,
    minIdx: null,
    maxIdx: null,
    minCaseIdx: null,
    maxCaseIdx: null,
    caseIdxValues: new Set(),
    nullCounts: Object.fromEntries(
      [...nullableColumns].map((column) => [column, 0n]),
    ),
    jsonChars: 0n,
    debtReasonChars: 0n,
    wantChars: 0n,
    digestA: 0n,
    digestB: 0n,
    maxUpdateDt: null,
  };
}

function addSummary(summary, record) {
  const idx = BigInt(record.idx);
  const caseIdx = BigInt(record.Case_idx);
  summary.rowCount += 1n;
  summary.minIdx = summary.minIdx === null ? idx : idx < summary.minIdx ? idx : summary.minIdx;
  summary.maxIdx = summary.maxIdx === null ? idx : idx > summary.maxIdx ? idx : summary.maxIdx;
  summary.minCaseIdx =
    summary.minCaseIdx === null
      ? caseIdx
      : caseIdx < summary.minCaseIdx
        ? caseIdx
        : summary.minCaseIdx;
  summary.maxCaseIdx =
    summary.maxCaseIdx === null
      ? caseIdx
      : caseIdx > summary.maxCaseIdx
        ? caseIdx
        : summary.maxCaseIdx;
  summary.caseIdxValues.add(String(record.Case_idx));

  for (const column of nullableColumns) {
    if (record[column] === null) summary.nullCounts[column] += 1n;
  }
  for (const column of jsonColumns) {
    summary.jsonChars += BigInt(Buffer.byteLength(canonicalJson(record[column]), "utf8"));
  }
  if (record.debt_reason !== null) {
    summary.debtReasonChars += BigInt(Array.from(record.debt_reason).length);
  }
  if (record.want !== null) {
    summary.wantChars += BigInt(Array.from(record.want).length);
  }
  if (summary.maxUpdateDt === null || record.update_dt > summary.maxUpdateDt) {
    summary.maxUpdateDt = record.update_dt;
  }

  const canonicalRecord = columns
    .map((column) => {
      if (jsonColumns.has(column)) return canonicalJson(record[column]);
      return record[column] === null ? "<NULL>" : String(record[column]);
    })
    .join("#");
  const digest = createHash("md5").update(canonicalRecord, "utf8").digest("hex");
  summary.digestA ^= BigInt(`0x${digest.slice(0, 15)}`);
  summary.digestB ^= BigInt(`0x${digest.slice(15, 30)}`);
}

function finalizeSummary(summary) {
  return {
    rowCount: summary.rowCount.toString(),
    minIdx: String(summary.minIdx ?? -1),
    maxIdx: String(summary.maxIdx ?? -1),
    minCaseIdx: String(summary.minCaseIdx ?? -1),
    maxCaseIdx: String(summary.maxCaseIdx ?? -1),
    distinctCaseIdx: String(summary.caseIdxValues.size),
    nullCounts: Object.fromEntries(
      Object.entries(summary.nullCounts).map(([column, count]) => [column, count.toString()]),
    ),
    jsonChars: summary.jsonChars.toString(),
    debtReasonChars: summary.debtReasonChars.toString(),
    wantChars: summary.wantChars.toString(),
    digestA: summary.digestA.toString(),
    digestB: summary.digestB.toString(),
    maxUpdateDt: summary.maxUpdateDt ?? "<NULL>",
  };
}

function assertSummaryMatches(source, target) {
  const sourceJson = JSON.stringify(source);
  const targetJson = JSON.stringify(target);
  if (sourceJson !== targetJson) {
    throw new Error(`원본·대상 요약 불일치:\n원본 ${sourceJson}\n대상 ${targetJson}`);
  }
}

function parseRecord(line) {
  const record = JSON.parse(line);
  for (const column of integerColumns) {
    if (typeof record[column] !== "string" || !/^\d+$/.test(record[column])) {
      throw new Error(`${column}가 양의 정수 문자열이 아닌 원본 행을 만났습니다.`);
    }
  }
  for (const column of jsonColumns) {
    if (record[column] === null || typeof record[column] !== "object") {
      throw new Error(`${column}가 JSON 객체 또는 배열이 아닌 원본 행을 만났습니다.`);
    }
  }
  if (typeof record.update_dt !== "string") {
    throw new Error("update_dt가 문자열이 아닌 원본 행을 만났습니다.");
  }
  record.update_dt = record.update_dt.replace(/\.\d{1,6}$/, "");
  return record;
}

function createTableQuery(tableReference, tableName) {
  return `
    CREATE TABLE IF NOT EXISTS ${tableReference} (
      ${quoteIdentifier("idx")} bigint NOT NULL,
      ${quoteIdentifier("Case_idx")} bigint NOT NULL,
      ${quoteIdentifier("tel_company")} varchar(8),
      ${quoteIdentifier("phone")} varchar(20),
      ${quoteIdentifier("final_education")} jsonb NOT NULL,
      ${quoteIdentifier("career")} jsonb NOT NULL,
      ${quoteIdentifier("litigation_exp_flag")} smallint,
      ${quoteIdentifier("litigation_exp")} jsonb NOT NULL,
      ${quoteIdentifier("residence_type")} smallint,
      ${quoteIdentifier("residence_start_dt")} varchar(12),
      ${quoteIdentifier("residence_detail")} jsonb NOT NULL,
      ${quoteIdentifier("is_addr_diff")} smallint,
      ${quoteIdentifier("addr_diff_reason")} varchar(500),
      ${quoteIdentifier("is_property_disposal")} smallint,
      ${quoteIdentifier("property_disposal_reason")} varchar(500),
      ${quoteIdentifier("debt_reason")} text,
      ${quoteIdentifier("want")} text,
      ${quoteIdentifier("update_dt")} timestamp NOT NULL,
      CONSTRAINT ${quoteIdentifier(`${tableName}_pkey`)} PRIMARY KEY (${quoteIdentifier("idx")})
    )
  `;
}

async function createIndexes(database, tableReference, tableName) {
  await database.query(
    `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_Case_idx`)} ON ${tableReference} (${quoteIdentifier("Case_idx")})`,
  );
  await database.query(
    `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_Phone`)} ON ${tableReference} (${quoteIdentifier("phone")})`,
  );
}

async function readTargetSummary(database, tableReference) {
  const result = await database.query(`
    SELECT
      ${columns
        .map((column) =>
          column === "update_dt"
            ? `to_char(${quoteIdentifier(column)}, 'YYYY-MM-DD HH24:MI:SS') AS ${quoteIdentifier(column)}`
            : `${quoteIdentifier(column)}`,
        )
        .join(",\n      ")}
    FROM ${tableReference}
    ORDER BY ${quoteIdentifier("idx")};
  `);
  const summary = createSummary();
  for (const record of result.rows) addSummary(summary, record);
  return finalizeSummary(summary);
}

async function main() {
  const replaceRequested = process.argv.includes("--replace");
  const databaseUrl = readEnvironment().get("LAWAND_MIGRATION_DATABASE_URL");
  if (!databaseUrl) throw new Error("LAWAND_MIGRATION_DATABASE_URL이 필요합니다.");

  const database = new pg.Client({ connectionString: databaseUrl });
  await database.connect();

  try {
    await database.query("BEGIN");
    await database.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(targetSchema)}`);

    const loadTableReference = replaceRequested ? stagingTableReference : targetTableReference;
    if (replaceRequested) {
      await database.query(`DROP TABLE IF EXISTS ${stagingTableReference}`);
    }
    await database.query(createTableQuery(loadTableReference, replaceRequested ? stagingTable : targetTable));

    const existingCount = Number(
      (await database.query(`SELECT COUNT(*)::integer AS count FROM ${loadTableReference}`)).rows[0].count,
    );
    if (existingCount !== 0) {
      throw new Error(
        `${replaceRequested ? "동기화 임시" : "대상"} 테이블에 이미 ${existingCount}행이 있어 중단했습니다.`,
      );
    }

    const source = createSourceProcess(sourceStreamQuery);
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

    let remainder = "";
    let records = 0;
    const sourceSummaryAccumulator = createSummary();
    let batch = [];
    const targetColumns = columns.map(quoteIdentifier).join(", ");
    const insertBatch = async () => {
      if (batch.length === 0) return;
      const values = [];
      const placeholders = batch.map((record, rowIndex) => {
        const row = columns.map((column, columnIndex) => {
          if (jsonColumns.has(column)) {
            values.push(canonicalJson(record[column]));
          } else {
            values.push(record[column]);
          }
          return `$${rowIndex * columns.length + columnIndex + 1}`;
        });
        return `(${row.join(", ")})`;
      });
      await database.query(
        `INSERT INTO ${loadTableReference} (${targetColumns}) VALUES ${placeholders.join(", ")}`,
        values,
      );
      batch = [];
    };

    for await (const chunk of source.stdout) {
      remainder += chunk;
      const lines = remainder.split("\n");
      remainder = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const record = parseRecord(line);
        addSummary(sourceSummaryAccumulator, record);
        batch.push(record);
        records += 1;
        if (batch.length >= batchSize) await insertBatch();
      }
    }
    if (remainder.trim()) {
      const record = parseRecord(remainder);
      addSummary(sourceSummaryAccumulator, record);
      batch.push(record);
      records += 1;
    }
    await insertBatch();

    const sourceExitCode = await sourceExit;
    if (sourceExitCode !== 0) {
      throw new Error(
        `리걸프렌즈 RDS 원본 읽기 실패: ${sourceError.trim() || `exit ${sourceExitCode}`}`,
      );
    }
    const sourceSummary = finalizeSummary(sourceSummaryAccumulator);
    if (String(records) !== sourceSummary.rowCount) {
      throw new Error(
        `원본 스트림 행 수 불일치: 요약 ${sourceSummary.rowCount}, 스트림 ${records}`,
      );
    }

    await createIndexes(database, loadTableReference, replaceRequested ? stagingTable : targetTable);
    const targetSummary = await readTargetSummary(database, loadTableReference);
    assertSummaryMatches(sourceSummary, targetSummary);

    if (replaceRequested) {
      await database.query(`DROP TABLE IF EXISTS ${targetTableReference}`);
      await database.query(
        `ALTER TABLE ${stagingTableReference} RENAME CONSTRAINT ${quoteIdentifier(`${stagingTable}_pkey`)} TO ${quoteIdentifier(`${targetTable}_pkey`)}`,
      );
      await database.query(
        `ALTER INDEX ${quoteIdentifier(targetSchema)}.${quoteIdentifier(`idx_${stagingTable}_Case_idx`)} RENAME TO ${quoteIdentifier(`idx_${targetTable}_Case_idx`)}`,
      );
      await database.query(
        `ALTER INDEX ${quoteIdentifier(targetSchema)}.${quoteIdentifier(`idx_${stagingTable}_Phone`)} RENAME TO ${quoteIdentifier(`idx_${targetTable}_Phone`)}`,
      );
      await database.query(
        `ALTER TABLE ${stagingTableReference} RENAME TO ${quoteIdentifier(targetTable)}`,
      );
    }

    await database.query(`REVOKE ALL ON SCHEMA ${quoteIdentifier(targetSchema)} FROM PUBLIC`);
    await database.query(
      `REVOKE ALL ON TABLE ${targetTableReference} FROM PUBLIC, ${quoteIdentifier("lawand_app")}`,
    );
    await database.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE ${targetTableReference} TO ${quoteIdentifier("lawand_viewer")}`,
    );
    await database.query("COMMIT");

    console.log(
      JSON.stringify({
        table: `${targetSchema}.${targetTable}`,
        replace: replaceRequested,
        imported: records,
        source: sourceSummary,
        target: targetSummary,
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
