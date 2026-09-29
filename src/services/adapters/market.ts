import type { z } from "zod";
import type { FeedAssetSchema } from "@/domain/game/market-contracts";
import type { MarketAsset } from "@/types/market";

/** ClawPump feed row -> the UI's market shape. Eligibility reflects current price availability; admission and order execution remain backend decisions. */
export function toMarketAsset(asset: z.infer<typeof FeedAssetSchema>, now: number): MarketAsset {
  const launched = asset.launchedAt ? Date.parse(asset.launchedAt) : Number.NaN;
  // pump.fun bonding-curve tokens have a live price but no pool liquidity; the price is what a pick needs.
  const priced = asset.priceUsd !== null && asset.priceUsd > 0;
  return {
    ...asset,
    ageSeconds: Number.isFinite(launched) ? Math.max(0, Math.floor((now - launched) / 1000)) : null,
    source: "clawpump / pump.fun",
    underlyingTicker: asset.underlyingTicker ?? null,
    category: asset.underlyingTicker === "SPY" || asset.underlyingTicker === "QQQ" ? "index" : asset.underlyingTicker ? "meme-stock" : asset.tags.some((tag) => tag === "agent" || tag.startsWith("ai")) ? "ai" : "other",
    kovaActivityCount: asset.kovaActivityCount ?? null,
    eligibility: {
      prediction: priced,
      trading: priced,
      reason: priced ? null : "No live price yet.",
    },
  };
}

