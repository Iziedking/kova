import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { CapturePlanSchema, PriceSampleSchema, capturePolicyHash, type CapturePlan, type PriceSample } from "../../domain/game/capture";
import { ResultManifestSchema, resultManifestHash, type ResultManifest } from "../../domain/game/manifest";
import { PublicGameEventPayloadSchema, type GameEventRecord } from "../../domain/game/events";

export class OrchestrationRepository {
  constructor(private readonly pool: Pool) {}

  async freezeCapturePlan(value: unknown, frozenAt = new Date()): Promise<{ plan: CapturePlan; policyHash: string; replayed: boolean }> {
    const plan = CapturePlanSchema.parse(value);
    const policyHash = capturePolicyHash(plan);
    const result = await this.pool.query(
      `INSERT INTO game_capture_plans (table_id, policy_hash, mode, provider, provider_version, start_target_at, end_target_at, max_start_delay_ms, response_deadline_ms, max_cross_pair_skew_ms, fallback_delay_ms, pair_bindings, frozen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (table_id) DO NOTHING`,
      [plan.tableId, policyHash, plan.mode, plan.provider, plan.providerVersion, plan.startTargetAt, plan.endTargetAt, plan.maxStartDelayMs, plan.responseDeadlineMs, plan.maxCrossPairSkewMs, plan.fallbackDelayMs, JSON.stringify(plan.pairBindings), frozenAt],
    );
    if (result.rowCount === 1) return { plan, policyHash, replayed: false };
    const existing = await this.pool.query<{ policy_hash: string }>("SELECT policy_hash FROM game_capture_plans WHERE table_id = $1", [plan.tableId]);
    if (existing.rows[0]?.policy_hash !== policyHash) throw new Error("CAPTURE_PLAN_CONFLICT");
    return { plan, policyHash, replayed: true };
  }

  async putPriceSample(value: unknown): Promise<{ sample: PriceSample; replayed: boolean }> {
    const sample = PriceSampleSchema.parse(value);
    const result = await this.pool.query(
      `INSERT INTO game_price_samples (id, table_id, phase, pair_address, target_at, request_started_at, request_finished_at, provider_observed_at, provider_slot, captured_at, price18, liquidity_usd_micro, raw_response_hash, source, attempt, policy_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (table_id, phase, pair_address) DO NOTHING`,
      [randomUUID(), sample.tableId, sample.phase, sample.pairAddress, sample.targetAt, sample.requestStartedAt, sample.requestFinishedAt, sample.providerObservedAt, sample.providerSlot, sample.capturedAt, sample.price18, sample.liquidityUsdMicro, sample.rawResponseHash, sample.source, sample.attempt, sample.policyHash],
    );
    if (result.rowCount === 1) return { sample, replayed: false };
    const existing = await this.pool.query<{ raw_response_hash: string; policy_hash: string; price18: string }>(
      "SELECT raw_response_hash, policy_hash, price18::text FROM game_price_samples WHERE table_id=$1 AND phase=$2 AND pair_address=$3",
      [sample.tableId, sample.phase, sample.pairAddress],
    );
    const row = existing.rows[0];
    if (!row || row.raw_response_hash !== sample.rawResponseHash || row.policy_hash !== sample.policyHash || row.price18 !== sample.price18) throw new Error("PRICE_SAMPLE_CONFLICT");
    return { sample, replayed: true };
  }

  async freezeManifest(operationKey: string, value: unknown): Promise<{ manifest: ResultManifest; manifestHash: string; replayed: boolean }> {
    const manifest = ResultManifestSchema.parse(value);
    const manifestHash = resultManifestHash(manifest);
    const result = await this.pool.query(
      `INSERT INTO game_result_manifests (table_id, operation_key, manifest_hash, payload, status)
       VALUES ($1,$2,$3,$4,'frozen') ON CONFLICT (operation_key) DO NOTHING`,
      [manifest.tableId, operationKey, manifestHash, manifest],
    );
    if (result.rowCount === 1) return { manifest, manifestHash, replayed: false };
    const existing = await this.pool.query<{ manifest_hash: string; payload: ResultManifest }>("SELECT manifest_hash, payload FROM game_result_manifests WHERE operation_key=$1", [operationKey]);
    const row = existing.rows[0];
    if (!row || row.manifest_hash !== manifestHash) throw new Error("RESULT_MANIFEST_CONFLICT");
    return { manifest: ResultManifestSchema.parse(row.payload), manifestHash, replayed: true };
  }

  async prepareChainOperation(input: { operationKey: string; tableId: string; kind: string; messageHash: string; lastValidBlockHeight: bigint | null }): Promise<{ replayed: boolean; status: string; signature: string | null }> {
    const result = await this.pool.query(
      `INSERT INTO game_chain_operations (operation_key, table_id, kind, message_hash, status, last_valid_block_height)
       VALUES ($1,$2,$3,$4,'prepared',$5) ON CONFLICT (operation_key) DO NOTHING`,
      [input.operationKey, input.tableId, input.kind, input.messageHash, input.lastValidBlockHeight?.toString() ?? null],
    );
    if (result.rowCount === 1) return { replayed: false, status: "prepared", signature: null };
    const existing = await this.pool.query<{ message_hash: string; status: string; signature: string | null }>("SELECT message_hash, status, signature FROM game_chain_operations WHERE operation_key=$1", [input.operationKey]);
    const row = existing.rows[0];
    if (!row || row.message_hash !== input.messageHash) throw new Error("CHAIN_OPERATION_CONFLICT");
    return { replayed: true, status: row.status, signature: row.signature };
  }

  async markChainSubmitted(input: { operationKey: string; messageHash: string; signature: string; now: Date }): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE game_chain_operations SET status='submitted', signature=$3, attempt=attempt+1, submitted_at=$4, updated_at=$4
       WHERE operation_key=$1 AND message_hash=$2 AND status IN ('prepared','unknown') AND (signature IS NULL OR signature=$3)`,
      [input.operationKey, input.messageHash, input.signature, input.now],
    );
    return result.rowCount === 1;
  }

  async markChainUnknown(operationKey: string, now = new Date()): Promise<boolean> {
    const result = await this.pool.query("UPDATE game_chain_operations SET status='unknown', updated_at=$2 WHERE operation_key=$1 AND status='submitted'", [operationKey, now]);
    return result.rowCount === 1;
  }

  async markChainConfirmed(operationKey: string, signature: string, now = new Date()): Promise<boolean> {
    const result = await this.pool.query("UPDATE game_chain_operations SET status='confirmed', confirmed_at=$3, updated_at=$3 WHERE operation_key=$1 AND signature=$2 AND status IN ('submitted','unknown')", [operationKey, signature, now]);
    return result.rowCount === 1;
  }

  async appendEvent(input: { tableId: string; audience: "public" | "principal" | "operator"; principalId?: string | null; eventType: string; payload: unknown }): Promise<string> {
    if (input.audience === "public") PublicGameEventPayloadSchema.parse(input.payload);
    const result = await this.pool.query<{ sequence: string }>(
      "INSERT INTO game_events (table_id, audience, principal_id, event_type, payload) VALUES ($1,$2,$3,$4,$5) RETURNING sequence::text",
      [input.tableId, input.audience, input.principalId ?? null, input.eventType, input.payload],
    );
    if (!result.rows[0]) throw new Error("Event append returned no sequence.");
    return result.rows[0].sequence;
  }

  async listEvents(input: { tableId: string; afterSequence: bigint; principalId: string | null; limit?: number }): Promise<readonly GameEventRecord[]> {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const result = await this.pool.query<{
      sequence: string; table_id: string; audience: "public" | "principal"; principal_id: string | null; event_type: string; payload: unknown; created_at: Date;
    }>(
      `SELECT sequence::text, table_id, audience, principal_id, event_type, payload, created_at
       FROM game_events
       WHERE table_id=$1 AND sequence>$2 AND (audience='public' OR (audience='principal' AND principal_id=$3))
       ORDER BY sequence ASC LIMIT $4`, [input.tableId, input.afterSequence.toString(), input.principalId, limit],
    );
    return result.rows.map((row) => ({ sequence: row.sequence, tableId: row.table_id, audience: row.audience, principalId: row.principal_id, eventType: row.event_type, payload: row.payload, createdAt: row.created_at.toISOString() }));
  }
}
