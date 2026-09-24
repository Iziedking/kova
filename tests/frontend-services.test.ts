import test from "node:test";
import assert from "node:assert/strict";
import { PublicTableSchema } from "../src/domain/game/api-contracts";
import { listGameTableFixtures, getGameCapabilities } from "../src/backend/game/fixtures";
import { potRaw, toCapabilityStates, toTableDetail, toTableSummary, mapTableStatus } from "../src/services/adapters/game-table";
import { apiServices } from "../src/services/api/services";
import { fixtureServices } from "../src/features/fixtures/services";
import { tableCta } from "../src/components/play/table-cta";
import { dataSourceMode } from "../src/services";
import { previewViewerEnabled } from "../src/auth/preview";
import { suggestUsername, validateUsername } from "../src/features/auth/identity-store";
import type { PublicTableSummary } from "../src/types/competition";

test("the backend PublicTable maps to a table summary without inventing anything", () => {
  const [backend] = listGameTableFixtures();
  const summary = toTableSummary(backend);
  assert.equal(summary.id, backend.id);
  assert.equal(summary.mode, "prediction", "the backend only has a prediction game");
  assert.equal(summary.status, "open");
  assert.equal(summary.stakeAnsemRaw, backend.rules.stakeRaw);
  assert.equal(summary.maxPlayers, backend.seats);
  assert.equal(summary.filledSeats, backend.fundedPlayers);
  assert.deepEqual(summary.players, [], "the backend supplies no player identities yet");
  assert.equal(summary.marketLabel, null, "no market label may be invented");
});

test("the pot is the stake times funded players, in exact raw units", () => {
  assert.equal(potRaw("50000000", 2), "100000000");
  assert.equal(potRaw("18446744073709551615", 3), "55340232221128654845");
  assert.equal(potRaw("0", 4), "0");
  assert.equal(potRaw("1.5", 2), null);
  assert.equal(potRaw("-1", 2), null);
});

test("every backend table status maps to a frontend status", () => {
  const expected = {
    DRAFT: "waiting",
    OPEN: "open",
    LOCKING: "waiting",
    ACTIVE: "active",
    SETTLING: "settling",
    SETTLED: "settled",
    CANCELLED: "cancelled",
    VOIDED: "cancelled",
  } as const;
  for (const status of PublicTableSchema.shape.status.options) {
    assert.equal(mapTableStatus(status), expected[status]);
  }
});

test("table detail exposes seats and nothing the backend has not provided", () => {
  const [backend] = listGameTableFixtures();
  const detail = toTableDetail({ ...backend, fundedPlayers: 2 }, "2026-09-19T12:00:00.000Z");
  assert.equal(detail.seats.length, backend.seats);
  assert.equal(detail.seats.filter((seat) => seat.readiness === "funded").length, 2);
  assert.ok(detail.seats.every((seat) => seat.player === null));
  assert.equal(detail.standings, null);
  assert.deepEqual(detail.dealer, []);
  assert.equal(detail.viewerState, "none");
  assert.equal(detail.dealerStatus, "degraded");
  const serialized = JSON.stringify(detail);
  assert.ok(!/mint|commitment|pick/i.test(serialized.replace(/stakeMint/g, "")), "a public table carries no pick material");
});

test("capabilities map every backend capability with an honest state", () => {
  const states = toCapabilityStates(getGameCapabilities());
  assert.equal(states.length, 8);
  assert.equal(states.find((entry) => entry.key === "ansemEscrow")?.state, "local_validator_only");
  assert.equal(states.find((entry) => entry.key === "dealerAdmission")?.state, "blocked");
});

test("the real service reports pending, not success, for everything the backend lacks", async () => {
  const pendingCalls = await Promise.all([
    apiServices.trading.matchState("t"),
    apiServices.trading.quote({ tableId: "t", assetMint: "m", symbol: "X", side: "buy", inputUsd: 10 }),
    apiServices.trading.execute("q"),
    apiServices.markets.list(),
    apiServices.markets.memeStocks(),
    apiServices.markets.candles("m", "1h"),
    apiServices.social.leaderboard("overall"),
    apiServices.social.hotPlayers(),
    apiServices.portfolio.summary("1D"),
    apiServices.prediction.lockPick("t", "m"),
    apiServices.prediction.validatePick("t", "m"),
    apiServices.competitions.joinTable("t"),
    apiServices.competitions.sendChallenge({ opponentUsername: "a", mode: "trading", stakeAnsem: 1, durationSeconds: 900, marketRule: "any" }),
    apiServices.competitions.showdown("t"),
    apiServices.notifications.list(),
  ]);
  for (const result of pendingCalls) {
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "PENDING_INTEGRATION");
      assert.ok(result.error.capability, "a pending result names the missing capability");
    }
  }
});

test("trade execution is never faked by the real service", async () => {
  const result = await apiServices.trading.execute("any-quote");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.message, /Nothing was sent/);
});

test("creating a Trading table is pending, and a trading list is honestly empty", async () => {
  const created = await apiServices.competitions.createTable({
    mode: "trading",
    visibility: "public",
    stakeAnsem: 10,
    durationSeconds: 900,
    playerCount: 2,
    marketRule: "any",
  });
  assert.equal(created.ok, false);
  const tables = await apiServices.competitions.listTables({ mode: "trading" });
  // Without a reachable backend this is a network/unavailable error; it must never be fixture data.
  if (tables.ok) assert.deepEqual(tables.data, []);
});

test("creating a table without a session is refused before any request", async () => {
  const result = await apiServices.competitions.createTable(
    { mode: "prediction", visibility: "public", stakeAnsem: 10, durationSeconds: 900, playerCount: 2, marketRule: "any" },
    { getAccessToken: async () => null },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTH_REQUIRED");
});

test("an unreachable game service is reported as unavailable and retryable", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response("<html>not found</html>", { status: 404 })) as typeof fetch;
  try {
    const result = await apiServices.competitions.listTables();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "UNAVAILABLE");
      assert.equal(result.error.retryable, true);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("a malformed backend response is refused rather than rendered", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, tables: [{ id: "not-a-uuid" }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const result = await apiServices.competitions.listTables();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "INVALID_RESPONSE");
  } finally {
    globalThis.fetch = original;
  }
});

test("a valid backend response maps end to end", async () => {
  const [backend] = listGameTableFixtures();
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, source: "postgres", tables: [backend] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const result = await apiServices.competitions.listTables();
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.source, "api");
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].id, backend.id);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("fixture services mark their results as fixtures and never carry a transaction signature", async () => {
  const tables = await fixtureServices.competitions.listTables();
  assert.ok(tables.ok && tables.source === "fixture");

  const quote = await fixtureServices.trading.quote({ tableId: "t", assetMint: "fixture-gme", symbol: "GME", side: "buy", inputUsd: 100 });
  assert.ok(quote.ok && quote.source === "fixture");
  if (!quote.ok) return;
  const started = await fixtureServices.trading.execute(quote.data.quoteId);
  assert.ok(started.ok);
  if (!started.ok) return;
  assert.equal(started.data.txSignature ?? null, null);
  assert.equal(started.data.status, "awaiting_wallet", "a sample trade starts at the wallet stage, not confirmed");
});

test("fixture ids can never be mistaken for a real mint or table", async () => {
  const markets = await fixtureServices.markets.list();
  assert.ok(markets.ok);
  if (markets.ok) for (const asset of markets.data.assets) assert.match(asset.mint, /^fixture-/);
  for (const table of (await fixtureServices.competitions.listTables()).ok ? ((await fixtureServices.competitions.listTables()) as { ok: true; data: PublicTableSummary[] }).data : []) {
    assert.match(table.id, /^fixture-/);
  }
});

test("standings are ranked by net PnL percent, not dollars", async () => {
  const detail = await fixtureServices.competitions.getTable("fixture-table-degens-only");
  assert.ok(detail.ok);
  if (!detail.ok || !detail.data.standings) return assert.fail("trading fixture must have standings");
  const pcts = detail.data.standings.map((row) => row.netPnlPct ?? -Infinity);
  assert.deepEqual([...pcts].sort((a, b) => b - a), pcts);
  assert.deepEqual(detail.data.standings.map((row) => row.rank), pcts.map((_, index) => index + 1));
});

test("table call to action follows the blueprint: Open joins, Live watches, own table returns", () => {
  const base: PublicTableSummary = {
    id: "t",
    name: "T",
    mode: "prediction",
    status: "open",
    visibility: "public",
    stakeAnsemRaw: "1000000",
    potAnsemRaw: "0",
    durationSeconds: 900,
    startsAt: null,
    endsAt: null,
    opensUntil: null,
    players: [],
    filledSeats: 1,
    maxPlayers: 4,
    marketLabel: null,
    tagline: null,
  };
  assert.deepEqual(tableCta(base), { label: "Join Table", kind: "join" });
  assert.equal(tableCta({ ...base, filledSeats: 4 }).kind, "watch", "a full open table can only be watched");
  assert.equal(tableCta({ ...base, status: "active" }).kind, "watch");
  assert.equal(tableCta({ ...base, status: "active" }, "joined").kind, "return");
  assert.equal(tableCta({ ...base, status: "settled" }).kind, "result");
  assert.equal(tableCta({ ...base, status: "cancelled" }).kind, "none");
});

test("fixtures are the default under next dev only, and the preview viewer needs both flags", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { source: env.NEXT_PUBLIC_KOVA_DATA_SOURCE, node: env.NODE_ENV, viewer: env.NEXT_PUBLIC_KOVA_PREVIEW_VIEWER };
  try {
    delete env.NEXT_PUBLIC_KOVA_DATA_SOURCE;
    env.NODE_ENV = "production";
    assert.equal(dataSourceMode(), "api", "a production build never defaults to fixtures");
    env.NODE_ENV = "development";
    assert.equal(dataSourceMode(), "fixtures");
    env.NEXT_PUBLIC_KOVA_DATA_SOURCE = "api";
    assert.equal(dataSourceMode(), "api");
  } finally {
    env.NEXT_PUBLIC_KOVA_DATA_SOURCE = saved.source;
    env.NODE_ENV = saved.node;
    env.NEXT_PUBLIC_KOVA_PREVIEW_VIEWER = saved.viewer;
  }
  assert.equal(previewViewerEnabled({}), false);
  assert.equal(previewViewerEnabled({ NEXT_PUBLIC_KOVA_PREVIEW_VIEWER: "1" }), false, "the preview viewer alone is not enough");
  assert.equal(previewViewerEnabled({ NEXT_PUBLIC_KOVA_DATA_SOURCE: "fixtures" }), false);
  assert.equal(previewViewerEnabled({ NEXT_PUBLIC_KOVA_DATA_SOURCE: "api", NEXT_PUBLIC_KOVA_PREVIEW_VIEWER: "1" }), false);
  assert.equal(previewViewerEnabled({ NEXT_PUBLIC_KOVA_DATA_SOURCE: "fixtures", NEXT_PUBLIC_KOVA_PREVIEW_VIEWER: "1" }), true);
});

test("usernames: format rules and suggestions", () => {
  assert.equal(validateUsername("beni_123"), null);
  assert.match(validateUsername("ab") ?? "", /at least 3/);
  assert.match(validateUsername("a".repeat(21)) ?? "", /20/);
  assert.match(validateUsername("has space") ?? "", /Letters, numbers/);
  assert.match(validateUsername("   ") ?? "", /Choose/);
  assert.equal(suggestUsername("beni@example.com"), "beni");
  assert.equal(suggestUsername("we!rd.name"), "werdname");
  assert.equal(suggestUsername("x"), "");
  assert.equal(suggestUsername(null), "");
});
