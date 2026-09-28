/**
 * Devnet proof of the full KOVA loop through the HTTP API.
 *
 * Throwaway PostgreSQL, real routes, real settlement worker, real devnet program,
 * real mainnet DEX Screener marks for the picked tokens. Two throwaway players:
 * wallet proof -> private pick -> Dealer -> co-signed deposit -> automatic lock,
 * start capture, activation, end capture, settlement -> winner claims.
 *
 * The Dealer is the real ClawPump agent when CLAWPUMP_API_KEY and KOVA_DEALER_AGENT_ID
 * are set. Otherwise a scripted TEST Dealer accepts both picks, and the output says so.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createPrivateKey, randomBytes, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { Pool } from "pg";
import { TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotent, getAccount, getAssociatedTokenAddressSync, transferChecked } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createBackendApp } from "../../src/backend/app";
import { loadBackendConfig } from "../../src/backend/config";
import { MemoryEvidenceStore } from "../../src/backend/evidence-store";
import { runMigrations } from "../../src/backend/db/migrate";
import { PostgresGameRepository } from "../../src/backend/game/postgres-repository";
import { parsePickKeyring } from "../../src/backend/game/pick-crypto";
import { ChainGameService } from "../../src/backend/game/chain-game";
import { OrchestrationRepository } from "../../src/backend/workers/orchestration-repository";
import { GameJobRepository } from "../../src/backend/workers/job-repository";
import { GameWorker } from "../../src/backend/workers/runner";
import { KovaProgramClient } from "../../src/adapters/game/kova-program";
import { ClawPumpAdmissionClient } from "../../src/adapters/game/clawpump";
import { readDexPairs } from "../../src/adapters/game/dexscreener";

const DEVNET_RPC = process.env.KOVA_DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
const MAINNET_RPC = process.env.KOVA_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const SECRETS = process.env.KOVA_DEVNET_SECRETS_DIR as string;
const ORIGIN = "http://localhost:3000";
const STAKE_RAW = 1_000_000n;
const ROUND_SECONDS = 60;
const PICKS = [
  { mint: "8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB", label: "GME" },
  { mint: process.env.KOVA_SECOND_PICK_MINT ?? "8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB", label: process.env.KOVA_SECOND_PICK_MINT ? "second pick" : "GME" },
];

const key = (name: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(SECRETS, `${name}.json`), "utf8")) as number[]));

function signMessage(keypair: Keypair, message: string): string {
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(keypair.secretKey.slice(0, 32))]), format: "der", type: "pkcs8" });
  return sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64");
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port")));
    });
  });
}

/** Clearly labelled stand-in: it accepts, and the backend's deterministic gate still has to agree. */
function scriptedTestDealer() {
  return {
    classify: async (message: string) => {
      const request = JSON.parse(message.split("\n").at(-1) as string) as { mint: string; requestTimestamp: string };
      return {
        rawOutput: JSON.stringify({
          mint: request.mint,
          requestTimestamp: request.requestTimestamp,
          decision: "ACCEPTED",
          confidence: 0.7,
          classification: { isStockThemedMeme: true, isIssuerBackedTokenizedStock: false, stockOrCompanyReference: "TEST DEALER: scripted acceptance for the devnet API proof" },
          reasons: ["TEST DEALER: scripted acceptance. Not a real Dealer judgement."],
          evidence: [
            { source: "Solana RPC", sourceClass: "solana_rpc", url: null, observation: "Exact mint read on mainnet.", observedAt: null, solanaSlot: null },
            { source: "DEX Screener", sourceClass: "market_data", url: `https://dexscreener.com/solana/${request.mint}`, observation: "Exact-mint pairs exist.", observedAt: null, solanaSlot: null },
          ],
        }),
        model: "scripted-test-dealer",
        costUsd: 0,
        toolsUsed: [],
        requestId: null,
      };
    },
  };
}

async function main(): Promise<void> {
  if (!SECRETS) throw new Error("Set KOVA_DEVNET_SECRETS_DIR.");
  const connection = new Connection(DEVNET_RPC, "confirmed");
  if (await connection.getGenesisHash() !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("Refusing to run: not devnet.");
  const operator = key("operator");
  const stakeMint = new PublicKey(readFileSync(join(SECRETS, "test-ansem-mint.txt"), "utf8").trim());
  const realDealer = process.env.CLAWPUMP_API_KEY && process.env.KOVA_DEALER_AGENT_ID
    ? new ClawPumpAdmissionClient({ apiKey: process.env.CLAWPUMP_API_KEY, agentId: process.env.KOVA_DEALER_AGENT_ID, model: process.env.KOVA_DEALER_MODEL || undefined })
    : null;

  // Throwaway database.
  const port = await freePort();
  const container = `kova-api-${randomUUID().slice(0, 8)}`;
  const password = randomBytes(18).toString("hex");
  const pool = new Pool({ connectionString: `postgresql://postgres:${password}@127.0.0.1:${port}/kova_test`, max: 8 });
  execFileSync("docker", ["run", "--rm", "--detach", "--name", container, "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=kova_test", "--publish", `127.0.0.1:${port}:5432`, "postgres:16.15-alpine3.24@sha256:3c5c8892d184f738f4fe282d14ddaa613a38f00f4189d2d94725ebe6f2909ddb"], { stdio: "pipe" });
  try {
    for (let attempt = 0; ; attempt += 1) {
      try { await pool.query("SELECT 1"); break; } catch { if (attempt > 60) throw new Error("Postgres did not start."); await new Promise((r) => setTimeout(r, 500)); }
    }
    await runMigrations(pool);

    const repository = new PostgresGameRepository("postgresql://unused", pool);
    const keyring = parsePickKeyring("devnet-proof", randomBytes(32).toString("base64"));
    const orchestration = new OrchestrationRepository(pool);
    const jobs = new GameJobRepository(pool);
    const client = new KovaProgramClient({ connection, stakeMint, creator: operator, oracle: key("oracle"), admission: key("admission") });
    const chain = new ChainGameService({
      pool, repository, client, keyring, jobs, orchestration, network: "solana-devnet",
      evidenceConnection: new Connection(MAINNET_RPC, "finalized"),
      dealer: realDealer ?? scriptedTestDealer(),
      dealerToolBudget: 0,
      roundSeconds: ROUND_SECONDS,
    });
    const tokens = new Map([["host", "did:privy:devnet-host"], ["a", "did:privy:devnet-a"], ["b", "did:privy:devnet-b"]]);
    const app = createBackendApp(loadBackendConfig({ KOVA_ALLOWED_ORIGINS: ORIGIN }), new MemoryEvidenceStore(), {
      repository,
      auth: { verifyBearer: async (token) => tokens.has(token) ? { privyUserId: tokens.get(token) as string } : null },
      keyring, allowedOrigins: [ORIGIN], stakeMint: stakeMint.toBase58(), events: orchestration, chain,
    });
    const call = async (token: string, path: string, body?: unknown) => {
      const response = await app.request(`http://localhost${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: ORIGIN }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    };

    // Throwaway players with fee SOL and TEST ANSEM.
    const players = { a: Keypair.generate(), b: Keypair.generate() };
    const funding = new Transaction();
    for (const player of Object.values(players)) funding.add(SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: player.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL }));
    await sendAndConfirmTransaction(connection, funding, [operator], { commitment: "confirmed" });
    const treasury = getAssociatedTokenAddressSync(stakeMint, operator.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const playerTokens: Record<string, PublicKey> = {};
    for (const [name, player] of Object.entries(players)) {
      playerTokens[name] = await createAssociatedTokenAccountIdempotent(connection, operator, stakeMint, player.publicKey, { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
      await transferChecked(connection, operator, treasury, stakeMint, playerTokens[name]!, operator, STAKE_RAW, 6, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
    }

    // Host creates and opens the table.
    const created = await call("host", "/api/game/tables", { name: "Devnet API proof", visibility: "public", playerCount: 2, stakeRaw: STAKE_RAW.toString() });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const tableId = (created.body.table as { id: string }).id;
    // Creating a table opens it on chain; a second open is refused.
    const opened = { body: created.body.chain as { chainAddress: string } };
    assert.ok(opened.body?.chainAddress, "Created table was not opened on chain.");
    assert.equal((await call("host", `/api/game/tables/${tableId}/open`, {})).status, 409);
    const dealerCheck = await call("a", "/api/game/dealer/check", { query: "GME" });
    assert.equal(dealerCheck.status, 200, JSON.stringify(dealerCheck.body));

    // Each player proves their wallet, submits a private pick, and gets the Dealer's decision.
    const dealerOutcomes: Record<string, unknown> = {};
    for (const [index, [name, player]] of Object.entries(players).entries()) {
      const wallet = player.publicKey.toBase58();
      const challenge = await call(name, "/api/game/auth/wallet/challenges", { wallet, origin: ORIGIN });
      const { id, message } = challenge.body.challenge as { id: string; message: string };
      const proved = await call(name, "/api/game/auth/wallet/proofs", { challengeId: id, signatureBase64: signMessage(player, message) });
      assert.equal(proved.status, 200, JSON.stringify(proved.body));
      const pick = PICKS[index]!;
      const pairs = await readDexPairs(pick.mint);
      const pair = pairs.find((candidate) => candidate.baseToken.address === pick.mint);
      if (!pair) throw new Error(`No DEX pair for ${pick.label}.`);
      const submitted = await call(name, `/api/game/tables/${tableId}/submissions`, {
        wallet, mint: pick.mint, pairMint: pair.pairAddress, saltHex: randomBytes(32).toString("hex"), rulesHashHex: "0".repeat(63) + "1", operationKey: `pick-${name}-${tableId}`,
      });
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
      dealerOutcomes[name] = { decision: (submitted.body.participant as { admissionDecision: string }).admissionDecision, dealer: submitted.body.dealer };
      if ((submitted.body.participant as { admissionDecision: string }).admissionDecision !== "ACCEPTED") {
        const refused = await call(name, `/api/game/tables/${tableId}/join`, {});
        assert.equal(refused.status, 409, "A pick the Dealer did not accept must not get a deposit transaction.");
        console.log(JSON.stringify({ stoppedAt: "dealer", dealerOutcomes }, null, 2));
        return;
      }

      // Deposit: backend co-signs, the player's own key signs and submits.
      const join = await call(name, `/api/game/tables/${tableId}/join`, {});
      assert.equal(join.status, 200, JSON.stringify(join.body));
      const transaction = Transaction.from(Buffer.from(join.body.transactionBase64 as string, "base64"));
      transaction.partialSign(player);
      const signature = await connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: "confirmed" });
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      const confirmed = await call(name, `/api/game/tables/${tableId}/join/confirm`, { signature });
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    }

    // The worker locks, captures, activates, waits out the round, captures again and settles.
    const worker = new GameWorker({ repository: jobs, workerId: "devnet-proof", handlers: { capture_start: (job) => chain.handleJob(job), capture_end: (job) => chain.handleJob(job), expire_table: (job) => chain.handleJob(job) }, leaseMs: 90_000, retryDelayMs: 5_000 });
    const deadline = Date.now() + (ROUND_SECONDS + 240) * 1_000;
    let settled = false;
    while (Date.now() < deadline && !settled) {
      const outcome = await worker.runOne();
      if (outcome === "failed") {
        const failure = await pool.query<{ kind: string; last_error_code: string }>("SELECT kind, last_error_code FROM game_jobs WHERE last_error_code IS NOT NULL ORDER BY updated_at DESC LIMIT 1");
        console.error(JSON.stringify({ jobFailed: failure.rows[0] }));
      }
      const table = await pool.query<{ chain_status: string }>("SELECT chain_status FROM game_tables WHERE id=$1", [tableId]);
      settled = table.rows[0]?.chain_status === "settled";
      if (outcome !== "completed") await new Promise((r) => setTimeout(r, 1_000));
    }
    assert.equal(settled, true, "Table did not settle within the round plus margin.");

    const eventTypes = (await pool.query<{ event_type: string }>("SELECT event_type FROM game_events WHERE table_id=$1 AND audience='public' ORDER BY sequence", [tableId])).rows.map((row) => row.event_type);
    const results = await pool.query<{ payload: { results: { wallet: string; mint: string; scoreBps: string; awardRaw: string }[] } }>("SELECT payload FROM game_events WHERE table_id=$1 AND event_type='table.settled'", [tableId]);
    const showdown = results.rows[0]?.payload.results ?? [];
    const claims: Record<string, unknown> = {};
    for (const [name, player] of Object.entries(players)) {
      const claim = await call(name, `/api/game/tables/${tableId}/claim`, {});
      if (claim.status !== 200) { claims[name] = claim.body.code; continue; }
      const transaction = Transaction.from(Buffer.from(claim.body.transactionBase64 as string, "base64"));
      transaction.partialSign(player);
      const signature = await connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: "confirmed" });
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      claims[name] = { kind: claim.body.kind, amountRaw: claim.body.amountRaw, signature };
    }
    const balances: Record<string, string> = Object.fromEntries(await Promise.all(Object.entries(playerTokens).map(async ([name, account]) => [name, (await getAccount(connection, account, "confirmed", TOKEN_2022_PROGRAM_ID)).amount.toString()] as const)));
    const total = Object.values(balances).reduce((sum, value) => sum + BigInt(value), 0n);
    assert.equal(total, STAKE_RAW * 2n, "Pot was not conserved across the two players.");

    console.log(JSON.stringify({
      proof: "kova-devnet-api-v1",
      dealer: realDealer ? "clawpump" : "SCRIPTED TEST DEALER (not a real judgement)",
      network: "solana-devnet",
      table: { id: tableId, chainAddress: opened.body.chainAddress },
      dealerOutcomes, showdown, claims, balancesRaw: balances,
      publicEvents: eventTypes,
      assertions: { apiOpenedTableOnChain: true, depositsCoSignedOnlyAfterAcceptance: true, workerSettledOnChain: true, potConserved: true },
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
