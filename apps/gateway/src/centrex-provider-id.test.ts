import assert from "node:assert/strict";
import test from "node:test";

import {
  areCentrexProviderIdsRelated,
  normalizeCentrexProviderReference,
} from "./centrex-provider-id.js";

test("U+ sentinel source 식별자는 provider 상관키로 사용하지 않는다", () => {
  for (const value of [undefined, null, "", "0", "NONE", "none", "NULL", "UNKNOWN", "NIL"]) {
    assert.equal(normalizeCentrexProviderReference(value), null);
  }
  assert.equal(
    normalizeCentrexProviderReference(" 1786502776.3124030 "),
    "1786502776.3124030",
  );
});

test("같은 U+ root의 exact 또는 인접 sequence만 sibling으로 인정한다", () => {
  assert.equal(
    areCentrexProviderIdsRelated(
      "1786502776.3124029",
      "1786502776.3124030",
    ),
    true,
  );
  assert.equal(
    areCentrexProviderIdsRelated(
      "1786490370.3081117",
      "1786490370.3081118",
    ),
    true,
  );
  assert.equal(
    areCentrexProviderIdsRelated(
      "1786490370.3081116",
      "1786490370.3081118",
    ),
    false,
  );
  assert.equal(
    areCentrexProviderIdsRelated(
      "1786490370.3081117",
      "1786490371.3081118",
    ),
    false,
  );
  assert.equal(areCentrexProviderIdsRelated("opaque-a", "opaque-b"), false);
});
