import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { inTransaction } from "../game/repository";

export type GameJobKind = "capture_start" | "activate" | "capture_end" | "finalize" | "reconcile_chain" | "expire_table";

export interface LeasedGameJob {
  id: string;
  operationKey: string;
  tableId: string;
  kind: GameJobKind;
  leaseOwner: string;
  leaseEpoch: string;
  attempts: number;
  maxAttempts: number;
  payload: unknown;
}

export class GameJobRepository {
  constructor(private readonly pool: Pool) {}

  async enqueue(input: { operationKey: string; tableId: string; kind: GameJobKind; runAt: Date; payload: unknown; maxAttempts?: number }): Promise<{ id: string; replayed: boolean }> {
    const id = randomUUID();
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO game_jobs (id, operation_key, table_id, kind, state, run_at, payload, max_attempts)
       VALUES ($1,$2,$3,$4,'queued',$5,$6,$7) ON CONFLICT (operation_key) DO NOTHING RETURNING id`,
      [id, input.operationKey, input.tableId, input.kind, input.runAt, input.payload, input.maxAttempts ?? 3],
    );
    if (result.rows[0]) return { id, replayed: false };
    const existing = await this.pool.query<{ id: string }>("SELECT id FROM game_jobs WHERE operation_key = $1", [input.operationKey]);
    if (!existing.rows[0]) throw new Error("Job replay could not recover its durable identity.");
    return { id: existing.rows[0].id, replayed: true };
  }

  async leaseNext(input: { workerId: string; now: Date; leaseMs: number }): Promise<LeasedGameJob | null> {
    return inTransaction(this.pool, async (client) => {
      const result = await client.query<{
        id: string; operation_key: string; table_id: string; kind: GameJobKind; lease_epoch: string; attempts: number; max_attempts: number; payload: unknown;
      }>(
        `SELECT id, operation_key, table_id, kind, lease_epoch, attempts, max_attempts, payload
         FROM game_jobs
         WHERE state IN ('queued','running') AND run_at <= $1 AND attempts < max_attempts
           AND (state = 'queued' OR lease_expires_at <= $1)
         ORDER BY run_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1`, [input.now],
      );
      const row = result.rows[0];
      if (!row) return null;
      const nextEpoch = BigInt(row.lease_epoch) + 1n;
      await client.query(
        `UPDATE game_jobs SET state='running', lease_owner=$2, lease_epoch=$3, lease_expires_at=$4, attempts=attempts+1, updated_at=$1 WHERE id=$5`,
        [input.now, input.workerId, nextEpoch.toString(), new Date(input.now.getTime() + input.leaseMs), row.id],
      );
      return { id: row.id, operationKey: row.operation_key, tableId: row.table_id, kind: row.kind, leaseOwner: input.workerId, leaseEpoch: nextEpoch.toString(), attempts: row.attempts + 1, maxAttempts: row.max_attempts, payload: row.payload };
    });
  }

  async complete(job: LeasedGameJob, now = new Date()): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE game_jobs SET state='completed', lease_expires_at=NULL, updated_at=$1
       WHERE id=$2 AND state='running' AND lease_owner=$3 AND lease_epoch=$4`, [now, job.id, job.leaseOwner, job.leaseEpoch],
    );
    return result.rowCount === 1;
  }

  async fail(job: LeasedGameJob, code: string, retryAt: Date, now = new Date()): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE game_jobs SET state=CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
       run_at=$1, lease_expires_at=NULL, last_error_code=$2, updated_at=$3
       WHERE id=$4 AND state='running' AND lease_owner=$5 AND lease_epoch=$6`,
      [retryAt, code.slice(0, 120), now, job.id, job.leaseOwner, job.leaseEpoch],
    );
    return result.rowCount === 1;
  }
}

