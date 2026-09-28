import assert from "node:assert/strict";
import test from "node:test";
import { MarketFeed } from "../../src/adapters/game/market-feed";
import { createMarketRouter } from "../../src/backend/game/market-routes";

const MINT_A = "EpXtn6xGoZ4Y45vRjiDUHSCGbBoJD5FaEqZbF98YswH1";
const MINT_B = "9URYxr92ouua9h1vwWdFetUwrQj4WVcGyRcbSmVN14nA";

function fakeFetch(calls: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://clawpump.tech/api/tokens")) {
      return Response.json({ tokens: [
        { mintAddress: MINT_A, name: "Alpha", symbol: "AAA", description: "alpha", imageUrl: "/api/token-image/a", price: 1, volume24h: 10, liquidity: 100, marketCap: 1000, tags: ["agent"], createdAt: "2026-09-01T00:00:00Z" },
        { mintAddress: MINT_B, name: "Beta", symbol: "BBB", imageUrl: null, price: 2, volume24h: 20, liquidity: 0, tags: [], createdAt: null },
      ] });
    }
    if (url.startsWith("https://api.dexscreener.com/tokens/v1/solana/")) {
      return Response.json([
        { chainId: "solana", baseToken: { address: MINT_A }, priceUsd: "1.5", priceChange: { h24: -3 }, volume: { h24: 11 }, liquidity: { usd: 50 } },
        { chainId: "solana", baseToken: { address: MINT_A }, priceUsd: "1.6", priceChange: { h24: -4 }, volume: { h24: 12 }, liquidity: { usd: 500 } },
        { chainId: "solana", baseToken: { address: MINT_B }, priceUsd: "2.5", priceChange: { h24: 40 }, volume: { h24: 21 }, liquidity: { usd: 5 } },
      ]);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

test("the feed merges ClawPump tokens with the deepest DEX Screener pair", async () => {
  const feed = new MarketFeed(fakeFetch([]));
  const page = await feed.list({ sort: "trending", limit: 10 });
  const alpha = page.assets.find((asset) => asset.mint === MINT_A)!;
  assert.equal(alpha.priceUsd, 1.6);
  assert.equal(alpha.change24hPct, -4);
  assert.equal(alpha.liquidityUsd, 500);
  assert.equal(alpha.imageUrl, "https://clawpump.tech/api/token-image/a");
});

test("movers sort by absolute 24h change, and repeat reads come from cache", async () => {
  const calls: string[] = [];
  const feed = new MarketFeed(fakeFetch(calls));
  const movers = await feed.list({ sort: "movers", limit: 10 });
  assert.deepEqual(movers.assets.map((asset) => asset.symbol), ["BBB", "AAA"]);
  await feed.list({ sort: "trending", limit: 10 });
  assert.equal(calls.length, 2, "trending and movers share one cached upstream read");
});

test("market routes reject bad input without touching the providers", async () => {
  const calls: string[] = [];
  const router = createMarketRouter(new MarketFeed(fakeFetch(calls)));
  assert.equal((await router.request("http://localhost/api/game/markets/not-a-mint")).status, 400);
  assert.equal((await router.request("http://localhost/api/game/markets?sort=bogus")).status, 400);
  assert.equal(calls.length, 0);
  const listed = await router.request("http://localhost/api/game/markets?sort=new&limit=1");
  assert.equal(listed.status, 200);
  assert.equal(((await listed.json()) as { assets: unknown[] }).assets.length, 1);
});
