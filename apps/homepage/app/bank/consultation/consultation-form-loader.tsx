"use client";

import dynamic from "next/dynamic";

const ConsultationForm = dynamic(
  () =>
    import("./consultation-form").then((module) => module.ConsultationForm),
  {
    ssr: false,
    loading: () => (
      <section className="consultation-loading shell" aria-live="polite">
        <strong>상담 요청 화면을 준비하고 있습니다.</strong>
      </section>
    ),
  },
);

export function ConsultationFormLoader() {
  return <ConsultationForm />;
}
