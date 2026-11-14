import assert from "node:assert/strict";
import { test } from "node:test";
import { type ChainMeme, buildLobby, formatNear, MemeCookingReader, memeUrl, outcomeFrom, parseIndex, serializeLobby, YOCTO_NEAR } from "../../src/adapters/near/meme-cooking";
import { daysAgo, indexLagHours, launchesHeading, lineProgress, timeLeft } from "../../src/features/near/launches";

const NEAR = YOCTO_NEAR;
const NOW = 1_794_552_000_000; // 2026-11-13 06:40 UTC

/** Rows shaped like api.meme.cooking/meme on 2026-11-13 (trimmed). */
function indexRow(over: Partial<Record<string, unknown>>) {
  return {
    meme_id: 1,
    owner: "cook.near",
    name: "Test",
    symbol: "TEST",
    decimals: 18,
    end_timestamp_ms: NOW - 86_400_000,
    created_timestamp_ms: NOW - 2 * 86_400_000,
    soft_cap: (100n * NEAR).toString(),
    hard_cap: (500n * NEAR).toString(),
    total_deposit: "0",
    is_finalized: true,
    token_id: null,
    pool_id: null,
    staker_count: 0,
    image: "Qm…",
    ...over,
  };
}

function chainMeme(over: Partial<ChainMeme>): ChainMeme {
  return { id: 2320, owner: "bilyaabdul.tg", name: "Bly", symbol: "BLYA64", end_timestamp_ms: String(NOW + 4 * 3_600_000), soft_cap: (100n * NEAR).toString(), hard_cap: (500n * NEAR).toString(), total_staked: "398000000000000000000000", ...over };
}

test("the index parser keeps good rows and skips rows that drifted", () => {
  const rows = parseIndex([indexRow({ meme_id: 1 }), { meme_id: "x" }, indexRow({ meme_id: 2, hard_cap: null })]);
  assert.deepEqual(rows.map((r) => r.meme_id), [1, 2]);
  assert.throws(() => parseIndex({ memes: [] }), /expected a list/);
});

test("an auction's outcome: cooking, cooked through finalize, flopped when deleted, or decided by its numbers after the end", () => {
  assert.equal(outcomeFrom(chainMeme({}), null, NOW).state, "cooking");
  assert.equal(outcomeFrom(null, chainMeme({ total_staked: (120n * NEAR).toString() }), NOW).state, "cooked");
  assert.equal(outcomeFrom(null, null, NOW).state, "flopped");
  const ended = String(NOW - 1000);
  assert.equal(outcomeFrom(chainMeme({ end_timestamp_ms: ended, total_staked: (100n * NEAR).toString() }), null, NOW).state, "cooked", "reaching the line exactly cooks");
  assert.equal(outcomeFrom(chainMeme({ end_timestamp_ms: ended, total_staked: (99n * NEAR).toString() }), null, NOW).state, "flopped");
  // Reaching the hard cap launches at once, before the end.
  assert.equal(outcomeFrom(chainMeme({ total_staked: (500n * NEAR).toString() }), null, NOW).state, "cooked");
});

test("the lobby lists live auctions by end time from the contract's numbers and the latest launches from the index", () => {
  const index = parseIndex([
    indexRow({ meme_id: 2250, symbol: "NENE", token_id: "nene-2250.meme-cooking.near", pool_id: 8943, end_timestamp_ms: NOW - 32 * 86_400_000, total_deposit: (100n * NEAR).toString() }),
    indexRow({ meme_id: 2223, symbol: "QCAT", token_id: "qcat-2223.meme-cooking.near", pool_id: 8929, end_timestamp_ms: NOW - 36 * 86_400_000 }),
    indexRow({ meme_id: 2319, symbol: "MIMI" }),
    indexRow({ meme_id: 2320, symbol: "BLYA64", is_finalized: false, end_timestamp_ms: NOW + 4 * 3_600_000, staker_count: 1 }),
  ]);
  const live = new Map([
    [2320, chainMeme({})],
    [2321, chainMeme({ id: 2321, symbol: "NEW", end_timestamp_ms: String(NOW + 600_000) })],
    [2300, chainMeme({ id: 2300, symbol: "OVER", end_timestamp_ms: String(NOW - 1) })],
  ]);
  const lobby = buildLobby(index, live, NOW);
  assert.deepEqual(lobby.cooking.map((a) => a.symbol), ["NEW", "BLYA64"], "soonest end first; an ended one is not cooking");
  assert.equal(lobby.cooking[1].raised, 398000000000000000000000n, "deposits come from the contract");
  assert.equal(lobby.cooking[1].stakers, 1);
  assert.equal(lobby.cooking[1].url, "https://meme.cooking/meme/2320");
  assert.deepEqual(lobby.launched.map((t) => t.symbol), ["NENE", "QCAT"], "newest launch first; a failed auction is not a launch");
  assert.equal(lobby.launchesTotal, 2);
  assert.equal(lobby.auctionsTotal, 4);
  const json = serializeLobby({ ...lobby, indexLagBlocks: 0, readAt: NOW });
  assert.equal(json.cooking[1].raised, "398000000000000000000000");
  assert.equal(JSON.parse(JSON.stringify(json)).launched[0].raised, (100n * NEAR).toString());
});

test("the reader takes deposits from the contract, finds auctions the index has not seen, and survives one RPC failing", async () => {
  const calls: string[] = [];
  const onChain = new Map<number, ChainMeme>([
    [2320, chainMeme({ total_staked: (7n * NEAR).toString() })],
    [2321, chainMeme({ id: 2321, symbol: "NEW", end_timestamp_ms: String(NOW + 600_000) })],
  ]);
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.endsWith("/meme")) return Response.json([indexRow({ meme_id: 2320, is_finalized: false, end_timestamp_ms: NOW + 3_600_000, total_deposit: "1" })]);
    if (url.endsWith("/info")) return Response.json({ last_block_height: 100, last_seen_block_height: 7_300 });
    if (url.includes("free.rpc")) return new Response("down", { status: 502 });
    const params = JSON.parse(String(init?.body)).params;
    const args = JSON.parse(Buffer.from(params.args_base64, "base64").toString());
    const meme = params.method_name === "get_meme" ? (onChain.get(args.meme_id) ?? null) : null;
    return Response.json({ result: { result: [...Buffer.from(JSON.stringify(meme))] } });
  };
  const reader = new MemeCookingReader(fetcher as typeof fetch);
  const lobby = await reader.lobby(NOW);
  assert.deepEqual(lobby.cooking.map((a) => a.id), [2321, 2320], "2321 is not in the index yet; it ends first");
  assert.equal(lobby.cooking.find((a) => a.id === 2320)!.raised, 7n * NEAR, "the contract, not the lagging index");
  assert.equal(lobby.indexLagBlocks, 7_200);
  assert.ok(calls.some((u) => u.includes("near.drpc.org")), "falls back to the second RPC");
});

test("a contract panic reads as no auction rather than an outage", async () => {
  const fetcher = async () => Response.json({ result: { error: "wasm execution failed with error: No value found for the given key" } });
  const reader = new MemeCookingReader(fetcher as unknown as typeof fetch, ["https://rpc.example"]);
  assert.equal(await reader.finalizedMeme(5), null);
  assert.equal((await reader.outcome(5, NOW)).state, "flopped");
});

test("NEAR amounts, progress, time left and headings read plainly", () => {
  assert.equal(formatNear(398000000000000000000000n), "0.3");
  assert.equal(formatNear(1066n * NEAR + NEAR / 4n, 0), "1,066");
  assert.equal(memeUrl(7), "https://meme.cooking/meme/7");
  assert.equal(lineProgress("398000000000000000000000", (100n * NEAR).toString()), 0.3);
  assert.equal(lineProgress(((999n * NEAR) / 10n + 99n * (NEAR / 1000n)).toString(), (100n * NEAR).toString()), 99.9, "never rounds up to launched");
  assert.equal(lineProgress((200n * NEAR).toString(), (100n * NEAR).toString()), 100);
  const nowS = NOW / 1000;
  assert.equal(timeLeft(NOW + (2 * 3600 + 14 * 60) * 1000, nowS), "2h 14m left");
  assert.equal(timeLeft(NOW + 545_000, nowS), "9m 05s left");
  assert.equal(timeLeft(NOW - 1, nowS), "ended");
  assert.equal(daysAgo(NOW - 32 * 86_400_000, nowS), "32 days ago");
  assert.equal(daysAgo(NOW - 86_400_000, nowS), "yesterday");
  const launched = [{ id: 1, name: "", symbol: "", tokenId: "", poolId: 1, raised: "0", launchedAt: NOW - 32 * 86_400_000, url: "" }];
  assert.equal(launchesHeading(launched, nowS), "Latest launches");
  assert.equal(launchesHeading([{ ...launched[0], launchedAt: NOW - 86_400_000 }], nowS), "Just launched");
  assert.equal(indexLagHours(119_000), 33);
  assert.equal(indexLagHours(100), null);
});
