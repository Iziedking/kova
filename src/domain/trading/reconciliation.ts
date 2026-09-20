import type { TradingReconciliationReceipt } from "./types";

export type ReconciliationFailure =
  | "SIGNATURE_MISMATCH"
  | "WALLET_MISMATCH"
  | "TRANSACTION_NOT_CONFIRMED"
  | "SLOT_MISSING"
  | "UNSUPPORTED_SOURCE";

export function validateTradeReconciliation(input: {
  expectedSignature: string;
  expectedWalletAddress: string;
  receipt: TradingReconciliationReceipt;
}): { ok: true; receipt: TradingReconciliationReceipt } | { ok: false; code: ReconciliationFailure } {
  if (input.receipt.txSignature !== input.expectedSignature) return { ok: false, code: "SIGNATURE_MISMATCH" };
  if (input.receipt.walletAddress !== input.expectedWalletAddress) return { ok: false, code: "WALLET_MISMATCH" };
  if (input.receipt.status !== "confirmed") return { ok: false, code: "TRANSACTION_NOT_CONFIRMED" };
  if (input.receipt.slot === null || input.receipt.slot < 0) return { ok: false, code: "SLOT_MISSING" };
  if (input.receipt.source !== "helius" && input.receipt.source !== "solana_rpc") return { ok: false, code: "UNSUPPORTED_SOURCE" };
  return { ok: true, receipt: input.receipt };
}
