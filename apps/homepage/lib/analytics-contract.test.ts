import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  buildGa4PageViewPayload,
  isEligibleGenerateLeadSuccess,
  makeGa4LeadSuccessMarkerKey,
  normalizeGa4MeasurementId,
  normalizeTrackedPagePath,
  parseStoredAnalyticsConsent,
  sanitizeGa4PageLocation,
  sanitizeGa4PageReferrer,
  serializeAnalyticsConsent,
} from "./analytics-contract.ts";
import {
  denyGa4AnalyticsConsent,
  grantGa4AnalyticsConsent,
  initializeGa4ConsentDefaults,
  recordGa4GenerateLead,
  sendGa4PageView,
} from "./analytics-runtime.ts";

test("GA4 Measurement ID가 없거나 형식이 잘못되면 비활성화한다", () => {
  assert.equal(normalizeGa4MeasurementId(undefined), null);
  assert.equal(normalizeGa4MeasurementId("UA-123"), null);
  assert.equal(normalizeGa4MeasurementId("G-ABC"), null);
  assert.equal(
    normalizeGa4MeasurementId(" g-1a2b3c4d5e "),
    "G-1A2B3C4D5E",
  );
});

test("동의 선택은 현재 버전과 명시적인 선택만 복원한다", () => {
  const stored = serializeAnalyticsConsent(
    "granted",
    "2026-08-19T01:02:03.000Z",
  );
  assert.equal(parseStoredAnalyticsConsent(stored), "granted");
  assert.equal(
    parseStoredAnalyticsConsent(
      JSON.stringify({
        version: 0,
        choice: "granted",
        updatedAt: "2026-08-19T01:02:03.000Z",
      }),
    ),
    null,
  );
  assert.equal(parseStoredAnalyticsConsent("not-json"), null);
  assert.equal(ANALYTICS_CONSENT_STORAGE_KEY, "lawand.analytics-consent.v1");
});

test("page_location은 정식 origin과 허용된 캠페인 키만 남긴다", () => {
  const sanitized = sanitizeGa4PageLocation(
    "https://evil.example/bank/consultation?utm_source=naver&utm_medium=cpc&utm_campaign=rehab-2026&utm_content=mobile_a&utm_term=nkw-a001-01-test&n_keyword_id=nkw-a001-01-test&n_query=%EB%AF%BC%EA%B0%90%EA%B2%80%EC%83%89%EC%96%B4&phone=01012345678#secret",
  );

  assert.equal(
    sanitized,
    "https://lawandfirm.com/bank/consultation?utm_source=naver&utm_medium=cpc&utm_campaign=rehab-2026&utm_content=mobile_a&utm_term=nkw-a001-01-test&n_keyword_id=nkw-a001-01-test",
  );
});

test("통제되지 않은 slug와 실제 검색어 형태의 utm_term은 버린다", () => {
  assert.equal(
    sanitizeGa4PageLocation(
      "https://lawandfirm.com/bank?utm_source=%EB%84%A4%EC%9D%B4%EB%B2%84&utm_campaign=has%20space&utm_term=%EA%B0%9C%EC%9D%B8%ED%9A%8C%EC%83%9D&n_keyword_id=keyword-12&safe=no",
    ),
    "https://lawandfirm.com/bank",
  );
});

test("공개 경로만 유지하고 사례 slug와 알 수 없는 경로는 일반화한다", () => {
  assert.equal(normalizeTrackedPagePath("/bank/"), "/bank");
  assert.equal(
    normalizeTrackedPagePath("/bank/cases/rehabilitation-2026-01"),
    "/bank/cases/_detail",
  );
  assert.equal(
    normalizeTrackedPagePath("/bank/010-1234-5678"),
    "/_not-found",
  );
  assert.equal(
    sanitizeGa4PageLocation(
      "https://lawandfirm.com/bank/010-1234-5678?n_keyword_id=nkw-a001-01-test",
    ),
    "https://lawandfirm.com/_not-found?n_keyword_id=nkw-a001-01-test",
  );
});

test("referrer는 내부 경로 또는 외부 origin까지만 남긴다", () => {
  assert.equal(
    sanitizeGa4PageReferrer(
      "https://lawandfirm.com/about?customer=홍길동#detail",
      "https://lawandfirm.com",
    ),
    "https://lawandfirm.com/about",
  );
  assert.equal(
    sanitizeGa4PageReferrer(
      "https://search.naver.com/search.naver?query=개인회생",
      "https://lawandfirm.com",
    ),
    "https://search.naver.com",
  );
  assert.equal(
    sanitizeGa4PageReferrer(
      "https://lawandfirm.com/customer/010-1234-5678",
      "https://lawandfirm.com",
    ),
    "https://lawandfirm.com/_not-found",
  );
});

test("page_view payload에는 정제 위치·referrer·통제된 제목만 들어간다", () => {
  assert.deepEqual(
    buildGa4PageViewPayload({
      rawUrl:
        "https://lawandfirm.com/bank?n_keyword_id=nkw-e2e-test&n_query=민감검색어",
      rawReferrer: "https://search.naver.com/?query=민감검색어",
      currentOrigin: "https://lawandfirm.com",
      pageTitle: `  ${"가".repeat(400)}  `,
    }),
    {
      page_location:
        "https://lawandfirm.com/bank?n_keyword_id=nkw-e2e-test",
      page_referrer: "https://search.naver.com",
      page_title: "가".repeat(300),
    },
  );
});

test("generate_lead는 유효한 신규·의심중복 성공만 허용하고 replayed만으로 제외하지 않는다", () => {
  const base = {
    httpOk: true,
    publicReceiptCode: "LA-260819-23456789",
    replayed: true,
  };
  assert.equal(
    isEligibleGenerateLeadSuccess({ ...base, dedupeOutcome: "new" }),
    true,
  );
  assert.equal(
    isEligibleGenerateLeadSuccess({
      ...base,
      dedupeOutcome: "suspected_duplicate",
    }),
    true,
  );
  for (const dedupeOutcome of [
    "exact_duplicate",
    "identity_enrichment",
    "repeat_unassigned",
    "repeat_assigned",
  ]) {
    assert.equal(
      isEligibleGenerateLeadSuccess({ ...base, dedupeOutcome }),
      false,
    );
  }
  assert.equal(
    isEligibleGenerateLeadSuccess({
      ...base,
      httpOk: false,
      dedupeOutcome: "new",
    }),
    false,
  );
  assert.equal(
    isEligibleGenerateLeadSuccess({
      ...base,
      publicReceiptCode: "LA-invalid",
      dedupeOutcome: "new",
    }),
    false,
  );
});

test("성공 마커는 UUID 논리 제출키만 받는다", () => {
  assert.equal(
    makeGa4LeadSuccessMarkerKey("0198a1b2-c3d4-7e5f-8a9b-0123456789ab"),
    "lawand.ga4.generate-lead-success.v1:0198a1b2-c3d4-7e5f-8a9b-0123456789ab",
  );
  assert.equal(makeGa4LeadSuccessMarkerKey("receipt-or-phone"), null);
});

test("브라우저 런타임은 동의 뒤 page_view와 논리 제출당 generate_lead를 한 번만 큐에 넣는다", () => {
  const sessionValues = new Map<string, string>();
  const localValues = new Map<string, string>();
  const storage = (values: Map<string, string>) =>
    ({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }) as unknown as Storage;
  const dataLayer: unknown[] = [];
  const windowStub = {
    dataLayer,
    location: {
      href: "https://lawandfirm.com/bank/consultation?n_keyword_id=nkw-e2e-test&n_query=민감검색어",
      hostname: "lawandfirm.com",
      origin: "https://lawandfirm.com",
      protocol: "https:",
    },
    localStorage: storage(localValues),
    sessionStorage: storage(sessionValues),
  } as unknown as Window & typeof globalThis;
  const documentStub = {
    cookie: "",
  } as unknown as Document;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
  });

  initializeGa4ConsentDefaults();
  grantGa4AnalyticsConsent("G-TEST123456");

  const pageInput = {
    rawUrl: windowStub.location.href,
    rawReferrer: "https://search.naver.com/?query=민감검색어",
    currentOrigin: windowStub.location.origin,
    pageTitle: "상담 요청 | 법무법인 로앤",
  };
  assert.equal(sendGa4PageView(pageInput), true);
  assert.equal(sendGa4PageView(pageInput), false);
  assert.equal(
    sendGa4PageView({
      ...pageInput,
      rawUrl: "https://lawandfirm.com/about?utm_source=naver",
      pageTitle: "로앤 소개 | 법무법인 로앤",
    }),
    true,
  );

  const leadInput = {
    logicalSubmissionKey: "0198a1b2-c3d4-7e5f-8a9b-0123456789ab",
    response: {
      httpOk: true,
      publicReceiptCode: "LA-260819-23456789",
      dedupeOutcome: "new",
      replayed: true,
    },
  } as const;
  assert.equal(recordGa4GenerateLead(leadInput), true);
  assert.equal(recordGa4GenerateLead(leadInput), false);

  const commands = dataLayer.map((command) =>
    Array.from(command as ArrayLike<unknown>),
  );
  const pageViewCommands = commands.filter(
    (command) =>
      command[0] === "event" &&
      command[1] === "page_view",
  );
  const leadCommands = commands.filter(
    (command) =>
      command[0] === "event" &&
      command[1] === "generate_lead",
  );
  const configCommands = commands.filter(
    (command) =>
      command[0] === "config" &&
      command[1] === "G-TEST123456",
  );
  assert.equal(pageViewCommands.length, 2);
  assert.equal(leadCommands.length, 1);
  assert.deepEqual(configCommands[0], [
    "config",
    "G-TEST123456",
    {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: 36_288_000,
      cookie_update: false,
      cookie_flags: "SameSite=Lax;Secure",
      page_location:
        "https://lawandfirm.com/bank/consultation?n_keyword_id=nkw-e2e-test",
    },
  ]);
  assert.deepEqual(pageViewCommands[1], [
    "event",
    "page_view",
    {
      page_location: "https://lawandfirm.com/about?utm_source=naver",
      page_title: "로앤 소개 | 법무법인 로앤",
      page_referrer: "https://lawandfirm.com/bank/consultation",
      send_to: "G-TEST123456",
    },
  ]);
  assert.deepEqual(leadCommands[0], [
    "event",
    "generate_lead",
    {
      page_location: "https://lawandfirm.com/about?utm_source=naver",
      send_to: "G-TEST123456",
    },
  ]);
  assert.equal(JSON.stringify(commands).includes("23456789"), false);
  assert.equal(JSON.stringify(commands).includes("민감검색어"), false);
  assert.equal(
    JSON.stringify(commands).includes(leadInput.logicalSubmissionKey),
    false,
  );

  denyGa4AnalyticsConsent();
  assert.equal(
    (windowStub as unknown as Record<string, boolean>)[
      "ga-disable-G-TEST123456"
    ],
    true,
  );
  assert.equal(
    sendGa4PageView({
      ...pageInput,
      rawUrl: "https://lawandfirm.com/privacy",
    }),
    false,
  );
  const successWhileDenied = {
    ...leadInput,
    logicalSubmissionKey: "0198a1b2-c3d4-7e5f-8a9b-1123456789ab",
  };
  assert.equal(recordGa4GenerateLead(successWhileDenied), false);
  grantGa4AnalyticsConsent("G-TEST123456");
  assert.equal(recordGa4GenerateLead(successWhileDenied), false);
});
