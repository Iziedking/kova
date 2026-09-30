/**
 * Devnet proof that AI agents can play KOVA end to end through the GET-only agent API.
 *
 * Throwaway PostgreSQL, real routes, real settlement worker, real devnet program, live meme-stock
 * prices. Two owners each create an agent (vault proven and funded from the devnet faucet). Agent A
 * opens a Trade table and stakes; agent B finds it and stakes; both trade while the match is live;
 * the worker settles on chain; each agent reads its result and claims. Every agent step is a plain
 * GET to /api/agent/v1, exactly what a ClawPump agent's web_fetch sends.
 *
 * Run on host-service:
 *   KOVA_DEVNET_SECRETS_DIR=~/kova-secrets/devnet npx tsx scripts/devnet/agents-devnet.ts
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
import { AgentAwareAuth, AgentService } from "../../src/backend/game/agents";
import { OrchestrationRepository } from "../../src/backend/workers/orchestration-repository";
import { GameJobRepository } from "../../src/backend/workers/job-repository";
import { GameWorker } from "../../src/backend/workers/runner";
import { KovaProgramClient } from "../../src/adapters/game/kova-program";
import { MarketFeed } from "../../src/adapters/game/market-feed";

const DEVNET_RPC = process.env.KOVA_DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
const SECRETS = process.env.KOVA_DEVNET_SECRETS_DIR as string;
const ORIGIN = "http://localhost:3000";
const ROUND_SECONDS = 90;

const key = (name: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(SECRETS, `${name}.json`), "utf8")) as number[]));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const nonce = () => randomBytes(9).toString("base64url");

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
  const operatorLamports = await connection.getBalance(operator.publicKey);
  if (operatorLamports < 1.2 * LAMPORTS_PER_SOL) throw new Error(`Operator has ${operatorLamports / LAMPORTS_PER_SOL} SOL; the faucet keeps a 1 SOL reserve.`);
  const stakeMint = new PublicKey(readFileSync(join(SECRETS, "test-ansem-mint.txt"), "utf8").trim());

  const port = await freePort();
  const container = `kova-agents-${randomUUID().slice(0, 8)}`;
  const password = randomBytes(18).toString("hex");
  const pool = new Pool({ connectionString: `postgresql://postgres:${password}@127.0.0.1:${port}/kova_test`, max: 8 });
  execFileSync("docker", ["run", "--rm", "--detach", "--name", container, "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=kova_test", "--publish", `127.0.0.1:${port}:5432`, "postgres:16.15-alpine3.24@sha256:3c5c8892d184f738f4fe282d14ddaa613a38f00f4189d2d94725ebe6f2909ddb"], { stdio: "pipe" });
  try {
    for (let attempt = 0; ; attempt += 1) {
      try { await pool.query("SELECT 1"); break; } catch { if (attempt > 60) throw new Error("Postgres did not start."); await sleep(500); }
    }
    await runMigrations(pool);

    const repository = new PostgresGameRepository("postgresql://unused", pool);
    const keyring = parsePickKeyring("devnet-agents", randomBytes(32).toString("base64"));
    const orchestration = new OrchestrationRepository(pool);
    const jobs = new GameJobRepository(pool);
    const trading = new TradingSimService({ pool, feed: new MarketFeed() });
    const chain = new ChainGameService({
      pool, repository, keyring, jobs, orchestration, network: "solana-devnet",
      client: new KovaProgramClient({ connection, stakeMint, creator: operator, oracle: key("oracle"), admission: key("admission") }),
      evidenceConnection: connection, dealer: null, dealerToolBudget: 0, roundSeconds: ROUND_SECONDS, trading,
    });
    const agents = new AgentService({
      pool, repository, keyring, origin: ORIGIN, connection, stakeMint: stakeMint.toBase58(),
      fundVault: async (principalId, wallet) => {
        const granted = await chain.grantTestTokens(principalId, wallet);
        return granted.ok ? { ok: true } : { ok: false, code: granted.code };
      },
    });
    const owners = new Map([["owner-a", "did:privy:agents-owner-a"], ["owner-b", "did:privy:agents-owner-b"]]);
    const app = createBackendApp(loadBackendConfig({ KOVA_ALLOWED_ORIGINS: ORIGIN }), new MemoryEvidenceStore(), {
      repository,
      auth: new AgentAwareAuth({ verifyBearer: async (token) => owners.has(token) ? { privyUserId: owners.get(token) as string } : null }, agents),
      keyring, allowedOrigins: [ORIGIN], stakeMint: stakeMint.toBase58(), events: orchestration, chain, trading,
      relay: new TxRelay({ pool, connection }), agents, agentApiBaseUrl: "http://localhost",
    });

    // Owners create their agents. The key is returned once.
    const keys: Record<"a" | "b", string> = { a: "", b: "" };
    const vaults: Record<"a" | "b", string> = { a: "", b: "" };
    for (const [name, owner] of [["a", "owner-a"], ["b", "owner-b"]] as const) {
      const response = await app.request("http://localhost/api/game/agents", {
        method: "POST", headers: { authorization: `Bearer ${owner}`, "content-type": "application/json" },
        body: JSON.stringify({ name: `Devnet Agent ${name.toUpperCase()}`, username: `devnet_agent_${name}_${randomBytes(2).toString("hex")}` }),
      });
      const body = await response.json() as { apiKey: string; funded: boolean; agent: { vaultWallet: string } };
      assert.equal(response.status, 201, JSON.stringify(body));
      assert.equal(body.funded, true, "the new vault was funded from the devnet faucet");
      keys[name] = body.apiKey;
      vaults[name] = body.agent.vaultWallet;
    }

    // From here on, only what an agent's web_fetch can send: GET URLs.
    const agentGet = async (who: "a" | "b", path: string, params: Record<string, string> = {}, write = false) => {
      const query = new URLSearchParams({ k: keys[who], ...(write ? { n: nonce() } : {}), ...params });
      const response = await app.request(`http://localhost/api/agent/v1/${path}?${query.toString()}`);
      const body = await response.json() as Record<string, unknown>;
      console.log(JSON.stringify({ agent: who, call: path, status: response.status, ok: body.ok, code: body.code ?? null, next: body.next ?? null }));
      return { status: response.status, body };
    };

    const meA = await agentGet("a", "me");
    assert.equal((meA.body.balances as { ansem: string }).ansem, "10");
    const created = await agentGet("a", "create", { mode: "trading", stake: "1", players: "2", seconds: String(ROUND_SECONDS), name: "Agents only: devnet proof" }, true);
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const tableId = created.body.table as string;
    const joinedA = await agentGet("a", "join", { table: tableId }, true);
    assert.equal(joinedA.status, 200, JSON.stringify(joinedA.body));

    const tables = await agentGet("b", "tables");
    assert.ok((tables.body.tables as { table: string }[]).some((row) => row.table === tableId), "agent B finds the table");
    const joinedB = await agentGet("b", "join", { table: tableId }, true);
    assert.equal(joinedB.status, 200, JSON.stringify(joinedB.body));

    // The worker locks and activates; the agents trade while the match is live.
    const worker = new GameWorker({ repository: jobs, workerId: "devnet-agents", handlers: { capture_start: (job) => chain.handleJob(job), capture_end: (job) => chain.handleJob(job), expire_table: (job) => chain.handleJob(job) }, leaseMs: 90_000, retryDelayMs: 5_000 });
    const tick = async () => {
      const outcome = await worker.runOne();
      if (outcome === "failed") {
        const failure = await pool.query<{ kind: string; last_error_code: string }>("SELECT kind, last_error_code FROM game_jobs WHERE last_error_code IS NOT NULL ORDER BY updated_at DESC LIMIT 1");
        console.error(JSON.stringify({ jobFailed: failure.rows[0] }));
      }
      return outcome;
    };
    const status = async () => (await pool.query<{ status: string; chain_status: string }>("SELECT status, chain_status FROM game_tables WHERE id=$1", [tableId])).rows[0]!;
    const liveBy = Date.now() + 180_000;
    while (Date.now() < liveBy && (await status()).status !== "ACTIVE") if ((await tick()) !== "completed") await sleep(1_000);
    assert.equal((await status()).status, "ACTIVE", "the match went live");

    const picks = await agentGet("a", "picks");
    const priced = (picks.body.picks as { symbol: string; mint: string; priceUsd: number | null; liquidityUsd: number | null }[]).filter((pick) => pick.priceUsd !== null);
    assert.ok(priced.length >= 2, "at least two meme stocks have live prices");
    const tooBig = await agentGet("a", "trade", { table: tableId, side: "buy", token: priced[0]!.mint, usd: "4000" }, true);
    assert.equal(tooBig.body.code, "ORDER_OVER_LIMIT", "the 25% order cap holds");
    const tradeA = await agentGet("a", "trade", { table: tableId, side: "buy", token: priced[0]!.mint, usd: "2000" }, true);
    assert.equal(tradeA.status, 200, JSON.stringify(tradeA.body));
    const tradeB = await agentGet("b", "trade", { table: tableId, side: "buy", token: priced[1]!.symbol, usd: "1500" }, true);
    assert.equal(tradeB.status, 200, JSON.stringify(tradeB.body));
    const midA = await agentGet("a", "status", { table: tableId });

    const settleBy = Date.now() + (ROUND_SECONDS + 240) * 1_000;
    while (Date.now() < settleBy && (await status()).chain_status !== "settled") if ((await tick()) !== "completed") await sleep(1_000);
    assert.equal((await status()).chain_status, "settled", "the table settled on chain");

    const claims: Record<string, unknown> = {};
    const results: Record<string, unknown> = {};
    for (const who of ["a", "b"] as const) {
      const final = await agentGet(who, "status", { table: tableId });
      results[who] = final.body.result;
      const award = (final.body.result as { awardAnsem: string } | undefined)?.awardAnsem ?? "0";
      if (award !== "0") {
        const claim = await agentGet(who, "claim", { table: tableId }, true);
        assert.equal(claim.status, 200, JSON.stringify(claim.body));
        claims[who] = { kind: claim.body.kind, ansem: claim.body.ansem, signature: claim.body.signature };
      }
    }
    const balances = { a: (await agentGet("a", "me")).body.balances, b: (await agentGet("b", "me")).body.balances } as Record<"a" | "b", { ansem: string }>;
    const total = Number(balances.a.ansem) + Number(balances.b.ansem);
    assert.equal(total, 20, "the pot is conserved across the two vaults (10 + 10 TEST ANSEM)");

    console.log(JSON.stringify({
      proof: "kova-devnet-agents-v1", network: "solana-devnet", table: tableId,
      vaults, stakes: { a: joinedA.body.signature, b: joinedB.body.signature },
      trades: { a: tradeA.body.filled, b: tradeB.body.filled }, midMatchA: midA.body.match, results, claims, balances,
      assertions: { agentsCreatedFundedVaults: true, agentOpenedAndStaked: true, secondAgentFoundAndStaked: true, orderCapEnforced: true, agentsTradedLive: true, settledOnChain: true, agentsClaimed: true, potConserved: true },
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
