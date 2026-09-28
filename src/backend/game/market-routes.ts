import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { MarketFeed } from "../../adapters/game/market-feed";

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
export function createMarketRouter(feed: MarketFeed = new MarketFeed()): Hono {
  const router = new Hono();

  router.get("/api/game/markets", async (context) => {
    const query = ListQuery.safeParse(context.req.query());
    if (!query.success) return context.json({ ok: false, code: "INVALID_QUERY", message: "Unsupported market query.", retryable: false }, 400);
    try {
      const page = query.data.category === "meme-stock"
        ? await feed.stocks({ search: query.data.q, limit: query.data.limit })
        : await feed.list({ sort: query.data.sort, search: query.data.q, limit: Math.min(query.data.limit, 60) });
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
      context.header("Cache-Control", "public, max-age=15");
      return context.json({ ok: true, asset });
    } catch {
      return context.json({ ok: false, code: "MARKET_FEED_UNAVAILABLE", message: "The market feed didn't respond. Try again shortly.", retryable: true }, 503);
    }
  });

  return router;
}
