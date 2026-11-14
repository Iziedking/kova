import assert from "node:assert/strict";
import { test } from "node:test";
import { failureMessage } from "../../src/adapters/near/chip";
import { GAS, GRID_CHIP, RPC_BUSY, limitWarnings, plainUnits, suggestLimits, isMissingMethod, needsRegistration, registrationCall, SQUARES, estimateWin, friendlyFailure, lowBalanceMessage, nearNeededFor, stakeCall, formatUnits, parseUnits, roundOf, shortAccount, squareCol, squareNumber, squareRow, squareShare } from "../../src/adapters/near/grid";

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

test("a refusal for too little NEAR reads as a sentence, and other errors pass through", () => {
  const raw = "Not enough balance for u1.p2.testnet (balance: 80406197493134200000000, cost: 80919888078603000000000)";
  const text = friendlyFailure(raw);
  assert.match(text, /0\.0804 NEAR free/);
  assert.match(text, /needs about 0\.0809/);
  assert.ok(!text.includes("80406197493134200000000"), "no raw yocto in what a person reads");
  assert.equal(friendlyFailure("Round closed"), "Round closed");
});

test("the NEAR an account must hold matches what the chain asked for", () => {
  // Measured on testnet: an 80 Tgas call refused an account holding 0.0804 NEAR because it needed 0.0809.
  assert.ok(nearNeededFor(GAS.mineDeploy, 0n) >= 80_919_888_078_603_000_000_000n, "never asks for less than the chain did");
  assert.ok(nearNeededFor(GAS.mineDeploy, 0n) < 85n * 10n ** 21n, "and not far more");
  assert.equal(nearNeededFor(GAS.mineDeploy, 5n) - nearNeededFor(GAS.mineDeploy, 0n), 5n);
});

test("the low-NEAR sentence reaches the screen intact", () => {
  const sentence = lowBalanceMessage(80_406_197_493_134_200_000_000n, 80_919_888_078_603_000_000_000n);
  assert.equal(failureMessage(sentence), sentence);
  assert.equal(failureMessage("something unknown"), "The transaction failed.");
});

test("an RPC rate limit is not reported as a failed transaction", () => {
  for (const detail of ["Exceeded 2 providers to execute request", "ProviderError: 429", "Rate limits exceeded"]) {
    assert.equal(friendlyFailure(detail), RPC_BUSY, detail);
    assert.equal(failureMessage(friendlyFailure(detail)), RPC_BUSY);
  }
});

test("a balance refusal inside the failover wrapper is reported as a balance problem, not a busy network", () => {
  const wrapped = "Exceeded 2 providers to execute request Not enough balance for a.testnet (balance: 130400801102101700000000, cost: 150918998531804500000000) ProviderError: 429";
  const text = friendlyFailure(wrapped);
  assert.match(text, /0\.1304 NEAR free/);
  assert.match(text, /needs about 0\.1509/);
  assert.notEqual(text, RPC_BUSY);
});

test("registering a mine with its coin is a NEP-145 storage_deposit for the mine, paid by the caller", () => {
  const call = registrationCall({ token: "nene-2250.meme-cooking.near", mine: "nene-2250-meme-cooking-near.factory.near", min: 1_250_000_000_000_000_000_000n });
  assert.equal(call.contractId, "nene-2250.meme-cooking.near", "sent to the coin, not to the mine");
  assert.equal(call.method, "storage_deposit");
  assert.deepEqual(call.args, { account_id: "nene-2250-meme-cooking-near.factory.near", registration_only: true });
  assert.equal(call.deposit, 1_250_000_000_000_000_000_000n, "exactly the token's minimum, 0.00125 NEAR");
  assert.equal(call.gas, GAS.register);
});

test("only an unregistered account needs registering, and a token without storage management needs nothing", () => {
  assert.equal(needsRegistration("unregistered"), true);
  assert.equal(needsRegistration({ total: 1n, available: 0n }), false);
  assert.equal(needsRegistration("unsupported"), false, "no NEP-145 means no registration step");
});

test("a missing method is told apart from a network failure", () => {
  assert.equal(isMissingMethod(new Error('wasm execution failed with error: MethodResolveError(MethodNotFound)')), true);
  assert.equal(isMissingMethod(Object.assign(new Error("Exceeded 2 providers"), { errors: [new Error("Method storage_balance_of not found")] })), true);
  assert.equal(isMissingMethod(new Error("Exceeded 2 providers to execute request")), false, "a rate limit is not a missing method");
  assert.equal(isMissingMethod(new Error("Rate limits exceeded")), false);
});

test("limits are suggested from the coin's supply: cautious, round, and never below one coin", () => {
  // A billion coins with 18 decimals: at most 10,000 per player per round, smallest stake 20.
  const big = suggestLimits(1_000_000_000n * ONE, 18)!;
  assert.equal(big.max, 10_000n * ONE);
  assert.equal(big.min, 20n * ONE);
  // 24 decimals (BRRRAIN-like) works the same in coins.
  const wide = suggestLimits(1_000_000_000n * 10n ** 24n, 24)!;
  assert.equal(wide.max, 10_000n * 10n ** 24n);
  // A tiny supply still gets at least one whole coin as the largest stake, and a valid smallest stake.
  const tiny = suggestLimits(11_714n * ONE, 18)!;
  assert.equal(tiny.max, ONE);
  assert.ok(tiny.min >= 1n && tiny.min <= tiny.max);
  assert.equal(suggestLimits(0n, 18), null);
  // The suggestion never warns about itself.
  assert.deepEqual(limitWarnings({ ...big, supply: 1_000_000_000n * ONE, symbol: "X" }), []);
});

test("odd limits get a plain-words warning, and sensible ones get none", () => {
  const supply = 1_000_000_000n * ONE;
  const risky = limitWarnings({ min: ONE, max: 20_000_000n * ONE, supply, symbol: "NENE" });
  assert.match(risky[0], /more than 1% of all NENE/);
  const high = limitWarnings({ min: 1_000n * ONE, max: 2_000_000n * ONE, supply, symbol: "NENE" });
  assert.match(high[0], /more than 0\.1% of all NENE/);
  assert.equal(high.length, 1, "the two supply warnings do not stack");
  const gap = limitWarnings({ min: 1n, max: 10_000n * ONE, supply, symbol: "NENE" });
  assert.ok(gap.some((w) => /tiny next to the largest/.test(w)));
  assert.deepEqual(limitWarnings({ min: 20n * ONE, max: 10_000n * ONE, supply, symbol: "NENE" }), []);
  assert.deepEqual(limitWarnings({ min: 1n, max: 5n, supply: null, symbol: "X" }), [], "an unknown supply cannot be judged");
});

test("amounts for input boxes have no separators and round-trip through the parser", () => {
  assert.equal(plainUnits(10_000n * ONE, 18), "10000");
  assert.equal(plainUnits(1_500_000_000_000_000_000n, 18), "1.5");
  assert.equal(plainUnits(2_000_000_000_000_000n, 18), "0.002");
  for (const v of [1n, ONE, 20n * ONE, 123_456_789n]) assert.equal(parseUnits(plainUnits(v, 18), 18), v);
});
