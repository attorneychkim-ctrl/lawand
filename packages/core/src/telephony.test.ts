import assert from "node:assert/strict";
import test from "node:test";

import {
  centrexBridgeAnswerCommandSchema,
  centrexBridgeCommandResultSchema,
  centrexBridgeEventSchema,
  centrexBridgeResetCommandSchema,
  phoneDeskAftercareSaveSchema,
  telephonyCallDispositionConfirmationSchema,
} from "./telephony.js";

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
