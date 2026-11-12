import assert from "node:assert/strict";
import { test } from "node:test";
import { CHIP, formatChip, parseEvents, pickCommitment } from "../../src/adapters/near/chip";
import { NearAiHouseBrain } from "../../src/adapters/near/near-ai";
import { NEAR_MARKETS, type NearPrice, NearPriceFeed, decimalToE18, marketById } from "../../src/adapters/near/prices";
import { MemoryNearPickStore, fixedHousePick } from "../../src/backend/near/service";
import { memoForRow } from "../../src/backend/near/chain-log";

test("log rows get their own memo when one transaction mints twice", () => {
  // The init transaction mints the treasury to the contract, then the House bankroll. NearBlocks
  // lists the House row first, which swapped the labels when memos were matched by position.
  const events = [
    { owner: "chip.kingizie.testnet", amount: "1000000000000000000000000", memo: "genesis:treasury" },
    { owner: "house.kingizie.testnet", amount: "50000000000000000000000", memo: "genesis:house_bankroll" },
  ];
  const used = new Set<number>();
  assert.equal(memoForRow(events, used, "house.kingizie.testnet", "50000000000000000000000"), "genesis:house_bankroll");
  assert.equal(memoForRow(events, used, "chip.kingizie.testnet", "1000000000000000000000000"), "genesis:treasury");
  assert.equal(memoForRow(events, used, "chip.kingizie.testnet", "1000000000000000000000000"), null, "an event is matched once");
  // Two equal burns in one transaction still each get one memo.
  const burns = [
    { owner: "chip.kingizie.testnet", amount: "5", memo: "pot_burn:table:1" },
    { owner: "chip.kingizie.testnet", amount: "5", memo: "pot_burn:table:2" },
  ];
  const usedBurns = new Set<number>();
  assert.deepEqual([memoForRow(burns, usedBurns, "chip.kingizie.testnet", "5"), memoForRow(burns, usedBurns, "chip.kingizie.testnet", "5")].sort(), ["pot_burn:table:1", "pot_burn:table:2"]);
});

/** A DEX Screener single-pair response, shaped like the live one checked on 2026-11-12. */
function pairBody(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0.0",
    pairs: [
      {
        chainId: "near",
        dexId: "rhea-finance",
        pairAddress: "refv2-17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1:wrap.near:100",
        baseToken: { address: "wrap.near", symbol: "wNEAR" },
        priceNative: "3.5110",
        priceUsd: "3.51",
        liquidity: { usd: 522_301 },
        priceChange: { h1: 0.43 },
        txns: { m5: { buys: 9, sells: 20 }, h1: { buys: 300, sells: 481 } },
        ...overrides,
      },
    ],
  };
}

function feedReturning(body: unknown, seen: string[] = []) {
  return new NearPriceFeed((async (url: string) => {
    seen.push(url);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch);
}

test("every market is pinned to one pool and every id is unique", () => {
  assert.equal(new Set(NEAR_MARKETS.map((m) => m.id)).size, NEAR_MARKETS.length);
  for (const m of NEAR_MARKETS) {
    assert.ok(m.pair.length > 3, `${m.symbol} has a pinned pool`);
    assert.equal(m.id, `near:${m.token}`);
  }
  assert.ok(NEAR_MARKETS.some((m) => m.group === "busy") && NEAR_MARKETS.some((m) => m.group === "meme"));
});

test("a price is read from the pinned pool only, with priceNative for a USDC-quoted market", async () => {
  const seen: string[] = [];
  const price = await feedReturning(pairBody(), seen).price("near:wrap.near");
  assert.equal(seen.length, 1);
  assert.equal(seen[0], `https://api.dexscreener.com/latest/dex/pairs/near/${encodeURIComponent(marketById("near:wrap.near")!.pair)}`);
  assert.equal(price.priceUsd, "3.5110");
  assert.equal(price.priceE18, 3_511_000_000_000_000_000n);
  assert.equal(price.trades5m, 29);
  assert.equal(price.trades1h, 781);
});

test("a pool that prices another token, a missing pool, or a thin pool is refused", async () => {
  await assert.rejects(feedReturning(pairBody({ baseToken: { address: "evil.near" } })).price("near:wrap.near"), /does not price wrap\.near/);
  await assert.rejects(feedReturning({ schemaVersion: "1.0.0", pairs: null }).price("near:wrap.near"), /not found/);
  await assert.rejects(feedReturning(pairBody({ pairAddress: "refv1-1" })).price("near:wrap.near"), /not found/);
  await assert.rejects(feedReturning(pairBody({ liquidity: { usd: 900 } })).price("near:wrap.near"), /below/);
  await assert.rejects(feedReturning(pairBody()).price("near:unknown.near"), /Unknown NEAR market/);
});

test("the House's fixed rule prefers a coin that is trading right now", () => {
  const p = (market: string, change1hPct: number | null, trades5m: number): NearPrice => ({
    market, priceE18: 1n, priceUsd: "1", liquidityUsd: 50_000, change1hPct, trades5m, trades1h: trades5m, source: "dexscreener", sourceRef: "x", capturedAt: new Date(0),
  });
  const quietBigMover = p("near:purge-558.meme-cooking.near", 12, 0);
  const busy = p("near:zec.omft.near", -0.4, 105);
  const busier = p("near:wrap.near", 0.43, 29);
  assert.equal(fixedHousePick([quietBigMover, busy, busier], "Fixed rule").market, "near:wrap.near");
  assert.match(fixedHousePick([quietBigMover, busy, busier], "Fixed rule").reason, /2 coins trading right now/);
  // With nothing trading, it still picks the biggest mover and says so.
  const none = fixedHousePick([quietBigMover, p("near:gear.enleap.near", 1, 0)], "Fixed rule");
  assert.equal(none.market, "near:purge-558.meme-cooking.near");
  assert.match(none.reason, /no coin traded/);
  assert.throws(() => fixedHousePick([], "Fixed rule"));
});

test("commitment matches the contract vector", async () => {
  // Same vector as commitment_vector_matches_the_typescript_client in near/chip/src/tests.rs.
  assert.equal(
    await pickCommitment("alice.testnet", "near:blackdragon.tkn.near", "00112233445566778899aabbccddeeff"),
    "e5c7cd5b89865003c0aac5ba6fde8659a7f6b82519ee0b3909f3794388ff3bfe",
  );
});

test("decimal prices convert exactly to 18 decimals", () => {
  assert.equal(decimalToE18("1"), 10n ** 18n);
  assert.equal(decimalToE18("0.000000006416"), 6_416_000_000n);
  assert.equal(decimalToE18("2048.03309727141"), 2_048_033_097_271_410_000_000n);
  assert.equal(decimalToE18("1.2e-8"), 12_000_000_000n);
  assert.equal(decimalToE18("0.1234567890123456789"), 123_456_789_012_345_678n);
  assert.throws(() => decimalToE18("-1"));
  assert.throws(() => decimalToE18("abc"));
});

test("CHIP amounts format without floating point", () => {
  assert.equal(formatChip(1_234n * CHIP + CHIP / 2n), "1,234.5");
  assert.equal(formatChip(5n), "0");
  assert.equal(formatChip(-25n * CHIP), "-25");
});

test("events are read from logs and junk is ignored", () => {
  const events = parseEvents([
    'EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_burn","data":[{"owner_id":"chip.testnet","amount":"5","memo":"pot_burn:table:1"}]}',
    "plain log",
    "EVENT_JSON:{broken",
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "ft_burn");
});

test("the House brain spends nothing without a key and respects its daily cap", async () => {
  let calls = 0;
  const reply = (content: string) =>
    (async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as unknown as typeof fetch;
  const candidates = [
    { market: "near:a", symbol: "A", change1hPct: 3, liquidityUsd: 20_000 },
    { market: "near:b", symbol: "B", change1hPct: -1, liquidityUsd: 30_000 },
  ];

  const off = new NearAiHouseBrain({ apiKey: null, model: "m", dailyLimit: 10, fetcher: reply("{}") });
  assert.equal(off.enabled, false);
  assert.equal(await off.choose(candidates), null);
  assert.equal(calls, 0);

  const zero = new NearAiHouseBrain({ apiKey: "k", model: "m", dailyLimit: 0, fetcher: reply("{}") });
  assert.equal(await zero.choose(candidates), null);
  assert.equal(calls, 0);

  const good = new NearAiHouseBrain({ apiKey: "k", model: "m", dailyLimit: 2, fetcher: reply('Sure: {"market":"near:b","reason":"Deepest pool, least noise."}') });
  assert.deepEqual(await good.choose(candidates), { market: "near:b", reason: "Deepest pool, least noise.", model: "m" });
  await good.choose(candidates);
  assert.equal(await good.choose(candidates), null, "third call is over the cap of 2");
  assert.equal(calls, 2);

  const invented = new NearAiHouseBrain({ apiKey: "k", model: "m", dailyLimit: 5, fetcher: reply('{"market":"near:zzz","reason":"Not on the list."}') });
  assert.equal(await invented.choose(candidates), null);

  const failing = new NearAiHouseBrain({ apiKey: "k", model: "m", dailyLimit: 5, fetcher: (async () => { throw new Error("timeout"); }) as unknown as typeof fetch });
  assert.equal(await failing.choose(candidates), null);
});

test("a seat holds one pick", async () => {
  const store = new MemoryNearPickStore();
  assert.equal(await store.putPick({ contractId: "c", tableId: "1", player: "a", commitment: "x", sealed: {} }), true);
  assert.equal(await store.putPick({ contractId: "c", tableId: "1", player: "a", commitment: "y", sealed: {} }), false);
  assert.equal((await store.getPicks("c", "1")).get("a")?.commitment, "x");
});
