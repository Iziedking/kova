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
  /** 0 = judge only from KOVA-supplied evidence. ClawPump cuts off agent turns at about 60 s. */
  toolBudget?: 0 | 1 | 2;
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
    return value.slice(0, 3);
  }).catch((error: unknown) => {
    attempts.push({ capability: "dexscreener_token_pairs", result: "failed", detail: error instanceof Error ? error.message : "Market read failed." });
    return [];
  });
  // Only the fields a classifier needs. Full DEX payloads made the agent turn outlive ClawPump's ~60 s server limit.
  const pairSummaries = pairs.map((pair) => ({
    dex: pair.dexId,
    pairAddress: pair.pairAddress,
    url: pair.url,
    base: { address: pair.baseToken.address, name: pair.baseToken.name, symbol: pair.baseToken.symbol },
    quoteSymbol: pair.quoteToken.symbol,
    liquidityUsd: pair.liquidity?.usd ?? null,
    pairCreatedAt: pair.pairCreatedAt ?? null,
  }));
  const dossier = { network: "solana-mainnet", mint: input.mint, requestTimestamp: input.requestTimestamp, authoritativeEvidence: { mintIdentity, pairs: pairSummaries }, researchAttempts: attempts };
  const evidenceHash = createHash("sha256").update(JSON.stringify(dossier)).digest("hex");
  const authoritativeMintRead = mintIdentity?.exists === true && mintIdentity.decimals !== null;
  // Tell the model the most it may claim from what we supply (chain + market, no primary source);
  // the validator still enforces the full ceiling against whatever evidence it returns.
  const confidenceLimit = Math.min(authoritativeMintRead ? 0.75 : 0.5, pairs.length > 0 ? 0.75 : 0.6);
  const provider = await input.dealer.classify([
    "Apply the enabled KOVA Admission Dealer skill to this exact request.",
    "Treat authoritativeEvidence as caller-supplied evidence that must still be checked for consistency.",
    input.toolBudget === 0
      ? "Do not call any tools. Judge only from the evidence supplied below, and use INSUFFICIENT_EVIDENCE when it is not enough."
      : `Use at most ${input.toolBudget ?? 2} read-only research tool calls, then answer. Never use wallet, transfer, trading, posting, automation or skill tools.`,
    "Task: decide whether this exact Solana token is a stock-themed meme (its narrative references a public company or stock ticker) that is NOT an issuer-backed tokenized stock.",
    "ACCEPTED = clearly a stock-themed meme. REJECTED = clearly not one. INSUFFICIENT_EVIDENCE = cannot tell from the evidence.",
    "Return one JSON object and nothing else, with exactly these keys and value types:",
    JSON.stringify({
      mint: "<copy exactly from request>",
      requestTimestamp: "<copy exactly from request>",
      decision: "ACCEPTED | REJECTED | INSUFFICIENT_EVIDENCE",
      confidence: `<number from 0 to ${confidenceLimit}>`,
      classification: { isStockThemedMeme: "<true | false | null>", isIssuerBackedTokenizedStock: "<true | false | null>", stockOrCompanyReference: "<company or ticker string, or null>" },
      reasons: ["<1 to 5 short sentences>"],
      riskFlags: ["<short flags, may be empty>"],
      evidence: [{ source: "<name>", sourceClass: "solana_rpc | market_data | token_metadata | primary_project | public_reporting | social", url: "<full https URL or null>", observation: "<what it shows>", observedAt: null, solanaSlot: null }],
      conflicts: [],
      missingEvidence: ["<what would change the decision, may be empty>"],
    }),
    "Use real JSON booleans and null, never strings for them. evidence has 1 to 5 items. Do not add other keys.",
    "Request and supplied evidence:",
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

