/**
 * Market feed: ClawPump's public token list, with 24h change and pair data from
 * DEX Screener. Both are read-only public endpoints (checked 2026-09-28):
 *   GET https://clawpump.tech/api/tokens?sort=volume|new&limit=<=60&q=<text>
 *   GET https://api.dexscreener.com/tokens/v1/solana/<mint,mint,...>   (up to 30 mints)
 * Responses are cached briefly so page views never fan out to the providers.
 */
import { z } from "zod";

export type FeedSort = "trending" | "new" | "volume" | "movers" | "liquidity";

export interface FeedAsset {
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  launchedAt: string | null;
  narrative: string | null;
  tags: string[];
}

export interface FeedPage {
  assets: FeedAsset[];
  updatedAt: string;
}

const CLAWPUMP = "https://clawpump.tech";
const PAGE_LIMIT = 60;
const DEX_BATCH = 30;
const CACHE_MS = 30_000;
const TIMEOUT_MS = 10_000;

const ClawToken = z.object({
  mintAddress: z.string(),
  name: z.string(),
  symbol: z.string(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  volume24h: z.number().nullable().optional(),
  liquidity: z.number().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  createdAt: z.string().nullable().optional(),
}).passthrough();

const ClawPage = z.object({ tokens: z.array(ClawToken) }).passthrough();

const DexPair = z.object({
  chainId: z.string(),
  baseToken: z.object({ address: z.string(), name: z.string().optional(), symbol: z.string().optional() }),
  priceUsd: z.string().nullable().optional(),
  priceChange: z.object({ h24: z.number().nullable().optional() }).partial().nullable().optional(),
  volume: z.object({ h24: z.number().nullable().optional() }).partial().nullable().optional(),
  liquidity: z.object({ usd: z.number().nullable().optional() }).partial().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  pairCreatedAt: z.number().nullable().optional(),
  info: z.object({ imageUrl: z.string().nullable().optional() }).partial().nullable().optional(),
}).passthrough();

type ClawTokenT = z.infer<typeof ClawToken>;
type DexPairT = z.infer<typeof DexPair>;

function absoluteImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${CLAWPUMP}${url}`;
  return null;
}

function finite(value: number | string | null | undefined): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}

export class MarketFeed {
  private readonly cache = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now) {}

  async list(input: { sort: FeedSort; search?: string; limit: number }): Promise<FeedPage> {
    const search = input.search?.trim().slice(0, 64) ?? "";
    const upstreamSort = input.sort === "new" ? "new" : "volume";
    const page = await this.cached(`list:${upstreamSort}:${search.toLowerCase()}`, () => this.fetchPage(upstreamSort, search));
    const assets = [...page.assets];
    if (input.sort === "movers") assets.sort((a, b) => Math.abs(b.change24hPct ?? 0) - Math.abs(a.change24hPct ?? 0));
    if (input.sort === "liquidity") assets.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
    return { assets: assets.slice(0, Math.min(Math.max(input.limit, 1), PAGE_LIMIT)), updatedAt: page.updatedAt };
  }

  async get(mint: string): Promise<FeedAsset | null> {
    return this.cached(`asset:${mint}`, async () => {
      const [claw, dex] = await Promise.all([
        this.fetchClaw("volume", mint).then((tokens) => tokens.find((token) => token.mintAddress === mint) ?? null).catch(() => null),
        this.fetchDex([mint]),
      ]);
      const pair = dex.get(mint) ?? null;
      if (!claw && !pair) return null;
      if (claw) return this.merge(claw, pair);
      return this.fromPair(mint, pair!);
    });
  }

  private async fetchPage(sort: "volume" | "new", search: string): Promise<FeedPage> {
    const tokens = await this.fetchClaw(sort, search);
    const dex = await this.fetchDex(tokens.map((token) => token.mintAddress)).catch(() => new Map<string, DexPairT>());
    return { assets: tokens.map((token) => this.merge(token, dex.get(token.mintAddress) ?? null)), updatedAt: new Date(this.now()).toISOString() };
  }

  private async fetchClaw(sort: "volume" | "new", search: string): Promise<ClawTokenT[]> {
    const params = new URLSearchParams({ sort, limit: String(PAGE_LIMIT) });
    if (search) params.set("q", search);
    const response = await this.fetcher(`${CLAWPUMP}/api/tokens?${params}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`ClawPump returned HTTP ${response.status}.`);
    const parsed = ClawPage.safeParse(await response.json());
    if (!parsed.success) throw new Error("ClawPump returned an unexpected token list.");
    return parsed.data.tokens;
  }

  /** Deepest Solana pair per mint, keyed by base-token mint. */
  private async fetchDex(mints: readonly string[]): Promise<Map<string, DexPairT>> {
    const best = new Map<string, DexPairT>();
    for (let index = 0; index < mints.length; index += DEX_BATCH) {
      const batch = mints.slice(index, index + DEX_BATCH);
      const response = await this.fetcher(`https://api.dexscreener.com/tokens/v1/solana/${batch.map(encodeURIComponent).join(",")}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`DEX Screener returned HTTP ${response.status}.`);
      const parsed = z.array(DexPair).safeParse(await response.json());
      if (!parsed.success) throw new Error("DEX Screener returned an unexpected tokens payload.");
      for (const pair of parsed.data) {
        if (pair.chainId !== "solana") continue;
        const current = best.get(pair.baseToken.address);
        if (!current || (pair.liquidity?.usd ?? 0) > (current.liquidity?.usd ?? 0)) best.set(pair.baseToken.address, pair);
      }
    }
    return best;
  }

  private merge(token: ClawTokenT, pair: DexPairT | null): FeedAsset {
    return {
      mint: token.mintAddress,
      symbol: token.symbol,
      name: token.name,
      imageUrl: absoluteImage(token.imageUrl) ?? absoluteImage(pair?.info?.imageUrl),
      priceUsd: finite(pair?.priceUsd) ?? finite(token.price),
      change24hPct: finite(pair?.priceChange?.h24),
      volume24hUsd: finite(pair?.volume?.h24) ?? finite(token.volume24h),
      liquidityUsd: finite(pair?.liquidity?.usd) ?? finite(token.liquidity),
      marketCapUsd: finite(pair?.marketCap) ?? finite(token.marketCap),
      launchedAt: token.createdAt ?? null,
      narrative: token.description?.trim().slice(0, 280) || null,
      tags: token.tags ?? [],
    };
  }

  private fromPair(mint: string, pair: DexPairT): FeedAsset {
    const base = pair.baseToken;
    return {
      mint,
      symbol: base.symbol ?? mint.slice(0, 4),
      name: base.name ?? base.symbol ?? mint,
      imageUrl: absoluteImage(pair.info?.imageUrl),
      priceUsd: finite(pair.priceUsd),
      change24hPct: finite(pair.priceChange?.h24),
      volume24hUsd: finite(pair.volume?.h24),
      liquidityUsd: finite(pair.liquidity?.usd),
      marketCapUsd: finite(pair.marketCap),
      launchedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
      narrative: null,
      tags: [],
    };
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.value as Promise<T>;
    const value = load();
    this.cache.set(key, { at: this.now(), value });
    // A failed load must not be served from cache.
    value.catch(() => { if (this.cache.get(key)?.value === value) this.cache.delete(key); });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }
}
