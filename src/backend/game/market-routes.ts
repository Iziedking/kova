import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { MarketFeed } from "../../adapters/game/market-feed";
import { GeckoTerminal } from "../../adapters/game/geckoterminal";
import { PriceTape } from "../../adapters/game/price-tape";

const ListQuery = z.object({
  sort: z.enum(["trending", "new", "volume", "movers", "liquidity"]).default("trending"),
  q: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  /** `meme-stock`: only stock-themed tokens (the Predict pick list and the Meme Stocks section). */
  category: z.enum(["all", "meme-stock"]).default("all"),
});

function isMint(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

/** Public, read-only market data. Cached in `MarketFeed`; nothing here needs a session. */
const TimeframeSchema = z.enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w"]);

/**
 * Keeps the price tape warm for the tokens players see most: the meme-stock list and the trending
 * list, one cached feed read each (DEX Screener, batched). Returns a stop function.
 */
export function startTapeRecorder(feed: MarketFeed, tape: PriceTape, intervalMs = 20_000): () => void {
  const sample = async () => {
    const pages = await Promise.allSettled([feed.stocks({ limit: 40 }), feed.list({ sort: "trending", limit: 40 })]);
    for (const page of pages) if (page.status === "fulfilled") for (const asset of page.value.assets) tape.record(asset.mint, asset.priceUsd);
  };
  void sample();
  const timer = setInterval(() => void sample(), intervalMs);
  return () => clearInterval(timer);
}

export function createMarketRouter(
  feed: MarketFeed = new MarketFeed(),
  // The pool comes from DEX Screener when it can, so the chart matches the price and saves a GeckoTerminal call.
  gecko: GeckoTerminal = new GeckoTerminal(fetch, Date.now, { poolHint: (mint) => feed.pairAddress(mint) }),
  tape: PriceTape = new PriceTape(),
): Hono {
  const router = new Hono();
  const log = (event: string, mint: string, error: unknown) => console.warn(JSON.stringify({ event, mint, message: error instanceof Error ? error.message.slice(0, 160) : "unknown" }));

  router.get("/api/game/markets", async (context) => {
    const query = ListQuery.safeParse(context.req.query());
    if (!query.success) return context.json({ ok: false, code: "INVALID_QUERY", message: "Unsupported market query.", retryable: false }, 400);
    try {
      const page = query.data.category === "meme-stock"
        ? await feed.stocks({ search: query.data.q, limit: query.data.limit })
        : await feed.list({ sort: query.data.sort, search: query.data.q, limit: Math.min(query.data.limit, 60) });
      for (const asset of page.assets) tape.record(asset.mint, asset.priceUsd);
      context.header("Cache-Control", "public, max-age=15");
      return context.json({ ok: true, ...page });
    } catch {
      return context.json({ ok: false, code: "MARKET_FEED_UNAVAILABLE", message: "The market feed didn't respond. Try again shortly.", retryable: true }, 503);
    }
  });

  router.get("/api/game/markets/:mint", async (context) => {
    const mint = context.req.param("mint");
    if (!isMint(mint)) return context.json({ ok: false, code: "INVALID_MINT", message: "That isn't a Solana token address.", retryable: false }, 400);
    try {
      const asset = await feed.get(mint);
      if (!asset) return context.json({ ok: false, code: "MARKET_NOT_FOUND", message: "No market found for that token.", retryable: false }, 404);
      tape.record(mint, asset.priceUsd);
      context.header("Cache-Control", "public, max-age=15");
      return context.json({ ok: true, asset });
    } catch {
      return context.json({ ok: false, code: "MARKET_FEED_UNAVAILABLE", message: "The market feed didn't respond. Try again shortly.", retryable: true }, 503);
    }
  });

  router.get("/api/game/markets/:mint/candles", async (context) => {
    const mint = context.req.param("mint");
    const timeframe = TimeframeSchema.safeParse(context.req.query("tf") ?? "1h");
    if (!isMint(mint) || !timeframe.success) return context.json({ ok: false, code: "INVALID_QUERY", message: "Unsupported chart request.", retryable: false }, 400);
    let candles: Awaited<ReturnType<GeckoTerminal["candles"]>> = [];
    let failed = false;
    try {
      candles = await gecko.candles(mint, timeframe.data);
    } catch (error) {
      failed = true;
      log("chart_source_failed", mint, error);
    }
    const fromTape = tape.candles(mint, timeframe.data);
    // GeckoTerminal's answer can be a few minutes old (cached, or served stale while it is busy):
    // continue it with KOVA's newer samples so a live match keeps moving.
    if (candles.length > 0) {
      const lastTime = candles.at(-1)!.time;
      const newer = fromTape.filter((candle) => candle.time > lastTime);
      if (newer.length > 0) {
        context.header("Cache-Control", "public, max-age=10");
        return context.json({ ok: true, candles: [...candles, ...newer].slice(-150), source: "geckoterminal+kova-samples" });
      }
    }
    // No history from GeckoTerminal (new token, or it's unreachable): use KOVA's own price samples.
    if (candles.length === 0) {
      if (fromTape.length > 0) {
        context.header("Cache-Control", "public, max-age=10");
        return context.json({ ok: true, candles: fromTape, source: "kova-samples" });
      }
      if (failed) return context.json({ ok: false, code: "CHART_UNAVAILABLE", message: "Price history didn't load. Try again shortly.", retryable: true }, 503);
    }
    context.header("Cache-Control", "public, max-age=20");
    return context.json({ ok: true, candles, source: "geckoterminal" });
  });

  router.get("/api/game/markets/:mint/trades", async (context) => {
    const mint = context.req.param("mint");
    if (!isMint(mint)) return context.json({ ok: false, code: "INVALID_MINT", message: "That isn't a Solana token address.", retryable: false }, 400);
    try {
      const trades = await gecko.trades(mint);
      context.header("Cache-Control", "public, max-age=10");
      return context.json({ ok: true, trades });
    } catch (error) {
      log("trades_source_failed", mint, error);
      return context.json({ ok: false, code: "TRADES_UNAVAILABLE", message: "Recent trades didn't load. Try again shortly.", retryable: true }, 503);
    }
  });

  return router;
}
