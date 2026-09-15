/**
 * Read-only Raydium sized-quote adapter. Package source verified from
 * @raydium-io/raydium-sdk-v2 0.2.69-alpha on 2026-09-15. This adapter does
 * not receive an owner, wallet, signer, or broadcaster.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { PoolUtils, Raydium, TickArrayUtil } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import type { Result } from "../domain/contracts";
import { assessSizedQuote, type SizedQuoteReport } from "../domain/sized-quote";
import { PHASE00_CANDIDATE } from "../domain/phase00-feasibility";

export interface SizedQuoteRequest {
  amountInRaw: string;
  inputMint: string;
  marketId?: string;
  poolId?: string;
  slippageBps?: number;
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function asRawString(value: { raw: BN }): string {
  return value.raw.toString(10);
}

function invertFixedDecimal(value: string, places = 12): string {
  const [whole, fraction = ""] = value.split(".");
  const digits = `${whole}${fraction}`;
  const scaled = BigInt(digits);
  const sourceScale = 10n ** BigInt(fraction.length);
  const targetScale = 10n ** BigInt(places);
  const numerator = sourceScale * targetScale;
  const quotient = numerator / scaled;
  const remainder = numerator % scaled;
  const rounded = remainder * 2n >= scaled ? quotient + 1n : quotient;
  const rendered = rounded.toString().padStart(places + 1, "0");
  return `${rendered.slice(0, -places)}.${rendered.slice(-places)}`;
}

export function directedPriceHuman(price: string, inputIsMintA: boolean): string {
  return inputIsMintA ? price : invertFixedDecimal(price);
}

export async function readCandidateSizedQuote(
  connection: Connection,
  request: SizedQuoteRequest,
): Promise<Result<SizedQuoteReport>> {
  if (!isPositiveInteger(request.amountInRaw)) {
    return {
      ok: false,
      code: "QUOTE_AMOUNT_INVALID",
      message: "A sized quote requires a positive integer input amount in base units.",
      retryable: false,
    };
  }

  const slippageBps = request.slippageBps ?? 100;
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    return {
      ok: false,
      code: "QUOTE_SLIPPAGE_INVALID",
      message: "Quote slippage must be an integer between 0 and 10000 basis points.",
      retryable: false,
    };
  }

  let inputMint: PublicKey;
  try {
    inputMint = new PublicKey(request.inputMint);
  } catch {
    return {
      ok: false,
      code: "QUOTE_INPUT_MINT_INVALID",
      message: "The requested input mint is not a valid Solana address.",
      retryable: false,
    };
  }

  try {
    const raydium = await Raydium.load({
      connection,
      apiRequestInterval: -1,
      disableFeatureCheck: true,
      disableLoadToken: true,
    });
    const marketId = request.marketId ?? PHASE00_CANDIDATE.id;
    const poolId = request.poolId ?? PHASE00_CANDIDATE.pool;
    const pool = await raydium.clmm.getPoolInfoFromRpc(poolId);
    const inputIsMintA = inputMint.equals(new PublicKey(pool.computePoolInfo.mintA.address));
    const inputIsMintB = inputMint.equals(new PublicKey(pool.computePoolInfo.mintB.address));
    if (!inputIsMintA && !inputIsMintB) {
      return {
        ok: false,
        code: "QUOTE_INPUT_MINT_UNSUPPORTED",
        message: "The requested input mint is not one side of the candidate pool.",
        retryable: false,
      };
    }

    const outputToken = inputIsMintA ? pool.computePoolInfo.mintB : pool.computePoolInfo.mintA;
    const tickCache = pool.tickData[poolId] ?? {};
    const availableTickArrayStarts = Object.values(tickCache).map((tickArray) => tickArray.startTickIndex);
    const currentTickArrayStart = TickArrayUtil.getTickArrayStartIndex(
      pool.rpcPoolInfo.tickCurrent,
      pool.rpcPoolInfo.tickSpacing,
    );
    const epochInfo = await connection.getEpochInfo("finalized");
    const blockTimestamp = Math.floor(Date.now() / 1000);
    const quote = PoolUtils.computeAmountOutFormat({
      poolInfo: pool.computePoolInfo,
      tickarrayBitmapExtension: pool.computePoolInfo.exBitmapInfo,
      tickArrayCache: tickCache,
      amountIn: new BN(request.amountInRaw, 10),
      tokenOut: outputToken,
      slippage: slippageBps / 10_000,
      epochInfo,
      blockTimestamp,
      catchLiquidityInsufficient: true,
    });
    const addressToStart = new Map(Object.values(tickCache).map((tickArray) => [tickArray.address.toBase58(), tickArray.startTickIndex]));
    const usedTickArrayStarts = quote.remainingAccounts
      .map((address) => addressToStart.get(address.toBase58()))
      .filter((start): start is number => start !== undefined);
    const report = assessSizedQuote({
      marketId,
      poolId,
      inputMint: inputMint.toBase58(),
      outputMint: outputToken.address,
      inputDecimals: inputIsMintA ? pool.computePoolInfo.mintA.decimals : pool.computePoolInfo.mintB.decimals,
      outputDecimals: outputToken.decimals,
      amountInRaw: request.amountInRaw,
      amountOutRaw: asRawString(quote.amountOut.amount),
      minAmountOutRaw: asRawString(quote.minAmountOut.amount),
      feeAmountRaw: asRawString(quote.fee),
      observedSlot: await connection.getSlot("finalized"),
      observedAt: new Date().toISOString(),
      currentTick: pool.rpcPoolInfo.tickCurrent,
      tickSpacing: pool.rpcPoolInfo.tickSpacing,
      currentSqrtPriceX64: pool.computePoolInfo.sqrtPriceX64.toString(10),
      executionSqrtPriceX64: quote.executionPriceX64.toString(10),
      // Raydium's currentPrice wrapper keeps pool mintA -> mintB orientation;
      // invert it when the request is mintB -> mintA so the report's declared
      // unit remains output human units per input human unit.
      currentPriceHuman: directedPriceHuman(quote.currentPrice.toFixed(12), inputIsMintA),
      executionPriceHuman: quote.executionPrice.toFixed(12),
      availableTickArrayStarts,
      requiredTickArrayStarts: [currentTickArrayStart, ...usedTickArrayStarts],
      allTrade: quote.allTrade,
      source: "raydium_sdk",
    });
    return { ok: true, value: report };
  } catch {
    return {
      ok: false,
      code: "QUOTE_READ_UNAVAILABLE",
      message: "The candidate sized quote could not be computed from finalized Raydium data.",
      retryable: true,
    };
  }
}
