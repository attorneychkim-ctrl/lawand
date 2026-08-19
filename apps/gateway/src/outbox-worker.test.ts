import assert from "node:assert/strict";
import test from "node:test";

import { createDataProtection } from "./crypto.js";
import { LegalFriendsPayloadError } from "./legalfriends.js";
import {
  matchesRestorationAssignmentSnapshot,
  planRestoredConsultation,
  resolveStoredRegistrationIntake,
  resolveStoredRegistrationName,
} from "./outbox-worker.js";

const protection = createDataProtection({
  encryptionKey: Buffer.alloc(32, 1).toString("base64"),
  hmacKey: Buffer.alloc(32, 2).toString("base64"),
  keyVersion: "v1",
});

test("묶음 구성 상담의 이름은 대표가 아니라 암호문 소유 상담 문맥으로 복호화한다", () => {
  const canonicalConsultationId =
    "01984c7d-8500-7000-8000-000000000001";
  const requestConsultationId =
    "01984c7d-8500-7000-8000-000000000002";
  const encryptedName = protection.encrypt(
    "구성 상담 고객",
    `consultations.preferred_name:${requestConsultationId}`,
  );

  assert.equal(
    resolveStoredRegistrationName(protection, {
      consultationId: requestConsultationId,
      anonymousLabel: "익명-테스트",
      preferredNameCiphertext: encryptedName.ciphertext,
      preferredNameNonce: encryptedName.nonce,
      preferredNameKeyVersion: encryptedName.keyVersion,
    }),
    "구성 상담 고객",
  );
  assert.throws(() =>
    protection.decrypt(
      encryptedName,
      `consultations.preferred_name:${canonicalConsultationId}`,
    ),
  );
});

test("저장된 선호 이름이 없으면 상담 익명 표시명을 사용한다", () => {
  assert.equal(
    resolveStoredRegistrationName(protection, {
      consultationId: "01984c7d-8500-7000-8000-000000000003",
      anonymousLabel: "익명-테스트",
      preferredNameCiphertext: null,
      preferredNameNonce: null,
      preferredNameKeyVersion: null,
    }),
    "익명-테스트",
  );
});

test("ERP 저장 intake는 내부 메타데이터를 제외하고 리걸프렌즈 등록용으로 복원한다", () => {
  assert.deepEqual(
    resolveStoredRegistrationIntake(
      {
        channel: "phone_desk",
        callId: "01984c7d-8500-7000-8000-000000000004",
        direction: "inbound",
        residenceRegion: "busan",
        note: "직원이 통화 후 전화데스크에서 생성한 신건상담",
      },
      { isKakaoConsultation: false, source: "erp_phone_desk" },
    ),
    {
      residenceRegion: "busan",
      urgencies: [],
      incomes: [],
    },
  );
  for (const source of ["erp_staff", "erp_client_directory"]) {
    assert.deepEqual(
      resolveStoredRegistrationIntake(
        {
          residenceRegion: "gyeongnam",
          topic: "개인회생",
          transferNote: "다음 담당자가 확인할 전달사항",
        },
        { isKakaoConsultation: false, source },
      ),
      {
        residenceRegion: "gyeongnam",
        topic: "개인회생",
        urgencies: [],
        incomes: [],
      },
    );
  }
});

test("ERP 저장 intake도 거주지역과 알려진 상담값이 유효해야 한다", () => {
  for (const storedIntake of [
    {
      channel: "phone_desk",
      note: "거주지역이 없는 과거 상담",
    },
    {
      residenceRegion: "busan",
      urgencies: "배열이 아닌 잘못된 값",
      transferNote: "내부 메타데이터만 제외해야 함",
    },
  ]) {
    assert.throws(
      () =>
        resolveStoredRegistrationIntake(storedIntake, {
          isKakaoConsultation: false,
          source: "erp_staff",
        }),
      (error) =>
        error instanceof LegalFriendsPayloadError &&
        error.code === "invalid_consultation_intake",
    );
  }
});

test("내부 출처가 아닌 저장 intake는 알 수 없는 필드를 계속 거부한다", () => {
  assert.throws(
    () =>
      resolveStoredRegistrationIntake(
        {
          residenceRegion: "busan",
          topic: "개인회생",
          transferNote: "공개 접수 경계에서는 허용하지 않는 필드",
        },
        { isKakaoConsultation: false, source: "homepage" },
      ),
    (error) =>
      error instanceof LegalFriendsPayloadError &&
      error.code === "invalid_consultation_intake",
  );
});

test("카카오 저장 intake의 기존 자리표시자 계약은 유지한다", () => {
  assert.deepEqual(
    resolveStoredRegistrationIntake(
      {
        residenceRegion: "seoul",
        channel: "kakao_channel",
        entrySource: "homepage_button",
      },
      { isKakaoConsultation: true, source: "homepage_kakao" },
    ),
    {
      residenceRegion: "seoul",
      urgencies: [],
      incomes: [],
      concern: "카카오 채팅방에서 상담 내용을 확인",
    },
  );
});

test("기존 배정이 남은 무효 상담은 같은 배정 행을 실행 직원으로 갱신한다", () => {
  assert.deepEqual(
    planRestoredConsultation({
      currentState: "contacted",
      assignmentId: "01984c7d-8500-7000-8000-000000000010",
      targetAssignmentId: "01984c7d-8500-7000-8000-000000000011",
    }),
    {
      assignmentOperation: "update",
      assignmentId: "01984c7d-8500-7000-8000-000000000010",
      nextState: "assigned",
      recordStateTransition: true,
    },
  );
});

test("closed이면서 배정 없는 무효 상담은 새 배정을 만들고 assigned로 복원한다", () => {
  assert.equal(
    matchesRestorationAssignmentSnapshot(undefined, {
      id: null,
      assigneeUserId: null,
      assigneeMembershipId: null,
    }),
    true,
  );
  assert.deepEqual(
    planRestoredConsultation({
      currentState: "closed",
      assignmentId: null,
      targetAssignmentId: "01984c7d-8500-7000-8000-000000000012",
    }),
    {
      assignmentOperation: "insert",
      assignmentId: "01984c7d-8500-7000-8000-000000000012",
      nextState: "assigned",
      recordStateTransition: true,
    },
  );
});
