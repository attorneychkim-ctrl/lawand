#!/usr/bin/env node

import pg from "pg";

const extension = process.argv[2] ?? "";
const durationSeconds = Number(process.argv[3] ?? "120");
if (!/^[0-9]{2,10}$/.test(extension)) {
  throw new Error("검증할 센트릭스 내선번호가 필요합니다.");
}
if (
  !Number.isInteger(durationSeconds) ||
  durationSeconds < 10 ||
  durationSeconds > 300
) {
  throw new Error("검증 시간은 10~300초여야 합니다.");
}
if (!process.env.LAWAND_APP_DATABASE_URL) {
  throw new Error("LAWAND_APP_DATABASE_URL이 필요합니다.");
}

const client = new pg.Client({
  connectionString: process.env.LAWAND_APP_DATABASE_URL,
});
const startedAt = new Date();
let previous = "";

await client.connect();
try {
  while (Date.now() - startedAt.getTime() <= durationSeconds * 1_000) {
    const result = await client.query(
      `select
         c.bridge_id,
         c.state,
         coalesce(c.provider_end_cause, '') as cause,
         round(extract(epoch from (c.created_at - c.ringing_at))::numeric, 3) as creation_delay_seconds
       from telephony_inbound_calls c
       join telephony_endpoints e on e.id = c.endpoint_id
       where c.direction = 'inbound'
         and e.extension = $1
         and c.created_at >= $2
       order by c.created_at`,
      [extension, startedAt],
    );
    const serialized = JSON.stringify(result.rows);
    if (serialized !== previous) {
      previous = serialized;
      console.log(
        JSON.stringify({
          elapsedSeconds:
            Math.round((Date.now() - startedAt.getTime()) / 100) / 10,
          calls: result.rows,
        }),
      );
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
} finally {
  await client.end();
}
