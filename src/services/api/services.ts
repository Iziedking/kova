/**
 * The real (non-fixture) service implementation.
 *
 * Connected today: table discovery, table detail, capabilities, table draft
 * creation and invitations - the routes in `docs/game-api.md` - and the market
 * list and asset lookups (ClawPump token feed with DEX Screener 24h change).
 *
 * Everything else returns `PENDING_INTEGRATION` naming the missing backend
 * capability. Do not replace those with placeholder data: when the backend
 * lands, implement the method here and the screen needs no change.
 */
import { z } from "zod";
import { GameCapabilitiesSchema, PublicTableSchema, TableViewerSchema } from "@/domain/game/api-contracts";
import { toCapabilityStates, toTableDetail, toTableSummary } from "@/services/adapters/game-table";
import type { KovaServices, TableQuery } from "@/services/contracts";
import { apiRequest } from "@/services/api/http";
import { checkPick, claim, claimTestTokens, enterTradingAndStake, lockAndStake, proveWallet } from "@/services/api/game-play";
import { tradingExecute, tradingMatchState, tradingQuote, tradingStatus } from "@/services/api/trading";
import { fail, ok, pending, type ServiceContext, type ServiceResult } from "@/types/service";
import type { CreateTableInput, PredictionViewerState, ShowdownResult } from "@/types/competition";
import { ANSEM_DECIMALS } from "@/lib/format";
import type { MarketAsset, MarketList, MarketQuery } from "@/types/market";

const TablesResponse = z.object({ ok: z.literal(true), tables: z.array(PublicTableSchema) });
const TableResponse = z.object({ ok: z.literal(true), serverTime: z.string(), table: PublicTableSchema, viewer: TableViewerSchema.nullable().optional() });
const ResultResponse = z.object({
  ok: z.literal(true),
  table: PublicTableSchema,
  settledAt: z.string(),
  viewerWallet: z.string().nullable(),
  results: z.array(z.object({
    wallet: z.string(), mint: z.string().optional(), scoreBps: z.string(), awardRaw: z.string(),
    startPrice18: z.string().optional(), endPrice18: z.string().optional(),
    symbol: z.string().nullable(), name: z.string().nullable(),
  })),
});

/**
 * Tables the viewer took a seat at in this browser tab, before their pick is committed.
 * The backend has no seat until a pick is submitted, so this survives reloads in sessionStorage.
 */
const SEATED_KEY = "kova:seated-tables";
const seatedTables = {
  read(): string[] {
    try {
      const parsed: unknown = JSON.parse(globalThis.sessionStorage?.getItem(SEATED_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  },
  has(tableId: string): boolean {
    return this.read().includes(tableId);
  },
  add(tableId: string): void {
    try {
      globalThis.sessionStorage?.setItem(SEATED_KEY, JSON.stringify([...new Set([...this.read(), tableId])].slice(-20)));
    } catch {
      // Storage blocked: the seat still shows until the page reloads.
    }
    memorySeats.add(tableId);
  },
};
const memorySeats = new Set<string>();

function price18ToUsd(value: string | undefined): number {
  if (!value) return 0;
  return Number(BigInt(value)) / 1e18;
}

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

async function viewerState(tableId: string, ctx: ServiceContext | undefined): Promise<ServiceResult<PredictionViewerState>> {
  const result = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}`, TableResponse, ctx, { auth: true });
  if (!result.ok) return result;
  const participant = result.data.viewer?.participant ?? null;
  const status = result.data.table.status;
  const phase: PredictionViewerState["phase"] = status === "SETTLED" ? "revealed" : status === "ACTIVE" ? "active" : status === "SETTLING" ? "settling" : participant?.fundingStatus === "funded" ? "locked" : "picking";
  const admission: PredictionViewerState["admission"] = participant === null ? null
    : participant.admissionDecision === "ACCEPTED" ? "accepted"
    : participant.admissionDecision === "REJECTED" ? "rejected" : "insufficient_evidence";
  return ok({
    phase,
    hasLockedPick: participant?.fundingStatus === "funded",
    admission,
    commitmentShort: participant ? `${participant.commitment.slice(0, 6)}…${participant.commitment.slice(-4)}` : null,
  }, "api");
}
const CreatedResponse = z.object({ ok: z.literal(true), table: z.object({ id: z.string() }).passthrough() });
const ClaimResponse = z.object({ ok: z.literal(true), tableId: z.string() });
const InvitationResponse = z.object({
  ok: z.literal(true),
  invitation: z.object({ token: z.string(), expiresAt: z.string() }),
});

const FeedAssetSchema = z.object({
  mint: z.string(),
  symbol: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  priceUsd: z.number().nullable(),
  change24hPct: z.number().nullable(),
  volume24hUsd: z.number().nullable(),
  liquidityUsd: z.number().nullable(),
  marketCapUsd: z.number().nullable(),
  launchedAt: z.string().nullable(),
  narrative: z.string().nullable(),
  tags: z.array(z.string()),
  underlyingTicker: z.string().nullable().optional(),
});
const MarketListResponse = z.object({ ok: z.literal(true), assets: z.array(FeedAssetSchema), updatedAt: z.string() });
const MarketAssetResponse = z.object({ ok: z.literal(true), asset: FeedAssetSchema });

/** ClawPump feed row -> the UI's market shape. A pick needs a priced pair; Trading Mode isn't live. */
function toMarketAsset(asset: z.infer<typeof FeedAssetSchema>, now: number): MarketAsset {
  const launched = asset.launchedAt ? Date.parse(asset.launchedAt) : Number.NaN;
  // pump.fun bonding-curve tokens have a live price but no pool liquidity; the price is what a pick needs.
  const priced = asset.priceUsd !== null && asset.priceUsd > 0;
  return {
    ...asset,
    ageSeconds: Number.isFinite(launched) ? Math.max(0, Math.floor((now - launched) / 1000)) : null,
    source: "clawpump / pump.fun",
    underlyingTicker: asset.underlyingTicker ?? null,
    category: asset.underlyingTicker ? "meme-stock" : asset.tags.some((tag) => tag === "agent" || tag.startsWith("ai")) ? "ai" : "other",
    kovaActivityCount: null,
    eligibility: {
      prediction: priced,
      trading: false,
      reason: priced ? null : "No live price yet.",
    },
  };
}

async function marketList(query: MarketQuery | undefined, ctx: ServiceContext | undefined, stocksOnly = false): Promise<ServiceResult<MarketList>> {
  const params = new URLSearchParams({ sort: query?.sort ?? "trending", limit: String(query?.limit ?? 30) });
  // The server assembles the stock-themed list itself; filtering one page of the general feed would miss most of it.
  if (stocksOnly || query?.category === "meme-stock") params.set("category", "meme-stock");
  if (query?.search?.trim()) params.set("q", query.search.trim());
  const result = await apiRequest(`/api/game/markets?${params}`, MarketListResponse, ctx);
  if (!result.ok) return result;
  const now = Date.now();
  let assets = result.data.assets.map((asset) => toMarketAsset(asset, now));
  if (query?.category && query.category !== "all") assets = assets.filter((asset) => asset.category === query.category);
  if (query?.tradableOnly) assets = assets.filter((asset) => asset.eligibility.prediction);
  return ok({ assets, freshness: { updatedAt: result.data.updatedAt, stale: now - Date.parse(result.data.updatedAt) > 120_000 } }, "api");
}

function stakeToRaw(stakeAnsem: number): string {
  return (BigInt(Math.round(stakeAnsem)) * 10n ** BigInt(ANSEM_DECIMALS)).toString();
}

export const apiServices: KovaServices = {
  competitions: {
    async capabilities(ctx) {
      const result = await apiRequest("/api/game/capabilities", GameCapabilitiesSchema, ctx);
      return result.ok ? ok(toCapabilityStates(result.data), "api") : result;
    },

    async listTables(query: TableQuery = {}, ctx?: ServiceContext) {
      const result = await apiRequest("/api/game/tables", TablesResponse, ctx);
      if (!result.ok) return result;
      let tables = result.data.tables.map(toTableSummary);
      if (query.mode) tables = tables.filter((table) => table.mode === query.mode);
      if (query.status) tables = tables.filter((table) => table.status === query.status);
      if (query.limit) tables = tables.slice(0, query.limit);
      return ok(tables, "api");
    },

    async getTable(tableId, ctx) {
      // Signed-in viewers read the table with their token so the backend can say whether they host or hold a seat.
      const token = (await ctx?.getAccessToken?.()) ?? null;
      const result = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}`, TableResponse, ctx, { auth: token !== null });
      return result.ok ? ok(toTableDetail(result.data.table, result.data.serverTime, result.data.viewer ?? null, memorySeats.has(tableId) || seatedTables.has(tableId)), "api") : result;
    },

    async createTable(input: CreateTableInput, ctx) {
      const result = await apiRequest("/api/game/tables", CreatedResponse, ctx, {
        method: "POST",
        auth: true,
        body: {
          name: input.name?.trim() || (input.mode === "trading" ? "Trading table" : "Prediction table"),
          mode: input.mode,
          visibility: input.visibility,
          playerCount: input.playerCount,
          stakeRaw: stakeToRaw(input.stakeAnsem),
          roundDurationSeconds: input.durationSeconds,
        },
      });
      return result.ok ? ok({ tableId: result.data.table.id }, "api") : result;
    },

    async joinTable(tableId, ctx) {
      // Taking a seat proves the wallet; the stake moves only when the pick is locked.
      const proven = await proveWallet(ctx);
      if (!proven.ok) return proven;
      seatedTables.add(tableId);
      return ok({ tableId }, "api");
    },
    async setReady(tableId, ctx) {
      // Trade tables: staking is what makes you ready. Predict tables stake when the pick is locked.
      const staked = await enterTradingAndStake(tableId, ctx);
      if (!staked.ok) return staked;
      memorySeats.add(tableId);
      return ok({ tableId }, "api");
    },
    async startMatch() {
      return fail({ code: "HTTP", retryable: false, message: "The match starts on its own as soon as every seat is funded." });
    },
    async sendChallenge() {
      return pending("social.challenges", "Direct challenges aren't connected yet.");
    },

    async createInvitation(tableId, ctx) {
      const result = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}/invitations`, InvitationResponse, ctx, {
        method: "POST",
        auth: true,
      });
      return result.ok ? ok(result.data.invitation, "api") : result;
    },

    async claimInvitation(token, ctx) {
      const result = await apiRequest("/api/game/invitations/claim", ClaimResponse, ctx, { method: "POST", auth: true, body: { token } });
      return result.ok ? ok({ tableId: result.data.tableId }, "api") : result;
    },

    async showdown(tableId, ctx): Promise<ServiceResult<ShowdownResult>> {
      const token = (await ctx?.getAccessToken?.()) ?? null;
      const result = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}/result`, ResultResponse, ctx, { auth: token !== null });
      if (!result.ok) return result;
      const { table, results, viewerWallet, settledAt } = result.data;
      const ranked = [...results].sort((left, right) => Number(BigInt(right.scoreBps) - BigInt(left.scoreBps)));
      const best = ranked[0]?.scoreBps ?? "0";
      const potRaw = ranked.reduce((sum, row) => sum + BigInt(row.awardRaw), 0n).toString();
      const standings = ranked.map((row, index) => ({
        rank: ranked.findIndex((other) => other.scoreBps === row.scoreBps) + 1 || index + 1,
        username: shortWallet(row.wallet),
        avatarUrl: null,
        netPnlPct: Number(row.scoreBps) / 100,
        isViewer: row.wallet === viewerWallet,
        payoutAnsemRaw: row.awardRaw,
      }));
      const viewerRow = standings.find((row) => row.isViewer) ?? null;
      const trading = table.rules.gameMode === "trading";
      return ok({
        tableId,
        tableName: table.name,
        mode: trading ? "trading" : "prediction",
        standings,
        // Trade mode has no hidden pick to reveal; the standings are the portfolio returns.
        reveals: trading ? null : ranked.map((row) => ({
          username: shortWallet(row.wallet),
          avatarUrl: null,
          symbol: row.symbol ?? shortWallet(row.mint ?? ""),
          name: row.name ?? row.mint ?? "",
          startPriceUsd: price18ToUsd(row.startPrice18),
          endPriceUsd: price18ToUsd(row.endPrice18),
          returnPct: Number(row.scoreBps) / 100,
          isWinner: row.scoreBps === best,
          isViewer: row.wallet === viewerWallet,
        })),
        viewerRank: viewerRow?.rank ?? null,
        totalPlayers: ranked.length,
        potAnsemRaw: potRaw,
        viewerPayoutAnsemRaw: viewerRow?.payoutAnsemRaw ?? null,
        settledAt,
        payoutStatus: viewerRow && BigInt(viewerRow.payoutAnsemRaw) > 0n ? "pending" : "not_applicable",
      }, "api");
    },

    async claim(tableId, ctx) {
      return claim(tableId, ctx);
    },

    async claimTestTokens(ctx) {
      return claimTestTokens(ctx);
    },
  },

  prediction: {
    async viewerState(tableId, ctx) {
      return viewerState(tableId, ctx);
    },
    async validatePick(_tableId, query, ctx) {
      return checkPick(query, ctx);
    },
    async lockPick(tableId, mint, ctx) {
      const current = await viewerState(tableId, ctx);
      const staked = await lockAndStake(tableId, mint, current.ok ? current.data : null, ctx);
      if (!staked.ok) return staked;
      return viewerState(tableId, ctx);
    },
  },

  markets: {
    async list(query, ctx) {
      return marketList(query, ctx);
    },
    async memeStocks(query, ctx) {
      return marketList(query, ctx, true);
    },
    async getByMint(mint, ctx) {
      const result = await apiRequest(`/api/game/markets/${encodeURIComponent(mint)}`, MarketAssetResponse, ctx);
      return result.ok ? ok(toMarketAsset(result.data.asset, Date.now()), "api") : result;
    },
    async candles() {
      return pending("markets.candles", "Price history isn't connected yet.");
    },
    async recentTrades() {
      return pending("markets.trades", "Recent trades aren't connected yet.");
    },
  },

  social: {
    async hotPlayers() {
      return pending("social.rankings");
    },
    async recentShowdowns() {
      return pending("social.showdowns");
    },
    async leaderboard() {
      return pending("social.rankings");
    },
    async profile() {
      return pending("social.profiles");
    },
    async history() {
      return pending("social.history");
    },
  },

  trading: {
    async matchState(tableId, ctx) {
      return tradingMatchState(tableId, ctx);
    },
    async quote(order, ctx) {
      return tradingQuote(order, ctx);
    },
    async execute(quoteId, ctx) {
      return tradingExecute(quoteId, ctx);
    },
    async status(tradeId, ctx) {
      return tradingStatus(tradeId, ctx);
    },
  },

  portfolio: {
    async summary() {
      return pending("portfolio.summary", "Portfolio data isn't connected yet.");
    },
  },

  profile: {
    async usernameAvailability() {
      return ok({ available: "unknown" as const }, "api");
    },
    async saveIdentity() {
      return pending("profile.identity", "Profiles aren't saved to Kova yet.");
    },
    async loadIdentity() {
      return fail({ code: "PENDING_INTEGRATION", capability: "profile.identity", retryable: false, message: "Profiles aren't saved to Kova yet." });
    },
  },

  notifications: {
    async list() {
      return pending("notifications.feed", "Notifications aren't connected yet.");
    },
  },
};
