/**
 * Finalized read-only Initial StockCheck adapter. Built against
 * @solana/web3.js 1.99.0 and the existing FLOAT Solana monitor seam, using
 * installed package source reviewed on 2026-09-15. No wallet, signer,
 * transaction, broadcaster, issuer provider, or reference-price provider is
 * accepted. The pure input mapping is also consumed by adapter tests.
 */

import { Connection } from "@solana/web3.js";
import type { Result } from "../domain/contracts";
import type { DiscoverMarket } from "../domain/market-catalog";
import type { FloatMonitorReport } from "../domain/float-monitor";
import { runStockCheck, type StockCheckInput, type StockCheckReport } from "../domain/stock-check";
import { readFloatMonitor } from "./solana-float-read";

export interface StockCheckReadError {
  code: "STOCK_CHECK_READ_UNAVAILABLE";
  message: string;
  retryable: true;
}

/**
 * Maps verified pool and mint observations into the pure stock-check engine.
 * The monitor proves the exact token identity and one pool vault only. It does
 * not provide issuer approval, jurisdiction, redemption, reference price, or
 * volatility evidence, so those fields deliberately remain unknown.
 */
export function buildFinalizedStockCheckInput(
  market: DiscoverMarket,
  monitor: FloatMonitorReport,
): StockCheckInput {
  return {
    market: {
      id: market.id,
      cluster: "mainnet-beta",
      pool: market.pool,
      programId: market.raydiumProgram,
      token0: {
        mint: market.stockMint,
        programId: market.stockProgramId,
        decimals: market.stockDecimals,
        symbol: market.stockSymbol,
        issuer: "xstocks",
      },
      token1: {
        mint: market.memeMint,
        programId: market.memeProgramId,
        decimals: market.memeDecimals,
        symbol: market.memeSymbol,
        issuer: "community",
      },
      stockMint: market.stockMint,
      feeRateMillionths: 0,
      tickSpacing: monitor.tickSpacing,
    },
    issuer: {
      name: null,
      approvalStatus: "unknown",
      approvedTokenAddress: null,
      source: null,
    },
    eligibility: {
      status: "unknown",
      jurisdiction: "unknown",
      limitations: ["No current issuer eligibility or jurisdiction record was read by this adapter."],
      source: null,
    },
    reference: {
      source: "unavailable: approved stock reference not configured",
      priceBaseUnits: null,
      observedAt: null,
      freshnessSeconds: null,
      maxFreshnessSeconds: 300,
    },
    inventory: {
      availableBaseUnits: monitor.observedPoolInventoryRaw,
      redeemability: "unknown",
    },
    liquidity: {
      poolAddress: market.pool,
      depthBaseUnits: monitor.observedPoolInventoryRaw,
      minimumDepthBaseUnits: "1",
      estimatedPriceImpactBps: null,
      maximumPriceImpactBps: 100,
    },
    volatility: {
      stockMoveBps: null,
      memeMoveBps: null,
      divergenceBps: null,
      maximumDivergenceBps: 500,
    },
    checkedAt: monitor.observedAt,
  };
}

export async function readFinalizedStockCheck(
  connection: Connection,
  market: DiscoverMarket,
): Promise<Result<StockCheckReport, StockCheckReadError>> {
  const monitor = await readFloatMonitor(connection, market);
  if (!monitor.ok) {
    return {
      ok: false,
      code: "STOCK_CHECK_READ_UNAVAILABLE",
      message: "Finalized stock identity or pool-vault evidence could not be read.",
      retryable: true,
    };
  }

  const report = runStockCheck(buildFinalizedStockCheckInput(market, monitor.value));
  if (!report.ok) {
    return {
      ok: false,
      code: "STOCK_CHECK_READ_UNAVAILABLE",
      message: "Finalized stock evidence did not satisfy the stock-check input contract.",
      retryable: true,
    };
  }
  return report;
}
