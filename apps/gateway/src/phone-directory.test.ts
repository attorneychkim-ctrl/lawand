import assert from "node:assert/strict";
import test from "node:test";

import { PgDialect } from "drizzle-orm/pg-core";

import {
  excludeOwnLegalFriendsCase,
  existingConsultationPhoneDirectoryCustomersQuery,
  existingPhoneDirectoryCustomersQuery,
  phoneDirectoryCustomersQuery,
} from "./phone-directory.js";

const dialect = new PgDialect();

test("전화번호 일괄조회는 배열을 record로 펼치지 않고 개별 파라미터 VALUES를 만든다", () => {
  const query = dialect.sqlToQuery(
    existingPhoneDirectoryCustomersQuery(["01011112222", "01033334444"]),
  );

  assert.match(query.sql, /values \(\$1\), \(\$2\)/);
  assert.doesNotMatch(query.sql, /unnest|::text\[\]/);
  assert.deepEqual(query.params, ["01011112222", "01033334444"]);
});

test("고객 상세 일괄조회는 입력 전화번호를 결과 행에 함께 보존한다", () => {
  const query = dialect.sqlToQuery(
    phoneDirectoryCustomersQuery(["01011112222", "01033334444"]),
  );

  assert.match(query.sql, /candidate\.phone as candidate_phone/);
  assert.match(query.sql, /cross join lateral/);
  assert.deepEqual(query.params, ["01011112222", "01033334444"]);
});

test("상담별 기존고객 조회는 같은 상담이 만든 사건을 제외한다", () => {
  const query = dialect.sqlToQuery(
    existingConsultationPhoneDirectoryCustomersQuery([
      {
        consultationId: "11111111-1111-4111-8111-111111111111",
        phone: "01011112222",
        ownCaseIdx: "1234",
      },
      {
        consultationId: "22222222-2222-4222-8222-222222222222",
        phone: "01033334444",
        ownCaseIdx: null,
      },
    ]),
  );

  assert.match(query.sql, /directory\.case_idx::text <> candidate\.own_case_idx/);
  assert.deepEqual(query.params, [
    "11111111-1111-4111-8111-111111111111",
    "01011112222",
    "1234",
    "22222222-2222-4222-8222-222222222222",
    "01033334444",
    null,
  ]);
});

test("이번 상담 사건만 일치하면 기존고객이 아니고 과거 사건이 남으면 기존고객이다", () => {
  const matches = [
    { caseIdx: 900, label: "과거 사건" },
    { caseIdx: 1234, label: "이번 상담 사건" },
  ];

  assert.deepEqual(excludeOwnLegalFriendsCase([matches[1]!], "1234"), []);
  assert.deepEqual(excludeOwnLegalFriendsCase(matches, "1234"), [matches[0]]);
  assert.deepEqual(excludeOwnLegalFriendsCase(matches, null), matches);
});

test("빈 전화번호 일괄조회는 잘못된 전체 조회를 만들지 않는다", () => {
  assert.throws(
    () => existingPhoneDirectoryCustomersQuery([]),
    /한 개 이상의 번호/,
  );
});
