/**
 * Read-only FLOAT stock inventory monitor proof. Built against
 * @solana/web3.js 1.99.0, @solana/spl-token 0.4.15, and
 * @raydium-io/raydium-sdk-v2 0.2.69-alpha on 2026-09-15. It reads finalized
 * mint and pool-vault state only and never accepts a wallet or sends a write.
 */

import { Connection } from "@solana/web3.js";
import { readFloatMonitor } from "../src/adapters/solana-float-read";
import { marketById } from "../src/domain/market-catalog";

const endpoint = process.env.FLOAT_SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
const marketId = process.env.FLOAT_FLOAT_MONITOR_MARKET_ID?.trim() || "stonk-spyx";

if (!endpoint.startsWith("https://")) throw new Error("FLOAT_SOLANA_RPC_URL must use HTTPS.");

async function main(): Promise<void> {
  const market = marketById(marketId);
  if (market === undefined) throw new Error(`Market ${marketId} is not in the supported catalog.`);
  const result = await readFloatMonitor(new Connection(endpoint, "finalized"), market);
  console.log(JSON.stringify({ endpoint, marketId, result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, code: "FLOAT_MONITOR_FAILED", message: String(error) }));
  process.exitCode = 1;
});
