import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { KOVA_PROGRAM_ID } from "../../src/adapters/game/kova-program";
import { inspectForRelay } from "../../src/backend/game/tx-relay";

const BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";

function build(payer: Keypair, programId: PublicKey, sign = true): string {
  const transaction = new Transaction({ feePayer: payer.publicKey, recentBlockhash: BLOCKHASH });
  transaction.add(new TransactionInstruction({ programId, keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }], data: Buffer.from([1, 2, 3]) }));
  if (sign) transaction.sign(payer);
  return transaction.serialize({ requireAllSignatures: false }).toString("base64");
}

test("a signed KOVA transaction is accepted and reports its fee payer", () => {
  const payer = Keypair.generate();
  const result = inspectForRelay(build(payer, KOVA_PROGRAM_ID));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.feePayer, payer.publicKey.toBase58());
});

test("the relay refuses anything that isn't a signed KOVA game transaction", () => {
  const payer = Keypair.generate();
  assert.deepEqual(inspectForRelay("not a transaction"), { ok: false, code: "TX_MALFORMED" });
  const other = inspectForRelay(build(payer, Keypair.generate().publicKey));
  assert.equal(other.ok ? null : other.code, "TX_NOT_ALLOWED", "an unknown program is refused");
  const plainTransfer = inspectForRelay(build(payer, SystemProgram.programId));
  assert.equal(plainTransfer.ok ? null : plainTransfer.code, "TX_NOT_ALLOWED", "a transaction with no KOVA instruction is refused");
  const unsigned = inspectForRelay(build(payer, KOVA_PROGRAM_ID, false));
  assert.equal(unsigned.ok ? null : unsigned.code, "TX_UNSIGNED");
});
