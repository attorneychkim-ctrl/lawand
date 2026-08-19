export const LAWAND_GA4_CANONICAL_ORIGIN = "https://lawandfirm.com";
export const ANALYTICS_CONSENT_STORAGE_KEY = "lawand.analytics-consent.v1";
export const ANALYTICS_CONSENT_VERSION = 1;
export const GA4_LEAD_SUCCESS_MARKER_PREFIX =
  "lawand.ga4.generate-lead-success.v1:";

export const NAVER_KEYWORD_ID_PATTERN = /^nkw-[a-z0-9-]{1,124}$/u;

const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,20}$/u;
const CONTROLLED_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/u;
const CONSULTATION_RECEIPT_PATTERN =
  /^LA-\d{6}-[23456789A-HJ-NP-Z]{8}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const GA4_TRACKED_STATIC_PATHS = new Set([
  "/",
  "/_not-found",
  "/about",
  "/people",
  "/privacy",
  "/terms",
  "/bank",
  "/bank/compare",
  "/bank/consultation",
  "/bank/guides/costs",
  "/bank/personal-rehabilitation",
  "/bank/personal-rehabilitation/eligibility",
  "/bank/personal-rehabilitation/process",
  "/bank/personal-rehabilitation/documents",
  "/bank/personal-rehabilitation/repayment",
  "/bank/personal-bankruptcy",
  "/bank/personal-bankruptcy/eligibility",
  "/bank/personal-bankruptcy/process",
  "/bank/personal-bankruptcy/documents",
  "/bank/situations",
  "/bank/situations/collection-and-seizure",
  "/bank/situations/investment-debt",
  "/bank/situations/self-employed",
  "/bank/cases",
  "/bank/cases/_detail",
  "/bank/reviews",
  "/bank/reviews/write",
  "/bank/self-diagnosis",
]);

export type AnalyticsConsentChoice = "granted" | "denied";

export type StoredAnalyticsConsent = {
  version: typeof ANALYTICS_CONSENT_VERSION;
  choice: AnalyticsConsentChoice;
  updatedAt: string;
};

export type GenerateLeadDedupeOutcome =
  | "new"
  | "exact_duplicate"
  | "identity_enrichment"
  | "repeat_unassigned"
  | "repeat_assigned"
  | "suspected_duplicate";

export type GenerateLeadSuccess = {
  httpOk: boolean;
  publicReceiptCode: unknown;
  dedupeOutcome: unknown;
  replayed?: unknown;
};

type Ga4PageViewPayload = {
  page_location: string;
  page_title: string;
  page_referrer?: string;
};

function controlledSlug(value: string | null, maxLength: number) {
  if (!value) return null;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    !CONTROLLED_SLUG_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normalizedOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeTrackedPagePath(pathname: string) {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  if (GA4_TRACKED_STATIC_PATHS.has(normalized)) return normalized;
  if (/^\/bank\/cases\/[^/]+$/u.test(normalized)) {
    return "/bank/cases/_detail";
  }
  return "/_not-found";
}

export function normalizeGa4MeasurementId(value: string | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return GA4_MEASUREMENT_ID_PATTERN.test(normalized) ? normalized : null;
}

export function parseStoredAnalyticsConsent(
  value: string | null,
): AnalyticsConsentChoice | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredAnalyticsConsent>;
    if (
      parsed.version !== ANALYTICS_CONSENT_VERSION ||
      (parsed.choice !== "granted" && parsed.choice !== "denied") ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }
    return parsed.choice;
  } catch {
    return null;
  }
}

export function serializeAnalyticsConsent(
  choice: AnalyticsConsentChoice,
  updatedAt: string,
) {
  return JSON.stringify({
    version: ANALYTICS_CONSENT_VERSION,
    choice,
    updatedAt,
  } satisfies StoredAnalyticsConsent);
}

export function sanitizeGa4PageLocation(
  rawUrl: string,
  canonicalOrigin = LAWAND_GA4_CANONICAL_ORIGIN,
) {
  const safeOrigin = normalizedOrigin(canonicalOrigin);
  if (!safeOrigin) return null;

  try {
    const source = new URL(rawUrl, safeOrigin);
    if (source.protocol !== "https:" && source.protocol !== "http:") {
      return null;
    }

    const sanitized = new URL(
      normalizeTrackedPagePath(source.pathname),
      safeOrigin,
    );
    const allowedSlugs = [
      ["utm_source", 100],
      ["utm_medium", 100],
      ["utm_campaign", 200],
      ["utm_content", 200],
    ] as const;

    for (const [name, maxLength] of allowedSlugs) {
      const value = controlledSlug(source.searchParams.get(name), maxLength);
      if (value) sanitized.searchParams.set(name, value);
    }

    for (const name of ["utm_term", "n_keyword_id"] as const) {
      const value = source.searchParams.get(name)?.trim() ?? "";
      if (NAVER_KEYWORD_ID_PATTERN.test(value)) {
        sanitized.searchParams.set(name, value);
      }
    }

    return sanitized.toString();
  } catch {
    return null;
  }
}

export function sanitizeGa4PageReferrer(
  rawReferrer: string,
  currentOrigin: string,
  canonicalOrigin = LAWAND_GA4_CANONICAL_ORIGIN,
) {
  if (!rawReferrer) return null;
  const safeCanonicalOrigin = normalizedOrigin(canonicalOrigin);
  const safeCurrentOrigin = normalizedOrigin(currentOrigin);
  if (!safeCanonicalOrigin || !safeCurrentOrigin) return null;

  try {
    const referrer = new URL(rawReferrer);
    if (referrer.protocol !== "https:" && referrer.protocol !== "http:") {
      return null;
    }

    const isLawandHost =
      referrer.hostname === "lawandfirm.com" ||
      referrer.hostname === "www.lawandfirm.com";
    if (referrer.origin === safeCurrentOrigin || isLawandHost) {
      return new URL(
        normalizeTrackedPagePath(referrer.pathname),
        safeCanonicalOrigin,
      ).toString();
    }
    return referrer.origin;
  } catch {
    return null;
  }
}

export function buildGa4PageViewPayload(input: {
  rawUrl: string;
  rawReferrer: string;
  currentOrigin: string;
  pageTitle: string;
}): Ga4PageViewPayload | null {
  const pageLocation = sanitizeGa4PageLocation(input.rawUrl);
  if (!pageLocation) return null;
  const pageTitle = input.pageTitle.trim().slice(0, 300);
  const pageReferrer = sanitizeGa4PageReferrer(
    input.rawReferrer,
    input.currentOrigin,
  );

  return {
    page_location: pageLocation,
    page_title: pageTitle,
    ...(pageReferrer ? { page_referrer: pageReferrer } : {}),
  };
}

export function isEligibleGenerateLeadSuccess(
  input: GenerateLeadSuccess,
): input is GenerateLeadSuccess & {
  publicReceiptCode: string;
  dedupeOutcome: "new" | "suspected_duplicate";
} {
  return (
    input.httpOk &&
    typeof input.publicReceiptCode === "string" &&
    CONSULTATION_RECEIPT_PATTERN.test(input.publicReceiptCode) &&
    (input.dedupeOutcome === "new" ||
      input.dedupeOutcome === "suspected_duplicate")
  );
}

export function makeGa4LeadSuccessMarkerKey(logicalSubmissionKey: string) {
  const normalized = logicalSubmissionKey.trim();
  return UUID_PATTERN.test(normalized)
    ? `${GA4_LEAD_SUCCESS_MARKER_PREFIX}${normalized.toLowerCase()}`
    : null;
}
