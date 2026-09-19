import { z } from "zod";
import { SolanaAddressSchema } from "./api-contracts";

const NullableText = z.string().min(1).nullable();

export const AdmissionDecisionSchema = z.object({
  schemaVersion: z.literal("kova-admission-v1"),
  network: z.literal("solana-mainnet"),
  mint: SolanaAddressSchema,
  requestTimestamp: z.iso.datetime(),
  decision: z.enum(["ACCEPTED", "REJECTED", "INSUFFICIENT_EVIDENCE"]),
  confidence: z.number().min(0).max(1),
  classification: z.object({
    isStockThemedMeme: z.boolean().nullable(),
    isIssuerBackedTokenizedStock: z.boolean().nullable(),
    stockOrCompanyReference: NullableText,
  }).strict(),
  tokenIdentity: z.object({
    name: NullableText,
    symbol: NullableText,
    tokenProgram: NullableText,
    decimals: z.number().int().min(0).max(255).nullable(),
    mintAuthority: z.enum(["none", "present", "unknown"]),
    freezeAuthority: z.enum(["none", "present", "unknown"]),
    metadataUri: z.string().url().nullable(),
  }).strict(),
  riskFlags: z.array(z.string().min(1)).max(20),
  reasons: z.array(z.string().min(1)).min(1).max(12),
  researchAttempts: z.array(z.object({ capability: z.string().min(1), result: z.enum(["success", "unavailable", "failed"]), detail: z.string().min(1) }).strict()).min(1).max(20),
  evidence: z.array(z.object({
    source: z.string().min(1),
    sourceClass: z.enum(["solana_rpc", "token_metadata", "primary_project", "market_data", "public_reporting", "social"]),
    url: z.string().url().nullable(),
    observation: z.string().min(1),
    observedAt: z.iso.datetime().nullable(),
    solanaSlot: z.number().int().nonnegative().nullable(),
  }).strict()).max(5),
  providerReceipts: z.array(z.object({ provider: z.string().min(1), reference: z.string().min(1), observation: z.string().min(1) }).strict()).max(20),
  conflicts: z.array(z.object({ field: z.string().min(1), observations: z.array(z.string().min(1)).min(1), resolution: z.string().min(1) }).strict()).max(20),
  missingEvidence: z.array(z.string().min(1)).max(20),
  evaluatedAt: z.iso.datetime(),
}).strict();

export type AdmissionDecision = z.infer<typeof AdmissionDecisionSchema>;

export interface AdmissionValidationContext {
  mint: string;
  requestTimestamp: string;
  authoritativeMintRead: boolean;
}

export type ValidatedAdmission =
  | { ok: true; decision: AdmissionDecision }
  | { ok: false; code: "MALFORMED_DEALER_OUTPUT" | "DEALER_IDENTITY_MISMATCH" | "DEALER_TIME_INVALID" | "DEALER_CONFIDENCE_INVALID" | "ACCEPTANCE_EVIDENCE_INCOMPLETE"; issues: readonly string[] };

export function validateAdmissionDecision(value: unknown, context: AdmissionValidationContext): ValidatedAdmission {
  const parsed = AdmissionDecisionSchema.safeParse(value);
  if (!parsed.success) return { ok: false, code: "MALFORMED_DEALER_OUTPUT", issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  const decision = parsed.data;
  if (decision.mint !== context.mint || decision.requestTimestamp !== context.requestTimestamp) return { ok: false, code: "DEALER_IDENTITY_MISMATCH", issues: ["Dealer output did not preserve the exact mint and request timestamp."] };
  const evaluatedAt = Date.parse(decision.evaluatedAt);
  const requestedAt = Date.parse(decision.requestTimestamp);
  const evidenceTimes = decision.evidence.flatMap((item) => item.observedAt ? [Date.parse(item.observedAt)] : []);
  if (!Number.isFinite(evaluatedAt) || evaluatedAt < requestedAt || evidenceTimes.some((time) => !Number.isFinite(time) || time > evaluatedAt)) return { ok: false, code: "DEALER_TIME_INVALID", issues: ["Dealer timestamps are inconsistent."] };
  const sourceClasses = new Set(decision.evidence.map((item) => item.sourceClass));
  const hasPrimaryEvidence = decision.evidence.some((item) => item.sourceClass === "primary_project" || item.sourceClass === "token_metadata");
  const confidenceCeiling = Math.min(
    context.authoritativeMintRead ? 1 : 0.5,
    sourceClasses.size >= 2 ? 1 : 0.6,
    hasPrimaryEvidence ? 1 : 0.75,
    decision.conflicts.length === 0 ? 1 : 0.85,
  );
  if (decision.confidence > confidenceCeiling) return { ok: false, code: "DEALER_CONFIDENCE_INVALID", issues: [`Confidence ${decision.confidence} exceeds evidence ceiling ${confidenceCeiling}.`] };
  if (decision.decision !== "ACCEPTED") return { ok: true, decision };
  const hasPublicUrl = decision.evidence.some((item) => item.url !== null);
  const complete = context.authoritativeMintRead
    && decision.classification.isStockThemedMeme === true
    && decision.classification.isIssuerBackedTokenizedStock === false
    && decision.tokenIdentity.tokenProgram !== null
    && decision.tokenIdentity.decimals !== null
    && decision.tokenIdentity.mintAuthority !== "unknown"
    && decision.tokenIdentity.freezeAuthority !== "unknown"
    && sourceClasses.size >= 2
    && hasPublicUrl
    && decision.conflicts.length === 0;
  return complete
    ? { ok: true, decision }
    : { ok: false, code: "ACCEPTANCE_EVIDENCE_INCOMPLETE", issues: ["An ACCEPTED decision did not satisfy KOVA's deterministic evidence gate."] };
}

export function publicAdmissionProjection(decision: AdmissionDecision) {
  return {
    schemaVersion: decision.schemaVersion,
    decision: decision.decision,
    confidence: decision.confidence,
    classification: decision.classification,
    riskFlags: decision.riskFlags,
    reasons: decision.reasons,
    evidence: decision.evidence.map(({ source, sourceClass, url, observation, observedAt, solanaSlot }) => ({ source, sourceClass, url, observation, observedAt, solanaSlot })),
    conflicts: decision.conflicts,
    missingEvidence: decision.missingEvidence,
    evaluatedAt: decision.evaluatedAt,
  };
}
