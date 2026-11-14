/**
 * The global leaderboard's books: what each player staked, won, lost and burned, per coin, across every
 * mine. The contracts keep only the last 24 results and never record what a losing player staked, so the
 * keeper records each round just before it settles it (the stakes), and combines them with the result
 * (the settle event). Pure functions here; the keeper does the reading and writing.
 *
 * Definitions, per round a player took part in that settled with a winner:
 *   staked   all their stakes in the round
 *   awarded  what the mine paid them (their stake on the winning square back, plus their share)
 *   net      awarded less staked. CHIP emission minted to winners is NOT counted here.
 *   burned   their share of the round's burn: the burn split in proportion to the coins each player had
 *            on losing squares (rounded down, the remainder to the largest, so shares add up exactly)
 * A refunded round counts as played and refunded; nothing was won, lost or burned.
 */
export type Stake = { player: string; square: number; amount: bigint };
export type RoundResult =
  | { outcome: "settled"; winningSquare: number; total: bigint; burned: bigint; winners: { player: string; staked: bigint; award: bigint }[] }
  | { outcome: "refunded"; total: bigint };

/** The round's result from the logs of its settle (or refund) transaction, or null if they hold neither. */
export function resultFromEvents(events: readonly { event: string; data: Record<string, unknown>[] }[]): RoundResult | null {
  const big = (v: unknown) => BigInt(String(v));
  const settled = events.find((e) => e.event === "round_settled")?.data[0];
  if (settled && Array.isArray(settled.winners) && typeof settled.winning_square === "number") {
    return {
      outcome: "settled",
      winningSquare: settled.winning_square,
      total: big(settled.total),
      burned: big(settled.burned),
      winners: (settled.winners as { player: string; staked: string; award: string }[]).map((w) => ({ player: w.player, staked: big(w.staked), award: big(w.award) })),
    };
  }
  const refunded = events.find((e) => e.event === "round_refunded")?.data[0];
  return refunded ? { outcome: "refunded", total: big(refunded.total) } : null;
}

export type PlayerRound = { player: string; staked: bigint; awarded: bigint; won: boolean; lost: bigint; burned: bigint; refunded: boolean };
export type Line = { played: number; won: number; refunded: number; staked: bigint; awarded: bigint; lost: bigint; burned: bigint };
export type Book = { startedAt: number; updatedAt: number; recorded: Record<string, number[]>; players: Record<string, Record<string, Line>> };

const emptyLine = (): Line => ({ played: 0, won: 0, refunded: 0, staked: 0n, awarded: 0n, lost: 0n, burned: 0n });
export const newBook = (now: number): Book => ({ startedAt: now, updatedAt: now, recorded: {}, players: {} });

/** One round's effect on each player who staked in it, or null if the stakes and the result do not agree. */
export function accountRound(stakes: readonly Stake[], result: RoundResult): PlayerRound[] | null {
  const byPlayer = new Map<string, { staked: bigint; onWinner: bigint }>();
  for (const s of stakes) {
    const row = byPlayer.get(s.player) ?? { staked: 0n, onWinner: 0n };
    row.staked += s.amount;
    if (result.outcome === "settled" && s.square === result.winningSquare) row.onWinner += s.amount;
    byPlayer.set(s.player, row);
  }
  const staked = [...byPlayer.values()].reduce((sum, r) => sum + r.staked, 0n);
  if (staked !== result.total) return null; // the snapshot is not the round that was settled
  if (result.outcome === "refunded") {
    return [...byPlayer].map(([player, r]) => ({ player, staked: r.staked, awarded: 0n, won: false, lost: 0n, burned: 0n, refunded: true }));
  }
  const winners = new Map(result.winners.map((w) => [w.player, w]));
  for (const [player, row] of byPlayer) {
    if ((winners.get(player)?.staked ?? 0n) !== row.onWinner) return null;
  }
  const lostTotal = [...byPlayer.values()].reduce((sum, r) => sum + (r.staked - r.onWinner), 0n);
  const rows = [...byPlayer].map(([player, r]) => ({ player, staked: r.staked, lost: r.staked - r.onWinner, awarded: winners.get(player)?.award ?? 0n, won: r.onWinner > 0n }));
  // Split the burn by losing coins, rounding down; the remainder goes to the largest loser (ties: account id).
  const shares = rows.map((r) => (lostTotal > 0n ? (result.burned * r.lost) / lostTotal : 0n));
  const remainder = result.burned - shares.reduce((sum, v) => sum + v, 0n);
  if (lostTotal > 0n && remainder > 0n) {
    let top = 0;
    rows.forEach((r, i) => {
      if (r.lost > rows[top].lost || (r.lost === rows[top].lost && r.player < rows[top].player)) top = i;
    });
    shares[top] += remainder;
  }
  return rows.map((r, i) => ({ ...r, burned: shares[i], refunded: false }));
}

/** Adds a round to the book once. Returns false if it was already recorded or could not be accounted. */
export function applyRound(book: Book, token: string, round: number, stakes: readonly Stake[], result: RoundResult, now: number): boolean {
  const seen = (book.recorded[token] ??= []);
  if (seen.includes(round)) return false;
  const rows = accountRound(stakes, result);
  if (!rows) return false;
  for (const r of rows) {
    const line = ((book.players[r.player] ??= {})[token] ??= emptyLine());
    line.played += 1;
    if (r.refunded) line.refunded += 1;
    else {
      line.staked += r.staked;
      line.awarded += r.awarded;
      line.lost += r.lost;
      line.burned += r.burned;
      if (r.won) line.won += 1;
    }
  }
  seen.push(round);
  if (seen.length > 200) seen.splice(0, seen.length - 200);
  book.updatedAt = now;
  return true;
}

export type Ranked = { rank: number; player: string; played: number; won: number; byCoin: { token: string; line: Line; net: bigint }[] };

/** Players ranked by rounds won across all coins (coins have no common price), then rounds played, then account id. */
export function rankPlayers(book: Book): Ranked[] {
  const rows = Object.entries(book.players).map(([player, coins]) => {
    const byCoin = Object.entries(coins).map(([token, line]) => ({ token, line, net: line.awarded - line.staked }));
    return { player, played: byCoin.reduce((n, c) => n + c.line.played, 0), won: byCoin.reduce((n, c) => n + c.line.won, 0), byCoin };
  });
  rows.sort((a, b) => b.won - a.won || b.played - a.played || (a.player < b.player ? -1 : 1));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---- JSON (bigints as decimal strings)
export function serializeBook(book: Book): string {
  return JSON.stringify(book, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

const BIG_FIELDS = ["staked", "awarded", "lost", "burned"] as const;
export function parseBook(text: string): Book | null {
  try {
    const raw = JSON.parse(text) as Book;
    if (typeof raw.startedAt !== "number" || typeof raw.players !== "object" || typeof raw.recorded !== "object") return null;
    for (const coins of Object.values(raw.players)) {
      for (const line of Object.values(coins)) {
        for (const f of BIG_FIELDS) (line as unknown as Record<string, unknown>)[f] = BigInt(String((line as unknown as Record<string, unknown>)[f] ?? "0"));
      }
    }
    return raw;
  } catch {
    return null;
  }
}
