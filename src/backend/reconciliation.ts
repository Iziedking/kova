/** Fixture reconciliation proof for Group 2. It has no chain or wallet side effects. Reviewed 2026-09-15. */
import { buildInitialStockCheck } from "./fixtures";
import { hashEvidence, snapshotId, type EvidenceSnapshot } from "./evidence";
import type { EvidenceStore } from "./evidence-store";

export async function reconcileInitialStockCheck(store: EvidenceStore, marketId = "nvdge-nvdax") {
  const result = buildInitialStockCheck(marketId);
  if (!result.ok) return result;
  const report = result.value;
  const reportHash = hashEvidence(report);
  const snapshot: EvidenceSnapshot<typeof report> = {
    id: snapshotId("stock_check", marketId, reportHash),
    kind: "stock_check",
    subjectId: marketId,
    reportHash,
    source: "fixture:initial-stock-check-v1",
    slot: null,
    observedAt: report.checkedAt,
    expiresAt: new Date(Date.parse(report.checkedAt) + 300_000).toISOString(),
    payload: report,
  };
  const stored = await store.put(snapshot);
  return { ok: true as const, value: { ...stored, reportHash } };
}

export function startReconciliationScheduler(store: EvidenceStore, intervalSeconds: number): () => void {
  let running = false;
  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    const startedAt = Date.now();
    try {
      const result = await reconcileInitialStockCheck(store);
      console.info(JSON.stringify({ event: "evidence_reconciliation", source: "fixture:initial-stock-check-v1", subjectId: "nvdge-nvdax", latencyMs: Date.now() - startedAt, result: result.ok ? "ok" : "refused", replayed: result.ok ? result.value.replayed : undefined, reportHash: result.ok ? result.value.reportHash : undefined }));
    } catch (error: unknown) {
      console.error(JSON.stringify({ event: "evidence_reconciliation_failed", source: "fixture:initial-stock-check-v1", subjectId: "nvdge-nvdax", latencyMs: Date.now() - startedAt, message: error instanceof Error ? error.message : "Unknown error" }));
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalSeconds * 1000);
  timer.unref?.();
  return () => clearInterval(timer);
}
