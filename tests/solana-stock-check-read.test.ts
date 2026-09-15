import assert from "node:assert/strict";
import test from "node:test";
import { marketById } from "../src/domain/market-catalog";
import { buildFinalizedStockCheckInput } from "../src/adapters/solana-stock-check-read";
import type { FloatMonitorReport } from "../src/domain/float-monitor";
import { runStockCheck } from "../src/domain/stock-check";

const market = marketById("nvdge-nvdax");
assert.ok(market);

const monitor: FloatMonitorReport = {
  kind: "float_monitor",
  marketId: market.id,
  stock: {
    symbol: market.stockSymbol,
    mint: market.stockMint,
    programId: market.stockProgramId,
    decimals: market.stockDecimals,
  },
  rawSupply: "32127806196274",
  observedPoolInventoryRaw: "8156081068",
  tickSpacing: 1,
  inventoryCoverage: "single_pool_vault",
  stockMintAuthority: "11111111111111111111111111111111",
  stockFreezeAuthority: "11111111111111111111111111111111",
  stockTokenExtensions: ["FreezeAccount", "TransferHook"],
  observedSlot: 447277536,
  observedAt: "2026-09-15T14:35:28.778Z",
  source: "solana_rpc",
  status: "captured",
  warnings: ["The inventory value covers one inspected pool vault, not issuer-wide redeemable float."],
  doesNotProve: [
    "issuer solvency or legal ownership of the underlying stock asset",
    "total mint supply is freely redeemable inventory",
    "inventory outside the inspected pool vault",
    "organic trading or future LP profitability",
  ],
};

test("preserves exact live token identity while leaving unsupported stock evidence unknown", () => {
  const result = runStockCheck(buildFinalizedStockCheckInput(market, monitor));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "unknown");
  assert.equal(result.value.stock.tokenAddress, market.stockMint);
  assert.equal(result.value.stock.programId, market.stockProgramId);
  assert.equal(result.value.stock.decimals, market.stockDecimals);
  assert.equal(result.value.issuer.approvalStatus, "unknown");
  assert.equal(result.value.issuer.approvedTokenAddress, null);
  assert.equal(result.value.eligibility.evidenceStatus, "unknown");
  assert.equal(result.value.reference.status, "unknown");
  assert.equal(result.value.inventory.availableBaseUnits, monitor.observedPoolInventoryRaw);
  assert.equal(result.value.inventory.redeemability, "unknown");
  assert.equal(result.value.liquidity.estimatedPriceImpactBps, null);
  assert.equal(result.value.volatility.status, "unknown");
  assert.match(result.value.warnings.join(" "), /jurisdiction|reference|redeemability|volatility/i);
});

test("does not treat one pool vault as issuer-wide stock inventory", () => {
  const input = buildFinalizedStockCheckInput(market, { ...monitor, observedPoolInventoryRaw: null, inventoryCoverage: "unavailable", status: "unknown" });
  assert.equal(input.inventory.availableBaseUnits, null);
  assert.equal(input.inventory.redeemability, "unknown");
  assert.equal(input.liquidity.depthBaseUnits, null);
});
