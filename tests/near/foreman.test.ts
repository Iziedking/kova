import assert from "node:assert/strict";
import { test } from "node:test";
import { FEED_SLOTS, FOREMAN_SQUARES_PER_ROUND, MAX_RECAP_CHARS, composeRecap, feedLeaf, feedSlot, pickSquares, stopReason } from "../../src/adapters/near/foreman";
import { parseFeed, type RoundSummary } from "../../src/adapters/near/grid";

const ONE = 10n ** 18n;
const ME = "foreman.test.testnet";

const settled = (over: Partial<RoundSummary> = {}): RoundSummary => ({
  round: 100, settled_at: 1, outcome: "settled", winning_square: 6, total: 120n * ONE, burned: 10n * ONE, vein: 0n, players: 3,
  winners: [{ player: "ann.testnet", staked: 40n * ONE, award: 100n * ONE }], ...over,
});

test("the Foreman's squares are repeatable, distinct and on the grid", () => {
  const a = pickSquares(ME, 29_910_900);
  assert.deepEqual(a, pickSquares(ME, 29_910_900), "same account and round, same squares");
  assert.equal(a.length, FOREMAN_SQUARES_PER_ROUND);
  assert.equal(new Set(a).size, a.length);
  assert.ok(a.every((s) => Number.isInteger(s) && s >= 0 && s < 25));
  assert.notDeepEqual(a, pickSquares(ME, 29_910_901), "a new round draws new squares (for this input)");
  assert.notDeepEqual(pickSquares("other.testnet", 29_910_900), a, "another account draws differently (for this input)");
});

test("every square is picked about equally often (no modulo bias)", () => {
  const counts = Array<number>(25).fill(0);
  for (let round = 0; round < 12_500; round += 1) for (const s of pickSquares(ME, round, 1)) counts[s] += 1;
  // 500 expected each; the standard deviation is about 22, so 5 of them is generous.
  assert.ok(counts.every((c) => c > 390 && c < 610), counts.join(","));
});

test("a recap says who won, what burned, and what the Foreman gained or lost", () => {
  const lost = composeRecap({ round: 100, record: settled(), account: ME, stakes: [{ square: 2, amount: 10n * ONE }, { square: 18, amount: 10n * ONE }], decimals: 18, symbol: "CHIP" });
  assert.match(lost, /^Round 100: square 7 won\./);
  assert.match(lost, /3 players staked 120 CHIP; 10 CHIP was burned\./);
  assert.match(lost, /The Foreman had 20 CHIP on squares 3 and 19 and lost it\.$/);
  const won = composeRecap({ round: 100, record: settled({ winners: [{ player: ME, staked: 10n * ONE, award: 45n * ONE }] }), account: ME, stakes: [{ square: 6, amount: 10n * ONE }, { square: 1, amount: 10n * ONE }], decimals: 18, symbol: "CHIP" });
  assert.match(won, /won 45 CHIP back \(\+25 CHIP against its stake, not counting CHIP minted for winners\)\.$/);
  const small = composeRecap({ round: 100, record: settled({ winners: [{ player: ME, staked: 10n * ONE, award: 19n * ONE }] }), account: ME, stakes: [{ square: 6, amount: 20n * ONE }], decimals: 18, symbol: "CHIP" });
  assert.match(small, /won 19 CHIP back \(-1 CHIP against its stake/);
});

test("refunds, missing records and sit-outs are described plainly", () => {
  const refund = composeRecap({ round: 7, record: settled({ outcome: "refunded", winning_square: null, burned: 0n }), account: ME, stakes: [{ square: 4, amount: 10n * ONE }], decimals: 18, symbol: "CHIP" });
  assert.match(refund, /refunded .* nothing burned\. The Foreman had 10 CHIP on square 5\.$/);
  assert.match(composeRecap({ round: 7, record: null, account: ME, stakes: [], decimals: 18, symbol: "CHIP" }), /no result was recorded\. The Foreman sat this round out\.$/);
});

test("a recap never exceeds the post limit and is a single leaf", () => {
  const long = composeRecap({ round: 1, record: settled(), account: ME, stakes: Array.from({ length: 40 }, (_, i) => ({ square: i % 25, amount: ONE })), decimals: 18, symbol: "A".repeat(40) });
  assert.ok(long.length <= MAX_RECAP_CHARS);
  assert.deepEqual(JSON.parse(feedLeaf(5, "hello")), { round: 5, text: "hello", by: "rule" });
});

test("recaps rotate through a fixed number of slots, so storage never grows", () => {
  const slots = new Set(Array.from({ length: 100 }, (_, i) => feedSlot(29_910_000 + i)));
  assert.equal(slots.size, FEED_SLOTS);
  assert.equal(feedSlot(10), feedSlot(10 + FEED_SLOTS));
});

test("the Foreman stops before it strands itself, and says why", () => {
  const ok = { nearYocto: 200n * 10n ** 21n, chipUnits: 100n * ONE, stakeUnits: 10n * ONE, squares: 2 };
  assert.equal(stopReason(ok), null);
  assert.match(stopReason({ ...ok, nearYocto: 85n * 10n ** 21n })!, /NEAR free; a stake needs 0\.09/);
  assert.match(stopReason({ ...ok, chipUnits: 15n * ONE })!, /only 15 CHIP left/);
});

test("the feed parser keeps valid recaps, newest first, and skips anything else", () => {
  const owner = "owner.testnet";
  const raw = {
    [owner]: { kova: { foreman: {
      r0: JSON.stringify({ round: 10, text: "ten", by: "rule" }),
      r1: JSON.stringify({ round: 12, text: "twelve", by: "rule" }),
      r2: "not json",
      r3: JSON.stringify({ round: "x", text: "bad round", by: "rule" }),
      r4: JSON.stringify({ round: 11, text: "eleven", by: "somebody" }),
      r5: JSON.stringify({ round: 9, text: "x".repeat(401), by: "rule" }),
    } } },
  };
  assert.deepEqual(parseFeed(raw, owner).map((p) => p.round), [12, 10]);
  assert.deepEqual(parseFeed({}, owner), []);
  assert.deepEqual(parseFeed(null, owner), []);
  assert.deepEqual(parseFeed({ [owner]: { kova: {} } }, owner), []);
  assert.deepEqual(parseFeed({ "someone.else": { kova: { foreman: { r0: JSON.stringify({ round: 1, text: "x", by: "rule" }) } } } }, owner), [], "only the Foreman's own namespace counts");
});
