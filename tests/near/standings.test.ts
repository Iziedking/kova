import assert from "node:assert/strict";
import { test } from "node:test";
import { type RoundResult, type Stake, accountRound, applyRound, newBook, parseBook, rankPlayers, resultFromEvents, serializeBook } from "../../src/adapters/near/standings";

const ONE = 10n ** 18n;
const stake = (player: string, square: number, coins: number): Stake => ({ player, square, amount: BigInt(coins) * ONE });

test("a solo player's round matches the real testnet round 29910868", () => {
  // Five 10-CHIP stakes by one player; square 7 (index 6) won: 50 staked, 4 burned, 46 paid out.
  const stakes = [stake("u", 21, 10), stake("u", 6, 10), stake("u", 2, 10), stake("u", 3, 10), stake("u", 9, 10)];
  const result: RoundResult = { outcome: "settled", winningSquare: 6, total: 50n * ONE, burned: 4n * ONE, winners: [{ player: "u", staked: 10n * ONE, award: 46n * ONE }] };
  const [row] = accountRound(stakes, result)!;
  assert.deepEqual([row.staked, row.awarded, row.lost, row.burned, row.won], [50n * ONE, 46n * ONE, 40n * ONE, 4n * ONE, true]);
  assert.equal(row.awarded - row.staked, -4n * ONE, "net: the burn is the only loss when you are alone");
});

test("the burn is split by losing coins and always adds up exactly", () => {
  const stakes = [stake("a", 1, 30), stake("b", 2, 20), stake("c", 3, 7), stake("d", 6, 10)];
  const losingTotal = 57n * ONE;
  const burned = (losingTotal * 10n) / 100n; // 5.7 CHIP
  const result: RoundResult = { outcome: "settled", winningSquare: 6, total: 67n * ONE, burned, winners: [{ player: "d", staked: 10n * ONE, award: 10n * ONE + (losingTotal - burned) }] };
  const rows = accountRound(stakes, result)!;
  assert.equal(rows.reduce((s, r) => s + r.burned, 0n), burned, "shares add up to the round's burn");
  const a = rows.find((r) => r.player === "a")!;
  const b = rows.find((r) => r.player === "b")!;
  assert.ok(a.burned > b.burned, "who lost more burned more");
  assert.equal(rows.find((r) => r.player === "d")!.burned, 0n, "someone with nothing on losing squares burned nothing");
  // An awkward burn that does not divide evenly still adds up.
  const odd = accountRound([stake("x", 1, 1), stake("y", 2, 1), stake("z", 3, 1), stake("w", 4, 1)], { outcome: "settled", winningSquare: 4, total: 4n * ONE, burned: 1_000_000_000_000_000_001n, winners: [{ player: "w", staked: ONE, award: 4n * ONE }] })!;
  assert.equal(odd.reduce((s, r) => s + r.burned, 0n), 1_000_000_000_000_000_001n);
});

test("a winner's stakes on other squares count as lost and burned too", () => {
  const stakes = [stake("a", 1, 10), stake("a", 5, 10), stake("b", 2, 20)];
  const result: RoundResult = { outcome: "settled", winningSquare: 1, total: 40n * ONE, burned: 3n * ONE, winners: [{ player: "a", staked: 10n * ONE, award: 10n * ONE + 27n * ONE }] };
  const rows = accountRound(stakes, result)!;
  const a = rows.find((r) => r.player === "a")!;
  assert.equal(a.lost, 10n * ONE);
  assert.equal(a.won, true);
  assert.equal(rows.reduce((s, r) => s + r.burned, 0n), 3n * ONE);
});

test("refunded rounds count as played and refunded, with nothing won, lost or burned", () => {
  const stakes = [stake("a", 1, 10), stake("b", 2, 5)];
  const rows = accountRound(stakes, { outcome: "refunded", total: 15n * ONE })!;
  assert.ok(rows.every((r) => r.refunded && r.burned === 0n && r.lost === 0n && r.awarded === 0n));
});

test("a snapshot that does not match the settled round is refused, not guessed", () => {
  const stakes = [stake("a", 1, 10)];
  assert.equal(accountRound(stakes, { outcome: "refunded", total: 99n * ONE }), null, "different total");
  assert.equal(accountRound(stakes, { outcome: "settled", winningSquare: 1, total: 10n * ONE, burned: 0n, winners: [{ player: "a", staked: 3n * ONE, award: 10n * ONE }] }), null, "the winner's stake differs from the snapshot");
});

test("a round is counted once, and the book ranks players by rounds won across coins", () => {
  const book = newBook(1);
  const win = (token: string, round: number, winner: string, loser: string) =>
    applyRound(book, token, round, [stake(winner, 1, 10), stake(loser, 2, 10)], { outcome: "settled", winningSquare: 1, total: 20n * ONE, burned: 1n * ONE, winners: [{ player: winner, staked: 10n * ONE, award: 19n * ONE }] }, 2);
  assert.equal(win("chip", 100, "ann", "bob"), true);
  assert.equal(win("chip", 100, "ann", "bob"), false, "recording the same round twice changes nothing");
  win("jambo", 7, "ann", "cy");
  win("chip", 101, "bob", "ann");
  const ranked = rankPlayers(book);
  assert.deepEqual(ranked.map((r) => [r.rank, r.player, r.won, r.played]), [[1, "ann", 2, 3], [2, "bob", 1, 2], [3, "cy", 0, 1]]);
  const ann = ranked[0].byCoin.find((c) => c.token === "chip")!;
  assert.equal(ann.net, -1n * ONE, "she staked 20 over her two CHIP rounds and was paid 19: net -1");
  const total = Object.values(book.players).flatMap((c) => Object.values(c)).reduce((s, l) => s + l.burned, 0n);
  assert.equal(total, 3n * ONE, "the players' burns add up to what the three rounds burned");
});

test("the book survives being saved and loaded, and bad files are ignored", () => {
  const book = newBook(5);
  applyRound(book, "chip", 1, [stake("a", 1, 10), stake("b", 2, 10)], { outcome: "settled", winningSquare: 1, total: 20n * ONE, burned: ONE, winners: [{ player: "a", staked: 10n * ONE, award: 19n * ONE }] }, 9);
  const back = parseBook(serializeBook(book))!;
  assert.deepEqual(rankPlayers(back).map((r) => [r.player, r.won]), [["a", 1], ["b", 0]]);
  assert.equal(back.players.a.chip.awarded, 19n * ONE);
  assert.equal(parseBook("not json"), null);
  assert.equal(parseBook('{"nope":1}'), null);
});

test("a result is read back from the exact event shapes the mine logs", () => {
  // Copied from the real settle of testnet round 29910868.
  const settled = resultFromEvents([{ event: "round_settled", data: [{ round: 29910868, outcome: "settled", winning_square: 6, total: "50000000000000000000", burned: "4000000000000000000", vein: "0", players: 1, winners: [{ player: "u.testnet", staked: "10000000000000000000", award: "46000000000000000000" }] }] }]);
  assert.deepEqual(settled, { outcome: "settled", winningSquare: 6, total: 50n * ONE, burned: 4n * ONE, winners: [{ player: "u.testnet", staked: 10n * ONE, award: 46n * ONE }] });
  assert.deepEqual(resultFromEvents([{ event: "round_refunded", data: [{ round: 29910869, reason: "empty_square", total: "38000000000000000000", players: 2 }] }]), { outcome: "refunded", total: 38n * ONE });
  assert.equal(resultFromEvents([{ event: "burned", data: [{}] }]), null, "unrelated events are not a result");
});
