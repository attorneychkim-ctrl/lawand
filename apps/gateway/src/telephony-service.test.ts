import assert from "node:assert/strict";
import test from "node:test";

import {
  isCentrexInboundAnswerDeliveryDelayed,
  legalFriendsResidenceRegion,
  phoneDeskItemMatchesFilter,
} from "./telephony-service.js";

test("전화데스크 출처 필터는 다른 출처를 섞지 않고 진행 중 상태만 선별한다", () => {
  const inboundEnded = {
    source: "inbound" as const,
    state: "ended" as const,
  };
  const erpOutbound = {
    source: "click_to_call" as const,
    state: "ended" as const,
  };
  const directOutbound = {
    source: "centrex_direct" as const,
    state: "connected" as const,
  };

  assert.equal(phoneDeskItemMatchesFilter(inboundEnded, "all"), true);
  assert.equal(phoneDeskItemMatchesFilter(inboundEnded, "inbound"), true);
  assert.equal(phoneDeskItemMatchesFilter(inboundEnded, "click_to_call"), false);
  assert.equal(phoneDeskItemMatchesFilter(inboundEnded, "centrex_direct"), false);
  assert.equal(phoneDeskItemMatchesFilter(inboundEnded, "active"), false);
  assert.equal(phoneDeskItemMatchesFilter(erpOutbound, "click_to_call"), true);
  assert.equal(phoneDeskItemMatchesFilter(directOutbound, "centrex_direct"), true);
  assert.equal(phoneDeskItemMatchesFilter(directOutbound, "active"), true);
});

test("리걸프렌즈 거주지는 상세 주소를 노출하지 않고 광역 지역으로만 정규화한다", () => {
  assert.equal(legalFriendsResidenceRegion("서울특별시 강남구"), "seoul");
  assert.equal(legalFriendsResidenceRegion("강원특별자치도 원주시"), "gangwon");
  assert.equal(legalFriendsResidenceRegion("전라북도 전주시"), "jeonbuk");
  assert.equal(legalFriendsResidenceRegion("해외 거주"), "overseas_or_other");
  assert.equal(legalFriendsResidenceRegion("주소 미확인"), null);
  assert.equal(legalFriendsResidenceRegion(null), null);
});

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
