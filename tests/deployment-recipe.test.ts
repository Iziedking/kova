/**
 * Source: KOVA shared-ingress deployment contract.
 * Version: 2.0.0
 * Date: 2026-09-19
 * Purpose: prevent accidental exposure or startup-order regressions in the VM recipe.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const compose = readFileSync(resolve(process.cwd(), "deploy", "docker-compose.yml"), "utf8");
const sharedIngress = readFileSync(resolve(process.cwd(), "deploy", "shared-ingress.caddy"), "utf8");
const deployReadme = readFileSync(resolve(process.cwd(), "deploy", "README.md"), "utf8");
const previewRunbook = readFileSync(resolve(process.cwd(), "docs", "preview-deployment.md"), "utf8");

function serviceBlock(name: string): string {
  const marker = `  ${name}:\n`;
  const start = compose.indexOf(marker);
  assert.notEqual(start, -1, `Compose service ${name} is missing.`);
  const remainder = compose.slice(start + marker.length);
  const nextService = remainder.search(/\n  [a-z][a-z0-9-]*:\n/);
  return nextService === -1 ? remainder : remainder.slice(0, nextService);
}

test("Compose exposes KOVA only through the existing shared ingress", () => {
  const backend = serviceBlock("backend");
  assert.match(backend, /container_name:\s+kova-api/);
  assert.match(backend, /networks:\s+[\s\S]*?- kova-private[\s\S]*?- agon-edge/);
  assert.match(compose, /agon-edge:\s+[\s\S]*?external: true[\s\S]*?name: deploy_default/);
  assert.doesNotMatch(compose, /^\s{2}caddy:/m);
  assert.doesNotMatch(compose, /\n\s+ports:/);
});

test("Shared Caddy snippet exposes only bounded API paths", () => {
  assert.match(sharedIngress, /api\.kova\.surf\s*\{/);
  assert.match(sharedIngress, /handle \/api\/\*/);
  assert.match(sharedIngress, /max_size 32KB/);
  assert.match(sharedIngress, /reverse_proxy kova-api:8787/);
  assert.match(sharedIngress, /handle\s*\{[\s\S]*?respond 404/);
  assert.doesNotMatch(sharedIngress, /reverse_proxy\s+(localhost|127\.0\.0\.1)/);
});

test("Release instructions use the locked KOVA domains", () => {
  for (const document of [deployReadme, previewRunbook]) {
    assert.match(document, /https:\/\/kova\.surf/);
    assert.match(document, /https:\/\/api\.kova\.surf/);
    assert.doesNotMatch(document, /https:\/\/(?:app|api)\.example\.com/);
  }
});

test("Compose keeps Postgres private and orders migration before backend", () => {
  const postgres = serviceBlock("postgres");
  const backend = serviceBlock("backend");
  const migrate = serviceBlock("migrate");
  assert.match(postgres, /networks:\s+[\s\S]*?- kova-private/);
  assert.match(compose, /kova-private:\s+[\s\S]*?internal: true/);
  assert.match(backend, /expose:\s+[\s\S]*?- "8787"/);
  assert.doesNotMatch(postgres, /\n\s+ports:/);
  assert.doesNotMatch(backend, /\n\s+ports:/);
  assert.match(backend, /migrate:\s+[\s\S]*?service_completed_successfully/);
  assert.match(migrate, /depends_on:\s+[\s\S]*?service_healthy/);
  assert.match(migrate, /npm["']?,\s*["']run["']?,\s*["']db:migrate/);
  assert.match(migrate, /KOVA_DATABASE_URL/);
  assert.match(migrate, /read_only:\s+true/);
  assert.match(migrate, /cap_drop:\s+[\s\S]*?- ALL/);
  assert.match(backend, /read_only:\s+true/);
  assert.match(backend, /no-new-privileges:true/);
  assert.match(backend, /stop_grace_period:\s+35s/);
  assert.match(backend, /\/api\/ready/);
  assert.match(backend, /KOVA_SOLANA_RPC_URL:\s+\$\{KOVA_SOLANA_RPC_URL:-\}/);
  assert.doesNotMatch(backend, /KOVA_SOLANA_RPC_URL:\s+\$\{KOVA_SOLANA_RPC_URL:\?/);
  assert.match(postgres, /postgres:16\.15-alpine3\.24@sha256:[0-9a-f]{64}/);
});

test("Runtime and CI dependencies are pinned to immutable revisions", () => {
  const dockerfile = readFileSync(resolve(process.cwd(), "deploy", "backend.Dockerfile"), "utf8");
  const workflow = readFileSync(resolve(process.cwd(), ".github", "workflows", "verify.yml"), "utf8");
  assert.match(dockerfile, /FROM node:24-alpine@sha256:[0-9a-f]{64}/);
  assert.doesNotMatch(workflow, /uses:\s+actions\/(checkout|setup-node)@v\d/);
  assert.match(workflow, /npm run test:postgres-game/);
});
