import assert from "node:assert/strict";
import test from "node:test";
import { PHASE00_CANDIDATE } from "../src/domain/phase00-feasibility";
import { buildFloatMonitorReport } from "../src/domain/float-monitor";

const baseInput = {
  market: PHASE00_CANDIDATE,
  supplyBaseUnits: "9523195027478",
  observedPoolInventoryRaw: "195814172577",
  tickSpacing: 1,
  stockMintAuthority: "7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj",
  stockFreezeAuthority: "JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs",
  stockTokenExtensions: ["TransferHook", "PausableConfig"],
  observedSlot: 447274132,
  observedAt: "2026-09-15T14:35:28.778Z",
  source: "solana_rpc" as const,
};

test("captures one pool vault while warning that it is not issuer-wide float", () => {
  const result = buildFloatMonitorReport(baseInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "captured");
  assert.equal(result.value.inventoryCoverage, "single_pool_vault");
  assert.deepEqual(result.value.stockTokenExtensions, ["PausableConfig", "TransferHook"]);
  assert.match(result.value.warnings[0], /one inspected pool vault/i);
  assert.match(result.value.doesNotProve[1], /freely redeemable/i);
});

test("keeps the monitor unknown when the pool vault balance is unavailable", () => {
  const result = buildFloatMonitorReport({ ...baseInput, observedPoolInventoryRaw: null });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "unknown");
  assert.equal(result.value.inventoryCoverage, "unavailable");
  assert.equal(result.value.observedPoolInventoryRaw, null);
});

test("rejects malformed supply instead of treating it as zero inventory", () => {
  const result = buildFloatMonitorReport({ ...baseInput, supplyBaseUnits: "9.5" });
  assert.deepEqual(result, {
    ok: false,
    code: "INVALID_FLOAT_MONITOR_INPUT",
    message: "Mint supply must be a non-negative raw integer.",
    retryable: false,
  });
});
