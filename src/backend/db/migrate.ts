/** Checksummed PostgreSQL migration runner. Existing checksums are immutable. */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pool, type PoolClient } from "pg";

export interface AppliedMigration {
  name: string;
  checksum: string;
}

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "migrations");

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

async function ensureLedger(client: PoolClient): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}

export async function runMigrations(pool: Pool, directory = migrationsDirectory): Promise<readonly AppliedMigration[]> {
  const names = (await readdir(directory)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const client = await pool.connect();
  const applied: AppliedMigration[] = [];
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('kova_schema_migrations'))");
    await ensureLedger(client);
    for (const name of names) {
      const sql = await readFile(join(directory, name), "utf8");
      const digest = checksum(sql);
      const existing = await client.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE name = $1", [name]);
      if (existing.rowCount === 1) {
        if (existing.rows[0]?.checksum !== digest) throw new Error(`Migration checksum mismatch: ${name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, digest]);
        await client.query("COMMIT");
        applied.push({ name, checksum: digest });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('kova_schema_migrations'))").catch(() => undefined);
    client.release();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.KOVA_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("KOVA_DATABASE_URL is required for migrations.");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const applied = await runMigrations(pool);
    console.info(JSON.stringify({ event: "kova_migrations_complete", applied }));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();

