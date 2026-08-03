import assert from "node:assert/strict";
import test from "node:test";

import {
  createKakaoSkillResponse,
  kakaoSkillRequestSchema,
  kakaoSkillResponseSchema,
  kakaoSkillUserKey,
} from "./kakao.js";

const request = {
  bot: {
    id: "6a6abab095f722d77d9627ac",
    name: "법무법인 로앤 상담",
  },
  userRequest: {
    utterance: "상담하고 싶어요",
    user: {
      id: "fallback-bot-user-key",
      type: "botUserKey",
      properties: {
        botUserKey: "bot-user-key",
        plusfriendUserKey: "plusfriend-user-key",
      },
    },
  },
  action: {
    clientExtra: {
      entry: "consultation_button",
    },
  },
};

test("카카오 스킬 요청은 채널 사용자 키를 우선 식별자로 사용한다", () => {
  const parsed = kakaoSkillRequestSchema.parse(request);
  assert.equal(kakaoSkillUserKey(parsed), "plusfriend-user-key");
});

test("카카오 스킬 응답은 접수번호와 전화번호 미수집 안내를 반환한다", () => {
  const response = createKakaoSkillResponse({
    publicReceiptCode: "LA-260730-23456789",
    acceptedAt: "2026-07-30T09:00:00.000Z",
    replayed: false,
  });
  assert.equal(kakaoSkillResponseSchema.safeParse(response).success, true);
  const text = response.template.outputs[0]?.simpleText.text ?? "";
  assert.match(text, /LA-260730-23456789/);
  assert.match(text, /전화번호가 아직 없어 알림톡은 발송되지 않습니다/);
});

test("이미 접수된 사용자는 같은 접수번호 안내를 받는다", () => {
  const response = createKakaoSkillResponse({
    publicReceiptCode: "LA-260730-23456789",
    acceptedAt: "2026-07-30T09:00:00.000Z",
    replayed: true,
  });
  assert.match(
    response.template.outputs[0]?.simpleText.text ?? "",
    /이미 접수된 상담입니다/,
  );
});
