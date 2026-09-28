/**
 * KOVA escrow program client. One seam for every transaction the backend builds.
 *
 * The backend holds only the table creator (operator), oracle and admission keys.
 * Player deposits, payouts and refunds are always signed by the player's own wallet;
 * this module returns those as partially signed transactions and never submits them.
 */
import { createHash } from "node:crypto";
import { AnchorProvider, BN, Program, type Wallet } from "@anchor-lang/core";
import { TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, type VersionedTransaction } from "@solana/web3.js";
import idl from "../../../idl/kova_game.json";
import type { KovaGame } from "../../../idl/kova_game";

export const KOVA_PROGRAM_ID = new PublicKey(idl.address);
const START_CHAIN_DOMAIN = Buffer.from("KOVA_START_CHAIN_V1");
const ROSTER_CHAIN_DOMAIN = Buffer.from("KOVA_ROSTER_CHAIN_V1");
const LEGACY_TRANSACTION_LIMIT = 1_232;

/** A wallet that refuses to sign. Anchor needs one to build instructions; we sign explicitly. */
class ReadOnlyWallet implements Wallet {
  readonly payer = Keypair.generate();
  get publicKey(): PublicKey { return this.payer.publicKey; }
  async signTransaction<T extends Transaction | VersionedTransaction>(): Promise<T> { throw new Error("KOVA program client does not sign implicitly."); }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(): Promise<T[]> { throw new Error("KOVA program client does not sign implicitly."); }
}

export function tableIdBytes(tableUuid: string): number[] {
  const hex = tableUuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error("Table id must be a UUID.");
  return [...Buffer.from(hex, "hex")];
}

export function deriveTable(creator: PublicKey, tableId: readonly number[]): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("table"), creator.toBuffer(), Buffer.from(tableId)], KOVA_PROGRAM_ID)[0];
}

export function deriveVault(table: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), table.toBuffer()], KOVA_PROGRAM_ID)[0];
}

export function deriveEntry(table: PublicKey, player: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("entry"), table.toBuffer(), player.toBuffer()], KOVA_PROGRAM_ID)[0];
}

export function playerTokenAccount(stakeMint: PublicKey, player: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(stakeMint, player, false, TOKEN_2022_PROGRAM_ID);
}

function sha256(parts: readonly Uint8Array[]): Buffer {
  const digest = createHash("sha256");
  for (const part of parts) digest.update(part);
  return digest.digest();
}

function u128Le(value: bigint): Buffer {
  const output = Buffer.alloc(16);
  output.writeBigUInt64LE(value & ((1n << 64n) - 1n), 0);
  output.writeBigUInt64LE(value >> 64n, 8);
  return output;
}

function i64Le(value: bigint): Buffer {
  const output = Buffer.alloc(8);
  output.writeBigInt64LE(value);
  return output;
}

/** Must match the program's start leaf byte-for-byte. */
export function startLeaf(input: { tableId: readonly number[]; player: PublicKey; commitment: readonly number[]; sealedMarketHash: readonly number[]; price18: bigint; plannedStart: bigint; evidenceHash: readonly number[] }): Buffer {
  return sha256([
    Buffer.from("KOVA_START_V1"),
    Buffer.from(input.tableId),
    input.player.toBuffer(),
    Buffer.from(input.commitment),
    Buffer.from(input.sealedMarketHash),
    u128Le(input.price18),
    i64Le(input.plannedStart),
    Buffer.from(input.evidenceHash),
  ]);
}

function chainedDigest(domain: Buffer, tableId: readonly number[], values: readonly Buffer[]): Buffer {
  let chain = sha256([domain, Buffer.from(tableId)]);
  for (const value of values) chain = sha256([domain, Buffer.from(tableId), chain, value]);
  return chain;
}

/** Program roster order is ascending decoded wallet bytes. */
export function sortRoster<T extends { player: PublicKey }>(entries: readonly T[]): T[] {
  return [...entries].sort((left, right) => Buffer.compare(left.player.toBuffer(), right.player.toBuffer()));
}

export function startDigest(tableId: readonly number[], leavesInRosterOrder: readonly Buffer[]): Buffer {
  return chainedDigest(START_CHAIN_DOMAIN, tableId, leavesInRosterOrder);
}

export function rosterHash(tableId: readonly number[], playersInRosterOrder: readonly PublicKey[]): Buffer {
  return chainedDigest(ROSTER_CHAIN_DOMAIN, tableId, playersInRosterOrder.map((player) => player.toBuffer()));
}

export function hexToBytes32(hex: string): number[] {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Expected 32 bytes of hex.");
  return [...Buffer.from(hex, "hex")];
}

export interface KovaProgramClientOptions {
  connection: Connection;
  stakeMint: PublicKey;
  /** Operator key that creates and locks tables. Pays table rent; never holds stakes. */
  creator: Keypair;
  oracle: Keypair;
  admission: Keypair;
}

export class KovaProgramClient {
  readonly program: Program<KovaGame>;

  constructor(private readonly options: KovaProgramClientOptions) {
    const provider = new AnchorProvider(options.connection, new ReadOnlyWallet(), { commitment: "confirmed", preflightCommitment: "confirmed" });
    this.program = new Program<KovaGame>(idl as KovaGame, provider);
  }

  get connection(): Connection { return this.options.connection; }
  /** The operator (table creator) wallet that pays to open tables and funds the devnet faucet. */
  get operatorAddress(): PublicKey { return this.options.creator.publicKey; }
  get stakeMint(): PublicKey { return this.options.stakeMint; }

  tableAddress(tableUuid: string): PublicKey {
    return deriveTable(this.options.creator.publicKey, tableIdBytes(tableUuid));
  }

  async fetchTable(tableUuid: string) {
    return this.program.account.table.fetchNullable(this.tableAddress(tableUuid), "confirmed");
  }

  async fetchEntry(tableUuid: string, player: PublicKey) {
    return this.program.account.entry.fetchNullable(deriveEntry(this.tableAddress(tableUuid), player), "confirmed");
  }

  private async finalize(transaction: Transaction, feePayer: PublicKey): Promise<{ transaction: Transaction; lastValidBlockHeight: number }> {
    const latest = await this.options.connection.getLatestBlockhash("confirmed");
    transaction.feePayer = feePayer;
    transaction.recentBlockhash = latest.blockhash;
    return { transaction, lastValidBlockHeight: latest.lastValidBlockHeight };
  }

  /** Operator-signed. Returns a fully signed transaction for the backend to submit. */
  async initializeTable(input: { tableUuid: string; stakeRaw: bigint; maxPlayers: number; openForSeconds: number; roundSeconds: number }) {
    const tableId = tableIdBytes(input.tableUuid);
    const table = deriveTable(this.options.creator.publicKey, tableId);
    const built = await this.program.methods
      .initializeTable(tableId, new BN(input.stakeRaw.toString()), input.maxPlayers, input.openForSeconds, input.roundSeconds, this.options.oracle.publicKey, this.options.admission.publicKey)
      .accountsStrict({ creator: this.options.creator.publicKey, table, vault: deriveVault(table), stakeMint: this.options.stakeMint, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .transaction();
    const prepared = await this.finalize(built, this.options.creator.publicKey);
    prepared.transaction.sign(this.options.creator);
    return prepared;
  }

  /**
   * Player deposit. The admission authority co-signs only after the Dealer and the
   * deterministic gate accepted this exact commitment. The player's wallet signs last
   * and submits; the backend never sees the player's key.
   */
  async buildJoinForPlayer(input: { tableUuid: string; player: PublicKey; commitmentHex: string; sealedMarketHashHex: string }) {
    const table = this.tableAddress(input.tableUuid);
    const built = await this.program.methods
      .joinTable(hexToBytes32(input.commitmentHex), hexToBytes32(input.sealedMarketHashHex))
      .accountsStrict({
        player: input.player,
        admissionAuthority: this.options.admission.publicKey,
        table,
        entry: deriveEntry(table, input.player),
        vault: deriveVault(table),
        stakeMint: this.options.stakeMint,
        playerTokens: playerTokenAccount(this.options.stakeMint, input.player),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    const prepared = await this.finalize(built, input.player);
    prepared.transaction.partialSign(this.options.admission);
    return serializeForWallet(prepared.transaction, prepared.lastValidBlockHeight);
  }

  async lockTable(tableUuid: string) {
    const built = await this.program.methods.lockTable().accountsStrict({ creator: this.options.creator.publicKey, table: this.tableAddress(tableUuid) }).transaction();
    const prepared = await this.finalize(built, this.options.creator.publicKey);
    prepared.transaction.sign(this.options.creator);
    return prepared;
  }

  async recordStart(input: { tableUuid: string; player: PublicKey; startPrice18: bigint; evidenceHashHex: string }) {
    const table = this.tableAddress(input.tableUuid);
    const built = await this.program.methods
      .recordStart(new BN(input.startPrice18.toString()), hexToBytes32(input.evidenceHashHex))
      .accountsStrict({ oracle: this.options.oracle.publicKey, table, entry: deriveEntry(table, input.player) })
      .transaction();
    return this.oracleSigned(built);
  }

  async activateTable(input: { tableUuid: string; startDigest: Buffer; rosterHash: Buffer }) {
    const built = await this.program.methods
      .activateTable([...input.startDigest], [...input.rosterHash])
      .accountsStrict({ oracle: this.options.oracle.publicKey, table: this.tableAddress(input.tableUuid) })
      .transaction();
    return this.oracleSigned(built);
  }

  async recordResult(input: { tableUuid: string; player: PublicKey; endPrice18: bigint }) {
    const table = this.tableAddress(input.tableUuid);
    const built = await this.program.methods
      .recordResult(new BN(input.endPrice18.toString()))
      .accountsStrict({ oracle: this.options.oracle.publicKey, table, entry: deriveEntry(table, input.player) })
      .transaction();
    return this.oracleSigned(built);
  }

  async finalizeResult(input: { tableUuid: string; playersInRosterOrder: readonly PublicKey[] }) {
    const table = this.tableAddress(input.tableUuid);
    const built = await this.program.methods
      .finalizeResult()
      .accountsStrict({ oracle: this.options.oracle.publicKey, table })
      .remainingAccounts(input.playersInRosterOrder.map((player) => ({ pubkey: deriveEntry(table, player), isSigner: false, isWritable: true })))
      .transaction();
    return this.oracleSigned(built);
  }

  /** Permissionless: anyone may void an expired table. The operator pays the fee. */
  async voidExpiredTable(tableUuid: string) {
    const built = await this.program.methods.voidExpiredTable().accountsStrict({ table: this.tableAddress(tableUuid) }).transaction();
    const prepared = await this.finalize(built, this.options.creator.publicKey);
    prepared.transaction.sign(this.options.creator);
    return prepared;
  }

  /** Player-signed claim. Returned unsigned for the player's wallet. */
  async buildClaimForPlayer(input: { tableUuid: string; player: PublicKey; kind: "payout" | "refund" }) {
    const table = this.tableAddress(input.tableUuid);
    const accounts = {
      player: input.player,
      table,
      entry: deriveEntry(table, input.player),
      vault: deriveVault(table),
      stakeMint: this.options.stakeMint,
      playerTokens: playerTokenAccount(this.options.stakeMint, input.player),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    };
    const built = input.kind === "payout"
      ? await this.program.methods.claimPayout().accountsStrict(accounts).transaction()
      : await this.program.methods.claimRefund().accountsStrict(accounts).transaction();
    const prepared = await this.finalize(built, input.player);
    return serializeForWallet(prepared.transaction, prepared.lastValidBlockHeight);
  }

  /**
   * Devnet test-token grant: fee SOL plus stake tokens from the operator's fixed supply.
   * Operator-signed and submitted by the backend; the caller enforces network and limits.
   */
  async grantTestTokens(input: { wallet: PublicKey; lamports: number; amountRaw: bigint }) {
    const operator = this.options.creator.publicKey;
    const walletTokens = playerTokenAccount(this.options.stakeMint, input.wallet);
    const built = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: operator, toPubkey: input.wallet, lamports: input.lamports }),
      createAssociatedTokenAccountIdempotentInstruction(operator, walletTokens, input.wallet, this.options.stakeMint, TOKEN_2022_PROGRAM_ID),
      createTransferCheckedInstruction(playerTokenAccount(this.options.stakeMint, operator), this.options.stakeMint, walletTokens, operator, input.amountRaw, 6, [], TOKEN_2022_PROGRAM_ID),
    );
    const prepared = await this.finalize(built, operator);
    prepared.transaction.sign(this.options.creator);
    return prepared;
  }

  private async oracleSigned(built: Transaction) {
    const prepared = await this.finalize(built, this.options.oracle.publicKey);
    prepared.transaction.sign(this.options.oracle);
    return prepared;
  }
}

function serializeForWallet(transaction: Transaction, lastValidBlockHeight: number) {
  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  if (serialized.length > LEGACY_TRANSACTION_LIMIT) throw new Error("KOVA transaction exceeds the legacy size limit.");
  return { transactionBase64: serialized.toString("base64"), lastValidBlockHeight, messageHash: createHash("sha256").update(transaction.serializeMessage()).digest("hex") };
}

/** Submit an operator/oracle transaction and wait for confirmation. Simulation failure refuses to send. */
export async function submitSigned(connection: Connection, prepared: { transaction: Transaction; lastValidBlockHeight: number }): Promise<string> {
  const simulation = await connection.simulateTransaction(prepared.transaction);
  if (simulation.value.err !== null) throw new Error(`KOVA simulation failed: ${JSON.stringify(simulation.value.err)} ${(simulation.value.logs ?? []).slice(-3).join(" | ")}`);
  const serialized = prepared.transaction.serialize();
  const signature = await connection.sendRawTransaction(serialized, { preflightCommitment: "confirmed" });
  const blockhash = prepared.transaction.recentBlockhash;
  if (!blockhash) throw new Error("Transaction has no blockhash.");
  const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight }, "confirmed");
  if (confirmation.value.err !== null) throw new Error(`KOVA transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`);
  return signature;
}
