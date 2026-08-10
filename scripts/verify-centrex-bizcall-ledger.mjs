#!/usr/bin/env node

import pg from "pg";

const extension = process.argv[2] ?? "";
if (!/^[0-9]{2,10}$/.test(extension)) {
  throw new Error("검증할 센트릭스 내선번호가 필요합니다.");
}
if (!process.env.LAWAND_APP_DATABASE_URL) {
  throw new Error("LAWAND_APP_DATABASE_URL이 필요합니다.");
}

const client = new pg.Client({
  connectionString: process.env.LAWAND_APP_DATABASE_URL,
});

await client.connect();
try {
  const result = await client.query(
    `select
       c.bridge_id,
       c.state,
       coalesce(c.provider_end_cause, '') as cause,
       to_char(c.ringing_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') as ringing_kst,
       to_char(c.ended_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') as ended_kst,
       count(*) over (
         partition by c.endpoint_id, c.remote_phone_fingerprint,
           date_trunc('minute', c.ringing_at)
       )::integer as same_phone_minute_count
     from telephony_inbound_calls c
     join telephony_endpoints e on e.id = c.endpoint_id
     where c.direction = 'inbound'
       and e.extension = $1
       and c.ringing_at >= now() - interval '24 hours'
     order by c.ringing_at desc
     limit 50`,
    [extension],
  );
  const samePhoneMinuteRows = result.rows.filter(
    (row) => row.same_phone_minute_count > 1,
  ).length;
  console.log(
    JSON.stringify({
      extension,
      recentCallCount: result.rows.length,
      samePhoneMinuteRows,
      calls: result.rows,
    }),
  );
} finally {
  await client.end();
}
