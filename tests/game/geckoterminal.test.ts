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
  const gecko = new GeckoTerminal(fake(calls), Date.now, { minGapMs: 0 });
  const candles = await gecko.candles(MINT, "1m");
  assert.deepEqual(candles.map((candle) => candle.time), [100, 200]);
  assert.ok(calls.some((url) => url.includes("/pools/POOL/ohlcv/minute?aggregate=1&limit=1000")));
  const fiveMinute = await gecko.candles(MINT, "5m");
  assert.equal(fiveMinute.length, 1, "5m is rolled up from the same minute series");
  assert.deepEqual({ open: fiveMinute[0]!.open, high: fiveMinute[0]!.high, close: fiveMinute[0]!.close, volume: fiveMinute[0]!.volume }, { open: 1, high: 3, close: 2.5, volume: 15 });
  assert.equal(calls.length, 2, "one pool lookup and one minute series serve 1m and 5m");
});

test("a buy is priced and sized on the token side", async () => {
  const [trade] = await new GeckoTerminal(fake([]), Date.now, { minGapMs: 0 }).trades(MINT);
  assert.equal(trade!.side, "buy");
  assert.equal(trade!.priceUsd, 0.001);
  assert.equal(trade!.amount, 1000);
  assert.equal(trade!.maker, "5iQt…2EtF");
});

test("a pool from the faster source saves the GeckoTerminal pool lookup", async () => {
  const calls: string[] = [];
  const gecko = new GeckoTerminal(fake(calls), Date.now, { minGapMs: 0, poolHint: async () => "HINTED" });
  await gecko.candles(MINT, "1h");
  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.includes("/pools/HINTED/ohlcv/hour"));
});

test("when a refresh is rate limited, the last good chart is served instead of an error", async () => {
  let clock = 1_000_000;
  let limited = false;
  const calls: string[] = [];
  const base = fake(calls);
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => (limited && String(input).includes("/ohlcv/") ? new Response("", { status: 429 }) : base(input, init))) as typeof fetch;
  const gecko = new GeckoTerminal(fetcher, () => clock, { minGapMs: 0, sleep: async () => undefined });
  const first = await gecko.candles(MINT, "1m");
  limited = true;
  clock += 5 * 60_000;
  assert.deepEqual(await gecko.candles(MINT, "1m"), first);
  // A token that never loaded still reports the failure.
  await assert.rejects(() => new GeckoTerminal(fetcher, () => clock, { minGapMs: 0, sleep: async () => undefined }).candles(MINT, "1m"), /429/);
});

test("calls are spaced out, and a long queue is refused rather than piling up", async () => {
  const clock = 0;
  const waits: number[] = [];
  const hint = async () => "POOL";
  const gecko = new GeckoTerminal(fake([]), () => clock, { minGapMs: 2_000, poolHint: hint, sleep: async (ms) => { waits.push(ms); } });
  await Promise.all(["A1", "A2", "A3"].map((mint) => gecko.candles(mint, "1m")));
  assert.deepEqual(waits, [2_000, 4_000], "each later call waits for its own slot");
  // With 5 s between calls, a fourth token would wait 15 s, past the 12 s limit, so it is refused.
  const busy = new GeckoTerminal(fake([]), () => clock, { minGapMs: 5_000, poolHint: hint, sleep: async () => undefined });
  const results = await Promise.allSettled(["B1", "B2", "B3", "B4"].map((mint) => busy.candles(mint, "1m")));
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled", "fulfilled", "rejected"]);
});
