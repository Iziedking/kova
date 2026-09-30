import assert from "node:assert/strict";
import test from "node:test";
import { applyHouseRisk, brainPrompt, HOUSE_RULES, parseBrainReply, rulesStrategy, type HouseMatch, type HousePick } from "../../src/backend/game/house-trader";

const GME = "8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB";
const UBER = "UBERxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1";
const THIN = "THINxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1";
const picks: HousePick[] = [
  { symbol: "GME", mint: GME, priceUsd: 0.01, change24hPct: 12, volume24hUsd: 90_000, liquidityUsd: 120_000 },
  { symbol: "UBER", mint: UBER, priceUsd: 0.02, change24hPct: 4, volume24hUsd: 40_000, liquidityUsd: 60_000 },
  { symbol: "THIN", mint: THIN, priceUsd: 0.5, change24hPct: 80, volume24hUsd: 500_000, liquidityUsd: 3_000 },
];
const flat: HouseMatch = { cashUsd: 10_000, equityUsd: 10_000, pnlPct: 0, positions: [], msLeft: 200_000 };

test("brain replies parse from bare or fenced JSON, and anything else is rejected", () => {
  assert.deepEqual(parseBrainReply('{"view":"hold","actions":[]}'), { view: "hold", orders: [] });
  const fenced = parseBrainReply('Here you go:\n```json\n{"view":"GME runs","actions":[{"side":"buy","token":"' + GME + '","usd":1500,"reason":"momentum"}]}\n```');
  assert.equal(fenced?.orders[0]?.usd, 1500);
  assert.equal(parseBrainReply("I think GME is good"), null);
  assert.equal(parseBrainReply('{"actions":[{"side":"short","token":"x","usd":1}]}'), null, "unknown sides are refused");
  assert.equal(parseBrainReply('{"actions":[{"side":"buy","token":"x","usd":-5}]}'), null);
});

test("the risk rules cap order size, exposure, positions and illiquid tokens", () => {
  const { executable, refused } = applyHouseRisk([
    { side: "buy", mint: GME, usd: 5_000, reason: "" },
    { side: "buy", mint: THIN, usd: 500, reason: "" },
    { side: "buy", mint: UBER, usd: 3_000, reason: "" },
    { side: "buy", mint: GME, usd: 3_000, reason: "" },
  ], flat, picks);
  assert.deepEqual(executable.map((order) => order.usd), [2_000, 2_000, 2_000], "each buy is capped at 20% of equity");
  assert.equal(refused.length, 1);
  assert.match(refused[0]!.why, /liquidity/);
  const full = applyHouseRisk([{ side: "buy", mint: UBER, usd: 2_000, reason: "" }], { ...flat, cashUsd: 4_000, positions: [{ symbol: "GME", mint: GME, costUsd: 6_000, valueUsd: 6_000 }] }, picks);
  assert.equal(full.executable.length, 0, "60% of equity already in tokens");
});

test("after the stop-loss the House may only sell, and never more than it holds", () => {
  const down: HouseMatch = { cashUsd: 8_000, equityUsd: 9_650, pnlPct: -3.5, positions: [{ symbol: "GME", mint: GME, costUsd: 2_000, valueUsd: 1_650 }], msLeft: 100_000 };
  const { executable, refused } = applyHouseRisk([
    { side: "buy", mint: UBER, usd: 500, reason: "" },
    { side: "sell", mint: GME, usd: 5_000, reason: "" },
    { side: "sell", mint: UBER, usd: 100, reason: "" },
  ], down, picks);
  assert.deepEqual(executable, [{ side: "sell", mint: GME, usd: 1648.35, reason: "" }]);
  assert.deepEqual(refused.map((item) => item.why.split(":")[0]), ["stop-loss", "not held"]);
});

test("the fallback rule buys the strongest liquid mover once, then holds", () => {
  const first = rulesStrategy(flat, picks);
  assert.equal(first.orders[0]?.mint, GME, "THIN moves more but is too thin");
  assert.equal(first.orders[0]?.usd, 10_000 * HOUSE_RULES.maxOrderShare);
  assert.deepEqual(rulesStrategy({ ...flat, positions: [{ symbol: "GME", mint: GME, costUsd: 2_000, valueUsd: 2_000 }] }, picks).orders, []);
});

test("the brain prompt carries the rules and the state, and asks for JSON only", () => {
  const prompt = brainPrompt(flat, picks);
  assert.match(prompt, /Reply with JSON only/);
  assert.match(prompt, /Do not use any tools/);
  assert.match(prompt, new RegExp(GME));
});
