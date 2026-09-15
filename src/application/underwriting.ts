import { MARKET_CATALOG } from "../domain/market-catalog";
import type { Decision } from "../domain/contracts";

export interface UnderwriteInput { marketId: string; amountUsdMicro: string; }

/** Deterministic preview score. It never signs, allocates, or treats snapshots as live data. */
export function underwritePreview(input: UnderwriteInput, now: string): Decision {
  const market = MARKET_CATALOG.find((candidate) => candidate.id === input.marketId);
  if (!market) return { kind: "refuse", reasons: ["Market identity is not in the approved catalog."], evidenceIds: [] };
  if (!/^\d+$/.test(input.amountUsdMicro) || BigInt(input.amountUsdMicro) <= 0n) return { kind: "refuse", reasons: ["Backing amount must be a positive integer in USD micro-units."], evidenceIds: [] };
  const tvl = market.tvlUsdMicro ? BigInt(market.tvlUsdMicro) : 0n;
  if (tvl === 0n || BigInt(input.amountUsdMicro) > tvl / 4n) return { kind: "wait", reasons: ["Requested backing exceeds the preview concentration limit."], evidenceIds: ["market-snapshot"] };
  return { kind: "wait", reasons: ["A live oracle, exit quote, and wash-activity check are required before capital is accepted."], evidenceIds: ["market-snapshot", `observed-at:${now}`] };
}
