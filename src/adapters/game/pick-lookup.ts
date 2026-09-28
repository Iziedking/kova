/**
 * Resolves what a player typed (a contract address or a ticker) to one exact Solana
 * mint and the pair KOVA will price it from. DEX Screener public API:
 *   GET /token-pairs/v1/solana/{mint}   exact-mint pairs
 *   GET /latest/dex/search?q={ticker}   free-text search
 * (docs.dexscreener.com/api/reference, read 2026-09-19).
 *
 * A ticker is ambiguous and easy to spoof, so a ticker resolves only to a pair whose base
 * symbol matches exactly, and the player is shown the resolved mint before locking.
 */
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

const PairSchema = z.object({
  chainId: z.string(),
  pairAddress: z.string(),
  url: z.string().optional(),
  baseToken: z.object({ address: z.string(), name: z.string(), symbol: z.string() }),
  quoteToken: z.object({ symbol: z.string() }).passthrough(),
  priceUsd: z.string().nullable().optional(),
  priceChange: z.object({ h24: z.number().nullable().optional() }).passthrough().nullable().optional(),
  volume: z.object({ h24: z.number().nullable().optional() }).passthrough().nullable().optional(),
  liquidity: z.object({ usd: z.number().nullable().optional() }).passthrough().nullable().optional(),
  info: z.object({ imageUrl: z.string().nullable().optional() }).passthrough().nullable().optional(),
}).passthrough();

type Pair = z.infer<typeof PairSchema>;

export interface ResolvedPick {
  mint: string;
  pairAddress: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
}

export function isSolanaAddress(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  try {
    return new PublicKey(value).toBytes().length === 32;
  } catch {
    return false;
  }
}

function deepest(pairs: readonly Pair[]): Pair | null {
  return [...pairs].sort((left, right) => (right.liquidity?.usd ?? 0) - (left.liquidity?.usd ?? 0))[0] ?? null;
}

function toResolved(pair: Pair): ResolvedPick {
  const price = pair.priceUsd ? Number(pair.priceUsd) : null;
  return {
    mint: pair.baseToken.address,
    pairAddress: pair.pairAddress,
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name,
    imageUrl: pair.info?.imageUrl ?? null,
    priceUsd: price !== null && Number.isFinite(price) ? price : null,
    change24hPct: pair.priceChange?.h24 ?? null,
    volume24hUsd: pair.volume?.h24 ?? null,
    liquidityUsd: pair.liquidity?.usd ?? null,
  };
}

async function getJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`PICK_LOOKUP_HTTP_${response.status}`);
  return response.json();
}

export async function resolvePick(query: string, fetcher: typeof fetch = fetch): Promise<ResolvedPick | null> {
  const value = query.trim().replace(/^\$/, "");
  if (isSolanaAddress(value)) {
    const parsed = z.array(PairSchema).safeParse(await getJson(`https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(value)}`, fetcher));
    if (!parsed.success) throw new Error("PICK_LOOKUP_PAYLOAD_INVALID");
    const pair = deepest(parsed.data.filter((candidate) => candidate.chainId === "solana" && candidate.baseToken.address === value));
    return pair ? toResolved(pair) : null;
  }
  if (!/^[A-Za-z0-9]{1,16}$/.test(value)) return null;
  const parsed = z.object({ pairs: z.array(PairSchema).nullable() }).passthrough()
    .safeParse(await getJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(value)}`, fetcher));
  if (!parsed.success) throw new Error("PICK_LOOKUP_PAYLOAD_INVALID");
  const symbol = value.toUpperCase();
  const pair = deepest((parsed.data.pairs ?? []).filter((candidate) => candidate.chainId === "solana" && candidate.baseToken.symbol.toUpperCase() === symbol));
  return pair ? toResolved(pair) : null;
}
