/**
 * Live KOVA Dealer probe. Sends exact mints through the real ClawPump agent and the
 * full admission gate, then prints only the outcome. The API key is read from the
 * environment and never printed.
 *
 * Usage: npx tsx scripts/devnet/probe-dealer.ts <mint> [<mint> ...]
 */
import { Connection } from "@solana/web3.js";
import { ClawPumpAdmissionClient } from "../../src/adapters/game/clawpump";
import { runAdmission } from "../../src/application/game/admission";

async function main(): Promise<void> {
  const apiKey = process.env.CLAWPUMP_API_KEY;
  const agentId = process.env.KOVA_DEALER_AGENT_ID;
  if (!apiKey || !agentId) throw new Error("Set CLAWPUMP_API_KEY and KOVA_DEALER_AGENT_ID.");
  const mints = process.argv.slice(2);
  if (mints.length === 0) throw new Error("Pass at least one exact Solana mint.");
  const connection = new Connection(process.env.KOVA_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "finalized");
  const dealer = new ClawPumpAdmissionClient({ apiKey, agentId, model: process.env.KOVA_DEALER_MODEL || undefined });
  for (const mint of mints) {
    const startedAt = Date.now();
    try {
      const budget = Number(process.env.KOVA_DEALER_TOOL_BUDGET ?? "2");
      const result = await runAdmission({ mint, requestTimestamp: new Date().toISOString(), connection, dealer, toolBudget: budget === 0 || budget === 1 ? budget : 2 });
      console.log(JSON.stringify({
        mint,
        ok: result.ok,
        code: result.code,
        decision: result.decision?.decision ?? null,
        confidence: result.decision?.confidence ?? null,
        reasons: result.decision?.reasons ?? null,
        toolsUsed: result.receipt.toolsUsed,
        costMicroUsd: result.receipt.costMicroUsd,
        latencyMs: Date.now() - startedAt,
      }));
    } catch (error) {
      console.log(JSON.stringify({ mint, ok: false, code: "DEALER_UNAVAILABLE", detail: error instanceof Error ? error.message : "unknown", latencyMs: Date.now() - startedAt }));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
