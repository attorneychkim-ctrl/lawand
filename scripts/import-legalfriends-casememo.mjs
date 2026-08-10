import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import pg from "pg";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const environmentPath = resolve(projectRoot, ".env.development.local");
const targetSchema = "CB";
const targetTable = "TblCaseMemo";
const targetTableReference = '"CB"."TblCaseMemo"';
const stagingTable = `${targetTable}__sync`;
const stagingTableReference = `"${targetSchema}"."${stagingTable}"`;
const columns = ["Case_idx", "update_dt", "memo"];
const batchSize = 100;

const sourceSshHost =
  process.env.LAWAND_LEGALFRIENDS_SSH_HOST ?? "ec2-user@43.200.156.135";
const sourceSshKey =
  process.env.LAWAND_LEGALFRIENDS_SSH_KEY ??
  resolve(projectRoot, "../../newLawAndERP.pem");
const sourceEnvironmentPath =
  process.env.LAWAND_LEGALFRIENDS_REMOTE_ENV ?? "/var/www/html/lawandERP/.env";

const sourceStreamQuery = `
  SELECT JSON_OBJECT(
    'Case_idx', Case_idx,
    'update_dt', update_dt,
    'memo', memo
  )
  FROM CONTENT.TblCaseMemo
  ORDER BY Case_idx;
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
    `rds_host=$(awk -F= '/^RDS_DB_HOST=/{print substr($0,index($0,"=" )+1)}' "$env_file")`,
    `rds_port=$(awk -F= '/^RDS_DB_PORT=/{print substr($0,index($0,"=" )+1)}' "$env_file")`,
    `rds_database=$(awk -F= '/^RDS_DB_DATABASE=/{print substr($0,index($0,"=" )+1)}' "$env_file")`,
    `rds_user=$(awk -F= '/^RDS_DB_USERNAME=/{print substr($0,index($0,"=" )+1)}' "$env_file")`,
    `rds_password=$(awk -F= '/^RDS_DB_PASSWORD=/{print substr($0,index($0,"=" )+1)}' "$env_file")`,
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

function createSourceSummary() {
  return {
    rowCount: 0n,
    minCaseIdx: null,
    maxCaseIdx: null,
    nullUpdateDt: 0n,
    nullMemo: 0n,
    memoChars: 0n,
    digestA: 0n,
    digestB: 0n,
    maxUpdateDt: null,
  };
}

function addSourceRecord(summary, record) {
  summary.rowCount += 1n;
  summary.minCaseIdx =
    summary.minCaseIdx === null
      ? record.Case_idx
      : Math.min(summary.minCaseIdx, record.Case_idx);
  summary.maxCaseIdx =
    summary.maxCaseIdx === null
      ? record.Case_idx
      : Math.max(summary.maxCaseIdx, record.Case_idx);

  if (record.update_dt === null) {
    summary.nullUpdateDt += 1n;
  } else if (
    summary.maxUpdateDt === null ||
    record.update_dt > summary.maxUpdateDt
  ) {
    summary.maxUpdateDt = record.update_dt;
  }

  if (record.memo === null) {
    summary.nullMemo += 1n;
  } else {
    summary.memoChars += BigInt(Array.from(record.memo).length);
  }

  const canonicalRecord = [
    String(record.Case_idx),
    record.update_dt ?? "<NULL>",
    record.memo === null
      ? "<NULL>"
      : Buffer.from(record.memo, "utf8").toString("hex"),
  ].join("#");
  const digest = createHash("md5").update(canonicalRecord).digest("hex");
  summary.digestA ^= BigInt(`0x${digest.slice(0, 15)}`);
  summary.digestB ^= BigInt(`0x${digest.slice(15, 30)}`);
}

function finalizeSourceSummary(summary) {
  return {
    rowCount: summary.rowCount.toString(),
    minCaseIdx: String(summary.minCaseIdx ?? -1),
    maxCaseIdx: String(summary.maxCaseIdx ?? -1),
    nullUpdateDt: summary.nullUpdateDt.toString(),
    nullMemo: summary.nullMemo.toString(),
    memoChars: summary.memoChars.toString(),
    digestA: summary.digestA.toString(),
    digestB: summary.digestB.toString(),
    maxUpdateDt: summary.maxUpdateDt ?? "<NULL>",
  };
}

function targetSummaryQuery(tableReference) {
  const hashExpression = `md5(
    ${quoteIdentifier("Case_idx")}::text || '#' ||
    coalesce(to_char(${quoteIdentifier("update_dt")}, 'YYYY-MM-DD HH24:MI:SS'), '<NULL>') || '#' ||
    coalesce(encode(convert_to(${quoteIdentifier("memo")}, 'UTF8'), 'hex'), '<NULL>')
  )`;

  return `
    SELECT
      COUNT(*)::text AS row_count,
      COALESCE(MIN(${quoteIdentifier("Case_idx")})::text, '-1') AS min_case_idx,
      COALESCE(MAX(${quoteIdentifier("Case_idx")})::text, '-1') AS max_case_idx,
      COALESCE(SUM(CASE WHEN ${quoteIdentifier("update_dt")} IS NULL THEN 1 ELSE 0 END), 0)::text AS null_update_dt,
      COALESCE(SUM(CASE WHEN ${quoteIdentifier("memo")} IS NULL THEN 1 ELSE 0 END), 0)::text AS null_memo,
      COALESCE(SUM(length(${quoteIdentifier("memo")})), 0)::text AS memo_chars,
      COALESCE(bit_xor((('x' || substring(${hashExpression} FROM 1 FOR 15))::bit(60))::bigint), 0)::text AS digest_a,
      COALESCE(bit_xor((('x' || substring(${hashExpression} FROM 16 FOR 15))::bit(60))::bigint), 0)::text AS digest_b,
      COALESCE(to_char(MAX(${quoteIdentifier("update_dt")}), 'YYYY-MM-DD HH24:MI:SS'), '<NULL>') AS max_update_dt
    FROM ${tableReference};
  `;
}

function parseTargetSummary(row) {
  return {
    rowCount: row.row_count,
    minCaseIdx: row.min_case_idx,
    maxCaseIdx: row.max_case_idx,
    nullUpdateDt: row.null_update_dt,
    nullMemo: row.null_memo,
    memoChars: row.memo_chars,
    digestA: row.digest_a,
    digestB: row.digest_b,
    maxUpdateDt: row.max_update_dt,
  };
}

function assertSummaryMatches(source, target) {
  for (const key of Object.keys(source)) {
    if (source[key] !== target[key]) {
      throw new Error(
        `원본·대상 요약 불일치 (${key}): 원본 ${source[key]}, 대상 ${target[key]}`,
      );
    }
  }
}

function parseRecord(line) {
  const record = JSON.parse(line);
  if (!Number.isInteger(record.Case_idx)) {
    throw new Error("Case_idx가 정수가 아닌 원본 행을 만났습니다.");
  }
  if (typeof record.update_dt === "string") {
    record.update_dt = record.update_dt.replace(/\.\d{1,6}$/, "");
  }
  return record;
}

async function main() {
  const replaceRequested = process.argv.includes("--replace");

  const databaseUrl = readEnvironment().get("LAWAND_MIGRATION_DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("LAWAND_MIGRATION_DATABASE_URL이 필요합니다.");
  }

  const database = new pg.Client({ connectionString: databaseUrl });
  await database.connect();

  try {
    await database.query("BEGIN");
    await database.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(targetSchema)}`);

    const loadTableReference = replaceRequested
      ? stagingTableReference
      : targetTableReference;
    if (replaceRequested) {
      await database.query(`DROP TABLE IF EXISTS ${stagingTableReference}`);
    }
    await database.query(`
      CREATE TABLE IF NOT EXISTS ${loadTableReference} (
        ${quoteIdentifier("Case_idx")} integer NOT NULL UNIQUE,
        ${quoteIdentifier("update_dt")} timestamp,
        ${quoteIdentifier("memo")} text
      )
    `);

    const existingCount = Number(
      (
        await database.query(`SELECT COUNT(*)::integer AS count FROM ${loadTableReference}`)
      ).rows[0].count,
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
    const sourceSummaryAccumulator = createSourceSummary();
    let batch = [];
    const targetColumns = columns.map(quoteIdentifier).join(", ");
    const insertBatch = async () => {
      if (batch.length === 0) return;

      const values = [];
      const placeholders = batch.map((record, rowIndex) => {
        const row = columns.map((column, columnIndex) => {
          values.push(record[column] ?? null);
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
        addSourceRecord(sourceSummaryAccumulator, record);
        batch.push(record);
        records += 1;
        if (batch.length >= batchSize) await insertBatch();
      }
    }
    if (remainder.trim()) {
      const record = parseRecord(remainder);
      addSourceRecord(sourceSummaryAccumulator, record);
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
    const sourceSummary = finalizeSourceSummary(sourceSummaryAccumulator);
    if (String(records) !== sourceSummary.rowCount) {
      throw new Error(
        `원본 스트림 행 수 불일치: 요약 ${sourceSummary.rowCount}, 스트림 ${records}`,
      );
    }

    const targetSummary = parseTargetSummary(
      (await database.query(targetSummaryQuery(loadTableReference))).rows[0],
    );
    assertSummaryMatches(sourceSummary, targetSummary);

    if (replaceRequested) {
      await database.query(`DROP TABLE IF EXISTS ${targetTableReference}`);
      await database.query(
        `ALTER INDEX ${quoteIdentifier(targetSchema)}.${quoteIdentifier(`${stagingTable}_Case_idx_key`)} RENAME TO ${quoteIdentifier(`${targetTable}_Case_idx_key`)}`,
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
