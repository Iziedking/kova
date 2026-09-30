/**
 * KOVA's own record of live prices. Every time a market's price is read (the market page and the
 * trading screen poll every few seconds), the price is noted here. When GeckoTerminal has no
 * history for a token yet, or can't be reached, the chart is built from these samples instead.
 * These candles are real observed prices, sampled rather than traded, so they carry no volume.
 * The tape lives in memory and restarts empty after a deploy.
 */
import type { ChartCandle, ChartTimeframe } from "./geckoterminal";

const KEEP_MS = 24 * 60 * 60_000;
const MAX_POINTS = 4_000;
const MIN_SPACING_MS = 5_000;
const BUCKET_SECONDS: Record<ChartTimeframe, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3_600, "4h": 14_400, "1d": 86_400, "1w": 86_400 };

export class PriceTape {
  private readonly points = new Map<string, { t: number; price: number }[]>();

  constructor(private readonly now: () => number = Date.now) {}

  record(mint: string, price: number | null | undefined): void {
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return;
    const now = this.now();
    const series = this.points.get(mint) ?? [];
    const last = series.at(-1);
    if (last && now - last.t < MIN_SPACING_MS) {
      last.price = price;
    } else {
      series.push({ t: now, price });
    }
    while (series.length > MAX_POINTS || (series[0] && now - series[0].t > KEEP_MS)) series.shift();
    this.points.set(mint, series);
    if (this.points.size > 3_000) this.points.delete(this.points.keys().next().value!);
  }

  /** Candles oldest first from the recorded samples; empty until there are at least two. */
  candles(mint: string, timeframe: ChartTimeframe): ChartCandle[] {
    const series = this.points.get(mint) ?? [];
    if (series.length < 2) return [];
    const size = BUCKET_SECONDS[timeframe];
    const out: ChartCandle[] = [];
    for (const point of series) {
      const time = Math.floor(point.t / 1000 / size) * size;
      const current = out.at(-1);
      if (current && current.time === time) {
        current.high = Math.max(current.high, point.price);
        current.low = Math.min(current.low, point.price);
        current.close = point.price;
      } else {
        out.push({ time, open: current?.close ?? point.price, high: Math.max(point.price, current?.close ?? point.price), low: Math.min(point.price, current?.close ?? point.price), close: point.price, volume: 0 });
      }
    }
    return out.slice(-150);
  }
}
