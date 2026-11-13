/**
 * The CHIP leaderboard, computed only from the contract's own `get_tables` view, so anyone can
 * rebuild it from chain. Only settled tables count: a refunded table returns every stake, so it
 * moves nobody up or down.
 */
import type { ChipTable } from "./chip";

/** `get_tables` returns at most 50 per page; 40 pages covers the first 2,000 tables. */
export const TABLE_PAGE = 50;
export const MAX_TABLE_PAGES = 40;

export type LeaderboardRow = {
  /** Shared by equal records: same net CHIP, wins and tables played. */
  rank: number;
  player: string;
  isHouse: boolean;
  tables: number;
  wins: number;
  splits: number;
  losses: number;
  staked: bigint;
  awarded: bigint;
  /** Awards minus stakes over settled tables. */
  net: bigint;
  lastTableId: string;
};

export type Leaderboard = {
  rows: LeaderboardRow[];
  settledTables: number;
  /** True when the table cap was reached, so the oldest tables were not read. */
  truncated: boolean;
};

type TableReader = { getTables(before?: string, limit?: number): Promise<ChipTable[]> };

/** Reads every table, newest first, a page at a time, up to the cap. */
export async function readAllTables(chip: TableReader, maxPages = MAX_TABLE_PAGES): Promise<{ tables: ChipTable[]; truncated: boolean }> {
  const tables: ChipTable[] = [];
  let before: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await chip.getTables(before, TABLE_PAGE);
    tables.push(...batch);
    if (batch.length < TABLE_PAGE) return { tables, truncated: false };
    before = batch[batch.length - 1].id;
    if (before === "1") return { tables, truncated: false };
  }
  return { tables, truncated: true };
}

export function buildLeaderboard(tables: readonly ChipTable[], houseAccount: string, truncated = false): Leaderboard {
  const rows = new Map<string, LeaderboardRow>();
  let settledTables = 0;
  for (const table of tables) {
    if (table.status !== "Settled") continue;
    settledTables += 1;
    for (const seat of table.players) {
      const row = rows.get(seat.player) ?? {
        rank: 0,
        player: seat.player,
        isHouse: seat.player === houseAccount,
        tables: 0,
        wins: 0,
        splits: 0,
        losses: 0,
        staked: 0n,
        awarded: 0n,
        net: 0n,
        lastTableId: table.id,
      };
      row.tables += 1;
      row.staked += table.stake;
      row.awarded += seat.award;
      row.net = row.awarded - row.staked;
      if (seat.award === 0n) row.losses += 1;
      else if (table.winners > 1) row.splits += 1;
      else row.wins += 1;
      if (BigInt(table.id) > BigInt(row.lastTableId)) row.lastTableId = table.id;
      rows.set(seat.player, row);
    }
  }
  const record = (a: LeaderboardRow, b: LeaderboardRow) => (a.net === b.net ? 0 : a.net > b.net ? -1 : 1) || b.wins - a.wins || b.tables - a.tables;
  const sorted = [...rows.values()].sort((a, b) => record(a, b) || a.player.localeCompare(b.player));
  // Equal records share a rank (1, 1, 3); the name only fixes the order within a shared rank.
  sorted.forEach((row, i) => {
    row.rank = i > 0 && record(sorted[i - 1], row) === 0 ? sorted[i - 1].rank : i + 1;
  });
  return { rows: sorted, settledTables, truncated };
}

/** A launch scout: a player's record on meme.cooking picks only (calls and launched tokens). */
export type ScoutRow = {
  rank: number;
  player: string;
  isHouse: boolean;
  /** Settled seats with a meme.cooking pick. */
  calls: number;
  /** Of those, seats that took the whole pot. */
  called: number;
  splits: number;
  /** Awards minus stakes on those seats. */
  net: bigint;
  /** The latest settled launch pick: its table and market. */
  lastTableId: string;
  lastMarket: string;
};

/**
 * Who called launches best: every settled seat whose pick was a meme.cooking launch, ranked by
 * pots taken, then net CHIP on those seats, then launch tables played.
 */
export function buildScouts(tables: readonly ChipTable[], houseAccount: string, isLaunchMarket: (market: string) => boolean): ScoutRow[] {
  const rows = new Map<string, ScoutRow>();
  for (const table of tables) {
    if (table.status !== "Settled") continue;
    for (const seat of table.players) {
      if (!seat.market || !isLaunchMarket(seat.market)) continue;
      const row = rows.get(seat.player) ?? { rank: 0, player: seat.player, isHouse: seat.player === houseAccount, calls: 0, called: 0, splits: 0, net: 0n, lastTableId: table.id, lastMarket: seat.market };
      row.calls += 1;
      row.net += seat.award - table.stake;
      if (seat.award > 0n) {
        if (table.winners > 1) row.splits += 1;
        else row.called += 1;
      }
      if (BigInt(table.id) >= BigInt(row.lastTableId)) {
        row.lastTableId = table.id;
        row.lastMarket = seat.market;
      }
      rows.set(seat.player, row);
    }
  }
  const record = (a: ScoutRow, b: ScoutRow) => b.called - a.called || (a.net === b.net ? 0 : a.net > b.net ? -1 : 1) || b.calls - a.calls;
  const sorted = [...rows.values()].sort((a, b) => record(a, b) || a.player.localeCompare(b.player));
  sorted.forEach((row, i) => {
    row.rank = i > 0 && record(sorted[i - 1], row) === 0 ? sorted[i - 1].rank : i + 1;
  });
  return sorted;
}

export function serializeScouts(rows: readonly ScoutRow[]) {
  return rows.map((r) => ({ ...r, net: r.net.toString() }));
}

/**
 * Named accounts (ada.testnet) read as they are. Implicit accounts, a 64-character hex key or an
 * Ethereum-style 0x address, are shortened so a table never shows a wall of hex.
 */
export function displayAccount(accountId: string): string {
  if (/^[0-9a-f]{64}$/.test(accountId)) return `${accountId.slice(0, 6)}…${accountId.slice(-4)}`;
  if (/^0x[0-9a-f]{40}$/.test(accountId)) return `${accountId.slice(0, 6)}…${accountId.slice(-4)}`;
  return accountId;
}

/** JSON-safe form for the API. */
export function serializeLeaderboard(board: Leaderboard) {
  return {
    settledTables: board.settledTables,
    truncated: board.truncated,
    rows: board.rows.map((r) => ({ ...r, staked: r.staked.toString(), awarded: r.awarded.toString(), net: r.net.toString() })),
  };
}

export type LeaderboardJson = ReturnType<typeof serializeLeaderboard>;
