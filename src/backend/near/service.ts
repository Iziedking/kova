/**
 * NEAR mode: the settler and the House.
 *
 * The CHIP contract holds every stake, burn and payout. This service only does what the chain
 * cannot: it keeps each pick sealed until its table locks, reads market prices, reveals picks
 * with start prices, reports end prices, voids tables whose deadline passed, closes finished
 * days, and plays the House from its own account and bankroll.
 *
 * Every step is safe to repeat: the contract refuses a second reveal, settle, void or close, and
 * if this service stops, any account can void a table after its deadline and every stake returns.
 */
import { Account, KeyPairSigner } from "near-api-js";
import type { Pool } from "pg";
import { CHIP, type ChipClient, type ChipTable, formatChip, newSalt, pickCommitment } from "../../adapters/near/chip";
import { type Leaderboard, buildLeaderboard, readAllTables } from "../../adapters/near/leaderboard";
import type { NearAiHouseBrain } from "../../adapters/near/near-ai";
import { NEAR_MARKETS, type NearPrice, type NearPriceFeed, marketById } from "../../adapters/near/prices";

export type SealedPick = { market: string; salt: string; reason?: string };

export type PriceMark = {
  contractId: string;
  tableId: string;
  player: string;
  phase: "start" | "end";
  market: string;
  priceE18: bigint;
  source: string;
  sourceRef: string;
  capturedAt: Date;
  txHash: string | null;
};

export interface NearPickStore {
  /** Returns false when a pick for this seat already exists. */
  putPick(row: { contractId: string; tableId: string; player: string; commitment: string; sealed: unknown }): Promise<boolean>;
  getPicks(contractId: string, tableId: string): Promise<Map<string, { commitment: string; sealed: unknown }>>;
  putMarks(rows: readonly PriceMark[]): Promise<void>;
  getMarks(contractId: string, tableId: string): Promise<PriceMark[]>;
}

export class PostgresNearPickStore implements NearPickStore {
  constructor(private readonly pool: Pool) {}

  async putPick(row: { contractId: string; tableId: string; player: string; commitment: string; sealed: unknown }) {
    const result = await this.pool.query(
      "INSERT INTO near_picks (contract_id, table_id, player, commitment, sealed) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
      [row.contractId, row.tableId, row.player, row.commitment, JSON.stringify(row.sealed)],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getPicks(contractId: string, tableId: string) {
    const result = await this.pool.query<{ player: string; commitment: string; sealed: unknown }>(
      "SELECT player, commitment, sealed FROM near_picks WHERE contract_id = $1 AND table_id = $2",
      [contractId, tableId],
    );
    return new Map(result.rows.map((r) => [r.player, { commitment: r.commitment, sealed: r.sealed }]));
  }

  async putMarks(rows: readonly PriceMark[]) {
    for (const m of rows) {
      await this.pool.query(
        `INSERT INTO near_price_marks (contract_id, table_id, player, phase, market, price_e18, source, source_ref, captured_at, tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (contract_id, table_id, player, phase) DO UPDATE SET tx_hash = COALESCE(near_price_marks.tx_hash, EXCLUDED.tx_hash)`,
        [m.contractId, m.tableId, m.player, m.phase, m.market, m.priceE18.toString(), m.source, m.sourceRef, m.capturedAt, m.txHash],
      );
    }
  }

  async getMarks(contractId: string, tableId: string) {
    const result = await this.pool.query<{ player: string; phase: "start" | "end"; market: string; price_e18: string; source: string; source_ref: string; captured_at: Date; tx_hash: string | null }>(
      "SELECT player, phase, market, price_e18, source, source_ref, captured_at, tx_hash FROM near_price_marks WHERE contract_id = $1 AND table_id = $2 ORDER BY phase DESC, player",
      [contractId, tableId],
    );
    return result.rows.map((r) => ({ contractId, tableId, player: r.player, phase: r.phase, market: r.market, priceE18: BigInt(r.price_e18), source: r.source, sourceRef: r.source_ref, capturedAt: r.captured_at, txHash: r.tx_hash }));
  }
}

/** In-memory store for preview mode and tests. */
export class MemoryNearPickStore implements NearPickStore {
  private picks = new Map<string, { commitment: string; sealed: unknown }>();
  private marks = new Map<string, PriceMark>();

  async putPick(row: { contractId: string; tableId: string; player: string; commitment: string; sealed: unknown }) {
    const key = `${row.contractId}|${row.tableId}|${row.player}`;
    if (this.picks.has(key)) return false;
    this.picks.set(key, { commitment: row.commitment, sealed: row.sealed });
    return true;
  }

  async getPicks(contractId: string, tableId: string) {
    const out = new Map<string, { commitment: string; sealed: unknown }>();
    for (const [key, value] of this.picks) {
      const [c, t, player] = key.split("|");
      if (c === contractId && t === tableId) out.set(player, value);
    }
    return out;
  }

  async putMarks(rows: readonly PriceMark[]) {
    for (const m of rows) this.marks.set(`${m.contractId}|${m.tableId}|${m.player}|${m.phase}`, m);
  }

  async getMarks(contractId: string, tableId: string) {
    return [...this.marks.values()].filter((m) => m.contractId === contractId && m.tableId === tableId);
  }
}

export type Sealer = {
  seal: (value: SealedPick, context: { tableId: string; player: string }) => unknown;
  open: (sealed: unknown, context: { tableId: string; player: string }) => SealedPick;
};

export type NearServiceDeps = {
  chip: ChipClient;
  settler: Account;
  house: Account;
  store: NearPickStore;
  prices: NearPriceFeed;
  sealer: Sealer;
  houseMaxOpenTables: number;
  brain?: NearAiHouseBrain;
  now?: () => number;
  log?: (event: Record<string, unknown>) => void;
};

export type PickResult = { ok: true; stored: boolean } | { ok: false; code: string; message: string };

export type HouseTableResult =
  | { ok: true; tableId: string; txHash: string; explorerUrl: string; stake: string; roundSeconds: number }
  | { ok: false; code: "HOUSE_SITS_OUT" | "HOUSE_BUSY" | "INVALID" | "CHAIN_REFUSED"; message: string; houseBalance?: string };

export const ROUND_CHOICES = [60, 90, 300, 600] as const;

export function accountFromKey(accountId: string, key: `ed25519:${string}`, chip: ChipClient): Account {
  return new Account(accountId, chip.provider, KeyPairSigner.fromSecretKey(key));
}

export class NearChipService {
  private readonly inFlight = new Set<string>();
  private lastDayCheck = 0;
  private ticking = false;

  constructor(private readonly deps: NearServiceDeps) {}

  private get contractId() {
    return this.deps.chip.contractId;
  }

  private now() {
    return Math.floor((this.deps.now ?? Date.now)() / 1000);
  }

  private log(event: Record<string, unknown>) {
    (this.deps.log ?? ((e) => console.log(JSON.stringify(e))))({ at: new Date().toISOString(), ...event });
  }

  /**
   * A player hands over the pick behind their commitment. Proof of ownership is the commitment
   * itself: only the player knows the salt that makes it match their seat on chain.
   */
  async submitPick(input: { tableId: string; player: string; market: string; salt: string }): Promise<PickResult> {
    if (!marketById(input.market)) return { ok: false, code: "UNKNOWN_MARKET", message: "That market is not on the NEAR table list." };
    if (!/^[0-9a-f]{32,128}$/.test(input.salt)) return { ok: false, code: "BAD_SALT", message: "Salt must be 32 to 128 lowercase hex characters." };
    const table = await this.deps.chip.getTable(input.tableId);
    if (!table) return { ok: false, code: "NO_TABLE", message: "Table not found on chain." };
    const seat = table.players.find((p) => p.player === input.player);
    if (!seat) return { ok: false, code: "NOT_SEATED", message: "That account has no seat at this table." };
    if (seat.commitment !== (await pickCommitment(input.player, input.market, input.salt))) {
      return { ok: false, code: "COMMITMENT_MISMATCH", message: "This pick does not match the commitment on chain." };
    }
    const sealed = this.deps.sealer.seal({ market: input.market, salt: input.salt }, { tableId: input.tableId, player: input.player });
    const stored = await this.deps.store.putPick({ contractId: this.contractId, tableId: input.tableId, player: input.player, commitment: seat.commitment, sealed });
    return { ok: true, stored };
  }

  async houseStatus() {
    const [balance, tables] = await Promise.all([this.deps.chip.balanceOf(this.deps.house.accountId), this.deps.chip.getTables(undefined, 30)]);
    const open = tables.filter((t) => t.host === this.deps.house.accountId && t.status === "Open").length;
    return { account: this.deps.house.accountId, balance, openTables: open, maxOpenTables: this.deps.houseMaxOpenTables };
  }

  /** Every settled table on the contract, ranked by net CHIP. Read from get_tables only. */
  async leaderboard(): Promise<Leaderboard> {
    const { tables, truncated } = await readAllTables(this.deps.chip);
    return buildLeaderboard(tables, this.deps.house.accountId, truncated);
  }

  /**
   * The House's pick. With NEAR AI configured, a model on NEAR AI Cloud chooses among the
   * available markets and gives one line of reasoning. Otherwise, or if the model fails, a fixed
   * public rule picks the biggest one-hour mover among coins that traded in the last five minutes
   * (a coin with no trades cannot move in a short round), and the reason says which was used.
   */
  private async housePick(): Promise<{ market: string; reason: string }> {
    const prices = await Promise.allSettled(NEAR_MARKETS.map((m) => this.deps.prices.price(m.id)));
    const usable = prices.flatMap((p) => (p.status === "fulfilled" ? [p.value] : [])) as NearPrice[];
    if (!usable.length) throw new Error("No NEAR market price is available right now.");
    if (this.deps.brain?.enabled) {
      const choice = await this.deps.brain.choose(usable.map((p) => ({ market: p.market, symbol: marketById(p.market)?.symbol ?? p.market, change1hPct: p.change1hPct, liquidityUsd: p.liquidityUsd, trades5m: p.trades5m })));
      if (choice) return { market: choice.market, reason: `NEAR AI (${choice.model}): ${choice.reason}` };
    }
    return fixedHousePick(usable, this.deps.brain?.enabled ? "NEAR AI did not answer in time, so the fixed rule picked" : "Fixed rule");
  }

  /** Opens a two-seat table with the House already seated. The House sits out when it cannot cover the stake. */
  async openHouseTable(input: { stake: bigint; roundSeconds: number }): Promise<HouseTableResult> {
    if (!ROUND_CHOICES.includes(input.roundSeconds as (typeof ROUND_CHOICES)[number])) return { ok: false, code: "INVALID", message: `Round length must be one of ${ROUND_CHOICES.join(", ")} seconds.` };
    const config = await this.deps.chip.getConfig();
    if (input.stake < config.min_stake || input.stake > config.max_stake) return { ok: false, code: "INVALID", message: "Stake is outside the allowed range." };
    const status = await this.houseStatus();
    if (status.balance < input.stake) {
      return { ok: false, code: "HOUSE_SITS_OUT", message: `The House has ${formatChip(status.balance)} CHIP and cannot cover ${formatChip(input.stake)}. It sits out until it wins chips back.`, houseBalance: status.balance.toString() };
    }
    if (status.openTables >= this.deps.houseMaxOpenTables) return { ok: false, code: "HOUSE_BUSY", message: "The House already has its maximum number of open tables. Join one of them." };
    const pick = await this.housePick();
    const salt = newSalt();
    const commitment = await pickCommitment(this.deps.house.accountId, pick.market, salt);
    const result = await this.deps.chip.openTable(this.deps.house, { stake: input.stake, seats: 2, roundSeconds: input.roundSeconds, openSeconds: 180, commitment });
    if (!result.success || typeof result.value !== "string") return { ok: false, code: "CHAIN_REFUSED", message: result.failure ?? "The contract refused the table." };
    // If this write is lost the table cannot start, and it refunds both stakes after its deadline.
    await this.deps.store.putPick({ contractId: this.contractId, tableId: result.value, player: this.deps.house.accountId, commitment, sealed: this.deps.sealer.seal({ ...pick, salt }, { tableId: result.value, player: this.deps.house.accountId }) });
    this.log({ event: "near_house_table_opened", tableId: result.value, stake: input.stake.toString(), tx: result.txHash });
    return { ok: true, tableId: result.value, txHash: result.txHash, explorerUrl: result.explorerUrl, stake: input.stake.toString(), roundSeconds: input.roundSeconds };
  }

  /** The House's reason, shown only once the table has ended. */
  async houseReason(tableId: string): Promise<string | null> {
    const table = await this.deps.chip.getTable(tableId);
    if (!table || !["Settled", "Cancelled", "Voided"].includes(table.status)) return null;
    const picks = await this.deps.store.getPicks(this.contractId, tableId);
    const house = picks.get(this.deps.house.accountId);
    if (!house) return null;
    return this.deps.sealer.open(house.sealed, { tableId, player: this.deps.house.accountId }).reason ?? null;
  }

  getMarks(tableId: string) {
    return this.deps.store.getMarks(this.contractId, tableId);
  }

  private async prices(markets: readonly string[]) {
    return Promise.all(markets.map((m) => this.deps.prices.price(m)));
  }

  private async start(table: ChipTable) {
    const picks = await this.deps.store.getPicks(this.contractId, table.id);
    const missing = table.players.filter((s) => !picks.has(s.player)).map((s) => s.player);
    if (missing.length) {
      this.log({ event: "near_start_waiting_for_picks", tableId: table.id, missing });
      return;
    }
    const opened = table.players.map((s) => this.deps.sealer.open(picks.get(s.player)!.sealed, { tableId: table.id, player: s.player }));
    const prices = await this.prices(opened.map((p) => p.market));
    const result = await this.deps.chip.startRound(
      this.deps.settler,
      table.id,
      table.players.map((s, i) => ({ player: s.player, market: opened[i].market, salt: opened[i].salt, startPrice: prices[i].priceE18 })),
    );
    this.log({ event: "near_round_start", tableId: table.id, ok: result.success, tx: result.txHash, failure: result.failure });
    if (result.success) await this.deps.store.putMarks(this.marks(table, "start", prices, result.txHash));
  }

  private async settle(table: ChipTable) {
    const markets = table.players.map((s) => s.market as string);
    const prices = await this.prices(markets);
    const result = await this.deps.chip.settleRound(this.deps.settler, table.id, table.players.map((s, i) => ({ player: s.player, endPrice: prices[i].priceE18 })));
    this.log({ event: "near_round_settle", tableId: table.id, ok: result.success, tx: result.txHash, failure: result.failure });
    if (result.success) await this.deps.store.putMarks(this.marks(table, "end", prices, result.txHash));
  }

  private marks(table: ChipTable, phase: "start" | "end", prices: readonly NearPrice[], txHash: string): PriceMark[] {
    return table.players.map((s, i) => ({ contractId: this.contractId, tableId: table.id, player: s.player, phase, market: prices[i].market, priceE18: prices[i].priceE18, source: prices[i].source, sourceRef: `${prices[i].sourceRef} usd=${prices[i].priceUsd}`, capturedAt: prices[i].capturedAt, txHash }));
  }

  private async closeYesterday() {
    if (this.now() - this.lastDayCheck < 60) return;
    this.lastDayCheck = this.now();
    const stats = await this.deps.chip.getStats();
    const yesterday = stats.today - 1;
    if (yesterday < stats.launch_day) return;
    const day = await this.deps.chip.getDay(yesterday);
    if (day.closed) return;
    const result = await this.deps.chip.closeDay(this.deps.settler, yesterday);
    this.log({ event: "near_day_closed", day: yesterday, ok: result.success, tx: result.txHash, failure: result.failure });
  }

  /** One pass over recent tables. Each table moves at most one step per pass. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.now();
      const tables = await this.deps.chip.getTables(undefined, 40);
      for (const table of tables) {
        if (this.inFlight.has(table.id)) continue;
        const action =
          (table.status === "Open" && now >= table.open_until) || (table.status === "Locked" && now >= table.start_deadline) || (table.status === "Active" && now >= table.settle_deadline)
            ? "void"
            : table.status === "Locked"
              ? "start"
              : table.status === "Active" && now >= table.ends_at
                ? "settle"
                : null;
        if (!action) continue;
        this.inFlight.add(table.id);
        try {
          if (action === "void") {
            const result = await this.deps.chip.voidTable(this.deps.settler, table.id);
            this.log({ event: "near_table_void", tableId: table.id, ok: result.success, tx: result.txHash, failure: result.failure });
          } else if (action === "start") {
            await this.start(table);
          } else {
            await this.settle(table);
          }
        } catch (error) {
          this.log({ event: "near_table_step_failed", tableId: table.id, action, message: (error as Error).message.slice(0, 300) });
        } finally {
          this.inFlight.delete(table.id);
        }
      }
      await this.closeYesterday();
    } catch (error) {
      this.log({ event: "near_tick_failed", message: (error as Error).message.slice(0, 300) });
    } finally {
      this.ticking = false;
    }
  }
}

export const DEFAULT_HOUSE_STAKE = 25n * CHIP;

/** The House's public fallback rule: the biggest one-hour mover among coins trading right now. */
export function fixedHousePick(usable: readonly NearPrice[], why: string): { market: string; reason: string } {
  if (!usable.length) throw new Error("No NEAR market price is available right now.");
  const trading = usable.filter((p) => p.trades5m > 0);
  const pool = trading.length ? trading : usable;
  const best = [...pool].sort((a, b) => Math.abs(b.change1hPct ?? 0) - Math.abs(a.change1hPct ?? 0) || b.trades5m - a.trades5m)[0];
  const symbol = marketById(best.market)?.symbol ?? best.market;
  const move = best.change1hPct === null ? "no one-hour figure" : `${best.change1hPct > 0 ? "+" : ""}${best.change1hPct}% in the last hour`;
  const scope = trading.length ? `the biggest one-hour mover of the ${trading.length} coins trading right now` : "the biggest one-hour mover (no coin traded in the last five minutes)";
  return { market: best.market, reason: `${why}: ${scope}. ${symbol} (${move}, ${best.trades5m} trades in 5 min).` };
}
