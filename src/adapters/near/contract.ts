/**
 * Which CHIP contract the app talks to. One place, so switching to a new deployment is one line.
 * NEXT_PUBLIC_NEAR_CHIP_CONTRACT overrides it (see docs/near/DEPLOY.md).
 */
export const DEFAULT_CHIP_CONTRACT = "chip.kingizie.testnet";

/** Earlier deployments, kept as history: their tables and burns stay on chain. */
export const PREVIOUS_CHIP_CONTRACTS: readonly string[] = [];

export const CHIP_CONTRACT_ID = process.env.NEXT_PUBLIC_NEAR_CHIP_CONTRACT ?? DEFAULT_CHIP_CONTRACT;
