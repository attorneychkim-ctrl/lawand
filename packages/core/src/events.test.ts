import assert from "node:assert/strict";
import test from "node:test";

import { consultationAttributionInputSchema } from "./attribution.js";
import {
  alimtalkAssignmentNotificationRequestedEventSchema,
  alimtalkRequestNotificationRequestedEventSchema,
  consultationAssignedEventSchema,
  consultationAssignmentTransferredEventSchema,
  consultationGroupUpdatedEventSchema,
  consultationRequestUpdatedEventSchema,
  consultationRequestedEventSchema,
  consultationSoftDeletedEventSchema,
  LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
  LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
  legalfriendsInvalidationRequestedEventSchema,
  legalfriendsManagerChangeRequestedEventSchema,
  legalfriendsRestorationRequestedEventSchema,
  legalfriendsRegistrationRequestedEventSchema,
  telephonyCallRequestedEventSchema,
  telephonyMessageRequestedEventSchema,
} from "./events.js";

const requestedEvent = {
  eventId: "01984c7d-8500-7000-8000-000000000010",
  eventType: "consultation.requested",
  eventVersion: 1,
  occurredAt: "2026-07-27T09:30:00.000Z",
  producer: "lawand.gateway",
  correlationId: "01984c7d-8500-7000-8000-000000000001",
  data: {
    consultationId: "01984c7d-8500-7000-8000-000000000001",
    requestId: "01984c7d-8500-7000-8000-000000000002",
    intakeRef:
      "consultation_requests/01984c7d-8500-7000-8000-000000000002",
    attributionRef:
      "consultation_attributions/01984c7d-8500-7000-8000-000000000004",
    mode: "quick",
    privacyNoticeVersion: "2026-07-27",
    privacyBasis: "explicit_consent",
    consentAgreedAt: "2026-07-27T09:29:50.000Z",
    dedupeOutcome: "new",
  },
} as const;

test("consultation.requested v1은 개인정보 없는 참조 계약을 허용한다", () => {
  assert.deepEqual(consultationRequestedEventSchema.parse(requestedEvent), requestedEvent);
});

test("consultation.requested에 전화번호 같은 계약 외 필드를 넣으면 거부한다", () => {
  const unsafeEvent = {
    ...requestedEvent,
    data: {
      ...requestedEvent.data,
      phone: "01012345678",
    },
  };

  assert.equal(consultationRequestedEventSchema.safeParse(unsafeEvent).success, false);
});

test("상담 재요청은 배정 전후 구분과 요청 참조만 남긴다", () => {
  const event = {
    ...requestedEvent,
    eventId: "01984c7d-8500-7000-8000-000000000019",
    eventType: "consultation.request.updated",
    data: {
      consultationId: requestedEvent.data.consultationId,
      requestId: requestedEvent.data.requestId,
      intakeRef: requestedEvent.data.intakeRef,
      attributionRef: requestedEvent.data.attributionRef,
      updateReason: "repeat_request",
      repeatStage: "after_assignment",
      dedupeOutcome: "repeat_assigned",
    },
  } as const;

  assert.deepEqual(consultationRequestUpdatedEventSchema.parse(event), event);
  assert.equal(
    consultationRequestUpdatedEventSchema.safeParse({
      ...event,
      data: { ...event.data, phone: "01012345678" },
    }).success,
    false,
  );
});

test("직원 직접등록 소프트삭제 이벤트는 상담·관리자 식별자만 남긴다", () => {
  const event = {
    eventId: "01984c7d-8500-7000-8000-000000000019",
    eventType: "consultation.soft_deleted",
    eventVersion: 1,
    occurredAt: "2026-08-13T09:00:00+09:00",
    producer: "lawand.gateway",
    correlationId: requestedEvent.data.consultationId,
    data: {
      consultationId: requestedEvent.data.consultationId,
      deletedByUserId: "01984c7d-8500-7000-8000-000000000006",
      deletionKind: "staff_manual_soft_delete",
    },
  } as const;
  assert.deepEqual(consultationSoftDeletedEventSchema.parse(event), event);
  assert.equal(
    consultationSoftDeletedEventSchema.safeParse({
      ...event,
      data: { ...event.data, phone: "01012345678" },
    }).success,
    false,
  );
});

test("상담 묶음 변경 이벤트는 개인정보 없이 묶음 갱신 신호만 남긴다", () => {
  const event = {
    eventId: "01984c7d-8500-7000-8000-000000000020",
    eventType: "consultation.group.updated",
    eventVersion: 1,
    occurredAt: "2026-08-13T09:00:00+09:00",
    producer: "lawand.gateway",
    correlationId: requestedEvent.data.consultationId,
    data: {
      consultationId: requestedEvent.data.consultationId,
      groupId: "01984c7d-8500-7000-8000-000000000021",
      action: "linked",
      actorUserId: "01984c7d-8500-7000-8000-000000000006",
    },
  } as const;

  assert.deepEqual(consultationGroupUpdatedEventSchema.parse(event), event);
  assert.equal(
    consultationGroupUpdatedEventSchema.safeParse({
      ...event,
      data: { ...event.data, phone: "01012345678" },
    }).success,
    false,
  );
});

test("카카오 최초 메시지는 동의 시각을 꾸미지 않고 채널 시작 근거를 남긴다", () => {
  const kakaoEvent = {
    ...requestedEvent,
    data: {
      ...requestedEvent.data,
      privacyBasis: "customer_initiated_channel_message",
      consentAgreedAt: undefined,
    },
  };

  assert.equal(
    consultationRequestedEventSchema.safeParse(kakaoEvent).success,
    true,
  );
  assert.equal(
    consultationRequestedEventSchema.safeParse({
      ...kakaoEvent,
      data: {
        ...kakaoEvent.data,
        consentAgreedAt: requestedEvent.data.consentAgreedAt,
      },
    }).success,
    false,
  );
});

test("홈페이지 카카오 진입 클릭은 실제 채널 메시지와 다른 처리 근거를 남긴다", () => {
  const event = {
    eventId: "01984c7d-8500-7000-8000-000000000010",
    eventType: "consultation.requested",
    eventVersion: 1,
    occurredAt: "2026-07-30T09:00:00+09:00",
    producer: "lawand.gateway",
    correlationId: "01984c7d-8500-7000-8000-000000000011",
    data: {
      consultationId: "01984c7d-8500-7000-8000-000000000011",
      requestId: "01984c7d-8500-7000-8000-000000000012",
      intakeRef:
        "consultation_requests/01984c7d-8500-7000-8000-000000000012",
      mode: "quick",
      privacyNoticeVersion: "2026-07-30.kakao-homepage-entry.1",
      privacyBasis: "customer_initiated_channel_entry",
      dedupeOutcome: "new",
    },
  };
  assert.equal(
    consultationRequestedEventSchema.safeParse(event).success,
    true,
  );
  assert.equal(
    consultationRequestedEventSchema.safeParse({
      ...event,
      data: {
        ...event.data,
        consentAgreedAt: "2026-07-30T09:00:00+09:00",
      },
    }).success,
    false,
  );
});

test("네이버 예약은 고객이 직접 예약한 처리 근거를 남긴다", () => {
  const event = {
    ...requestedEvent,
    data: {
      ...requestedEvent.data,
      privacyNoticeVersion: "2026-07-31.naver-booking.1",
      privacyBasis: "customer_initiated_booking",
      consentAgreedAt: undefined,
    },
  };

  assert.equal(
    consultationRequestedEventSchema.safeParse(event).success,
    true,
  );
});

test("상담 접수 알림톡은 개인정보 없이 접수 참조와 템플릿 용도만 남긴다", () => {
  assert.equal(
    alimtalkRequestNotificationRequestedEventSchema.safeParse({
      ...requestedEvent,
      eventId: "01984c7d-8500-7000-8000-000000000011",
      eventType: "alimtalk.consultation.request_notification.requested",
      causationId: requestedEvent.eventId,
      data: {
        consultationId: requestedEvent.data.consultationId,
        requestId: requestedEvent.data.requestId,
        intakeRef: requestedEvent.data.intakeRef,
        templatePurpose: "consultation_requested",
      },
    }).success,
    true,
  );
});

const assignmentReference = {
  consultationId: "01984c7d-8500-7000-8000-000000000001",
  requestId: "01984c7d-8500-7000-8000-000000000002",
  assignmentId: "01984c7d-8500-7000-8000-000000000005",
  assignmentRef:
    "consultation_assignments/01984c7d-8500-7000-8000-000000000005",
  intakeRef: "consultation_requests/01984c7d-8500-7000-8000-000000000002",
} as const;

const assignmentEnvelope = {
  eventId: "01984c7d-8500-7000-8000-000000000010",
  eventVersion: 1,
  occurredAt: "2026-07-27T09:30:00.000Z",
  producer: "lawand.gateway",
  correlationId: "01984c7d-8500-7000-8000-000000000001",
} as const;

test("담당 배정은 업무 이벤트와 외부 실행 요청을 개인정보 없는 참조로 남긴다", () => {
  assert.equal(
    consultationAssignedEventSchema.safeParse({
      ...assignmentEnvelope,
      eventType: "consultation.assigned",
      data: {
        ...assignmentReference,
        assigneeUserId: "01984c7d-8500-7000-8000-000000000006",
        assigneeMembershipId: "01984c7d-8500-7000-8000-000000000007",
        assignmentMethod: "self_claim",
      },
    }).success,
    true,
  );
  assert.equal(
    legalfriendsRegistrationRequestedEventSchema.safeParse({
      ...assignmentEnvelope,
      eventType: "legalfriends.consultation.registration.requested",
      causationId: "01984c7d-8500-7000-8000-000000000011",
      data: assignmentReference,
    }).success,
    true,
  );
  assert.equal(
    alimtalkAssignmentNotificationRequestedEventSchema.safeParse({
      ...assignmentEnvelope,
      eventType:
        "alimtalk.consultation.assignment_notification.requested",
      causationId: "01984c7d-8500-7000-8000-000000000011",
      data: {
        ...assignmentReference,
        templatePurpose: "consultation_assigned",
      },
    }).success,
    true,
  );
});

test("외부 실행 요청 payload에 전화번호를 직접 넣으면 거부한다", () => {
  assert.equal(
    legalfriendsRegistrationRequestedEventSchema.safeParse({
      ...assignmentEnvelope,
      eventType: "legalfriends.consultation.registration.requested",
      data: {
        ...assignmentReference,
        phone: "01012345678",
      },
    }).success,
    false,
  );
});

test("배정 전 카카오 무효 처리는 고정 무효 담당자로 신건 등록을 요청한다", () => {
  assert.equal(
    legalfriendsRegistrationRequestedEventSchema.safeParse({
      ...assignmentEnvelope,
      eventType: "legalfriends.consultation.registration.requested",
      data: {
        consultationId: assignmentEnvelope.correlationId,
        requestId: assignmentReference.requestId,
        intakeRef: assignmentReference.intakeRef,
        registrationTarget: "invalid_manager",
        requestedByUserId: "01984c7d-8500-7000-8000-000000000006",
        targetManagerExternalAccountId:
          LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
        targetManagerMemberIdx: LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
      },
    }).success,
    true,
  );
});

test("리걸프렌즈 무효 처리는 고정 담당자와 사건 연결 참조만 허용한다", () => {
  const invalidationEvent = {
    ...assignmentEnvelope,
    eventType: "legalfriends.consultation.invalidation.requested",
    data: {
      consultationId: assignmentEnvelope.correlationId,
      caseLinkRef:
        `legalfriends_case_links/${assignmentEnvelope.correlationId}`,
      requestedByUserId: "01984c7d-8500-7000-8000-000000000006",
      targetManagerExternalAccountId:
        LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
      targetManagerMemberIdx: LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
    },
  } as const;

  assert.equal(
    legalfriendsInvalidationRequestedEventSchema.safeParse(
      invalidationEvent,
    ).success,
    true,
  );
  assert.equal(
    legalfriendsInvalidationRequestedEventSchema.safeParse({
      ...invalidationEvent,
      data: {
        ...invalidationEvent.data,
        targetManagerExternalAccountId: "arbitrary_manager",
      },
    }).success,
    false,
  );
});

test("무효 상담 복원 이벤트는 기존 배정이 없는 경우도 명시적으로 표현한다", () => {
  assert.equal(
    legalfriendsRestorationRequestedEventSchema.safeParse({
      ...assignmentEnvelope,
      eventType: "legalfriends.consultation.restoration.requested",
      data: {
        consultationId: assignmentEnvelope.correlationId,
        caseLinkRef:
          `legalfriends_case_links/${assignmentEnvelope.correlationId}`,
        requestedByUserId: "01984c7d-8500-7000-8000-000000000006",
        targetAssigneeUserId: "01984c7d-8500-7000-8000-000000000006",
        targetAssigneeMembershipId:
          "01984c7d-8500-7000-8000-000000000007",
        targetAssignmentId: "01984c7d-8500-7000-8000-000000000008",
        previousAssignmentId: null,
        previousAssigneeUserId: null,
        previousAssigneeMembershipId: null,
        targetManagerExternalAccountId: "lawandfirm_s",
        targetManagerMemberIdx: 138,
      },
    }).success,
    true,
  );
});

test("담당자 변경 요청과 완료 이벤트는 개인정보 없이 직원·원장 참조만 남긴다", () => {
  const transferData = {
    consultationId: assignmentEnvelope.correlationId,
    transferId: "01984c7d-8500-7000-8000-000000000040",
    transferRef:
      "consultation_assignment_transfers/01984c7d-8500-7000-8000-000000000040",
    assignmentId: assignmentReference.assignmentId,
    assignmentRef: assignmentReference.assignmentRef,
    caseLinkRef:
      "legalfriends_case_links/01984c7d-8500-7000-8000-000000000001",
    previousAssigneeUserId:
      "01984c7d-8500-7000-8000-000000000006",
    targetAssigneeUserId: "01984c7d-8500-7000-8000-000000000007",
    targetAssigneeMembershipId:
      "01984c7d-8500-7000-8000-000000000008",
    requestedByUserId: "01984c7d-8500-7000-8000-000000000006",
    reason: "expertise",
  } as const;
  const managerChangeEvent = {
    ...assignmentEnvelope,
    eventId: "01984c7d-8500-7000-8000-000000000041",
    eventType:
      "legalfriends.consultation.manager_change.requested",
    data: {
      ...transferData,
      targetManagerExternalAccountId: "lawandfirm_s123",
      targetManagerMemberIdx: 321,
    },
  } as const;
  assert.equal(
    legalfriendsManagerChangeRequestedEventSchema.safeParse(
      managerChangeEvent,
    ).success,
    true,
  );
  assert.equal(
    legalfriendsManagerChangeRequestedEventSchema.safeParse({
      ...managerChangeEvent,
      data: { ...managerChangeEvent.data, customerPhone: "01012345678" },
    }).success,
    false,
  );
  assert.equal(
    consultationAssignmentTransferredEventSchema.safeParse({
      ...assignmentEnvelope,
      eventId: "01984c7d-8500-7000-8000-000000000042",
      eventType: "consultation.assignment.transferred",
      data: transferData,
    }).success,
    true,
  );
});

test("클릭투콜 요청은 전화번호 대신 통화·상담·회선 참조만 남긴다", () => {
  const callEvent = {
    ...assignmentEnvelope,
    eventType: "telephony.call.requested",
    data: {
      callId: "01984c7d-8500-7000-8000-000000000020",
      consultationId: assignmentEnvelope.correlationId,
      requestId: "01984c7d-8500-7000-8000-000000000002",
      endpointId: "01984c7d-8500-7000-8000-000000000021",
      staffUserId: "01984c7d-8500-7000-8000-000000000006",
      provider: "centrex",
      direction: "outbound",
      command: "clickdial",
    },
  } as const;

  assert.equal(
    telephonyCallRequestedEventSchema.safeParse(callEvent).success,
    true,
  );
  assert.equal(
    telephonyCallRequestedEventSchema.safeParse({
      ...callEvent,
      data: { ...callEvent.data, phone: "01012345678" },
    }).success,
    false,
  );
});

test("고객찾기 클릭투콜도 전화번호 없이 리걸프렌즈 식별자만 남긴다", () => {
  const callEvent = {
    ...assignmentEnvelope,
    eventType: "telephony.call.requested",
    data: {
      callId: "01984c7d-8500-7000-8000-000000000022",
      targetSource: "legal_friends_directory",
      directoryClientIdx: 123,
      directoryCaseIdx: 456,
      endpointId: "01984c7d-8500-7000-8000-000000000021",
      staffUserId: "01984c7d-8500-7000-8000-000000000006",
      provider: "centrex",
      direction: "outbound",
      command: "clickdial",
    },
  } as const;

  assert.equal(
    telephonyCallRequestedEventSchema.safeParse(callEvent).success,
    true,
  );
  assert.equal(
    telephonyCallRequestedEventSchema.safeParse({
      ...callEvent,
      data: { ...callEvent.data, phone: "01012345678" },
    }).success,
    false,
  );
});

test("문자 발송 이벤트는 전화번호와 본문 대신 암호화 원장 참조만 남긴다", () => {
  const messageEvent = {
    ...assignmentEnvelope,
    eventType: "telephony.message.requested",
    data: {
      messageId: "01984c7d-8500-7000-8000-000000000030",
      consultationId: assignmentEnvelope.correlationId,
      requestId: "01984c7d-8500-7000-8000-000000000002",
      endpointId: "01984c7d-8500-7000-8000-000000000021",
      staffUserId: "01984c7d-8500-7000-8000-000000000006",
      provider: "centrex",
      channel: "sms",
      command: "smssend",
      contentRef:
        "telephony_messages/01984c7d-8500-7000-8000-000000000030/body",
    },
  } as const;

  assert.equal(
    telephonyMessageRequestedEventSchema.safeParse(messageEvent).success,
    true,
  );
  assert.equal(
    telephonyMessageRequestedEventSchema.safeParse({
      ...messageEvent,
      data: {
        ...messageEvent.data,
        provider: "solapi",
        channel: "mms",
        command: "send-many",
      },
    }).success,
    true,
  );
  assert.equal(
    telephonyMessageRequestedEventSchema.safeParse({
      ...messageEvent,
      data: { ...messageEvent.data, provider: "solapi" },
    }).success,
    false,
  );
  assert.equal(
    telephonyMessageRequestedEventSchema.safeParse({
      ...messageEvent,
      data: {
        ...messageEvent.data,
        phone: "01012345678",
        body: "상담 안내",
      },
    }).success,
    false,
  );
  assert.equal(
    telephonyMessageRequestedEventSchema.safeParse({
      ...messageEvent,
      correlationId: "01984c7d-8500-7000-8000-000000000030",
      data: {
        messageId: "01984c7d-8500-7000-8000-000000000030",
        targetSource: "legal_friends_directory",
        directoryClientIdx: 123,
        directoryCaseIdx: 456,
        endpointId: "01984c7d-8500-7000-8000-000000000021",
        staffUserId: "01984c7d-8500-7000-8000-000000000006",
        provider: "centrex",
        channel: "sms",
        command: "smssend",
        contentRef:
          "telephony_messages/01984c7d-8500-7000-8000-000000000030/body",
      },
    }).success,
    true,
  );
  const manualMessageEvent = {
    ...messageEvent,
    correlationId: "01984c7d-8500-7000-8000-000000000031",
    data: {
      messageId: "01984c7d-8500-7000-8000-000000000030",
      targetSource: "manual",
      manualContactId: "01984c7d-8500-7000-8000-000000000031",
      endpointId: "01984c7d-8500-7000-8000-000000000021",
      staffUserId: "01984c7d-8500-7000-8000-000000000006",
      provider: "centrex",
      channel: "sms",
      command: "smssend",
      contentRef:
        "telephony_messages/01984c7d-8500-7000-8000-000000000030/body",
    },
  } as const;
  assert.equal(
    telephonyMessageRequestedEventSchema.safeParse(manualMessageEvent).success,
    true,
  );
  assert.equal(
    telephonyMessageRequestedEventSchema.safeParse({
      ...manualMessageEvent,
      data: {
        ...manualMessageEvent.data,
        provider: "solapi",
        channel: "mms",
        command: "send-many",
      },
    }).success,
    true,
  );
  assert.equal(
    telephonyMessageRequestedEventSchema.safeParse({
      ...manualMessageEvent,
      data: { ...manualMessageEvent.data, phone: "01012345678" },
    }).success,
    false,
  );
});

test("귀속 입력은 허용된 광고값과 내부 경로만 받는다", () => {
  const result = consultationAttributionInputSchema.safeParse({
    journeySessionId: "01984c7d-8500-7000-8000-000000000003",
    startedAt: "2026-07-27T09:20:00.000Z",
    firstLandingPath: "/bank/personal-rehabilitation/eligibility",
    referrerHost: "www.google.com",
    source: {
      adpilotClickId: "ap-click-123",
      externalCampaignId: "campaign-1",
      externalAdGroupId: "adgroup-7",
      externalKeywordId: "keyword-42",
      matchedKeyword: "개인회생",
      matchType: "exact",
    },
    journey: [
      {
        path: "/bank/personal-rehabilitation/eligibility",
        visitedAt: "2026-07-27T09:20:00.000Z",
        pageKey: "rehabilitation-eligibility",
        pageVersion: "1",
      },
    ],
    consultationCta: {
      path: "/bank/personal-rehabilitation/eligibility",
      placement: "mobile-sticky",
      clickedAt: "2026-07-27T09:25:00.000Z",
    },
    submittedFromPath: "/bank/consultation",
  });

  assert.equal(result.success, true);
});

test("전체 URL이나 정의되지 않은 검색어 원문 필드는 귀속 입력에서 거부한다", () => {
  const result = consultationAttributionInputSchema.safeParse({
    journeySessionId: "01984c7d-8500-7000-8000-000000000003",
    startedAt: "2026-07-27T09:20:00.000Z",
    firstLandingPath: "https://lawandfirm.com/bank?phone=01012345678",
    source: {
      rawSearchQuery: "개인회생 전화번호 포함 원문",
    },
    journey: [],
    submittedFromPath: "/bank/consultation",
  });

  assert.equal(result.success, false);
});
