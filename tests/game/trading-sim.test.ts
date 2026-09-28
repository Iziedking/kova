import assert from "node:assert/strict";
import test from "node:test";
import { applyTradeFill, createTradingLedger } from "../../src/domain/trading/ledger";
import {
  PRICE_SCALE,
  STARTING_CASH_MICRO_USD,
  buyFill,
  equityMicroUsd,
  movedAgainst,
  parsePrice18,
  pnlBps,
  portfolioIndex18,
  sellFill,
  valueMicroUsd,
} from "../../src/domain/trading/sim";
import { tradingCommitment } from "../../src/backend/game/trading-sim";

test("prices parse exactly, including sub-cent meme tokens", () => {
  assert.equal(parsePrice18("0.000003303"), 3_303_000_000_000n);
  assert.equal(parsePrice18("1.5"), 1_500_000_000_000_000_000n);
  assert.throws(() => parsePrice18("0"));
  assert.throws(() => parsePrice18("1e-6"));
});

test("a buy keeps full precision at $0.000003 and charges the 0.3% fee", () => {
  const price = parsePrice18("0.000003303");
  const fill = buyFill(1_000_000_000n, price); // $1,000
  assert.equal(fill.feeMicroUsd, 3_000_000n);
  assert.equal(fill.quoteMicroUsd, 997_000_000n);
  // Marked back at the same price, the position is worth the notional to within one micro-dollar.
  assert.ok(fill.quoteMicroUsd - valueMicroUsd(fill.quantityRaw, price) <= 1n);
});

test("selling almost everything sells the whole position", () => {
  const price = parsePrice18("2");
  const held = buyFill(100_000_000n, price).quantityRaw;
  assert.equal(sellFill(99_800_000n, price, held).quantityRaw, held);
  assert.throws(() => sellFill(1n, price, 0n));
});

test("a round trip through the ledger loses exactly the two fees", () => {
  const price = parsePrice18("0.5");
  let ledger = createTradingLedger({ competitionId: "t", playerId: "p", accountId: "a", startingCashMicroUsd: STARTING_CASH_MICRO_USD.toString() });
  const buy = buyFill(1_000_000_000n, price);
  ledger = applyTradeFill(ledger, { fillId: "1", competitionId: "t", playerId: "p", accountId: "a", txSignature: "sim:1", side: "buy", assetMint: "So11111111111111111111111111111111111111112", assetDecimals: 9, quantityRaw: buy.quantityRaw.toString(), quoteAmountMicroUsd: buy.quoteMicroUsd.toString(), feeMicroUsd: buy.feeMicroUsd.toString(), observedAt: new Date().toISOString() });
  const sell = sellFill(10_000_000_000n, price, buy.quantityRaw);
  ledger = applyTradeFill(ledger, { fillId: "2", competitionId: "t", playerId: "p", accountId: "a", txSignature: "sim:2", side: "sell", assetMint: "So11111111111111111111111111111111111111112", assetDecimals: 9, quantityRaw: sell.quantityRaw.toString(), quoteAmountMicroUsd: sell.quoteMicroUsd.toString(), feeMicroUsd: sell.feeMicroUsd.toString(), observedAt: new Date().toISOString() });
  assert.equal(ledger.positions.length, 0);
  assert.equal(STARTING_CASH_MICRO_USD - BigInt(ledger.cashMicroUsd), buy.feeMicroUsd + sell.feeMicroUsd);
});

test("the escrow score is the portfolio return", () => {
  assert.equal(portfolioIndex18(STARTING_CASH_MICRO_USD), PRICE_SCALE);
  assert.equal(portfolioIndex18(STARTING_CASH_MICRO_USD * 3n / 2n), PRICE_SCALE * 3n / 2n);
  assert.equal(portfolioIndex18(0n), 1n, "a wiped-out portfolio still scores as a positive price");
  assert.equal(pnlBps(11_000_000_000n), 1_000n);
  assert.equal(equityMicroUsd(5_000_000n, [{ quantityRaw: 2_000_000_000n, price18: parsePrice18("3") }]), 11_000_000n);
});

test("a fill is refused when the price moved more than 2% against the player", () => {
  const quoted = parsePrice18("1");
  assert.equal(movedAgainst("buy", quoted, parsePrice18("1.019")), false);
  assert.equal(movedAgainst("buy", quoted, parsePrice18("1.03")), true);
  assert.equal(movedAgainst("sell", quoted, parsePrice18("0.97")), true);
  assert.equal(movedAgainst("sell", quoted, parsePrice18("1.5")), false);
});

test("trading commitments are fixed per table and wallet", () => {
  const first = tradingCommitment("4e637306-cbd2-40e3-9b6f-4da5fc61543a", "79vnYjBdDYGUfPUEsQWXjgaSE4oprSUHN6GUisSLNhn6");
  assert.match(first.commitment, /^[0-9a-f]{64}$/);
  assert.deepEqual(first, tradingCommitment("4e637306-cbd2-40e3-9b6f-4da5fc61543a", "79vnYjBdDYGUfPUEsQWXjgaSE4oprSUHN6GUisSLNhn6"));
  assert.notEqual(first.commitment, tradingCommitment("4e637306-cbd2-40e3-9b6f-4da5fc61543a", "3HWCn9VmRM9JVUUBycCuHCZDmRLZBXtnZ3sDkLf5F2Sr").commitment);
});
