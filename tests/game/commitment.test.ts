import assert from "node:assert/strict";
import test from "node:test";
import { buildPickCommitmentPayload, buildSealedMarketPayload, createPickCommitment, createSealedMarketHash } from "../../src/domain/game/commitment";

const vector = {
  tableId: "018f7f5e-7b1a-4d40-8a41-8dd5f8108f02",
  wallet: "11111111111111111111111111111111",
  mint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  pairMint: "So11111111111111111111111111111111111111112",
  saltHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  rulesHashHex: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
} as const;

test("commitment payloads use fixed-width canonical bytes", () => {
  assert.equal(buildPickCommitmentPayload(vector).length, 124);
  assert.equal(buildSealedMarketPayload(vector).length, 190);
});

test("commitment hashes are deterministic fixed vectors", async () => {
  assert.equal(await createPickCommitment(vector), "08a068f87b3ecba7716b36d8b1f1991f85c32815cc5c64c33d54a5df618c2e97");
  assert.equal(await createSealedMarketHash(vector), "a6dfd8667fc06c64b773c5c7c997189a12b9fc08874439d2aa2b7f503416e93d");
});

test("commitment construction rejects malformed fixed-width fields", () => {
  assert.throws(() => buildPickCommitmentPayload({ ...vector, saltHex: "00" }), /32 bytes/);
  assert.throws(() => buildPickCommitmentPayload({ ...vector, wallet: "not-base58" }), /invalid character|32-byte/);
  assert.throws(() => buildPickCommitmentPayload({ ...vector, tableId: "not-a-uuid" }), /UUID/);
});
