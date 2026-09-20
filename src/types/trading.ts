/**
 * Trading Mode is real-money trading. Every type here describes a real
 * execution or a real quote. Nothing in this file models paper trading or
 * virtual equity, and no frontend code may compute authoritative execution.
 */
export type TradeSide = "buy" | "sell";

export type TradeFlowStatus =
  | "idle"
  | "reviewing"
  | "preparing"
  | "awaiting_wallet"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "failed";

export interface MoneyAmount {
  /** Decimal string in `symbol` units; never a float. */
  amount: string;
  symbol: string;
  usd: number | null;
}

export interface DraftOrder {
  tableId: string;
  assetMint: string;
  symbol: string;
  side: TradeSide;
  /** What the player pays, in the quote currency (USD-denominated input from the ticket). */
  inputUsd: number;
}

/** Issued by the backend. The frontend displays it and must never recompute it. */
export interface TradeQuote {
  quoteId: string;
  expiresAt: string;
  side: TradeSide;
  assetMint: string;
  symbol: string;
  inputAmount: string;
  inputSymbol: string;
  estimatedOutputAmount: string;
  outputSymbol: string;
  executionPriceUsd: number | null;
  priceImpactPct: number | null;
  feeUsd: number | null;
  route: string | null;
}

export interface Trade {
  id: string;
  tableId: string;
  assetMint: string;
  symbol: string;
  side: TradeSide;

  inputAmount: string;
  outputAmount: string | null;

  effectivePriceUsd: number | null;
  feeUsd: number | null;

  /** Present only once the transaction is really submitted. Never fabricated. */
  txSignature?: string | null;

  status: "draft" | "awaiting_wallet" | "submitted" | "confirming" | "confirmed" | "failed";
  failureReason?: string | null;

  createdAt: string;
  confirmedAt?: string | null;
}

export interface CompetitionPosition {
  assetMint: string;
  symbol: string;
  quantity: string;
  averageEntryUsd: number | null;
  markPriceUsd: number | null;
  currentValueUsd: number | null;

  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  realizedPnlPct: number | null;
  unrealizedPnlPct: number | null;
  /** The ranking metric. */
  totalPnlPct: number | null;
  totalPnlUsd: number | null;
}

export interface TradingBalance {
  symbol: string;
  availableUsd: number | null;
}

/** What the trading table needs beyond the generic table detail. */
export interface TradingMatchState {
  tableId: string;
  eligibleMints: string[];
  balance: TradingBalance | null;
  /** One entry per asset the player currently holds inside this competition. */
  positions: CompetitionPosition[];
  /** The ranking metric across all positions: total net PnL %, never dollars. */
  totalPnlPct: number | null;
  trades: Trade[];
  /** Whether the backend can execute real trades for this table right now. */
  execution: "live" | "unavailable";
  executionNote: string | null;
}
