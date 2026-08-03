import assert from "node:assert/strict";
import test from "node:test";

import {
  createSolapiAlimtalkMessage,
  createSolapiAuthHeader,
  createSolapiClient,
  formatAlimtalkContactSchedule,
  formatAlimtalkTimestamp,
  SolapiDeliveryError,
} from "./solapi.js";

test("솔라피 인증 헤더는 공식 date+salt HMAC-SHA256 계약을 따른다", () => {
  assert.equal(
    createSolapiAuthHeader({
      apiKey: "test-key",
      apiSecret: "test-secret",
      dateTime: "2026-07-30T00:00:00.000Z",
      salt: "1234567890123456",
    }),
    "HMAC-SHA256 apiKey=test-key, date=2026-07-30T00:00:00.000Z, salt=1234567890123456, signature=42efee87d89a47cc4c865caa356f79ce120d9c3f903cb95bb8a2da31a3184d0e",
  );
});

test("알림톡은 승인 변수만 보내고 문자 대체발송을 명시적으로 끈다", () => {
  assert.deepEqual(
    createSolapiAlimtalkMessage({
      to: "010-1234-5678",
      pfId: "KA01PF-test",
      templateId: "KA01TP-test",
      eventId: "01984c7d-8500-7000-8000-000000000010",
      variables: {
        "#{접수번호}": "LA-260730-TEST0001",
        "#{접수시각}": "2026년 7월 30일 10:30",
        "#{연락예정}": "가능한 빠른 시간",
      },
    }),
    {
      to: "01012345678",
      type: "ATA",
      customFields: {
        lawandEventId: "01984c7d-8500-7000-8000-000000000010",
      },
      kakaoOptions: {
        pfId: "KA01PF-test",
        templateId: "KA01TP-test",
        disableSms: true,
        variables: {
          "#{접수번호}": "LA-260730-TEST0001",
          "#{접수시각}": "2026년 7월 30일 10:30",
          "#{연락예정}": "가능한 빠른 시간",
        },
      },
    },
  );
});

test("알림톡 시각과 예약 연락시간은 한국 시간으로 만든다", () => {
  assert.equal(
    formatAlimtalkTimestamp(new Date("2026-07-30T01:30:00.000Z")),
    "2026년 7월 30일 10:30",
  );
  assert.equal(
    formatAlimtalkContactSchedule({
      preference: "as_soon_as_possible",
      windowStart: null,
      windowEnd: null,
    }),
    "가능한 빠른 시간",
  );
  assert.equal(
    formatAlimtalkContactSchedule({
      preference: "scheduled_window",
      windowStart: new Date("2026-07-31T05:00:00.000Z"),
      windowEnd: new Date("2026-07-31T06:00:00.000Z"),
    }),
    "2026년 7월 31일 14:00~15:00",
  );
});

test("솔라피 성공 응답의 그룹·메시지 식별자를 반환한다", async () => {
  let requestBody: unknown;
  const client = createSolapiClient({
    apiKey: "test-key",
    apiSecret: "test-secret",
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    createSalt: () => "1234567890123456",
    fetchImplementation: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          groupInfo: {
            groupId: "G4V-test",
            count: { registeredSuccess: 1, registeredFailed: 0 },
          },
          failedMessageList: [],
          messageList: [
            {
              messageId: "M4V-test",
              statusCode: "2000",
              statusMessage: "정상 접수",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const message = createSolapiAlimtalkMessage({
    to: "01012345678",
    pfId: "KA01PF-test",
    templateId: "KA01TP-test",
    variables: { "#{접수번호}": "LA-TEST" },
  });

  assert.deepEqual(await client.sendAlimtalk(message), {
    httpStatus: 200,
    groupId: "G4V-test",
    messageId: "M4V-test",
    statusCode: "2000",
  });
  assert.deepEqual(requestBody, {
    messages: [message],
    strict: true,
    allowDuplicates: false,
    showMessageList: true,
  });
});

test("HTTP 200 안의 등록 실패도 성공으로 처리하지 않는다", async () => {
  const client = createSolapiClient({
    apiKey: "test-key",
    apiSecret: "test-secret",
    fetchImplementation: async () =>
      new Response(
        JSON.stringify({
          groupInfo: { groupId: "G4V-test" },
          failedMessageList: [
            {
              messageId: "M4V-failed",
              statusCode: "3045",
              statusMessage: "템플릿 오류",
            },
          ],
          messageList: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  await assert.rejects(
    () =>
      client.sendAlimtalk(
        createSolapiAlimtalkMessage({
          to: "01012345678",
          pfId: "KA01PF-test",
          templateId: "KA01TP-test",
          variables: { "#{접수번호}": "LA-TEST" },
        }),
      ),
    (error: unknown) =>
      error instanceof SolapiDeliveryError &&
      error.code === "provider_rejected" &&
      error.options.retryable === false,
  );
});
