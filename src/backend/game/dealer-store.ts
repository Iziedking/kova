import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AdmissionDecision } from "../../domain/game/admission";
import { decryptPrivateJson, encryptPrivateJson, type EncryptedPrivateRecord, type PickKeyring } from "./pick-crypto";

export interface DealerReceipt {
  operationKey: string;
  providerRequestId: string | null;
  model: string | null;
  costMicroUsd: string;
  toolsUsed: readonly string[];
  isolationStatus: "soft_prompt_only" | "hard_scoped";
  result: string;
}

export class PostgresDealerStore {
  constructor(private readonly pool: Pool, private readonly keyring: PickKeyring) {}

  private context(mintHash: string) {
    return { tableId: "dealer-cache", principalId: mintHash, kind: "dealer_report" };
  }

  async latest(network: string, mint: string, now = new Date()): Promise<AdmissionDecision | null> {
    const mintHash = createHash("sha256").update(mint).digest("hex");
    const result = await this.pool.query<EncryptedPrivateRecord & { key_id: string; iv_base64: string; auth_tag_base64: string; ciphertext_base64: string; aad_hash: string }>(
      `SELECT key_id, iv_base64, auth_tag_base64, ciphertext_base64, aad_hash FROM game_dealer_cache
       WHERE network = $1 AND mint_hash = $2 AND schema_version = 'kova-admission-v1' AND expires_at > $3
       ORDER BY expires_at DESC LIMIT 1`, [network, mintHash, now],
    );
    const row = result.rows[0];
    if (!row) return null;
    return decryptPrivateJson<AdmissionDecision>({ keyId: row.key_id, ivBase64: row.iv_base64, authTagBase64: row.auth_tag_base64, ciphertextBase64: row.ciphertext_base64, aadHash: row.aad_hash }, this.context(mintHash), this.keyring);
  }

  async put(input: { decision: AdmissionDecision; evidenceHash: string; publicProjection: unknown; receipt: DealerReceipt; expiresAt: Date }): Promise<void> {
    const mintHash = createHash("sha256").update(input.decision.mint).digest("hex");
    const cacheKey = createHash("sha256").update(`${input.decision.network}:${mintHash}:${input.evidenceHash}:${input.decision.schemaVersion}`).digest("hex");
    const encrypted = encryptPrivateJson(input.decision, this.context(mintHash), this.keyring);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO game_dealer_cache (cache_key, network, mint_hash, schema_version, decision, key_id, iv_base64, auth_tag_base64, ciphertext_base64, aad_hash, evidence_hash, public_projection, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (cache_key) DO NOTHING`,
        [cacheKey, input.decision.network, mintHash, input.decision.schemaVersion, input.decision.decision, encrypted.keyId, encrypted.ivBase64, encrypted.authTagBase64, encrypted.ciphertextBase64, encrypted.aadHash, input.evidenceHash, input.publicProjection, input.expiresAt],
      );
      await client.query(
        `INSERT INTO game_dealer_receipts (id, operation_key, cache_key, provider_request_id, model, cost_micro_usd, tools_used, isolation_status, result)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (operation_key) DO NOTHING`,
        [randomUUID(), input.receipt.operationKey, cacheKey, input.receipt.providerRequestId, input.receipt.model, input.receipt.costMicroUsd, JSON.stringify(input.receipt.toolsUsed), input.receipt.isolationStatus, input.receipt.result],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
