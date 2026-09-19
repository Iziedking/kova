/**
 * Source: @solana/web3.js 1.99.0 installed transaction compiler and Solana
 * transaction limits read 2026-09-19 from https://solana.com/docs/core/transactions.
 *
 * This serializes synthetic instruction shapes only. It does not simulate a
 * program, estimate compute units, connect a wallet, or send a transaction.
 */
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const LEGACY_V0_PACKET_LIMIT = 1_232;
const programId = key(250);
const feePayer = key(251);
const recentBlockhash = key(252).toBase58();

function key(seed: number): PublicKey {
  return new PublicKey(Uint8Array.from({ length: 32 }, (_, index) => (seed + index * 17) % 256));
}

function instruction(accountCount: number, dataBytes: number, discriminator: number): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: Array.from({ length: accountCount }, (_, index) => ({
      pubkey: key(discriminator * 16 + index),
      isSigner: index === 0,
      isWritable: index < Math.ceil(accountCount / 2),
    })),
    data: Buffer.alloc(dataBytes, discriminator),
  });
}

function serializedV0Bytes(instructions: readonly TransactionInstruction[]): number | null {
  const message = new TransactionMessage({ payerKey: feePayer, recentBlockhash, instructions: [...instructions] }).compileToV0Message();
  try {
    return new VersionedTransaction(message).serialize().length;
  } catch (error: unknown) {
    if (error instanceof RangeError && error.message.includes("overruns Uint8Array")) return null;
    throw error;
  }
}

function report(name: string, instructions: readonly TransactionInstruction[]): object {
  const bytes = serializedV0Bytes(instructions);
  return {
    name,
    instructions: instructions.length,
    bytes,
    packetLimit: LEGACY_V0_PACKET_LIMIT,
    fits: bytes !== null && bytes <= LEGACY_V0_PACKET_LIMIT,
    remainingBytes: bytes === null ? null : LEGACY_V0_PACKET_LIMIT - bytes,
    refusal: bytes === null ? "SDK_PACKET_ENCODER_OVERFLOW" : null,
  };
}

const stagedResult = instruction(8, 168, 4);
async function main(): Promise<void> {
  const shapes = [
    report("initialize_table", [instruction(9, 192, 1)]),
    report("join_with_commitment_and_admission", [instruction(12, 256, 2)]),
    report("activate_table", [instruction(7, 112, 3)]),
    report("record_one_result_entry", [stagedResult]),
    report("record_six_results_monolithic", Array.from({ length: 6 }, () => stagedResult)),
    report("finalize_result", [instruction(15, 96, 5)]),
    report("claim_payout_or_refund", [instruction(9, 48, 6)]),
  ];
  const artifactId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const artifactDirectory = resolve(process.cwd(), "artifacts", "m0-transaction-size", artifactId);
  const summary = {
    ok: true,
    schemaVersion: "kova-m0-transaction-size-v1",
    dependency: "@solana/web3.js@1.99.0",
    messageFormat: "v0 without lookup tables",
    measuredAt: new Date().toISOString(),
    caveat: "Synthetic account and data budgets only. Compute, Anchor serialization, token extensions and real program accounts remain unverified until the local-validator spike.",
    shapes,
  };
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(resolve(artifactDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ artifactDirectory, ...summary }, null, 2));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, code: "M0_TRANSACTION_SIZE_PROBE_FAILED", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
