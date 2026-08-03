import assert from "node:assert/strict";
import test from "node:test";

import {
  staffInvitationAcceptanceSchema,
  staffInvitationCreationSchema,
  staffLoginSchema,
} from "./staff.js";

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
