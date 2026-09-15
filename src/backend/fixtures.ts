import { CAMPAIGN_CATALOG, type CampaignPreview } from "../domain/campaign-catalog";
import { MARKET_CATALOG, marketById, type DiscoverMarket } from "../domain/market-catalog";
import { buildPhase00Report, PHASE00_CANDIDATE } from "../domain/phase00-feasibility";
import { runStockCheck, type StockCheckReport } from "../domain/stock-check";
import { buildUnderwritingReport, type UnderwritingReport } from "../domain/underwriting";
import type { Result } from "../domain/contracts";
import { hashEvidence } from "./evidence";

const INITIAL_CHECK_TIME = "2026-09-15T06:00:30.000Z";

export function listMarketFixtures(): readonly DiscoverMarket[] {
  return MARKET_CATALOG;
}

export function findMarketFixture(id: string): DiscoverMarket | undefined {
  return marketById(id);
}

export function listCampaignFixtures(): readonly CampaignPreview[] {
  return CAMPAIGN_CATALOG;
}

export function findCampaignFixture(id: string): CampaignPreview | undefined {
  return CAMPAIGN_CATALOG.find((campaign) => campaign.id === id);
}

export function buildInitialStockCheck(marketId: string): Result<StockCheckReport> {
  if (marketId !== PHASE00_CANDIDATE.id) {
    return {
      ok: false,
      code: "STOCK_CHECK_NOT_AVAILABLE",
      message: "A stock check is not available for this market yet.",
      retryable: false,
    };
  }

  return runStockCheck({
    market: PHASE00_CANDIDATE,
    issuer: {
      name: "xStocks",
      approvalStatus: "reported",
      approvedTokenAddress: PHASE00_CANDIDATE.stockMint,
      source: "fixture:stock-identity-v1",
    },
    eligibility: {
      status: "unknown",
      jurisdiction: "unknown",
      limitations: ["The fixture has no current issuer eligibility record or jurisdiction coverage."],
      source: null,
    },
    reference: {
      source: "fixture:stock-reference-v1",
      priceBaseUnits: "310000000",
      observedAt: "2026-09-15T06:00:00.000Z",
      freshnessSeconds: 30,
      maxFreshnessSeconds: 300,
    },
    inventory: {
      availableBaseUnits: null,
      redeemability: "unavailable",
    },
    liquidity: {
      poolAddress: PHASE00_CANDIDATE.pool,
      depthBaseUnits: "1000000000",
      minimumDepthBaseUnits: "100000000",
      estimatedPriceImpactBps: 45,
      maximumPriceImpactBps: 100,
    },
    volatility: {
      stockMoveBps: 120,
      memeMoveBps: 260,
      divergenceBps: 80,
      maximumDivergenceBps: 500,
    },
    checkedAt: INITIAL_CHECK_TIME,
  });
}

export function buildUnderwritingFromStockCheck(marketId: string, stockCheck: StockCheckReport): Result<UnderwritingReport> {
  const phase00 = buildPhase00Report();
  return {
    ok: true,
    value: buildUnderwritingReport({
      marketId,
      stockCheck,
      stockCheckReportHash: hashEvidence(stockCheck),
      feasibility: phase00,
      feasibilityReportHash: hashEvidence(phase00),
    }),
  };
}

export function buildUnderwritingFixture(marketId: string): Result<UnderwritingReport> {
  const stockCheck = buildInitialStockCheck(marketId);
  if (!stockCheck.ok) return stockCheck;
  return buildUnderwritingFromStockCheck(marketId, stockCheck.value);
}
