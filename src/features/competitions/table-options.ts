import type { CompetitionMode } from "@/types/competition";

/**
 * The table configuration menu (blueprint section 10). One home for every
 * preset, so that when the backend's limits change (today: fixed 15-minute
 * prediction rounds, 2-6 seats on create, a low stake cap while escrow is not
 * live) only this file needs to follow.
 */
// The escrow program caps a stake at 10 ANSEM (MAX_STAKE_RAW) and a round at 60-900 seconds
// (MAX_ROUND_SECONDS). Presets stay inside both.
export const STAKE_PRESETS = [1, 2, 5, 10] as const;
export const DURATION_PRESETS = [
  { seconds: 300, label: "5m" },
  { seconds: 600, label: "10m" },
  { seconds: 900, label: "15m" },
] as const;
export const PLAYER_COUNTS = [2, 4, 6] as const;

export type MarketRule = "any" | "same-ticker" | "specific";

const ALL_MARKET_RULES: ReadonlyArray<{ value: MarketRule; label: string; summary: string }> = [
  { value: "any", label: "Any eligible meme stock", summary: "ANY ELIGIBLE MEME STOCK" },
  { value: "same-ticker", label: "Same ticker", summary: "SAME TICKER FOR EVERYONE" },
  { value: "specific", label: "Specific market", summary: "SPECIFIC MARKET" },
];
/** Only rules the server enforces are offered. Same-ticker and specific-market tables are not built yet. */
export const MARKET_RULES = ALL_MARKET_RULES.filter((rule) => rule.value === "any");

export function marketRuleSummary(rule: MarketRule): string {
  return ALL_MARKET_RULES.find((entry) => entry.value === rule)?.summary ?? "";
}

export function marketRuleLabel(rule: MarketRule): string {
  return ALL_MARKET_RULES.find((entry) => entry.value === rule)?.label ?? "";
}

export function durationLabel(seconds: number): string {
  const preset = DURATION_PRESETS.find((entry) => entry.seconds === seconds);
  if (preset) return `${preset.seconds / 60} MINUTES`;
  return `${Math.round(seconds / 60)} MINUTES`;
}

export function modeTitle(mode: CompetitionMode, playerCount: number): string {
  if (mode === "trading") return playerCount === 2 ? "TRADING DUEL" : "TRADING TABLE";
  return playerCount === 2 ? "PREDICTION DUEL" : "PREDICTION TABLE";
}

/** Whole-number stake bounds for a custom amount. */
export const STAKE_BOUNDS = { min: 1, max: 10 } as const;
