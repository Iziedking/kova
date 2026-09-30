/** Season points and referrals from the live backend. */
import { z } from "zod";
import { apiRequest } from "@/services/api/http";
import { fail, ok, type ServiceContext, type ServiceResult } from "@/types/service";
import type { PointsRow, PointsSummary } from "@/types/points";

const Kinds = z.object({ play: z.number(), win: z.number(), referral: z.number(), welcome: z.number() });
const SummarySchema = z.object({
  ok: z.literal(true),
  points: z.object({
    season: z.number(), total: z.number(), breakdown: Kinds, rules: Kinds.passthrough(),
    referralCode: z.string().nullable(), invited: z.number(), qualified: z.number(), referredBy: z.string().nullable(),
  }),
});
const BoardSchema = z.object({
  ok: z.literal(true),
  rows: z.array(z.object({ rank: z.number(), username: z.string(), displayName: z.string().nullable(), avatarUrl: z.string().nullable(), points: z.number() })),
});
const ClaimSchema = z.object({ ok: z.literal(true), referrer: z.string() });

const signIn = () => fail<never>({ code: "AUTH_REQUIRED", message: "Sign in to see your points.", retryable: false });

export async function myPoints(ctx: ServiceContext | undefined): Promise<ServiceResult<PointsSummary>> {
  if (((await ctx?.getAccessToken?.()) ?? null) === null) return signIn();
  const result = await apiRequest("/api/game/points/me", SummarySchema, ctx, { auth: true });
  return result.ok ? ok({ ...result.data.points, rules: { play: result.data.points.rules.play, win: result.data.points.rules.win, referral: result.data.points.rules.referral, welcome: result.data.points.rules.welcome } }, "api") : result;
}

export async function pointsLeaderboard(ctx: ServiceContext | undefined): Promise<ServiceResult<PointsRow[]>> {
  const result = await apiRequest("/api/game/points/leaderboard", BoardSchema, ctx);
  return result.ok ? ok(result.data.rows, "api") : result;
}

export async function claimReferral(code: string, ctx: ServiceContext | undefined): Promise<ServiceResult<{ referrer: string }>> {
  if (((await ctx?.getAccessToken?.()) ?? null) === null) return signIn();
  const result = await apiRequest("/api/game/referrals/claim", ClaimSchema, ctx, { method: "POST", auth: true, body: { code } });
  return result.ok ? ok({ referrer: result.data.referrer }, "api") : result;
}
