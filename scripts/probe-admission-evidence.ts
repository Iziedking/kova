/** Read-only exact-mint evidence probe. It never calls a wallet or transaction API. */
import { Connection } from "@solana/web3.js";
import { readDexPairs } from "../src/adapters/game/dexscreener";
import { readMintIdentity } from "../src/adapters/game/rpc";

async function main(): Promise<void> {
  const mint = process.argv[2];
  if (!mint) throw new Error("Usage: npm run probe:admission -- <exact-solana-mint>");
  const rpcUrl = process.env.KOVA_SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
  const [identity, pairs] = await Promise.all([readMintIdentity(new Connection(rpcUrl, "finalized"), mint), readDexPairs(mint)]);
  console.info(JSON.stringify({ schemaVersion: "kova-admission-evidence-v1", mint, identity, pairs: pairs.slice(0, 5).map((pair) => ({ dexId: pair.dexId, url: pair.url, pairAddress: pair.pairAddress, baseToken: pair.baseToken, quoteToken: pair.quoteToken, liquidityUsd: pair.liquidity?.usd ?? null, pairCreatedAt: pair.pairCreatedAt ?? null })) }, null, 2));
}

void main();

