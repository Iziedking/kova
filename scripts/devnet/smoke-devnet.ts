/**
 * Devnet end-to-end proof through the backend's own KovaProgramClient.
 *
 * Two throwaway test players stake TEST ANSEM. Game one settles to a winner and both
 * players claim. Game two is never locked, expires, and both players take refunds
 * without the oracle. Every balance change is read back from chain.
 *
 * Devnet only: refuses any RPC whose genesis is not devnet.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { TxRelay } from "../../src/backend/game/tx-relay";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  getAccount,
  getAssociatedTokenAddressSync,
  transferChecked,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  KovaProgramClient,
  deriveVault,
  hexToBytes32,
  rosterHash,
  sortRoster,
  startDigest,
  startLeaf,
  submitSigned,
  tableIdBytes,
} from "../../src/adapters/game/kova-program";

const RPC_URL = process.env.KOVA_DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
const SECRETS_DIR = process.env.KOVA_DEVNET_SECRETS_DIR;
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const STAKE_RAW = 1_000_000n; // 1 TEST ANSEM
const PRICE_SCALE = 10n ** 18n;

function key(name: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(SECRETS_DIR!, `${name}.json`), "utf8")) as number[]));
}

function randomHex32(): string {
  return Buffer.from(Keypair.generate().secretKey.slice(0, 32)).toString("hex");
}

async function sleepUntil(unixSeconds: bigint): Promise<void> {
  const delay = Number(unixSeconds * 1_000n - BigInt(Date.now()) + 2_000n);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

async function balance(connection: Connection, account: PublicKey): Promise<bigint> {
  return (await getAccount(connection, account, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
}

/**
 * KOVA_SMOKE_VIA_RELAY=1 sends every player transaction through the backend relay (TxRelay), the path
 * the app uses: the wallet signs only and KOVA broadcasts. The wallet-binding check is stubbed to "bound".
 */
const viaRelay = process.env.KOVA_SMOKE_VIA_RELAY === "1";

/** The player's own wallet signs last and submits, exactly as a browser wallet would. */
async function playerSignsAndSends(connection: Connection, player: Keypair, built: { transactionBase64: string }): Promise<string> {
  const transaction = Transaction.from(Buffer.from(built.transactionBase64, "base64"));
  transaction.partialSign(player);
  if (viaRelay) {
    const relay = new TxRelay({ pool: { query: async () => ({ rowCount: 1, rows: [] }) } as unknown as Pool, connection });
    const relayed = await relay.relay("smoke", transaction.serialize().toString("base64"));
    if (!relayed.ok) throw new Error(`Relay refused the player transaction: ${relayed.code} ${relayed.detail ?? ""}`);
    console.log(`  relayed ${relayed.signature.slice(0, 12)}…`);
    return relayed.signature;
  }
  const signature = await connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: "confirmed" });
  const latest = await connection.getLatestBlockhash("confirmed");
  const result = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (result.value.err) throw new Error(`Player transaction ${signature} failed.`);
  return signature;
}

async function main(): Promise<void> {
  if (!SECRETS_DIR) throw new Error("Set KOVA_DEVNET_SECRETS_DIR.");
  const connection = new Connection(RPC_URL, "confirmed");
  if (await connection.getGenesisHash() !== DEVNET_GENESIS) throw new Error("Refusing to run: not devnet.");

  const operator = key("operator");
  const oracle = key("oracle");
  const admission = key("admission");
  const stakeMint = new PublicKey(readFileSync(join(SECRETS_DIR, "test-ansem-mint.txt"), "utf8").trim());
  const client = new KovaProgramClient({ connection, stakeMint, creator: operator, oracle, admission });
  const players = [Keypair.generate(), Keypair.generate()];
  const signatures: Record<string, string> = {};

  // Fund throwaway players with fee SOL and 3 TEST ANSEM each, and top up the oracle.
  const funding = new Transaction();
  for (const player of players) funding.add(SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: player.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL }));
  if (await connection.getBalance(oracle.publicKey) < 0.1 * LAMPORTS_PER_SOL) funding.add(SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: oracle.publicKey, lamports: 0.3 * LAMPORTS_PER_SOL }));
  signatures.funding = await sendAndConfirmTransaction(connection, funding, [operator], { commitment: "confirmed" });
  const treasury = getAssociatedTokenAddressSync(stakeMint, operator.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const playerTokens: PublicKey[] = [];
  for (const player of players) {
    const account = await createAssociatedTokenAccountIdempotent(connection, operator, stakeMint, player.publicKey, { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
    await transferChecked(connection, operator, treasury, stakeMint, account, operator, STAKE_RAW * 3n, 6, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
    playerTokens.push(account);
  }

  // Game one: settle to a winner.
  const gameId = randomUUID();
  const tableId = tableIdBytes(gameId);
  signatures.initialize = await submitSigned(connection, await client.initializeTable({ tableUuid: gameId, stakeRaw: STAKE_RAW, maxPlayers: 2, openForSeconds: 120, roundSeconds: 10 }));
  const picks = players.map((player) => ({ player: player.publicKey, commitmentHex: randomHex32(), sealedHex: randomHex32(), evidenceHex: randomHex32() }));
  for (let index = 0; index < players.length; index += 1) {
    const built = await client.buildJoinForPlayer({ tableUuid: gameId, player: players[index]!.publicKey, commitmentHex: picks[index]!.commitmentHex, sealedMarketHashHex: picks[index]!.sealedHex });
    signatures[`join_${index + 1}`] = await playerSignsAndSends(connection, players[index]!, built);
  }
  const vault = deriveVault(client.tableAddress(gameId));
  if (await balance(connection, vault) !== STAKE_RAW * 2n) throw new Error("Vault does not hold both stakes.");

  signatures.lock = await submitSigned(connection, await client.lockTable(gameId));
  const locked = await client.fetchTable(gameId);
  if (!locked) throw new Error("Table disappeared after lock.");
  const plannedStart = BigInt(locked.plannedStart.toString());
  const startPrices = [100n * PRICE_SCALE, 100n * PRICE_SCALE];
  const endPrices = [112n * PRICE_SCALE, 104n * PRICE_SCALE];
  for (let index = 0; index < players.length; index += 1) {
    signatures[`record_start_${index + 1}`] = await submitSigned(connection, await client.recordStart({ tableUuid: gameId, player: players[index]!.publicKey, startPrice18: startPrices[index]!, evidenceHashHex: picks[index]!.evidenceHex }));
  }
  const roster = sortRoster(picks.map((pick, index) => ({ ...pick, index })));
  const leaves = roster.map((pick) => startLeaf({ tableId, player: pick.player, commitment: hexToBytes32(pick.commitmentHex), sealedMarketHash: hexToBytes32(pick.sealedHex), price18: startPrices[pick.index]!, plannedStart, evidenceHash: hexToBytes32(pick.evidenceHex) }));
  signatures.activate = await submitSigned(connection, await client.activateTable({ tableUuid: gameId, startDigest: startDigest(tableId, leaves), rosterHash: rosterHash(tableId, roster.map((pick) => pick.player)) }));
  const active = await client.fetchTable(gameId);
  await sleepUntil(BigInt(active!.endsAt.toString()));
  for (let index = 0; index < players.length; index += 1) {
    signatures[`record_result_${index + 1}`] = await submitSigned(connection, await client.recordResult({ tableUuid: gameId, player: players[index]!.publicKey, endPrice18: endPrices[index]! }));
  }
  signatures.finalize = await submitSigned(connection, await client.finalizeResult({ tableUuid: gameId, playersInRosterOrder: roster.map((pick) => pick.player) }));
  for (let index = 0; index < players.length; index += 1) {
    signatures[`claim_payout_${index + 1}`] = await playerSignsAndSends(connection, players[index]!, await client.buildClaimForPlayer({ tableUuid: gameId, player: players[index]!.publicKey, kind: "payout" }));
  }
  const afterGame = await Promise.all(playerTokens.map((account) => balance(connection, account)));
  if (afterGame[0] !== STAKE_RAW * 4n || afterGame[1] !== STAKE_RAW * 2n) throw new Error(`Unexpected payout balances ${afterGame.join(",")}.`);

  // Game two: nobody locks it; it expires and players refund themselves.
  const refundId = randomUUID();
  signatures.refund_initialize = await submitSigned(connection, await client.initializeTable({ tableUuid: refundId, stakeRaw: STAKE_RAW, maxPlayers: 2, openForSeconds: 20, roundSeconds: 10 }));
  for (let index = 0; index < players.length; index += 1) {
    const built = await client.buildJoinForPlayer({ tableUuid: refundId, player: players[index]!.publicKey, commitmentHex: randomHex32(), sealedMarketHashHex: randomHex32() });
    signatures[`refund_join_${index + 1}`] = await playerSignsAndSends(connection, players[index]!, built);
  }
  const open = await client.fetchTable(refundId);
  await sleepUntil(BigInt(open!.openUntil.toString()));
  signatures.void_expired = await submitSigned(connection, await client.voidExpiredTable(refundId));
  for (let index = 0; index < players.length; index += 1) {
    signatures[`claim_refund_${index + 1}`] = await playerSignsAndSends(connection, players[index]!, await client.buildClaimForPlayer({ tableUuid: refundId, player: players[index]!.publicKey, kind: "refund" }));
  }
  const afterRefund = await Promise.all(playerTokens.map((account) => balance(connection, account)));
  if (afterRefund[0] !== afterGame[0] || afterRefund[1] !== afterGame[1]) throw new Error("Refund did not restore stakes.");
  if (await balance(connection, deriveVault(client.tableAddress(refundId))) !== 0n) throw new Error("Refund vault is not empty.");

  console.log(JSON.stringify({
    proof: "kova-devnet-e2e-v1",
    network: "solana-devnet",
    programId: client.program.programId.toBase58(),
    testAnsemMint: stakeMint.toBase58(),
    settledTable: client.tableAddress(gameId).toBase58(),
    refundedTable: client.tableAddress(refundId).toBase58(),
    players: players.map((player) => player.publicKey.toBase58()),
    balancesRaw: { afterSettlement: afterGame.map(String), afterRefund: afterRefund.map(String) },
    assertions: { bothStakesEscrowed: true, winnerPaidWholePot: true, loserPaidNothing: true, expiredTableRefundedWithoutOracle: true, refundVaultEmpty: true },
    signatures,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
