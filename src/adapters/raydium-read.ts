import { getMint } from "@solana/spl-token";
import { Connection, PublicKey, type Commitment } from "@solana/web3.js";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import type { MarketIdentity, Result } from "../domain/contracts";
import { PHASE00_CANDIDATE } from "../domain/phase00-feasibility";

export interface RpcMintObservation {
  mint: string;
  programId: string;
  decimals: number;
  hasFreezeAuthority: boolean;
}

export interface RpcPoolObservation {
  market: MarketIdentity;
  observedSlot: number;
  poolOwner: string;
  poolAccountBytes: number;
  mints: readonly RpcMintObservation[];
}

export interface SdkPoolObservation {
  poolId: string;
  programId: string;
  currentPrice: number;
  currentTick: number;
  tickArrayCount: number;
  rewardMints: readonly string[];
}

/**
 * Read-only RPC seam for phase 00. It accepts no owner, signer or broadcaster.
 * The caller must still compare this result with the exact candidate registry.
 */
export async function readCandidatePool(
  connection: Connection,
  commitment: Commitment = "finalized",
): Promise<Result<RpcPoolObservation>> {
  try {
    const poolAddress = new PublicKey(PHASE00_CANDIDATE.pool);
    const poolAccount = await connection.getAccountInfo(poolAddress, commitment);
    if (!poolAccount) {
      return { ok: false, code: "POOL_NOT_FOUND", message: "The candidate pool account was not found.", retryable: true };
    }
    if (!poolAccount.owner.equals(new PublicKey(PHASE00_CANDIDATE.programId))) {
      return { ok: false, code: "POOL_PROGRAM_MISMATCH", message: "The candidate pool is owned by an unexpected program.", retryable: false };
    }
    if (poolAccount.data.length !== 1544) {
      return { ok: false, code: "POOL_LAYOUT_MISMATCH", message: "The candidate pool account has an unexpected layout size.", retryable: false };
    }

    const mints = await Promise.all([PHASE00_CANDIDATE.token0, PHASE00_CANDIDATE.token1].map(async (token) => {
      const mint = await getMint(
        connection,
        new PublicKey(token.mint),
        commitment,
        new PublicKey(token.programId),
      );
      return {
        mint: token.mint,
        programId: token.programId,
        decimals: mint.decimals,
        hasFreezeAuthority: mint.freezeAuthority !== null,
      } satisfies RpcMintObservation;
    }));

    const observedSlot = await connection.getSlot(commitment);
    const poolOwner = new PublicKey(poolAccount.data.subarray(41, 73)).toBase58();
    return {
      ok: true,
      value: {
        market: PHASE00_CANDIDATE,
        observedSlot,
        poolOwner,
        poolAccountBytes: poolAccount.data.length,
        mints,
      },
    };
  } catch {
    return { ok: false, code: "RPC_UNAVAILABLE", message: "The candidate pool could not be read from finalized RPC.", retryable: true };
  }
}

/**
 * Read the same candidate through the pinned Raydium SDK. Loading with no
 * owner and no signing callback is intentional: this function cannot build a
 * user operation or obtain a wallet signature.
 */
export async function readCandidatePoolWithSdk(
  connection: Connection,
): Promise<Result<SdkPoolObservation>> {
  try {
    const raydium = await Raydium.load({
      connection,
      apiRequestInterval: -1,
      disableFeatureCheck: true,
      disableLoadToken: true,
    });
    const result = await raydium.clmm.getPoolInfoFromRpc(PHASE00_CANDIDATE.pool);
    const rewardMints = result.rpcPoolInfo.rewardInfos
      .filter((reward) => !reward.mint.equals(PublicKey.default))
      .map((reward) => reward.mint.toBase58());
    return {
      ok: true,
      value: {
        poolId: result.poolInfo.id,
        programId: result.poolInfo.programId,
        currentPrice: result.poolInfo.price,
        currentTick: result.rpcPoolInfo.tickCurrent,
        tickArrayCount: result.tickArrays.length,
        rewardMints,
      },
    };
  } catch {
    return { ok: false, code: "SDK_READ_UNAVAILABLE", message: "The pinned Raydium SDK could not read the candidate pool.", retryable: true };
  }
}
