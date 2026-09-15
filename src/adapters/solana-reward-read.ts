/**
 * Finalized Raydium reward-slot evidence reader. Built against
 * @solana/web3.js 1.99.0, @solana/spl-token 0.4.15, and
 * @raydium-io/raydium-sdk-v2 0.2.69-alpha, using their installed source on
 * 2026-09-15. No wallet, signer, transaction, or broadcaster is accepted.
 */

import { getAccount, getMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import type { Result } from "../domain/contracts";
import { buildRewardEvidenceReport, type RewardEvidenceError, type RewardEvidenceReport, type RewardSlotInput } from "../domain/reward-evidence";
import type { DiscoverMarket } from "../domain/market-catalog";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

export interface RewardReadUnavailable {
  code: "REWARD_READ_UNAVAILABLE";
  message: string;
  retryable: true;
}

function parsePublicKey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

function tokenProgramForOwner(owner: PublicKey): PublicKey | null {
  if (owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  if (owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return null;
}

export async function readFinalizedRewardEvidence(
  connection: Connection,
  market: DiscoverMarket,
): Promise<Result<RewardEvidenceReport, RewardEvidenceError | RewardReadUnavailable>> {
  const expectedProgram = parsePublicKey(market.raydiumProgram);
  const poolId = parsePublicKey(market.pool);
  if (expectedProgram === null || poolId === null) {
    return { ok: false, code: "REWARD_READ_UNAVAILABLE", message: "The reward evidence identity is not a valid Solana address.", retryable: true };
  }

  try {
    const raydium = await Raydium.load({
      connection,
      apiRequestInterval: -1,
      disableFeatureCheck: true,
      disableLoadToken: true,
    });
    const pool = await raydium.clmm.getPoolInfoFromRpc(market.pool);
    if (!pool.computePoolInfo.programId.equals(expectedProgram)) {
      return { ok: false, code: "REWARD_READ_UNAVAILABLE", message: "The pool program does not match the catalog identity.", retryable: true };
    }

    const poolAccount = await connection.getAccountInfo(poolId, "finalized");
    if (poolAccount === null || poolAccount.data.length < 73 || !poolAccount.owner.equals(expectedProgram)) {
      return { ok: false, code: "REWARD_READ_UNAVAILABLE", message: "The finalized pool account could not be verified against the catalog program.", retryable: true };
    }
    const poolOwner = new PublicKey(poolAccount.data.subarray(41, 73)).toBase58();
    const rewardInfos = pool.rpcPoolInfo.rewardInfos;
    const initializedSlots = rewardInfos.flatMap((reward, index) => reward.mint.equals(PublicKey.default) ? [] : [index]);
    const firstEmptySlot = rewardInfos.findIndex((reward) => reward.mint.equals(PublicKey.default));
    const rewardSlots: RewardSlotInput[] = [];

    for (const [slot, reward] of rewardInfos.entries()) {
      if (reward.mint.equals(PublicKey.default)) continue;
      const mintInfo = await connection.getAccountInfo(reward.mint, "finalized");
      if (mintInfo === null) throw new Error("reward mint account is missing");
      const tokenProgramId = tokenProgramForOwner(mintInfo.owner);
      if (tokenProgramId === null) throw new Error("reward mint uses an unsupported token program");
      const mint = await getMint(connection, reward.mint, "finalized", tokenProgramId);
      const vault = await getAccount(connection, reward.vault, "finalized", tokenProgramId);
      if (!vault.mint.equals(reward.mint)) throw new Error("reward vault mint does not match reward mint");
      rewardSlots.push({
        slot,
        state: reward.state,
        rewardMint: reward.mint.toBase58(),
        rewardVault: reward.vault.toBase58(),
        creator: reward.creator.toBase58(),
        openTime: reward.openTime.toString(10),
        endTime: reward.endTime.toString(10),
        emissionsPerSecondX64: reward.emissionsPerSecondX64.toString(10),
        totalEmittedRaw: reward.totalEmissioned.toString(10),
        claimedRaw: reward.claimed.toString(10),
        vaultBalanceRaw: vault.amount.toString(10),
        vaultMint: vault.mint.toBase58(),
        vaultOwner: vault.owner.toBase58(),
        tokenProgramId: mintInfo.owner.toBase58(),
        tokenDecimals: mint.decimals,
      });
    }

    const observedSlot = await connection.getSlot("finalized");
    return buildRewardEvidenceReport({
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
      poolOwner,
      rewardSlots,
      initializedSlots,
      availableSlot: firstEmptySlot === -1 ? null : firstEmptySlot,
      ansem: { mint: null, status: "unknown", source: null },
      authority: { poolOwnerVerified: false, rewardFunder: null, authorityVerified: false, source: null },
      funding: { status: "unknown", source: null },
      observedSlot,
      observedAt: new Date().toISOString(),
      source: "solana_rpc",
    });
  } catch (error: unknown) {
    console.error(JSON.stringify({ event: "reward_evidence_read_failed", marketId: market.id, message: error instanceof Error ? error.message : String(error) }));
    return { ok: false, code: "REWARD_READ_UNAVAILABLE", message: "Finalized Raydium reward evidence could not be read.", retryable: true };
  }
}
