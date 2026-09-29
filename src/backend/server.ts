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
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { KovaProgramClient } from "../adapters/game/kova-program";
import { ClawPumpAdmissionClient } from "../adapters/game/clawpump";
import { ChainGameService } from "./game/chain-game";
import { GameJobRepository } from "./workers/job-repository";
import { GameWorker } from "./workers/runner";
import { MarketFeed } from "../adapters/game/market-feed";
import { TradingSimService } from "./game/trading-sim";
import { SocialService } from "./game/social";
import { PlayerHubService } from "./game/player-hub";
import { TxRelay } from "./game/tx-relay";

/** Signing keys live in 0600 files outside the repository; never in environment values or logs. */
function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

const config = loadBackendConfig();
const evidenceStore = createEvidenceStore(config.databaseUrl);
const gameRepository = config.gameEnabled
  ? new PostgresGameRepository(config.databaseUrl as string)
  : null;
const keyring = gameRepository === null ? null : parsePickKeyring(config.pickKeyId as string, config.pickEncryptionKey as string, config.pickPreviousEncryptionKeys);
const orchestration = gameRepository === null ? null : new OrchestrationRepository(gameRepository.pool);
const jobRepository = gameRepository === null ? null : new GameJobRepository(gameRepository.pool);
const marketFeed = new MarketFeed();
const tradingService = gameRepository && config.chain ? new TradingSimService({ pool: gameRepository.pool, feed: marketFeed }) : undefined;
const chainService = gameRepository && keyring && orchestration && jobRepository && config.chain
  ? new ChainGameService({
    pool: gameRepository.pool,
    repository: gameRepository,
    client: new KovaProgramClient({
      connection: new Connection(config.chain.rpcUrl, "confirmed"),
      stakeMint: new PublicKey(config.ansemMint as string),
      creator: loadKeypair(config.chain.operatorKeypairPath),
      oracle: loadKeypair(config.chain.oracleKeypairPath),
      admission: loadKeypair(config.chain.admissionKeypairPath),
    }),
    keyring,
    jobs: jobRepository,
    orchestration,
    network: config.chain.network,
    evidenceConnection: new Connection(config.solanaRpcUrl as string, "finalized"),
    dealer: config.dealer ? new ClawPumpAdmissionClient(config.dealer) : null,
    dealerToolBudget: config.dealer?.toolBudget ?? 0,
    roundSeconds: config.chain.roundSeconds,
    trading: tradingService,
  })
  : undefined;
const gameAuth = gameRepository === null ? null : new PrivyGameAuthVerifier(config.privyAppId as string, config.privyAppSecret as string);
const socialService = gameRepository && gameAuth ? new SocialService({ pool: gameRepository.pool, auth: gameAuth }) : undefined;
const playerHub = gameRepository && socialService ? new PlayerHubService({
  pool: gameRepository.pool,
  social: socialService,
  connection: config.chain ? new Connection(config.chain.rpcUrl, "confirmed") : null,
  stakeMint: config.ansemMint ?? null,
  network: config.chain?.network ?? "preview",
}) : undefined;
const gameRuntime: GameRouterRuntime | undefined = gameRepository === null || gameAuth === null ? undefined : {
  repository: gameRepository,
  auth: gameAuth,
  social: socialService,
  hub: playerHub,
  relay: gameRepository && config.chain ? new TxRelay({ pool: gameRepository.pool, connection: new Connection(config.chain.rpcUrl, "confirmed") }) : undefined,
  keyring: keyring as NonNullable<typeof keyring>,
  allowedOrigins: config.allowedOrigins,
  stakeMint: config.ansemMint as string,
  events: orchestration as OrchestrationRepository,
  chain: chainService,
  trading: tradingService,
};
const gameWorker = chainService && jobRepository ? new GameWorker({
  repository: jobRepository,
  workerId: `kova-worker-${process.pid}`,
  handlers: {
    capture_start: (job) => chainService.handleJob(job),
    capture_end: (job) => chainService.handleJob(job),
    expire_table: (job) => chainService.handleJob(job),
  },
  leaseMs: 90_000,
  retryDelayMs: 5_000,
}) : null;
let draining = false;
const requiredMigrations = ["0001_float_evidence.sql", "0002_kova_game.sql", "0003_kova_dealer.sql", "0004_kova_worker.sql", "0005_kova_trading_core.sql", "0006_kova_chain_game.sql", "0007_kova_trading_sim.sql", "0008_kova_profiles.sql", "0009_kova_challenges.sql"] as const;
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
const app = createBackendApp(config, evidenceStore, gameRuntime, operationalProbe, marketFeed, true);
const stopReconciliation = startReconciliationScheduler(evidenceStore, config.reconciliationIntervalSeconds);

// One job at a time; a job that fails is retried after its delay, and every chain step is idempotent.
const workerLoop = gameWorker === null ? null : (async () => {
  while (!draining) {
    try {
      const outcome = await gameWorker.runOne();
      if (outcome === "failed") console.warn(JSON.stringify({ event: "kova_worker_job_failed" }));
      if (outcome !== "completed") await new Promise((resolve) => setTimeout(resolve, 1_000));
    } catch (error) {
      console.error(JSON.stringify({ event: "kova_worker_error", message: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
})();

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
  chain: config.chain?.network ?? "disabled",
  dealer: config.dealer ? "clawpump" : "disabled",
}));

async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  if (draining) return;
  draining = true;
  console.info(JSON.stringify({ event: "kova_backend_draining", signal }));
  stopReconciliation();
  gameWorker?.stop();
  await workerLoop;
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
