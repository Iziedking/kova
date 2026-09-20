import { z } from "zod";

export const TradingModeSchema = z.literal("trading");
export type TradingMode = z.infer<typeof TradingModeSchema>;

export const TradeSideSchema = z.enum(["buy", "sell"]);
export type TradeSide = z.infer<typeof TradeSideSchema>;

const DecimalString = z.string().regex(/^(0|[1-9][0-9]*)$/, "Expected a non-negative integer string.");

export interface CompetitionAccountRef {
  competitionId: string;
  playerId: string;
  accountId: string;
  walletAddress: string;
  custody: "user_authorized" | "unsupported";
}

export interface TradeFill {
  fillId: string;
  competitionId: string;
  playerId: string;
  accountId: string;
  txSignature: string;
  side: TradeSide;
  assetMint: string;
  assetDecimals: number;
  quantityRaw: string;
  quoteAmountMicroUsd: string;
  feeMicroUsd: string;
  observedAt: string;
}

export interface MarkPrice {
  assetMint: string;
  assetDecimals: number;
  priceMicroUsd: string;
  observedAt: string;
}

export interface PositionState {
  assetMint: string;
  assetDecimals: number;
  quantityRaw: string;
  costBasisMicroUsd: string;
}

export interface TradingLedgerState {
  competitionId: string;
  playerId: string;
  accountId: string;
  startingCashMicroUsd: string;
  cashMicroUsd: string;
  realizedPnlMicroUsd: string;
  positions: readonly PositionState[];
  fills: readonly TradeFill[];
}

export interface EquitySnapshot {
  asOf: string;
  cashMicroUsd: string;
  positionsValueMicroUsd: string;
  totalEquityMicroUsd: string;
  realizedPnlMicroUsd: string;
  unrealizedPnlMicroUsd: string;
  totalPnlMicroUsd: string;
  pnlBps: string;
}

export interface TradingReconciliationReceipt {
  txSignature: string;
  walletAddress: string;
  slot: number | null;
  status: "confirmed" | "failed" | "unknown";
  observedAt: string;
  source: "helius" | "solana_rpc";
}

export const TradeFillSchema = z.object({
  fillId: z.string().trim().min(1),
  competitionId: z.string().trim().min(1),
  playerId: z.string().trim().min(1),
  accountId: z.string().trim().min(1),
  txSignature: z.string().trim().min(1),
  side: TradeSideSchema,
  assetMint: z.string().trim().min(32).max(44),
  assetDecimals: z.number().int().min(0).max(18),
  quantityRaw: DecimalString.refine((value) => BigInt(value) > 0n, "Quantity must be positive."),
  quoteAmountMicroUsd: DecimalString,
  feeMicroUsd: DecimalString,
  observedAt: z.string().datetime(),
});

export const MarkPriceSchema = z.object({
  assetMint: z.string().trim().min(32).max(44),
  assetDecimals: z.number().int().min(0).max(18),
  priceMicroUsd: DecimalString,
  observedAt: z.string().datetime(),
});

export function assertNonNegativeInteger(value: string, field: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${field} must be a non-negative integer string.`);
  return BigInt(value);
}
