import assert from "node:assert/strict";
import test from "node:test";

import { consultationSubmissionSchema } from "./intake.js";

const quickSubmission = {
  source: "homepage",
  idempotencyKey: "01984c7d-8500-7000-8000-000000000001",
  mode: "quick",
  phone: "010-1234-5678",
  contact: { preference: "as_soon_as_possible" },
  privacyNoticeVersion: "2026-08-03.1",
  consentAgreedAt: "2026-07-27T10:00:00.000+09:00",
  attribution: {
    journeySessionId: "01984c7d-8500-7000-8000-000000000002",
    startedAt: "2026-07-27T09:00:00.000+09:00",
    firstLandingPath: "/bank",
    source: {},
    journey: [],
    submittedFromPath: "/bank/consultation",
  },
  intake: {
    residenceRegion: "seoul",
    urgencies: [],
    incomes: [],
  },
} as const;

test("빠른 상담 입력은 전화번호를 정규화한다", () => {
  const parsed = consultationSubmissionSchema.parse(quickSubmission);
  assert.equal(parsed.phone, "01012345678");
});

test("귀속 분석 정보는 모든 상담 요청에 필요하다", () => {
  assert.throws(() =>
    consultationSubmissionSchema.parse({
      ...quickSubmission,
      attribution: undefined,
    }),
  );
});

test("거주 시·도는 모든 상담 요청에 필요하고 허용 목록만 받는다", () => {
  assert.throws(() =>
    consultationSubmissionSchema.parse({
      ...quickSubmission,
      intake: {
        urgencies: [],
        incomes: [],
      },
    }),
  );
  assert.throws(() =>
    consultationSubmissionSchema.parse({
      ...quickSubmission,
      intake: {
        ...quickSubmission.intake,
        residenceRegion: "서울특별시 강남구",
      },
    }),
  );
});

test("상세 상담은 핵심 선택 답변을 요구한다", () => {
  assert.throws(() =>
    consultationSubmissionSchema.parse({
      ...quickSubmission,
      mode: "detailed",
    }),
  );
});

test("예약 연락은 한국 평일 운영시간의 30분 구간만 허용한다", () => {
  assert.throws(() =>
    consultationSubmissionSchema.parse({
      ...quickSubmission,
      contact: {
        preference: "scheduled_window",
        windowStart: "2026-07-25T10:00:00.000+09:00",
        windowEnd: "2026-07-25T10:30:00.000+09:00",
      },
    }),
  );
});
