import {
  buildGa4PageViewPayload,
  isEligibleGenerateLeadSuccess,
  makeGa4LeadSuccessMarkerKey,
  sanitizeGa4PageLocation,
  sanitizeGa4PageReferrer,
  type GenerateLeadSuccess,
} from "./analytics-contract.ts";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_COOKIE_EXPIRY_SECONDS = 60 * 60 * 24 * 30 * 14;

let consentDefaultsInitialized = false;
let analyticsConsentGranted = false;
let configuredMeasurementId: string | null = null;
let currentPageLocation: string | null = null;
let lastPageViewLocation: string | null = null;
const claimedLeadSuccesses = new Set<string>();

function ensureGtag() {
  if (typeof window === "undefined") return null;
  window.dataLayer ??= [];
  window.gtag ??= function gtag() {
    // Google의 표준 gtag snippet과 같은 array-like 명령 형태를 유지한다.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  return window.gtag;
}

function deniedConsentFields() {
  return {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  } as const;
}

export function initializeGa4ConsentDefaults() {
  if (consentDefaultsInitialized) return;
  const gtag = ensureGtag();
  if (!gtag) return;
  gtag("consent", "default", deniedConsentFields());
  consentDefaultsInitialized = true;
}

export function grantGa4AnalyticsConsent(measurementId: string) {
  initializeGa4ConsentDefaults();
  const gtag = ensureGtag();
  if (!gtag) return;
  analyticsConsentGranted = true;
  gtag("consent", "update", {
    ...deniedConsentFields(),
    analytics_storage: "granted",
  });
  (window as unknown as Record<string, boolean>)[
    `ga-disable-${measurementId}`
  ] = false;

  if (configuredMeasurementId !== measurementId) {
    const pageLocation = sanitizeGa4PageLocation(window.location.href);
    const pageReferrer = sanitizeGa4PageReferrer(
      typeof document.referrer === "string" ? document.referrer : "",
      window.location.origin,
    );
    gtag("set", "ads_data_redaction", true);
    gtag("js", new Date());
    gtag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: GA_COOKIE_EXPIRY_SECONDS,
      cookie_update: false,
      cookie_flags: "SameSite=Lax;Secure",
      ...(pageLocation ? { page_location: pageLocation } : {}),
      ...(pageReferrer ? { page_referrer: pageReferrer } : {}),
    });
    configuredMeasurementId = measurementId;
  }
}

function deleteGaCookies() {
  if (typeof document === "undefined") return;
  const cookieNames = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
  const hostname = window.location.hostname;
  const domainCandidates = new Set<string>(["", hostname]);
  if (hostname === "lawandfirm.com" || hostname.endsWith(".lawandfirm.com")) {
    domainCandidates.add("lawandfirm.com");
    domainCandidates.add(".lawandfirm.com");
  }

  for (const name of cookieNames) {
    for (const domain of domainCandidates) {
      const domainAttribute = domain ? `; Domain=${domain}` : "";
      const secureAttribute =
        window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secureAttribute}${domainAttribute}`;
    }
  }
}

export function denyGa4AnalyticsConsent(measurementId?: string | null) {
  initializeGa4ConsentDefaults();
  analyticsConsentGranted = false;
  ensureGtag()?.("consent", "update", deniedConsentFields());
  const disableMeasurementId = measurementId ?? configuredMeasurementId;
  if (disableMeasurementId) {
    (window as unknown as Record<string, boolean>)[
      `ga-disable-${disableMeasurementId}`
    ] = true;
  }
  currentPageLocation = null;
  lastPageViewLocation = null;
  deleteGaCookies();
}

export function resetGa4PageViewDeduplication() {
  lastPageViewLocation = null;
  currentPageLocation = null;
}

export function sendGa4PageView(input: {
  rawUrl: string;
  rawReferrer: string;
  currentOrigin: string;
  pageTitle: string;
}) {
  if (!analyticsConsentGranted || !configuredMeasurementId) return false;
  const payload = buildGa4PageViewPayload(input);
  if (!payload || payload.page_location === lastPageViewLocation) return false;
  const gtag = ensureGtag();
  if (!gtag) return false;

  const pageReferrer = currentPageLocation
    ? sanitizeGa4PageReferrer(
        currentPageLocation,
        new URL(currentPageLocation).origin,
      )
    : payload.page_referrer;
  currentPageLocation = payload.page_location;
  lastPageViewLocation = payload.page_location;
  const eventPayload = {
    ...payload,
    ...(pageReferrer ? { page_referrer: pageReferrer } : {}),
    send_to: configuredMeasurementId,
  };

  gtag("config", configuredMeasurementId, {
    send_page_view: false,
    page_location: payload.page_location,
    ...(pageReferrer ? { page_referrer: pageReferrer } : {}),
  });
  gtag("event", "page_view", eventPayload);
  return true;
}

function claimLeadSuccess(logicalSubmissionKey: string) {
  const markerKey = makeGa4LeadSuccessMarkerKey(logicalSubmissionKey);
  if (!markerKey || claimedLeadSuccesses.has(markerKey)) return false;
  try {
    if (window.sessionStorage.getItem(markerKey) === "1") {
      claimedLeadSuccesses.add(markerKey);
      return false;
    }
    window.sessionStorage.setItem(markerKey, "1");
  } catch {
    // 저장소가 차단된 경우에도 현재 문서 안에서는 메모리 마커로 중복을 막는다.
  }
  claimedLeadSuccesses.add(markerKey);
  return true;
}

export function recordGa4GenerateLead(input: {
  logicalSubmissionKey: string;
  response: GenerateLeadSuccess;
}) {
  if (!isEligibleGenerateLeadSuccess(input.response)) return false;
  if (!claimLeadSuccess(input.logicalSubmissionKey)) return false;
  if (!analyticsConsentGranted || !configuredMeasurementId) return false;
  const gtag = ensureGtag();
  if (!gtag) return false;

  const pageLocation =
    currentPageLocation ??
    sanitizeGa4PageLocation(window.location.href);
  gtag("event", "generate_lead", {
    ...(pageLocation ? { page_location: pageLocation } : {}),
    send_to: configuredMeasurementId,
  });
  return true;
}
