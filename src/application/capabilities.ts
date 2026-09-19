export function getCapabilities() {
  return {
    product: "KOVA",
    stage: "m2_local_program",
    mode: "preview",
    capabilities: {
      phase00Feasibility: "blocked",
      marketReads: "captured_snapshot",
      campaigns: "captured_snapshot",
      stockCheck: "fixture_backed",
      stockFloatMonitor: "unavailable",
      rewardEvidence: "unavailable",
      underwriting: "preview_only",
      walletConnection: "browser_seam_only",
      positionIntentReview: "preview_only",
      paidResearch: "unavailable",
      transactionPreparation: "unavailable",
      walletSigning: "unavailable",
      automatedRebalancing: "unavailable",
      gameRules: "preview_only",
      gameCommitments: "preview_only",
      dealerAdmission: "blocked",
      privatePickStorage: "unavailable",
      ansemEscrow: "local_validator_only",
      gameSettlement: "local_validator_only",
      payoutExecution: "local_validator_only",
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
