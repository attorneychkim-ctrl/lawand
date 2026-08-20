import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopNotificationMaintenance } from "./desktop-notification-maintenance.js";

test("만료 정리는 시작 즉시 실행하고 겹치는 실행을 하나로 합친다", async () => {
  let calls = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const maintenance = createDesktopNotificationMaintenance({
    desktopNotifications: {
      async cleanupExpired() {
        calls += 1;
        await blocked;
        return { expiredPairingCount: 0, expiredNotificationCount: 0 };
      },
    },
    intervalMs: 60_000,
  });

  maintenance.start();
  await Promise.resolve();
  const overlapping = maintenance.runNow();
  assert.equal(calls, 1);
  release();
  await overlapping;
  await maintenance.stop();
  assert.equal(calls, 1);
});

test("만료 정리 실패는 운영 콜백으로 전달하고 다음 실행을 막지 않는다", async () => {
  let calls = 0;
  const errors: unknown[] = [];
  const maintenance = createDesktopNotificationMaintenance({
    desktopNotifications: {
      async cleanupExpired() {
        calls += 1;
        if (calls === 1) throw new Error("cleanup failed");
        return { expiredPairingCount: 1, expiredNotificationCount: 2 };
      },
    },
    onError: (error) => errors.push(error),
  });

  await maintenance.runNow();
  await maintenance.runNow();
  assert.equal(calls, 2);
  assert.equal(errors.length, 1);
});
