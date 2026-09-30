/**
 * Season points and referrals.
 *
 * Points have no cash value. They are awarded only from settled, staked games, so the ledger is
 * derived from game history: sync() can run any number of times and each award lands once
 * (unique principal + kind + ref). Agents and the House earn nothing, so bots can't farm points.
 * A referral counts when the invited player finishes their first staked game.
 */
import type { Pool } from "pg";

export const POINTS = { play: 10, win: 25, referral: 100, welcome: 50, season: 1 } as const;

export type ReferralError = "REFERRAL_CODE_UNKNOWN" | "REFERRAL_SELF" | "REFERRAL_ALREADY_PLAYED" | "REFERRAL_EXISTS" | "REFERRAL_AGENT";

export class PointsService {
  constructor(private readonly deps: { pool: Pool }) {}

  /** Award points for every settled game and every newly qualified referral. Idempotent. */
  async sync(): Promise<{ awarded: number }> {
    const settledSeats = `
      FROM game_events e
      JOIN game_tables t ON t.id = e.table_id
      JOIN game_participants p ON p.table_id = e.table_id
      CROSS JOIN LATERAL jsonb_array_elements(e.payload->'results') r
      LEFT JOIN game_profiles pr ON pr.principal_id = p.principal_id
      WHERE e.event_type = 'table.settled' AND e.audience = 'public' AND r->>'wallet' = p.wallet AND coalesce(pr.is_agent, false) = false`;
    const play = await this.deps.pool.query(
      `INSERT INTO game_points (id, principal_id, kind, amount, ref, season)
       SELECT gen_random_uuid(), p.principal_id, 'play', $1, p.table_id::text, $2 ${settledSeats}
       ON CONFLICT DO NOTHING`, [POINTS.play, POINTS.season],
    );
    // A win is a payout above the stake; a draw returns the stake and is not a win.
    const win = await this.deps.pool.query(
      `INSERT INTO game_points (id, principal_id, kind, amount, ref, season)
       SELECT gen_random_uuid(), p.principal_id, 'win', $1, p.table_id::text, $2 ${settledSeats}
         AND (r->>'awardRaw')::numeric > (t.rules->>'stakeRaw')::numeric
       ON CONFLICT DO NOTHING`, [POINTS.win, POINTS.season],
    );
    const referrals = await this.deps.pool.query(
      `WITH qualified AS (
         UPDATE game_referrals r SET qualified_at = now()
         WHERE r.qualified_at IS NULL AND EXISTS (SELECT 1 FROM game_points g WHERE g.principal_id = r.referee_principal_id AND g.kind = 'play')
         RETURNING r.referee_principal_id, r.referrer_principal_id)
       INSERT INTO game_points (id, principal_id, kind, amount, ref, season)
       SELECT gen_random_uuid(), referrer_principal_id, 'referral', $1::int, referee_principal_id::text, $3::int FROM qualified
       UNION ALL
       SELECT gen_random_uuid(), referee_principal_id, 'welcome', $2::int, referee_principal_id::text, $3::int FROM qualified
       ON CONFLICT DO NOTHING`, [POINTS.referral, POINTS.welcome, POINTS.season],
    );
    return { awarded: (play.rowCount ?? 0) + (win.rowCount ?? 0) + (referrals.rowCount ?? 0) };
  }

  /**
   * Record who invited this player. The code is the inviter's username. Only a player who has
   * not taken a seat yet can be referred, and only once.
   */
  async claimReferral(refereePrincipalId: string, code: string): Promise<{ ok: true; referrer: string } | { ok: false; code: ReferralError }> {
    const username = code.trim().toLowerCase().replace(/^@/, "");
    const referrer = await this.deps.pool.query<{ principal_id: string; is_agent: boolean }>(
      "SELECT principal_id, is_agent FROM game_profiles WHERE username = $1", [username],
    );
    const row = referrer.rows[0];
    if (!row) return { ok: false, code: "REFERRAL_CODE_UNKNOWN" };
    if (row.is_agent) return { ok: false, code: "REFERRAL_AGENT" };
    if (row.principal_id === refereePrincipalId) return { ok: false, code: "REFERRAL_SELF" };
    const played = await this.deps.pool.query("SELECT 1 FROM game_participants WHERE principal_id = $1 LIMIT 1", [refereePrincipalId]);
    if (played.rowCount) return { ok: false, code: "REFERRAL_ALREADY_PLAYED" };
    const inserted = await this.deps.pool.query(
      "INSERT INTO game_referrals (referee_principal_id, referrer_principal_id, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [refereePrincipalId, row.principal_id, username],
    );
    return inserted.rowCount ? { ok: true, referrer: username } : { ok: false, code: "REFERRAL_EXISTS" };
  }

  async summary(principalId: string) {
    const [totals, referrals, referredBy, profile] = await Promise.all([
      this.deps.pool.query<{ kind: string; points: string }>(
        "SELECT kind, sum(amount)::text AS points FROM game_points WHERE principal_id = $1 AND season = $2 GROUP BY kind", [principalId, POINTS.season],
      ),
      this.deps.pool.query<{ invited: string; qualified: string }>(
        "SELECT count(*)::text AS invited, count(qualified_at)::text AS qualified FROM game_referrals WHERE referrer_principal_id = $1", [principalId],
      ),
      this.deps.pool.query<{ username: string }>(
        `SELECT pr.username FROM game_referrals r JOIN game_profiles pr ON pr.principal_id = r.referrer_principal_id WHERE r.referee_principal_id = $1`, [principalId],
      ),
      this.deps.pool.query<{ username: string; is_agent: boolean }>("SELECT username, is_agent FROM game_profiles WHERE principal_id = $1", [principalId]),
    ]);
    const breakdown = { play: 0, win: 0, referral: 0, welcome: 0 };
    for (const row of totals.rows) if (row.kind in breakdown) breakdown[row.kind as keyof typeof breakdown] = Number(row.points);
    const own = profile.rows[0];
    return {
      season: POINTS.season,
      total: breakdown.play + breakdown.win + breakdown.referral + breakdown.welcome,
      breakdown,
      rules: POINTS,
      referralCode: own && !own.is_agent ? own.username : null,
      invited: Number(referrals.rows[0]?.invited ?? 0),
      qualified: Number(referrals.rows[0]?.qualified ?? 0),
      referredBy: referredBy.rows[0]?.username ?? null,
    };
  }

  async leaderboard(limit = 20) {
    const rows = await this.deps.pool.query<{ username: string; display_name: string | null; x_name: string | null; x_avatar_url: string | null; points: string }>(
      `SELECT pr.username, pr.display_name, pr.x_name, pr.x_avatar_url, sum(g.amount)::text AS points
       FROM game_points g JOIN game_profiles pr ON pr.principal_id = g.principal_id
       WHERE g.season = $1 GROUP BY pr.username, pr.display_name, pr.x_name, pr.x_avatar_url
       ORDER BY sum(g.amount) DESC, pr.username LIMIT $2`, [POINTS.season, Math.min(Math.max(limit, 1), 100)],
    );
    return rows.rows.map((row, index) => ({
      rank: index + 1, username: row.username, displayName: row.x_name ?? row.display_name, avatarUrl: row.x_avatar_url, points: Number(row.points),
    }));
  }
}
