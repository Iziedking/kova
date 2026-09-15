/** Shared by HTTP views and the independent proof runner. No I/O belongs here. */
export type RawAmount = string;
export type UsdMicro = string;
export type IsoTime = string;
export type Capability = "fixture" | "live_read" | "chain_confirmed" | "unavailable";
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; retryable: boolean };

export interface TokenIdentity {
  mint: string;
  programId: string;
  decimals: number;
  symbol: string;
  issuer: "xstocks" | "community";
}
export interface Evidence<T> {
  id: string;
  subject: string;
  provider: string;
  sourceUrl: string;
  sourceTime: IsoTime | null;
  observedAt: IsoTime;
  expiresAt: IsoTime;
  slot: number | null;
  contentHash: string;
  capability: Capability;
  completeness: "complete" | "partial" | "unknown";
  value: T;
}
export interface MarketIdentity {
  id: string;
  cluster: "mainnet-beta" | "devnet";
  pool: string;
  programId: string;
  token0: TokenIdentity;
  token1: TokenIdentity;
  stockMint: string;
  feeRateMillionths: number;
  tickSpacing: number;
}
export type CampaignStatus =
  | "draft" | "checking" | "seeking_interest" | "ready_to_fund"
  | "funding" | "active" | "under_target" | "paused" | "ended" | "cancelled";
export interface Campaign {
  id: string;
  version: number;
  creator: string;
  marketId: string;
  targetUsdMicro: UsdMicro;
  capUsdMicro: UsdMicro;
  opensAt: IsoTime;
  endsAt: IsoTime;
  status: CampaignStatus;
  rewardMint: string;
  rewardBudgetRaw: RawAmount;
  rewardFunding: "proposed" | "submitted" | "confirmed" | "unknown";
  rewardScope: "all_eligible_pool_positions";
  rewardVault: string | null;
  rewardIndex: number | null;
  termsHash: string;
}
export interface BackingIntent {
  id: string;
  campaignId: string;
  wallet: string;
  amountUsdMicro: UsdMicro;
  expiresAt: IsoTime;
  termsHash: string;
  status: "interested" | "reviewing" | "position_confirmed" | "expired" | "cancelled";
}
export interface ExitQuote {
  sourcePoolIds: readonly string[];
  inputMint: string;
  inputRaw: RawAmount;
  outputMint: string;
  minimumOutputRaw: RawAmount;
  priceImpactBps: number;
  observedAt: IsoTime;
}
export interface FloatSnapshot {
  stockMint: string;
  trackedPools: readonly string[];
  rawSupply: RawAmount;
  observedPoolInventoryRaw: RawAmount;
  referenceUsdPerScaledUnit: string | null;
  currentMultiplier: string;
  nextMultiplierAt: IsoTime | null;
  referenceWindow: "open" | "closed" | "halted" | "unknown";
  exitQuotes: readonly ExitQuote[];
  coverage: "partial" | "verified_pool_set";
}
export type Decision =
  | { kind: "refuse"; reasons: readonly string[]; evidenceIds: readonly string[] }
  | { kind: "wait"; reasons: readonly string[]; evidenceIds: readonly string[] }
  | { kind: "propose"; strategy: "wide" | "medium"; maxUsdMicro: UsdMicro;
      tickLower: number; tickUpper: number; expiresAt: IsoTime;
      evidenceIds: readonly string[]; policyVersion: string };
export type OperationStatus =
  | "proposed" | "simulated" | "awaiting_signature" | "signed" | "submitted"
  | "confirmed" | "failed" | "expired" | "unknown";
export interface PositionOperation {
  id: string;
  wallet: string;
  campaignId: string;
  marketId: string;
  kind: "open" | "withdraw" | "collect" | "rebalance";
  status: OperationStatus;
  idempotencyKey: string;
  messageHash: string | null;
  lastValidBlockHeight: number | null;
  signature: string | null;
  evidenceIds: readonly string[];
}
export interface Position {
  id: string;
  marketId: string;
  campaignId: string | null;
  owner: string;
  nftMint: string;
  account: string;
  tickLower: number;
  tickUpper: number;
  liquidityRaw: RawAmount;
  observedSlot: number;
  fees0Raw: RawAmount;
  fees1Raw: RawAmount;
  rewardsRaw: readonly RawAmount[];
}
export type ResearchStatus =
  | "planned" | "reserved" | "authorization_pending" | "submitted"
  | "settled" | "delivered" | "failed_unpaid" | "unknown";
export interface ResearchPurchase {
  id: string;
  decisionId: string;
  provider: "nansen" | "coingecko";
  endpointId: string;
  requestHash: string;
  maximumUsdcMicro: RawAmount;
  reservedUtcDay: string;
  status: ResearchStatus;
  settlementSignature: string | null;
  responseHash: string | null;
  value: "changed_decision" | "confirmed_decision" | "no_value" | "unassessed";
}

export type WalletAuthorityMode = "user_signed" | "agent_managed_delegated";

export interface StrategyMandate {
  id: string;
  wallet: string;
  mode: WalletAuthorityMode;
  allowedPools: readonly string[];
  allowedPrograms: readonly string[];
  allowedMints: readonly string[];
  maxPositionUsdMicro: UsdMicro;
  maxSlippageBps: number;
  returnAddress: string;
  expiresAt: IsoTime;
  policyVersion: string;
  status: "draft" | "active" | "expired" | "revoked";
}

export interface PrivyDelegation {
  id: string;
  wallet: string;
  mandateId: string;
  grantedAt: IsoTime;
  expiresAt: IsoTime;
  revokedAt: IsoTime | null;
  status: "pending" | "active" | "expired" | "revoked";
}
