/** Run the deterministic Group 2 evidence reconciliation proof. Reviewed 2026-09-15. */
import { loadBackendConfig } from "../src/backend/config";
import { createEvidenceStore } from "../src/backend/evidence-store";
import { reconcileInitialStockCheck } from "../src/backend/reconciliation";

const store = createEvidenceStore(loadBackendConfig().databaseUrl);

async function main(): Promise<void> {
  const first = await reconcileInitialStockCheck(store);
  const second = await reconcileInitialStockCheck(store);
  console.log(JSON.stringify({ first, second, proves: "The same fixture produces the same report hash and replay is idempotent.", doesNotProve: "Live inventory, redeemability, chain execution, or PostgreSQL availability without a configured database." }, null, 2));
  await store.close?.();
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: "reconciliation_failed", message: error instanceof Error ? error.message : "Unknown error" }));
  process.exitCode = 1;
});
