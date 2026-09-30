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
import { DealerDeskService } from "./game/dealer-desk";
import { AgentAwareAuth, AgentService } from "./game/agents";
import { HouseDesk, HouseTrader } from "./game/house-trader";
import { PointsService } from "./game/points";

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
// Player-owned agents play through the GET agent API; see agents.ts.
const agentService = gameRepository && keyring ? new AgentService({
  pool: gameRepository.pool,
  repository: gameRepository,
  keyring,
  origin: config.allowedOrigins[0] ?? "https://kova.surf",
  connection: config.chain ? new Connection(config.chain.rpcUrl, "confirmed") : null,
  stakeMint: config.ansemMint ?? null,
  fundVault: chainService && config.chain?.network === "solana-devnet"
    ? async (principalId, wallet) => {
      const granted = await chainService.grantTestTokens(principalId, wallet);
      return granted.ok ? { ok: true } : { ok: false, code: granted.code };
    }
    : undefined,
}) : undefined;
const privyAuth = gameRepository === null ? null : new PrivyGameAuthVerifier(config.privyAppId as string, config.privyAppSecret as string);
const gameAuth = privyAuth && agentService ? new AgentAwareAuth(privyAuth, agentService) : privyAuth;
const socialService = gameRepository && gameAuth ? new SocialService({ pool: gameRepository.pool, auth: gameAuth }) : undefined;
const playerHub = gameRepository && socialService ? new PlayerHubService({
  pool: gameRepository.pool,
  social: socialService,
  connection: config.chain ? new Connection(config.chain.rpcUrl, "confirmed") : null,
  stakeMint: config.ansemMint ?? null,
  network: config.chain?.network ?? "preview",
}) : undefined;
const pointsService = gameRepository ? new PointsService({ pool: gameRepository.pool }) : undefined;
const gameRuntime: GameRouterRuntime | undefined = gameRepository === null || gameAuth === null ? undefined : {
  repository: gameRepository,
  auth: gameAuth,
  social: socialService,
  hub: playerHub,
  relay: gameRepository && config.chain ? new TxRelay({ pool: gameRepository.pool, connection: new Connection(config.chain.rpcUrl, "confirmed") }) : undefined,
  dealerDesk: gameRepository ? new DealerDeskService({ pool: gameRepository.pool }) : undefined,
  agents: agentService,
  points: pointsService,
  houseDesk: gameRepository && socialService ? new HouseDesk({ pool: gameRepository.pool, social: socialService, brainConfigured: config.house.brain !== null, enabled: config.house.enabled }) : undefined,
  agentApiBaseUrl: process.env.KOVA_PUBLIC_API_URL ?? "https://api.kova.surf",
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
const requiredMigrations = ["0001_float_evidence.sql", "0002_kova_game.sql", "0003_kova_dealer.sql", "0004_kova_worker.sql", "0005_kova_trading_core.sql", "0006_kova_chain_game.sql", "0007_kova_trading_sim.sql", "0008_kova_profiles.sql", "0009_kova_challenges.sql", "0010_kova_dealer_log.sql", "0011_kova_agents.sql", "0012_kova_house.sql", "0013_kova_points.sql"] as const;
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

// Points follow settled games; a sync is idempotent, so a missed minute is caught up by the next.
const pointsTimer = pointsService ? setInterval(() => {
  if (!draining) void pointsService.sync().catch((error: unknown) => console.error(JSON.stringify({ event: "points_sync_failed", message: error instanceof Error ? error.message.slice(0, 200) : "unknown" })));
}, 60_000) : null;

// The House trader: one tick every 30 s, playing through the agent API like any player's agent.
const HOUSE_TICK_MS = 30_000;
let houseTimer: ReturnType<typeof setInterval> | null = null;
if (config.house.enabled && agentService && gameRepository && chainService && tradingService) {
  void (async () => {
    try {
      const owner = await gameRepository.principalForPrivyUser("system:kova-house");
      const house = new HouseTrader({
        pool: gameRepository.pool,
        agents: agentService,
        ownerPrincipalId: owner.id,
        call: (path, init) => app.request(path, init),
        brain: config.house.brain ? new ClawPumpAdmissionClient(config.house.brain) : null,
      });
      const agent = await house.start();
      console.info(JSON.stringify({ event: "house", step: "started", username: agent.username, vault: agent.vaultWallet, brain: config.house.brain ? "clawpump" : "rules" }));
      houseTimer = setInterval(() => { if (!draining) void house.tick(); }, HOUSE_TICK_MS);
    } catch (error) {
      console.error(JSON.stringify({ event: "house", step: "start_failed", message: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    }
  })();
}

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
  if (houseTimer) clearInterval(houseTimer);
  if (pointsTimer) clearInterval(pointsTimer);
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
