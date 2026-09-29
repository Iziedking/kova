/**
 * The signed-in player's own surfaces: notifications, portfolio and direct challenges.
 * Notifications are derived from game state (nothing to fan out or keep in sync); balances are
 * read from chain for the player's own proven wallet.
 */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { PublicKey, type Connection } from "@solana/web3.js";
import type { SocialService } from "./social";

const ANSEM_DECIMALS = 6n;
const LIVE_STATUSES = ["OPEN", "LOCKING", "ACTIVE", "SETTLING"];

export type NotificationKind = "challenge_received" | "challenge_accepted" | "match_starting" | "match_result" | "payout_confirmed";
export interface HubNotification { id: string; kind: NotificationKind; title: string; body: string; at: string; read: boolean; href: string }

const formatAnsem = (raw: bigint) => {
  const whole = raw / 10n ** ANSEM_DECIMALS;
  const fraction = (raw % 10n ** ANSEM_DECIMALS).toString().padStart(6, "0").replace(/0+$/, "").slice(0, 2);
  return `${whole}${fraction ? `.${fraction}` : ""} ANSEM`;
};

export class PlayerHubService {
  constructor(private readonly deps: { pool: Pool; social: SocialService; connection: Connection | null; stakeMint: string | null; network: string }) {}

  async notifications(principalId: string): Promise<HubNotification[]> {
    const seen = await this.deps.pool.query<{ seen_at: Date }>("SELECT seen_at FROM game_notification_reads WHERE principal_id=$1", [principalId]);
    const seenAt = seen.rows[0]?.seen_at.getTime() ?? 0;
    const out: Omit<HubNotification, "read">[] = [];

    const challenges = await this.deps.pool.query<{ id: string; table_id: string; created_at: Date; status: string; rules: { stakeRaw: string; roundDurationSeconds: number; gameMode?: string }; from_username: string | null }>(
      `SELECT c.id, c.table_id, c.created_at, t.status, t.rules, p.username AS from_username
       FROM game_challenges c JOIN game_tables t ON t.id=c.table_id LEFT JOIN game_profiles p ON p.principal_id=c.from_principal_id
       WHERE c.to_principal_id=$1 ORDER BY c.created_at DESC LIMIT 20`, [principalId],
    );
    for (const challenge of challenges.rows) {
      if (challenge.status !== "DRAFT" && challenge.status !== "OPEN") continue;
      out.push({
        id: `challenge:${challenge.id}`, kind: "challenge_received", at: challenge.created_at.toISOString(), href: `/tables/${challenge.table_id}`,
        title: `@${challenge.from_username ?? "a player"} challenged you`,
        body: `${challenge.rules.gameMode === "trading" ? "Trade" : "Predict"} · ${formatAnsem(BigInt(challenge.rules.stakeRaw))} · ${Math.round(challenge.rules.roundDurationSeconds / 60)} min`,
      });
    }

    const live = await this.deps.pool.query<{ id: string; name: string; starts_at: Date | null }>(
      `SELECT t.id, t.name, t.starts_at FROM game_participants p JOIN game_tables t ON t.id=p.table_id
       WHERE p.principal_id=$1 AND p.funding_status='funded' AND t.status='ACTIVE' ORDER BY t.starts_at DESC LIMIT 10`, [principalId],
    );
    for (const table of live.rows) {
      out.push({ id: `live:${table.id}`, kind: "match_starting", at: (table.starts_at ?? new Date()).toISOString(), href: `/tables/${table.id}`, title: "Your match is live", body: table.name });
    }

    for (const game of (await this.deps.social.playedBy(principalId)).slice(0, 15)) {
      const net = game.awardRaw - game.stakeRaw;
      out.push({
        id: `result:${game.tableId}`, kind: game.awardRaw > 0n ? "payout_confirmed" : "match_result", at: game.settledAt.toISOString(), href: `/tables/${game.tableId}`,
        title: game.result === "won" ? `You won ${formatAnsem(game.awardRaw)}` : game.result === "draw" ? "Your match was a draw" : "Your match has settled",
        body: game.awardRaw > 0n ? `${game.tableName}. Claim it from the table${net > 0n ? ` (+${formatAnsem(net)} net)` : ""}.` : `${game.tableName}. Your return: ${(Number(game.scoreBps) / 100).toFixed(2)}%.`,
      });
    }
    return out.sort((left, right) => right.at.localeCompare(left.at)).slice(0, 30).map((item) => ({ ...item, read: Date.parse(item.at) <= seenAt }));
  }

  async markRead(principalId: string): Promise<void> {
    await this.deps.pool.query(
      "INSERT INTO game_notification_reads (principal_id, seen_at) VALUES ($1, now()) ON CONFLICT (principal_id) DO UPDATE SET seen_at = now()", [principalId],
    );
  }

  /** The account's wallet: the requested one if it is proven for this account, else the latest proven. */
  private async walletFor(principalId: string, requested: string | null): Promise<string | null> {
    const rows = await this.deps.pool.query<{ wallet: string }>("SELECT wallet FROM game_wallet_bindings WHERE principal_id=$1 ORDER BY verified_at DESC", [principalId]);
    const wallets = rows.rows.map((row) => row.wallet);
    return requested && wallets.includes(requested) ? requested : wallets[0] ?? null;
  }

  async portfolio(principalId: string, requestedWallet: string | null) {
    const wallet = await this.walletFor(principalId, requestedWallet);
    let solLamports: number | null = null;
    let ansemRaw: bigint | null = null;
    if (wallet && this.deps.connection) {
      const owner = new PublicKey(wallet);
      const [lamports, accounts] = await Promise.all([
        this.deps.connection.getBalance(owner, "confirmed").catch(() => null),
        this.deps.stakeMint
          ? this.deps.connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(this.deps.stakeMint) }, "confirmed").catch(() => null)
          : Promise.resolve(null),
      ]);
      solLamports = lamports;
      if (accounts) {
        ansemRaw = accounts.value.reduce((sum, account) => {
          const parsed = account.account.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } };
          return sum + BigInt(parsed.parsed?.info?.tokenAmount?.amount ?? "0");
        }, 0n);
      }
    }
    const inPlay = await this.deps.pool.query<{ id: string; name: string; status: string; rules: { stakeRaw: string }; funded_at: Date | null; funding_signature: string | null }>(
      `SELECT t.id, t.name, t.status, t.rules, p.funded_at, p.funding_signature FROM game_participants p JOIN game_tables t ON t.id=p.table_id
       WHERE p.principal_id=$1 AND p.funding_status='funded' ORDER BY p.funded_at DESC NULLS LAST LIMIT 50`, [principalId],
    );
    const live = inPlay.rows.filter((row) => LIVE_STATUSES.includes(row.status));
    const inPlayRaw = live.reduce((sum, row) => sum + BigInt(row.rules.stakeRaw), 0n);
    const played = await this.deps.social.playedBy(principalId);
    const netWonRaw = played.reduce((sum, game) => sum + game.awardRaw - game.stakeRaw, 0n);
    const [hosted, challenges, faucet] = await Promise.all([
      this.deps.pool.query<{ id: string; name: string; created_at: Date; rules: { gameMode?: string } }>(
        "SELECT id, name, created_at, rules FROM game_tables WHERE host_principal_id=$1 ORDER BY created_at DESC LIMIT 30", [principalId],
      ),
      this.deps.pool.query<{ table_id: string; created_at: Date; sent: boolean; other: string | null }>(
        `SELECT c.table_id, c.created_at, c.from_principal_id = $1 AS sent,
                (SELECT username FROM game_profiles p WHERE p.principal_id = CASE WHEN c.from_principal_id = $1 THEN c.to_principal_id ELSE c.from_principal_id END) AS other
         FROM game_challenges c WHERE c.from_principal_id=$1 OR c.to_principal_id=$1 ORDER BY c.created_at DESC LIMIT 30`, [principalId],
      ),
      this.deps.pool.query<{ created_at: Date }>(
        "SELECT created_at FROM game_budget_reservations WHERE category='devnet_faucet' AND principal_id=$1 AND operation_key LIKE 'faucet:principal:%' ORDER BY created_at DESC LIMIT 10", [principalId],
      ),
    ]);
    // Everything this account did, newest first: one place to see a player's history.
    const activity = [
      ...hosted.rows.map((row) => ({
        id: `create:${row.id}`, kind: "create" as const, title: `Created a ${row.rules.gameMode === "trading" ? "Trade" : "Predict"} table`, detail: row.name,
        at: row.created_at.toISOString(), txSignature: null, href: `/tables/${row.id}`,
      })),
      ...challenges.rows.map((row) => ({
        id: `challenge:${row.table_id}`, kind: "challenge" as const,
        title: row.sent ? `Challenged @${row.other ?? "a player"}` : `@${row.other ?? "A player"} challenged you`, detail: "Private table",
        at: row.created_at.toISOString(), txSignature: null, href: `/tables/${row.table_id}`,
      })),
      ...inPlay.rows.filter((row) => row.funded_at).map((row) => ({
        id: `join:${row.id}`, kind: "join" as const, title: `Staked ${formatAnsem(BigInt(row.rules.stakeRaw))}`, detail: row.name,
        at: row.funded_at!.toISOString(), txSignature: row.funding_signature, href: `/tables/${row.id}`,
      })),
      ...played.map((game) => ({
        id: `result:${game.tableId}`,
        kind: game.result === "won" ? "payout" as const : "result" as const,
        title: game.result === "won" ? `Won ${formatAnsem(game.awardRaw)}` : game.result === "draw" ? "Draw: stake returned" : "Lost the round",
        detail: `${game.tableName} · ${(Number(game.scoreBps) / 100).toFixed(2)}% return`,
        at: game.settledAt.toISOString(), txSignature: null, href: `/tables/${game.tableId}`,
      })),
      ...faucet.rows.map((row, index) => ({
        id: `faucet:${index}:${row.created_at.getTime()}`, kind: "receive" as const, title: "Claimed test tokens", detail: "10 TEST ANSEM and 0.02 devnet SOL",
        at: row.created_at.toISOString(), txSignature: null, href: null,
      })),
    ].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 50);
    return {
      network: this.deps.network, wallet,
      solLamports, ansemRaw: ansemRaw?.toString() ?? null, inPlayRaw: inPlayRaw.toString(), netWonRaw: netWonRaw.toString(),
      matches: played.length, wins: played.filter((game) => game.result === "won").length,
      allocations: live.map((row) => ({ tableId: row.id, tableName: row.name, status: row.status === "SETTLING" ? "settling" as const : "live" as const, stakeRaw: row.rules.stakeRaw })),
      activity,
    };
  }

  /** Records a challenge on a private table the challenger already created, and pre-invites the opponent. */
  async recordChallenge(input: { tableId: string; fromPrincipalId: string; toPrincipalId: string }): Promise<string> {
    const id = randomUUID();
    const client = await this.deps.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO game_invitations (id, table_id, token_hash, created_by_principal_id, claimed_by_principal_id, expires_at, claimed_at)
         VALUES ($1,$2,$3,$4,$5, now() + interval '1 day', now())`,
        [randomUUID(), input.tableId, createHash("sha256").update(randomBytes(32)).digest("hex"), input.fromPrincipalId, input.toPrincipalId],
      );
      await client.query("INSERT INTO game_challenges (id, table_id, from_principal_id, to_principal_id) VALUES ($1,$2,$3,$4)", [id, input.tableId, input.fromPrincipalId, input.toPrincipalId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return id;
  }
}
