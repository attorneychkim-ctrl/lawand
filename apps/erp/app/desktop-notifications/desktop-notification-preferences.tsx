"use client";

import { useActionState } from "react";

import type {
  DesktopNotificationPreferenceKey,
  DesktopNotificationPreferenceUpdate,
} from "@lawand/core";

import {
  saveDesktopNotificationPreferencesAction,
  type DesktopNotificationPreferenceActionState,
} from "./actions";

export type DesktopNotificationPreferenceGroup = {
  kind: "consultation" | "phone" | "message" | "review";
  title: string;
  description: string;
  items: Array<{
    key: DesktopNotificationPreferenceKey;
    title: string;
    description: string;
    scope: string;
    available: boolean;
  }>;
};

const initialState: DesktopNotificationPreferenceActionState = {
  status: "idle",
  message: "",
};

function NotificationGroupIcon({
  kind,
}: {
  kind: DesktopNotificationPreferenceGroup["kind"];
}) {
  return kind === "consultation" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  ) : kind === "phone" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7.8 3.8 10 8.5 7.5 10a14.3 14.3 0 0 0 6.5 6.5l1.5-2.5 4.7 2.2v3a1.8 1.8 0 0 1-1.8 1.8A15.4 15.4 0 0 1 3 5.6a1.8 1.8 0 0 1 1.8-1.8h3Z" />
    </svg>
  ) : kind === "message" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M7.5 9h9M7.5 13h6" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="m9 11 2 2 4-4" />
    </svg>
  );
}

export function DesktopNotificationPreferences({
  groups,
  preferences,
}: {
  groups: DesktopNotificationPreferenceGroup[];
  preferences: DesktopNotificationPreferenceUpdate["preferences"];
}) {
  const [state, action, pending] = useActionState(
    saveDesktopNotificationPreferencesAction,
    initialState,
  );

  return (
    <form action={action}>
      <section
        aria-labelledby="desktop-preferences-title"
        className="desktop-alert-preferences-section"
      >
        <header className="desktop-alert-section-heading">
          <div>
            <p className="section-kicker">NOTIFICATION SCOPE</p>
            <h2 id="desktop-preferences-title">받을 알림 선택</h2>
            <p>전사 알림과 나에게 직접 배정된 알림을 구분해 저장합니다.</p>
          </div>
          <div className="desktop-alert-legend" aria-label="알림 상태 범례">
            <span><i className="is-on" /> 켜짐</span>
            <span><i className="is-off" /> 꺼짐</span>
          </div>
        </header>

        <div className="desktop-alert-group-grid">
          {groups.map((group) => (
            <article
              className={`erp-panel desktop-alert-group-card is-${group.kind}`}
              key={group.kind}
            >
              <header>
                <span className="desktop-alert-group-icon">
                  <NotificationGroupIcon kind={group.kind} />
                </span>
                <div>
                  <h3>{group.title}</h3>
                  <p>{group.description}</p>
                </div>
              </header>
              <div className="desktop-alert-preference-list">
                {group.items.map((item) => (
                  <div className="desktop-alert-preference-row" key={item.key}>
                    <div>
                      <div className="desktop-alert-preference-title">
                        <strong>{item.title}</strong>
                        <span>{item.scope}</span>
                        {!item.available ? <em>다음 연결</em> : null}
                      </div>
                      <p>{item.description}</p>
                    </div>
                    {!item.available ? (
                      <input
                        name={item.key}
                        type="hidden"
                        value={preferences[item.key] ? "on" : ""}
                      />
                    ) : null}
                    <label
                      className={`desktop-alert-preference-control ${
                        item.available ? "" : "is-disabled"
                      }`}
                    >
                      <input
                        defaultChecked={preferences[item.key]}
                        disabled={!item.available}
                        name={item.key}
                        type="checkbox"
                      />
                      <span aria-hidden="true"><span /></span>
                      <span className="sr-only">
                        {item.title} 알림 받기
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="desktop-alert-save-bar">
        <div>
          <strong>선택한 알림은 이 ERP 계정에만 적용됩니다</strong>
          <span>연결된 모든 업무용 PC가 같은 개인 설정을 사용합니다.</span>
          {state.status !== "idle" ? (
            <span
              className={state.status === "error" ? "form-error" : "form-success"}
              role={state.status === "error" ? "alert" : "status"}
            >
              {state.message}
            </span>
          ) : null}
        </div>
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "저장 중…" : "알림 설정 저장"}
        </button>
      </div>
    </form>
  );
}
