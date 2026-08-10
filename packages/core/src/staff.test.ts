import assert from "node:assert/strict";
import test from "node:test";

import {
  centrexExtensionSchema,
  centrexLineNumberSchema,
  centrexPasswordSchema,
  staffCentrexLineUpdateSchema,
  staffInvitationAcceptanceSchema,
  staffInvitationCreationSchema,
  staffLoginSchema,
} from "./staff.js";

test("센트릭스 직원 회선은 전체 070 번호만 숫자로 정규화한다", () => {
  assert.equal(
    centrexLineNumberSchema.parse("070-4607-4591"),
    "07046074591",
  );
  assert.equal(centrexLineNumberSchema.safeParse("4591").success, false);
  assert.equal(
    centrexLineNumberSchema.safeParse("01012345678").success,
    false,
  );
});

test("센트릭스 내선번호는 전체 회선과 별도로 숫자만 받는다", () => {
  assert.equal(centrexExtensionSchema.parse("4535"), "4535");
  assert.equal(centrexExtensionSchema.safeParse("45-35").success, false);
  assert.equal(centrexExtensionSchema.safeParse("5").success, false);
});

test("센트릭스 비밀번호는 제어 문자 없이 메모리 입력만 받는다", () => {
  assert.equal(centrexPasswordSchema.parse("Employee-Pass!1"), "Employee-Pass!1");
  assert.equal(centrexPasswordSchema.safeParse("line\nbreak").success, false);
  assert.equal(centrexPasswordSchema.safeParse("").success, false);
});

test("센트릭스 회선·내선·검증 비밀번호를 함께 저장하거나 회선을 해제한다", () => {
  assert.deepEqual(
    staffCentrexLineUpdateSchema.parse({
      centrexLineNumber: "070-4607-4535",
      centrexExtension: "4535",
      centrexPassword: "Employee-Pass!1",
    }),
    {
      centrexLineNumber: "07046074535",
      centrexExtension: "4535",
      centrexPassword: "Employee-Pass!1",
    },
  );
  assert.equal(
    staffCentrexLineUpdateSchema.safeParse({
      centrexLineNumber: "07046074535",
      centrexExtension: null,
      centrexPassword: "Employee-Pass!1",
    }).success,
    false,
  );
  assert.equal(
    staffCentrexLineUpdateSchema.safeParse({
      centrexLineNumber: "07046074535",
      centrexExtension: "4535",
      centrexPassword: null,
    }).success,
    false,
  );
  assert.equal(
    staffCentrexLineUpdateSchema.safeParse({
      centrexLineNumber: null,
      centrexExtension: null,
      centrexPassword: null,
    }).success,
    true,
  );
});

test("직원 이메일은 공백 제거와 소문자 정규화를 거친다", () => {
  const login = staffLoginSchema.parse({
    email: " Staff.Member@LAWAND.test ",
    password: "not-validated-on-login",
  });

  assert.equal(login.email, "staff.member@lawand.test");
});

test("직원 초대 역할은 허용 목록만 받는다", () => {
  assert.equal(
    staffInvitationCreationSchema.safeParse({
      email: "staff@lawand.test",
      name: "로앤 직원",
      organization: "lawand",
      region: "seoul",
      department: "상담팀",
      jobTitle: "상담 담당자",
      role: "owner",
    }).success,
    false,
  );
});

test("초대 가입자는 회사 지정 프로필을 제출할 수 없다", () => {
  const result = staffInvitationAcceptanceSchema.safeParse({
    token: "a".repeat(43),
    password: "correct horse battery staple",
    displayName: "로앤 상담자",
  });

  assert.equal(result.success, false);
});

test("초대 비밀번호는 길이와 네 가지 문자 종류를 모두 요구한다", () => {
  const token = "a".repeat(43);

  assert.equal(
    staffInvitationAcceptanceSchema.safeParse({
      token,
      password: "lowercaseonlypassword",
    }).success,
    false,
  );
  assert.equal(
    staffInvitationAcceptanceSchema.safeParse({
      token,
      password: "SecurePass1!",
    }).success,
    true,
  );
});

test("직원 초대는 회사가 소속·지역·부서·직책을 모두 지정한다", () => {
  const result = staffInvitationCreationSchema.safeParse({
    email: "staff@lawand.test",
    name: "로앤 직원",
    organization: "lawand",
    region: "seoul",
    department: "",
    jobTitle: "상담 담당자",
    role: "full_time",
  });

  assert.equal(result.success, false);
});

test("리걸프렌즈 아이디와 member_idx는 관리자 초대에서 함께 받는다", () => {
  const base = {
    email: "staff@lawand.test",
    name: "로앤 직원",
    organization: "lawand",
    region: "seoul",
    department: "상담팀",
    jobTitle: "상담 담당자",
    role: "full_time",
  };
  assert.equal(
    staffInvitationCreationSchema.safeParse({
      ...base,
      legalFriendsId: "athene",
      legalFriendsMemberIdx: 138,
    }).success,
    true,
  );
  assert.equal(
    staffInvitationCreationSchema.safeParse({
      ...base,
      legalFriendsId: "wrong id",
      legalFriendsMemberIdx: 138,
    }).success,
    false,
  );
  assert.equal(
    staffInvitationCreationSchema.safeParse({
      ...base,
      legalFriendsId: "athene",
    }).success,
    false,
  );
});

test("직원 초대는 전체 센트릭스 회선번호를 선택적으로 받는다", () => {
  const base = {
    email: "staff@lawand.test",
    name: "로앤 직원",
    organization: "lawand",
    region: "seoul",
    department: "상담팀",
    jobTitle: "상담 담당자",
    role: "full_time",
  };
  const parsed = staffInvitationCreationSchema.parse({
    ...base,
    centrexLineNumber: "070-4607-4591",
    centrexExtension: "4591",
  });
  assert.equal(parsed.centrexLineNumber, "07046074591");
  assert.equal(parsed.centrexExtension, "4591");
  assert.equal(
    staffInvitationCreationSchema.safeParse({
      ...base,
      centrexLineNumber: "4591",
      centrexExtension: "4591",
    }).success,
    false,
  );
  assert.equal(
    staffInvitationCreationSchema.safeParse({
      ...base,
      centrexLineNumber: "07046074591",
    }).success,
    false,
  );
});
