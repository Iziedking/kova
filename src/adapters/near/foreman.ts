/**
 * The Foreman's rules, as pure functions: which squares it backs, what it says about a finished
 * round, and when it must stop. The runner (scripts/near/foreman.ts) does the sending.
 *
 * The Foreman is a fixed rule, not a model. Its picks come from a hash anyone can recompute, and its
 * recaps are templates built from the mine's own round record. If an AI is ever added to word the
 * recap, the post says so (`by`); today every post is `by: "rule"`.
 */
import { createHash } from "node:crypto";
import { SQUARES, formatUnits, nearNeededFor, GAS, type RoundSummary } from "./grid";

/** How many squares the Foreman backs each round, and how much goes on each (whole coins). */
export const FOREMAN_SQUARES_PER_ROUND = 2;
export const FOREMAN_STAKE_COINS = 10n;
/** The Foreman keeps this much NEAR free beyond what one stake reserves, so it never strands itself mid-round. */
export const FOREMAN_NEAR_MARGIN_YOCTO = 10n ** 22n; // 0.01 NEAR
/**
 * Rule v2 (14 Nov 2026): the Foreman covers the empty squares of a round a player has joined, with the
 * mine's smallest stake on each, so that round always has a winner. It does nothing in rounds no one
 * else plays. Its stakes and burns are the team's own, not player activity, and the site says so.
 */
export const FOREMAN_COVER_STAKE_COINS = 1n;
/** It does not start covering with fewer seconds than this left in the round. */
export const FOREMAN_COVER_MIN_SECONDS_LEFT = 10;

/** The squares nobody has staked on yet in a round, from the mine's per-square totals. */
export function emptySquares(totals: readonly bigint[]): number[] {
  const empty: number[] = [];
  for (let square = 0; square < SQUARES; square += 1) if ((totals[square] ?? 0n) === 0n) empty.push(square);
  return empty;
}

/** Whether the Foreman covers this round now: someone else has staked, it has not covered yet, and there is time left. */
export function shouldCover(args: { otherPlayers: number; alreadyCovered: boolean; secondsLeft: number }): boolean {
  return args.otherPlayers > 0 && !args.alreadyCovered && args.secondsLeft >= FOREMAN_COVER_MIN_SECONDS_LEFT;
}

/** Posts are bounded so a recap fits in the contract's storage for it. */
export const MAX_RECAP_CHARS = 300;
/** The social contract keeps the last five recaps, one key each, overwritten in turn. */
export const FEED_SLOTS = 5;

/**
 * The squares the Foreman backs in a round: the first distinct squares drawn from
 * sha256("kova-foreman-v1|<account>|<round>|<n>") by rejection sampling (bytes under 250, mod 25),
 * so every square is equally likely and anyone can recompute the picks.
 */
export function pickSquares(account: string, round: number, count: number = FOREMAN_SQUARES_PER_ROUND): number[] {
  const picked: number[] = [];
  for (let n = 0; picked.length < count && n < 64; n += 1) {
    const digest = createHash("sha256").update(`kova-foreman-v1|${account}|${round}|${n}`).digest();
    for (const byte of digest) {
      if (byte >= 250) continue;
      const square = byte % SQUARES;
      if (!picked.includes(square)) picked.push(square);
      if (picked.length === count) break;
    }
  }
  return picked;
}

const signed = (v: bigint, f: (n: bigint) => string) => (v < 0n ? `-${f(-v)}` : `+${f(v)}`);

export type ForemanStake = { square: number; amount: bigint };

/** What the Foreman said about one round, built only from the mine's record and its own stakes. */
export function composeRecap(args: { round: number; record: RoundSummary | null; account: string; stakes: readonly ForemanStake[]; decimals: number; symbol: string }): string {
  const { round, record, account, stakes, decimals, symbol } = args;
  const f = (v: bigint) => `${formatUnits(v, decimals)} ${symbol}`;
  const staked = stakes.reduce((sum, s) => sum + s.amount, 0n);
  const squares = stakes.map((s) => s.square + 1).join(" and ");
  const mine =
    stakes.length > 3
      ? `The Foreman covered ${stakes.length} empty squares with ${f(staked)}`
      : stakes.length > 0
        ? `The Foreman had ${f(staked)} on square${stakes.length === 1 ? "" : "s"} ${squares}`
        : "The Foreman sat this round out";
  let text: string;
  if (!record) {
    text = `Round ${round}: no result was recorded. ${mine}.`;
  } else if (record.outcome !== "settled") {
    text = `Round ${round}: refunded (empty winning square, or never settled). Every stake went back; nothing burned. ${mine}.`;
  } else {
    const winning = record.winning_square;
    const won = record.winners.find((w) => w.player === account);
    const result = stakes.length === 0 ? "" : won ? ` and won ${f(won.award)} back (${signed(won.award - staked, f)} against its stake, not counting CHIP minted for winners).` : ` and lost it.`;
    text = `Round ${round}: square ${winning === null ? "?" : winning + 1} won. ${record.players} player${record.players === 1 ? "" : "s"} staked ${f(record.total)}; ${f(record.burned)} was burned. ${mine}${result || "."}`;
  }
  return text.length <= MAX_RECAP_CHARS ? text : `${text.slice(0, MAX_RECAP_CHARS - 1)}…`;
}

/** The leaf the Foreman writes for one recap: JSON in a string, as the social contract stores strings. `by` is "ai" only when an AI remark came with it. */
export function feedLeaf(round: number, text: string, remark?: { text: string; model: string; via: string }): string {
  return JSON.stringify(remark ? { round, text, by: "ai", remark: remark.text, model: remark.model, via: remark.via } : { round, text, by: "rule" });
}

/** The key of the slot a round's recap goes in. */
export const feedSlot = (round: number) => `r${round % FEED_SLOTS}`;

/** Why the Foreman should not stake now, or null if it can. */
export function stopReason(args: { nearYocto: bigint; chipUnits: bigint; stakeUnits: bigint; squares: number }): string | null {
  const needNear = nearNeededFor(GAS.mineDeploy, 0n) + FOREMAN_NEAR_MARGIN_YOCTO;
  if (args.nearYocto < needNear) return `only ${formatUnits(args.nearYocto, 24, 4)} NEAR free; a stake needs ${formatUnits(needNear, 24, 4)}`;
  if (args.chipUnits < args.stakeUnits * BigInt(args.squares)) return `only ${formatUnits(args.chipUnits, 18)} CHIP left`;
  return null;
}
