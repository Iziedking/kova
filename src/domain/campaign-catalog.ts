import { MARKET_CATALOG } from "./market-catalog";

export interface CampaignPreview {
  id: string;
  marketId: string;
  targetUsdMicro: string;
  backedUsdMicro: string;
  rewardMint: string;
  rewardBudgetRaw: string;
  endsAt: string;
  status: "seeking_interest" | "ready_to_fund" | "under_target";
  agentRating: "Healthy" | "Review required";
  feeSnapshotUsdMicro: string | null;
}

const ansemMint = "ANSEM_PENDING_MINT";

/** Read-only campaign fixtures for the discovery demo. No user funds are held. */
export const CAMPAIGN_CATALOG: readonly CampaignPreview[] = [
  { id: "campaign-nvdge-week-01", marketId: MARKET_CATALOG[0].id, targetUsdMicro: "20000000000", backedUsdMicro: "8100000000", rewardMint: ansemMint, rewardBudgetRaw: "10000000000", endsAt: "2026-09-22T00:00:00.000Z", status: "seeking_interest", agentRating: "Review required", feeSnapshotUsdMicro: "4200000000" },
  { id: "campaign-stonk-week-01", marketId: MARKET_CATALOG[1].id, targetUsdMicro: "50000000000", backedUsdMicro: "14000000000", rewardMint: ansemMint, rewardBudgetRaw: "20000000000", endsAt: "2026-09-22T00:00:00.000Z", status: "under_target", agentRating: "Review required", feeSnapshotUsdMicro: null },
];

export function campaignById(id: string): CampaignPreview | undefined {
  return CAMPAIGN_CATALOG.find((campaign) => campaign.id === id);
}
