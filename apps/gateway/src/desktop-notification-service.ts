import { createHash, randomBytes, randomUUID } from "node:crypto";

import type {
  DesktopNotificationDeliveryAck,
  DesktopNotificationPairingExchange,
} from "@lawand/core";
import {
  and,
  asc,
  eq,
  gt,
  isNull,
  sql,
} from "drizzle-orm";
import {
  desktopNotificationDeliveries,
  desktopNotificationDevices,
  desktopNotificationPairings,
  desktopNotifications,
  staffAuditLogs,
  staffProfiles,
  staffUsers,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { StaffPrincipal } from "./auth.js";
import type { DataProtection } from "./crypto.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const PAIRING_DURATION_MS = 5 * 60 * 1_000;
const TEST_NOTIFICATION_DURATION_MS = 15 * 60 * 1_000;
const DEVICE_TOUCH_INTERVAL_MS = 60 * 1_000;

export type DesktopNotificationPayload = {
  title: string;
  body: string;
  category: "test" | "consultation" | "phone" | "message" | "review";
  deepLink: string;
};

export type DesktopNotificationDeviceView = {
  id: string;
  name: string;
  platform: "windows";
  appVersion: string;
  status: "active" | "revoked";
  connectionState: "never_connected" | "online" | "offline" | "revoked";
  lastSeenAt: string | null;
  lastDeliveredAt: string | null;
  createdAt: string;
};

export class DesktopNotificationError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "invalid_pairing"
      | "invalid_device_token"
      | "device_not_found"
      | "delivery_not_found"
      | "no_active_devices"
      | "invalid_notification_payload",
    message: string,
  ) {
    super(message);
  }
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

function payloadContext(notificationId: string): string {
  return `desktop_notifications.payload:${notificationId}`;
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("LAWAND_ERP_BASE_URL 형식이 올바르지 않습니다.");
  }
  return url.origin;
}

function safePayload(raw: string, erpBaseUrl: string): DesktopNotificationPayload {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new DesktopNotificationError(
      500,
      "invalid_notification_payload",
      "저장된 PC 알림 내용을 읽지 못했습니다.",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DesktopNotificationError(
      500,
      "invalid_notification_payload",
      "저장된 PC 알림 내용 형식이 올바르지 않습니다.",
    );
  }
  const candidate = value as Record<string, unknown>;
  const category = candidate.category;
  if (
    typeof candidate.title !== "string" ||
    candidate.title.length < 1 ||
    candidate.title.length > 120 ||
    typeof candidate.body !== "string" ||
    candidate.body.length < 1 ||
    candidate.body.length > 2_000 ||
    !["test", "consultation", "phone", "message", "review"].includes(
      typeof category === "string" ? category : "",
    ) ||
    typeof candidate.deepLink !== "string"
  ) {
    throw new DesktopNotificationError(
      500,
      "invalid_notification_payload",
      "저장된 PC 알림 내용 형식이 올바르지 않습니다.",
    );
  }
  let deepLink: URL;
  try {
    deepLink = new URL(candidate.deepLink);
  } catch {
    throw new DesktopNotificationError(
      500,
      "invalid_notification_payload",
      "PC 알림 이동 주소 형식이 올바르지 않습니다.",
    );
  }
  if (deepLink.origin !== erpBaseUrl) {
    throw new DesktopNotificationError(
      500,
      "invalid_notification_payload",
      "PC 알림 이동 주소가 ERP 주소와 일치하지 않습니다.",
    );
  }
  return {
    title: candidate.title,
    body: candidate.body,
    category: category as DesktopNotificationPayload["category"],
    deepLink: deepLink.toString(),
  };
}

export function createDesktopNotificationService(options: {
  db: Database;
  protection: DataProtection;
  erpBaseUrl: string;
}) {
  const { db, protection } = options;
  const erpBaseUrl = normalizedBaseUrl(options.erpBaseUrl);

  async function addAudit(input: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
    occurredAt: Date;
    transaction?: Database | DatabaseTransaction;
  }) {
    await (input.transaction ?? db).insert(staffAuditLogs).values({
      id: randomUUID(),
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
      occurredAt: input.occurredAt,
    });
  }

  async function createPairing(actor: StaffPrincipal) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAIRING_DURATION_MS);
    const pairingCode = newToken();
    const pairingId = randomUUID();
    await db.transaction(async (tx) => {
      await tx
        .update(desktopNotificationPairings)
        .set({ usedAt: now, updatedAt: now })
        .where(
          and(
            eq(desktopNotificationPairings.staffUserId, actor.id),
            isNull(desktopNotificationPairings.usedAt),
            gt(desktopNotificationPairings.expiresAt, now),
          ),
        );
      await tx.insert(desktopNotificationPairings).values({
        id: pairingId,
        staffUserId: actor.id,
        tokenHash: tokenHash(pairingCode),
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
      await addAudit({
        actorUserId: actor.id,
        action: "desktop_notification.pairing.created",
        targetType: "desktop_notification_pairing",
        targetId: pairingId,
        metadata: { expiresAt: expiresAt.toISOString() },
        occurredAt: now,
        transaction: tx,
      });
    });
    return {
      pairingCode,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async function pairDevice(input: DesktopNotificationPairingExchange) {
    const now = new Date();
    const deviceId = randomUUID();
    const deviceToken = newToken();
    return db.transaction(async (tx) => {
      const [pairing] = await tx
        .select({
          id: desktopNotificationPairings.id,
          staffUserId: desktopNotificationPairings.staffUserId,
          displayName: staffProfiles.displayName,
        })
        .from(desktopNotificationPairings)
        .innerJoin(
          staffUsers,
          eq(staffUsers.id, desktopNotificationPairings.staffUserId),
        )
        .innerJoin(
          staffProfiles,
          eq(staffProfiles.userId, desktopNotificationPairings.staffUserId),
        )
        .where(
          and(
            eq(desktopNotificationPairings.tokenHash, tokenHash(input.pairingCode)),
            isNull(desktopNotificationPairings.usedAt),
            gt(desktopNotificationPairings.expiresAt, now),
            eq(staffUsers.status, "active"),
          ),
        )
        .limit(1)
        .for("update");
      if (!pairing) {
        throw new DesktopNotificationError(
          410,
          "invalid_pairing",
          "PC 연결 코드가 만료되었거나 이미 사용되었습니다.",
        );
      }
      await tx.insert(desktopNotificationDevices).values({
        id: deviceId,
        staffUserId: pairing.staffUserId,
        name: input.deviceName,
        platform: input.platform,
        appVersion: input.appVersion,
        tokenHash: tokenHash(deviceToken),
        status: "active",
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await tx
        .update(desktopNotificationPairings)
        .set({ usedAt: now, updatedAt: now })
        .where(eq(desktopNotificationPairings.id, pairing.id));
      await addAudit({
        actorUserId: pairing.staffUserId,
        action: "desktop_notification.device.paired",
        targetType: "desktop_notification_device",
        targetId: deviceId,
        metadata: {
          platform: input.platform,
          appVersion: input.appVersion,
        },
        occurredAt: now,
        transaction: tx,
      });
      return {
        deviceToken,
        device: {
          id: deviceId,
          name: input.deviceName,
          platform: input.platform,
          appVersion: input.appVersion,
          staffDisplayName: pairing.displayName,
        },
        pollIntervalSeconds: 5,
      };
    });
  }

  async function listDevices(actor: StaffPrincipal): Promise<{
    items: DesktopNotificationDeviceView[];
  }> {
    const now = new Date();
    const rows = await db
      .select({
        id: desktopNotificationDevices.id,
        name: desktopNotificationDevices.name,
        platform: desktopNotificationDevices.platform,
        appVersion: desktopNotificationDevices.appVersion,
        status: desktopNotificationDevices.status,
        lastSeenAt: desktopNotificationDevices.lastSeenAt,
        lastDeliveredAt: desktopNotificationDevices.lastDeliveredAt,
        createdAt: desktopNotificationDevices.createdAt,
      })
      .from(desktopNotificationDevices)
      .where(
        and(
          eq(desktopNotificationDevices.staffUserId, actor.id),
          eq(desktopNotificationDevices.status, "active"),
        ),
      )
      .orderBy(sql`${desktopNotificationDevices.createdAt} DESC`)
      .limit(20);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        platform: row.platform as "windows",
        appVersion: row.appVersion,
        status: row.status as "active" | "revoked",
        connectionState:
          row.status === "revoked"
            ? "revoked"
            : !row.lastSeenAt
              ? "never_connected"
              : row.lastSeenAt.getTime() >= now.getTime() - 2 * 60 * 1_000
                ? "online"
                : "offline",
        lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async function revokeDevice(actor: StaffPrincipal, deviceId: string) {
    const now = new Date();
    const [device] = await db
      .select({ id: desktopNotificationDevices.id, status: desktopNotificationDevices.status })
      .from(desktopNotificationDevices)
      .where(
        and(
          eq(desktopNotificationDevices.id, deviceId),
          eq(desktopNotificationDevices.staffUserId, actor.id),
        ),
      )
      .limit(1);
    if (!device) {
      throw new DesktopNotificationError(
        404,
        "device_not_found",
        "연결된 컴퓨터를 찾을 수 없습니다.",
      );
    }
    if (device.status !== "revoked") {
      await db.transaction(async (tx) => {
        await tx
          .update(desktopNotificationDevices)
          .set({ status: "revoked", revokedAt: now, updatedAt: now })
          .where(eq(desktopNotificationDevices.id, deviceId));
        await addAudit({
          actorUserId: actor.id,
          action: "desktop_notification.device.revoked",
          targetType: "desktop_notification_device",
          targetId: deviceId,
          occurredAt: now,
          transaction: tx,
        });
      });
    }
    return { id: deviceId, revoked: true as const };
  }

  async function authenticateDevice(rawToken: string) {
    const now = new Date();
    const [device] = await db
      .select({
        id: desktopNotificationDevices.id,
        staffUserId: desktopNotificationDevices.staffUserId,
        lastSeenAt: desktopNotificationDevices.lastSeenAt,
      })
      .from(desktopNotificationDevices)
      .innerJoin(staffUsers, eq(staffUsers.id, desktopNotificationDevices.staffUserId))
      .where(
        and(
          eq(desktopNotificationDevices.tokenHash, tokenHash(rawToken)),
          eq(desktopNotificationDevices.status, "active"),
          eq(staffUsers.status, "active"),
        ),
      )
      .limit(1);
    if (!device) {
      throw new DesktopNotificationError(
        401,
        "invalid_device_token",
        "PC 연결이 해제되었거나 만료되었습니다.",
      );
    }
    if (
      !device.lastSeenAt ||
      device.lastSeenAt.getTime() < now.getTime() - DEVICE_TOUCH_INTERVAL_MS
    ) {
      await db
        .update(desktopNotificationDevices)
        .set({ lastSeenAt: now, updatedAt: now })
        .where(
          and(
            eq(desktopNotificationDevices.id, device.id),
            sql`${desktopNotificationDevices.lastSeenAt} IS NULL OR ${desktopNotificationDevices.lastSeenAt} < ${new Date(now.getTime() - DEVICE_TOUCH_INTERVAL_MS)}`,
          ),
        );
    }
    return device;
  }

  async function createTestNotification(actor: StaffPrincipal) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TEST_NOTIFICATION_DURATION_MS);
    const devices = await db
      .select({ id: desktopNotificationDevices.id })
      .from(desktopNotificationDevices)
      .where(
        and(
          eq(desktopNotificationDevices.staffUserId, actor.id),
          eq(desktopNotificationDevices.status, "active"),
        ),
      );
    if (devices.length === 0) {
      throw new DesktopNotificationError(
        409,
        "no_active_devices",
        "먼저 이 컴퓨터를 연결해 주세요.",
      );
    }
    const notificationId = randomUUID();
    const payload: DesktopNotificationPayload = {
      title: `LAW& OS 테스트 알림 · ${actor.displayName}`,
      body:
        "김로앤 · 010-0000-0000\r\n개인회생 상담을 다시 받고 싶습니다. 오늘 오후에 통화 가능할까요?",
      category: "test",
      deepLink: `${erpBaseUrl}/desktop-notifications`,
    };
    const encrypted = protection.encrypt(
      JSON.stringify(payload),
      payloadContext(notificationId),
    );
    await db.transaction(async (tx) => {
      await tx.insert(desktopNotifications).values({
        id: notificationId,
        staffUserId: actor.id,
        eventType: "desktop.test",
        payloadCiphertext: encrypted.ciphertext,
        payloadNonce: encrypted.nonce,
        payloadKeyVersion: encrypted.keyVersion,
        expiresAt,
        createdAt: now,
      });
      await tx.insert(desktopNotificationDeliveries).values(
        devices.map((device) => ({
          id: randomUUID(),
          notificationId,
          deviceId: device.id,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        })),
      );
      await addAudit({
        actorUserId: actor.id,
        action: "desktop_notification.test.queued",
        targetType: "desktop_notification",
        targetId: notificationId,
        metadata: { deviceCount: devices.length },
        occurredAt: now,
        transaction: tx,
      });
    });
    return {
      notificationId,
      queuedDeviceCount: devices.length,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async function pollNext(rawToken: string) {
    const device = await authenticateDevice(rawToken);
    const now = new Date();
    const delivery = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          deliveryId: desktopNotificationDeliveries.id,
          notificationId: desktopNotifications.id,
          eventType: desktopNotifications.eventType,
          payloadCiphertext: desktopNotifications.payloadCiphertext,
          payloadNonce: desktopNotifications.payloadNonce,
          payloadKeyVersion: desktopNotifications.payloadKeyVersion,
          expiresAt: desktopNotifications.expiresAt,
          createdAt: desktopNotifications.createdAt,
        })
        .from(desktopNotificationDeliveries)
        .innerJoin(
          desktopNotifications,
          eq(desktopNotifications.id, desktopNotificationDeliveries.notificationId),
        )
        .where(
          and(
            eq(desktopNotificationDeliveries.deviceId, device.id),
            eq(desktopNotificationDeliveries.status, "pending"),
            eq(desktopNotifications.staffUserId, device.staffUserId),
            gt(desktopNotifications.expiresAt, now),
          ),
        )
        .orderBy(asc(desktopNotificationDeliveries.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!row) return null;
      await tx
        .update(desktopNotificationDeliveries)
        .set({
          attemptCount: sql`${desktopNotificationDeliveries.attemptCount} + 1`,
          lastAttemptAt: now,
          updatedAt: now,
        })
        .where(eq(desktopNotificationDeliveries.id, row.deliveryId));
      return row;
    });
    if (!delivery) return null;
    const payload = safePayload(
      protection.decrypt(
        {
          ciphertext: delivery.payloadCiphertext,
          nonce: delivery.payloadNonce,
          keyVersion: delivery.payloadKeyVersion,
        },
        payloadContext(delivery.notificationId),
      ),
      erpBaseUrl,
    );
    return {
      deliveryId: delivery.deliveryId,
      notificationId: delivery.notificationId,
      eventType: delivery.eventType,
      payload,
      createdAt: delivery.createdAt.toISOString(),
      expiresAt: delivery.expiresAt.toISOString(),
    };
  }

  async function acknowledge(
    rawToken: string,
    input: DesktopNotificationDeliveryAck,
  ) {
    const device = await authenticateDevice(rawToken);
    const now = new Date();
    const [delivery] = await db
      .select({
        id: desktopNotificationDeliveries.id,
        status: desktopNotificationDeliveries.status,
        deliveredAt: desktopNotificationDeliveries.deliveredAt,
      })
      .from(desktopNotificationDeliveries)
      .where(
        and(
          eq(desktopNotificationDeliveries.id, input.deliveryId),
          eq(desktopNotificationDeliveries.deviceId, device.id),
        ),
      )
      .limit(1);
    if (!delivery) {
      throw new DesktopNotificationError(
        404,
        "delivery_not_found",
        "PC 알림 전달 건을 찾을 수 없습니다.",
      );
    }
    const deliveredAt = delivery.deliveredAt ?? now;
    await db.transaction(async (tx) => {
      await tx
        .update(desktopNotificationDeliveries)
        .set({
          status: "delivered",
          deliveredAt,
          ...(input.outcome === "opened" ? { openedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(desktopNotificationDeliveries.id, delivery.id));
      await tx
        .update(desktopNotificationDevices)
        .set({ lastDeliveredAt: deliveredAt, updatedAt: now })
        .where(eq(desktopNotificationDevices.id, device.id));
    });
    return {
      deliveryId: delivery.id,
      outcome: input.outcome,
      acknowledged: true as const,
    };
  }

  async function disconnectCurrentDevice(rawToken: string) {
    const device = await authenticateDevice(rawToken);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(desktopNotificationDevices)
        .set({ status: "revoked", revokedAt: now, updatedAt: now })
        .where(eq(desktopNotificationDevices.id, device.id));
      await addAudit({
        actorUserId: device.staffUserId,
        action: "desktop_notification.device.disconnected",
        targetType: "desktop_notification_device",
        targetId: device.id,
        occurredAt: now,
        transaction: tx,
      });
    });
    return { id: device.id, disconnected: true as const };
  }

  return {
    acknowledge,
    createPairing,
    createTestNotification,
    disconnectCurrentDevice,
    listDevices,
    pairDevice,
    pollNext,
    revokeDevice,
  };
}

export type DesktopNotificationService = ReturnType<
  typeof createDesktopNotificationService
>;
