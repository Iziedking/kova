export interface ClaimState {
  status: "pending" | "paid" | "refunded" | "not_applicable";
  kind: "payout" | "refund" | null;
  amountRaw: string;
}

/** Confirmed entry flags and matching terminal table state are both required. */
export function projectClaimState(status: string, entry: { funded: boolean; claimed: boolean; refunded: boolean; awardRaw: string } | null, stakeRaw: string): ClaimState {
  if (!entry?.funded) return { status: "not_applicable", kind: null, amountRaw: "0" };
  if (status === "settled" && BigInt(entry.awardRaw) > 0n) return { status: entry.claimed ? "paid" : "pending", kind: "payout", amountRaw: entry.awardRaw };
  if (status === "cancelled" || status === "voided") return { status: entry.refunded ? "refunded" : "pending", kind: "refund", amountRaw: stakeRaw };
  return { status: "not_applicable", kind: null, amountRaw: "0" };
}
