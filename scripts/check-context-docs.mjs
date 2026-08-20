import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const contextDocuments = [
  {
    path: "CLAUDE.md",
    maxBytes: 8 * 1024,
    maxLines: 80,
  },
  {
    path: "AGENTS.md",
    maxBytes: 24 * 1024,
    maxLines: 220,
  },
  {
    path: "PROJECT_PLAN.md",
    maxBytes: 96 * 1024,
    maxLines: 800,
  },
  {
    path: "docs/handoffs/CURRENT.md",
    maxBytes: 24 * 1024,
    maxLines: 180,
  },
];

const archiveDocuments = [
  {
    path: "docs/archive/context-pre-compact/AGENTS_LEGACY_THROUGH_2026-08-20.md",
    sha256: "f016affdbc35157bb9ae7d5716f91aedfaed03c414a0830d53fc2ed64bde6488",
  },
  {
    path: "docs/archive/context-pre-compact/PROJECT_PLAN_V1.70.md",
    sha256: "6e1babda44fa56d9526fdd4636931e009d4fe52a9927f51d0e2fa02fda12e068",
  },
];

const requiredReferences = [
  ["AGENTS.md", "docs/handoffs/CURRENT.md"],
  ["AGENTS.md", "pnpm docs:context:check"],
  ["PROJECT_PLAN.md", "docs/handoffs/CURRENT.md"],
  ["PROJECT_PLAN.md", "docs/archive/context-pre-compact/README.md"],
  ["CLAUDE.md", "docs/handoffs/CURRENT.md"],
  ["CLAUDE.md", "docs/handoffs/YYYY-MM.md"],
];

const forbiddenPatterns = [
  ["AGENTS.md", /^## 작업 인수인계 로그/m, "AGENTS.md에 작업 이력을 누적할 수 없습니다."],
  [
    "PROJECT_PLAN.md",
    /^>\s*20\d{2}-\d{2}-\d{2}/m,
    "PROJECT_PLAN.md에 날짜별 작업 연대기를 누적할 수 없습니다.",
  ],
  [
    "PROJECT_PLAN.md",
    /^## .*스캐폴딩 전/m,
    "현재 기준선에 과거 스캐폴딩 체크리스트를 되살릴 수 없습니다.",
  ],
];

const maxCombinedBytes = 128 * 1024;
const linkDocuments = [
  "PROJECT_PLAN.md",
  "docs/handoffs/CURRENT.md",
  "docs/handoffs/README.md",
  "docs/handoffs/2026-08.md",
  "docs/archive/context-pre-compact/README.md",
];
const loaded = new Map();
const failures = [];

function countLines(text) {
  if (text.length === 0) return 0;
  const newlines = text.match(/\n/g)?.length ?? 0;
  return text.endsWith("\n") ? newlines : newlines + 1;
}

async function loadText(path) {
  const existing = loaded.get(path);
  if (existing) return existing;
  const buffer = await readFile(path);
  const value = { buffer, text: buffer.toString("utf8") };
  loaded.set(path, value);
  return value;
}

let combinedBytes = 0;

for (const document of contextDocuments) {
  const { buffer, text } = await loadText(document.path);
  const bytes = buffer.byteLength;
  const lines = countLines(text);
  combinedBytes += bytes;

  console.log(
    `${document.path}: ${lines}/${document.maxLines} lines, ${bytes}/${document.maxBytes} bytes`,
  );

  if (lines > document.maxLines) {
    failures.push(`${document.path} 줄 제한 초과: ${lines} > ${document.maxLines}`);
  }
  if (bytes > document.maxBytes) {
    failures.push(`${document.path} byte 제한 초과: ${bytes} > ${document.maxBytes}`);
  }
}

if (combinedBytes > maxCombinedBytes) {
  failures.push(`기본 컨텍스트 합계 제한 초과: ${combinedBytes} > ${maxCombinedBytes} bytes`);
}

for (const [path, expected] of requiredReferences) {
  const { text } = await loadText(path);
  if (!text.includes(expected)) {
    failures.push(`${path}에 필수 참조가 없습니다: ${expected}`);
  }
}

for (const [path, pattern, message] of forbiddenPatterns) {
  const { text } = await loadText(path);
  if (pattern.test(text)) failures.push(message);
}

for (const archive of archiveDocuments) {
  const { buffer } = await loadText(archive.path);
  const actual = createHash("sha256").update(buffer).digest("hex");
  if (actual !== archive.sha256) {
    failures.push(`${archive.path} 원문 해시 불일치: ${actual}`);
  }
}

for (const path of linkDocuments) {
  const { text } = await loadText(path);
  const links = text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);
  for (const match of links) {
    const target = match[1];
    if (target.startsWith("#") || /^[a-z]+:/i.test(target)) continue;
    const relativePath = target.split("#", 1)[0];
    try {
      await access(resolve(dirname(path), relativePath));
    } catch {
      failures.push(`${path}의 로컬 링크 대상이 없습니다: ${target}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`기본 컨텍스트 합계: ${combinedBytes}/${maxCombinedBytes} bytes`);
  console.log("컨텍스트 문서 크기·역할·archive 무결성 검사를 통과했습니다.");
}
