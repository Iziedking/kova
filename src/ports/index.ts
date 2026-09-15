import type {
  Campaign, Decision, Evidence, FloatSnapshot, MarketIdentity, Position,
  PositionOperation, ResearchPurchase, Result,
  StrategyMandate, PrivyDelegation,
} from "../domain/contracts";

export interface Clock { now(): string }
export interface MarketReader {
  readMarket(pool: string): Promise<Result<Evidence<MarketIdentity>>>;
  readFloat(market: MarketIdentity): Promise<Result<Evidence<FloatSnapshot>>>;
}
export interface PositionReader {
  readOwned(wallet: string): Promise<Result<readonly Position[]>>;
}
export interface CampaignRepository {
  find(id: string): Promise<Result<Campaign>>;
  compareAndSwap(value: Campaign, expectedVersion: number): Promise<Result<Campaign>>;
}
export interface Underwriter {
  assess(market: Evidence<MarketIdentity>, inventory: Evidence<FloatSnapshot>): Promise<Result<Decision>>;
}
export interface UnsignedOperationBuilder {
  prepare(operation: PositionOperation): Promise<Result<{
    operationId: string; messageBase64: string; messageHash: string;
    lastValidBlockHeight: number; summary: readonly string[];
  }>>;
}
export interface ResearchBuyer {
  acquire(purchase: ResearchPurchase): Promise<Result<Evidence<unknown>>>;
}

export interface PrivyWalletAdapter {
  readonly provider: "privy";
  createDelegation(mandate: StrategyMandate): Promise<Result<PrivyDelegation>>;
  revokeDelegation(delegationId: string): Promise<Result<PrivyDelegation>>;
  signAndSend(operation: PositionOperation, mandate: StrategyMandate): Promise<Result<{ signature: string }>>;
}
