import assert from "node:assert/strict";
import test from "node:test";
import { reviewPositionIntent } from "../src/domain/position-intent";

const wallet = "11111111111111111111111111111111";
const base = { wallet, marketId: "nvdge-nvdax", campaignId: "campaign-nvdge-week-01", capitalUsdMicro: "500000000", maxSlippageBps: 100, tickLower: 172000, tickUpper: 173000, expiresAt: "2099-09-15T06:00:00.000Z", phase00Status: "blocked" as const, phase00ReportHash: "a".repeat(64), phase00ObservedAt: "2099-09-15T05:59:00.000Z", quoteStatus: "incomplete" as const, quoteReportHash: null, quoteObservedAt: null };

test("blocked phase 00 yields a review without transaction bytes", () => {
  const result = reviewPositionIntent(base);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "blocked");
  assert.equal(result.value.signingAllowed, false);
  assert.equal(result.value.transactionBase64, null);
  assert.match(result.value.blockers.join(" "), /complete sized quote/i);
});

test("position review rejects invalid wallet and non-integer capital", () => {
  const invalidWallet = reviewPositionIntent({ ...base, wallet: "not-a-wallet" });
  assert.equal(invalidWallet.ok, false);
  const invalidCapital = reviewPositionIntent({ ...base, capitalUsdMicro: "1.5" });
  assert.equal(invalidCapital.ok, false);
});

test("position review stays blocked when a quote is stale or its evidence hash is missing", () => {
  const result = reviewPositionIntent({
    ...base,
    phase00Status: "ready",
    phase00ObservedAt: "2026-09-15T05:00:00.000Z",
    quoteStatus: "complete",
    quoteObservedAt: "2026-09-15T05:59:00.000Z",
    quoteReportHash: null,
  }, Date.parse("2026-09-15T06:00:00.000Z"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "blocked");
  assert.match(result.value.blockers.join(" "), /five-minute|hash/i);
  assert.equal(result.value.signingAllowed, false);
  assert.equal(result.value.transactionBase64, null);
});

test("fresh complete evidence yields a review ready for simulation but never signing", () => {
  const result = reviewPositionIntent({
    ...base,
    phase00Status: "ready",
    phase00ObservedAt: "2026-09-15T05:59:00.000Z",
    quoteStatus: "complete",
    quoteReportHash: "b".repeat(64),
    quoteObservedAt: "2026-09-15T05:59:30.000Z",
  }, Date.parse("2026-09-15T06:00:00.000Z"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "ready_for_simulation");
  assert.equal(result.value.signingAllowed, false);
  assert.equal(result.value.transactionBase64, null);
  assert.equal(result.value.evidence.quoteReportHash, "b".repeat(64));
});
