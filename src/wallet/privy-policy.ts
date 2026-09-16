import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { PositionOperation, Result, StrategyMandate } from "../domain/contracts";

export interface PrivyTransactionEnvelope {
  operation: PositionOperation;
  mandate: StrategyMandate;
  transactionBase64: string;
  pool: string;
  mints: readonly string[];
  amountUsdMicro: string;
  slippageBps: number;
  returnAddress: string;
  observedAt: string;
}

export type PolicyViolation =
  | "MANDATE_INACTIVE"
  | "MANDATE_EXPIRED"
  | "WALLET_MISMATCH"
  | "POOL_NOT_ALLOWED"
  | "MINT_NOT_ALLOWED"
  | "AMOUNT_EXCEEDS_CAP"
  | "SLIPPAGE_EXCEEDS_CAP"
  | "RETURN_ADDRESS_MISMATCH"
  | "TRANSACTION_ACCOUNT_MISMATCH"
  | "INVALID_TRANSACTION"
  | "UNKNOWN_PROGRAM";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";

function fail(code: PolicyViolation, message: string): Result<never> {
  return { ok: false, code, message, retryable: false };
}

function validPubkey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates the typed mandate and the transaction's account/program surface before
 * Privy is asked to sign. This is an application-side defense-in-depth check; the
 * provider policy must independently enforce the same restrictions.
 */
export function validatePrivyTransaction(input: PrivyTransactionEnvelope, now: string): Result<{ messageHashInput: string }> {
  const { mandate, operation } = input;
  if (mandate.status !== "active") return fail("MANDATE_INACTIVE", "This strategy mandate is not active.");
  if (!Number.isFinite(Date.parse(mandate.expiresAt)) || Date.parse(mandate.expiresAt) <= Date.parse(now)) {
    return fail("MANDATE_EXPIRED", "This strategy mandate has expired.");
  }
  if (operation.wallet !== mandate.wallet) return fail("WALLET_MISMATCH", "The operation wallet differs from the mandate.");
  if (!mandate.allowedPools.includes(input.pool)) return fail("POOL_NOT_ALLOWED", "This pool is outside the strategy mandate.");
  if (!/^\d+$/.test(input.amountUsdMicro) || BigInt(input.amountUsdMicro) > BigInt(mandate.maxPositionUsdMicro)) {
    return fail("AMOUNT_EXCEEDS_CAP", "The proposed position exceeds the strategy cap.");
  }
  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps > mandate.maxSlippageBps) {
    return fail("SLIPPAGE_EXCEEDS_CAP", "The proposed slippage exceeds the strategy cap.");
  }
  if (input.returnAddress !== mandate.returnAddress || !validPubkey(input.returnAddress)) {
    return fail("RETURN_ADDRESS_MISMATCH", "The recovery address does not match the mandate.");
  }
  if (input.mints.some((mint) => !mandate.allowedMints.includes(mint))) {
    return fail("MINT_NOT_ALLOWED", "The transaction includes a mint outside the strategy mandate.");
  }

  let transaction: VersionedTransaction;
  try {
    transaction = VersionedTransaction.deserialize(Buffer.from(input.transactionBase64, "base64"));
  } catch {
    return fail("INVALID_TRANSACTION", "The proposed Solana transaction could not be decoded.");
  }
  const keys = transaction.message.staticAccountKeys.map((key) => key.toBase58());
  const requiredAccounts = [mandate.wallet, input.returnAddress, input.pool, ...input.mints];
  if (requiredAccounts.some((account) => !keys.includes(account))) {
    return fail("TRANSACTION_ACCOUNT_MISMATCH", "The transaction account set does not match the mandate envelope.");
  }
  const programs = transaction.message.compiledInstructions.map((ix) => keys[ix.programIdIndex]);
  if (programs.some((program) => !program || (program !== SYSTEM_PROGRAM && program !== COMPUTE_BUDGET_PROGRAM && !mandate.allowedPrograms.includes(program)))) {
    return fail("UNKNOWN_PROGRAM", "The transaction contains an unapproved Solana program.");
  }
  return { ok: true, value: { messageHashInput: Buffer.from(transaction.message.serialize()).toString("base64") } };
}
