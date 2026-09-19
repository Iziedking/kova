import { serve } from "@hono/node-server";
import { createBackendApp } from "./app";
import { loadBackendConfig } from "./config";
import { createEvidenceStore } from "./evidence-store";
import { startReconciliationScheduler } from "./reconciliation";
import { PostgresGameRepository } from "./game/postgres-repository";
import { PrivyGameAuthVerifier } from "./game/auth";
import { parsePickKeyring } from "./game/pick-crypto";
import type { GameRouterRuntime } from "./game/routes";
import { OrchestrationRepository } from "./workers/orchestration-repository";
import type { BackendOperationalProbe } from "./app";

const config = loadBackendConfig();
const evidenceStore = createEvidenceStore(config.databaseUrl);
const gameRepository = config.gameEnabled
  ? new PostgresGameRepository(config.databaseUrl as string)
  : null;
const gameRuntime: GameRouterRuntime | undefined = gameRepository === null ? undefined : {
  repository: gameRepository,
  auth: new PrivyGameAuthVerifier(config.privyAppId as string, config.privyAppSecret as string),
  keyring: parsePickKeyring(config.pickKeyId as string, config.pickEncryptionKey as string, config.pickPreviousEncryptionKeys),
  allowedOrigins: config.allowedOrigins,
  stakeMint: config.ansemMint as string,
  events: new OrchestrationRepository(gameRepository.pool),
};
let draining = false;
const requiredMigrations = ["0001_float_evidence.sql", "0002_kova_game.sql", "0003_kova_dealer.sql", "0004_kova_worker.sql"] as const;
const operationalProbe: BackendOperationalProbe | undefined = gameRepository === null ? undefined : {
  isDraining: () => draining,
  checkDependencies: async () => {
    const result = await gameRepository.pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = ANY($1::text[])",
      [[...requiredMigrations]],
    );
    const applied = new Set(result.rows.map((row) => row.name));
    const missing = requiredMigrations.filter((name) => !applied.has(name));
    return {
      database: "ready",
      migrations: missing.length === 0 ? "ready" : "incomplete",
      readyToAdmit: missing.length === 0,
      readyToRecover: missing.length === 0,
      reasons: missing.map((name) => `MIGRATION_MISSING:${name}`),
    };
  },
};
const app = createBackendApp(config, evidenceStore, gameRuntime, operationalProbe);
const stopReconciliation = startReconciliationScheduler(evidenceStore, config.reconciliationIntervalSeconds);

const httpServer = serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
});

console.info(JSON.stringify({
  event: "kova_backend_started",
  host: config.host,
  port: config.port,
  mode: config.mode,
}));

async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  if (draining) return;
  draining = true;
  console.info(JSON.stringify({ event: "kova_backend_draining", signal }));
  stopReconciliation();
  let forced = false;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      forced = true;
      if ("closeAllConnections" in httpServer) httpServer.closeAllConnections();
      resolve();
    }, 30_000);
    timeout.unref();
    httpServer.close(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
  const closed = await Promise.allSettled([evidenceStore.close?.(), gameRepository?.close()]);
  const closeFailures = closed.filter((result) => result.status === "rejected").length;
  console.info(JSON.stringify({ event: "kova_backend_stopped", signal, forced, closeFailures }));
  if (forced || closeFailures > 0) process.exitCode = 1;
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
