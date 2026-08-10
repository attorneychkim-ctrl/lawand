"use client";

import dynamic from "next/dynamic";

const SelfDiagnosisForm = dynamic(
  () =>
    import("./self-diagnosis-form").then(
      (module) => module.SelfDiagnosisForm,
    ),
  {
    ssr: false,
    loading: () => (
      <section className="diagnosis-loading shell" aria-live="polite">
        <strong>로앤 사건 비교 화면을 준비하고 있습니다.</strong>
      </section>
    ),
  },
);

export function SelfDiagnosisFormLoader() {
  return <SelfDiagnosisForm />;
}
