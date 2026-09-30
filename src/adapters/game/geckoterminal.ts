/**
 * Price history and recent trades from GeckoTerminal's public API (checked 2026-09-28):
 *   GET /api/v2/networks/solana/tokens/{mint}/pools          deepest pool first
 *   GET /api/v2/networks/solana/pools/{pool}/ohlcv/{minute|hour|day}?aggregate=&limit=&token=base
 *   GET /api/v2/networks/solana/pools/{pool}/trades
 *
 * The free tier allows about 30 calls a minute for the whole server and answers a burst with
 * HTTP 429 (seen 2026-09-30 after 8 quick calls). So this client:
 * - spaces its calls (one every ~2.1 s) and waits briefly for a slot instead of bursting,
 * - backs off for 15 s after a 429,
 * - takes the pool address from a faster source when it can (DEX Screener, via `poolHint`),
 * - keeps the last good answer for an hour and serves it when a refresh fails.
 */
import { z } from "zod";

const BASE = "https://api.geckoterminal.com/api/v2/networks/solana";
const TIMEOUT_MS = 10_000;
const MIN_GAP_MS = 2_100;
const MAX_WAIT_MS = 12_000;
const COOLDOWN_MS = 15_000;
const STALE_MS = 60 * 60_000;
/** After a failed refresh, retry the source this soon (the stale answer is served meanwhile). */
const RETRY_AFTER_FAILURE_MS = 20_000;

export type ChartTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";
/**
 * Two base series per token instead of one call per timeframe: 1000 one-minute candles (about
 * 16 hours) serve 1m/5m/15m, and 1000 hourly candles (about 41 days) serve 1h/4h/1d/1w.
 */
const BASES = {
  minute: { unit: "minute", cacheMs: 45_000 },
  hour: { unit: "hour", cacheMs: 300_000 },
} as const;
const TIMEFRAMES: Record<ChartTimeframe, { base: keyof typeof BASES; seconds: number }> = {
  "1m": { base: "minute", seconds: 60 },
  "5m": { base: "minute", seconds: 300 },
  "15m": { base: "minute", seconds: 900 },
  "1h": { base: "hour", seconds: 3_600 },
  "4h": { base: "hour", seconds: 14_400 },
  "1d": { base: "hour", seconds: 86_400 },
  "1w": { base: "hour", seconds: 86_400 },
};

/** Merge candles (oldest first) into larger buckets. */
export function rollUp(candles: readonly ChartCandle[], seconds: number): ChartCandle[] {
  const out: ChartCandle[] = [];
  for (const candle of candles) {
    const time = Math.floor(candle.time / seconds) * seconds;
    const current = out.at(-1);
    if (current && current.time === time) {
      current.high = Math.max(current.high, candle.high);
      current.low = Math.min(current.low, candle.low);
      current.close = candle.close;
      current.volume += candle.volume;
    } else {
      out.push({ ...candle, time });
    }
  }
  return out;
}

export interface ChartCandle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface PoolTrade { id: string; time: string; priceUsd: number; amount: number; totalUsd: number; maker: string; side: "buy" | "sell" }

const PoolsSchema = z.object({ data: z.array(z.object({ attributes: z.object({ address: z.string() }), relationships: z.object({ base_token: z.object({ data: z.object({ id: z.string() }) }) }) })) });
const OhlcvSchema = z.object({ data: z.object({ attributes: z.object({ ohlcv_list: z.array(z.array(z.number().nullable())) }) }) });
const TradesSchema = z.object({
  data: z.array(z.object({
    attributes: z.object({
      tx_hash: z.string(), block_timestamp: z.string(), tx_from_address: z.string(), kind: z.enum(["buy", "sell"]),
      from_token_amount: z.string(), to_token_amount: z.string(), price_from_in_usd: z.string(), price_to_in_usd: z.string(), volume_in_usd: z.string(),
    }),
  })),
});

export interface GeckoOptions {
  /** A faster source for the token's deepest pool. Its answer is used when it has one. */
  poolHint?: (mint: string) => Promise<string | null>;
  minGapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class GeckoTerminal {
  private readonly cache = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();
  private readonly lastGood = new Map<string, { at: number; value: unknown }>();
  private nextSlot = 0;
  private readonly minGapMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now, private readonly options: GeckoOptions = {}) {
    this.minGapMs = options.minGapMs ?? MIN_GAP_MS;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Shared, cached load. A failed refresh falls back to the last good value (up to an hour old)
   * and is retried soon; only a key that never loaded fails.
   */
  private cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
    const entry = { at: this.now(), ttl, value: Promise.resolve() as Promise<unknown> };
    const value = load().then(
      (fresh) => {
        this.lastGood.set(key, { at: this.now(), value: fresh });
        if (this.lastGood.size > 2_000) this.lastGood.delete(this.lastGood.keys().next().value!);
        return fresh;
      },
      (error: unknown) => {
        const stale = this.lastGood.get(key);
        if (stale && this.now() - stale.at < STALE_MS) {
          entry.ttl = RETRY_AFTER_FAILURE_MS;
          return stale.value as T;
        }
        if (this.cache.get(key) === entry) this.cache.delete(key);
        throw error;
      },
    );
    entry.value = value;
    this.cache.set(key, entry);
    if (this.cache.size > 1_000) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  /** Waits for the next free call slot, or refuses when the queue is too long. */
  private async slot(): Promise<void> {
    const now = this.now();
    const at = Math.max(now, this.nextSlot);
    if (at - now > MAX_WAIT_MS) throw new Error("GeckoTerminal is busy; try again shortly.");
    this.nextSlot = at + this.minGapMs;
    if (at > now) await this.sleep(at - now);
  }

  private async get(path: string): Promise<unknown> {
    await this.slot();
    const response = await this.fetcher(`${BASE}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 429) {
      this.nextSlot = Math.max(this.nextSlot, this.now() + COOLDOWN_MS);
      throw new Error("GeckoTerminal rate limit (HTTP 429).");
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GeckoTerminal returned HTTP ${response.status}.`);
    return response.json();
  }

  /** The deepest pool where this mint is the base token, or null. */
  pool(mint: string): Promise<string | null> {
    return this.cached(`pool:${mint}`, 30 * 60_000, async () => {
      const hinted = await this.options.poolHint?.(mint).catch(() => null);
      if (hinted) return hinted;
      const body = await this.get(`/tokens/${encodeURIComponent(mint)}/pools?page=1`);
      if (body === null) return null;
      const pools = PoolsSchema.parse(body).data;
      const own = pools.find((pool) => pool.relationships.base_token.data.id === `solana_${mint}`) ?? pools[0];
      return own?.attributes.address ?? null;
    });
  }

  /** Candles oldest first, at most 150. Empty when the token has no pool or no history yet. */
  async candles(mint: string, timeframe: ChartTimeframe): Promise<ChartCandle[]> {
    const plan = TIMEFRAMES[timeframe];
    const base = await this.series(mint, plan.base);
    const seconds = plan.base === "minute" ? 60 : 3_600;
    return (plan.seconds === seconds ? base : rollUp(base, plan.seconds)).slice(-150);
  }

  private series(mint: string, base: keyof typeof BASES): Promise<ChartCandle[]> {
    const spec = BASES[base];
    return this.cached(`ohlcv:${mint}:${base}`, spec.cacheMs, async () => {
      const pool = await this.pool(mint);
      if (!pool) return [];
      const body = await this.get(`/pools/${encodeURIComponent(pool)}/ohlcv/${spec.unit}?aggregate=1&limit=1000&token=base`);
      if (body === null) return [];
      return OhlcvSchema.parse(body).data.attributes.ohlcv_list
        .filter((row): row is number[] => row.length >= 6 && row.every((value) => typeof value === "number" && Number.isFinite(value)))
        .map(([time, open, high, low, close, volume]) => ({ time: time!, open: open!, high: high!, low: low!, close: close!, volume: volume! }))
        .sort((left, right) => left.time - right.time);
    });
  }

  /** The latest trades in the deepest pool, newest first. */
  trades(mint: string, limit = 30): Promise<PoolTrade[]> {
    return this.cached(`trades:${mint}`, 20_000, async () => {
      const pool = await this.pool(mint);
      if (!pool) return [];
      const body = await this.get(`/pools/${encodeURIComponent(pool)}/trades`);
      if (body === null) return [];
      return TradesSchema.parse(body).data.slice(0, limit).map(({ attributes: trade }) => {
        const buy = trade.kind === "buy";
        return {
          id: trade.tx_hash, time: trade.block_timestamp, side: trade.kind,
          priceUsd: Number(buy ? trade.price_to_in_usd : trade.price_from_in_usd),
          amount: Number(buy ? trade.to_token_amount : trade.from_token_amount),
          totalUsd: Number(trade.volume_in_usd),
          maker: `${trade.tx_from_address.slice(0, 4)}…${trade.tx_from_address.slice(-4)}`,
        };
      });
    });
  }
}
