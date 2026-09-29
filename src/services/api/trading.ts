/**
 * Trade mode against the live backend: live DEX prices, simulated fills, real ANSEM stakes.
 * Every number here comes from the server; this file only converts units for display.
 */
import { z } from "zod";
import { FeedAssetSchema } from "@/domain/game/market-contracts";
import { toMarketAsset } from "@/services/adapters/market";
import { apiRequest } from "@/services/api/http";
import { IdentitySchema } from "@/services/api/social";
import { ok, type ServiceContext, type ServiceResult } from "@/types/service";
import type { CompetitionStanding } from "@/types/competition";
import type { CompetitionPosition, DraftOrder, Trade, TradeQuote, TradingMatchState } from "@/types/trading";

const SIM_DECIMALS = 9;
const Int = z.string().regex(/^-?\d+$/);

const TradeSchema = z.object({
  id: z.string(), tableId: z.string(), side: z.enum(["buy", "sell"]), mint: z.string(), symbol: z.string(),
  quantityRaw: Int, quoteMicroUsd: Int, feeMicroUsd: Int, price18: Int.nullable(), at: z.string(), status: z.literal("confirmed"),
});
const QuoteSchema = z.object({
  id: z.string(), side: z.enum(["buy", "sell"]), mint: z.string(), symbol: z.string(), expiresAt: z.string(),
  inputMicroUsd: Int, quantityRaw: Int, quoteMicroUsd: Int, feeMicroUsd: Int, price18: Int,
});
const MatchSchema = z.object({
  ok: z.literal(true), tableId: z.string(), simulated: z.boolean(), feeBps: z.number(), live: z.boolean(), endsAt: z.string().nullable(),
  account: z.object({
    status: z.string(), cashMicroUsd: Int, startingCashMicroUsd: Int, equityMicroUsd: Int.nullable(), pnlBps: Int.nullable(),
    positions: z.array(z.object({ mint: z.string(), symbol: z.string(), quantityRaw: Int, costBasisMicroUsd: Int, price18: Int.nullable(), valueMicroUsd: Int.nullable() })),
  }).nullable(),
  fills: z.array(TradeSchema),
  standings: z.array(z.object({ wallet: z.string(), equityMicroUsd: Int.nullable(), pnlBps: Int.nullable(), isViewer: z.boolean(), player: IdentitySchema.nullable().optional() })),
  eligibleMints: z.array(z.string()),
  eligibleAssets: z.array(FeedAssetSchema).optional(),
});

const usd = (micro: string | bigint) => Number(BigInt(micro)) / 1e6;
const price = (price18: string | null) => (price18 === null ? null : Number(BigInt(price18)) / 1e18);
/** Quantity as a decimal string, trimmed. */
function quantity(raw: string): string {
  const value = BigInt(raw);
  const whole = value / 10n ** BigInt(SIM_DECIMALS);
  const fraction = (value % 10n ** BigInt(SIM_DECIMALS)).toString().padStart(SIM_DECIMALS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction.slice(0, 4)}` : whole.toString();
}
const shortWallet = (wallet: string) => `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;

function toTrade(row: z.infer<typeof TradeSchema>): Trade {
  const notional = usd(row.quoteMicroUsd);
  const fee = usd(row.feeMicroUsd);
  return {
    id: row.id, tableId: row.tableId, assetMint: row.mint, symbol: row.symbol, side: row.side,
    inputAmount: row.side === "buy" ? `$${(notional + fee).toFixed(2)}` : `${quantity(row.quantityRaw)} ${row.symbol}`,
    outputAmount: row.side === "buy" ? `${quantity(row.quantityRaw)} ${row.symbol}` : `$${(notional - fee).toFixed(2)}`,
    effectivePriceUsd: price(row.price18), feeUsd: fee, txSignature: null, status: "confirmed", createdAt: row.at, confirmedAt: row.at,
  };
}

export async function tradingMatchState(tableId: string, ctx: ServiceContext | undefined): Promise<ServiceResult<TradingMatchState & { standings: CompetitionStanding[] }>> {
  const token = (await ctx?.getAccessToken?.()) ?? null;
  const result = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}/trading`, MatchSchema, ctx, { auth: token !== null });
  if (!result.ok) return result;
  const { account, fills, standings, eligibleMints, live } = result.data;
  const positions: CompetitionPosition[] = (account?.positions ?? []).map((position) => {
    const cost = usd(position.costBasisMicroUsd);
    const value = position.valueMicroUsd === null ? null : usd(position.valueMicroUsd);
    const units = Number(BigInt(position.quantityRaw)) / 10 ** SIM_DECIMALS;
    const unrealized = value === null ? null : value - cost;
    return {
      assetMint: position.mint, symbol: position.symbol, quantity: quantity(position.quantityRaw),
      averageEntryUsd: units > 0 ? cost / units : null, markPriceUsd: price(position.price18), currentValueUsd: value,
      realizedPnlUsd: null, unrealizedPnlUsd: unrealized, realizedPnlPct: null,
      unrealizedPnlPct: unrealized === null || cost === 0 ? null : (unrealized / cost) * 100,
      totalPnlPct: unrealized === null || cost === 0 ? null : (unrealized / cost) * 100, totalPnlUsd: unrealized,
    };
  });
  const rankingAvailable = standings.every((row) => row.pnlBps !== null);
  let rank = 0;
  const ranked: CompetitionStanding[] = standings.map((row, index) => {
    if (index === 0 || row.pnlBps !== standings[index - 1]!.pnlBps) rank = index + 1;
    return { rank: rankingAvailable ? rank : 0, username: row.player ? row.player.displayName ?? row.player.username : shortWallet(row.wallet), avatarUrl: row.player?.avatarUrl ?? null, netPnlPct: row.pnlBps === null ? null : Number(row.pnlBps) / 100, isViewer: row.isViewer };
  });
  return ok({
    tableId,
    eligibleMints,
    eligibleAssets: result.data.eligibleAssets?.map((asset) => toMarketAsset(asset, Date.now())),
    balance: account ? { symbol: "USD", availableUsd: usd(account.cashMicroUsd) } : null,
    positions,
    totalPnlPct: account?.pnlBps != null ? Number(account.pnlBps) / 100 : null,
    trades: fills.map(toTrade),
    execution: live && account?.status === "active" ? "live" : "unavailable",
    executionNote: !account ? "Take a seat to trade in this match."
      : !live ? "Trading opens when the round starts and closes when it ends."
      : `Live DEX prices, simulated fills, ${(result.data.feeBps / 100).toFixed(1)}% fee. Your ANSEM stake is real.`,
    standings: ranked,
  }, "api");
}

export async function tradingQuote(order: DraftOrder, ctx: ServiceContext | undefined): Promise<ServiceResult<TradeQuote>> {
  const result = await apiRequest("/api/game/trading/quotes", z.object({ ok: z.literal(true), quote: QuoteSchema }), ctx, {
    method: "POST", auth: true, body: { tableId: order.tableId, mint: order.assetMint, side: order.side, inputUsd: order.inputUsd },
  });
  if (!result.ok) return result;
  const quote = result.data.quote;
  const notional = usd(quote.quoteMicroUsd);
  const fee = usd(quote.feeMicroUsd);
  return ok({
    quoteId: quote.id, expiresAt: quote.expiresAt, side: quote.side, assetMint: quote.mint, symbol: quote.symbol,
    inputAmount: quote.side === "buy" ? usd(quote.inputMicroUsd).toFixed(2) : quantity(quote.quantityRaw),
    inputSymbol: quote.side === "buy" ? "USD" : quote.symbol,
    estimatedOutputAmount: quote.side === "buy" ? quantity(quote.quantityRaw) : (notional - fee).toFixed(2),
    outputSymbol: quote.side === "buy" ? quote.symbol : "USD",
    executionPriceUsd: price(quote.price18), priceImpactPct: null, feeUsd: fee, route: "Live DEX price · simulated fill",
  }, "api");
}

const TradeResponse = z.object({ ok: z.literal(true), trade: TradeSchema });

export async function tradingExecute(quoteId: string, ctx: ServiceContext | undefined): Promise<ServiceResult<Trade>> {
  const result = await apiRequest(`/api/game/trading/quotes/${encodeURIComponent(quoteId)}/execute`, TradeResponse, ctx, { method: "POST", auth: true, body: {} });
  return result.ok ? ok(toTrade(result.data.trade), "api") : result;
}

export async function tradingStatus(tradeId: string, ctx: ServiceContext | undefined): Promise<ServiceResult<Trade>> {
  const result = await apiRequest(`/api/game/trading/trades/${encodeURIComponent(tradeId)}`, TradeResponse, ctx, { auth: true });
  return result.ok ? ok(toTrade(result.data.trade), "api") : result;
}
