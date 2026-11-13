/**
 * Which CHIP contract the app talks to. One place, so switching to a new deployment is one line.
 * NEXT_PUBLIC_NEAR_CHIP_CONTRACT overrides it (see docs/near/DEPLOY.md).
 */
export const DEFAULT_CHIP_CONTRACT = "kova-chip.testnet";

/** Earlier deployments, kept as history: their tables and burns stay on chain. */
export const PREVIOUS_CHIP_CONTRACTS: readonly { account: string; note: string }[] = [
  { account: "chip.kingizie.testnet", note: "Version 1, before clans: 5 tables settled and 50 CHIP burned on 2026-11-12." },
];

export const CHIP_CONTRACT_ID = process.env.NEXT_PUBLIC_NEAR_CHIP_CONTRACT ?? DEFAULT_CHIP_CONTRACT;
