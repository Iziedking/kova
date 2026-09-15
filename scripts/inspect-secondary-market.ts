/**
 * Read-only secondary-market identity and pool inspection. Uses @solana/web3.js
 * and @raydium-io/raydium-sdk-v2 0.2.69-alpha source verified on 2026-09-15.
 * This script has no wallet, signer, transaction builder, or broadcaster.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { Raydium } from "@raydium-io/raydium-sdk-v2";

const endpoint = process.env.FLOAT_SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
if (!endpoint.startsWith("https://")) throw new Error("FLOAT_SOLANA_RPC_URL must use HTTPS.");

const addresses = {
  pool: "7a8xxAJBELDo6P9dikSYctdw6ce8F4mWr3ahcAD8Ao49",
  stockMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  memeMint: "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx",
} as const;

async function main(): Promise<void> {
  const connection = new Connection(endpoint, "finalized");
  const slot = await connection.getSlot("finalized");
  const accounts: Record<string, unknown> = {};

  for (const [name, address] of Object.entries(addresses)) {
    const publicKey = new PublicKey(address);
    if (name === "pool") {
      const account = await connection.getAccountInfo(publicKey, "finalized");
      accounts[name] = account === null
        ? null
        : {
          address,
          owner: account.owner.toBase58(),
          executable: account.executable,
          lamports: account.lamports,
          data: { bytes: account.data.length, poolOwner: new PublicKey(account.data.subarray(41, 73)).toBase58() },
        };
      continue;
    }

    const account = (await connection.getParsedAccountInfo(publicKey, "finalized")).value;
    accounts[name] = account === null
      ? null
      : {
        address,
        owner: account.owner.toBase58(),
        executable: account.executable,
        lamports: account.lamports,
        data: account.data,
      };
  }

  const raydium = await Raydium.load({
    connection,
    apiRequestInterval: -1,
    disableFeatureCheck: true,
    disableLoadToken: true,
  });
  const pool = await raydium.clmm.getPoolInfoFromRpc(addresses.pool);
  const rewardMints = pool.rpcPoolInfo.rewardInfos
    .filter((reward) => !reward.mint.equals(PublicKey.default))
    .map((reward) => reward.mint.toBase58());
  const sdk = {
    poolId: pool.poolInfo.id,
    programId: pool.poolInfo.programId,
    mintA: pool.computePoolInfo.mintA.address,
    mintB: pool.computePoolInfo.mintB.address,
    currentTick: pool.rpcPoolInfo.tickCurrent,
    tickSpacing: pool.rpcPoolInfo.tickSpacing,
    currentSqrtPriceX64: pool.computePoolInfo.sqrtPriceX64.toString(10),
    tickArrayStarts: pool.tickArrays.map((tickArray) => tickArray.startTickIndex),
    rewardMints,
  };

  console.log(JSON.stringify({ endpoint, observedSlot: slot, accounts, sdk }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, code: "SECONDARY_MARKET_READ_FAILED", message: String(error) }));
  process.exitCode = 1;
});
