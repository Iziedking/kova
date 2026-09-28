import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { canonicalChecksum, recordedChecksumMatches } from "../src/backend/db/migrate";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const lf = "CREATE TABLE a (id int);\nCREATE INDEX a_id ON a (id);\n";
const crlf = lf.replace(/\n/g, "\r\n");

test("the canonical checksum ignores line endings", () => {
  assert.equal(canonicalChecksum(lf), canonicalChecksum(crlf));
  assert.equal(canonicalChecksum(lf), sha(lf));
});

test("a checksum recorded from a CRLF checkout matches the same SQL checked out with LF", () => {
  assert.equal(recordedChecksumMatches(sha(crlf), lf), true);
  assert.equal(recordedChecksumMatches(sha(lf), crlf), true);
  assert.equal(recordedChecksumMatches(sha(lf), lf), true);
});

test("any real change to an applied migration is still refused", () => {
  const edited = lf.replace("id int", "id bigint");
  assert.equal(recordedChecksumMatches(sha(lf), edited), false);
  assert.equal(recordedChecksumMatches(sha(crlf), edited), false);
  assert.equal(recordedChecksumMatches(sha(crlf), edited.replace(/\n/g, "\r\n")), false);
});
