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
  /** The stock ticker a stock-themed token stands for (NVDACLAW -> NVDA), else null. */
  underlyingTicker: string | null;
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
  pairAddress: z.string().optional(),
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

/**
 * Stock tickers KOVA looks for on ClawPump. Predict tables admit stock-themed meme tokens, so the
 * pick list and the Meme Stocks section show tokens whose symbol is one of these tickers, optionally
 * wrapped in a common affix (NVDACLAW, XTSLA, AAPLX). The Dealer still makes the final call.
 */
export const STOCK_TICKERS = [
  "GME", "AMC", "NVDA", "TSLA", "AAPL", "GOOGL", "GOOG", "META", "MSFT", "AMZN", "MU", "AMD", "NFLX", "COIN",
  "MSTR", "PLTR", "HOOD", "SPY", "QQQ", "INTC", "SMCI", "AVGO", "RDDT", "UBER", "BABA", "ORCL", "NKE", "DIS",
] as const;
const TICKER_AFFIXES = ["CLAW", "STOCK", "X", "C", "ON"];

/**
 * Issuer-backed tokenized shares (xStocks: NVDAx, TSLAx, ...) and tokens copying their branding.
 * They are real stock exposure, not memes, so the Dealer refuses them and the pick list leaves them out.
 */
export function isTokenizedShare(symbol: string, name: string): boolean {
  return /xstock|backpack|tokeni[sz]ed|ondo|backed/i.test(name) || /^\$?[A-Z]{1,6}x$/.test(symbol.trim());
}

/** The stock ticker a token's symbol stands for, or null when it isn't a stock-themed token. */
export function stockTickerOf(symbol: string): string | null {
  const clean = symbol.toUpperCase().replace(/^\$/, "").replace(/[^A-Z]/g, "");
  const tickers = STOCK_TICKERS as readonly string[];
  if (tickers.includes(clean)) return clean;
  for (const affix of TICKER_AFFIXES) {
    if (clean.endsWith(affix) && tickers.includes(clean.slice(0, -affix.length))) return clean.slice(0, -affix.length);
    if (clean.startsWith(affix) && tickers.includes(clean.slice(affix.length))) return clean.slice(affix.length);
  }
  return null;
}

/** Words a token name must contain to count as a riff on that stock (not just a ticker collision). */
const COMPANY_WORDS: Record<(typeof STOCK_TICKERS)[number], readonly string[]> = {
  GME: ["gamestop", "gme"], AMC: ["amc"], NVDA: ["nvidia", "nvda"], TSLA: ["tesla", "tsla"], AAPL: ["apple", "aapl"],
  GOOGL: ["google", "alphabet", "googl"], GOOG: ["google", "alphabet", "goog"], META: ["meta"], MSFT: ["microsoft", "msft"],
  AMZN: ["amazon", "amzn"], MU: ["micron", "mu"], AMD: ["amd", "advanced micro"], NFLX: ["netflix", "nflx"], COIN: ["coinbase"],
  MSTR: ["microstrategy", "mstr", "saylor"], PLTR: ["palantir", "pltr"], HOOD: ["robinhood"], SPY: ["spy", "s&p"], QQQ: ["nasdaq", "qqq"],
  INTC: ["intel", "intc"], SMCI: ["supermicro", "super micro", "smci"], AVGO: ["broadcom", "avgo"], RDDT: ["reddit", "rddt"],
  UBER: ["uber"], BABA: ["alibaba"], ORCL: ["oracle", "orcl"], NKE: ["nike"], DIS: ["disney"],
};

function containsWord(text: string, word: string): boolean {
  const at = text.indexOf(word);
  if (at < 0) return false;
  const before = at === 0 ? "" : text[at - 1]!;
  const after = text[at + word.length] ?? "";
  return !/[a-z]/.test(before) && !/[a-z]/.test(after) ? true : containsWord(text.slice(at + 1), word);
}

/**
 * The stock a token riffs on: its symbol is the ticker (optionally with an affix) AND its name
 * mentions the company. "SPY / SpacePay" or "COIN / Super Mario Coin" are collisions, not stock memes.
 */
export function stockMemeTickerOf(symbol: string, name: string): string | null {
  const ticker = stockTickerOf(symbol) as (typeof STOCK_TICKERS)[number] | null;
  if (!ticker) return null;
  const text = name.toLowerCase();
  return COMPANY_WORDS[ticker].some((word) => containsWord(text, word)) ? ticker : null;
}

const STOCK_LIST_CACHE_MS = 5 * 60_000;
const MIN_STOCK_LIQUIDITY_USD = 10_000;
/** A pick must be trading: a token with no trades in the round has a flat price, which forces a tie. */
const MIN_PICK_VOLUME_USD = 1_000;

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

  /**
   * Stock-themed tokens: one ClawPump search per ticker, kept only when the symbol maps to that
   * ticker and the token has a live price, deepest volume first. Cached for five minutes.
   */
  async stocks(input: { search?: string; limit: number }): Promise<FeedPage> {
    const page = await this.cached("stocks", async () => {
      const found = new Map<string, ClawTokenT>();
      const searches = await Promise.allSettled(STOCK_TICKERS.map((ticker) => this.fetchClaw("volume", ticker)));
      for (const result of searches) {
        if (result.status !== "fulfilled") continue;
        for (const token of result.value) if (stockMemeTickerOf(token.symbol, token.name) && !found.has(token.mintAddress)) found.set(token.mintAddress, token);
      }
      if (found.size === 0 && searches.every((result) => result.status === "rejected")) throw new Error("ClawPump search is unavailable.");
      const tokens = [...found.values()];
      const dex = await this.fetchDex(tokens.map((token) => token.mintAddress)).catch(() => new Map<string, DexPairT>());
      // A pick is priced from its DEX pair at the start and end of a round, so a token without one can't be played.
      const fromClawPump = tokens.filter((token) => dex.has(token.mintAddress)).map((token) => this.merge(token, dex.get(token.mintAddress) ?? null));
      // Stock memes from other Solana venues too (GME, AMC, TSLA meme tokens). Tokenized shares are left out.
      const fromDex = await this.searchDexStocks().catch(() => []);
      const merged = new Map<string, FeedAsset>();
      for (const asset of [...fromClawPump, ...fromDex]) if (!merged.has(asset.mint)) merged.set(asset.mint, asset);
      const clawPumpMints = new Set(fromClawPump.map((asset) => asset.mint));
      const byVolume = (left: FeedAsset, right: FeedAsset) => (right.volume24hUsd ?? 0) - (left.volume24hUsd ?? 0);
      // ClawPump launches first (the platform KOVA plays on), then everything else, deepest volume first.
      const assets = [...merged.values()]
        .filter((asset) => asset.priceUsd !== null && asset.priceUsd > 0 && (asset.volume24hUsd ?? 0) >= MIN_PICK_VOLUME_USD && !isTokenizedShare(asset.symbol, asset.name))
        .sort((left, right) => Number(clawPumpMints.has(right.mint)) - Number(clawPumpMints.has(left.mint)) || byVolume(left, right));
      return { assets, updatedAt: new Date(this.now()).toISOString() };
    }, STOCK_LIST_CACHE_MS);
    const needle = input.search?.trim().toLowerCase() ?? "";
    const assets = needle
      ? page.assets.filter((asset) => asset.symbol.toLowerCase().includes(needle) || asset.name.toLowerCase().includes(needle) || asset.mint.toLowerCase() === needle || asset.underlyingTicker?.toLowerCase() === needle)
      : page.assets;
    return { assets: assets.slice(0, Math.min(Math.max(input.limit, 1), 100)), updatedAt: page.updatedAt };
  }

  /** DEX Screener search per ticker, deepest Solana pair per token. */
  private async searchDexStocks(): Promise<FeedAsset[]> {
    const queries = [...STOCK_TICKERS];
    const results = await Promise.allSettled(queries.map(async (query) => {
      const response = await this.fetcher(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`DEX Screener returned HTTP ${response.status}.`);
      return z.object({ pairs: z.array(DexPair).nullable() }).parse(await response.json()).pairs ?? [];
    }));
    const best = new Map<string, DexPairT>();
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const pair of result.value) {
        if (pair.chainId !== "solana" || !pair.baseToken.symbol || !stockMemeTickerOf(pair.baseToken.symbol, pair.baseToken.name ?? "")) continue;
        if (isTokenizedShare(pair.baseToken.symbol, pair.baseToken.name ?? "")) continue;
        // Enough depth that the start and end marks are real prices, and some trading today.
        if ((pair.liquidity?.usd ?? 0) < MIN_STOCK_LIQUIDITY_USD || (pair.volume?.h24 ?? 0) <= 0) continue;
        const current = best.get(pair.baseToken.address);
        if (!current || (pair.liquidity?.usd ?? 0) > (current.liquidity?.usd ?? 0)) best.set(pair.baseToken.address, pair);
      }
    }
    return [...best.entries()].map(([mint, pair]) => this.fromPair(mint, pair));
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

  private readonly pairs = new Map<string, { at: number; value: string | null }>();

  /**
   * The deepest Solana pool for this mint, from DEX Screener (which allows far more calls than
   * GeckoTerminal). Charts use it, so the chart and the price come from the same pool.
   */
  async pairAddress(mint: string): Promise<string | null> {
    const hit = this.pairs.get(mint);
    if (hit && this.now() - hit.at < 10 * 60_000) return hit.value;
    const value = (await this.fetchDex([mint])).get(mint)?.pairAddress ?? null;
    this.pairs.set(mint, { at: this.now(), value });
    if (this.pairs.size > 2_000) this.pairs.delete(this.pairs.keys().next().value!);
    return value;
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
      // pump.fun bonding-curve tokens report no pool liquidity; show it as unknown, not $0.
      liquidityUsd: finite(pair?.liquidity?.usd) ?? (token.liquidity ? finite(token.liquidity) : null),
      marketCapUsd: finite(pair?.marketCap) ?? finite(token.marketCap),
      launchedAt: token.createdAt ?? null,
      narrative: token.description?.trim().slice(0, 280) || null,
      tags: token.tags ?? [],
      underlyingTicker: stockMemeTickerOf(token.symbol, token.name),
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
      underlyingTicker: stockMemeTickerOf(base.symbol ?? "", base.name ?? ""),
    };
  }

  private cached<T>(key: string, load: () => Promise<T>, ttlMs: number = CACHE_MS): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = load();
    this.cache.set(key, { at: this.now(), value });
    // A failed load must not be served from cache.
    value.catch(() => { if (this.cache.get(key)?.value === value) this.cache.delete(key); });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }
}
