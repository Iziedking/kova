/**
 * Profiles, rankings and results from the live backend. Every stat is computed on the server
 * from settled tables; X names and pictures come from Privy on the server side.
 */
import { z } from "zod";
import { apiRequest } from "@/services/api/http";
import { fail, ok, type ServiceContext, type ServiceResult } from "@/types/service";
import type { HouseRecord } from "@/types/house";
import type { DealerDesk, HotPlayer, KovaIdentity, LeaderboardRow, LeaderboardScope, MatchHistoryItem, PlayerProfile, RecentShowdown } from "@/types/social";

export const IdentitySchema = z.object({
  username: z.string(), displayName: z.string().nullable(), avatarUrl: z.string().nullable(), avatarSeed: z.string().nullable(),
  xHandle: z.string().nullable(), verified: z.boolean(), hasProfile: z.boolean(), isAgent: z.boolean().optional(),
});
export type PublicIdentity = z.infer<typeof IdentitySchema>;

const StatsSchema = z.object({
  matches: z.number(), wins: z.number(), winRatePct: z.number().nullable(), predictionWinRate: z.number().nullable(), tradingWinRate: z.number().nullable(),
  avgPredictionReturnPct: z.number().nullable(), avgTradingPnlPct: z.number().nullable(), bestTradingPnlPct: z.number().nullable(),
  avgReturnPct: z.number().nullable(), streak: z.number(), netRaw: z.string(),
});
const RankedSchema = z.object({ ok: z.literal(true), rows: z.array(z.object({ rank: z.number(), identity: IdentitySchema, stats: StatsSchema })) });
const OwnProfileSchema = z.object({ ok: z.literal(true), profile: IdentitySchema.extend({ displayNameOwn: z.string().nullable() }).nullable() });

const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

export async function leaderboard(scope: LeaderboardScope, ctx: ServiceContext | undefined): Promise<ServiceResult<LeaderboardRow[]>> {
  const result = await apiRequest(`/api/game/leaderboard?scope=${scope}`, RankedSchema, ctx);
  if (!result.ok) return result;
  return ok(result.data.rows.map(({ rank, identity, stats }) => ({
    rank, username: identity.username, displayName: identity.displayName, handle: identity.xHandle, avatarUrl: identity.avatarUrl, verified: identity.verified,
    hasProfile: identity.hasProfile, isAgent: identity.isAgent ?? false, rating: null, wins: stats.wins, matches: stats.matches, winRatePct: round1(stats.winRatePct),
    modeStatPct: round1(scope === "prediction" ? stats.predictionWinRate : scope === "trading" ? stats.avgTradingPnlPct : stats.avgReturnPct),
    modeStatLabel: scope === "prediction" ? "Predict win rate" : scope === "trading" ? "Avg Trade PnL" : "Avg return",
    streak: stats.streak,
  })), "api");
}

export async function hotPlayers(ctx: ServiceContext | undefined): Promise<ServiceResult<HotPlayer[]>> {
  const result = await apiRequest("/api/game/players/hot", RankedSchema, ctx);
  if (!result.ok) return result;
  return ok(result.data.rows.map(({ rank, identity, stats }) => ({
    rank, username: identity.username, displayName: identity.displayName, handle: identity.xHandle, avatarUrl: identity.avatarUrl,
    verified: identity.verified, performancePct: round1(stats.avgReturnPct), streak: stats.streak,
  })), "api");
}

const DealerDeskSchema = z.object({
  ok: z.literal(true),
  dealerConfigured: z.boolean(),
  stats: z.object({
    runs: z.number(), decisions: z.number(), accepted: z.number(), refused: z.number(), admitRate: z.number().nullable(),
    avgConfidence: z.number().nullable(), last24hRuns: z.number(), distinctTokens: z.number(),
  }),
  verdicts: z.array(z.object({
    id: z.string(), mint: z.string(), symbol: z.string().nullable(), name: z.string().nullable(),
    decision: z.enum(["ACCEPTED", "REJECTED", "INSUFFICIENT_EVIDENCE"]), confidence: z.number().nullable(), reasons: z.array(z.string()),
    evidenceHash: z.string().nullable(), source: z.enum(["check", "admission"]), tableId: z.string().nullable(), at: z.string(),
  })),
});

const HouseSchema = z.object({
  ok: z.literal(true),
  enabled: z.boolean(),
  brain: z.enum(["clawpump", "rules"]),
  rules: z.object({
    lobbyStake: z.string(), lobbyRoundSeconds: z.number(), stopLossPct: z.number(), maxPositions: z.number(), maxExposure: z.number(),
    maxOrderShare: z.number(), maxDecisionsPerMatch: z.number(), dailyLossLimitAnsem: z.number(), minLiquidityUsd: z.number(),
  }).passthrough(),
  profile: z.object({
    stats: StatsSchema,
    history: z.array(z.object({ tableId: z.string(), tableName: z.string(), opponents: z.array(z.string()), result: z.enum(["won", "lost", "draw"]), returnPct: z.number().nullable(), payoutRaw: z.string(), settledAt: z.string() }).passthrough()),
  }).passthrough().nullable(),
  vault: z.string().nullable(),
  stakeCount: z.number(),
  stakedAnsem: z.string(),
  stakes: z.array(z.object({ tableId: z.string(), tableName: z.string(), stakeRaw: z.string(), signature: z.string(), at: z.string() })),
  live: z.array(z.object({ tableId: z.string(), name: z.string(), status: z.string(), endsAt: z.string().nullable() })),
  lobby: z.object({ tableId: z.string(), name: z.string() }).nullable(),
  decisions: z.array(z.object({
    id: z.string(), tableId: z.string(), tableName: z.string(), source: z.enum(["agent", "rules", "risk"]), view: z.string().nullable(),
    executed: z.array(z.object({ side: z.string(), symbol: z.string(), usd: z.number().nullable(), feeUsd: z.number().nullable().optional(), reason: z.string().optional() }).passthrough()),
    refused: z.array(z.object({ order: z.object({ side: z.string(), mint: z.string(), usd: z.number(), reason: z.string() }).passthrough(), why: z.string() })),
    equityUsd: z.number().nullable(), pnlPct: z.number().nullable(), at: z.string(),
  })),
});

export async function house(ctx: ServiceContext | undefined): Promise<ServiceResult<HouseRecord>> {
  const result = await apiRequest("/api/game/house", HouseSchema, ctx);
  if (!result.ok) return result;
  const { enabled, brain, rules, vault, stakeCount, stakes, live, lobby, decisions, profile, stakedAnsem } = result.data;
  return ok({
    enabled, brain, rules, vault, stakeCount, stakes, live, lobby, decisions,
    stakedRaw: stakedAnsem,
    stats: profile ? { matches: profile.stats.matches, wins: profile.stats.wins, winRatePct: profile.stats.winRatePct, avgTradingPnlPct: profile.stats.avgTradingPnlPct, bestTradingPnlPct: profile.stats.bestTradingPnlPct, netRaw: profile.stats.netRaw } : null,
    history: profile ? profile.history.slice(0, 20).map((row) => ({ tableId: row.tableId, tableName: row.tableName, opponents: row.opponents, result: row.result, returnPct: row.returnPct, payoutRaw: row.payoutRaw, settledAt: row.settledAt })) : [],
  }, "api");
}

export async function dealerDesk(ctx: ServiceContext | undefined): Promise<ServiceResult<DealerDesk>> {
  const result = await apiRequest("/api/game/dealer/desk?limit=40", DealerDeskSchema, ctx);
  if (!result.ok) return result;
  const { dealerConfigured, stats, verdicts } = result.data;
  return ok({ dealerConfigured, stats, verdicts }, "api");
}

const ShowdownsSchema = z.object({
  ok: z.literal(true),
  showdowns: z.array(z.object({
    id: z.string(), tableName: z.string(), mode: z.enum(["prediction", "trading"]), settledAt: z.string(),
    winner: IdentitySchema, loser: IdentitySchema, draw: z.boolean(), payoutRaw: z.string(),
  })),
});

const nameOf = (identity: PublicIdentity) => identity.displayName ?? identity.username;

export async function recentShowdowns(ctx: ServiceContext | undefined): Promise<ServiceResult<RecentShowdown[]>> {
  const result = await apiRequest("/api/game/showdowns/recent", ShowdownsSchema, ctx);
  if (!result.ok) return result;
  return ok(result.data.showdowns.map((showdown) => ({
    id: showdown.id, winner: nameOf(showdown.winner), loser: nameOf(showdown.loser), winnerAvatarUrl: showdown.winner.avatarUrl,
    tableName: showdown.tableName, mode: showdown.mode, payoutAnsemRaw: showdown.payoutRaw, settledAt: showdown.settledAt,
  })), "api");
}

const ProfileSchema = z.object({
  ok: z.literal(true),
  profile: z.object({
    id: z.string(), identity: IdentitySchema, joinedAt: z.string(), stats: StatsSchema,
    history: z.array(z.object({
      id: z.string(), tableId: z.string(), tableName: z.string(), mode: z.enum(["prediction", "trading"]), opponents: z.array(z.string()),
      result: z.enum(["won", "lost", "draw"]), returnPct: z.number().nullable(), payoutRaw: z.string(), settledAt: z.string(),
    })),
  }),
});

/** One request serves both the profile header and its history. */
const profileCache = new Map<string, { at: number; value: Promise<ServiceResult<z.infer<typeof ProfileSchema>>> }>();
function loadProfile(username: string, ctx: ServiceContext | undefined) {
  const key = username.toLowerCase();
  const hit = profileCache.get(key);
  if (hit && Date.now() - hit.at < 5_000) return hit.value;
  const value = apiRequest(`/api/game/profiles/${encodeURIComponent(key)}`, ProfileSchema, ctx);
  profileCache.set(key, { at: Date.now(), value });
  return value;
}

export async function profile(username: string, ctx: ServiceContext | undefined): Promise<ServiceResult<PlayerProfile>> {
  const result = await loadProfile(username, ctx);
  if (!result.ok) return result;
  const { id, identity, joinedAt, stats } = result.data.profile;
  return ok({
    id, username: identity.username, displayName: identity.displayName, avatarUrl: identity.avatarUrl, verified: identity.verified,
    xHandle: identity.xHandle, isAgent: identity.isAgent ?? false, rating: null, joinedAt, favoriteNarrative: null,
    stats: {
      matches: stats.matches, wins: stats.wins, predictionWinRate: round1(stats.predictionWinRate), tradingWinRate: round1(stats.tradingWinRate),
      avgTradingPnlPct: round1(stats.avgTradingPnlPct), bestTradingPnlPct: round1(stats.bestTradingPnlPct),
      avgPredictionReturnPct: round1(stats.avgPredictionReturnPct), currentStreak: stats.streak,
    },
  }, "api");
}

export async function history(username: string, ctx: ServiceContext | undefined): Promise<ServiceResult<MatchHistoryItem[]>> {
  const result = await loadProfile(username, ctx);
  if (!result.ok) return result;
  return ok(result.data.profile.history.map((item) => ({
    id: item.id, tableId: item.tableId, tableName: item.tableName, mode: item.mode, opponents: item.opponents,
    result: item.result, returnPct: item.returnPct, payoutAnsemRaw: item.payoutRaw, settledAt: item.settledAt,
  })), "api");
}

export async function usernameAvailability(username: string, ctx: ServiceContext | undefined): Promise<ServiceResult<{ available: boolean | "unknown" }>> {
  const token = (await ctx?.getAccessToken?.()) ?? null;
  const result = await apiRequest(`/api/game/profile/username-available?username=${encodeURIComponent(username)}`, z.object({ ok: z.literal(true), available: z.boolean() }), ctx, { auth: token !== null });
  return result.ok ? ok({ available: result.data.available }, "api") : ok({ available: "unknown" as const }, "api");
}

function toIdentity(profile: z.infer<typeof OwnProfileSchema>["profile"]): KovaIdentity | null {
  if (!profile) return null;
  return {
    username: profile.username,
    // What the player set themselves. The X name, when linked, is shown instead on public surfaces.
    displayName: profile.displayNameOwn,
    avatarUrl: profile.avatarUrl,
    avatarSeed: profile.avatarSeed ?? profile.username,
    xHandle: profile.xHandle,
    xName: profile.displayName !== profile.displayNameOwn ? profile.displayName : null,
  };
}

export async function saveIdentity(identity: KovaIdentity, ctx: ServiceContext | undefined): Promise<ServiceResult<KovaIdentity>> {
  const result = await apiRequest("/api/game/profile/me", OwnProfileSchema, ctx, {
    method: "POST", auth: true, body: { username: identity.username, displayName: identity.displayName, avatarSeed: identity.avatarSeed },
  });
  if (!result.ok) return result;
  const saved = toIdentity(result.data.profile);
  return saved ? ok(saved, "api") : fail({ code: "HTTP", message: "Your profile didn't save. Try again.", retryable: true });
}

export async function loadIdentity(ctx: ServiceContext | undefined, options: { refreshX?: boolean } = {}): Promise<ServiceResult<KovaIdentity | null>> {
  const result = await apiRequest(`/api/game/profile/me${options.refreshX ? "?refreshX=1" : ""}`, OwnProfileSchema, ctx, { auth: true });
  return result.ok ? ok(toIdentity(result.data.profile), "api") : result;
}
