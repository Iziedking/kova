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

/**
 * Accept a bare JSON object or one wrapped in a markdown code fence. Anything else,
 * including prose around the object, is malformed.
 */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(raw.trim());
  const body = (fenced ? fenced[1] : raw).trim();
  if (!body.startsWith("{") || !body.endsWith("}")) return null;
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function runAdmission(input: {
  mint: string;
  requestTimestamp: string;
  connection: Connection;
  dealer: Pick<ClawPumpAdmissionClient, "classify">;
  fetcher?: typeof fetch;
  now?: () => Date;
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
  const authoritativeMintRead = mintIdentity?.exists === true && mintIdentity.decimals !== null;
  // Tell the model the most it may claim from what we already know; the validator still enforces the full ceiling.
  const confidenceLimit = Math.min(authoritativeMintRead ? 1 : 0.5, pairs.length > 0 ? 1 : 0.6);
  const provider = await input.dealer.classify([
    "Apply the enabled KOVA Admission Dealer skill to this exact request.",
    "Treat authoritativeEvidence as caller-supplied evidence that must still be checked for consistency.",
    "Use read-only tools only. Return one JSON object and nothing else.",
    "Required keys: mint and requestTimestamp copied exactly from the request, decision, confidence, classification, reasons, evidence.",
    "Optional keys: riskFlags, conflicts, missingEvidence, providerReceipts. Omit token identity; KOVA reads it from chain.",
    "classification fields are booleans or null, and stockOrCompanyReference is a string or null. Never write null as a string.",
    `confidence is a number between 0 and ${confidenceLimit}. evidence has at most 5 items; each url is a full https URL or null.`,
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
  const verdict = extractJsonObject(provider.rawOutput);
  if (verdict === null) return { ok: false, decision: null, code: "MALFORMED_DEALER_OUTPUT", evidenceHash, publicProjection: null, receipt };
  const exactPair = pairs.find((pair) => pair.baseToken.address === input.mint);
  // Facts KOVA observed itself replace anything the model says about them. The model's
  // judgement fields pass through untouched and are validated, never repaired.
  const value = {
    riskFlags: [],
    evidence: [],
    providerReceipts: [],
    conflicts: [],
    missingEvidence: [],
    ...verdict,
    schemaVersion: "kova-admission-v1",
    network: "solana-mainnet",
    tokenIdentity: {
      name: exactPair?.baseToken.name || null,
      symbol: exactPair?.baseToken.symbol || null,
      tokenProgram: mintIdentity?.tokenProgram ?? null,
      decimals: mintIdentity?.decimals ?? null,
      mintAuthority: mintIdentity?.mintAuthority ?? "unknown",
      freezeAuthority: mintIdentity?.freezeAuthority ?? "unknown",
      metadataUri: null,
    },
    researchAttempts: attempts,
    evaluatedAt: (input.now ?? (() => new Date()))().toISOString(),
  };
  const validated = validateAdmissionDecision(value, { mint: input.mint, requestTimestamp: input.requestTimestamp, authoritativeMintRead });
  if (!validated.ok) return { ok: false, decision: null, code: validated.code, evidenceHash, publicProjection: null, receipt: { ...receipt, result: validated.code } };
  return { ok: true, decision: validated.decision, code: null, evidenceHash, publicProjection: publicAdmissionProjection(validated.decision), receipt };
}

