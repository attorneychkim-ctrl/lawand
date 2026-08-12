"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { TelephonyCall } from "../../lib/gateway";
import { PhoneAftercareDialog } from "./phone-aftercare-form";

type CallState = Pick<
  TelephonyCall,
  | "id"
  | "commandStatus"
  | "outcome"
  | "providerDurationSeconds"
  | "providerBillableSeconds"
  | "providerRingSeconds"
  | "reconciledAt"
  | "disposition"
  | "lastErrorMessage"
>;

const pendingStatuses = new Set(["queued", "dispatching"]);
const MAX_POLL_COUNT = 600;

function isPending(call: CallState | null) {
  return Boolean(
    call &&
      (pendingStatuses.has(call.commandStatus) ||
        (call.commandStatus === "succeeded" && !call.reconciledAt)),
  );
}

function seconds(value: number | null) {
  return value === null ? "확인 중" : `${value}초`;
}

function statusMessage(call: CallState | null, aftercareSaved: boolean) {
  if (!call) return null;
  if (call.commandStatus === "queued") return "센트릭스 발신 대기열에 등록했습니다.";
  if (call.commandStatus === "dispatching") return "내 전화기가 울리면 수화기를 들어 주세요.";
  if (call.commandStatus === "succeeded" && !call.reconciledAt) {
    return "통화가 끝나면 통합 후처리 창이 자동으로 열립니다.";
  }
  if (call.commandStatus === "failed" || call.commandStatus === "unknown") {
    return call.lastErrorMessage ?? "센트릭스 발신 상태를 확인하지 못했습니다.";
  }
  if (aftercareSaved || call.disposition) return "통화 후처리를 저장했습니다.";
  if (call.reconciledAt && call.outcome === "answered") {
    return `통화 종료 · 연결 ${seconds(call.providerBillableSeconds)} · 호출 ${seconds(call.providerRingSeconds)}`;
  }
  if (call.reconciledAt) return "미연결 통화가 종료되었습니다. 실제 결과를 입력해 주세요.";
  return null;
}

type ClickToCallButtonProps = {
  initialCall?: CallState | null;
  idleLabel?: string;
  staffName: string;
} & (
  | {
      consultationId: string;
      directoryTarget?: never;
    }
  | {
      consultationId?: never;
      directoryTarget: {
        clientIdx: number;
        caseIdx: number;
        clientName: string;
      };
    }
);

export function ClickToCallButton({
  consultationId,
  directoryTarget,
  initialCall = null,
  idleLabel = "센트릭스로 전화",
  staffName,
}: ClickToCallButtonProps) {
  const router = useRouter();
  const [call, setCall] = useState<CallState | null>(initialCall);
  const [requesting, setRequesting] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [error, setError] = useState("");
  const [aftercareOpen, setAftercareOpen] = useState(false);
  const [aftercareSaved, setAftercareSaved] = useState(Boolean(call?.disposition));
  const [checkedAftercareCallId, setCheckedAftercareCallId] = useState<string | null>(null);

  useEffect(() => {
    if (
      !call?.reconciledAt ||
      call.disposition ||
      checkedAftercareCallId === call.id
    ) return;
    const completedKey = `lawand:phone-aftercare-saved:${call.id}`;
    if (window.sessionStorage.getItem(completedKey)) {
      queueMicrotask(() => {
        setAftercareSaved(true);
        setCheckedAftercareCallId(call.id);
      });
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/phone-desk/calls/${call.id}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const body = (await response.json().catch(() => null)) as
        | { call?: { aftercare?: unknown } }
        | null;
      if (controller.signal.aborted) return;
      setCheckedAftercareCallId(call.id);
      if (response.ok && body?.call?.aftercare) {
        window.sessionStorage.setItem(completedKey, "saved");
        setAftercareSaved(true);
        return;
      }
      const openedKey = `lawand:phone-aftercare:${call.id}`;
      if (!window.sessionStorage.getItem(openedKey)) {
        window.sessionStorage.setItem(openedKey, "opened");
        setAftercareOpen(true);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setCheckedAftercareCallId(call.id);
    });
    return () => controller.abort();
  }, [call, checkedAftercareCallId]);

  useEffect(() => {
    if (!call || !isPending(call) || pollCount >= MAX_POLL_COUNT) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/telephony-calls/${call.id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as
          | (TelephonyCall & { message?: string })
          | null;
        if (!response.ok || !body) {
          throw new Error(body?.message ?? "통화 상태를 확인하지 못했습니다.");
        }
        setCall(body);
        setError("");
        if (!isPending(body)) router.refresh();
      } catch (pollError) {
        if (!controller.signal.aborted) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : "통화 상태를 확인하지 못했습니다.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setPollCount((count) => count + 1);
      }
    }, 2_000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [call, pollCount, router]);

  async function requestCall() {
    if (call?.reconciledAt && !aftercareSaved && !call.disposition) {
      setAftercareOpen(true);
      return;
    }
    const confirmation = directoryTarget
      ? `${directoryTarget.clientName} 고객의 등록 전화번호로 센트릭스 전화를 걸까요?`
      : "센트릭스 전화기로 고객에게 전화를 걸까요?";
    if (!window.confirm(confirmation)) return;
    setRequesting(true);
    setError("");
    setPollCount(0);
    setAftercareSaved(false);
    setCheckedAftercareCallId(null);
    try {
      const response = directoryTarget
        ? await fetch("/api/client-directory/click-to-call", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientIdx: directoryTarget.clientIdx,
              caseIdx: directoryTarget.caseIdx,
            }),
          })
        : await fetch(`/api/consultations/${consultationId}/click-to-call`, {
            method: "POST",
          });
      const body = (await response.json().catch(() => null)) as
        | (TelephonyCall & { message?: string })
        | null;
      if (!response.ok || !body) {
        throw new Error(body?.message ?? "클릭투콜을 요청하지 못했습니다.");
      }
      setCall(body);
      if (!isPending(body)) router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "클릭투콜을 요청하지 못했습니다.",
      );
    } finally {
      setRequesting(false);
    }
  }

  const pending = isPending(call);
  const needsAftercare = Boolean(
    call?.reconciledAt && !aftercareSaved && !call.disposition,
  );
  const label = requesting
    ? "발신 요청 중…"
    : pending
      ? call?.commandStatus === "queued"
        ? "발신 대기 중…"
        : call?.reconciledAt
          ? "종료 확인 중…"
          : "전화기 연결 중…"
      : needsAftercare
        ? "통화 후처리 입력"
        : idleLabel;
  const message = error || statusMessage(call, aftercareSaved);

  return (
    <div className="centrex-call-control">
      <button
        className="call-button"
        disabled={requesting || pending}
        onClick={() => void requestCall()}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8.2 4.25 10 8 8.1 9.8a14.5 14.5 0 0 0 6.1 6.1L16 14l3.75 1.8-.25 3.45c-8.1.95-15.7-6.65-14.75-14.75l3.45-.25Z" />
        </svg>
        {label}
      </button>
      {message ? (
        <p
          className={`centrex-call-message is-${error ? "error" : call?.reconciledAt ? "success" : "pending"}`}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
      <PhoneAftercareDialog
        callId={call?.id ?? null}
        staffName={staffName}
        onClose={() => setAftercareOpen(false)}
        onSaved={() => {
          if (call) {
            window.sessionStorage.setItem(
              `lawand:phone-aftercare-saved:${call.id}`,
              "saved",
            );
          }
          setAftercareSaved(true);
          setAftercareOpen(false);
          router.refresh();
        }}
        open={aftercareOpen}
      />
    </div>
  );
}
