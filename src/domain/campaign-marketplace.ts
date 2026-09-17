/** Campaign marketplace rules and preview feed. No wallet or payment side effects. Reviewed 2026-09-15. */
import { PublicKey } from "@solana/web3.js";
import type { CampaignStatus, Result } from "./contracts";
import type { CampaignPreview } from "./campaign-catalog";

export type BackingState = "pending" | "confirmed" | "failed" | "unknown";

export interface CampaignFeedCard extends CampaignPreview {
  backingProgressBps: number;
  ansem: {
    amountRaw: string;
    status: "unverified";
    message: string;
  };
  ranking: {
    status: "preview_only";
    reason: string;
  };
}

export interface BackingLedgerEntry {
  operationKey: string;
  campaignId: string;
  wallet: string;
  amountUsdMicro: string;
  state: BackingState;
}

const transitions: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  draft: ["checking", "cancelled"],
  checking: ["seeking_interest", "paused", "cancelled"],
  seeking_interest: ["ready_to_fund", "under_target", "paused", "cancelled"],
  ready_to_fund: ["funding", "paused", "cancelled"],
  funding: ["active", "under_target", "paused", "cancelled"],
  active: ["paused", "ended"],
  under_target: ["seeking_interest", "funding", "paused", "ended", "cancelled"],
  paused: ["seeking_interest", "funding", "active", "ended", "cancelled"],
  ended: [],
  cancelled: [],
};

export function transitionCampaign(current: CampaignStatus, next: CampaignStatus): Result<{ from: CampaignStatus; to: CampaignStatus }> {
  if (!transitions[current].includes(next)) {
    return { ok: false, code: "INVALID_CAMPAIGN_TRANSITION", message: `Campaign cannot move from ${current} to ${next}.`, retryable: false };
  }
  return { ok: true, value: { from: current, to: next } };
}

export function buildCampaignFeed(campaigns: readonly CampaignPreview[]): readonly CampaignFeedCard[] {
  return campaigns.map((campaign) => {
    const target = BigInt(campaign.targetUsdMicro);
    const backed = BigInt(campaign.backedUsdMicro);
    const backingProgressBps = target === 0n ? 0 : Number((backed * 10_000n) / target);
    return {
      ...campaign,
      backingProgressBps: Math.min(backingProgressBps, 10_000),
      ansem: {
        amountRaw: campaign.rewardBudgetRaw,
        status: "unverified",
        message: "Project-proposed ANSEM incentive. Mint, authority, funding, and schedule are not verified.",
      },
      ranking: {
        status: "preview_only",
        reason: "Captured backing and fee snapshots are not verified enough to rank expected returns.",
      },
    };
  });
}

function isPubkey(value: string): boolean {
  try { new PublicKey(value); return true; } catch { return false; }
}

export function validateBackingIntent(entry: BackingLedgerEntry): Result<BackingLedgerEntry> {
  if (entry.operationKey.trim().length < 8) return { ok: false, code: "INVALID_OPERATION_KEY", message: "A stable backing operation key is required.", retryable: false };
  if (!isPubkey(entry.wallet)) return { ok: false, code: "INVALID_WALLET", message: "A valid wallet address is required.", retryable: false };
  if (!/^\d+$/.test(entry.amountUsdMicro) || BigInt(entry.amountUsdMicro) <= 0n) return { ok: false, code: "INVALID_BACKING_AMOUNT", message: "Backing amount must be a positive integer number of USD micro-units.", retryable: false };
  return { ok: true, value: entry };
}
