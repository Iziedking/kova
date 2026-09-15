import type { MarketIdentity } from "./contracts";

export type FeasibilityGateStatus = "pass" | "blocked" | "unknown";

export interface FeasibilityGate {
  id: string;
  status: FeasibilityGateStatus;
  evidence: readonly string[];
  detail: string;
}

export interface PositionPlanStep {
  id: "read_pool" | "read_ticks" | "prepare_open" | "simulate_open" | "verify_nft" | "prepare_collect" | "prepare_withdraw" | "simulate_withdraw" | "reconcile";
  signer: "none" | "user_wallet";
  sdkMethod: string | null;
  purpose: string;
}

export interface SimulatedPositionPlan {
  mode: "simulate_only";
  executable: false;
  marketId: string;
  owner: "user_wallet";
  steps: readonly PositionPlanStep[];
  blockers: readonly string[];
}

export interface Phase00Report {
  phase: "00-feasibility";
  status: "blocked" | "ready";
  checkedAt: string;
  candidate: MarketIdentity;
  poolOwner: string;
  poolOwnerVerified: false;
  observedRpcSlot: number;
  poolAccountBytes: number;
  sdkRead: {
    currentPrice: number;
    currentTick: number;
    tickArrayCount: number;
    rewardMints: readonly string[];
  };
  tokenExtensions: {
    stock: readonly string[];
    meme: readonly string[];
  };
  reward: {
    canonicalAnsemMint: string | null;
    initializedSlots: readonly number[];
    availableSlot: number | null;
    authorityVerified: false;
    fundingAgreement: false;
  };
  gates: readonly FeasibilityGate[];
  simulatedPositionPlan: SimulatedPositionPlan;
}

const RAYDIUM_CLMM_PROGRAM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/**
 * The only phase-00 candidate. Values come from the dated private evidence;
 * this is deliberately not a live reader or an execution approval.
 */
export const PHASE00_CANDIDATE: MarketIdentity = {
  id: "nvdge-nvdax",
  cluster: "mainnet-beta",
  pool: "Ak7oAUqQ9jYu5YvfmDrtDC3WHi7BcN5Y4k8Bh3yk4B5e",
  programId: RAYDIUM_CLMM_PROGRAM,
  token0: {
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    programId: TOKEN_2022_PROGRAM,
    decimals: 8,
    symbol: "NVDAx",
    issuer: "xstocks",
  },
  token1: {
    mint: "Aigf5pKPyZW8nzxCrHEisE4tZMiUhFpKie8mYE7cmj6c",
    programId: TOKEN_PROGRAM,
    decimals: 9,
    symbol: "NVDGE",
    issuer: "community",
  },
  stockMint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  feeRateMillionths: 10000,
  tickSpacing: 120,
};

const POSITION_PLAN: readonly PositionPlanStep[] = [
  { id: "read_pool", signer: "none", sdkMethod: "Raydium.load + clmm.getClmmPoolKeys", purpose: "Read the exact pool, vaults, status bits, decimals and current sqrt price." },
  { id: "read_ticks", signer: "none", sdkMethod: "PoolUtils.fetchMultiplePoolTickArrays", purpose: "Read every tick array needed for the selected range and quote size." },
  { id: "prepare_open", signer: "user_wallet", sdkMethod: "clmm.openPositionFromBase", purpose: "Build a user-owned position with explicit max token debits and Token-2022 NFT handling." },
  { id: "simulate_open", signer: "none", sdkMethod: "Connection.simulateTransaction", purpose: "Simulate the unsigned transaction and inspect program/account effects." },
  { id: "verify_nft", signer: "none", sdkMethod: "getParsedAccountInfo + position account read", purpose: "After a user-confirmed open, verify the position NFT and personal position belong to the same wallet." },
  { id: "prepare_collect", signer: "user_wallet", sdkMethod: "clmm.decreaseLiquidity (liquidity = 0)", purpose: "Prepare a zero-liquidity fee/reward collection to the owner's token accounts." },
  { id: "prepare_withdraw", signer: "user_wallet", sdkMethod: "clmm.decreaseLiquidity", purpose: "Prepare a full withdrawal with explicit minimum receives and the owner's position NFT." },
  { id: "simulate_withdraw", signer: "none", sdkMethod: "Connection.simulateTransaction", purpose: "Prove the withdrawal keeps both token destinations bound to the user wallet." },
  { id: "reconcile", signer: "none", sdkMethod: "Connection.getSignatureStatuses + account reads", purpose: "Reconcile the same operation after confirmed, failed or unknown submission." },
];

export function simulatePositionPlan(marketId = PHASE00_CANDIDATE.id): SimulatedPositionPlan {
  return {
    mode: "simulate_only",
    executable: false,
    marketId,
    owner: "user_wallet",
    steps: POSITION_PLAN,
    blockers: [
      "No complete sized tick-array coverage or executable quote has been captured.",
      "No wallet-bound position NFT exists for this proof.",
      "No unsigned transaction has been built and simulated by the pinned SDK.",
    ],
  };
}

export function buildPhase00Report(): Phase00Report {
  const gates: readonly FeasibilityGate[] = [
    {
      id: "exact_market_identity",
      status: "pass",
      evidence: ["candidate-contact.json", "candidate-pool-rpc.json", "market-probes.json"],
      detail: "The dated RPC account owner/program/space and indexed pool mints cross-match the selected market.",
    },
    {
      id: "token_programs_and_decimals",
      status: "pass",
      evidence: ["market-probes.json"],
      detail: "The captured pool response identifies NVDAx as Token-2022 with 8 decimals and NVDGE as classic SPL with 9 decimals.",
    },
    {
      id: "price_and_tick_basis",
      status: "blocked",
      evidence: ["market-probes.json", "candidate-pool-rpc.json"],
      detail: "The SDK now reads current sqrt-price/tick and two arrays, but the raw/scaled price convention and complete arrays for a selected quote size are not yet proven.",
    },
    {
      id: "sdk_pool_and_tick_array_read",
      status: "pass",
      evidence: ["phase00-rpc live output", "DEPENDENCIES.md"],
      detail: "The pinned SDK read the exact pool, current tick and two live tick arrays without a wallet owner or signing callback.",
    },
    {
      id: "reward_authority_and_ansem",
      status: "blocked",
      evidence: ["candidate-contact.json", "market-probes.json", "raydium-pool-state-source.rs"],
      detail: "The pool owner is an on-curve address with no verified controller, ANSEM mint, approved funder or funded reward schedule.",
    },
    {
      id: "position_nft_ownership",
      status: "blocked",
      evidence: [],
      detail: "No user wallet or future position NFT is available in this phase.",
    },
    {
      id: "unsigned_open_withdraw_simulation",
      status: "blocked",
      evidence: ["DEPENDENCIES.md"],
      detail: "The plan is defined, but no live SDK-built unsigned payload has been simulated.",
    },
  ];

  return {
    phase: "00-feasibility",
    status: gates.every((gate) => gate.status === "pass") ? "ready" : "blocked",
    checkedAt: "2026-09-15T05:43:20.436Z",
    candidate: PHASE00_CANDIDATE,
    poolOwner: "5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG",
    poolOwnerVerified: false,
    observedRpcSlot: 447172605,
    poolAccountBytes: 1544,
    sdkRead: {
      currentPrice: 3102289.1161664804,
      currentTick: 172510,
      tickArrayCount: 2,
      rewardMints: [],
    },
    tokenExtensions: { stock: ["freeze_authority"], meme: [] },
    reward: {
      canonicalAnsemMint: null,
      initializedSlots: [],
      availableSlot: 0,
      authorityVerified: false,
      fundingAgreement: false,
    },
    gates,
    simulatedPositionPlan: simulatePositionPlan(),
  };
}

export function isPhase00Ready(report: Phase00Report): boolean {
  return report.status === "ready" && report.gates.every((gate) => gate.status === "pass");
}
