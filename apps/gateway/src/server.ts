import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createDatabaseClient, createDatabasePool } from "@lawand/db";

import { createGatewayServer } from "./app.js";
import { createAlimtalkOutboxWorker } from "./alimtalk-outbox-worker.js";
import { createStaffAuthService } from "./auth.js";
import { createCentrexClient } from "./centrex.js";
import { createCentrexBridgeIngressService } from "./centrex-bridge-service.js";
import { createCentrexBridgeProvisioningService } from "./centrex-bridge-provisioning.js";
import { createCentrexCredentialVault } from "./centrex-credential-vault.js";
import { createCentrexInboundObserver } from "./centrex-inbound-observer.js";
import { createCentrexMessageInboxWorker } from "./centrex-message-inbox-worker.js";
import { createCentrexWorker } from "./centrex-worker.js";
import { readGatewayConfig } from "./config.js";
import { createPostgresConsultationEventSource } from "./consultation-events.js";
import { createPostgresReviewEventSource } from "./review-events.js";
import { createPostgresMessageEventSource } from "./message-events.js";
import { createDataProtection } from "./crypto.js";
import { createDatabasePoolMonitor } from "./database-pool-monitor.js";
import { createPublicIntakeProtection } from "./intake-protection.js";
import { createLegalFriendsClient } from "./legalfriends.js";
import { createNaverBookingImapWorker } from "./naver-booking-imap-worker.js";
import { createOutboxWorker } from "./outbox-worker.js";
import { createConsultationService } from "./service.js";
import { createTelephonyService } from "./telephony-service.js";
import { createPostgresTelephonyInboundEventSource } from "./telephony-inbound-events.js";
import { createPostgresTelephonyDeskEventSource } from "./telephony-desk-events.js";
import { createTelephonyRealtimeMonitor } from "./telephony-realtime-monitor.js";
import { createReviewSubmissionService } from "./review-service.js";
import { createReviewManagementService } from "./review-management-service.js";
import { createSolapiClient } from "./solapi.js";
import { createGiftishowClient } from "./giftishow.js";
import { createGiftCouponService } from "./gift-coupon-service.js";

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
const database = createDatabaseClient(config.databaseUrl, {
  applicationName: "lawand-gateway-request",
  maxConnections: config.databaseRequestPoolMax,
});
const listenerPool = createDatabasePool(config.databaseUrl, {
  applicationName: "lawand-gateway-listener",
  maxConnections: config.databaseListenerPoolMax,
});
const databasePoolMonitor = createDatabasePoolMonitor({
  pools: [
    {
      name: "request",
      pool: database.pool,
      maxConnections: config.databaseRequestPoolMax,
    },
    {
      name: "listener",
      pool: listenerPool,
      maxConnections: config.databaseListenerPoolMax,
    },
  ],
  metricsEnabled: config.cloudWatchMetricsEnabled,
  region: config.awsRegion,
});
const telephonyRealtimeMonitor = createTelephonyRealtimeMonitor({
  metricsEnabled: config.cloudWatchMetricsEnabled,
  region: config.awsRegion,
});
const protection = createDataProtection(config);
const centrexClient = createCentrexClient();
const solapiClient = config.solapiApiCredentials
  ? createSolapiClient(config.solapiApiCredentials)
  : null;
const centrexCredentialVault = createCentrexCredentialVault({
  db: database.db,
  protection,
  fallbackCredentials: config.centrexCredentials ?? {},
});
const centrexBridgeProvisioning = config.centrexBridgeKeys
  ? createCentrexBridgeProvisioningService({
      db: database.db,
      keys: config.centrexBridgeKeys,
    })
  : null;
const service = createConsultationService({
  db: database.db,
  protection,
});
const reviewService = createReviewSubmissionService({
  db: database.db,
  protection,
});
const authService = createStaffAuthService({
  db: database.db,
  protection,
  centrexClient,
  centrexFallbackCredentials: config.centrexCredentials ?? {},
  centrexBridgeEndpointIds: new Set(
    Object.values(config.centrexBridgeKeys ?? {}).map(
      ({ endpointId }) => endpointId,
    ),
  ),
  ...(centrexBridgeProvisioning
    ? { centrexBridgeProvisioning }
    : {}),
});
const telephonyService = createTelephonyService({
  db: database.db,
  protection,
  dispatchEnabled: config.centrexWorkerEnabled,
  solapiClient,
  solapiMmsSender: config.solapiMmsSender,
  answerableBridgeIds: new Set(Object.keys(config.centrexBridgeKeys ?? {})),
});
const reviewManagementService = createReviewManagementService({
  db: database.db,
  protection,
  telephonyService,
  reviewWriteUrl: config.reviewWriteUrl,
});
const giftCouponService = createGiftCouponService({
  db: database.db,
  protection,
  client: config.giftishow ? createGiftishowClient(config.giftishow) : null,
  reviewManagement: reviewManagementService,
});
const centrexBridgeIngress = createCentrexBridgeIngressService({
  db: database.db,
  protection,
});
const centrexInboundObserver = config.centrexRingCallback
  ? createCentrexInboundObserver({
      db: database.db,
      protection,
      centrexClient,
      credentialVault: centrexCredentialVault,
      callbackToken: config.centrexRingCallback.token,
      callbackHost: config.centrexRingCallback.host,
      callbackPort: config.centrexRingCallback.port,
      pollIntervalMs: config.centrexRingCallback.pollIntervalMs,
    })
  : null;
const consultationEvents = createPostgresConsultationEventSource({
  pool: listenerPool,
  snapshotPool: database.pool,
  onError: (error) => {
    console.error("lawand consultation realtime source error", error);
  },
});
const reviewEvents = createPostgresReviewEventSource({
  pool: listenerPool,
  onError: (error) => {
    console.error("lawand review realtime source error", error);
  },
});
const messageEvents = createPostgresMessageEventSource({
  pool: listenerPool,
  onError: (error) => console.error("lawand message realtime source error", error),
});
const telephonyInboundEvents = createPostgresTelephonyInboundEventSource({
  pool: listenerPool,
  onError: (error) => {
    console.error("lawand telephony inbound realtime source error", error);
  },
});
const telephonyDeskEvents = createPostgresTelephonyDeskEventSource({
  pool: listenerPool,
  onError: (error) => {
    console.error("lawand telephony desk realtime source error", error);
  },
});
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
  consultationEvents,
  reviewEvents,
  messageEvents,
  telephonyInboundEvents,
  telephonyDeskEvents,
  telephonyRealtimeMonitor,
  databasePoolHealth: databasePoolMonitor.snapshot,
  service,
  telephonyService,
  centrexBridgeIngress,
  ...(centrexInboundObserver ? { centrexInboundObserver } : {}),
  ...(config.centrexBridgeKeys
    ? { centrexBridgeKeys: config.centrexBridgeKeys }
    : {}),
  ...(centrexBridgeProvisioning
    ? { centrexBridgeProvisioning }
    : {}),
  reviewService,
  reviewManagementService,
  giftCouponService,
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
  config.alimtalkWorkerEnabled && config.solapi && solapiClient
    ? createAlimtalkOutboxWorker({
        db: database.db,
        protection,
        solapiClient,
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
const centrexWorker =
  config.centrexWorkerEnabled
    ? createCentrexWorker({
        db: database.db,
        protection,
        centrexClient,
        credentialVault: centrexCredentialVault,
        solapiClient,
        solapiMmsSender: config.solapiMmsSender,
      })
    : null;
const centrexMessageInboxWorker = config.centrexWorkerEnabled
  ? createCentrexMessageInboxWorker({
      db: database.db,
      protection,
      centrexClient,
      credentialVault: centrexCredentialVault,
    })
  : null;

await Promise.all([
  centrexBridgeProvisioning?.start(),
  consultationEvents.start(),
  reviewEvents.start(),
  messageEvents.start(),
  telephonyInboundEvents.start(),
  telephonyDeskEvents.start(),
]);
databasePoolMonitor.start();
telephonyRealtimeMonitor.start();

server.listen(port, host, () => {
  console.log(`lawand-gateway listening on http://${host}:${port}`);
  console.log("lawand consultation realtime source started");
  console.log("lawand review realtime source started");
  console.log("lawand telephony inbound realtime source started");
  console.log("lawand telephony desk realtime source started");
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
  if (centrexWorker) {
    centrexWorker.start();
    console.log("lawand centrex click-to-call worker started");
  } else {
    console.log("lawand centrex click-to-call worker disabled");
  }
  if (centrexMessageInboxWorker) {
    centrexMessageInboxWorker.start();
    console.log("lawand centrex message inbox worker started");
  } else {
    console.log("lawand centrex message inbox worker disabled");
  }
  if (centrexInboundObserver) {
    centrexInboundObserver.start();
    console.log("lawand centrex inbound observer started");
  } else {
    console.log("lawand centrex inbound observer disabled");
  }
});

function shutdown(signal: string) {
  console.log(`${signal} received; closing lawand-gateway`);
  const forceCloseTimer = setTimeout(() => {
    server.closeAllConnections();
  }, 5_000);
  forceCloseTimer.unref();
  server.close((error) => {
    clearTimeout(forceCloseTimer);
    void (async () => {
      await Promise.all([
        consultationEvents.stop(),
        reviewEvents.stop(),
        messageEvents.stop(),
        telephonyInboundEvents.stop(),
        telephonyDeskEvents.stop(),
        legalFriendsOutboxWorker?.stop(),
        alimtalkOutboxWorker?.stop(),
        naverBookingImapWorker?.stop(),
        centrexWorker?.stop(),
        centrexMessageInboxWorker?.stop(),
        centrexInboundObserver?.stop(),
      ]);
      centrexBridgeProvisioning?.stop();
      await Promise.all([
        databasePoolMonitor.stop(),
        telephonyRealtimeMonitor.stop(),
      ]);
      await Promise.all([database.pool.end(), listenerPool.end()]);
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
    })();
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
