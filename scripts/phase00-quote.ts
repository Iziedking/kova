/**
 * Read-only sized quote proof for the pinned phase-00 candidate. This script
 * never connects a wallet, creates a transaction, or sends a transaction.
 */

import { Connection } from "@solana/web3.js";
import { PHASE00_CANDIDATE } from "../src/domain/phase00-feasibility";
import { readCandidateSizedQuote } from "../src/adapters/raydium-quote-read";

async function main(): Promise<void> {
  const endpoint = process.env.FLOAT_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const inputMint = (process.env.FLOAT_PHASE00_QUOTE_INPUT_MINT ?? PHASE00_CANDIDATE.token1.mint).trim();
  const amountInRaw = (process.env.FLOAT_PHASE00_QUOTE_AMOUNT_RAW ?? "10000000000").trim();
  const marketId = (process.env.FLOAT_PHASE00_QUOTE_MARKET_ID ?? PHASE00_CANDIDATE.id).trim();
  const poolId = (process.env.FLOAT_PHASE00_QUOTE_POOL ?? PHASE00_CANDIDATE.pool).trim();
  const connection = new Connection(endpoint, "finalized");
  const result = await readCandidateSizedQuote(connection, {
    inputMint,
    amountInRaw,
    marketId,
    poolId,
    slippageBps: 100,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, code: "QUOTE_PROOF_FAILED", message: String(error) }));
  process.exitCode = 1;
});
