/**
 * Read-only stock supply and pool-vault adapter. Built against
 * @solana/web3.js 1.99.0, @solana/spl-token 0.4.15, and
 * @raydium-io/raydium-sdk-v2 0.2.69-alpha, using their installed source on
 * 2026-09-15. No wallet, signer, transaction, or broadcaster is accepted.
 */

import { ExtensionType, getAccount, getExtensionTypes, getMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import type { Result } from "../domain/contracts";
import { buildFloatMonitorReport, type FloatMonitorError, type FloatMonitorReport } from "../domain/float-monitor";
import type { DiscoverMarket } from "../domain/market-catalog";

function parsePublicKey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

function extensionName(extensionType: ExtensionType): string {
  return ExtensionType[extensionType] ?? String(extensionType);
}

function publicKeyOrNull(value: PublicKey | null): string | null {
  return value?.toBase58() ?? null;
}

export async function readFloatMonitor(
  connection: Connection,
  market: DiscoverMarket,
): Promise<Result<FloatMonitorReport, FloatMonitorError | { code: "FLOAT_MONITOR_READ_UNAVAILABLE"; message: string; retryable: true }>> {
  const stockMint = parsePublicKey(market.stockMint);
  const stockProgram = parsePublicKey(market.stockProgramId);
  const expectedProgram = parsePublicKey(market.raydiumProgram);
  if (stockMint === null || stockProgram === null || expectedProgram === null) {
    return { ok: false, code: "FLOAT_MONITOR_READ_UNAVAILABLE", message: "The stock monitor identity is not a valid Solana address.", retryable: true };
  }

  try {
    const raydium = await Raydium.load({
      connection,
      apiRequestInterval: -1,
      disableFeatureCheck: true,
      disableLoadToken: true,
    });
    const pool = await raydium.clmm.getPoolInfoFromRpc(market.pool);
    if (!pool.computePoolInfo.programId.equals(expectedProgram)) return { ok: false, code: "FLOAT_MONITOR_READ_UNAVAILABLE", message: "The pool program does not match the catalog identity.", retryable: true };

    const isMintA = market.stockMint === pool.computePoolInfo.mintA.address;
    const isMintB = market.stockMint === pool.computePoolInfo.mintB.address;
    if (!isMintA && !isMintB) {
      return { ok: false, code: "FLOAT_MONITOR_READ_UNAVAILABLE", message: "The stock mint is not one side of the inspected pool.", retryable: true };
    }
    const vault = isMintA ? pool.rpcPoolInfo.vaultA : pool.rpcPoolInfo.vaultB;
    const mint = await getMint(connection, stockMint, "finalized", stockProgram);
    const vaultAccount = await getAccount(connection, vault, "finalized", stockProgram);
    if (!vaultAccount.mint.equals(stockMint)) {
      return { ok: false, code: "FLOAT_MONITOR_READ_UNAVAILABLE", message: "The selected pool vault is not for the stock mint.", retryable: true };
    }
    if (mint.decimals !== (isMintA ? pool.computePoolInfo.mintA.decimals : pool.computePoolInfo.mintB.decimals)) {
      return { ok: false, code: "FLOAT_MONITOR_READ_UNAVAILABLE", message: "Mint decimals do not match the Raydium pool identity.", retryable: true };
    }

    const observedSlot = await connection.getSlot("finalized");
    const result = buildFloatMonitorReport({
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
        tickSpacing: pool.rpcPoolInfo.tickSpacing,
      },
      supplyBaseUnits: mint.supply.toString(10),
      observedPoolInventoryRaw: vaultAccount.amount.toString(10),
      tickSpacing: pool.rpcPoolInfo.tickSpacing,
      stockMintAuthority: publicKeyOrNull(mint.mintAuthority),
      stockFreezeAuthority: publicKeyOrNull(mint.freezeAuthority),
      stockTokenExtensions: getExtensionTypes(mint.tlvData).map(extensionName),
      observedSlot,
      observedAt: new Date().toISOString(),
      source: "solana_rpc",
    });
    return result;
  } catch (error: unknown) {
    console.error(JSON.stringify({ event: "float_monitor_read_failed", marketId: market.id, message: error instanceof Error ? error.message : String(error) }));
    return { ok: false, code: "FLOAT_MONITOR_READ_UNAVAILABLE", message: "Finalized stock supply or pool-vault evidence could not be read.", retryable: true };
  }
}
