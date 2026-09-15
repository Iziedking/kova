import type { MarketIdentity, Result } from "./contracts";

export type RewardEvidenceStatus = "captured" | "unknown";
export type RewardIdentityStatus = "verified" | "reported" | "unavailable" | "unknown";

export interface RewardSlotInput {
  slot: number;
  state: number;
  rewardMint: string;
  rewardVault: string;
  creator: string;
  openTime: string;
  endTime: string;
  emissionsPerSecondX64: string;
  totalEmittedRaw: string;
  claimedRaw: string;
  vaultBalanceRaw: string;
  vaultMint: string;
  vaultOwner: string;
  tokenProgramId: string;
  tokenDecimals: number;
}

export interface RewardEvidenceInput {
  market: MarketIdentity;
  poolOwner: string;
  rewardSlots: readonly RewardSlotInput[];
  initializedSlots: readonly number[];
  availableSlot: number | null;
  ansem: {
    mint: string | null;
    status: RewardIdentityStatus;
    source: string | null;
  };
  authority: {
    poolOwnerVerified: false;
    rewardFunder: string | null;
    authorityVerified: false;
    source: string | null;
  };
  funding: {
    status: RewardIdentityStatus;
    source: string | null;
  };
  observedSlot: number;
  observedAt: string;
  source: "solana_rpc";
}

export interface RewardSlotEvidence extends RewardSlotInput {}

export interface RewardEvidenceReport {
  kind: "reward_evidence";
  marketId: string;
  pool: string;
  programId: string;
  status: RewardEvidenceStatus;
  poolOwner: string;
  initializedSlots: readonly number[];
  availableSlot: number | null;
  canonicalAnsemMint: string | null;
  ansemStatus: RewardIdentityStatus;
  ansemSource: string | null;
  authority: {
    poolOwnerVerified: false;
    rewardFunder: string | null;
    authorityVerified: false;
    source: string | null;
  };
  scheduleStatus: "configured" | "empty" | "unknown";
  fundingStatus: RewardIdentityStatus;
  fundingSource: string | null;
  rewardSlots: readonly RewardSlotEvidence[];
  observedSlot: number;
  observedAt: string;
  source: "solana_rpc";
  blockers: readonly string[];
  warnings: readonly string[];
  doesNotProve: readonly string[];
}

export interface RewardEvidenceError {
  code: "INVALID_REWARD_EVIDENCE_INPUT";
  message: string;
  retryable: false;
}

const DOES_NOT_PROVE = [
  "that any reward mint is the canonical ANSEM mint",
  "that the pool creator or any reward-slot creator controls reward authority",
  "that a reward vault balance is funded, reserved, or recoverable by the campaign",
  "that a reward schedule is active, approved, or economically sufficient",
  "that a stock-token issuer approves the market or that LP capital is safe",
] as const;

function validRaw(value: string): boolean {
  return /^\d+$/.test(value);
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function validate(input: RewardEvidenceInput): string | null {
  if (!input.market.id || !input.market.pool || !input.market.programId || !input.poolOwner) return "Reward evidence market identity is incomplete.";
  if (!Number.isInteger(input.observedSlot) || input.observedSlot <= 0 || !validTimestamp(input.observedAt)) return "Reward evidence requires a positive slot and valid observation time.";
  if (!Number.isInteger(input.availableSlot) && input.availableSlot !== null) return "The available reward slot must be an integer or null.";
  if (input.initializedSlots.some((slot) => !Number.isInteger(slot) || slot < 0)) return "Initialized reward slots must be non-negative integers.";
  if (input.ansem.status === "verified" && (!input.ansem.mint || !input.ansem.source)) return "Verified ANSEM evidence requires a mint and source.";
  if (input.authority.poolOwnerVerified || input.authority.authorityVerified) return "Reward authority cannot be marked verified by the pool-state reader.";
  for (const reward of input.rewardSlots) {
    if (!Number.isInteger(reward.slot) || reward.slot < 0 || !Number.isInteger(reward.state) || reward.state < 0) return "Reward slot indexes and states must be non-negative integers.";
    if (!reward.rewardMint || !reward.rewardVault || !reward.creator || !reward.vaultMint || !reward.vaultOwner || !reward.tokenProgramId) return "Reward slot addresses are incomplete.";
    if (![reward.openTime, reward.endTime, reward.emissionsPerSecondX64, reward.totalEmittedRaw, reward.claimedRaw, reward.vaultBalanceRaw].every(validRaw)) return "Reward slot numeric fields must be non-negative raw integers.";
    if (!Number.isInteger(reward.tokenDecimals) || reward.tokenDecimals < 0 || reward.tokenDecimals > 255) return "Reward token decimals must be integers from 0 through 255.";
    if (reward.vaultMint !== reward.rewardMint) return "The reward vault mint must match the reward mint.";
  }
  return null;
}

export function buildRewardEvidenceReport(input: RewardEvidenceInput): Result<RewardEvidenceReport, RewardEvidenceError> {
  const invalidReason = validate(input);
  if (invalidReason !== null) return { ok: false, code: "INVALID_REWARD_EVIDENCE_INPUT", message: invalidReason, retryable: false };

  const slots = [...input.rewardSlots].sort((left, right) => left.slot - right.slot);
  const hasSchedule = slots.some((slot) => slot.openTime !== "0" || slot.endTime !== "0");
  const blockers = [
    input.ansem.status === "verified" ? null : "Canonical ANSEM mint identity is not independently verified.",
    input.authority.authorityVerified ? null : "Reward authority and funder approval are not independently verified.",
    input.funding.status === "verified" ? null : "Reward funding is not independently verified from the observed pool state.",
  ].filter((reason): reason is string => reason !== null);
  const warnings = slots.length === 0
    ? ["No non-default Raydium reward slot is initialized for this pool."]
    : ["Reward slot state and vault balances are chain observations, not a campaign funding agreement."];

  return {
    ok: true,
    value: {
      kind: "reward_evidence",
      marketId: input.market.id,
      pool: input.market.pool,
      programId: input.market.programId,
      status: "captured",
      poolOwner: input.poolOwner,
      initializedSlots: [...input.initializedSlots].sort((left, right) => left - right),
      availableSlot: input.availableSlot,
      canonicalAnsemMint: input.ansem.mint,
      ansemStatus: input.ansem.status,
      ansemSource: input.ansem.source,
      authority: input.authority,
      scheduleStatus: slots.length === 0 ? "empty" : hasSchedule ? "configured" : "unknown",
      fundingStatus: input.funding.status,
      fundingSource: input.funding.source,
      rewardSlots: slots,
      observedSlot: input.observedSlot,
      observedAt: input.observedAt,
      source: input.source,
      blockers,
      warnings,
      doesNotProve: DOES_NOT_PROVE,
    },
  };
}
