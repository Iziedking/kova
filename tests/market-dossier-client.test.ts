import assert from "node:assert/strict";
import test from "node:test";
import { loadMarketDossier } from "../src/server/market-dossier";

test("market dossier uses the local captured preview when no backend URL is configured", async () => {
  const result = await loadMarketDossier("nvdge-nvdax", { backendUrl: "" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.source, "local_preview");
  assert.equal(result.dossier.market.id, "nvdge-nvdax");
  assert.equal(result.dossier.campaign?.id, "campaign-nvdge-week-01");
  assert.equal(result.dossier.evidence.stockCheck.capability, "fixture_backed");
  assert.equal(result.dossier.evidence.stockCheck.report?.stock.tokenAddress, "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
});

test("market dossier rejects non-HTTPS remote backend configuration", async () => {
  const result = await loadMarketDossier("nvdge-nvdax", { backendUrl: "http://api.example.com" });
  assert.deepEqual(result, {
    ok: false,
    code: "BACKEND_CONFIGURATION_INVALID",
    message: "The configured KOVA backend URL must be HTTPS, except for local development.",
  });
});

test("market dossier validates the VM response and never falls back when it is configured", async () => {
  const result = await loadMarketDossier("nvdge-nvdax", {
    backendUrl: "https://api.example.com",
    fetcher: async () => new Response(JSON.stringify({ ok: true, source: "captured_snapshot", market: {} }), { status: 200 }),
  });
  assert.deepEqual(result, {
    ok: false,
    code: "BACKEND_UNAVAILABLE",
    message: "The KOVA backend returned an invalid market dossier.",
  });
});

test("market dossier preserves a validated VM dossier", async () => {
  const result = await loadMarketDossier("nvdge-nvdax", {
    backendUrl: "https://api.example.com/",
    fetcher: async (input) => {
      assert.equal(input, "https://api.example.com/api/markets/nvdge-nvdax");
      return new Response(JSON.stringify({
        ok: true,
        source: "captured_snapshot",
        market: {
          id: "nvdge-nvdax",
          pair: "NVDGE / NVDAx",
          community: "The compute crowd",
          stockSymbol: "NVDAx",
          stockMint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
          stockProgramId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          stockDecimals: 8,
          memeSymbol: "NVDGE",
          memeMint: "Aigf5pKPyZW8nzxCrHEisE4tZMiUhFpKie8mYE7cmj6c",
          memeProgramId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          memeDecimals: 9,
          pool: "Ak7oAUqQ9jYu5YvfmDrtDC3WHi7BcN5Y4k8Bh3yk4B5e",
          raydiumProgram: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
          tvlUsdMicro: "36759430000",
          volume24hUsdMicro: "35302017643",
          capability: "chain_confirmed",
          status: "captured_snapshot",
          riskLabel: "Review required",
          snapshotAt: "2026-09-15T05:43:20.436Z",
        },
        campaign: null,
        evidence: { stockCheck: { capability: "unavailable", report: null, reportHash: null }, feasibility: null, underwriting: null, floatMonitor: null, rewards: null },
      }), { status: 200 });
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.source, "vm_backend");
  assert.equal(result.dossier.market.pool, "Ak7oAUqQ9jYu5YvfmDrtDC3WHi7BcN5Y4k8Bh3yk4B5e");
});
