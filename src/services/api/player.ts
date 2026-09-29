/**
 * The signed-in player's own surfaces: challenges, notifications and portfolio.
 * TEST ANSEM has no dollar price, so the portfolio reports ANSEM amounts, never invented USD values.
 */
import { z } from "zod";
import { apiRequest } from "@/services/api/http";
import { ok, type ServiceContext, type ServiceResult } from "@/types/service";
import { ANSEM_DECIMALS } from "@/lib/format";
import type { ChallengeInput } from "@/types/competition";
import type { KovaNotification } from "@/types/notifications";
import type { PortfolioSummary } from "@/types/portfolio";

const stakeToRaw = (stakeAnsem: number) => (BigInt(Math.round(stakeAnsem)) * 10n ** BigInt(ANSEM_DECIMALS)).toString();

export async function sendChallenge(input: ChallengeInput, ctx: ServiceContext | undefined): Promise<ServiceResult<{ challengeId: string; tableId: string }>> {
  const result = await apiRequest("/api/game/challenges", z.object({ ok: z.literal(true), challengeId: z.string(), tableId: z.string() }), ctx, {
    method: "POST", auth: true,
    body: { opponentUsername: input.opponentUsername, mode: input.mode, stakeRaw: stakeToRaw(input.stakeAnsem), roundDurationSeconds: input.durationSeconds },
  });
  return result.ok ? ok({ challengeId: result.data.challengeId, tableId: result.data.tableId }, "api") : result;
}

const NotificationsSchema = z.object({
  ok: z.literal(true),
  notifications: z.array(z.object({
    id: z.string(), kind: z.enum(["challenge_received", "challenge_accepted", "match_starting", "match_result", "payout_confirmed"]),
    title: z.string(), body: z.string(), at: z.string(), read: z.boolean(), href: z.string(),
  })),
});

export async function notifications(ctx: ServiceContext | undefined): Promise<ServiceResult<KovaNotification[]>> {
  const result = await apiRequest("/api/game/notifications", NotificationsSchema, ctx, { auth: true });
  return result.ok ? ok(result.data.notifications, "api") : result;
}

export async function markNotificationsRead(ctx: ServiceContext | undefined): Promise<ServiceResult<null>> {
  const result = await apiRequest("/api/game/notifications/read", z.object({ ok: z.literal(true) }), ctx, { method: "POST", auth: true, body: {} });
  return result.ok ? ok(null, "api") : result;
}

const Int = z.string().regex(/^-?\d+$/);
const PortfolioSchema = z.object({
  ok: z.literal(true),
  portfolio: z.object({
    network: z.string(), wallet: z.string().nullable(), solLamports: z.number().nullable(), ansemRaw: Int.nullable(),
    inPlayRaw: Int, netWonRaw: Int, matches: z.number(), wins: z.number(),
    allocations: z.array(z.object({ tableId: z.string(), tableName: z.string(), status: z.enum(["live", "settling"]), stakeRaw: Int })),
    activity: z.array(z.object({ id: z.string(), kind: z.enum(["join", "payout", "result"]), title: z.string(), detail: z.string(), at: z.string(), txSignature: z.string().nullable() })),
  }),
});

const ansem = (raw: string) => Number(BigInt(raw)) / 10 ** ANSEM_DECIMALS;

export async function portfolio(ctx: ServiceContext | undefined): Promise<ServiceResult<PortfolioSummary>> {
  const wallet = ctx?.wallet?.address;
  const result = await apiRequest(`/api/game/portfolio${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ""}`, PortfolioSchema, ctx, { auth: true });
  if (!result.ok) return result;
  const data = result.data.portfolio;
  const devnet = data.network === "solana-devnet";
  const symbol = devnet ? "TEST ANSEM" : "ANSEM";
  return ok({
    totalValueUsd: null, change24hUsd: null, change24hPct: null, availableUsd: null, inCompetitionsUsd: null, totalPnlUsd: null, totalPnlPct: null,
    ansem: {
      symbol,
      balance: data.ansemRaw === null ? null : ansem(data.ansemRaw),
      inPlay: ansem(data.inPlayRaw),
      netWon: ansem(data.netWonRaw),
      sol: data.solLamports === null ? null : data.solLamports / 1e9,
      matches: data.matches,
      wins: data.wins,
      devnet,
    },
    balances: [
      ...(data.ansemRaw === null ? [] : [{ symbol, amount: ansem(data.ansemRaw).toString(), valueUsd: null }]),
      ...(data.solLamports === null ? [] : [{ symbol: devnet ? "SOL (devnet)" : "SOL", amount: (data.solLamports / 1e9).toFixed(4), valueUsd: null }]),
    ],
    holdings: [],
    allocations: data.allocations.map((allocation) => ({
      tableId: allocation.tableId, tableName: allocation.tableName, marketLabel: `${ansem(allocation.stakeRaw)} ${symbol} staked`,
      status: allocation.status, allocatedUsd: null, returnPct: null,
    })),
    activity: data.activity,
    history: null,
    wallet: { provider: null, address: data.wallet, connected: data.wallet !== null },
  }, "api");
}
