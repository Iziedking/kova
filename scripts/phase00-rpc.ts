import { Connection } from "@solana/web3.js";
import { readCandidatePool, readCandidatePoolWithSdk } from "../src/adapters/raydium-read";

const endpoint = process.env.FLOAT_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
if (!endpoint.startsWith("https://")) throw new Error("FLOAT_SOLANA_RPC_URL must use HTTPS.");

async function main() {
  const result = await readCandidatePool(new Connection(endpoint, "finalized"));
  const sdkResult = await readCandidatePoolWithSdk(new Connection(endpoint, "finalized"));
  console.log(JSON.stringify({ endpoint, rpc: result, sdk: sdkResult }, null, 2));
  if (!result.ok || !sdkResult.ok) process.exitCode = 1;
}

void main();
