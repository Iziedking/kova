/** PostgreSQL repository for M3 game state. A configured database failure is fatal. */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { DurableGameTable, GamePrincipal, GameRepository, ParticipantInsertResult, ParticipantPrivateView, WalletProofResult } from "./repository";
import { inTransaction } from "./repository";
import type { WalletChallenge } from "./wallet-proof";

type TableRow = {
  id: string; host_principal_id: string; name: string; visibility: "public" | "private"; status: "DRAFT";
  financial_status: "unfunded"; rules: DurableGameTable["rules"]; opens_until: Date | null; starts_at: Date | null; ends_at: Date | null;
};

function toTable(row: TableRow): DurableGameTable {
  return {
    id: row.id,
    hostPrincipalId: row.host_principal_id,
    name: row.name,
    visibility: row.visibility,
    status: row.status,
    financialStatus: row.financial_status,
    rules: row.rules,
    opensUntil: row.opens_until?.toISOString() ?? null,
    startsAt: row.starts_at?.toISOString() ?? null,
    endsAt: row.ends_at?.toISOString() ?? null,
  };
}

export class PostgresGameRepository implements GameRepository {
  readonly pool: Pool;

  constructor(databaseUrl: string, pool?: Pool) {
    if (!databaseUrl.trim()) throw new Error("A PostgreSQL URL is required for durable game state.");
    this.pool = pool ?? new Pool({ connectionString: databaseUrl, max: 10 });
  }

  async principalForPrivyUser(privyUserId: string): Promise<GamePrincipal> {
    const id = randomUUID();
    const result = await this.pool.query<{ id: string; privy_user_id: string }>(
      `INSERT INTO game_principals (id, privy_user_id) VALUES ($1, $2)
       ON CONFLICT (privy_user_id) DO UPDATE SET privy_user_id = EXCLUDED.privy_user_id
       RETURNING id, privy_user_id`, [id, privyUserId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Principal creation returned no row.");
    return { id: row.id, privyUserId: row.privy_user_id };
  }

  async putWalletChallenge(challenge: WalletChallenge): Promise<void> {
    await this.pool.query(
      `INSERT INTO game_wallet_challenges (id, principal_id, wallet, origin, nonce_hash, message, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [challenge.id, challenge.principalId, challenge.wallet, challenge.origin, challenge.nonceHash, challenge.message, challenge.expiresAt],
    );
  }

  async challengeForProof(challengeId: string): Promise<WalletChallenge | null> {
    const result = await this.pool.query<{ id: string; principal_id: string; wallet: string; origin: string; nonce_hash: string; message: string; expires_at: Date; consumed_at: Date | null }>(
      `SELECT id, principal_id, wallet, origin, nonce_hash, message, expires_at, consumed_at
       FROM game_wallet_challenges WHERE id = $1`, [challengeId],
    );
    const row = result.rows[0];
    return row ? { id: row.id, principalId: row.principal_id, wallet: row.wallet, origin: row.origin, nonceHash: row.nonce_hash, message: row.message, expiresAt: row.expires_at.toISOString(), consumedAt: row.consumed_at?.toISOString() ?? null } : null;
  }

  async consumeWalletChallenge(input: { challengeId: string; principalId: string; wallet: string; now: Date }): Promise<WalletProofResult> {
    return inTransaction(this.pool, async (client) => {
      const result = await client.query<{ principal_id: string; wallet: string; expires_at: Date; consumed_at: Date | null }>(
        "SELECT principal_id, wallet, expires_at, consumed_at FROM game_wallet_challenges WHERE id = $1 FOR UPDATE", [input.challengeId],
      );
      const row = result.rows[0];
      if (!row) return { ok: false, code: "CHALLENGE_NOT_FOUND" };
      if (row.principal_id !== input.principalId || row.wallet !== input.wallet) return { ok: false, code: "CHALLENGE_OWNER_MISMATCH" };
      if (row.consumed_at) return { ok: false, code: "CHALLENGE_REPLAYED" };
      if (row.expires_at.getTime() <= input.now.getTime()) return { ok: false, code: "CHALLENGE_EXPIRED" };
      const bound = await client.query<{ principal_id: string }>("SELECT principal_id FROM game_wallet_bindings WHERE wallet = $1", [input.wallet]);
      if (bound.rows[0] && bound.rows[0].principal_id !== input.principalId) return { ok: false, code: "WALLET_ALREADY_BOUND" };
      await client.query("UPDATE game_wallet_challenges SET consumed_at = $2 WHERE id = $1", [input.challengeId, input.now]);
      await client.query(
        `INSERT INTO game_wallet_bindings (wallet, principal_id, proof_challenge_id, verified_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (wallet) DO UPDATE SET proof_challenge_id = EXCLUDED.proof_challenge_id, verified_at = EXCLUDED.verified_at`,
        [input.wallet, input.principalId, input.challengeId, input.now],
      );
      return { ok: true, replayed: false };
    });
  }

  async createTable(input: DurableGameTable): Promise<DurableGameTable> {
    const result = await this.pool.query<TableRow>(
      `INSERT INTO game_tables (id, host_principal_id, name, visibility, status, financial_status, rules, opens_until, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, host_principal_id, name, visibility, status, financial_status, rules, opens_until, starts_at, ends_at`,
      [input.id, input.hostPrincipalId, input.name, input.visibility, input.status, input.financialStatus, input.rules, input.opensUntil, input.startsAt, input.endsAt],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Table creation returned no row.");
    return toTable(row);
  }

  async listPublicTables(): Promise<readonly DurableGameTable[]> {
    const result = await this.pool.query<TableRow>(
      `SELECT id, host_principal_id, name, visibility, status, financial_status, rules, opens_until, starts_at, ends_at
       FROM game_tables WHERE visibility = 'public' ORDER BY created_at DESC LIMIT 100`,
    );
    return result.rows.map(toTable);
  }

  async tableForPrincipal(tableId: string, principalId: string, invitationTokenHash?: string): Promise<DurableGameTable | null> {
    const result = await this.pool.query<TableRow>(
      `SELECT DISTINCT t.id, t.host_principal_id, t.name, t.visibility, t.status, t.financial_status, t.rules, t.opens_until, t.starts_at, t.ends_at
       FROM game_tables t
       LEFT JOIN game_participants p ON p.table_id = t.id AND p.principal_id = $2
       LEFT JOIN game_invitations i ON i.table_id = t.id AND i.claimed_by_principal_id = $2
       WHERE t.id = $1 AND (t.visibility = 'public' OR t.host_principal_id = $2 OR p.id IS NOT NULL OR i.id IS NOT NULL OR ($3::text IS NOT NULL AND i.token_hash = $3))`,
      [tableId, principalId, invitationTokenHash ?? null],
    );
    return result.rows[0] ? toTable(result.rows[0]) : null;
  }

  async createInvitation(input: { id: string; tableId: string; creatorPrincipalId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    const owned = await this.pool.query("SELECT 1 FROM game_tables WHERE id = $1 AND host_principal_id = $2", [input.tableId, input.creatorPrincipalId]);
    if (owned.rowCount !== 1) throw new Error("Table invitation requires host ownership.");
    await this.pool.query(
      "INSERT INTO game_invitations (id, table_id, token_hash, created_by_principal_id, expires_at) VALUES ($1,$2,$3,$4,$5)",
      [input.id, input.tableId, input.tokenHash, input.creatorPrincipalId, input.expiresAt],
    );
  }

  async claimInvitation(input: { tokenHash: string; principalId: string; now: Date }): Promise<{ ok: true; tableId: string } | { ok: false; code: "INVITATION_INVALID" | "INVITATION_REPLAYED" }> {
    return inTransaction(this.pool, async (client) => {
      const result = await client.query<{ id: string; table_id: string; expires_at: Date; claimed_by_principal_id: string | null }>(
        "SELECT id, table_id, expires_at, claimed_by_principal_id FROM game_invitations WHERE token_hash = $1 FOR UPDATE", [input.tokenHash],
      );
      const row = result.rows[0];
      if (!row || row.expires_at.getTime() <= input.now.getTime()) return { ok: false, code: "INVITATION_INVALID" };
      if (row.claimed_by_principal_id === input.principalId) return { ok: true, tableId: row.table_id };
      if (row.claimed_by_principal_id) return { ok: false, code: "INVITATION_REPLAYED" };
      await client.query("UPDATE game_invitations SET claimed_by_principal_id = $2, claimed_at = $3 WHERE id = $1", [row.id, input.principalId, input.now]);
      return { ok: true, tableId: row.table_id };
    });
  }

  async submitParticipant(input: Parameters<GameRepository["submitParticipant"]>[0]): Promise<ParticipantInsertResult> {
    return inTransaction(this.pool, async (client) => {
      const reserved = await client.query(
        `INSERT INTO game_idempotency (principal_id, operation_key, request_hash, status)
         VALUES ($1,$2,$3,'in_progress') ON CONFLICT DO NOTHING`,
        [input.principalId, input.operationKey, input.requestHash],
      );
      if (reserved.rowCount === 0) {
        const idempotency = await client.query<{ request_hash: string; response: ParticipantPrivateView | null }>(
          "SELECT request_hash, response FROM game_idempotency WHERE principal_id = $1 AND operation_key = $2 FOR UPDATE", [input.principalId, input.operationKey],
        );
        const replay = idempotency.rows[0];
        if (replay.request_hash !== input.requestHash || !replay.response) return { ok: false, code: "IDEMPOTENCY_CONFLICT" };
        return { ok: true, participant: replay.response, replayed: true };
      }
      const table = await client.query<{ host_principal_id: string; visibility: string }>("SELECT host_principal_id, visibility FROM game_tables WHERE id = $1", [input.tableId]);
      if (!table.rows[0]) return { ok: false, code: "TABLE_NOT_FOUND" };
      if (table.rows[0].visibility === "private" && table.rows[0].host_principal_id !== input.principalId) {
        const invited = await client.query("SELECT 1 FROM game_invitations WHERE table_id = $1 AND claimed_by_principal_id = $2", [input.tableId, input.principalId]);
        if (invited.rowCount !== 1) return { ok: false, code: "TABLE_ACCESS_DENIED" };
      }
      const binding = await client.query("SELECT 1 FROM game_wallet_bindings WHERE wallet = $1 AND principal_id = $2", [input.wallet, input.principalId]);
      if (binding.rowCount !== 1) return { ok: false, code: "WALLET_NOT_BOUND" };
      const participant: ParticipantPrivateView = {
        tableId: input.tableId,
        principalId: input.principalId,
        wallet: input.wallet,
        commitment: input.commitment,
        sealedMarketHash: input.sealedMarketHash,
        admissionDecision: "INSUFFICIENT_EVIDENCE",
        fundingStatus: "unfunded",
        encryptedRecord: input.encryptedRecord,
      };
      try {
        await client.query(
          `INSERT INTO game_participants (id, table_id, principal_id, wallet, commitment, sealed_market_hash, admission_decision, funding_status)
           VALUES ($1,$2,$3,$4,$5,$6,'INSUFFICIENT_EVIDENCE','unfunded')`,
          [input.id, input.tableId, input.principalId, input.wallet, input.commitment, input.sealedMarketHash],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") return { ok: false, code: "SEAT_ALREADY_USED" };
        throw error;
      }
      await client.query(
        `INSERT INTO game_private_records (id, table_id, principal_id, kind, key_id, iv_base64, auth_tag_base64, ciphertext_base64, aad_hash)
         VALUES ($1,$2,$3,'pick',$4,$5,$6,$7,$8)`,
        [randomUUID(), input.tableId, input.principalId, input.encryptedRecord.keyId, input.encryptedRecord.ivBase64, input.encryptedRecord.authTagBase64, input.encryptedRecord.ciphertextBase64, input.encryptedRecord.aadHash],
      );
      await client.query("UPDATE game_idempotency SET status = 'completed', response = $3, updated_at = now() WHERE principal_id = $1 AND operation_key = $2", [input.principalId, input.operationKey, participant]);
      return { ok: true, participant, replayed: false };
    });
  }

  async privateParticipant(tableId: string, principalId: string): Promise<ParticipantPrivateView | null> {
    const result = await this.pool.query<{
      table_id: string; principal_id: string; wallet: string; commitment: string; sealed_market_hash: string;
      admission_decision: "INSUFFICIENT_EVIDENCE"; funding_status: "unfunded"; key_id: string; iv_base64: string;
      auth_tag_base64: string; ciphertext_base64: string; aad_hash: string;
    }>(
      `SELECT p.table_id, p.principal_id, p.wallet, p.commitment, p.sealed_market_hash, p.admission_decision, p.funding_status,
              r.key_id, r.iv_base64, r.auth_tag_base64, r.ciphertext_base64, r.aad_hash
       FROM game_participants p JOIN game_private_records r ON r.table_id = p.table_id AND r.principal_id = p.principal_id AND r.kind = 'pick'
       WHERE p.table_id = $1 AND p.principal_id = $2`, [tableId, principalId],
    );
    const row = result.rows[0];
    return row ? {
      tableId: row.table_id, principalId: row.principal_id, wallet: row.wallet, commitment: row.commitment,
      sealedMarketHash: row.sealed_market_hash, admissionDecision: row.admission_decision, fundingStatus: row.funding_status,
      encryptedRecord: { keyId: row.key_id, ivBase64: row.iv_base64, authTagBase64: row.auth_tag_base64, ciphertextBase64: row.ciphertext_base64, aadHash: row.aad_hash },
    } : null;
  }

  async reserveBudget(input: Parameters<GameRepository["reserveBudget"]>[0]): Promise<{ ok: true; replayed: boolean } | { ok: false; code: "BUDGET_EXCEEDED" }> {
    return inTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`budget:${input.category}:${input.now.toISOString().slice(0, 10)}`]);
      const existing = await client.query("SELECT 1 FROM game_budget_reservations WHERE operation_key = $1", [input.operationKey]);
      if (existing.rowCount === 1) return { ok: true, replayed: true };
      const used = await client.query<{ total: string }>(
        `SELECT COALESCE(sum(amount_micro_usd), 0)::text AS total FROM game_budget_reservations
         WHERE category = $1 AND status IN ('reserved','spent') AND created_at >= date_trunc('day', $2::timestamptz)`, [input.category, input.now],
      );
      if (BigInt(used.rows[0]?.total ?? "0") + BigInt(input.amountMicroUsd) > input.dailyLimitMicroUsd) return { ok: false, code: "BUDGET_EXCEEDED" };
      await client.query(
        `INSERT INTO game_budget_reservations (id, principal_id, category, operation_key, amount_micro_usd, status, expires_at)
         VALUES ($1,$2,$3,$4,$5,'reserved',$6)`,
        [input.id, input.principalId, input.category, input.operationKey, input.amountMicroUsd, input.expiresAt],
      );
      return { ok: true, replayed: false };
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
