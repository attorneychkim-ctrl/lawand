"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  type CentrexLineActionState,
  updateCentrexLineAction,
} from "../auth-actions";

type CentrexConnection = {
  status:
    | "unconfigured"
    | "incomplete"
    | "pending_endpoint"
    | "pending_assignment"
    | "credential_pending"
    | "bridge_pending"
    | "bridge_provisioning"
    | "bridge_failed"
    | "bridge_offline"
    | "connected"
    | "mismatch";
  assignedEndpoint: {
    id: string;
    label: string;
    lineNumber: string;
    extension: string;
    credentialConfigured: boolean;
    bridgeConfigured: boolean;
    bridgeOnline: boolean;
    bridgeState: string | null;
    bridgeLastSeenAt: string | null;
    lastAuthSucceededAt: string | null;
  } | null;
};

const initialState: CentrexLineActionState = {
  error: "",
  saved: false,
  verified: false,
  bridgeConnected: false,
  reassigned: false,
};

const connectionCopy: Record<
  CentrexConnection["status"],
  { label: string; description: string; tone: string }
> = {
  connected: {
    label: "정상",
    description:
      "클릭투콜, 수신 감지와 ERP 전화 받기를 사용할 수 있습니다.",
    tone: "is-connected",
  },
  bridge_pending: {
    label: "연결 중",
    description:
      "검증된 전화 endpoint에는 배정됐지만 Windows bridge 설정이 아직 없습니다.",
    tone: "is-pending",
  },
  bridge_provisioning: {
    label: "연결 중",
    description:
      "Windows bridge가 새 회선 자격 증명을 적용하고 U+ 로그인 결과를 확인하고 있습니다.",
    tone: "is-pending",
  },
  bridge_failed: {
    label: "연결 실패",
    description:
      "클릭투콜 회선 검증 뒤 Windows bridge 로그인을 완료하지 못했습니다. 비밀번호를 확인해 다시 저장하세요.",
    tone: "is-warning",
  },
  bridge_offline: {
    label: "브리지 오프라인",
    description:
      "회선 배정은 완료됐지만 Windows bridge의 최근 연결 신호가 없습니다.",
    tone: "is-warning",
  },
  credential_pending: {
    label: "비밀번호 등록 필요",
    description:
      "회선 endpoint는 배정됐지만 클릭투콜용 비밀번호 검증이 필요합니다.",
    tone: "is-warning",
  },
  pending_endpoint: {
    label: "회선 검증 대기",
    description:
      "비밀번호를 입력해 U+ 회선·내선을 검증하면 전화 endpoint를 만들고 자동 배정합니다.",
    tone: "is-pending",
  },
  pending_assignment: {
    label: "배정 반영 대기",
    description:
      "일치하는 전화 endpoint가 있습니다. 비밀번호 검증 후 주 회선으로 연결합니다.",
    tone: "is-pending",
  },
  mismatch: {
    label: "배정 불일치",
    description:
      "직원 정보와 실제 제어 회선이 다릅니다. 비밀번호 검증 후 기존 배정을 안전하게 정리합니다.",
    tone: "is-warning",
  },
  incomplete: {
    label: "설정 미완료",
    description:
      "전체 회선번호와 내선번호를 함께 입력해야 전화 제어 회선을 연결할 수 있습니다.",
    tone: "is-warning",
  },
  unconfigured: {
    label: "회선 미설정",
    description:
      "전화 업무를 하지 않는 직원은 비워둘 수 있습니다. 설정할 때는 두 번호를 함께 입력합니다.",
    tone: "is-neutral",
  },
};

function formatLine(value: string) {
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
}

export function CentrexLineForm({
  staffUserId,
  centrexLineNumber,
  centrexExtension,
  connection,
}: {
  staffUserId: string;
  centrexLineNumber: string | null;
  centrexExtension: string | null;
  connection: CentrexConnection;
}) {
  const [state, action, pending] = useActionState(
    updateCentrexLineAction,
    initialState,
  );
  const copy = connectionCopy[connection.status];
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ((state.saved || state.error) && passwordRef.current) {
      passwordRef.current.value = "";
    }
  }, [state]);

  return (
    <form action={action} className="centrex-line-form">
      <input name="staffUserId" type="hidden" value={staffUserId} />
      <div className="integration-form-heading">
        <div>
          <span className="integration-kicker">센트릭스 전화</span>
          <strong>직원 회선·내선·비밀번호</strong>
        </div>
        <span className={`connection-badge ${copy.tone}`}>{copy.label}</span>
      </div>
      <p className="connection-description">{copy.description}</p>
      {connection.assignedEndpoint ? (
        <div className="assigned-endpoint-summary">
          <span>실제 제어 회선</span>
          <strong>
            {connection.assignedEndpoint.label} ·{" "}
            {formatLine(connection.assignedEndpoint.lineNumber)} · 내선{" "}
            {connection.assignedEndpoint.extension}
          </strong>
          <small>
            클릭투콜 비밀번호{" "}
            {connection.assignedEndpoint.credentialConfigured
              ? "검증됨"
              : "미등록"}
            · Windows bridge{" "}
            {connection.assignedEndpoint.bridgeOnline
              ? "정상"
              : connection.assignedEndpoint.bridgeConfigured
                ? "오프라인"
                : "미배정"}
          </small>
        </div>
      ) : null}
      <div className="centrex-field-grid">
        <label>
          <span>전체 회선번호</span>
          <input
            autoComplete="off"
            defaultValue={centrexLineNumber ?? ""}
            inputMode="tel"
            maxLength={13}
            name="centrexLineNumber"
            pattern="070-?[0-9]{4}-?[0-9]{4}"
            placeholder="07046074535"
            type="tel"
          />
        </label>
        <label>
          <span>내선번호</span>
          <input
            autoComplete="off"
            defaultValue={centrexExtension ?? ""}
            inputMode="numeric"
            maxLength={10}
            name="centrexExtension"
            pattern="[0-9]{2,10}"
            placeholder="4535"
            type="text"
          />
        </label>
        <label className="centrex-password-field">
          <span>센트릭스 비밀번호</span>
          <input
            autoComplete="new-password"
            maxLength={128}
            name="centrexPassword"
            placeholder="회선 테스트를 위해 현재 비밀번호 입력"
            ref={passwordRef}
            type="password"
          />
          <small>
            한 번의 저장으로 U+ 회선 검증, 클릭투콜 자격증명과 Windows bridge 로그인을
            함께 적용합니다. 비밀번호 원문은 저장하거나 다시 표시하지 않습니다.
          </small>
        </label>
      </div>
      <div className="integration-form-actions">
        <small>두 값을 모두 비우고 저장하면 전화 제어 배정도 해제됩니다.</small>
        {connection.status === "bridge_failed" ||
        connection.status === "bridge_offline" ? (
          <button
            className="secondary-button"
            disabled={pending}
            formNoValidate
            name="intent"
            type="submit"
            value="reassign"
          >
            다른 유휴 슬롯으로 재배정
          </button>
        ) : null}
        <button
          className="secondary-button"
          disabled={pending}
          name="intent"
          type="submit"
          value="save"
        >
          {pending ? "전체 전화 연결 중…" : "회선 테스트 및 저장"}
        </button>
      </div>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="form-success" role="status">
          {state.verified
            ? state.bridgeConnected
              ? "U+ 회선 검증, 클릭투콜, 수신 감지와 전화 받기 연결을 모두 완료했습니다."
              : "U+ 회선 검증과 클릭투콜 설정을 완료했습니다."
            : "회선 설정과 전화 제어 배정을 해제했습니다."}
        </p>
      ) : null}
      {state.reassigned ? (
        <p className="form-success" role="status">
          온라인 유휴 슬롯을 새로 배정했습니다. 현재 비밀번호를 입력해 회선 테스트 및 저장을 완료하세요.
        </p>
      ) : null}
    </form>
  );
}
