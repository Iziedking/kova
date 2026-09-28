/**
 * Devnet only: send a player fee SOL and TEST ANSEM from the operator's fixed supply.
 * Usage: KOVA_DEVNET_SECRETS_DIR=... npx tsx scripts/devnet/fund-wallet.ts <wallet> [<wallet> ...]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

const SECRETS = process.env.KOVA_DEVNET_SECRETS_DIR;
const SOL = Number(process.env.KOVA_FUND_SOL ?? "0.3");
const ANSEM_RAW = BigInt(process.env.KOVA_FUND_ANSEM_RAW ?? "10000000"); // 10 TEST ANSEM

async function main(): Promise<void> {
  if (!SECRETS) throw new Error("Set KOVA_DEVNET_SECRETS_DIR.");
  const connection = new Connection(process.env.KOVA_DEVNET_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
  if (await connection.getGenesisHash() !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("Refusing to run: not devnet.");
  const operator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(SECRETS, "operator.json"), "utf8")) as number[]));
  const mint = new PublicKey(readFileSync(join(SECRETS, "test-ansem-mint.txt"), "utf8").trim());
  const treasury = getAssociatedTokenAddressSync(mint, operator.publicKey, false, TOKEN_2022_PROGRAM_ID);
  for (const address of process.argv.slice(2)) {
    const wallet = new PublicKey(address);
    const walletTokens = getAssociatedTokenAddressSync(mint, wallet, false, TOKEN_2022_PROGRAM_ID);
    const transaction = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: wallet, lamports: Math.round(SOL * LAMPORTS_PER_SOL) }),
      createAssociatedTokenAccountIdempotentInstruction(operator.publicKey, walletTokens, wallet, mint, TOKEN_2022_PROGRAM_ID),
      createTransferCheckedInstruction(treasury, mint, walletTokens, operator.publicKey, ANSEM_RAW, 6, [], TOKEN_2022_PROGRAM_ID),
    );
    const signature = await sendAndConfirmTransaction(connection, transaction, [operator], { commitment: "confirmed" });
    const ansem = (await getAccount(connection, walletTokens, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
    const sol = (await connection.getBalance(wallet, "confirmed")) / LAMPORTS_PER_SOL;
    console.log(JSON.stringify({ wallet: address, sol, testAnsem: Number(ansem) / 1e6, signature }));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
