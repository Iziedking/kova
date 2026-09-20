import { z } from "zod";

export const TradingCapabilityStateSchema = z.enum(["local_only", "unavailable", "blocked", "read_only"]);

export const TradingCapabilitiesSchema = z.object({
  product: z.literal("KOVA"),
  mode: z.literal("trading"),
  status: z.enum(["preview_only", "blocked", "ready_for_owner_gate"]),
  capabilities: z.object({
    isolatedCompetitionAccounts: TradingCapabilityStateSchema,
    deterministicPnl: TradingCapabilityStateSchema,
    sameTokenDuels: TradingCapabilityStateSchema,
    clawPumpQuotes: TradingCapabilityStateSchema,
    unsignedTransactionPreparation: TradingCapabilityStateSchema,
    userAuthorizedSigning: TradingCapabilityStateSchema,
    heliusReconciliation: TradingCapabilityStateSchema,
    ansemStakeAndPayout: TradingCapabilityStateSchema,
    winnerSettlement: TradingCapabilityStateSchema,
  }),
  reasons: z.array(z.string().min(1)),
});

export type TradingCapabilities = z.infer<typeof TradingCapabilitiesSchema>;

export function getTradingCapabilities(): TradingCapabilities {
  return TradingCapabilitiesSchema.parse({
    product: "KOVA",
    mode: "trading",
    status: "blocked",
    capabilities: {
      isolatedCompetitionAccounts: "local_only",
      deterministicPnl: "local_only",
      sameTokenDuels: "local_only",
      clawPumpQuotes: "unavailable",
      unsignedTransactionPreparation: "blocked",
      userAuthorizedSigning: "blocked",
      heliusReconciliation: "unavailable",
      ansemStakeAndPayout: "blocked",
      winnerSettlement: "blocked",
    },
    reasons: [
      "Trading Mode requires a validated per-player competition wallet or user-authorized signing path.",
      "ClawPump preparation is intentionally not wired to a live account in this build.",
      "A Helius or finalized Solana reconciliation provider is not configured.",
      "ANSEM stake and payout authority remains an explicit owner gate.",
    ],
  });
}
