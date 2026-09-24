/**
 * Frontend-facing market contracts (blueprint section 37 and 7.8).
 *
 * The UI consumes these normalized shapes and never a ClawPump / pump.fun
 * payload. Provider parsing belongs to the adapter behind `MarketService`.
 */
export type MarketSource = "clawpump / pump.fun" | "other";

export type MarketCategory = "meme-stock" | "index" | "ai" | "other";

export interface MarketEligibility {
  prediction: boolean;
  trading: boolean;
  reason?: string | null;
}

export interface MarketAsset {
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;

  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd?: number | null;
  high24hUsd?: number | null;
  low24hUsd?: number | null;

  launchedAt?: string | null;
  ageSeconds?: number | null;
  source: MarketSource;
  category?: MarketCategory;

  underlyingTicker?: string | null;
  narrative?: string | null;

  /** Recent close prices for a sparkline. Absent when the provider has no history. */
  sparkline?: number[] | null;
  /** Number of Kova matches that recently involved this asset. */
  kovaActivityCount?: number | null;

  eligibility: MarketEligibility;
}

/** The normalized ClawPump / pump.fun meme-stock shape from blueprint 7.8. */
export interface PompAsset extends MarketAsset {
  source: "clawpump / pump.fun";
  trendScore?: number | null;
  attentionScore?: number | null;
}

export type MarketSort = "trending" | "new" | "volume" | "movers" | "liquidity";

export interface MarketQuery {
  search?: string;
  sort?: MarketSort;
  category?: MarketCategory | "all";
  source?: "pomp" | "all";
  tradableOnly?: boolean;
  limit?: number;
}

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

export interface Candle {
  /** Unix seconds at the open of the bar. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketTrade {
  id: string;
  time: string;
  priceUsd: number;
  amount: number;
  totalUsd: number;
  maker: string;
  side: "buy" | "sell";
}

export interface MarketFreshness {
  /** ISO time the underlying feed was last refreshed. */
  updatedAt: string | null;
  stale: boolean;
}

export interface MarketList {
  assets: MarketAsset[];
  freshness: MarketFreshness;
}
