import assert from "node:assert/strict";
import test from "node:test";

import {
  centrexBridgeAnswerCommandSchema,
  centrexBridgeCommandResultSchema,
  centrexBridgeEventSchema,
  centrexBridgeResetCommandSchema,
  centrexMessageByteLength,
  centrexMessageKind,
  legalFriendsDirectoryClickToCallSchema,
  legalFriendsDirectoryConsultationCreateSchema,
  legalFriendsDirectoryMessageSendSchema,
  messageTemplateCreateSchema,
  messageTemplateUpdateSchema,
  phoneDeskAftercareSaveSchema,
  phoneDeskCallResolutionSchema,
  renderMessageTemplate,
  telephonyCallDispositionConfirmationSchema,
  telephonyMessageSendSchema,
} from "./telephony.js";

test("고객찾기 발신은 양의 고객·사건 식별자만 받는다", () => {
  assert.deepEqual(
    legalFriendsDirectoryClickToCallSchema.parse({ clientIdx: 10, caseIdx: 20 }),
    { clientIdx: 10, caseIdx: 20 },
  );
  assert.equal(
    legalFriendsDirectoryClickToCallSchema.safeParse({
      clientIdx: 10,
      caseIdx: 20,
      phone: "01012345678",
    }).success,
    false,
  );
  assert.equal(
    legalFriendsDirectoryMessageSendSchema.safeParse({
      clientIdx: 10,
      caseIdx: 20,
      idempotencyKey: "01980000-0000-7000-8000-000000000042",
      templateId: null,
      body: "고객 안내 문자",
    }).success,
    true,
  );
  assert.equal(
    legalFriendsDirectoryMessageSendSchema.safeParse({
      clientIdx: 10,
      caseIdx: 20,
      phone: "01012345678",
      idempotencyKey: "01980000-0000-7000-8000-000000000042",
      templateId: null,
      body: "고객 안내 문자",
    }).success,
    false,
  );
});

test("고객찾기 신건상담은 수정된 고객정보와 소개 여부를 엄격히 검증한다", () => {
  const input = {
    clientIdx: 10,
    caseIdx: 20,
    idempotencyKey: "01980000-0000-7000-8000-000000000043",
    customerName: " 새 고객 ",
    phone: "010-1234-5678",
    residenceRegion: "seoul",
    caseType: 2,
    isReferral: true,
  } as const;
  assert.deepEqual(legalFriendsDirectoryConsultationCreateSchema.parse(input), {
    ...input,
    customerName: "새 고객",
    phone: "01012345678",
  });
  assert.equal(
    legalFriendsDirectoryConsultationCreateSchema.safeParse({
      ...input,
      phone: "02-123-4567",
    }).success,
    false,
  );
  assert.equal(
    legalFriendsDirectoryConsultationCreateSchema.safeParse({
      ...input,
      caseType: 4,
    }).success,
    false,
  );
});

test("센트릭스 SMS/LMS 바이트와 템플릿 변수를 검증한다", () => {
  assert.equal(centrexMessageByteLength("ABC 가나다😀"), 3 + 1 + 6 + 4);
  assert.equal(centrexMessageKind("가".repeat(40)), "sms");
  assert.equal(centrexMessageKind("가".repeat(41)), "lms");
  assert.equal(centrexMessageKind("가".repeat(361)), "too_long");
  assert.equal(
    messageTemplateCreateSchema.safeParse({
      name: "부재 안내",
      body: "{{고객명}}님, {{담당자명}}입니다. 접수번호 {{접수번호}}",
    }).success,
    true,
  );
  assert.equal(
    messageTemplateCreateSchema.safeParse({
      name: "잘못된 변수",
      body: "{{사건번호}}를 확인해 주세요.",
    }).success,
    false,
  );
  assert.equal(
    messageTemplateCreateSchema.safeParse({
      name: "명함 안내",
      body: "{{고객명}}님, 담당자 명함을 보내드립니다.",
      image: {
        originalName: "명함.jpg",
        fileBase64: "AAEC",
      },
    }).success,
    true,
  );
  assert.equal(
    messageTemplateCreateSchema.safeParse({
      name: "잘못된 이미지",
      body: "이미지 안내",
      image: { originalName: "명함.png", fileBase64: "data:image/png;base64,AAEC" },
    }).success,
    false,
  );
  assert.equal(
    messageTemplateUpdateSchema.safeParse({
      name: "부재 안내",
      body: "부재 안내입니다.",
      isActive: false,
    }).success,
    false,
  );
  assert.equal(
    renderMessageTemplate("{{고객명}}님, {{담당자명}}입니다.", {
      "{{고객명}}": "홍길동",
      "{{담당자명}}": "김상담",
      "{{접수번호}}": "LA-260810-ABCDEFGH",
    }),
    "홍길동님, 김상담입니다.",
  );
  assert.equal(
    telephonyMessageSendSchema.safeParse({
      idempotencyKey: "01980000-0000-7000-8000-000000000041",
      templateId: null,
      body: "{{고객명}}님께 보내는 미치환 문구",
    }).success,
    false,
  );
});

test("통화 종료 결과는 허용된 단일 분류만 받는다", () => {
  assert.deepEqual(
    telephonyCallDispositionConfirmationSchema.parse({ disposition: "busy" }),
    { disposition: "busy" },
  );
  assert.deepEqual(
    telephonyCallDispositionConfirmationSchema.parse({
      disposition: "callback_required",
    }),
    { disposition: "callback_required" },
  );
  assert.equal(
    telephonyCallDispositionConfirmationSchema.safeParse({
      disposition: "answered",
    }).success,
    false,
  );
  assert.equal(
    telephonyCallDispositionConfirmationSchema.safeParse({
      disposition: "busy",
      note: "임의 필드",
    }).success,
    false,
  );
});

test("전화데스크 후처리는 기타 설명과 재통화 담당·일시를 함께 검증한다", () => {
  const base = {
    result: "reconsultation_required",
    memo: "채무 자료를 확인한 뒤 다시 연락",
    consultation: { mode: "none" },
    followUp: {
      enabled: true,
      dueAt: "2026-08-08T10:30:00.000+09:00",
      assigneeUserId: "01980000-0000-7000-8000-000000000021",
    },
  } as const;
  assert.deepEqual(phoneDeskAftercareSaveSchema.parse(base), base);
  assert.equal(
    phoneDeskAftercareSaveSchema.safeParse({
      ...base,
      result: "other",
    }).success,
    false,
  );
  assert.equal(
    phoneDeskAftercareSaveSchema.safeParse({
      ...base,
      result: "other",
      otherText: "관공서가 아닌 기타 업무 전화",
      followUp: { enabled: false },
    }).success,
    true,
  );
  assert.equal(
    phoneDeskAftercareSaveSchema.safeParse({
      ...base,
      result: "consultation_completed",
      otherText: "입력하면 안 됨",
    }).success,
    false,
  );
});

test("확인 필요 통화의 최종 통화자는 root 참여 leg로 지정한다", () => {
  const input = {
    finalLegId: "01980000-0000-7000-8000-000000000001",
  };
  assert.deepEqual(phoneDeskCallResolutionSchema.parse(input), input);
  assert.equal(
    phoneDeskCallResolutionSchema.safeParse({ finalLegId: "1208" }).success,
    false,
  );
});

test("센트릭스 받기 명령과 결과는 전화번호 없는 최소 계약만 허용한다", () => {
  const command = {
    schemaVersion: 1,
    commandId: "01980000-0000-7000-8000-000000000003",
    inboundCallId: "01980000-0000-7000-8000-000000000004",
    commandType: "answer",
    expectedProviderCallId: "1315457785.80",
    expiresAt: "2026-08-06T09:10:31.000+09:00",
  } as const;
  assert.deepEqual(centrexBridgeAnswerCommandSchema.parse(command), command);
  assert.equal(
    centrexBridgeAnswerCommandSchema.safeParse({
      ...command,
      callerNumber: "01012345678",
    }).success,
    false,
  );
  assert.equal(
    centrexBridgeCommandResultSchema.safeParse({
      schemaVersion: 1,
      commandId: command.commandId,
      status: "succeeded",
      resultCode: "accepted",
    }).success,
    true,
  );
});

test("센트릭스 슬롯 초기화 명령은 placeholder endpoint만 전달한다", () => {
  const command = {
    schemaVersion: 1,
    commandId: "01980000-0000-7000-8000-000000000031",
    commandType: "reset",
    endpointId: "01980000-0000-7000-8000-000000000032",
    expectedExtension: "0000",
    expectedLineLast4: "0000",
    expiresAt: "2026-08-10T10:30:00.000+09:00",
  } as const;
  assert.deepEqual(centrexBridgeResetCommandSchema.parse(command), command);
  assert.equal(
    centrexBridgeResetCommandSchema.safeParse({
      ...command,
      expectedExtension: "4591",
    }).success,
    false,
  );
});

test("센트릭스 브리지 수신 이벤트는 원시 payload 대신 최소 계약만 받는다", () => {
  const ringing = {
    schemaVersion: 1,
    eventId: "01980000-0000-7000-8000-000000000001",
    bridgeId: "seoul-phone-01",
    endpointId: "01980000-0000-7000-8000-000000000002",
    eventType: "inbound.ringing",
    occurredAt: "2026-08-06T09:10:11.000+09:00",
    providerCallId: "1315457785.80",
    callerNumber: "01012345678",
    incomingLineNumber: "07000001234",
  } as const;

  assert.deepEqual(centrexBridgeEventSchema.parse(ringing), ringing);
  assert.equal(
    centrexBridgeEventSchema.safeParse({
      ...ringing,
      rawEvent: "RINGEVENT|CALLERID:01012345678",
    }).success,
    false,
  );
  assert.equal(
    centrexBridgeEventSchema.safeParse({
      schemaVersion: 1,
      eventId: ringing.eventId,
      bridgeId: ringing.bridgeId,
      endpointId: ringing.endpointId,
      eventType: "inbound.ended",
      occurredAt: ringing.occurredAt,
      providerCallId: ringing.providerCallId,
      providerEndCause: "16",
    }).success,
    true,
  );
});

test("센트릭스 브리지 직접 발신 이벤트는 상대 번호와 상태만 받는다", () => {
  const ringing = {
    schemaVersion: 1,
    eventId: "01980000-0000-7000-8000-000000000011",
    bridgeId: "seoul-phone-01",
    endpointId: "01980000-0000-7000-8000-000000000002",
    eventType: "outbound.ringing",
    occurredAt: "2026-08-06T14:31:59.055+09:00",
    providerCallId: "1785994319.2611306",
    calledNumber: "01012341382",
  } as const;

  assert.deepEqual(centrexBridgeEventSchema.parse(ringing), ringing);
  assert.equal(
    centrexBridgeEventSchema.safeParse({
      ...ringing,
      incomingLineNumber: "07046074591",
    }).success,
    false,
  );
  assert.equal(
    centrexBridgeEventSchema.safeParse({
      schemaVersion: 1,
      eventId: ringing.eventId,
      bridgeId: ringing.bridgeId,
      endpointId: ringing.endpointId,
      eventType: "outbound.connected",
      occurredAt: ringing.occurredAt,
      providerCallId: ringing.providerCallId,
      providerChannelId: "1785994319.2611307",
    }).success,
    true,
  );
  assert.equal(
    centrexBridgeEventSchema.safeParse({
      schemaVersion: 1,
      eventId: ringing.eventId,
      bridgeId: ringing.bridgeId,
      endpointId: ringing.endpointId,
      eventType: "outbound.ended",
      occurredAt: ringing.occurredAt,
      providerCallId: ringing.providerCallId,
      providerEndCause: "16",
    }).success,
    true,
  );
});

test("센트릭스 v2 관측은 내선 상담의 상위 외부 통화 문맥을 보존한다", () => {
  const observation = {
    schemaVersion: 2,
    eventId: "01980000-0000-7000-8000-000000000051",
    bridgeId: "seoul-phone-01",
    endpointId: "01980000-0000-7000-8000-000000000002",
    eventType: "call.ringing",
    occurredAt: "2026-08-11T17:28:56.000+09:00",
    providerCallId: "1785994319.3000001",
    agentExtension: "4591",
    direction: "outbound",
    remotePartyKind: "internal",
    remotePartyNumber: "1208",
    contextProviderCallId: "1785994319.2999991",
    channelKind: "sip",
    relatedChannelKind: "sip",
  } as const;

  assert.deepEqual(centrexBridgeEventSchema.parse(observation), observation);
  assert.equal(
    centrexBridgeEventSchema.safeParse({
      ...observation,
      remotePartyKind: "external",
    }).success,
    false,
  );
  assert.equal(
    centrexBridgeEventSchema.safeParse({
      ...observation,
      direction: "inbound",
    }).success,
    false,
  );
});

test("센트릭스 v2 수신 관측은 최초 수신 회선을 반드시 보존한다", () => {
  const observation = {
    schemaVersion: 2,
    eventId: "01980000-0000-7000-8000-000000000054",
    bridgeId: "seoul-phone-01",
    endpointId: "01980000-0000-7000-8000-000000000002",
    eventType: "call.ringing",
    occurredAt: "2026-08-12T08:30:14.1598970+09:00",
    providerCallId: "1785994319.3000011",
    agentExtension: "4591",
    direction: "inbound",
    remotePartyKind: "external",
    remotePartyNumber: "01012345678",
    incomingLineNumber: "07000004591",
    channelKind: "sip",
    relatedChannelKind: "none",
  } as const;

  assert.deepEqual(centrexBridgeEventSchema.parse(observation), observation);
  const { incomingLineNumber: _incomingLineNumber, ...missingLine } =
    observation;
  assert.equal(centrexBridgeEventSchema.safeParse(missingLine).success, false);
});

test("센트릭스 v2 채널·종료 관측은 양쪽 provider 식별자를 보존한다", () => {
  const base = {
    schemaVersion: 2,
    bridgeId: "seoul-phone-01",
    endpointId: "01980000-0000-7000-8000-000000000002",
    occurredAt: "2026-08-11T17:29:09.000+09:00",
    providerCallId: "1785994319.3000001",
    agentExtension: "4591",
  } as const;
  const channels = {
    ...base,
    eventId: "01980000-0000-7000-8000-000000000052",
    eventType: "call.channels",
    relatedProviderCallId: "1785994319.3000002",
    party1Kind: "internal",
    party2Kind: "internal",
    party1Number: "4591",
    party2Number: "1208",
    channel1Kind: "sip",
    channel2Kind: "sip",
  } as const;
  const ended = {
    ...base,
    eventId: "01980000-0000-7000-8000-000000000053",
    eventType: "call.ended",
    sourceProviderCallId: "1785994319.3000002",
    providerEndCause: "16",
    channelKind: "sip",
    relatedChannelKind: "sip",
  } as const;

  assert.deepEqual(centrexBridgeEventSchema.parse(channels), channels);
  assert.deepEqual(centrexBridgeEventSchema.parse(ended), ended);
  assert.equal(
    centrexBridgeEventSchema.safeParse({
      ...ended,
      sourceProviderCallId: "unsafe/provider/id",
    }).success,
    false,
  );
});
