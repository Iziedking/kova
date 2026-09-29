import assert from "node:assert/strict";
import test from "node:test";
import { GeckoTerminal } from "../../src/adapters/game/geckoterminal";

const MINT = "EpXtn6xGoZ4Y45vRjiDUHSCGbBoJD5FaEqZbF98YswH1";

function fake(calls: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/pools?page=1")) {
      return Response.json({ data: [
        { attributes: { address: "OTHER" }, relationships: { base_token: { data: { id: "solana_So11111111111111111111111111111111111111112" } } } },
        { attributes: { address: "POOL" }, relationships: { base_token: { data: { id: `solana_${MINT}` } } } },
      ] });
    }
    if (url.includes("/ohlcv/")) return Response.json({ data: { attributes: { ohlcv_list: [[200, 2, 3, 1, 2.5, 10], [100, 1, 2, 1, 2, 5]] } } });
    if (url.includes("/trades")) {
      return Response.json({ data: [{ attributes: {
        tx_hash: "sig", block_timestamp: "2026-09-28T22:05:15Z", tx_from_address: "5iQtAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2EtF", kind: "buy",
        from_token_amount: "1", to_token_amount: "1000", price_from_in_usd: "117", price_to_in_usd: "0.001", volume_in_usd: "1",
      } }] });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

test("candles come oldest first from the pool where the token is the base", async () => {
  const calls: string[] = [];
  const gecko = new GeckoTerminal(fake(calls));
  const candles = await gecko.candles(MINT, "5m");
  assert.deepEqual(candles.map((candle) => candle.time), [100, 200]);
  assert.ok(calls.some((url) => url.includes("/pools/POOL/ohlcv/minute?aggregate=5")));
  await gecko.candles(MINT, "5m");
  assert.equal(calls.length, 2, "the pool and the candles are cached");
});

test("a buy is priced and sized on the token side", async () => {
  const [trade] = await new GeckoTerminal(fake([])).trades(MINT);
  assert.equal(trade!.side, "buy");
  assert.equal(trade!.priceUsd, 0.001);
  assert.equal(trade!.amount, 1000);
  assert.equal(trade!.maker, "5iQt…2EtF");
});


test("a pool for a different base token never supplies this token's history or trades", async () => {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return Response.json({ data: [{ attributes: { address: "WRONG" }, relationships: { base_token: { data: { id: "solana_OTHER" } } } }] });
  }) as typeof fetch;
  const gecko = new GeckoTerminal(fetcher);
  assert.deepEqual(await gecko.candles(MINT, "1h"), []);
  assert.deepEqual(await gecko.trades(MINT), []);
  assert.equal(calls.length, 1, "mismatched pool is cached but never queried for chart or trades");
});
