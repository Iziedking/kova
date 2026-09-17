import { PublicKey } from "@solana/web3.js";
import type { Result, StrategyMandate } from "../domain/contracts";

export const PRIVY_POLICY_VERSION = "privy-solana-v1";

export interface MandateInput {
  id: string;
  wallet: string;
  allowedPools: string[];
  allowedPrograms: string[];
  allowedMints: string[];
  maxPositionUsdMicro: string;
  maxSlippageBps: number;
  returnAddress: string;
  expiresAt: string;
}

function isPubkey(value: string): boolean {
  try { new PublicKey(value); return true; } catch { return false; }
}

function invalid(message: string): Result<never> {
  return { ok: false, code: "INVALID_MANDATE", message, retryable: false };
}

export function createMandate(input: MandateInput, now: string): Result<StrategyMandate> {
  if (!input.id || !isPubkey(input.wallet) || !isPubkey(input.returnAddress)) return invalid("Wallet and recovery address must be valid Solana addresses.");
  if (input.returnAddress !== input.wallet) return invalid("The recovery address must match the wallet for this initial flow.");
  if (input.allowedPools.length === 0 || input.allowedPools.some((value) => !isPubkey(value))) return invalid("At least one valid market pool is required.");
  if (input.allowedPrograms.length === 0 || input.allowedPrograms.some((value) => !isPubkey(value))) return invalid("At least one valid Solana program is required.");
  if (input.allowedMints.length === 0 || input.allowedMints.some((value) => !isPubkey(value))) return invalid("At least one valid token mint is required.");
  try { if (BigInt(input.maxPositionUsdMicro) <= 0n) return invalid("The position cap must be positive."); } catch { return invalid("The position cap must be an integer in micro-USD."); }
  if (!Number.isInteger(input.maxSlippageBps) || input.maxSlippageBps < 0 || input.maxSlippageBps > 1_000) return invalid("Slippage must be between 0 and 1,000 basis points.");
  // Both sides must parse. Every comparison against NaN is false, so validating
  // only `expiresAt` let a past expiry through whenever `now` failed to parse.
  const expiry = Date.parse(input.expiresAt);
  const current = Date.parse(now);
  if (!Number.isFinite(expiry) || !Number.isFinite(current) || expiry <= current) return invalid("The mandate must expire in the future.");
  return { ok: true, value: { ...input, mode: "agent_managed_delegated", policyVersion: PRIVY_POLICY_VERSION, status: "active" } };
}
