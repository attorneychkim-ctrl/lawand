#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const staffUserId = process.argv[2] ?? "";
if (!/^[0-9a-f-]{36}$/i.test(staffUserId)) {
  throw new Error("검증할 직원 UUID가 필요합니다.");
}
if (!process.env.LAWAND_APP_DATABASE_URL || !process.env.LAWAND_INTERNAL_API_KEY) {
  throw new Error("gateway 운영 환경변수가 필요합니다.");
}

const pool = new pg.Pool({
  connectionString: process.env.LAWAND_APP_DATABASE_URL,
});
const sessionId = randomUUID();
const sessionToken = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(sessionToken, "utf8").digest();
const now = new Date();

await pool.query(
  `insert into staff_sessions
     (id, user_id, token_hash, expires_at, last_seen_at, created_at)
   values ($1, $2, $3, $4, $5, $5)`,
  [sessionId, staffUserId, tokenHash, new Date(now.getTime() + 300_000), now],
);

try {
  const headers = {
    "x-lawand-internal-key": process.env.LAWAND_INTERNAL_API_KEY,
    "x-lawand-staff-session": sessionToken,
  };
  const [deskResponse, inboundResponse] = await Promise.all([
    fetch("http://127.0.0.1:3022/v1/phone-desk/calls?limit=100", {
      headers,
    }),
    fetch("http://127.0.0.1:3022/v1/telephony-inbound-calls", { headers }),
  ]);
  if (!deskResponse.ok || !inboundResponse.ok) {
    throw new Error(
      `운영 전화 API 검증 실패: desk=${deskResponse.status}, inbound=${inboundResponse.status}`,
    );
  }
  const desk = await deskResponse.json();
  const inbound = await inboundResponse.json();
  const deskItems = Array.isArray(desk.items) ? desk.items : [];
  const inboundItems = Array.isArray(inbound.items) ? inbound.items : [];
  const networkDeskItems = deskItems.filter(
    (item) => item.receptionMode === "uplus_network",
  );
  console.log(
    JSON.stringify({
      deskStatus: deskResponse.status,
      inboundStatus: inboundResponse.status,
      deskItems: deskItems.length,
      networkDeskItems: networkDeskItems.length,
      inboundItems: inboundItems.length,
    }),
  );
} finally {
  await pool.query("delete from staff_sessions where id = $1", [sessionId]);
  const remaining = await pool.query(
    "select count(*)::integer as count from staff_sessions where id = $1",
    [sessionId],
  );
  console.log(
    JSON.stringify({ temporarySessionRemaining: remaining.rows[0].count }),
  );
  await pool.end();
}
