import assert from "node:assert/strict";
import test from "node:test";
import { createBackendApp } from "../../src/backend/app";
import { loadBackendConfig } from "../../src/backend/config";
import { GameCapabilitiesSchema, PublicTableSchema } from "../../src/domain/game/api-contracts";

const app = createBackendApp(loadBackendConfig({ KOVA_BACKEND_HOST: "127.0.0.1", KOVA_BACKEND_PORT: "8787", KOVA_ALLOWED_ORIGINS: "http://localhost:3000" }));

test("game capabilities separate local program proof from unavailable production authority", async () => {
  const response = await app.request("http://localhost/api/game/capabilities");
  assert.equal(response.status, 200);
  const body = GameCapabilitiesSchema.parse(await response.json());
  assert.equal(body.capabilities.deterministicScoring, "preview_only");
  assert.equal(body.capabilities.dealerAdmission, "blocked");
  assert.equal(body.stage, "m2_local_program");
  assert.equal(body.capabilities.ansemEscrow, "local_validator_only");
  assert.equal(body.capabilities.payoutExecution, "local_validator_only");
});

test("public table projection excludes every private market field", async () => {
  const response = await app.request("http://localhost/api/game/tables");
  assert.equal(response.status, 200);
  const body = await response.json() as { tables: unknown[] };
  const table = PublicTableSchema.parse(body.tables[0]);
  for (const forbidden of ["pick", "submittedMint", "pairMint", "narrative", "evidence", "startPrice18", "endPrice18", "scoreBps", "winnerWallets", "commitment", "sealedMarketHash"]) {
    assert.equal(Object.hasOwn(table, forbidden), false, `public table leaked ${forbidden}`);
  }
});

test("all game mutation routes fail closed while M2 remains local-only", async () => {
  const routes = [
    ["/api/game/tables", "TABLE_CREATION_UNAVAILABLE"],
    ["/api/game/tables/example/join", "TABLE_JOIN_UNAVAILABLE"],
    ["/api/game/tables/example/reveal", "PICK_REVEAL_UNAVAILABLE"],
    ["/api/game/tables/example/settle", "SETTLEMENT_UNAVAILABLE"],
  ] as const;
  for (const [route, code] of routes) {
    const response = await app.request(`http://localhost${route}`, { method: "POST" });
    assert.equal(response.status, 503);
    const body = await response.json() as { code: string };
    assert.equal(body.code, code);
  }
});
