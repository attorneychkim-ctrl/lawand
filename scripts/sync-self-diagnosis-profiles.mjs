import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

const MODEL_VERSION = "office-56-v3";
const SOURCE_OFFICE_IDX = 56;
const replace = process.argv.includes("--replace");

function readEnvironment() {
  const path = resolve(process.cwd(), ".env.development.local");
  return new Map(
    readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function money(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function eventDate(history, matcher) {
  if (!Array.isArray(history)) return null;
  const dates = history
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.text === "string" &&
        typeof item.date === "string" &&
        matcher(item.text),
    )
    .map((item) => new Date(`${item.date}T00:00:00.000Z`))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
  return dates[0] ?? null;
}

function elapsedDays(start, end) {
  if (!start || !end || end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function dateString(value) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function profile(row, importedAt) {
  const filing = eventDate(row.progress_history, (text) => text === "신청서접수");
  const prohibition = eventDate(
    row.progress_history,
    (text) => text.startsWith("금지명령(") && !text.includes("기각"),
  );
  const commencement = eventDate(
    row.progress_history,
    (text) => text === "개인회생절차개시결정",
  );
  const approval = eventDate(
    row.progress_history,
    (text) => text === "변제계획인가결정",
  );
  const bankruptcy = eventDate(
    row.progress_history,
    (text) => text.includes("파산선고") && !text.includes("기각"),
  );
  const discharge = eventDate(
    row.progress_history,
    (text) => text.includes("면책허가결정") && !text.includes("불허가"),
  );
  const monthlyPayment = money(row.monthly_payment);
  const paymentCount = Math.max(0, Math.min(60, Number(row.payment_count ?? 0)));

  return {
    id: randomUUID(),
    modelVersion: MODEL_VERSION,
    sourceOfficeIdx: SOURCE_OFFICE_IDX,
    caseType: Number(row.case_type),
    courtIdx: Number(row.court_idx),
    courtName: String(row.court_name),
    monthlyIncome: money(row.monthly_income),
    incomeType: Number(row.income_type ?? 0),
    residenceType: Number(row.residence_type ?? 100),
    marriageState: Number(row.marriage_state ?? 1),
    minorChildCount: Math.max(0, Number(row.child_count ?? 0)),
    dependentCount: Math.max(0, Number(row.dependent_count ?? 0)),
    totalDebt: money(row.total_debt),
    liquidationValue: money(row.liquidation_value),
    priorityDebt: Boolean(row.priority_debt),
    monthlyPayment,
    paymentCount,
    estimatedSpend: money(row.estimated_spend),
    livingCostType: Math.max(0, Number(row.living_cost_type ?? 0)),
    livingCostCost: money(row.living_cost_cost),
    totalPayment: money(row.total_payment || monthlyPayment * paymentCount),
    repaymentRate: Math.max(0, Number(row.repayment_rate ?? 0)),
    filingDate: dateString(filing),
    prohibitionDate: dateString(prohibition),
    commencementDate: dateString(commencement),
    approvalDate: dateString(approval),
    bankruptcyDate: dateString(bankruptcy),
    dischargeDate: dateString(discharge),
    filingToProhibitionDays: elapsedDays(filing, prohibition),
    filingToCommencementDays: elapsedDays(filing, commencement),
    filingToApprovalDays: elapsedDays(filing, approval),
    filingToBankruptcyDays: elapsedDays(filing, bankruptcy),
    filingToDischargeDays: elapsedDays(filing, discharge),
    importedAt,
  };
}

async function main() {
  const databaseUrl = readEnvironment().get("LAWAND_MIGRATION_DATABASE_URL");
  if (!databaseUrl) throw new Error("LAWAND_MIGRATION_DATABASE_URL이 필요합니다.");

  const database = new pg.Client({ connectionString: databaseUrl });
  await database.connect();
  try {
    const source = await database.query(`
      SELECT
        case_type,
        court_idx,
        court_name,
        monthly_income,
        income_type,
        residence_type,
        marriage_state,
        child_count,
        dependent_count,
        total_debt,
        liquidation_value,
        priority_debt,
        monthly_payment,
        payment_count,
        estimated_spend,
        living_cost_type,
        living_cost_cost,
        total_payment,
        repayment_rate,
        progress_history
      FROM "CB"."TblCBCase"
      WHERE "Office_idx" = $1
        AND case_type IN (1, 2)
        AND total_debt > 0
        AND progress_history IS NOT NULL
    `, [SOURCE_OFFICE_IDX]);

    const importedAt = new Date();
    const profiles = source.rows
      .map((row) => profile(row, importedAt))
      .filter(
        (item) =>
          item.filingDate !== null &&
          (item.caseType === 2
            ? item.bankruptcyDate !== null
            : item.monthlyPayment > 0 &&
            item.paymentCount > 0 &&
            item.commencementDate !== null &&
            item.approvalDate !== null),
      );

    await database.query("BEGIN");
    const existing = await database.query(
      "SELECT count(*)::integer AS count FROM self_diagnosis_case_profiles",
    );
    if (Number(existing.rows[0].count) > 0 && !replace) {
      throw new Error(
        `대상 읽기 모델에 ${existing.rows[0].count}행이 있습니다. 재구축하려면 --replace를 사용하세요.`,
      );
    }
    if (replace) {
      await database.query("DELETE FROM self_diagnosis_case_profiles");
    }

    const columns = [
      "id",
      "model_version",
      "source_office_idx",
      "case_type",
      "court_idx",
      "court_name",
      "monthly_income",
      "income_type",
      "residence_type",
      "marriage_state",
      "minor_child_count",
      "dependent_count",
      "total_debt",
      "liquidation_value",
      "priority_debt",
      "monthly_payment",
      "payment_count",
      "estimated_spend",
      "living_cost_type",
      "living_cost_cost",
      "total_payment",
      "repayment_rate",
      "filing_date",
      "prohibition_date",
      "commencement_date",
      "approval_date",
      "bankruptcy_date",
      "discharge_date",
      "filing_to_prohibition_days",
      "filing_to_commencement_days",
      "filing_to_approval_days",
      "filing_to_bankruptcy_days",
      "filing_to_discharge_days",
      "imported_at",
      "created_at",
      "updated_at",
    ];
    const keys = [
      "id",
      "modelVersion",
      "sourceOfficeIdx",
      "caseType",
      "courtIdx",
      "courtName",
      "monthlyIncome",
      "incomeType",
      "residenceType",
      "marriageState",
      "minorChildCount",
      "dependentCount",
      "totalDebt",
      "liquidationValue",
      "priorityDebt",
      "monthlyPayment",
      "paymentCount",
      "estimatedSpend",
      "livingCostType",
      "livingCostCost",
      "totalPayment",
      "repaymentRate",
      "filingDate",
      "prohibitionDate",
      "commencementDate",
      "approvalDate",
      "bankruptcyDate",
      "dischargeDate",
      "filingToProhibitionDays",
      "filingToCommencementDays",
      "filingToApprovalDays",
      "filingToBankruptcyDays",
      "filingToDischargeDays",
      "importedAt",
      "importedAt",
      "importedAt",
    ];

    for (let offset = 0; offset < profiles.length; offset += 100) {
      const batch = profiles.slice(offset, offset + 100);
      const values = [];
      const placeholders = batch.map((item, rowIndex) => {
        const row = keys.map((key, columnIndex) => {
          values.push(item[key]);
          return `$${rowIndex * keys.length + columnIndex + 1}`;
        });
        return `(${row.join(", ")})`;
      });
      await database.query(
        `INSERT INTO self_diagnosis_case_profiles (${columns.map((column) => `"${column}"`).join(", ")}) VALUES ${placeholders.join(", ")}`,
        values,
      );
    }
    await database.query("COMMIT");

    const counts = await database.query(`
      SELECT case_type, count(*)::integer AS count
      FROM self_diagnosis_case_profiles
      GROUP BY case_type
      ORDER BY case_type
    `);
    console.log(
      JSON.stringify({
        modelVersion: MODEL_VERSION,
        sourceOfficeIdx: SOURCE_OFFICE_IDX,
        imported: profiles.length,
        counts: counts.rows,
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
