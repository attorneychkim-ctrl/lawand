import assert from "node:assert/strict";
import test from "node:test";

import { classifyTelephonyCallRegion } from "./telephony-call-region.js";

test("대표번호와 센트릭스 원회선을 서울·대전·부산으로 분류한다", () => {
  assert.equal(classifyTelephonyCallRegion({ endpointType: "representative", lineNumber: "07046079605", publicNumber: "025557455", endpointRegionKey: null, ownerRegionKeys: [] }), "seoul");
  assert.equal(classifyTelephonyCallRegion({ endpointType: "representative", lineNumber: "07052149190", publicNumber: null, endpointRegionKey: null, ownerRegionKeys: [] }), "daejeon");
  assert.equal(classifyTelephonyCallRegion({ endpointType: "representative", lineNumber: "07052257584", publicNumber: "0515051909", endpointRegionKey: null, ownerRegionKeys: [] }), "busan");
});

test("개인 회선은 직원 소속으로 분류하고 근거가 없거나 충돌하면 미분류한다", () => {
  assert.equal(classifyTelephonyCallRegion({ endpointType: "personal", lineNumber: "07012345678", publicNumber: null, endpointRegionKey: null, ownerRegionKeys: ["seoul"] }), "seoul");
  assert.equal(classifyTelephonyCallRegion({ endpointType: "personal", lineNumber: "07012345678", publicNumber: null, endpointRegionKey: null, ownerRegionKeys: [] }), "unclassified");
  assert.equal(classifyTelephonyCallRegion({ endpointType: "personal", lineNumber: "07012345678", publicNumber: null, endpointRegionKey: null, ownerRegionKeys: ["seoul", "busan"] }), "unclassified");
});
