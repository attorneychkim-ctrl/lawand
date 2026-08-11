import assert from "node:assert/strict";
import test from "node:test";

import {
  centrexInboundSourceIdentity,
  centrexMailboxNextCheckpoint,
  centrexMailboxPollPage,
  parseCentrexReceivedAt,
} from "./centrex-message-inbox-worker.js";
import { maskedMessagePhone } from "./telephony-service.js";

test("센트릭스 수신문자 시각을 한국 표준시로 해석한다", () => {
  assert.equal(
    parseCentrexReceivedAt("2026-08-11 10:19:41").toISOString(),
    "2026-08-11T01:19:41.000Z",
  );
});

test("형식이 불명확한 센트릭스 수신문자 시각은 거부한다", () => {
  assert.throws(
    () => parseCentrexReceivedAt("2026/08/11 10:19:41"),
    /invalid_centrex_received_at/,
  );
});

test("센트릭스 특수 발신 식별자는 고객 전화번호 매칭에서 격리한다", () => {
  assert.deepEqual(
    centrexInboundSourceIdentity({
      source: "1w234567",
      sourceKind: "provider_opaque",
    }),
    {
      fingerprintInput: {
        provider: "centrex",
        sourceKind: "provider_opaque",
        source: "1w234567",
      },
      matchOutbound: false,
    },
  );
  assert.deepEqual(
    centrexInboundSourceIdentity({
      source: "01012345678",
      sourceKind: "phone",
    }),
    {
      fingerprintInput: "01012345678",
      matchOutbound: true,
    },
  );
  assert.equal(maskedMessagePhone("1w234567"), "발신번호 확인 필요");
  assert.equal(maskedMessagePhone("01012345678"), "010-****-5678");
});

test("최신 수신함과 과거 페이지를 번갈아 읽고 backfill 완료를 보존한다", () => {
  const syncedAt = new Date("2026-08-11T01:20:00.000Z");
  const afterFirstPage = centrexMailboxNextCheckpoint({
    requestedPage: 1,
    storedNextPage: 1,
    backfillCompletedAt: null,
    resultPage: 1,
    pageSize: 10,
    total: 21,
    syncedAt,
  });
  assert.deepEqual(afterFirstPage, {
    nextPage: 2,
    pollBackfillNext: true,
    backfillCompletedAt: null,
  });
  assert.equal(centrexMailboxPollPage(afterFirstPage), 2);

  const afterBackfillPage = centrexMailboxNextCheckpoint({
    requestedPage: 2,
    storedNextPage: 2,
    backfillCompletedAt: null,
    resultPage: 2,
    pageSize: 10,
    total: 21,
    syncedAt,
  });
  assert.equal(afterBackfillPage.nextPage, 3);
  assert.equal(afterBackfillPage.pollBackfillNext, false);
  assert.equal(centrexMailboxPollPage(afterBackfillPage), 1);

  const completed = centrexMailboxNextCheckpoint({
    requestedPage: 3,
    storedNextPage: 3,
    backfillCompletedAt: null,
    resultPage: 3,
    pageSize: 10,
    total: 21,
    syncedAt,
  });
  assert.equal(completed.nextPage, 1);
  assert.equal(completed.pollBackfillNext, false);
  assert.equal(completed.backfillCompletedAt, syncedAt);
});
