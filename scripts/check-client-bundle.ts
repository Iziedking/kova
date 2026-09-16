/** Verify the built browser bundle contains no server-only secret markers. Reviewed 2026-09-15. */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const CLIENT_ROOT = path.resolve(".next", "static");
const FORBIDDEN_MARKERS = [
  "KOVA_DATABASE_URL",
  "KOVA_POSTGRES_PASSWORD",
  "KOVA_SOLANA_RPC_URL",
  "PRIVY_APP_SECRET",
  "BEGIN PRIVATE KEY",
  "postgresql://",
] as const;

async function listFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  }));
  return files.flat();
}

async function main(): Promise<void> {
  const files = await listFiles(CLIENT_ROOT);
  const violations: { file: string; marker: string }[] = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    for (const marker of FORBIDDEN_MARKERS) {
      if (contents.includes(marker)) violations.push({ file: path.relative(process.cwd(), file), marker });
    }
  }
  if (violations.length > 0) {
    console.error(JSON.stringify({ ok: false, violations }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ ok: true, scannedFiles: files.length, forbiddenMarkers: FORBIDDEN_MARKERS.length }));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, code: "CLIENT_BUNDLE_SCAN_FAILED", message: error instanceof Error ? error.message : "Unknown error" }));
  process.exitCode = 1;
});
