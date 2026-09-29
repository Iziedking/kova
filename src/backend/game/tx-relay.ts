/**
 * Transaction relay: the player's wallet only signs; KOVA sends the signed transaction on its own
 * RPC connection. Wallets that broadcast from the browser depend on the public devnet endpoint,
 * which throttles and often refuses mobile networks; the relay removes that dependency.
 *
 * The relay adds no authority. It forwards only a transaction that is already fully signed, paid
 * for by a wallet this account has proven, and that touches nothing but the KOVA escrow program and
 * the standard programs a deposit or claim needs. It cannot change a single byte of what was signed.
 */
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { utils } from "@anchor-lang/core";
import { ComputeBudgetProgram, SystemProgram, Transaction, type Connection } from "@solana/web3.js";
import type { Pool } from "pg";
import { KOVA_PROGRAM_ID } from "../../adapters/game/kova-program";

export type RelayErrorCode = "TX_MALFORMED" | "TX_NOT_ALLOWED" | "TX_UNSIGNED" | "WALLET_NOT_BOUND" | "TX_EXPIRED" | "TX_REJECTED" | "TX_UNCONFIRMED";
export type RelayResult = { ok: true; signature: string } | { ok: false; code: RelayErrorCode; detail?: string };

const ALLOWED_PROGRAMS = new Set([
  KOVA_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
  SystemProgram.programId.toBase58(), ComputeBudgetProgram.programId.toBase58(),
]);
const MAX_TX_BYTES = 1_232;

/** Checks shape and signatures without touching the network. Exported for tests. */
export function inspectForRelay(transactionBase64: string): { ok: true; transaction: Transaction; feePayer: string } | { ok: false; code: RelayErrorCode; detail?: string } {
  let raw: Buffer;
  let transaction: Transaction;
  try {
    raw = Buffer.from(transactionBase64, "base64");
    if (raw.length === 0 || raw.length > MAX_TX_BYTES) return { ok: false, code: "TX_MALFORMED" };
    transaction = Transaction.from(raw);
  } catch {
    return { ok: false, code: "TX_MALFORMED" };
  }
  const feePayer = transaction.feePayer?.toBase58();
  if (!feePayer) return { ok: false, code: "TX_MALFORMED" };
  const outside = transaction.instructions.find((instruction) => !ALLOWED_PROGRAMS.has(instruction.programId.toBase58()));
  if (outside) return { ok: false, code: "TX_NOT_ALLOWED", detail: outside.programId.toBase58() };
  if (!transaction.instructions.some((instruction) => instruction.programId.equals(KOVA_PROGRAM_ID))) return { ok: false, code: "TX_NOT_ALLOWED", detail: "no KOVA instruction" };
  // Every required signature present and valid over the exact message.
  if (!transaction.verifySignatures(true)) return { ok: false, code: "TX_UNSIGNED" };
  return { ok: true, transaction, feePayer };
}

export class TxRelay {
  constructor(private readonly deps: { pool: Pool; connection: Connection }) {}

  async relay(principalId: string, transactionBase64: string): Promise<RelayResult> {
    const inspected = inspectForRelay(transactionBase64);
    if (!inspected.ok) return inspected;
    const bound = await this.deps.pool.query("SELECT 1 FROM game_wallet_bindings WHERE wallet=$1 AND principal_id=$2", [inspected.feePayer, principalId]);
    if (bound.rowCount !== 1) return { ok: false, code: "WALLET_NOT_BOUND" };

    const raw = inspected.transaction.serialize();
    let signature: string;
    try {
      signature = await this.deps.connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/blockhash not found|block height exceeded/i.test(message)) return { ok: false, code: "TX_EXPIRED" };
      // Already sent (a retry after a dropped response) is success, not an error.
      if (/already been processed/i.test(message) && inspected.transaction.signature) return { ok: true, signature: utils.bytes.bs58.encode(inspected.transaction.signature) };
      return { ok: false, code: "TX_REJECTED", detail: message.slice(0, 240) };
    }
    // Wait for confirmation so the caller's next step (reading the entry back) sees it.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = (await this.deps.connection.getSignatureStatuses([signature])).value[0];
      if (status?.err) return { ok: false, code: "TX_REJECTED", detail: JSON.stringify(status.err).slice(0, 240) };
      if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) return { ok: true, signature };
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return { ok: false, code: "TX_UNCONFIRMED", detail: signature };
  }
}
