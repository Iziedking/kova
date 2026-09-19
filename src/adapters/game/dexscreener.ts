/** DEX Screener token-pairs/v1 response adapter, official reference checked 2026-09-19. */
import { z } from "zod";

const PairSchema = z.object({
  chainId: z.string(),
  dexId: z.string(),
  url: z.string().url(),
  pairAddress: z.string(),
  baseToken: z.object({ address: z.string(), name: z.string(), symbol: z.string() }),
  quoteToken: z.object({ address: z.string(), name: z.string(), symbol: z.string() }),
  liquidity: z.object({ usd: z.number().nullable().optional() }).optional(),
  pairCreatedAt: z.number().nullable().optional(),
}).passthrough();

export type DexPairEvidence = z.infer<typeof PairSchema>;

export async function readDexPairs(mint: string, fetcher: typeof fetch = fetch): Promise<readonly DexPairEvidence[]> {
  const response = await fetcher(`https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(mint)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`DEX Screener returned HTTP ${response.status}.`);
  const parsed = z.array(PairSchema).safeParse(await response.json());
  if (!parsed.success) throw new Error("DEX Screener returned an unexpected token-pairs payload.");
  return parsed.data.filter((pair) => pair.chainId === "solana" && (pair.baseToken.address === mint || pair.quoteToken.address === mint));
}

