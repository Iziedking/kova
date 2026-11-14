import assert from "node:assert/strict";
import { test } from "node:test";
import { GAS, GRID_CHIP, SQUARES, estimateWin, stakeCall, formatUnits, parseUnits, roundOf, shortAccount, squareCol, squareNumber, squareRow, squareShare } from "../../src/adapters/near/grid";

const ONE = 10n ** 18n;

test("amounts are formatted with the coin's own decimals and trailing zeros dropped", () => {
  assert.equal(formatUnits(0n, 18), "0");
  assert.equal(formatUnits(ONE, 18), "1");
  assert.equal(formatUnits(1_500_000_000_000_000_000n, 18), "1.5");
  assert.equal(formatUnits(1_234_567n * ONE, 18), "1,234,567");
  assert.equal(formatUnits(46_600_000_000_000_000_000n, 18), "46.6");
  assert.equal(formatUnits(123n, 2), "1.23");
  assert.equal(formatUnits(5n * 10n ** 24n, 24), "5", "a 24-decimal coin");
  assert.equal(formatUnits(-ONE, 18), "-1");
  // More digits than asked for are cut, not rounded up, so a balance never shows more than it has.
  assert.equal(formatUnits(1_999_999_999_999_999_999n, 18), "1.99");
});

test("typed amounts become exact units, and anything else is refused", () => {
  assert.equal(parseUnits("12.5", 18), 12_500_000_000_000_000_000n);
  assert.equal(parseUnits("1", 18), ONE);
  assert.equal(parseUnits(" 3 ", 18), 3n * ONE);
  assert.equal(parseUnits("0.000000000000000001", 18), 1n);
  assert.equal(parseUnits("1", 0), 1n);
  assert.equal(parseUnits("1.5", 0), null, "a coin with no decimals has no fractions");
  assert.equal(parseUnits("0.0000000000000000001", 18), null, "a 19th digit would be lost");
  for (const bad of ["", "-1", "1e3", "abc", "1,5", "1.", ".5", "1 2", "0x10"]) assert.equal(parseUnits(bad, 18), null, JSON.stringify(bad));
  const round = parseUnits("123.456", 18)!;
  assert.equal(formatUnits(round, 18, 3), "123.456");
});

test("a round is one UTC minute", () => {
  assert.equal(roundOf(0), 0);
  assert.equal(roundOf(59), 0);
  assert.equal(roundOf(60), 1);
  assert.equal(roundOf(1_794_649_260), 29_910_821, "the round seen on testnet");
});

test("the grid is 5 by 5 and squares are numbered 1 to 25 for people", () => {
  assert.equal(SQUARES, 25);
  assert.equal(squareNumber(0), 1);
  assert.equal(squareNumber(24), 25);
  assert.deepEqual([squareRow(0), squareCol(0)], [0, 0]);
  assert.deepEqual([squareRow(7), squareCol(7)], [1, 2]);
  assert.deepEqual([squareRow(24), squareCol(24)], [4, 4]);
  const seen = new Set(Array.from({ length: SQUARES }, (_, i) => `${squareRow(i)},${squareCol(i)}`));
  assert.equal(seen.size, 25, "every square has its own place");
});

test("a square's share is its part of the round, and empty rounds have none", () => {
  const empty = Array<bigint>(SQUARES).fill(0n);
  assert.equal(squareShare(empty, 3), 0);
  const totals = [...empty];
  totals[3] = 30n * ONE;
  totals[9] = 10n * ONE;
  assert.equal(squareShare(totals, 3), 0.75);
  assert.equal(squareShare(totals, 9), 0.25);
  assert.equal(squareShare(totals, 0), 0);
});

test("the win estimate matches the contract's rule: stake back, 90% of losing coins by stake, 10% burned", () => {
  // The numbers of testnet round 29910799 in the CHIP mine: 491 staked, 46.6 burned (floor of 10% of 466).
  const totals = Array<bigint>(SQUARES).fill(0n);
  totals[10] = 25n * ONE;
  totals[2] = 466n * ONE;
  const { award, burned } = estimateWin(totals, 10, 0n);
  assert.equal(burned, 46_600_000_000_000_000_000n);
  assert.equal(award, 0n, "no stake, no award");
  // Alone on a square with 100 on it, staking 100 more takes 90% of everything else.
  const other = Array<bigint>(SQUARES).fill(0n);
  other[1] = 200n * ONE;
  const win = estimateWin(other, 5, 100n * ONE);
  assert.equal(win.burned, 20n * ONE);
  assert.equal(win.award, 100n * ONE + 180n * ONE);
  // A 3-way split by stake never pays out more than the pot less the burn.
  const t = Array<bigint>(SQUARES).fill(0n);
  t[4] = 30n * ONE;
  t[8] = 90n * ONE;
  const mine = estimateWin(t, 4, 10n * ONE);
  assert.ok(mine.award <= 10n * ONE + (90n * ONE * 9n) / 10n);
});

test("long account ids are shortened with both ends kept", () => {
  assert.equal(shortAccount("ada.testnet"), "ada.testnet");
  const long = "chip-kova-v3-mwg6hrmb-testnet.factory.kova-v3-mwg6hrmb.testnet";
  const short = shortAccount(long);
  assert.ok(short.length <= 22);
  assert.ok(short.startsWith("chip-kova"));
  assert.ok(short.endsWith("b.testnet"));
});

test("staking CHIP goes through mine_deploy with no deposit, so a game key can sign it", () => {
  const call = stakeCall({ token: GRID_CHIP, mine: "chip-mine.factory.test", square: 7, units: 10n * ONE, round: 29_910_860 });
  assert.equal(call.contractId, GRID_CHIP);
  assert.equal(call.method, "mine_deploy");
  assert.equal(call.deposit, 0n);
  assert.deepEqual(call.args, { mine: "chip-mine.factory.test", square: 7, amount: "10000000000000000000", round: "29910860" });
  assert.ok(call.gas >= 70_000_000_000_000n, "CHIP refuses mine_deploy under 70 Tgas");
  assert.equal(call.gas, GAS.mineDeploy);
});

test("staking any other coin is a transfer_call with 1 yoctoNEAR to the mine", () => {
  const call = stakeCall({ token: "jambo.test", mine: "jambo-mine.factory.test", square: 0, units: 3n * ONE, round: 5 });
  assert.equal(call.contractId, "jambo.test");
  assert.equal(call.method, "ft_transfer_call");
  assert.equal(call.deposit, 1n);
  assert.equal(call.args.receiver_id, "jambo-mine.factory.test");
  assert.equal(call.args.amount, "3000000000000000000");
  assert.deepEqual(JSON.parse(call.args.msg as string), { square: 0, round: 5 });
});
