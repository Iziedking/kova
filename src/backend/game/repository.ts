import type { Pool, PoolClient } from "pg";
import type { EncryptedPrivateRecord } from "./pick-crypto";
import type { WalletChallenge } from "./wallet-proof";

export interface GamePrincipal {
  id: string;
  privyUserId: string;
}

export interface DurableGameTable {
  id: string;
  hostPrincipalId: string;
  name: string;
  visibility: "public" | "private";
  status: "DRAFT";
  financialStatus: "unfunded";
  rules: {
    playerCount: number;
    stakeMint: string;
    stakeRaw: string;
    roundDurationSeconds: 900;
    scoreVersion: "kova-bps-v1";
    tieBreakVersion: "wallet-bytes-v1";
    commitmentVersion: "kova-pick-v1";
  };
  opensUntil: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface ParticipantPrivateView {
  tableId: string;
  principalId: string;
  wallet: string;
  commitment: string;
  sealedMarketHash: string;
  admissionDecision: "INSUFFICIENT_EVIDENCE";
  fundingStatus: "unfunded";
  encryptedRecord: EncryptedPrivateRecord;
}

export type WalletProofResult =
  | { ok: true; replayed: false }
  | { ok: false; code: "CHALLENGE_NOT_FOUND" | "CHALLENGE_REPLAYED" | "CHALLENGE_EXPIRED" | "CHALLENGE_OWNER_MISMATCH" | "WALLET_ALREADY_BOUND" };

export type ParticipantInsertResult =
  | { ok: true; participant: ParticipantPrivateView; replayed: boolean }
  | { ok: false; code: "TABLE_NOT_FOUND" | "TABLE_ACCESS_DENIED" | "WALLET_NOT_BOUND" | "SEAT_ALREADY_USED" | "IDEMPOTENCY_CONFLICT" };

export interface GameRepository {
  principalForPrivyUser(privyUserId: string): Promise<GamePrincipal>;
  putWalletChallenge(challenge: WalletChallenge): Promise<void>;
  challengeForProof(challengeId: string): Promise<WalletChallenge | null>;
  consumeWalletChallenge(input: { challengeId: string; principalId: string; wallet: string; now: Date }): Promise<WalletProofResult>;
  createTable(input: DurableGameTable): Promise<DurableGameTable>;
  listPublicTables(): Promise<readonly DurableGameTable[]>;
  tableForPrincipal(tableId: string, principalId: string, invitationTokenHash?: string): Promise<DurableGameTable | null>;
  createInvitation(input: { id: string; tableId: string; creatorPrincipalId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  claimInvitation(input: { tokenHash: string; principalId: string; now: Date }): Promise<{ ok: true; tableId: string } | { ok: false; code: "INVITATION_INVALID" | "INVITATION_REPLAYED" }>;
  submitParticipant(input: {
    id: string;
    principalId: string;
    tableId: string;
    wallet: string;
    commitment: string;
    sealedMarketHash: string;
    encryptedRecord: EncryptedPrivateRecord;
    operationKey: string;
    requestHash: string;
  }): Promise<ParticipantInsertResult>;
  privateParticipant(tableId: string, principalId: string): Promise<ParticipantPrivateView | null>;
  reserveBudget(input: { id: string; principalId: string | null; category: string; operationKey: string; amountMicroUsd: string; expiresAt: Date; dailyLimitMicroUsd: bigint; now: Date }): Promise<{ ok: true; replayed: boolean } | { ok: false; code: "BUDGET_EXCEEDED" }>;
  close(): Promise<void>;
}

export async function inTransaction<T>(pool: Pool, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

