/**
 * Deterministic sized-quote evidence. The adapter supplies the observed Raydium
 * values; this module decides whether they are safe to expose as a complete
 * read-only quote. No RPC, wallet, or transaction code belongs here.
 */

export type SizedQuoteCoverageStatus = "complete" | "incomplete" | "unknown";

export interface SizedQuoteObservation {
  marketId: string;
  poolId: string;
  inputMint: string;
  outputMint: string;
  inputDecimals: number;
  outputDecimals: number;
  amountInRaw: string;
  amountOutRaw: string;
  minAmountOutRaw: string;
  feeAmountRaw: string;
  observedSlot: number;
  observedAt: string;
  currentTick: number;
  tickSpacing: number;
  currentSqrtPriceX64: string;
  executionSqrtPriceX64: string;
  currentPriceHuman: string;
  executionPriceHuman: string;
  availableTickArrayStarts: readonly number[];
  requiredTickArrayStarts: readonly number[];
  allTrade: boolean;
  source: "raydium_sdk";
}

export interface SizedQuoteReport {
  kind: "sized_quote";
  status: SizedQuoteCoverageStatus;
  executable: false;
  marketId: string;
  poolId: string;
  observedSlot: number;
  observedAt: string;
  source: "raydium_sdk";
  input: {
    mint: string;
    amountRaw: string;
    decimals: number;
  };
  output: {
    mint: string;
    amountRaw: string | null;
    minAmountOutRaw: string | null;
    decimals: number;
  };
  feeAmountRaw: string | null;
  coverage: {
    allTrade: boolean;
    currentTick: number;
    tickSpacing: number;
    currentTickArrayStart: number | null;
    availableTickArrayStarts: readonly number[];
    requiredTickArrayStarts: readonly number[];
    missingTickArrayStarts: readonly number[];
  };
  priceBasis: {
    currentSqrtPriceX64: string;
    executionSqrtPriceX64: string | null;
    currentPriceHuman: string;
    executionPriceHuman: string | null;
    humanUnit: string;
    rawUnit: string;
  };
  blockers: readonly string[];
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

export function assessSizedQuote(observation: SizedQuoteObservation): SizedQuoteReport {
  const available = uniqueSorted(observation.availableTickArrayStarts);
  const required = uniqueSorted(observation.requiredTickArrayStarts);
  const missing = required.filter((start) => !available.includes(start));
  const currentTickArrayStart = required.length > 0 ? required[0] : null;
  const blockers: string[] = [];

  if (!isPositiveInteger(observation.amountInRaw)) {
    blockers.push("The requested input amount is not a positive integer base-unit value.");
  }

  if (missing.length > 0) {
    blockers.push("One or more tick arrays required by this sized quote were not available at the observed slot.");
  }

  if (!observation.allTrade) {
    blockers.push("Raydium did not consume the full requested input; liquidity or tick-array coverage is incomplete.");
  }

  if (observation.observedSlot <= 0) {
    blockers.push("The quote does not have a valid finalized observation slot.");
  }

  const complete = blockers.length === 0;
  return {
    kind: "sized_quote",
    status: complete ? "complete" : missing.length > 0 || !observation.allTrade ? "incomplete" : "unknown",
    executable: false,
    marketId: observation.marketId,
    poolId: observation.poolId,
    observedSlot: observation.observedSlot,
    observedAt: observation.observedAt,
    source: observation.source,
    input: {
      mint: observation.inputMint,
      amountRaw: observation.amountInRaw,
      decimals: observation.inputDecimals,
    },
    output: {
      mint: observation.outputMint,
      amountRaw: complete ? observation.amountOutRaw : null,
      minAmountOutRaw: complete ? observation.minAmountOutRaw : null,
      decimals: observation.outputDecimals,
    },
    feeAmountRaw: complete ? observation.feeAmountRaw : null,
    coverage: {
      allTrade: observation.allTrade,
      currentTick: observation.currentTick,
      tickSpacing: observation.tickSpacing,
      currentTickArrayStart,
      availableTickArrayStarts: available,
      requiredTickArrayStarts: required,
      missingTickArrayStarts: missing,
    },
    priceBasis: {
      currentSqrtPriceX64: observation.currentSqrtPriceX64,
      executionSqrtPriceX64: complete ? observation.executionSqrtPriceX64 : null,
      currentPriceHuman: observation.currentPriceHuman,
      executionPriceHuman: complete ? observation.executionPriceHuman : null,
      humanUnit: `${observation.outputMint} human units per ${observation.inputMint} human units`,
      rawUnit: `${observation.outputMint} base units per ${observation.inputMint} base units`,
    },
    blockers,
  };
}
