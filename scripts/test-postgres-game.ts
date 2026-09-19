import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { Pool } from "pg";
import { runMigrations } from "../src/backend/db/migrate";
import { PostgresGameRepository } from "../src/backend/game/postgres-repository";
import { encryptPrivateJson, parsePickKeyring } from "../src/backend/game/pick-crypto";
import { buildWalletChallenge } from "../src/backend/game/wallet-proof";
import { createBackendApp } from "../src/backend/app";
import { loadBackendConfig } from "../src/backend/config";
import { MemoryEvidenceStore } from "../src/backend/evidence-store";
import { PostgresDealerStore } from "../src/backend/game/dealer-store";
import { AdmissionDecisionSchema, publicAdmissionProjection } from "../src/domain/game/admission";
import { GameJobRepository } from "../src/backend/workers/job-repository";
import { OrchestrationRepository } from "../src/backend/workers/orchestration-repository";
import { capturePolicyHash, type CapturePlan } from "../src/domain/game/capture";

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a PostgreSQL test port.");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function waitForPostgres(pool: Pool): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("PostgreSQL test container did not become ready.");
}

async function main(): Promise<void> {
  const port = await freePort();
  const container = `kova-m3-${randomUUID().slice(0, 8)}`;
  const password = randomBytes(18).toString("hex");
  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/kova_test`;
  const temp = await mkdtemp(join(tmpdir(), "kova-migrations-"));
  const pool = new Pool({ connectionString: databaseUrl, max: 12 });
  try {
    execFileSync("docker", ["run", "--rm", "--detach", "--name", container, "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=kova_test", "--publish", `127.0.0.1:${port}:5432`, "postgres:16.15-alpine3.24@sha256:3c5c8892d184f738f4fe282d14ddaa613a38f00f4189d2d94725ebe6f2909ddb"], { stdio: "pipe" });
    await waitForPostgres(pool);

    await copyFile(join(process.cwd(), "src/backend/db/migrations/0001_float_evidence.sql"), join(temp, "0001_float_evidence.sql"));
    await runMigrations(pool, temp);
    const evidenceId = randomUUID();
    await pool.query(
      `INSERT INTO evidence_snapshots (id, kind, subject_id, report_hash, source, observed_at, payload)
       VALUES ($1,'stock_check','preserved','${"a".repeat(64)}','m3-upgrade-test',now(),'{}'::jsonb)`, [evidenceId],
    );
    const applied = await runMigrations(pool);
    assert.equal(applied.some((item) => item.name === "0002_kova_game.sql"), true);
    assert.equal((await pool.query("SELECT 1 FROM evidence_snapshots WHERE id = $1", [evidenceId])).rowCount, 1);
    assert.deepEqual(await runMigrations(pool), []);

    const repository = new PostgresGameRepository(databaseUrl, pool);
    const host = await repository.principalForPrivyUser("did:privy:host");
    const guestA = await repository.principalForPrivyUser("did:privy:guest-a");
    const guestB = await repository.principalForPrivyUser("did:privy:guest-b");
    const wallet = "11111111111111111111111111111111";
    const tableId = randomUUID();
    await repository.createTable({
      id: tableId, hostPrincipalId: host.id, name: "Private test", visibility: "private", status: "DRAFT", financialStatus: "unfunded",
      rules: { playerCount: 2, stakeMint: wallet, stakeRaw: "1000000", roundDurationSeconds: 900, scoreVersion: "kova-bps-v1", tieBreakVersion: "wallet-bytes-v1", commitmentVersion: "kova-pick-v1" },
      opensUntil: null, startsAt: null, endsAt: null,
    });
    assert.equal(await repository.tableForPrincipal(tableId, guestA.id), null);
    const invitationTokenHash = createHash("sha256").update("invitation").digest("hex");
    await repository.createInvitation({ id: randomUUID(), tableId, creatorPrincipalId: host.id, tokenHash: invitationTokenHash, expiresAt: new Date(Date.now() + 60_000) });
    const invitationRace = await Promise.all([
      repository.claimInvitation({ tokenHash: invitationTokenHash, principalId: guestA.id, now: new Date() }),
      repository.claimInvitation({ tokenHash: invitationTokenHash, principalId: guestB.id, now: new Date() }),
    ]);
    assert.equal(invitationRace.filter((result) => result.ok).length, 1);
    assert.equal(invitationRace.filter((result) => !result.ok && result.code === "INVITATION_REPLAYED").length, 1);
    const winner = invitationRace[0]?.ok ? guestA : guestB;
    assert.notEqual(await repository.tableForPrincipal(tableId, winner.id), null);

    const challenge = buildWalletChallenge({ id: randomUUID(), principalId: winner.id, wallet, origin: "http://localhost:3000", now: new Date() });
    await repository.putWalletChallenge(challenge);
    const proofRace = await Promise.all([
      repository.consumeWalletChallenge({ challengeId: challenge.id, principalId: winner.id, wallet, now: new Date() }),
      repository.consumeWalletChallenge({ challengeId: challenge.id, principalId: winner.id, wallet, now: new Date() }),
    ]);
    assert.equal(proofRace.filter((result) => result.ok).length, 1);
    assert.equal(proofRace.filter((result) => !result.ok && result.code === "CHALLENGE_REPLAYED").length, 1);

    const keyring = parsePickKeyring("v1", randomBytes(32).toString("base64"));
    const context = { tableId, principalId: winner.id, kind: "pick" };
    const encryptedRecord = encryptPrivateJson({ mint: wallet, pairMint: wallet, saltHex: "b".repeat(64) }, context, keyring);
    const submission = { id: randomUUID(), principalId: winner.id, tableId, wallet, commitment: "c".repeat(64), sealedMarketHash: "d".repeat(64), encryptedRecord, operationKey: "submit-once", requestHash: "e".repeat(64) };
    const submissionRace = await Promise.all([repository.submitParticipant(submission), repository.submitParticipant({ ...submission, id: randomUUID() })]);
    assert.equal(submissionRace.filter((result) => result.ok && !result.replayed).length, 1);
    assert.equal(submissionRace.filter((result) => result.ok && result.replayed).length, 1);
    const loser = winner.id === guestA.id ? guestB : guestA;
    assert.equal(await repository.privateParticipant(tableId, loser.id), null);
    assert.notEqual(await repository.privateParticipant(tableId, winner.id), null);

    const authUsers = new Map([["host-token", "did:privy:host"], ["winner-token", winner.privyUserId], ["loser-token", loser.privyUserId]]);
    const orchestration = new OrchestrationRepository(pool);
    const app = createBackendApp(loadBackendConfig({ KOVA_ALLOWED_ORIGINS: "http://localhost:3000" }), new MemoryEvidenceStore(), {
      repository,
      auth: { verifyBearer: async (token) => authUsers.has(token) ? { privyUserId: authUsers.get(token) as string } : null },
      keyring,
      allowedOrigins: ["http://localhost:3000"],
      stakeMint: wallet,
      events: orchestration,
    });
    const privateAnonymous = await app.request(`http://localhost/api/game/tables/${tableId}`);
    assert.equal(privateAnonymous.status, 404);
    const privateWinner = await app.request(`http://localhost/api/game/tables/${tableId}`, { headers: { authorization: "Bearer winner-token" } });
    assert.equal(privateWinner.status, 200);
    const privateLoser = await app.request(`http://localhost/api/game/tables/${tableId}`, { headers: { authorization: "Bearer loser-token" } });
    assert.equal(privateLoser.status, 404);
    const participantAnonymous = await app.request(`http://localhost/api/game/tables/${tableId}/private`);
    assert.equal(participantAnonymous.status, 401);
    const participantWinner = await app.request(`http://localhost/api/game/tables/${tableId}/private`, { headers: { authorization: "Bearer winner-token" } });
    assert.equal(participantWinner.status, 200);
    const participantBody = await participantWinner.json() as { participant: { candidateMint: string; pairMint: string } };
    assert.equal(participantBody.participant.candidateMint, wallet);
    const participantLoser = await app.request(`http://localhost/api/game/tables/${tableId}/private`, { headers: { authorization: "Bearer loser-token" } });
    assert.equal(participantLoser.status, 404);
    const createdTable = await app.request("http://localhost/api/game/tables", {
      method: "POST",
      headers: { authorization: "Bearer host-token", "content-type": "application/json" },
      body: JSON.stringify({ name: "API table", visibility: "public", playerCount: 2, stakeRaw: "1000000" }),
    });
    assert.equal(createdTable.status, 201);
    const createdTableBody = await createdTable.json() as { table: { id: string } };
    await orchestration.appendEvent({ tableId: createdTableBody.table.id, audience: "public", eventType: "table_created", payload: { status: "DRAFT", message: "Table created." } });
    await orchestration.appendEvent({ tableId: createdTableBody.table.id, audience: "principal", principalId: host.id, eventType: "host_private", payload: { privateMarker: "host-only" } });
    const spectatorEvents = await app.request(`http://localhost/api/game/tables/${createdTableBody.table.id}/events?once=true`);
    assert.equal(spectatorEvents.status, 200);
    const spectatorText = await spectatorEvents.text();
    assert.match(spectatorText, /table_created/);
    assert.doesNotMatch(spectatorText, /host-only/);
    const hostEvents = await app.request(`http://localhost/api/game/tables/${createdTableBody.table.id}/events?once=true`, { headers: { authorization: "Bearer host-token" } });
    assert.match(await hostEvents.text(), /host-only/);
    await assert.rejects(() => orchestration.appendEvent({ tableId: createdTableBody.table.id, audience: "public", eventType: "leak", payload: { mint: wallet } }));

    const budgetRace = await Promise.all([
      repository.reserveBudget({ id: randomUUID(), principalId: host.id, category: "dealer", operationKey: "budget-a", amountMicroUsd: "60", expiresAt: new Date(Date.now() + 60_000), dailyLimitMicroUsd: 100n, now: new Date() }),
      repository.reserveBudget({ id: randomUUID(), principalId: host.id, category: "dealer", operationKey: "budget-b", amountMicroUsd: "60", expiresAt: new Date(Date.now() + 60_000), dailyLimitMicroUsd: 100n, now: new Date() }),
    ]);
    assert.equal(budgetRace.filter((result) => result.ok).length, 1);
    assert.equal(budgetRace.filter((result) => !result.ok && result.code === "BUDGET_EXCEEDED").length, 1);

    const dealerStore = new PostgresDealerStore(pool, keyring);
    const dealerDecision = AdmissionDecisionSchema.parse({
      schemaVersion: "kova-admission-v1", network: "solana-mainnet", mint: wallet, requestTimestamp: "2026-09-19T18:00:00.000Z",
      decision: "INSUFFICIENT_EVIDENCE", confidence: 0.2,
      classification: { isStockThemedMeme: null, isIssuerBackedTokenizedStock: null, stockOrCompanyReference: null },
      tokenIdentity: { name: null, symbol: null, tokenProgram: null, decimals: null, mintAuthority: "unknown", freezeAuthority: "unknown", metadataUri: null },
      riskFlags: [], reasons: ["Evidence is incomplete."], researchAttempts: [{ capability: "solana_rpc", result: "unavailable", detail: "Fixture unavailable." }],
      evidence: [], providerReceipts: [], conflicts: [], missingEvidence: ["Exact identity"], evaluatedAt: "2026-09-19T18:00:01.000Z",
    });
    await dealerStore.put({
      decision: dealerDecision, evidenceHash: "f".repeat(64), publicProjection: publicAdmissionProjection(dealerDecision), expiresAt: new Date(Date.now() + 60_000),
      receipt: { operationKey: "dealer-once", providerRequestId: "request", model: "fixture", costMicroUsd: "0", toolsUsed: ["solana_rpc"], isolationStatus: "soft_prompt_only", result: "validated" },
    });
    assert.deepEqual(await dealerStore.latest("solana-mainnet", wallet), dealerDecision);

    const jobs = new GameJobRepository(pool);
    const enqueued = await jobs.enqueue({ operationKey: "capture-start-once", tableId, kind: "capture_start", runAt: new Date(0), payload: { phase: "start" } });
    assert.equal(enqueued.replayed, false);
    assert.equal((await jobs.enqueue({ operationKey: "capture-start-once", tableId, kind: "capture_start", runAt: new Date(0), payload: { phase: "start" } })).replayed, true);
    const leaseRace = await Promise.all([
      jobs.leaseNext({ workerId: "worker-a", now: new Date("2026-09-19T19:00:00.000Z"), leaseMs: 1_000 }),
      jobs.leaseNext({ workerId: "worker-b", now: new Date("2026-09-19T19:00:00.000Z"), leaseMs: 1_000 }),
    ]);
    const firstLease = leaseRace.find((lease) => lease !== null);
    assert.ok(firstLease);
    assert.equal(leaseRace.filter((lease) => lease !== null).length, 1);
    const replacement = await jobs.leaseNext({ workerId: "worker-restart", now: new Date("2026-09-19T19:00:02.000Z"), leaseMs: 1_000 });
    assert.ok(replacement);
    assert.equal(await jobs.complete(firstLease, new Date("2026-09-19T19:00:02.100Z")), false);
    assert.equal(await jobs.complete(replacement, new Date("2026-09-19T19:00:02.200Z")), true);

    const capturePlan: CapturePlan = {
      schemaVersion: "kova-capture-v1", tableId, mode: "observed_mark_preview", provider: "fixture", providerVersion: "1",
      startTargetAt: "2026-09-19T20:00:00.000Z", endTargetAt: "2026-09-19T20:15:00.000Z", maxStartDelayMs: 1_000,
      responseDeadlineMs: 5_000, maxCrossPairSkewMs: 2_000, fallbackDelayMs: 2_000,
      pairBindings: [{ wallet, mint: wallet, pairAddress: wallet }, { wallet: "So11111111111111111111111111111111111111112", mint: "So11111111111111111111111111111111111111112", pairAddress: "So11111111111111111111111111111111111111112" }],
    };
    assert.equal((await orchestration.freezeCapturePlan(capturePlan)).replayed, false);
    assert.equal((await orchestration.freezeCapturePlan(capturePlan)).replayed, true);
    await assert.rejects(() => orchestration.freezeCapturePlan({ ...capturePlan, providerVersion: "2" }), /CAPTURE_PLAN_CONFLICT/);
    const sample = {
      schemaVersion: "kova-price-sample-v1" as const, tableId, phase: "start" as const, pairAddress: wallet, targetAt: capturePlan.startTargetAt,
      requestStartedAt: "2026-09-19T20:00:00.100Z", requestFinishedAt: "2026-09-19T20:00:00.200Z", providerObservedAt: null, providerSlot: null,
      capturedAt: "2026-09-19T20:00:00.210Z", price18: "100", liquidityUsdMicro: null, rawResponseHash: "a".repeat(64), source: "fixture", attempt: 1, policyHash: capturePolicyHash(capturePlan),
    };
    assert.equal((await orchestration.putPriceSample(sample)).replayed, false);
    assert.equal((await orchestration.putPriceSample(sample)).replayed, true);
    await assert.rejects(() => orchestration.putPriceSample({ ...sample, price18: "101" }), /PRICE_SAMPLE_CONFLICT/);
    const chain = await orchestration.prepareChainOperation({ operationKey: "activate-table", tableId, kind: "activate", messageHash: "b".repeat(64), lastValidBlockHeight: 123n });
    assert.equal(chain.replayed, false);
    assert.equal(await orchestration.markChainSubmitted({ operationKey: "activate-table", messageHash: "b".repeat(64), signature: "signature", now: new Date() }), true);
    assert.equal(await orchestration.markChainUnknown("activate-table"), true);
    assert.equal((await orchestration.prepareChainOperation({ operationKey: "activate-table", tableId, kind: "activate", messageHash: "b".repeat(64), lastValidBlockHeight: 123n })).status, "unknown");
    await assert.rejects(() => orchestration.prepareChainOperation({ operationKey: "activate-table", tableId, kind: "activate", messageHash: "c".repeat(64), lastValidBlockHeight: 123n }), /CHAIN_OPERATION_CONFLICT/);
    assert.equal(await orchestration.markChainConfirmed("activate-table", "signature"), true);

    console.info(JSON.stringify({ event: "kova_postgres_game_proof", migrations: applied.map((item) => item.name), evidencePreserved: true, walletReplayRejected: true, invitationRaceSerialized: true, idempotencyRaceReplayed: true, apiAccessMatrixEnforced: true, encryptedPrivateProjectionVerified: true, encryptedDealerCacheVerified: true, budgetRaceSerialized: true, leasedJobRaceSerialized: true, staleFenceRejected: true, captureConflictRejected: true, unknownChainOutcomeRecovered: true, sseReplayVerified: true, privateEventLeakageRejected: true }));
  } finally {
    await pool.end().catch(() => undefined);
    try { execFileSync("docker", ["rm", "--force", container], { stdio: "ignore" }); } catch { /* container may already be absent */ }
    await rm(temp, { recursive: true, force: true });
  }
}

void main();
