import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pg from "pg";

const execFileAsync = promisify(execFile);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const localEnvironmentPath = resolve(projectRoot, ".env.development.local");
const sourceKey = "lawandfirm-kboard-22-bankruptcy";
const legacyBoardUrl =
  "https://lawandfirm.com/bank/successioncase_epilogue/";

const keywordMap = new Map([
  ["kind", "친절"],
  ["careful", "세심"],
  ["meticulous", "꼼꼼"],
  ["trust", "신뢰"],
  ["reassured", "든든"],
  ["precise", "정확"],
  ["quick", "빠름"],
  ["systematic", "체계적"],
]);

function parseArguments(argv) {
  const values = new Map();
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!argument?.startsWith("--")) {
      throw new Error(`알 수 없는 인자입니다: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} 값이 필요합니다.`);
    }
    values.set(argument.slice(2), value);
    index += 1;
  }

  return {
    database: values.get("database") ?? process.env.LAWAND_LEGACY_REVIEWS_DB,
    dryRun,
    host: values.get("host") ?? process.env.LAWAND_LEGACY_REVIEWS_HOST,
    password: process.env.LAWAND_LEGACY_REVIEWS_PASSWORD,
    port: values.get("port") ?? process.env.LAWAND_LEGACY_REVIEWS_PORT ?? "3306",
    user: values.get("user") ?? process.env.LAWAND_LEGACY_REVIEWS_USER,
  };
}

function parseEnvironmentFile(contents) {
  const values = new Map();
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

function promptSecret(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error(
      "원본 DB 비밀번호를 LAWAND_LEGACY_REVIEWS_PASSWORD 환경변수로 전달해 주세요.",
    );
  }

  return new Promise((resolveSecret, reject) => {
    let value = "";
    process.stdout.write(question);
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolveSecret(value);
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          reject(new Error("사용자가 입력을 취소했습니다."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };

    process.stdin.on("data", onData);
  });
}

function required(value, label) {
  if (!value) {
    throw new Error(`${label}이 필요합니다.`);
  }
  return value;
}

function decodeHtml(value) {
  const namedEntities = new Map([
    ["amp", "&"],
    ["apos", "'"],
    ["gt", ">"],
    ["lt", "<"],
    ["nbsp", " "],
    ["quot", '"'],
  ]);

  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, code) => {
      if (code.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
      return namedEntities.get(code.toLowerCase()) ?? entity;
    },
  );
}

function plainText(value) {
  return decodeHtml(
    String(value ?? "")
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*\/p\s*>/gi, "\n\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function maskAuthor(value) {
  const original = plainText(value).replace(/\s*고객님\s*$/u, "").trim();
  if (!original) return "익명 고객";
  if (original.includes("*")) return `${original} 고객님`;

  const characters = [...original];
  if (characters.length === 1) return `${characters[0]}* 고객님`;
  return `${characters[0]}${"*".repeat(Math.min(characters.length - 1, 2))} 고객님`;
}

function parseKboardDate(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{14}$/.test(normalized)) return null;
  const date = `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  const time = `${normalized.slice(8, 10)}:${normalized.slice(10, 12)}:${normalized.slice(12, 14)}`;
  const parsed = new Date(`${date}T${time}+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function practiceArea(category) {
  if (category === "개인회생") return "personal_rehabilitation";
  if (category === "파산면책") return "personal_bankruptcy";
  return "other";
}

function progressStage(category) {
  if (category === "상담") return "consultation";
  if (category === "개시결정") return "commencement";
  if (category === "면책결정") return "discharge";
  return "other";
}

function experienceKeywords(value) {
  const result = [];
  for (const token of String(value ?? "").split(",")) {
    const mapped = keywordMap.get(token.trim().toLowerCase());
    if (mapped && !result.includes(mapped)) result.push(mapped);
  }
  return result;
}

function piiFlags(value) {
  const flags = [];
  const checks = [
    ["phone", /(?:^|[^\d])01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}(?:[^\d]|$)/u],
    ["email", /[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu],
    ["resident_registration_number", /(?:^|[^\d])\d{6}[-\s]?[1-8]\d{6}(?:[^\d]|$)/u],
    ["case_number", /20\d{2}\s*[가-힣]{1,8}\s*\d{3,}/u],
    [
      "account_number",
      /(?:계좌|은행|입금)[^\n\d]{0,12}\d{2,6}[-\s]\d{2,6}[-\s]\d{2,8}/u,
    ],
    [
      "detailed_address",
      /(?:서울|부산|대전|대구|인천|광주|울산|세종|제주|경기|강원|충청|경상|전라)[^\n]{0,30}(?:구|군|시)\s+[가-힣\d-]{2,}\s*(?:로|길|동)\s*\d+/u,
    ],
  ];

  for (const [flag, pattern] of checks) {
    if (pattern.test(value)) flags.push(flag);
  }
  return flags;
}

function sourceHash(row) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        category1: row.category1,
        category2: row.category2,
        content: row.content,
        date: row.date,
        legacyContentId: row.legacyContentId,
        legacyId: row.legacyId,
        memberDisplay: row.memberDisplay,
        status: row.status,
        title: row.title,
        update: row.update,
      }),
    )
    .digest();
}

function normalizeSourceRow(row, batchId, importedAt) {
  const title = plainText(row.title);
  const content = plainText(row.content);
  const originalCreatedAt = parseKboardDate(row.date);
  const originalUpdatedAt = parseKboardDate(row.update);
  if (!title || !content || !originalCreatedAt) {
    throw new Error(`원본 후기 ${row.legacyId}의 필수 필드가 올바르지 않습니다.`);
  }

  const flags = piiFlags(`${title}\n${content}`);
  const isDeleted = row.status === "trash";
  const publicationStatus = isDeleted
    ? "withheld"
    : flags.length > 0
      ? "review_required"
      : "published";

  return {
    authorDisplay: maskAuthor(row.memberDisplay),
    commentCount: Math.max(0, Number(row.commentCount) || 0),
    content,
    experienceKeywords: experienceKeywords(row.keywords),
    id: randomUUID(),
    importBatchId: batchId,
    legacyCategory1: plainText(row.category1) || null,
    legacyCategory2: plainText(row.category2) || null,
    legacyContentId: Number(row.legacyContentId) || null,
    legacyId: Number(row.legacyId),
    legacyUrl: `${legacyBoardUrl}?mod=document&uid=${Number(row.legacyContentId) || Number(row.legacyId)}`,
    originalCreatedAt,
    originalUpdatedAt,
    piiFlags: flags,
    piiStatus: flags.length > 0 ? "flagged" : "clear",
    practiceArea: practiceArea(plainText(row.category1)),
    progressStage: progressStage(plainText(row.category2)),
    publicationStatus,
    publishedAt: publicationStatus === "published" ? importedAt : null,
    sourceHash: sourceHash(row),
    sourceKey,
    sourceStatus: row.status === null ? null : String(row.status),
    title,
  };
}

async function readSourceRows(configuration) {
  const query = `
    SET NAMES utf8mb4;
    SELECT
      c.uid,
      REPLACE(TO_BASE64(IFNULL(c.thumbnail_name, '')), '\\n', ''),
      REPLACE(TO_BASE64(IFNULL(c.member_display, '')), '\\n', ''),
      REPLACE(TO_BASE64(c.title), '\\n', ''),
      REPLACE(TO_BASE64(c.content), '\\n', ''),
      REPLACE(TO_BASE64(IFNULL(c.date, '')), '\\n', ''),
      REPLACE(TO_BASE64(IFNULL(c.update, '')), '\\n', ''),
      COALESCE(c.comment, 0),
      REPLACE(TO_BASE64(IFNULL(c.category1, '')), '\\n', ''),
      REPLACE(TO_BASE64(IFNULL(c.category2, '')), '\\n', ''),
      IF(c.status IS NULL, '~', REPLACE(TO_BASE64(c.status), '\\n', '')),
      IF(a.keywords IS NULL, '~', REPLACE(TO_BASE64(a.keywords), '\\n', ''))
    FROM wp_kboard_board_content c
    LEFT JOIN (
      SELECT details.*
      FROM wp_epilogueaddinfos details
      INNER JOIN (
        SELECT main_id, MAX(id) AS id
        FROM wp_epilogueaddinfos
        GROUP BY main_id
      ) latest ON latest.id = details.id
    ) a ON a.main_id = c.uid
    WHERE c.board_id = 22
      AND c.thumbnail_file = '회생파산'
    ORDER BY c.uid;
  `;

  const { stdout } = await execFileAsync(
    "mysql",
    [
      "--batch",
      "--raw",
      "--skip-column-names",
      "--binary-as-hex=0",
      "--default-character-set=utf8mb4",
      "--ssl-mode=PREFERRED",
      "--connect-timeout=15",
      "--host",
      configuration.host,
      "--port",
      configuration.port,
      "--user",
      configuration.user,
      configuration.database,
      "--execute",
      query,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        MYSQL_PWD: configuration.password,
      },
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  const decode = (value) =>
    value === "~" ? null : Buffer.from(value, "base64").toString("utf8");

  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const fields = line.split("\t");
      if (fields.length !== 12) {
        throw new Error(
          `원본 후기 행의 필드 수가 올바르지 않습니다: ${fields.length}`,
        );
      }
      return {
        category1: decode(fields[8]),
        category2: decode(fields[9]),
        commentCount: Number(fields[7]) || 0,
        content: decode(fields[4]),
        date: decode(fields[5]),
        keywords: decode(fields[11]),
        legacyContentId: decode(fields[1]),
        legacyId: Number(fields[0]),
        memberDisplay: decode(fields[2]),
        status: decode(fields[10]),
        title: decode(fields[3]),
        update: decode(fields[6]),
      };
    });
}

async function importRows(databaseUrl, rows, batch) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    application_name: "lawand-review-import",
    max: 1,
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO review_import_batches (
        id, source_key, source_row_count, source_sha256,
        published_count, review_required_count, withheld_count,
        started_at, completed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        batch.id,
        sourceKey,
        rows.length,
        batch.sourceSha256,
        batch.publishedCount,
        batch.reviewRequiredCount,
        batch.withheldCount,
        batch.startedAt,
        batch.completedAt,
      ],
    );

    for (const row of rows) {
      await client.query(
        `INSERT INTO customer_reviews (
          id, source_key, legacy_id, legacy_content_id, legacy_url,
          author_display, title, content, practice_area, progress_stage,
          legacy_category1, legacy_category2, experience_keywords,
          comment_count, source_status, publication_status, pii_status,
          pii_flags, source_hash, import_batch_id, original_created_at,
          original_updated_at, published_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23
        )
        ON CONFLICT (source_key, legacy_id) DO UPDATE SET
          legacy_content_id = EXCLUDED.legacy_content_id,
          legacy_url = EXCLUDED.legacy_url,
          author_display = EXCLUDED.author_display,
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          practice_area = EXCLUDED.practice_area,
          progress_stage = EXCLUDED.progress_stage,
          legacy_category1 = EXCLUDED.legacy_category1,
          legacy_category2 = EXCLUDED.legacy_category2,
          experience_keywords = EXCLUDED.experience_keywords,
          comment_count = EXCLUDED.comment_count,
          source_status = EXCLUDED.source_status,
          publication_status = CASE
            WHEN customer_reviews.pii_status = 'reviewed'
              AND customer_reviews.source_hash = EXCLUDED.source_hash
            THEN customer_reviews.publication_status
            ELSE EXCLUDED.publication_status
          END,
          pii_status = CASE
            WHEN customer_reviews.pii_status = 'reviewed'
              AND customer_reviews.source_hash = EXCLUDED.source_hash
            THEN customer_reviews.pii_status
            ELSE EXCLUDED.pii_status
          END,
          pii_flags = CASE
            WHEN customer_reviews.pii_status = 'reviewed'
              AND customer_reviews.source_hash = EXCLUDED.source_hash
            THEN customer_reviews.pii_flags
            ELSE EXCLUDED.pii_flags
          END,
          source_hash = EXCLUDED.source_hash,
          import_batch_id = EXCLUDED.import_batch_id,
          original_created_at = EXCLUDED.original_created_at,
          original_updated_at = EXCLUDED.original_updated_at,
          published_at = CASE
            WHEN customer_reviews.pii_status = 'reviewed'
              AND customer_reviews.source_hash = EXCLUDED.source_hash
            THEN customer_reviews.published_at
            ELSE EXCLUDED.published_at
          END,
          updated_at = now()`,
        [
          row.id,
          row.sourceKey,
          row.legacyId,
          row.legacyContentId,
          row.legacyUrl,
          row.authorDisplay,
          row.title,
          row.content,
          row.practiceArea,
          row.progressStage,
          row.legacyCategory1,
          row.legacyCategory2,
          row.experienceKeywords,
          row.commentCount,
          row.sourceStatus,
          row.publicationStatus,
          row.piiStatus,
          row.piiFlags,
          row.sourceHash,
          row.importBatchId,
          row.originalCreatedAt,
          row.originalUpdatedAt,
          row.publishedAt,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const configuration = parseArguments(process.argv.slice(2));
  configuration.host = required(configuration.host, "원본 DB 호스트");
  configuration.user = required(configuration.user, "원본 DB 사용자");
  configuration.database = required(configuration.database, "원본 DB 이름");
  configuration.password =
    configuration.password ?? (await promptSecret("원본 DB 비밀번호: "));

  const startedAt = new Date();
  const sourceRows = await readSourceRows(configuration);
  const completedAt = new Date();
  const batchId = randomUUID();
  const normalizedRows = sourceRows.map((row) =>
    normalizeSourceRow(row, batchId, completedAt),
  );
  const serializedSource = sourceRows
    .map((row) => JSON.stringify(row))
    .join("\n");
  const batch = {
    completedAt,
    id: batchId,
    publishedCount: normalizedRows.filter(
      (row) => row.publicationStatus === "published",
    ).length,
    reviewRequiredCount: normalizedRows.filter(
      (row) => row.publicationStatus === "review_required",
    ).length,
    sourceSha256: createHash("sha256").update(serializedSource).digest(),
    startedAt,
    withheldCount: normalizedRows.filter(
      (row) => row.publicationStatus === "withheld",
    ).length,
  };

  process.stdout.write(
    [
      `원본 ${normalizedRows.length}건 확인`,
      `공개 ${batch.publishedCount}건`,
      `개인정보 검수 대기 ${batch.reviewRequiredCount}건`,
      `삭제·공개 제외 ${batch.withheldCount}건`,
    ].join(" · ") + "\n",
  );

  if (configuration.dryRun) {
    process.stdout.write("dry-run이므로 새 DB에는 기록하지 않았습니다.\n");
    return;
  }

  if (!existsSync(localEnvironmentPath)) {
    throw new Error(
      ".env.development.local이 없습니다. 먼저 db:local:setup을 실행해 주세요.",
    );
  }
  const localEnvironment = parseEnvironmentFile(
    readFileSync(localEnvironmentPath, "utf8"),
  );
  const databaseUrl = required(
    localEnvironment.get("LAWAND_APP_DATABASE_URL"),
    "LAWAND_APP_DATABASE_URL",
  );

  await importRows(databaseUrl, normalizedRows, batch);
  process.stdout.write(`이관 배치 ${batchId}를 새 DB에 기록했습니다.\n`);
}

main().catch((error) => {
  process.stderr.write(
    `후기 이관 실패: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
