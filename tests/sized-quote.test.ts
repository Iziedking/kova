import assert from "node:assert/strict";
import test from "node:test";
import { Connection } from "@solana/web3.js";
import { directedPriceHuman, readCandidateSizedQuote } from "../src/adapters/raydium-quote-read";
import { assessSizedQuote } from "../src/domain/sized-quote";

const baseObservation = {
  marketId: "nvdge-nvdax",
  poolId: "pool",
  inputMint: "input",
  outputMint: "output",
  inputDecimals: 9,
  outputDecimals: 8,
  amountInRaw: "1000000000",
  amountOutRaw: "250000000",
  minAmountOutRaw: "247500000",
  feeAmountRaw: "1000000",
  observedSlot: 10,
  observedAt: "2026-09-15T00:00:00.000Z",
  currentTick: 120,
  tickSpacing: 60,
  currentSqrtPriceX64: "18446744073709551616",
  executionSqrtPriceX64: "18400000000000000000",
  currentPriceHuman: "0.25",
  executionPriceHuman: "0.2475",
  availableTickArrayStarts: [0, 60],
  requiredTickArrayStarts: [0, 60],
  allTrade: true,
  source: "raydium_sdk" as const,
};

test("returns a non-executable complete read-only quote with explicit units", () => {
  const report = assessSizedQuote(baseObservation);

  assert.equal(report.status, "complete");
  assert.equal(report.executable, false);
  assert.equal(report.output.amountRaw, "250000000");
  assert.equal(report.priceBasis.rawUnit, "output base units per input base units");
  assert.deepEqual(report.blockers, []);
});

test("keeps the current price in output-per-input direction for mintB input", () => {
  assert.equal(directedPriceHuman("4173.154596787833", false), "0.000239626876");
  assert.equal(directedPriceHuman("0.000239626876", true), "0.000239626876");
});

test("blocks when sized tick-array coverage is incomplete", () => {
  const report = assessSizedQuote({
    ...baseObservation,
    availableTickArrayStarts: [0],
    requiredTickArrayStarts: [0, 60],
  });

  assert.equal(report.status, "incomplete");
  assert.equal(report.output.amountRaw, null);
  assert.deepEqual(report.coverage.missingTickArrayStarts, [60]);
  assert.match(report.blockers.join(" "), /tick arrays required/i);
});

test("blocks a partial Raydium traversal even when no missing start was identified", () => {
  const report = assessSizedQuote({
    ...baseObservation,
    allTrade: false,
    requiredTickArrayStarts: [0],
  });

  assert.equal(report.status, "incomplete");
  assert.equal(report.output.minAmountOutRaw, null);
  assert.match(report.blockers.join(" "), /full requested input/i);
});

test("rejects non-integer raw amounts without exposing a quote", () => {
  const report = assessSizedQuote({
    ...baseObservation,
    amountInRaw: "1.5",
  });

  assert.equal(report.status, "unknown");
  assert.equal(report.output.amountRaw, null);
  assert.match(report.blockers.join(" "), /positive integer base-unit/i);
});

test("rejects an invalid input mint before attempting an RPC read", async () => {
  const result = await readCandidateSizedQuote(new Connection("https://api.mainnet-beta.solana.com"), {
    inputMint: "not-a-solana-address",
    amountInRaw: "1",
  });

  assert.deepEqual(result, {
    ok: false,
    code: "QUOTE_INPUT_MINT_INVALID",
    message: "The requested input mint is not a valid Solana address.",
    retryable: false,
  });
});
