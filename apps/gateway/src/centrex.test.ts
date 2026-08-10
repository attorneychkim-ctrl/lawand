import assert from "node:assert/strict";
import test from "node:test";

import {
  CENTREX_CALLHISTORY_URL,
  CENTREX_CLICKDIAL_URL,
  CENTREX_INBOUND_CALL_HISTORY_URL,
  CENTREX_SET_RING_CALLBACK_URL,
  CENTREX_SMS_SEND_URL,
  CENTREX_USERINFO_URL,
  CentrexDeliveryError,
  createCentrexClient,
} from "./centrex.js";

const passwordSha512 = "a".repeat(128);

test("통화이력은 발신 전용 POST로 조회하고 숫자·문자형 시간을 모두 정규화한다", async () => {
  let receivedUrl = "";
  let receivedBody = "";
  const client = createCentrexClient({
    fetchImpl: async (input, init) => {
      receivedUrl = String(input);
      receivedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          SVC_RT: "OK",
          DATAS: [
            {
              NO: 1,
              TIME: "2026-08-05 15:13:00",
              SRC: "0701234****",
              DST: "0101234****",
              DURATION: "0",
              BILLSEC: 7,
              STATUS: " fail ",
              KIND: "OUT",
            },
          ],
        }),
        { status: 200 },
      );
    },
  });

  const result = await client.getCallHistory({
    apiLoginId: "07012345678",
    passwordSha512,
    page: 2,
  });

  assert.equal(receivedUrl, CENTREX_CALLHISTORY_URL);
  assert.equal(new URL(receivedUrl).search, "");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(receivedBody)), {
    id: "07012345678",
    pass: passwordSha512,
    page: "2",
    calltype: "outbound",
  });
  assert.deepEqual(result.records, [
    {
      number: "1",
      time: "2026-08-05 15:13:00",
      source: "0701234****",
      destination: "0101234****",
      durationSeconds: 0,
      billableSeconds: 7,
      status: "FAIL",
      kind: "OUT",
    },
  ]);
});

test("수신 URL 알림은 비밀 경로와 IPv4를 URL이 아닌 POST body로 설정한다", async () => {
  let receivedUrl = "";
  let receivedBody = "";
  const client = createCentrexClient({
    fetchImpl: async (input, init) => {
      receivedUrl = String(input);
      receivedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          SVC_RT: "0000",
          SVC_MSG: "OK",
          DATAS: { STATUS: "OK", DEBUG: "configured" },
        }),
        { status: 200 },
      );
    },
  });

  const result = await client.setRingCallback({
    apiLoginId: "07012345678",
    passwordSha512,
    callbackPath: "/v1/centrex-ring/token_value.html",
    callbackHost: "203.0.113.10",
    callbackPort: 80,
  });

  assert.equal(receivedUrl, CENTREX_SET_RING_CALLBACK_URL);
  assert.equal(new URL(receivedUrl).search, "");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(receivedBody)), {
    id: "07012345678",
    pass: passwordSha512,
    callbackurl: "/v1/centrex-ring/token_value.html",
    callbackhost: "203.0.113.10",
    callbackport: "80",
  });
  assert.deepEqual(result, { httpStatus: 200, providerCode: "0000" });
});

test("외부인입 수신이력은 비즈콜 종료 상태와 시간을 엄격히 정규화한다", async () => {
  let receivedUrl = "";
  let receivedBody = "";
  const client = createCentrexClient({
    fetchImpl: async (input, init) => {
      receivedUrl = String(input);
      receivedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          SVC_RT: "0000",
          SVC_MSG: "OK",
          LISTINFO: { page: "1", numperpage: "50", total: "1" },
          DATAS: [
            {
              NO: 1,
              TIME: "2026-08-07 12:09:44",
              SRC: "01012345678",
              DST: "07012345678",
              DURATION: "8",
              STATUS: " cancel ",
              CHANNEL: "SIP/provider",
              DSTCHANNEL: "SIP/extension",
              ENDTIME: "2026-08-07 12:09:52",
              APPDATA: "SIP/extension",
            },
          ],
        }),
        { status: 200 },
      );
    },
  });

  const result = await client.getInboundCallHistory({
    apiLoginId: "07012345678",
    passwordSha512,
    page: 1,
    pageSize: 50,
  });

  assert.equal(receivedUrl, CENTREX_INBOUND_CALL_HISTORY_URL);
  assert.equal(new URL(receivedUrl).search, "");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(receivedBody)), {
    id: "07012345678",
    pass: passwordSha512,
    page: "1",
    num_per_page: "50",
  });
  assert.deepEqual(result.records, [
    {
      number: "1",
      time: "2026-08-07 12:09:44",
      source: "01012345678",
      destination: "07012345678",
      durationSeconds: 8,
      status: "CANCEL",
      channel: "SIP/provider",
      destinationChannel: "SIP/extension",
      endTime: "2026-08-07 12:09:52",
      applicationData: "SIP/extension",
    },
  ]);
});

test("클릭투콜은 인증값과 고객번호를 URL이 아닌 POST body로 보낸다", async () => {
  let receivedUrl = "";
  let receivedBody = "";
  const client = createCentrexClient({
    fetchImpl: async (input, init) => {
      receivedUrl = String(input);
      receivedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          SVC_RT: "0000",
          SVC_MSG: "OK",
          DATAS: { STATUS: "OK", DESTNUMBER: "01012345678" },
        }),
        { status: 200 },
      );
    },
  });

  const result = await client.clickDial({
    apiLoginId: "07012345678",
    passwordSha512,
    destination: "010-1234-5678",
  });

  assert.equal(receivedUrl, CENTREX_CLICKDIAL_URL);
  assert.equal(new URL(receivedUrl).search, "");
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(receivedBody)),
    {
      id: "07012345678",
      pass: passwordSha512,
      destnumber: "01012345678",
    },
  );
  assert.deepEqual(result, { httpStatus: 200, providerCode: "0000" });
});

test("문자는 고객번호와 본문을 URL이 아닌 POST body로 보내고 잔여 건수를 읽는다", async () => {
  let receivedUrl = "";
  let receivedBody = "";
  const client = createCentrexClient({
    fetchImpl: async (input, init) => {
      receivedUrl = String(input);
      receivedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          SVC_RT: "0000",
          SVC_MSG: "OK",
          DATAS: {
            STATUS: "OK",
            DEBUG: "01012345678=OK",
            RESTCOUNT: "17",
          },
        }),
        { status: 200 },
      );
    },
  });

  const result = await client.sendMessage({
    apiLoginId: "07012345678",
    passwordSha512,
    destination: "010-1234-5678",
    message: "상담 요청을 확인했습니다.",
  });

  assert.equal(receivedUrl, CENTREX_SMS_SEND_URL);
  assert.equal(new URL(receivedUrl).search, "");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(receivedBody)), {
    id: "07012345678",
    pass: passwordSha512,
    destnumber: "01012345678",
    smsmsg: "상담 요청을 확인했습니다.",
  });
  assert.deepEqual(result, {
    httpStatus: 200,
    providerCode: "0000",
    remainingCount: 17,
  });
});

test("문자 잔여 건수 부족은 재시도 없는 확정 실패로 분류한다", async () => {
  const client = createCentrexClient({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ SVC_RT: "3004", SVC_MSG: "NO_SMSCOUNT" }),
        { status: 200 },
      ),
  });

  await assert.rejects(
    client.sendMessage({
      apiLoginId: "07012345678",
      passwordSha512,
      destination: "01012345678",
      message: "상담 안내",
    }),
    (error: unknown) =>
      error instanceof CentrexDeliveryError &&
      error.code === "message_quota_exhausted" &&
      error.options.commandStatus === "failed",
  );
});

test("사용자정보 조회로 API 로그인과 실제 회선·내선을 분리 검증한다", async () => {
  let receivedUrl = "";
  const client = createCentrexClient({
    fetchImpl: async (input) => {
      receivedUrl = String(input);
      return new Response(
        JSON.stringify({
          SVC_RT: "0000",
          SVC_MSG: "OK",
          DATAS: {
            NAME: "테스트 회선",
            EXTEN: "5678",
            NUMBER070: "07012345678",
          },
        }),
        { status: 200 },
      );
    },
  });

  assert.deepEqual(
    await client.getUserInfo({
      apiLoginId: "07012345678",
      passwordSha512,
    }),
    {
      httpStatus: 200,
      name: "테스트 회선",
      extension: "5678",
      lineNumber: "07012345678",
    },
  );
  assert.equal(receivedUrl, CENTREX_USERINFO_URL);
});

test("센트릭스 인증 오류는 자동 재발신 대상이 아닌 실패로 분류한다", async () => {
  const client = createCentrexClient({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ SVC_RT: "1008", SVC_MSG: "AUTH_ERR" }),
        { status: 200 },
      ),
  });

  await assert.rejects(
    client.clickDial({
      apiLoginId: "07012345678",
      passwordSha512,
      destination: "01012345678",
    }),
    (error: unknown) =>
      error instanceof CentrexDeliveryError &&
      error.code === "authentication_failed" &&
      error.options.commandStatus === "failed",
  );
});

test("응답을 받지 못한 클릭투콜은 중복 발신하지 않고 확인 필요로 분류한다", async () => {
  const client = createCentrexClient({
    fetchImpl: async () => {
      throw new Error("timeout");
    },
  });

  await assert.rejects(
    client.clickDial({
      apiLoginId: "07012345678",
      passwordSha512,
      destination: "01012345678",
    }),
    (error: unknown) =>
      error instanceof CentrexDeliveryError &&
      error.code === "ambiguous_delivery" &&
      error.options.commandStatus === "unknown",
  );
});
