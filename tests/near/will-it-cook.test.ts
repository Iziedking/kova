import assert from "node:assert/strict";
import { test } from "node:test";
import type { Account } from "near-api-js";
import { CallAwarePrices } from "../../src/adapters/near/call-prices";
import { CHIP, type ChipClient, type ChipTable, pickCommitment } from "../../src/adapters/near/chip";
import { callMarket, callOpenSeconds, callRoundSeconds, callSymbol, secondsUntilCallable } from "../../src/adapters/near/launch-calls";
import { type AuctionOutcome, type CookingAuction, YOCTO_NEAR } from "../../src/adapters/near/meme-cooking";
import type { NearPrice } from "../../src/adapters/near/prices";
import { MemoryNearPickStore, NearChipService } from "../../src/backend/near/service";
import { callWindowText } from "../../src/features/near/launches";

const NOW = 1_794_552_000_000;
const NEAR = YOCTO_NEAR;
const E18 = 10n ** 18n;

function auction(over: Partial<CookingAuction> = {}): CookingAuction {
  return { id: 2320, name: "Bly", symbol: "BLYA64", owner: "bilyaabdul.tg", raised: 40n * NEAR, softCap: 100n * NEAR, hardCap: 500n * NEAR, endsAt: NOW + 10 * 60_000, stakers: 3, url: "https://meme.cooking/meme/2320", ...over };
}

/** A meme.cooking reader whose answer the test sets. */
function reader(outcome: AuctionOutcome) {
  return { outcome: async () => outcome };
}

const coin: NearPrice = { market: "near:wrap.near", priceE18: 3n * E18, priceUsd: "3", liquidityUsd: 1e6, change1hPct: 0, trades5m: 9, trades1h: 90, source: "dexscreener", sourceRef: "near/refv2", capturedAt: new Date(NOW) };
const coins = { price: async () => coin };
const COOKS = callMarket(2320, "BLYA64", "cooks");
const FLOPS = callMarket(2320, "BLYA64", "flops");

test("a call reports 1 at the start, and 2 for the side that happened once the auction is decided", async () => {
  const cooking = new CallAwarePrices(coins, reader({ state: "cooking", auction: auction() }), () => NOW);
  assert.equal((await cooking.price("near:wrap.near", "start")).priceE18, 3n * E18, "coins pass through");
  const start = await cooking.price(COOKS, "start");
  assert.equal(start.priceE18, E18);
  assert.equal(start.source, "meme-cooking");
  assert.match(start.sourceRef, /meme-cooking\.near auction 2320 \(BLYA64\) start: 40\.000 of 100 NEAR/);
  await assert.rejects(cooking.price(COOKS, "end"), /has not been decided yet/, "the settler retries until it ends");

  const cooked = new CallAwarePrices(coins, reader({ state: "cooked", tokenId: null, raised: 120n * NEAR, softCap: 100n * NEAR }), () => NOW);
  assert.equal((await cooked.price(COOKS, "end")).priceE18, 2n * E18);
  assert.equal((await cooked.price(FLOPS, "end")).priceE18, E18);
  await assert.rejects(cooked.price(COOKS, "start"), /no longer cooking/, "a decided auction cannot start a call");

  const flopped = new CallAwarePrices(coins, reader({ state: "flopped", raised: null, softCap: null }), () => NOW);
  assert.equal((await flopped.price(FLOPS, "end")).priceE18, 2n * E18);
  assert.equal((await flopped.price(COOKS, "end")).priceE18, E18);
  assert.match((await flopped.price(FLOPS, "end")).sourceRef, /did not cook: finalized without a launch/);

  const renamed = new CallAwarePrices(coins, reader({ state: "cooking", auction: auction({ symbol: "OTHER" }) }), () => NOW);
  await assert.rejects(renamed.price(COOKS, "start"), /is OTHER/);
});

test("a call's round ends after the auction, and calls open 14 minutes before it ends", () => {
  assert.equal(callRoundSeconds(NOW + 10 * 60_000, NOW), 660);
  assert.equal(callRoundSeconds(NOW + 14 * 60_000, NOW), 900, "the contract's longest round");
  assert.equal(callRoundSeconds(NOW + 14 * 60_000 + 1_000, NOW), null);
  assert.equal(callRoundSeconds(NOW + 44_000, NOW), null, "too close to start while it cooks");
  assert.equal(callOpenSeconds(NOW + 5 * 60_000, NOW, 600), 255);
  assert.equal(callOpenSeconds(NOW + 60_000, NOW, 600), null);
  assert.equal(secondsUntilCallable(NOW + 3_600_000, NOW), 2_760);
  assert.equal(secondsUntilCallable(NOW + 60_000, NOW), 0);
  assert.equal(callSymbol("Bly 🚀"), "Bly");
  assert.equal(callSymbol("🔥"), "MEME");
  assert.equal(callWindowText(NOW + 3_600_000, NOW / 1000), '"Will it cook?" calls open in 46m, when it has 14 minutes left.');
  assert.equal(callWindowText(NOW + 600_000, NOW / 1000), "Will it cook? Make the call in the play card below.");
});

const HOUSE = "house.kingizie.testnet";

function fakeChip(table: Partial<ChipTable> | null, opened: unknown[]): ChipClient {
  return {
    contractId: "kova-chip.testnet",
    getConfig: async () => ({ min_stake: CHIP, max_stake: 1_000n * CHIP }),
    balanceOf: async () => 50_000n * CHIP,
    getTables: async () => [],
    getTable: async () => (table ? ({ id: "7", host: HOUSE, stake: 25n * CHIP, seats: 2, round_seconds: 660, status: "Open", players: [], ...table } as ChipTable) : null),
    openTable: async (_account: Account, args: unknown) => {
      opened.push(args);
      return { success: true, value: "7", txHash: "tx", explorerUrl: "https://x" };
    },
  } as unknown as ChipClient;
}

function service(chip: ChipClient, outcome: AuctionOutcome, store = new MemoryNearPickStore()) {
  return new NearChipService({
    chip,
    settler: { accountId: "settler.kingizie.testnet" } as Account,
    house: { accountId: HOUSE } as Account,
    store,
    prices: new CallAwarePrices(coins, reader(outcome), () => NOW),
    memeCooking: reader(outcome),
    sealer: { seal: (v) => v, open: (v) => v as never },
    houseMaxOpenTables: 6,
    now: () => NOW,
    log: () => {},
  });
}

test("the House calls a side by its public rule and sets the round from the auction's end", async () => {
  const opened: { roundSeconds: number; openSeconds: number }[] = [];
  const store = new MemoryNearPickStore();
  const below = service(fakeChip(null, opened), { state: "cooking", auction: auction() }, store);
  const result = await below.openHouseTable({ stake: 25n * CHIP, roundSeconds: 60, callMemeId: 2320 });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.roundSeconds, 660);
  assert.deepEqual([opened[0].roundSeconds, opened[0].openSeconds], [660, 120]);
  const housePick = (await store.getPicks("kova-chip.testnet", "7")).get(HOUSE)?.sealed as { market: string; reason: string };
  assert.equal(housePick.market, FLOPS, "below the launch line, the House calls flops");
  assert.match(housePick.reason, /40\.000 of 100 NEAR, so the House called "flops"/);

  // At the launch line, the House calls cooks.
  const cooksStore = new MemoryNearPickStore();
  const r2 = await service(fakeChip(null, []), { state: "cooking", auction: auction({ raised: 100n * NEAR }) }, cooksStore).openHouseTable({ stake: 25n * CHIP, roundSeconds: 60, callMemeId: 2320 });
  assert.equal(r2.ok, true);
  assert.equal(((await cooksStore.getPicks("kova-chip.testnet", "7")).get(HOUSE)?.sealed as { market: string }).market, COOKS);

  const far = await service(fakeChip(null, []), { state: "cooking", auction: auction({ endsAt: NOW + 3_600_000 }) }).openHouseTable({ stake: 25n * CHIP, roundSeconds: 60, callMemeId: 2320 });
  assert.equal(far.ok, false);
  assert.match(!far.ok ? far.message : "", /open when it has 14 minutes left/);
  const done = await service(fakeChip(null, []), { state: "flopped", raised: null, softCap: null }).openHouseTable({ stake: 25n * CHIP, roundSeconds: 60, callMemeId: 2320 });
  assert.equal(done.ok, false);
});

test("a player's call is taken only while the auction cooks and ends before the table's round", async () => {
  const player = "ada.testnet";
  const salt = "a".repeat(64);
  const seated = async (round: number) => ({ round_seconds: round, players: [{ player, commitment: await pickCommitment(player, COOKS, salt), market: null, start_price: null, end_price: null, score_bps: null, award: 0n }] });
  const ok = await service(fakeChip(await seated(660), []), { state: "cooking", auction: auction() }).submitPick({ tableId: "7", player, market: COOKS, salt });
  assert.deepEqual(ok, { ok: true, stored: true });
  const short = await service(fakeChip(await seated(300), []), { state: "cooking", auction: auction() }).submitPick({ tableId: "7", player, market: COOKS, salt });
  assert.equal(short.ok, false);
  assert.match(!short.ok ? short.message : "", /ends after this table's round/);
  const ended = await service(fakeChip(await seated(660), []), { state: "cooked", tokenId: null, raised: 1n, softCap: 1n }).submitPick({ tableId: "7", player, market: COOKS, salt });
  assert.equal(!ended.ok && ended.code, "CALL_CLOSED");
  const unknown = await service(fakeChip(await seated(660), []), { state: "cooking", auction: auction() }).submitPick({ tableId: "7", player, market: "mc:2320:cooks", salt });
  assert.equal(!unknown.ok && unknown.code, "UNKNOWN_MARKET");
});
