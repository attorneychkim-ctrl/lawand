import assert from "node:assert/strict";
import test from "node:test";

import {
  hashStaffPassword,
  verifyStaffPassword,
} from "./auth.js";

test("직원 비밀번호는 scrypt 해시로 검증된다", async () => {
  const encoded = await hashStaffPassword("correct horse battery staple");

  assert.match(encoded, /^scrypt\$/);
  assert.equal(
    await verifyStaffPassword("correct horse battery staple", encoded),
    true,
  );
  assert.equal(await verifyStaffPassword("wrong password", encoded), false);
  assert.equal(encoded.includes("correct horse battery staple"), false);
});

test("알 수 없는 비밀번호 해시 형식은 거부한다", async () => {
  assert.equal(await verifyStaffPassword("password", "plain$password"), false);
});
