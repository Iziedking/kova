/**
 * Launch picks: what makes a table a "launch table".
 *
 *   - A token that launched on meme.cooking (the "launch" group in NEAR_MARKETS), scored by its
 *     price move like any coin.
 *   - A "Will it cook?" call on a meme.cooking auction: market `mc:<auction id>:<SYMBOL>:cooks` or
 *     `mc:<auction id>:<SYMBOL>:flops`. The CHIP contract accepts any market id and scores the
 *     values the settler reports; for a call the settler reports 1 at the start and, at the end, 2
 *     for the side meme.cooking's contract shows happened and 1 for the other. The symbol is
 *     carried for display only; the settler checks it against the auction.
 */
import { MEME_COOKING, memeUrl } from "./meme-cooking";
import { marketById } from "./prices";

export type CallSide = "cooks" | "flops";
export type LaunchCall = { memeId: number; symbol: string; side: CallSide };

const CALL = /^mc:(\d{1,9}):([A-Za-z0-9$._-]{1,24}):(cooks|flops)$/;

export function callMarket(memeId: number, symbol: string, side: CallSide): string {
  const market = `mc:${memeId}:${symbol}:${side}`;
  if (!CALL.test(market)) throw new Error(`Not a call market: ${market}`);
  return market;
}

export function parseCall(market: string | null | undefined): LaunchCall | null {
  const m = CALL.exec(market ?? "");
  return m ? { memeId: Number(m[1]), symbol: m[2], side: m[3] as CallSide } : null;
}

/** The meme.cooking side of a pick, if it has one: the auction or the launched token. */
export function launchOf(market: string | null | undefined): { memeId: number; symbol: string; kind: "call" | "token"; side?: CallSide } | null {
  const call = parseCall(market);
  if (call) return { memeId: call.memeId, symbol: call.symbol, kind: "call", side: call.side };
  const listed = market ? marketById(market) : undefined;
  if (listed?.group === "launch" && listed.memeCookingId !== undefined) return { memeId: listed.memeCookingId, symbol: listed.symbol, kind: "token" };
  return null;
}

export function isLaunchMarket(market: string | null | undefined): boolean {
  return launchOf(market) !== null;
}

/** "BLYA64 cooks", "BLYA64 flops", or the token's symbol. */
export function launchLabel(market: string | null | undefined): string | null {
  const launch = launchOf(market);
  if (!launch) return null;
  return launch.kind === "call" ? `${launch.symbol} ${launch.side}` : launch.symbol;
}

export function launchUrl(market: string | null | undefined): string | null {
  const launch = launchOf(market);
  return launch ? memeUrl(launch.memeId) : null;
}

export const MEME_COOKING_X = MEME_COOKING.xHandle;

/** The contract's round limits (near/chip/src/lib.rs MIN_ROUND_SECONDS, MAX_ROUND_SECONDS) and open window. */
const MIN_ROUND = 30;
const MAX_ROUND = 900;
const MIN_OPEN = 30;
const MAX_OPEN = 600;
/** The round ends at least this long after the auction, so the result is on chain when it settles. */
export const CALL_AFTER_END_SECONDS = 60;
/** The round must start while the auction is still cooking: opening, filling and starting take this long at most. */
export const CALL_START_MARGIN_SECONDS = 45;

/** A symbol as a call market carries it: meme.cooking symbols are free text, the market id is not. */
export function callSymbol(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9$._-]/g, "").slice(0, 24) || "MEME";
}

/**
 * The round length for a call table opened now, so the round ends after the auction does; null when
 * the auction ends too soon to start the round while it cooks, or too late for the longest round.
 */
export function callRoundSeconds(endsAtMs: number, nowMs: number): number | null {
  const left = Math.ceil((endsAtMs - nowMs) / 1000);
  if (left < CALL_START_MARGIN_SECONDS) return null;
  const round = Math.max(MIN_ROUND, left + CALL_AFTER_END_SECONDS);
  return round <= MAX_ROUND ? round : null;
}

/** How long a friend's call table stays open: it must fill and start before the auction ends. */
export function callOpenSeconds(endsAtMs: number, nowMs: number, preferred: number): number | null {
  const left = Math.floor((endsAtMs - nowMs) / 1000) - CALL_START_MARGIN_SECONDS;
  const open = Math.min(preferred, MAX_OPEN, left);
  return open >= MIN_OPEN ? open : null;
}

/** Seconds until a call on this auction can be made (it opens when the auction ends within the longest round). */
export function secondsUntilCallable(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000) - (MAX_ROUND - CALL_AFTER_END_SECONDS));
}
