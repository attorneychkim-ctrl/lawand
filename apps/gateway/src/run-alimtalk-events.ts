import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { eq, inArray } from "drizzle-orm";

import {
  alimtalkDeliveries,
  createDatabaseClient,
  outboxEvents,
} from "@lawand/db";

import { createAlimtalkOutboxWorker } from "./alimtalk-outbox-worker.js";
import { readGatewayConfig } from "./config.js";
import { createDataProtection } from "./crypto.js";
import { createSolapiClient } from "./solapi.js";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const eventIds = process.argv
  .slice(2)
  .filter((value) => value !== "--")
  .map((value) => value.replace(/^--event-id=/, "").trim())
  .filter(Boolean);
if (
  eventIds.length === 0 ||
  eventIds.some(
    (value) =>
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  )
) {
  throw new Error(
    "발송할 알림톡 outbox UUID를 --event-id=<uuid> 형식으로 지정해 주세요.",
  );
}

const config = readGatewayConfig();
if (!config.solapi) {
  throw new Error("솔라피 환경설정이 모두 필요합니다.");
}
const database = createDatabaseClient(config.databaseUrl);
const protection = createDataProtection(config);

try {
  const targets = await database.db
    .select({
      id: outboxEvents.id,
      eventType: outboxEvents.eventType,
      status: outboxEvents.status,
      lockedAt: outboxEvents.lockedAt,
    })
    .from(outboxEvents)
    .where(inArray(outboxEvents.id, eventIds));
  if (targets.length !== eventIds.length) {
    throw new Error("지정한 outbox 이벤트 중 찾을 수 없는 항목이 있습니다.");
  }
  for (const target of targets) {
    if (!target.eventType.startsWith("alimtalk.consultation.")) {
      throw new Error(`${target.id}는 알림톡 이벤트가 아닙니다.`);
    }
    if (target.status !== "pending" || target.lockedAt) {
      throw new Error(`${target.id}는 현재 발송 가능한 대기 상태가 아닙니다.`);
    }
  }

  const worker = createAlimtalkOutboxWorker({
    db: database.db,
    protection,
    targetEventIds: eventIds,
    workerId: `manual-alimtalk-canary:${process.pid}`,
    pfId: config.solapi.pfId,
    requestTemplateId: config.solapi.requestTemplateId,
    assignmentTemplateId: config.solapi.assignmentTemplateId,
    solapiClient: createSolapiClient({
      apiKey: config.solapi.apiKey,
      apiSecret: config.solapi.apiSecret,
    }),
  });
  for (let count = 0; count < eventIds.length; count += 1) {
    if (!(await worker.runOnce())) {
      throw new Error("지정한 알림톡 이벤트를 모두 처리하지 못했습니다.");
    }
  }

  const results = await database.db
    .select({
      eventId: outboxEvents.id,
      eventType: outboxEvents.eventType,
      status: outboxEvents.status,
      attempts: outboxEvents.attempts,
      providerMessageId: alimtalkDeliveries.providerMessageId,
      providerStatusCode: alimtalkDeliveries.providerStatusCode,
    })
    .from(outboxEvents)
    .leftJoin(
      alimtalkDeliveries,
      eq(alimtalkDeliveries.outboxEventId, outboxEvents.id),
    )
    .where(inArray(outboxEvents.id, eventIds));
  console.log(JSON.stringify({ results }, null, 2));
} finally {
  await database.pool.end();
}
