import assert from "node:assert/strict";
import test from "node:test";
import { ClawPumpAdmissionClient } from "../../src/adapters/game/clawpump";
import { readDexPairs } from "../../src/adapters/game/dexscreener";
import { publicAdmissionProjection, validateAdmissionDecision } from "../../src/domain/game/admission";

const mint = "8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB";
const requestTimestamp = "2026-09-19T18:22:00.350Z";

function acceptedFixture() {
  return {
    schemaVersion: "kova-admission-v1",
    network: "solana-mainnet",
    mint,
    requestTimestamp,
    decision: "ACCEPTED",
    confidence: 0.74,
    classification: { isStockThemedMeme: true, isIssuerBackedTokenizedStock: false, stockOrCompanyReference: "GameStop / GME" },
    tokenIdentity: { name: "GME", symbol: "GME", tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", decimals: 6, mintAuthority: "none", freezeAuthority: "none", metadataUri: null },
    riskFlags: [],
    reasons: ["Exact-mint evidence supports a GameStop community-token narrative."],
    researchAttempts: [{ capability: "solana_rpc", result: "success", detail: "Exact mint parsed." }],
    evidence: [
      { source: "Solana RPC", sourceClass: "solana_rpc", url: null, observation: "Exact mint parsed.", observedAt: "2026-09-19T18:22:05.000Z", solanaSlot: 448388030 },
      { source: "DEX Screener", sourceClass: "market_data", url: `https://dexscreener.com/solana/${mint}`, observation: "Exact mint listing describes GME.", observedAt: "2026-09-19T18:22:06.000Z", solanaSlot: null },
    ],
    providerReceipts: [],
    conflicts: [],
    missingEvidence: [],
    evaluatedAt: "2026-09-19T18:22:07.000Z",
  };
}

test("strict admission accepts a complete exact-mint decision", () => {
  const result = validateAdmissionDecision(acceptedFixture(), { mint, requestTimestamp, authoritativeMintRead: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const publicView = publicAdmissionProjection(result.decision);
  assert.equal("tokenIdentity" in publicView, false);
  assert.equal(publicView.decision, "ACCEPTED");
});

test("an apparent acceptance cannot bypass the deterministic evidence gate", () => {
  const fixture = acceptedFixture();
  fixture.evidence = [fixture.evidence[1]];
  fixture.confidence = 0.4;
  const result = validateAdmissionDecision(fixture, { mint, requestTimestamp, authoritativeMintRead: false });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "ACCEPTANCE_EVIDENCE_INCOMPLETE");
});

test("schema drift is rejected rather than repaired into admission", () => {
  const fixture = acceptedFixture();
  const malformed = { ...fixture, classification: { ...fixture.classification, stockOrCompanyReference: true } };
  const result = validateAdmissionDecision(malformed, { mint, requestTimestamp, authoritativeMintRead: true });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "MALFORMED_DEALER_OUTPUT");
});

test("confidence cannot outrun missing authoritative and independent evidence", () => {
  const fixture = { ...acceptedFixture(), decision: "INSUFFICIENT_EVIDENCE", confidence: 0.84, evidence: [acceptedFixture().evidence[1]] };
  const result = validateAdmissionDecision(fixture, { mint, requestTimestamp, authoritativeMintRead: false });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "DEALER_CONFIDENCE_INVALID");
});

test("rejection and insufficient evidence remain valid without acceptance-only proof", () => {
  for (const decision of ["REJECTED", "INSUFFICIENT_EVIDENCE"] as const) {
    const fixture = { ...acceptedFixture(), decision, confidence: 0.4, classification: { isStockThemedMeme: null, isIssuerBackedTokenizedStock: null, stockOrCompanyReference: null } };
    const result = validateAdmissionDecision(fixture, { mint, requestTimestamp, authoritativeMintRead: false });
    assert.equal(result.ok, true);
  }
});

test("ClawPump adapter uses the apex host, bearer key and strict response contract", async () => {
  let requestedUrl = "";
  let authorization = "";
  const client = new ClawPumpAdmissionClient({
    apiKey: "cpk_test",
    agentId: "agent-id",
    fetcher: async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ content: JSON.stringify(acceptedFixture()), model: "test", cost: 0, meta: { requestId: "request-1" } }), { status: 200 });
    },
  });
  const result = await client.classify("classify");
  assert.equal(requestedUrl, "https://clawpump.tech/api/v1/agents/agent-id/chat");
  assert.equal(authorization, "Bearer cpk_test");
  assert.equal(result.requestId, "request-1");
});

test("DEX adapter discards pairs that do not contain the exact submitted mint", async () => {
  const exact = { chainId: "solana", dexId: "raydium", url: "https://dexscreener.com/solana/pair", pairAddress: "pair", baseToken: { address: mint, name: "GME", symbol: "GME" }, quoteToken: { address: "So11111111111111111111111111111111111111112", name: "SOL", symbol: "SOL" } };
  const unrelated = { ...exact, pairAddress: "other", baseToken: { ...exact.baseToken, address: "11111111111111111111111111111111" } };
  const pairs = await readDexPairs(mint, async () => new Response(JSON.stringify([exact, unrelated]), { status: 200 }));
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]?.pairAddress, "pair");
});
