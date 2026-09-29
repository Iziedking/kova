import { z } from "zod";

export const FeedAssetSchema = z.object({
  mint: z.string(),
  symbol: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  priceUsd: z.number().nullable(),
  change24hPct: z.number().nullable(),
  volume24hUsd: z.number().nullable(),
  liquidityUsd: z.number().nullable(),
  marketCapUsd: z.number().nullable(),
  launchedAt: z.string().nullable(),
  narrative: z.string().nullable(),
  tags: z.array(z.string()),
  underlyingTicker: z.string().nullable().optional(),
  kovaActivityCount: z.number().int().nonnegative().nullable().optional(),
});
