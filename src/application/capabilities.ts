export function getCapabilities() {
  return {
    product: "FLOAT",
    stage: "architecture_scaffold",
    mode: "preview",
    capabilities: {
      marketReads: "captured_snapshot",
      campaigns: "captured_snapshot",
      underwriting: "preview_only",
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
