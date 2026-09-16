import assert from "node:assert/strict";
import test from "node:test";
import { fetchBackendHealth } from "../src/server/backend-health";

const validHealth = {
  product: "KOVA",
  mode: "preview",
  status: "ok",
  capabilities: {
    database: "configured_not_verified",
    finalizedRpc: "configured_not_verified",
    marketReads: "captured_snapshot",
    stockCheck: "fixture_backed",
    stockFloatMonitor: "unavailable",
    rewardEvidence: "unavailable",
    campaigns: "captured_snapshot",
    underwriting: "preview_only",
    walletConnection: "browser_seam_only",
    paidResearch: "unavailable",
    walletSigning: "unavailable",
    transactionPreparation: "unavailable",
    automatedRebalancing: "unavailable",
  },
};

test("backend health requires an explicit configured URL", async () => {
  assert.deepEqual(await fetchBackendHealth({ backendUrl: "" }), {
    ok: false,
    code: "BACKEND_CONFIGURATION_INVALID",
    message: "KOVA_BACKEND_API_URL is not configured.",
  });
});

test("backend health rejects an insecure remote URL", async () => {
  assert.deepEqual(await fetchBackendHealth({ backendUrl: "http://api.example.com" }), {
    ok: false,
    code: "BACKEND_CONFIGURATION_INVALID",
    message: "The configured KOVA backend URL must be HTTPS, except for local development.",
  });
});

test("backend health rejects a malformed or financially enabled response", async () => {
  const malformed = await fetchBackendHealth({ backendUrl: "https://api.example.com", fetcher: async () => new Response("{}") });
  assert.deepEqual(malformed, { ok: false, code: "BACKEND_UNAVAILABLE", message: "The KOVA backend returned invalid health data." });

  const enabled = await fetchBackendHealth({
    backendUrl: "https://api.example.com",
    fetcher: async () => new Response(JSON.stringify({ ...validHealth, capabilities: { ...validHealth.capabilities, walletSigning: "available" } })),
  });
  assert.deepEqual(enabled, { ok: false, code: "BACKEND_CAPABILITY_MISMATCH", message: "The backend reports walletSigning enabled while the deployment is expected to remain preview-only." });
});

test("backend health preserves a valid preview-only VM response", async () => {
  const result = await fetchBackendHealth({
    backendUrl: "https://api.example.com/",
    fetcher: async (input) => {
      assert.equal(input, "https://api.example.com/api/health");
      return new Response(JSON.stringify(validHealth));
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.health.product, "KOVA");
  assert.equal(result.health.capabilities.transactionPreparation, "unavailable");
});
