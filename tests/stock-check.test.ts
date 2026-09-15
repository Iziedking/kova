import assert from "node:assert/strict";
import test from "node:test";
import { PHASE00_CANDIDATE } from "../src/domain/phase00-feasibility";
import { runStockCheck, type StockCheckInput } from "../src/domain/stock-check";

function healthyInput(overrides: Partial<StockCheckInput> = {}): StockCheckInput {
  return {
    market: PHASE00_CANDIDATE,
    issuer: {
      name: "xStocks",
      approvalStatus: "verified",
      approvedTokenAddress: PHASE00_CANDIDATE.stockMint,
      source: "fixture:issuer-approval-v1",
    },
    eligibility: {
      status: "eligible",
      jurisdiction: "unrestricted",
      limitations: [],
      source: "fixture:eligibility-v1",
    },
    reference: {
      source: "fixture:stock-reference-v1",
      priceBaseUnits: "310000000",
      observedAt: "2026-09-15T06:00:00.000Z",
      freshnessSeconds: 30,
      maxFreshnessSeconds: 300,
    },
    inventory: {
      availableBaseUnits: "1000000000",
      redeemability: "verified",
    },
    liquidity: {
      poolAddress: PHASE00_CANDIDATE.pool,
      depthBaseUnits: "1000000000",
      minimumDepthBaseUnits: "100000000",
      estimatedPriceImpactBps: 45,
      maximumPriceImpactBps: 100,
    },
    volatility: {
      stockMoveBps: 120,
      memeMoveBps: 260,
      divergenceBps: 80,
      maximumDivergenceBps: 500,
    },
    checkedAt: "2026-09-15T06:00:30.000Z",
    ...overrides,
  };
}

test("passes only when stock identity, inventory, depth, and divergence evidence all pass", () => {
  const result = runStockCheck(healthyInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "pass");
  assert.equal(result.value.liquidity.thinLiquidity, "low");
  assert.deepEqual(result.value.blockers, []);
});

test("blocks a stock pair whose fixed campaign size exceeds thin stock-side liquidity", () => {
  const result = runStockCheck(healthyInput({
    liquidity: {
      poolAddress: PHASE00_CANDIDATE.pool,
      depthBaseUnits: "50000000",
      minimumDepthBaseUnits: "100000000",
      estimatedPriceImpactBps: 45,
      maximumPriceImpactBps: 100,
    },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "blocked");
  assert.equal(result.value.liquidity.thinLiquidity, "high");
  assert.match(result.value.blockers.join(" "), /depth/i);
});

test("does not turn reported inventory into verified redeemability", () => {
  const result = runStockCheck(healthyInput({
    inventory: { availableBaseUnits: "1000000000", redeemability: "reported" },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "unknown");
  assert.equal(result.value.inventory.status, "unknown");
  assert.match(result.value.warnings.join(" "), /reported/i);
});

test("reports the exact stock token address and refuses to upgrade reported issuer evidence", () => {
  const result = runStockCheck(healthyInput({
    issuer: {
      name: "xStocks",
      approvalStatus: "reported",
      approvedTokenAddress: PHASE00_CANDIDATE.stockMint,
      source: "fixture:stock-identity-v1",
    },
    eligibility: {
      status: "unknown",
      jurisdiction: "unknown",
      limitations: ["Jurisdiction coverage is unavailable."],
      source: null,
    },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.stock.tokenAddress, PHASE00_CANDIDATE.stockMint);
  assert.equal(result.value.issuer.status, "unknown");
  assert.equal(result.value.eligibility.evidenceStatus, "unknown");
  assert.match(result.value.warnings.join(" "), /issuer|jurisdiction/i);
});

test("blocks an issuer record that points at a different token address", () => {
  const result = runStockCheck(healthyInput({
    issuer: {
      name: "xStocks",
      approvalStatus: "verified",
      approvedTokenAddress: PHASE00_CANDIDATE.token1.mint,
      source: "fixture:issuer-approval-v1",
    },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "blocked");
  assert.match(result.value.blockers.join(" "), /different token address/i);
});

test("keeps jurisdiction-limited eligibility unknown instead of treating it as globally eligible", () => {
  const result = runStockCheck(healthyInput({
    eligibility: {
      status: "restricted",
      jurisdiction: "limited",
      limitations: ["Not available in restricted jurisdictions."],
      source: "fixture:eligibility-v1",
    },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "unknown");
  assert.equal(result.value.eligibility.evidenceStatus, "unknown");
  assert.match(result.value.warnings.join(" "), /jurisdiction/i);
});

test("blocks stale reference data before underwriting can approve a campaign", () => {
  const result = runStockCheck(healthyInput({
    reference: {
      source: "fixture:stock-reference-v1",
      priceBaseUnits: "310000000",
      observedAt: "2026-09-15T05:00:00.000Z",
      freshnessSeconds: 301,
      maxFreshnessSeconds: 300,
    },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "blocked");
  assert.match(result.value.blockers.join(" "), /stale/i);
});

test("rejects divergence above the hard limit", () => {
  const result = runStockCheck(healthyInput({
    volatility: {
      stockMoveBps: 120,
      memeMoveBps: 260,
      divergenceBps: 501,
      maximumDivergenceBps: 500,
    },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "blocked");
  assert.match(result.value.blockers.join(" "), /diverge/i);
});

test("rejects malformed base-unit input instead of guessing its unit", () => {
  const result = runStockCheck(healthyInput({
    reference: {
      source: "fixture:stock-reference-v1",
      priceBaseUnits: "310.22",
      observedAt: "2026-09-15T06:00:00.000Z",
      freshnessSeconds: 30,
      maxFreshnessSeconds: 300,
    },
  }));
  assert.deepEqual(result, {
    ok: false,
    code: "INVALID_STOCK_CHECK_INPUT",
    message: "Reference price must be a non-negative base-unit integer.",
    retryable: false,
  });
});

test("rejects malformed inventory base units instead of treating them as unavailable", () => {
  const result = runStockCheck(healthyInput({
    inventory: { availableBaseUnits: "1.25", redeemability: "reported" },
  }));
  assert.deepEqual(result, {
    ok: false,
    code: "INVALID_STOCK_CHECK_INPUT",
    message: "Inventory must be a non-negative base-unit integer.",
    retryable: false,
  });
});

test("rejects reference evidence observed after the check timestamp", () => {
  const result = runStockCheck(healthyInput({
    reference: {
      source: "fixture:stock-reference-v1",
      priceBaseUnits: "310000000",
      observedAt: "2026-09-15T06:01:00.000Z",
      freshnessSeconds: 30,
      maxFreshnessSeconds: 300,
    },
  }));
  assert.deepEqual(result, {
    ok: false,
    code: "INVALID_STOCK_CHECK_INPUT",
    message: "Reference observation time cannot be after the stock check time.",
    retryable: false,
  });
});
