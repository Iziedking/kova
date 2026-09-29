import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { apiServices } from "../src/services/api/services";
import { claim, proveWallet } from "../src/services/api/game-play";
import { ProfileLink } from "../src/components/social/profile-link";
import { listGameTableFixtures } from "../src/backend/game/fixtures";
import { toTableDetail } from "../src/services/adapters/game-table";
import type { GameWallet } from "../src/types/service";

const identity = { username: "canonical", displayName: "A display name", avatarUrl: null, avatarSeed: null, xHandle: null, verified: false, hasProfile: true };
const stats = { matches: 100, wins: 70, winRatePct: 70, predictionWinRate: 70, tradingWinRate: 70, avgPredictionReturnPct: 2, avgTradingPnlPct: 3, bestTradingPnlPct: 20, avgReturnPct: 2.5, streak: 3, netRaw: "4000000", tradingMatches: 60, predictionMatches: 40, totalPayoutRaw: "140000000", bestReturnPct: 25 };
const asset = { mint: "held", symbol: "HELD", name: "Held token", imageUrl: null, priceUsd: null, change24hPct: null, volume24hUsd: null, liquidityUsd: null, marketCapUsd: null, launchedAt: null, narrative: null, tags: [] };
const signedIn = { accountId: "player", getAccessToken: async () => "test-access-token" };

async function mockFetch<T>(fetcher: typeof fetch, run: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try { return await run(); } finally { globalThis.fetch = original; }
}

function browser() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://kova.example" } } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key),
  } });
  return { data, restore: () => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage); else Reflect.deleteProperty(globalThis, "sessionStorage");
  } };
}

test("signed-in portfolio sends the current bearer token and wallet and preserves unavailable balances", async () => {
  await mockFetch(async (url, options) => {
    assert.equal(String(url), "/api/game/portfolio?wallet=wallet-a");
    assert.equal(new Headers(options?.headers).get("authorization"), "Bearer test-access-token");
    return Response.json({ ok: true, portfolio: { network: "solana-devnet", wallet: "wallet-a", solLamports: null, ansemRaw: null, inPlayRaw: "1000000", netWonRaw: "2000000", matches: 2, wins: 1, allocations: [], activity: [{ id: "result", kind: "result", title: "Awarded", detail: "table", at: "2026-09-29T00:00:00.000Z", txSignature: null }] } });
  }, async () => {
    const wallet: GameWallet = { address: "wallet-a", signMessage: async () => "", signAndSend: async () => "" };
    const result = await apiServices.portfolio.summary("1D", { ...signedIn, wallet });
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.data.ansem?.balance, null);
      assert.equal(result.data.ansem?.inPlay, 1);
      assert.equal(result.data.activity?.[0]?.kind, "result");
    }
  });
});

test("trading account requests carry auth and omit all ranks until every funded account can be marked", async () => {
  await mockFetch(async (_url, options) => {
    assert.equal(new Headers(options?.headers).get("authorization"), "Bearer test-access-token");
    return Response.json({ ok: true, tableId: "table", simulated: true, feeBps: 30, live: true, endsAt: null,
      account: { status: "active", cashMicroUsd: "9000000000", startingCashMicroUsd: "10000000000", equityMicroUsd: null, pnlBps: null, positions: [{ mint: "held", symbol: "HELD", quantityRaw: "1000000000", costBasisMicroUsd: "1000000000", price18: null, valueMicroUsd: null }] },
      fills: [], standings: [{ wallet: "known", equityMicroUsd: "10000000000", pnlBps: "0", isViewer: false }, { wallet: "unknown", equityMicroUsd: null, pnlBps: null, isViewer: true }],
      eligibleMints: ["held"], eligibleAssets: [asset],
    });
  }, async () => {
    const result = await apiServices.trading.matchState("table", signedIn);
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.data.totalPnlPct, null);
      assert.equal(result.data.positions[0]?.currentValueUsd, null);
      assert.deepEqual(result.data.standings?.map((row) => row.rank), [0, 0]);
      assert.equal(result.data.eligibleAssets?.[0]?.mint, "held");
    }
  });
});

test("profile totals use all-time aggregates independently of the capped history list", async () => {
  await mockFetch(async () => Response.json({ ok: true, profile: { id: "id", identity, joinedAt: "2026-01-01T00:00:00.000Z", stats, history: [] } }), async () => {
    const result = await apiServices.social.profile("canonical", signedIn);
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.data.stats.tradingMatches, 60);
      assert.equal(result.data.stats.predictionMatches, 40);
      assert.equal(result.data.stats.totalPayoutAnsemRaw, "140000000");
      assert.equal(result.data.stats.bestReturnPct, 25);
    }
  });
});

test("a fallback player identity renders text without a broken profile link", () => {
  const fallback = { username: "wallet…label", hasProfile: false, children: "Player" };
  const html = renderToStaticMarkup(createElement(ProfileLink, fallback));
  assert.doesNotMatch(html, /href=|<a[ >]/);
  assert.match(html, /Player/);
  const canonical = { username: "canonical", hasProfile: true, children: "Player" };
  const real = renderToStaticMarkup(createElement(ProfileLink, canonical));
  assert.match(real, /href="\/profile\/canonical"/);
});

test("table rosters and activity map backend identities and readiness without fabricating occupied empty seats", () => {
  const [table] = listGameTableFixtures();
  const detail = toTableDetail({ ...table, fundedPlayers: 1,
    roster: [{ seat: 1, player: { username: "canonical", avatarUrl: null, hasProfile: true }, readiness: "funded", isViewer: true }],
    activity: [{ id: "1", at: "2026-09-29T00:00:00.000Z", kind: "status", text: "The round is live." }],
  }, "2026-09-29T00:00:00.000Z");
  assert.equal(detail.seats[0]?.player?.username, "canonical");
  assert.equal(detail.seats[0]?.isViewer, true);
  assert.equal(detail.seats[1]?.readiness, "empty");
  assert.equal(detail.activity[0]?.text, "The round is live.");
});

test("wallet proof cache is scoped to the account and never bypasses a missing session", async () => {
  const state = browser();
  let signatures = 0;
  const wallet: GameWallet = { address: "proof-wallet", signMessage: async () => { signatures += 1; return "fake"; }, signAndSend: async () => { throw new Error("no transactions"); } };
  try {
    await mockFetch(async (url) => String(url).endsWith("/challenges") ? Response.json({ ok: true, challenge: { id: "id", message: "message" } }) : Response.json({ ok: true, wallet: wallet.address }), async () => {
      assert.ok((await proveWallet({ ...signedIn, accountId: "account-a", wallet })).ok);
      assert.ok((await proveWallet({ ...signedIn, accountId: "account-a", wallet })).ok);
      assert.ok((await proveWallet({ ...signedIn, accountId: "account-b", wallet })).ok);
      assert.equal(signatures, 2);
      const guest = await proveWallet({ accountId: "account-a", wallet, getAccessToken: async () => null });
      assert.ok(!guest.ok && guest.error.code === "AUTH_REQUIRED");
    });
  } finally { state.restore(); }
});

test("a submitted claim resumes status instead of sending another transaction, and reports server-confirmed amount", async () => {
  const state = browser();
  const signature = "1".repeat(88);
  let sends = 0;
  let attempts = 0;
  const wallet: GameWallet = { address: "claim-wallet", signMessage: async () => "", signAndSend: async () => { sends += 1; return signature; } };
  try {
    await mockFetch(async (url) => {
      if (!String(url).includes("/claim/status")) return Response.json({ ok: true, kind: "payout", amountRaw: "9999999", transactionBase64: "fake", wallet: wallet.address, lastValidBlockHeight: 100 });
      attempts += 1;
      return attempts === 1 ? Response.json({ message: "Session expired" }, { status: 401 }) : Response.json({ ok: true, status: "paid", kind: "payout", amountRaw: "2000000", transactionStatus: null });
    }, async () => {
      const ctx = { ...signedIn, accountId: "claim-account", wallet };
      const first = await claim("claim-table", ctx);
      assert.ok(!first.ok && first.error.code === "AUTH_REQUIRED");
      const second = await claim("claim-table", ctx);
      assert.ok(second.ok);
      if (second.ok) assert.equal(second.data.amountRaw, "2000000");
      assert.equal(sends, 1);
      assert.equal(state.data.size, 0);
    });
  } finally { state.restore(); }
});


test("fixture wallets satisfy the action gate but refuse every real signing call", async () => {
  const { fixtureGameWallet } = await import("../src/features/fixtures/wallet");
  const wallet = fixtureGameWallet("FixtureWallet1111111111111111111111111111111");
  assert.match(wallet.address, /^FixtureWallet/);
  await assert.rejects(() => wallet.signMessage("proof"), /fixture wallet cannot sign/);
  await assert.rejects(() => wallet.signAndSend("transaction"), /fixture wallet cannot sign/);
});
