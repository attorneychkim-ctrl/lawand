import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const environmentPath = resolve(projectRoot, ".env.development.local");
const targetSchema = "CB";
const targetTable = "TblCBCase";
const sourceQuery = `
  SELECT JSON_OBJECT(
    'idx', idx, 'Office_idx', Office_idx, 'Case_idx', Case_idx,
    'case_number', case_number, 'client_name', client_name, 'client_phone', client_phone,
    'court_idx', court_idx, 'court_name', court_name, 'case_type', case_type,
    'total_debt', total_debt, 'priority_debt', priority_debt, 'secured_debt', secured_debt,
    'unsecured_debt', unsecured_debt, 'liquidation_value', liquidation_value,
    'residence_type', residence_type, 'income_type', income_type, 'monthly_income', monthly_income,
    'marriage_state', marriage_state, 'child_count', child_count, 'creditor_count', creditor_count,
    'debt_reasons', debt_reasons, 'monthly_payment', monthly_payment, 'payment_count', payment_count,
    'estimated_spend', estimated_spend, 'dependent_count', dependent_count, 'total_payment', total_payment,
    'living_cost_type', living_cost_type, 'living_cost_cost', living_cost_cost,
    'debt_forgiveness_rate', debt_forgiveness_rate, 'repayment_rate', repayment_rate,
    'committee_fee_rate', committee_fee_rate, 'progress_history', progress_history,
    'register_dt', register_dt, 'create_dt', create_dt, 'update_dt', update_dt
  )
  FROM CB.TblCBCase
  ORDER BY idx;
`;
const columns = [
  "idx", "Office_idx", "Case_idx", "case_number", "client_name", "client_phone",
  "court_idx", "court_name", "case_type", "total_debt", "priority_debt", "secured_debt",
  "unsecured_debt", "liquidation_value", "residence_type", "income_type", "monthly_income",
  "marriage_state", "child_count", "creditor_count", "debt_reasons", "monthly_payment",
  "payment_count", "estimated_spend", "dependent_count", "total_payment", "living_cost_type",
  "living_cost_cost", "debt_forgiveness_rate", "repayment_rate", "committee_fee_rate",
  "progress_history", "register_dt", "create_dt", "update_dt",
];

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

function normalizeJson(value) {
  if (typeof value !== "string") return value;
  return JSON.parse(value);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function createSourceStream() {
  return spawn("sudo", ["-n", "mysql", "--batch", "--raw", "--skip-column-names", "-e", sourceQuery], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function main() {
  if (process.argv.includes("--replace")) {
    throw new Error("기존 원천 테이블 보호를 위해 --replace는 지원하지 않습니다.");
  }

  const databaseUrl = readEnvironment().get("LAWAND_MIGRATION_DATABASE_URL");
  if (!databaseUrl) throw new Error("LAWAND_MIGRATION_DATABASE_URL이 필요합니다.");

  const database = new pg.Client({ connectionString: databaseUrl });
  await database.connect();
  try {
    await database.query("BEGIN");
    await database.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(targetSchema)}`);
    await database.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} (
        idx bigint PRIMARY KEY,
        "Office_idx" integer NOT NULL,
        "Case_idx" integer NOT NULL UNIQUE,
        case_number varchar(20) NOT NULL,
        client_name varchar(50) NOT NULL,
        client_phone varchar(20) NOT NULL,
        court_idx integer NOT NULL,
        court_name varchar(20) NOT NULL,
        case_type smallint DEFAULT 0,
        total_debt real DEFAULT 0,
        priority_debt boolean DEFAULT false,
        secured_debt bigint DEFAULT 0,
        unsecured_debt bigint DEFAULT 0,
        liquidation_value bigint DEFAULT 0,
        residence_type smallint DEFAULT 0,
        income_type smallint DEFAULT 0,
        monthly_income real DEFAULT 0,
        marriage_state smallint DEFAULT 0,
        child_count integer DEFAULT 0,
        creditor_count integer NOT NULL DEFAULT 0,
        debt_reasons jsonb,
        monthly_payment real DEFAULT 0,
        payment_count integer DEFAULT 0,
        estimated_spend real DEFAULT 0,
        dependent_count real DEFAULT 0,
        total_payment real DEFAULT 0,
        living_cost_type smallint,
        living_cost_cost bigint,
        debt_forgiveness_rate real DEFAULT 0,
        repayment_rate real DEFAULT 0,
        committee_fee_rate real DEFAULT 0,
        progress_history jsonb,
        register_dt timestamp NOT NULL,
        create_dt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_dt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const targetCount = Number((await database.query(`SELECT count(*)::integer AS count FROM ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)}`)).rows[0].count);
    if (targetCount !== 0) {
      throw new Error(`대상 테이블에 이미 ${targetCount}행이 있어 중단했습니다.`);
    }
    await database.query(`REVOKE ALL ON SCHEMA ${quoteIdentifier(targetSchema)} FROM PUBLIC`);
    await database.query(`REVOKE ALL ON TABLE ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} FROM PUBLIC`);
    await database.query("COMMIT");

    const source = createSourceStream();
    let sourceError = "";
    const sourceExit = new Promise((resolve, reject) => {
      source.once("error", reject);
      source.once("close", resolve);
    });
    source.stderr.setEncoding("utf8");
    source.stderr.on("data", (chunk) => { sourceError += chunk; });
    source.stdout.setEncoding("utf8");

    let remainder = "";
    let records = 0;
    let batch = [];
    const insertBatch = async () => {
      if (batch.length === 0) return;
      const values = [];
      const placeholders = batch.map((record, rowIndex) => {
        const row = columns.map((column, columnIndex) => {
          values.push(record[column]);
          return `$${rowIndex * columns.length + columnIndex + 1}`;
        });
        return `(${row.join(", ")})`;
      });
      const targetColumns = columns.map(quoteIdentifier).join(", ");
      await database.query(`INSERT INTO ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} (${targetColumns}) VALUES ${placeholders.join(", ")}`, values);
      batch = [];
    };

    await database.query("BEGIN");
    for await (const chunk of source.stdout) {
      remainder += chunk;
      const lines = remainder.split("\n");
      remainder = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const record = JSON.parse(line);
        for (const column of ["debt_reasons", "progress_history"]) {
          record[column] = record[column] == null ? null : JSON.stringify(normalizeJson(record[column]));
        }
        record.priority_debt = Boolean(record.priority_debt);
        batch.push(record);
        records += 1;
        if (batch.length === 100) await insertBatch();
      }
    }
    if (remainder) {
      const record = JSON.parse(remainder);
      for (const column of ["debt_reasons", "progress_history"]) {
        record[column] = record[column] == null ? null : JSON.stringify(normalizeJson(record[column]));
      }
      record.priority_debt = Boolean(record.priority_debt);
      batch.push(record);
      records += 1;
    }
    await insertBatch();
    const exitCode = await sourceExit;
    if (exitCode !== 0) throw new Error(`MySQL 원본 읽기 실패: ${sourceError.trim() || `exit ${exitCode}`}`);

    const target = await database.query(`SELECT count(*)::integer AS count, min(idx)::text AS min_idx, max(idx)::text AS max_idx FROM ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)}`);
    if (Number(target.rows[0].count) !== records) {
      throw new Error(`행 수 불일치: 원본 ${records}, 대상 ${target.rows[0].count}`);
    }
    await database.query(`CREATE INDEX "idx_TblCBCase_Office_idx" ON ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} ("Office_idx")`);
    await database.query(`CREATE INDEX "idx_TblCBCase_case_number" ON ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} (case_number)`);
    await database.query(`CREATE INDEX "idx_TblCBCase_client_info" ON ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} (client_name, client_phone)`);
    await database.query(`CREATE INDEX "idx_TblCBCase_court_info" ON ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} (court_idx, court_name)`);
    await database.query(`CREATE INDEX "idx_TblCBCase_case_optimized" ON ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} (case_type, court_idx, register_dt DESC, income_type, marriage_state, monthly_income, total_debt, priority_debt, liquidation_value, child_count)`);
    await database.query("COMMIT");
    console.log(JSON.stringify({ imported: records, target: target.rows[0] }));
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
