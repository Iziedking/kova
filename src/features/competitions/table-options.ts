import type { CompetitionMode } from "@/types/competition";

/**
 * The table configuration menu (blueprint section 10). One home for every
 * preset, so that when the backend's limits change (today: fixed 15-minute
 * prediction rounds, 2-6 seats on create, a low stake cap while escrow is not
 * live) only this file needs to follow.
 */
export const STAKE_PRESETS = [10, 25, 50, 100] as const;
export const DURATION_PRESETS = [
  { seconds: 300, label: "5m" },
  { seconds: 900, label: "15m" },
  { seconds: 3600, label: "1h" },
  { seconds: 86400, label: "24h" },
] as const;
export const PLAYER_COUNTS = [2, 4, 6] as const;

export type MarketRule = "any" | "same-ticker" | "specific";

export const MARKET_RULES: ReadonlyArray<{ value: MarketRule; label: string; summary: string }> = [
  { value: "any", label: "Any eligible meme stock", summary: "ANY ELIGIBLE MEME STOCK" },
  { value: "same-ticker", label: "Same ticker", summary: "SAME TICKER FOR EVERYONE" },
  { value: "specific", label: "Specific market", summary: "SPECIFIC MARKET" },
];

export function marketRuleSummary(rule: MarketRule): string {
  return MARKET_RULES.find((entry) => entry.value === rule)?.summary ?? "";
}

export function marketRuleLabel(rule: MarketRule): string {
  return MARKET_RULES.find((entry) => entry.value === rule)?.label ?? "";
}

export function durationLabel(seconds: number): string {
  const preset = DURATION_PRESETS.find((entry) => entry.seconds === seconds);
  if (preset) return preset.label === "1h" ? "1 HOUR" : preset.label === "24h" ? "24 HOURS" : `${preset.seconds / 60} MINUTES`;
  return `${Math.round(seconds / 60)} MINUTES`;
}

export function modeTitle(mode: CompetitionMode, playerCount: number): string {
  if (mode === "trading") return playerCount === 2 ? "TRADING DUEL" : "TRADING TABLE";
  return playerCount === 2 ? "PREDICTION DUEL" : "PREDICTION TABLE";
}

/** Whole-number stake bounds for a custom amount. */
export const STAKE_BOUNDS = { min: 1, max: 10_000 } as const;
