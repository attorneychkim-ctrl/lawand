import assert from "node:assert/strict";
import test from "node:test";

import {
  canCentrexChannelsAdvanceState,
  isConfirmedCallPickupEvidence,
  resolveCentrexRingingRoot,
  resolveCentrexRootAfterLegEnd,
  shouldMirrorCentrexTerminalSibling,
} from "./centrex-call-activity-service.js";

test("내선·상담 양쪽 leg는 한쪽의 실제 종료 근거를 공유한다", () => {
  assert.equal(
    shouldMirrorCentrexTerminalSibling({
      rootScope: "internal",
      endedKind: "internal",
    }),
    true,
  );
  assert.equal(
    shouldMirrorCentrexTerminalSibling({
      rootScope: "external",
      endedKind: "consultation",
    }),
    true,
  );
  assert.equal(
    shouldMirrorCentrexTerminalSibling({
      rootScope: "external",
      endedKind: "customer",
    }),
    false,
  );
});

test("종료된 leg나 root는 늦은 CHANNEL_LIST로 다시 연결되지 않는다", () => {
  assert.equal(
    canCentrexChannelsAdvanceState({
      rootState: "ended",
      legState: "ended",
    }),
    false,
  );
  assert.equal(
    canCentrexChannelsAdvanceState({
      rootState: "connected",
      legState: "ended",
    }),
    false,
  );
  assert.equal(
    canCentrexChannelsAdvanceState({
      rootState: "ringing",
      legState: "ringing",
    }),
    true,
  );
});

test("당겨받기는 같은 외부 root의 다른 endpoint CHANNEL_LIST만 수용한다", () => {
  assert.equal(
    isConfirmedCallPickupEvidence({
      rootScope: "external",
      rootEnded: false,
      sourceEndpointId: "endpoint-4425",
      targetEndpointId: "endpoint-1208",
      hasTargetLeg: false,
      hasTransferRelation: false,
    }),
    true,
  );
  assert.equal(
    isConfirmedCallPickupEvidence({
      rootScope: "external",
      rootEnded: false,
      sourceEndpointId: "endpoint-4425",
      targetEndpointId: "endpoint-1208",
      hasTargetLeg: false,
      hasTransferRelation: true,
    }),
    false,
  );
  assert.equal(
    isConfirmedCallPickupEvidence({
      rootScope: "external",
      rootEnded: false,
      sourceEndpointId: "endpoint-4425",
      targetEndpointId: "endpoint-4425",
      hasTargetLeg: false,
      hasTransferRelation: false,
    }),
    false,
  );
  assert.equal(
    isConfirmedCallPickupEvidence({
      rootScope: "external",
      rootEnded: true,
      sourceEndpointId: "endpoint-4425",
      targetEndpointId: "endpoint-1208",
      hasTargetLeg: false,
      hasTransferRelation: false,
    }),
    false,
  );
});

test("무조건 호전환은 동일 외부 root의 엄격한 근거가 있을 때만 후보로 연결한다", () => {
  assert.equal(
    resolveCentrexRingingRoot({
      partyKind: "external",
      hasExactExternalRoot: true,
      hasContextExternalRoot: false,
      hasActiveEndpointExternalRoot: false,
      incomingLineMatchesEndpoint: false,
    }),
    "pending_blind_transfer",
  );
  assert.equal(
    resolveCentrexRingingRoot({
      partyKind: "external",
      hasExactExternalRoot: false,
      hasContextExternalRoot: false,
      hasActiveEndpointExternalRoot: false,
      incomingLineMatchesEndpoint: false,
    }),
    "needs_confirmation",
  );
});

test("활성 외부 통화 문맥의 내선 통화만 호전환 상담 leg가 된다", () => {
  assert.equal(
    resolveCentrexRingingRoot({
      partyKind: "internal",
      hasExactExternalRoot: false,
      hasContextExternalRoot: true,
      hasActiveEndpointExternalRoot: false,
      incomingLineMatchesEndpoint: true,
    }),
    "confirmed_consultation",
  );
  assert.equal(
    resolveCentrexRingingRoot({
      partyKind: "internal",
      hasExactExternalRoot: false,
      hasContextExternalRoot: false,
      hasActiveEndpointExternalRoot: false,
      incomingLineMatchesEndpoint: true,
    }),
    "standalone_internal",
  );
});

test("bridge 문맥이 없어도 outbound endpoint의 유일한 연결 고객 leg는 상담 문맥 근거다", () => {
  assert.equal(
    resolveCentrexRingingRoot({
      partyKind: "internal",
      hasExactExternalRoot: false,
      hasContextExternalRoot: false,
      hasActiveEndpointExternalRoot: true,
      incomingLineMatchesEndpoint: true,
    }),
    "confirmed_consultation",
  );
});

test("A 고객 leg 종료 뒤 B 고객 leg가 살아 있으면 고객 root를 종료하지 않는다", () => {
  assert.equal(
    resolveCentrexRootAfterLegEnd({
      scope: "external",
      endedKind: "customer",
      endedWasConnected: true,
      hasActiveCustomerLeg: true,
      hasActiveConsultationLeg: false,
      hasAnyActiveLeg: true,
    }),
    "connected",
  );
});

test("통화 후 호전환의 최종 고객 leg 근거가 없으면 확인 필요로 보존한다", () => {
  assert.equal(
    resolveCentrexRootAfterLegEnd({
      scope: "external",
      endedKind: "customer",
      endedWasConnected: true,
      hasActiveCustomerLeg: false,
      hasActiveConsultationLeg: true,
      hasAnyActiveLeg: true,
    }),
    "needs_confirmation",
  );
});

test("미연결 상담 종료 뒤 고객 leg가 유지되면 복귀 가능한 연결 상태다", () => {
  assert.equal(
    resolveCentrexRootAfterLegEnd({
      scope: "external",
      endedKind: "consultation",
      endedWasConnected: false,
      hasActiveCustomerLeg: true,
      hasActiveConsultationLeg: false,
      hasAnyActiveLeg: true,
    }),
    "connected",
  );
});
