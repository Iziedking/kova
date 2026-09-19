import { z } from "zod";

export const GameModeSchema = z.enum(["preview", "devnet", "limited_live"]);
export const TableStatusSchema = z.enum(["DRAFT", "OPEN", "LOCKING", "ACTIVE", "SETTLING", "SETTLED", "CANCELLED", "VOIDED"]);
export const FinancialStatusSchema = z.enum(["unfunded", "funding_pending", "funded", "result_final", "payouts_pending", "paid", "refunds_pending", "refunded", "unknown"]);
export const CapabilityStateSchema = z.enum(["live", "read_only", "preview_only", "local_validator_only", "unavailable", "blocked"]);
export const RawAmountSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const Price18Schema = RawAmountSchema;
export const SignedBpsSchema = z.string().regex(/^-?(0|[1-9][0-9]*)$/);
export const SolanaAddressSchema = z.string().min(32).max(44);

export const GameRulesSchema = z.object({
  playerCount: z.number().int().min(2).max(16),
  stakeMint: SolanaAddressSchema,
  stakeRaw: RawAmountSchema,
  roundDurationSeconds: z.literal(900),
  scoreVersion: z.literal("kova-bps-v1"),
  tieBreakVersion: z.literal("wallet-bytes-v1"),
  commitmentVersion: z.literal("kova-pick-v1"),
});

export const PublicTableSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  mode: GameModeSchema,
  status: TableStatusSchema,
  financialStatus: FinancialStatusSchema,
  fundedPlayers: z.number().int().nonnegative(),
  seats: z.number().int().min(2).max(16),
  opensUntil: z.iso.datetime().nullable(),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  rules: GameRulesSchema,
  dealer: z.object({
    required: z.literal(true),
    status: z.enum(["ready", "degraded", "unavailable"]),
    classificationVersion: z.literal("kova-admission-v1"),
  }),
});

export const PrivateParticipantSchema = z.object({
  tableId: z.uuid(),
  wallet: SolanaAddressSchema,
  commitment: z.string().regex(/^[0-9a-f]{64}$/),
  sealedMarketHash: z.string().regex(/^[0-9a-f]{64}$/),
  admissionDecision: z.enum(["ACCEPTED", "REJECTED", "INSUFFICIENT_EVIDENCE"]),
  fundingStatus: z.enum(["unfunded", "funding_pending", "funded", "refunds_pending", "refunded"]),
});

export const GameCapabilitiesSchema = z.object({
  product: z.literal("KOVA"),
  stage: z.enum(["m2_local_program", "m3_private_admission"]),
  mode: GameModeSchema,
  capabilities: z.object({
    tableDiscovery: CapabilityStateSchema,
    deterministicScoring: CapabilityStateSchema,
    commitmentConstruction: CapabilityStateSchema,
    dealerAdmission: CapabilityStateSchema,
    privatePickStorage: CapabilityStateSchema,
    ansemEscrow: CapabilityStateSchema,
    settlement: CapabilityStateSchema,
    payoutExecution: CapabilityStateSchema,
  }),
});

export type PublicTable = z.infer<typeof PublicTableSchema>;
export type PrivateParticipant = z.infer<typeof PrivateParticipantSchema>;
export type GameCapabilities = z.infer<typeof GameCapabilitiesSchema>;

export interface GameApiError {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
}

export function gameApiError(code: string, message: string, retryable = false): GameApiError {
  return { ok: false, code, message, retryable };
}
