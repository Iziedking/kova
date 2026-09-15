/** Deterministic underwriting report contract. It is intentionally model-free and side-effect free. Reviewed 2026-09-15. */
import type { Phase00Report } from "./phase00-feasibility";
import type { StockCheckReport } from "./stock-check";

export type UnderwritingState = "pass" | "blocked" | "unknown" | "stale" | "degraded";
export type UnderwritingDecision = "propose" | "wait" | "refuse";

export interface UnderwritingReport {
  marketId: string;
  state: UnderwritingState;
  decision: UnderwritingDecision;
  rankingScorePoints: number | null;
  summary: string;
  reasons: readonly string[];
  evidenceIds: readonly string[];
  stockCheck: {
    reportHash: string;
    status: StockCheckReport["status"];
    source: string;
    observedAt: string | null;
    slot: null;
  };
  feasibility: {
    reportHash: string;
    status: Phase00Report["status"];
    observedSlot: number;
  };
  agent: {
    mode: "deterministic_preview";
    model: null;
    generated: false;
    policyVersion: "float-underwriting-v1";
  };
  disclosures: {
    stockSideLiquidity: string;
    lpExposure: string;
    feeOpportunity: string;
    tokenExtensions: string;
    rewards: string;
  };
}

export interface UnderwritingInput {
  marketId: string;
  stockCheck: StockCheckReport;
  stockCheckReportHash: string;
  feasibility: Phase00Report;
  feasibilityReportHash: string;
}

export function buildUnderwritingReport(input: UnderwritingInput): UnderwritingReport {
  const feasibilityBlockers = input.feasibility.gates.filter((gate) => gate.status !== "pass").map((gate) => gate.detail);
  const stockWarnings = input.stockCheck.warnings;
  const reasons = [...input.stockCheck.blockers, ...stockWarnings, ...feasibilityBlockers];
  const hasStaleEvidence = input.stockCheck.evidence.some((evidence) => evidence.status === "blocked" && evidence.id === "reference_price");
  const hasUnknownEvidence = input.stockCheck.status === "unknown" || input.feasibility.gates.some((gate) => gate.status === "unknown");
  const hasBlockedEvidence = input.stockCheck.status === "blocked" || input.feasibility.status === "blocked";
  const state: UnderwritingState = hasStaleEvidence ? "stale" : hasBlockedEvidence ? "blocked" : hasUnknownEvidence ? "unknown" : "pass";
  const decision: UnderwritingDecision = state === "pass" ? "propose" : state === "unknown" ? "wait" : "refuse";
  const summary = state === "pass"
    ? "Evidence passes the deterministic gates. A bounded strategy proposal may be reviewed by the user."
    : state === "unknown"
      ? "The evidence is incomplete. FLOAT is waiting for verified inputs before ranking this market."
      : state === "stale"
        ? "Reference evidence is stale. FLOAT refuses to rank this market until a fresh check completes."
        : "The market is blocked by one or more hard feasibility or stock-side liquidity gates.";

  return {
    marketId: input.marketId,
    state,
    decision,
    rankingScorePoints: state === "pass" ? 50 : null,
    summary,
    reasons,
    evidenceIds: [
      ...input.stockCheck.evidence.map((evidence) => `stock-check:${evidence.id}`),
      ...input.feasibility.gates.flatMap((gate) => gate.evidence.map((evidence) => `feasibility:${evidence}`)),
    ],
    stockCheck: { reportHash: input.stockCheckReportHash, status: input.stockCheck.status, source: input.stockCheck.reference.source, observedAt: input.stockCheck.reference.observedAt, slot: null },
    feasibility: { reportHash: input.feasibilityReportHash, status: input.feasibility.status, observedSlot: input.feasibility.observedRpcSlot },
    agent: { mode: "deterministic_preview", model: null, generated: false, policyVersion: "float-underwriting-v1" },
    disclosures: {
      stockSideLiquidity: "Stock-side inventory and exit capacity are not verified in the current fixture. A modest meme-side trade may move the stock quote hard when stock liquidity is thin.",
      lpExposure: "A user-owned LP position remains exposed to both assets, impermanent loss, adverse selection, and out-of-range risk.",
      feeOpportunity: "Trading fees depend on future volume and execution. No fee amount, yield, or return is guaranteed by this report.",
      tokenExtensions: "NVDAx is Token-2022 and the captured evidence includes a freeze-authority warning. Extension behavior must be reviewed before any user-signed transaction.",
      rewards: "ANSEM rewards remain unavailable until the canonical mint, authority, funder, balance, and schedule are verified on chain.",
    },
  };
}
