import { createHash } from "node:crypto";
import type { Connection } from "@solana/web3.js";
import { readDexPairs } from "../../adapters/game/dexscreener";
import { readMintIdentity } from "../../adapters/game/rpc";
import type { ClawPumpAdmissionClient } from "../../adapters/game/clawpump";
import { publicAdmissionProjection, validateAdmissionDecision, type AdmissionDecision } from "../../domain/game/admission";

const ALLOWED_READ_TOOLS = new Set(["bitget_coin_market_info", "bitget_security_check", "bitget_coin_dev", "news_search"]);

export interface AdmissionRunResult {
  ok: boolean;
  decision: AdmissionDecision | null;
  code: string | null;
  evidenceHash: string;
  publicProjection: ReturnType<typeof publicAdmissionProjection> | null;
  receipt: { providerRequestId: string | null; model: string | null; costMicroUsd: string; toolsUsed: readonly string[]; isolationStatus: "soft_prompt_only"; result: string };
}

export async function runAdmission(input: {
  mint: string;
  requestTimestamp: string;
  connection: Connection;
  dealer: ClawPumpAdmissionClient;
  fetcher?: typeof fetch;
}): Promise<AdmissionRunResult> {
  const attempts: { capability: string; result: string; detail: string }[] = [];
  const mintIdentity = await readMintIdentity(input.connection, input.mint).then((value) => {
    attempts.push({ capability: "solana_rpc_getParsedAccountInfo", result: "success", detail: `Finalized exact-mint read at slot ${value.slot}.` });
    return value;
  }).catch((error: unknown) => {
    attempts.push({ capability: "solana_rpc_getParsedAccountInfo", result: "failed", detail: error instanceof Error ? error.message : "RPC read failed." });
    return null;
  });
  const pairs = await readDexPairs(input.mint, input.fetcher).then((value) => {
    attempts.push({ capability: "dexscreener_token_pairs", result: "success", detail: `${value.length} exact-mint pairs returned.` });
    return value.slice(0, 5);
  }).catch((error: unknown) => {
    attempts.push({ capability: "dexscreener_token_pairs", result: "failed", detail: error instanceof Error ? error.message : "Market read failed." });
    return [];
  });
  const dossier = { network: "solana-mainnet", mint: input.mint, requestTimestamp: input.requestTimestamp, authoritativeEvidence: { mintIdentity, pairs }, researchAttempts: attempts };
  const evidenceHash = createHash("sha256").update(JSON.stringify(dossier)).digest("hex");
  const provider = await input.dealer.classify([
    "Apply the enabled KOVA Admission Dealer skill to this exact request.",
    "Treat authoritativeEvidence as caller-supplied evidence that must still be checked for consistency.",
    "Use read-only tools only. Return strict JSON only.",
    JSON.stringify(dossier),
  ].join("\n"));
  const unsafeTools = provider.toolsUsed.filter((tool) => !ALLOWED_READ_TOOLS.has(tool));
  const receipt = {
    providerRequestId: provider.requestId,
    model: provider.model,
    costMicroUsd: String(Math.max(0, Math.round(provider.costUsd * 1_000_000))),
    toolsUsed: provider.toolsUsed,
    isolationStatus: "soft_prompt_only" as const,
    result: unsafeTools.length > 0 ? "unsafe_tool_invoked" : "response_received",
  };
  if (unsafeTools.length > 0) return { ok: false, decision: null, code: "UNSAFE_DEALER_TOOL", evidenceHash, publicProjection: null, receipt };
  let value: unknown;
  try { value = JSON.parse(provider.rawOutput); } catch { return { ok: false, decision: null, code: "MALFORMED_DEALER_OUTPUT", evidenceHash, publicProjection: null, receipt }; }
  const validated = validateAdmissionDecision(value, { mint: input.mint, requestTimestamp: input.requestTimestamp, authoritativeMintRead: mintIdentity?.exists === true && mintIdentity.decimals !== null });
  if (!validated.ok) return { ok: false, decision: null, code: validated.code, evidenceHash, publicProjection: null, receipt: { ...receipt, result: validated.code } };
  return { ok: true, decision: validated.decision, code: null, evidenceHash, publicProjection: publicAdmissionProjection(validated.decision), receipt };
}

