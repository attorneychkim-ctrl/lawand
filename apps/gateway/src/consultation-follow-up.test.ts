import assert from "node:assert/strict";
import test from "node:test";

import { consultationScheduleFollowUp } from "./consultation-follow-up.js";

const scheduledRequest = {
  id: "019fa6a4-6834-7782-aa0b-4e71ffb8a301",
  source: "homepage",
  contactChannel: "phone" as const,
  contactPreference: "scheduled_window" as const,
  contactWindowStart: new Date("2026-08-21T01:00:00.000Z"),
  contactWindowEnd: new Date("2026-08-21T01:30:00.000Z"),
};

test("홈페이지 예약 전화상담만 재통화 업무 입력으로 변환한다", () => {
  assert.deepEqual(consultationScheduleFollowUp(scheduledRequest), {
    consultationRequestId: scheduledRequest.id,
    dueAt: scheduledRequest.contactWindowStart,
    windowEndAt: scheduledRequest.contactWindowEnd,
  });
  assert.equal(
    consultationScheduleFollowUp({
      ...scheduledRequest,
      contactPreference: "as_soon_as_possible",
      contactWindowStart: null,
      contactWindowEnd: null,
    }),
    null,
  );
  assert.equal(
    consultationScheduleFollowUp({
      ...scheduledRequest,
      source: "naver_booking_email",
      contactChannel: "naver_booking",
    }),
    null,
  );
});
