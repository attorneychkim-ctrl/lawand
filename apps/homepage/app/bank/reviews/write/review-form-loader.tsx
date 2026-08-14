"use client";

import dynamic from "next/dynamic";
import { useEffect, useSyncExternalStore } from "react";

function ReviewFormLoading() {
  return (
    <section className="review-write-loading shell" aria-live="polite">
      <strong>후기 작성 화면을 준비하고 있습니다.</strong>
    </section>
  );
}

const ReviewForm = dynamic(
  () => import("./review-form").then((module) => module.ReviewForm),
  {
    ssr: false,
    loading: ReviewFormLoading,
  },
);

function subscribeRequestHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function requestHashSnapshot() {
  return (
    new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
      "request",
    ) ?? ""
  );
}

export function ReviewFormLoader({ requestToken }: { requestToken?: string }) {
  const hashToken = useSyncExternalStore(
    subscribeRequestHash,
    requestHashSnapshot,
    () => null,
  );

  useEffect(() => {
    if (requestToken) {
      const safeUrl = new URL(window.location.href);
      safeUrl.searchParams.delete("request");
      safeUrl.hash = `request=${encodeURIComponent(requestToken)}`;
      window.history.replaceState(null, "", safeUrl);
    }
  }, [requestToken]);

  if (hashToken === null) return <ReviewFormLoading />;
  const token = requestToken ?? (hashToken || undefined);
  const resolvedRequestToken =
    token && token.length <= 100 ? token : token ? "invalid" : undefined;
  return <ReviewForm requestToken={resolvedRequestToken} />;
}
