"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  normalizeGa4MeasurementId,
  parseStoredAnalyticsConsent,
  serializeAnalyticsConsent,
  type AnalyticsConsentChoice,
} from "@/lib/analytics-contract";
import {
  denyGa4AnalyticsConsent,
  grantGa4AnalyticsConsent,
  initializeGa4ConsentDefaults,
  resetGa4PageViewDeduplication,
  sendGa4PageView,
} from "@/lib/analytics-runtime";

type ConsentViewState =
  | AnalyticsConsentChoice
  | "unset"
  | "unavailable"
  | null;

function Ga4PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      sendGa4PageView({
        rawUrl: window.location.href,
        rawReferrer: document.referrer,
        currentOrigin: window.location.origin,
        pageTitle: document.title,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, search]);

  return null;
}

function persistChoice(choice: AnalyticsConsentChoice) {
  try {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      serializeAnalyticsConsent(choice, new Date().toISOString()),
    );
  } catch {
    // 선택 저장이 차단돼도 현재 문서에서는 사용자의 선택을 즉시 적용한다.
  }
}

function readStoredChoice() {
  try {
    return parseStoredAnalyticsConsent(
      window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY),
    );
  } catch {
    return null;
  }
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
  const [consent, setConsent] = useState<ConsentViewState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scriptEnabled, setScriptEnabled] = useState(false);
  const [measurementId, setMeasurementId] = useState<string | null>(null);
  const settingsHeadingRef = useRef<HTMLHeadingElement>(null);
  const settingsDialogRef = useRef<HTMLElement>(null);
  const settingsTriggerRef = useRef<HTMLElement | null>(null);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    window.requestAnimationFrame(() => settingsTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    initializeGa4ConsentDefaults();
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => {
      void readRuntimeMeasurementId(controller.signal)
        .then((configuredId) => {
          if (controller.signal.aborted) return;
          if (!configuredId) {
            denyGa4AnalyticsConsent(null);
            setConsent("unavailable");
            return;
          }
          setMeasurementId(configuredId);

          const storedChoice = readStoredChoice();
          if (storedChoice === "granted") {
            grantGa4AnalyticsConsent(configuredId);
            setScriptEnabled(true);
            setConsent("granted");
            return;
          }
          if (storedChoice === "denied") {
            denyGa4AnalyticsConsent(configuredId);
            setConsent("denied");
            return;
          }
          setConsent("unset");
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            denyGa4AnalyticsConsent(null);
            setConsent("unavailable");
          }
        });
    });
    return () => {
      controller.abort();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const openSettings = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest<HTMLElement>("[data-analytics-settings]");
      if (!trigger) return;
      settingsTriggerRef.current = trigger;
      setSettingsOpen(true);
    };
    document.addEventListener("click", openSettings);
    return () => document.removeEventListener("click", openSettings);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const frame = window.requestAnimationFrame(() => {
      settingsHeadingRef.current?.focus();
    });
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSettings();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = settingsDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === settingsHeadingRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleDialogKey);
    };
  }, [closeSettings, settingsOpen]);

  const choose = (choice: AnalyticsConsentChoice) => {
    persistChoice(choice);
    if (choice === "granted" && measurementId) {
      resetGa4PageViewDeduplication();
      grantGa4AnalyticsConsent(measurementId);
      setScriptEnabled(true);
      setConsent("granted");
    } else {
      denyGa4AnalyticsConsent(measurementId);
      setScriptEnabled(false);
      setConsent("denied");
    }
    if (settingsOpen) closeSettings();
  };

  const showInitialChoice = consent === "unset" && !settingsOpen;
  const currentChoiceLabel =
    consent === "granted"
      ? "서비스 개선 분석·국외 이전 허용"
      : consent === "denied"
        ? "서비스 개선 분석 거부"
        : "아직 선택하지 않음";

  return (
    <>
      {scriptEnabled && measurementId ? (
        <Script
          id="lawand-ga4-loader"
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
          strategy="afterInteractive"
        />
      ) : null}
      {scriptEnabled ? (
        <Suspense fallback={null}>
          <Ga4PageViewTracker />
        </Suspense>
      ) : null}

      {showInitialChoice ? (
        <section
          aria-labelledby="analytics-consent-title"
          className="analytics-consent-banner"
          role="region"
        >
          <div>
            <p>분석 설정</p>
            <h2 id="analytics-consent-title">홈페이지 개선을 위한 분석에 동의하시겠어요?</h2>
            <p>
              동의한 경우에만 Google Analytics를 불러와 정제된 페이지 방문·세션
              통계와 실제 상담 접수 성과를 측정합니다. 이름·전화번호·상담 내용·
              실제 검색어는 보내지 않으며 맞춤형 광고에는 사용하지 않습니다.
              허용한 분석정보는 Google LLC(미국)와 Google의 처리시설·재수탁자
              소재 국가로 이전됩니다.
            </p>
            <details className="analytics-overseas-details">
              <summary>분석 정보와 국외 이전 안내</summary>
              <p>
                분석 허용은 「개인정보 보호법」 제28조의8제1항제1호에 따라
                Google LLC(미국)로 분석정보를 이전하고 Google의 처리시설·
                재수탁자가 있는 국가에서 처리하는 것에 대한 동의를 포함합니다.
              </p>
              <ul>
                <li>
                  항목: first-party 이용자·세션 식별값, 접속 시각, 대략적인
                  지역·브라우저·기기 정보, 정제한 페이지·유입·캠페인 정보와
                  실제 웹 상담 접수 성공 이벤트
                </li>
                <li>
                  시기·방법: 허용 뒤 페이지 방문·접수 성공 시 암호화된 HTTPS
                  통신으로 이전
                </li>
                <li>
                  목적·기간: 홈페이지·캠페인 통계 분석, 이용자·이벤트 단위
                  데이터 14개월(새 활동 시 기간 초기화 안 함)
                </li>
                <li>
                  거부 효과: 분석만 비활성화되며 홈페이지 열람과 상담 요청에는
                  영향이 없음
                </li>
              </ul>
            </details>
            <a href="/privacy#overseas">이전 국가·수령자·보유기간 전체 보기</a>
          </div>
          <div className="analytics-consent-actions">
            <button type="button" onClick={() => choose("denied")}>
              거부
            </button>
            <button
              className="is-primary"
              type="button"
              onClick={() => choose("granted")}
            >
              분석·국외 이전 허용
            </button>
          </div>
        </section>
      ) : null}

      {settingsOpen ? (
        <div className="analytics-settings-backdrop">
          <section
            aria-labelledby="analytics-settings-title"
            aria-modal="true"
            className="analytics-settings-dialog"
            ref={settingsDialogRef}
            role="dialog"
          >
            <p>분석 설정</p>
            <h2
              id="analytics-settings-title"
              ref={settingsHeadingRef}
              tabIndex={-1}
            >
              서비스 개선 분석 선택
            </h2>
            {consent === "unavailable" ? (
              <p>
                현재 홈페이지 운영 환경에는 GA4 측정값이 설정되지 않아 분석
                스크립트와 쿠키가 비활성화되어 있습니다.
              </p>
            ) : (
              <>
                <p className="analytics-settings-status">
                  현재 선택: <strong>{currentChoiceLabel}</strong>
                </p>
                <p>
                  허용하면 정제된 페이지 방문·세션 통계와 실제 상담 접수 여부를
                  측정하기 위해 Google LLC(미국)로 분석정보를 국외 이전합니다.
                  광고 저장소·광고 사용자 데이터·광고 개인화는 항상
                  거부됩니다. 거부하거나 철회하면 이후 전송을 중단하고 이
                  도메인에서 삭제할 수 있는 `_ga` 쿠키를 정리합니다. 거부해도
                  홈페이지 열람과 상담 요청에는 영향이 없습니다.
                </p>
                <a href="/privacy#overseas">
                  이전 국가·항목·방법·보유기간 전체 보기
                </a>
                <div className="analytics-consent-actions">
                  <button type="button" onClick={() => choose("denied")}>
                    분석 거부
                  </button>
                  <button
                    className="is-primary"
                    type="button"
                    onClick={() => choose("granted")}
                  >
                    분석·국외 이전 허용
                  </button>
                </div>
              </>
            )}
            <button
              className="analytics-settings-close"
              type="button"
              onClick={closeSettings}
            >
              닫기
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
