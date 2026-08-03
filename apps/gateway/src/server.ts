import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createDatabaseClient } from "@lawand/db";

import { createGatewayServer } from "./app.js";
import { createAlimtalkOutboxWorker } from "./alimtalk-outbox-worker.js";
import { createStaffAuthService } from "./auth.js";
import { readGatewayConfig } from "./config.js";
import { createDataProtection } from "./crypto.js";
import { createPublicIntakeProtection } from "./intake-protection.js";
import { createLegalFriendsClient } from "./legalfriends.js";
import { createNaverBookingImapWorker } from "./naver-booking-imap-worker.js";
import { createOutboxWorker } from "./outbox-worker.js";
import { createConsultationService } from "./service.js";
import { createReviewSubmissionService } from "./review-service.js";
import { createSolapiClient } from "./solapi.js";

const localEnvPath = resolve(process.cwd(), ".env.local");
if (existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath);
}
const naverLocalEnvPath = resolve(process.cwd(), ".env.naver.local");
if (existsSync(naverLocalEnvPath)) {
  process.loadEnvFile(naverLocalEnvPath);
}

function readPort(value: string | undefined): number {
  const parsed = Number(value ?? "3022");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PORT는 1부터 65535 사이의 정수여야 합니다.");
  }
  return parsed;
}

const config = readGatewayConfig();
const database = createDatabaseClient(config.databaseUrl);
const protection = createDataProtection(config);
const service = createConsultationService({
  db: database.db,
  protection,
});
const reviewService = createReviewSubmissionService({
  db: database.db,
  protection,
});
const authService = createStaffAuthService({ db: database.db });
const intakeProtection = createPublicIntakeProtection({
  hmacKey: config.hmacKey,
  // 개인정보 원문 없이 운영 경보로 집계할 수 있는 최소 정보만 남긴다.
  onLimited: ({ dimension, retryAfterSeconds }) => {
    console.warn(
      JSON.stringify({
        event: "public_consultation_rate_limited",
        dimension,
        retryAfterSeconds,
        occurredAt: new Date().toISOString(),
      }),
    );
  },
});
const port = readPort(process.env.PORT);
const host = process.env.HOST ?? "0.0.0.0";
const server = createGatewayServer({
  authService,
  service,
  reviewService,
  internalApiKey: config.internalApiKey,
  publicIntakeApiKey: config.publicIntakeApiKey,
  intakeProtection,
  ...(config.kakaoSkill ? { kakaoSkill: config.kakaoSkill } : {}),
});
const legalFriendsOutboxWorker =
  config.outboxWorkerEnabled && config.legalFriendsApiToken
    ? createOutboxWorker({
        db: database.db,
        protection,
        legalFriendsClient: createLegalFriendsClient({
          token: config.legalFriendsApiToken,
        }),
      })
    : null;
const alimtalkOutboxWorker =
  config.alimtalkWorkerEnabled && config.solapi
    ? createAlimtalkOutboxWorker({
        db: database.db,
        protection,
        solapiClient: createSolapiClient({
          apiKey: config.solapi.apiKey,
          apiSecret: config.solapi.apiSecret,
        }),
        pfId: config.solapi.pfId,
        requestTemplateId: config.solapi.requestTemplateId,
        assignmentTemplateId: config.solapi.assignmentTemplateId,
      })
    : null;
const naverBookingImapWorker =
  config.naverBookingImapEnabled && config.naverBookingImap
    ? createNaverBookingImapWorker({
        db: database.db,
        protection,
        service,
        user: config.naverBookingImap.user,
        appPassword: config.naverBookingImap.appPassword,
        mailbox: config.naverBookingImap.mailbox,
      })
    : null;

server.listen(port, host, () => {
  console.log(`lawand-gateway listening on http://${host}:${port}`);
  if (legalFriendsOutboxWorker) {
    legalFriendsOutboxWorker.start();
    console.log("lawand legalfriends outbox worker started");
  } else {
    console.log("lawand legalfriends outbox worker disabled");
  }
  if (alimtalkOutboxWorker) {
    alimtalkOutboxWorker.start();
    console.log("lawand alimtalk outbox worker started");
  } else {
    console.log("lawand alimtalk outbox worker disabled");
  }
  if (naverBookingImapWorker) {
    naverBookingImapWorker.start();
    console.log("lawand naver booking imap worker started");
  } else {
    console.log("lawand naver booking imap worker disabled");
  }
});

function shutdown(signal: string) {
  console.log(`${signal} received; closing lawand-gateway`);
  server.close((error) => {
    void (async () => {
      await Promise.all([
        legalFriendsOutboxWorker?.stop(),
        alimtalkOutboxWorker?.stop(),
        naverBookingImapWorker?.stop(),
      ]);
      await database.pool.end();
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
    })();
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
