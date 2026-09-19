import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { AnchorProvider, BN, Program, type Wallet } from "@anchor-lang/core";
import {
  AuthorityType,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccount,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createMint,
  getAccount,
  getMintLen,
  mintTo,
  setAuthority,
  transferChecked,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Signer,
  type VersionedTransaction,
} from "@solana/web3.js";

import idl from "../idl/kova_game.json";
import type { KovaGame } from "../idl/kova_game";

const RPC_URL = process.env.KOVA_LOCAL_RPC_URL ?? "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey("AJeX3fo46PTu6StNorvkSatRwXLKAvfZpDv6PAzJVCjj");
const STAKE_RAW = 1_000_000n;
const EXTRA_RAW = 7n;
const PRICE_SCALE = 1_000_000_000_000_000_000n;
const START_CHAIN_DOMAIN = Buffer.from("KOVA_START_CHAIN_V1");
const ROSTER_CHAIN_DOMAIN = Buffer.from("KOVA_ROSTER_CHAIN_V1");

type Measurement = {
  label: string;
  bytes: number;
  computeUnits: number | null;
  signature: string;
};

class KeypairWallet implements Wallet {
  constructor(readonly payer: Keypair) {}

  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (transaction instanceof Transaction) {
      transaction.partialSign(this.payer);
    } else {
      transaction.sign([this.payer]);
    }
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[],
  ): Promise<T[]> {
    return Promise.all(transactions.map((transaction) => this.signTransaction(transaction)));
  }
}

function bytes(length: number, value: number): number[] {
  return Array.from({ length }, () => value);
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

function hash(parts: readonly Uint8Array[]): Buffer {
  const digest = createHash("sha256");
  for (const part of parts) digest.update(part);
  return digest.digest();
}

function deriveTable(creator: PublicKey, tableId: number[]): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("table"), creator.toBuffer(), Buffer.from(tableId)],
    PROGRAM_ID,
  )[0];
}

function deriveVault(table: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), table.toBuffer()], PROGRAM_ID)[0];
}

function deriveEntry(table: PublicKey, player: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), table.toBuffer(), player.toBuffer()],
    PROGRAM_ID,
  )[0];
}

async function airdrop(connection: Connection, recipient: PublicKey): Promise<void> {
  const signature = await connection.requestAirdrop(recipient, 5_000_000_000);
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

function uniqueSigners(payer: Keypair, signers: readonly Signer[]): Signer[] {
  const byAddress = new Map<string, Signer>([[payer.publicKey.toBase58(), payer]]);
  for (const signer of signers) byAddress.set(signer.publicKey.toBase58(), signer);
  return [...byAddress.values()];
}

async function sendMeasured(
  connection: Connection,
  measurements: Measurement[],
  label: string,
  transaction: Transaction,
  payer: Keypair,
  signers: readonly Signer[] = [],
): Promise<string> {
  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.sign(...uniqueSigners(payer, signers));
  const serialized = transaction.serialize();
  assert.ok(serialized.length <= 1_232, `${label} exceeds the legacy transaction limit`);

  const simulation = await connection.simulateTransaction(transaction);
  assert.equal(simulation.value.err, null, `${label} simulation failed: ${JSON.stringify(simulation.value.err)}`);

  const signature = await connection.sendRawTransaction(serialized, {
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  measurements.push({
    label,
    bytes: serialized.length,
    computeUnits: simulation.value.unitsConsumed ?? null,
    signature,
  });
  return signature;
}

async function expectRejected(
  connection: Connection,
  transaction: Transaction,
  payer: Keypair,
  signers: readonly Signer[],
  description: string,
): Promise<void> {
  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.sign(...uniqueSigners(payer, signers));
  await assert.rejects(
    async () =>
      connection.sendRawTransaction(transaction.serialize(), {
        preflightCommitment: "confirmed",
        skipPreflight: false,
      }),
    description,
  );
}

async function waitUntil(unixSeconds: bigint): Promise<void> {
  const delay = Number(unixSeconds * 1_000n - BigInt(Date.now()) + 1_100n);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

function startLeaf(input: {
  tableId: number[];
  player: PublicKey;
  commitment: number[];
  sealedMarketHash: number[];
  price: bigint;
  plannedStart: bigint;
  evidenceHash: number[];
}): Buffer {
  return hash([
    Buffer.from("KOVA_START_V1"),
    Buffer.from(input.tableId),
    input.player.toBuffer(),
    Buffer.from(input.commitment),
    Buffer.from(input.sealedMarketHash),
    u128Le(input.price),
    i64Le(input.plannedStart),
    Buffer.from(input.evidenceHash),
  ]);
}

function chainedDigest(
  domain: Buffer,
  tableId: number[],
  values: readonly Buffer[],
): Buffer {
  let chain = hash([domain, Buffer.from(tableId)]);
  for (const value of values) {
    chain = hash([domain, Buffer.from(tableId), chain, value]);
  }
  return chain;
}

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  assert.equal(await connection.getVersion().then((version) => version["solana-core"]), "4.1.2");
  const programAccount = await connection.getAccountInfo(PROGRAM_ID, "confirmed");
  assert.ok(programAccount?.executable, "KOVA program is not loaded on the local validator");

  const creator = Keypair.generate();
  const oracle = Keypair.generate();
  const admission = Keypair.generate();
  const players = [Keypair.generate(), Keypair.generate()];
  for (const signer of [creator, oracle, admission, ...players]) {
    await airdrop(connection, signer.publicKey);
  }

  const provider = new AnchorProvider(connection, new KeypairWallet(creator), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new Program<KovaGame>(idl as KovaGame, provider);
  assert.equal(program.programId.toBase58(), PROGRAM_ID.toBase58());

  const unsupportedMint = Keypair.generate();
  const unsupportedMintSize = getMintLen([ExtensionType.TransferFeeConfig]);
  const unsupportedMintRent = await connection.getMinimumBalanceForRentExemption(unsupportedMintSize);
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: creator.publicKey,
        newAccountPubkey: unsupportedMint.publicKey,
        lamports: unsupportedMintRent,
        space: unsupportedMintSize,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferFeeConfigInstruction(
        unsupportedMint.publicKey,
        creator.publicKey,
        creator.publicKey,
        25,
        1_000_000n,
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMintInstruction(
        unsupportedMint.publicKey,
        6,
        creator.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID,
      ),
    ),
    [creator, unsupportedMint],
    { commitment: "confirmed" },
  );
  const unsupportedTableId = bytes(16, 10);
  const unsupportedTable = deriveTable(creator.publicKey, unsupportedTableId);
  await expectRejected(
    connection,
    await program.methods
      .initializeTable(
        unsupportedTableId,
        new BN(STAKE_RAW.toString()),
        2,
        30,
        1,
        oracle.publicKey,
        admission.publicKey,
      )
      .accountsStrict({
        creator: creator.publicKey,
        table: unsupportedTable,
        vault: deriveVault(unsupportedTable),
        stakeMint: unsupportedMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction(),
    creator,
    [],
    "a transfer-fee stake mint must be rejected",
  );

  const mint = await createMint(
    connection,
    creator,
    creator.publicKey,
    null,
    6,
    undefined,
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID,
  );
  const playerTokens = await Promise.all(
    players.map((player) =>
      createAssociatedTokenAccount(
        connection,
        creator,
        mint,
        player.publicKey,
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID,
        undefined,
        false,
      ),
    ),
  );
  const creatorTokens = await createAssociatedTokenAccount(
    connection,
    creator,
    mint,
    creator.publicKey,
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID,
    undefined,
    false,
  );
  for (const tokenAccount of playerTokens) {
    await mintTo(
      connection,
      creator,
      mint,
      tokenAccount,
      creator,
      STAKE_RAW * 2n,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID,
    );
  }
  await mintTo(
    connection,
    creator,
    mint,
    creatorTokens,
    creator,
    EXTRA_RAW,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID,
  );
  await setAuthority(
    connection,
    creator,
    mint,
    creator,
    AuthorityType.MintTokens,
    null,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID,
  );

  const measurements: Measurement[] = [];
  const tableId = bytes(16, 11);
  const table = deriveTable(creator.publicKey, tableId);
  const vault = deriveVault(table);
  const entries = players.map((player) => deriveEntry(table, player.publicKey));
  const commitments = [bytes(32, 21), bytes(32, 22)];
  const sealedHashes = [bytes(32, 31), bytes(32, 32)];
  const evidenceHashes = [bytes(32, 41), bytes(32, 42)];

  await sendMeasured(
    connection,
    measurements,
    "initialize_table",
    await program.methods
      .initializeTable(tableId, new BN(STAKE_RAW.toString()), 2, 30, 1, oracle.publicKey, admission.publicKey)
      .accountsStrict({
        creator: creator.publicKey,
        table,
        vault,
        stakeMint: mint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction(),
    creator,
  );

  for (let index = 0; index < players.length; index += 1) {
    await sendMeasured(
      connection,
      measurements,
      `join_table_${index + 1}`,
      await program.methods
        .joinTable(commitments[index], sealedHashes[index])
        .accountsStrict({
          player: players[index].publicKey,
          admissionAuthority: admission.publicKey,
          table,
          entry: entries[index],
          vault,
          stakeMint: mint,
          playerTokens: playerTokens[index],
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
      players[index],
      [admission],
    );
  }
  assert.equal((await getAccount(connection, vault, "confirmed", TOKEN_2022_PROGRAM_ID)).amount, STAKE_RAW * 2n);

  await expectRejected(
    connection,
    await program.methods
      .joinTable(commitments[0], sealedHashes[0])
      .accountsStrict({
        player: players[0].publicKey,
        admissionAuthority: admission.publicKey,
        table,
        entry: entries[0],
        vault,
        stakeMint: mint,
        playerTokens: playerTokens[0],
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction(),
    players[0],
    [admission],
    "a wallet must not join a table twice",
  );

  await sendMeasured(
    connection,
    measurements,
    "lock_table",
    await program.methods
      .lockTable()
      .accountsStrict({ creator: creator.publicKey, table })
      .transaction(),
    creator,
  );
  const lockedTable = await program.account.table.fetch(table);
  const plannedStart = BigInt(lockedTable.plannedStart.toString());
  const startPrices = [100n * PRICE_SCALE, 100n * PRICE_SCALE];

  for (let index = 0; index < players.length; index += 1) {
    await sendMeasured(
      connection,
      measurements,
      `record_start_${index + 1}`,
      await program.methods
        .recordStart(new BN(startPrices[index].toString()), evidenceHashes[index])
        .accountsStrict({ oracle: oracle.publicKey, table, entry: entries[index] })
        .transaction(),
      oracle,
    );
  }

  const order = players
    .map((player, index) => ({ player, index, entry: entries[index] }))
    .sort((left, right) => Buffer.compare(left.player.publicKey.toBuffer(), right.player.publicKey.toBuffer()));
  const leaves = order.map(({ player, index }) =>
    startLeaf({
      tableId,
      player: player.publicKey,
      commitment: commitments[index],
      sealedMarketHash: sealedHashes[index],
      price: startPrices[index],
      plannedStart,
      evidenceHash: evidenceHashes[index],
    }),
  );
  const startDigest = chainedDigest(START_CHAIN_DOMAIN, tableId, leaves);
  const rosterHash = chainedDigest(
    ROSTER_CHAIN_DOMAIN,
    tableId,
    order.map(({ player }) => player.publicKey.toBuffer()),
  );

  await sendMeasured(
    connection,
    measurements,
    "activate_table",
    await program.methods
      .activateTable([...startDigest], [...rosterHash])
      .accountsStrict({ oracle: oracle.publicKey, table })
      .transaction(),
    oracle,
  );
  const activeTable = await program.account.table.fetch(table);
  await waitUntil(BigInt(activeTable.endsAt.toString()));

  const endPrices = [110n * PRICE_SCALE, 105n * PRICE_SCALE];
  for (let index = 0; index < players.length; index += 1) {
    await sendMeasured(
      connection,
      measurements,
      `record_result_${index + 1}`,
      await program.methods
        .recordResult(new BN(endPrices[index].toString()))
        .accountsStrict({ oracle: oracle.publicKey, table, entry: entries[index] })
        .transaction(),
      oracle,
    );
  }

  await sendMeasured(
    connection,
    measurements,
    "finalize_result",
    await program.methods
      .finalizeResult()
      .accountsStrict({ oracle: oracle.publicKey, table })
      .remainingAccounts(
        order.map(({ entry }) => ({ pubkey: entry, isSigner: false, isWritable: true })),
      )
      .transaction(),
    oracle,
  );
  const settledTable = await program.account.table.fetch(table);
  assert.equal(settledTable.totalAwards.toString(), (STAKE_RAW * 2n).toString());
  assert.equal(settledTable.potRaw.toString(), (STAKE_RAW * 2n).toString());

  await transferChecked(
    connection,
    creator,
    creatorTokens,
    mint,
    vault,
    creator,
    EXTRA_RAW,
    6,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID,
  );

  for (let index = 0; index < players.length; index += 1) {
    await sendMeasured(
      connection,
      measurements,
      `claim_payout_${index + 1}`,
      await program.methods
        .claimPayout()
        .accountsStrict({
          player: players[index].publicKey,
          table,
          entry: entries[index],
          vault,
          stakeMint: mint,
          playerTokens: playerTokens[index],
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .transaction(),
      players[index],
    );
  }
  assert.equal((await getAccount(connection, vault, "confirmed", TOKEN_2022_PROGRAM_ID)).amount, EXTRA_RAW);
  assert.equal(
    (await getAccount(connection, playerTokens[0], "confirmed", TOKEN_2022_PROGRAM_ID)).amount,
    STAKE_RAW * 3n,
  );
  assert.equal(
    (await getAccount(connection, playerTokens[1], "confirmed", TOKEN_2022_PROGRAM_ID)).amount,
    STAKE_RAW,
  );
  await expectRejected(
    connection,
    await program.methods
      .claimPayout()
      .accountsStrict({
        player: players[0].publicKey,
        table,
        entry: entries[0],
        vault,
        stakeMint: mint,
        playerTokens: playerTokens[0],
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .transaction(),
    players[0],
    [],
    "a payout must not be claimed twice",
  );

  const refundTableId = bytes(16, 12);
  const refundTable = deriveTable(creator.publicKey, refundTableId);
  const refundVault = deriveVault(refundTable);
  const refundEntries = players.map((player) => deriveEntry(refundTable, player.publicKey));
  await sendMeasured(
    connection,
    measurements,
    "refund_initialize_table",
    await program.methods
      .initializeTable(refundTableId, new BN(STAKE_RAW.toString()), 2, 1, 1, oracle.publicKey, admission.publicKey)
      .accountsStrict({
        creator: creator.publicKey,
        table: refundTable,
        vault: refundVault,
        stakeMint: mint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction(),
    creator,
  );
  for (let index = 0; index < players.length; index += 1) {
    await sendMeasured(
      connection,
      measurements,
      `refund_join_table_${index + 1}`,
      await program.methods
        .joinTable(bytes(32, 51 + index), bytes(32, 61 + index))
        .accountsStrict({
          player: players[index].publicKey,
          admissionAuthority: admission.publicKey,
          table: refundTable,
          entry: refundEntries[index],
          vault: refundVault,
          stakeMint: mint,
          playerTokens: playerTokens[index],
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
      players[index],
      [admission],
    );
  }
  const refundState = await program.account.table.fetch(refundTable);
  await waitUntil(BigInt(refundState.openUntil.toString()));
  await sendMeasured(
    connection,
    measurements,
    "void_expired_table",
    await program.methods
      .voidExpiredTable()
      .accountsStrict({ table: refundTable })
      .transaction(),
    creator,
  );
  for (let index = 0; index < players.length; index += 1) {
    await sendMeasured(
      connection,
      measurements,
      `claim_refund_${index + 1}`,
      await program.methods
        .claimRefund()
        .accountsStrict({
          player: players[index].publicKey,
          table: refundTable,
          entry: refundEntries[index],
          vault: refundVault,
          stakeMint: mint,
          playerTokens: playerTokens[index],
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .transaction(),
      players[index],
    );
  }
  assert.equal((await getAccount(connection, refundVault, "confirmed", TOKEN_2022_PROGRAM_ID)).amount, 0n);

  const maxBytes = Math.max(...measurements.map((measurement) => measurement.bytes));
  const maxComputeUnits = Math.max(
    ...measurements.map((measurement) => measurement.computeUnits ?? 0),
  );
  console.log(
    JSON.stringify(
      {
        proof: "kova-program-local-v1",
        programId: PROGRAM_ID.toBase58(),
        tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(),
        assertions: {
          realTokenBalanceChanges: true,
          potConserved: true,
          payoutReplayRejected: true,
          duplicateJoinRejected: true,
          unsupportedMintExtensionRejected: true,
          unsolicitedTokensExcludedFromPot: true,
          permissionlessTimeoutRefundedWithoutBackend: true,
        },
        limits: { maxTransactionBytes: maxBytes, maxComputeUnits },
        measurements,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
