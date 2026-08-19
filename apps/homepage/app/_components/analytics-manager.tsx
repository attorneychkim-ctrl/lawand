"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { normalizeGa4MeasurementId } from "@/lib/analytics-contract";
import {
  denyGa4AnalyticsConsent,
  grantGa4AnalyticsConsent,
  initializeGa4ConsentDefaults,
  resetGa4PageViewDeduplication,
  sendGa4PageView,
} from "@/lib/analytics-runtime";

function Ga4PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    sendGa4PageView({
      rawUrl: window.location.href,
      rawReferrer: document.referrer,
      currentOrigin: window.location.origin,
      pageTitle: document.title,
    });
  }, [pathname, search]);

  return null;
}

async function readRuntimeMeasurementId(signal: AbortSignal) {
  const response = await fetch("/api/analytics-config", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { measurementId?: unknown };
  return normalizeGa4MeasurementId(
    typeof body.measurementId === "string" ? body.measurementId : undefined,
  );
}

export function AnalyticsManager() {
  const [measurementId, setMeasurementId] = useState<string | null>(null);

  useEffect(() => {
    initializeGa4ConsentDefaults();
    const controller = new AbortController();
    void readRuntimeMeasurementId(controller.signal)
      .then((configuredId) => {
        if (controller.signal.aborted) return;
        if (!configuredId) {
          denyGa4AnalyticsConsent(null);
          return;
        }
        resetGa4PageViewDeduplication();
        grantGa4AnalyticsConsent(configuredId);
        setMeasurementId(configuredId);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          denyGa4AnalyticsConsent(null);
        }
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <>
      {measurementId ? (
        <Script
          id="lawand-ga4-loader"
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
          strategy="afterInteractive"
        />
      ) : null}
      {measurementId ? (
        <Suspense fallback={null}>
          <Ga4PageViewTracker />
        </Suspense>
      ) : null}
    </>
  );
}
