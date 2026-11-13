import { callRoundSeconds, secondsUntilCallable } from "@/adapters/near/launch-calls";
import type { LaunchLobbyJson } from "@/adapters/near/meme-cooking";

export type CookingJson = LaunchLobbyJson["cooking"][number];
export type LaunchedJson = LaunchLobbyJson["launched"][number];

/** Share of the launch line reached, 0 to 100, rounded down so 99.9% never reads as launched. */
export function lineProgress(raised: string, softCap: string): number {
  const cap = BigInt(softCap);
  if (cap === 0n) return 100;
  const pct = (BigInt(raised) * 1000n) / cap;
  return Math.min(100, Number(pct) / 10);
}

/** "2h 14m left", "9m 05s left", "ended". `endsAtMs` is milliseconds, `nowSeconds` seconds. */
export function timeLeft(endsAtMs: number, nowSeconds: number): string {
  const left = Math.floor(endsAtMs / 1000) - nowSeconds;
  if (left <= 0) return "ended";
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m ${String(s).padStart(2, "0")}s left`;
}

/** "2h 14m", "46m", "9m 05s". */
function span(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return m >= 10 ? `${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

/** Where a cooking auction stands for "Will it cook?" calls. */
export function callWindowText(endsAtMs: number, nowSeconds: number): string {
  const nowMs = nowSeconds * 1000;
  if (callRoundSeconds(endsAtMs, nowMs) !== null) return "Will it cook? Make the call in the play card below.";
  const wait = secondsUntilCallable(endsAtMs, nowMs);
  if (wait > 0) return `"Will it cook?" calls open in ${span(wait)}, when it has 14 minutes left.`;
  return "Calls are closed: it ends in under a minute.";
}

/** "today", "yesterday", "12 days ago". */
export function daysAgo(atMs: number, nowSeconds: number): string {
  const days = Math.floor((nowSeconds - Math.floor(atMs / 1000)) / 86_400);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** "Just launched" only when the newest launch is from the last three days; otherwise say what it is. */
export function launchesHeading(launched: readonly LaunchedJson[], nowSeconds: number): string {
  const newest = launched[0];
  if (!newest) return "Launches";
  return nowSeconds - Math.floor(newest.launchedAt / 1000) <= 3 * 86_400 ? "Just launched" : "Latest launches";
}

/** About how many hours meme.cooking's index is behind, at about one block a second, or null if under an hour. */
export function indexLagHours(lagBlocks: number | null): number | null {
  if (lagBlocks === null || lagBlocks < 3_600) return null;
  return Math.round(lagBlocks / 3_600);
}
