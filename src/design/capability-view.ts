/**
 * Turns a capability value from `src/application/capabilities.ts` into display
 * text and a tone.
 *
 * Spec section 14: a disabled capability is stated as disabled. Nothing here may
 * render an unavailable capability as pending, coming soon or healthy, and an
 * unrecognised value degrades to unknown rather than to health, so a new backend
 * state can never be shown as working by default.
 */
export interface CapabilityView {
  label: string;
  tone: "ok" | "warn" | "off";
}

const VIEWS: Readonly<Record<string, CapabilityView>> = {
  chain_confirmed: { label: "Read from chain", tone: "ok" },
  captured_snapshot: { label: "Captured snapshot", tone: "warn" },
  fixture_backed: { label: "Fixture backed", tone: "warn" },
  preview_only: { label: "Preview only", tone: "warn" },
  browser_seam_only: { label: "Browser discovery only", tone: "warn" },
  blocked: { label: "Blocked on evidence", tone: "warn" },
  unavailable: { label: "Unavailable", tone: "off" },
};

export function describeCapability(value: string): CapabilityView {
  return VIEWS[value] ?? { label: `Unknown state (${value})`, tone: "warn" };
}

/** Human labels for the capability keys, so the panel does not print camelCase. */
const CAPABILITY_LABELS: Readonly<Record<string, string>> = {
  phase00Feasibility: "Feasibility gates",
  marketReads: "Market reads",
  campaigns: "Campaigns",
  stockCheck: "Initial StockCheck",
  stockFloatMonitor: "Stock float monitor",
  rewardEvidence: "Reward evidence",
  underwriting: "Underwriting",
  walletConnection: "Wallet connection",
  positionIntentReview: "Backing review",
  paidResearch: "Paid research",
  transactionPreparation: "Transaction preparation",
  walletSigning: "Wallet signing",
  automatedRebalancing: "Automated rebalancing",
};

export function labelCapability(key: string): string {
  return CAPABILITY_LABELS[key] ?? key;
}
