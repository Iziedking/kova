/**
 * DEVELOPMENT FIXTURE SERVICES. See `./data.ts`.
 *
 * Implements the same `KovaServices` contract as the real backend so every
 * screen state can be built and reviewed. Results carry `source: "fixture"`,
 * which the shell surfaces as a persistent "Sample data" banner.
 */
import type { KovaServices } from "@/services/contracts";
import { fail, ok, pending } from "@/types/service";
import type { MarketAsset, MarketList, MarketQuery } from "@/types/market";
import type { LeaderboardRow, LeaderboardScope } from "@/types/social";
import {
  FIXTURE_PLAYERS,
  allAssets,
  hotPlayers,
  memeAssets,
  playerByUsername,
  recentShowdowns,
  toProfile,
} from "./data";
import { fixturePredictionState, fixtureShowdown, fixtureTableDetail, fixtureTables } from "./competitions";
import {
  fixtureCandles,
  fixturePortfolio,
  fixtureBeginTrade,
  fixtureQuote,
  fixtureRecentTrades,
  fixtureTradeStatus,
  fixtureTradingState,
} from "./trading";

const fixtureQuotes = new Map<string, import("@/types/trading").TradeQuote>();
const wait = (ms = 120) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function applyQuery(assets: MarketAsset[], query: MarketQuery = {}): MarketAsset[] {
  let out = assets;
  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    out = out.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(needle) ||
        asset.name.toLowerCase().includes(needle) ||
        asset.mint.toLowerCase().includes(needle),
    );
  }
  if (query.category && query.category !== "all") out = out.filter((asset) => asset.category === query.category);
  if (query.tradableOnly) out = out.filter((asset) => asset.eligibility.trading);
  const sort = query.sort ?? "trending";
  const sorted = [...out];
  if (sort === "trending") sorted.sort((a, b) => (b.kovaActivityCount ?? 0) - (a.kovaActivityCount ?? 0));
  if (sort === "new") sorted.sort((a, b) => (a.ageSeconds ?? Infinity) - (b.ageSeconds ?? Infinity));
  if (sort === "volume") sorted.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
  if (sort === "movers") sorted.sort((a, b) => Math.abs(b.change24hPct ?? 0) - Math.abs(a.change24hPct ?? 0));
  if (sort === "liquidity") sorted.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
  return query.limit ? sorted.slice(0, query.limit) : sorted;
}

function list(assets: MarketAsset[]): MarketList {
  return { assets, freshness: { updatedAt: new Date().toISOString(), stale: false } };
}

function leaderboard(scope: LeaderboardScope): LeaderboardRow[] {
  const players = [...FIXTURE_PLAYERS];
  if (scope === "prediction") players.sort((a, b) => b.predictionWinRate - a.predictionWinRate);
  if (scope === "trading") players.sort((a, b) => b.avgTradingPnlPct - a.avgTradingPnlPct);
  return players.map((player, index) => ({
    rank: index + 1,
    username: player.username,
    avatarUrl: null,
    verified: player.verified,
    rating: player.rating,
    matches: player.matches,
    winRatePct: Math.round((player.wins / player.matches) * 100),
    modeStatPct: scope === "prediction" ? player.predictionWinRate : scope === "trading" ? player.avgTradingPnlPct : player.avgTradingPnlPct,
    modeStatLabel: scope === "prediction" ? "Pred. win rate" : "Avg PnL",
    streak: player.streak,
  }));
}

export const fixtureServices: KovaServices = {
  competitions: {
    async capabilities() {
      await wait();
      return ok(
        [
          { key: "tableDiscovery", label: "Table discovery", state: "preview_only" },
          { key: "ansemEscrow", label: "ANSEM escrow", state: "live" },
          { key: "settlement", label: "Settlement", state: "live" },
        ],
        "fixture",
      );
    },
    async listTables(query = {}) {
      await wait();
      let tables = fixtureTables();
      if (query.mode) tables = tables.filter((table) => table.mode === query.mode);
      if (query.status) tables = tables.filter((table) => table.status === query.status);
      return ok(query.limit ? tables.slice(0, query.limit) : tables, "fixture");
    },
    async getTable(tableId) {
      await wait();
      const detail = fixtureTableDetail(tableId);
      return detail ? ok(detail, "fixture") : fail({ code: "NOT_FOUND", message: "This table isn't available.", retryable: false });
    },
    async createTable() {
      await wait(400);
      return ok({ tableId: "fixture-table-open-duel" }, "fixture");
    },
    async joinTable(tableId) {
      await wait(300);
      return ok({ tableId }, "fixture");
    },
    async setReady(tableId) {
      await wait(200);
      return ok({ tableId }, "fixture");
    },
    async startMatch(tableId) {
      await wait(300);
      return ok({ tableId }, "fixture");
    },
    async sendChallenge() {
      await wait(400);
      return ok({ challengeId: "fixture-challenge" }, "fixture");
    },
    async createInvitation(tableId) {
      await wait(200);
      return ok({ token: `fixture-invite-${tableId}`, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, "fixture");
    },
    async claimInvitation() {
      await wait(200);
      return ok({ tableId: "fixture-table-open-duel" }, "fixture");
    },
    async showdown(tableId) {
      await wait();
      return ok(fixtureShowdown(tableId), "fixture");
    },
  },

  prediction: {
    async viewerState(tableId) {
      await wait();
      return ok(fixturePredictionState(tableId.includes("open") ? "picking" : "active"), "fixture");
    },
    async validatePick(_tableId, mint) {
      await wait(350);
      const asset = allAssets().find((candidate) => candidate.mint === mint || candidate.symbol.toLowerCase() === mint.toLowerCase());
      if (!asset) return fail({ code: "NOT_FOUND", message: "The Dealer doesn't recognise that contract address.", retryable: false });
      return ok({ asset, eligible: asset.eligibility.prediction, reason: asset.eligibility.reason ?? null }, "fixture");
    },
    async lockPick() {
      await wait(500);
      return ok(fixturePredictionState("locked"), "fixture");
    },
  },

  markets: {
    async list(query) {
      await wait();
      return ok(list(applyQuery(allAssets(), query)), "fixture");
    },
    async memeStocks(query) {
      await wait(200);
      return ok(list(applyQuery(memeAssets(), query)), "fixture");
    },
    async getByMint(mint) {
      await wait();
      const asset = [...allAssets(), ...memeAssets()].find((candidate) => candidate.mint === mint);
      return asset ? ok(asset, "fixture") : fail({ code: "NOT_FOUND", message: "That market isn't available.", retryable: false });
    },
    async candles(mint, timeframe) {
      await wait(150);
      const asset = [...allAssets(), ...memeAssets()].find((candidate) => candidate.mint === mint);
      if (!asset?.priceUsd) return fail({ code: "NOT_FOUND", message: "No price history for this market.", retryable: false });
      return ok(fixtureCandles(mint, timeframe, asset.priceUsd), "fixture");
    },
    async recentTrades(mint) {
      await wait(150);
      const asset = allAssets().find((candidate) => candidate.mint === mint);
      return ok(fixtureRecentTrades(asset?.priceUsd ?? 1), "fixture");
    },
  },

  social: {
    async hotPlayers() {
      await wait();
      return ok(hotPlayers(), "fixture");
    },
    async recentShowdowns() {
      await wait();
      return ok(recentShowdowns(), "fixture");
    },
    async leaderboard(scope) {
      await wait();
      return ok(leaderboard(scope), "fixture");
    },
    async profile(username) {
      await wait();
      const player = playerByUsername(username);
      return player ? ok(toProfile(player), "fixture") : fail({ code: "NOT_FOUND", message: "We couldn't find that player.", retryable: false });
    },
    async history(username) {
      await wait();
      const player = playerByUsername(username);
      if (!player) return ok([], "fixture");
      const now = Date.now();
      return ok(
        recentShowdowns(now)
          .filter((showdown) => showdown.winner === player.username || showdown.loser === player.username)
          .map((showdown) => ({
            id: showdown.id,
            tableId: "fixture-table-meme-majors",
            tableName: showdown.tableName,
            mode: showdown.mode,
            opponents: [showdown.winner === player.username ? showdown.loser : showdown.winner],
            result: showdown.winner === player.username ? ("won" as const) : ("lost" as const),
            returnPct: showdown.winner === player.username ? player.avgTradingPnlPct : -Math.abs(player.avgTradingPnlPct) / 2,
            payoutAnsemRaw: showdown.winner === player.username ? showdown.payoutAnsemRaw : null,
            settledAt: showdown.settledAt,
          })),
        "fixture",
      );
    },
  },

  trading: {
    async matchState(tableId) {
      await wait();
      return ok(fixtureTradingState(tableId), "fixture");
    },
    async quote(order) {
      await wait(250);
      const asset = allAssets().find((candidate) => candidate.mint === order.assetMint);
      if (!asset?.priceUsd) return pending("trading.quotes");
      const quote = fixtureQuote(order, asset.priceUsd);
      fixtureQuotes.set(quote.quoteId, quote);
      return ok(quote, "fixture");
    },
    async execute(quoteId, ctx) {
      void ctx;
      await wait(400);
      const quote = fixtureQuotes.get(quoteId);
      if (!quote) return fail({ code: "NOT_FOUND", message: "That quote expired. Get a fresh quote and try again.", retryable: false });
      // Fixture only: a sample lifecycle that never carries a transaction signature.
      return ok(fixtureBeginTrade(quote, quote.assetMint), "fixture");
    },
    async status(tradeId) {
      await wait(150);
      const trade = fixtureTradeStatus(tradeId);
      return trade ? ok(trade, "fixture") : fail({ code: "NOT_FOUND", message: "Trade not found.", retryable: false });
    },
  },

  portfolio: {
    async summary() {
      await wait();
      return ok(fixturePortfolio(), "fixture");
    },
  },

  profile: {
    async usernameAvailability(username) {
      await wait(250);
      const taken = FIXTURE_PLAYERS.some((player) => player.username.toLowerCase() === username.toLowerCase());
      return ok({ available: !taken }, "fixture");
    },
    async saveIdentity(identity) {
      await wait(300);
      return ok(identity, "fixture");
    },
    async loadIdentity() {
      await wait(100);
      return ok(null, "fixture");
    },
  },

  notifications: {
    async list() {
      await wait();
      const now = Date.now();
      return ok(
        [
          { id: "n1", kind: "challenge_received", title: "Challenge from @traderanon", body: "Trade - 50 ANSEM - 15 min", at: new Date(now - 4 * 60_000).toISOString(), read: false, href: "/profile/traderanon" },
          { id: "n2", kind: "match_starting", title: "Meme Majors starts soon", body: "Your seat is ready.", at: new Date(now - 22 * 60_000).toISOString(), read: false, href: "/tables/fixture-table-meme-majors" },
          { id: "n3", kind: "payout_confirmed", title: "Payout confirmed", body: "+200 ANSEM added to your wallet.", at: new Date(now - 3 * 3600_000).toISOString(), read: true, href: "/portfolio" },
        ],
        "fixture",
      );
    },
  },
};
