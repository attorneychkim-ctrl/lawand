import assert from "node:assert/strict";
import test from "node:test";

import {
  centrexMessageDeliveryRoute,
  DEFAULT_CENTREX_MESSAGE_SENDER_LINE,
  outboundReplyMatchStrategy,
  solapiMessageDeliveryRoute,
} from "./telephony-message-routing.js";

test("센트릭스 SMS/LMS는 0588 발신 endpoint 자체를 회신 수신함으로 고정한다", () => {
  assert.equal(DEFAULT_CENTREX_MESSAGE_SENDER_LINE, "07046070588");
  assert.deepEqual(
    centrexMessageDeliveryRoute({
      id: "019fa6a4-6834-7782-aa0b-4e71ffb8a588",
      lineNumber: DEFAULT_CENTREX_MESSAGE_SENDER_LINE,
    }),
    {
      endpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a588",
      senderNumberSnapshot: "07046070588",
      replyMailboxEndpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a588",
    },
  );
});

test("SOLAPI MMS는 직원 endpoint와 기존 발신번호를 유지하고 회신 수신함만 별도 기록한다", () => {
  assert.deepEqual(
    solapiMessageDeliveryRoute({
      actorEndpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a459",
      senderNumber: "025557455",
      replyMailboxEndpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a745",
    }),
    {
      endpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a459",
      senderNumberSnapshot: "025557455",
      replyMailboxEndpointId: "019fa6a4-6834-7782-aa0b-4e71ffb8a745",
    },
  );
});

test("회신은 같은 mailbox만 연결하고 과거·다른 mailbox 원장은 추측하지 않는다", () => {
  const mailbox = "019fa6a4-6834-7782-aa0b-4e71ffb8a588";
  assert.equal(
    outboundReplyMatchStrategy(mailbox, mailbox),
    "reply_mailbox_latest_outbound",
  );
  assert.equal(outboundReplyMatchStrategy(null, mailbox), null);
  assert.equal(
    outboundReplyMatchStrategy(
      "019fa6a4-6834-7782-aa0b-4e71ffb8a745",
      mailbox,
    ),
    null,
  );
});
