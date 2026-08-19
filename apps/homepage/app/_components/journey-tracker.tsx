"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  NAVER_KEYWORD_ID_PATTERN,
  normalizeTrackedPagePath,
} from "@/lib/analytics-contract";

export const JOURNEY_STORAGE_KEY = "lawand.bank.journey.v1";
export const CTA_STORAGE_KEY = "lawand.bank.consultation-cta.v1";
export const ATTRIBUTION_STORAGE_KEY = "lawand.bank.attribution.v1";

export type JourneyEntry = {
  path: string;
  visitedAt: string;
};

export type ConsultationCtaContext = {
  path: string;
  placement: string;
  clickedAt: string;
};

type AttributionSource = {
  adpilotClickId?: string;
  platformClickId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  externalCampaignId?: string;
  externalAdGroupId?: string;
  externalKeywordId?: string;
  externalCreativeId?: string;
  matchedKeyword?: string;
  matchType?: "exact" | "phrase" | "broad" | "unknown";
};

type AttributionSession = {
  journeySessionId: string;
  startedAt: string;
  firstLandingPath: string;
  referrerHost?: string;
  source: AttributionSource;
};

const PARAMETER_MAP = {
  adpilotClickId: ["adpilot_click_id", "adpilotClickId", "ap_click_id"],
  utmSource: ["utm_source"],
  utmMedium: ["utm_medium"],
  utmCampaign: ["utm_campaign"],
  utmTerm: ["utm_term"],
  utmContent: ["utm_content"],
  externalCampaignId: ["campaign_id", "external_campaign_id"],
  externalAdGroupId: ["adgroup_id", "ad_group_id", "external_ad_group_id"],
  externalKeywordId: ["keyword_id", "external_keyword_id"],
  externalCreativeId: ["creative_id", "external_creative_id"],
} as const;

function readJourney(): JourneyEntry[] {
  try {
    const value = window.sessionStorage.getItem(JOURNEY_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is JourneyEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as JourneyEntry).path === "string" &&
        typeof (entry as JourneyEntry).visitedAt === "string",
    );
  } catch {
    return [];
  }
}

function firstParameter(
  searchParams: URLSearchParams,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = searchParams.get(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

function captureAttribution(path: string): AttributionSession {
  const searchParams = new URLSearchParams(window.location.search);
  const source: AttributionSource = {};
  for (const [field, parameterNames] of Object.entries(PARAMETER_MAP)) {
    const value = firstParameter(searchParams, parameterNames);
    if (value) {
      source[field as keyof typeof PARAMETER_MAP] = value.slice(0, 200);
    }
  }

  const naverKeywordId = firstParameter(searchParams, ["n_keyword_id"]);
  if (naverKeywordId && NAVER_KEYWORD_ID_PATTERN.test(naverKeywordId)) {
    source.externalKeywordId = naverKeywordId;
  }

  source.platformClickId = firstParameter(searchParams, [
    "platform_click_id",
    "gclid",
    "nclid",
    "msclkid",
    "fbclid",
    "ttclid",
    "wbraid",
    "gbraid",
  ])?.slice(0, 200);

  const rawMatchType = firstParameter(searchParams, ["match_type"]);
  if (rawMatchType) {
    source.matchType = ["exact", "phrase", "broad"].includes(rawMatchType)
      ? (rawMatchType as "exact" | "phrase" | "broad")
      : "unknown";
  }

  let referrerHost: string | undefined;
  try {
    referrerHost = document.referrer
      ? new URL(document.referrer).hostname.slice(0, 253)
      : undefined;
  } catch {
    referrerHost = undefined;
  }

  return {
    journeySessionId: window.crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    firstLandingPath: path,
    ...(referrerHost ? { referrerHost } : {}),
    source,
  };
}

function readAttributionSession(): AttributionSession | null {
  try {
    const value = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<AttributionSession>;
    if (
      typeof parsed.journeySessionId !== "string" ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.firstLandingPath !== "string" ||
      typeof parsed.source !== "object" ||
      parsed.source === null
    ) {
      return null;
    }
    return parsed as AttributionSession;
  } catch {
    return null;
  }
}

export function getConsultationJourney() {
  return readJourney();
}

export function getConsultationCtaContext(): ConsultationCtaContext | null {
  try {
    const value = window.sessionStorage.getItem(CTA_STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<ConsultationCtaContext>;
    if (
      typeof parsed.path !== "string" ||
      typeof parsed.placement !== "string" ||
      typeof parsed.clickedAt !== "string"
    ) {
      return null;
    }
    return parsed as ConsultationCtaContext;
  } catch {
    return null;
  }
}

export function getConsultationAttribution() {
  const path = normalizeTrackedPagePath(window.location.pathname);
  const session =
    readAttributionSession() ??
    captureAttribution(path);
  return {
    ...session,
    journey: readJourney(),
    consultationCta: getConsultationCtaContext() ?? undefined,
    submittedFromPath: path,
  };
}

export function getConsultationAttributionForCta(placement: string) {
  const path = normalizeTrackedPagePath(window.location.pathname);
  const session =
    readAttributionSession() ?? captureAttribution(path);
  return {
    ...session,
    journey: readJourney(),
    consultationCta: {
      path,
      placement,
      clickedAt: new Date().toISOString(),
    },
    submittedFromPath: path,
  };
}

export function JourneyTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const trackedPath = normalizeTrackedPagePath(pathname);
    if (!readAttributionSession()) {
      window.sessionStorage.setItem(
        ATTRIBUTION_STORAGE_KEY,
        JSON.stringify(captureAttribution(trackedPath)),
      );
    }

    const journey = readJourney();
    const previous = journey.at(-1);
    if (previous?.path !== trackedPath && journey.length < 20) {
      window.sessionStorage.setItem(
        JOURNEY_STORAGE_KEY,
        JSON.stringify([
          ...journey,
          { path: trackedPath, visitedAt: new Date().toISOString() },
        ]),
      );
    }

    const recordConsultationCta = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>(
        'a[href^="/bank/consultation"]',
      );
      if (!link) return;
      const context: ConsultationCtaContext = {
        path: trackedPath,
        placement: link.dataset.consultationCta ?? "link",
        clickedAt: new Date().toISOString(),
      };
      window.sessionStorage.setItem(CTA_STORAGE_KEY, JSON.stringify(context));
    };

    document.addEventListener("click", recordConsultationCta);
    return () => document.removeEventListener("click", recordConsultationCta);
  }, [pathname]);

  return null;
}
