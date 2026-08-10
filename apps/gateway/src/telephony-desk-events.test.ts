import assert from "node:assert/strict";
import test from "node:test";

import { parseTelephonyDeskEventNotification } from "./telephony-desk-events.js";

test("전화데스크 알림은 개인정보 없는 통화 식별자와 방향만 받는다", () => {
  assert.deepEqual(
    parseTelephonyDeskEventNotification(
      JSON.stringify({
        eventType: "observed_call.changed",
        entityId: "01980000-0000-7000-8000-000000000001",
        direction: "outbound",
        occurredAt: "2026-08-06T06:00:00.000Z",
      }),
    ),
    {
      eventType: "observed_call.changed",
      entityId: "01980000-0000-7000-8000-000000000001",
      direction: "outbound",
      occurredAt: "2026-08-06T06:00:00.000Z",
    },
  );
});

test("후처리와 재통화 업무 변경 알림도 개인정보 없이 허용한다", () => {
  for (const eventType of ["aftercare.changed", "follow_up.changed"] as const) {
    assert.deepEqual(
      parseTelephonyDeskEventNotification(
        JSON.stringify({
          eventType,
          entityId: "01980000-0000-7000-8000-000000000002",
          direction: "inbound",
          occurredAt: "2026-08-07T05:00:00.000Z",
        }),
      ),
      {
        eventType,
        entityId: "01980000-0000-7000-8000-000000000002",
        direction: "inbound",
        occurredAt: "2026-08-07T05:00:00.000Z",
      },
    );
  }
});

test("전화번호나 알 수 없는 유형이 섞인 전화데스크 알림은 거부한다", () => {
  assert.equal(
    parseTelephonyDeskEventNotification(
      JSON.stringify({
        eventType: "observed_call.changed",
        entityId: "01980000-0000-7000-8000-000000000001",
        direction: "inbound",
        occurredAt: "2026-08-06T06:00:00.000Z",
        remotePhone: "01012345678",
      }),
    ),
    null,
  );
  assert.equal(
    parseTelephonyDeskEventNotification(
      JSON.stringify({
        eventType: "unknown.changed",
        entityId: "01980000-0000-7000-8000-000000000001",
        direction: "inbound",
        occurredAt: "2026-08-06T06:00:00.000Z",
      }),
    ),
    null,
  );
});
