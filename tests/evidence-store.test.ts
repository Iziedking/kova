import assert from "node:assert/strict";
import test from "node:test";
import { buildInitialStockCheck } from "../src/backend/fixtures";
import { freshnessFor, hashEvidence, snapshotId, type EvidenceSnapshot } from "../src/backend/evidence";
import { MemoryEvidenceStore } from "../src/backend/evidence-store";
import { reconcileInitialStockCheck } from "../src/backend/reconciliation";

test("hashEvidence is stable when object key order changes", () => {
  assert.equal(hashEvidence({ b: 2, a: 1 }), hashEvidence({ a: 1, b: 2 }));
});

test("replaying the same reconciliation is idempotent", async () => {
  const store = new MemoryEvidenceStore();
  const first = await reconcileInitialStockCheck(store);
  const second = await reconcileInitialStockCheck(store);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.value.reportHash, second.value.reportHash);
  assert.equal(first.value.replayed, false);
  assert.equal(second.value.replayed, true);
});

test("latest snapshot is labelled stale after its expiry", async () => {
  const result = buildInitialStockCheck("nvdge-nvdax");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const reportHash = hashEvidence(result.value);
  const snapshot: EvidenceSnapshot = {
    id: snapshotId("stock_check", "nvdge-nvdax", reportHash),
    kind: "stock_check",
    subjectId: "nvdge-nvdax",
    reportHash,
    source: "test",
    slot: null,
    observedAt: "2026-09-15T06:00:00.000Z",
    expiresAt: "2026-09-15T06:05:00.000Z",
    payload: result.value,
  };
  const store = new MemoryEvidenceStore();
  await store.put(snapshot);
  const latest = await store.latest("stock_check", "nvdge-nvdax", new Date("2026-09-15T06:05:00.001Z"));
  assert.equal(latest?.freshness, "stale");
});

test("freshness is unknown when no expiry is available", () => {
  assert.equal(freshnessFor(null), "unknown");
});
