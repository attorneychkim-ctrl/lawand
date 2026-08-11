import assert from "node:assert/strict";
import test from "node:test";

import {
  createLegalFriendsCasePayload,
  createLegalFriendsClient,
  LegalFriendsDeliveryError,
  LegalFriendsPayloadError,
} from "./legalfriends.js";

test("리걸프렌즈 회생 상담 payload를 명세 형식으로 만든다", () => {
  assert.deepEqual(
    createLegalFriendsCasePayload({
      mode: "detailed",
      memberIdx: 138,
      name: "홍길동",
      phone: "01012345678",
      intake: {
        residenceRegion: "seoul",
        topic: "개인회생",
        urgencies: ["연체가 시작됐어요"],
        incomes: ["급여소득"],
        unsecuredDebt: "5천만~1억원",
        securedDebt: "없음",
        assets: "1천만원 미만",
        discharge: "없음",
        concern: "연락 가능한 시간을 먼저 확인해 주세요.",
      },
    }),
    {
      case_type: 1,
      member_idx: 138,
      name: "홍길동",
      phone: "010-1234-5678",
      living_place: "서울특별시",
      memo: [
        "접수 방식: 상세 상담",
        "도움 분야: 개인회생",
        "현재 단계: 연체가 시작됐어요",
        "소득: 급여소득",
        "담보 없는 채무: 5천만~1억원",
        "담보부 채무: 없음",
        "담보를 제외한 순재산: 1천만원 미만",
        "과거 면책: 없음",
        "남긴 내용: 연락 가능한 시간을 먼저 확인해 주세요.",
      ].join("\n"),
    },
  );
});

test("빠른 상담과 파산·기타 외 상세 상담은 기본 개인회생 유형으로 분류한다", () => {
  const quick = createLegalFriendsCasePayload({
    mode: "quick",
    memberIdx: 138,
    name: "익명-테스트",
    phone: "010-9999-8888",
    intake: {
      residenceRegion: "busan",
      urgencies: [],
      incomes: [],
    },
  });
  assert.equal(quick.case_type, 1);
  assert.equal(quick.living_place, "부산광역시");

  for (const topic of [
    "개인회생",
    "두 제도를 비교하고 싶어요",
    "독촉·법원 문서·압류 대응",
    "아직 잘 모르겠어요",
  ]) {
    const detailed = createLegalFriendsCasePayload({
      mode: "detailed",
      memberIdx: 138,
      name: "익명-테스트",
      phone: "010-9999-8888",
      intake: {
        residenceRegion: "busan",
        topic,
        urgencies: [],
        incomes: [],
      },
    });
    assert.equal(detailed.case_type, 1, topic);
  }
});

test("상세 상담의 개인파산·면책은 2, 기타는 3으로 분류한다", () => {
  for (const [topic, expected] of [
    ["개인파산·면책", 2],
    ["기타", 3],
  ] as const) {
    const payload = createLegalFriendsCasePayload({
      mode: "detailed",
      memberIdx: 138,
      name: "익명-테스트",
      phone: "010-9999-8888",
      intake: {
        residenceRegion: "seoul",
        topic,
        urgencies: [],
        incomes: [],
      },
    });
    assert.equal(payload.case_type, expected, topic);
  }
});

test("해외·기타는 지원되지 않는 지역으로 명시적으로 중단한다", () => {
  assert.throws(
    () =>
      createLegalFriendsCasePayload({
        mode: "quick",
        memberIdx: 138,
        name: "익명-테스트",
        phone: "01012345678",
        intake: {
          residenceRegion: "overseas_or_other",
          urgencies: [],
          incomes: [],
        },
      }),
    (error: unknown) =>
      error instanceof LegalFriendsPayloadError &&
      error.code === "unsupported_residence_region",
  );
});

test("클라이언트는 최초 담당자를 포함해 신건을 만들고 case_idx를 반환한다", async () => {
  const requests: Array<{
    url: string;
    init: RequestInit | undefined;
  }> = [];
  const client = createLegalFriendsClient({
    token: "test-token",
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ code: 0, data: { case_id: 111 } }),
        {
          status: 201,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const created = await client.createCase(
    {
      case_type: 2,
      member_idx: 138,
      name: "홍길동",
      phone: "010-1234-5678",
      living_place: "대전광역시",
      memo: "접수 방식: 빠른 상담",
    },
    {
      eventId: "01984c7d-8500-7000-8000-000000000001",
      consultationId: "01984c7d-8500-7000-8000-000000000002",
    },
  );

  assert.equal(created.httpStatus, 201);
  assert.equal(created.caseIdx, "111");
  assert.equal(requests.length, 1);
  assert.equal(
    new Headers(requests[0]?.init?.headers).get("authorization"),
    "test-token",
  );
  assert.equal(
    new Headers(requests[0]?.init?.headers).get("idempotency-key"),
    "01984c7d-8500-7000-8000-000000000001",
  );
  assert.equal(
    JSON.parse(String(requests[0]?.init?.body)).member_idx,
    138,
  );
  assert.equal(
    requests[0]?.url,
    "https://www.legalfriends.co.kr/api/bankruptcy/case/createForLawnV2",
  );
});

test("신건 응답의 case_idx와 숫자형 data도 사건 식별자로 허용한다", async () => {
  const responseBodies = [
    { code: 0, data: { case_idx: "222" } },
    { code: 0, data: 333 },
  ];
  const client = createLegalFriendsClient({
    token: "test-token",
    fetchImpl: async () =>
      new Response(JSON.stringify(responseBodies.shift()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
  const payload = {
    case_type: 3 as const,
    member_idx: 138,
    name: "홍길동",
    phone: "010-1234-5678",
    living_place: "서울특별시",
    memo: "빠른 상담",
  };
  const context = {
    eventId: "01984c7d-8500-7000-8000-000000000001",
    consultationId: "01984c7d-8500-7000-8000-000000000002",
  };

  assert.equal((await client.createCase(payload, context)).caseIdx, "222");
  assert.equal((await client.createCase(payload, context)).caseIdx, "333");
});

test("클라이언트는 저장된 case_idx와 무효 member_id로 담당자를 변경한다", async () => {
  let request: { url: string; init: RequestInit | undefined } | undefined;
  const client = createLegalFriendsClient({
    token: "test-token",
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return new Response(
        JSON.stringify({ code: 0, msg: "성공(0)", data: {} }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const changed = await client.changeManager("111", "lawandfirm_s999", {
    eventId: "01984c7d-8500-7000-8000-000000000001",
    consultationId: "01984c7d-8500-7000-8000-000000000002",
  });

  assert.equal(changed.httpStatus, 200);
  assert.equal(
    request?.url,
    "https://www.legalfriends.co.kr/api/bankruptcy/case/changeManager",
  );
  assert.equal(
    new Headers(request?.init?.headers).get("authorization"),
    "test-token",
  );
  assert.equal(new Headers(request?.init?.headers).get("case_idx"), "111");
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    member_id: "lawandfirm_s999",
  });
});

test("HTTP 200 안의 리걸프렌즈 업무 오류를 실패로 판정한다", async () => {
  const client = createLegalFriendsClient({
    token: "test-token",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: 1033,
          msg: "사건 타입이 올바르지 않습니다(1033)",
          data: {},
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  await assert.rejects(
    client.createCase(
      {
        case_type: 1,
        member_idx: 138,
        name: "테스트",
        phone: "010-1234-5678",
        living_place: "서울특별시",
        memo: "실제 연동 테스트",
      },
      {
        eventId: "01984c7d-8500-7000-8000-000000000001",
        consultationId: "01984c7d-8500-7000-8000-000000000002",
      },
    ),
    (error: unknown) =>
      error instanceof LegalFriendsDeliveryError &&
      error.code === "invalid_request" &&
      error.message.includes("1033"),
  );
});

test("429는 Retry-After를 보존하는 재시도 가능 오류다", async () => {
  const client = createLegalFriendsClient({
    token: "test-token",
    fetchImpl: async () =>
      new Response(null, {
        status: 429,
        headers: { "retry-after": "90" },
      }),
  });

  await assert.rejects(
    client.createCase(
      {
        case_type: 3,
        member_idx: 138,
        name: "익명",
        phone: "010-1234-5678",
        living_place: "경기도",
        memo: "빠른 상담",
      },
      {
        eventId: "01984c7d-8500-7000-8000-000000000001",
        consultationId: "01984c7d-8500-7000-8000-000000000002",
      },
    ),
    (error: unknown) =>
      error instanceof LegalFriendsDeliveryError &&
      error.options.retryable &&
      error.options.retryAfterSeconds === 90,
  );
});
