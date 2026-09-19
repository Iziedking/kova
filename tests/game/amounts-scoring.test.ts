import assert from "node:assert/strict";
import test from "node:test";
import { checkedPot, decimalToPrice18, U64_MAX } from "../../src/domain/game/amounts";
import { allocatePot, calculateScoreBps, settleEqualStakeRound } from "../../src/domain/game/scoring";

const ZERO_WALLET = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

test("decimal parser scales plain strings exactly without floating point", () => {
  assert.equal(decimalToPrice18("123.456"), "123456000000000000000");
  assert.equal(decimalToPrice18("0"), "0");
  assert.throws(() => decimalToPrice18("1e3"), /plain decimal/);
  assert.throws(() => decimalToPrice18("-1"), /plain decimal/);
  assert.throws(() => decimalToPrice18("1.0000000000000000001"), /precision/);
  assert.throws(() => decimalToPrice18("1000001"), /bound/);
});

test("score uses signed integer bps and truncates toward zero", () => {
  assert.equal(calculateScoreBps(decimalToPrice18("100"), decimalToPrice18("112.345")), "1234");
  assert.equal(calculateScoreBps(decimalToPrice18("100"), decimalToPrice18("87.655")), "-1234");
  assert.equal(calculateScoreBps(decimalToPrice18("3"), decimalToPrice18("2")), "-3333");
  assert.throws(() => calculateScoreBps("0", "0"), /greater than zero/);
});

test("pot math is checked against u64", () => {
  assert.equal(checkedPot("50", 3), "150");
  assert.throws(() => checkedPot(U64_MAX.toString(), 2), /u64/);
});

test("tie remainder follows decoded wallet bytes, not input order", () => {
  const awards = allocatePot("101", [TOKEN_PROGRAM, ZERO_WALLET]);
  assert.equal(awards.get(ZERO_WALLET), "51");
  assert.equal(awards.get(TOKEN_PROGRAM), "50");
  assert.equal([...awards.values()].reduce((sum, value) => sum + BigInt(value), 0n), 101n);
});

test("settlement conserves the equal-stake pot", () => {
  const result = settleEqualStakeRound("100", [
    { wallet: ZERO_WALLET, startPrice18: decimalToPrice18("10"), endPrice18: decimalToPrice18("12") },
    { wallet: TOKEN_PROGRAM, startPrice18: decimalToPrice18("20"), endPrice18: decimalToPrice18("24") },
  ]);
  assert.equal(result.potRaw, "200");
  assert.equal(result.winningScoreBps, "2000");
  assert.equal(result.scores.reduce((sum, score) => sum + BigInt(score.awardRaw), 0n), 200n);
});
