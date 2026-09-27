/**
 * Devnet-only KOVA setup. Creates the operator, oracle and admission keys, funds them
 * from the devnet faucet, and mints a TEST ANSEM Token-2022 asset that satisfies the
 * program's stake-mint rules (6 decimals, no mint or freeze authority).
 *
 * Refuses to run against anything but devnet. Keys are written with mode 0600 to
 * KOVA_DEVNET_SECRETS_DIR and never printed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.KOVA_DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
const SECRETS_DIR = process.env.KOVA_DEVNET_SECRETS_DIR;
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const TEST_SUPPLY_RAW = 1_000_000n * 1_000_000n; // 1,000,000 TEST ANSEM at 6 decimals

function loadOrCreate(name: string): Keypair {
  const path = join(SECRETS_DIR!, `${name}.json`);
  if (existsSync(path)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
  const keypair = Keypair.generate();
  writeFileSync(path, JSON.stringify([...keypair.secretKey]), { mode: 0o600 });
  return keypair;
}

async function ensureSol(connection: Connection, owner: PublicKey, minimumSol: number): Promise<number> {
  let balance = await connection.getBalance(owner, "confirmed");
  if (balance >= minimumSol * LAMPORTS_PER_SOL) return balance / LAMPORTS_PER_SOL;
  try {
    const signature = await connection.requestAirdrop(owner, Math.min(2, minimumSol) * LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  } catch (error) {
    console.error(`faucet refused ${owner.toBase58()}: ${error instanceof Error ? error.message.split("\n")[0] : "unknown"}`);
  }
  balance = await connection.getBalance(owner, "confirmed");
  return balance / LAMPORTS_PER_SOL;
}

async function main(): Promise<void> {
  if (!SECRETS_DIR) throw new Error("Set KOVA_DEVNET_SECRETS_DIR to a private directory.");
  mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
  const connection = new Connection(RPC_URL, "confirmed");
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS) throw new Error(`Refusing to run: RPC genesis ${genesis} is not devnet.`);

  const operator = loadOrCreate("operator");
  const oracle = loadOrCreate("oracle");
  const admission = loadOrCreate("admission");
  const balances = {
    operator: await ensureSol(connection, operator.publicKey, 2),
    oracle: await ensureSol(connection, oracle.publicKey, 1),
    admission: await ensureSol(connection, admission.publicKey, 0),
  };

  const mintPath = join(SECRETS_DIR, "test-ansem-mint.txt");
  let mint: PublicKey;
  if (existsSync(mintPath)) {
    mint = new PublicKey(readFileSync(mintPath, "utf8").trim());
  } else {
    if (balances.operator < 0.05) throw new Error("Operator has no devnet SOL; fund it from https://faucet.solana.com and rerun.");
    mint = await createMint(connection, operator, operator.publicKey, null, 6, undefined, { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
    const treasury = await getOrCreateAssociatedTokenAccount(connection, operator, mint, operator.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);
    await mintTo(connection, operator, mint, treasury.address, operator, TEST_SUPPLY_RAW, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
    await setAuthority(connection, operator, mint, operator, AuthorityType.MintTokens, null, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
    writeFileSync(mintPath, `${mint.toBase58()}\n`, { mode: 0o600 });
  }

  console.log(JSON.stringify({
    network: "solana-devnet",
    operator: operator.publicKey.toBase58(),
    oracle: oracle.publicKey.toBase58(),
    admission: admission.publicKey.toBase58(),
    balancesSol: balances,
    testAnsemMint: mint.toBase58(),
    note: "TEST ANSEM has no value. Mint authority is revoked; the operator treasury holds the fixed test supply.",
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
