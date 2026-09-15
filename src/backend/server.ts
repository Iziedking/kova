import { serve } from "@hono/node-server";
import { createBackendApp } from "./app";
import { loadBackendConfig } from "./config";
import { createEvidenceStore } from "./evidence-store";
import { startReconciliationScheduler } from "./reconciliation";

const config = loadBackendConfig();
const evidenceStore = createEvidenceStore(config.databaseUrl);
const app = createBackendApp(config, evidenceStore);
const stopReconciliation = startReconciliationScheduler(evidenceStore, config.reconciliationIntervalSeconds);

serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
});

console.info(JSON.stringify({
  event: "float_backend_started",
  host: config.host,
  port: config.port,
  mode: config.mode,
}));

process.once("SIGTERM", () => {
  stopReconciliation();
  void evidenceStore.close?.();
});
