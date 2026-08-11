import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCentrexRingingRoot,
  resolveCentrexRootAfterLegEnd,
} from "./centrex-call-activity-service.js";

test("무조건 호전환은 동일 외부 root의 엄격한 근거가 있을 때만 후보로 연결한다", () => {
  assert.equal(
    resolveCentrexRingingRoot({
      partyKind: "external",
      hasExactExternalRoot: true,
      hasContextExternalRoot: false,
      incomingLineMatchesEndpoint: false,
    }),
    "pending_blind_transfer",
  );
  assert.equal(
    resolveCentrexRingingRoot({
      partyKind: "external",
      hasExactExternalRoot: false,
      hasContextExternalRoot: false,
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
      incomingLineMatchesEndpoint: true,
    }),
    "confirmed_consultation",
  );
  assert.equal(
    resolveCentrexRingingRoot({
      partyKind: "internal",
      hasExactExternalRoot: false,
      hasContextExternalRoot: false,
      incomingLineMatchesEndpoint: true,
    }),
    "standalone_internal",
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
