import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { validatePrivyTransaction } from "../src/wallet/privy-policy";

const wallet = Keypair.generate().publicKey.toBase58();
const pool = Keypair.generate().publicKey.toBase58();
const mint = Keypair.generate().publicKey.toBase58();
const raydiumProgram = Keypair.generate().publicKey.toBase58();
const returnAddress = wallet;
const transaction = new VersionedTransaction(new TransactionMessage({
  payerKey: new PublicKey(wallet),
  recentBlockhash: PublicKey.unique().toBase58(),
  instructions: [
    SystemProgram.transfer({ fromPubkey: new PublicKey(wallet), toPubkey: new PublicKey(returnAddress), lamports: 0 }),
    new TransactionInstruction({ programId: new PublicKey(raydiumProgram), keys: [{ pubkey: new PublicKey(pool), isSigner: false, isWritable: true }, { pubkey: new PublicKey(mint), isSigner: false, isWritable: true }], data: Buffer.alloc(0) }),
  ],
}).compileToV0Message());

const input = {
  operation: { id: "op-1", wallet, campaignId: "c", marketId: "m", kind: "rebalance", status: "proposed", idempotencyKey: "id", messageHash: null, lastValidBlockHeight: null, signature: null, evidenceIds: [] } as const,
  mandate: { id: "mandate-1", wallet, mode: "agent_managed_delegated", allowedPools: [pool], allowedPrograms: [raydiumProgram], allowedMints: [mint], maxPositionUsdMicro: "1000000", maxSlippageBps: 50, returnAddress, expiresAt: "2026-09-16T00:00:00.000Z", policyVersion: "privy-v1", status: "active" } as const,
  transactionBase64: Buffer.from(transaction.serialize()).toString("base64"), pool, mints: [mint], amountUsdMicro: "500000", slippageBps: 25, returnAddress, observedAt: "2026-09-15T00:00:00.000Z",
};

test("accepts an active bounded mandate and decodable transaction", () => {
  assert.equal(validatePrivyTransaction(input, "2026-09-15T00:00:00.000Z").ok, true);
});

test("rejects a pool outside the mandate before signing", () => {
  const result = validatePrivyTransaction({ ...input, pool: Keypair.generate().publicKey.toBase58() }, "2026-09-15T00:00:00.000Z");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "POOL_NOT_ALLOWED");
});

test("rejects an expired mandate before decoding or signing", () => {
  const result = validatePrivyTransaction({ ...input, mandate: { ...input.mandate, expiresAt: "2026-09-14T00:00:00.000Z" } }, "2026-09-15T00:00:00.000Z");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "MANDATE_EXPIRED");
});

test("rejects a non-canonical or negative amount before signing", () => {
  const result = validatePrivyTransaction({ ...input, amountUsdMicro: "-1" }, "2026-09-15T00:00:00.000Z");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "AMOUNT_EXCEEDS_CAP");
});
