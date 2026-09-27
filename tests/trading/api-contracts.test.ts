import assert from "node:assert/strict";
import test from "node:test";
import { createBackendApp } from "../../src/backend/app";
import { loadBackendConfig } from "../../src/backend/config";
import { TradingCapabilitiesSchema } from "../../src/domain/trading/api-contracts";

const app = createBackendApp(loadBackendConfig({ KOVA_BACKEND_HOST: "127.0.0.1", KOVA_BACKEND_PORT: "8787", KOVA_ALLOWED_ORIGINS: "http://localhost:3000" }));

test("Trading Mode exposes local accounting and explicit live gates", async () => {
  const response = await app.request("http://localhost/api/game/trading/capabilities");
  assert.equal(response.status, 200);
  const body = TradingCapabilitiesSchema.parse(await response.json());
  assert.equal(body.status, "blocked");
  assert.equal(body.capabilities.deterministicPnl, "local_only");
  assert.equal(body.capabilities.userAuthorizedSigning, "blocked");
  assert.equal(body.capabilities.ansemStakeAndPayout, "blocked");
});

test("Trading Mode cannot prepare or quote a live transaction in the safe build", async () => {
  for (const [path, code] of [["/api/game/trading/quotes", "TRADING_QUOTES_UNAVAILABLE"], ["/api/game/trading/prepare", "TRADING_PREPARATION_BLOCKED"]] as const) {
    const response = await app.request(`http://localhost${path}`, { method: "POST" });
    assert.equal(response.status, 503);
    const body = await response.json() as { code: string };
    assert.equal(body.code, code);
  }
});
