import { getCapabilities, refuseTransactionPreparation } from "../src/application/capabilities";
import { buildPhase00Report, PHASE00_CANDIDATE } from "../src/domain/phase00-feasibility";
import { runStockCheck } from "../src/domain/stock-check";
const phase00 = buildPhase00Report();
const stockCheck = runStockCheck({
  market: PHASE00_CANDIDATE,
  issuer: {
    name: "xStocks",
    approvalStatus: "reported",
    approvedTokenAddress: PHASE00_CANDIDATE.stockMint,
    source: "fixture:stock-identity-v1",
  },
  eligibility: {
    status: "unknown",
    jurisdiction: "unknown",
    limitations: ["The fixture has no current issuer eligibility record or jurisdiction coverage."],
    source: null,
  },
  reference: {
    source: "fixture:stock-reference-v1",
    priceBaseUnits: "310000000",
    observedAt: "2026-09-15T06:00:00.000Z",
    freshnessSeconds: 30,
    maxFreshnessSeconds: 300,
  },
  inventory: {
    availableBaseUnits: null,
    redeemability: "unavailable",
  },
  liquidity: {
    poolAddress: PHASE00_CANDIDATE.pool,
    depthBaseUnits: "1000000000",
    minimumDepthBaseUnits: "100000000",
    estimatedPriceImpactBps: 45,
    maximumPriceImpactBps: 100,
  },
  volatility: {
    stockMoveBps: 120,
    memeMoveBps: 260,
    divergenceBps: 80,
    maximumDivergenceBps: 500,
  },
  checkedAt: "2026-09-15T06:00:30.000Z",
});
console.log(JSON.stringify({
  capabilities: getCapabilities(),
  phase00: {
    status: phase00.status,
    candidatePool: phase00.candidate.pool,
    gates: phase00.gates.map(({ id, status }) => ({ id, status })),
    simulatedPositionPlan: phase00.simulatedPositionPlan,
  },
  initialStockCheck: stockCheck,
  attemptedPreparation: refuseTransactionPreparation(),
  proves: "FLOAT reports its Group 5 wallet-review capability, refuses unavailable financial actions, records phase-00 feasibility gates, and runs the initial stock check against a deterministic fixture.",
  doesNotProve: "Issuer solvency, organic volume, LP safety, campaign settlement, paid data delivery, or mainnet execution.",
}, null, 2));
