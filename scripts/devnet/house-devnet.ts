/**
 * Devnet proof of the KOVA House trader.
 *
 * Throwaway PostgreSQL, real routes, real settlement worker, real devnet program, live prices.
 * The House opens its "Beat the House" lobby; a challenger agent finds it and stakes; the House
 * seats itself, trades under its risk rules, the worker settles on chain, winnings are claimed,
 * and the public House record shows the match and every decision.
 *
 * The brain is a ClawPump agent when CLAWPUMP_API_KEY and KOVA_HOUSE_AGENT_ID are set, else the
 * momentum rule. Run on host-service:
 *   KOVA_DEVNET_SECRETS_DIR=~/kova-secrets/devnet npx tsx scripts/devnet/house-devnet.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { Pool } from "pg";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createBackendApp } from "../../src/backend/app";
import { loadBackendConfig } from "../../src/backend/config";
import { MemoryEvidenceStore } from "../../src/backend/evidence-store";
import { runMigrations } from "../../src/backend/db/migrate";
import { PostgresGameRepository } from "../../src/backend/game/postgres-repository";
import { parsePickKeyring } from "../../src/backend/game/pick-crypto";
import { ChainGameService } from "../../src/backend/game/chain-game";
import { TradingSimService } from "../../src/backend/game/trading-sim";
import { TxRelay } from "../../src/backend/game/tx-relay";
import { SocialService } from "../../src/backend/game/social";
import { AgentAwareAuth, AgentService } from "../../src/backend/game/agents";
import { HouseDesk, HouseTrader } from "../../src/backend/game/house-trader";
import { OrchestrationRepository } from "../../src/backend/workers/orchestration-repository";
import { GameJobRepository } from "../../src/backend/workers/job-repository";
import { GameWorker } from "../../src/backend/workers/runner";
import { KovaProgramClient } from "../../src/adapters/game/kova-program";
import { MarketFeed } from "../../src/adapters/game/market-feed";
import { ClawPumpAdmissionClient } from "../../src/adapters/game/clawpump";

const DEVNET_RPC = process.env.KOVA_DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
const SECRETS = process.env.KOVA_DEVNET_SECRETS_DIR as string;
const ORIGIN = "http://localhost:3000";

const key = (name: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(SECRETS, `${name}.json`), "utf8")) as number[]));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port")));
    });
  });
}

async function main(): Promise<void> {
  if (!SECRETS) throw new Error("Set KOVA_DEVNET_SECRETS_DIR.");
  const connection = new Connection(DEVNET_RPC, "confirmed");
  if (await connection.getGenesisHash() !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("Refusing to run: not devnet.");
  const operator = key("operator");
  if (await connection.getBalance(operator.publicKey) < 1.2 * LAMPORTS_PER_SOL) throw new Error("Operator is below the faucet reserve.");
  const stakeMint = new PublicKey(readFileSync(join(SECRETS, "test-ansem-mint.txt"), "utf8").trim());
  const brain = process.env.CLAWPUMP_API_KEY && process.env.KOVA_HOUSE_AGENT_ID
    ? new ClawPumpAdmissionClient({ apiKey: process.env.CLAWPUMP_API_KEY, agentId: process.env.KOVA_HOUSE_AGENT_ID, model: process.env.KOVA_HOUSE_MODEL ?? "openai/gpt-5.4-mini" })
    : null;

  const port = await freePort();
  const container = `kova-house-${randomUUID().slice(0, 8)}`;
  const password = randomBytes(18).toString("hex");
  const pool = new Pool({ connectionString: `postgresql://postgres:${password}@127.0.0.1:${port}/kova_test`, max: 8 });
  execFileSync("docker", ["run", "--rm", "--detach", "--name", container, "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=kova_test", "--publish", `127.0.0.1:${port}:5432`, "postgres:16.15-alpine3.24@sha256:3c5c8892d184f738f4fe282d14ddaa613a38f00f4189d2d94725ebe6f2909ddb"], { stdio: "pipe" });
  try {
    for (let attempt = 0; ; attempt += 1) {
      try { await pool.query("SELECT 1"); break; } catch { if (attempt > 60) throw new Error("Postgres did not start."); await sleep(500); }
    }
    await runMigrations(pool);

    const repository = new PostgresGameRepository("postgresql://unused", pool);
    const keyring = parsePickKeyring("devnet-house", randomBytes(32).toString("base64"));
    const orchestration = new OrchestrationRepository(pool);
    const jobs = new GameJobRepository(pool);
    const trading = new TradingSimService({ pool, feed: new MarketFeed() });
    const chain = new ChainGameService({
      pool, repository, keyring, jobs, orchestration, network: "solana-devnet",
      client: new KovaProgramClient({ connection, stakeMint, creator: operator, oracle: key("oracle"), admission: key("admission") }),
      evidenceConnection: connection, dealer: null, dealerToolBudget: 0, roundSeconds: 90, trading,
    });
    const agents = new AgentService({
      pool, repository, keyring, origin: ORIGIN, connection, stakeMint: stakeMint.toBase58(),
      fundVault: async (principalId, wallet) => {
        const granted = await chain.grantTestTokens(principalId, wallet);
        return granted.ok ? { ok: true } : { ok: false, code: granted.code };
      },
    });
    const owners = new Map([["owner-c", "did:privy:house-challenger-owner"]]);
    const auth = new AgentAwareAuth({ verifyBearer: async (token) => owners.has(token) ? { privyUserId: owners.get(token) as string } : null }, agents);
    const social = new SocialService({ pool, auth });
    const houseDesk = new HouseDesk({ pool, social, brainConfigured: brain !== null, enabled: true });
    const app = createBackendApp(loadBackendConfig({ KOVA_ALLOWED_ORIGINS: ORIGIN }), new MemoryEvidenceStore(), {
      repository, auth, keyring, allowedOrigins: [ORIGIN], stakeMint: stakeMint.toBase58(), events: orchestration, chain, trading, social,
      relay: new TxRelay({ pool, connection }), agents, agentApiBaseUrl: "http://localhost", houseDesk,
    });

    const houseOwner = await repository.principalForPrivyUser("system:kova-house");
    const logs: Record<string, unknown>[] = [];
    const house = new HouseTrader({ pool, agents, ownerPrincipalId: houseOwner.id, call: (path, init) => app.request(path, init), brain, log: (line) => { logs.push(line); console.log(JSON.stringify(line)); } });
    const houseAgent = await house.start();

    // Tick 1: the House opens its lobby.
    await house.tick();
    const lobby = (await pool.query<{ id: string }>("SELECT id FROM game_tables WHERE host_principal_id=$1", [houseAgent.principalId])).rows[0];
    assert.ok(lobby, "the House opened a lobby");

    // A challenger agent finds the House lobby and stakes.
    const made = await app.request("http://localhost/api/game/agents", {
      method: "POST", headers: { authorization: "Bearer owner-c", "content-type": "application/json" },
      body: JSON.stringify({ name: "Challenger", username: `challenger_${randomBytes(2).toString("hex")}` }),
    });
    const challenger = await made.json() as { apiKey: string; funded: boolean };
    assert.equal(made.status, 201);
    const cGet = async (path: string, params: Record<string, string> = {}, write = false) => {
      const query = new URLSearchParams({ k: challenger.apiKey, ...(write ? { n: randomBytes(9).toString("base64url") } : {}), ...params });
      const body = await (await app.request(`http://localhost/api/agent/v1/${path}?${query.toString()}`)).json() as Record<string, unknown>;
      console.log(JSON.stringify({ challenger: path, ok: body.ok, code: body.code ?? null }));
      return body;
    };
    const listed = await cGet("tables");
    assert.ok((listed.tables as { table: string }[]).some((row) => row.table === lobby.id), "the challenger sees the House lobby");
    assert.equal((await cGet("join", { table: lobby.id }, true)).ok, true);

    // The House notices the waiting player and takes its seat.
    await house.tick();
    const seated = await pool.query("SELECT 1 FROM game_participants WHERE table_id=$1 AND principal_id=$2 AND funding_status='funded'", [lobby.id, houseAgent.principalId]);
    assert.equal(seated.rowCount, 1, "the House staked on chain");

    const worker = new GameWorker({ repository: jobs, workerId: "devnet-house", handlers: { capture_start: (job) => chain.handleJob(job), capture_end: (job) => chain.handleJob(job), expire_table: (job) => chain.handleJob(job) }, leaseMs: 90_000, retryDelayMs: 5_000 });
    const status = async () => (await pool.query<{ status: string; chain_status: string }>("SELECT status, chain_status FROM game_tables WHERE id=$1", [lobby.id])).rows[0]!;
    let challengerTraded = false;
    // Production ticks every 30 s; 10 s here keeps the run short and well inside the House's call budget.
    let lastTick = 0;
    const deadline = Date.now() + 480_000;
    while (Date.now() < deadline && (await status()).chain_status !== "settled") {
      const outcome = await worker.runOne();
      if ((await status()).status === "ACTIVE") {
        if (Date.now() - lastTick >= 10_000) {
          lastTick = Date.now();
          await house.tick();
        }
        if (!challengerTraded) {
          const picks = (await cGet("picks")).picks as { mint: string; priceUsd: number | null }[];
          const pick = picks.filter((row) => row.priceUsd !== null).at(-1);
          if (pick) challengerTraded = (await cGet("trade", { table: lobby.id, side: "buy", token: pick.mint, usd: "1500" }, true)).ok === true;
        }
      }
      if (outcome !== "completed") await sleep(3_000);
    }
    assert.equal((await status()).chain_status, "settled", "the House match settled on chain");

    // Collect: the House claims on a following tick (a draw refunds both stakes); the challenger claims if it won.
    for (let attempt = 0; attempt < 4 && !logs.some((line) => line.step === "claim" && line.ok === true); attempt += 1) {
      await sleep(15_000);
      await house.tick();
    }
    const cStatus = await cGet("status", { table: lobby.id });
    const cResult = cStatus.result as { awardAnsem: string; claimed: boolean } | undefined;
    if (cResult && cResult.awardAnsem !== "0") assert.equal((await cGet("claim", { table: lobby.id }, true)).ok, true);

    const record = await houseDesk.desk();
    const decisions = await pool.query<{ source: string; view: string; executed: unknown[]; refused: unknown[] }>("SELECT source, view, executed, refused FROM game_house_decisions WHERE table_id=$1 ORDER BY created_at", [lobby.id]);
    assert.ok(decisions.rowCount && decisions.rowCount > 0, "the House decided at least once");
    assert.equal(record.stakeCount, 1);
    assert.ok(record.decisions.length > 0, "decisions are public once the match is over");
    console.log(JSON.stringify({
      proof: "kova-devnet-house-v1", network: "solana-devnet", brain: brain ? "clawpump" : "momentum rule",
      table: lobby.id, houseVault: houseAgent.vaultWallet,
      decisions: decisions.rows, houseStakes: record.stakes, houseStats: (record.profile as { stats?: unknown } | null)?.stats ?? null,
      challengerResult: cResult ?? null, houseClaim: logs.filter((line) => line.step === "claim"), rateLimited: logs.filter((line) => line.code === "RATE_LIMITED").length,
      assertions: { houseOpenedLobby: true, challengerFoundAndStaked: true, houseSeatedOnChain: true, houseDecidedUnderRisk: true, settledOnChain: true, publicRecordAfterMatch: true },
    }, null, 2));
  } finally {
    await pool.end().catch(() => undefined);
    try { execFileSync("docker", ["rm", "--force", container], { stdio: "ignore" }); } catch { /* already gone */ }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
