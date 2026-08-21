"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createDesktopNotificationPairingAction,
  type DesktopNotificationActionState,
  revokeDesktopNotificationDeviceAction,
  sendDesktopNotificationTestAction,
} from "./actions";

const initialDesktopNotificationActionState: DesktopNotificationActionState = {
  status: "idle",
  message: "",
  pairingCode: "",
  expiresAt: "",
  queuedDeviceCount: 0,
};

export type DesktopNotificationDevicePresentation = {
  id: string;
  name: string;
  appVersion: string;
  status: "active" | "revoked";
  connectionState: "never_connected" | "online" | "offline" | "revoked";
  lastSeenLabel: string;
  lastDeliveredLabel: string;
};

function stateClass(
  state: DesktopNotificationDevicePresentation["connectionState"],
) {
  return state === "online"
    ? "is-online"
    : state === "revoked"
      ? "is-revoked"
      : "is-offline";
}

function stateLabel(
  state: DesktopNotificationDevicePresentation["connectionState"],
) {
  return state === "online"
    ? "연결됨"
    : state === "never_connected"
      ? "연결 확인 전"
      : state === "revoked"
        ? "해제됨"
        : "오프라인";
}

export function DesktopNotificationConnection({
  devices,
  downloadUrl,
}: {
  devices: DesktopNotificationDevicePresentation[];
  downloadUrl: string | null;
}) {
  const router = useRouter();
  const activeDevices = devices.filter((device) => device.status === "active");
  const [copied, setCopied] = useState(false);
  const [pairingState, pairingAction, pairingPending] = useActionState(
    createDesktopNotificationPairingAction,
    initialDesktopNotificationActionState,
  );
  const [testState, testAction, testPending] = useActionState(
    sendDesktopNotificationTestAction,
    initialDesktopNotificationActionState,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeDesktopNotificationDeviceAction,
    initialDesktopNotificationActionState,
  );

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [router]);

  useEffect(() => {
    if (revokeState.status === "success") router.refresh();
  }, [revokeState, router]);

  async function copyPairingCode() {
    if (!pairingState.pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingState.pairingCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <header className="desktop-alert-panel-heading">
        <div>
          <p className="section-kicker">MY COMPUTER</p>
          <h2 id="desktop-device-title">내 컴퓨터 연결</h2>
          <p>로그인한 ERP 계정과 업무용 Windows PC를 한 번 연결합니다.</p>
        </div>
        <span
          className={`desktop-alert-connection-status ${activeDevices.some((device) => device.connectionState === "online") ? "is-online" : ""}`}
        >
          <i aria-hidden="true" />
          {activeDevices.length > 0
            ? `${activeDevices.length}대 연결`
            : "연결 전"}
        </span>
      </header>

      <div className="desktop-alert-app-card">
        <span aria-hidden="true" className="desktop-alert-app-icon">
          <svg viewBox="0 0 24 24">
            <rect height="13" rx="2" width="18" x="3" y="4" />
            <path d="M8 21h8M12 17v4M16.5 7.5a2.5 2.5 0 0 1 2.5 2.5v1.5l1 1.5h-7l1-1.5V10a2.5 2.5 0 0 1 2.5-2.5Z" />
          </svg>
        </span>
        <div>
          <small>Windows PC 알림 프로그램</small>
          <strong>LAW&amp; OS 알림</strong>
          <p>바탕화면에서 바로 실행하고, Windows 로그인 시 자동으로 새 업무를 확인합니다.</p>
        </div>
        <span className="desktop-alert-app-badge is-ready">1차 버전</span>
      </div>

      <ol className="desktop-alert-setup-list">
        <li>
          <span>1</span>
          <div>
            <strong>알림 프로그램 설치</strong>
            <p>설치 파일을 내려받아 더블클릭하면 바탕화면 바로가기까지 자동으로 만듭니다.</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>현재 ERP 계정과 연결</strong>
            <p>5분 동안 한 번만 쓸 수 있는 코드로 내 PC임을 확인합니다.</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>실제 업무 카드 확인</strong>
            <p>테스트 카드가 화면 우측 상단에 뜨고 정확한 ERP 화면으로 열리면 완료입니다.</p>
          </div>
        </li>
      </ol>

      {activeDevices.length > 0 ? (
        <div className="desktop-alert-device-list" aria-label="연결된 컴퓨터">
          {activeDevices.map((device) => (
            <article key={device.id}>
              <div className="desktop-alert-device-copy">
                <span className={stateClass(device.connectionState)} aria-hidden="true" />
                <div>
                  <strong>{device.name}</strong>
                  <p>
                    Windows · v{device.appVersion} · 마지막 접속 {device.lastSeenLabel}
                  </p>
                  <small>마지막 알림 {device.lastDeliveredLabel}</small>
                </div>
              </div>
              <div className="desktop-alert-device-actions">
                <span className={stateClass(device.connectionState)}>
                  {stateLabel(device.connectionState)}
                </span>
                <form action={revokeAction}>
                  <input name="deviceId" type="hidden" value={device.id} />
                  <button
                    className="text-button"
                    disabled={revokePending}
                    type="submit"
                  >
                    연결 해제
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {pairingState.pairingCode ? (
        <div className="desktop-alert-pairing-code" role="status">
          <div>
            <small>5분 동안 유효한 일회용 연결 코드</small>
            <code>{pairingState.pairingCode}</code>
            <p>{pairingState.message}</p>
          </div>
          <button
            className="secondary-button"
            onClick={copyPairingCode}
            type="button"
          >
            {copied ? "복사됨" : "연결 코드 복사"}
          </button>
        </div>
      ) : null}

      {[pairingState, testState, revokeState].map((state, index) =>
        state.status !== "idle" && !state.pairingCode ? (
          <p
            className={state.status === "error" ? "form-error" : "form-success"}
            key={index}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null,
      )}

      <div className="desktop-alert-connection-actions">
        <p>
          기기 인증 토큰은 Windows 자격 증명 관리자에만 저장되며 이 화면에서 언제든 해제할 수 있습니다.
        </p>
        <div>
          {downloadUrl ? (
            <a className="secondary-button" href={downloadUrl}>
              Windows 설치파일 받기
            </a>
          ) : (
            <button className="secondary-button" disabled type="button">
              Windows 빌드 준비 중
            </button>
          )}
          <form action={pairingAction}>
            <button
              className="primary-button"
              disabled={pairingPending}
              type="submit"
            >
              {pairingPending ? "코드 발급 중…" : "이 컴퓨터 연결"}
            </button>
          </form>
          <form action={testAction}>
            <button
              className="secondary-button"
              disabled={testPending || activeDevices.length === 0}
              type="submit"
            >
              {testPending ? "전송 중…" : "테스트 알림 보내기"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
