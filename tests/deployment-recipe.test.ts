/**
 * Source: FLOAT deployment recipe contract tests.
 * Version: 1.0.0
 * Date: 2026-09-15
 * Purpose: prevent accidental exposure or startup-order regressions in the VM recipe.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const caddyfile = readFileSync(resolve(process.cwd(), "deploy", "Caddyfile"), "utf8");
const compose = readFileSync(resolve(process.cwd(), "deploy", "docker-compose.yml"), "utf8");

function serviceBlock(name: string): string {
  const marker = `  ${name}:\n`;
  const start = compose.indexOf(marker);
  assert.notEqual(start, -1, `Compose service ${name} is missing.`);
  const remainder = compose.slice(start + marker.length);
  const nextService = remainder.search(/\n  [a-z][a-z0-9-]*:\n/);
  return nextService === -1 ? remainder : remainder.slice(0, nextService);
}

test("Caddy exposes only the backend API surface", () => {
  assert.match(caddyfile, /handle \/api\/\*/);
  assert.match(caddyfile, /reverse_proxy backend:8787/);
  assert.match(caddyfile, /respond 404/);
  assert.match(caddyfile, /X-Content-Type-Options "nosniff"/);
  assert.match(caddyfile, /Referrer-Policy "no-referrer"/);
  assert.doesNotMatch(caddyfile, /reverse_proxy(?! backend:8787)/);
});

test("Compose keeps Postgres private and orders migration before backend", () => {
  const postgres = serviceBlock("postgres");
  const backend = serviceBlock("backend");
  const migrate = serviceBlock("migrate");
  const caddy = serviceBlock("caddy");
  assert.match(postgres, /networks:\s+[\s\S]*?- float-private/);
  assert.match(compose, /float-private:\s+[\s\S]*?internal: true/);
  assert.match(backend, /expose:\s+[\s\S]*?- "8787"/);
  assert.doesNotMatch(postgres, /\n\s+ports:/);
  assert.doesNotMatch(backend, /\n\s+ports:/);
  assert.match(backend, /migrate:\s+[\s\S]*?service_completed_successfully/);
  assert.match(caddy, /ports:\s+[\s\S]*?- "80:80"[\s\S]*?- "443:443"/);
  assert.match(migrate, /depends_on:\s+[\s\S]*?service_healthy/);
});
