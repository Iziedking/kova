import type { MarketIdentity, Result } from "./contracts";

export type FloatMonitorStatus = "captured" | "unknown";

export interface FloatMonitorInput {
  market: MarketIdentity;
  supplyBaseUnits: string;
  observedPoolInventoryRaw: string | null;
  tickSpacing: number;
  stockMintAuthority: string | null;
  stockFreezeAuthority: string | null;
  stockTokenExtensions: readonly string[];
  observedSlot: number;
  observedAt: string;
  source: "solana_rpc";
}

export interface FloatMonitorReport {
  kind: "float_monitor";
  marketId: string;
  stock: {
    symbol: string;
    mint: string;
    programId: string;
    decimals: number;
  };
  rawSupply: string;
  observedPoolInventoryRaw: string | null;
  tickSpacing: number;
  inventoryCoverage: "single_pool_vault" | "unavailable";
  stockMintAuthority: string | null;
  stockFreezeAuthority: string | null;
  stockTokenExtensions: readonly string[];
  observedSlot: number;
  observedAt: string;
  source: "solana_rpc";
  status: FloatMonitorStatus;
  warnings: readonly string[];
  doesNotProve: readonly string[];
}

export interface FloatMonitorError {
  code: "INVALID_FLOAT_MONITOR_INPUT";
  message: string;
  retryable: false;
}

const DOES_NOT_PROVE = [
  "issuer solvency or legal ownership of the underlying stock asset",
  "total mint supply is freely redeemable inventory",
  "inventory outside the inspected pool vault",
  "organic trading or future LP profitability",
] as const;

function validRawAmount(value: string): boolean {
  return /^\d+$/.test(value);
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function stockTokenForMarket(market: FloatMonitorInput["market"]): FloatMonitorInput["market"]["token0"] | null {
  return [market.token0, market.token1].find((token) => token.mint === market.stockMint) ?? null;
}

export function buildFloatMonitorReport(input: FloatMonitorInput): Result<FloatMonitorReport, FloatMonitorError> {
  if (!input.market.id || !input.market.stockMint || !input.market.pool) {
    return { ok: false, code: "INVALID_FLOAT_MONITOR_INPUT", message: "Market identity is incomplete.", retryable: false };
  }
  const stockToken = stockTokenForMarket(input.market);
  if (stockToken === null) {
    return { ok: false, code: "INVALID_FLOAT_MONITOR_INPUT", message: "Stock mint must match one of the market token identities.", retryable: false };
  }
  if (!validRawAmount(input.supplyBaseUnits)) {
    return { ok: false, code: "INVALID_FLOAT_MONITOR_INPUT", message: "Mint supply must be a non-negative raw integer.", retryable: false };
  }
  if (input.observedPoolInventoryRaw !== null && !validRawAmount(input.observedPoolInventoryRaw)) {
    return { ok: false, code: "INVALID_FLOAT_MONITOR_INPUT", message: "Pool inventory must be a non-negative raw integer.", retryable: false };
  }
  if (!Number.isInteger(input.tickSpacing) || input.tickSpacing < 0 || !Number.isInteger(input.observedSlot) || input.observedSlot <= 0 || !validTimestamp(input.observedAt)) {
    return { ok: false, code: "INVALID_FLOAT_MONITOR_INPUT", message: "The monitor requires a positive slot and valid observation time.", retryable: false };
  }

  const warnings = input.observedPoolInventoryRaw === null
    ? ["The stock vault balance was unavailable at the observed slot."]
    : ["The inventory value covers one inspected pool vault, not issuer-wide redeemable float."];

  return {
    ok: true,
    value: {
      kind: "float_monitor",
      marketId: input.market.id,
      stock: {
        symbol: stockToken.symbol,
        mint: input.market.stockMint,
        programId: stockToken.programId,
        decimals: stockToken.decimals,
      },
      rawSupply: input.supplyBaseUnits,
      observedPoolInventoryRaw: input.observedPoolInventoryRaw,
      tickSpacing: input.tickSpacing,
      inventoryCoverage: input.observedPoolInventoryRaw === null ? "unavailable" : "single_pool_vault",
      stockMintAuthority: input.stockMintAuthority,
      stockFreezeAuthority: input.stockFreezeAuthority,
      stockTokenExtensions: [...input.stockTokenExtensions].sort(),
      observedSlot: input.observedSlot,
      observedAt: input.observedAt,
      source: input.source,
      status: input.observedPoolInventoryRaw === null ? "unknown" : "captured",
      warnings,
      doesNotProve: DOES_NOT_PROVE,
    },
  };
}
