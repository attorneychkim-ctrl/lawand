import assert from "node:assert/strict";
import test from "node:test";

import { isCentrexInboundAnswerDeliveryDelayed } from "./telephony-service.js";

test("늦게 전달된 수신 이벤트에는 전화 받기 명령을 노출하지 않는다", () => {
  assert.equal(
    isCentrexInboundAnswerDeliveryDelayed({
      answerableBridge: true,
      occurredAt: new Date("2026-08-12T01:12:06.231Z"),
      receivedAt: new Date("2026-08-12T01:13:14.558Z"),
    }),
    true,
  );
  assert.equal(
    isCentrexInboundAnswerDeliveryDelayed({
      answerableBridge: true,
      occurredAt: new Date("2026-08-12T01:12:06.231Z"),
      receivedAt: new Date("2026-08-12T01:12:07.000Z"),
    }),
    false,
  );
});

test("받기 가능한 bridge인데 수신 근거가 없으면 안전하게 버튼을 숨긴다", () => {
  assert.equal(
    isCentrexInboundAnswerDeliveryDelayed({
      answerableBridge: true,
      occurredAt: null,
      receivedAt: null,
    }),
    true,
  );
  assert.equal(
    isCentrexInboundAnswerDeliveryDelayed({
      answerableBridge: false,
      occurredAt: null,
      receivedAt: null,
    }),
    false,
  );
});
