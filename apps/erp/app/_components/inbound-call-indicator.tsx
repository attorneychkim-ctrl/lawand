"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type {
  PhoneDeskCallSnapshot,
  PhoneDeskCall,
  TelephonyCallActivity,
  TelephonyCallActivitySnapshot,
  TelephonyInboundCall,
  TelephonyInboundCallSnapshot,
} from "../../lib/gateway";
import {
  prepareBrowserNotifications,
  showConsultationBrowserNotification,
  showTelephonyBrowserNotification,
} from "./browser-notification";
import { notificationPermissionChangedEvent } from "./browser-notification-toggle";
import { subscribeConsultationRealtime } from "./consultation-realtime";
import { PhoneAftercareDialog } from "./phone-aftercare-form";

type ConnectionState = "connecting" | "connected" | "disconnected";

type ConsultationNotificationSummary = {
  id: string;
  publicReceiptCode: string;
  displayName: string;
  contactChannel: "phone" | "kakao_channel" | "naver_booking";
  phone: string | null;
  residenceRegion: string | null;
  assigneeUserId: string | null;
  canClaim: boolean;
};

type IndicatorToast = {
  id: string;
  title: string;
  body: string;
  href?: string;
  consultation?: ConsultationNotificationSummary;
  consultationKind?:
    | "new"
    | "repeat_unassigned"
    | "repeat_assigned"
    | "assignment_transferred";
  claimStatus?: "idle" | "claiming" | "failed";
  claimError?: string;
};

const residenceRegionLabels: Record<string, string> = {
  seoul: "서울",
  busan: "부산",
  daegu: "대구",
  incheon: "인천",
  gwangju: "광주",
  daejeon: "대전",
  ulsan: "울산",
  sejong: "세종",
  gyeonggi: "경기",
  gangwon: "강원",
  chungbuk: "충북",
  chungnam: "충남",
  jeonbuk: "전북",
  jeonnam: "전남",
  gyeongbuk: "경북",
  gyeongnam: "경남",
  jeju: "제주",
  overseas_or_other: "해외·기타",
};

const consultationChannelLabels: Record<
  ConsultationNotificationSummary["contactChannel"],
  string
> = {
  phone: "전화 상담",
  kakao_channel: "카카오 상담",
  naver_booking: "네이버 예약",
};

const consultationStateLabels: Record<string, string> = {
  requested: "신규 접수",
  assigned: "상담 진행",
  contacted: "연락 완료",
  completed: "상담 완료",
  engaged: "계약",
  closed: "종결",
};

const stateCopy: Record<
  TelephonyInboundCall["state"],
  { label: string; description: string }
> = {
  ringing: {
    label: "수신전화",
    description: "전화가 오고 있어요",
  },
  connected: {
    label: "통화 중",
    description: "전화가 연결됐어요",
  },
  ended: {
    label: "통화 종료",
    description: "수신전화가 종료됐어요",
  },
};

function ownerLabel(call: TelephonyInboundCall, staffUserId: string) {
  if (
    call.owners.some((owner) => owner.staffUserId === staffUserId)
  ) {
    return "내 전화";
  }
  if (call.owners.length === 0) return "담당 회선 미지정";
  return `${call.owners.map((owner) => owner.displayName).join(" · ")}님 전화`;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (/^02\d{7}$/.test(digits)) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  if (/^02\d{8}$/.test(digits)) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (/^\d{10}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function consultationPhoneLabel(
  consultation: ConsultationNotificationSummary,
) {
  return consultation.phone
    ? formatPhone(consultation.phone)
    : "010-0000-0000 · 미수집";
}

function consultationRegionLabel(
  consultation: ConsultationNotificationSummary,
) {
  return consultation.residenceRegion
    ? residenceRegionLabels[consultation.residenceRegion] ??
        consultation.residenceRegion
    : "지역 미기록";
}

function isConsultationNotificationSummary(
  value: unknown,
): value is ConsultationNotificationSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.publicReceiptCode === "string" &&
    typeof record.displayName === "string" &&
    ["phone", "kakao_channel", "naver_booking"].includes(
      String(record.contactChannel),
    ) &&
    (typeof record.phone === "string" || record.phone === null) &&
    (typeof record.residenceRegion === "string" ||
      record.residenceRegion === null) &&
    (typeof record.assigneeUserId === "string" ||
      record.assigneeUserId === null) &&
    typeof record.canClaim === "boolean"
  );
}

function caseTypeLabel(caseType: number) {
  return caseType === 1 ? "개인회생" : caseType === 2 ? "파산면책" : "기타사건";
}

function caseStateLabel(caseType: number, caseState: number) {
  const states = caseType === 2
    ? new Map([[5, "상담대기"], [10, "상담완료"], [11, "재상담필요"], [15, "계약"], [20, "서류준비"], [21, "부채증명서 발급중"], [22, "부채증명서 발급완료"], [25, "신청서 작성 진행중"], [30, "신청서 제출"], [40, "보정기간"], [100, "파산선고"], [105, "의견청취기일"], [110, "재산환가 및 배당"], [115, "파산폐지"], [120, "면책결정"], [125, "면책불허가"]])
    : new Map([[5, "상담대기"], [10, "상담완료"], [11, "재상담필요"], [15, "계약"], [20, "서류준비"], [21, "부채증명서 발급중"], [22, "부채증명서 발급완료"], [25, "신청서 작성 진행중"], [30, "신청서 제출"], [35, "금지명령"], [40, "보정기간"], [45, "개시결정"], [50, "채권자 집회기일"], [55, "인가결정"]]);
  return states.get(caseState) ?? `진행 상태 ${caseState}`;
}

function CustomerMatch({
  call,
}: {
  call: { customerMatch: TelephonyInboundCall["customerMatch"] };
}) {
  if (!call.customerMatch) return <span className="inbound-customer unknown">발신자 정보 없음</span>;
  if (call.customerMatch.source === "consultation") {
    const { consultation } = call.customerMatch;
    return <Link className="inbound-customer" href={`/consultations/${consultation.id}`}>
      상담데스크 · {consultation.displayName} · {consultation.state}{consultation.assigneeDisplayName ? ` · 담당 ${consultation.assigneeDisplayName}` : ""}
    </Link>;
  }
  const match = call.customerMatch;
  const latestCase = match.cases[0];
  return <span className="inbound-customer">
    리걸프렌즈 · {match.clientName} · {caseTypeLabel(latestCase.caseType)} · {caseStateLabel(latestCase.caseType, latestCase.caseState)}{latestCase.staffNames.length ? ` · 담당 ${latestCase.staffNames.join("·")}` : ""}{match.cases.length > 1 ? ` 외 ${match.cases.length - 1}건` : ""}
  </span>;
}

function activityCopy(
  activity: TelephonyCallActivity,
  staffUserId: string,
) {
  if (activity.scope === "internal") {
    const myLeg = activity.participants.find(
      (participant) => participant.staffUserId === staffUserId,
    );
    const prefix = myLeg?.direction === "outbound" ? "내선 발신" : "내선 수신";
    if (activity.state === "ended") {
      return { label: "내선 통화 종료", description: "내선 통화가 종료됐어요" };
    }
    if (activity.state === "connected") {
      return { label: "내선 통화 중", description: "내선이 연결됐어요" };
    }
    return { label: `${prefix} 중`, description: "내선 연결을 기다리고 있어요" };
  }
  const prefix = activity.direction === "outbound" ? "발신" : "수신";
  if (activity.state === "transferring") {
    return { label: "호전환 중", description: "고객 전화를 전달하고 있어요" };
  }
  if (activity.state === "needs_confirmation") {
    return {
      label: "호전환 확인 필요",
      description: "마지막 고객 연결 근거를 확인해 주세요",
    };
  }
  if (activity.state === "ended") {
    return { label: `${prefix} 통화 종료`, description: `${prefix} 통화가 종료됐어요` };
  }
  if (activity.state === "connected") {
    return { label: `${prefix} 통화 중`, description: `${prefix} 통화가 연결됐어요` };
  }
  return { label: `${prefix} 중`, description: `${prefix} 연결을 기다리고 있어요` };
}

function outboundCopy(call: PhoneDeskCall) {
  if (call.state === "pending") {
    return { label: "발신 준비 중", description: "전화기에 발신을 요청하고 있어요" };
  }
  if (call.state === "ringing") {
    return { label: "발신 중", description: "상대방 연결을 기다리고 있어요" };
  }
  if (call.state === "connected") {
    return { label: "발신 통화 중", description: "발신 통화가 연결됐어요" };
  }
  if (call.state === "ended") {
    return { label: "발신 통화 종료", description: "발신 통화가 종료됐어요" };
  }
  if (call.state === "failed") {
    return { label: "발신 실패", description: "발신 요청을 완료하지 못했어요" };
  }
  return { label: "발신 확인 중", description: "센트릭스 결과를 확인하고 있어요" };
}

function isMyCustomer(
  activity: TelephonyCallActivity,
  staffUserId: string,
) {
  const customer = activity.customerMatch;
  if (customer?.source === "consultation") {
    return customer.consultation.assigneeUserId === staffUserId;
  }
  return customer?.source === "legal_friends"
    ? customer.cases.some((item) => item.staffUserIds.includes(staffUserId))
    : false;
}

function notificationCopy(
  activity: TelephonyCallActivity,
  staffUserId: string,
) {
  const kindLabel =
    activity.notificationKind === "transferred_customer"
      ? "전달된 고객 전화"
      : activity.notificationKind === "transfer_returned"
        ? "고객 전화 복귀"
        : activity.notificationKind === "internal_inbound"
          ? "내선 전화"
          : "고객 전화 수신";
  const customer = activity.customerMatch;
  const customerName = customer?.source === "consultation"
    ? customer.consultation.displayName
    : customer?.source === "legal_friends"
      ? customer.clientName
      : "발신자 정보 없음";
  const details: string[] = [];
  const myCustomer = isMyCustomer(activity, staffUserId);
  if (myCustomer) details.push("★ 내가 담당하는 고객입니다");
  if (customer?.source === "consultation") {
    details.push(
      `상담데스크 · ${customer.consultation.publicReceiptCode} · ${consultationStateLabels[customer.consultation.state] ?? customer.consultation.state}`,
    );
    details.push(
      customer.consultation.assigneeDisplayName
        ? `기존 담당 ${customer.consultation.assigneeDisplayName}`
        : "기존 담당 미배정",
    );
  } else if (customer?.source === "legal_friends") {
    const latestCase = customer.cases[0];
    if (latestCase) {
      details.push(
        `리걸프렌즈 · ${caseTypeLabel(latestCase.caseType)} · ${caseStateLabel(latestCase.caseType, latestCase.caseState)}`,
      );
    }
    const caseDetails = [
      latestCase?.caseNumber,
      latestCase?.caseName,
      latestCase?.courtName,
    ].filter((value): value is string => Boolean(value));
    if (caseDetails.length) details.push(caseDetails.join(" · "));
    const names = [...new Set(customer.cases.flatMap((item) => item.staffNames))];
    details.push(names.length ? `기존 담당 ${names.join(" · ")}` : "기존 담당 미확인");
    if (customer.cases.length > 1) {
      details.push(`연결 사건 ${customer.cases.length}건`);
    }
  } else {
    details.push("상담·리걸프렌즈 일치 고객 없음");
  }
  details.push(
    activity.remotePhone
      ? `전화 ${formatPhone(activity.remotePhone)}`
      : "전화번호 확인 중",
  );
  details.push(
    `수신 ${activity.currentEndpoint.label} · ${formatPhone(activity.currentEndpoint.lineNumber)} · 내선 ${activity.currentEndpoint.extension}`,
  );
  const participantNames = [
    ...new Set(
      activity.participants.flatMap((participant) =>
        participant.displayName ? [participant.displayName] : [],
      ),
    ),
  ];
  if (activity.notificationKind === "transferred_customer" && participantNames.length) {
    details.push(`전달 ${participantNames.join(" → ")}`);
  }
  return {
    title: myCustomer
      ? `★ 내 담당 고객 전화 · ${customerName}`
      : `${kindLabel} · ${customerName}`,
    body: details.join("\n"),
  };
}

export function InboundCallIndicator({
  staffDisplayName,
  staffUserId,
}: {
  staffDisplayName: string;
  staffUserId: string;
}) {
  const pathname = usePathname();
  const showPhoneDeskStatus = pathname.startsWith("/phone-desk");
  const [calls, setCalls] = useState<TelephonyInboundCall[]>([]);
  const [activities, setActivities] = useState<TelephonyCallActivity[]>([]);
  const [deskCalls, setDeskCalls] = useState<PhoneDeskCall[]>([]);
  const [toasts, setToasts] = useState<IndicatorToast[]>([]);
  const [callsExpanded, setCallsExpanded] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    "default" | "denied" | "granted" | "unsupported"
  >("default");
  const [connection, setConnection] =
    useState<ConnectionState>("connecting");
  const [answeringCallIds, setAnsweringCallIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>(
    {},
  );
  const [aftercareCallId, setAftercareCallId] = useState<string | null>(null);
  const [pendingAftercareCallIds, setPendingAftercareCallIds] = useState<
    string[]
  >([]);
  const requestSequence = useRef(0);
  const deskRequestSequence = useRef(0);
  const deskStartedAt = useRef(0);
  const seenDeskEndedCallIds = useRef<Set<string>>(new Set());
  const seenNotificationKeys = useRef<Set<string>>(new Set());
  const seenConsultationEventIds = useRef<Set<string>>(new Set());
  const notificationLeader = useRef(false);
  const notificationTabId = useRef("");
  const toastTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const synchronizeNotificationPermission = () => {
      setNotificationPermission(
        "Notification" in window ? Notification.permission : "unsupported",
      );
    };
    synchronizeNotificationPermission();
    void prepareBrowserNotifications()?.catch(() => undefined);
    window.addEventListener(
      notificationPermissionChangedEvent,
      synchronizeNotificationPermission,
    );
    notificationTabId.current = window.crypto.randomUUID();
    const leaseKey = "lawand:telephony-notification-leader";
    const claimLeadership = () => {
      const current = Date.now();
      let lease: { tabId: string; expiresAt: number } | null = null;
      try {
        lease = JSON.parse(window.localStorage.getItem(leaseKey) ?? "null") as
          | { tabId: string; expiresAt: number }
          | null;
      } catch {
        lease = null;
      }
      if (
        !lease ||
        lease.expiresAt <= current ||
        lease.tabId === notificationTabId.current
      ) {
        try {
          window.localStorage.setItem(
            leaseKey,
            JSON.stringify({
              tabId: notificationTabId.current,
              expiresAt: current + 8_000,
            }),
          );
        } catch {
          // 저장소가 막혀도 이 탭의 네이티브 알림 자체는 계속 시도한다.
        }
        notificationLeader.current = true;
      } else {
        notificationLeader.current = false;
      }
    };
    claimLeadership();
    const timer = window.setInterval(claimLeadership, 3_000);
    return () => {
      window.removeEventListener(
        notificationPermissionChangedEvent,
        synchronizeNotificationPermission,
      );
      window.clearInterval(timer);
      try {
        const lease = JSON.parse(
          window.localStorage.getItem(leaseKey) ?? "null",
        ) as { tabId?: string } | null;
        if (lease?.tabId === notificationTabId.current) {
          window.localStorage.removeItem(leaseKey);
        }
      } catch {
        // 손상된 다른 탭 lease는 만료 뒤 자연스럽게 교체된다.
      }
    };
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(await Notification.requestPermission());
    window.dispatchEvent(new Event(notificationPermissionChangedEvent));
  }, []);

  const dismissToast = useCallback((toastId: string) => {
    const timer = toastTimers.current.get(toastId);
    if (timer !== undefined) window.clearTimeout(timer);
    toastTimers.current.delete(toastId);
    setToasts((items) => items.filter((item) => item.id !== toastId));
  }, []);

  const enqueueToast = useCallback((toast: IndicatorToast) => {
    const existingTimer = toastTimers.current.get(toast.id);
    if (existingTimer !== undefined) window.clearTimeout(existingTimer);
    setToasts((items) => [
      ...items.filter((item) => item.id !== toast.id),
      toast,
    ]);
    const timer = window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== toast.id));
      toastTimers.current.delete(toast.id);
    }, 10_000);
    toastTimers.current.set(toast.id, timer);
  }, []);

  const claimConsultationFromToast = useCallback(
    async (toast: IndicatorToast) => {
      const consultation = toast.consultation;
      if (!consultation || !consultation.canClaim) return;
      const timer = toastTimers.current.get(toast.id);
      if (timer !== undefined) window.clearTimeout(timer);
      toastTimers.current.delete(toast.id);
      setToasts((items) =>
        items.map((item) =>
          item.id === toast.id
            ? {
                ...item,
                claimStatus: "claiming",
                claimError: undefined,
              }
            : item,
        ),
      );
      try {
        const response = await fetch(
          `/api/consultations/${consultation.id}/claim`,
          {
            method: "POST",
            cache: "no-store",
            headers: { accept: "application/json" },
          },
        );
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        if (!response.ok) {
          throw new Error(
            body?.message ?? "상담하기 요청을 완료하지 못했습니다.",
          );
        }
        window.location.assign(`/consultations/${consultation.id}`);
      } catch (error) {
        setToasts((items) =>
          items.map((item) =>
            item.id === toast.id
              ? {
                  ...item,
                  claimStatus: "failed",
                  claimError:
                    error instanceof Error
                      ? error.message
                      : "상담하기 요청을 완료하지 못했습니다.",
                }
              : item,
          ),
        );
      }
    },
    [],
  );

  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const enqueueAftercareCalls = useCallback((callIds: string[]) => {
    setPendingAftercareCallIds((current) => {
      const next = [...current];
      let changed = false;
      for (const callId of callIds) {
        if (
          next.includes(callId) ||
          window.sessionStorage.getItem(`lawand:phone-aftercare:${callId}`)
        ) {
          continue;
        }
        next.push(callId);
        changed = true;
      }
      return changed ? next : current;
    });
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const response = await fetch("/api/telephony-inbound-calls", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("telephony_inbound_sync_failed");
    const snapshot = (await response.json()) as TelephonyInboundCallSnapshot;
    if (
      !Array.isArray(snapshot.items) ||
      typeof snapshot.snapshotAt !== "string" ||
      sequence !== requestSequence.current
    ) {
      if (sequence === requestSequence.current) {
        throw new Error("telephony_inbound_sync_invalid");
      }
      return;
    }
    setCalls(snapshot.items);
  }, []);

  const answerCall = useCallback(async (callId: string) => {
    setAnsweringCallIds((current) => new Set(current).add(callId));
    setAnswerErrors((current) => {
      const next = { ...current };
      delete next[callId];
      return next;
    });
    try {
      const response = await fetch(
        `/api/telephony-inbound-calls/${callId}/answer`,
        { method: "POST", headers: { accept: "application/json" } },
      );
      const body = (await response.json().catch(() => null)) as
        | (NonNullable<TelephonyInboundCall["answerCommand"]> & {
            message?: string;
          })
        | null;
      if (!response.ok || !body?.id) {
        throw new Error(body?.message ?? "전화 받기 요청에 실패했습니다.");
      }
      setCalls((current) => current.map((call) =>
        call.id === callId
          ? { ...call, answerCommand: body }
          : call,
      ));
    } catch (error) {
      setAnswerErrors((current) => ({
        ...current,
        [callId]: error instanceof Error
          ? error.message
          : "전화 받기 요청에 실패했습니다.",
      }));
    } finally {
      setAnsweringCallIds((current) => {
        const next = new Set(current);
        next.delete(callId);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (!showPhoneDeskStatus) {
      setCalls([]);
      return;
    }
    let disposed = false;
    void refresh().catch(() => {
      if (!disposed) setConnection("disconnected");
    });

    const stream = new EventSource(
      "/api/telephony-inbound-calls/stream",
    );
    const handleChange = () => {
      void refresh().catch(() => {
        if (!disposed) setConnection("disconnected");
      });
    };
    stream.addEventListener("telephony.inbound.sync", handleChange);
    stream.addEventListener("telephony.inbound.changed", handleChange);
    stream.onopen = () => {
      if (!disposed) setConnection("connected");
    };
    stream.onerror = () => {
      if (!disposed) setConnection("disconnected");
    };

    return () => {
      disposed = true;
      requestSequence.current += 1;
      stream.removeEventListener("telephony.inbound.sync", handleChange);
      stream.removeEventListener("telephony.inbound.changed", handleChange);
      stream.close();
    };
  }, [refresh, showPhoneDeskStatus]);

  const refreshCallActivities = useCallback(async () => {
    const sequence = ++deskRequestSequence.current;
    const response = await fetch("/api/telephony-call-activities", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error("telephony_desk_sync_failed");
    }
    const activitySnapshot =
      (await response.json()) as TelephonyCallActivitySnapshot;
    if (
      !Array.isArray(activitySnapshot.items) ||
      typeof activitySnapshot.snapshotAt !== "string" ||
      sequence !== deskRequestSequence.current
    ) {
      if (sequence !== deskRequestSequence.current) return;
      throw new Error("telephony_call_activity_sync_invalid");
    }
    setActivities(activitySnapshot.items);
  }, []);

  const refreshCurrentDeskCalls = useCallback(async () => {
    if (!showPhoneDeskStatus) return;
    const from = new Date(Date.now() - 12 * 60 * 60_000).toISOString();
    const response = await fetch(
      `/api/phone-desk/calls?pageSize=20&filter=active&from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`,
      {
        cache: "no-store",
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok) throw new Error("telephony_current_calls_sync_failed");
    const snapshot = (await response.json()) as PhoneDeskCallSnapshot;
    if (!Array.isArray(snapshot.items) || typeof snapshot.snapshotAt !== "string") {
      throw new Error("telephony_current_calls_sync_invalid");
    }
    setDeskCalls(snapshot.items);

    const candidates: string[] = [];
    for (const call of snapshot.items) {
      if (call.state !== "ended") continue;
      const alreadySeen = seenDeskEndedCallIds.current.has(call.id);
      seenDeskEndedCallIds.current.add(call.id);
      if (
        alreadySeen ||
        Boolean(call.callRootId) ||
        call.source !== "centrex_direct" ||
        call.aftercare ||
        !call.endedAt ||
        new Date(call.endedAt).getTime() < deskStartedAt.current - 5_000 ||
        !call.endpointOwners.some(
          (owner) => owner.staffUserId === staffUserId,
        )
      ) {
        continue;
      }
      candidates.push(call.id);
    }
    enqueueAftercareCalls(candidates);
  }, [enqueueAftercareCalls, showPhoneDeskStatus, staffUserId]);

  useEffect(() => {
    deskStartedAt.current = Date.now();
    void refreshCallActivities().catch(() => undefined);
    if (showPhoneDeskStatus) {
      void refreshCurrentDeskCalls().catch(() => undefined);
    }
    const stream = new EventSource("/api/phone-desk/stream");
    const handleChange = () => {
      void refreshCallActivities().catch(() => undefined);
      if (showPhoneDeskStatus) {
        void refreshCurrentDeskCalls().catch(() => undefined);
      }
    };
    stream.addEventListener("telephony.desk.sync", handleChange);
    stream.addEventListener("telephony.desk.changed", handleChange);
    return () => {
      deskRequestSequence.current += 1;
      stream.removeEventListener("telephony.desk.sync", handleChange);
      stream.removeEventListener("telephony.desk.changed", handleChange);
      stream.close();
    };
  }, [refreshCallActivities, refreshCurrentDeskCalls, showPhoneDeskStatus]);

  useEffect(() => {
    if (!notificationLeader.current) return;
    const current = Date.now();
    for (const activity of activities) {
      if (
        !activity.notificationKind ||
        !activity.notificationTargetUserIds.includes(staffUserId) ||
        current - new Date(activity.lastEventAt).getTime() > 2 * 60_000 ||
        activity.state === "ended" ||
        (activity.notificationKind === "external_inbound" &&
          activity.state !== "ringing") ||
        (activity.notificationKind === "internal_inbound" &&
          activity.state !== "ringing")
      ) {
        continue;
      }
      const notificationKey = `${activity.id}:${activity.notificationKind}`;
      if (seenNotificationKeys.current.has(notificationKey)) continue;
      seenNotificationKeys.current.add(notificationKey);
      const storageKey = `lawand:telephony-notified:${notificationKey}`;
      let alreadyNotified = false;
      try {
        alreadyNotified = Boolean(window.localStorage.getItem(storageKey));
        if (!alreadyNotified) {
          window.localStorage.setItem(storageKey, String(current));
        }
      } catch {
        // 저장소가 막힌 브라우저에서도 Notification API는 별도로 시도한다.
      }
      if (alreadyNotified) continue;
      const copy = notificationCopy(activity, staffUserId);
      if (notificationPermission === "granted") {
        void showTelephonyBrowserNotification({
          ...copy,
          notificationId: notificationKey,
          callId: activity.id,
          href: `/phone-desk/${activity.id}`,
          occurredAt: activity.lastEventAt,
        });
      }
    }
  }, [activities, notificationPermission, staffUserId]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeConsultationRealtime((message) => {
      if (message.kind !== "changed") return;
      const payload = message.payload;
      const isRequestedEvent = payload.eventType === "consultation.requested";
      if (
        (!isRequestedEvent && payload.notificationKind === null) ||
        seenConsultationEventIds.current.has(payload.eventId)
      ) {
        return;
      }
      seenConsultationEventIds.current.add(payload.eventId);

      const notificationKey = `consultation:${payload.eventId}`;
      const href = `/consultations/${payload.consultationId}`;
      const visibleAtEvent = document.visibilityState === "visible";
      const shouldShowNotification =
        notificationPermission === "granted" &&
        (visibleAtEvent || notificationLeader.current);
      if (!visibleAtEvent && !shouldShowNotification) return;

      void (async () => {
        let consultation: ConsultationNotificationSummary | null = null;
        try {
          const response = await fetch(
            `/api/consultations/${payload.consultationId}/notification`,
            {
              cache: "no-store",
              headers: { accept: "application/json" },
            },
          );
          const value = await response.json();
          if (
            response.ok &&
            isConsultationNotificationSummary(value) &&
            value.id === payload.consultationId
          ) {
            consultation = value;
          }
        } catch {
          consultation = null;
        }
        if (!active) return;

        if (!isRequestedEvent && !consultation) return;
        if (
          (payload.notificationKind === "repeat_assigned" ||
            payload.notificationKind === "assignment_transferred") &&
          consultation?.assigneeUserId !== staffUserId
        ) {
          return;
        }

        const title = consultation
          ? payload.notificationKind === "repeat_assigned"
            ? `담당 상담 재요청 · ${consultation.displayName}`
            : payload.notificationKind === "assignment_transferred"
              ? `새 담당 상담 · ${consultation.displayName}`
            : payload.notificationKind === "repeat_unassigned"
              ? `상담 재요청 · ${consultation.displayName}`
              : `새 상담 · ${consultation.displayName}`
          : "새 상담이 등록됐습니다";
        const body = consultation
          ? [
              `${consultationChannelLabels[consultation.contactChannel]} · ${consultation.publicReceiptCode}`,
              `${consultationPhoneLabel(consultation)} · ${consultationRegionLabel(consultation)}`,
            ].join("\n")
          : "상담 데스크에서 접수 내용을 확인해 주세요.";

        if (visibleAtEvent) {
          enqueueToast({
            id: notificationKey,
            title,
            body,
            href,
            ...(consultation
              ? {
                  consultation,
                  consultationKind: payload.notificationKind ?? "new",
                  claimStatus: "idle" as const,
                }
              : {}),
          });
        }
        if (!shouldShowNotification) return;

        const storageKey = `lawand:consultation-notified:${payload.eventId}`;
        let alreadyNotified = false;
        try {
          alreadyNotified = Boolean(window.localStorage.getItem(storageKey));
          if (!alreadyNotified) {
            window.localStorage.setItem(storageKey, String(Date.now()));
          }
        } catch {
          // 저장소가 막힌 브라우저에서도 Notification API는 별도로 시도한다.
        }
        if (alreadyNotified) return;
        await showConsultationBrowserNotification({
          title,
          body,
          eventId: payload.eventId,
          consultationId: payload.consultationId,
          href,
          occurredAt: payload.occurredAt,
        });
      })();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [enqueueToast, notificationPermission, staffUserId]);

  useEffect(() => {
    if (!showPhoneDeskStatus) return;
    if (!calls.some((call) => call.state === "ended")) return;
    const timer = window.setTimeout(() => {
      void refresh().catch(() => setConnection("disconnected"));
    }, 21_000);
    return () => window.clearTimeout(timer);
  }, [calls, refresh, showPhoneDeskStatus]);

  useEffect(() => {
    if (!showPhoneDeskStatus) return;
    const activityObservedIds = new Set(
      activities.flatMap((activity) =>
        activity.observedCallId ? [activity.observedCallId] : [],
      ),
    );
    enqueueAftercareCalls(
      calls.filter(
        (call) =>
        !activityObservedIds.has(call.id) &&
        call.state === "ended" &&
        call.owners.some((owner) => owner.staffUserId === staffUserId),
      ).map((call) => call.id),
    );
    enqueueAftercareCalls(
      activities
        .filter((activity) => activity.canOpenAftercare)
        .map((activity) => activity.id),
    );
  }, [activities, calls, enqueueAftercareCalls, showPhoneDeskStatus, staffUserId]);

  useEffect(() => {
    if (aftercareCallId || pendingAftercareCallIds.length === 0) return;
    const [nextCallId] = pendingAftercareCallIds;
    setPendingAftercareCallIds((current) => current.slice(1));
    const key = `lawand:phone-aftercare:${nextCallId}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "opened");
    setAftercareCallId(nextCallId);
  }, [aftercareCallId, pendingAftercareCallIds]);

  const activityObservedIds = new Set(
    activities.flatMap((activity) =>
      activity.observedCallId ? [activity.observedCallId] : [],
    ),
  );
  const visibleLegacyCalls = calls.filter(
    (call) => !activityObservedIds.has(call.id),
  );
  const visibleOutboundCalls = deskCalls.filter(
    (call) =>
      call.direction === "outbound" &&
      !activityObservedIds.has(call.observedCallId ?? "") &&
      !activities.some(
        (activity) =>
          activity.observedCallId === call.observedCallId ||
          activity.id === call.callRootId,
      ) &&
      (call.state === "ringing" || call.state === "connected"
        ? new Date(call.lastEventAt).getTime() >=
          deskStartedAt.current - 12 * 60 * 60_000
        : call.state === "pending"
          ? new Date(call.lastEventAt).getTime() >=
            deskStartedAt.current - 3 * 60_000
          : new Date(call.lastEventAt).getTime() >=
            deskStartedAt.current - 20_000),
  );
  const visibleActivities = activities.filter(
    (activity) =>
      activity.scope === "external" ||
      activity.participants.some(
        (participant) => participant.staffUserId === staffUserId,
      ),
  );
  const callCards = showPhoneDeskStatus ? [
    ...visibleActivities.map((activity) => ({
      key: `activity:${activity.id}`,
      lastEventAt: activity.lastEventAt,
    })),
    ...visibleOutboundCalls.map((call) => ({
      key: `outbound:${call.id}`,
      lastEventAt: call.lastEventAt,
    })),
    ...visibleLegacyCalls.map((call) => ({
      key: `legacy:${call.id}`,
      lastEventAt: call.lastEventAt,
    })),
  ] : [];
  const latestCallCardKey = callCards.reduce<string | null>(
    (latestKey, card) => {
      if (!latestKey) return card.key;
      const latestCard = callCards.find((item) => item.key === latestKey);
      return !latestCard ||
        Date.parse(card.lastEventAt) > Date.parse(latestCard.lastEventAt)
        ? card.key
        : latestKey;
    },
    null,
  );
  const shouldDisplayCallCard = (key: string) =>
    callsExpanded || key === latestCallCardKey;
  const hasCards = callCards.length > 0;

  if (!hasCards && !aftercareCallId && toasts.length === 0) return null;

  return (
    <>
      {hasCards ? <section
        aria-label="현재 통화 활동"
        aria-live="assertive"
        className="inbound-call-strip"
      >
        {callCards.length > 1 ? (
          <div className="inbound-call-strip-toolbar">
            <span>
              통화 활동 <strong>{callCards.length}건</strong>
              {!callsExpanded ? " · 최근 1건 표시 중" : ""}
            </span>
            <button
              aria-controls="current-call-activity-list"
              aria-expanded={callsExpanded}
              onClick={() => setCallsExpanded((expanded) => !expanded)}
              type="button"
            >
              {callsExpanded ? "최근 1건만 보기" : "모두 펼치기"}
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d={callsExpanded ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
              </svg>
            </button>
          </div>
        ) : null}
        <div className="inbound-call-strip-inner" id="current-call-activity-list">
        {visibleActivities.filter((activity) =>
          shouldDisplayCallCard(`activity:${activity.id}`)
        ).map((activity) => {
          const copy = activityCopy(activity, staffUserId);
          const legacyCall = activity.observedCallId
            ? calls.find((call) => call.id === activity.observedCallId)
            : undefined;
          const isOwner = legacyCall?.owners.some(
            (owner) => owner.staffUserId === staffUserId,
          ) ?? false;
          const isAnswering = legacyCall
            ? answeringCallIds.has(legacyCall.id)
            : false;
          const answerInProgress =
            legacyCall?.answerCommand?.status === "queued" ||
            legacyCall?.answerCommand?.status === "dispatching" ||
            legacyCall?.answerCommand?.status === "succeeded";
          const canAnswer =
            activity.state === "ringing" &&
            Boolean(legacyCall?.answerAvailable) &&
            isOwner;
          const answerLabel = isAnswering ||
            legacyCall?.answerCommand?.status === "queued" ||
            legacyCall?.answerCommand?.status === "dispatching"
              ? "받는 중…"
              : legacyCall?.answerCommand?.status === "succeeded"
                ? "연결 확인 중"
                : legacyCall?.answerCommand?.status === "failed" ||
                    legacyCall?.answerCommand?.status === "expired"
                  ? "다시 받기"
                  : "전화 받기";
          const myLeg = activity.participants.find(
            (participant) => participant.staffUserId === staffUserId,
          );
          const participantNames = [
            ...new Set(
              activity.participants.flatMap((participant) =>
                participant.displayName ? [participant.displayName] : [],
              ),
            ),
          ];
          return (
            <article
              className={`inbound-call-card is-${activity.state}`}
              key={activity.id}
            >
              <span aria-hidden="true" className="inbound-call-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M7.8 3.8 10 8.5 7.5 10a14.3 14.3 0 0 0 6.5 6.5l1.5-2.5 4.7 2.2v3a1.8 1.8 0 0 1-1.8 1.8A15.4 15.4 0 0 1 3 5.6a1.8 1.8 0 0 1 1.8-1.8h3Z" />
                </svg>
              </span>
              <span className="inbound-call-copy">
                <span className="inbound-call-title">
                  <strong>{copy.label}</strong>
                  <span>{copy.description}</span>
                </span>
                <span className="inbound-call-meta">
                  <b>
                    {activity.remotePhone
                      ? formatPhone(activity.remotePhone)
                      : `내선 ${myLeg?.remoteExtension ?? "확인 중"}`}
                  </b>
                  <span>내선 {activity.currentEndpoint.extension}</span>
                  {participantNames.length ? (
                    <span>{participantNames.join(" · ")}</span>
                  ) : null}
                </span>
                {activity.scope === "external" ? (
                  <CustomerMatch call={activity} />
                ) : null}
                {activity.state === "ringing" && legacyCall?.deliveryDelayed ? (
                  <span className="inbound-customer">
                    수신 반영이 늦어 종료 여부를 확인하고 있어요 · 연결된 단말에서 상태를 확인해 주세요
                  </span>
                ) : null}
                {activity.transfer ? (
                  <span className="inbound-customer">
                    {activity.transfer.state === "transfer_completed"
                      ? "호전환 연결 확인됨"
                      : activity.transfer.state === "transfer_returned"
                        ? "호전환 실패 · 원래 통화로 복귀"
                        : activity.transfer.state === "transfer_unresolved"
                          ? "최종 고객 연결 확인 필요"
                          : "호전환 대상 연결 중"}
                  </span>
                ) : null}
              </span>
              <span className="inbound-call-actions">
                {canAnswer && legacyCall ? (
                  <button
                    className="inbound-answer-button"
                    disabled={isAnswering || answerInProgress}
                    onClick={() => void answerCall(legacyCall.id)}
                    type="button"
                  >
                    {answerLabel}
                  </button>
                ) : null}
                {activity.canOpenAftercare ? (
                  <button
                    className="inbound-aftercare-button"
                    onClick={() => setAftercareCallId(activity.id)}
                    type="button"
                  >
                    후처리 입력
                  </button>
                ) : null}
                {notificationPermission === "default" &&
                activity.notificationTargetUserIds.includes(staffUserId) ? (
                  <button
                    className="inbound-aftercare-button"
                    onClick={() => void requestNotificationPermission()}
                    type="button"
                  >
                    브라우저 알림 켜기
                  </button>
                ) : null}
                <span className={`inbound-call-realtime is-${connection}`}>
                  <span aria-hidden="true" />
                  {connection === "connected" ? "실시간" : "재연결 중"}
                </span>
              </span>
            </article>
          );
        })}
        {visibleOutboundCalls.filter((call) =>
          shouldDisplayCallCard(`outbound:${call.id}`)
        ).map((call) => {
          const copy = outboundCopy(call);
          return (
            <article
              className={`inbound-call-card is-${call.state}`}
              key={`outbound:${call.id}`}
            >
              <span aria-hidden="true" className="inbound-call-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M7.8 3.8 10 8.5 7.5 10a14.3 14.3 0 0 0 6.5 6.5l1.5-2.5 4.7 2.2v3a1.8 1.8 0 0 1-1.8 1.8A15.4 15.4 0 0 1 3 5.6a1.8 1.8 0 0 1 1.8-1.8h3Z" />
                </svg>
              </span>
              <span className="inbound-call-copy">
                <span className="inbound-call-title">
                  <strong>{copy.label}</strong>
                  <span>{copy.description}</span>
                </span>
                <span className="inbound-call-meta">
                  <b>{call.remotePhone ? formatPhone(call.remotePhone) : "내선 통화"}</b>
                  <span>내선 {call.endpoint.extension}</span>
                  <span>
                    {call.clickToCall
                      ? `${call.clickToCall.requestedBy.displayName}님 클릭투콜`
                      : call.endpointOwners.length
                        ? `${call.endpointOwners.map((owner) => owner.displayName).join(" · ")}님 발신`
                        : "센트릭스 직접발신"}
                  </span>
                </span>
                <CustomerMatch call={call} />
              </span>
              <span className="inbound-call-actions">
                {call.state === "ended" &&
                call.endpointOwners.some(
                  (owner) => owner.staffUserId === staffUserId,
                ) ? (
                  <button
                    className="inbound-aftercare-button"
                    onClick={() => setAftercareCallId(call.id)}
                    type="button"
                  >
                    후처리 입력
                  </button>
                ) : null}
                <span className={`inbound-call-realtime is-${connection}`}>
                  <span aria-hidden="true" />
                  {connection === "connected" ? "실시간" : "재연결 중"}
                </span>
              </span>
            </article>
          );
        })}
        {visibleLegacyCalls.filter((call) =>
          shouldDisplayCallCard(`legacy:${call.id}`)
        ).map((call) => {
          const copy = stateCopy[call.state];
          const isOwner = call.owners.some(
            (owner) => owner.staffUserId === staffUserId,
          );
          const isAnswering = answeringCallIds.has(call.id);
          const answerInProgress =
            call.answerCommand?.status === "queued" ||
            call.answerCommand?.status === "dispatching" ||
            call.answerCommand?.status === "succeeded";
          const canAnswer =
            call.state === "ringing" && isOwner && call.answerAvailable;
          const answerLabel = isAnswering ||
            call.answerCommand?.status === "queued" ||
            call.answerCommand?.status === "dispatching"
              ? "받는 중…"
              : call.answerCommand?.status === "succeeded"
                ? "연결 확인 중"
                : call.answerCommand?.status === "failed" ||
                    call.answerCommand?.status === "expired"
                  ? "다시 받기"
                  : "전화 받기";
          return (
            <article
              className={`inbound-call-card is-${call.state}`}
              key={call.id}
            >
              <span aria-hidden="true" className="inbound-call-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M7.8 3.8 10 8.5 7.5 10a14.3 14.3 0 0 0 6.5 6.5l1.5-2.5 4.7 2.2v3a1.8 1.8 0 0 1-1.8 1.8A15.4 15.4 0 0 1 3 5.6a1.8 1.8 0 0 1 1.8-1.8h3Z" />
                </svg>
              </span>
              <span className="inbound-call-copy">
                <span className="inbound-call-title">
                  <strong>{copy.label}</strong>
                  <span>{copy.description}</span>
                </span>
                <span className="inbound-call-meta">
                  <b>{formatPhone(call.remotePhone)}</b>
                  <span>내선 {call.extension}</span>
                  <span>{ownerLabel(call, staffUserId)}</span>
                </span>
                <CustomerMatch call={call} />
                {call.state === "ringing" && !call.answerAvailable ? (
                  <span className="inbound-customer">
                    {call.deliveryDelayed
                      ? "수신 반영이 늦어 종료 여부를 확인하고 있어요 · 연결된 단말에서 상태를 확인해 주세요"
                      : "U+ 앱/망으로 온 전화예요 · 비즈콜 앱이나 연결된 단말에서 받아 주세요"}
                  </span>
                ) : null}
              </span>
              <span className="inbound-call-actions">
                {canAnswer ? <button
                  className="inbound-answer-button"
                  disabled={isAnswering || answerInProgress}
                  onClick={() => void answerCall(call.id)}
                  type="button"
                >
                  {answerLabel}
                </button> : null}
                {call.state === "ended" ? (
                  <button
                    className="inbound-aftercare-button"
                    onClick={() => setAftercareCallId(call.id)}
                    type="button"
                  >
                    후처리 입력
                  </button>
                ) : null}
                <span
                  className={`inbound-call-realtime is-${connection}`}
                  title={
                    connection === "connected"
                      ? "실시간 연결됨"
                      : "실시간 연결 재시도 중"
                  }
                >
                  <span aria-hidden="true" />
                  {connection === "connected"
                    ? "실시간"
                    : "재연결 중"}
                </span>
                {answerErrors[call.id] ? <span className="inbound-answer-error">
                  {answerErrors[call.id]}
                </span> : call.answerCommand?.status === "failed" ||
                  call.answerCommand?.status === "expired" ? <span className="inbound-answer-error">
                    전화기에서 받지 못했습니다. 다시 시도해 주세요.
                  </span> : null}
              </span>
            </article>
          );
        })}
        </div>
      </section> : null}
      {toasts.length ? (
        <aside aria-live="assertive" className="telephony-toast-stack">
          {toasts.map((toast) => {
            const consultation = toast.consultation;
            if (!consultation) {
              return (
                <button
                  className="telephony-toast"
                  key={toast.id}
                  onClick={() => {
                    dismissToast(toast.id);
                    if (toast.href) window.location.assign(toast.href);
                  }}
                  type="button"
                >
                  <strong>{toast.title}</strong>
                  <span>{toast.body}</span>
                </button>
              );
            }
            return (
              <article
                className={`consultation-alert-toast${
                  toast.claimStatus && toast.claimStatus !== "idle"
                    ? " is-actioning"
                    : ""
                }`}
                key={toast.id}
              >
                <header className="consultation-alert-heading">
                  <div>
                    <span className="consultation-alert-kicker">
                      {toast.consultationKind === "repeat_assigned"
                        ? "담당 상담 재요청"
                        : toast.consultationKind === "assignment_transferred"
                          ? "새 담당 상담"
                        : toast.consultationKind === "repeat_unassigned"
                          ? "상담 재요청"
                          : "새 상담 접수"}
                    </span>
                    <span className="consultation-alert-channel">
                      {consultationChannelLabels[consultation.contactChannel]}
                    </span>
                  </div>
                  <button
                    aria-label="상담 알림 닫기"
                    className="consultation-alert-close"
                    onClick={() => dismissToast(toast.id)}
                    type="button"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="m6 6 12 12M18 6 6 18" />
                    </svg>
                  </button>
                </header>
                <div className="consultation-alert-body">
                  <div className="consultation-alert-identity">
                    <strong>{consultation.displayName}</strong>
                    <span>{consultation.publicReceiptCode}</span>
                  </div>
                  <dl className="consultation-alert-facts">
                    <div className="is-region">
                      <dt>
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                          <circle cx="12" cy="10" r="2.5" />
                        </svg>
                        거주지역
                      </dt>
                      <dd>{consultationRegionLabel(consultation)}</dd>
                    </div>
                    <div>
                      <dt>휴대전화</dt>
                      <dd>{consultationPhoneLabel(consultation)}</dd>
                    </div>
                  </dl>
                  {toast.claimError ? (
                    <p className="consultation-alert-error" role="alert">
                      {toast.claimError}
                    </p>
                  ) : null}
                  <div className="consultation-alert-actions">
                    <a
                      className="consultation-alert-detail"
                      href={`/consultations/${consultation.id}`}
                      onClick={() => dismissToast(toast.id)}
                    >
                      상세 보기
                    </a>
                    {consultation.canClaim ? (
                      <button
                        className="consultation-alert-claim"
                        disabled={toast.claimStatus === "claiming"}
                        onClick={() => void claimConsultationFromToast(toast)}
                        type="button"
                      >
                        {toast.claimStatus === "claiming"
                          ? "등록 중…"
                          : toast.claimStatus === "failed"
                            ? "상담하기 재시도"
                            : "상담하기"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  className="consultation-alert-timer"
                />
              </article>
            );
          })}
        </aside>
      ) : null}
      <PhoneAftercareDialog
        callId={aftercareCallId}
        staffName={staffDisplayName}
        onClose={() => setAftercareCallId(null)}
        onSaved={() => {
          if (aftercareCallId) {
            window.sessionStorage.setItem(
              `lawand:phone-aftercare-saved:${aftercareCallId}`,
              "saved",
            );
          }
          setAftercareCallId(null);
          void refresh();
          void refreshCallActivities();
          void refreshCurrentDeskCalls();
        }}
        open={Boolean(aftercareCallId)}
      />
    </>
  );
}
