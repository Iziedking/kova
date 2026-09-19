/** Emits a secret-free, content-addressed source manifest for release review. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = process.cwd();
const roots = [
  ".github/workflows",
  "deploy",
  "docs",
  "idl",
  "programs",
  "scripts",
  "src",
  "tests",
  "Anchor.toml",
  "Cargo.lock",
  "Cargo.toml",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
] as const;

const excludedDirectories = new Set(["node_modules", ".next", "target", "test-results", "playwright-report"]);

async function filesUnder(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter((entry) => !excludedDirectories.has(entry.name))
    .map((entry) => filesUnder(resolve(path, entry.name))));
  return nested.flat();
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

async function main(): Promise<void> {
  const absoluteFiles = (await Promise.all(roots.map((path) => filesUnder(resolve(root, path))))).flat();
  const files = await Promise.all(absoluteFiles.map(async (path) => ({
    path: relative(root, path).replaceAll("\\", "/"),
    sha256: sha256(await readFile(path)),
  })));
  files.sort((left, right) => left.path.localeCompare(right.path));

  const releaseId = sha256(files.map((file) => `${file.path}\0${file.sha256}\n`).join(""));
  const dirtyPaths = git("status", "--porcelain=v1", "--untracked-files=all")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));

  console.info(JSON.stringify({
    schemaVersion: "kova-release-manifest-v1",
    releaseId,
    gitHead: git("rev-parse", "HEAD"),
    clean: dirtyPaths.length === 0,
    dirtyPathCount: dirtyPaths.length,
    runtime: process.version,
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    files,
  }));
}

void main();
