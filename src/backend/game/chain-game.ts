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
import { createHash, randomUUID } from "node:crypto";
import { inTransaction } from "./repository";
import { projectClaimState } from "../../domain/game/claim-state";
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
import { resolvePick, type ResolvedPick } from "../../adapters/game/pick-lookup";
import type { GameRepository } from "./repository";
import type { ClawPumpAdmissionClient } from "../../adapters/game/clawpump";
import { runAdmission } from "../../application/game/admission";
import { decryptPrivateJson, type EncryptedPrivateRecord, type PickKeyring } from "./pick-crypto";
import type { GameJobRepository, LeasedGameJob } from "../workers/job-repository";
import type { OrchestrationRepository } from "../workers/orchestration-repository";
import type { TradingSimService } from "./trading-sim";
import { PRICE_SCALE, portfolioIndex18 } from "../../domain/trading/sim";

export type ChainStatus = "none" | "open" | "locking" | "active" | "settling" | "settled" | "cancelled" | "voided";
export type ChainGameErrorCode =
  | "TABLE_NOT_FOUND" | "TABLE_ACCESS_DENIED" | "TABLE_ALREADY_OPEN" | "TABLE_NOT_OPEN" | "PARTICIPANT_NOT_FOUND"
  | "ADMISSION_NOT_ACCEPTED" | "DEALER_UNAVAILABLE" | "PAIR_NOT_FOR_MINT" | "ENTRY_NOT_FUNDED" | "ENTRY_COMMITMENT_MISMATCH"
  | "CLAIM_NOT_AVAILABLE" | "NOTHING_TO_CLAIM" | "WALLET_MISMATCH" | "PICK_NOT_FOUND" | "DEALER_BUDGET_EXHAUSTED"
  | "FAUCET_UNAVAILABLE" | "WALLET_NOT_BOUND" | "FAUCET_ALREADY_CLAIMED" | "FAUCET_EXHAUSTED" | "FAUCET_EMPTY";

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
  repository: Pick<GameRepository, "reserveBudget">;
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
  /** Trade mode tables: portfolio equity replaces the pick's price at start and end. */
  trading?: TradingSimService;
}

export interface PickCheck {
  asset: ResolvedPick;
  decision: "ACCEPTED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
  confidence: number | null;
  reasons: string[];
  code: string | null;
}

/** Daily ceiling on Dealer pre-checks across all players; each check is one paid agent turn. */
const DEALER_CHECKS_PER_DAY = 400n;
/** Devnet faucet: 10 TEST ANSEM and 0.02 SOL per grant, at most 50 grants a day, never below the operator reserve. */
const FAUCET_AMOUNT_RAW = 10_000_000n;
const FAUCET_LAMPORTS = 20_000_000;
const FAUCET_GRANTS_PER_DAY = 50n;
/** SOL the faucet leaves untouched for opening tables (about 250 table opens). */
const FAUCET_OPERATOR_RESERVE_LAMPORTS = 1_000_000_000;

export class ChainGameService {
  /** Mint -> latest Dealer verdict. The lock reuses it instead of paying for a second turn. */
  private readonly dealerCache = new Map<string, { at: number; decision: PickCheck["decision"]; evidenceHash: string; publicProjection: unknown }>();

  constructor(private readonly deps: ChainGameDependencies) {}

  get network(): ChainGameDependencies["network"] { return this.deps.network; }
  get dealerConfigured(): boolean { return this.deps.dealer !== null; }
  get roundSeconds(): number { return this.deps.roundSeconds; }

  /** Resolve what the player typed and ask the Dealer, before anything is committed or staked. */
  async checkPick(principalId: string, query: string): Promise<ChainGameResult<PickCheck>> {
    const asset = await resolvePick(query, this.deps.fetcher).catch(() => null);
    if (!asset) return { ok: false, code: "PICK_NOT_FOUND" };
    const cached = this.dealerCache.get(asset.mint);
    if (cached && Date.now() - cached.at < DEALER_DECISION_TTL_MS) {
      const projection = cached.publicProjection as { confidence?: number; reasons?: string[] };
      return { ok: true, value: { asset, decision: cached.decision, confidence: projection.confidence ?? null, reasons: projection.reasons ?? [], code: null } };
    }
    if (!this.deps.dealer) return { ok: false, code: "DEALER_UNAVAILABLE", detail: "No ClawPump Dealer is configured." };
    const now = new Date();
    const budget = await this.deps.repository.reserveBudget({
      id: randomUUID(), principalId, category: "dealer_check", operationKey: `dealer-check:${principalId}:${asset.mint}:${now.toISOString().slice(0, 13)}`,
      amountMicroUsd: "1", expiresAt: new Date(now.getTime() + DEALER_DECISION_TTL_MS), dailyLimitMicroUsd: DEALER_CHECKS_PER_DAY, now,
    });
    if (!budget.ok) return { ok: false, code: "DEALER_BUDGET_EXHAUSTED" };
    let run;
    try {
      run = await runAdmission({ mint: asset.mint, requestTimestamp: now.toISOString(), connection: this.deps.evidenceConnection, dealer: this.deps.dealer, fetcher: this.deps.fetcher, toolBudget: this.deps.dealerToolBudget ?? 0 });
    } catch (error) {
      return { ok: false, code: "DEALER_UNAVAILABLE", detail: error instanceof Error ? error.message : undefined };
    }
    const decision = run.ok && run.decision ? run.decision.decision : "INSUFFICIENT_EVIDENCE";
    const publicProjection = run.publicProjection ?? { code: run.code, reasons: ["The Dealer's answer did not pass KOVA's checks, so this pick is not admitted."] };
    // Only keep answers that passed the gate; a malformed or unsafe run is retried next time.
    if (run.ok) this.dealerCache.set(asset.mint, { at: Date.now(), decision, evidenceHash: run.evidenceHash, publicProjection });
    const projection = publicProjection as { confidence?: number; reasons?: string[] };
    return { ok: true, value: { asset, decision, confidence: projection.confidence ?? null, reasons: projection.reasons ?? [], code: run.code } };
  }

  /**
   * Devnet faucet. Sends TEST ANSEM and a little fee SOL to a wallet the caller has proven
   * they own. Once per wallet and once per account per UTC day, under a global daily cap.
   */
  async grantTestTokens(principalId: string, wallet: string): Promise<ChainGameResult<{ signature: string; amountRaw: string; lamports: number }>> {
    if (this.deps.network !== "solana-devnet") return { ok: false, code: "FAUCET_UNAVAILABLE" };
    const bound = await this.deps.pool.query("SELECT 1 FROM game_wallet_bindings WHERE wallet = $1 AND principal_id = $2", [wallet, principalId]);
    if (bound.rowCount !== 1) return { ok: false, code: "WALLET_NOT_BOUND" };
    // The operator's SOL also opens tables on chain. Keep a reserve so the faucet can never starve the game.
    const operatorLamports = await this.deps.client.connection.getBalance(this.deps.client.operatorAddress, "confirmed");
    if (operatorLamports < FAUCET_OPERATOR_RESERVE_LAMPORTS + FAUCET_LAMPORTS) return { ok: false, code: "FAUCET_EMPTY", detail: "Operator SOL is at its reserve." };
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
    const keys = [`faucet:wallet:${wallet}:${day}`, `faucet:principal:${principalId}:${day}`];
    for (const [index, operationKey] of keys.entries()) {
      const reserved = await this.deps.repository.reserveBudget({
        id: randomUUID(), principalId, category: "devnet_faucet", operationKey,
        // Only the wallet reservation counts toward the global cap.
        amountMicroUsd: index === 0 ? "1" : "0", expiresAt, dailyLimitMicroUsd: FAUCET_GRANTS_PER_DAY, now,
      });
      if (!reserved.ok) return { ok: false, code: "FAUCET_EXHAUSTED" };
      if (reserved.replayed) return { ok: false, code: "FAUCET_ALREADY_CLAIMED" };
    }
    try {
      const prepared = await this.deps.client.grantTestTokens({ wallet: new PublicKey(wallet), lamports: FAUCET_LAMPORTS, amountRaw: FAUCET_AMOUNT_RAW });
      const signature = await submitSigned(this.deps.client.connection, prepared);
      return { ok: true, value: { signature, amountRaw: FAUCET_AMOUNT_RAW.toString(), lamports: FAUCET_LAMPORTS } };
    } catch (error) {
      // Nothing was sent, so let the player try again.
      await this.deps.pool.query("DELETE FROM game_budget_reservations WHERE operation_key = ANY($1::text[])", [keys]);
      return { ok: false, code: "FAUCET_EMPTY", detail: error instanceof Error ? error.message.slice(0, 160) : undefined };
    }
  }

  /** Public once the table has settled: the chain-settled standings with picks revealed. */
  async result(tableId: string) {
    type SettledResult = { wallet: string; mint?: string; scoreBps: string; awardRaw: string; startPrice18?: string; endPrice18?: string };
    const row = await this.deps.pool.query<{ payload: { results?: SettledResult[] }; created_at: Date }>(
      "SELECT payload, created_at FROM game_events WHERE table_id=$1 AND event_type='table.settled' AND audience='public' ORDER BY sequence DESC LIMIT 1", [tableId],
    );
    const settled = row.rows[0];
    if (!settled) return null;
    const results = [];
    for (const result of settled.payload.results ?? []) {
      // Picks are public after showdown; label them with the token's own symbol for display.
      if (!result.mint) {
        results.push({ ...result, symbol: null, name: null, imageUrl: null });
        continue;
      }
      const asset = this.symbolCache.get(result.mint) ?? await resolvePick(result.mint, this.deps.fetcher).catch(() => null);
      if (asset) this.symbolCache.set(result.mint, asset);
      results.push({ ...result, symbol: asset?.symbol ?? null, name: asset?.name ?? null, imageUrl: asset?.imageUrl ?? null });
    }
    return { status: "SETTLED", results, settledAt: settled.created_at.toISOString() };
  }

  private readonly symbolCache = new Map<string, ResolvedPick>();

  private async tableRow(tableId: string) {
    const result = await this.deps.pool.query<{ id: string; host_principal_id: string; status: string; rules: { playerCount: number; stakeRaw: string; roundDurationSeconds: number }; chain_status: ChainStatus }>(
      "SELECT id, host_principal_id, status, rules, chain_status FROM game_tables WHERE id = $1", [tableId],
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

  /** A lobby that never gets a stake closes at its deadline. Nothing is on chain, so nothing to refund. */
  async scheduleLobbyExpiry(tableId: string, at: Date): Promise<void> {
    await this.deps.jobs.enqueue({ operationKey: `expire:${tableId}:lobby`, tableId, kind: "expire_table", runAt: new Date(at.getTime() + 2_000), payload: { phase: "lobby" } });
  }

  /** Host opens the table on chain early. Normally the first stake opens it (see `buildJoin`). */
  async openTable(tableId: string, principalId: string): Promise<ChainGameResult<{ chainAddress: string; opensUntil: string; signature: string }>> {
    const table = await this.tableRow(tableId);
    if (!table) return { ok: false, code: "TABLE_NOT_FOUND" };
    if (table.host_principal_id !== principalId) return { ok: false, code: "TABLE_ACCESS_DENIED" };
    if (table.chain_status !== "none") return { ok: false, code: "TABLE_ALREADY_OPEN" };
    return this.openOnChain(tableId);
  }

  /** One open per table at a time: two players staking together must not both try to open it. */
  private readonly opening = new Map<string, Promise<ChainGameResult<{ chainAddress: string; opensUntil: string; signature: string }>>>();

  private openOnChain(tableId: string): Promise<ChainGameResult<{ chainAddress: string; opensUntil: string; signature: string }>> {
    const pending = this.opening.get(tableId);
    if (pending) return pending;
    const run = this.initializeOnChain(tableId).finally(() => this.opening.delete(tableId));
    this.opening.set(tableId, run);
    return run;
  }

  /** Opening on chain starts the program's 10 minute window for every seat to stake. */
  private async initializeOnChain(tableId: string): Promise<ChainGameResult<{ chainAddress: string; opensUntil: string; signature: string }>> {
    const table = await this.tableRow(tableId);
    if (!table) return { ok: false, code: "TABLE_NOT_FOUND" };
    if (table.chain_status !== "none") return { ok: false, code: "TABLE_ALREADY_OPEN" };
    if (table.status !== "DRAFT") return { ok: false, code: "TABLE_NOT_OPEN" };
    const prepared = await this.deps.client.initializeTable({
      tableUuid: tableId, stakeRaw: BigInt(table.rules.stakeRaw), maxPlayers: table.rules.playerCount, openForSeconds: OPEN_FOR_SECONDS, roundSeconds: table.rules.roundDurationSeconds,
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
    const cached = this.dealerCache.get(pick.mint);
    if (cached && Date.now() - cached.at < DEALER_DECISION_TTL_MS) {
      await this.deps.pool.query(
        `UPDATE game_participants SET admission_decision=$3, admission_evidence_hash=$4, admission_public=$5, admission_decided_at=now(), updated_at=now()
         WHERE table_id=$1 AND principal_id=$2 AND funding_status='unfunded'`,
        [tableId, principalId, cached.decision, cached.evidenceHash, cached.publicProjection],
      );
      return { ok: true, value: { decision: cached.decision, publicProjection: cached.publicProjection } };
    }
    if (!this.deps.dealer) return { ok: false, code: "DEALER_UNAVAILABLE", detail: "No ClawPump Dealer is configured." };
    let run;
    try {
      run = await runAdmission({ mint: pick.mint, requestTimestamp: new Date().toISOString(), connection: this.deps.evidenceConnection, dealer: this.deps.dealer, fetcher: this.deps.fetcher, toolBudget: this.deps.dealerToolBudget ?? 0 });
    } catch (error) {
      return { ok: false, code: "DEALER_UNAVAILABLE", detail: error instanceof Error ? error.message : undefined };
    }
    const decision = run.ok && run.decision ? run.decision.decision : "INSUFFICIENT_EVIDENCE";
    if (run.ok) this.dealerCache.set(pick.mint, { at: Date.now(), decision, evidenceHash: run.evidenceHash, publicProjection: run.publicProjection });
    await this.deps.pool.query(
      `UPDATE game_participants SET admission_decision=$3, admission_evidence_hash=$4, admission_public=$5, admission_decided_at=now(), updated_at=now()
       WHERE table_id=$1 AND principal_id=$2 AND funding_status='unfunded'`,
      [tableId, principalId, decision, run.evidenceHash, run.publicProjection ?? { code: run.code }],
    );
    return { ok: true, value: { decision, publicProjection: run.publicProjection ?? { code: run.code } } };
  }

  /** Build the deposit for the player's wallet. The admission key signs here and nowhere else. */
  async buildJoin(tableId: string, principalId: string): Promise<ChainGameResult<{ transactionBase64: string; lastValidBlockHeight: number }>> {
    let table = await this.tableRow(tableId);
    if (!table) return { ok: false, code: "TABLE_NOT_FOUND" };
    const admitted = await this.deps.pool.query<{ admission_decision: string }>("SELECT admission_decision FROM game_participants WHERE table_id=$1 AND principal_id=$2", [tableId, principalId]);
    // The first admitted stake opens the lobby on chain; everyone then has the program's ten minutes.
    if (table.chain_status === "none" && admitted.rows[0]?.admission_decision === "ACCEPTED") {
      const opened = await this.openOnChain(tableId);
      if (!opened.ok && opened.code !== "TABLE_ALREADY_OPEN") return opened;
      table = await this.tableRow(tableId);
      if (!table) return { ok: false, code: "TABLE_NOT_FOUND" };
    }
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
  async buildClaim(tableId: string, principalId: string): Promise<ChainGameResult<{ kind: "payout" | "refund"; amountRaw: string; transactionBase64: string; wallet: string; lastValidBlockHeight: number }>> {
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
    return { ok: true, value: { kind, amountRaw, wallet, transactionBase64: built.transactionBase64, lastValidBlockHeight: built.lastValidBlockHeight } };
  }

  /** Read the program entry independently; a broadcast signature never establishes a claim. */
  async claimState(tableId: string, principalId: string): Promise<{ status: "pending" | "paid" | "refunded" | "not_applicable"; kind: "payout" | "refund" | null; amountRaw: string }> {
    const rows = await this.deps.pool.query<{ wallet: string }>("SELECT wallet FROM game_participants WHERE table_id=$1 AND principal_id=$2", [tableId, principalId]);
    const wallet = rows.rows[0]?.wallet;
    if (!wallet) return { status: "not_applicable", kind: null, amountRaw: "0" };
    const receipt = await this.deps.pool.query<{ payload: { kind: "payout" | "refund"; amountRaw: string } }>(
      "SELECT payload FROM game_events WHERE table_id=$1 AND principal_id=$2 AND audience='principal' AND event_type='claim.confirmed' ORDER BY sequence LIMIT 1", [tableId, principalId],
    );
    if (receipt.rows[0]) return { status: receipt.rows[0].payload.kind === "refund" ? "refunded" : "paid", ...receipt.rows[0].payload };
    const [table, entry] = await Promise.all([this.deps.client.fetchTable(tableId), this.deps.client.fetchEntry(tableId, new PublicKey(wallet))]);
    if (!table || !entry) throw new Error("CLAIM_STATE_UNAVAILABLE");
    const state = projectClaimState(table ? toStatus(table.status) : "none", entry ? { funded: entry.funded, claimed: entry.claimed, refunded: entry.refunded, awardRaw: entry.awardRaw.toString() } : null, table?.stakeRaw.toString() ?? "0");
    if (state.status === "paid" || state.status === "refunded") {
      // Serialize reconciliation per entry, including concurrent reads and retries.
      await inTransaction(this.deps.pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["claim:" + tableId + ":" + principalId]);
        await client.query(
          `INSERT INTO game_events (table_id,audience,principal_id,event_type,payload)
           SELECT $1,'principal',$2,'claim.confirmed',$3 WHERE NOT EXISTS (
             SELECT 1 FROM game_events WHERE table_id=$1 AND principal_id=$2 AND audience='principal' AND event_type='claim.confirmed'
           )`, [tableId, principalId, { kind: state.kind, amountRaw: state.amountRaw }],
        );
      });
    }
    return state;
  }

  async claimTransactionState(signature: string, lastValidBlockHeight?: number): Promise<"confirming" | "failed" | "expired"> {
    const [signatures, height] = await Promise.all([
      this.deps.client.connection.getSignatureStatuses([signature], { searchTransactionHistory: true }),
      lastValidBlockHeight === undefined ? Promise.resolve(null) : this.deps.client.connection.getBlockHeight("confirmed"),
    ]);
    const status = signatures.value[0];
    if (status?.err) return "failed";
    if (!status && height !== null && lastValidBlockHeight !== undefined && height > lastValidBlockHeight) return "expired";
    return "confirming";
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

  private async isTrading(tableId: string): Promise<boolean> {
    const result = await this.deps.pool.query<{ mode: string | null }>("SELECT rules->>'gameMode' AS mode FROM game_tables WHERE id=$1", [tableId]);
    return result.rows[0]?.mode === "trading";
  }

  /** Funded traders. They have no secret pick; their "market" is their own portfolio. */
  private async fundedTraders(tableId: string) {
    const rows = await this.deps.pool.query<{ wallet: string; commitment: string; sealed_market_hash: string }>(
      "SELECT wallet, commitment, sealed_market_hash FROM game_participants WHERE table_id=$1 ORDER BY created_at", [tableId],
    );
    const funded = [];
    for (const row of rows.rows) {
      const player = new PublicKey(row.wallet);
      const entry = await this.deps.client.fetchEntry(tableId, player);
      if (entry?.funded) funded.push({ row, player });
    }
    return funded;
  }

  /**
   * Start marks for every funded player: the pick's live price (Predict), or a portfolio index of
   * 1.0 for everyone (Trade), with an evidence hash either way.
   */
  private async startMarks(tableId: string) {
    if (await this.isTrading(tableId)) {
      const funded = await this.fundedTraders(tableId);
      return funded.map((item) => ({ ...item, price18: PRICE_SCALE.toString(), evidenceHex: createHash("sha256").update(`kova-trade-start-v1|${tableId}|${item.row.wallet}`).digest("hex") }));
    }
    const funded = await this.fundedPicks(tableId);
    const marks = await this.captureAll(funded);
    return funded.map((item, index) => ({ row: item.row, player: item.player, price18: marks[index]!.price18, evidenceHex: marks[index]!.rawResponseHash }));
  }

  /** End marks: the pick's closing price, or the trader's equity over starting cash, all marked at once. */
  private async endMarks(tableId: string): Promise<{ player: PublicKey; wallet: string; mint: string | null; price18: string }[]> {
    if (await this.isTrading(tableId)) {
      if (!this.deps.trading) throw new Error("TRADING_UNAVAILABLE");
      const funded = await this.fundedTraders(tableId);
      const equities = await this.deps.trading.equities(tableId);
      return funded.map((item) => {
        const account = equities.get(item.row.wallet);
        if (!account) throw new Error("TRADING_ACCOUNT_UNAVAILABLE");
        return { player: item.player, wallet: item.row.wallet, mint: null, price18: portfolioIndex18(account.equity, account.starting).toString() };
      });
    }
    const funded = await this.fundedPicks(tableId);
    const marks = await this.captureAll(funded);
    return funded.map((item, index) => ({ player: item.player, wallet: item.row.wallet, mint: item.pick.mint, price18: marks[index]!.price18 }));
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
    const records = await this.startMarks(tableId);
    const plannedStart = BigInt(onChain.plannedStart.toString());
    const tableId16 = tableIdBytes(tableId);
    for (const record of records) {
      const entry = await this.deps.client.fetchEntry(tableId, record.player);
      if (entry?.startRecorded) continue;
      await submitSigned(this.deps.client.connection, await this.deps.client.recordStart({ tableUuid: tableId, player: record.player, startPrice18: BigInt(record.price18), evidenceHashHex: record.evidenceHex }));
    }
    // Rebuild the start digest from what the chain actually stored, so a replayed job cannot drift.
    const roster = sortRoster(records);
    const leaves = [];
    for (const record of roster) {
      const entry = await this.deps.client.fetchEntry(tableId, record.player);
      if (!entry) throw new Error("ENTRY_MISSING_AFTER_START");
      leaves.push(Buffer.from(entry.startLeaf));
    }
    const expectedLeaves = roster.map((record) => startLeaf({ tableId: tableId16, player: record.player, commitment: hexToBytes32(record.row.commitment), sealedMarketHash: hexToBytes32(record.row.sealed_market_hash), price18: BigInt(record.price18), plannedStart, evidenceHash: hexToBytes32(record.evidenceHex) }));
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
    // Trade mode: balances unlock once the round is live on chain. Idempotent.
    if (this.deps.trading && await this.isTrading(tableId)) await this.deps.trading.activate(tableId);
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
    const funded = await this.endMarks(tableId);
    for (const item of funded) {
      const entry = await this.deps.client.fetchEntry(tableId, item.player);
      if (entry?.resultRecorded) continue;
      await submitSigned(this.deps.client.connection, await this.deps.client.recordResult({ tableUuid: tableId, player: item.player, endPrice18: BigInt(item.price18) }));
    }
    const roster = sortRoster(funded);
    await submitSigned(this.deps.client.connection, await this.deps.client.finalizeResult({ tableUuid: tableId, playersInRosterOrder: roster.map((item) => item.player) }));
    const settled = await this.deps.client.fetchTable(tableId);
    await this.deps.pool.query("UPDATE game_tables SET chain_status='settled', status='SETTLED', updated_at=now() WHERE id=$1", [tableId]);
    const results = [];
    for (const item of roster) {
      const entry = await this.deps.client.fetchEntry(tableId, item.player);
      if (!entry) throw new Error("ENTRY_MISSING_AFTER_SETTLEMENT");
      results.push({
        wallet: item.player.toBase58(), ...(item.mint ? { mint: item.mint } : {}), scoreBps: entry.scoreBps.toString(), awardRaw: entry.awardRaw.toString(),
        startPrice18: entry.startPrice18.toString(), endPrice18: entry.endPrice18.toString(),
      });
    }
    // Picks are revealed only now, at showdown, from what the chain settled.
    await this.publicEvent(tableId, "table.settled", { status: "SETTLED", fundedPlayers: settled?.fundedPlayers ?? roster.length, results });
  }

  private async expire(tableId: string): Promise<void> {
    const onChain = await this.deps.client.fetchTable(tableId);
    if (!onChain) {
      // A lobby nobody staked in: close it off chain. There is no escrow to void or refund.
      const closed = await this.deps.pool.query("UPDATE game_tables SET status='CANCELLED', updated_at=now() WHERE id=$1 AND status='DRAFT' AND chain_status='none'", [tableId]);
      if (closed.rowCount === 1) await this.publicEvent(tableId, "table.expired", { status: "CANCELLED", message: "Nobody staked before the table's deadline, so it closed. No funds moved." });
      return;
    }
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
