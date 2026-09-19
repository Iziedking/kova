import assert from "node:assert/strict";
import test from "node:test";
import { createBackendApp } from "../src/backend/app";
import { loadBackendConfig } from "../src/backend/config";

const config = loadBackendConfig({
  KOVA_BACKEND_HOST: "127.0.0.1",
  KOVA_BACKEND_PORT: "8787",
  KOVA_ALLOWED_ORIGINS: "http://localhost:3000",
});
const app = createBackendApp(config);

test("health reports fixture-backed read capability and unavailable writes", async () => {
  const response = await app.request("http://localhost/api/health");
  assert.equal(response.status, 200);
  const body = await response.json() as { capabilities: Record<string, string> };
  assert.equal(body.capabilities.stockCheck, "fixture_backed");
  assert.equal(body.capabilities.walletConnection, "browser_seam_only");
  assert.equal(body.capabilities.walletSigning, "unavailable");
  assert.equal(body.capabilities.database, "preview_memory");
  assert.equal(body.capabilities.stockFloatMonitor, "unavailable");
  assert.equal(body.capabilities.rewardEvidence, "unavailable");
  assert.equal(body.capabilities.paidResearch, "unavailable");
});

test("liveness and preview readiness remain separate from financial admission", async () => {
  const live = await app.request("http://localhost/api/live");
  assert.equal(live.status, 200);
  assert.equal((await live.json() as { status: string }).status, "alive");

  const ready = await app.request("http://localhost/api/ready");
  assert.equal(ready.status, 200);
  const body = await ready.json() as { readyToServe: boolean; readyToAdmit: boolean; readyToRecover: boolean; reasons: string[] };
  assert.equal(body.readyToServe, true);
  assert.equal(body.readyToAdmit, false);
  assert.equal(body.readyToRecover, false);
  assert.deepEqual(body.reasons, ["DURABLE_GAME_DISABLED"]);
});

test("durable readiness fails closed while dependencies are draining or unavailable", async () => {
  const draining = createBackendApp(config, undefined, undefined, {
    isDraining: () => true,
    checkDependencies: async () => { throw new Error("must not run"); },
  });
  const drainingResponse = await draining.request("http://localhost/api/ready");
  assert.equal(drainingResponse.status, 503);
  assert.equal((await drainingResponse.json() as { status: string }).status, "draining");

  const unavailable = createBackendApp(config, undefined, undefined, {
    isDraining: () => false,
    checkDependencies: async () => { throw new Error("database offline"); },
  });
  const unavailableResponse = await unavailable.request("http://localhost/api/ready");
  assert.equal(unavailableResponse.status, 503);
  const unavailableBody = await unavailableResponse.json() as { readyToServe: boolean; reasons: string[] };
  assert.equal(unavailableBody.readyToServe, false);
  assert.deepEqual(unavailableBody.reasons, ["DEPENDENCY_CHECK_FAILED"]);
});

test("API middleware applies security headers, request ids, CORS policy, and body limits", async () => {
  const response = await app.request("http://localhost/api/live", { headers: { origin: "http://localhost:3000" } });
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
  assert.ok(response.headers.get("x-request-id"));
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const oversized = await app.request("http://localhost/api/position-intents/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(33 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json() as { code: string }).code, "REQUEST_BODY_TOO_LARGE");
});

test("market and campaign routes expose captured snapshots without accepting capital", async () => {
  const markets = await app.request("http://localhost/api/markets");
  assert.equal(markets.status, 200);
  const marketBody = await markets.json() as { markets: readonly unknown[] };
  assert.equal(marketBody.markets.length, 2);

  const campaigns = await app.request("http://localhost/api/campaigns");
  assert.equal(campaigns.status, 200);
  const campaignBody = await campaigns.json() as { campaigns: readonly unknown[] };
  assert.equal(campaignBody.campaigns.length, 2);
  const firstCampaign = campaignBody.campaigns[0] as { ansem: { status: string }; ranking: { status: string } };
  assert.equal(firstCampaign.ansem.status, "unverified");
  assert.equal(firstCampaign.ranking.status, "preview_only");

  const backing = await app.request("http://localhost/api/campaigns/campaign-nvdge-week-01/back", { method: "POST" });
  assert.equal(backing.status, 503);
  assert.deepEqual(await backing.json(), {
    ok: false,
    code: "CAMPAIGN_BACKING_UNAVAILABLE",
    message: "Campaign backing is not available until the user-owned funding path is approved.",
    retryable: false,
  });
});

test("market dossier composes campaign and evidence without implying execution readiness", async () => {
  const response = await app.request("http://localhost/api/markets/nvdge-nvdax");
  assert.equal(response.status, 200);
  const body = await response.json() as {
    campaign: { id: string } | null;
    evidence: {
      stockCheck: { capability: string; reportHash: string | null; report: { inventory: { status: string } } | null };
      feasibility: { capability: string; reportHash: string | null; report: { status: string } } | null;
      underwriting: { capability: string; report: { state: string } | null };
      floatMonitor: { capability: string; report: unknown; reason?: string };
      rewards: { capability: string; report: unknown; reason?: string };
    };
  };
  assert.equal(body.campaign?.id, "campaign-nvdge-week-01");
  assert.equal(body.evidence.stockCheck.capability, "fixture_backed");
  assert.equal(body.evidence.stockCheck.report?.inventory.status, "unknown");
  assert.equal(body.evidence.stockCheck.reportHash?.length, 64);
  assert.equal(body.evidence.feasibility?.report.status, "blocked");
  assert.equal(body.evidence.feasibility?.reportHash?.length, 64);
  assert.equal(body.evidence.underwriting.capability, "preview_only");
  assert.equal(body.evidence.underwriting.report?.state, "blocked");
  assert.equal(body.evidence.floatMonitor.capability, "unavailable");
  assert.equal(body.evidence.floatMonitor.report, null);
  assert.equal(body.evidence.floatMonitor.reason, "FLOAT_MONITOR_READ_UNAVAILABLE");
  assert.equal(body.evidence.rewards.capability, "unavailable");
  assert.equal(body.evidence.rewards.report, null);
  assert.equal(body.evidence.rewards.reason, "REWARD_READ_UNAVAILABLE");
});

test("stock check exposes the initial issuer, token-address, eligibility, and inventory boundaries", async () => {
  const response = await app.request("http://localhost/api/markets/nvdge-nvdax/stock-check");
  assert.equal(response.status, 200);
  const body = await response.json() as { stockCheck: { status: string; stock: { tokenAddress: string }; issuer: { status: string }; eligibility: { evidenceStatus: string }; inventory: { status: string } } };
  assert.equal(body.stockCheck.status, "unknown");
  assert.equal(body.stockCheck.stock.tokenAddress, "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
  assert.equal(body.stockCheck.issuer.status, "unknown");
  assert.equal(body.stockCheck.eligibility.evidenceStatus, "unknown");
  assert.equal(body.stockCheck.inventory.status, "unknown");
});

test("underwriting exposes deterministic evidence hashes and refuses blocked feasibility", async () => {
  const response = await app.request("http://localhost/api/markets/nvdge-nvdax/underwriting");
  assert.equal(response.status, 200);
  const body = await response.json() as { underwriting: { state: string; decision: string; rankingScorePoints: number | null; stockCheck: { reportHash: string; source: string; slot: number | null }; feasibility: { reportHash: string; observedSlot: number }; agent: { generated: boolean } } };
  assert.equal(body.underwriting.state, "blocked");
  assert.equal(body.underwriting.decision, "refuse");
  assert.equal(body.underwriting.rankingScorePoints, null);
  assert.equal(body.underwriting.stockCheck.reportHash.length, 64);
  assert.equal(body.underwriting.stockCheck.source, "fixture:stock-reference-v1");
  assert.equal(body.underwriting.stockCheck.slot, null);
  assert.equal(body.underwriting.feasibility.reportHash.length, 64);
  assert.equal(body.underwriting.feasibility.observedSlot, 447172605);
  assert.equal(body.underwriting.agent.generated, false);
});

test("sized quote API refuses honestly when finalized RPC is not configured", async () => {
  const response = await app.request("http://localhost/api/markets/nvdge-nvdax/quote?amountInRaw=10000000000&inputMint=Aigf5pKPyZW8nzxCrHEisE4tZMiUhFpKie8mYE7cmj6c&slippageBps=100");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: "QUOTE_READ_UNAVAILABLE", message: "A finalized Solana RPC is not configured for sized quotes.", retryable: false });
});

test("sized quote API resolves the second exact catalog pool without enabling writes", async () => {
  const response = await app.request("http://localhost/api/markets/stonk-spyx/quote?amountInRaw=1000000000&inputMint=6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx&slippageBps=100");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: "QUOTE_READ_UNAVAILABLE", message: "A finalized Solana RPC is not configured for sized quotes.", retryable: false });
});

test("stock float monitor refuses without finalized RPC instead of using a fixture", async () => {
  const response = await app.request("http://localhost/api/markets/stonk-spyx/float-monitor");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: "FLOAT_MONITOR_READ_UNAVAILABLE", message: "A finalized Solana RPC is not configured for the stock monitor.", retryable: false });
});

test("reward evidence refuses without finalized RPC instead of inventing ANSEM or funding", async () => {
  const response = await app.request("http://localhost/api/markets/nvdge-nvdax/rewards");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: "REWARD_READ_UNAVAILABLE", message: "A finalized Solana RPC is not configured for reward evidence.", retryable: false });
});

test("sized quote API rejects malformed raw input before any provider read", async () => {
  const response = await app.request("http://localhost/api/markets/nvdge-nvdax/quote?amountInRaw=1.5&inputMint=bad");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, code: "INVALID_SIZED_QUOTE", message: "Quote input must include a positive raw amount, supported input mint, and valid slippage.", retryable: false });
});

test("sized quote API rejects an invalid mint before checking RPC availability", async () => {
  const response = await app.request("http://localhost/api/markets/nvdge-nvdax/quote?amountInRaw=1&inputMint=bad");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, code: "INVALID_SIZED_QUOTE", message: "Quote input must include a positive raw amount, supported input mint, and valid slippage.", retryable: false });
});

test("position review returns a typed blocked result without transaction bytes", async () => {
  const response = await app.request("http://localhost/api/position-intents/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: "11111111111111111111111111111111", marketId: "nvdge-nvdax", campaignId: "campaign-nvdge-week-01", capitalUsdMicro: "500000000", maxSlippageBps: 100, tickLower: 172000, tickUpper: 173000, expiresAt: "2099-09-15T06:00:00.000Z" }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { review: { status: string; signingAllowed: boolean; transactionBase64: string | null } };
  assert.equal(body.review.status, "blocked");
  assert.equal(body.review.signingAllowed, false);
  assert.equal(body.review.transactionBase64, null);
});

test("malformed position review JSON is a typed client error", async () => {
  const response = await app.request("http://localhost/api/position-intents/review", { method: "POST", headers: { "content-type": "application/json" }, body: "not-json" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, code: "INVALID_POSITION_REVIEW", message: "Position review input must be valid JSON.", retryable: false });
});

test("unknown markets return a typed error without a stack trace", async () => {
  const response = await app.request("http://localhost/api/markets/not-supported");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    code: "MARKET_NOT_FOUND",
    message: "This market is not in the supported registry.",
    retryable: false,
  });
});

test("invalid RPC configuration fails at boot instead of silently using HTTP", () => {
  assert.throws(
    () => loadBackendConfig({ KOVA_SOLANA_RPC_URL: "http://unsafe.example" }),
    /Invalid KOVA backend configuration/,
  );
});

test("empty optional provider settings preserve the keyless preview", () => {
  const preview = loadBackendConfig({ KOVA_SOLANA_RPC_URL: "", KOVA_DATABASE_URL: "" });
  assert.equal(preview.solanaRpcUrl, null);
  assert.equal(preview.databaseUrl, null);
});

test("durable game mode fails closed when any required server capability is missing", () => {
  assert.throws(
    () => loadBackendConfig({ KOVA_GAME_ENABLED: "true", KOVA_DATABASE_URL: "postgresql://localhost/kova" }),
    /Invalid KOVA backend configuration/,
  );
});

test("durable game mode accepts a complete server-only configuration", () => {
  const durable = loadBackendConfig({
    KOVA_GAME_ENABLED: "true",
    KOVA_DATABASE_URL: "postgresql://localhost/kova",
    PRIVY_APP_ID: "app",
    PRIVY_APP_SECRET: "secret",
    KOVA_PICK_KEY_ID: "v1",
    KOVA_PICK_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    KOVA_ANSEM_MINT: "11111111111111111111111111111111",
  });
  assert.equal(durable.gameEnabled, true);
  assert.equal(durable.databaseUrl, "postgresql://localhost/kova");
});
