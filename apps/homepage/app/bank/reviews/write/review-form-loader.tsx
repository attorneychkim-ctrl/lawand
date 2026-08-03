"use client";

import dynamic from "next/dynamic";

const ReviewForm = dynamic(
  () => import("./review-form").then((module) => module.ReviewForm),
  {
    ssr: false,
    loading: () => (
      <section className="review-write-loading shell" aria-live="polite">
        <strong>후기 작성 화면을 준비하고 있습니다.</strong>
      </section>
    ),
  },
);

export function ReviewFormLoader() {
  return <ReviewForm />;
}
