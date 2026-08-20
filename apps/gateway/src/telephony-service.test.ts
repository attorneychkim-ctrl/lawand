import assert from "node:assert/strict";
import test from "node:test";

import {
  automaticCallbackScheduleText,
  answerableInboundCallForActor,
  canResolvePhoneDeskFinalParticipant,
  canonicalizePhoneDeskObservedCalls,
  desktopCallNotificationObservation,
  desktopCallNotificationTargetLegId,
  externalInboundNotificationTargetUserIds,
  internalCallNotificationCallers,
  isCentrexInboundAnswerDeliveryDelayed,
  isPhoneDeskAftercareWritableState,
  isStaleOneSidedInternalCall,
  legalFriendsResidenceRegion,
  phoneDeskItemAssignees,
  phoneDeskItemMatchesAssignee,
  phoneDeskItemMatchesFilter,
  phoneDeskTransferConfirmationDutyTargetUserIds,
  retainHigherPriorityPhoneCustomerMatch,
  shouldAutoOpenConnectedAftercare,
  staffPhoneCustomerMatches,
  type PhoneCustomerMatch,
} from "./telephony-service.js";

test("내선·호전환·복귀는 해당 leg의 안정적인 관측 ID만 알림 근거로 쓴다", () => {
  const observations = [
    {
      id: "outbound-ring",
      legId: "caller-leg",
      observationType: "ringing" as const,
      direction: "outbound" as const,
      occurredAt: new Date("2026-08-20T01:00:00.000Z"),
    },
    {
      id: "inbound-ring",
      legId: "target-leg",
      observationType: "ringing" as const,
      direction: "inbound" as const,
      occurredAt: new Date("2026-08-20T01:00:01.000Z"),
    },
    {
      id: "target-ended",
      legId: "target-leg",
      observationType: "ended" as const,
      direction: null,
      occurredAt: new Date("2026-08-20T01:00:02.000Z"),
    },
  ];

  assert.equal(
    desktopCallNotificationObservation({
      kind: "internal_inbound",
      relationToLegId: null,
      observations,
    })?.id,
    "inbound-ring",
  );
  assert.equal(
    desktopCallNotificationObservation({
      kind: "transferred_customer",
      relationToLegId: "target-leg",
      observations,
    })?.id,
    "inbound-ring",
  );
  assert.equal(
    desktopCallNotificationObservation({
      kind: "transferred_customer",
      relationToLegId: "other-leg",
      observations,
    }),
    null,
  );
  assert.equal(
    desktopCallNotificationObservation({
      kind: "transfer_returned",
      relationToLegId: "target-leg",
      observations,
    })?.id,
    "target-ended",
  );
  assert.equal(
    desktopCallNotificationTargetLegId({
      kind: "transfer_returned",
      observationLegId: "target-leg",
      relationFromLegId: "original-customer-leg",
    }),
    "original-customer-leg",
  );
});

test("담당자 연결 요청 자동문자는 한국 시간의 30분 일정과 담당자를 고정 형식으로 붙인다", () => {
  assert.equal(
    automaticCallbackScheduleText(
      new Date("2026-08-20T01:30:00.000Z"),
      "방한솔",
    ),
    "재연락 일정 : 2026-08-20 (목), 10:30 ~ 11:00, 담당자 방한솔",
  );
});

test("종료 고객 leg만 남은 확인 필요 통화는 2분 뒤 직원이 수동 확정할 수 있다", () => {
  const resolutionAt = new Date("2026-08-14T07:45:00.000Z");
  const staleTransfer = {
    scope: "external" as const,
    state: "needs_confirmation" as const,
    correlationStatus: "needs_confirmation" as const,
    hasEndedCustomerLeg: true,
    hasActiveCustomerLeg: false,
    lastEventAt: new Date("2026-08-14T07:42:57.000Z"),
    resolutionAt,
  };

  assert.equal(canResolvePhoneDeskFinalParticipant(staleTransfer), true);
  assert.equal(
    canResolvePhoneDeskFinalParticipant({
      ...staleTransfer,
      lastEventAt: new Date("2026-08-14T07:43:00.001Z"),
    }),
    false,
  );
  assert.equal(
    canResolvePhoneDeskFinalParticipant({
      ...staleTransfer,
      hasActiveCustomerLeg: true,
    }),
    false,
  );
  assert.equal(
    canResolvePhoneDeskFinalParticipant({
      ...staleTransfer,
      state: "ended",
      lastEventAt: resolutionAt,
    }),
    true,
  );
});

test("호전환 확인 배지는 통화 참여자·회선 소유자·고객 담당자에게만 표시한다", () => {
  const activeStaffUserIds = new Set([
    "staff-participant",
    "staff-line-owner",
    "staff-customer-owner",
    "staff-admin",
  ]);
  assert.deepEqual(
    phoneDeskTransferConfirmationDutyTargetUserIds({
      participantUserIds: ["staff-participant", "staff-inactive"],
      endpointOwnerUserIds: ["staff-line-owner", "staff-participant"],
      customerMatch: {
        source: "consultation",
        consultation: {
          id: "consultation-1",
          publicReceiptCode: "TEST-1",
          displayName: "확인 고객",
          state: "assigned",
          firstRequestedAt: "2026-08-20T01:00:00.000Z",
          lastRequestedAt: "2026-08-20T01:00:00.000Z",
          assigneeUserId: "staff-customer-owner",
          assigneeDisplayName: "고객 담당자",
        },
      },
      activeStaffUserIds,
      fallbackAdminUserIds: ["staff-admin"],
    }),
    ["staff-participant", "staff-line-owner", "staff-customer-owner"],
  );
});

test("호전환 관련자를 해석할 수 없는 건만 활성 관리자에게 안전망 배지를 표시한다", () => {
  assert.deepEqual(
    phoneDeskTransferConfirmationDutyTargetUserIds({
      participantUserIds: [null, "staff-inactive"],
      endpointOwnerUserIds: [],
      customerMatch: null,
      activeStaffUserIds: new Set(["staff-admin"]),
      fallbackAdminUserIds: ["staff-admin"],
    }),
    ["staff-admin"],
  );
});

test("상대 leg 없는 내선만 3분 뒤 확인 필요 대상으로 낮춘다", () => {
  const snapshotAt = new Date("2026-08-14T01:10:00.000Z");
  assert.equal(
    isStaleOneSidedInternalCall({
      scope: "internal",
      state: "connected",
      lastEventAt: new Date("2026-08-14T01:06:59.999Z"),
      activeLegCount: 1,
      snapshotAt,
    }),
    true,
  );
  assert.equal(
    isStaleOneSidedInternalCall({
      scope: "internal",
      state: "connected",
      lastEventAt: new Date("2026-08-14T01:00:00.000Z"),
      activeLegCount: 2,
      snapshotAt,
    }),
    false,
  );
  assert.equal(
    isStaleOneSidedInternalCall({
      scope: "external",
      state: "connected",
      lastEventAt: new Date("2026-08-14T01:00:00.000Z"),
      activeLegCount: 1,
      snapshotAt,
    }),
    false,
  );
});

test("내선 수신 알림은 수신 leg의 상대 내선으로 발신 직원 프로필을 즉시 해석한다", () => {
  const directory = [
    {
      extension: "4591",
      staffUserId: "staff-caller",
      displayName: "김로앤",
      organizationKey: "lawand",
      organizationName: "법무법인 로앤",
      regionKey: "seoul",
      regionName: "서울",
      department: "상담팀",
      jobTitle: "대리",
    },
  ];

  assert.deepEqual(
    internalCallNotificationCallers(
      [
        {
          direction: "inbound",
          extension: "1208",
          remoteExtension: "4591",
        },
      ],
      directory,
    ),
    [
      {
        staffUserId: "staff-caller",
        displayName: "김로앤",
        extension: "4591",
        organization: { key: "lawand", name: "법무법인 로앤" },
        region: { key: "seoul", name: "서울" },
        department: "상담팀",
        jobTitle: "대리",
      },
    ],
  );

  assert.equal(
    internalCallNotificationCallers(
      [
        {
          direction: "inbound",
          extension: "1208",
          remoteExtension: "4591",
        },
        {
          direction: "outbound",
          extension: "4591",
          remoteExtension: "1208",
        },
      ],
      directory,
    ).length,
    1,
  );
});

test("등록되지 않은 발신 내선은 직원을 추정하지 않는다", () => {
  assert.deepEqual(
    internalCallNotificationCallers(
      [
        {
          direction: "inbound",
          extension: "1208",
          remoteExtension: "9971",
        },
      ],
      [],
    ),
    [
      {
        staffUserId: null,
        displayName: null,
        extension: "9971",
        organization: null,
        region: null,
        department: null,
        jobTitle: null,
      },
    ],
  );
});

test("후처리는 통화 연결 시점부터 종료 뒤까지 작성할 수 있다", () => {
  assert.equal(isPhoneDeskAftercareWritableState("pending"), false);
  assert.equal(isPhoneDeskAftercareWritableState("ringing"), false);
  assert.equal(isPhoneDeskAftercareWritableState("connected"), true);
  assert.equal(isPhoneDeskAftercareWritableState("ended"), true);
  assert.equal(isPhoneDeskAftercareWritableState("failed"), false);
  assert.equal(isPhoneDeskAftercareWritableState("unknown"), false);
});

test("연결된 외부 통화 후처리 팝업은 실제 회선 소유자나 참여 직원에게만 연다", () => {
  const connected = {
    scope: "external" as const,
    state: "connected" as const,
    actorUserId: "staff-1208",
    currentEndpointOwnerUserIds: ["staff-1208"],
    participantUserIds: ["staff-4425", "staff-1208"],
  };

  assert.equal(shouldAutoOpenConnectedAftercare(connected), true);
  assert.equal(
    shouldAutoOpenConnectedAftercare({
      ...connected,
      actorUserId: "staff-unrelated",
    }),
    false,
  );
  assert.equal(
    shouldAutoOpenConnectedAftercare({ ...connected, state: "ringing" }),
    false,
  );
  assert.equal(
    shouldAutoOpenConnectedAftercare({ ...connected, scope: "internal" }),
    false,
  );
});

test("직원 전체 회선번호는 같은 번호의 직원 정보와 내선으로 식별한다", () => {
  const matches = staffPhoneCustomerMatches([
    {
      lineNumber: "07046074595",
      staffUserId: "staff-4425",
      displayName: "직원 예시",
      extension: "4425",
      department: "송무팀",
      jobTitle: "사원",
    },
    {
      matchPhone: "07046074592",
      lineNumber: "07046074595",
      staffUserId: "staff-4425",
      displayName: "직원 예시",
      extension: "4425",
      department: "송무팀",
      jobTitle: "사원",
    },
    {
      lineNumber: null,
      staffUserId: "staff-unlinked",
      displayName: "미연결 직원",
      extension: null,
      department: "관리팀",
      jobTitle: "사원",
    },
  ]);

  assert.deepEqual(matches.get("07046074595"), {
    source: "staff",
    staffMembers: [
      {
        staffUserId: "staff-4425",
        displayName: "직원 예시",
        lineNumber: "07046074595",
        extension: "4425",
        department: "송무팀",
        jobTitle: "사원",
      },
    ],
  });
  assert.deepEqual(matches.get("07046074592"), matches.get("07046074595"));
  assert.equal(matches.size, 2);
});

test("수신전화 고객 해석은 리걸프렌즈 일치 뒤 전화번호부가 덮어쓰지 못한다", () => {
  const phone = "01011112222";
  const matches = new Map<string, PhoneCustomerMatch>([[phone, null]]);
  const legalFriends = {
    source: "legal_friends" as const,
    clientName: "리걸 최신 고객명",
    cases: [],
  };
  const phonebook = {
    source: "phonebook" as const,
    contact: {
      id: "phonebook-1",
      displayName: "과거 전화번호부 이름",
      originalPhone: phone,
      connectedPhone: null,
    },
  };

  assert.equal(
    retainHigherPriorityPhoneCustomerMatch(matches, phone, legalFriends),
    true,
  );
  assert.equal(
    retainHigherPriorityPhoneCustomerMatch(matches, phone, phonebook),
    false,
  );
  assert.equal(matches.get(phone), legalFriends);
});

test("수신 알림의 받기 버튼은 본인 소유의 받기 가능한 벨에만 노출한다", () => {
  const observedCall = {
    observedCallId: "call-1",
    endpointId: "endpoint-1",
    bridgeId: "bridge-1",
    state: "ringing" as const,
  };
  const input = {
    rootState: "ringing" as const,
    currentEndpointId: "endpoint-1",
    currentEndpointOwnedByActor: true,
    observedCall,
    answerableBridgeIds: new Set(["bridge-1"]),
  };

  assert.equal(answerableInboundCallForActor(input), "call-1");
  assert.equal(
    answerableInboundCallForActor({
      ...input,
      currentEndpointOwnedByActor: false,
    }),
    null,
  );
  assert.equal(
    answerableInboundCallForActor({
      ...input,
      currentEndpointId: "endpoint-picked-up",
    }),
    null,
  );
  assert.equal(
    answerableInboundCallForActor({
      ...input,
      answerableBridgeIds: new Set(),
    }),
    null,
  );
  assert.equal(
    answerableInboundCallForActor({ ...input, rootState: "connected" }),
    null,
  );
});

test("외부 수신전화 알림은 담당 여부와 무관하게 활성 직원 전체를 대상으로 한다", () => {
  assert.deepEqual(
    externalInboundNotificationTargetUserIds([
      { staffUserId: "staff-line-owner" },
      { staffUserId: "staff-customer-owner" },
      { staffUserId: "staff-unrelated" },
      { staffUserId: "staff-unrelated" },
    ]),
    ["staff-line-owner", "staff-customer-owner", "staff-unrelated"],
  );
});

test("같은 root의 U+ 연결 이력과 bridge 장시간 울림은 원장 한 건으로 접는다", () => {
  const items = canonicalizePhoneDeskObservedCalls([
    {
      id: "root-1",
      record: "bridge-timeout",
      connectedAt: null,
      lastEventAt: "2026-08-12T08:13:20.000Z",
      receptionMode: "office_bridge" as const,
      correlationStatus: "needs_confirmation" as const,
    },
    {
      id: "root-1",
      record: "uplus-answered",
      connectedAt: "2026-08-12T08:10:13.000Z",
      lastEventAt: "2026-08-12T08:13:05.000Z",
      receptionMode: "uplus_network" as const,
      correlationStatus: "confirmed" as const,
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.record, "uplus-answered");
  assert.equal(items[0]?.receptionMode, "uplus_network");
  assert.equal(items[0]?.correlationStatus, "needs_confirmation");
});

test("전화데스크 담당자는 전체 결과를 페이지로 자르기 전에 통화 성격별로 판정한다", () => {
  const owner = { staffUserId: "staff-owner", displayName: "회선 담당" };
  const requester = {
    staffUserId: "staff-requester",
    displayName: "ERP 발신자",
  };
  const external = {
    scope: "external" as const,
    clickToCall: null,
    endpointOwners: [owner],
    participants: [],
  };
  const clickToCall = {
    ...external,
    clickToCall: { requestedBy: requester },
  };
  const internal = {
    scope: "internal" as const,
    clickToCall: null,
    endpointOwners: [],
    participants: [
      { staffUserId: "staff-a", displayName: "내선 A" },
      { staffUserId: "staff-b", displayName: "내선 B" },
      { staffUserId: "staff-a", displayName: "내선 A" },
    ],
  };

  assert.deepEqual(phoneDeskItemAssignees(external), [owner]);
  assert.deepEqual(phoneDeskItemAssignees(clickToCall), [requester]);
  assert.equal(
    phoneDeskItemMatchesAssignee(clickToCall, owner.staffUserId),
    false,
  );
  assert.equal(
    phoneDeskItemMatchesAssignee(clickToCall, requester.staffUserId),
    true,
  );
  assert.deepEqual(
    phoneDeskItemAssignees(internal).map((item) => item.staffUserId),
    ["staff-a", "staff-b"],
  );
  assert.equal(phoneDeskItemMatchesAssignee(internal, "staff-b"), true);
});

test("전화데스크 출처 필터는 다른 출처를 섞지 않고 진행 중 상태만 선별한다", () => {
  const inboundEnded = {
    source: "inbound" as const,
    state: "ended" as const,
  };
  const erpOutbound = {
    source: "click_to_call" as const,
    state: "ended" as const,
  };
  const directOutbound = {
    source: "centrex_direct" as const,
    state: "connected" as const,
  };

  assert.equal(phoneDeskItemMatchesFilter(inboundEnded, "all"), true);
  assert.equal(phoneDeskItemMatchesFilter(inboundEnded, "inbound"), true);
  assert.equal(phoneDeskItemMatchesFilter(inboundEnded, "click_to_call"), false);
  assert.equal(phoneDeskItemMatchesFilter(inboundEnded, "centrex_direct"), false);
  assert.equal(phoneDeskItemMatchesFilter(inboundEnded, "active"), false);
  assert.equal(phoneDeskItemMatchesFilter(erpOutbound, "click_to_call"), true);
  assert.equal(phoneDeskItemMatchesFilter(directOutbound, "centrex_direct"), true);
  assert.equal(phoneDeskItemMatchesFilter(directOutbound, "active"), true);
});

test("리걸프렌즈 거주지는 상세 주소를 노출하지 않고 광역 지역으로만 정규화한다", () => {
  assert.equal(legalFriendsResidenceRegion("서울특별시 강남구"), "seoul");
  assert.equal(legalFriendsResidenceRegion("강원특별자치도 원주시"), "gangwon");
  assert.equal(legalFriendsResidenceRegion("전라북도 전주시"), "jeonbuk");
  assert.equal(legalFriendsResidenceRegion("해외 거주"), "overseas_or_other");
  assert.equal(legalFriendsResidenceRegion("주소 미확인"), null);
  assert.equal(legalFriendsResidenceRegion(null), null);
});

test("늦게 전달된 수신 이벤트에는 전화 받기 명령을 노출하지 않는다", () => {
  assert.equal(
    isCentrexInboundAnswerDeliveryDelayed({
      answerableBridge: true,
      occurredAt: new Date("2026-08-12T01:12:06.231Z"),
      receivedAt: new Date("2026-08-12T01:13:14.558Z"),
    }),
    true,
  );
  assert.equal(
    isCentrexInboundAnswerDeliveryDelayed({
      answerableBridge: true,
      occurredAt: new Date("2026-08-12T01:12:06.231Z"),
      receivedAt: new Date("2026-08-12T01:12:07.000Z"),
    }),
    false,
  );
});

test("받기 가능한 bridge인데 수신 근거가 없으면 안전하게 버튼을 숨긴다", () => {
  assert.equal(
    isCentrexInboundAnswerDeliveryDelayed({
      answerableBridge: true,
      occurredAt: null,
      receivedAt: null,
    }),
    true,
  );
  assert.equal(
    isCentrexInboundAnswerDeliveryDelayed({
      answerableBridge: false,
      occurredAt: null,
      receivedAt: null,
    }),
    false,
  );
});
