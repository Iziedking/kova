/** Restart-safe evidence store boundary with memory preview and PostgreSQL adapter. Reviewed 2026-09-15. */
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { evidenceSnapshots } from "./db/schema";
import { freshnessFor, type EvidenceKind, type EvidenceSnapshot, type ReadEvidenceSnapshot } from "./evidence";

export interface EvidenceStore {
  put<T>(snapshot: EvidenceSnapshot<T>): Promise<{ snapshot: EvidenceSnapshot<T>; replayed: boolean }>;
  latest<T>(kind: EvidenceKind, subjectId: string, now?: Date): Promise<ReadEvidenceSnapshot<T> | null>;
  close?(): Promise<void>;
}

function keyFor(kind: EvidenceKind, subjectId: string, reportHash: string): string {
  return `${kind}:${subjectId}:${reportHash}`;
}

export class MemoryEvidenceStore implements EvidenceStore {
  private readonly records = new Map<string, EvidenceSnapshot>();

  async put<T>(snapshot: EvidenceSnapshot<T>) {
    const key = keyFor(snapshot.kind, snapshot.subjectId, snapshot.reportHash);
    const existing = this.records.get(key);
    if (existing !== undefined) return { snapshot: existing as EvidenceSnapshot<T>, replayed: true };
    this.records.set(key, snapshot);
    return { snapshot, replayed: false };
  }

  async latest<T>(kind: EvidenceKind, subjectId: string, now = new Date()): Promise<ReadEvidenceSnapshot<T> | null> {
    const records = [...this.records.values()]
      .filter((record) => record.kind === kind && record.subjectId === subjectId)
      .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
    const latest = records[0];
    if (latest === undefined) return null;
    return { ...latest, freshness: freshnessFor(latest.expiresAt, now) } as ReadEvidenceSnapshot<T>;
  }
}

export class PostgresEvidenceStore implements EvidenceStore {
  private readonly pool: Pool;
  private readonly db: ReturnType<typeof drizzle>;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
    this.db = drizzle(this.pool);
  }

  async put<T>(snapshot: EvidenceSnapshot<T>) {
    const inserted = await this.db.insert(evidenceSnapshots).values({
      id: snapshot.id,
      kind: snapshot.kind,
      subjectId: snapshot.subjectId,
      reportHash: snapshot.reportHash,
      source: snapshot.source,
      slot: snapshot.slot,
      observedAt: new Date(snapshot.observedAt),
      expiresAt: snapshot.expiresAt === null ? null : new Date(snapshot.expiresAt),
      payload: snapshot.payload,
    }).onConflictDoNothing({ target: [evidenceSnapshots.kind, evidenceSnapshots.subjectId, evidenceSnapshots.reportHash] }).returning({ id: evidenceSnapshots.id });

    if (inserted.length > 0) return { snapshot, replayed: false };
    const existing = await this.db.select().from(evidenceSnapshots).where(eq(evidenceSnapshots.id, snapshot.id)).limit(1);
    const row = existing[0];
    if (row === undefined) throw new Error("Evidence replay could not recover the existing snapshot.");
    return { snapshot: toSnapshot(row) as EvidenceSnapshot<T>, replayed: true };
  }

  async latest<T>(kind: EvidenceKind, subjectId: string, now = new Date()): Promise<ReadEvidenceSnapshot<T> | null> {
    const rows = await this.db.select().from(evidenceSnapshots)
      .where(and(eq(evidenceSnapshots.kind, kind), eq(evidenceSnapshots.subjectId, subjectId)))
      .orderBy(desc(evidenceSnapshots.observedAt)).limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    const snapshot = toSnapshot(row) as EvidenceSnapshot<T>;
    return { ...snapshot, freshness: freshnessFor(snapshot.expiresAt, now) };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function toSnapshot(row: typeof evidenceSnapshots.$inferSelect): EvidenceSnapshot {
  return {
    id: row.id,
    kind: row.kind as EvidenceKind,
    subjectId: row.subjectId,
    reportHash: row.reportHash,
    source: row.source,
    slot: row.slot,
    observedAt: row.observedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    payload: row.payload,
  };
}

export function createEvidenceStore(databaseUrl: string | null): EvidenceStore {
  return databaseUrl === null ? new MemoryEvidenceStore() : new PostgresEvidenceStore(databaseUrl);
}
