/**
 * Price history and recent trades from GeckoTerminal's public API (checked 2026-09-28):
 *   GET /api/v2/networks/solana/tokens/{mint}/pools          deepest pool first
 *   GET /api/v2/networks/solana/pools/{pool}/ohlcv/{minute|hour|day}?aggregate=&limit=&token=base
 *   GET /api/v2/networks/solana/pools/{pool}/trades
 * The free tier allows about 30 calls a minute, so every read is cached here.
 */
import { z } from "zod";

const BASE = "https://api.geckoterminal.com/api/v2/networks/solana";
const TIMEOUT_MS = 10_000;

export type ChartTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";
const TIMEFRAMES: Record<ChartTimeframe, { unit: "minute" | "hour" | "day"; aggregate: number; cacheMs: number }> = {
  "1m": { unit: "minute", aggregate: 1, cacheMs: 20_000 },
  "5m": { unit: "minute", aggregate: 5, cacheMs: 30_000 },
  "15m": { unit: "minute", aggregate: 15, cacheMs: 60_000 },
  "1h": { unit: "hour", aggregate: 1, cacheMs: 120_000 },
  "4h": { unit: "hour", aggregate: 4, cacheMs: 300_000 },
  "1d": { unit: "day", aggregate: 1, cacheMs: 600_000 },
  "1w": { unit: "day", aggregate: 1, cacheMs: 600_000 },
};

export interface ChartCandle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface PoolTrade { id: string; time: string; priceUsd: number; amount: number; totalUsd: number; maker: string; side: "buy" | "sell" }

const PoolsSchema = z.object({ data: z.array(z.object({ attributes: z.object({ address: z.string() }), relationships: z.object({ base_token: z.object({ data: z.object({ id: z.string() }) }) }) })) });
const OhlcvSchema = z.object({ data: z.object({ attributes: z.object({ ohlcv_list: z.array(z.array(z.number())) }) }) });
const TradesSchema = z.object({
  data: z.array(z.object({
    attributes: z.object({
      tx_hash: z.string(), block_timestamp: z.string(), tx_from_address: z.string(), kind: z.enum(["buy", "sell"]),
      from_token_amount: z.string(), to_token_amount: z.string(), price_from_in_usd: z.string(), price_to_in_usd: z.string(), volume_in_usd: z.string(),
    }),
  })),
});

export class GeckoTerminal {
  private readonly cache = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();

  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now) {}

  private cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
    const value = load();
    this.cache.set(key, { at: this.now(), ttl, value });
    value.catch(() => { if (this.cache.get(key)?.value === value) this.cache.delete(key); });
    if (this.cache.size > 1_000) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetcher(`${BASE}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GeckoTerminal returned HTTP ${response.status}.`);
    return response.json();
  }

  /** The deepest pool where this mint is the base token, or null. */
  pool(mint: string): Promise<string | null> {
    return this.cached(`pool:${mint}`, 10 * 60_000, async () => {
      const body = await this.get(`/tokens/${encodeURIComponent(mint)}/pools?page=1`);
      if (body === null) return null;
      const pools = PoolsSchema.parse(body).data;
      const own = pools.find((pool) => pool.relationships.base_token.data.id === `solana_${mint}`) ?? pools[0];
      return own?.attributes.address ?? null;
    });
  }

  /** Candles oldest first. Empty when the token has no pool. */
  candles(mint: string, timeframe: ChartTimeframe): Promise<ChartCandle[]> {
    const plan = TIMEFRAMES[timeframe];
    return this.cached(`ohlcv:${mint}:${timeframe}`, plan.cacheMs, async () => {
      const pool = await this.pool(mint);
      if (!pool) return [];
      const limit = timeframe === "1w" ? 200 : 150;
      const body = await this.get(`/pools/${encodeURIComponent(pool)}/ohlcv/${plan.unit}?aggregate=${plan.aggregate}&limit=${limit}&token=base`);
      if (body === null) return [];
      return OhlcvSchema.parse(body).data.attributes.ohlcv_list
        .filter((row) => row.length >= 6 && row.every(Number.isFinite))
        .map(([time, open, high, low, close, volume]) => ({ time: time!, open: open!, high: high!, low: low!, close: close!, volume: volume! }))
        .sort((left, right) => left.time - right.time);
    });
  }

  /** The latest trades in the deepest pool, newest first. */
  trades(mint: string, limit = 30): Promise<PoolTrade[]> {
    return this.cached(`trades:${mint}`, 15_000, async () => {
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
