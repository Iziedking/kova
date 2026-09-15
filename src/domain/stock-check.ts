import type { MarketIdentity, Result } from "./contracts";

export type StockCheckStatus = "pass" | "blocked" | "unknown";
export type RedeemabilityStatus = "verified" | "reported" | "unavailable" | "unknown";
export type ThinLiquidityStatus = "low" | "watch" | "high" | "unknown";
export type IssuerApprovalStatus = "verified" | "reported" | "unavailable" | "unknown";
export type StockEligibilityStatus = "eligible" | "restricted" | "ineligible" | "unknown";
export type JurisdictionStatus = "unrestricted" | "limited" | "unknown";

export interface StockCheckInput {
  market: MarketIdentity;
  issuer: {
    name: string | null;
    approvalStatus: IssuerApprovalStatus;
    approvedTokenAddress: string | null;
    source: string | null;
  };
  eligibility: {
    status: StockEligibilityStatus;
    jurisdiction: JurisdictionStatus;
    limitations: readonly string[];
    source: string | null;
  };
  reference: {
    source: string;
    priceBaseUnits: string | null;
    observedAt: string | null;
    freshnessSeconds: number | null;
    maxFreshnessSeconds: number;
  };
  inventory: {
    availableBaseUnits: string | null;
    redeemability: RedeemabilityStatus;
  };
  liquidity: {
    poolAddress: string;
    depthBaseUnits: string | null;
    minimumDepthBaseUnits: string;
    estimatedPriceImpactBps: number | null;
    maximumPriceImpactBps: number;
  };
  volatility: {
    stockMoveBps: number | null;
    memeMoveBps: number | null;
    divergenceBps: number | null;
    maximumDivergenceBps: number;
  };
  checkedAt: string;
}

export interface StockCheckEvidence {
  id: string;
  status: StockCheckStatus;
  detail: string;
}

export interface StockCheckReport {
  marketId: string;
  status: StockCheckStatus;
  stock: {
    symbol: string;
    mint: string;
    tokenAddress: string;
    programId: string;
    decimals: number;
  };
  issuer: {
    name: string | null;
    approvalStatus: IssuerApprovalStatus;
    approvedTokenAddress: string | null;
    source: string | null;
    status: StockCheckStatus;
  };
  eligibility: {
    status: StockEligibilityStatus;
    jurisdiction: JurisdictionStatus;
    limitations: readonly string[];
    source: string | null;
    evidenceStatus: StockCheckStatus;
  };
  reference: {
    source: string;
    priceBaseUnits: string | null;
    observedAt: string | null;
    freshnessSeconds: number | null;
    status: StockCheckStatus;
  };
  inventory: {
    availableBaseUnits: string | null;
    redeemability: RedeemabilityStatus;
    status: StockCheckStatus;
  };
  liquidity: {
    poolAddress: string;
    depthBaseUnits: string | null;
    estimatedPriceImpactBps: number | null;
    thinLiquidity: ThinLiquidityStatus;
    status: StockCheckStatus;
  };
  volatility: {
    stockMoveBps: number | null;
    memeMoveBps: number | null;
    divergenceBps: number | null;
    status: StockCheckStatus;
  };
  evidence: readonly StockCheckEvidence[];
  blockers: readonly string[];
  warnings: readonly string[];
  checkedAt: string;
  doesNotProve: readonly string[];
}

export type StockCheckErrorCode = "INVALID_STOCK_CHECK_INPUT";

export interface StockCheckError {
  code: StockCheckErrorCode;
  message: string;
  retryable: false;
}

const DOES_NOT_PROVE = [
  "that an issuer approval record is current, complete, or legal advice for a user's jurisdiction",
  "that a restricted stock-token eligibility record applies to the user's jurisdiction or wallet",
  "issuer solvency or legal ownership of the underlying stock asset",
  "organic trading from a single volume or activity observation",
  "future trading volume or LP profitability",
  "absence of impermanent loss or adverse selection",
] as const;

function parseBaseUnits(value: string | null): bigint | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function validTimestamp(value: string | null): boolean {
  return value !== null && Number.isFinite(Date.parse(value));
}

function validNonNegativeInteger(value: number | null): boolean {
  return value === null || (Number.isInteger(value) && value >= 0);
}

function stockTokenForMarket(input: StockCheckInput): StockCheckInput["market"]["token0"] | null {
  return [input.market.token0, input.market.token1].find((token) => token.mint === input.market.stockMint) ?? null;
}

function validateInput(input: StockCheckInput): string | null {
  if (!input.market.id || !input.market.stockMint || !input.market.pool) {
    return "Market identity is incomplete.";
  }
  if (!input.market.token0.symbol || !input.market.token1.symbol) {
    return "Market token symbols are incomplete.";
  }
  if (!Number.isInteger(input.market.token0.decimals) || input.market.token0.decimals < 0 || input.market.token0.decimals > 255 || !Number.isInteger(input.market.token1.decimals) || input.market.token1.decimals < 0 || input.market.token1.decimals > 255) {
    return "Token decimals must be integers from 0 through 255.";
  }
  if (stockTokenForMarket(input) === null) {
    return "Stock mint must match one of the market token identities.";
  }
  if (input.issuer.approvalStatus === "verified" && (!input.issuer.name || !input.issuer.source || !input.issuer.approvedTokenAddress)) {
    return "Verified issuer evidence requires a name, source, and approved token address.";
  }
  if (input.eligibility.status === "restricted" && input.eligibility.limitations.length === 0) {
    return "Restricted stock-token eligibility requires jurisdiction limitations.";
  }
  if (!input.reference.source || !validTimestamp(input.checkedAt)) {
    return "Reference source and check time are required.";
  }
  if (input.reference.observedAt !== null && !validTimestamp(input.reference.observedAt)) {
    return "Reference observation time must be a valid timestamp.";
  }
  if (input.reference.observedAt !== null && Date.parse(input.reference.observedAt) > Date.parse(input.checkedAt)) {
    return "Reference observation time cannot be after the stock check time.";
  }
  if (!Number.isInteger(input.reference.maxFreshnessSeconds) || input.reference.maxFreshnessSeconds < 0) {
    return "Reference freshness limit is invalid.";
  }
  if (!validNonNegativeInteger(input.reference.freshnessSeconds)) {
    return "Reference freshness must be a non-negative integer in seconds.";
  }
  if (parseBaseUnits(input.reference.priceBaseUnits) === null && input.reference.priceBaseUnits !== null) {
    return "Reference price must be a non-negative base-unit integer.";
  }
  if (parseBaseUnits(input.inventory.availableBaseUnits) === null && input.inventory.availableBaseUnits !== null) {
    return "Inventory must be a non-negative base-unit integer.";
  }
  if (!input.liquidity.poolAddress || parseBaseUnits(input.liquidity.minimumDepthBaseUnits) === null) {
    return "Liquidity pool and minimum depth are required.";
  }
  if (!validNonNegativeInteger(input.liquidity.estimatedPriceImpactBps) || !Number.isInteger(input.liquidity.maximumPriceImpactBps) || input.liquidity.maximumPriceImpactBps < 0) return "Liquidity price-impact values must be non-negative integers.";
  if (!validNonNegativeInteger(input.volatility.stockMoveBps) || !validNonNegativeInteger(input.volatility.memeMoveBps) || !validNonNegativeInteger(input.volatility.divergenceBps) || !Number.isInteger(input.volatility.maximumDivergenceBps) || input.volatility.maximumDivergenceBps < 0) return "Volatility values must be non-negative integers.";
  return null;
}

function issuerCheck(input: StockCheckInput): StockCheckEvidence {
  if (input.issuer.approvedTokenAddress !== null && input.issuer.approvedTokenAddress !== input.market.stockMint) {
    return { id: "issuer_token_address", status: "blocked", detail: "The issuer record names a different token address than the supported stock mint." };
  }
  if (input.issuer.approvalStatus === "verified") {
    return { id: "issuer_token_address", status: "pass", detail: "The issuer record is verified and matches the exact supported stock token address." };
  }
  if (input.issuer.approvalStatus === "reported") {
    return { id: "issuer_token_address", status: "unknown", detail: "The issuer and token address are reported but not independently verified." };
  }
  return { id: "issuer_token_address", status: "unknown", detail: "No verified issuer approval record for the exact stock token address is available." };
}

function eligibilityCheck(input: StockCheckInput): StockCheckEvidence {
  if (input.eligibility.status === "ineligible") {
    return { id: "stock_token_eligibility", status: "blocked", detail: "The stock token is marked ineligible for FLOAT's supported market scope." };
  }
  if (input.eligibility.status === "restricted" || input.eligibility.jurisdiction === "limited") {
    return { id: "stock_token_eligibility", status: "unknown", detail: `Stock-token eligibility is jurisdiction-limited: ${input.eligibility.limitations.join(" ")}` };
  }
  if (input.eligibility.status === "eligible" && input.eligibility.jurisdiction === "unrestricted") {
    return { id: "stock_token_eligibility", status: "pass", detail: "The stock token is eligible for the declared FLOAT scope and has no recorded jurisdiction limitation." };
  }
  return { id: "stock_token_eligibility", status: "unknown", detail: "Stock-token eligibility or jurisdiction coverage is unavailable." };
}

function referenceCheck(input: StockCheckInput): StockCheckEvidence {
  if (input.reference.priceBaseUnits === null || input.reference.observedAt === null || input.reference.freshnessSeconds === null) {
    return { id: "reference_price", status: "unknown", detail: "No complete, timestamped reference price is available." };
  }
  const price = parseBaseUnits(input.reference.priceBaseUnits);
  if (price === null || price === 0n) {
    return { id: "reference_price", status: "blocked", detail: "The reference price is missing or not positive." };
  }
  if (input.reference.freshnessSeconds < 0 || input.reference.freshnessSeconds > input.reference.maxFreshnessSeconds) {
    return { id: "reference_price", status: "blocked", detail: "The reference price is stale for the campaign decision." };
  }
  return { id: "reference_price", status: "pass", detail: "A positive reference price has a source, timestamp, and acceptable freshness." };
}

function inventoryCheck(input: StockCheckInput): StockCheckEvidence {
  const inventory = parseBaseUnits(input.inventory.availableBaseUnits);
  if (input.inventory.redeemability === "verified" && inventory !== null && inventory > 0n) {
    return { id: "stock_inventory", status: "pass", detail: "Positive inventory and verified redeemability evidence are available." };
  }
  if (input.inventory.redeemability === "reported") {
    return { id: "stock_inventory", status: "unknown", detail: "Inventory or redeemability is reported but not independently verified." };
  }
  return { id: "stock_inventory", status: "unknown", detail: "Verified stock inventory or redeemability evidence is unavailable." };
}

function liquidityCheck(input: StockCheckInput): StockCheckEvidence {
  const depth = parseBaseUnits(input.liquidity.depthBaseUnits);
  const minimumDepth = parseBaseUnits(input.liquidity.minimumDepthBaseUnits);
  if (depth === null || minimumDepth === null || input.liquidity.estimatedPriceImpactBps === null) {
    return { id: "stock_side_liquidity", status: "unknown", detail: "Depth and fixed-size price-impact evidence are incomplete." };
  }
  if (depth < minimumDepth) {
    return { id: "stock_side_liquidity", status: "blocked", detail: "Stock-side depth is below the minimum campaign threshold." };
  }
  if (input.liquidity.estimatedPriceImpactBps > input.liquidity.maximumPriceImpactBps) {
    return { id: "stock_side_liquidity", status: "blocked", detail: "The fixed campaign size would cause excessive price impact." };
  }
  return { id: "stock_side_liquidity", status: "pass", detail: "The fixed campaign size fits the observed depth and price-impact limit." };
}

function volatilityCheck(input: StockCheckInput): StockCheckEvidence {
  if (input.volatility.stockMoveBps === null || input.volatility.memeMoveBps === null || input.volatility.divergenceBps === null) {
    return { id: "volatility_and_divergence", status: "unknown", detail: "The stock, meme, or divergence window is incomplete." };
  }
  if (input.volatility.divergenceBps > input.volatility.maximumDivergenceBps) {
    return { id: "volatility_and_divergence", status: "blocked", detail: "Stock and pool movement diverge beyond the configured limit." };
  }
  return { id: "volatility_and_divergence", status: "pass", detail: "The observed movement and divergence are within the configured limit." };
}

function statusFromEvidence(evidence: readonly StockCheckEvidence[]): StockCheckStatus {
  if (evidence.some((item) => item.status === "blocked")) return "blocked";
  if (evidence.some((item) => item.status === "unknown")) return "unknown";
  return "pass";
}

function thinLiquidityFromEvidence(evidence: StockCheckEvidence, input: StockCheckInput): ThinLiquidityStatus {
  if (evidence.status === "blocked") return "high";
  if (evidence.status === "unknown") return "unknown";
  const depth = parseBaseUnits(input.liquidity.depthBaseUnits);
  const minimumDepth = parseBaseUnits(input.liquidity.minimumDepthBaseUnits);
  if (depth === null || minimumDepth === null) return "unknown";
  return depth >= minimumDepth * 3n ? "low" : "watch";
}

export function runStockCheck(input: StockCheckInput): Result<StockCheckReport, StockCheckError> {
  const invalidReason = validateInput(input);
  if (invalidReason !== null) {
    return {
      ok: false,
      code: "INVALID_STOCK_CHECK_INPUT",
      message: invalidReason,
      retryable: false,
    };
  }

  const evidence = [issuerCheck(input), eligibilityCheck(input), referenceCheck(input), inventoryCheck(input), liquidityCheck(input), volatilityCheck(input)] as const;
  const blockers = evidence.filter((item) => item.status === "blocked").map((item) => item.detail);
  const warnings = evidence.filter((item) => item.status === "unknown").map((item) => item.detail);
  const liquidityEvidence = evidence.find((item) => item.id === "stock_side_liquidity");
  const inventoryEvidence = evidence.find((item) => item.id === "stock_inventory");
  const stockToken = stockTokenForMarket(input);
  if (stockToken === null) {
    return {
      ok: false,
      code: "INVALID_STOCK_CHECK_INPUT",
      message: "Stock mint must match one of the market token identities.",
      retryable: false,
    };
  }

  return {
    ok: true,
    value: {
      marketId: input.market.id,
      status: statusFromEvidence(evidence),
      stock: {
        symbol: stockToken.symbol,
        mint: input.market.stockMint,
        tokenAddress: input.market.stockMint,
        programId: stockToken.programId,
        decimals: stockToken.decimals,
      },
      issuer: {
        name: input.issuer.name,
        approvalStatus: input.issuer.approvalStatus,
        approvedTokenAddress: input.issuer.approvedTokenAddress,
        source: input.issuer.source,
        status: evidence[0].status,
      },
      eligibility: {
        status: input.eligibility.status,
        jurisdiction: input.eligibility.jurisdiction,
        limitations: input.eligibility.limitations,
        source: input.eligibility.source,
        evidenceStatus: evidence[1].status,
      },
      reference: {
        source: input.reference.source,
        priceBaseUnits: input.reference.priceBaseUnits,
        observedAt: input.reference.observedAt,
        freshnessSeconds: input.reference.freshnessSeconds,
        status: evidence[2].status,
      },
      inventory: {
        availableBaseUnits: input.inventory.availableBaseUnits,
        redeemability: input.inventory.redeemability,
        status: inventoryEvidence?.status ?? "unknown",
      },
      liquidity: {
        poolAddress: input.liquidity.poolAddress,
        depthBaseUnits: input.liquidity.depthBaseUnits,
        estimatedPriceImpactBps: input.liquidity.estimatedPriceImpactBps,
        thinLiquidity: thinLiquidityFromEvidence(liquidityEvidence ?? { id: "stock_side_liquidity", status: "unknown", detail: "Liquidity evidence is missing." }, input),
        status: liquidityEvidence?.status ?? "unknown",
      },
      volatility: {
        stockMoveBps: input.volatility.stockMoveBps,
        memeMoveBps: input.volatility.memeMoveBps,
        divergenceBps: input.volatility.divergenceBps,
        status: evidence[5].status,
      },
      evidence,
      blockers,
      warnings,
      checkedAt: input.checkedAt,
      doesNotProve: DOES_NOT_PROVE,
    },
  };
}
