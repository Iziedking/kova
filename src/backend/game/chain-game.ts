/**
 * KOVA on-chain game loop.
 *
 * Money rules this service keeps:
 * - The admission key co-signs a deposit only for a pick the Dealer and the
 *   deterministic gate accepted, bound to the exact stored commitment.
 * - Funding is recorded only after the entry account is read back from chain.
 * - Players sign their own deposits and claims; the backend never holds stakes.
 * - Timeouts are permissionless on chain, so a dead backend cannot trap funds.
 */
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { PublicKey, type Connection } from "@solana/web3.js";
import {
  KovaProgramClient,
  hexToBytes32,
  rosterHash,
  sortRoster,
  startDigest,
  startLeaf,
  submitSigned,
  tableIdBytes,
} from "../../adapters/game/kova-program";
import { capturePairMark, type PairMark } from "../../adapters/game/price-capture";
import { readDexPairs } from "../../adapters/game/dexscreener";
import type { ClawPumpAdmissionClient } from "../../adapters/game/clawpump";
import { runAdmission } from "../../application/game/admission";
import { decryptPrivateJson, type EncryptedPrivateRecord, type PickKeyring } from "./pick-crypto";
import type { GameJobRepository, LeasedGameJob } from "../workers/job-repository";
import type { OrchestrationRepository } from "../workers/orchestration-repository";

export type ChainStatus = "none" | "open" | "locking" | "active" | "settling" | "settled" | "cancelled" | "voided";
export type ChainGameErrorCode =
  | "TABLE_NOT_FOUND" | "TABLE_ACCESS_DENIED" | "TABLE_ALREADY_OPEN" | "TABLE_NOT_OPEN" | "PARTICIPANT_NOT_FOUND"
  | "ADMISSION_NOT_ACCEPTED" | "DEALER_UNAVAILABLE" | "PAIR_NOT_FOR_MINT" | "ENTRY_NOT_FUNDED" | "ENTRY_COMMITMENT_MISMATCH"
  | "CLAIM_NOT_AVAILABLE" | "NOTHING_TO_CLAIM" | "WALLET_MISMATCH";

export type ChainGameResult<T> = { ok: true; value: T } | { ok: false; code: ChainGameErrorCode; detail?: string };

const OPEN_FOR_SECONDS = 600;
const DEALER_DECISION_TTL_MS = 6 * 60 * 60 * 1_000;

interface PickPayload { mint: string; pairMint: string; saltHex: string; rulesHashHex: string }

interface ParticipantRow {
  principal_id: string; wallet: string; commitment: string; sealed_market_hash: string; admission_decision: string; funding_status: string;
  key_id: string; iv_base64: string; auth_tag_base64: string; ciphertext_base64: string; aad_hash: string;
}

function toStatus(onChain: object): ChainStatus {
  const key = Object.keys(onChain)[0] ?? "";
  const map: Record<string, ChainStatus> = { open: "open", locking: "locking", active: "active", settling: "settling", settled: "settled", cancelled: "cancelled", voided: "voided" };
  return map[key] ?? "none";
}

export interface ChainGameDependencies {
  pool: Pool;
  client: KovaProgramClient;
  keyring: PickKeyring;
  jobs: GameJobRepository;
  orchestration: OrchestrationRepository;
  network: "solana-devnet" | "solana-mainnet";
  /** Mainnet connection for Dealer mint evidence; picks are mainnet tokens even on a devnet game. */
  evidenceConnection: Connection;
  dealer: Pick<ClawPumpAdmissionClient, "classify"> | null;
  /** 0 = the Dealer judges only KOVA-supplied evidence and calls no agent tools. */
  dealerToolBudget?: 0 | 1 | 2;
  roundSeconds: number;
  fetcher?: typeof fetch;
}

export class ChainGameService {
  constructor(private readonly deps: ChainGameDependencies) {}

  private async tableRow(tableId: string) {
    const result = await this.deps.pool.query<{ id: string; host_principal_id: string; rules: { playerCount: number; stakeRaw: string }; chain_status: ChainStatus }>(
      "SELECT id, host_principal_id, rules, chain_status FROM game_tables WHERE id = $1", [tableId],
    );
    return result.rows[0] ?? null;
  }

  private async participants(tableId: string): Promise<ParticipantRow[]> {
    const result = await this.deps.pool.query<ParticipantRow>(
      `SELECT p.principal_id, p.wallet, p.commitment, p.sealed_market_hash, p.admission_decision, p.funding_status,
              r.key_id, r.iv_base64, r.auth_tag_base64, r.ciphertext_base64, r.aad_hash
       FROM game_participants p JOIN game_private_records r ON r.table_id = p.table_id AND r.principal_id = p.principal_id AND r.kind = 'pick'
       WHERE p.table_id = $1 ORDER BY p.created_at`, [tableId],
    );
    return result.rows;
  }

  private decryptPick(tableId: string, row: ParticipantRow): PickPayload {
    const record: EncryptedPrivateRecord = { keyId: row.key_id, ivBase64: row.iv_base64, authTagBase64: row.auth_tag_base64, ciphertextBase64: row.ciphertext_base64, aadHash: row.aad_hash };
    return decryptPrivateJson<PickPayload>(record, { tableId, principalId: row.principal_id, kind: "pick" }, this.deps.keyring);
  }

  private async setChainStatus(tableId: string, status: ChainStatus): Promise<void> {
    await this.deps.pool.query("UPDATE game_tables SET chain_status = $2, updated_at = now() WHERE id = $1", [tableId, status]);
  }

  private async publicEvent(tableId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.deps.orchestration.appendEvent({ tableId, audience: "public", eventType, payload });
  }

  /** Host opens the table on chain. Opening starts the program's 10 minute join window. */
  async openTable(tableId: string, principalId: string): Promise<ChainGameResult<{ chainAddress: string; opensUntil: string; signature: string }>> {
    const table = await this.tableRow(tableId);
    if (!table) return { ok: false, code: "TABLE_NOT_FOUND" };
    if (table.host_principal_id !== principalId) return { ok: false, code: "TABLE_ACCESS_DENIED" };
    if (table.chain_status !== "none") return { ok: false, code: "TABLE_ALREADY_OPEN" };
    const prepared = await this.deps.client.initializeTable({
      tableUuid: tableId, stakeRaw: BigInt(table.rules.stakeRaw), maxPlayers: table.rules.playerCount, openForSeconds: OPEN_FOR_SECONDS, roundSeconds: this.deps.roundSeconds,
    });
    const operationKey = `open:${tableId}`;
    const messageHash = createHash("sha256").update(prepared.transaction.serializeMessage()).digest("hex");
    await this.deps.orchestration.prepareChainOperation({ operationKey, tableId, kind: "initialize_table", messageHash, lastValidBlockHeight: BigInt(prepared.lastValidBlockHeight) });
    const signature = await submitSigned(this.deps.client.connection, prepared);
    await this.deps.orchestration.markChainSubmitted({ operationKey, messageHash, signature, now: new Date() });
    await this.deps.orchestration.markChainConfirmed(operationKey, signature);
    const onChain = await this.deps.client.fetchTable(tableId);
    if (!onChain) throw new Error("Initialized table is not readable on chain.");
    const opensUntil = new Date(Number(onChain.openUntil.toString()) * 1_000);
    const chainAddress = this.deps.client.tableAddress(tableId).toBase58();
    await this.deps.pool.query(
      "UPDATE game_tables SET chain_status='open', chain_network=$2, chain_address=$3, status='OPEN', opens_until=$4, updated_at=now() WHERE id=$1",
      [tableId, this.deps.network, chainAddress, opensUntil],
    );
    // If nobody locks the table, void it at expiry so players can take refunds. Anyone could; we just do it promptly.
    await this.deps.jobs.enqueue({ operationKey: `expire:${tableId}:open`, tableId, kind: "expire_table", runAt: new Date(opensUntil.getTime() + 2_000), payload: { phase: "open" } });
    await this.publicEvent(tableId, "table.opened", { status: "OPEN", chainAddress, opensUntil: opensUntil.toISOString(), seats: table.rules.playerCount, fundedPlayers: 0 });
    return { ok: true, value: { chainAddress, opensUntil: opensUntil.toISOString(), signature } };
  }

  /**
   * Run the Dealer for a stored pick. Called right after the encrypted pick is saved.
   * The Dealer sees only the mint; never the wallet, table, salt or other players.
   */
  async admit(tableId: string, principalId: string): Promise<ChainGameResult<{ decision: string; publicProjection: unknown }>> {
    const row = (await this.participants(tableId)).find((participant) => participant.principal_id === principalId);
    if (!row) return { ok: false, code: "PARTICIPANT_NOT_FOUND" };
    const pick = this.decryptPick(tableId, row);
    const pairs = await readDexPairs(pick.mint, this.deps.fetcher);
    if (!pairs.some((pair) => pair.pairAddress === pick.pairMint && pair.baseToken.address === pick.mint)) return { ok: false, code: "PAIR_NOT_FOR_MINT" };
    if (!this.deps.dealer) return { ok: false, code: "DEALER_UNAVAILABLE", detail: "No ClawPump Dealer is configured." };
    let run;
    try {
      run = await runAdmission({ mint: pick.mint, requestTimestamp: new Date().toISOString(), connection: this.deps.evidenceConnection, dealer: this.deps.dealer, fetcher: this.deps.fetcher, toolBudget: this.deps.dealerToolBudget ?? 0 });
    } catch (error) {
      return { ok: false, code: "DEALER_UNAVAILABLE", detail: error instanceof Error ? error.message : undefined };
    }
    const decision = run.ok && run.decision ? run.decision.decision : "INSUFFICIENT_EVIDENCE";
    await this.deps.pool.query(
      `UPDATE game_participants SET admission_decision=$3, admission_evidence_hash=$4, admission_public=$5, admission_decided_at=now(), updated_at=now()
       WHERE table_id=$1 AND principal_id=$2 AND funding_status='unfunded'`,
      [tableId, principalId, decision, run.evidenceHash, run.publicProjection ?? { code: run.code }],
    );
    return { ok: true, value: { decision, publicProjection: run.publicProjection ?? { code: run.code } } };
  }

  /** Build the deposit for the player's wallet. The admission key signs here and nowhere else. */
  async buildJoin(tableId: string, principalId: string): Promise<ChainGameResult<{ transactionBase64: string; lastValidBlockHeight: number }>> {
    const table = await this.tableRow(tableId);
    if (!table) return { ok: false, code: "TABLE_NOT_FOUND" };
    if (table.chain_status !== "open") return { ok: false, code: "TABLE_NOT_OPEN" };
    const decided = await this.deps.pool.query<{ wallet: string; commitment: string; sealed_market_hash: string; admission_decision: string; admission_decided_at: Date | null }>(
      "SELECT wallet, commitment, sealed_market_hash, admission_decision, admission_decided_at FROM game_participants WHERE table_id=$1 AND principal_id=$2",
      [tableId, principalId],
    );
    const participant = decided.rows[0];
    if (!participant) return { ok: false, code: "PARTICIPANT_NOT_FOUND" };
    const fresh = participant.admission_decided_at !== null && Date.now() - participant.admission_decided_at.getTime() < DEALER_DECISION_TTL_MS;
    if (participant.admission_decision !== "ACCEPTED" || !fresh) return { ok: false, code: "ADMISSION_NOT_ACCEPTED" };
    const built = await this.deps.client.buildJoinForPlayer({
      tableUuid: tableId, player: new PublicKey(participant.wallet), commitmentHex: participant.commitment, sealedMarketHashHex: participant.sealed_market_hash,
    });
    return { ok: true, value: { transactionBase64: built.transactionBase64, lastValidBlockHeight: built.lastValidBlockHeight } };
  }

  /** Record funding only from the entry account on chain, never from the client's word. */
  async confirmJoin(tableId: string, principalId: string, signature: string): Promise<ChainGameResult<{ funded: true; fundedPlayers: number; tableFull: boolean }>> {
    const table = await this.tableRow(tableId);
    if (!table) return { ok: false, code: "TABLE_NOT_FOUND" };
    const rows = await this.deps.pool.query<{ wallet: string; commitment: string; sealed_market_hash: string }>(
      "SELECT wallet, commitment, sealed_market_hash FROM game_participants WHERE table_id=$1 AND principal_id=$2", [tableId, principalId],
    );
    const participant = rows.rows[0];
    if (!participant) return { ok: false, code: "PARTICIPANT_NOT_FOUND" };
    const entry = await this.deps.client.fetchEntry(tableId, new PublicKey(participant.wallet));
    if (!entry?.funded) return { ok: false, code: "ENTRY_NOT_FUNDED" };
    if (Buffer.from(entry.commitment).toString("hex") !== participant.commitment || Buffer.from(entry.sealedMarketHash).toString("hex") !== participant.sealed_market_hash) {
      return { ok: false, code: "ENTRY_COMMITMENT_MISMATCH" };
    }
    const status = await this.deps.client.connection.getSignatureStatus(signature, { searchTransactionHistory: true });
    const recordedSignature = status.value && status.value.err === null ? signature : null;
    await this.deps.pool.query(
      "UPDATE game_participants SET funding_status='funded', funding_signature=COALESCE(funding_signature, $3), funded_at=COALESCE(funded_at, now()), updated_at=now() WHERE table_id=$1 AND principal_id=$2",
      [tableId, principalId, recordedSignature],
    );
    const onChain = await this.deps.client.fetchTable(tableId);
    const fundedPlayers = onChain?.fundedPlayers ?? 0;
    const tableFull = fundedPlayers >= table.rules.playerCount;
    await this.publicEvent(tableId, "table.funded", { status: "OPEN", fundedPlayers, seats: table.rules.playerCount });
    if (tableFull) await this.deps.jobs.enqueue({ operationKey: `start:${tableId}`, tableId, kind: "capture_start", runAt: new Date(), payload: {} });
    return { ok: true, value: { funded: true, fundedPlayers, tableFull } };
  }

  /** Claim is built for the player's wallet. A loser has nothing to claim and is told so. */
  async buildClaim(tableId: string, principalId: string): Promise<ChainGameResult<{ kind: "payout" | "refund"; amountRaw: string; transactionBase64: string }>> {
    const rows = await this.deps.pool.query<{ wallet: string }>("SELECT wallet FROM game_participants WHERE table_id=$1 AND principal_id=$2", [tableId, principalId]);
    const wallet = rows.rows[0]?.wallet;
    if (!wallet) return { ok: false, code: "PARTICIPANT_NOT_FOUND" };
    const onChain = await this.deps.client.fetchTable(tableId);
    const entry = await this.deps.client.fetchEntry(tableId, new PublicKey(wallet));
    if (!onChain || !entry?.funded) return { ok: false, code: "CLAIM_NOT_AVAILABLE" };
    if (entry.claimed || entry.refunded) return { ok: false, code: "NOTHING_TO_CLAIM" };
    const status = toStatus(onChain.status);
    let kind: "payout" | "refund";
    let amountRaw: string;
    if (status === "settled") {
      if (entry.awardRaw.isZero()) return { ok: false, code: "NOTHING_TO_CLAIM" };
      kind = "payout";
      amountRaw = entry.awardRaw.toString();
    } else if (status === "cancelled" || status === "voided") {
      kind = "refund";
      amountRaw = onChain.stakeRaw.toString();
    } else {
      return { ok: false, code: "CLAIM_NOT_AVAILABLE" };
    }
    const built = await this.deps.client.buildClaimForPlayer({ tableUuid: tableId, player: new PublicKey(wallet), kind });
    return { ok: true, value: { kind, amountRaw, transactionBase64: built.transactionBase64 } };
  }

  // ---- Worker handlers -------------------------------------------------------------

  async handleJob(job: LeasedGameJob): Promise<void> {
    if (job.kind === "capture_start") return this.startRound(job.tableId);
    if (job.kind === "capture_end") return this.endRound(job.tableId);
    if (job.kind === "expire_table") return this.expire(job.tableId);
    throw new Error(`UNSUPPORTED_JOB_${job.kind}`);
  }

  private async fundedPicks(tableId: string) {
    const rows = await this.participants(tableId);
    const funded = [];
    for (const row of rows) {
      const player = new PublicKey(row.wallet);
      const entry = await this.deps.client.fetchEntry(tableId, player);
      if (!entry?.funded) continue;
      funded.push({ row, player, pick: this.decryptPick(tableId, row) });
    }
    return funded;
  }

  private async captureAll(picks: readonly { pick: PickPayload }[]): Promise<PairMark[]> {
    // Every pick is captured concurrently, so no player gets a later mark than another.
    return Promise.all(picks.map(({ pick }) => capturePairMark({ pairAddress: pick.pairMint, mint: pick.mint, fetcher: this.deps.fetcher })));
  }

  private async startRound(tableId: string): Promise<void> {
    let onChain = await this.deps.client.fetchTable(tableId);
    if (!onChain) throw new Error("TABLE_NOT_ON_CHAIN");
    if (toStatus(onChain.status) === "open") {
      await submitSigned(this.deps.client.connection, await this.deps.client.lockTable(tableId));
      onChain = await this.deps.client.fetchTable(tableId);
      if (!onChain) throw new Error("TABLE_MISSING_AFTER_LOCK");
      // If activation never lands, the table becomes refundable at the program's activation deadline.
      await this.deps.jobs.enqueue({ operationKey: `expire:${tableId}:locking`, tableId, kind: "expire_table", runAt: new Date(Number(onChain.activationDeadline.toString()) * 1_000 + 2_000), payload: { phase: "locking" } });
    }
    const current = toStatus(onChain.status);
    if (current === "active" || current === "settling") return this.scheduleSettlement(tableId); // A retry after activation landed.
    if (current !== "locking") return; // Voided by timeout.
    await this.setChainStatus(tableId, "locking");
    const funded = await this.fundedPicks(tableId);
    const marks = await this.captureAll(funded);
    const plannedStart = BigInt(onChain.plannedStart.toString());
    const tableId16 = tableIdBytes(tableId);
    const records = funded.map((item, index) => ({ ...item, mark: marks[index]!, evidenceHex: marks[index]!.rawResponseHash }));
    for (const record of records) {
      const entry = await this.deps.client.fetchEntry(tableId, record.player);
      if (entry?.startRecorded) continue;
      await submitSigned(this.deps.client.connection, await this.deps.client.recordStart({ tableUuid: tableId, player: record.player, startPrice18: BigInt(record.mark.price18), evidenceHashHex: record.evidenceHex }));
    }
    // Rebuild the start digest from what the chain actually stored, so a replayed job cannot drift.
    const roster = sortRoster(records);
    const leaves = [];
    for (const record of roster) {
      const entry = await this.deps.client.fetchEntry(tableId, record.player);
      if (!entry) throw new Error("ENTRY_MISSING_AFTER_START");
      leaves.push(Buffer.from(entry.startLeaf));
    }
    const expectedLeaves = roster.map((record) => startLeaf({ tableId: tableId16, player: record.player, commitment: hexToBytes32(record.row.commitment), sealedMarketHash: hexToBytes32(record.row.sealed_market_hash), price18: BigInt(record.mark.price18), plannedStart, evidenceHash: hexToBytes32(record.evidenceHex) }));
    await submitSigned(this.deps.client.connection, await this.deps.client.activateTable({ tableUuid: tableId, startDigest: startDigest(tableId16, leaves), rosterHash: rosterHash(tableId16, roster.map((record) => record.player)) }));
    await this.scheduleSettlement(tableId);
    if (!leaves.every((leaf, index) => leaf.equals(expectedLeaves[index]!))) {
      // The chain recorded a different start than we computed. The program still verifies its own
      // digest at finalize, so funds are safe; flag it for the operator instead of hiding it.
      await this.deps.orchestration.appendEvent({ tableId, audience: "operator", eventType: "table.start_leaf_drift", payload: { players: roster.length } });
    }
  }

  /** Idempotent: safe to call again from a retried job. */
  private async scheduleSettlement(tableId: string): Promise<void> {
    const active = await this.deps.client.fetchTable(tableId);
    if (!active) throw new Error("TABLE_MISSING_AFTER_ACTIVATE");
    const startsAt = new Date(Number(active.startsAt.toString()) * 1_000);
    const endsAt = new Date(Number(active.endsAt.toString()) * 1_000);
    const updated = await this.deps.pool.query(
      "UPDATE game_tables SET chain_status='active', status='ACTIVE', starts_at=$2, ends_at=$3, updated_at=now() WHERE id=$1 AND chain_status IN ('open','locking')",
      [tableId, startsAt, endsAt],
    );
    await this.deps.jobs.enqueue({ operationKey: `end:${tableId}`, tableId, kind: "capture_end", runAt: new Date(endsAt.getTime() + 1_500), payload: {}, maxAttempts: 8 });
    await this.deps.jobs.enqueue({ operationKey: `expire:${tableId}:settlement`, tableId, kind: "expire_table", runAt: new Date(Number(active.settlementDeadline.toString()) * 1_000 + 2_000), payload: { phase: "settlement" } });
    if (updated.rowCount === 1) await this.publicEvent(tableId, "table.active", { status: "ACTIVE", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), fundedPlayers: active.fundedPlayers });
  }

  private async endRound(tableId: string): Promise<void> {
    const onChain = await this.deps.client.fetchTable(tableId);
    if (!onChain) throw new Error("TABLE_NOT_ON_CHAIN");
    const status = toStatus(onChain.status);
    if (status === "settled" || status === "voided") return;
    if (status !== "active" && status !== "settling") throw new Error(`TABLE_NOT_ACTIVE_${status}`);
    if (Date.now() / 1_000 < Number(onChain.endsAt.toString())) throw new Error("ROUND_STILL_ACTIVE");
    const funded = await this.fundedPicks(tableId);
    const marks = await this.captureAll(funded);
    for (const [index, item] of funded.entries()) {
      const entry = await this.deps.client.fetchEntry(tableId, item.player);
      if (entry?.resultRecorded) continue;
      await submitSigned(this.deps.client.connection, await this.deps.client.recordResult({ tableUuid: tableId, player: item.player, endPrice18: BigInt(marks[index]!.price18) }));
    }
    const roster = sortRoster(funded);
    await submitSigned(this.deps.client.connection, await this.deps.client.finalizeResult({ tableUuid: tableId, playersInRosterOrder: roster.map((item) => item.player) }));
    const settled = await this.deps.client.fetchTable(tableId);
    await this.deps.pool.query("UPDATE game_tables SET chain_status='settled', status='SETTLED', updated_at=now() WHERE id=$1", [tableId]);
    const results = [];
    for (const item of roster) {
      const entry = await this.deps.client.fetchEntry(tableId, item.player);
      if (!entry) throw new Error("ENTRY_MISSING_AFTER_SETTLEMENT");
      results.push({ wallet: item.player.toBase58(), mint: item.pick.mint, scoreBps: entry.scoreBps.toString(), awardRaw: entry.awardRaw.toString() });
    }
    // Picks are revealed only now, at showdown, from what the chain settled.
    await this.publicEvent(tableId, "table.settled", { status: "SETTLED", fundedPlayers: settled?.fundedPlayers ?? roster.length, results });
  }

  private async expire(tableId: string): Promise<void> {
    const onChain = await this.deps.client.fetchTable(tableId);
    if (!onChain) return;
    const status = toStatus(onChain.status);
    if (status === "settled" || status === "cancelled" || status === "voided") {
      await this.setChainStatus(tableId, status);
      return;
    }
    const now = Date.now() / 1_000;
    const due = (status === "open" && now >= Number(onChain.openUntil.toString()))
      || (status === "locking" && now >= Number(onChain.activationDeadline.toString()))
      || ((status === "active" || status === "settling") && now >= Number(onChain.settlementDeadline.toString()));
    if (!due) return; // The table moved on; nothing to expire.
    await submitSigned(this.deps.client.connection, await this.deps.client.voidExpiredTable(tableId));
    const after = await this.deps.client.fetchTable(tableId);
    const finalStatus = after ? toStatus(after.status) : "cancelled";
    await this.deps.pool.query("UPDATE game_tables SET chain_status=$2, status=$3, updated_at=now() WHERE id=$1", [tableId, finalStatus, finalStatus.toUpperCase()]);
    await this.publicEvent(tableId, "table.refundable", { status: finalStatus.toUpperCase(), message: "The table timed out. Every funded player can claim a full refund." });
  }
}
