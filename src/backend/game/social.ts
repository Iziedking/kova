/**
 * Profiles, leaderboard, hot players and recent showdowns.
 *
 * Every stat comes from settled tables: the `table.settled` event the worker writes from what
 * the escrow program finalized (score and award per wallet). Wallets map to accounts through
 * `game_participants`. A player's X name and picture are copied only from Privy's server API
 * for that account's own linked X login.
 */
import type { Pool } from "pg";
import type { GameAuthVerifier } from "./auth";

export const USERNAME = /^[a-z0-9_]{3,20}$/;
const X_REFRESH_MS = 5 * 60_000;
const STATS_CACHE_MS = 20_000;
const HOT_WINDOW_MS = 7 * 24 * 60 * 60_000;

type Mode = "prediction" | "trading";

interface ProfileRow {
  principal_id: string; username: string; display_name: string | null; avatar_seed: string;
  x_username: string | null; x_name: string | null; x_avatar_url: string | null; x_checked_at: Date | null; created_at: Date; is_agent?: boolean;
}

export interface PublicIdentity {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
  xHandle: string | null;
  verified: boolean;
  /** False for a wallet that never made a profile; the name is the short wallet. */
  hasProfile: boolean;
  /** A player-owned AI agent playing through the agent API. */
  isAgent: boolean;
}

interface Played {
  tableId: string; tableName: string; mode: Mode; settledAt: Date; principalId: string | null; wallet: string;
  scoreBps: bigint; awardRaw: bigint; stakeRaw: bigint; result: "won" | "lost" | "draw"; opponents: string[];
}

export type ProfileError = "USERNAME_INVALID" | "USERNAME_TAKEN" | "PROFILE_NOT_FOUND";

const shortWallet = (wallet: string) => `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;

export class SocialService {
  private stats: { at: number; value: Promise<Played[]> } | null = null;

  constructor(private readonly deps: { pool: Pool; auth: Pick<GameAuthVerifier, "linkedX">; now?: () => number }) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private identity(profile: ProfileRow | undefined, wallet: string): PublicIdentity {
    if (!profile) return { username: shortWallet(wallet), displayName: null, avatarUrl: null, avatarSeed: wallet, xHandle: null, verified: false, hasProfile: false, isAgent: false };
    return {
      username: profile.username,
      // An X-linked player shows their X name and picture; otherwise their Kova display name.
      displayName: profile.x_name ?? profile.display_name,
      avatarUrl: profile.x_avatar_url,
      avatarSeed: profile.avatar_seed,
      xHandle: profile.x_username,
      verified: profile.x_username !== null,
      hasProfile: true,
      isAgent: profile.is_agent === true,
    };
  }

  /** Re-read the linked X account from Privy, at most every five minutes per player. */
  private async refreshX(principalId: string, privyUserId: string, profile: ProfileRow, force = false): Promise<ProfileRow> {
    if (!this.deps.auth.linkedX) return profile;
    if (!force && profile.x_checked_at && this.now() - profile.x_checked_at.getTime() < X_REFRESH_MS) return profile;
    const x = await this.deps.auth.linkedX(privyUserId);
    if (x === undefined) return profile; // Privy unreachable: keep what we have.
    const updated = await this.deps.pool.query<ProfileRow>(
      "UPDATE game_profiles SET x_username=$2, x_name=$3, x_avatar_url=$4, x_checked_at=now(), updated_at=now() WHERE principal_id=$1 RETURNING *",
      [principalId, x?.username ?? null, x?.name ?? null, x?.avatarUrl ?? null],
    );
    return updated.rows[0] ?? profile;
  }

  private async privyUserId(principalId: string): Promise<string | null> {
    const row = await this.deps.pool.query<{ privy_user_id: string }>("SELECT privy_user_id FROM game_principals WHERE id=$1", [principalId]);
    return row.rows[0]?.privy_user_id ?? null;
  }

  async ownProfile(principalId: string, options: { refreshX?: boolean } = {}) {
    const row = await this.deps.pool.query<ProfileRow>("SELECT * FROM game_profiles WHERE principal_id=$1", [principalId]);
    let profile = row.rows[0];
    if (!profile) return null;
    const privyUserId = await this.privyUserId(principalId);
    if (privyUserId) profile = await this.refreshX(principalId, privyUserId, profile, options.refreshX === true);
    return { ...this.identity(profile, ""), displayNameOwn: profile.display_name };
  }

  async usernameAvailable(username: string, principalId: string | null): Promise<boolean> {
    const clean = username.trim().toLowerCase();
    if (!USERNAME.test(clean)) return false;
    const row = await this.deps.pool.query<{ principal_id: string }>("SELECT principal_id FROM game_profiles WHERE username=$1", [clean]);
    return !row.rows[0] || row.rows[0].principal_id === principalId;
  }

  async saveProfile(principalId: string, input: { username: string; displayName: string | null; avatarSeed: string }):
    Promise<{ ok: true; value: NonNullable<Awaited<ReturnType<SocialService["ownProfile"]>>> } | { ok: false; code: ProfileError }> {
    const username = input.username.trim().toLowerCase();
    if (!USERNAME.test(username)) return { ok: false, code: "USERNAME_INVALID" };
    const displayName = input.displayName?.trim().slice(0, 40) || null;
    const avatarSeed = input.avatarSeed.trim().slice(0, 64) || username;
    try {
      await this.deps.pool.query(
        `INSERT INTO game_profiles (principal_id, username, display_name, avatar_seed) VALUES ($1,$2,$3,$4)
         ON CONFLICT (principal_id) DO UPDATE SET username=EXCLUDED.username, display_name=EXCLUDED.display_name, avatar_seed=EXCLUDED.avatar_seed, updated_at=now()`,
        [principalId, username, displayName, avatarSeed],
      );
    } catch (error) {
      if (error instanceof Error && /game_profiles_username_unique/.test(error.message)) return { ok: false, code: "USERNAME_TAKEN" };
      throw error;
    }
    this.stats = null;
    const saved = await this.ownProfile(principalId, { refreshX: true });
    return saved ? { ok: true, value: saved } : { ok: false, code: "PROFILE_NOT_FOUND" };
  }

  /** Every settled player-result, newest first. Cached briefly; small at this scale. */
  private played(): Promise<Played[]> {
    if (this.stats && this.now() - this.stats.at < STATS_CACHE_MS) return this.stats.value;
    const value = this.loadPlayed();
    this.stats = { at: this.now(), value };
    value.catch(() => { if (this.stats?.value === value) this.stats = null; });
    return value;
  }

  private async loadPlayed(): Promise<Played[]> {
    const settled = await this.deps.pool.query<{ table_id: string; payload: { results?: { wallet: string; scoreBps: string; awardRaw: string }[] }; created_at: Date; name: string; rules: { stakeRaw: string; gameMode?: string } }>(
      `SELECT DISTINCT ON (e.table_id) e.table_id, e.payload, e.created_at, t.name, t.rules
       FROM game_events e JOIN game_tables t ON t.id = e.table_id
       WHERE e.event_type = 'table.settled' AND e.audience = 'public'
       ORDER BY e.table_id, e.sequence DESC`,
    );
    const tableIds = settled.rows.map((row) => row.table_id);
    const seats = tableIds.length === 0 ? { rows: [] as { table_id: string; wallet: string; principal_id: string }[] } : await this.deps.pool.query<{ table_id: string; wallet: string; principal_id: string }>(
      "SELECT table_id, wallet, principal_id FROM game_participants WHERE table_id = ANY($1::uuid[])", [tableIds],
    );
    const owner = new Map(seats.rows.map((row) => [`${row.table_id}:${row.wallet}`, row.principal_id]));
    const out: Played[] = [];
    for (const table of settled.rows) {
      const results = table.payload.results ?? [];
      if (results.length === 0) continue;
      const scores = results.map((row) => BigInt(row.scoreBps));
      const best = scores.reduce((max, score) => (score > max ? score : max));
      const allTied = scores.every((score) => score === best);
      for (const row of results) {
        const score = BigInt(row.scoreBps);
        out.push({
          tableId: table.table_id, tableName: table.name, mode: table.rules.gameMode === "trading" ? "trading" : "prediction", settledAt: table.created_at,
          principalId: owner.get(`${table.table_id}:${row.wallet}`) ?? null, wallet: row.wallet, scoreBps: score, awardRaw: BigInt(row.awardRaw), stakeRaw: BigInt(table.rules.stakeRaw),
          result: allTied ? "draw" : score === best ? "won" : "lost",
          opponents: results.filter((other) => other.wallet !== row.wallet).map((other) => other.wallet),
        });
      }
    }
    return out.sort((left, right) => right.settledAt.getTime() - left.settledAt.getTime());
  }

  private async profilesFor(principalIds: readonly string[]): Promise<Map<string, ProfileRow>> {
    if (principalIds.length === 0) return new Map();
    const rows = await this.deps.pool.query<ProfileRow>("SELECT * FROM game_profiles WHERE principal_id = ANY($1::uuid[])", [[...new Set(principalIds)]]);
    return new Map(rows.rows.map((row) => [row.principal_id, row]));
  }

  /** Display identity for wallets at one table, for live standings and showdowns. */
  async identitiesForWallets(tableId: string, wallets: readonly string[]): Promise<Map<string, PublicIdentity>> {
    const seats = await this.deps.pool.query<{ wallet: string; principal_id: string }>("SELECT wallet, principal_id FROM game_participants WHERE table_id=$1 AND wallet = ANY($2::text[])", [tableId, [...wallets]]);
    const profiles = await this.profilesFor(seats.rows.map((row) => row.principal_id));
    const byWallet = new Map(seats.rows.map((row) => [row.wallet, row.principal_id]));
    return new Map(wallets.map((wallet) => {
      const principal = byWallet.get(wallet);
      return [wallet, this.identity(principal ? profiles.get(principal) : undefined, wallet)];
    }));
  }

  private summarize(games: readonly Played[]) {
    const matches = games.length;
    const wins = games.filter((game) => game.result === "won").length;
    const byMode = (mode: Mode) => games.filter((game) => game.mode === mode);
    const rate = (list: readonly Played[]) => (list.length === 0 ? null : (list.filter((game) => game.result === "won").length / list.length) * 100);
    const avg = (list: readonly Played[]) => (list.length === 0 ? null : list.reduce((sum, game) => sum + Number(game.scoreBps), 0) / list.length / 100);
    let streak = 0;
    for (const game of games) {
      if (game.result !== "won") break;
      streak += 1;
    }
    const trading = byMode("trading");
    return {
      matches, wins, winRatePct: rate(games), predictionWinRate: rate(byMode("prediction")), tradingWinRate: rate(trading),
      avgPredictionReturnPct: avg(byMode("prediction")), avgTradingPnlPct: avg(trading),
      bestTradingPnlPct: trading.length ? Math.max(...trading.map((game) => Number(game.scoreBps))) / 100 : null,
      avgReturnPct: avg(games), streak, netRaw: games.reduce((sum, game) => sum + game.awardRaw - game.stakeRaw, 0n),
    };
  }

  private groupByPlayer(games: readonly Played[]): Map<string, Played[]> {
    const groups = new Map<string, Played[]>();
    for (const game of games) {
      const key = game.principalId ?? `wallet:${game.wallet}`;
      groups.set(key, [...(groups.get(key) ?? []), game]);
    }
    return groups;
  }

  async leaderboard(scope: "overall" | Mode) {
    const all = await this.played();
    const games = scope === "overall" ? all : all.filter((game) => game.mode === scope);
    const groups = this.groupByPlayer(games);
    const profiles = await this.profilesFor([...groups.keys()].filter((key) => !key.startsWith("wallet:")));
    const rows = [...groups.entries()].map(([key, list]) => {
      const stats = this.summarize(list);
      const identity = this.identity(key.startsWith("wallet:") ? undefined : profiles.get(key), list[0]!.wallet);
      return { identity, stats };
    }).sort((left, right) => right.stats.wins - left.stats.wins || (right.stats.winRatePct ?? 0) - (left.stats.winRatePct ?? 0) || Number(right.stats.netRaw - left.stats.netRaw));
    return rows.map((row, index) => ({ rank: index + 1, ...row }));
  }

  async hotPlayers(limit = 5) {
    const since = this.now() - HOT_WINDOW_MS;
    const recent = (await this.played()).filter((game) => game.settledAt.getTime() >= since);
    const groups = this.groupByPlayer(recent);
    const profiles = await this.profilesFor([...groups.keys()].filter((key) => !key.startsWith("wallet:")));
    return [...groups.entries()].map(([key, list]) => ({ identity: this.identity(key.startsWith("wallet:") ? undefined : profiles.get(key), list[0]!.wallet), stats: this.summarize(list) }))
      .sort((left, right) => right.stats.wins - left.stats.wins || (right.stats.avgReturnPct ?? 0) - (left.stats.avgReturnPct ?? 0))
      .slice(0, limit).map((row, index) => ({ rank: index + 1, ...row }));
  }

  async recentShowdowns(limit = 8) {
    const all = await this.played();
    const tables = [...new Set(all.map((game) => game.tableId))].slice(0, limit);
    const profiles = await this.profilesFor(all.filter((game) => tables.includes(game.tableId) && game.principalId).map((game) => game.principalId!));
    return tables.map((tableId) => {
      const seats = all.filter((game) => game.tableId === tableId).sort((left, right) => Number(right.scoreBps - left.scoreBps));
      const winner = seats[0]!;
      const loser = seats[seats.length - 1]!;
      const who = (game: Played) => this.identity(game.principalId ? profiles.get(game.principalId) : undefined, game.wallet);
      return {
        id: tableId, tableName: winner.tableName, mode: winner.mode, settledAt: winner.settledAt.toISOString(),
        winner: who(winner), loser: who(loser), draw: winner.result === "draw",
        payoutRaw: (winner.awardRaw - winner.stakeRaw > 0n ? winner.awardRaw - winner.stakeRaw : 0n).toString(),
      };
    });
  }

  /** Settled results for one account, newest first (notifications and portfolio). */
  async playedBy(principalId: string) {
    return (await this.played()).filter((game) => game.principalId === principalId).map((game) => ({
      tableId: game.tableId, tableName: game.tableName, mode: game.mode, settledAt: game.settledAt, result: game.result,
      scoreBps: game.scoreBps, awardRaw: game.awardRaw, stakeRaw: game.stakeRaw,
    }));
  }

  async principalByUsername(username: string): Promise<string | null> {
    const row = await this.deps.pool.query<{ principal_id: string }>("SELECT principal_id FROM game_profiles WHERE username=$1", [username.trim().toLowerCase().replace(/^@/, "")]);
    return row.rows[0]?.principal_id ?? null;
  }

  async usernameOf(principalId: string): Promise<string | null> {
    const row = await this.deps.pool.query<{ username: string }>("SELECT username FROM game_profiles WHERE principal_id=$1", [principalId]);
    return row.rows[0]?.username ?? null;
  }

  async publicProfile(username: string) {
    const row = await this.deps.pool.query<ProfileRow>("SELECT * FROM game_profiles WHERE username=$1", [username.trim().toLowerCase()]);
    const profile = row.rows[0];
    if (!profile) return null;
    const games = (await this.played()).filter((game) => game.principalId === profile.principal_id);
    const opponentIds = await this.deps.pool.query<{ table_id: string; wallet: string; principal_id: string }>(
      "SELECT table_id, wallet, principal_id FROM game_participants WHERE table_id = ANY($1::uuid[])", [games.map((game) => game.tableId)],
    );
    const opponentProfiles = await this.profilesFor(opponentIds.rows.map((seat) => seat.principal_id));
    const nameOf = (tableId: string, wallet: string) => {
      const seat = opponentIds.rows.find((candidate) => candidate.table_id === tableId && candidate.wallet === wallet);
      return this.identity(seat ? opponentProfiles.get(seat.principal_id) : undefined, wallet).username;
    };
    return {
      id: profile.principal_id,
      identity: this.identity(profile, ""),
      joinedAt: profile.created_at.toISOString(),
      stats: (({ netRaw, ...rest }) => ({ ...rest, netRaw: netRaw.toString() }))(this.summarize(games)),
      history: games.slice(0, 50).map((game) => ({
        id: `${game.tableId}:${game.wallet}`, tableId: game.tableId, tableName: game.tableName, mode: game.mode,
        opponents: game.opponents.map((wallet) => nameOf(game.tableId, wallet)), result: game.result,
        returnPct: Number(game.scoreBps) / 100, payoutRaw: game.awardRaw.toString(), settledAt: game.settledAt.toISOString(),
      })),
    };
  }
}
