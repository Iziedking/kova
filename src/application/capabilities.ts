export function getCapabilities() {
  return {
    product: "FLOAT",
    stage: "group5_wallet_review",
    mode: "preview",
    capabilities: {
      phase00Feasibility: "blocked",
      marketReads: "captured_snapshot",
      campaigns: "captured_snapshot",
      stockCheck: "fixture_backed",
      stockFloatMonitor: "unavailable",
      underwriting: "preview_only",
      walletConnection: "browser_seam_only",
      positionIntentReview: "preview_only",
      paidResearch: "unavailable",
      transactionPreparation: "unavailable",
      walletSigning: "unavailable",
      automatedRebalancing: "unavailable",
    },
  } as const;
}
export function refuseTransactionPreparation() {
  return {
    ok: false,
    code: "NOT_IMPLEMENTED",
    message: "LP transaction preparation is not available.",
    retryable: false,
  } as const;
}
