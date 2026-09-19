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
});
